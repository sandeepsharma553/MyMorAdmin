import React, { useMemo, useState } from "react";
import { useRG } from "./RGContext";
import { fullName } from "./rgUtils";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// recompute weekKey + day index the SAME way ShiftPlannerPage stores them, so shifts match exactly
const cellWeekInfo = (d) => {
  const dow = (d.getDay() + 6) % 7;
  const m = new Date(d); m.setDate(d.getDate() - dow); m.setHours(0, 0, 0, 0);
  return { weekKey: m.toISOString().slice(0, 10), dayIdx: dow };
};
const shortRole = (r) => (r || "").replace(/^(FOH|BOH) — /, "");

export default function CalendarPage() {
  const { shifts, leave, assignments, venues, staff, scopedStaff, myStaff, myScope, selectedVenue, can } = useRG();
  const [monthOffset, setMonthOffset] = useState(0);
  const [dayOpen, setDayOpen] = useState(null); // a Date

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

  const isStaff = myScope === "staff";
  const Chip = ({ bg, color, children, title }) => (
    <div title={title} style={{ background: bg, color, fontSize: 10, borderRadius: 4, padding: "1px 4px", marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</div>
  );

  const detail = dayOpen ? eventsFor(dayOpen) : null;

  if (!can("calendar", "view")) {
    return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>You don’t have access to the calendar.</div>;
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-sm" onClick={() => setMonthOffset((o) => o - 1)}>← Prev</button>
          <span style={{ fontSize: 15, fontWeight: 700, minWidth: 170, textAlign: "center" }}>{MONTHS[month]} {year}</span>
          <button className="btn btn-sm" onClick={() => setMonthOffset((o) => o + 1)}>Next →</button>
          {monthOffset !== 0 && <button className="btn btn-sm" onClick={() => setMonthOffset(0)}>Today</button>}
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>{isStaff ? "Your schedule" : "Team schedule"} · shifts, approved leave & training due</div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
          {DOW.map((d) => <div key={d} style={{ padding: "8px 6px", textAlign: "center", fontSize: 11, fontWeight: 700, color: "var(--gray)", background: "var(--gray-light)", borderBottom: "0.5px solid var(--border)" }}>{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} style={{ minHeight: 96, background: "var(--gray-light)", opacity: 0.4, borderBottom: "0.5px solid var(--gray-light)", borderRight: "0.5px solid var(--gray-light)" }} />;
            const k = dayKey(d);
            const { sh, lv, tr, bd } = eventsFor(d);
            const items = [
              ...bd.map((s) => ({ type: "bday", t: `🎂 ${nameOf(s.id)}`, bg: "#fce7f3", color: "#9d174d", title: `${nameOf(s.id)}'s birthday` })),
              ...sh.map((s) => ({ type: "shift", t: `${isStaff ? "" : nameOf(s.staffId) + " "}${s.start}–${s.end}`, bg: "var(--blue-light)", color: "var(--ink)", title: `${nameOf(s.staffId)} · ${shortRole(s.role)} · ${s.venue}` })),
              ...lv.map((l) => ({ type: "leave", t: `${isStaff ? "" : nameOf(l.staffId) + " "}${l.type}`, bg: "var(--amber-light)", color: "var(--ink)", title: `${nameOf(l.staffId)} · ${l.type}` })),
              ...tr.map((a) => ({ type: "train", t: `${isStaff ? "" : nameOf(a.staffId) + " "}${a.moduleTitle} due`, bg: "#fee2e2", color: "#991b1b", title: `Training due: ${a.moduleTitle}` })),
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

      <div style={{ display: "flex", gap: 14, marginTop: 12, flexWrap: "wrap" }}>
        {[["var(--blue-light)", "Shift"], ["var(--amber-light)", "Approved leave"], ["#fee2e2", "Training due"], ["#fce7f3", "Birthday 🎂"]].map(([bg, l]) => (
          <span key={l} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--border)" }} />{l}
          </span>
        ))}
      </div>

      {/* Day detail */}
      {dayOpen && detail && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setDayOpen(null)}>
          <div className="rg-modal" style={{ maxWidth: 440 }}>
            <div className="modal-head"><span className="modal-title">{DOW[(dayOpen.getDay() + 6) % 7]} {dayOpen.getDate()} {MONTHS[dayOpen.getMonth()]}</span><button className="modal-close" onClick={() => setDayOpen(null)}>✕</button></div>
            {detail.sh.length + detail.lv.length + detail.tr.length + detail.bd.length === 0 && <div style={{ fontSize: 13, color: "var(--gray)" }}>Nothing scheduled.</div>}
            {detail.bd.length > 0 && <><div className="form-label" style={{ marginTop: 4 }}>Birthdays 🎂</div>
              {detail.bd.map((s) => <div key={s.id} style={{ fontSize: 13, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span className="pill" style={{ background: "#fce7f3", color: "#9d174d" }}>🎂 Happy birthday</span> {nameOf(s.id)}</div>)}</>}
            {detail.sh.length > 0 && <><div className="form-label" style={{ marginTop: 4 }}>Shifts</div>
              {detail.sh.map((s) => <div key={s.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span><strong>{s.start}–{s.end}</strong> · {nameOf(s.staffId)}</span><span style={{ color: "var(--gray)" }}>{shortRole(s.role)}{s.station ? ` · ${s.station}` : ""} · {s.venue}</span></div>)}</>}
            {detail.lv.length > 0 && <><div className="form-label" style={{ marginTop: 10 }}>Approved leave</div>
              {detail.lv.map((l) => <div key={l.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span className="pill pill-amber">{l.type}</span> {nameOf(l.staffId)} <span style={{ color: "var(--gray)" }}>· {l.dates}</span></div>)}</>}
            {detail.tr.length > 0 && <><div className="form-label" style={{ marginTop: 10 }}>Training due</div>
              {detail.tr.map((a) => <div key={a.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}><span className="pill pill-red">Due</span> {a.moduleTitle} <span style={{ color: "var(--gray)" }}>· {nameOf(a.staffId)}</span></div>)}</>}
            <div className="btn-row" style={{ marginTop: 14 }}><button className="btn" onClick={() => setDayOpen(null)}>Close</button></div>
          </div>
        </div>
      )}
    </>
  );
}
