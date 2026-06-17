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

// Bucket a staff member into an area for the categorized roster. There is NO
// "CK"/"Kitchen" bucket — Central Kitchen is a venue; its staff carry their real
// FOH/BOH/Mgmt area and are reached via the venue filter.
export const staffAreaBucket = (s) => {
  if (s?.area === "FOH" || s?.area === "BOH" || s?.area === "Mgmt") return s.area;
  const r = s?.role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  return s?.area || "Other";
};
