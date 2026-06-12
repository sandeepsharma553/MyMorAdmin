import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, setDoc, doc, onSnapshot, query, orderBy, limit, runTransaction, serverTimestamp, arrayUnion } from "firebase/firestore";
import { Html5Qrcode } from "html5-qrcode";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import {
  inventoryItemDoc, stockDoc, stockMovementsCol, stocktakesCol, batchesCol,
} from "../../utils/restaurantGroupPaths";
import { computeStockStatus, stockStatusMeta, marginPct, money, movementTypeLabel, REASON_REQUIRED_TYPES } from "./rgStockUtils";

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const fmtWhen = (ts) => { try { const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return "—"; } };
const todayISO = () => new Date().toISOString().slice(0, 10);

const useVenuePick = () => {
  const { venues, selectedVenue } = useRG();
  const [venueId, setVenueId] = useState("");
  useEffect(() => { setVenueId(selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "")); }, [selectedVenue, venues]);
  return [venueId, setVenueId];
};

const VenueSelect = ({ value, onChange }) => {
  const { venues } = useRG();
  return (
    <select className="form-input" style={{ width: 170 }} value={value} onChange={(e) => onChange(e.target.value)}>
      {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
    </select>
  );
};

/* ── Stocktake (G3 / T5.1): count ALL items, finalise → audit doc + variance movements ── */
export function StocktakeTab() {
  const { groupId, group, staff, inventoryItems, stock, can, showToast, me, myStaff } = useRG();
  const canEdit = can("stock", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";
  const [venueId, setVenueId] = useVenuePick();
  const [fCat, setFCat] = useState("");
  const [counts, setCounts] = useState({}); // itemId -> string
  const [reasons, setReasons] = useState({});
  const [meta, setMeta] = useState({ countedBy: actor, witnessedBy: "", method: "full", freezeDeductions: false, notes: "" });
  const [busy, setBusy] = useState(false);
  const [draftId, setDraftId] = useState(null); // resumed draft stocktake doc id
  useEffect(() => { setDraftId(null); setCounts({}); setReasons({}); }, [venueId]); // a draft belongs to one venue

  const [prev, setPrev] = useState([]);
  useEffect(() => {
    if (!groupId || !venueId) { setPrev([]); return; }
    return onSnapshot(query(stocktakesCol(groupId, venueId), orderBy("createdAt", "desc"), limit(12)),
      (s) => setPrev(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setPrev([]));
  }, [groupId, venueId]);

  const stockByItem = useMemo(() => {
    const m = {};
    stock.forEach((s) => { if (s.venueId === venueId) m[s.id] = s; });
    return m;
  }, [stock, venueId]);

  const rows = useMemo(() => inventoryItems
    .filter((i) => !i.archived && (!fCat || i.category === fCat))
    .map((i) => ({ ...i, sys: Number(stockByItem[i.id]?.qtyOnHand) || 0 }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || "")), [inventoryItems, stockByItem, fCat]);

  const counted = rows.filter((r) => counts[r.id] !== undefined && counts[r.id] !== "" && !isNaN(Number(counts[r.id])));
  const totals = counted.reduce((a, r) => {
    const v = Number(counts[r.id]) - r.sys;
    return { v: a.v + v, d: a.d + v * (Number(r.cost) || 0) };
  }, { v: 0, d: 0 });

  const finalise = async (asDraft) => {
    if (!canEdit || busy) return;
    if (!counted.length) return showToast("Enter at least one physical count");
    setBusy(true);
    try {
      const lines = counted.map((r) => ({
        itemId: r.id, itemName: r.name, systemQty: r.sys, physicalCount: Number(counts[r.id]),
        variance: round4(Number(counts[r.id]) - r.sys),
        varianceValue: round4((Number(counts[r.id]) - r.sys) * (Number(r.cost) || 0)),
        reason: reasons[r.id] || "Correct",
        unit: r.unit || "", unitCost: Number(r.cost) || 0,
      }));
      const stDoc = {
        date: todayISO(), venueId, countedBy: meta.countedBy || actor, witnessedBy: meta.witnessedBy || "",
        method: meta.method, freezeDeductions: !!meta.freezeDeductions, notes: meta.notes || "",
        status: asDraft ? "draft" : "finalised", lines,
        totalVariance: round4(totals.v), totalVarianceValue: round4(totals.d),
        itemsCounted: lines.length,
        finalisedAt: asDraft ? null : serverTimestamp(), createdAt: serverTimestamp(), by: actor,
      };
      if (asDraft) {
        if (draftId) await setDoc(doc(stocktakesCol(groupId, venueId), draftId), stDoc, { merge: true });
        else { const ref = await addDoc(stocktakesCol(groupId, venueId), stDoc); setDraftId(ref.id); }
        showToast("Stocktake draft saved");
      } else {
        // finalise inside a transaction: set counted quantities as absolute,
        // recompute status, and write one 'stocktake' movement per variance.
        await runTransaction(db, async (tx) => {
          const refs = lines.map((l) => stockDoc(groupId, venueId, l.itemId));
          const snaps = await Promise.all(refs.map((r) => tx.get(r)));
          snaps.forEach((snap, i) => {
            const l = lines[i];
            const cur = snap.exists() ? snap.data() : { par: 0, reorderPoint: 0 };
            const before = Number(cur.qtyOnHand) || 0;
            const after = round4(l.physicalCount);
            tx.set(refs[i], {
              qtyOnHand: after, status: computeStockStatus(after, cur.reorderPoint, cur.par),
              lastCountedAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }, { merge: true });
            if (Math.abs(after - before) > 1e-9) {
              tx.set(doc(stockMovementsCol(groupId, venueId)), {
                itemId: l.itemId, itemName: l.itemName, type: "stocktake",
                qtyChange: round4(after - before), before, after, unit: l.unit,
                reason: l.reason, reference: `Stocktake ${stDoc.date}`, menuItemId: null, menuName: "",
                // $ impact from the tx-fresh before/after so it always equals qtyChange × cost
                by: actor, costAtMove: round4((after - before) * l.unitCost), createdAt: serverTimestamp(),
              });
            }
          });
          const stRef = draftId ? doc(stocktakesCol(groupId, venueId), draftId) : doc(stocktakesCol(groupId, venueId));
          tx.set(stRef, stDoc);
        });
        showToast(`Stocktake finalised — ${lines.length} items, variance ${money(totals.d)}`);
        setDraftId(null);
      }
      if (!asDraft) { setCounts({}); setReasons({}); }
    } catch (e) { showToast(`Could not save stocktake: ${e?.code || e?.message || "error"}`); }
    setBusy(false);
  };

  const cats = group?.stockCategories || [];
  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div><span className="card-title">Stocktake</span><span className="card-sub">Count everything — variances post to the movement log when you finalise</span></div>
          <VenueSelect value={venueId} onChange={setVenueId} />
        </div>
        <div className="grid-4" style={{ gap: 10, marginBottom: 10 }}>
          <div><div className="form-label">Counted by</div>
            <select className="form-input" value={meta.countedBy} onChange={(e) => setMeta((p) => ({ ...p, countedBy: e.target.value }))}>
              <option value={actor}>{actor}</option>
              {staff.map((s) => { const n = s.displayName || s.name; return n && n !== actor ? <option key={s.id} value={n}>{n}</option> : null; })}
            </select></div>
          <div><div className="form-label">Witnessed by</div>
            <select className="form-input" value={meta.witnessedBy} onChange={(e) => setMeta((p) => ({ ...p, witnessedBy: e.target.value }))}>
              <option value="">—</option>
              {staff.map((s) => { const n = s.displayName || s.name; return n ? <option key={s.id} value={n}>{n}</option> : null; })}
            </select></div>
          <div><div className="form-label">Method</div>
            <select className="form-input" value={meta.method} onChange={(e) => setMeta((p) => ({ ...p, method: e.target.value }))}>
              <option value="full">Full count</option><option value="spot">Spot check</option><option value="abc">ABC cycle</option>
            </select></div>
          <div><div className="form-label">Category</div>
            <select className="form-input" value={fCat} onChange={(e) => setFCat(e.target.value)}>
              <option value="">All</option>
              {cats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--gray)", marginBottom: 8 }}>
          <span>{counted.length} / {rows.length} items counted</span>
          <span>Total variance: <strong style={{ color: totals.v < 0 ? "var(--red)" : totals.v > 0 ? "var(--green)" : "var(--gray)" }}>{totals.v > 0 ? "+" : ""}{round4(totals.v)}</strong> · <strong style={{ color: totals.d < 0 ? "var(--red)" : totals.d > 0 ? "var(--green)" : "var(--gray)" }}>{totals.d >= 0 ? "+" : "−"}{money(Math.abs(totals.d)).slice(1) ? money(Math.abs(totals.d)) : "$0.00"}</strong></span>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Item</th><th>System</th><th>Physical</th><th>Variance</th><th>$ impact</th><th>Reason</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const has = counts[r.id] !== undefined && counts[r.id] !== "" && !isNaN(Number(counts[r.id]));
                const v = has ? Number(counts[r.id]) - r.sys : null;
                const dollars = has ? v * (Number(r.cost) || 0) : null;
                const col = v === null ? "var(--gray)" : v < 0 ? "var(--red)" : v > 0 ? "var(--green)" : "var(--gray)";
                return (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong><div style={{ fontSize: 11, color: "var(--gray)" }}>{r.category}</div></td>
                    <td>{r.sys} {r.unit}</td>
                    <td><input className="form-input" style={{ width: 90 }} type="number" step="0.001" value={counts[r.id] ?? ""} disabled={!canEdit}
                      onChange={(e) => setCounts((p) => ({ ...p, [r.id]: e.target.value }))} /></td>
                    <td style={{ fontWeight: 600, color: col }}>{v === null ? "—" : `${v > 0 ? "+" : ""}${round4(v)}`}</td>
                    <td style={{ fontWeight: 600, color: col }}>{dollars === null ? "—" : `${dollars > 0 ? "+" : "−"}${money(Math.abs(dollars)).slice(1)}`}</td>
                    <td>
                      <select className="form-input" style={{ width: 130 }} value={reasons[r.id] || "Correct"} disabled={!canEdit || !has}
                        onChange={(e) => setReasons((p) => ({ ...p, [r.id]: e.target.value }))}>
                        {["Correct", "Kitchen use", "Spoilage", "Theft"].map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button className="btn btn-sm" disabled={busy} onClick={() => finalise(true)}>Save draft</button>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => finalise(false)}>{busy ? "Saving…" : "Finalise stocktake"}</button>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Previous stocktakes</span></div>
        <table className="data-table">
          <thead><tr><th>Date</th><th>Counted by</th><th>Witnessed</th><th>Items</th><th>Variances</th><th>$ impact</th><th>Status</th></tr></thead>
          <tbody>
            {prev.map((s) => (
              <tr key={s.id}>
                <td>{s.date || fmtWhen(s.createdAt)}</td>
                <td>{s.countedBy || "—"}</td>
                <td>{s.witnessedBy || "—"}</td>
                <td>{s.itemsCounted ?? (s.lines || []).length}</td>
                <td>{(s.lines || []).filter((l) => l.variance).length}</td>
                <td style={{ color: (s.totalVarianceValue || 0) < 0 ? "var(--red)" : "var(--ink)" }}>{(s.totalVarianceValue || 0) >= 0 ? "+" : "−"}{money(Math.abs(s.totalVarianceValue || 0))}</td>
                <td>
                  {s.status === "finalised" ? <span className="pill pill-green">Finalised</span> : <span className="pill pill-amber">Draft</span>}
                  {s.status !== "finalised" && canEdit && (
                    <button className="btn btn-sm" style={{ marginLeft: 6 }} onClick={() => {
                      const c = {}, rs = {};
                      (s.lines || []).forEach((l) => { c[l.itemId] = String(l.physicalCount); rs[l.itemId] = l.reason || "Correct"; });
                      setCounts(c); setReasons(rs); setDraftId(s.id);
                      setMeta((p) => ({ ...p, countedBy: s.countedBy || p.countedBy, witnessedBy: s.witnessedBy || "", method: s.method || "full", notes: s.notes || "" }));
                    }}>Resume</button>
                  )}
                </td>
              </tr>
            ))}
            {prev.length === 0 && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>No stocktakes recorded yet for this venue.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Price adjustments (G4): real write-back + live margin cascade ── */
export function PriceAdjustTab() {
  const { groupId, inventoryItems, menuItems, recipes, can, showToast, me, myStaff } = useRG();
  const canEdit = can("stock", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";
  const [itemId, setItemId] = useState("");
  const [newCost, setNewCost] = useState("");
  const item = inventoryItems.find((i) => i.id === itemId);

  const affected = useMemo(() => {
    if (!item) return [];
    return recipes
      .filter((r) => (r.ingredients || []).some((g) => g.itemId === item.id))
      .map((r) => {
        const m = menuItems.find((x) => x.id === r.menuItemId);
        if (!m) return null;
        const cost = (use) => (r.ingredients || []).reduce((s, g) => {
          const inv = inventoryItems.find((x) => x.id === g.itemId);
          const c = g.itemId === item.id ? use : (Number(inv?.cost) || 0);
          return s + (Number(g.qty) || 0) * c;
        }, 0);
        const oldFc = cost(Number(item.cost) || 0);
        // 0 is a legal new cost — don't || it away
        const newFc = cost(newCost === "" || isNaN(Number(newCost)) ? (Number(item.cost) || 0) : Number(newCost));
        return { m, oldMargin: marginPct(m.sellPrice, oldFc), newMargin: marginPct(m.sellPrice, newFc) };
      })
      .filter(Boolean);
  }, [item, newCost, recipes, menuItems, inventoryItems]);

  const apply = async () => {
    if (!canEdit || !item) return;
    const nc = Number(newCost);
    if (isNaN(nc) || nc < 0) return showToast("Enter the new cost");
    try {
      await setDoc(inventoryItemDoc(groupId, item.id), {
        cost: nc, updatedAt: serverTimestamp(),
        priceHistory: arrayUnion({ oldCost: Number(item.cost) || 0, newCost: nc, by: actor, at: new Date().toISOString() }),
      }, { merge: true });
      showToast(`${item.name} cost updated ${money(item.cost)} → ${money(nc)} — margins recomputed`);
      setNewCost("");
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  const historyRows = useMemo(() =>
    inventoryItems.flatMap((i) => (i.priceHistory || []).map((h) => ({ ...h, name: i.name, unit: i.unit })))
      .sort((a, b) => (b.at || "").localeCompare(a.at || "")).slice(0, 30), [inventoryItems]);

  return (
    <>
      <div className="card" style={{ marginBottom: 16, maxWidth: 720 }}>
        <div className="card-head"><span className="card-title">Update ingredient cost</span><span className="card-sub">Margins on every menu item using it recompute instantly</span></div>
        <div className="grid-3" style={{ gap: 10 }}>
          <div><div className="form-label">Ingredient</div>
            <select className="form-input" value={itemId} onChange={(e) => { setItemId(e.target.value); setNewCost(""); }}>
              <option value="">Choose…</option>
              {inventoryItems.filter((i) => !i.archived).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select></div>
          <div><div className="form-label">Current cost</div><input className="form-input" disabled value={item ? `${money(item.cost)} / ${item.unit}` : "—"} /></div>
          <div><div className="form-label">New cost ex-GST ($)</div><input className="form-input" type="number" step="0.01" value={newCost} onChange={(e) => setNewCost(e.target.value)} /></div>
        </div>
        {item && newCost !== "" && !isNaN(Number(newCost)) && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, marginBottom: 6 }}>
              Change: <strong style={{ color: Number(newCost) > Number(item.cost) ? "var(--red)" : "var(--green)" }}>
                {(((Number(newCost) - Number(item.cost)) / (Number(item.cost) || 1)) * 100).toFixed(1)}%
              </strong> · affects <strong>{affected.length}</strong> menu item{affected.length === 1 ? "" : "s"}
            </div>
            {affected.map(({ m, oldMargin, newMargin }) => (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <span>{m.displayName}</span>
                <span>
                  margin {oldMargin}% → <strong style={{ color: newMargin < 35 ? "var(--red)" : newMargin < oldMargin ? "#d97706" : "var(--green)" }}>{newMargin}%</strong>
                  {newMargin < 35 && <span className="pill pill-red" style={{ marginLeft: 6 }}>below 35%</span>}
                </span>
              </div>
            ))}
          </div>
        )}
        {canEdit && <div style={{ textAlign: "right", marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={apply} disabled={!item || newCost === ""}>Apply new cost</button></div>}
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Price change history</span></div>
        <table className="data-table">
          <thead><tr><th>When</th><th>Item</th><th>Old</th><th>New</th><th>Change</th><th>By</th></tr></thead>
          <tbody>
            {historyRows.map((h, i) => (
              <tr key={i}>
                <td>{fmtWhen(h.at)}</td>
                <td><strong>{h.name}</strong></td>
                <td>{money(h.oldCost)}/{h.unit}</td>
                <td>{money(h.newCost)}/{h.unit}</td>
                <td style={{ color: h.newCost > h.oldCost ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
                  {h.oldCost ? `${(((h.newCost - h.oldCost) / h.oldCost) * 100).toFixed(1)}%` : "—"}
                </td>
                <td>{h.by}</td>
              </tr>
            ))}
            {historyRows.length === 0 && <tr><td colSpan={6} style={{ color: "var(--gray)" }}>No price changes recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Inventory valuation: per venue or whole group, grouped by category ── */
export function ValuationTab() {
  const { inventoryItems, stock, selectedVenue, selectedVenueName } = useRG();
  const rows = useMemo(() => {
    const qtyByItem = {};
    stock.forEach((s) => {
      if (selectedVenue !== "all" && s.venueId !== selectedVenue) return;
      qtyByItem[s.id] = (qtyByItem[s.id] || 0) + (Number(s.qtyOnHand) || 0);
    });
    return inventoryItems.filter((i) => !i.archived).map((i) => {
      const qty = qtyByItem[i.id] || 0;
      return { ...i, qty, costVal: qty * (Number(i.cost) || 0), retailVal: qty * (Number(i.sell) || 0) };
    });
  }, [inventoryItems, stock, selectedVenue]);

  const byCat = useMemo(() => {
    const m = {};
    rows.forEach((r) => { (m[r.category] = m[r.category] || []).push(r); });
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const totals = rows.reduce((a, r) => ({
    cost: a.cost + r.costVal, retail: a.retail + r.retailVal,
    gst: a.gst + (r.gstApplicable !== false ? r.costVal * 0.1 : 0),
  }), { cost: 0, retail: 0, gst: 0 });
  const margins = rows.filter((r) => Number(r.sell) > 0).map((r) => marginPct(r.sell, r.cost));
  const avgMargin = margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0;

  return (
    <>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="card-sub">Total at cost (ex-GST) — {selectedVenueName}</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(totals.cost)}</div></div>
        <div className="card"><div className="card-sub">Retail value (ex-GST)</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(totals.retail)}</div></div>
        <div className="card"><div className="card-sub">Avg item margin</div><div style={{ fontSize: 22, fontWeight: 700 }}>{avgMargin}%</div></div>
        <div className="card"><div className="card-sub">GST claimable (10%)</div><div style={{ fontSize: 22, fontWeight: 700 }}>{money(totals.gst)}</div></div>
      </div>
      <div className="card">
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Item</th><th>On hand</th><th>Unit cost</th><th>Value at cost</th><th>Value at retail</th></tr></thead>
            <tbody>
              {byCat.map(([cat, items]) => (
                <React.Fragment key={cat}>
                  <tr style={{ background: "var(--gray-light)" }}>
                    <td colSpan={3} style={{ fontWeight: 700 }}>{cat}</td>
                    <td style={{ fontWeight: 700 }}>{money(items.reduce((s, r) => s + r.costVal, 0))}</td>
                    <td style={{ fontWeight: 700 }}>{money(items.reduce((s, r) => s + r.retailVal, 0))}</td>
                  </tr>
                  {items.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{round4(r.qty)} {r.unit}</td>
                      <td>{money(r.cost)}</td>
                      <td>{money(r.costVal)}</td>
                      <td>{Number(r.sell) > 0 ? money(r.retailVal) : "—"}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: "2px solid var(--border)" }}>
                <td colSpan={3}>Total</td><td>{money(totals.cost)}</td><td>{money(totals.retail)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </>
  );
}

/* ── Expiry & batches (G9) ── */
export function ExpiryTab() {
  const { groupId, inventoryItems, can, showToast, me, myStaff } = useRG();
  const canEdit = can("stock", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";
  const [venueId, setVenueId] = useVenuePick();
  const [batches, setBatches] = useState([]);
  useEffect(() => {
    if (!groupId || !venueId) { setBatches([]); return; }
    return onSnapshot(batchesCol(groupId, venueId), (s) => setBatches(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setBatches([]));
  }, [groupId, venueId]);

  const [form, setForm] = useState(null);
  // parse the date-only string as LOCAL end-of-day, not UTC midnight (AEST off-by-one)
  const daysLeft = (b) => Math.ceil((new Date(`${b.bestBefore}T23:59:59`) - new Date()) / 86400000);
  const live = batches.filter((b) => b.status !== "used").map((b) => ({ ...b, days: daysLeft(b) })).sort((a, b) => a.days - b.days);

  const saveBatch = async () => {
    if (!canEdit || !form) return;
    if (!form.itemId || !form.bestBefore) return showToast("Item and best-before are required");
    try {
      await addDoc(batchesCol(groupId, venueId), {
        itemId: form.itemId, itemName: inventoryItems.find((i) => i.id === form.itemId)?.name || form.itemId,
        batchCode: form.batchCode || `B${new Date().getFullYear().toString().slice(2)}-${Math.floor(Math.random() * 900 + 100)}`,
        qty: Number(form.qty) || 0, receivedAt: form.receivedAt || todayISO(), bestBefore: form.bestBefore,
        status: "ok", by: actor, createdAt: serverTimestamp(),
      });
      showToast("Batch added");
      setForm(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };
  const markUsed = async (b) => {
    try { await setDoc(doc(batchesCol(groupId, venueId), b.id), { status: "used", usedAt: serverTimestamp(), usedBy: actor }, { merge: true }); showToast("Batch closed"); }
    catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  const kpi = { d1: live.filter((b) => b.days <= 1).length, d3: live.filter((b) => b.days <= 3).length, d7: live.filter((b) => b.days <= 7).length, all: live.length };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
        <VenueSelect value={venueId} onChange={setVenueId} />
        {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setForm({ itemId: "", batchCode: "", qty: "", receivedAt: todayISO(), bestBefore: "" })}>+ Add batch</button>}
      </div>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="card"><div className="card-sub">Expiring ≤24h</div><div style={{ fontSize: 22, fontWeight: 700, color: kpi.d1 ? "var(--red)" : "var(--ink)" }}>{kpi.d1}</div></div>
        <div className="card"><div className="card-sub">≤3 days</div><div style={{ fontSize: 22, fontWeight: 700, color: kpi.d3 ? "#d97706" : "var(--ink)" }}>{kpi.d3}</div></div>
        <div className="card"><div className="card-sub">≤7 days</div><div style={{ fontSize: 22, fontWeight: 700 }}>{kpi.d7}</div></div>
        <div className="card"><div className="card-sub">Active batches</div><div style={{ fontSize: 22, fontWeight: 700 }}>{kpi.all}</div></div>
      </div>
      <div className="card">
        <div className="card-head"><span className="card-title">Expiry countdown</span><span className="card-sub">Red ≤3 days · amber ≤7 · green beyond</span></div>
        {live.map((b) => {
          const col = b.days <= 3 ? "var(--red)" : b.days <= 7 ? "#d97706" : "var(--green)";
          return (
            <div key={b.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--gray-light)", fontSize: 12 }}>
              <div>
                <strong>{b.itemName}</strong> <span style={{ color: "var(--gray)" }}>· {b.batchCode} · {b.qty || "?"} · best before {b.bestBefore}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <strong style={{ color: col }}>{b.days < 0 ? `expired ${-b.days}d ago` : b.days === 0 ? "today" : `${b.days}d`}</strong>
                {canEdit && <button className="btn btn-sm" onClick={() => markUsed(b)}>{b.days <= 1 ? "Use today" : "Close"}</button>}
              </div>
            </div>
          );
        })}
        {live.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No tracked batches for this venue. Add batches as deliveries arrive.</div>}
      </div>

      {form && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setForm(null)}>
          <div className="rg-modal" style={{ maxWidth: 480 }}>
            <div className="modal-head"><span className="modal-title">New batch</span><button className="modal-close" onClick={() => setForm(null)}>✕</button></div>
            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="form-label">Item</div>
                <select className="form-input" value={form.itemId} onChange={(e) => setForm((p) => ({ ...p, itemId: e.target.value }))}>
                  <option value="">Choose…</option>
                  {inventoryItems.filter((i) => !i.archived).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select></div>
              <div><div className="form-label">Batch code (blank = auto)</div><input className="form-input" value={form.batchCode} onChange={(e) => setForm((p) => ({ ...p, batchCode: e.target.value }))} /></div>
              <div><div className="form-label">Qty</div><input className="form-input" type="number" step="0.001" value={form.qty} onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))} /></div>
              <div><div className="form-label">Received</div><input className="form-input" type="date" value={form.receivedAt} onChange={(e) => setForm((p) => ({ ...p, receivedAt: e.target.value }))} /></div>
              <div><div className="form-label">Best before</div><input className="form-input" type="date" value={form.bestBefore} onChange={(e) => setForm((p) => ({ ...p, bestBefore: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setForm(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={saveBatch}>Add batch</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Barcode scanner: camera (html5-qrcode) + manual SKU lookup ── */
export function ScannerTab() {
  const { inventoryItems, stock, selectedVenue } = useRG();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);

  useEffect(() => () => { // stop camera on unmount
    if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; }
  }, []);

  const startScan = async () => {
    try {
      const sc = new Html5Qrcode("rg-scan-region");
      scannerRef.current = sc;
      setScanning(true);
      await sc.start({ facingMode: "environment" }, { fps: 8, qrbox: 220 }, (text) => {
        setCode(text);
        sc.stop().catch(() => {});
        scannerRef.current = null;
        setScanning(false);
      }, () => {});
    } catch {
      setScanning(false);
      scannerRef.current = null;
    }
  };
  const stopScan = () => { if (scannerRef.current) { scannerRef.current.stop().catch(() => {}); scannerRef.current = null; } setScanning(false); };

  const matches = code.trim().length > 2
    ? inventoryItems.filter((i) => (i.sku || "").toLowerCase().includes(code.trim().toLowerCase()) || (i.name || "").toLowerCase().includes(code.trim().toLowerCase()))
    : [];
  const qtyOf = (id) => stock.filter((s) => s.id === id && (selectedVenue === "all" || s.venueId === selectedVenue)).reduce((a, s) => a + (Number(s.qtyOnHand) || 0), 0);

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <div className="card-head"><span className="card-title">Barcode / SKU lookup</span><span className="card-sub">Scan with the camera or type a SKU</span></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        <input className="form-input" style={{ flex: 1 }} placeholder="Scan or type SKU / name…" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
        {!scanning
          ? <button className="btn btn-sm" onClick={startScan}>📷 Scan</button>
          : <button className="btn btn-sm" onClick={stopScan}>Stop</button>}
      </div>
      <div id="rg-scan-region" style={{ width: "100%", display: scanning ? "block" : "none", marginBottom: 10 }} />
      {matches.map((i) => {
        const m = stockStatusMeta((stock.find((s) => s.id === i.id && (selectedVenue === "all" || s.venueId === selectedVenue)) || {}).status || "ok");
        return (
          <div key={i.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--gray-light)", fontSize: 12 }}>
            <span><strong>{i.name}</strong> <span style={{ color: "var(--gray)" }}>· {i.sku}</span></span>
            <span><strong>{round4(qtyOf(i.id))} {i.unit}</strong> <span className="pill" style={{ background: m.bg, color: m.color, marginLeft: 6 }}>{m.label}</span></span>
          </div>
        );
      })}
      {code.trim().length > 2 && matches.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No item matches “{code}”.</div>}
    </div>
  );
}

/* ── Adjustment history (G10) + manual adjustment with MANDATORY reason ── */
export function AdjustmentsTab() {
  const { groupId, inventoryItems, can, showToast, me, myStaff } = useRG();
  const canEdit = can("stock", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";
  const [venueId, setVenueId] = useVenuePick();
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!groupId || !venueId) { setRows([]); return; }
    return onSnapshot(query(stockMovementsCol(groupId, venueId), orderBy("createdAt", "desc"), limit(200)),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((m) => m.type !== "posSale" && m.type !== "delivery")),
      () => setRows([]));
  }, [groupId, venueId]);

  const [form, setForm] = useState({ itemId: "", type: "manualAdj", qty: "", reason: "" });
  const [adjBusy, setAdjBusy] = useState(false);
  const submit = async () => {
    if (!canEdit || adjBusy) return;
    const item = inventoryItems.find((i) => i.id === form.itemId);
    const delta = Number(form.qty);
    if (!item || isNaN(delta) || delta === 0) return showToast("Pick an item and a non-zero quantity");
    if (REASON_REQUIRED_TYPES.includes(form.type) && !form.reason.trim()) return showToast("A reason is mandatory for adjustments and wastage");
    const signed = form.type === "wastage" || form.type === "transferOut" ? -Math.abs(delta) : form.type === "transferIn" ? Math.abs(delta) : delta;
    setAdjBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = stockDoc(groupId, venueId, item.id);
        const snap = await tx.get(ref);
        const cur = snap.exists() ? snap.data() : { qtyOnHand: 0, par: 0, reorderPoint: 0 };
        const before = Number(cur.qtyOnHand) || 0;
        const after = Math.max(0, round4(before + signed));
        tx.set(ref, { qtyOnHand: after, status: computeStockStatus(after, cur.reorderPoint, cur.par), updatedAt: serverTimestamp() }, { merge: true });
        tx.set(doc(stockMovementsCol(groupId, venueId)), {
          itemId: item.id, itemName: item.name, type: form.type,
          qtyChange: round4(after - before), before, after, unit: item.unit || "",
          reason: form.reason.trim(), reference: "", menuItemId: null, menuName: "",
          by: actor, costAtMove: round4(Math.abs(after - before) * (Number(item.cost) || 0)),
          createdAt: serverTimestamp(),
        });
      });
      showToast("Adjustment recorded");
      setForm({ itemId: "", type: "manualAdj", qty: "", reason: "" });
    } catch (e) { showToast(`Could not adjust: ${e?.code || e?.message || "error"}`); }
    setAdjBusy(false);
  };

  return (
    <>
      {canEdit && (
        <div className="card" style={{ marginBottom: 16, maxWidth: 760 }}>
          <div className="card-head"><span className="card-title">Manual adjustment</span><span className="card-sub">Reason is mandatory for adjustments & wastage — it lands in the audit trail</span></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ minWidth: 180 }}><div className="form-label">Venue</div><VenueSelect value={venueId} onChange={setVenueId} /></div>
            <div style={{ flex: 1, minWidth: 170 }}><div className="form-label">Item</div>
              <select className="form-input" value={form.itemId} onChange={(e) => setForm((p) => ({ ...p, itemId: e.target.value }))}>
                <option value="">Choose…</option>
                {inventoryItems.filter((i) => !i.archived).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select></div>
            <div><div className="form-label">Type</div>
              <select className="form-input" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}>
                <option value="manualAdj">Manual adjustment (±)</option>
                <option value="wastage">Wastage write-off</option>
                <option value="transferIn">Transfer in</option>
                <option value="transferOut">Transfer out</option>
              </select></div>
            <div><div className="form-label">Qty</div><input className="form-input" style={{ width: 90 }} type="number" step="0.001" value={form.qty} onChange={(e) => setForm((p) => ({ ...p, qty: e.target.value }))} /></div>
            <div style={{ flex: 1, minWidth: 160 }}><div className="form-label">Reason{REASON_REQUIRED_TYPES.includes(form.type) ? " (required)" : ""}</div>
              <input className="form-input" value={form.reason} onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))} /></div>
            <button className="btn btn-primary btn-sm" disabled={adjBusy} onClick={submit}>{adjBusy ? "Saving…" : "Record"}</button>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-head">
          <div><span className="card-title">Adjustment history</span><span className="card-sub">Everything except POS sales and deliveries</span></div>
          {!canEdit && <VenueSelect value={venueId} onChange={setVenueId} />}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>When</th><th>Item</th><th>Type</th><th>Qty</th><th>Before → After</th><th>Reason</th><th>By</th><th>Cost impact</th></tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td>{fmtWhen(m.createdAt)}</td>
                  <td><strong>{m.itemName || m.itemId}</strong></td>
                  <td><span className="pill pill-blue">{movementTypeLabel(m.type)}</span></td>
                  <td style={{ fontWeight: 600, color: (m.qtyChange || 0) < 0 ? "var(--red)" : "var(--green)" }}>{(m.qtyChange || 0) > 0 ? "+" : ""}{m.qtyChange} {m.unit}</td>
                  <td style={{ fontSize: 12, color: "var(--gray)" }}>{m.before} → {m.after}</td>
                  <td style={{ fontSize: 12 }}>{m.reason || "—"}</td>
                  <td style={{ fontSize: 12 }}>{m.by || "—"}</td>
                  <td style={{ color: (m.qtyChange || 0) < 0 ? "var(--red)" : "var(--green)" }}>{(m.qtyChange || 0) < 0 ? "−" : "+"}{money(Math.abs(m.costAtMove || 0))}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={8} style={{ color: "var(--gray)" }}>No adjustments recorded for this venue.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
