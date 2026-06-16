import React, { useEffect, useMemo, useState } from "react";
import { addDoc, setDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { menuItemDoc, recipesCol, recipeDoc, modifierGroupsCol, modifierGroupDoc, menuItemsCol } from "../../utils/restaurantGroupPaths";
import { sellOrder } from "./sellOrder";
import {
  incGst, marginPct, marginColor, money, recipeFoodCost, menuItemFoodCost, grossStockQty, venueCost,
  DEFAULT_MENU_CATEGORIES,
} from "./rgStockUtils";

const E86_REASONS = ["Out of stock", "Quality issue", "Equipment failure"];
const E86_BACK = ["Unknown", "Later today", "Tomorrow", "2-3 days"];
const fmtWhen = (iso) => { try { return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return iso || "—"; } };

export default function MenusPage() {
  const {
    groupId, group, venues, menuItems, recipes, modifierGroups, inventoryItems, stock,
    selectedVenue, selectedVenueName, venueName, can, showToast, me, myStaff,
  } = useRG();
  const canEdit = can("menus", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";
  const categories = group?.menuCategories?.length ? group.menuCategories : DEFAULT_MENU_CATEGORIES;

  const [tab, setTab] = useState("overview"); // overview | availability | e86 | recipes | modifiers | pricing
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");

  const itemById = useMemo(() => Object.fromEntries(inventoryItems.map((i) => [i.id, i])), [inventoryItems]);
  const recipeByMenuItemId = useMemo(() => Object.fromEntries(recipes.map((r) => [r.menuItemId, r])), [recipes]);
  // Phase 2 — venue selector for recipe costing (cost is per venue). Build a
  // { itemId: that venue's stock doc } map so costing resolves venueCost.
  const [recipeVenue, setRecipeVenue] = useState("");
  useEffect(() => { setRecipeVenue(selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "")); }, [selectedVenue, venues]);
  const recipeStockByItem = useMemo(() => {
    const m = {}; (stock || []).forEach((s) => { if (s.venueId === recipeVenue) m[s.id] = s; }); return m;
  }, [stock, recipeVenue]);

  // venue-filtered menu (prototype vM())
  const vItems = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return menuItems
      .filter((m) => selectedVenue === "all" || (m.venueIds || []).includes(selectedVenue))
      .filter((m) => (!ql || (m.displayName || "").toLowerCase().includes(ql)) && (!fCat || m.category === fCat))
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [menuItems, selectedVenue, q, fCat]);

  const foodCostOf = (m) => menuItemFoodCost(m, recipeByMenuItemId, itemById);
  const marginOf = (m) => marginPct(m.sellPrice, foodCostOf(m));

  const patchItem = async (m, patch, okMsg) => {
    try {
      await setDoc(menuItemDoc(groupId, m.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      if (okMsg) showToast(okMsg);
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  // ── 86 list ──
  const quick86 = (m) => patchItem(m, { e86: true, available: false, e86Reason: "Out of stock", e86By: actor, e86At: new Date().toISOString(), e86Back: "Unknown" }, `${m.displayName} added to 86 list`);
  const remove86 = (m) => patchItem(m, { e86: false, available: true, e86Reason: "", e86Back: "" }, "Removed from 86 list");
  const [e86Form, setE86Form] = useState({ id: "", reason: E86_REASONS[0], back: E86_BACK[0] });
  const conf86 = async () => {
    const m = menuItems.find((x) => x.id === e86Form.id);
    if (!m) return showToast("Pick a menu item");
    await patchItem(m, { e86: true, available: false, e86Reason: e86Form.reason, e86By: actor, e86At: new Date().toISOString(), e86Back: e86Form.back }, `${m.displayName} added to 86 list`);
    setE86Form({ id: "", reason: E86_REASONS[0], back: E86_BACK[0] });
  };
  const e86List = useMemo(() => menuItems.filter((m) => m.e86), [menuItems]);

  // ── availability bulk ──
  const setAll = async (available) => {
    if (!canEdit) return;
    try {
      const batch = writeBatch(db);
      vItems.filter((m) => !m.e86).forEach((m) => batch.set(menuItemDoc(groupId, m.id), { available, updatedAt: serverTimestamp() }, { merge: true }));
      await batch.commit();
      showToast(available ? "All items enabled" : "All items disabled");
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  // ── item modal ──
  const [editor, setEditor] = useState(null);
  const openItem = (m) => setEditor(m ? {
    id: m.id, displayName: m.displayName || "", kitchenName: m.kitchenName || "", category: m.category || categories[0],
    sellPrice: m.sellPrice ?? "", cost: m.cost ?? "", gstApplicable: m.gstApplicable !== false,
    venueIds: m.venueIds || [], posId: m.posId || "", modifierGroupIds: m.modifierGroupIds || [], available: m.available !== false,
  } : {
    id: null, displayName: "", kitchenName: "", category: categories[0], sellPrice: "", cost: "",
    gstApplicable: true, venueIds: selectedVenue !== "all" ? [selectedVenue] : venues.map((v) => v.id),
    posId: "", modifierGroupIds: [], available: true,
  });
  const saveItem = async () => {
    if (!canEdit || !editor) return;
    if (!editor.displayName.trim()) return showToast("Display name is required");
    if (!editor.venueIds.length) return showToast("Pick at least one venue");
    const data = {
      displayName: editor.displayName.trim(), kitchenName: editor.kitchenName || "", category: editor.category,
      sellPrice: Number(editor.sellPrice) || 0, cost: Number(editor.cost) || 0, gstApplicable: !!editor.gstApplicable,
      venueIds: editor.venueIds, posId: editor.posId || "", modifierGroupIds: editor.modifierGroupIds,
      available: !!editor.available, updatedAt: serverTimestamp(),
    };
    try {
      if (editor.id) await setDoc(menuItemDoc(groupId, editor.id), data, { merge: true });
      else await addDoc(menuItemsCol(groupId), { ...data, e86: false, recipeId: null, createdAt: serverTimestamp() });
      showToast("Menu item saved");
      setEditor(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };

  // ── recipe modal ──
  const [recEditor, setRecEditor] = useState(null); // {menuItemId, recipeId|null, ingredients:[{itemId, qty, netQty, recipeUnit}]}
  const recipeUnitOf = (itemId) => itemById[itemId]?.recipeUnit || itemById[itemId]?.unit || "";
  const openRecipe = (m) => {
    const r = recipeByMenuItemId[m.id];
    // normalise lines: netQty (fallback qty) is the entered amount; recipeUnit
    // defaults to the item's recipeUnit. Phase 1 — backward compatible.
    setRecEditor({ menuItemId: m.id, recipeId: r?.id || null, ingredients: (r?.ingredients || []).map((g) => ({
      itemId: g.itemId, netQty: g.netQty != null ? g.netQty : g.qty, recipeUnit: g.recipeUnit || recipeUnitOf(g.itemId),
    })) });
  };
  const recMenuItem = recEditor ? menuItems.find((m) => m.id === recEditor.menuItemId) : null;
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
      if (recipeId) {
        await setDoc(recipeDoc(groupId, recipeId), { menuItemId: recEditor.menuItemId, ingredients, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        const ref = await addDoc(recipesCol(groupId), { menuItemId: recEditor.menuItemId, ingredients, createdAt: serverTimestamp() });
        recipeId = ref.id;
      }
      await setDoc(menuItemDoc(groupId, recEditor.menuItemId), { recipeId, updatedAt: serverTimestamp() }, { merge: true });
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
  const openMod = (g) => setModForm(g ? { ...g, options: (g.options || []).map((o) => ({ ...o })) } : {
    id: null, name: "", type: "multi", required: false, minSelections: 0, maxSelections: null, printer: "kitchen",
    options: [{ label: "", priceDelta: 0 }],
  });
  const saveMod = async () => {
    if (!canEdit || !modForm) return;
    if (!modForm.name.trim()) return showToast("Group name required");
    const options = modForm.options.filter((o) => (o.label || "").trim()).map((o) => ({ label: o.label.trim(), priceDelta: Number(o.priceDelta) || 0 }));
    if (!options.length) return showToast("Add at least one option");
    const data = {
      name: modForm.name.trim(), type: modForm.type, required: !!modForm.required,
      minSelections: Number(modForm.minSelections) || 0,
      maxSelections: modForm.maxSelections === null || modForm.maxSelections === "" ? null : Number(modForm.maxSelections),
      printer: modForm.printer || "kitchen", options,
    };
    try {
      if (modForm.id) await setDoc(modifierGroupDoc(groupId, modForm.id), data, { merge: true });
      else await addDoc(modifierGroupsCol(groupId), { ...data, attachedMenuItemIds: [], createdAt: serverTimestamp() });
      showToast("Modifier group saved");
      setModForm(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };
  const attachedCount = (g) => menuItems.filter((m) => (m.modifierGroupIds || []).includes(g.id)).length;

  const marginPill = (m) => {
    const mg = marginOf(m);
    return <span className="pill" style={{ background: "#f4f4f5", color: marginColor(mg), fontWeight: 600 }}>{mg}%</span>;
  };
  const recipePill = (m) => {
    const r = recipeByMenuItemId[m.id];
    return r
      ? <span className="pill pill-green" style={{ cursor: canEdit ? "pointer" : "default" }} onClick={() => canEdit && openRecipe(m)}>{(r.ingredients || []).length} ings</span>
      : <span className="pill pill-amber" style={{ cursor: canEdit ? "pointer" : "default" }} onClick={() => canEdit && openRecipe(m)}>No recipe</span>;
  };

  // pricing KPIs (all ex-GST — one base, Hard Rule 8)
  const pricing = useMemo(() => {
    if (!vItems.length) return { avgSell: 0, avgCost: 0, avgCostPct: 0, avgMargin: 0, below35: 0 };
    let sell = 0, cost = 0, mg = 0, below = 0;
    vItems.forEach((m) => {
      const c = foodCostOf(m); const g = marginPct(m.sellPrice, c);
      sell += Number(m.sellPrice) || 0; cost += c; mg += g;
      if (g < 35) below++;
    });
    const n = vItems.length;
    return { avgSell: sell / n, avgCost: cost / n, avgCostPct: sell > 0 ? Math.round((cost / sell) * 100) : 0, avgMargin: Math.round(mg / n), below35: below };
  }, [vItems, recipeByMenuItemId, itemById]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Menu overview</button>
          <button className={`tab ${tab === "availability" ? "active" : ""}`} onClick={() => setTab("availability")}>Availability</button>
          <button className={`tab ${tab === "e86" ? "active" : ""}`} onClick={() => setTab("e86")}>86 list{e86List.length ? ` (${e86List.length})` : ""}</button>
          <button className={`tab ${tab === "recipes" ? "active" : ""}`} onClick={() => setTab("recipes")}>Recipe costing</button>
          <button className={`tab ${tab === "modifiers" ? "active" : ""}`} onClick={() => setTab("modifiers")}>Modifier groups</button>
          <button className={`tab ${tab === "pricing" ? "active" : ""}`} onClick={() => setTab("pricing")}>Pricing & margins</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>{selectedVenueName} · {vItems.length} items</div>
      </div>

      {(tab === "overview" || tab === "availability" || tab === "pricing") && (
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
              {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openItem(null)}>+ New menu item</button>}
            </div>
          </div>
        </div>
      )}

      {tab === "overview" && (
        <div className="card">
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Item</th><th>Category</th><th>POS ID</th><th>Sell inc-GST</th><th>Food cost</th><th>Margin</th><th>Recipe</th><th>Available</th><th>86</th><th></th></tr></thead>
              <tbody>
                {vItems.map((m) => (
                  <tr key={m.id} style={{ opacity: m.e86 ? 0.55 : 1 }}>
                    <td><strong style={{ textDecoration: m.e86 ? "line-through" : "none" }}>{m.displayName}</strong>{m.kitchenName && <div style={{ fontSize: 11, color: "var(--gray)" }}>{m.kitchenName}</div>}</td>
                    <td><span className="pill pill-blue">{m.category}</span></td>
                    <td style={{ fontSize: 12, color: "var(--gray)" }}>{m.posId || "—"}</td>
                    <td><strong>{money(incGst(m.sellPrice, m.gstApplicable !== false))}</strong><div style={{ fontSize: 11, color: "var(--gray)" }}>{money(m.sellPrice)} ex</div></td>
                    <td>{money(foodCostOf(m))}</td>
                    <td>{marginPill(m)}</td>
                    <td>{recipePill(m)}</td>
                    <td>
                      <input type="checkbox" checked={m.available !== false} disabled={!canEdit || m.e86}
                        onChange={(e) => patchItem(m, { available: e.target.checked }, e.target.checked ? "Available on POS" : "Hidden from POS")} />
                    </td>
                    <td>
                      {canEdit && (m.e86
                        ? <button className="btn btn-sm" onClick={() => remove86(m)}>Remove 86</button>
                        : <button className="btn btn-sm" style={{ color: "var(--red)" }} onClick={() => quick86(m)}>86 it</button>)}
                    </td>
                    <td>{canEdit && <button className="btn btn-sm" onClick={() => openItem(m)}>Edit</button>}</td>
                  </tr>
                ))}
                {vItems.length === 0 && <tr><td colSpan={10} style={{ color: "var(--gray)" }}>No menu items for {selectedVenueName}.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
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
                    {menuItems.filter((m) => !m.e86).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}
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
                  {vItems.filter((m) => recipeByMenuItemId[m.id]).map((m) => {
                    const r = recipeByMenuItemId[m.id];
                    const fc = recipeFoodCost(r, itemById, recipeStockByItem);
                    const fcp = Number(m.sellPrice) > 0 ? Math.round((fc / Number(m.sellPrice)) * 100) : 0;
                    const mg = marginPct(m.sellPrice, fc);
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.displayName}</strong></td>
                        <td>{money(m.sellPrice)}</td>
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
              {vItems.filter((m) => !recipeByMenuItemId[m.id]).map((m) => (
                <span key={m.id} className="pill pill-amber" style={{ cursor: canEdit ? "pointer" : "default" }} onClick={() => canEdit && openRecipe(m)}>
                  {m.displayName} {canEdit ? "· link recipe" : ""}
                </span>
              ))}
              {vItems.every((m) => recipeByMenuItemId[m.id]) && <span style={{ fontSize: 12, color: "var(--gray)" }}>Every item has a recipe. 🎉</span>}
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
              <thead><tr><th>Group</th><th>Type</th><th>Required</th><th>Options</th><th>Attached items</th></tr></thead>
              <tbody>
                {modifierGroups.map((g) => (
                  <tr key={g.id} onClick={() => canEdit && openMod(g)} style={{ cursor: canEdit ? "pointer" : "default" }}>
                    <td><strong>{g.name}</strong></td>
                    <td>{g.type === "single" ? "Single-select" : "Multi-select"}</td>
                    <td>{g.required ? <span className="pill pill-red">Required</span> : <span className="pill">Optional</span>}</td>
                    <td style={{ fontSize: 12 }}>{(g.options || []).map((o) => o.priceDelta ? `${o.label} ${o.priceDelta > 0 ? "+" : "−"}$${Math.abs(o.priceDelta)}` : o.label).join(", ")}</td>
                    <td>{attachedCount(g)}</td>
                  </tr>
                ))}
                {modifierGroups.length === 0 && <tr><td colSpan={5} style={{ color: "var(--gray)" }}>No modifier groups yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "pricing" && (
        <>
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
                    const fc = foodCostOf(m);
                    const mg = marginPct(m.sellPrice, fc);
                    const gp = (Number(m.sellPrice) || 0) - fc;
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.displayName}</strong></td>
                        <td>{money(incGst(m.sellPrice, m.gstApplicable !== false))}</td>
                        <td>{money(m.sellPrice)}</td>
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
            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="form-label">Display name</div><input className="form-input" value={editor.displayName} onChange={(e) => setEditor((p) => ({ ...p, displayName: e.target.value }))} /></div>
              <div><div className="form-label">Kitchen name (dockets)</div><input className="form-input" value={editor.kitchenName} onChange={(e) => setEditor((p) => ({ ...p, kitchenName: e.target.value }))} /></div>
              <div><div className="form-label">Category</div>
                <select className="form-input" value={editor.category} onChange={(e) => setEditor((p) => ({ ...p, category: e.target.value }))}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><div className="form-label">POS ID</div><input className="form-input" value={editor.posId} onChange={(e) => setEditor((p) => ({ ...p, posId: e.target.value }))} /></div>
              <div>
                <div className="form-label">Sell price ex-GST ($)</div>
                <input className="form-input" type="number" step="0.01" value={editor.sellPrice} onChange={(e) => setEditor((p) => ({ ...p, sellPrice: e.target.value }))} />
                <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>= {money(incGst(Number(editor.sellPrice) || 0, editor.gstApplicable))} inc-GST on the menu</div>
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
            <div className="form-label">Modifier groups</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              {modifierGroups.map((g) => (
                <label key={g.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={editor.modifierGroupIds.includes(g.id)}
                    onChange={(e) => setEditor((p) => ({ ...p, modifierGroupIds: e.target.checked ? [...p.modifierGroupIds, g.id] : p.modifierGroupIds.filter((x) => x !== g.id) }))} />
                  {g.name}
                </label>
              ))}
              {modifierGroups.length === 0 && <span style={{ fontSize: 12, color: "var(--gray)" }}>None yet.</span>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditor(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveItem}>Save</button>
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
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Total food cost</span><strong>{money(recCost)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span>Sell price (ex-GST)</span><strong>{money(recMenuItem.sellPrice)}</strong></div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Gross margin</span>
                <strong style={{ color: marginColor(marginPct(recMenuItem.sellPrice, recCost)) }}>
                  {money((Number(recMenuItem.sellPrice) || 0) - recCost)} — {marginPct(recMenuItem.sellPrice, recCost)}%
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
