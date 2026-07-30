import React, { useEffect, useMemo, useState } from "react";
import { addDoc, setDoc, serverTimestamp, writeBatch, deleteField, getDocs, runTransaction, deleteDoc, getCountFromServer } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { menuItemDoc, recipesCol, recipeDoc, modifierGroupsCol, modifierGroupDoc, menuItemsCol, venueMenuItemsCol, venueMenuItemDoc, menuCategoriesCol, menuCategoryDoc } from "../../utils/restaurantGroupPaths";
import { sellOrder } from "./sellOrder";
import {
  incGst, marginPct, marginColor, money, recipeFoodCost, menuItemFoodCost, grossStockQty, venueCost, venueSellPrice, resolvedSellPrice,
  DEFAULT_MENU_CATEGORIES, modGroupKind, MOD_KINDS, MOD_KIND_DEFAULTS,
  stripEmoji, categorySlug, CATEGORY_COLOURS, byPosition, posCatKeyOf, hasVenuePrice, resolvePrepMinutes,
} from "./rgStockUtils";

// Modifier-group picker sections, in display order (kind via modGroupKind).
const KIND_SECTIONS = [
  ["choose", "Choose", "mandatory serving choices"],
  ["add", "Add-ons", "paid extras"],
  ["prep", "Prep", "preparation options"],
  ["swap", "Instead", "substitutions"],
  ["remove", "Removals", "per-dish “No” lists"],
];
// Same hexes as PosPage.css's --pos-add/--pos-rem/--pos-swap/--pos-prep tokens —
// duplicated deliberately: those custom properties are scoped to .pos-v2 (the
// POS root) and are not visible here in the .rg-scope tree.
const KIND_DOT_COLOR = { add: "#16a34a", remove: "#dc2626", swap: "#d97706", prep: "#2563eb", choose: "#6b7280" };
// Kind editor rows: value, plain-English label, one-line hint. kind is
// GROUP-LEVEL (shared across venues) — a group's MEANING ("these are paid
// extras") is the same everywhere; only prices differ per venue, and that's
// a separate feature (instance.modifierOverrides.optionPrices).
const KIND_EDITOR = [
  ["add", "Add-on", "Paid extras"],
  ["remove", "Removal", "Free removals"],
  ["swap", "Instead", "Substitutions"],
  ["prep", "Prep", "How it's prepared"],
  ["choose", "Choose", "A required choice"],
];

const E86_REASONS = ["Out of stock", "Quality issue", "Equipment failure"];
const E86_BACK = ["Unknown", "Later today", "Tomorrow", "2-3 days"];
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return iso || "—"; } };

