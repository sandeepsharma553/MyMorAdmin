/* Phase 3b — pure assignment helpers (no React, no Firestore → unit-testable).
 *
 * SUGGEST: order eligible staff/items by the Area → Station → Role structure.
 * This is SUGGESTION ORDERING ONLY — it never filters anyone out (eligibility is
 * still decided upstream by moduleForStaff/checklistForStaff, kept as the fallback)
 * and it never creates an assignment. Station is a NEW suggestion dimension (Part A
 * found it is stored but read by no matcher today), so this is purely additive.
 *
 * LOCK: a completed training assignment is read-only in the UI; the only way to redo
 * it is reassign (which archives via Phase 1). */

// A training module carries its area in `cat`; a checklist in `area`. Default "All".
export const itemArea = (item) => item?.cat || item?.area || "All";
// Roles an item is aimed at (the autoAssign.roles the server reads, or the editor's autoRoles).
export const itemRoles = (item) => item?.autoAssign?.roles || item?.autoRoles || [];

// How well a staff member matches an item, by Area (dominant) → Station → Role.
// Higher = better; never negative. A non-match simply scores lower — it is never excluded.
export const AREA_WEIGHT = 100, ALL_AREA_WEIGHT = 10, STATION_WEIGHT = 20, ROLE_WEIGHT = 5;
export const matchScore = (item, staff) => {
  if (!item || !staff) return 0;
  let score = 0;
  const a = itemArea(item);
  if (a !== "All" && staff.area && a === staff.area) score += AREA_WEIGHT;
  else if (a === "All") score += ALL_AREA_WEIGHT; // universal item — mild relevance to everyone
  if (item.stationId && Array.isArray(staff.stationIds) && staff.stationIds.includes(item.stationId)) score += STATION_WEIGHT;
  const roles = itemRoles(item);
  if (staff.role && roles.some((r) => r && r.toLowerCase() === staff.role.toLowerCase())) score += ROLE_WEIGHT;
  return score;
};

// Stable best-first ordering that KEEPS every input (fallback never dropped).
export const orderItemsForStaff = (items, staff) =>
  (items || []).map((it, i) => ({ it, i, s: matchScore(it, staff) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);

export const orderStaffForItem = (staffList, item) =>
  (staffList || []).map((st, i) => ({ st, i, s: matchScore(item, st) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.st);

// True when an item is a strong (area-level) suggestion for this staff member —
// used only to show a "Suggested" hint; it never gates eligibility.
export const isSuggested = (item, staff) => matchScore(item, staff) >= AREA_WEIGHT;

// Phase 3b lock: a completed training assignment is read-only (reassign to redo).
export const isAssignmentLocked = (a) => a?.status === "Complete" || a?.verified === true;
