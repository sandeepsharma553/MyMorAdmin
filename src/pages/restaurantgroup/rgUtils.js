import { venueColor } from "../../utils/restaurantGroupPaths";

export const fullName = (s) => s?.name || `${s?.first || ""} ${s?.last || ""}`.trim();

export const initials = (s) => {
  const n = fullName(s);
  const parts = n.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

export const avatarColor = (s) => venueColor(s?.venue);

export const isManager = (s) => /manager/i.test(s?.role || "");
export const isFOH = (s) => /foh/i.test(s?.role || "");
export const isBOH = (s) => /boh|kitchen|fryer|washing/i.test(s?.role || "");

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

// ── assignment eligibility (FOH/BOH relevance) ──
// Managers/supervisors/admins see ALL modules & checklists; FOH/BOH staff see
// only their area + universal ("All") items, scoped to the venues they work at.
export const staffSeesAll = (s) =>
  s?.area === "Mgmt" || /manager|supervisor|in charge|owner|admin/i.test(s?.role || "");

export const moduleForStaff = (m, s) => {
  if (!(s?.venueIds || []).includes(m?.venueId)) return false;
  if (staffSeesAll(s)) return true;
  return m?.cat === s?.area || m?.cat === "All";
};

export const checklistForStaff = (c, s) => {
  if (!(s?.venueIds || []).includes(c?.venueId)) return false;
  if (staffSeesAll(s)) return true;
  const a = c?.area || "All";
  return a === s?.area || a === "All";
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
export const currentWeekKey = () => {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
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

export const noteTypeLabel = (type) => {
  if (/recognition/i.test(type)) return "⭐ Recognition";
  if (/warning/i.test(type)) return "⚠️ Warning";
  if (/coaching/i.test(type)) return "🧭 Coaching";
  return "📝 Note";
};
