import React, { useEffect, useMemo, useState } from "react";
import { useRG } from "./RGContext";
import { sellOrder } from "./sellOrder";
import { money, incGst, resolvedSellPrice, DEFAULT_MENU_CATEGORIES, resolvePosNotePresets, pinnedFirst, modGroupKind } from "./rgStockUtils";
import "./PosPage.css";

/* POS Terminal — Phase 2 (order-entry grid + modifier modal + service-mode + send).
 * Payment + discounts are NOT here (no discount model exists yet — verified).
 * Route-gated by the `pos` permission (view — staff default); the SALE itself is
 * authorised server-side by rgSellOrder (stock OR pos permission, fail-closed) —
 * a denied sale surfaces the server's error toast here.
 * Rail prices are CLIENT-ESTIMATES: the server re-prices every line + modifier
 * authoritatively (instance.sellPrice → legacy venuePrices → template; modifier
 * deltas from _optionPrices → group priceDelta — labels only are sent, never
 * client deltas). Selection rules (single/required/min/max) are enforced HERE —
 * the server prices whatever labels arrive and does NOT validate selections. */
const MAX_LINES = 50; // rgSellOrder hard limit ("Too many lines (max 50)")
const MAX_QTY = 999; // server rejects qty > 1000 for the WHOLE call — cap below it
const MAX_MODS = 20; // server prices only the first 20 modifiers per line
const SERVICE_MODES = ["dinein", "takeaway", "delivery", "pickup"]; // rgSellOrder whitelist
const MODE_LABEL = { dinein: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", pickup: "Pickup" };

// Display delta for one option — MIRRORS the server lookup (index.js modifier loop):
// instance _optionPrices[gid][label] (numeric) first, else the group option's priceDelta.
const optionDelta = (m, gid, group, label) => {
  const ovp = m?._optionPrices?.[gid];
  if (ovp && ovp[label] != null && !isNaN(Number(ovp[label]))) return Number(ovp[label]);
  const opt = (group?.options || []).find((o) => o && o.label === label);
  return Number(opt?.priceDelta) || 0;
};
// per-group minimum picks: required forces ≥1 even if minSelections is 0
const minFor = (g) => (g.required ? Math.max(1, Number(g.minSelections) || 0) : (Number(g.minSelections) || 0));
// one rail line per item+modifier-combination
const lineKeyOf = (id, mods) => `${id}|${(mods || []).map((x) => x.label).slice().sort().join("+")}`;
// an item's browse bucket — items with no category land in "Uncategorised" so
// they stay reachable now that the category-first flow has no "All" view
const catOf = (m) => m?.category || "Uncategorised";

// ── modifier DISPLAY treatment by GROUP KIND (COSMETIC ONLY — the payload
// always carries the FULL STORED LABEL; rgSellOrder prices by exact-label
// match, so nothing below may ever touch what gets sent). The kind comes from
// modGroupKind(group): explicit group.kind when seeded, else derived from the
// name prefix — correct on both the seeded test group and the unseeded live one.
// Verbs: prep is "Set / ✓ Set" (not Set/Set — text alone couldn't show state,
// so the selected form carries the check plus the filled style); choose is
// "Choose / ✓ Chosen" for the same reason all selected states carry the check.
const KIND_VERBS = {
  add:    ["Add", "✓ Added"],
  remove: ["Remove", "✓ Removed"],
  swap:   ["Swap", "✓ Swapped"],
  prep:   ["Set", "✓ Set"],
  choose: ["Choose", "✓ Chosen"],
};
const KIND_SUMMARY = [ // summary container order + uppercase labels (class = pos-sumbox--<kind>)
  ["add", "ADD"],
  ["swap", "INSTEAD"],
  ["remove", "NO"],
  ["prep", "PREP"],
  ["choose", "CHOOSE"],
];
// display-only stripping by kind: "Add Bacon"→"Bacon", "No Lettuce"→"Lettuce",
// "Grilled Chicken Instead"→"Grilled Chicken"; prep/choose labels are already clean
const displayLabel = (label, kind) => {
  const s = String(label || "").trim();
  let out = s;
  if (kind === "add") out = s.replace(/^add\s+/i, "");
  else if (kind === "remove") out = s.replace(/^no\s+/i, "");
  else if (kind === "swap") out = s.replace(/\s+instead$/i, "");
  out = out.trim();
  return out || s;
};

// kitchen note = selected preset chips + free text, composed into ONE string for
// the line's `notes` (server trims + caps at 200; we pre-cap to match)
const composeNote = (presets, free) => [...(presets || []), String(free || "").trim()].filter(Boolean).join(" · ").slice(0, 200);
// split a stored note back into { sel: presets it contains, free: the rest } —
// used to preload the rail line editor and the Modify flow
const splitNote = (notes, presetList) => {
  const parts = String(notes || "").split(" · ").map((s) => s.trim()).filter(Boolean);
  return {
    sel: parts.filter((p) => presetList.includes(p)),
    free: parts.filter((p) => !presetList.includes(p)).join(" · "),
  };
};

// ── tile avatar (DISPLAY ONLY — no behaviour) ─────────────────────────────
// initials: first letter of the first two words of displayName, uppercased.
const initialsOf = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
// fixed tint pairs — pale bg + a DARK shade of the SAME hue (never black/grey).
// The pair is picked by hashing the item id, so the same item always renders
// the same colour on every device and every render.
const TILE_TINTS = [
  { bg: "#F7DCFA", fg: "#7A1486" }, // violet
  { bg: "#FCE7F3", fg: "#9D174D" }, // pink
  { bg: "#FFEDD5", fg: "#9A3412" }, // orange
  { bg: "#FEF3C7", fg: "#92400E" }, // amber
  { bg: "#DCFCE7", fg: "#166534" }, // green
  { bg: "#CCFBF1", fg: "#115E59" }, // teal
  { bg: "#DBEAFE", fg: "#1E40AF" }, // blue
  { bg: "#E0E7FF", fg: "#3730A3" }, // indigo
];
const tintOf = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_TINTS[h % TILE_TINTS.length];
};

