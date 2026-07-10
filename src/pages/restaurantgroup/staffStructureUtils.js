import { DEFAULT_AREAS, DEFAULT_ROLES, DEFAULT_EMP_TYPES, DEFAULT_LEAVE_TYPES } from "./rgConfig";

/* Pure helpers for the staff-structure (Area/Role/Station) foundation — no React,
 * no Firestore, so they're trivially unit-testable. */

// Areas/Roles/EmploymentTypes come from the group doc when configured, else the seed defaults.
export const resolveAreas = (group) => (group?.areas?.length ? group.areas : DEFAULT_AREAS);
export const resolveRoles = (group) => (group?.roles?.length ? group.roles : DEFAULT_ROLES);
export const resolveEmpTypes = (group) => (group?.empTypes?.length ? group.empTypes : DEFAULT_EMP_TYPES);
// Leave types (Phase 4a): owner-editable named types. "Other" is PERMANENT and appended by
// the request forms — never part of this list.
export const resolveLeaveTypes = (group) => (group?.leaveTypes?.length ? group.leaveTypes : DEFAULT_LEAVE_TYPES);

// ── Per-area rostered-break flag + explicit display order — COMPANION fields on the group
// doc (group.areaBreak: {areaName: bool}, group.areaOrder: [areaName]). group.areas STAYS a
// plain string[]; these never restructure it, so every existing reader keeps working.
// Missing areaBreak entry → TRUE (breaks on by default). areaOrder is intersected with the
// live areas list, then any areas it doesn't mention append in group.areas order — a stale
// or partial order can never hide an area.
export const areaGetsBreak = (group, areaName) => (group?.areaBreak || {})[areaName] !== false;
// Pinned areas sort FIRST on the Shift Planner (group.areaPinned: {areaName: bool}).
// Missing entry → false (not pinned).
export const areaPinned = (group, areaName) => (group?.areaPinned || {})[areaName] === true;
// EXCLUSIVE areas capture membership on the Shift Planner: staff who hold an exclusive
// area are shown ONLY under that area's section, ignoring their other areas
// (group.areaExclusive: {areaName: bool}). Missing entry → false.
export const areaExclusive = (group, areaName) => (group?.areaExclusive || {})[areaName] === true;
export const orderedAreas = (group) => {
  const areas = resolveAreas(group);
  const order = (Array.isArray(group?.areaOrder) ? group.areaOrder : []).filter((a) => areas.includes(a));
  return [...order, ...areas.filter((a) => !order.includes(a))];
};

// ── Clusters (Phase 3a) — a cluster is a NAMED LABOUR POOL holding a set of venues; a
// venue belongs to EXACTLY ONE cluster via venue.clusterId ("" / absent = Unassigned).
// Definitions live on the group doc: group.clusters = [{ id, name }]. `id` is a stable
// generated slug (never the name — names are editable; the later availability key
// {staffId}_{clusterId}_{date} depends on id stability). Authored in Settings; venues are
// assigned in the venue editor. NOTE: membership lives on the VENUE doc, so clusterOfVenue
// takes `venues` (not `group`).
export const groupClusters = (group) => (Array.isArray(group?.clusters) ? group.clusters : []);
export const clusterOfVenue = (venues, venueId) =>
  (venues || []).find((v) => v.id === venueId)?.clusterId || null;
export const clusterName = (group, clusterId) =>
  groupClusters(group).find((c) => c.id === clusterId)?.name || "";
// Ordered unique clusterIds for a staffer: their venueIds → each venue's clusterId, nulls
// (unassigned venues) dropped, deduped, ordered by group.clusters definition order (unknown
// ids last, first-seen order). The LATER availability poster uses this to decide "no picker
// (1 cluster)" vs "pick a cluster (2+)" — NOT wired into any poster/planner yet.
export const clustersForStaff = (group, venues, staffMember) => {
  const vids = staffMember?.venueIds?.length ? staffMember.venueIds : (staffMember?.venueId ? [staffMember.venueId] : []);
  const ids = [...new Set(vids.map((vid) => clusterOfVenue(venues, vid)).filter(Boolean))];
  const order = groupClusters(group).map((c) => c.id);
  const idx = (id) => { const i = order.indexOf(id); return i === -1 ? order.length : i; };
  return ids.sort((a, b) => idx(a) - idx(b));
};
// Poster-facing variant (Phase 3b): NEVER empty — staff whose venues have no cluster fall
// into the implicit "__default__" pool, so the availability doc key
// {staffId}_{clusterId}_{date} always has a cluster and the poster never dead-ends.
export const DEFAULT_CLUSTER_ID = "__default__";
export const clustersForStaffDefaulted = (group, venues, staffMember) => {
  const ids = clustersForStaff(group, venues, staffMember);
  return ids.length ? ids : [DEFAULT_CLUSTER_ID];
};

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

// ── Venue → Area → Station authoring (Settings linked flow) ──
// Stations of one venue within one area — for the in-context authoring lists.
export const stationsInVenueArea = (stations, venueId, area) =>
  (stations || []).filter((st) => st.venueId === venueId && st.area === area);

// Stations in a venue whose area is NOT in the current configured areas list — surfaced
// (amber) so nothing is hidden after an area is renamed/removed.
export const orphanStationsInVenue = (stations, venueId, configuredAreas) =>
  (stations || []).filter((st) => st.venueId === venueId && !(configuredAreas || []).includes(st.area));

// Build a station document body from the Venue+Area context — so area/venueId come from
// where the user is authoring, not picked separately. Same shape as the Stations tab.
export const buildStationPayload = (name, area, venueId, color, order) => ({
  name: (name || "").trim(), area, venueId, color: color || "", order: order || 0,
});

// Shift Planner station drill-down: is a staff member "at" a station? True if they're
// ROSTERED there this week (a shift with that stationId) OR TAGGED that station in
// stationIds[]. "all"/empty → everyone (no filter). The shift-match arm means a person
// rostered at the station but not tagged it is NOT hidden; a tagged person not rostered
// there still shows (a coverage candidate). `weekShifts` = the week's shifts to scan.
export const staffAtStation = (s, stationId, weekShifts) => {
  if (!stationId || stationId === "all") return true;
  if (Array.isArray(s?.stationIds) && s.stationIds.includes(stationId)) return true;
  return (weekShifts || []).some((sh) => sh.staffId === s?.id && sh.stationId === stationId);
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
