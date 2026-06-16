import React, { useMemo, useState } from "react";
import { addDoc, setDoc, serverTimestamp, runTransaction, writeBatch, doc } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { useRG } from "./RGContext";
import {
  purchaseOrdersCol, purchaseOrderDoc, suppliersCol, supplierDoc, stockDoc, stockMovementsCol, inventoryItemDoc,
} from "../../utils/restaurantGroupPaths";
import { sendNotification } from "./notify";
import { computeStockStatus, poStatusMeta, money } from "./rgStockUtils";

const fmtWhen = (ts) => { try { const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return "—"; } };
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const poLabel = (po) => po.poNumber || `PO-${(po.id || "").slice(0, 6).toUpperCase()}`;

export default function SupplierPage() {
  const {
    groupId, venues, suppliers, purchaseOrders, inventoryItems, menuItems, stock,
    selectedVenue, venueName, can, showToast, me, myStaff,
  } = useRG();
  const canEdit = can("supplier", "edit");
  const actor = myStaff?.displayName || myStaff?.name || me?.name || me?.email || "Admin";

  const [tab, setTab] = useState("reorder"); // reorder | active | create | directory | history

  const supplierById = useMemo(() => Object.fromEntries(suppliers.map((s) => [s.id, s])), [suppliers]);
  const menuById = useMemo(() => Object.fromEntries(menuItems.map((m) => [m.id, m])), [menuItems]);

  const inVenueScope = (po) => selectedVenue === "all" || po.venueId === selectedVenue;
  const drafts = useMemo(() => purchaseOrders.filter((p) => p.status === "draft" && inVenueScope(p))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [purchaseOrders, selectedVenue]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = useMemo(() => purchaseOrders.filter((p) => ["pending", "confirmed", "inTransit"].includes(p.status) && inVenueScope(p))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), [purchaseOrders, selectedVenue]); // eslint-disable-line react-hooks/exhaustive-deps
  const history = useMemo(() => purchaseOrders.filter((p) => ["received", "completed", "dismissed"].includes(p.status) && inVenueScope(p))
    .sort((a, b) => (b.receivedAt?.seconds || b.updatedAt?.seconds || 0) - (a.receivedAt?.seconds || a.updatedAt?.seconds || 0)), [purchaseOrders, selectedVenue]); // eslint-disable-line react-hooks/exhaustive-deps

  // editable draft quantities (local until approve/save)
  const [qtyDraft, setQtyDraft] = useState({}); // poId -> {itemId: qty}
  const draftLines = (po) => (po.lines || []).map((l) => ({ ...l, qty: Number(qtyDraft[po.id]?.[l.itemId] ?? l.qty) || 0 }));
  const draftTotal = (po) => draftLines(po).reduce((s, l) => s + l.qty * (Number(l.unitCost) || 0), 0);

  const patchPO = async (po, patch, okMsg) => {
    try {
      await setDoc(purchaseOrderDoc(groupId, po.id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
      if (okMsg) showToast(okMsg);
    } catch (e) { showToast(`Could not update: ${e?.code || e?.message || "error"}`); }
  };

  const approve = async (po) => {
    if (!canEdit) return;
    const lines = draftLines(po);
    await patchPO(po, {
      lines, total: round4(lines.reduce((s, l) => s + l.qty * (Number(l.unitCost) || 0), 0)),
      status: "pending", sentAt: serverTimestamp(), createdBy: po.createdBy === "auto" ? "auto" : (po.createdBy || actor), approvedBy: actor,
    }, `${poLabel(po)} approved & sent to ${supplierById[po.supplierId]?.company || "supplier"}`);
    sendNotification(groupId, { to: "managers", type: "supplier", title: "Purchase order sent", body: `${poLabel(po)} → ${supplierById[po.supplierId]?.company || "?"} · ${money(draftTotal(po))}`, venueId: po.venueId, by: actor });
  };

  const approveAll = async () => {
    if (!canEdit || !drafts.length) return;
    try {
      const batch = writeBatch(db);
      drafts.forEach((po) => {
        const lines = draftLines(po);
        batch.set(purchaseOrderDoc(groupId, po.id), {
          lines, total: round4(lines.reduce((s, l) => s + l.qty * (Number(l.unitCost) || 0), 0)),
          status: "pending", sentAt: serverTimestamp(), approvedBy: actor, updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      showToast(`${drafts.length} draft PO${drafts.length > 1 ? "s" : ""} approved & sent`);
    } catch (e) { showToast(`Could not approve: ${e?.code || e?.message || "error"}`); }
  };

  // ── receive flow (G5 / T3.2): stock receipt updates stock in a TRANSACTION ──
  const [receiving, setReceiving] = useState(null); // {po, lines:[{...l, qtyReceived, note}], file}
  const [receiveBusy, setReceiveBusy] = useState(false);
  const openReceive = (po) => setReceiving({
    po, file: null,
    lines: (po.lines || []).map((l) => ({ ...l, qtyReceived: l.qty, note: "" })),
  });
  const setRecLine = (i, k, v) => setReceiving((p) => ({ ...p, lines: p.lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)) }));

  const confirmReceive = async () => {
    if (!canEdit || !receiving || receiveBusy) return;
    setReceiveBusy(true);
    const { po, lines, file } = receiving;
    try {
      let invoiceUrl = po.invoiceUrl || "";
      if (file) {
        const r = storageRef(storage, `restaurantGroups/${groupId}/invoices/${po.id}/${Date.now()}-${file.name}`);
        await uploadBytes(r, file);
        invoiceUrl = await getDownloadURL(r);
      }
      const discrepancies = lines
        .filter((l) => Number(l.qtyReceived) !== Number(l.qty) || l.note)
        .map((l) => `${l.itemName || l.itemId}: ordered ${l.qty}, received ${l.qtyReceived}${l.note ? ` — ${l.note}` : ""}`);

      // read-modify-write on stock → transaction, never a batch (hard rule 4)
      await runTransaction(db, async (tx) => {
        // idempotency: re-read the PO first — a double-click or a second user
        // receiving the same PO must not increment stock twice.
        const poSnap = await tx.get(purchaseOrderDoc(groupId, po.id));
        const poStatus = poSnap.exists() ? poSnap.data().status : null;
        if (poStatus === "received" || poStatus === "completed") throw new Error("already-received");
        const refs = lines.map((l) => stockDoc(groupId, po.venueId, l.itemId));
        const snaps = await Promise.all(refs.map((r) => tx.get(r)));
        snaps.forEach((snap, i) => {
          const l = lines[i];
          const qtyRec = Number(l.qtyReceived) || 0;
          if (qtyRec <= 0) return;
          const cur = snap.exists() ? snap.data() : { qtyOnHand: 0, par: 0, reorderPoint: 0, reorderQty: 0 };
          const before = Number(cur.qtyOnHand) || 0;
          const after = round4(before + qtyRec);
          // Phase 2 (per-venue cost): weighted-average against THIS venue's on-hand only.
          const lineUnitCost = Number(l.unitCost) || 0;
          const vOld = (cur.cost != null && !isNaN(Number(cur.cost))) ? Number(cur.cost) : lineUnitCost;
          const newCost = after > 0 ? round4((before * vOld + qtyRec * lineUnitCost) / after) : vOld;
          const histEntry = { cost: newCost, qty: qtyRec, source: `receipt ${poLabel(po)}`, by: actor, at: new Date().toISOString() };
          tx.set(refs[i], {
            qtyOnHand: after,
            status: computeStockStatus(after, cur.reorderPoint, cur.par),
            cost: newCost, costMethod: "wavg", costHistory: [...(Array.isArray(cur.costHistory) ? cur.costHistory : []), histEntry],
            updatedAt: serverTimestamp(),
          }, { merge: true });
          // last-known / reference cost at the group item (used as fallback for venues with no stock.cost)
          tx.set(inventoryItemDoc(groupId, l.itemId), { cost: lineUnitCost, updatedAt: serverTimestamp() }, { merge: true });
          tx.set(doc(stockMovementsCol(groupId, po.venueId)), {
            itemId: l.itemId, itemName: l.itemName || l.itemId, type: "delivery",
            qtyChange: qtyRec, before, after, unit: l.unit || "",
            reason: "", reference: poLabel(po), menuItemId: null, menuName: "",
            by: actor, costAtMove: round4(qtyRec * lineUnitCost),
            createdAt: serverTimestamp(),
          });
        });
        tx.set(purchaseOrderDoc(groupId, po.id), {
          status: "received", receivedAt: serverTimestamp(), receivedBy: actor,
          receivedLines: lines.map((l) => ({ itemId: l.itemId, qtyReceived: Number(l.qtyReceived) || 0 })),
          discrepancies, invoiceUrl, updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      showToast(`${poLabel(po)} received — stock updated${discrepancies.length ? ` · ${discrepancies.length} discrepanc${discrepancies.length > 1 ? "ies" : "y"} flagged` : ""}`);
      setReceiving(null);
    } catch (e) {
      if (e?.message === "already-received") { showToast("This order was already received — stock not changed twice"); setReceiving(null); }
      else showToast(`Could not receive: ${e?.code || e?.message || "error"}`);
    }
    setReceiveBusy(false);
  };

  // ── manual PO builder ──
  const blankOrder = () => ({
    supplierId: suppliers.find((s) => !s.archived)?.id || "", venueId: selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || ""),
    expectedAt: "", notes: "", lines: [],
  });
  const [order, setOrder] = useState(blankOrder);
  const [pick, setPick] = useState("");
  const addLine = (item) => {
    if (!item || order.lines.some((l) => l.itemId === item.id)) return;
    const venueStock = stock.find((s) => s.id === item.id && s.venueId === order.venueId);
    setOrder((p) => ({ ...p, lines: [...p.lines, { itemId: item.id, itemName: item.name, unit: item.unit || "", qty: Number(venueStock?.reorderQty) || 1, unitCost: Number(item.cost) || 0 }] }));
    setPick("");
  };
  const orderTotal = order.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unitCost) || 0), 0);
  const pickMatches = pick.trim()
    ? inventoryItems.filter((i) => !i.archived && (i.name || "").toLowerCase().includes(pick.trim().toLowerCase())).slice(0, 6)
    : [];

  const submitOrder = async (status) => {
    if (!canEdit) return;
    if (!order.supplierId || !order.venueId || !order.lines.length) return showToast("Pick a supplier, venue and at least one line");
    try {
      await addDoc(purchaseOrdersCol(groupId), {
        status, autoDraft: false, itemKey: null,
        poNumber: `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`,
        supplierId: order.supplierId, venueId: order.venueId,
        lines: order.lines.map((l) => ({ ...l, qty: Number(l.qty) || 0, unitCost: Number(l.unitCost) || 0 })),
        total: round4(orderTotal), triggeredBy: [],
        notes: order.notes || "", createdBy: actor,
        sentAt: status === "pending" ? serverTimestamp() : null,
        expectedAt: order.expectedAt || null, receivedAt: null,
        receivedLines: [], discrepancies: [], invoiceUrl: "",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      showToast(status === "pending" ? "Order sent" : "Draft saved");
      setOrder(blankOrder());
      setTab(status === "pending" ? "active" : "reorder");
    } catch (e) { showToast(`Could not create order: ${e?.code || e?.message || "error"}`); }
  };

  // ── supplier directory ──
  const [supForm, setSupForm] = useState(null);
  const openSup = (s) => setSupForm(s ? { ...s, venueIds: s.venueIds || [] } : { id: null, company: "", contactName: "", phone: "", email: "", leadTime: "", terms: "", venueIds: venues.map((v) => v.id), archived: false });
  const saveSup = async () => {
    if (!canEdit || !supForm) return;
    if (!supForm.company.trim()) return showToast("Company name is required");
    const data = {
      company: supForm.company.trim(), contactName: supForm.contactName || "", phone: supForm.phone || "",
      email: supForm.email || "", leadTime: supForm.leadTime || "", terms: supForm.terms || "",
      venueIds: supForm.venueIds, archived: !!supForm.archived,
    };
    try {
      if (supForm.id) await setDoc(supplierDoc(groupId, supForm.id), data, { merge: true });
      else await addDoc(suppliersCol(groupId), { ...data, createdAt: serverTimestamp() });
      showToast("Supplier saved");
      setSupForm(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };

  const statusPill = (st) => {
    const m = poStatusMeta(st === "dismissed" ? "completed" : st);
    return <span className="pill" style={{ background: m.bg, color: m.color }}>{st === "dismissed" ? "Dismissed" : m.label}</span>;
  };
  const provenanceLine = (po) => {
    if (!Array.isArray(po.triggeredBy) || !po.triggeredBy.length) return null;
    const names = [...new Set(po.triggeredBy.map((t) => menuById[t.menuItemId]?.displayName || t.menuItemId))];
    return `Triggered by ${po.triggeredBy.length} POS sale${po.triggeredBy.length > 1 ? "s" : ""} — ${names.slice(0, 3).join(", ")}`;
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          <button className={`tab ${tab === "reorder" ? "active" : ""}`} onClick={() => setTab("reorder")}>Auto-reorder{drafts.length > 0 ? ` (${drafts.length})` : ""}</button>
          <button className={`tab ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>Active orders</button>
          {canEdit && <button className={`tab ${tab === "create" ? "active" : ""}`} onClick={() => setTab("create")}>Create order</button>}
          <button className={`tab ${tab === "directory" ? "active" : ""}`} onClick={() => setTab("directory")}>Directory</button>
          <button className={`tab ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>History</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>{suppliers.filter((s) => !s.archived).length} suppliers · {active.length} active orders</div>
      </div>

      {tab === "reorder" && (
        <>
          <div className="card" style={{ marginBottom: 16, background: "#fffbeb", borderColor: "#fde68a" }}>
            <div style={{ fontSize: 12 }}>
              <strong>Auto-reorder:</strong> when a POS sale takes an item to or below its reorder point, a draft PO is raised here automatically with provenance (which dish triggered it). Review, adjust quantities and approve.
            </div>
          </div>
          {canEdit && drafts.length > 1 && (
            <div style={{ marginBottom: 12, textAlign: "right" }}>
              <button className="btn btn-primary btn-sm" onClick={approveAll}>Approve all {drafts.length} drafts</button>
            </div>
          )}
          {drafts.length === 0 && <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No draft purchase orders. Sales that cross a reorder point will raise drafts here.</div>}
          {drafts.map((po) => (
            <div key={po.id} className="card" style={{ marginBottom: 12 }}>
              <div className="card-head">
                <div>
                  <span className="card-title">{poLabel(po)} — {supplierById[po.supplierId]?.company || "No supplier"}</span>
                  <span className="card-sub">{venueName(po.venueId) || po.venueId} · created {fmtWhen(po.createdAt)}{po.autoDraft ? " · auto" : ` · ${po.createdBy || ""}`}</span>
                </div>
                {statusPill(po.status)}
              </div>
              {provenanceLine(po) && <div style={{ fontSize: 11, color: "#92400e", background: "#fffbeb", borderRadius: 6, padding: "4px 8px", marginBottom: 8 }}>{provenanceLine(po)}</div>}
              {draftLines(po).map((l) => (
                <div key={l.itemId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ flex: 1 }}><strong>{l.itemName || l.itemId}</strong></span>
                  {canEdit ? (
                    <input className="form-input" style={{ width: 80 }} type="number" step="0.001" value={qtyDraft[po.id]?.[l.itemId] ?? l.qty}
                      onChange={(e) => setQtyDraft((p) => ({ ...p, [po.id]: { ...(p[po.id] || {}), [l.itemId]: e.target.value } }))} />
                  ) : <span>{l.qty}</span>}
                  <span style={{ color: "var(--gray)" }}>{l.unit} × {money(l.unitCost)}</span>
                  <strong style={{ width: 80, textAlign: "right" }}>{money(l.qty * (Number(l.unitCost) || 0))}</strong>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <strong style={{ fontSize: 13 }}>Total {money(draftTotal(po))} <span style={{ color: "var(--gray)", fontWeight: 400 }}>ex-GST</span></strong>
                {canEdit && (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => patchPO(po, { status: "dismissed", dismissedBy: actor }, "Draft dismissed")}>Dismiss</button>
                    <button className="btn btn-primary btn-sm" onClick={() => approve(po)}>Approve & send</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {tab === "active" && (
        <div className="card">
          <div className="card-head"><span className="card-title">Active orders</span><span className="card-sub">Sent to suppliers, awaiting delivery</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>PO #</th><th>Supplier</th><th>Venue</th><th>Items</th><th>Total</th><th>By</th><th>Sent</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {active.map((po) => (
                  <tr key={po.id}>
                    <td><strong>{poLabel(po)}</strong></td>
                    <td>{supplierById[po.supplierId]?.company || "—"}</td>
                    <td style={{ fontSize: 12 }}>{venueName(po.venueId) || po.venueId}</td>
                    <td style={{ fontSize: 12 }}>{(po.lines || []).map((l) => `${l.itemName || l.itemId} ×${l.qty}`).join(", ")}</td>
                    <td>{money(po.total)}</td>
                    <td style={{ fontSize: 12 }}>{po.createdBy === "auto" ? "Auto" : po.createdBy || "—"}</td>
                    <td style={{ fontSize: 12 }}>{fmtWhen(po.sentAt)}</td>
                    <td>{statusPill(po.status)}</td>
                    <td>
                      {canEdit && (
                        <div style={{ display: "flex", gap: 4 }}>
                          {po.status === "pending" && <button className="btn btn-sm" onClick={() => patchPO(po, { status: "confirmed" }, "Marked confirmed")}>Confirm</button>}
                          {po.status === "confirmed" && <button className="btn btn-sm" onClick={() => patchPO(po, { status: "inTransit" }, "Marked in transit")}>In transit</button>}
                          <button className="btn btn-primary btn-sm" onClick={() => openReceive(po)}>Receive</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {active.length === 0 && <tr><td colSpan={9} style={{ color: "var(--gray)" }}>No active orders.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "create" && canEdit && (
        <div className="card" style={{ maxWidth: 720 }}>
          <div className="card-head"><span className="card-title">Create purchase order</span><span className="card-sub">Manual order from the item library</span></div>
          <div className="grid-3" style={{ gap: 10, marginBottom: 10 }}>
            <div><div className="form-label">Supplier</div>
              <select className="form-input" value={order.supplierId} onChange={(e) => setOrder((p) => ({ ...p, supplierId: e.target.value }))}>
                <option value="">Choose…</option>
                {suppliers.filter((s) => !s.archived).map((s) => <option key={s.id} value={s.id}>{s.company}</option>)}
              </select></div>
            <div><div className="form-label">Deliver to</div>
              <select className="form-input" value={order.venueId} onChange={(e) => setOrder((p) => ({ ...p, venueId: e.target.value }))}>
                <option value="">Choose…</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            <div><div className="form-label">Expected delivery</div>
              <input className="form-input" type="date" value={order.expectedAt} onChange={(e) => setOrder((p) => ({ ...p, expectedAt: e.target.value }))} /></div>
          </div>
          <div className="form-label">Add items</div>
          <input className="form-input" placeholder="Search item library…" value={pick} onChange={(e) => setPick(e.target.value)} />
          {pickMatches.length > 0 && (
            <div style={{ border: "0.5px solid var(--border)", borderRadius: 8, marginTop: 4 }}>
              {pickMatches.map((i) => (
                <div key={i.id} onClick={() => addLine(i)} style={{ padding: "6px 10px", fontSize: 12, cursor: "pointer", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <strong>{i.name}</strong> <span style={{ color: "var(--gray)" }}>· {i.unit} · {money(i.cost)} · {supplierById[i.supplierId]?.company || "—"}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 10 }}>
            {order.lines.map((l, idx) => (
              <div key={l.itemId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <span style={{ flex: 1 }}><strong>{l.itemName}</strong></span>
                <input className="form-input" style={{ width: 76 }} type="number" step="0.001" value={l.qty}
                  onChange={(e) => setOrder((p) => ({ ...p, lines: p.lines.map((x, j) => (j === idx ? { ...x, qty: e.target.value } : x)) }))} />
                <span style={{ color: "var(--gray)" }}>{l.unit} ×</span>
                <input className="form-input" style={{ width: 84 }} type="number" step="0.01" value={l.unitCost}
                  onChange={(e) => setOrder((p) => ({ ...p, lines: p.lines.map((x, j) => (j === idx ? { ...x, unitCost: e.target.value } : x)) }))} />
                <strong style={{ width: 80, textAlign: "right" }}>{money((Number(l.qty) || 0) * (Number(l.unitCost) || 0))}</strong>
                <button className="btn btn-sm" onClick={() => setOrder((p) => ({ ...p, lines: p.lines.filter((_, j) => j !== idx) }))}>✕</button>
              </div>
            ))}
            {order.lines.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: "8px 0" }}>No lines yet — search above to add items.</div>}
          </div>
          <div className="form-label" style={{ marginTop: 8 }}>Notes for supplier</div>
          <textarea className="form-input" rows={2} value={order.notes} onChange={(e) => setOrder((p) => ({ ...p, notes: e.target.value }))} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <strong>Total {money(orderTotal)} <span style={{ color: "var(--gray)", fontWeight: 400 }}>ex-GST</span></strong>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-sm" onClick={() => submitOrder("draft")}>Save draft</button>
              <button className="btn btn-primary btn-sm" onClick={() => submitOrder("pending")}>Send order</button>
            </div>
          </div>
        </div>
      )}

      {tab === "directory" && (
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Supplier directory</span><span className="card-sub">{suppliers.filter((s) => !s.archived).length} active relationships</span></div>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => openSup(null)}>+ Add supplier</button>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Lead time</th><th>Venues supplied</th></tr></thead>
              <tbody>
                {suppliers.filter((s) => !s.archived).map((s) => (
                  <tr key={s.id} onClick={() => canEdit && openSup(s)} style={{ cursor: canEdit ? "pointer" : "default" }}>
                    <td><strong>{s.company}</strong></td>
                    <td>{s.contactName || "—"}</td>
                    <td>{s.phone || "—"}</td>
                    <td style={{ fontSize: 12 }}>{s.email || "—"}</td>
                    <td>{s.leadTime || "—"}</td>
                    <td style={{ fontSize: 12 }}>{(s.venueIds || []).length === venues.length ? "All venues" : (s.venueIds || []).map((id) => venueName(id) || id).join(", ") || "—"}</td>
                  </tr>
                ))}
                {suppliers.filter((s) => !s.archived).length === 0 && <tr><td colSpan={6} style={{ color: "var(--gray)" }}>No suppliers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "history" && (
        <div className="card">
          <div className="card-head"><span className="card-title">Order history</span><span className="card-sub">Received, completed and dismissed orders</span></div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>PO #</th><th>Supplier</th><th>Venue</th><th>Items</th><th>Total</th><th>Sent</th><th>Received</th><th>Discrepancies</th><th>Invoice</th><th>Status</th></tr></thead>
              <tbody>
                {history.map((po) => (
                  <tr key={po.id}>
                    <td><strong>{poLabel(po)}</strong></td>
                    <td>{supplierById[po.supplierId]?.company || "—"}</td>
                    <td style={{ fontSize: 12 }}>{venueName(po.venueId) || po.venueId}</td>
                    <td style={{ fontSize: 12 }}>{(po.lines || []).map((l) => `${l.itemName || l.itemId} ×${l.qty}`).join(", ")}</td>
                    <td>{money(po.total)}</td>
                    <td style={{ fontSize: 12 }}>{fmtWhen(po.sentAt)}</td>
                    <td style={{ fontSize: 12 }}>{fmtWhen(po.receivedAt)}</td>
                    <td style={{ fontSize: 12, color: (po.discrepancies || []).length ? "var(--red)" : "var(--gray)" }}>{(po.discrepancies || []).join("; ") || "None"}</td>
                    <td>{po.invoiceUrl ? <a href={po.invoiceUrl} target="_blank" rel="noreferrer">View</a> : "—"}</td>
                    <td>{statusPill(po.status)}</td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan={10} style={{ color: "var(--gray)" }}>No completed orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* receive modal (G5) */}
      {receiving && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setReceiving(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">Receive {poLabel(receiving.po)}</span><button className="modal-close" onClick={() => setReceiving(null)}>✕</button></div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 10 }}>
              Enter what actually arrived. Short or substituted lines are flagged as discrepancies; stock is updated with the received amounts.
            </div>
            {receiving.lines.map((l, i) => (
              <div key={l.itemId} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <span style={{ flex: 1 }}><strong>{l.itemName || l.itemId}</strong><div style={{ color: "var(--gray)", fontSize: 11 }}>ordered {l.qty} {l.unit}</div></span>
                <input className="form-input" style={{ width: 84 }} type="number" step="0.001" value={l.qtyReceived} onChange={(e) => setRecLine(i, "qtyReceived", e.target.value)} />
                <input className="form-input" style={{ width: 150 }} placeholder="Note (short/sub…)" value={l.note} onChange={(e) => setRecLine(i, "note", e.target.value)} />
              </div>
            ))}
            <div style={{ marginTop: 10 }}>
              <div className="form-label">Invoice (photo or PDF, optional)</div>
              <input type="file" accept="image/*,.pdf" onChange={(e) => setReceiving((p) => ({ ...p, file: e.target.files?.[0] || null }))} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button className="btn btn-sm" disabled={receiveBusy} onClick={() => setReceiving(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" disabled={receiveBusy} onClick={confirmReceive}>{receiveBusy ? "Receiving…" : "Confirm receipt"}</button>
            </div>
          </div>
        </div>
      )}

      {/* supplier modal */}
      {supForm && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setSupForm(null)}>
          <div className="rg-modal" style={{ maxWidth: 520 }}>
            <div className="modal-head"><span className="modal-title">{supForm.id ? "Edit supplier" : "New supplier"}</span><button className="modal-close" onClick={() => setSupForm(null)}>✕</button></div>
            <div className="grid-2" style={{ gap: 10 }}>
              <div><div className="form-label">Company</div><input className="form-input" value={supForm.company} onChange={(e) => setSupForm((p) => ({ ...p, company: e.target.value }))} /></div>
              <div><div className="form-label">Contact name</div><input className="form-input" value={supForm.contactName} onChange={(e) => setSupForm((p) => ({ ...p, contactName: e.target.value }))} /></div>
              <div><div className="form-label">Phone</div><input className="form-input" value={supForm.phone} onChange={(e) => setSupForm((p) => ({ ...p, phone: e.target.value }))} /></div>
              <div><div className="form-label">Email</div><input className="form-input" value={supForm.email} onChange={(e) => setSupForm((p) => ({ ...p, email: e.target.value }))} /></div>
              <div><div className="form-label">Lead time</div><input className="form-input" value={supForm.leadTime} placeholder="e.g. 1-2 days, Tuesdays" onChange={(e) => setSupForm((p) => ({ ...p, leadTime: e.target.value }))} /></div>
              <div><div className="form-label">Terms</div><input className="form-input" value={supForm.terms} placeholder="e.g. 14 days" onChange={(e) => setSupForm((p) => ({ ...p, terms: e.target.value }))} /></div>
            </div>
            <div className="form-label" style={{ marginTop: 10 }}>Venues supplied</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {venues.map((v) => (
                <label key={v.id} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="checkbox" checked={(supForm.venueIds || []).includes(v.id)}
                    onChange={(e) => setSupForm((p) => ({ ...p, venueIds: e.target.checked ? [...(p.venueIds || []), v.id] : (p.venueIds || []).filter((x) => x !== v.id) }))} />
                  {v.name}
                </label>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14 }}>
              <div>
                {supForm.id && <button className="btn btn-sm" onClick={() => { setSupForm((p) => ({ ...p, archived: true })); }}>Archive</button>}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setSupForm(null)}>Cancel</button>
                <button className="btn btn-primary btn-sm" onClick={saveSup}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
