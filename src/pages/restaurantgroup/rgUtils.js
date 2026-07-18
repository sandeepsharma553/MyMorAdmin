import { venueColor } from "../../utils/restaurantGroupPaths";
import { staffAreas } from "./staffStructureUtils";

export const fullName = (s) => s?.name || `${s?.first || ""} ${s?.last || ""}`.trim();

export const initials = (s) => {
  const n = fullName(s);
  const parts = n.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const avatarColor = (s) => venueColor(s?.venue);

export const certPill = (cert) => {
  if (cert === "Food Safety Supervisor") return "pill-green";
  if (cert === "Food Handler" || cert === "RSA") return "pill-blue";
  return "pill-gray";
};

export const leaveTypePill = (type) => {
  if (/sick/i.test(type)) return "pill-blue";
  if (/study/i.test(type)) return "pill-purple";
  if (/annual/i.test(type)) return "pill-amber";
  if (/unpaid/i.test(type)) return "pill-gray";
  return "pill-amber";
};

export const leaveStatusPill = (status) => {
  if (status === "Approved") return "pill-green";
  if (status === "Declined") return "pill-red";
  return "pill-amber";
};

// Display label for a leave request — "Other" shows its stored free text (typeOther,
// Phase 4a). THE one shared copy (Phase 4c): planner grid/footer/guard, leave page,
// calendar and notification bodies all use it.
export const leaveLabel = (l) => (l?.type === "Other" ? (l?.typeOther || "Other") : (l?.type || ""));

export const trainingStatusPill = (status) => {
  if (status === "Complete") return "pill-green";
  if (status === "Overdue") return "pill-red";
  if (status === "Awaiting sign-off") return "pill-purple";
  if (status === "In progress") return "pill-amber";
  return "pill-blue";
};

export const trainingBarColor = (status) => {
  if (status === "Complete") return "var(--green)";
  if (status === "Overdue") return "var(--red)";
  if (status === "In progress") return "var(--amber)";
  return "var(--blue)";
};

export const progressColor = (pct) => {
  if (pct >= 80) return "var(--green)";
  if (pct >= 50) return "var(--amber)";
  return "var(--red)";
};

export const noteTypePill = (type) => {
  if (/recognition/i.test(type)) return "pill-green";
  if (/warning/i.test(type)) return "pill-red";
  if (/coaching/i.test(type)) return "pill-amber";
  return "pill-gray";
};

// ── assignment eligibility (area relevance) ──
// Managerial ROLES see ALL modules & checklists; everyone else sees their areas +
// universal ("All") items, scoped to the venues they work at. NB: area-based see-all
// (area === "Mgmt") was DROPPED — visibility is now exactly the areas in the list.
export const staffSeesAll = (s) =>
  /manager|supervisor|in charge|owner|admin/i.test(s?.role || "");

export const moduleForStaff = (m, s) => {
  if (!(s?.venueIds || []).includes(m?.venueId)) return false;
  if (staffSeesAll(s)) return true;
  return m?.cat === "All" || staffAreas(s).includes(m?.cat);
};

export const checklistForStaff = (c, s) => {
  if (!(s?.venueIds || []).includes(c?.venueId)) return false;
  if (staffSeesAll(s)) return true;
  const a = c?.area || "All";
  return a === "All" || staffAreas(s).includes(a);
};

// snapshot a module's step items onto an assignment so the assignee ticks each
export const stepsItemCount = (steps) => (steps || []).reduce((a, s) => a + ((s.items || []).length), 0);
export const snapshotForAssign = (m) => {
  const total = stepsItemCount(m?.steps);
  return { sections: m?.steps || [], checks: Array(total).fill(false), itemsTotal: total, link: m?.link || "" };
};

// snapshot a checklist's items onto a per-staff assignment so they tick their own copy
export const snapshotForChecklist = (c) => {
  const items = c?.items || [];
  return { items, checks: Array(items.length).fill(false), itemsTotal: items.length, station: c?.station || "", area: c?.area || "All" };
};

// average ticked-progress across a staff member's assignments (reflects items done)
export const trainingPct = (staffId, assignments) => {
  const list = (assignments || []).filter((a) => a.staffId === staffId);
  if (!list.length) return 0;
  return Math.round(list.reduce((a, x) => a + (x.progress || 0), 0) / list.length);
};
// ── shift hours → auto weekly hours (mirrors ShiftPlannerPage) ──
export const parseShiftTime = (t) => {
  if (!t) return 0;
  const s = String(t).trim().toLowerCase().replace(/\s+/g, "");
  // 12-hour with meridiem (with or without a space): "9:00am", "2:30 pm"
  const m = /^(\d{1,2}):(\d{2})(am|pm)$/.exec(s);
  if (m) {
    let h = parseInt(m[1], 10) % 12;
    if (m[3] === "pm") h += 12;
    return h + parseInt(m[2], 10) / 60;
  }
  // 24-hour: "09:00", "14:30"
  const h24 = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (h24) return parseInt(h24[1], 10) + parseInt(h24[2], 10) / 60;
  return 0;
};
export const shiftHours = (sh) => Math.max(0, parseShiftTime(sh.end) - parseShiftTime(sh.start));
// SINGLE source of truth for shift week keys. Returns the Monday-of-week key for a date.
// Kept in the existing `toISOString().slice(0,10)` form so already-stored shift weekKeys
// still match (see Issue 18 — format intentionally unchanged, just consolidated).
export const weekKeyOf = (date = new Date()) => {
  const d = new Date(date);
  const dow = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
};
export const weekDayIndex = (date = new Date()) => (new Date(date).getDay() + 6) % 7; // 0 = Monday
export const currentWeekKey = () => weekKeyOf();
// Invert weekKeyOf: recover the LOCAL Monday Date from a stored weekKey. The
// stored key is toISOString().slice(0,10) of a LOCAL Monday midnight, so in
// UTC+X (X>0 — all of Australia) it names the PREVIOUS day. A candidate must
// be a local Monday AND round-trip through weekKeyOf — exact in any timezone,
// no hardcoded offset, stored key format untouched. (Ops has the same inverse
// in its pure timeEntry.js — keep the algorithms in sync.)
export const mondayFromWeekKey = (weekKey) => {
  const base = new Date(`${weekKey}T00:00:00`);
  for (const add of [0, 1]) {
    const c = new Date(base); c.setDate(base.getDate() + add); c.setHours(0, 0, 0, 0);
    if (c.getDay() === 1 && weekKeyOf(c) === weekKey) return c;
  }
  return base; // unreachable for keys written by weekKeyOf; safe fallback
};
// LOCAL business-date string (YYYY-MM-DD) — the ONLY correct way to turn a local
// Date into a calendar-date key. NEVER use toISOString() for a business date: in
// UTC+10 it names the PREVIOUS day for anything before 10am (and for any local
// midnight). weekKeyOf above is the deliberate legacy exception — its shifted
// format is load-bearing for stored shift keys and must not be "fixed" silently.
export const localDateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ── Phase 3e: unified time options + venue-hours bounding (single source — replaces the
// planner/poster local mkTimes/TIMES copies) ──
// 15-minute time options in the "9:00am"/"5:30pm" shape shifts use.
export const mkTimes = (fromMin = 0, toMin = 23 * 60 + 45) => {
  const out = [];
  for (let m = fromMin; m <= toMin; m += 15) {
    const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am", h12 = (h % 12) || 12;
    out.push(`${h12}:${String(mm).padStart(2, "0")}${ap}`);
  }
  return out;
};
// THE full-day list (12:00am–11:45pm) — the single fallback every picker shares.
export const FULL_DAY_TIMES = mkTimes(0, 23 * 60 + 45);
// 24h "HH:MM" (venue.hours open/close) → minutes; null when unparseable.
export const hhmmToMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || "").trim()); return m ? (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) : null; };
// venue.hours day keys, Monday-first (same order as the planner day columns).
export const HOURS_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
// "YYYY-MM-DD" → venue.hours day key.
export const dayKeyOfDate = (dateStr) => HOURS_KEYS[(new Date(`${dateStr}T00:00:00`).getDay() + 6) % 7];
// 15-min options from (open − 1h) to (close + 1h), clamped to the day; FULL-DAY list when
// the envelope is null. THE shared bound every time picker now uses (Phase 3e buffer: ±1h
// — was open−2h…close+2h on the Admin planner, unbounded everywhere else).
export const boundedTimes = (env) => {
  if (!env || env.openMin == null || env.closeMin == null) return FULL_DAY_TIMES;
  return mkTimes(Math.max(0, env.openMin - 60), Math.min(23 * 60 + 45, env.closeMin + 60));
};
// One venue's usable hours for a day — null when closed / missing / unparseable.
export const hoursEnvelopeForDay = (venue, dayKey) => {
  const h = venue?.hours?.[dayKey];
  if (!h || h.closed === true) return null;
  const openMin = hhmmToMin(h.open), closeMin = hhmmToMin(h.close);
  if (openMin == null || closeMin == null) return null;
  return { openMin, closeMin };
};
// Widest envelope across a CLUSTER's venues for a day: earliest open, latest close.
// PER-VENUE fallback — venues with no usable hours are DROPPED (one blank venue never
// forces the whole cluster to full-day); null ONLY when NO venue in the pool has usable
// hours that day (caller then falls back to FULL_DAY_TIMES). "__default__" (the unassigned
// pool) = venues with no clusterId; literal kept here so this block stays byte-mirrored
// with Ops rgUtils, where importing staffStructureUtils.DEFAULT_CLUSTER_ID would cycle.
export const clusterEnvelopeForDay = (venues, clusterId, dayKey) => {
  const pool = (venues || []).filter((v) => (clusterId === "__default__" ? !v.clusterId : v.clusterId === clusterId));
  const envs = pool.map((v) => hoursEnvelopeForDay(v, dayKey)).filter(Boolean);
  if (!envs.length) return null;
  return { openMin: Math.min(...envs.map((e) => e.openMin)), closeMin: Math.max(...envs.map((e) => e.closeMin)) };
};
// total hours rostered to this staff member in the CURRENT week
export const weeklyHours = (staffId, shifts) => {
  const wk = currentWeekKey();
  const total = (shifts || [])
    .filter((sh) => sh.staffId === staffId && (sh.weekKey || wk) === wk)
    .reduce((a, sh) => a + shiftHours(sh), 0);
  return Math.round(total * 10) / 10;
};

