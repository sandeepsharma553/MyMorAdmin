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

// ── Pay basis by EMPLOYMENT TYPE (Bug 1) ── group.empTypeSalaried: {typeName: bool}, a
// COMPANION map beside group.empTypes (mirrors areaBreak: plain map keyed by the type
// NAME, whole-value updateDoc — never dot-notation, names are free text). Key present →
// that value; key ABSENT → seed default: ONLY "Full-time" is salaried. The seed is
// DERIVED here at read time, so existing groups with no empTypeSalaried map (zero
// writes) still show Full-time as salary and everything else as hourly.
export const empTypeIsSalaried = (group, type) => {
  const m = group?.empTypeSalaried || {};
  if (Object.prototype.hasOwnProperty.call(m, String(type ?? ""))) return m[type] === true;
  return type === "Full-time";
};
// Read-fallback for the legacy single private `rate` (NO migration, NO writes): the old
// field was hourly for everyone except salaried staff, where it held an ANNUAL figure —
// the stored legacy `payBasis` is the bucketing signal. The NEW split key wins whenever
// it EXISTS on the doc, INCLUDING when it is "" — private writes are {merge:true}, so a
// deliberately-blanked new field must never be shadowed by a stale legacy `rate`. Only a
// truly ABSENT key (undefined — pre-split doc) falls back.
export const rateSplitFromPrivate = (p) => ({
  annualSalary: p?.annualSalary !== undefined ? p.annualSalary : (p?.payBasis === "salary" ? (p?.rate || "") : ""),
  hourlyRate: p?.hourlyRate !== undefined ? p.hourlyRate : (p?.payBasis === "salary" ? "" : (p?.rate || "")),
});

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
// CROSS-REPO SHARED PREDICATE — must stay BYTE-IDENTICAL to Ops staffStructureUtils
// (modGroupKind/staffSeesAll convention). A shift's area comes ONLY from its
// station (exact id + venue match → station.area); no station or no area → null.
// No keyword/substring area guessing here — role fallbacks are the CALLER's call.
export const shiftAreaOf = (sh, stations) =>
  (stations || []).find((x) => x.id === sh?.stationId && x.venueId === sh?.venueId)?.area || null;
// CROSS-REPO SHARED PREDICATE — must stay BYTE-IDENTICAL to Ops staffStructureUtils
// (modGroupKind/staffSeesAll convention). Role→area inference against the group's
// CONFIGURED areas: classify the role by keyword, then return the owner's OWN spelling
// of the first configured area in that class — "" when none matches. This replaced the
// legacy hardcoded "Mgmt" token: a group that configured "Management" gets "Management",
// one that configured "Leadership" gets "Leadership"; nothing baked in, no alias bridges.
// Class order mirrors the old areaFromRole precedence (managerial first — a "BOH In
// Charge" is management, not BOH) and stops at the first ROLE match: a managerial role
// in a group with no management-flavoured area resolves to "", never to FOH/BOH.
export const roleConfiguredArea = (role, areas) => {
  const r = String(role || "");
  const classes = [
    [/manager|owner|admin|supervisor|in charge/i, /manage|mgmt|lead|admin|supervis/i],
    [/foh|floor|\bbar\b|barista|counter|service/i, /^foh$|front|floor|service/i],
    [/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i, /^boh$|back|kitchen/i],
  ];
  for (const [roleRe, areaRe] of classes) {
    if (roleRe.test(r)) return (areas || []).find((a) => areaRe.test(a)) || "";
  }
  return "";
};
// CROSS-REPO SHARED PREDICATE — must stay BYTE-IDENTICAL to Ops staffStructureUtils
// (modGroupKind/staffSeesAll convention). The Shift Planner's Multi-area MEMBERSHIP
// (groupRowsFor): 2+ distinct areas AND none of them exclusive — an exclusive-area
// holder is captured OUT into that area's own section (Mei: FOH+BOH+Management with
// Management exclusive belongs under Management, never Multi-area). The directory's
// Multi-area chip uses this same predicate so the two surfaces can never disagree.
export const isMultiArea = (s, group) => {
  const sAreas = [...new Set(staffAreas(s).filter(Boolean))];
  return sAreas.length > 1 && !sAreas.some((a) => areaExclusive(group, a));
};
export const orderedAreas = (group) => {
  const areas = resolveAreas(group);
  const order = (Array.isArray(group?.areaOrder) ? group.areaOrder : []).filter((a) => areas.includes(a));
  return [...order, ...areas.filter((a) => !order.includes(a))];
};
// CROSS-REPO SHARED PREDICATE — must stay BYTE-IDENTICAL to Ops
// MyMorOps/src/lib/staffStructureUtils.js (modGroupKind/staffSeesAll convention); both
// copies are locked by twin test files (shiftSectionArea.test.js in each repo), so a
// divergence fails tests rather than shipping silently.
// Which ONE area section a single SHIFT belongs to on shift-level surfaces (the
// Calendar day detail). STRICT AREA-ONLY: for any staffer WITH areas this mirrors
// ShiftPlannerPage groupRowsFor:355-361 EXACTLY — the shift's station and role play
// no part in the decision. Station/role survive ONLY in the no-staff-doc fallback,
// so a shift is never dropped from the popup. Precedence:
//   1. sAreas = the staffer's areas for THIS venue (venueRoles[shift.venueId].areas
//      when non-empty) else the cross-venue union staffAreas(staffDoc) — the same
//      source order as ShiftPlannerPage's split/main grids.
//   2. No staff doc / no areas → the legacy shift-identity fallback: station's area
//      (shiftAreaOf) else role inference (roleConfiguredArea), else "__none__".
//      Never crashes, never drops a shift.
//   3. EXCLUSIVE capture — first exclusive in orderedAreas order (tie: localeCompare);
//      exactly groupRowsFor:357-358. Outranks everything, including a resolved station.
//   4. Exactly one area → that area.
//   5. 2+ areas, none exclusive → "__multi__" (the planner's Multi-area membership).
//      No station arbitration, no role arbitration.
export const shiftSectionArea = (shift, staffDoc, stations, group) => {
  const ordered = orderedAreas(group);
  const idx = (a) => { const i = ordered.indexOf(a); return i === -1 ? ordered.length : i; };
  const perVenue = staffDoc?.venueRoles?.[shift?.venueId]?.areas;
  const sAreas = [...new Set(((perVenue && perVenue.length) ? perVenue : staffAreas(staffDoc)).filter(Boolean))];
  if (!sAreas.length) return shiftAreaOf(shift, stations) || roleConfiguredArea(shift?.role, ordered) || "__none__";
  const exclusives = sAreas.filter((a) => areaExclusive(group, a)).sort((a, b) => (idx(a) - idx(b)) || a.localeCompare(b));
  if (exclusives.length) return exclusives[0];
  return sAreas.length === 1 ? sAreas[0] : "__multi__";
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
// ids last, first-seen order). The availability poster uses this to decide "no picker
// (1 cluster)" vs "pick a cluster (2+)" — wired into the poster + planner since Phase 3b/3c.
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
