import React, { useMemo, useState, useEffect } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, staffInVenue } from "../../utils/restaurantGroupPaths";
import { fullName, downloadCsv, weekKeyOf } from "./rgUtils";
import StaffCapabilityCard from "./StaffCapabilityCard";

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

// group a staff member into an area bucket (for the categorized roster)
const staffArea = (s) => {
  if (s.area === "FOH" || s.area === "BOH" || s.area === "CK") return s.area;
  const r = s.role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/central|\bck\b/i.test(r)) return "CK";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  return s.area || "Other";
};
// area colours (#5): FOH green, BOH blue, CK purple, Mgmt black — station-specific
// colour (set in Settings) wins when the shift has a station.
const AREA_COLORS = { FOH: "#16a34a", BOH: "#2563eb", CK: "#8b5cf6", Mgmt: "#111111", Other: "#6b7280" };
const roleArea = (role) => {
  const r = role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/central|\bck\b/i.test(r)) return "CK";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  return "Other";
};

const AREA_GROUPS = [
  { key: "Mgmt", label: "Management" },
  { key: "FOH", label: "Front of House" },
  { key: "BOH", label: "Back of House" },
  { key: "CK", label: "Kitchen / Central" },
  { key: "Other", label: "Other" },
];

export default function ShiftPlannerPage() {
  const { groupId, group, staff, scopedStaff, shifts, venues, stations, roles, assignments, perfNotes, selectedVenue, selectedVenueName, showToast, can, myStaff, myScope } = useRG();
  const canEdit = can("shifts", "edit");
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState(null); // { staffId, day } | true
  const [shiftDetail, setShiftDetail] = useState(null);
  const [capStaff, setCapStaff] = useState(null); // staff capability card
  const [areaFilter, setAreaFilter] = useState("all"); // all | FOH | BOH | CK | Mgmt
  const [splitMode, setSplitMode] = useState(false);
  const [splitA, setSplitA] = useState("");
  const [splitB, setSplitB] = useState("");
  useEffect(() => { if (!splitA && venues[0]) setSplitA(venues[0].id); if (!splitB && venues[1]) setSplitB(venues[1].id); }, [venues]); // eslint-disable-line

  const monday = mondayOf(offset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const wk = weekKeyOf(monday);
  const weekLabel = `Week of ${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;

  // Staff can SEE the full roster for their venue(s) — who they're working with —
  // while editing stays gated behind canEdit. Managers/owners keep their scope.
  const visibleStaff = useMemo(() => {
    if (myScope !== "staff") return scopedStaff;
    const mv = myStaff?.venueIds?.length ? myStaff.venueIds : (myStaff?.venueId ? [myStaff.venueId] : []);
    return staff.filter((s) => (s.venueIds || []).some((v) => mv.includes(v)) || (s.venueId && mv.includes(s.venueId)));
  }, [myScope, scopedStaff, staff, myStaff]);
  const rows = useMemo(
    () => visibleStaff.filter((s) => staffInVenue(s, selectedVenue)),
    [visibleStaff, selectedVenue]
  );

  // ── Clock in / out (staff, today's own shift) ──
  const todayIdx = (new Date().getDay() + 6) % 7;
  const fmtClock = (iso) => { try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  const curWk = weekKeyOf(mondayOf(0));
  const myTodayShifts = useMemo(
    () => (myStaff ? shifts.filter((sh) => sh.staffId === myStaff.id && (sh.weekKey || curWk) === curWk && sh.day === todayIdx) : []),
    [shifts, myStaff, curWk, todayIdx]
  );
  const clock = async (sh, field) => {
    try {
      await updateDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id), { [field]: new Date().toISOString() });
      showToast(field === "clockInAt" ? "Clocked in — have a good shift!" : "Clocked out — see you next time!");
    } catch { showToast("Could not record time"); }
  };

  const weekShifts = useMemo(() => shifts.filter((sh) => (sh.weekKey || wk) === wk), [shifts, wk]);
  const shiftColor = (sh) => stations.find((x) => x.id === sh.stationId)?.color || AREA_COLORS[roleArea(sh.role)];

  const cellShifts = (staffId, day) => weekShifts.filter((sh) => sh.staffId === staffId && sh.day === day);

  const staffHours = (staffId) =>
    weekShifts.filter((sh) => sh.staffId === staffId).reduce((a, sh) => a + shiftHours(sh), 0);

  const totalHours = useMemo(
    () => rows.reduce((a, s) => a + staffHours(s.id), 0),
    [rows, weekShifts]
  );
  // configurable per group (set hourlyRate / weeklyRevenue on the group doc); fall back to estimates
  const hourly = Number(group?.hourlyRate) || HOURLY;
  const weeklyRev = Number(group?.weeklyRevenue) || WEEKLY_REVENUE;
  const labourCost = totalHours * hourly;
  const labourPct = ((labourCost / weeklyRev) * 100).toFixed(1);

  // rows grouped into area sections (Management / FOH / BOH / Kitchen / Other),
  // honouring the area filter; empty groups are dropped.
  const groupedRows = useMemo(() =>
    AREA_GROUPS
      .map((g) => ({ ...g, members: rows.filter((s) => staffArea(s) === g.key) }))
      .filter((g) => g.members.length && (areaFilter === "all" || areaFilter === g.key)),
    [rows, areaFilter]);

  const [form, setForm] = useState({ staffId: "", day: "Monday", start: STARTS[0], end: ENDS[0], role: (roles && roles[0]) || ROLES[0], venueId: "", stationId: "", notes: "" });
  const formStations = useMemo(() => stations.filter((s) => s.venueId === form.venueId), [stations, form.venueId]);
  const openAdd = (staffId, day, venueOverride) => {
    const st = staff.find((s) => s.id === staffId);
    setForm((p) => ({
      ...p,
      staffId: staffId || rows[0]?.id || "",
      day: typeof day === "number" ? FULL_DAYS[day] : "Monday",
      // default to a role that actually exists in this group (custom roles drive auto-assign matching)
      role: (roles && roles.includes(p.role)) ? p.role : ((roles && roles[0]) || ROLES[0]),
      // venueOverride wins (e.g. the split-view column you clicked); else the staff's venue, else selected/first
      venueId: venueOverride || st?.venueIds?.[0] || st?.venueId || (selectedVenue !== "all" ? selectedVenue : venues[0]?.id || ""),
      stationId: "",
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
    const ns = parseTime(form.start), ne = parseTime(form.end);
    if (ne <= ns) return showToast("End time must be after start time");
    // Hard block: no overlapping shift for this person that day, across ANY venue.
    // (7am–3pm + 3pm–9pm is fine — they only touch; strict overlap = ns < end && start < ne.)
    const clash = weekShifts.find((sh) => sh.staffId === form.staffId && sh.day === dayIdx
      && ns < parseTime(sh.end) && parseTime(sh.start) < ne);
    if (clash) return showToast(`Already rostered ${clash.start}–${clash.end} at ${clash.venue} that day — can't double-book.`);
    const type = parseTime(form.start) >= 15 ? "evening" : "morning";
    const station = stations.find((s) => s.id === form.stationId && s.venueId === venue.id);
    try {
      await addDoc(venueCol(groupId, venue.id, "shifts"), {
        staffId: form.staffId, staffName: fullName(st),
        day: dayIdx, start: form.start, end: form.end, role: form.role,
        venueId: venue.id, venue: venue.name,
        stationId: station?.id || "", station: station?.name || "",
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

  // Cell shifts scoped to a venue (for the split comparison view).
  const cellShiftsV = (staffId, day, vid) => weekShifts.filter((sh) => sh.staffId === staffId && sh.day === day && (vid === "all" || sh.venueId === vid));
  const VenueGrid = ({ vid }) => {
    const gridRows = scopedStaff.filter((s) => staffInVenue(s, vid));
    const gh = gridRows.reduce((a, s) => a + weekShifts.filter((sh) => sh.staffId === s.id && (vid === "all" || sh.venueId === vid)).reduce((x, sh) => x + shiftHours(sh), 0), 0);
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr style={{ background: "var(--gray-light)" }}>
                <th style={{ ...th, textAlign: "left", width: 100, padding: "8px 10px" }}>Staff</th>
                {DAYS.map((d) => <th key={d} style={{ ...th, padding: "8px 4px" }}>{d}</th>)}
              </tr>
            </thead>
            <tbody>
              {gridRows.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: "6px 10px", borderBottom: "0.5px solid var(--gray-light)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--red)" }} onClick={() => setCapStaff(s)} title="View capability">{fullName(s)}</div>
                    <div style={{ fontSize: 9, color: "var(--gray)" }}>{s.role}</div>
                  </td>
                  {DAYS.map((_, day) => {
                    const shs = cellShiftsV(s.id, day, vid);
                    return (
                      <td key={day} style={{ padding: 3, borderBottom: "0.5px solid var(--gray-light)", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {shs.map((sh) => (
                            <div key={sh.id} className={`shift-cell ${cellClass(sh.type)}`} style={{ borderLeft: `3px solid ${shiftColor(sh)}` }} title="Click to view" onClick={() => setShiftDetail(sh)}>
                              <div style={{ fontWeight: 600 }}>{sh.start}–{sh.end}{sh.notes ? " 📝" : ""}</div>
                              <div style={{ opacity: 0.8 }}>{(sh.role || "").replace(/^(FOH|BOH) — /, "")}{sh.station ? ` · ${sh.station}` : ""}</div>
                            </div>
                          ))}
                          {canEdit && <div className="shift-cell" style={{ cursor: "pointer", color: "var(--gray)", textAlign: "center", minHeight: 0, padding: "2px 6px" }} onClick={() => openAdd(s.id, day, vid)}>+</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {gridRows.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: "var(--gray)", fontSize: 12 }}>No staff here.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 12px", background: "var(--gray-light)", borderTop: "0.5px solid var(--border)", fontSize: 11 }}>
          <span style={{ color: "var(--gray)" }}>Hours this week: </span><strong>{gh.toFixed(1)}</strong>
        </div>
      </div>
    );
  };

  // one staff row in the main (categorized) roster — name is clickable → capability card
  const renderRow = (s) => (
    <tr key={s.id}>
      <td style={{ padding: "8px 14px", borderBottom: "0.5px solid var(--gray-light)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--red)" }} onClick={() => setCapStaff(s)} title="View capability (certs, training, history)">{fullName(s)}</div>
        <div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}</div>
      </td>
      {DAYS.map((_, day) => {
        const shs = cellShifts(s.id, day);
        return (
          <td key={day} style={{ padding: 3, borderBottom: "0.5px solid var(--gray-light)", verticalAlign: "top" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {shs.map((sh) => (
                <div key={sh.id} className={`shift-cell ${cellClass(sh.type)}`} style={{ borderLeft: `3px solid ${shiftColor(sh)}` }} title="Click to view" onClick={() => setShiftDetail(sh)}>
                  <div style={{ fontWeight: 600 }}>{sh.start}–{sh.end}{sh.notes ? " 📝" : ""}</div>
                  <div style={{ opacity: 0.8 }}>{(sh.role || "").replace(/^(FOH|BOH) — /, "")}{sh.station ? ` · ${sh.station}` : ""}{shs.length > 1 && sh.venue ? ` · ${sh.venue.split(" ").map((w) => w[0]).join("")}` : ""}</div>
                </div>
              ))}
              {canEdit && <div className="shift-cell" style={{ cursor: "pointer", color: "var(--gray)", textAlign: "center", minHeight: 0, padding: "2px 8px" }} onClick={() => openAdd(s.id, day)}>+</div>}
              {!canEdit && shs.length === 0 && <div className="shift-cell shift-off" style={{ textAlign: "center", opacity: 0.5 }}>·</div>}
            </div>
          </td>
        );
      })}
      <td style={{ textAlign: "center", fontSize: 11, fontWeight: 600, borderBottom: "0.5px solid var(--gray-light)" }}>{staffHours(s.id).toFixed(1)}</td>
    </tr>
  );

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
          <button className="btn btn-sm" onClick={() => setSplitMode((s) => !s)} style={splitMode ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>⊟ Split view</button>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAdd("", 0)}>+ Add shift</button>}
          <button className="btn btn-sm" onClick={() => { downloadCsv(`roster-${wk}.csv`, [["Staff", "Day", "Start", "End", "Role", "Station", "Venue", "Hours"], ...weekShifts.slice().sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start)).map((sh) => [sh.staffName, FULL_DAYS[sh.day] || "", sh.start, sh.end, sh.role, sh.station || "", sh.venue, shiftHours(sh).toFixed(1)])]); showToast("Roster exported (CSV)"); }}>Export</button>
        </div>
      </div>

      {/* My shift today — clock in / out */}
      {myTodayShifts.length > 0 && (
        <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>⏱ Your shift today</strong>
          {myTodayShifts.map((sh) => (
            <div key={sh.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span>{sh.start}–{sh.end} · {sh.venue}{sh.station ? ` · ${sh.station}` : ""}</span>
              {sh.clockInAt && <span className="pill pill-green">In {fmtClock(sh.clockInAt)}</span>}
              {sh.clockOutAt && <span className="pill pill-gray">Out {fmtClock(sh.clockOutAt)}</span>}
              {!sh.clockInAt
                ? <button className="btn btn-sm btn-primary" onClick={() => clock(sh, "clockInAt")}>Clock in</button>
                : !sh.clockOutAt
                  ? <button className="btn btn-sm" onClick={() => clock(sh, "clockOutAt")}>Clock out</button>
                  : null}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {[["#e0f2fe", "Morning"], ["#f3e8ff", "Afternoon / evening"], ["#fffbeb", "Open (needs fill)"], ["#f4f4f5", "Day off / RDO"]].map(([bg, lbl]) => (
          <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--border)", display: "inline-block" }} />{lbl}
          </span>
        ))}
      </div>

      {/* Area filter */}
      {!splitMode && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          {[["all", "All"], ["Mgmt", "Management"], ["FOH", "FOH"], ["BOH", "BOH"], ["CK", "Kitchen"]].map(([k, l]) => (
            <button key={k} className="btn btn-sm" onClick={() => setAreaFilter(k)}
              style={areaFilter === k ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{l}</button>
          ))}
        </div>
      )}

      {/* Split comparison view */}
      {splitMode ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
          {[[splitA, setSplitA], [splitB, setSplitB]].map(([val, setter], i) => (
            <div key={i}>
              <select className="form-input" style={{ marginBottom: 8 }} value={val} onChange={(e) => setter(e.target.value)}>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <VenueGrid vid={val} />
            </div>
          ))}
        </div>
      ) : (
      /* Roster grid */
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
              {groupedRows.map((g) => (
                <React.Fragment key={g.key}>
                  <tr>
                    <td colSpan={9} style={{ padding: "6px 14px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderBottom: "0.5px solid var(--border)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {g.label} <span style={{ fontWeight: 400 }}>· {g.members.length}</span>
                    </td>
                  </tr>
                  {g.members.map(renderRow)}
                </React.Fragment>
              ))}
              {groupedRows.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: "var(--gray)", fontSize: 13 }}>No staff for {selectedVenueName}{areaFilter !== "all" ? ` in ${areaFilter}` : ""}.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--gray-light)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Total hours this week: </span><strong>{totalHours.toFixed(1)}</strong></div>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Est. labour cost: </span><strong>${labourCost.toLocaleString()}</strong></div>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Labour %: </span><strong>{labourPct}%</strong> <span style={{ color: "var(--gray)" }}>(target 20–25%)</span></div>
        </div>
      </div>
      )}

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
                  {scopedStaff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
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
                <select className="form-input" value={form.role} onChange={setF("role")}>{(roles?.length ? roles : ROLES).map((r) => <option key={r}>{r}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Venue</label>
                <select className="form-input" value={form.venueId} onChange={setF("venueId")}>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Station</label>
                <select className="form-input" value={form.stationId} onChange={setF("stationId")}>
                  <option value="">— None —</option>
                  {formStations.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.area}</option>)}
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

      {/* Shift detail (click a shift) */}
      {shiftDetail && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShiftDetail(null)}>
          <div className="rg-modal" style={{ maxWidth: 440 }}>
            <div className="modal-head"><span className="modal-title">Shift — {shiftDetail.staffName}</span><button className="modal-close" onClick={() => setShiftDetail(null)}>✕</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["Day", FULL_DAYS[shiftDetail.day]], ["Rostered", `${shiftDetail.start} – ${shiftDetail.end}`], ["Role", shiftDetail.role], ["Venue", shiftDetail.venue], ["Station", shiftDetail.station], ["Clocked in", shiftDetail.clockInAt ? fmtClock(shiftDetail.clockInAt) : "—"], ["Clocked out", shiftDetail.clockOutAt ? fmtClock(shiftDetail.clockOutAt) : "—"]].map(([k, v]) => (
                <div key={k}><div className="form-label">{k}</div><div style={{ fontSize: 13 }}>{v || "—"}</div></div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}><div className="form-label">Notes</div><div style={{ fontSize: 13, color: shiftDetail.notes ? "var(--ink)" : "var(--gray)" }}>{shiftDetail.notes || "No notes"}</div></div>
            <div className="btn-row">
              {canEdit && <button className="btn btn-danger" onClick={async () => { await removeShift(shiftDetail); setShiftDetail(null); }}>Remove shift</button>}
              <button className="btn" onClick={() => setShiftDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Staff capability card (click a name) */}
      {capStaff && (
        <StaffCapabilityCard
          staff={capStaff}
          assignments={assignments}
          shifts={shifts}
          perfNotes={perfNotes}
          canAssign={canEdit}
          onAssign={(id) => { setCapStaff(null); openAdd(id, 0); }}
          onClose={() => setCapStaff(null)}
        />
      )}
    </>
  );
}