export default function MenusPage() {
  const {
    groupId, group, venues, menuItems, recipes, modifierGroups, inventoryItems, stock, menuCategories, stations,
    resolvedMenuItems, menuInstanceById,
    selectedVenue, setSelectedVenue, selectedVenueName, venueName, can, showToast, me, myStaff,
  } = useRG();
  const canEdit = can("menus", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";
  const categories = group?.menuCategories?.length ? group.menuCategories : DEFAULT_MENU_CATEGORIES;

  const [tab, setTab] = useState("builder"); // builder | availability | e86 | recipes | modifiers | pricing
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");

  const itemById = useMemo(() => Object.fromEntries(inventoryItems.map((i) => [i.id, i])), [inventoryItems]);
  // TEMPLATE dish recipes only: venue-cloned recipes carry venueId (and production
  // recipes carry producesItemId, no menuItemId) — both must not clobber this map.
  const recipeByMenuItemId = useMemo(
    () => Object.fromEntries(recipes.filter((r) => r.menuItemId && !r.venueId).map((r) => [r.menuItemId, r])),
    [recipes]
  );
  // Venue-RESOLVED recipes: a separate instance points at its own cloned recipe.
  const resolvedRecipeByMenuItemId = useMemo(() => {
    const map = { ...recipeByMenuItemId };
    resolvedMenuItems.forEach((m) => {
      if (m._mode === "separate" && m.recipeId) {
        const r = recipes.find((x) => x.id === m.recipeId);
        if (r) map[m.templateId || m.id] = r;
      }
    });
    return map;
  }, [recipeByMenuItemId, resolvedMenuItems, recipes]);
  // Phase 2 — venue selector for recipe costing (cost is per venue). Build a
  // { itemId: that venue's stock doc } map so costing resolves venueCost.
  const [recipeVenue, setRecipeVenue] = useState("");
  useEffect(() => { setRecipeVenue(selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "")); }, [selectedVenue, venues]);
  const recipeStockByItem = useMemo(() => {
    const m = {}; (stock || []).forEach((s) => { if (s.venueId === recipeVenue) m[s.id] = s; }); return m;
  }, [stock, recipeVenue]);

  // Template+instance: the visible list is the RESOLVED one — at a venue, items
  // without an instance are NOT sold there and are absent; at "all", templates.
  const vItems = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return resolvedMenuItems
      .filter((m) => m.removed !== true) // Job 8: soft-removed items live in the builder's Inactive view only
      .filter((m) => (!ql || (m.displayName || "").toLowerCase().includes(ql)) && (!fCat || m.category === fCat))
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [resolvedMenuItems, q, fCat]);

  // ── Job 4: the pin lists (group.posCategoryOrder / posItemOrder) are RETIRED.
  // This page was their only writer and the POS no longer reads them — the fields
  // stay on the group doc as inert legacy data. Order now lives on the documents:
  // menuCategories.position (left pane) and instance.position (middle pane).

  // ── Job 3: per-venue menu CATEGORIES (documents, not text) ──────────────────
  // The category doc id is stable across renames — instances reference it via
  // categoryId, so a rename touches ONE doc. The POS still reads item.category
  // text until Job 4; this manager edits the new source of truth.
  const venueCats = useMemo(
    () => menuCategories.filter((c) => c.venueId === selectedVenue),
    [menuCategories, selectedVenue]
  ); // flat() pre-sorts by position
  // resolve a legacy free-text category (may carry emoji) to this venue's doc id
  const venueCategoryIdFor = (vid, rawName) => {
    const n = stripEmoji(rawName || "Uncategorised");
    const hit = menuCategories.find((c) => c.venueId === vid && c.name === n);
    return hit ? hit.id : null;
  };
  const [newCatName, setNewCatName] = useState("");
  const [catCopyFrom, setCatCopyFrom] = useState("");
  const [dragCat, setDragCat] = useState(null);
  const [catBusy, setCatBusy] = useState(false);
  const addCategory = async () => {
    if (!canEdit || selectedVenue === "all") return;
    const name = stripEmoji(newCatName);
    if (!name) return showToast("Category name is required (emoji are stripped)");
    const id = categorySlug(name);
    // fast pre-checks against the live list (clear message names the clash) …
    const nameClash = venueCats.find((c) => (c.name || "").toLowerCase() === name.toLowerCase());
    if (nameClash) return showToast(`"${nameClash.name}" already exists at ${selectedVenueName}`);
    const idClash = venueCats.find((c) => c.id === id);
    if (idClash) return showToast(`Can't add "${name}" — its id "${id}" is taken by "${idClash.name}" (renamed from "${name}"?). Pick a different name.`);
    try {
      // … but the WRITE is create-only inside a transaction: slugs collide with
      // renamed docs ("Breaky"→"Breakfast" keeps id "breaky"; a new "Breaky"
      // slugs to the same id), and a subscription-lag setDoc would silently
      // overwrite the renamed doc. The tx re-checks existence server-side.
      await runTransaction(db, async (tx) => {
        const ref = menuCategoryDoc(groupId, selectedVenue, id);
        const snap = await tx.get(ref);
        if (snap.exists()) throw new Error(`id "${id}" is taken by "${snap.get("name")}" — pick a different name`);
        tx.set(ref, {
          name, position: venueCats.length,
          colour: CATEGORY_COLOURS[venueCats.length % CATEGORY_COLOURS.length],
          active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        });
      });
      setNewCatName("");
      showToast(`Category "${name}" added`);
    } catch (e) { showToast(`Could not add: ${e?.message || e?.code || "error"}`); }
  };
  const patchCategory = async (cat, patch, okMsg) => {
    if (!canEdit) return; // write-time re-check (hard rule)
    try {
      await setDoc(menuCategoryDoc(groupId, cat.venueId, cat.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      if (okMsg) showToast(okMsg);
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };
  const renameCategory = (cat, raw) => {
    const name = stripEmoji(raw);
    if (!name || name === cat.name) return;
    patchCategory(cat, { name }, `Renamed to "${name}" — items keep the category (they point at its id)`);
  };
  const dropCat = async (to) => {
    const from = dragCat; setDragCat(null);
    if (from === null || from === to || !canEdit) return;
    const next = [...venueCats]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    try {
      const batch = writeBatch(db);
      next.forEach((c, i) => { if (c.position !== i) batch.set(menuCategoryDoc(groupId, c.venueId, c.id), { position: i, updatedAt: serverTimestamp() }, { merge: true }); });
      await batch.commit();
    } catch (e) { showToast(`Could not reorder: ${e?.code || e?.message || "error"}`); }
  };
  // "Copy categories from another venue" — create-only (existing ids at this venue
  // are never touched); copied rows append AFTER existing ones in source order.
  const copyCategories = async () => {
    if (!canEdit || selectedVenue === "all" || !catCopyFrom || catBusy) return;
    setCatBusy(true);
    try {
      const snap = await getDocs(menuCategoriesCol(groupId, catCopyFrom));
      const have = new Set(venueCats.map((c) => c.id));
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !have.has(c.id));
      if (!rows.length) { showToast("Nothing to copy — that venue's categories all exist here already"); setCatBusy(false); return; }
      const base = venueCats.length;
      const batch = writeBatch(db);
      rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).forEach((c, i) =>
        batch.set(menuCategoryDoc(groupId, selectedVenue, c.id), {
          name: c.name, colour: c.colour || CATEGORY_COLOURS[(base + i) % CATEGORY_COLOURS.length],
          position: base + i, active: c.active !== false,
          createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
        }));
      await batch.commit();
      showToast(`${rows.length} categor${rows.length === 1 ? "y" : "ies"} copied from ${venueName(catCopyFrom) || "venue"}`);
    } catch (e) { showToast(`Could not copy: ${e?.code || e?.message || "error"}`); }
    setCatBusy(false);
  };
  // items at this venue in this category — joined by the instance's categoryId
  // (rename-proof: the id never changes), text-matching ONLY for instances that
  // predate the backfill and carry no categoryId yet.
  const catItemCount = (cat) =>
    resolvedMenuItems.filter((m) => {
      const inst = menuInstanceById[m.templateId || m.id];
      return inst?.categoryId
        ? inst.categoryId === cat.id
        : stripEmoji(m.category || "Uncategorised") === cat.name;
    }).length;

  // ── Job 4 BUILDER ── venue tabs + three panes (categories | items | detail).
  const [selCatKey, setSelCatKey] = useState(null); // left-pane category (doc id)
  const [selItemId, setSelItemId] = useState(null); // middle-pane item (template id)
  useEffect(() => { setSelItemId(null); }, [selectedVenue, selCatKey]);
  // keep the selection valid as the venue/category set changes
  useEffect(() => {
    if (venueCats.length && !venueCats.some((c) => c.id === selCatKey)) setSelCatKey(venueCats[0].id);
    if (!venueCats.length && selCatKey !== null) setSelCatKey(null);
  }, [venueCats, selCatKey]);
  const selCat = venueCats.find((c) => c.id === selCatKey) || null;
  // middle pane: this category's items AT THIS VENUE — exactly the POS order
  // (byPosition: positioned first, position-less last alphabetically, never hidden)
  const catItems = useMemo(
    () => (selCat
      ? byPosition(
          resolvedMenuItems.filter((m) => m.removed !== true && posCatKeyOf(m, venueCats) === selCat.id),
          (m) => m.position, (m) => m.displayName || "")
      : []),
    [selCat, resolvedMenuItems, venueCats]
  );
  // Job 8 SOFT REMOVE — removed items keep their instance (price/recipe/station)
  // and live in the Inactive view; 86 is a DIFFERENT state (still on the menu,
  // greyed, coming back) and stays in the main grid.
  const [builderView, setBuilderView] = useState("menu"); // menu | inactive
  useEffect(() => { setBuilderView("menu"); }, [selectedVenue]);
  const removedItems = useMemo(
    () => resolvedMenuItems.filter((m) => m.removed === true)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")),
    [resolvedMenuItems]
  );
  const [dragBItem, setDragBItem] = useState(null);
  const dropBItem = async (to) => {
    const from = dragBItem; setDragBItem(null);
    if (from === null || from === to || !canEdit || !selCat || selectedVenue === "all") return;
    const next = [...catItems]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    try {
      // whole-category position rewrite 0..n-1; also normalises categoryId onto
      // any legacy text-matched instance as it gets arranged
      const batch = writeBatch(db);
      next.forEach((m, i) => batch.set(venueMenuItemDoc(groupId, selectedVenue, m.templateId || m.id),
        { position: i, categoryId: selCat.id, updatedAt: serverTimestamp() }, { merge: true }));
      await batch.commit();
    } catch (e) { showToast(`Could not save order: ${e?.code || e?.message || "error"}`); }
  };
  // Job 5 — right-pane price writes: the INSTANCE for the selected venue only.
  // The template is a seed, never a sale-time source; arranging/pricing one
  // venue can never move another's.
  const saveInstPrice = async (m, patch, okMsg) => {
    if (!canEdit || selectedVenue === "all") return;
    try {
      await setDoc(venueMenuItemDoc(groupId, selectedVenue, m.templateId || m.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      showToast(okMsg || `Venue price saved for ${selectedVenueName}`);
    } catch (e) { showToast(`Could not save price: ${e?.code || e?.message || "error"}`); }
  };
  // whole-array variant write (the instance's own list — venue variant pricing)
  const saveVariantPrice = (m, idx, val) => {
    const vars = (m.variants || []).map((v, i) => (i === idx ? { ...v, sellPrice: Number(val) || 0 } : { ...v }));
    saveInstPrice(m, { variants: vars, hasVariants: true }, `${vars[idx]?.label || "Variant"} price saved for ${selectedVenueName}`);
  };
  // ── Job 6: stations + prep time on the INSTANCE ─────────────────────────────
  // Stations are the EXISTING per-venue documents (Settings → Stations) — an
  // item's stationId only means something at its own venue. Doc ids are slugs
  // of the name (SettingsPage convention), so "Grill" is `grill` everywhere.
  const slugName = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); // ⚠ keep identical to SettingsPage slug
  const venueStations = useMemo(
    () => stations.filter((s) => s.venueId === selectedVenue).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [stations, selectedVenue]
  );
  // a deleted station must not break items pointing at it: resolve to null → "no station"
  const stationName = (id) => venueStations.find((s) => s.id === id)?.name || null;
  const prepDefault = resolvePrepMinutes(group);
  // ── Job 6 BULK EDIT ── select many items in the middle pane, set station /
  // prep for all at once (283 items; one-at-a-time would never get filled in)
  const [bulkSel, setBulkSel] = useState(() => new Set());
  const [bulkStation, setBulkStation] = useState("");
  const [bulkPrep, setBulkPrep] = useState("");
  useEffect(() => { setBulkSel(new Set()); }, [selectedVenue, selCatKey]);
  const toggleBulk = (id) => setBulkSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const applyBulk = async () => {
    if (!canEdit || selectedVenue === "all" || !bulkSel.size) return;
    if (!bulkStation && bulkPrep === "") return showToast("Pick a station and/or a prep time to apply");
    const patch = {};
    if (bulkStation) patch.stationId = bulkStation === "__none" ? null : bulkStation;
    if (bulkPrep !== "") {
      const n = Number(bulkPrep);
      if (isNaN(n) || n <= 0) return showToast("Prep time must be a positive number of minutes");
      patch.prepMinutes = n;
    }
    try {
      const ids = [...bulkSel];
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => batch.set(venueMenuItemDoc(groupId, selectedVenue, id), { ...patch, updatedAt: serverTimestamp() }, { merge: true }));
        await batch.commit();
      }
      showToast(`${ids.length} item${ids.length === 1 ? "" : "s"} updated${patch.stationId !== undefined ? ` · station ${patch.stationId ? stationName(patch.stationId) || patch.stationId : "cleared"}` : ""}${patch.prepMinutes ? ` · ${patch.prepMinutes} min` : ""}`);
      setBulkSel(new Set()); setBulkStation(""); setBulkPrep("");
    } catch (e) { showToast(`Could not apply: ${e?.code || e?.message || "error"}`); }
  };

  // ── Job 9: COPY SETTINGS from another venue ─────────────────────────────────
  // Copies Prices / Stations / Prep / Modifier attachments for items BOTH venues
  // sell — it never ADDS items, and it never touches 86 state (today's kitchen
  // situation), removed (a settings copy must not silently re-add), category,
  // position, linked or recipeId. Stations are per-venue documents: matched by
  // NAME through the target's own station docs; no matching name = that item's
  // station is left alone and counted as skipped.
  const [copySettings, setCopySettings] = useState(null); // { srcVid, srcInsts, opts, busy }
  const openCopySettings = () => {
    if (!canEdit || selectedVenue === "all") return;
    setCopySettings({ srcVid: "", srcInsts: null, opts: { prices: true, stations: false, prep: false, mods: false }, busy: false });
  };
  const loadCopySettingsSource = async (vid) => {
    setCopySettings((p) => (p ? { ...p, srcVid: vid, srcInsts: null } : p));
    if (!vid) return;
    try {
      const snap = await getDocs(venueMenuItemsCol(groupId, vid));
      setCopySettings((p) => (p && p.srcVid === vid ? { ...p, srcInsts: snap.docs.map((d) => ({ id: d.id, ...d.data() })) } : p));
    } catch (e) { showToast(`Could not load that venue's menu: ${e?.code || e?.message || "error"}`); }
  };
  // the PLAN is computed up front so the confirm button can say exactly what changes
  const copyPlan = useMemo(() => {
    if (!copySettings?.srcInsts || !copySettings.srcVid) return null;
    const o = copySettings.opts;
    const srcStations = stations.filter((s) => s.venueId === copySettings.srcVid);
    let stationSkips = 0, removedSkipped = 0;
    const writes = [];
    for (const s of copySettings.srcInsts) {
      const tgt = menuInstanceById[s.id];
      if (!tgt) continue;                                   // this venue doesn't sell it — copying never adds
      if (tgt.removed === true) { removedSkipped++; continue; } // not sold here today — never silently re-add
      const patch = {};
      if (o.prices) {
        if (s.sellPrice != null && !isNaN(Number(s.sellPrice))) patch.sellPrice = Number(s.sellPrice); // never copy a MISSING price
        if (s.takeawayPrice !== undefined) patch.takeawayPrice = s.takeawayPrice; // null is a value ("same as dine-in")
        if (Array.isArray(s.variants)) {
          patch.hasVariants = s.hasVariants === true;
          patch.variantGroupName = s.variantGroupName || "";
          patch.variants = s.variants.map((v) => ({ ...v }));
        }
      }
      if (o.stations) {
        if (s.stationId) {
          const srcName = srcStations.find((x) => x.id === s.stationId)?.name;
          const tgtStation = srcName ? venueStations.find((x) => x.name === srcName) : null;
          if (tgtStation) patch.stationId = tgtStation.id;
          else stationSkips++;                              // no station with that NAME here — leave as-is
        } else {
          patch.stationId = null;                           // the source's setting IS "no station" — overwrite
        }
      }
      if (o.prep) patch.prepMinutes = s.prepMinutes ?? null; // null = group default, a real setting
      if (o.mods) patch.modifierOverrides = s.modifierOverrides ? JSON.parse(JSON.stringify(s.modifierOverrides)) : deleteField(); // absent = inherit template — true overwrite
      if (Object.keys(patch).length) writes.push({ id: s.id, patch });
    }
    return { writes, stationSkips, removedSkipped };
  }, [copySettings, menuInstanceById, stations, venueStations]);
  const applyCopySettings = async () => {
    if (!canEdit || !copySettings || !copyPlan || copySettings.busy || !copyPlan.writes.length) return;
    setCopySettings((p) => ({ ...p, busy: true }));
    try {
      for (let i = 0; i < copyPlan.writes.length; i += 400) {
        const batch = writeBatch(db);
        copyPlan.writes.slice(i, i + 400).forEach(({ id, patch }) =>
          batch.set(venueMenuItemDoc(groupId, selectedVenue, id), { ...patch, updatedAt: serverTimestamp() }, { merge: true }));
        await batch.commit();
      }
      showToast(`${copyPlan.writes.length} item${copyPlan.writes.length === 1 ? "" : "s"} updated at ${selectedVenueName}`
        + (copyPlan.stationSkips ? ` · ${copyPlan.stationSkips} station assignment${copyPlan.stationSkips === 1 ? "" : "s"} skipped (no matching station here)` : "")
        + (copyPlan.removedSkipped ? ` · ${copyPlan.removedSkipped} removed item${copyPlan.removedSkipped === 1 ? "" : "s"} untouched` : ""));
      setCopySettings(null);
    } catch (e) {
      showToast(`Could not copy: ${e?.code || e?.message || "error"}`);
      setCopySettings((p) => (p ? { ...p, busy: false } : p));
    }
  };

  // delete a category — BLOCKED while items remain (never orphan items)
  const deleteCategory = async (cat) => {
    if (!canEdit) return;
    const n = catItemCount(cat);
    if (n > 0) return showToast(`"${cat.name}" still has ${n} item${n === 1 ? "" : "s"} — move them to another category first`);
    try {
      await deleteDoc(menuCategoryDoc(groupId, cat.venueId, cat.id));
      showToast(`Category "${cat.name}" deleted`);
    } catch (e) { showToast(`Could not delete: ${e?.code || e?.message || "error"}`); }
  };
  // venue tabs: how many items each venue sells (server-side count aggregates;
  // the SELECTED venue tracks the live subscription instead)
  const [venueCounts, setVenueCounts] = useState({});
  const venueIdsKey = venues.map((v) => v.id).join(",");
  const loadVenueCounts = async () => {
    try {
      const entries = await Promise.all(venues.map(async (v) => {
        const s = await getCountFromServer(venueMenuItemsCol(groupId, v.id));
        return [v.id, s.data().count];
      }));
      setVenueCounts(Object.fromEntries(entries));
    } catch { /* counts are cosmetic — the tab still works without them */ }
  };
  useEffect(() => { if (groupId && venues.length) loadVenueCounts(); }, [groupId, venueIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // selected venue counts LIVE items (removed excluded); other venues use the
  // server aggregate, which cannot see the removed flag — close enough for a tab.
  const venueTabCount = (vid) => (vid === selectedVenue ? resolvedMenuItems.filter((m) => m.removed !== true).length : venueCounts[vid]);
  const selItem = selItemId ? resolvedMenuItems.find((m) => (m.templateId || m.id) === selItemId) || null : null;

  // Price at the selected venue — the ONE shared resolver (rgStockUtils), mirrors
  // the server priority: instance.sellPrice → legacy venuePrices → template.
  const sellAt = (m) => resolvedSellPrice(m, { menuInstanceById, menuItems, selectedVenue });
  // Pricing/Recipes tabs cost at recipeVenue; when a venue is selected recipeVenue
  // is locked to it, so sellAt applies. At "all" fall back to legacy venuePrices.
  const sellAtCostVenue = (m) => (selectedVenue === "all" ? venueSellPrice(m, recipeVenue) : sellAt(m));

  const patchItem = async (m, patch, okMsg) => {
    if (!canEdit) return; // write-time re-check (hard rule) — mirrors Ops MenusScreen; UI-disable alone is not a gate
    // availability/86 are INSTANCE state now — they apply to ONE venue only.
    if (selectedVenue === "all") return showToast("Select a venue (top-right) — availability & 86 are per-venue now");
    try {
      await setDoc(venueMenuItemDoc(groupId, selectedVenue, m.templateId || m.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      if (okMsg) showToast(okMsg);
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  // ── 86 list ──
  const quick86 = (m) => patchItem(m, { e86: true, available: false, e86Reason: "Out of stock", e86By: actor, e86At: new Date().toISOString(), e86Back: "Unknown" }, `${m.displayName} added to 86 list`);
  const remove86 = (m) => patchItem(m, { e86: false, available: true, e86Reason: "", e86Back: "" }, "Removed from 86 list");
  const [e86Form, setE86Form] = useState({ id: "", reason: E86_REASONS[0], back: E86_BACK[0] });
  const conf86 = async () => {
    const m = resolvedMenuItems.find((x) => (x.templateId || x.id) === e86Form.id);
    if (!m) return showToast("Pick a menu item");
    await patchItem(m, { e86: true, available: false, e86Reason: e86Form.reason, e86By: actor, e86At: new Date().toISOString(), e86Back: e86Form.back }, `${m.displayName} added to 86 list`);
    setE86Form({ id: "", reason: E86_REASONS[0], back: E86_BACK[0] });
  };
  // 86 list is venue-scoped (instance e86); at "all" it shows legacy template flags.
  const e86List = useMemo(() => resolvedMenuItems.filter((m) => m.e86 && m.removed !== true), [resolvedMenuItems]);

  // ── availability bulk ──
  const setAll = async (available) => {
    if (!canEdit) return;
    // bulk availability is INSTANCE state — one venue at a time.
    if (selectedVenue === "all") return showToast("Select a venue (top-right) — availability is per-venue now");
    try {
      const batch = writeBatch(db);
      vItems.filter((m) => !m.e86).forEach((m) => batch.set(venueMenuItemDoc(groupId, selectedVenue, m.templateId || m.id), { available, updatedAt: serverTimestamp() }, { merge: true }));
      await batch.commit();
      showToast(available ? "All items enabled" : "All items disabled");
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  // ── item modal ──
  // The editor edits the TEMPLATE — so template fields are read from the raw
  // template doc, never from the venue-resolved item (else a venue override
  // would leak into the template on save). Instance overrides get their own
  // fields (inst/instSellPrice) and their own write path in saveItem.
  const [editor, setEditor] = useState(null);
  // modifier-group picker UI state (display only — selection still lives in
  // editor.modifierGroupIds): search text + per-section expand/collapse overrides
  const [modPickQ, setModPickQ] = useState("");
  const [modPickOpen, setModPickOpen] = useState({});
  // item-editor modal tab (LAYOUT only — same fields/controls/writes, six tabs)
  const [editorTab, setEditorTab] = useState("basics");
  const openItem = (rm) => {
    setModPickQ(""); setModPickOpen({}); // fresh picker state per open
    setEditorTab("basics");
    const tid = rm ? (rm.templateId || rm.id) : null;
    const m = rm ? (menuItems.find((x) => x.id === tid) || rm) : null;
    setEditor(m ? {
    id: tid, displayName: m.displayName || "", kitchenName: m.kitchenName || "", category: m.category || categories[0],
    defaultStationName: m.defaultStationName || "",
    sellPrice: m.sellPrice ?? "", cost: m.cost ?? "", gstApplicable: m.gstApplicable !== false,
    venueIds: m.venueIds || [], posId: m.posId || "", modifierGroupIds: m.modifierGroupIds || [], available: m.available !== false,
    // Option A — per-venue price overrides. origVenuePrices keeps the saved keys so
    // cleared overrides can be removed with deleteField() on save (merge deep-merges maps).
    venuePrices: { ...(m.venuePrices || {}) }, origVenuePrices: { ...(m.venuePrices || {}) },
    // Takeaway / variants / combo — form uses "" for "null/blank" numbers; normalised on save.
    takeawayPrice: m.takeawayPrice ?? "",
    hasVariants: m.hasVariants === true, variantGroupName: m.variantGroupName || "",
    variants: (m.variants || []).map((v) => ({
      label: v.label || "", sellPrice: v.sellPrice ?? "", takeawayPrice: v.takeawayPrice ?? "",
      posId: v.posId || "", isDefault: !!v.isDefault, available: v.available !== false,
    })),
    isCombo: m.isCombo === true,
    comboGroups: (m.comboGroups || []).map((g) => ({
      name: g.name || "", maxChoice: g.maxChoice ?? "", optional: !!g.optional,
      options: (g.options || []).map((o) => ({ menuItemId: o.menuItemId || "", priceDelta: o.priceDelta ?? 0 })),
    })),
    // template+instance: this venue's instance snapshot (override editing)
    inst: selectedVenue !== "all" ? (menuInstanceById[tid] || null) : null,
    instSellPrice: selectedVenue !== "all" && menuInstanceById[tid]?.sellPrice != null ? menuInstanceById[tid].sellPrice : "",
  } : {
    id: null, displayName: "", kitchenName: "", category: categories[0], sellPrice: "", cost: "",
    defaultStationName: "",
    gstApplicable: true, venueIds: selectedVenue !== "all" ? [selectedVenue] : venues.map((v) => v.id),
    posId: "", modifierGroupIds: [], available: true,
    takeawayPrice: "", hasVariants: false, variantGroupName: "", variants: [], isCombo: false, comboGroups: [],
    venuePrices: {}, origVenuePrices: {},
    inst: null, instSellPrice: "",
  });
  };
  const saveItem = async () => {
    if (!canEdit || !editor) return;
    if (!editor.displayName.trim()) return showToast("Display name is required");
    if (!editor.venueIds.length) return showToast("Pick at least one venue");

    // ── Variants (sizes) — normalise, ensure exactly one default ──
    const hasVariants = !!editor.hasVariants;
    let variants = [];
    if (hasVariants) {
      variants = (editor.variants || [])
        .filter((v) => (v.label || "").trim())
        .map((v) => ({
          label: v.label.trim(),
          sellPrice: Number(v.sellPrice) || 0,
          takeawayPrice: v.takeawayPrice === "" || v.takeawayPrice == null ? null : Number(v.takeawayPrice),
          posId: v.posId || "",
          isDefault: !!v.isDefault,
          available: v.available !== false,
        }));
      if (!variants.length) return showToast("Add at least one variant, or turn variants off");
      // exactly one default: keep the first flagged, else default the first row
      const firstDefault = variants.findIndex((v) => v.isDefault);
      variants = variants.map((v, i) => ({ ...v, isDefault: i === (firstDefault === -1 ? 0 : firstDefault) }));
    }
    // Top-level sellPrice tracks the default variant when variants are on (handoff rule).
    const defaultVariant = variants.find((v) => v.isDefault);
    const sellPrice = hasVariants ? (Number(defaultVariant?.sellPrice) || 0) : (Number(editor.sellPrice) || 0);

    // ── Takeaway price (item level) — null = use sellPrice ──
    const takeawayPrice = editor.takeawayPrice === "" || editor.takeawayPrice == null ? null : Number(editor.takeawayPrice);

    // ── Per-venue price overrides (Option A) — { [venueId]: ex-GST number } ──
    // Blank/invalid input = no override for that venue (falls back to the group
    // sellPrice, mirroring venueCost's null-means-fallback). setDoc merge:true
    // DEEP-merges maps, so a cleared override must be removed with deleteField();
    // omitting the key would silently keep the stale override. On create the
    // original map is empty, so addDoc never receives a deleteField sentinel.
    const venuePrices = {};
    editor.venueIds.forEach((vid) => {
      const raw = editor.venuePrices?.[vid];
      if (raw !== "" && raw != null && !isNaN(Number(raw))) venuePrices[vid] = Number(raw);
    });
    Object.keys(editor.origVenuePrices || {}).forEach((vid) => {
      if (!(vid in venuePrices)) venuePrices[vid] = deleteField();
    });

    // ── Combos — only 2 in the demo set; keep simple ──
    const isCombo = !!editor.isCombo;
    const comboGroups = isCombo
      ? (editor.comboGroups || [])
          .filter((g) => (g.name || "").trim())
          .map((g) => ({
            name: g.name.trim(),
            maxChoice: g.maxChoice === "" || g.maxChoice == null ? null : Number(g.maxChoice),
            optional: !!g.optional,
            options: (g.options || [])
              .filter((o) => o.menuItemId)
              .map((o) => ({ menuItemId: o.menuItemId, priceDelta: Number(o.priceDelta) || 0 })),
          }))
      : [];
    if (isCombo && !comboGroups.length) return showToast("Add at least one combo group, or turn combo off");

    // TEMPLATE write — definition only. imageUrl (Job 7) is a TEMPLATE field —
    // one photo per item across venues — set today only via console/scripts
    // (merge:true preserves it); the uploader lands with the storage-security
    // job. available/e86 are INSTANCE state now and
    // are deliberately NOT written here (existing template flags are left as
    // legacy data; venueIds stays as legacy metadata — instance existence is the
    // authoritative "sold here" signal for sales).
    const data = {
      displayName: editor.displayName.trim(), kitchenName: editor.kitchenName || "", category: editor.category,
      // Job 6: a station NAME (not id) — station ids are per-venue slugs of the
      // name, so this seeds instance.stationId wherever a matching station exists
      defaultStationName: (editor.defaultStationName || "").trim(),
      sellPrice, cost: Number(editor.cost) || 0, gstApplicable: !!editor.gstApplicable,
      venueIds: editor.venueIds, posId: editor.posId || "", modifierGroupIds: editor.modifierGroupIds,
      takeawayPrice,
      venuePrices,
      hasVariants, variantGroupName: hasVariants ? (editor.variantGroupName || "") : "", variants,
      isCombo, comboGroups,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editor.id) await setDoc(menuItemDoc(groupId, editor.id), data, { merge: true });
      else await addDoc(menuItemsCol(groupId), { ...data, recipeId: null, createdAt: serverTimestamp() });
      // per-venue INSTANCE price override (blank = inherit; deleteField clears a
      // previously-set override). Only when editing with a venue selected + instance.
      if (editor.id && selectedVenue !== "all" && editor.inst) {
        const raw = editor.instSellPrice;
        const val = raw !== "" && raw != null && !isNaN(Number(raw)) ? Number(raw) : deleteField();
        // Job 3: keep the instance pointing at this venue's category DOC. No
        // matching doc = leave categoryId as-is (POS text fallback until Job 4).
        const catId = venueCategoryIdFor(selectedVenue, editor.category);
        await setDoc(venueMenuItemDoc(groupId, selectedVenue, editor.id), { sellPrice: val, ...(catId ? { categoryId: catId } : {}), updatedAt: serverTimestamp() }, { merge: true });
      }
      showToast("Menu item saved");
      setEditor(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };

  // ── template+instance: separate / re-link + recipe provenance (Reading X) ──
  // Separate = the venue gets its OWN copy: template values seeded onto the
  // instance + the dish recipe CLONED (venue edits never touch the template's
  // recipe — one-directional). recipeSourceId records which recipe it came from.
  const makeSeparate = async (templateId) => {
    if (!canEdit || selectedVenue === "all") return;
    const tmpl = menuItems.find((t) => t.id === templateId);
    if (!tmpl) return;
    try {
      let recipeId = null; let recipeSourceId = null;
      if (tmpl.recipeId) {
        const src = recipes.find((r) => r.id === tmpl.recipeId);
        const ref = await addDoc(recipesCol(groupId), {
          menuItemId: templateId, venueId: selectedVenue, clonedFrom: tmpl.recipeId,
          ingredients: (src?.ingredients || []).map((g) => ({ ...g })), createdAt: serverTimestamp(),
        });
        recipeId = ref.id; recipeSourceId = tmpl.recipeId;
      }
      await setDoc(venueMenuItemDoc(groupId, selectedVenue, templateId), {
        linked: false,
        sellPrice: Number(tmpl.sellPrice) || 0,
        hasVariants: tmpl.hasVariants === true, variantGroupName: tmpl.variantGroupName || "",
        variants: (tmpl.variants || []).map((v) => ({ ...v })),
        modifierGroupIds: tmpl.modifierGroupIds || [],
        recipeId, recipeSourceId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setEditor((p) => (p && p.id === templateId
        ? { ...p, inst: { ...(p.inst || {}), linked: false, recipeId, recipeSourceId, sellPrice: Number(tmpl.sellPrice) || 0 }, instSellPrice: Number(tmpl.sellPrice) || 0 }
        : p));
      showToast("Separate copy created for this venue");
    } catch (e) { showToast(`Could not separate: ${e?.code || e?.message || "error"}`); }
  };
  // Re-link = clear every override so the instance purely inherits again. The
  // cloned recipe doc is left in place (orphaned, not deleted — data safety).
  const makeLinked = async (templateId) => {
    if (!canEdit || selectedVenue === "all") return;
    try {
      await setDoc(venueMenuItemDoc(groupId, selectedVenue, templateId), {
        linked: true,
        sellPrice: deleteField(), variants: deleteField(), hasVariants: deleteField(), variantGroupName: deleteField(),
        modifierGroupIds: deleteField(), recipeId: deleteField(), recipeSourceId: deleteField(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      setEditor((p) => (p && p.id === templateId ? { ...p, inst: { ...(p.inst || {}), linked: true }, instSellPrice: "" } : p));
      showToast("Re-linked to template");
    } catch (e) { showToast(`Could not re-link: ${e?.code || e?.message || "error"}`); }
  };
  // Recipe provenance badge: separate instance's cloned recipe vs its source.
  const recipeSyncPill = (recipeId, recipeSourceId) => {
    if (!recipeSourceId) return null;
    const clone = recipes.find((r) => r.id === recipeId);
    const src = recipes.find((r) => r.id === recipeSourceId);
    const inSync = JSON.stringify(clone?.ingredients || []) === JSON.stringify(src?.ingredients || []);
    return <span className="pill" style={{ marginLeft: 6, background: inSync ? "#f0fdf4" : "#fffbeb", color: inSync ? "#16a34a" : "#d97706" }}>{inSync ? "in sync" : "diverged"}</span>;
  };

  // ── template+instance: bulk "Add items to a venue" (clone-to-venue) ──
  const [cloneModal, setCloneModal] = useState(null); // { venueId, existing:Set, selected:{[id]:bool}, busy }
  const loadCloneVenue = async (vid) => {
    const snap = await getDocs(venueMenuItemsCol(groupId, vid));
    const existing = new Set(snap.docs.map((d) => d.id));
    const selected = {};
    menuItems.forEach((t) => { if (!existing.has(t.id)) selected[t.id] = true; }); // select-all default
    setCloneModal({ venueId: vid, existing, selected, busy: false });
  };
  const openClone = async () => {
    if (!canEdit) return;
    const vid = selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "");
    if (!vid) return showToast("No venues yet");
    try { await loadCloneVenue(vid); } catch (e) { showToast(`Could not load venue menu: ${e?.code || e?.message || "error"}`); }
  };
  const confirmClone = async () => {
    if (!canEdit || !cloneModal || cloneModal.busy) return;
    // idempotent: existing instances are filtered out — never overwritten.
    const ids = Object.keys(cloneModal.selected).filter((id) => cloneModal.selected[id] && !cloneModal.existing.has(id));
    if (!ids.length) return showToast("Nothing to add");
    setCloneModal((p) => ({ ...p, busy: true }));
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const batch = writeBatch(db);
        ids.slice(i, i + 400).forEach((id) => {
          const t = menuItems.find((x) => x.id === id);
          // Job 3: new instances point at the venue's category DOC (renames-safe).
          const catId = venueCategoryIdFor(cloneModal.venueId, t?.category);
          // Job 5 COPY ON ADD — the VENUE is the truth: the template's price is a
          // starting value copied ONCE here (today's venue-resolved value: legacy
          // venuePrices override, else template sellPrice) and never read again
          // at sale time. Variants copied WHOLE — venue variant pricing.
          const vpRaw = t?.venuePrices?.[cloneModal.venueId];
          const seedPrice = vpRaw != null && !isNaN(Number(vpRaw)) ? Number(vpRaw) : (Number(t?.sellPrice) || 0);
          // Job 6: template's default station NAME → this venue's station doc id
          // (ids are name-slugs). No matching station at this venue = no seed.
          const stnId = t?.defaultStationName ? slugName(t.defaultStationName) : null;
          const stnSeed = stnId && stations.some((s) => s.venueId === cloneModal.venueId && s.id === stnId) ? { stationId: stnId } : {};
          batch.set(venueMenuItemDoc(groupId, cloneModal.venueId, id), {
            linked: true, available: true, e86: false,
            sellPrice: seedPrice,
            takeawayPrice: t?.takeawayPrice ?? null,
            hasVariants: t?.hasVariants === true,
            variantGroupName: t?.hasVariants ? (t.variantGroupName || "") : "",
            variants: t?.hasVariants ? (t.variants || []).map((v) => ({ ...v })) : [],
            ...(catId ? { categoryId: catId } : {}),
            ...stnSeed,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      showToast(`${ids.length} item${ids.length === 1 ? "" : "s"} added to ${venueName(cloneModal.venueId) || "venue"}`);
      setCloneModal(null);
      loadVenueCounts(); // keep the builder's venue tabs honest after adding
    } catch (e) {
      showToast(`Could not add: ${e?.code || e?.message || "error"}`);
      setCloneModal((p) => (p ? { ...p, busy: false } : p));
    }
  };

  // ── recipe modal ──
  const [recEditor, setRecEditor] = useState(null); // {menuItemId, recipeId|null, ingredients:[{itemId, qty, netQty, recipeUnit}]}
  const recipeUnitOf = (itemId) => itemById[itemId]?.recipeUnit || itemById[itemId]?.unit || "";
  const openRecipe = (m) => {
    // venue-resolved: a separate instance opens its OWN cloned recipe.
    const r = resolvedRecipeByMenuItemId[m.templateId || m.id];
    // normalise lines: netQty (fallback qty) is the entered amount; recipeUnit
    // defaults to the item's recipeUnit. Phase 1 — backward compatible.
    setRecEditor({ menuItemId: m.templateId || m.id, recipeId: r?.id || null, ingredients: (r?.ingredients || []).map((g) => ({
      itemId: g.itemId, netQty: g.netQty != null ? g.netQty : g.qty, recipeUnit: g.recipeUnit || recipeUnitOf(g.itemId),
    })) });
  };
  const recMenuItem = recEditor
    ? (resolvedMenuItems.find((m) => (m.templateId || m.id) === recEditor.menuItemId) || menuItems.find((m) => m.id === recEditor.menuItemId))
    : null;
  const recCost = recEditor ? recipeFoodCost({ ingredients: recEditor.ingredients }, itemById, recipeStockByItem) : 0;
  const saveRecipe = async () => {
    if (!canEdit || !recEditor) return;
    // store qty = netQty for back-compat, plus netQty + recipeUnit (Phase 1)
    const ingredients = recEditor.ingredients.filter((g) => g.itemId && Number(g.netQty) > 0).map((g) => ({
      itemId: g.itemId, qty: Number(g.netQty), netQty: Number(g.netQty), recipeUnit: g.recipeUnit || recipeUnitOf(g.itemId),
    }));
    if (!ingredients.length) return showToast("Add at least one ingredient");
    try {
      let recipeId = recEditor.recipeId;
      // A venue-cloned recipe (carries venueId) belongs to the INSTANCE — never
      // link it back onto the template, or one venue's edit would leak group-wide.
      const isVenueClone = !!(recipeId && recipes.find((x) => x.id === recipeId)?.venueId);
      if (recipeId) {
        await setDoc(recipeDoc(groupId, recipeId), { menuItemId: recEditor.menuItemId, ingredients, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        const ref = await addDoc(recipesCol(groupId), { menuItemId: recEditor.menuItemId, ingredients, createdAt: serverTimestamp() });
        recipeId = ref.id;
      }
      if (!isVenueClone) {
        await setDoc(menuItemDoc(groupId, recEditor.menuItemId), { recipeId, updatedAt: serverTimestamp() }, { merge: true });
      }
      showToast("Recipe saved — POS sales now deduct these ingredients");
      setRecEditor(null);
    } catch (e) { showToast(`Could not save recipe: ${e?.code || e?.message || "error"}`); }
  };

  // demo POS sale (the real rgSellOrder transaction)
  const [selling, setSelling] = useState("");
  const demoSell = async (m) => {
    // Phase 0 / Fix 0.3 — require an explicit selected venue; never infer the
    // selling location from the menu item's first venueId.
    if (selectedVenue === "all") return showToast("Select a venue (top-right) to run a demo sale");
    const venueId = selectedVenue;
    setSelling(m.id);
    try {
      const r = await sellOrder({ groupId, venueId, lines: [{ menuItemId: m.id, qty: 1 }], reference: `DEMO-${Date.now().toString().slice(-5)}` });
      const skippedMsg = (r.skipped || []).map((x) => x.reason).join("; ");
      let msg = `${m.displayName} sold at ${venueName(venueId)} — ${r.deducted.length} ingredients deducted.`;
      if (r.lowStock?.length) msg += ` LOW STOCK: ${r.lowStock.join(", ")}`;
      if (r.draftsCreated) msg += ` · draft PO raised`;
      showToast(skippedMsg || msg);
    } catch (e) { showToast(`Sale failed: ${e?.message || e?.code || "error"}`); }
    setSelling("");
  };

  // ── modifier groups ──
  const [modForm, setModForm] = useState(null);
  // kind seeds from modGroupKind: an unseeded group shows its DERIVED kind, and
  // saving the form makes that explicit on the doc.
  const openMod = (g) => setModForm(g ? { ...g, kind: modGroupKind(g), options: (g.options || []).map((o) => ({ ...o })) } : {
    id: null, name: "", kind: "add", type: "multi", required: false, minSelections: 0, maxSelections: null, printer: "kitchen",
    options: [{ label: "", priceDelta: 0 }],
  });
  // "Apply these" — the ONLY path where a kind's template touches type/required.
  // Selecting a kind by itself never rewrites a live group's selection rules
  // (settled decision: suggest, never overwrite). MOD_KIND_DEFAULTS specifies no
  // min/max, so they stay — except the form's own required→min≥1 invariant
  // (mirrors the Required checkbox's onChange).
  const applyKindDefaults = () => setModForm((p) => {
    const tpl = MOD_KIND_DEFAULTS[p.kind];
    if (!tpl) return p;
    return {
      ...p, type: tpl.type, required: tpl.required,
      minSelections: tpl.required ? Math.max(1, Number(p.minSelections) || 0) : p.minSelections,
    };
  });
  const saveMod = async () => {
    if (!canEdit || !modForm) return;
    if (!modForm.name.trim()) return showToast("Group name required");
    // Preserve the importer-written per-option posId (preserve-if-present, never invent
    // one) — rebuilding as {label, priceDelta} only silently dropped it on every app edit.
    const options = modForm.options.filter((o) => (o.label || "").trim()).map((o) => ({
      label: o.label.trim(), priceDelta: Number(o.priceDelta) || 0,
      ...(o.posId != null && o.posId !== "" ? { posId: String(o.posId) } : {}),
    }));
    if (!options.length) return showToast("Add at least one option");
    const data = {
      name: modForm.name.trim(), type: modForm.type, required: !!modForm.required,
      minSelections: Number(modForm.minSelections) || 0,
      maxSelections: modForm.maxSelections === null || modForm.maxSelections === "" ? null : Number(modForm.maxSelections),
      printer: modForm.printer || "kitchen", options,
      // GROUP-LEVEL semantic category (see KIND_EDITOR comment) — never derived
      // again once saved; falls back to derivation only for malformed values
      kind: MOD_KINDS.includes(modForm.kind) ? modForm.kind : modGroupKind(modForm),
    };
    try {
      if (modForm.id) await setDoc(modifierGroupDoc(groupId, modForm.id), data, { merge: true });
      else await addDoc(modifierGroupsCol(groupId), { ...data, attachedMenuItemIds: [], createdAt: serverTimestamp() });
      showToast("Modifier group saved");
      setModForm(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };
  const attachedCount = (g) => menuItems.filter((m) => (m.modifierGroupIds || []).includes(g.id)).length;


  // Phase 3 — venue-aware food cost for the Pricing/Margins screen (cost at the
  // selected venue via Phase 2 venueCost). overview/availability keep group cost.
  const foodCostAtVenue = (m) => menuItemFoodCost(m, resolvedRecipeByMenuItemId, itemById, recipeStockByItem);
  // pricing KPIs (all ex-GST — one base, Hard Rule 8) — at the selected venue
  const pricing = useMemo(() => {
    if (!vItems.length) return { avgSell: 0, avgCost: 0, avgCostPct: 0, avgMargin: 0, below35: 0 };
    let sell = 0, cost = 0, mg = 0, below = 0;
    vItems.forEach((m) => {
      // sell at the costing venue (instance-resolved), one venue base with cost.
      const s = sellAtCostVenue(m);
      const c = foodCostAtVenue(m); const g = marginPct(s, c);
      sell += s; cost += c; mg += g;
      if (g < 35) below++;
    });
    const n = vItems.length;
    return { avgSell: sell / n, avgCost: cost / n, avgCostPct: sell > 0 ? Math.round((cost / sell) * 100) : 0, avgMargin: Math.round(mg / n), below35: below };
  }, [vItems, resolvedRecipeByMenuItemId, itemById, recipeStockByItem, menuInstanceById]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          <button className={`tab ${tab === "builder" ? "active" : ""}`} onClick={() => setTab("builder")}>Menu builder</button>
          <button className={`tab ${tab === "availability" ? "active" : ""}`} onClick={() => setTab("availability")}>Availability</button>
          <button className={`tab ${tab === "e86" ? "active" : ""}`} onClick={() => setTab("e86")}>86 list{e86List.length ? ` (${e86List.length})` : ""}</button>
          <button className={`tab ${tab === "recipes" ? "active" : ""}`} onClick={() => setTab("recipes")}>Recipe costing</button>
          <button className={`tab ${tab === "modifiers" ? "active" : ""}`} onClick={() => setTab("modifiers")}>Modifier groups</button>
          <button className={`tab ${tab === "pricing" ? "active" : ""}`} onClick={() => setTab("pricing")}>Pricing & margins</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>{selectedVenueName} · {vItems.length} items</div>
      </div>

      {(tab === "availability" || tab === "pricing") && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input className="form-input" style={{ width: 200 }} placeholder="Search menu…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="form-input" style={{ width: 150 }} value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              {tab === "availability" && canEdit && (<>
                <button className="btn btn-sm" onClick={() => setAll(true)}>Enable all</button>
                <button className="btn btn-sm" onClick={() => setAll(false)}>Disable all</button>
              </>)}
              {canEdit && <button className="btn btn-sm" onClick={openClone}>+ Add items to venue</button>}
              {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openItem(null)}>+ New menu item</button>}
            </div>
          </div>
        </div>
      )}

      {tab === "builder" && (
        <>
          {/* venue tabs — this IS the global venue picker (setSelectedVenue), rendered
              as tabs with live sold-item counts; not a second selector */}
          <div className="card" style={{ marginBottom: 16, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {venues.map((v) => (
              <button key={v.id} className={`tab ${selectedVenue === v.id ? "active" : ""}`} onClick={() => setSelectedVenue(v.id)}>
                {v.name} <span style={{ color: "var(--gray)", fontSize: 11 }}>({venueTabCount(v.id) ?? "…"} items)</span>
              </button>
            ))}
            {canEdit && selectedVenue !== "all" && (
              <span style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                <button className="btn btn-sm" onClick={openCopySettings}>Copy settings from venue…</button>
                <button className="btn btn-primary btn-sm" onClick={() => openItem(null)}>+ New menu item</button>
              </span>
            )}
          </div>
          {selectedVenue === "all" ? (
            <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>
              Items and their POS order are per-venue — pick a venue tab above to build its menu.
            </div>
          ) : (
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              {/* LEFT — this venue's categories (the Job 3 manager), drag = POS order */}
              <div className="card" style={{ flex: "1 1 270px", minWidth: 260 }}>
                <div className="card-head"><div><span className="card-title">Categories</span><span className="card-sub">Drag to set POS order · rename holds items (they point at the id)</span></div></div>
                {venueCats.map((c, i) => (
                  <div key={c.id} className="staff-meta-row" draggable={canEdit}
                    onDragStart={() => setDragCat(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropCat(i)} onDragEnd={() => setDragCat(null)}
                    onClick={() => setSelCatKey(c.id)}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 6px", borderBottom: "0.5px solid var(--gray-light)",
                      cursor: canEdit ? "grab" : "pointer", opacity: (dragCat === i ? 0.5 : 1) * (c.active === false ? 0.55 : 1),
                      background: selCatKey === c.id ? "#f4f0fa" : "transparent", borderRadius: 6 }}>
                    {canEdit && <span style={{ color: "var(--gray)" }} title="Drag to reorder">⠿</span>}
                    <input type="color" value={c.colour || "#8C867E"} disabled={!canEdit} title="Category colour"
                      style={{ width: 24, height: 24, padding: 0, border: "none", background: "transparent", cursor: canEdit ? "pointer" : "default" }}
                      onClick={(e) => e.stopPropagation()} onChange={(e) => patchCategory(c, { colour: e.target.value })} />
                    {canEdit ? (
                      <input className="form-input" style={{ width: 130, fontSize: 12 }} defaultValue={c.name} key={`${c.id}-${c.name}`}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={(e) => renameCategory(c, e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                    ) : <span style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</span>}
                    <span className="pill" style={{ background: "#f4f4f5", color: "var(--gray)" }}>{catItemCount(c)}</span>
                    {c.active === false && <span className="pill pill-amber">off</span>}
                    {canEdit && (
                      <span style={{ marginLeft: "auto", display: "flex", gap: 4 }} onClick={(e) => e.stopPropagation()}>
                        <button className="btn btn-sm" title={c.active === false ? "Reactivate (shows on POS)" : "Deactivate (hides from POS)"}
                          onClick={() => patchCategory(c, { active: c.active === false }, c.active === false ? `"${c.name}" reactivated` : `"${c.name}" deactivated`)}>
                          {c.active === false ? "On" : "Off"}
                        </button>
                        <button className="btn btn-sm btn-danger" title="Delete (blocked while it still has items)" onClick={() => deleteCategory(c)}>✕</button>
                      </span>
                    )}
                  </div>
                ))}
                {venueCats.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--gray)", padding: "6px 0" }}>No categories at {selectedVenueName} yet — add one, or copy from another venue.</div>
                )}
                {canEdit && (
                  <>
                    <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                      <input className="form-input" style={{ flex: 1, minWidth: 120 }} placeholder="New category (no emoji)"
                        value={newCatName} onChange={(e) => setNewCatName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") addCategory(); }} />
                      <button className="btn btn-primary btn-sm" onClick={addCategory}>+ Add</button>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
                      <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={catCopyFrom} onChange={(e) => setCatCopyFrom(e.target.value)}>
                        <option value="">Copy from venue…</option>
                        {venues.filter((v) => v.id !== selectedVenue).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                      </select>
                      <button className="btn btn-sm" disabled={!catCopyFrom || catBusy} onClick={copyCategories}>{catBusy ? "Copying…" : "Copy"}</button>
                    </div>
                  </>
                )}
              </div>

              {/* MIDDLE — the selected category's items, drag = exactly the POS order */}
              <div className="card" style={{ flex: "2 1 400px", minWidth: 330 }}>
                <div className="card-head" style={{ alignItems: "center" }}>
                  <div>
                    <span className="card-title">{builderView === "inactive" ? "Inactive items" : (selCat ? selCat.name : "Items")}</span>
                    <span className="card-sub">{builderView === "inactive"
                      ? `${removedItems.length} removed from ${selectedVenueName} — instance kept (price, recipe, station); re-add is one tap`
                      : `${catItems.length} item${catItems.length === 1 ? "" : "s"} at ${selectedVenueName} · drag to arrange — this is the POS order`}</span>
                  </div>
                  <div className="tabs" style={{ marginLeft: "auto" }}>
                    <button className={`tab ${builderView === "menu" ? "active" : ""}`} onClick={() => setBuilderView("menu")}>Menu</button>
                    <button className={`tab ${builderView === "inactive" ? "active" : ""}`} onClick={() => setBuilderView("inactive")}>Inactive{removedItems.length ? ` (${removedItems.length})` : ""}</button>
                  </div>
                </div>
                {builderView === "inactive" && (
                  <>
                    {removedItems.map((m) => (
                      <div key={m.templateId || m.id} className="staff-meta-row"
                        onClick={() => setSelItemId(m.templateId || m.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "0.5px solid var(--gray-light)",
                          cursor: "pointer", background: selItemId === (m.templateId || m.id) ? "#f4f0fa" : "transparent", borderRadius: 6 }}>
                        {m.imageUrl && <img src={m.imageUrl} alt="" loading="lazy" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />}
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{m.displayName}</span>
                        <span className="pill" style={{ background: "#f4f4f5", color: "var(--gray)" }}>{money(incGst(sellAt(m), m.gstApplicable !== false))} kept</span>
                        {stationName(m.stationId) && <span className="pill" style={{ background: "#f4f4f5", color: "var(--gray)" }}>{stationName(m.stationId)}</span>}
                        {canEdit && (
                          <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); saveInstPrice(m, { removed: false }, `${m.displayName} is back on the ${selectedVenueName} menu — price and station kept`); }}>
                            Re-add
                          </button>
                        )}
                      </div>
                    ))}
                    {removedItems.length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--gray)", padding: "6px 0" }}>Nothing removed at {selectedVenueName}. Remove an item from its detail pane — it keeps its price, recipe and station here.</div>
                    )}
                  </>
                )}
                {builderView === "menu" && catItems.map((m, i) => (
                  <div key={m.templateId || m.id} className="staff-meta-row" draggable={canEdit}
                    onDragStart={() => setDragBItem(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropBItem(i)} onDragEnd={() => setDragBItem(null)}
                    onClick={() => setSelItemId(m.templateId || m.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderBottom: "0.5px solid var(--gray-light)",
                      cursor: canEdit ? "grab" : "pointer", opacity: (dragBItem === i ? 0.5 : 1) * (m.e86 ? 0.55 : 1),
                      background: selItemId === (m.templateId || m.id) ? "#f4f0fa" : "transparent", borderRadius: 6 }}>
                    {canEdit && <input type="checkbox" checked={bulkSel.has(m.templateId || m.id)} onChange={() => toggleBulk(m.templateId || m.id)} onClick={(e) => e.stopPropagation()} title="Select for bulk edit" />}
                    {canEdit && <span style={{ color: "var(--gray)" }} title="Drag to arrange">⠿</span>}
                    <span style={{ fontSize: 11, color: "var(--gray)", width: 18, textAlign: "right" }}>{i + 1}.</span>
                    {m.imageUrl && <img src={m.imageUrl} alt="" loading="lazy" style={{ width: 24, height: 24, objectFit: "cover", borderRadius: 4 }} />}
                    <span style={{ fontSize: 13, fontWeight: 500, textDecoration: m.e86 ? "line-through" : "none" }}>{m.displayName}</span>
                    {Number.isFinite(Number(m.position)) && m.position !== null ? null : <span className="pill pill-amber" title="Not arranged yet — sorts last, alphabetically, until dragged">unplaced</span>}
                    {m.available === false && !m.e86 && <span className="pill pill-amber">hidden</span>}
                    {m.e86 && <span className="pill pill-red" title={`86’d — ${m.e86Reason || "no reason"} · by ${m.e86By || "?"} · back: ${m.e86Back || "Unknown"}`}>86 · {m.e86Reason || "no reason"} · back {m.e86Back || "?"}</span>}
                    {!hasVenuePrice(m, { menuInstanceById, selectedVenue }) && <span className="pill pill-red" title="No venue price — the POS refuses this item until one is set">no price</span>}
                    {stationName(m.stationId) && <span className="pill" style={{ background: "#f4f4f5", color: "var(--gray)" }}>{stationName(m.stationId)}{m.prepMinutes ? ` · ${m.prepMinutes}m` : ""}</span>}
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray)" }}>{money(incGst(sellAt(m), m.gstApplicable !== false))}</span>
                  </div>
                ))}
                {builderView === "menu" && selCat && catItems.length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--gray)", padding: "6px 0" }}>No items in {selCat.name} at {selectedVenueName} yet.</div>
                )}
                {builderView === "menu" && canEdit && catItems.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10, padding: "8px 6px", background: "#fafafa", borderRadius: 8 }}>
                    <button className="btn btn-sm" onClick={() => setBulkSel(bulkSel.size === catItems.length ? new Set() : new Set(catItems.map((m) => m.templateId || m.id)))}>
                      {bulkSel.size === catItems.length ? "Clear selection" : `Select all ${catItems.length}`}
                    </button>
                    <span style={{ fontSize: 12, color: "var(--gray)" }}>{bulkSel.size} selected</span>
                    <select className="form-input" style={{ width: 140 }} value={bulkStation} onChange={(e) => setBulkStation(e.target.value)}>
                      <option value="">Station…</option>
                      <option value="__none">— clear station —</option>
                      {venueStations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <input className="form-input" type="number" min="1" step="1" style={{ width: 90 }} placeholder="Prep min" value={bulkPrep} onChange={(e) => setBulkPrep(e.target.value)} />
                    <button className="btn btn-primary btn-sm" disabled={!bulkSel.size} onClick={applyBulk}>Apply to {bulkSel.size || "…"}</button>
                  </div>
                )}
                {builderView === "menu" && canEdit && (
                  <div onClick={openClone}
                    style={{ border: "1.5px dashed var(--gray-light)", borderRadius: 8, padding: "12px 10px", marginTop: 10,
                      textAlign: "center", fontSize: 13, color: "var(--gray)", cursor: "pointer" }}>
                    + Add from library — create a venue instance for a group item
                  </div>
                )}
              </div>

              {/* RIGHT — the selected item: what applies AT THIS VENUE */}
              <div className="card" style={{ flex: "1 1 270px", minWidth: 260 }}>
                <div className="card-head"><div><span className="card-title">{selItem ? selItem.displayName : "Item detail"}</span><span className="card-sub">{selItem ? `at ${selectedVenueName}` : "click an item in the middle pane"}</span></div></div>
                {selItem && (
                  <>
                    {/* Job 7 thumbnail slot — renders template.imageUrl when present.
                        NO uploader here yet: uploads arrive with the storage-security
                        job (group-scoped path + rules). Field only, deliberately. */}
                    {selItem.imageUrl ? (
                      <img src={selItem.imageUrl} alt={selItem.displayName}
                        style={{ width: "100%", maxWidth: 230, height: 120, objectFit: "cover", borderRadius: 8, marginBottom: 10 }} />
                    ) : (
                      <div style={{ width: "100%", maxWidth: 230, height: 56, borderRadius: 8, marginBottom: 10,
                        border: "1.5px dashed var(--gray-light)", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, color: "var(--gray)" }}>
                        No photo — uploads arrive with the storage-security job
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12 }}>
                      <div><span style={{ color: "var(--gray)" }}>Mode: </span>{selItem._mode === "separate" ? <span className="pill pill-amber">separate copy</span> : <span className="pill pill-green">linked to template</span>}</div>
                      <div><span style={{ color: "var(--gray)" }}>Category: </span>{venueCats.find((c) => c.id === posCatKeyOf(selItem, venueCats))?.name || stripEmoji(selItem.category || "Uncategorised")}</div>
                      {/* Job 5 — the VENUE prices this item: these inputs write the
                          INSTANCE for the selected venue only. Stored EX-GST; the
                          inc-GST figure alongside is display maths (+10%). */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--gray)" }}>Price here (ex-GST): </span>
                        {canEdit ? (
                          <input className="form-input" type="number" step="0.01" min="0" style={{ width: 90 }}
                            key={`p-${selItem.templateId || selItem.id}-${sellAt(selItem)}`} defaultValue={sellAt(selItem)}
                            onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v >= 0 && v !== sellAt(selItem)) saveInstPrice(selItem, { sellPrice: v }); }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                        ) : <strong>{money(sellAt(selItem))}</strong>}
                        <strong>{money(incGst(sellAt(selItem), selItem.gstApplicable !== false))} inc</strong>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--gray)" }}>Takeaway (ex-GST): </span>
                        {canEdit ? (
                          <input className="form-input" type="number" step="0.01" min="0" style={{ width: 90 }} placeholder="same as dine-in"
                            key={`ta-${selItem.templateId || selItem.id}-${selItem.takeawayPrice}`} defaultValue={selItem.takeawayPrice ?? ""}
                            onBlur={(e) => { const raw = e.target.value; const v = raw === "" ? null : Number(raw); if ((v === null || (!isNaN(v) && v >= 0)) && v !== (selItem.takeawayPrice ?? null)) saveInstPrice(selItem, { takeawayPrice: v }); }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                        ) : <span>{selItem.takeawayPrice == null ? "same as dine-in" : money(selItem.takeawayPrice)}</span>}
                      </div>
                      {selItem.hasVariants && (selItem.variants || []).map((vv, vi) => (
                        <div key={vv.label || vi} style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 12 }}>
                          <span style={{ color: "var(--gray)" }}>{vv.label} (ex-GST): </span>
                          {canEdit ? (
                            <input className="form-input" type="number" step="0.01" min="0" style={{ width: 90 }}
                              key={`v-${selItem.templateId || selItem.id}-${vi}-${vv.sellPrice}`} defaultValue={vv.sellPrice ?? 0}
                              onBlur={(e) => { const v = Number(e.target.value); if (!isNaN(v) && v >= 0 && v !== Number(vv.sellPrice)) saveVariantPrice(selItem, vi, v); }}
                              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                          ) : <span>{money(vv.sellPrice)}</span>}
                          <span style={{ color: "var(--gray)" }}>{money(incGst(Number(vv.sellPrice) || 0, selItem.gstApplicable !== false))} inc{vv.isDefault ? " · default" : ""}</span>
                        </div>
                      ))}
                      {selItem.hasVariants && <div><span style={{ color: "var(--gray)" }}>Sizes: </span>{(selItem.variants || []).map((v) => v.label).join(", ")}</div>}
                      <div><span style={{ color: "var(--gray)" }}>POS position: </span>{Number.isFinite(Number(selItem.position)) && selItem.position !== null ? `#${Number(selItem.position) + 1} in category` : "unplaced (sorts last)"}</div>
                      <div><span style={{ color: "var(--gray)" }}>POS ID: </span>{selItem.posId || "—"}</div>
                      {/* Job 6 — kitchen routing: station + prep time live on THIS venue's instance */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--gray)" }}>Station: </span>
                        {canEdit ? (
                          <select className="form-input" style={{ width: 150 }}
                            value={venueStations.some((s) => s.id === selItem.stationId) ? selItem.stationId : ""}
                            onChange={(e) => saveInstPrice(selItem, { stationId: e.target.value || null }, e.target.value ? `Station set to ${stationName(e.target.value)}` : "Station cleared")}>
                            <option value="">— no station —</option>
                            {venueStations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        ) : <span>{stationName(selItem.stationId) || "—"}</span>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: "var(--gray)" }}>Prep time: </span>
                        {canEdit ? (
                          <input className="form-input" type="number" min="1" step="1" style={{ width: 90 }}
                            placeholder={`${prepDefault} (default)`}
                            key={`prep-${selItem.templateId || selItem.id}-${selItem.prepMinutes}`} defaultValue={selItem.prepMinutes ?? ""}
                            onBlur={(e) => { const raw = e.target.value; const v = raw === "" ? null : Number(raw); if (v !== null && (isNaN(v) || v <= 0)) return showToast("Prep time must be a positive number of minutes"); if (v !== (selItem.prepMinutes ?? null)) saveInstPrice(selItem, { prepMinutes: v }, v === null ? `Prep time cleared — uses the ${prepDefault} min default` : `Prep time set to ${v} min`); }}
                            onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                        ) : <span>{selItem.prepMinutes ?? `${prepDefault} (default)`}</span>}
                        <span style={{ color: "var(--gray)" }}>min</span>
                      </div>
                      <div><span style={{ color: "var(--gray)" }}>Status: </span>{selItem.removed === true ? <span className="pill" style={{ background: "#f4f4f5", color: "var(--gray)" }}>removed — not on this menu (price/recipe/station kept)</span> : selItem.e86 ? <span className="pill pill-red">86’d — {selItem.e86Reason || "no reason"} · by {selItem.e86By || "?"} · back {selItem.e86Back || "Unknown"}</span> : selItem.available !== false ? <span className="pill pill-green">available</span> : <span className="pill pill-amber">hidden from POS</span>}</div>
                      <div><span style={{ color: "var(--gray)" }}>Modifiers: </span>{(selItem.modifierGroupIds || []).length} group{(selItem.modifierGroupIds || []).length === 1 ? "" : "s"}</div>
                    </div>
                    {canEdit && (
                      <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
                        <button className="btn btn-primary btn-sm" onClick={() => openItem(selItem)}>Edit item</button>
                        {selItem.removed === true ? (
                          <button className="btn btn-sm" onClick={() => saveInstPrice(selItem, { removed: false }, `${selItem.displayName} is back on the ${selectedVenueName} menu — price and station kept`)}>Re-add to menu</button>
                        ) : (
                          <>
                            {selItem.e86
                              ? <button className="btn btn-sm" onClick={() => remove86(selItem)}>Remove 86</button>
                              : <button className="btn btn-sm" style={{ color: "var(--red)" }} onClick={() => quick86(selItem)}>86 it</button>}
                            <button className="btn btn-sm" onClick={() => patchItem(selItem, { available: selItem.available === false }, selItem.available === false ? "Available on POS" : "Hidden from POS")} disabled={selItem.e86}>
                              {selItem.available === false ? "Show on POS" : "Hide from POS"}
                            </button>
                            {/* Job 8 SOFT REMOVE — off the menu, instance survives (≠ 86: sold out, coming back) */}
                            <button className="btn btn-sm" style={{ color: "var(--red)" }} title="Take off this venue's menu — keeps the venue price, recipe and station for re-adding"
                              onClick={() => saveInstPrice(selItem, { removed: true }, `${selItem.displayName} removed from ${selectedVenueName} — find it in the Inactive tab`)}>
                              Remove from menu
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                {!selItem && <div style={{ fontSize: 12, color: "var(--gray)" }}>Nothing selected.</div>}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "availability" && (
        <div className="grid-3">
          {vItems.map((m) => (
            <div key={m.id} className="card">
              <div className="card-head">
                <div><span className="card-title" style={{ fontSize: 13 }}>{m.displayName}</span><span className="card-sub">{m.category} · {(m.venueIds || []).map((id) => venueName(id) || id).join(", ")}</span></div>
                {m.e86 ? <span className="pill pill-red">86’d</span> : m.available !== false ? <span className="pill pill-green">Available</span> : <span className="pill pill-amber">Hidden</span>}
              </div>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={m.available !== false && !m.e86} disabled={!canEdit || m.e86}
                  onChange={(e) => patchItem(m, { available: e.target.checked })} />
                Show on POS
              </label>
            </div>
          ))}
          {vItems.length === 0 && <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No items.</div>}
        </div>
      )}

      {tab === "e86" && (
        <>
          <div className="card" style={{ marginBottom: 16, background: e86List.length ? "#fef2f2" : undefined, borderColor: e86List.length ? "#fecaca" : undefined }}>
            <div style={{ fontSize: 12 }}><strong>{e86List.length} item{e86List.length === 1 ? "" : "s"} currently 86’d.</strong> 86’d items are hidden from POS until put back on the menu.</div>
          </div>
          {e86List.map((m) => (
            <div key={m.id} className="card" style={{ marginBottom: 10 }}>
              <div className="card-head">
                <div>
                  <span className="card-title" style={{ textDecoration: "line-through" }}>{m.displayName}</span>
                  <span className="card-sub">{m.e86Reason || "—"} · by {m.e86By || "—"}{m.e86At ? ` · ${fmtWhen(m.e86At)}` : ""} · back: {m.e86Back || "Unknown"}</span>
                </div>
                {canEdit && <button className="btn btn-primary btn-sm" onClick={() => remove86(m)}>Back on menu</button>}
              </div>
            </div>
          ))}
          {canEdit && (
            <div className="card" style={{ maxWidth: 560 }}>
              <div className="card-head"><span className="card-title">86 an item</span></div>
              <div className="grid-3" style={{ gap: 10 }}>
                <div><div className="form-label">Menu item</div>
                  <select className="form-input" value={e86Form.id} onChange={(e) => setE86Form((p) => ({ ...p, id: e.target.value }))}>
                    <option value="">Choose…</option>
                    {resolvedMenuItems.filter((m) => !m.e86).map((m) => <option key={m.templateId || m.id} value={m.templateId || m.id}>{m.displayName}</option>)}
                  </select></div>
                <div><div className="form-label">Reason</div>
                  <select className="form-input" value={e86Form.reason} onChange={(e) => setE86Form((p) => ({ ...p, reason: e.target.value }))}>
                    {E86_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select></div>
                <div><div className="form-label">Expected back</div>
                  <select className="form-input" value={e86Form.back} onChange={(e) => setE86Form((p) => ({ ...p, back: e.target.value }))}>
                    {E86_BACK.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select></div>
              </div>
              <div style={{ textAlign: "right", marginTop: 10 }}><button className="btn btn-primary btn-sm" onClick={conf86}>Add to 86 list</button></div>
            </div>
          )}
        </>
      )}

      {tab === "recipes" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div><span className="card-title">Recipe costing</span><span className="card-sub">Per-venue food cost (weighted-average) — POS sales deduct these exact quantities</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 12, color: "var(--gray)" }}>Cost at venue:</span>
                <select className="form-input" style={{ width: 160 }} value={recipeVenue} onChange={(e) => setRecipeVenue(e.target.value)}>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Menu item</th><th>Sell ex-GST</th><th>Food cost</th><th>Food cost %</th><th>Gross margin</th><th>Ingredients</th><th></th></tr></thead>
                <tbody>
                  {vItems.filter((m) => resolvedRecipeByMenuItemId[m.templateId || m.id]).map((m) => {
                    const r = resolvedRecipeByMenuItemId[m.templateId || m.id];
                    const fc = recipeFoodCost(r, itemById, recipeStockByItem);
                    // sell at the costing venue (instance-resolved), one venue base with fc.
                    const s = sellAtCostVenue(m);
                    const fcp = s > 0 ? Math.round((fc / s) * 100) : 0;
                    const mg = marginPct(s, fc);
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.displayName}</strong>{m._mode === "separate" && recipeSyncPill(m.recipeId, m.recipeSourceId)}</td>
                        <td>{money(s)}</td>
                        <td>{money(fc)}</td>
                        <td><span className="pill" style={{ background: "#f4f4f5", color: fcp > 40 ? "var(--red)" : "#d97706" }}>{fcp}%</span></td>
                        <td><span style={{ fontWeight: 600, color: marginColor(mg) }}>{mg}%</span></td>
                        <td style={{ fontSize: 12, color: "var(--gray)" }}>{(r.ingredients || []).map((g) => itemById[g.itemId]?.name?.split(" ")[0] || g.itemId).slice(0, 4).join(", ")}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {canEdit && <button className="btn btn-sm" onClick={() => openRecipe(m)}>Edit</button>}{" "}
                          {canEdit && <button className="btn btn-sm" disabled={!!selling} onClick={() => demoSell(m)}>{selling === m.id ? "Selling…" : "Demo sale"}</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Unlinked items</span><span className="card-sub">No recipe — POS sales of these will NOT deduct stock</span></div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {vItems.filter((m) => !resolvedRecipeByMenuItemId[m.templateId || m.id]).map((m) => (
                <span key={m.id} className="pill pill-amber" style={{ cursor: canEdit ? "pointer" : "default" }} onClick={() => canEdit && openRecipe(m)}>
                  {m.displayName} {canEdit ? "· link recipe" : ""}
                </span>
              ))}
              {vItems.every((m) => resolvedRecipeByMenuItemId[m.templateId || m.id]) && <span style={{ fontSize: 12, color: "var(--gray)" }}>Every item has a recipe. 🎉</span>}
            </div>
          </div>
        </>
      )}

      {tab === "modifiers" && (
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Modifier groups</span><span className="card-sub">Shared with POS Settings — attach to items in the item editor</span></div>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openMod(null)}>+ New group</button>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Group</th><th>Kind</th><th>Type</th><th>Required</th><th>Options</th><th>Attached items</th></tr></thead>
              <tbody>
                {modifierGroups.map((g) => {
                  const k = modGroupKind(g); // explicit kind, else name-prefix derivation
                  const kindLabel = (KIND_EDITOR.find(([kk]) => kk === k) || [])[1] || k;
                  return (
                  <tr key={g.id} onClick={() => canEdit && openMod(g)} style={{ cursor: canEdit ? "pointer" : "default" }}>
                    <td><strong>{g.name}</strong></td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_DOT_COLOR[k], display: "inline-block", marginRight: 5 }} />
                      {kindLabel}
                    </td>
                    <td>{g.type === "single" ? "Single-select" : "Multi-select"}</td>
                    <td>{g.required ? <span className="pill pill-red">Required</span> : <span className="pill">Optional</span>}</td>
                    {/* deltas shown inc-GST via money(incGst(…, true)) — assume-taxable,
                        the SAME basis as every POS delta render (gstApplicable !== false
                        defaults true; a shared group has no single item to consult) */}
                    <td style={{ fontSize: 12 }}>{(g.options || []).map((o) => o.priceDelta ? `${o.label} ${o.priceDelta > 0 ? "+" : "−"}${money(incGst(Math.abs(Number(o.priceDelta) || 0), true))}` : o.label).join(", ")}</td>
                    <td>{attachedCount(g)}</td>
                  </tr>
                  );
                })}
                {modifierGroups.length === 0 && <tr><td colSpan={6} style={{ color: "var(--gray)" }}>No modifier groups yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <>
          <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "var(--gray)" }}>Margins at venue:</span>
            <select className="form-input" style={{ width: 180 }} value={recipeVenue} onChange={(e) => setRecipeVenue(e.target.value)}>
              {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <span style={{ fontSize: 11, color: "var(--gray)" }}>· food cost uses this venue's per-venue costs</span>
          </div>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="card"><div className="card-sub">Avg sell (ex-GST)</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(pricing.avgSell)}</div></div>
            <div className="card"><div className="card-sub">Avg food cost</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(pricing.avgCost)} <span style={{ fontSize: 12, color: "var(--gray)" }}>{pricing.avgCostPct}%</span></div></div>
            <div className="card"><div className="card-sub">Avg margin (target 60%)</div><div style={{ fontSize: 22, fontWeight: 700, color: marginColor(pricing.avgMargin) }}>{pricing.avgMargin}%</div></div>
            <div className="card"><div className="card-sub">Below 35% margin</div><div style={{ fontSize: 22, fontWeight: 700, color: pricing.below35 ? "var(--red)" : "var(--ink)" }}>{pricing.below35}</div></div>
          </div>
          <div className="card">
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Item</th><th>Sell inc-GST</th><th>Sell ex-GST</th><th>Food cost</th><th>Margin</th><th>Gross profit</th><th></th></tr></thead>
                <tbody>
                  {vItems.map((m) => {
                    const fc = foodCostAtVenue(m);
                    // sell at the margin venue (instance-resolved), one venue base with fc.
                    const s = sellAtCostVenue(m);
                    const mg = marginPct(s, fc);
                    const gp = s - fc;
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.displayName}</strong></td>
                        <td>{money(incGst(s, m.gstApplicable !== false))}</td>
                        <td>{money(s)}{s !== (Number(m.sellPrice) || 0) ? <span style={{ fontSize: 11, color: "var(--gray)" }}> · venue</span> : null}</td>
                        <td>{money(fc)}</td>
                        <td><span style={{ fontWeight: 600, color: marginColor(mg) }}>{mg}%</span></td>
                        <td style={{ color: mg < 50 ? "var(--red)" : "var(--ink)", fontWeight: 600 }}>{money(gp)}</td>
                        <td>{canEdit && <button className="btn btn-sm" onClick={() => openItem(m)}>Edit price</button>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* menu item modal */}
      {editor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 620 }}>
            <div className="modal-head"><span className="modal-title">{editor.id ? "Edit menu item" : "New menu item"}</span><button className="modal-close" onClick={() => setEditor(null)}>✕</button></div>
            {/* modal tabs — LAYOUT ONLY: each tab renders the same section markup
                that used to stack vertically. Badges are read-only cues derived
                from existing state (.tab-badge = the app's brick primary). */}
            <div className="tabs" style={{ marginBottom: 10, flexWrap: "wrap" }}>
              {[
                ["basics", "Basics", null],
                ["pricing", "Pricing", editor.gstApplicable ? "GST" : null],
                ["venues", "Venues", editor.venueIds.length || null],
                ["modifiers", "Modifiers", editor.modifierGroupIds.length || null],
                ["sizes", "Sizes", editor.hasVariants ? "✓" : null],
                ["combo", "Combo", editor.isCombo ? "✓" : null],
              ].map(([t, label, badge]) => (
                <button key={t} className={`tab ${editorTab === t ? "active" : ""}`}
                  style={editorTab === t ? { color: "var(--red)" } : undefined}
                  onClick={() => setEditorTab(t)}>
                  {label}{badge != null && <span className="tab-badge">{badge}</span>}
                </button>
              ))}
            </div>
            {editorTab === "basics" && (
            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="form-label">Display name</div><input className="form-input" value={editor.displayName} onChange={(e) => setEditor((p) => ({ ...p, displayName: e.target.value }))} /></div>
              <div><div className="form-label">Kitchen name (dockets)</div><input className="form-input" value={editor.kitchenName} onChange={(e) => setEditor((p) => ({ ...p, kitchenName: e.target.value }))} /></div>
              <div><div className="form-label">Category</div>
                <select className="form-input" value={editor.category} onChange={(e) => setEditor((p) => ({ ...p, category: e.target.value }))}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><div className="form-label">POS ID</div><input className="form-input" value={editor.posId} onChange={(e) => setEditor((p) => ({ ...p, posId: e.target.value }))} /></div>
              <div><div className="form-label">Default station (seeds venues on add)</div>
                <input className="form-input" list="station-names" value={editor.defaultStationName} placeholder="e.g. Grill"
                  onChange={(e) => setEditor((p) => ({ ...p, defaultStationName: e.target.value }))} />
                <datalist id="station-names">{[...new Set(stations.map((s) => s.name))].map((n) => <option key={n} value={n} />)}</datalist>
              </div>
            </div>
            )}
            {editorTab === "pricing" && (<>
            <div className="grid-2" style={{ gap: 10 }}>
              <div>
                <div className="form-label">Sell price ex-GST ($)</div>
                <input className="form-input" type="number" step="0.01" value={editor.sellPrice} disabled={editor.hasVariants} onChange={(e) => setEditor((p) => ({ ...p, sellPrice: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>{editor.hasVariants ? "Set by the default variant below" : `= ${money(incGst(Number(editor.sellPrice) || 0, editor.gstApplicable))} inc-GST on the menu`}</div>
              </div>
              <div>
                <div className="form-label">Takeaway price ex-GST ($, blank = same)</div>
                <input className="form-input" type="number" step="0.01" placeholder="same as dine-in" value={editor.takeawayPrice} disabled={editor.hasVariants} onChange={(e) => setEditor((p) => ({ ...p, takeawayPrice: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>{editor.hasVariants ? "Set per variant below" : (editor.takeawayPrice === "" || editor.takeawayPrice == null ? "Uses the dine-in price" : `= ${money(incGst(Number(editor.takeawayPrice) || 0, editor.gstApplicable))} inc-GST takeaway`)}</div>
              </div>
              <div>
                <div className="form-label">Fallback food cost ex-GST ($)</div>
                <input className="form-input" type="number" step="0.01" value={editor.cost} onChange={(e) => setEditor((p) => ({ ...p, cost: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>Used only while no recipe is linked</div>
              </div>
            </div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, margin: "10px 0" }}>
              <input type="checkbox" checked={!!editor.gstApplicable} onChange={(e) => setEditor((p) => ({ ...p, gstApplicable: e.target.checked }))} /> GST applies (10%)
            </label>
            </>)}
            {editorTab === "venues" && (<>
            <div className="form-label">Venues</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              {venues.map((v) => (
                <label key={v.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={editor.venueIds.includes(v.id)}
                    onChange={(e) => setEditor((p) => ({ ...p, venueIds: e.target.checked ? [...p.venueIds, v.id] : p.venueIds.filter((x) => x !== v.id) }))} />
                  {v.name}
                </label>
              ))}
            </div>
            {/* Option A — per-venue price overrides (venuePrices). Blank = group sellPrice,
                same null-means-fallback convention as venueCost. Variants keep their own prices. */}
            {editor.venueIds.length > 0 && (<>
              <div className="form-label">Per-venue price overrides (ex-GST $ · blank = group price)</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                {venues.filter((v) => editor.venueIds.includes(v.id)).map((v) => (
                  <label key={v.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    {v.name}
                    <input className="form-input" style={{ width: 84 }} type="number" step="0.01" placeholder="group"
                      value={editor.venuePrices?.[v.id] ?? ""}
                      onChange={(e) => setEditor((p) => ({ ...p, venuePrices: { ...(p.venuePrices || {}), [v.id]: e.target.value } }))} />
                  </label>
                ))}
              </div>
            </>)}
            {/* template+instance: THIS venue's instance controls (price override,
                link/separate + recipe-provenance badge). Shown only for an existing
                item with a specific venue selected. */}
            {editor.id && selectedVenue !== "all" && (editor.inst ? (
              <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginBottom: 10 }}>
                <div className="form-label">
                  This venue — {selectedVenueName}
                  <span className="pill" style={{ marginLeft: 6, background: editor.inst.linked === false ? "#fef2f2" : "#eef2ff", color: editor.inst.linked === false ? "#a93226" : "#4338ca" }}>
                    {editor.inst.linked === false ? "separate copy" : "linked to template"}
                  </span>
                  {editor.inst.linked === false && recipeSyncPill(editor.inst.recipeId, editor.inst.recipeSourceId)}
                </div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                    Price override ex-GST ($)
                    <input className="form-input" style={{ width: 90 }} type="number" step="0.01" placeholder="inherit"
                      value={editor.instSellPrice}
                      onChange={(e) => setEditor((p) => ({ ...p, instSellPrice: e.target.value }))} />
                  </label>
                  {editor.inst.linked === false
                    ? <button className="btn btn-sm" onClick={() => makeLinked(editor.id)}>Re-link to template</button>
                    : <button className="btn btn-sm" onClick={() => makeSeparate(editor.id)}>Make separate copy</button>}
                </div>
                <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4 }}>
                  {editor.inst.linked === false
                    ? "Separate — this venue keeps its own values & recipe; template edits no longer flow here."
                    : "Linked — inherits the template; blank price = template price. Availability & 86 live on the tabs."}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10 }}>
                Not sold at {selectedVenueName} — use “+ Add items to venue” to add it.
              </div>
            ))}
            </>)}
            {editorTab === "modifiers" && (<>
            <div className="form-label">Modifier groups</div>
            {/* sectioned-by-kind picker (display only — what's SAVED is still
                editor.modifierGroupIds, the same array of ids as always) */}
            {(() => {
              const sel = editor.modifierGroupIds;
              const byId = Object.fromEntries(modifierGroups.map((g) => [g.id, g]));
              const query = modPickQ.trim().toLowerCase();
              const searching = query !== "";
              const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
              return (
                <div style={{ marginBottom: 10 }}>
                  {sel.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      {sel.map((id) => (
                        <span key={id} className="pill" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--gray-light)" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: KIND_DOT_COLOR[modGroupKind(byId[id])] || "#6b7280", display: "inline-block" }} />
                          {byId[id]?.name || `${id} (deleted)`}
                          <button title="Remove from this item" aria-label={`Remove ${byId[id]?.name || id}`}
                            style={{ border: "none", background: "transparent", cursor: "pointer", fontSize: 11, fontWeight: 800, color: "var(--gray)", padding: 0 }}
                            onClick={() => setEditor((p) => ({ ...p, modifierGroupIds: p.modifierGroupIds.filter((x) => x !== id) }))}>✕</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <input className="form-input" style={{ marginBottom: 6 }} placeholder="Search modifier groups…"
                    value={modPickQ} onChange={(e) => setModPickQ(e.target.value)} />
                  {KIND_SECTIONS.map(([k, title, sub]) => {
                    const all = modifierGroups.filter((g) => modGroupKind(g) === k).sort(byName);
                    if (all.length === 0) return null;
                    const hits = all.filter((g) => !query || String(g.name).toLowerCase().includes(query));
                    const nSel = all.filter((g) => sel.includes(g.id)).length;
                    // searching → sections with hits open, without hits closed;
                    // otherwise user toggle wins, else: selected-anywhere opens,
                    // and every kind but Removals (71 rows of noise) starts open
                    const open = searching ? hits.length > 0 : (modPickOpen[k] != null ? modPickOpen[k] : (nSel > 0 || k !== "remove"));
                    return (
                      <div key={k} style={{ borderTop: "0.5px solid var(--gray-light)", padding: "5px 0" }}>
                        <div onClick={() => setModPickOpen((p) => ({ ...p, [k]: !open }))}
                          style={{ cursor: "pointer", userSelect: "none", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, color: "var(--gray)" }}>{open ? "▾" : "▸"}</span>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_DOT_COLOR[k], display: "inline-block" }} />
                          {title} ({searching ? `${hits.length}/${all.length}` : all.length})
                          <span style={{ fontWeight: 400, color: "var(--gray)", fontSize: 11 }}>
                            {sub}{nSel > 0 ? ` · ${nSel} selected` : ""}
                          </span>
                        </div>
                        {open && (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6, paddingLeft: 18 }}>
                            {hits.map((g) => (
                              <label key={g.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                                <input type="checkbox" checked={editor.modifierGroupIds.includes(g.id)}
                                  onChange={(e) => setEditor((p) => ({ ...p, modifierGroupIds: e.target.checked ? [...p.modifierGroupIds, g.id] : p.modifierGroupIds.filter((x) => x !== g.id) }))} />
                                <span style={{ width: 7, height: 7, borderRadius: "50%", background: KIND_DOT_COLOR[k], display: "inline-block" }} />
                                {g.name} <span style={{ color: "var(--gray)", fontSize: 11 }}>{(g.options || []).length} options</span>
                              </label>
                            ))}
                            {hits.length === 0 && <span style={{ fontSize: 12, color: "var(--gray)" }}>No matches.</span>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {modifierGroups.length === 0 && <span style={{ fontSize: 12, color: "var(--gray)" }}>None yet.</span>}
                </div>
              );
            })()}
            </>)}

            {/* Variants (sizes) */}
            {editorTab === "sizes" && (
            <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={!!editor.hasVariants}
                  onChange={(e) => setEditor((p) => ({
                    ...p, hasVariants: e.target.checked,
                    variants: e.target.checked && !(p.variants || []).length
                      ? [{ label: "", sellPrice: p.sellPrice ?? "", takeawayPrice: "", posId: p.posId || "", isDefault: true, available: true }]
                      : p.variants,
                  }))} />
                This item has size variants (e.g. Regular / Large / Jumbo)
              </label>
              {editor.hasVariants && (
                <div style={{ marginTop: 8 }}>
                  <div className="form-label">Variant group name</div>
                  <input className="form-input" style={{ maxWidth: 260 }} placeholder="e.g. Coffee Size" value={editor.variantGroupName}
                    onChange={(e) => setEditor((p) => ({ ...p, variantGroupName: e.target.value }))} />
                  <div style={{ overflowX: "auto", marginTop: 8 }}>
                    <table className="data-table">
                      <thead><tr><th>Default</th><th>Label</th><th>Sell ex-GST</th><th>Takeaway ex-GST</th><th>POS ID</th><th>Avail</th><th></th></tr></thead>
                      <tbody>
                        {(editor.variants || []).map((v, i) => (
                          <tr key={i}>
                            <td><input type="radio" name="rg-variant-default" checked={!!v.isDefault}
                              onChange={() => setEditor((p) => ({ ...p, variants: p.variants.map((x, j) => ({ ...x, isDefault: j === i })) }))} /></td>
                            <td><input className="form-input" style={{ width: 120 }} value={v.label}
                              onChange={(e) => setEditor((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} /></td>
                            <td><input className="form-input" style={{ width: 90 }} type="number" step="0.01" value={v.sellPrice}
                              onChange={(e) => setEditor((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, sellPrice: e.target.value } : x)) }))} /></td>
                            <td><input className="form-input" style={{ width: 90 }} type="number" step="0.01" placeholder="same" value={v.takeawayPrice}
                              onChange={(e) => setEditor((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, takeawayPrice: e.target.value } : x)) }))} /></td>
                            <td><input className="form-input" style={{ width: 72 }} value={v.posId}
                              onChange={(e) => setEditor((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, posId: e.target.value } : x)) }))} /></td>
                            <td><input type="checkbox" checked={v.available !== false}
                              onChange={(e) => setEditor((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, available: e.target.checked } : x)) }))} /></td>
                            <td><button className="btn btn-sm" onClick={() => setEditor((p) => {
                              let variants = p.variants.filter((_, j) => j !== i);
                              if (variants.length && !variants.some((x) => x.isDefault)) variants = variants.map((x, j) => ({ ...x, isDefault: j === 0 }));
                              return { ...p, variants };
                            })}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setEditor((p) => ({ ...p, variants: [...(p.variants || []), { label: "", sellPrice: "", takeawayPrice: "", posId: "", isDefault: !(p.variants || []).length, available: true }] }))}>+ Add variant</button>
                  <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4 }}>The <strong>default</strong> variant sets the item's headline price. Takeaway blank = same as that variant's dine-in price.</div>
                </div>
              )}
            </div>
            )}

            {/* Combo / set meal */}
            {editorTab === "combo" && (
            <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 10 }}>
              <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <input type="checkbox" checked={!!editor.isCombo}
                  onChange={(e) => setEditor((p) => ({
                    ...p, isCombo: e.target.checked,
                    comboGroups: e.target.checked && !(p.comboGroups || []).length
                      ? [{ name: "", maxChoice: 1, optional: false, options: [] }]
                      : p.comboGroups,
                  }))} />
                This item is a combo / set meal (pick components from other items)
              </label>
              {editor.isCombo && (
                <div style={{ marginTop: 8 }}>
                  {(editor.comboGroups || []).map((g, gi) => (
                    <div key={gi} className="card" style={{ marginBottom: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                        <input className="form-input" style={{ flex: 1, minWidth: 160 }} placeholder="Group name (e.g. Choose a drink)" value={g.name}
                          onChange={(e) => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, name: e.target.value } : x)) }))} />
                        <label style={{ fontSize: 11, color: "var(--gray)", display: "flex", alignItems: "center", gap: 4 }}>max
                          <input className="form-input" style={{ width: 60 }} type="number" step="1" placeholder="∞" value={g.maxChoice ?? ""}
                            onChange={(e) => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, maxChoice: e.target.value } : x)) }))} /></label>
                        <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="checkbox" checked={!!g.optional}
                            onChange={(e) => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, optional: e.target.checked } : x)) }))} /> optional</label>
                        <button className="btn btn-sm" onClick={() => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.filter((_, j) => j !== gi) }))}>✕ group</button>
                      </div>
                      {(g.options || []).map((o, oi) => (
                        <div key={oi} style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                          <select className="form-input" style={{ flex: 1 }} value={o.menuItemId}
                            onChange={(e) => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, menuItemId: e.target.value } : y)) } : x)) }))}>
                            <option value="">Choose item…</option>
                            {menuItems.filter((mi) => mi.id !== editor.id && !mi.isCombo).map((mi) => <option key={mi.id} value={mi.id}>{mi.displayName}</option>)}
                          </select>
                          <input className="form-input" style={{ width: 90 }} type="number" step="0.01" placeholder="+$ ex" value={o.priceDelta}
                            onChange={(e) => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, options: x.options.map((y, k) => (k === oi ? { ...y, priceDelta: e.target.value } : y)) } : x)) }))} />
                          <button className="btn btn-sm" onClick={() => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, options: x.options.filter((_, k) => k !== oi) } : x)) }))}>✕</button>
                        </div>
                      ))}
                      <button className="btn btn-sm" onClick={() => setEditor((p) => ({ ...p, comboGroups: p.comboGroups.map((x, j) => (j === gi ? { ...x, options: [...(x.options || []), { menuItemId: "", priceDelta: 0 }] } : x)) }))}>+ Add option</button>
                    </div>
                  ))}
                  <button className="btn btn-sm" onClick={() => setEditor((p) => ({ ...p, comboGroups: [...(p.comboGroups || []), { name: "", maxChoice: 1, optional: false, options: [] }] }))}>+ Add combo group</button>
                  <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 4 }}>Component price deltas are ex-GST and add to the combo's base sell price.</div>
                </div>
              )}
            </div>
            )}

            {/* footer — OUTSIDE the tabs: always visible, unchanged saveItem */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveItem}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* clone-to-venue modal — bulk "Add items to a venue" (select-all default,
          per-item deselect; existing instances shown as already-added, never overwritten) */}
      {/* Job 9 — copy settings from another venue (confirm-with-counts; overwrites) */}
      {copySettings && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && !copySettings.busy && setCopySettings(null)}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><span className="modal-title">Copy settings to {selectedVenueName}</span><button className="modal-close" onClick={() => !copySettings.busy && setCopySettings(null)}>✕</button></div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10 }}>
              Copies settings for items BOTH venues sell — it never adds items, and never touches 86 or removed state.
            </div>
            <div className="form-label">Copy from</div>
            <select className="form-input" style={{ width: "100%", marginBottom: 10 }} value={copySettings.srcVid} onChange={(e) => loadCopySettingsSource(e.target.value)}>
              <option value="">Choose venue…</option>
              {venues.filter((v) => v.id !== selectedVenue).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {[["prices", "Prices (dine-in, takeaway, variant prices)"], ["stations", "Stations (matched by name — no match = skipped)"], ["prep", "Prep times"], ["mods", "Modifier attachments (venue overrides)"]].map(([k, label]) => (
              <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", cursor: "pointer", fontSize: 13 }}>
                <input type="checkbox" checked={copySettings.opts[k]} onChange={(e) => setCopySettings((p) => ({ ...p, opts: { ...p.opts, [k]: e.target.checked } }))} />
                {label}
              </label>
            ))}
            <div style={{ fontSize: 12, marginTop: 10, padding: "8px 10px", background: "#fffbeb", borderRadius: 8, color: "#92400e" }}>
              {!copySettings.srcVid ? "Pick a source venue to see what would change."
                : !copySettings.srcInsts ? "Loading source menu…"
                : !copyPlan || !copyPlan.writes.length ? "Nothing to copy — no overlapping items with the chosen settings."
                : <>This <strong>overwrites</strong> settings on <strong>{copyPlan.writes.length}</strong> item{copyPlan.writes.length === 1 ? "" : "s"} both venues sell.
                    {copyPlan.stationSkips ? <> {copyPlan.stationSkips} station assignment{copyPlan.stationSkips === 1 ? "" : "s"} will be skipped (no station with that name at {selectedVenueName}).</> : null}
                    {copyPlan.removedSkipped ? <> {copyPlan.removedSkipped} removed item{copyPlan.removedSkipped === 1 ? " stays" : "s stay"} untouched in Inactive.</> : null}</>}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" disabled={!copyPlan || !copyPlan.writes.length || copySettings.busy} onClick={applyCopySettings}>
                {copySettings.busy ? "Copying…" : copyPlan && copyPlan.writes.length ? `Copy to ${copyPlan.writes.length} item${copyPlan.writes.length === 1 ? "" : "s"}` : "Copy"}
              </button>
              <button className="btn" onClick={() => !copySettings.busy && setCopySettings(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {cloneModal && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && !cloneModal.busy && setCloneModal(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">Add items to a venue</span><button className="modal-close" onClick={() => setCloneModal(null)}>✕</button></div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <div className="form-label" style={{ margin: 0 }}>Venue</div>
              <select className="form-input" style={{ width: 180 }} value={cloneModal.venueId}
                onChange={(e) => loadCloneVenue(e.target.value).catch(() => showToast("Could not load venue menu"))}>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <button className="btn btn-sm" onClick={() => setCloneModal((p) => ({ ...p, selected: Object.fromEntries(menuItems.filter((t) => !p.existing.has(t.id)).map((t) => [t.id, true])) }))}>Select all</button>
              <button className="btn btn-sm" onClick={() => setCloneModal((p) => ({ ...p, selected: {} }))}>None</button>
            </div>
            <div style={{ maxHeight: 340, overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: 8, padding: 8 }}>
              {menuItems.slice().sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")).map((t) => {
                const already = cloneModal.existing.has(t.id);
                return (
                  <label key={t.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, padding: "3px 2px", opacity: already ? 0.5 : 1 }}>
                    <input type="checkbox" disabled={already} checked={already || !!cloneModal.selected[t.id]}
                      onChange={(e) => setCloneModal((p) => ({ ...p, selected: { ...p.selected, [t.id]: e.target.checked } }))} />
                    {t.displayName} <span style={{ color: "var(--gray)" }}>· {t.category}</span>
                    {already && <span className="pill" style={{ marginLeft: "auto", background: "#f4f4f5", color: "var(--gray)" }}>already added</span>}
                  </label>
                );
              })}
              {menuItems.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No templates yet.</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
              <span style={{ fontSize: 12, color: "var(--gray)" }}>
                {Object.values(cloneModal.selected).filter(Boolean).length} to add · {cloneModal.existing.size} already at {venueName(cloneModal.venueId) || "venue"}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm" disabled={cloneModal.busy} onClick={() => setCloneModal(null)}>Cancel</button>
                <button className="btn btn-primary btn-sm" disabled={cloneModal.busy} onClick={confirmClone}>{cloneModal.busy ? "Adding…" : "Add to venue"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* recipe modal */}
      {recEditor && recMenuItem && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setRecEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 600 }}>
            <div className="modal-head"><span className="modal-title">Recipe — {recMenuItem.displayName}</span><button className="modal-close" onClick={() => setRecEditor(null)}>✕</button></div>
            {recEditor.ingredients.map((g, i) => {
              const inv = itemById[g.itemId];
              const lc = inv ? grossStockQty(g, inv) * venueCost(inv, recipeStockByItem[g.itemId]) : 0; // gross × this venue's cost
              const ru = g.recipeUnit || recipeUnitOf(g.itemId);
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <select className="form-input" style={{ flex: 1 }} value={g.itemId}
                    onChange={(e) => setRecEditor((p) => ({ ...p, ingredients: p.ingredients.map((x, j) => (j === i ? { ...x, itemId: e.target.value, recipeUnit: recipeUnitOf(e.target.value) } : x)) }))}>
                    <option value="">Choose ingredient…</option>
                    {inventoryItems.filter((x) => !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name} ({x.recipeUnit || x.unit} · {money(x.cost)})</option>)}
                  </select>
                  <input className="form-input" style={{ width: 90 }} type="number" step="0.001" value={g.netQty} placeholder="net qty"
                    onChange={(e) => setRecEditor((p) => ({ ...p, ingredients: p.ingredients.map((x, j) => (j === i ? { ...x, netQty: e.target.value } : x)) }))} />
                  <span style={{ fontSize: 11, color: "var(--gray)", width: 44 }}>{ru}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, width: 60, textAlign: "right" }}>{money(lc)}</span>
                  <button className="btn btn-sm" onClick={() => setRecEditor((p) => ({ ...p, ingredients: p.ingredients.filter((_, j) => j !== i) }))}>✕</button>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: "var(--gray)", margin: "2px 0 8px" }}>Enter the <strong>net</strong> amount in the item's recipe unit; stock deducts the gross (after yield).</div>
            <button className="btn btn-sm" onClick={() => setRecEditor((p) => ({ ...p, ingredients: [...p.ingredients, { itemId: "", netQty: "", recipeUnit: "" }] }))}>+ Add ingredient</button>
            <div style={{ borderTop: "0.5px solid var(--border)", marginTop: 12, paddingTop: 10, fontSize: 13 }}>
              {/* sell at the costing venue (instance-resolved), matching recCost's venue base. */}
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total food cost</span><strong>{money(recCost)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Sell price (ex-GST)</span><strong>{money(sellAtCostVenue(recMenuItem))}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Gross margin</span>
                <strong style={{ color: marginColor(marginPct(sellAtCostVenue(recMenuItem), recCost)) }}>
                  {money(sellAtCostVenue(recMenuItem) - recCost)} — {marginPct(sellAtCostVenue(recMenuItem), recCost)}%
                </strong>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setRecEditor(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveRecipe}>Save recipe</button>
            </div>
          </div>
        </div>
      )}

      {/* modifier group modal */}
      {modForm && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModForm(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">{modForm.id ? "Edit modifier group" : "New modifier group"}</span><button className="modal-close" onClick={() => setModForm(null)}>✕</button></div>
            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="form-label">Group name</div><input className="form-input" value={modForm.name} onChange={(e) => setModForm((p) => ({ ...p, name: e.target.value }))} /></div>
              {/* KIND — group-level semantic category. Selecting a kind changes
                  ONLY modForm.kind; the template hint below SUGGESTS matching
                  selection rules and applies them only via its button. */}
              {(() => {
                const tpl = MOD_KIND_DEFAULTS[modForm.kind] || null;
                const row = KIND_EDITOR.find(([k]) => k === modForm.kind);
                const mismatch = tpl && (modForm.type !== tpl.type || !!modForm.required !== tpl.required);
                return (
                  <div style={{ marginTop: 8 }}>
                    <div className="form-label">Kind</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {KIND_EDITOR.map(([k, label, hint]) => (
                        <label key={k} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: canEdit ? "pointer" : "default" }}>
                          <input type="radio" name="mod-kind" disabled={!canEdit} checked={modForm.kind === k}
                            onChange={() => setModForm((p) => ({ ...p, kind: k }))} />
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: KIND_DOT_COLOR[k], display: "inline-block" }} />
                          <strong>{label}</strong>
                          <span style={{ color: "var(--gray)", fontSize: 11 }}>— {hint}</span>
                        </label>
                      ))}
                    </div>
                    {mismatch && canEdit && (
                      <div style={{ fontSize: 11, color: "var(--gray)", background: "var(--gray-light)", borderRadius: 8, padding: "6px 8px", marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>
                          {row ? row[1] : modForm.kind} groups are usually {tpl.type === "single" ? "single-select" : "multi-select"} and {tpl.required ? "required" : "optional"}.
                        </span>
                        <button className="btn btn-sm" onClick={applyKindDefaults}>Apply these</button>
                      </div>
                    )}
                  </div>
                );
              })()}
              <div><div className="form-label">Type</div>
                <select className="form-input" value={modForm.type} onChange={(e) => setModForm((p) => ({ ...p, type: e.target.value }))}>
                  <option value="multi">Multi-select</option>
                  <option value="single">Single-select</option>
                </select></div>
              <div><div className="form-label">Printer</div>
                <select className="form-input" value={modForm.printer} onChange={(e) => setModForm((p) => ({ ...p, printer: e.target.value }))}>
                  <option value="kitchen">Kitchen</option>
                  <option value="bar">Bar</option>
                  <option value="receipt">Receipt only</option>
                </select></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  <input type="checkbox" checked={!!modForm.required} onChange={(e) => setModForm((p) => ({ ...p, required: e.target.checked, minSelections: e.target.checked ? Math.max(1, Number(p.minSelections) || 0) : p.minSelections }))} /> Required
                </label>
              </div>
            </div>
            <div className="form-label" style={{ marginTop: 10 }}>Options (price delta in $, negative allowed)</div>
            {modForm.options.map((o, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <input className="form-input" style={{ flex: 1 }} placeholder="Label" value={o.label}
                  onChange={(e) => setModForm((p) => ({ ...p, options: p.options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))} />
                <input className="form-input" style={{ width: 90 }} type="number" step="0.5" value={o.priceDelta}
                  onChange={(e) => setModForm((p) => ({ ...p, options: p.options.map((x, j) => (j === i ? { ...x, priceDelta: e.target.value } : x)) }))} />
                <button className="btn btn-sm" onClick={() => setModForm((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}>✕</button>
              </div>
            ))}
            <button className="btn btn-sm" onClick={() => setModForm((p) => ({ ...p, options: [...p.options, { label: "", priceDelta: 0 }] }))}>+ Add option</button>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setModForm(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveMod}>Save</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