// ── certificate expiry status ──
export const certStatus = (expiry) => {
  if (!expiry) return { pill: "pill-gray", note: "" };
  const days = Math.ceil((new Date(expiry) - new Date()) / 86400000);
  if (days < 0) return { pill: "pill-red", note: "expired" };
  if (days <= 30) return { pill: "pill-amber", note: `${days}d left` };
  return { pill: "pill-green", note: "" };
};

export const checklistPct = (staffId, checklistAssignments) => {
  const list = (checklistAssignments || []).filter((a) => a.staffId === staffId);
  if (!list.length) return 0;
  return Math.round(list.reduce((a, x) => a + (x.progress || 0), 0) / list.length);
};

// Download an array-of-rows as a CSV file (rows[0] is the header row).
// CSV string from rows (shared by plain + encrypted export).
export const csvText = (rows) => {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return (rows || []).map((r) => r.map(esc).join(",")).join("\r\n");
};
export const downloadCsv = (filename, rows) => {
  const csv = csvText(rows);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export const noteTypeLabel = (type) => {
  if (/recognition/i.test(type)) return "⭐ Recognition";
  if (/warning/i.test(type)) return "⚠️ Warning";
  if (/coaching/i.test(type)) return "🧭 Coaching";
  return "📝 Note";
};
