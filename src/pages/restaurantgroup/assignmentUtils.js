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

/* ════════════════════════════════════════════════════════════════════
 * CANONICAL auto-assign decision — Area → Station → Role (Phase 3c).
 *
 * ⚠ MUST stay byte-identical (same logic) to the server copy at
 *   functions/rgAutoAssign.js  (shouldAutoAssign).
 * Both repos verify this against the SAME truth table (parity test), so server
 * auto-assign (rgOnShiftCreated / rgRecurringChecklists) and client suggest never
 * disagree about who an item is for.
 *
 * Station is a ranking nudge only (matchScore above) — never a hard yes/no gate — so
 * it does NOT appear here. Area is the client matcher; roles refine; managers ("sees
 * all") are eligible for everything. An unset staff.area never blocks (we only exclude
 * on a KNOWN area mismatch). This is the AUTO-assign layer; the broader manual-assign
 * eligibility stays moduleForStaff/checklistForStaff (venue + area, no role-targeting).
 * ════════════════════════════════════════════════════════════════════ */
export function shouldAutoAssign(item, staff, venueId) {
  if (!item || !staff) return false;
  // venue membership (multi-venue via venueIds, legacy single venueId)
  const inVenue = Array.isArray(staff.venueIds) ? staff.venueIds.includes(venueId) : staff.venueId === venueId;
  if (!inVenue) return false;
  // managers / supervisors / admins see everything (mirrors client staffSeesAll)
  const seesAll = staff.area === "Mgmt" || /manager|supervisor|in charge|owner|admin/i.test(staff.role || "");
  // Area (mirrors client moduleForStaff/checklistForStaff): universal "All", exact
  // area match, or seesAll. An unset staff.area never blocks.
  const itemArea = item.cat || item.area || "All";
  const areaOk = seesAll || !staff.area || itemArea === "All" || itemArea === staff.area;
  if (!areaOk) return false;
  // Role targeting: when the item names roles, staff.role must be one (case-insensitive);
  // when it names none, only seesAll staff are auto-targeted (recurring default = managers).
  const roles = (item.autoAssign && item.autoAssign.roles) || [];
  if (roles.length) {
    if (!(staff.role && roles.some((r) => r && r.toLowerCase() === staff.role.toLowerCase()))) return false;
  } else if (!seesAll) {
    return false;
  }
  return true;
}