export default function PosPage() {
  const {
    groupId, group, menuItems, resolvedMenuItems, menuInstanceById, modifierGroups,
    selectedVenue, selectedVenueName, showToast, myStaff, me,
  } = useRG();
  const categories = group?.menuCategories?.length ? group.menuCategories : DEFAULT_MENU_CATEGORIES;

  // category-first flow: cat === null → SCREEN A (category grid, the POS opens
  // here); cat set → SCREEN B (that category's item grid). There is no "All"
  // browse anymore; cross-category reach is the search-all fallback below.
  const [cat, setCat] = useState(null);
  const [q, setQ] = useState(""); // screen A: filters categories · screen B: filters items in the category
  const [searchAll, setSearchAll] = useState(false); // screen B fallback: run the query across ALL items
  const [lines, setLines] = useState([]); // [{ key, menuItemId, displayName, qty, unitPrice, modifiers:[{label,priceDelta}], modDelta }]
  const [serviceMode, setServiceMode] = useState("dinein");
  const [sending, setSending] = useState(false);
  const [modModal, setModModal] = useState(null); // { item, sel:{[gid]:[labels]}, gid, q, qty, note, notePresets[], editKey }
  const [editSheet, setEditSheet] = useState(null); // { key, presets: [], free: "" } — rail line editor
  const notePresetList = resolvePosNotePresets(group); // global tap-to-add kitchen notes (Settings)

  // WHO is taking the order — on the admin web app everyone signs in with their
  // OWN account, so the login IS the identity: no name+PIN gate here (that gate
  // lives on the shared-device Ops iPad POS). Orders are attributed to the
  // logged-in user's staff profile (myStaff, resolved by adminUid/email); the
  // server validates the id and stamps staffId/staffName on the order doc,
  // feeding the per-staff sales figures on the Performance page.
  // Sell rule: an operator (linked staff doc) always sells attributed. An OWNER
  // or STORE ADMIN with no staff doc sells DELIBERATELY UNATTRIBUTED (no staff
  // key; orderMeta.soldByRole marks it as an intentional admin sale). A
  // staff-role login with no staff doc stays BLOCKED — that's a setup error;
  // their sales must attribute to them.
  const operator = myStaff || null;
  // same tier test the server's isAdminTier uses (owner|storeAdmin) — the
  // canPayroll idiom from StaffDirectoryPage, not a new predicate
  const adminSeller = !operator && ["owner", "storeAdmin"].includes(me?.groupRole);
  const canSend = !!operator || adminSeller;

  // the ONE shared price resolver (rgStockUtils) — same value the server charges
  const sellAt = (m) => resolvedSellPrice(m, { menuInstanceById, menuItems, selectedVenue });

  // item tiles (SCREEN B). The search predicate is UNCHANGED — case-insensitive
  // substring on displayName + kitchenName; only the pool it runs over follows
  // the category-first flow now. Pinned items (group.posItemOrder — read-time
  // only, the POS never writes it) lead within the category, rest alphabetical;
  // an absent list is today's pure-alphabetical behaviour.
  const tiles = useMemo(() => {
    if (cat == null) return []; // screen A shows categories, not items
    const query = q.trim().toLowerCase();
    const matches = (m) => !query
      || (m.displayName || "").toLowerCase().includes(query)
      || (m.kitchenName || "").toLowerCase().includes(query);
    if (searchAll && query) {
      // fallback: same query across ALL items — plain alphabetical, mixed
      // categories (each tile carries its category label in this mode)
      return resolvedMenuItems.filter(matches)
        .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
    }
    return pinnedFirst(
      resolvedMenuItems.filter((m) => catOf(m) === cat).filter(matches),
      group?.posItemOrder?.[cat],
      (m) => m.templateId || m.id,
      (m) => m.displayName || ""
    );
  }, [resolvedMenuItems, cat, q, searchAll, group]);
  // the EXISTING category source of truth (group.menuCategories → defaults),
  // filtered to categories that have items — plus any stray item-borne
  // categories appended, so no item is unreachable now that "All" is gone.
  const liveCats = useMemo(() => {
    const configured = categories.filter((c) => resolvedMenuItems.some((m) => catOf(m) === c));
    const stray = [...new Set(resolvedMenuItems.map(catOf))]
      .filter((c) => !categories.includes(c))
      .sort((a, b) => a.localeCompare(b));
    return [...configured, ...stray];
  }, [categories, resolvedMenuItems]);
  // pinned categories lead (group.posCategoryOrder — read-time only), rest alphabetical
  const orderedCats = useMemo(
    () => pinnedFirst(liveCats, group?.posCategoryOrder, (c) => c, (c) => c),
    [liveCats, group]
  );
  const pinnedCatSet = useMemo(
    () => new Set((Array.isArray(group?.posCategoryOrder) ? group.posCategoryOrder : []).map(String)),
    [group]
  );
  const catCounts = useMemo(() => {
    const mp = {};
    resolvedMenuItems.forEach((m) => { const c = catOf(m); mp[c] = (mp[c] || 0) + 1; });
    return mp;
  }, [resolvedMenuItems]);
  // SCREEN A tiles: search filters the CATEGORY GRID (substring on the name)
  const catQuery = q.trim().toLowerCase();
  const catTiles = cat == null ? orderedCats.filter((c) => !catQuery || c.toLowerCase().includes(catQuery)) : [];
  const openCat = (c) => { setCat(c); setQ(""); setSearchAll(false); };
  const backToCats = () => { setCat(null); setQ(""); setSearchAll(false); };

  // inc-GST estimate of what the server will charge: rgSellOrder taxes the WHOLE
  // line (unit + modifier deltas) by the item's gstApplicable, so incGst per line
  // then × qty mirrors its subtotal + gst exactly (to rounding).
  const total = lines.reduce((s, l) => s + l.qty * incGst(l.unitPrice + l.modDelta, l.gstApplicable !== false), 0);
  // DISPLAY-ONLY breakdown rows: ex-GST sum of the same line values, and GST as
  // the difference from the untouched inc-GST total — no new tax math introduced.
  const subtotalEx = lines.reduce((s, l) => s + l.qty * (l.unitPrice + l.modDelta), 0);
  const gstEst = total - subtotalEx;

  // opts = { qty, note } — both optional. qty N goes through the SAME merge/create
  // branch as N single taps (so modal-qty ≡ tapping the tile N times); the note
  // rides in the key so "same item+mods, different note" stays its own rail line.
  const pushLine = (m, mods, opts = {}) => {
    const id = m.templateId || m.id;
    const modDelta = (mods || []).reduce((s, x) => s + x.priceDelta, 0);
    const note = String(opts.note || "").trim().slice(0, 200);
    const n = Math.max(1, Math.min(MAX_QTY, Number(opts.qty) || 1));
    const key = `${lineKeyOf(id, mods)}${note ? `|n:${note}` : ""}`;
    setLines((prev) => {
      const ex = prev.find((l) => l.key === key);
      if (ex) {
        if (ex.qty >= MAX_QTY) { showToast(`Max ${MAX_QTY} per line`); return prev; }
        return prev.map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + n) } : l));
      }
      if (prev.length >= MAX_LINES) { showToast(`Max ${MAX_LINES} lines per order (server limit)`); return prev; }
      // gstApplicable rides on the rail line so chips can show inc-GST deltas like the tiles
      return [...prev, { key, menuItemId: id, displayName: m.displayName || id, qty: n, unitPrice: sellAt(m), modifiers: mods || [], modDelta, gstApplicable: m.gstApplicable !== false, ...(note ? { notes: note } : {}) }];
    });
  };
  // rail editor "Modify" flow: swap one line's config in place (same shape as
  // pushLine); if the new config equals another existing line, merge into it
  // instead of leaving two lines with the same key.
  const replaceLine = (oldKey, m, mods, opts = {}) => {
    const id = m.templateId || m.id;
    const modDelta = (mods || []).reduce((s, x) => s + x.priceDelta, 0);
    const note = String(opts.note || "").trim().slice(0, 200);
    const n = Math.max(1, Math.min(MAX_QTY, Number(opts.qty) || 1));
    const key = `${lineKeyOf(id, mods)}${note ? `|n:${note}` : ""}`;
    setLines((prev) => {
      const idx = prev.findIndex((l) => l.key === oldKey);
      if (idx === -1) return prev;
      const twin = prev.find((l) => l.key === key && l.key !== oldKey);
      if (twin) {
        return prev.filter((l) => l.key !== oldKey)
          .map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + n) } : l));
      }
      const next = [...prev];
      next[idx] = { key, menuItemId: id, displayName: m.displayName || id, qty: n, unitPrice: sellAt(m), modifiers: mods || [], modDelta, gstApplicable: m.gstApplicable !== false, ...(note ? { notes: note } : {}) };
      return next;
    });
  };
  const tapTile = (m) => {
    if (m.e86 || m.available === false) return;
    // items with RESOLVED modifier groups open the modal; others add straight to
    // the rail — the ONE-TAP fast path for no-modifier items is unchanged (notes
    // for those are added afterwards via the rail line editor).
    const gids = (m.modifierGroupIds || []).filter((gid) => modifierGroups.some((g) => g.id === gid));
    if (gids.length) setModModal({ item: m, sel: {}, gid: null, q: "", qty: 1, note: "", notePresets: [], editKey: null });
    else pushLine(m, []);
  };
  const bump = (key, d) => setLines((prev) => prev
    .map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + d) } : l))
    .filter((l) => l.qty > 0));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));
  // rail editor: update one line's note in place. The key is NOT recomputed on a
  // note edit (stable React identity while the sheet is open); key-borne notes
  // only matter for merge-on-add, which this path never does.
  const setLineNote = (key, note) => setLines((prev) => prev.map((l) => {
    if (l.key !== key) return l;
    const { notes: _drop, ...rest } = l;
    const v = String(note || "").trim().slice(0, 200);
    return v ? { ...rest, notes: v } : rest;
  }));
  const editLine = editSheet ? lines.find((l) => l.key === editSheet.key) : null;
  useEffect(() => { // line stepped to zero / removed while the sheet is open → close it
    if (editSheet && !lines.some((l) => l.key === editSheet.key)) setEditSheet(null);
  }, [lines, editSheet]);
  // "Modify" — reopen the two-pane picker with the line's EXISTING selections
  // preloaded (rebuilt from its stored FULL labels; first group carrying the
  // label wins, mirroring the server's pricing lookup order).
  const openModify = (l) => {
    const mi = resolvedMenuItems.find((x) => (x.templateId || x.id) === l.menuItemId);
    if (!mi) { showToast("This item is no longer on the venue menu"); return; }
    const gids = (mi.modifierGroupIds || []).filter((gid) => modifierGroups.some((g) => g.id === gid));
    const sel = {};
    for (const x of l.modifiers || []) {
      const gid = gids.find((gd) => (((modifierGroups.find((g) => g.id === gd) || {}).options) || []).some((o) => o.label === x.label));
      if (gid) sel[gid] = [...(sel[gid] || []), x.label];
    }
    const { sel: presets, free } = splitNote(l.notes, notePresetList);
    setEditSheet(null);
    setModModal({ item: mi, sel, gid: null, q: "", qty: l.qty, note: free, notePresets: presets, editKey: l.key });
  };

  const send = async () => {
    // canSend = operator (attributed) OR owner/storeAdmin (deliberate admin sale);
    // a staff-role login with no staff doc is still blocked (setup error)
    if (!lines.length || sending || !canSend) return;
    setSending(true);
    try {
      // The ONE entry point — pricing/deduction/order-write run server-side in
      // rgSellOrder's transaction; labels only, the server never trusts client deltas.
      const r = await sellOrder({
        groupId,
        venueId: selectedVenue,
        lines: lines.map((l) => ({
          menuItemId: l.menuItemId, qty: l.qty,
          // FULL stored labels — display-side stripping is cosmetic only; the
          // server prices by exact-label match against the modifier group
          ...(l.modifiers?.length ? { modifiers: l.modifiers.slice(0, MAX_MODS).map((x) => ({ label: x.label })) } : {}),
          ...(l.notes ? { notes: l.notes } : {}), // kitchen note — server trims/caps at 200
        })),
        reference: `POS-${Date.now().toString().slice(-6)}`,
        // operator → attributed exactly as before. Admin sale → NO staff key;
        // soldByRole marks it deliberate. (rgSellOrder currently consumes only
        // serviceMode/staff/customer/tableNumber/covers from orderMeta, so
        // soldByRole is NOT persisted until the server learns it — sent now so
        // clients are ready the day it does.)
        orderMeta: { serviceMode, ...(operator ? { staff: { id: operator.id } } : { soldByRole: me?.groupRole }) },
      });
      if (r.skipped?.length) {
        showToast(`Skipped: ${[...new Set(r.skipped.map((x) => x.reason))].join("; ")}`);
      }
      if (r.ok) {
        let msg = `Order sent · #${r.orderNumber || "—"} · ${money(r.amounts?.total ?? 0)} inc-GST`;
        if (r.lowStock?.length) msg += ` · LOW STOCK: ${r.lowStock.slice(0, 3).join(", ")}`;
        showToast(msg);
        setLines([]);
      }
    } catch (e) {
      // surface the SERVER's message (permission-denied / not authorized for venue / …)
      showToast(`Order failed: ${e?.message || e?.code || "error"}`);
    }
    setSending(false);
  };

  // VENUE GATE (option B): the POS is meaningless at "all" — resolvedMenuItems
  // would be raw templates and the server would reject/misprice every line.
  if (selectedVenue === "all") {
    return (
      <div className="card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center", padding: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Select a venue to use the POS</div>
        <div style={{ fontSize: 13, color: "var(--gray)" }}>
          Use the venue selector (top-right). The POS sells one venue's menu at that venue's prices.
        </div>
      </div>
    );
  }

  // shared search box (screen A filters the CATEGORY GRID · screen B filters
  // items within the current category — same displayName+kitchenName predicate).
  // autoFocus is right on the web POS: a keyboard is always attached, so landing
  // on the page ready-to-type saves a click. (Ops does NOT autofocus — an iPad
  // software keyboard would cover the grid.)
  const searchBox = (
    <div style={{ position: "relative" }}>
      <span className="pos-search-icon" aria-hidden="true">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
      </span>
      <input className="pos-search" autoFocus value={q} onChange={(e) => { setQ(e.target.value); setSearchAll(false); }}
        placeholder={cat == null ? "Search categories…" : `Search in ${cat}…`} />
      {q !== "" && (
        <button className="pos-search-clear" onClick={() => { setQ(""); setSearchAll(false); }} title="Clear search" aria-label="Clear search">×</button>
      )}
    </div>
  );

  return (
    <div className="pos-v2" style={{ display: "flex", gap: 12, alignItems: "stretch", minHeight: "70vh" }}>
      {/* CENTRE — category-first flow: SCREEN A (category grid, POS opens here)
          → SCREEN B (vertical category rail on the left + that category's item
          grid). minWidth: 0 is load-bearing: a flex child defaults to
          min-width:auto and refuses to shrink below its content, which made the
          item grid overflow sideways instead of wrapping. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {cat == null ? (
          /* SCREEN A — category tiles: pinned (★) lead, then alphabetical */
          <>
            {searchBox}
            <div className="pos-cat-grid">
              {catTiles.map((c) => (
                <div key={c} className="pos-tile pos-tile--tap pos-cat-tile" onClick={() => openCat(c)}>
                  <div className="pos-cat-tile-name">{pinnedCatSet.has(c) && <span className="pos-cat-star">★ </span>}{c}</div>
                  <div className="pos-cat-tile-sub">{catCounts[c] || 0} item{(catCounts[c] || 0) === 1 ? "" : "s"}</div>
                </div>
              ))}
              {catTiles.length === 0 && (
                <div className="pos-tile" style={{ gridColumn: "1 / -1", color: "var(--pos-ink-soft)", fontSize: 13 }}>
                  No categories match “{q.trim()}”. <button className="pos-mode" style={{ marginLeft: 8 }} onClick={() => setQ("")}>Clear search</button>
                </div>
              )}
            </div>
          </>
        ) : (
          /* SCREEN B — vertical category rail (own scroll) + item pane */
          <div className="pos-b-body">
            <div className="pos-b-rail">
              <button className="pos-back" style={{ marginBottom: 6 }} onClick={backToCats}>← Categories</button>
              {orderedCats.map((c) => (
                <button key={c} className={`pos-cat ${cat === c ? "pos-cat--on" : ""}`} onClick={() => openCat(c)}>
                  {pinnedCatSet.has(c) ? "★ " : ""}{c}
                </button>
              ))}
            </div>
            <div className="pos-b-main">
              {searchBox}
              {searchAll && q.trim() !== "" && (
                <div className="pos-searchall-note">
                  Showing matches across all categories.
                  <button className="pos-back" style={{ marginLeft: 8 }} onClick={() => setSearchAll(false)}>Back to {cat}</button>
                </div>
              )}
              <div className="pos-item-grid">
            {tiles.map((m) => {
              const off = m.e86 || m.available === false;
              const hasMods = (m.modifierGroupIds || []).length > 0;
              const tint = tintOf(m.templateId || m.id);
              return (
                <div key={m.templateId || m.id} className={`pos-tile ${off ? "pos-tile--off" : "pos-tile--tap"}`}
                  onClick={() => !off && tapTile(m)}>
                  <div className="pos-avatar" style={{ background: tint.bg, color: tint.fg }}>{initialsOf(m.displayName)}</div>
                  <div className="pos-tile-name" style={{ textDecoration: m.e86 ? "line-through" : "none" }}>{m.displayName}</div>
                  {searchAll && q.trim() !== "" && <div className="pos-tile-cat">{catOf(m)}</div>}
                  <div className="pos-tile-price">{money(incGst(sellAt(m), m.gstApplicable !== false))}</div>
                  {hasMods && !off ? <span className="pos-addons">+add-ons</span> : null}
                  {(m.e86 || m.available === false) && (
                    <div className="pos-tile-flag">{m.e86 ? "86’d" : m.available === false ? "hidden" : ""}</div>
                  )}
                </div>
              );
            })}
              {tiles.length === 0 && (
                <div className="pos-tile" style={{ gridColumn: "1 / -1", color: "var(--pos-ink-soft)", fontSize: 13 }}>
                  {q.trim()
                    ? searchAll
                      ? <>No items match “{q.trim()}” anywhere. <button className="pos-mode" style={{ marginLeft: 8 }} onClick={() => { setQ(""); setSearchAll(false); }}>Clear search</button></>
                      : <>No matches in {cat} — search all items? <button className="pos-mode" style={{ marginLeft: 8 }} onClick={() => setSearchAll(true)}>Search all items</button></>
                    : <>No items in {cat} at {selectedVenueName}.</>}
                </div>
              )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT — order rail */}
      <div className="pos-rail">
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pos-ink)" }}>Order — {selectedVenueName}</div>
        <div style={{ fontSize: 11, color: "var(--pos-ink-soft)", marginBottom: 6 }}>
          Served by <strong>{operator ? (operator.displayName || operator.name) : (me?.name || me?.email || "this login")}</strong>
        </div>
        {!operator && (adminSeller ? (
          /* quiet note, not a warning — an owner selling is deliberate */
          <div className="pos-note-quiet">
            Selling as {me?.groupRole === "owner" ? "owner" : "store admin"} — this sale won't be attributed to a staff member.
          </div>
        ) : (
          <div className="pos-banner">
            This login has no staff profile, so sales can't be attributed. Ask an owner to link your
            account to a staff record. You can browse the menu, but sending orders is disabled.
          </div>
        ))}
        {/* service mode (sent as orderMeta.serviceMode) */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          {SERVICE_MODES.map((sm) => (
            <button key={sm} className={`pos-mode ${serviceMode === sm ? "pos-mode--on" : ""}`} onClick={() => setServiceMode(sm)}>{MODE_LABEL[sm]}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {lines.map((l) => (
            /* tap the line → editor sheet (qty / notes / modify / remove); the
               steppers stopPropagation so they keep working without opening it */
            <div key={l.key} className="pos-line pos-line--tap"
              onClick={() => setEditSheet({ key: l.key, ...splitNote(l.notes, notePresetList) })}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pos-ink)" }}>{l.displayName}</div>
                  <div style={{ fontSize: 11, color: "var(--pos-ink-soft)" }}>{money(incGst(l.unitPrice + l.modDelta, l.gstApplicable !== false))} each</div>
                </div>
                <button className="pos-step" onClick={(e) => { e.stopPropagation(); bump(l.key, -1); }}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center", color: "var(--pos-ink)" }}>{l.qty}</span>
                <button className="pos-step" onClick={(e) => { e.stopPropagation(); bump(l.key, 1); }}>+</button>
                <button className="pos-step pos-remove" onClick={(e) => { e.stopPropagation(); removeLine(l.key); }}>✕</button>
              </div>
              {l.modifiers.length > 0 && (
                <div className="pos-line-mods">
                  {l.modifiers.map((x) => (
                    <span key={x.label} style={{ marginRight: 6 }}>
                      {x.label}{x.priceDelta ? ` ${x.priceDelta > 0 ? "+" : "−"}${money(incGst(Math.abs(x.priceDelta), l.gstApplicable !== false))}` : ""}
                    </span>
                  ))}
                </div>
              )}
              {l.notes && <div className="pos-line-note">✎ {l.notes}</div>}
            </div>
          ))}
          {lines.length === 0 && <div style={{ fontSize: 12, color: "var(--pos-ink-soft)", padding: "16px 0" }}>Tap items to add them.</div>}
        </div>
        <div className="pos-foot">
          <div className="pos-sub-row"><span>Subtotal (ex-GST, est.)</span><span>{money(subtotalEx)}</span></div>
          <div className="pos-sub-row"><span>GST (est.)</span><span>{money(gstEst)}</span></div>
          <div className="pos-total-row">
            <span className="pos-total-label">Total (inc-GST, est.)</span><strong>{money(total)}</strong>
          </div>
          <div style={{ fontSize: 11, color: "var(--pos-ink-soft)", marginBottom: 8 }}>{lines.length}/{MAX_LINES} lines · {MODE_LABEL[serviceMode]} · server re-prices authoritatively</div>
          <button className="pos-send" disabled={!lines.length || sending || !canSend}
            title={canSend ? undefined : "No staff profile linked to this login — sales can't be attributed"} onClick={send}>
            {sending ? "Sending…" : canSend ? "Send order" : "No staff profile — can't send"}
          </button>
        </div>
      </div>

      {/* RAIL LINE EDITOR — small sheet: qty, kitchen notes, Modify (reopen picker
          preloaded), Remove. This is also how NO-modifier items (a coffee) get a
          note: they still add in one tap, then the line is edited here. */}
      {editSheet && editLine && (() => {
        const l = editLine;
        const applyNote = (presets, free) => {
          setEditSheet((p) => ({ ...p, presets, free }));
          setLineNote(l.key, composeNote(presets, free));
        };
        return (
          <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditSheet(null)}>
            <div className="rg-modal pos-sheet">
              <div className="modal-head"><span className="modal-title">{l.displayName}</span><button className="modal-close" onClick={() => setEditSheet(null)}>✕</button></div>
              {l.modifiers.length > 0 && (
                <div className="pos-sheet-mods">
                  {l.modifiers.map((x) => x.label).join(" · ")}
                </div>
              )}
              <div className="pos-sheet-row">
                <span className="pos-sheet-lbl">Quantity</span>
                <div className="pos-qty">
                  <button className="pos-step" onClick={() => bump(l.key, -1)}>−</button>
                  <span className="pos-qty-n">{l.qty}</span>
                  <button className="pos-step" onClick={() => bump(l.key, 1)}>+</button>
                </div>
              </div>
              <div className="pos-sheet-lbl" style={{ marginTop: 10 }}>Kitchen note</div>
              <div className="pos-note-chips">
                {notePresetList.map((p) => {
                  const on = editSheet.presets.includes(p);
                  return (
                    <button key={p} className={`pos-note-chip ${on ? "pos-note-chip--on" : ""}`}
                      onClick={() => applyNote(on ? editSheet.presets.filter((x) => x !== p) : [...editSheet.presets, p], editSheet.free)}>
                      {p}
                    </button>
                  );
                })}
              </div>
              <input className="pos-note-input" value={editSheet.free} maxLength={200} placeholder="Free-text note for the kitchen…"
                onChange={(e) => applyNote(editSheet.presets, e.target.value)} />
              <div className="pos-sheet-actions">
                <button className="pos-sheet-btn pos-sheet-btn--danger" onClick={() => { removeLine(l.key); setEditSheet(null); }}>Remove from order</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="pos-sheet-btn" onClick={() => openModify(l)}>Modify</button>
                  <button className="pos-sheet-btn pos-sheet-btn--primary" onClick={() => setEditSheet(null)}>Done</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODIFIER PICKER (two-pane) — selection rules enforced HERE (server prices
          labels only, it does NOT validate single/required/min/max — verified in
          rgSellOrder). toggle/minFor/unmet/ok are the EXISTING predicates, reused
          verbatim; everything two-pane is display arrangement around them. */}
      {modModal && (() => {
        const m = modModal.item;
        const groups = (m.modifierGroupIds || [])
          .map((gid) => ({ gid, g: modifierGroups.find((x) => x.id === gid) }))
          .filter((x) => x.g);
        const toggle = (gid, g, label) => setModModal((p) => {
          const cur = p.sel[gid] || [];
          if (g.type === "single") return { ...p, sel: { ...p.sel, [gid]: cur[0] === label ? [] : [label] } };
          if (cur.includes(label)) return { ...p, sel: { ...p.sel, [gid]: cur.filter((l) => l !== label) } };
          const max = g.maxSelections == null ? Infinity : Number(g.maxSelections) || Infinity;
          if (cur.length >= max) return p; // multi: hard cap at maxSelections
          return { ...p, sel: { ...p.sel, [gid]: [...cur, label] } };
        });
        const chosen = groups.flatMap(({ gid, g }) => (modModal.sel[gid] || []).map((label) => ({ label, priceDelta: optionDelta(m, gid, g, label) })));
        const unmet = groups.filter(({ gid, g }) => (modModal.sel[gid] || []).length < minFor(g));
        const ok = unmet.length === 0 && chosen.length <= MAX_MODS;
        const estUnit = sellAt(m) + chosen.reduce((s, x) => s + x.priceDelta, 0);
        // required groups first — the EXISTING minFor()-based comparator, unchanged
        const sorted = [...groups].sort((a, b) => (minFor(a.g) > 0 ? 0 : 1) - (minFor(b.g) > 0 ? 0 : 1));
        const active = sorted.find(({ gid }) => gid === modModal.gid) || sorted[0] || null;
        // summary buckets by GROUP kind (display only — chosen/unmet/ok untouched).
        // Entries keep { gid, g, label } so each pill's ✕ can call the SAME
        // toggle() the option rows use — no second deselect path.
        const kindSel = {}; // kind -> [{ gid, g, label }]
        for (const { gid, g } of groups) {
          const k = modGroupKind(g);
          for (const label of (modModal.sel[gid] || [])) (kindSel[k] = kindSel[k] || []).push({ gid, g, label });
        }
        const qtyN = Math.max(1, Number(modModal.qty) || 1);
        const noteStr = composeNote(modModal.notePresets, modModal.note);
        const optQuery = (modModal.q || "").trim().toLowerCase();
        const activeOpts = active ? (active.g.options || []).filter((o) => !optQuery || String(o.label).toLowerCase().includes(optQuery)) : [];
        const confirm = () => {
          if (modModal.editKey) replaceLine(modModal.editKey, m, chosen, { qty: qtyN, note: noteStr });
          else pushLine(m, chosen, { qty: qtyN, note: noteStr });
          setModModal(null);
        };
        return (
          <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModModal(null)}>
            <div className="rg-modal pos-m2">
              <div className="modal-head"><span className="modal-title">{m.displayName}</span><button className="modal-close" onClick={() => setModModal(null)}>✕</button></div>
              {/* summary — one tinted CONTAINER per kind (Add · Instead · No ·
                  Prep · Choose), the selected options nested inside as white
                  pills whose ✕ calls the SAME toggle() as the option rows.
                  Display only — payload keeps full labels; notes unchanged. */}
              <div className="pos-m2-sum2">
                {KIND_SUMMARY.map(([k, lbl]) => {
                  const items = kindSel[k] || [];
                  if (!items.length) return null;
                  return (
                    <div key={k} className={`pos-sumbox pos-sumbox--${k}`}>
                      <span className="pos-sumbox-label">{lbl}</span>
                      <div className="pos-sumbox-pills">
                        {items.map(({ gid, g, label }) => (
                          <span key={`${gid}|${label}`} className="pos-sumpill">
                            {displayLabel(label, k)}
                            <button className="pos-sumpill-x" aria-label={`Deselect ${label}`}
                              onClick={() => toggle(gid, g, label)}>✕</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* note pills (own removable pill each, free text too) + empty state */}
              <div className="pos-m2-sum">
                {modModal.notePresets.map((p) => (
                  <span key={p} className="pos-chip-note">✎ {p}
                    <button className="pos-chip-x" aria-label={`Remove note ${p}`}
                      onClick={() => setModModal((pr) => ({ ...pr, notePresets: pr.notePresets.filter((x) => x !== p) }))}>✕</button>
                  </span>
                ))}
                {modModal.note.trim() !== "" && (
                  <span className="pos-chip-note">✎ {modModal.note.trim()}
                    <button className="pos-chip-x" aria-label="Remove free-text note"
                      onClick={() => setModModal((p) => ({ ...p, note: "" }))}>✕</button>
                  </span>
                )}
                {chosen.length === 0 && !noteStr && <span className="pos-m2-sum-empty">No changes — served as standard.</span>}
              </div>
              <div className="pos-m2-body">
                {/* LEFT — group rail (required first via the existing minFor sort) */}
                <div className="pos-m2-groups">
                  {sorted.map(({ gid, g }) => {
                    const n = (modModal.sel[gid] || []).length;
                    const on = active && active.gid === gid;
                    const k = modGroupKind(g); // colour cue only — ordering stays minFor-first
                    return (
                      <button key={gid} className={`pos-m2-group ${on ? "pos-m2-group--on" : ""}`}
                        onClick={() => setModModal((p) => ({ ...p, gid, q: "" }))}>
                        <span className="pos-m2-group-name">
                          <span className={`pos-kind-dot pos-kind-dot--${k}`} title={k} aria-label={`kind: ${k}`} />
                          {g.name}{minFor(g) > 0 && <span className="pos-m2-req">*</span>}
                        </span>
                        {n > 0 && <span className="pos-m2-badge">{n}</span>}
                      </button>
                    );
                  })}
                  {sorted.length === 0 && <div className="pos-m2-none">No modifier groups</div>}
                </div>
                {/* RIGHT — the active group's options as full-width rows */}
                <div className="pos-m2-opts">
                  {active && (
                    <div className="pos-m2-rule">
                      {active.g.type === "single" ? "pick one" : active.g.maxSelections != null ? `up to ${active.g.maxSelections}` : "any"}
                      {minFor(active.g) > 0 ? ` · min ${minFor(active.g)}` : ""}{active.g.required ? " · required" : ""}
                    </div>
                  )}
                  {active && (active.g.options || []).length > 12 && (
                    <input className="pos-note-input" style={{ marginBottom: 6 }} value={modModal.q}
                      placeholder={`Search ${active.g.name}…`} onChange={(e) => setModModal((p) => ({ ...p, q: e.target.value }))} />
                  )}
                  {active && activeOpts.map((o) => {
                    const on = (modModal.sel[active.gid] || []).includes(o.label);
                    const delta = optionDelta(m, active.gid, active.g, o.label);
                    const k = modGroupKind(active.g); // one treatment per GROUP, by kind
                    return (
                      <div key={o.label} className="pos-opt-row" onClick={() => toggle(active.gid, active.g, o.label)}>
                        <span className="pos-opt-name">{displayLabel(o.label, k)}</span>
                        <span className="pos-opt-delta">{delta ? `${delta > 0 ? "+" : "−"}${money(incGst(Math.abs(delta), m.gstApplicable !== false))}` : ""}</span>
                        <button className={`pos-act pos-act--${k}${on ? " pos-act--on" : ""}`}
                          onClick={(e) => { e.stopPropagation(); toggle(active.gid, active.g, o.label); }}>
                          {KIND_VERBS[k][on ? 1 : 0]}
                        </button>
                      </div>
                    );
                  })}
                  {active && activeOpts.length === 0 && <div className="pos-m2-none">No options match.</div>}
                </div>
              </div>
              {/* kitchen note — presets from Settings (group.posNotePresets) + free text */}
              <div className="pos-m2-notes">
                <div className="pos-sheet-lbl">Kitchen note</div>
                <div className="pos-note-chips">
                  {notePresetList.map((p) => {
                    const on = modModal.notePresets.includes(p);
                    return (
                      <button key={p} className={`pos-note-chip ${on ? "pos-note-chip--on" : ""}`}
                        onClick={() => setModModal((pr) => ({ ...pr, notePresets: on ? pr.notePresets.filter((x) => x !== p) : [...pr.notePresets, p] }))}>
                        {p}
                      </button>
                    );
                  })}
                </div>
                <input className="pos-note-input" value={modModal.note} maxLength={200} placeholder="Free-text note for the kitchen…"
                  onChange={(e) => setModModal((p) => ({ ...p, note: e.target.value }))} />
              </div>
              {chosen.length > MAX_MODS && <div style={{ fontSize: 11, color: "var(--pos-rem)", marginBottom: 6 }}>Max {MAX_MODS} add-ons per line (server limit).</div>}
              <div className="pos-m2-foot">
                <div className="pos-qty">
                  <button className="pos-step" onClick={() => setModModal((p) => ({ ...p, qty: Math.max(1, qtyN - 1) }))}>−</button>
                  <span className="pos-qty-n">{qtyN}</span>
                  <button className="pos-step" onClick={() => setModModal((p) => ({ ...p, qty: Math.min(MAX_QTY, qtyN + 1) }))}>+</button>
                </div>
                <span className="pos-m2-total">{money(incGst(estUnit, m.gstApplicable !== false) * qtyN)} inc-GST</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="pos-sheet-btn" onClick={() => setModModal(null)}>Cancel</button>
                  <button className="pos-sheet-btn pos-sheet-btn--primary" disabled={!ok} onClick={confirm}>
                    {unmet.length ? `Pick ${unmet.map((u) => u.g.name).join(", ")}` : modModal.editKey ? "Update line" : "Add to order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
