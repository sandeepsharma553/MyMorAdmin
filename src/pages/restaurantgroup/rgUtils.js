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

export const noteTypeLabel = (type) => {
  if (/recognition/i.test(type)) return "⭐ Recognition";
  if (/warning/i.test(type)) return "⚠️ Warning";
  if (/coaching/i.test(type)) return "⚠️ Coaching";
  return "📝 Note";
};
