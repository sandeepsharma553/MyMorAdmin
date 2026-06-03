import React, { useMemo, useState } from "react";
import { addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, staffInVenue } from "../../utils/restaurantGroupPaths";
import { db } from "../../firebase";
import { fullName } from "./rgUtils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STARTS = ["7:00am", "7:30am", "8:00am", "9:00am", "10:00am", "11:00am", "12:00pm", "3:00pm", "4:00pm", "5:00pm", "6:00pm"];
const ENDS = ["3:00pm", "3:30pm", "4:00pm", "5:00pm", "6:00pm", "8:00pm", "9:00pm", "10:00pm", "10:30pm"];
const ROLES = ["FOH — Bar", "FOH — Floor", "FOH — Barista", "BOH — Kitchen", "BOH — Fryer", "BOH — Washing", "Store Manager", "Central Kitchen"];
const HOURLY = 32;
const WEEKLY_REVENUE = 42000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function mondayOf(offset) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
const keyOf = (d) => d.toISOString().slice(0, 10);

function parseTime(t) {
  if (!t) return 0;
  const m = /(\d+):(\d+)(am|pm)/i.exec(t.trim());
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h + parseInt(m[2], 10) / 60;
}
const shiftHours = (sh) => Math.max(0, parseTime(sh.end) - parseTime(sh.start));

const cellClass = (type) =>
  type === "evening" ? "shift-evening" : type === "open" ? "shift-open" : type === "off" ? "shift-off" : "shift-morning";

