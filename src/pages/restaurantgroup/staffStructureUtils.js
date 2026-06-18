import { DEFAULT_AREAS, DEFAULT_ROLES, DEFAULT_EMP_TYPES } from "./rgConfig";

/* Pure helpers for the staff-structure (Area/Role/Station) foundation — no React,
 * no Firestore, so they're trivially unit-testable. */

// Areas/Roles/EmploymentTypes come from the group doc when configured, else the seed defaults.
export const resolveAreas = (group) => (group?.areas?.length ? group.areas : DEFAULT_AREAS);
export const resolveRoles = (group) => (group?.roles?.length ? group.roles : DEFAULT_ROLES);
export const resolveEmpTypes = (group) => (group?.empTypes?.length ? group.empTypes : DEFAULT_EMP_TYPES);

// Add a value to a picklist — trimmed, case-insensitively de-duplicated. Returns
// the SAME array reference when nothing changes, so callers can skip the write.
export const addToList = (list, value) => {
  const v = (value || "").trim();
  if (!v) return list;
  if ((list || []).some((x) => x.toLowerCase() === v.toLowerCase())) return list;
  return [...(list || []), v];
};
export const removeFromList = (list, value) => (list || []).filter((x) => x !== value);

// A staff member's areas as a LIST. Backward-compatible: prefer the new areas[],
// else fall back to the legacy single `area` (so un-migrated docs still work).
export const staffAreas = (s) =>
  (Array.isArray(s?.areas) && s.areas.length) ? s.areas : (s?.area ? [s.area] : []);

// Bucket a staff member into ONE area for the categorized roster. There is NO
// "CK"/"Kitchen" bucket — Central Kitchen is a venue; its staff carry their real
// FOH/BOH/Mgmt area and are reached via the venue filter. (Kept for callers that
// need a single primary bucket; multi-area grouping uses staffAreaBuckets below.)
export const staffAreaBucket = (s) => {
  if (s?.area === "FOH" || s?.area === "BOH" || s?.area === "Mgmt") return s.area;
  const r = s?.role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  return s?.area || "Other";
};

// Normalise one area value to a roster bucket (FOH/BOH/Mgmt/Other). Custom areas
// (e.g. "Kitchen") fold to a known bucket by name (Kitchen → BOH), else "Other".
const bucketOfArea = (area) => {
  if (area === "FOH" || area === "BOH" || area === "Mgmt") return area;
  const a = area || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(a)) return "Mgmt";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(a)) return "FOH";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(a)) return "BOH";
  return "Other";
};

// Stations available for a venue given the selected areas — the Add-staff cascade.
// Area-filtered when areas are chosen (fixes the all-stations bug), else all of the
// venue's stations. Always scoped to the one venue (caller renders one block per venue).
export const stationsForVenue = (stations, venueId, selectedAreas) =>
  (stations || []).filter((st) => st.venueId === venueId && (!(selectedAreas || []).length || selectedAreas.includes(st.area)));

// ALL the roster buckets a staff member belongs to — a multi-area person appears
// under EACH of their area groups. Falls back to the single role-based bucket when
// no areas are set, so they're never dropped from the roster.
export const staffAreaBuckets = (s) => {
  const list = staffAreas(s);
  if (!list.length) return [staffAreaBucket(s)];
  return [...new Set(list.map(bucketOfArea))];
};
