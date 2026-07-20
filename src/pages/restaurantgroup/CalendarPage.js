import React, { useEffect, useMemo, useState } from "react";
import { getDoc } from "firebase/firestore";
import { useRG } from "./RGContext";
import { staffPrivateDoc } from "../../utils/restaurantGroupPaths";
import { fullName, weekKeyOf, weekDayIndex, leaveLabel, parseShiftTime } from "./rgUtils";
import { isJuniorType, isMinorDob, parseDob } from "./staffMinorUtils";
import { orderedAreas, areaPinned, shiftSectionArea } from "./staffStructureUtils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// weekKey + day index via the shared helper, so shifts match ShiftPlanner exactly
const cellWeekInfo = (d) => ({ weekKey: weekKeyOf(d), dayIdx: weekDayIndex(d) });
const shortRole = (r) => (r || "").replace(/^(FOH|BOH) — /, "");

export default function CalendarPage() {
  const { groupId, group, stations, shifts, leave, assignments, venues, staff, scopedStaff, myStaff, myScope, selectedVenue, can } = useRG();
  const isStaff = myScope === "staff";
  // under-18 by DOB (private — owner/storeAdmin/managers; rules gate the read). Mirrors Staff
  // Directory so a DOB-under-18 staffer counts as "under-18 birthday" even if type isn't "Junior".
  const [minorIds, setMinorIds] = useState(() => new Set());
  const [dobMap, setDobMap] = useState(() => ({})); // id → dob string (for ages)
  const idsKey = staff.map((s) => s.id).join(",");
  useEffect(() => {
    if (isStaff || !groupId || !staff.length) { setMinorIds(new Set()); setDobMap({}); return; }
    let alive = true;
    Promise.all(staff.map((s) => getDoc(staffPrivateDoc(groupId, s.id))
      .then((d) => ({ id: s.id, dob: d.exists() ? d.data().dob : "" })).catch(() => ({ id: s.id, dob: "" }))))
      .then((rows) => { if (!alive) return; const set = new Set(); const map = {}; rows.forEach((r) => { if (r.dob) map[r.id] = r.dob; if (isMinorDob(r.dob)) set.add(r.id); }); setMinorIds(set); setDobMap(map); });
    return () => { alive = false; };
  }, [groupId, idsKey, isStaff]); // eslint-disable-line react-hooks/exhaustive-deps
  const isUnder18 = (s) => minorIds.has(s.id) || isJuniorType(s.type);
  // age a staffer turns on a given date (their birthday) — needs DOB (owner/storeAdmin/manager)
  const ageTurningOn = (id, date) => { const d = parseDob(dobMap[id]); return d ? date.getFullYear() - d.getFullYear() : null; };
  const [monthOffset, setMonthOffset] = useState(0);
  const [view, setView] = useState(isStaff ? "week" : "month"); // staff: 2-week window only → week view
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOpen, setDayOpen] = useState(null); // a Date
  // category filters (dropdown of what to show); birthdays of under-18 (Junior) staff get a "turning 18" highlight
  const [cats, setCats] = useState({ shift: true, leave: true, train: true, bday: true, u18: true });

  const today = new Date();
  const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = base.getFullYear(), month = base.getMonth();
  const todayKey = dayKey(today);

  const nameOf = (id) => {
    const s = staff.find((x) => x.id === id) || (myStaff?.id === id ? myStaff : null);
    return s ? (s.displayName || s.name || fullName(s)) : "";
  };
  // venue membership that also honours the legacy single `venueId` field
  const inVenue = (s, vid) => (s.venueIds || []).includes(vid) || s.venueId === vid;
  // whose schedule this user may see: staff → only self; manager/owner → their scope, filtered by venue
  const scopeIds = useMemo(() => {
    if (myScope === "staff") return new Set(myStaff ? [myStaff.id] : []);
    return new Set(scopedStaff.filter((s) => selectedVenue === "all" || inVenue(s, selectedVenue)).map((s) => s.id));
  }, [myScope, myStaff, scopedStaff, selectedVenue]);

  // teammates whose birthdays to celebrate (your venue's staff; owner sees the venue filter)
  const teamStaff = useMemo(() => {
    if (myScope === "owner") return staff.filter((s) => selectedVenue === "all" || inVenue(s, selectedVenue));
    const mv = myStaff?.venueIds?.length ? myStaff.venueIds : (myStaff?.venueId ? [myStaff.venueId] : []);
    return staff.filter((s) => mv.some((v) => inVenue(s, v)));
  }, [myScope, myStaff, staff, selectedVenue]);

  // under-18 (Junior) staff with an upcoming birthday — they're turning 18 on it. Sorted soonest-first.
  const turning18 = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return teamStaff.filter((s) => isUnder18(s) && s.birthday).map((s) => {
      const [mm, dd] = s.birthday.split("-").map(Number);
      let next = new Date(today.getFullYear(), (mm || 1) - 1, dd || 1);
      if (next < today) next = new Date(today.getFullYear() + 1, (mm || 1) - 1, dd || 1);
      const days = Math.round((next - today) / 86400000);
      return { s, days, when: `${dd} ${MONTHS[(mm || 1) - 1]}` };
    }).sort((a, b) => a.days - b.days);
  }, [teamStaff]);

  const eventsFor = (d) => {
    if (!d) return { sh: [], lv: [], tr: [], bd: [] };
    const k = dayKey(d);
    const mmdd = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const { weekKey, dayIdx } = cellWeekInfo(d);
    const sh = shifts.filter((s) => scopeIds.has(s.staffId) && s.weekKey === weekKey && s.day === dayIdx && (selectedVenue === "all" || s.venueId === selectedVenue));
    const lv = leave.filter((l) => l.status === "Approved" && scopeIds.has(l.staffId) && l.startDate && l.startDate <= k && (l.endDate || l.startDate) >= k);
    const tr = assignments.filter((a) => scopeIds.has(a.staffId) && a.due === k && a.status !== "Complete");
    const bd = teamStaff.filter((s) => s.birthday && s.birthday === mmdd);
    return { sh, lv, tr, bd };
  };

  // month grid cells (Mon-first), padded to full weeks
  const cells = useMemo(() => {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(new Date(year, month, d));
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [year, month]);

  // week view: the 7 days of the (Mon-first) week at weekOffset
  const weekDays = useMemo(() => {
    const start = new Date();
    const dow = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - dow + weekOffset * 7);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [weekOffset]);
  const weekLabel = `${weekDays[0].getDate()} ${MONTHS[weekDays[0].getMonth()]} – ${weekDays[6].getDate()} ${MONTHS[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`;

  const Chip = ({ bg, color, children, title }) => (
    <div title={title} style={{ background: bg, color, fontSize: 10, borderRadius: 4, padding: "1px 4px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
  );

  const detail = dayOpen ? eventsFor(dayOpen) : null;

  // Day-detail SHIFT sections: grouped by the STAFFER'S area (shiftSectionArea — the
  // planner's staff semantics per shift: venue areas → exclusive capture → single →
  // Multi-area; station/role fallback only when the staff doc has
  // no areas), time-sorted within. Section ORDER and LABELS mirror ShiftPlannerPage's
  // rank exactly: pinned areas first (orderedAreas order), then unpinned, then
  // "Multi-area", then "No area assigned". Every shift lands in exactly one section.
  const detailShiftSections = (list) => {
    const ordered = orderedAreas(group);
    // staff doc for a shift: full staff list first, then scopedStaff, else null
    const staffOf = (sid) => staff.find((x) => x.id === sid) || scopedStaff.find((x) => x.id === sid) || null;
    const sectionOf = (s) => {
      const raw = shiftSectionArea(s, staffOf(s.staffId), stations, group);
      if (raw === "__multi__" || raw === "__none__") return raw;
      // normalise a station-cased fallback onto the configured spelling (unchanged rule)
      return ordered.find((a) => a.toLowerCase() === String(raw).toLowerCase()) || raw;
    };
    const idx = (a) => { const i = ordered.indexOf(a); return i === -1 ? ordered.length : i; };
    // mirrors ShiftPlannerPage groupRowsFor's rank: __none__ [3], __multi__ [2],
    // real areas [areaPinned ? 0 : 1, orderedAreas idx], ties by localeCompare
    const rank = (a) => (a === "__none__" ? [3, 0] : a === "__multi__" ? [2, 0] : [areaPinned(group, a) ? 0 : 1, idx(a)]);
    const label = (a) => (a === "__multi__" ? "Multi-area" : a === "__none__" ? "No area assigned" : a);
    const m = new Map();
    [...list].sort((a, b) => parseShiftTime(a.start) - parseShiftTime(b.start))
      .forEach((s) => { const a = sectionOf(s); if (!m.has(a)) m.set(a, []); m.get(a).push(s); });
    return [...m.entries()].sort((x, y) => {
      const rx = rank(x[0]), ry = rank(y[0]);
      return (rx[0] - ry[0]) || (rx[1] - ry[1]) || x[0].localeCompare(y[0]);
    }).map(([a, rows]) => [label(a), rows]);
  };

  if (!can("calendar", "view")) {
    return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>You don’t have access to the calendar.</div>;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* staff are limited to the current + next week (2-week window) */}
          <button className="btn btn-sm" disabled={isStaff && view === "week" && weekOffset <= 0} onClick={() => (view === "month" ? setMonthOffset((o) => o - 1) : setWeekOffset((o) => isStaff ? Math.max(0, o - 1) : o - 1))}>← Prev</button>
          <span style={{ fontSize: 15, fontWeight: 700, minWidth: 190, textAlign: "center" }}>{view === "month" ? `${MONTHS[month]} ${year}` : weekLabel}</span>
          <button className="btn btn-sm" disabled={isStaff && view === "week" && weekOffset >= 1} onClick={() => (view === "month" ? setMonthOffset((o) => o + 1) : setWeekOffset((o) => isStaff ? Math.min(1, o + 1) : o + 1))}>Next →</button>
          {(monthOffset !== 0 || weekOffset !== 0) && <button className="btn btn-sm" onClick={() => { setMonthOffset(0); setWeekOffset(0); }}>Today</button>}
          {!isStaff && (
            <div className="tabs" style={{ marginLeft: 6 }}>
              {[["week", "Week"], ["month", "Month"]].map(([v, l]) => (
                <button key={v} className={`tab ${view === v ? "active" : ""}`} onClick={() => setView(v)}>{l}</button>
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>{isStaff ? "Your schedule · current + next week" : "Team schedule"} · shifts, approved leave & training due</div>
      </div>

      {/* category filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["shift", "Shifts", "var(--blue-light)"], ["leave", "Approved leave", "var(--amber-light)"], ["train", "Training due", "#fee2e2"], ["bday", "Birthday 🎂", "#fce7f3"]].map(([key, l, bg]) => (
          <button key={key} className="btn btn-sm" onClick={() => setCats((c) => ({ ...c, [key]: !c[key] }))} style={cats[key] ? undefined : { opacity: 0.45 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, display: "inline-block", marginRight: 6, border: "1px solid var(--border)", verticalAlign: "middle" }} />{cats[key] ? "" : "Show "}{l}
          </button>
        ))}
        <button className="btn btn-sm" onClick={() => setCats((c) => ({ ...c, u18: !c.u18 }))} style={cats.u18 ? undefined : { opacity: 0.45 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#dcfce7", display: "inline-block", marginRight: 6, border: "1px solid var(--border)", verticalAlign: "middle" }} />{cats.u18 ? "" : "Show "}🎉 Under-18 birthday
        </button>
      </div>

      {view === "week" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
            {weekDays.map((d) => {
              const k = dayKey(d);
              return (
                <div key={k} style={{ padding: "8px 6px", textAlign: "center", fontSize: 11, fontWeight: 700, color: k === todayKey ? "var(--red)" : "var(--gray)", background: "var(--gray-light)", borderBottom: "0.5px solid var(--border)" }}>
                  {DOW[(d.getDay() + 6) % 7]} {d.getDate()} {MONTHS[d.getMonth()]}
                </div>
              );
            })}
            {weekDays.map((d) => {
              const k = dayKey(d);
              const { sh, lv, tr, bd } = eventsFor(d);
              const items = [
                ...bd.filter((s) => (isUnder18(s) ? cats.u18 : cats.bday)).map((s) => { const j = isUnder18(s); return { t: `${j ? "🎉" : "🎂"} ${nameOf(s.id)}${j ? " · turning 18" : ""}`, bg: j ? "#dcfce7" : "#fce7f3", color: j ? "#166534" : "#9d174d" }; }),
                ...(cats.shift ? sh.sort((a, b) => (a.start || "").localeCompare(b.start || "")).map((s) => ({ t: `${s.start}–${s.end} ${isStaff ? "" : nameOf(s.staffId)}${s.station ? ` · ${s.station}` : ""}`, bg: "var(--blue-light)", color: "var(--ink)" })) : []),
                ...(cats.leave ? lv.map((l) => ({ t: `${isStaff ? "" : nameOf(l.staffId) + " "}${leaveLabel(l)}`, bg: "var(--amber-light)", color: "var(--ink)" })) : []),
                ...(cats.train ? tr.map((a) => ({ t: `${a.moduleTitle} due${isStaff ? "" : ` · ${nameOf(a.staffId)}`}`, bg: "#fee2e2", color: "#991b1b" })) : []),
              ];
              return (
                <div key={k} onClick={() => setDayOpen(d)} style={{ minHeight: 260, padding: 6, borderRight: "0.5px solid var(--gray-light)", cursor: "pointer", background: k === todayKey ? "rgba(192,57,43,0.05)" : "#fff" }}>
                  {items.length === 0 && <div style={{ fontSize: 10, color: "var(--gray)", textAlign: "center", marginTop: 16 }}>—</div>}
                  {items.map((it, j) => <Chip key={j} bg={it.bg} color={it.color}>{it.t}</Chip>)}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view === "month" && (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {DOW.map((d) => <div key={d} style={{ padding: "8px 6px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--gray)", background: "var(--gray-light)", borderBottom: "0.5px solid var(--border)" }}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} style={{ minHeight: 96, background: "var(--gray-light)", opacity: 0.4, borderBottom: "0.5px solid var(--gray-light)", borderRight: "0.5px solid var(--gray-light)" }} />;
            const k = dayKey(d);
            const { sh, lv, tr, bd } = eventsFor(d);
            const items = [
              ...bd.filter((s) => (isUnder18(s) ? cats.u18 : cats.bday)).map((s) => { const j = isUnder18(s); return { type: "bday", t: `${j ? "🎉" : "🎂"} ${nameOf(s.id)}${j ? " · turning 18" : ""}`, bg: j ? "#dcfce7" : "#fce7f3", color: j ? "#166534" : "#9d174d", title: j ? `${nameOf(s.id)} — turning 18` : `${nameOf(s.id)}'s birthday` }; }),
              ...(cats.shift ? sh.map((s) => ({ type: "shift", t: `${isStaff ? "" : nameOf(s.staffId) + " "}${s.start}–${s.end}`, bg: "var(--blue-light)", color: "var(--ink)", title: `${nameOf(s.staffId)} · ${shortRole(s.role)} · ${s.venue}` })) : []),
              ...(cats.leave ? lv.map((l) => ({ type: "leave", t: `${isStaff ? "" : nameOf(l.staffId) + " "}${leaveLabel(l)}`, bg: "var(--amber-light)", color: "var(--ink)", title: `${nameOf(l.staffId)} · ${leaveLabel(l)}` })) : []),
              ...(cats.train ? tr.map((a) => ({ type: "train", t: `${isStaff ? "" : nameOf(a.staffId) + " "}${a.moduleTitle} due`, bg: "#fee2e2", color: "#991b1b", title: `Training due: ${a.moduleTitle}` })) : []),
            ];
            return (
              <div key={i} onClick={() => setDayOpen(d)} style={{ minHeight: 96, padding: 4, borderBottom: "0.5px solid var(--gray-light)", borderRight: "0.5px solid var(--gray-light)", cursor: "pointer", background: k === todayKey ? "rgba(192,57,43,0.05)" : "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: k === todayKey ? 700 : 500, color: k === todayKey ? "var(--red)" : "var(--ink)", textAlign: "right", marginBottom: 2 }}>{d.getDate()}</div>
                {items.slice(0, 3).map((it, j) => <Chip key={j} bg={it.bg} color={it.color} title={it.title}>{it.t}</Chip>)}
                {items.length > 3 && <div style={{ fontSize: 10, color: "var(--gray)" }}>+{items.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Turning 18 — who's coming up (so it's never missed) */}
      {!isStaff && cats.u18 && turning18.length > 0 && (
        <div className="card" style={{ marginTop: 12, borderLeft: "4px solid #16a34a" }}>
          <div className="card-head" style={{ marginBottom: 6 }}><span className="card-title">🎉 Turning 18</span><span className="card-sub">under-18 staff with an upcoming birthday</span></div>
          {turning18.map(({ s, days, when }) => (
            <div key={s.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
              <span><strong>{nameOf(s.id)}</strong> turns 18 on {when}</span>
              <span className="pill" style={{ background: days <= 1 ? "#fee2e2" : "#dcfce7", color: days <= 1 ? "#991b1b" : "#166534" }}>{days === 0 ? "today 🎂" : days === 1 ? "tomorrow" : `in ${days} days`}</span>
            </div>
          ))}
        </div>
      )}

      {/* Day detail */}
      {dayOpen && detail && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setDayOpen(null)}>
          <div className="rg-modal" style={{ maxWidth: 440 }}>
            <div className="modal-head"><span className="modal-title">{DOW[(dayOpen.getDay() + 6) % 7]} {dayOpen.getDate()} {MONTHS[dayOpen.getMonth()]}</span><button className="modal-close" onClick={() => setDayOpen(null)}>✕</button></div>
            {detail.sh.length + detail.lv.length + detail.tr.length + detail.bd.length === 0 && <div style={{ fontSize: 13, color: "var(--gray)" }}>Nothing scheduled.</div>}
            {detail.bd.length > 0 && <><div className="form-label" style={{ marginTop: 4 }}>Birthdays 🎂</div>
              {detail.bd.map((s) => { const j = isUnder18(s); const age = ageTurningOn(s.id, dayOpen); return <div key={s.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span className="pill" style={{ background: j ? "#dcfce7" : "#fce7f3", color: j ? "#166534" : "#9d174d" }}>{j ? "🎉 Turning 18" : "🎂 Happy birthday"}</span> {nameOf(s.id)}{age != null ? ` — turning ${age} (${age - 1} → ${age})` : (j ? " — turning 18 today" : "")}</div>; })}</>}
            {detail.sh.length > 0 && <><div className="form-label" style={{ marginTop: 4 }}>Shifts</div>
              {detailShiftSections(detail.sh).map(([area, rows]) => <React.Fragment key={area}>
                <div className="form-label" style={{ marginTop: 6, fontSize: 10, color: "var(--gray)", textTransform: "uppercase", letterSpacing: 0.4 }}>{area} · {rows.length}</div>
                {rows.map((s) => <div key={s.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span><strong>{s.start}–{s.end}</strong> · {nameOf(s.staffId)}</span><span style={{ color: "var(--gray)" }}>{shortRole(s.role)}{s.station ? ` · ${s.station}` : ""} · {s.venue}</span></div>)}
              </React.Fragment>)}</>}
            {detail.lv.length > 0 && <><div className="form-label" style={{ marginTop: 10 }}>Approved leave</div>
              {detail.lv.map((l) => <div key={l.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span className="pill pill-amber">{leaveLabel(l)}</span> {nameOf(l.staffId)} <span style={{ color: "var(--gray)" }}>· {l.dates}</span></div>)}</>}
            {detail.tr.length > 0 && <><div className="form-label" style={{ marginTop: 10 }}>Training due</div>
              {detail.tr.map((a) => <div key={a.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span className="pill pill-red">Due</span> {a.moduleTitle} <span style={{ color: "var(--gray)" }}>· {nameOf(a.staffId)}</span></div>)}</>}
            <div className="btn-row" style={{ marginTop: 14 }}><button className="btn" onClick={() => setDayOpen(null)}>Close</button></div>
          </div>
        </div>
      )}
    </>
  );
}
