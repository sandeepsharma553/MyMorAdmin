import React, { useMemo, useState, useEffect } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, staffInVenue } from "../../utils/restaurantGroupPaths";
import { fullName, downloadCsv, weekKeyOf } from "./rgUtils";
import { staffAreaBuckets, staffAtStation } from "./staffStructureUtils";
import { stationsForArea } from "./itemDrilldown";
import StaffCapabilityCard from "./StaffCapabilityCard";
import { checkAndCreateShiftAssignments } from "./checklistShiftUtils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// 15-minute time options across the trading day (incl. 6:30am opening, 7:15am second arrival)
const mkTimes = (fromMin, toMin) => {
  const out = [];
  for (let m = fromMin; m <= toMin; m += 15) {
    const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am", h12 = (h % 12) || 12;
    out.push(`${h12}:${String(mm).padStart(2, "0")}${ap}`);
  }
  return out;
};
const STARTS = mkTimes(0, 23 * 60 + 45);        // 12:00am … 11:45pm (full day, 15-min)
const ENDS = mkTimes(0, 23 * 60 + 45);          // 12:00am … 11:45pm
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

// area colours (#5): FOH green, BOH blue, Mgmt black — station-specific colour
// (set in Settings) wins when the shift has a station.
const AREA_COLORS = { FOH: "#16a34a", BOH: "#2563eb", Mgmt: "#111111", Other: "#6b7280" };
const roleArea = (role) => {
  const r = role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  return "Other";
};

const AREA_GROUPS = [
  { key: "Mgmt", label: "Management" },
  { key: "FOH", label: "Front of House" },
  { key: "BOH", label: "Back of House" },
  { key: "Other", label: "Other" },
];

