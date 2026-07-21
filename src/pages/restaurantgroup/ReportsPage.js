import React, { useMemo, useState } from "react";
import { useRG } from "./RGContext";
import { fullName, weekKeyOf, localDateKey, fmtHours } from "./rgUtils";
import { areaGetsBreak } from "./staffStructureUtils";
import { contractedWeekStatus, fmtContractedRange } from "./contractedHours";

/* Reports — first tenant: contracted vs rostered (Issue 6 part C).
   THE COMPREHENSIVE VIEW, by design: ALL venues (the top-bar venue picker is ignored) and
   no area/station filters — unlike the planner's strip, which scopes to what the grid
   shows. Same calculator (contractedWeekStatus) as the planner's Hours cell and strip, so
   the two surfaces can never disagree on a person's numbers.
   Data comes ENTIRELY from RGContext (shifts / scopedStaff / leave / stations / group) —
   this page adds NO listener and NO query. scopedStaff is tier security (a manager sees
   their venues' staff), not a report filter — the picker changes nothing here. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Week machinery + paid-hours chain — mirrors ShiftPlannerPage (its versions are
// page-local). ⚠ KEEP identical to the planner's mondayOf/fmt/parseTime/deriveBreak:
// the report's "rostered" figure must equal the planner's Hours column to the minute.
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
const deriveBreak = (startStr, endStr, eligible) => {
  const grossHours = Math.max(0, parseTime(endStr) - parseTime(startStr));
  const breakMins = eligible && grossHours >= 5 ? 30 : 0;
  const unpaidHours = breakMins / 60;
  return { grossHours, breakMins, unpaidHours, paidHours: Math.max(0, grossHours - unpaidHours) };
};

export default function ReportsPage() {
  const { scopedStaff, shifts, leave, stations, group } = useRG();
  const [offset, setOffset] = useState(0);

  const monday = mondayOf(offset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const wk = weekKeyOf(monday);
  const weekLabel = `Week of ${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return localDateKey(d);
  }, []), [offset]); // eslint-disable-line react-hooks/exhaustive-deps -- monday derives 1:1 from offset

  // ⚠ KEEP identical to the planner's effectiveBreak chain (station → area →
  // group.areaBreak flag; manual breakOverrideMins wins when present).
  const shiftBreakEligible = (sh) => {
    const a = stations.find((x) => x.id === sh.stationId && x.venueId === sh.venueId)?.area || null;
    return !!a && areaGetsBreak(group, a);
  };
  const paidHoursOf = (sh) => {
    const d = deriveBreak(sh.start, sh.end, shiftBreakEligible(sh));
    if (sh.breakOverrideMins == null) return d.paidHours;
    return Math.max(0, d.grossHours - sh.breakOverrideMins / 60);
  };

  // ALL VENUES deliberately: the week filter only — selectedVenue is never consulted.
  const weekShiftsAll = useMemo(() => shifts.filter((sh) => (sh.weekKey || wk) === wk), [shifts, wk]);
  // Approved-leave match — same rule as the planner's leaveFor (status "Approved",
  // startDate <= day <= endDate over the 7 shown dates).
  const onLeaveThisWeek = (staffId) => weekDates.some((dateKey) =>
    (leave || []).some((l) => l.status === "Approved" && l.staffId === staffId
      && (l.startDate || "") <= dateKey && (l.endDate || l.startDate || "") >= dateKey));
  // departed staff drop out — same rule as the planner's hasLeft
  const todayISO = localDateKey(new Date());
  const hasLeft = (s) => {
    const st = (s.status || "Active").toLowerCase();
    if (["inactive", "left"].includes(st)) return true;
    if (s.endDate && String(s.endDate).slice(0, 10) <= todayISO) return true;
    return false;
  };

  const rows = useMemo(() =>
    scopedStaff.filter((s) => !hasLeft(s)).map((s) => ({
      s,
      cw: contractedWeekStatus(s, weekShiftsAll.filter((sh) => sh.staffId === s.id), paidHoursOf, onLeaveThisWeek(s.id)),
    })),
    [scopedStaff, weekShiftsAll, weekDates, leave, stations, group] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const short = rows.filter((r) => r.cw.status === "short").sort((a, b) => b.cw.shortBy - a.cw.shortBy);
  const met = rows.filter((r) => r.cw.status === "met");
  const onLeave = rows.filter((r) => r.cw.status === "leave"); // contracted staff excluded by the leave rule
  const totalShort = short.reduce((a, r) => a + r.cw.shortBy, 0);
  const tableRows = [...short, ...met]; // worst gap first, then the met block

  const th = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--gray)", borderBottom: "0.5px solid var(--border)" };
  const td = { padding: "8px 12px", fontSize: 12, borderBottom: "0.5px solid var(--gray-light)" };
  const tile = { flex: 1, minWidth: 160, padding: "12px 14px" };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o - 1)}>← Prev</button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 200, textAlign: "center" }}>{weekLabel}</span>
          <button className="btn btn-sm" onClick={() => setOffset((o) => o + 1)}>Next →</button>
        </div>
      </div>
      {/* the unfiltered promise, stated where it can't be missed */}
      <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 12 }}>
        All venues · all staff — this report ignores the venue picker and the planner's area/station filters. Hours are paid (effective breaks deducted), matching the planner.
      </div>

      {/* summary tiles */}
      <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div className="card" style={tile}>
          <div style={{ fontSize: 22, fontWeight: 700, color: short.length ? "var(--red)" : "inherit" }}>{short.length}</div>
          <div style={{ fontSize: 11, color: "var(--gray)" }}>staff under contracted hours</div>
        </div>
        <div className="card" style={tile}>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{met.length}</div>
          <div style={{ fontSize: 11, color: "var(--gray)" }}>contracted hours met</div>
        </div>
        <div className="card" style={tile}>
          <div style={{ fontSize: 22, fontWeight: 700, color: totalShort ? "var(--red)" : "inherit" }}>{fmtHours(totalShort)}h</div>
          <div style={{ fontSize: 11, color: "var(--gray)" }}>total shortfall this week</div>
        </div>
      </div>

      {/* worst gap first, then the met block */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ background: "var(--gray-light)" }}>
                <th style={th}>Staff</th>
                <th style={th}>Type</th>
                <th style={th}>Contracted</th>
                <th style={th}>Rostered (paid)</th>
                <th style={th}>Gap</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(({ s, cw }) => (
                <tr key={s.id}>
                  <td style={{ ...td, fontWeight: 600 }}>{fullName(s)}</td>
                  <td style={td}>{s.type || ""}</td>
                  <td style={td}>{fmtContractedRange(cw.min, cw.max, "h")}</td>
                  <td style={td}>{fmtHours(cw.hours)}h{cw.byVenue.length > 1 ? <span style={{ color: "var(--gray)", fontSize: 10 }}> ({cw.byVenue.map((v) => `${fmtHours(v.hours)}h ${v.venue}`).join(" · ")})</span> : null}</td>
                  <td style={{ ...td, fontWeight: cw.status === "short" ? 700 : 400, color: cw.status === "short" ? "var(--red)" : "var(--gray)" }}>
                    {cw.status === "short" ? `${fmtHours(cw.shortBy)}h short` : "met"}
                  </td>
                </tr>
              ))}
              {tableRows.length === 0 && <tr><td colSpan={5} style={{ padding: 20, color: "var(--gray)", fontSize: 13 }}>No staff with contracted hours this week.</td></tr>}
            </tbody>
          </table>
        </div>
        {/* Leave-excluded staff are OMITTED from the table (their "gap" would invite
            misreading) but counted here so nobody wonders where they went. */}
        {onLeave.length > 0 && (
          <div style={{ padding: "8px 12px", background: "var(--gray-light)", borderTop: "0.5px solid var(--border)", fontSize: 11, color: "var(--gray)" }}>
            {onLeave.length} contracted staff on approved leave this week — excluded from the comparison: {onLeave.map(({ s }) => fullName(s)).join(", ")}
          </div>
        )}
      </div>
    </>
  );
}
