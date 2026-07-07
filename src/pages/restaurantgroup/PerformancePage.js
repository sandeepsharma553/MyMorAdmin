import React, { useEffect, useMemo, useState } from "react";
import { addDoc, doc, getDocs, query, serverTimestamp, where, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { venueCol, staffInVenue } from "../../utils/restaurantGroupPaths";
import { fullName, progressColor, noteTypePill, noteTypeLabel } from "./rgUtils";
import { money } from "./rgStockUtils";

const KPI_COLORS = [
  ["Green", "var(--green)"], ["Amber", "var(--amber)"], ["Blue", "var(--blue)"], ["Red", "var(--red)"], ["Purple", "var(--purple)"],
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOTE_TYPES = ["Recognition", "Coaching", "Warning", "Note"];
const monthLabel = () => { const d = new Date(); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export default function PerformancePage() {
  const { groupId, staff, venues, perfNotes, kpis, selectedVenue, matchVenue, showToast, can, me } = useRG();
  const canEdit = can("performance", "edit");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ staffId: "", type: "Recognition", note: "" });
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // ── KPI editing (per-venue) ──
  const venueKpis = useMemo(
    () => kpis.filter((k) => selectedVenue === "all" || k.venueId === selectedVenue),
    [kpis, selectedVenue]
  );
  const canEditKpis = canEdit && selectedVenue !== "all"; // KPIs edited per specific venue
  const [kpiOpen, setKpiOpen] = useState(false);
  const [kpiDraft, setKpiDraft] = useState([]);
  const openKpiEditor = () => {
    setKpiDraft(venueKpis.map((k) => ({ id: k.id, label: k.label, value: k.value, pct: k.pct, color: k.color })));
    setKpiOpen(true);
  };
  const setKpi = (i, key) => (e) => setKpiDraft((d) => d.map((row, idx) => idx === i ? { ...row, [key]: key === "pct" ? Number(e.target.value) : e.target.value } : row));
  const addKpiRow = () => setKpiDraft((d) => [...d, { id: null, label: "", value: "", pct: 50, color: "var(--blue)" }]);
  const removeKpiRow = (i) => setKpiDraft((d) => d.map((row, idx) => idx === i ? { ...row, _deleted: true } : row));
  const saveKpis = async () => {
    if (selectedVenue === "all") return showToast("Pick a venue to edit its KPIs");
    const col = venueCol(groupId, selectedVenue, "kpis");
    // one atomic batch — all KPI rows commit together or none do (no partial state)
    const batch = writeBatch(db);
    kpiDraft.forEach((row, idx) => {
      if (row._deleted) { if (row.id) batch.delete(doc(col, row.id)); return; }
      if (!row.label.trim()) return;
      const payload = { label: row.label.trim(), value: row.value, pct: Math.max(0, Math.min(100, Number(row.pct) || 0)), color: row.color, order: idx };
      batch.set(row.id ? doc(col, row.id) : doc(col), payload, { merge: true });
    });
    try { await batch.commit(); showToast("KPIs updated"); setKpiOpen(false); }
    catch { showToast("Could not save KPIs — no changes were written"); }
  };

  const scopedStaff = useMemo(
    () => staff.filter((s) => staffInVenue(s, selectedVenue)),
    [staff, selectedVenue]
  );
  const notes = useMemo(() => perfNotes.filter(matchVenue), [perfNotes, matchVenue]);

  // ── POS sales by staff (this month) — venue orders are written by rgSellOrder
  // with staffId/staffName (PIN-identified on the POS); aggregated client-side.
  // One-shot fetch, not a listener: this is a monthly summary, not a live feed.
  const [sales, setSales] = useState(null); // null = loading · [] = none/error
  useEffect(() => {
    let dead = false;
    (async () => {
      setSales(null);
      try {
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const vids = selectedVenue === "all" ? venues.map((v) => v.id) : [selectedVenue];
        const snaps = await Promise.all(vids.map((vid) =>
          getDocs(query(venueCol(groupId, vid, "orders"), where("createdAt", ">=", monthStart)))));
        if (dead) return;
        const by = {};
        snaps.forEach((s) => s.forEach((d) => {
          const o = d.data();
          const k = o.staffId || "__none__";
          by[k] = by[k] || { staffId: o.staffId || null, staffName: o.staffName || "Unattributed", orders: 0, total: 0 };
          by[k].orders += 1;
          by[k].total += Number(o.amounts?.total) || 0;
        }));
        setSales(Object.values(by).sort((a, b) => b.total - a.total));
      } catch {
        if (!dead) setSales([]);
      }
    })();
    return () => { dead = true; };
  }, [groupId, selectedVenue, venues]);

  const save = async () => {
    if (!form.staffId) return showToast("Select a staff member");
    if (!form.note.trim()) return showToast("Write a note");
    const st = staff.find((s) => s.id === form.staffId);
    const vid = selectedVenue !== "all" ? selectedVenue : st?.venueIds?.[0] || st?.venueId;
    if (!vid) return showToast("Select a venue for this note");
    const d = new Date();
    try {
      await addDoc(venueCol(groupId, vid, "performanceNotes"), {
        staffId: form.staffId, staffName: fullName(st), venue: venues.find((v) => v.id === vid)?.name || "", venueId: vid,
        type: form.type, note: form.note.trim(), date: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
        by: me?.displayName || me?.name || me?.email || "Manager", byId: me?.uid || me?.id || "",
        createdAt: serverTimestamp(),
      });
      showToast("Note saved");
      setOpen(false); setForm({ staffId: "", type: "Recognition", note: "" });
    } catch { showToast("Could not save note"); }
  };

  return (
    <>
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <div className="card-head"><span className="card-title">Staff performance — {monthLabel()}</span></div>
          {scopedStaff.map((s) => (
            <div key={s.id} className="perf-row">
              <span className="perf-name">{fullName(s)}</span>
              <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${s.training || 0}%`, background: progressColor(s.training || 0) }} /></div>
              <span className="perf-val">{s.training || 0}%</span>
            </div>
          ))}
          {scopedStaff.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No staff for this venue.</div>}
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">KPI summary</span>{canEditKpis && <button className="btn btn-sm" onClick={openKpiEditor}>Edit</button>}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {venueKpis.map((k) => (
              <div key={`${k.venueId}-${k.id}`}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}><span>{k.label}{selectedVenue === "all" && <span style={{ color: "var(--gray)" }}> · {k.venue}</span>}</span><strong>{k.value}</strong></div>
                <div className="progress-wrap"><div className="progress-bar" style={{ width: `${k.pct}%`, background: k.color }} /></div>
              </div>
            ))}
            {venueKpis.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>{selectedVenue === "all" ? "Select a venue to view/add its KPIs." : "No KPIs yet. Click Edit to add some."}</div>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="card-head"><span className="card-title">POS sales by staff — {monthLabel()}</span></div>
        {sales === null ? (
          <div style={{ fontSize: 12, color: "var(--gray)" }}>Loading sales…</div>
        ) : sales.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--gray)" }}>No POS orders this month{selectedVenue === "all" ? "" : " at this venue"}.</div>
        ) : (() => {
          const top = Math.max(...sales.map((r) => r.total), 1);
          return sales.map((r) => (
            <div key={r.staffId || "none"} className="perf-row">
              <span className="perf-name">{r.staffName}{r.staffId ? "" : " *"}</span>
              <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${Math.round((r.total / top) * 100)}%`, background: "var(--blue)" }} /></div>
              <span className="perf-val" style={{ minWidth: 130, textAlign: "right" }}>{r.orders} orders · {money(r.total)}</span>
            </div>
          ));
        })()}
        {sales?.some((r) => !r.staffId) && (
          <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>* orders sent before staff sign-in existed, or by tools that skip it.</div>
        )}
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Recognition & notes</span>{canEdit && <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>+ Add note</button>}</div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Venue</th><th>Type</th><th>Note</th><th>Date</th><th>By</th></tr></thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id}>
                  <td>{n.staffName}</td><td>{n.venue}</td>
                  <td><span className={`pill ${noteTypePill(n.type)}`}>{noteTypeLabel(n.type)}</span></td>
                  <td>{n.note}</td><td>{n.date}</td><td>{n.by}</td>
                </tr>
              ))}
              {notes.length === 0 && <tr><td colSpan={6} style={{ color: "var(--gray)" }}>No notes yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="rg-modal">
            <div className="modal-head"><span className="modal-title">Add performance note</span><button className="modal-close" onClick={() => setOpen(false)}>✕</button></div>
            <div className="form-group"><label className="form-label">Staff member</label>
              <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                <option value="">Select staff member...</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-input" value={form.type} onChange={setF("type")}>{NOTE_TYPES.map((t) => <option key={t} value={t}>{noteTypeLabel(t)}</option>)}</select>
            </div>
            <div className="form-group"><label className="form-label">Note</label><textarea className="form-input" rows={4} value={form.note} onChange={setF("note")} placeholder="Describe the performance observation..." /></div>
            <div className="btn-row"><button className="btn btn-primary" onClick={save}>Save note</button><button className="btn" onClick={() => setOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {kpiOpen && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setKpiOpen(false)}>
          <div className="rg-modal" style={{ maxWidth: 620 }}>
            <div className="modal-head"><span className="modal-title">Edit KPI summary</span><button className="modal-close" onClick={() => setKpiOpen(false)}>✕</button></div>
            {kpiDraft.map((row, i) => row._deleted ? null : (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 70px 90px 28px", gap: 8, alignItems: "end", marginBottom: 8 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Label</label><input className="form-input" value={row.label} onChange={setKpi(i, "label")} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Value</label><input className="form-input" value={row.value} onChange={setKpi(i, "value")} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Bar %</label><input type="number" min="0" max="100" className="form-input" value={row.pct} onChange={setKpi(i, "pct")} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Colour</label>
                  <select className="form-input" value={row.color} onChange={setKpi(i, "color")}>{KPI_COLORS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => removeKpiRow(i)} style={{ height: 32 }}>✕</button>
              </div>
            ))}
            <button className="btn btn-sm" onClick={addKpiRow} style={{ marginTop: 4 }}>+ Add KPI</button>
            <div className="btn-row"><button className="btn btn-primary" onClick={saveKpis}>Save KPIs</button><button className="btn" onClick={() => setKpiOpen(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}