export default function ShiftPlannerPage() {
  const { groupId, group, staff, scopedStaff, shifts, venues, stations, roles, assignments, perfNotes, checklists, leave, selectedVenue, selectedVenueName, showToast, can, myStaff, myScope } = useRG();
  const canEdit = can("shifts", "edit");
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState(null); // { staffId, day } | true
  const [shiftDetail, setShiftDetail] = useState(null);
  const [capStaff, setCapStaff] = useState(null); // staff capability card
  const [areaFilter, setAreaFilter] = useState("all"); // all | FOH | BOH | Mgmt
  const [planStation, setPlanStation] = useState("all"); // Area→Station drill-down: all | stationId
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
  // #2 hide Inactive staff from the planner (keep Active / On leave). Filter LOCALLY
  // (not in RGContext.scopedStaff) so other pages are unaffected.
  const rows = useMemo(
    () => visibleStaff.filter((s) => staffInVenue(s, selectedVenue) && s.status !== "Inactive"),
    [visibleStaff, selectedVenue]
  );
  // #3 shared A→Z comparator (case-insensitive) for ordering members within a group.
  const byName = (a, b) => fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase());

  // ── Clock in / out (staff, today's own shift) ──
  const todayIdx = (new Date().getDay() + 6) % 7;
  const fmtClock = (iso) => { try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  const curWk = weekKeyOf(mondayOf(0));
  const myTodayShifts = useMemo(
    () => (myStaff ? shifts.filter((sh) => sh.staffId === myStaff.id && (sh.weekKey || curWk) === curWk && sh.day === todayIdx) : []),
    [shifts, myStaff, curWk, todayIdx]
  );
  const CLOCK_LABELS = { clockInAt: "Clocked in — have a good shift!", breakStartAt: "Break started", breakEndAt: "Back from break", clockOutAt: "Clocked out — see you next time!" };
  const clock = async (sh, field) => {
    try {
      await updateDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id), { [field]: new Date().toISOString() });
      showToast(CLOCK_LABELS[field] || "Time recorded");
    } catch { showToast("Could not record time"); }
  };
  // admin punch edit: set a clock field to a time-of-day on the shift's own date, or clear it
  const shiftDateObj = (sh) => { const d = new Date(`${sh.weekKey || curWk}T00:00:00`); d.setDate(d.getDate() + (sh.day || 0)); return d; };
  const hhmm = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const setClock = async (sh, field, timeStr) => {
    try {
      let val = null;
      if (timeStr) { const [h, m] = timeStr.split(":").map(Number); const d = shiftDateObj(sh); d.setHours(h || 0, m || 0, 0, 0); val = d.toISOString(); }
      await updateDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id), { [field]: val });
      setShiftDetail((p) => (p && p.id === sh.id ? { ...p, [field]: val } : p));
    } catch { showToast("Could not update time"); }
  };

  const weekShifts = useMemo(() => shifts.filter((sh) => (sh.weekKey || wk) === wk), [shifts, wk]);
  const shiftColor = (sh) => stations.find((x) => x.id === sh.stationId)?.color || AREA_COLORS[roleArea(sh.role)];

  // sorted chronologically by START time (#1) — filter() returns a fresh array so .sort is safe
  const cellShifts = (staffId, day) => weekShifts.filter((sh) => sh.staffId === staffId && sh.day === day).sort((a, b) => parseTime(a.start) - parseTime(b.start));

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

  // Area→Station drill-down: stations of the SELECTED area scoped to the selected venue
  // (respects "All venues"). Only meaningful once a specific area is picked.
  const drillStations = useMemo(() => (areaFilter !== "all" ? stationsForArea(stations, areaFilter, selectedVenue) : []), [stations, areaFilter, selectedVenue]);
  // effective station: revert to "all" if the current pick isn't in the area+venue list
  // (e.g. after switching venue/area), so a stale selection can't silently filter wrongly.
  const effStation = drillStations.some((st) => st.id === planStation) ? planStation : "all";

  // rows grouped into area sections (Management / FOH / BOH / Other), honouring the
  // area filter; empty groups are dropped. A MULTI-AREA person appears under EACH of
  // their area groups (staffAreaBuckets), so e.g. a FOH+BOH person shows in both.
  // When a station is selected, rows narrow to staff AT that station (rostered there
  // this week OR tagged it) — see staffAtStation.
  const groupedRows = useMemo(() =>
    AREA_GROUPS
      .map((g) => ({ ...g, members: rows.filter((s) => staffAreaBuckets(s).includes(g.key) && staffAtStation(s, effStation, weekShifts)).sort(byName) }))
      .filter((g) => g.members.length && (areaFilter === "all" || areaFilter === g.key)),
    [rows, areaFilter, effStation, weekShifts]);

  // #5 distinct staff currently shown in the main grid (across all groups) — the basis
  // for the bottom "Staff rostered" headcount row (derived, no extra query).
  const rosteredIds = useMemo(() => new Set(groupedRows.flatMap((g) => g.members.map((s) => s.id))), [groupedRows]);
  const dayHeadcount = (day) => new Set(weekShifts.filter((sh) => sh.day === day && rosteredIds.has(sh.staffId)).map((sh) => sh.staffId)).size;
  const weekHeadcount = new Set(weekShifts.filter((sh) => rosteredIds.has(sh.staffId)).map((sh) => sh.staffId)).size;

  const [form, setForm] = useState({ editId: null, staffId: "", day: "Monday", start: STARTS[0], end: ENDS[0], role: (roles && roles[0]) || ROLES[0], venueId: "", stationId: "", notes: "" });
  const formStations = useMemo(() => stations.filter((s) => s.venueId === form.venueId), [stations, form.venueId]);
  const openAdd = (staffId, day, venueOverride) => {
    const st = staff.find((s) => s.id === staffId);
    setForm((p) => ({
      ...p,
      staffId: staffId || rows[0]?.id || "",
      day: typeof day === "number" ? FULL_DAYS[day] : "Monday",
      // auto-fill the shift role from the staff member's assigned role (Staff Directory); fall back to a group role
      role: st?.role || (roles && roles.includes(p.role) ? p.role : ((roles && roles[0]) || ROLES[0])),
      // venueOverride wins (e.g. the split-view column you clicked); else the staff's venue, else selected/first
      venueId: venueOverride || st?.venueIds?.[0] || st?.venueId || (selectedVenue !== "all" ? selectedVenue : venues[0]?.id || ""),
      stationId: "",
      editId: null,
    }));
    setModal(true);
  };
  // Edit an existing shift — load its values into the same modal.
  const openEdit = (sh) => {
    setForm({
      editId: sh.id, staffId: sh.staffId, day: FULL_DAYS[sh.day] || "Monday",
      start: sh.start, end: sh.end, role: sh.role || ((roles && roles[0]) || ROLES[0]),
      venueId: sh.venueId, stationId: sh.stationId || "", notes: sh.notes || "",
    });
    setShiftDetail(null);
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
    // overlap check excludes the shift being edited (so re-saving its own times is allowed)
    const clash = weekShifts.find((sh) => sh.id !== form.editId && sh.staffId === form.staffId && sh.day === dayIdx
      && ns < parseTime(sh.end) && parseTime(sh.start) < ne);
    if (clash) return showToast(`Already rostered ${clash.start}–${clash.end} at ${clash.venue} that day — can't double-book.`);
    // approved leave blocks rostering across ALL venues (leave is group-wide for the person)
    const sd = new Date(`${wk}T00:00:00`); sd.setDate(sd.getDate() + dayIdx);
    const shiftDate = `${sd.getFullYear()}-${String(sd.getMonth() + 1).padStart(2, "0")}-${String(sd.getDate()).padStart(2, "0")}`;
    const onLeave = (leave || []).find((l) => l.status === "Approved" && l.staffId === form.staffId && (l.startDate || "") <= shiftDate && (l.endDate || l.startDate || "") >= shiftDate);
    if (onLeave) return showToast(`${fullName(st)} is on approved ${onLeave.type} that day (${onLeave.dates}) — on leave across all venues.`);
    const type = parseTime(form.start) >= 15 ? "evening" : "morning";
    const station = stations.find((s) => s.id === form.stationId && s.venueId === venue.id);
    const editing = form.editId ? shifts.find((s) => s.id === form.editId) : null;
    try {
      const shiftData = {
        staffId: form.staffId, staffName: fullName(st),
        day: dayIdx, start: form.start, end: form.end, role: form.role,
        venueId: venue.id, venue: venue.name,
        stationId: station?.id || "", station: station?.name || "",
        type, notes: form.notes.trim(), weekKey: wk, published: true,
      };
      let shiftId;
      if (editing && editing.venueId === venue.id) {
        // edit in place (same venue subcollection)
        await updateDoc(doc(venueCol(groupId, venue.id, "shifts"), form.editId), shiftData);
        shiftId = form.editId;
      } else if (editing) {
        // venue changed → move: delete the old doc, create under the new venue
        await deleteDoc(doc(venueCol(groupId, editing.venueId, "shifts"), form.editId));
        const created = await addDoc(venueCol(groupId, venue.id, "shifts"), { ...shiftData, createdAt: serverTimestamp() });
        shiftId = created.id;
      } else {
        const created = await addDoc(venueCol(groupId, venue.id, "shifts"), { ...shiftData, createdAt: serverTimestamp() });
        shiftId = created.id;
      }
      showToast(editing ? "Shift updated" : "Shift saved");
      // slot-linked checklist auto-assignment — separate async op, NEVER blocks the shift save
      checkAndCreateShiftAssignments(shiftData, shiftId, groupId, checklists)
        .then((r) => {
          if (r.created) showToast(`${r.created} checklist(s) auto-assigned for this shift`);
          else if (r.errors.length) showToast("Shift saved — checklist auto-assign failed");
        })
        .catch(() => showToast("Shift saved — checklist auto-assign failed"));
      setModal(null);
    } catch (e) { showToast("Could not save shift"); }
  };

  const removeShift = async (sh) => {
    try { await deleteDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id)); showToast("Shift removed"); }
    catch { showToast("Could not remove shift"); }
  };

  const th = { padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--gray)", borderBottom: "0.5px solid var(--border)" };
  // #4 sticky header variant for the MAIN roster only. With borderCollapse:collapse a
  // sticky cell drops its own border, so the divider is drawn as an inset box-shadow.
  const thSticky = { ...th, position: "sticky", top: 0, zIndex: 2, background: "var(--gray-light)", borderBottom: undefined, boxShadow: "inset 0 -1px 0 var(--border)" };

  // Cell shifts scoped to a venue (for the split comparison view) — START-time sorted (#1).
  const cellShiftsV = (staffId, day, vid) => weekShifts.filter((sh) => sh.staffId === staffId && sh.day === day && (vid === "all" || sh.venueId === vid)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const VenueGrid = ({ vid }) => {
    // #2 hide Inactive + #3 A→Z, same as the main grid (separate source: scopedStaff).
    const gridRows = scopedStaff.filter((s) => staffInVenue(s, vid) && s.status !== "Inactive").sort(byName);
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
                            <div key={sh.id} className={`shift-cell ${cellClass(sh.type)}`} style={{ borderLeft: `3px solid ${shiftColor(sh)}` }} title={sh.notes ? sh.notes : "Click to view"} onClick={() => setShiftDetail(sh)}>
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
                <div key={sh.id} className={`shift-cell ${cellClass(sh.type)}`} style={{ borderLeft: `3px solid ${shiftColor(sh)}`, boxShadow: (effStation !== "all" && sh.stationId === effStation) ? "0 0 0 2px var(--red)" : undefined }} title={sh.notes ? sh.notes : "Click to view"} onClick={() => setShiftDetail(sh)}>
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
          {/* staff are limited to the current + next week (2-week window) */}
          <button className="btn btn-sm" disabled={myScope === "staff" && offset <= 0} onClick={() => setOffset((o) => (myScope === "staff" ? Math.max(0, o - 1) : o - 1))}>← Prev</button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 200, textAlign: "center" }}>{weekLabel}</span>
          <button className="btn btn-sm" disabled={myScope === "staff" && offset >= 1} onClick={() => setOffset((o) => (myScope === "staff" ? Math.min(1, o + 1) : o + 1))}>Next →</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setSplitMode((s) => !s)} style={splitMode ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>⊟ Split view</button>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAdd("", 0)}>+ Add shift</button>}
          <button className="btn btn-sm" onClick={() => {
            const rows = [["Staff", "Day", "Start", "End", "Role", "Station", "Venue", "Hours"], ...weekShifts.slice().sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start)).map((sh) => [sh.staffName, FULL_DAYS[sh.day] || "", sh.start, sh.end, sh.role, sh.station || "", sh.venue, shiftHours(sh).toFixed(1)])];
            downloadCsv(`roster-${wk}.csv`, rows); showToast("Roster exported");
          }}>Export</button>
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
              {sh.breakStartAt && <span className="pill pill-amber">Break {fmtClock(sh.breakStartAt)}{sh.breakEndAt ? `–${fmtClock(sh.breakEndAt)}` : ""}</span>}
              {sh.clockOutAt && <span className="pill pill-gray">Out {fmtClock(sh.clockOutAt)}</span>}
              {!sh.clockInAt && <button className="btn btn-sm btn-primary" onClick={() => clock(sh, "clockInAt")}>Clock in</button>}
              {sh.clockInAt && !sh.clockOutAt && !sh.breakStartAt && <button className="btn btn-sm" onClick={() => clock(sh, "breakStartAt")}>Start break</button>}
              {sh.breakStartAt && !sh.breakEndAt && !sh.clockOutAt && <button className="btn btn-sm" onClick={() => clock(sh, "breakEndAt")}>End break</button>}
              {sh.clockInAt && !sh.clockOutAt && (!sh.breakStartAt || sh.breakEndAt) && <button className="btn btn-sm" onClick={() => clock(sh, "clockOutAt")}>Clock out</button>}
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

      {/* Area filter + Area→Station drill-down */}
      {!splitMode && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {[["all", "All"], ["Mgmt", "Management"], ["FOH", "FOH"], ["BOH", "BOH"]].map(([k, l]) => (
            <button key={k} className="btn btn-sm" onClick={() => { setAreaFilter(k); setPlanStation("all"); }}
              style={areaFilter === k ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{l}</button>
          ))}
          {areaFilter !== "all" && drillStations.length > 0 && (
            <select className="form-input" style={{ width: 190, marginLeft: 6 }} value={effStation} onChange={(e) => setPlanStation(e.target.value)} title="Narrow the roster to a station">
              <option value="all">All stations</option>
              {drillStations.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
          {effStation !== "all" && <span style={{ fontSize: 11, color: "var(--gray)" }}>roster narrowed to staff on this station (rostered or tagged)</span>}
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
                <th style={{ ...thSticky, textAlign: "left", width: 130, padding: "10px 14px" }}>Staff</th>
                {DAYS.map((d) => <th key={d} style={thSticky}>{d}</th>)}
                <th style={thSticky}>Hours</th>
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
              {/* #5 per-day distinct-staff headcount (rostered = ≥1 shift that day) */}
              {groupedRows.length > 0 && (
                <tr>
                  <td style={{ padding: "8px 14px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderTop: "0.5px solid var(--border)" }}>Staff rostered</td>
                  {DAYS.map((_, day) => <td key={day} style={{ textAlign: "center", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderTop: "0.5px solid var(--border)" }}>{dayHeadcount(day) || ""}</td>)}
                  <td style={{ textAlign: "center", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderTop: "0.5px solid var(--border)" }}>{weekHeadcount || ""}</td>
                </tr>
              )}
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
              <span className="modal-title">{form.editId ? "Edit shift" : "Add shift"}</span>
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
                <select className="form-input" value={form.role} onChange={setF("role")}>{[...new Set([form.role, ...(roles?.length ? roles : ROLES)].filter(Boolean))].map((r) => <option key={r}>{r}</option>)}</select>
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
              {[["Day", FULL_DAYS[shiftDetail.day]], ["Rostered", `${shiftDetail.start} – ${shiftDetail.end}`], ["Role", shiftDetail.role], ["Venue", shiftDetail.venue], ["Station", shiftDetail.station]].map(([k, v]) => (
                <div key={k}><div className="form-label">{k}</div><div style={{ fontSize: 13 }}>{v || "—"}</div></div>
              ))}
            </div>
            {/* Punch — clock in / break / clock out; admins can edit the times */}
            <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10, marginTop: 12 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Punch{canEdit ? " · admin can edit" : ""}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["Clock in", "clockInAt"], ["Break start", "breakStartAt"], ["Break end", "breakEndAt"], ["Clock out", "clockOutAt"]].map(([lbl, field]) => (
                  <div key={field}>
                    <div className="form-label">{lbl}</div>
                    {canEdit
                      ? <input type="time" className="form-input" value={hhmm(shiftDetail[field])} onChange={(e) => setClock(shiftDetail, field, e.target.value)} />
                      : <div style={{ fontSize: 13 }}>{shiftDetail[field] ? fmtClock(shiftDetail[field]) : "—"}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}><div className="form-label">Notes</div><div style={{ fontSize: 13, color: shiftDetail.notes ? "var(--ink)" : "var(--gray)" }}>{shiftDetail.notes || "No notes"}</div></div>
            <div className="btn-row">
              {canEdit && <button className="btn btn-primary" onClick={() => openEdit(shiftDetail)}>Edit shift</button>}
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