export default function ShiftPlannerPage() {
  const { groupId, staff, shifts, venues, selectedVenue, selectedVenueName, showToast, can } = useRG();
  const canEdit = can("shifts", "edit");
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState(null); // { staffId, day } | true

  const monday = mondayOf(offset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const wk = keyOf(monday);
  const weekLabel = `Week of ${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;

  const rows = useMemo(
    () => staff.filter((s) => staffInVenue(s, selectedVenue)),
    [staff, selectedVenue]
  );

  const weekShifts = useMemo(() => shifts.filter((sh) => (sh.weekKey || wk) === wk), [shifts, wk]);

  const cellShift = (staffId, day) => weekShifts.find((sh) => sh.staffId === staffId && sh.day === day);

  const staffHours = (staffId) =>
    weekShifts.filter((sh) => sh.staffId === staffId).reduce((a, sh) => a + shiftHours(sh), 0);

  const totalHours = useMemo(
    () => rows.reduce((a, s) => a + staffHours(s.id), 0),
    [rows, weekShifts]
  );
  const labourCost = totalHours * HOURLY;
  const labourPct = ((labourCost / WEEKLY_REVENUE) * 100).toFixed(1);

  const [form, setForm] = useState({ staffId: "", day: "Monday", start: STARTS[0], end: ENDS[0], role: ROLES[0], venueId: "", notes: "" });
  const openAdd = (staffId, day) => {
    setForm((p) => ({
      ...p,
      staffId: staffId || rows[0]?.id || "",
      day: typeof day === "number" ? FULL_DAYS[day] : "Monday",
      venueId: staff.find((s) => s.id === staffId)?.venueId || (selectedVenue !== "all" ? selectedVenue : venues[0]?.id || ""),
    }));
    setModal(true);
  };
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const saveShift = async () => {
    if (!form.staffId) return showToast("Select a staff member");
    const st = staff.find((s) => s.id === form.staffId);
    const venue = venues.find((v) => v.id === form.venueId) || venues.find((v) => v.id === (st?.venueIds?.[0] || st?.venueId));
    if (!venue) return showToast("Select a venue");
    const dayIdx = FULL_DAYS.indexOf(form.day);
    const type = parseTime(form.start) >= 15 ? "evening" : "morning";
    try {
      await addDoc(venueCol(groupId, venue.id, "shifts"), {
        staffId: form.staffId, staffName: fullName(st),
        day: dayIdx, start: form.start, end: form.end, role: form.role,
        venueId: venue.id, venue: venue.name,
        type, notes: form.notes.trim(), weekKey: wk, published: true,
        createdAt: serverTimestamp(),
      });
      showToast("Shift saved");
      setModal(null);
    } catch (e) { showToast("Could not save shift"); }
  };

  const removeShift = async (sh) => {
    try { await deleteDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id)); showToast("Shift removed"); }
    catch { showToast("Could not remove shift"); }
  };

  const th = { padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--gray)", borderBottom: "0.5px solid var(--border)" };

  return (
    <>
      {/* Week nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o - 1)}>← Prev</button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 200, textAlign: "center" }}>{weekLabel}</span>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o + 1)}>Next →</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAdd("", 0)}>+ Add shift</button>}
          <button className="btn btn-sm" onClick={() => showToast("Roster exported as PDF")}>Export</button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {[["#e0f2fe", "Morning"], ["#f3e8ff", "Afternoon / evening"], ["#fffbeb", "Open (needs fill)"], ["#f4f4f5", "Day off / RDO"]].map(([bg, lbl]) => (
          <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--border)", display: "inline-block" }} />{lbl}
          </span>
        ))}
      </div>

      {/* Roster grid */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "var(--gray-light)" }}>
                <th style={{ ...th, textAlign: "left", width: 130, padding: "10px 14px" }}>Staff</th>
                {DAYS.map((d) => <th key={d} style={th}>{d}</th>)}
                <th style={th}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: "8px 14px", borderBottom: "0.5px solid var(--gray-light)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{fullName(s)}</div>
                    <div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}</div>
                  </td>
                  {DAYS.map((_, day) => {
                    const sh = cellShift(s.id, day);
                    return (
                      <td key={day} style={{ padding: 3, borderBottom: "0.5px solid var(--gray-light)", verticalAlign: "top" }}>
                        {sh ? (
                          <div className={`shift-cell ${cellClass(sh.type)}`} title={canEdit ? "Click to remove" : ""} onClick={canEdit ? () => removeShift(sh) : undefined} style={!canEdit ? { cursor: "default" } : undefined}>
                            <div style={{ fontWeight: 600 }}>{sh.start}–{sh.end}</div>
                            <div style={{ opacity: 0.8 }}>{(sh.role || "").replace(/^(FOH|BOH) — /, "")}</div>
                          </div>
                        ) : canEdit ? (
                          <div className="shift-cell" style={{ cursor: "pointer", color: "var(--gray)", textAlign: "center" }} onClick={() => openAdd(s.id, day)}>+</div>
                        ) : (
                          <div className="shift-cell shift-off" style={{ textAlign: "center", opacity: 0.5 }}>·</div>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "center", fontSize: 11, fontWeight: 600, borderBottom: "0.5px solid var(--gray-light)" }}>{staffHours(s.id).toFixed(1)}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: "var(--gray)", fontSize: 13 }}>No staff for {selectedVenueName}.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--gray-light)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Total hours this week: </span><strong>{totalHours.toFixed(1)}</strong></div>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Est. labour cost: </span><strong>${labourCost.toLocaleString()}</strong></div>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Labour %: </span><strong>{labourPct}%</strong> <span style={{ color: "var(--gray)" }}>(target 20–25%)</span></div>
        </div>
      </div>

      {/* Add shift modal */}
      {modal && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="rg-modal">
            <div className="modal-head">
              <span className="modal-title">Add / edit shift</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Staff member</label>
                <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                  <option value="">Select...</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Day</label>
                <select className="form-input" value={form.day} onChange={setF("day")}>{FULL_DAYS.map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Start time</label>
                <select className="form-input" value={form.start} onChange={setF("start")}>{STARTS.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">End time</label>
                <select className="form-input" value={form.end} onChange={setF("end")}>{ENDS.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Role for this shift</label>
                <select className="form-input" value={form.role} onChange={setF("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Venue</label>
                <select className="form-input" value={form.venueId} onChange={setF("venueId")}>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={setF("notes")} placeholder="e.g. Cover for sick call, train new staff" /></div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveShift}>Save shift</button>
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
