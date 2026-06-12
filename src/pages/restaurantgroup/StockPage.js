import React, { useEffect, useMemo, useState } from "react";
import { writeBatch, doc, setDoc, serverTimestamp, onSnapshot, query, orderBy, limit, runTransaction } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { inventoryItemsCol, inventoryItemDoc, stockDoc, stockMovementsCol } from "../../utils/restaurantGroupPaths";
import { sellOrder } from "./sellOrder";
import { StocktakeTab, PriceAdjustTab, ValuationTab, ExpiryTab, ScannerTab, AdjustmentsTab } from "./StockExtraTabs";
import {
  computeStockStatus, stockStatusMeta, marginPct, marginColor, pctOfPar, incGst, money,
  movementTypeLabel,
  DEFAULT_STOCK_CATEGORIES, DEFAULT_STOCK_UNITS, DEFAULT_STORAGE_LOCATIONS, stockCategoryColor,
} from "./rgStockUtils";

// SKU prefixes matching the seeded MK-XXXX-NNN pattern.
const SKU_PREFIX = {
  Protein: "PROT", Frozen: "FROZ", Produce: "PROD", Dairy: "DAIR", "Dry goods": "DRY",
  "Asian grocery": "ASIA", Sauces: "SAUC", Packaging: "PACK", Seafood: "SEAF",
};
const skuPrefix = (cat) => SKU_PREFIX[cat] || (cat || "ITEM").replace(/[^a-zA-Z]/g, "").slice(0, 4).toUpperCase();

const STATUS_FILTERS = [
  { key: "", label: "All statuses" },
  { key: "critical", label: "Low stock" },
  { key: "low", label: "Medium" },
  { key: "ok", label: "In stock" },
];

