import React, { useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { fullName, progressColor, noteTypePill, noteTypeLabel } from "./rgUtils";

const KPI_COLORS = [
  ["Green", "var(--green)"], ["Amber", "var(--amber)"], ["Blue", "var(--blue)"], ["Red", "var(--red)"], ["Purple", "var(--purple)"],
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOTE_TYPES = ["Recognition", "Coaching", "Warning", "Note"];
const monthLabel = () => { const d = new Date(); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

export default function PerformancePage() {
  const { groupId, staff, perfNotes, kpis, selectedVenue, matchVenue, showToast, can } = useRG();
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
    try {
      await Promise.all(kpiDraft.map(async (row, idx) => {
        if (row._deleted) { if (row.id) await deleteDoc(doc(col, row.id)); return; }
        if (!row.label.trim()) return;
        const payload = { label: row.label.trim(), value: row.value, pct: Math.max(0, Math.min(100, Number(row.pct) || 0)), color: row.color, order: idx };
        if (row.id) await updateDoc(doc(col, row.id), payload);
        else await addDoc(col, payload);
      }));
      showToast("KPIs updated");
      setKpiOpen(false);
    } catch { showToast("Could not save KPIs"); }
  };

  const scopedStaff = useMemo(
    () => staff.filter((s) => selectedVenue === "all" || s.venueId === selectedVenue),
    [staff, selectedVenue]
  );
  const notes = useMemo(() => perfNotes.filter(matchVenue), [perfNotes, matchVenue]);

  const save = async () => {
    if (!form.staffId) return showToast("Select a staff member");
    if (!form.note.trim()) return showToast("Write a note");
    const st = staff.find((s) => s.id === form.staffId);
    if (!st?.venueId) return showToast("Staff has no venue");
    const d = new Date();
    try {
      await addDoc(venueCol(groupId, st.venueId, "performanceNotes"), {
        staffId: form.staffId, staffName: fullName(st), venue: st?.venue || "", venueId: st?.venueId || "",
        type: form.type, note: form.note.trim(), date: `${d.getDate()} ${MONTHS[d.getMonth()]}`, by: "Manager",
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