const fmtWhen = (ts) => { try { const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };

export default function StockPage() {
  const { groupId, group, venues, inventoryItems, menuItems, recipes, suppliers, stock, selectedVenue, selectedVenueName, can, showToast, me } = useRG();
  const canEdit = can("stock", "edit");

  const categories = group?.stockCategories?.length ? group.stockCategories : DEFAULT_STOCK_CATEGORIES;
  const units = group?.stockUnits?.length ? group.stockUnits : DEFAULT_STOCK_UNITS;
  const locations = group?.storageLocations?.length ? group.storageLocations : DEFAULT_STORAGE_LOCATIONS;

  const [tab, setTab] = useState("library"); // library | overview | movements
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fSup, setFSup] = useState("");
  const [fLoc, setFLoc] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const supplierById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);

  // stock rows joined to items: per selected venue, or aggregated across venues.
  // Aggregate view sums quantities and surfaces the WORST per-venue status.
  const stockFor = useMemo(() => {
    const map = {}; // itemId -> {qtyOnHand, par, reorderPoint, reorderQty, status, perVenue: {venueId: row}}
    const sev = { critical: 2, low: 1, ok: 0 };
    stock.forEach((s) => {
      if (selectedVenue !== "all" && s.venueId !== selectedVenue) return;
      const cur = map[s.id] || { qtyOnHand: 0, par: 0, reorderPoint: 0, reorderQty: 0, status: "ok", perVenue: {} };
      cur.qtyOnHand += Number(s.qtyOnHand) || 0;
      cur.par += Number(s.par) || 0;
      cur.reorderPoint += Number(s.reorderPoint) || 0;
      cur.reorderQty += Number(s.reorderQty) || 0;
      if ((sev[s.status] ?? 0) > (sev[cur.status] ?? 0)) cur.status = s.status;
      cur.perVenue[s.venueId] = s;
      map[s.id] = cur;
    });
    return map;
  }, [stock, selectedVenue]);

  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return inventoryItems
      .filter((i) => (showArchived ? true : !i.archived))
      .map((i) => ({ ...i, stock: stockFor[i.id] || { qtyOnHand: 0, par: 0, reorderPoint: 0, reorderQty: 0, status: "critical", perVenue: {} } }))
      .filter((i) =>
        (!ql || (i.name || "").toLowerCase().includes(ql) || (i.sku || "").toLowerCase().includes(ql)) &&
        (!fCat || i.category === fCat) &&
        (!fStatus || i.stock.status === fStatus) &&
        (!fSup || i.supplierId === fSup) &&
        (!fLoc || i.storageLocation === fLoc)
      )
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [inventoryItems, stockFor, q, fCat, fStatus, fSup, fLoc, showArchived]);

  const kpis = useMemo(() => {
    const active = inventoryItems.filter((i) => !i.archived);
    let value = 0, critical = 0, low = 0;
    active.forEach((i) => {
      const s = stockFor[i.id];
      if (!s) return;
      value += (Number(s.qtyOnHand) || 0) * (Number(i.cost) || 0);
      if (s.status === "critical") critical++;
      else if (s.status === "low") low++;
    });
    return { items: active.length, value, critical, low };
  }, [inventoryItems, stockFor]);

  // ── movements tab (Phase 2): per-venue audit trail, newest first ──
  const [movVenue, setMovVenue] = useState("");
  useEffect(() => {
    setMovVenue(selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || ""));
  }, [selectedVenue, venues]);
  const [movements, setMovements] = useState([]);
  useEffect(() => {
    if (!groupId || !movVenue || tab !== "movements") { setMovements([]); return; }
    return onSnapshot(
      query(stockMovementsCol(groupId, movVenue), orderBy("createdAt", "desc"), limit(100)),
      (s) => setMovements(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setMovements([])
    );
  }, [groupId, movVenue, tab]);

  // demo POS sale — calls the real rgSellOrder transaction (handoff §6)
  const [selling, setSelling] = useState("");
  const recipesByMenuItemId = useMemo(() => Object.fromEntries(recipes.map((r) => [r.menuItemId, r])), [recipes]);
  const demoItems = useMemo(
    () => menuItems.filter((m) => recipesByMenuItemId[m.id] && (m.venueIds || []).includes(movVenue)),
    [menuItems, recipesByMenuItemId, movVenue]
  );
  const demoSell = async (m) => {
    if (selling) return;
    setSelling(m.id);
    try {
      const r = await sellOrder({ groupId, venueId: movVenue, lines: [{ menuItemId: m.id, qty: 1 }], reference: `DEMO-${Date.now().toString().slice(-5)}` });
      const skippedMsg = (r.skipped || []).map((x) => x.reason).join("; ");
      let msg = `${m.displayName} sold — ${r.deducted.length} ingredients deducted.`;
      if (r.lowStock?.length) msg += ` LOW STOCK: ${r.lowStock.join(", ")}`;
      if (r.draftsCreated) msg += ` · ${r.draftsCreated} draft PO raised`;
      showToast(skippedMsg || msg);
    } catch (e) {
      showToast(`Sale failed: ${e?.message || e?.code || "error"}`);
    }
    setSelling("");
  };

  // ── editor modal ──
  const [editor, setEditor] = useState(null);
  const blankForm = () => ({
    id: null, name: "", sku: "", category: categories[0] || "", unit: units[0] || "kg",
    supplierId: suppliers[0]?.id || "", cost: "", sell: "", gstApplicable: true, storageLocation: "",
    venueId: selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || ""),
    qtyOnHand: "", par: "", reorderPoint: "", reorderQty: "",
  });
  const stockFieldsFor = (itemId, venueId) => {
    const s = stock.find((r) => r.id === itemId && r.venueId === venueId);
    return { qtyOnHand: s?.qtyOnHand ?? "", origQty: s?.qtyOnHand ?? "", par: s?.par ?? "", reorderPoint: s?.reorderPoint ?? "", reorderQty: s?.reorderQty ?? "" };
  };
  const openCreate = () => setEditor(blankForm());
  const openEdit = (i) => {
    const venueId = selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "");
    setEditor({
      id: i.id, name: i.name || "", sku: i.sku || "", category: i.category || "", unit: i.unit || "kg",
      supplierId: i.supplierId || "", cost: i.cost ?? "", sell: i.sell ?? "", gstApplicable: i.gstApplicable !== false,
      storageLocation: i.storageLocation || "", venueId, ...stockFieldsFor(i.id, venueId),
    });
  };
  const setF = (k, v) => setEditor((p) => ({ ...p, [k]: v }));
  const switchEditorVenue = (venueId) => setEditor((p) => ({ ...p, venueId, ...(p.id ? stockFieldsFor(p.id, venueId) : {}) }));

  const nextSku = (cat) => {
    const pre = `MK-${skuPrefix(cat)}-`;
    const max = inventoryItems.reduce((m, i) => {
      if ((i.sku || "").startsWith(pre)) {
        const n = parseInt(i.sku.slice(pre.length), 10);
        if (!isNaN(n)) return Math.max(m, n);
      }
      return m;
    }, 0);
    return `${pre}${String(max + 1).padStart(3, "0")}`;
  };

  const num = (v) => (v === "" || v === null || v === undefined ? 0 : Number(v)); // 0 is a legal value (prototype's || bug fixed)

  const save = async () => {
    if (!canEdit) return;
    if (!editor.name.trim()) return showToast("Name is required");
    if (isNaN(Number(editor.cost)) || isNaN(Number(editor.sell))) return showToast("Cost and sell must be numbers");
    const qty = num(editor.qtyOnHand), par = num(editor.par), ro = num(editor.reorderPoint), roq = num(editor.reorderQty);
    const defs = {
      name: editor.name.trim(), sku: editor.sku.trim() || nextSku(editor.category), category: editor.category,
      unit: editor.unit, supplierId: editor.supplierId || null, cost: num(editor.cost), sell: num(editor.sell),
      gstApplicable: !!editor.gstApplicable, storageLocation: editor.storageLocation || "", archived: false,
      updatedAt: serverTimestamp(),
    };
    try {
      if (editor.id) {
        await setDoc(inventoryItemDoc(groupId, editor.id), defs, { merge: true });
        // The stock write is read-modify-write: a POS sale may have deducted
        // since the modal opened. Transaction, never a batch (hard rule 4).
        // Quantity is only overwritten if the user actually changed it, and
        // that change lands in the audit trail as a manualAdj movement.
        const qtyTouched = String(editor.qtyOnHand) !== String(editor.origQty);
        await runTransaction(db, async (tx) => {
          const sRef = stockDoc(groupId, editor.venueId, editor.id);
          const snap = await tx.get(sRef);
          const cur = snap.exists() ? snap.data() : {};
          const liveQty = Number(cur.qtyOnHand) || 0;
          const newQty = qtyTouched ? qty : liveQty;
          tx.set(sRef, {
            qtyOnHand: newQty, par, reorderPoint: ro, reorderQty: roq,
            status: computeStockStatus(newQty, ro, par), updatedAt: serverTimestamp(),
          }, { merge: true });
          if (qtyTouched && Math.abs(newQty - liveQty) > 1e-9) {
            tx.set(doc(stockMovementsCol(groupId, editor.venueId)), {
              itemId: editor.id, itemName: defs.name, type: "manualAdj",
              qtyChange: Math.round((newQty - liveQty) * 10000) / 10000, before: liveQty, after: newQty,
              unit: defs.unit, reason: "Item edit", reference: "", menuItemId: null, menuName: "",
              by: me?.name || me?.email || "Admin", costAtMove: Math.round(Math.abs(newQty - liveQty) * defs.cost * 10000) / 10000,
              createdAt: serverTimestamp(),
            });
          }
        });
      } else {
        const batch = writeBatch(db);
        const ref = doc(inventoryItemsCol(groupId));
        batch.set(ref, { ...defs, createdAt: serverTimestamp() });
        // a new master item gets a stock row in EVERY venue so the join has no holes
        venues.forEach((v) => {
          batch.set(stockDoc(groupId, v.id, ref.id), {
            qtyOnHand: qty, par, reorderPoint: ro, reorderQty: roq,
            status: computeStockStatus(qty, ro, par), lastCountedAt: null, updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
      showToast(editor.id ? "Inventory item saved" : "Inventory item created");
      setEditor(null);
    } catch (e) {
      showToast(`Could not save: ${e?.code || e?.message || "error"}`);
    }
  };

  const archive = async (i) => {
    if (!canEdit) return;
    try {
      const batch = writeBatch(db);
      batch.set(inventoryItemDoc(groupId, i.id), { archived: !i.archived, updatedAt: serverTimestamp() }, { merge: true });
      await batch.commit();
      showToast(i.archived ? "Item restored" : "Item archived");
      setEditor(null);
    } catch (e) {
      showToast(`Could not update: ${e?.code || e?.message || "error"}`);
    }
  };

  const statusPill = (st) => {
    const m = stockStatusMeta(st);
    return <span className="pill" style={{ background: m.bg, color: m.color }}>{m.label}</span>;
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          <button className={`tab ${tab === "library" ? "active" : ""}`} onClick={() => setTab("library")}>Item library</button>
          <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Stock overview</button>
          <button className={`tab ${tab === "movements" ? "active" : ""}`} onClick={() => setTab("movements")}>Movements</button>
          <button className={`tab ${tab === "stocktake" ? "active" : ""}`} onClick={() => setTab("stocktake")}>Stocktake</button>
          <button className={`tab ${tab === "priceadj" ? "active" : ""}`} onClick={() => setTab("priceadj")}>Price adjustments</button>
          <button className={`tab ${tab === "valuation" ? "active" : ""}`} onClick={() => setTab("valuation")}>Valuation</button>
          <button className={`tab ${tab === "expiry" ? "active" : ""}`} onClick={() => setTab("expiry")}>Expiry & batches</button>
          <button className={`tab ${tab === "scanner" ? "active" : ""}`} onClick={() => setTab("scanner")}>Scanner</button>
          <button className={`tab ${tab === "adjustments" ? "active" : ""}`} onClick={() => setTab("adjustments")}>Adjustments</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>
          {selectedVenueName} · {kpis.items} items
          {kpis.critical > 0 && <span style={{ color: "var(--red)", fontWeight: 600 }}> · {kpis.critical} critical</span>}
        </div>
      </div>

      {/* KPIs */}
      {(tab === "library" || tab === "overview") && (
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="card-sub">Items in library</div><div style={{ fontSize: 22, fontWeight: 700 }}>{kpis.items}</div></div>
        <div className="card"><div className="card-sub">Stock value at cost (ex-GST)</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(kpis.value)}</div></div>
        <div className="card"><div className="card-sub">Critical</div><div style={{ fontSize: 22, fontWeight: 700, color: kpis.critical ? "var(--red)" : "var(--ink)" }}>{kpis.critical}</div></div>
        <div className="card"><div className="card-sub">Running low</div><div style={{ fontSize: 22, fontWeight: 700, color: kpis.low ? "#d97706" : "var(--ink)" }}>{kpis.low}</div></div>
      </div>
      )}

      {/* Filters */}
      {(tab === "library" || tab === "overview") && (
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="form-input" style={{ width: 200 }} placeholder="Search name or SKU…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="form-input" style={{ width: 150 }} value={fCat} onChange={(e) => setFCat(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="form-input" style={{ width: 140 }} value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <select className="form-input" style={{ width: 170 }} value={fSup} onChange={(e) => setFSup(e.target.value)}>
            <option value="">All suppliers</option>
            {suppliers.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
          </select>
          <select className="form-input" style={{ width: 140 }} value={fLoc} onChange={(e) => setFLoc(e.target.value)}>
            <option value="">All locations</option>
            {locations.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <label style={{ fontSize: 12, color: "var(--gray)", display: "flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archived
          </label>
          <div style={{ marginLeft: "auto" }}>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Create item</button>}
          </div>
        </div>
      </div>
      )}

      {tab === "library" && (
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Item library</span><span className="card-sub">Master list across all venues · quantities are {selectedVenue === "all" ? "summed across venues" : selectedVenueName}</span></div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr>
                <th>Item</th><th>Category</th><th>Unit</th><th>Supplier</th>
                <th>Cost ex</th><th>Cost inc</th><th>Sale ex</th><th>Sale inc</th><th>Margin</th>
                <th>On hand</th><th>Par</th><th>Reorder at</th><th>Status</th>
              </tr></thead>
              <tbody>
                {rows.map((i) => {
                  const m = marginPct(i.sell, i.cost);
                  return (
                    <tr key={i.id} onClick={() => openEdit(i)} style={{ cursor: "pointer", opacity: i.archived ? 0.5 : 1 }}>
                      <td><strong>{i.name}</strong>{i.archived ? " (archived)" : ""}<div style={{ fontSize: 11, color: "var(--gray)" }}>{i.sku}</div></td>
                      <td><span className="pill" style={{ background: "#f4f4f5", color: stockCategoryColor(i.category) }}>{i.category}</span></td>
                      <td>{i.unit}</td>
                      <td style={{ fontSize: 12 }}>{supplierById[i.supplierId]?.company || "—"}</td>
                      <td>{money(i.cost)}</td>
                      <td style={{ color: "var(--gray)" }}>{money(incGst(i.cost, i.gstApplicable !== false))}</td>
                      <td>{Number(i.sell) > 0 ? money(i.sell) : "—"}</td>
                      <td style={{ color: "var(--gray)" }}>{Number(i.sell) > 0 ? money(incGst(i.sell, i.gstApplicable !== false)) : "—"}</td>
                      <td>{Number(i.sell) > 0 ? <span style={{ fontWeight: 600, color: marginColor(m) }}>{m}%</span> : "—"}</td>
                      <td>
                        <strong>{i.stock.qtyOnHand}</strong> {i.unit}
                        <div style={{ width: 64, height: 4, background: "var(--gray-light)", borderRadius: 2, marginTop: 3 }}>
                          <div style={{ width: `${pctOfPar(i.stock.qtyOnHand, i.stock.par)}%`, height: 4, borderRadius: 2, background: stockStatusMeta(i.stock.status).color }} />
                        </div>
                      </td>
                      <td>{i.stock.par}</td>
                      <td>{i.stock.reorderPoint}</td>
                      <td>{statusPill(i.stock.status)}</td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={13} style={{ color: "var(--gray)" }}>No items match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "overview" && (
        <div className="grid-3">
          {rows.map((i) => (
            <div key={i.id} className="card" style={{ borderColor: i.stock.status === "critical" ? "var(--red)" : undefined }}>
              <div className="card-head">
                <div><span className="card-title" style={{ fontSize: 13 }}>{i.name}</span><span className="card-sub">{i.category} · {supplierById[i.supplierId]?.company || "—"}</span></div>
                {statusPill(i.stock.status)}
              </div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>
                <strong>{i.stock.qtyOnHand} {i.unit}</strong> <span style={{ color: "var(--gray)" }}>of {i.stock.par} par · reorder at {i.stock.reorderPoint}</span>
              </div>
              <div style={{ width: "100%", height: 6, background: "var(--gray-light)", borderRadius: 3 }}>
                <div style={{ width: `${pctOfPar(i.stock.qtyOnHand, i.stock.par)}%`, height: 6, borderRadius: 3, background: stockStatusMeta(i.stock.status).color }} />
              </div>
            </div>
          ))}
          {rows.length === 0 && <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No items match.</div>}
        </div>
      )}

      {tab === "movements" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-head">
              <div><span className="card-title">Stock movements</span><span className="card-sub">POS deductions, deliveries, adjustments — full audit trail</span></div>
              <select className="form-input" style={{ width: 170 }} value={movVenue} onChange={(e) => setMovVenue(e.target.value)}>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            {canEdit && demoItems.length > 0 && (
              <div style={{ background: "#fffbeb", border: "0.5px solid #fde68a", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Demo: simulate a POS sale (runs the real transaction)</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {demoItems.slice(0, 8).map((m) => (
                    <button key={m.id} className="btn btn-sm" disabled={!!selling} onClick={() => demoSell(m)}>
                      {selling === m.id ? "Selling…" : `Sell ${m.displayName} ×1`}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>When</th><th>Type</th><th>Item</th><th>Menu item</th><th>Qty</th><th>Before → After</th><th>Cost</th><th>By</th><th>Ref</th></tr></thead>
                <tbody>
                  {movements.map((mv) => (
                    <tr key={mv.id}>
                      <td>{fmtWhen(mv.createdAt)}</td>
                      <td><span className="pill pill-blue">{movementTypeLabel(mv.type)}</span></td>
                      <td><strong>{mv.itemName || mv.itemId}</strong></td>
                      <td style={{ fontSize: 12 }}>{mv.menuName || "—"}</td>
                      <td style={{ fontWeight: 600, color: (mv.qtyChange || 0) < 0 ? "var(--red)" : "var(--green)" }}>{(mv.qtyChange || 0) > 0 ? "+" : ""}{mv.qtyChange} {mv.unit}</td>
                      <td style={{ fontSize: 12, color: "var(--gray)" }}>{mv.before} → {mv.after}</td>
                      <td>{money(mv.costAtMove)}</td>
                      <td style={{ fontSize: 12 }}>{mv.by || "System"}</td>
                      <td style={{ fontSize: 11, color: "var(--gray)" }}>{mv.reference || "—"}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && <tr><td colSpan={9} style={{ color: "var(--gray)" }}>No movements yet for this venue.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "stocktake" && <StocktakeTab />}
      {tab === "priceadj" && <PriceAdjustTab />}
      {tab === "valuation" && <ValuationTab />}
      {tab === "expiry" && <ExpiryTab />}
      {tab === "scanner" && <ScannerTab />}
      {tab === "adjustments" && <AdjustmentsTab />}

      {/* Create / edit item */}
      {editor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 640 }}>
            <div className="modal-head"><span className="modal-title">{editor.id ? "Edit inventory item" : "New inventory item"}</span><button className="modal-close" onClick={() => setEditor(null)}>✕</button></div>

            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="form-label">Item name</div><input className="form-input" value={editor.name} onChange={(e) => setF("name", e.target.value)} /></div>
              <div><div className="form-label">SKU (blank = auto)</div><input className="form-input" value={editor.sku} onChange={(e) => setF("sku", e.target.value)} placeholder={nextSku(editor.category)} /></div>
              <div><div className="form-label">Category</div>
                <select className="form-input" value={editor.category} onChange={(e) => setF("category", e.target.value)}>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select></div>
              <div><div className="form-label">Unit</div>
                <select className="form-input" value={editor.unit} onChange={(e) => setF("unit", e.target.value)}>
                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select></div>
              <div><div className="form-label">Supplier</div>
                <select className="form-input" value={editor.supplierId} onChange={(e) => setF("supplierId", e.target.value)}>
                  <option value="">—</option>
                  {suppliers.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
                </select></div>
              <div><div className="form-label">Storage location</div>
                <select className="form-input" value={editor.storageLocation} onChange={(e) => setF("storageLocation", e.target.value)}>
                  <option value="">—</option>
                  {locations.map((l) => <option key={l} value={l}>{l}</option>)}
                </select></div>
              <div><div className="form-label">Cost ex-GST ($)</div><input className="form-input" type="number" step="0.01" value={editor.cost} onChange={(e) => setF("cost", e.target.value)} /></div>
              <div><div className="form-label">Sell ex-GST ($, 0 = not sold)</div><input className="form-input" type="number" step="0.01" value={editor.sell} onChange={(e) => setF("sell", e.target.value)} /></div>
            </div>
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, margin: "10px 0" }}>
              <input type="checkbox" checked={!!editor.gstApplicable} onChange={(e) => setF("gstApplicable", e.target.checked)} /> GST applies (10%)
            </label>

            <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 10, marginTop: 4 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>
                Stock levels {editor.id ? "for venue" : "(applied to every venue on create)"}
              </div>
              {editor.id && (
                <select className="form-input" style={{ marginBottom: 8 }} value={editor.venueId} onChange={(e) => switchEditorVenue(e.target.value)}>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              )}
              <div className="grid-4" style={{ gap: 10 }}>
                <div><div className="form-label">On hand</div><input className="form-input" type="number" step="0.001" value={editor.qtyOnHand} onChange={(e) => setF("qtyOnHand", e.target.value)} /></div>
                <div><div className="form-label">Par</div><input className="form-input" type="number" step="0.001" value={editor.par} onChange={(e) => setF("par", e.target.value)} /></div>
                <div><div className="form-label">Reorder at</div><input className="form-input" type="number" step="0.001" value={editor.reorderPoint} onChange={(e) => setF("reorderPoint", e.target.value)} /></div>
                <div><div className="form-label">Reorder qty</div><input className="form-input" type="number" step="0.001" value={editor.reorderQty} onChange={(e) => setF("reorderQty", e.target.value)} /></div>
              </div>
              <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>
                Status preview: {statusPill(computeStockStatus(num(editor.qtyOnHand), num(editor.reorderPoint), num(editor.par)))}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
              <div>
                {canEdit && editor.id && (
                  <button className="btn btn-sm" onClick={() => archive({ id: editor.id, archived: inventoryItems.find((x) => x.id === editor.id)?.archived })}>
                    {inventoryItems.find((x) => x.id === editor.id)?.archived ? "Restore" : "Archive"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setEditor(null)}>Cancel</button>
                {canEdit && <button className="btn btn-primary btn-sm" onClick={save}>{editor.id ? "Save changes" : "Create item"}</button>}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
