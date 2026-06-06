import { collection, doc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Firestore layout for the multi-venue restaurant-group platform:
 *
 *   restaurantGroups/{groupId}
 *     /venues/{venueId}
 *     /staff/{staffId}
 *     /shifts/{shiftId}
 *     /leaveRequests/{id}
 *     /trainingModules/{id}
 *     /trainingAssignments/{id}
 *     /checklists/{id}
 *     /performanceNotes/{id}
 */
export const groupDoc = (groupId) => {
  if (!groupId) throw new Error("groupDoc: missing groupId");
  return doc(db, "restaurantGroups", String(groupId));
};

export const groupCol = (groupId, name) => {
  if (!groupId) throw new Error(`groupCol: missing groupId for "${name}"`);
  return collection(db, "restaurantGroups", String(groupId), name);
};

export const venuesCol = (groupId) => groupCol(groupId, "venues");
export const venueDoc = (groupId, venueId) => doc(db, "restaurantGroups", String(groupId), "venues", String(venueId));

// Generic per-venue subcollection: restaurantGroups/{g}/venues/{v}/{name}.
// All operational data (staff, shifts, leave, checklists, performanceNotes,
// trainingModules, trainingAssignments, kpis) lives INSIDE each venue.
export const venueCol = (groupId, venueId, name) => {
  if (!groupId || !venueId) throw new Error(`venueCol: missing ids for "${name}"`);
  return collection(db, "restaurantGroups", String(groupId), "venues", String(venueId), name);
};
export const venueTrainingCol = (groupId, venueId) => venueCol(groupId, venueId, "trainingModules");

// Collections stored per-venue (subscribed & merged by the context).
// NB: `staff` is GROUP-LEVEL (a staff member can belong to multiple venues via
// venueIds), so it is NOT in this list — see staffCol() below.
export const PER_VENUE_COLLECTIONS = [
  "shifts", "leaveRequests", "checklists", "stations",
  "performanceNotes", "trainingModules", "trainingAssignments", "checklistAssignments", "kpis",
];

// A staff member belongs to one venue or many: matches when venueIds includes
// the target, or (legacy) a single venueId field equals it.
export const staffInVenue = (s, venueId) =>
  venueId === "all" ||
  (Array.isArray(s?.venueIds) ? s.venueIds.includes(venueId) : false) ||
  s?.venueId === venueId;
export const staffCol = (groupId) => groupCol(groupId, "staff");
export const staffDoc = (groupId, staffId) => doc(db, "restaurantGroups", String(groupId), "staff", String(staffId));
// Sensitive payroll/personal data — kept in a private subcollection so it is NOT
// part of the group-readable staff doc (locked to owner/storeAdmin in rules).
export const staffPrivateDoc = (groupId, staffId) => doc(db, "restaurantGroups", String(groupId), "staff", String(staffId), "private", "details");
// Group-level audit trail of sensitive changes — surfaced to the super admin.
export const auditLogCol = (groupId) => groupCol(groupId, "auditLog");
// Group-level messaging: announcements (broadcast) + direct message threads.
export const announcementsCol = (groupId) => groupCol(groupId, "announcements");
export const messagesCol = (groupId) => groupCol(groupId, "messages");
// Deterministic conversation id for a pair of staff ids (order-independent).
export const convId = (a, b) => [String(a), String(b)].sort().join("__");
export const shiftsCol = (groupId) => groupCol(groupId, "shifts");
export const leaveCol = (groupId) => groupCol(groupId, "leaveRequests");
export const modulesCol = (groupId) => groupCol(groupId, "trainingModules");
export const assignmentsCol = (groupId) => groupCol(groupId, "trainingAssignments");
export const checklistsCol = (groupId) => groupCol(groupId, "checklists");
export const perfNotesCol = (groupId) => groupCol(groupId, "performanceNotes");
export const kpisCol = (groupId) => groupCol(groupId, "kpis");

export const VENUE_COLORS = {
  "Mad Benji": "#C0392B",
  "Hey Sister": "#e67e22",
  "Mad Hot Pot": "#8b5cf6",
  "Main Kitchen": "#2563eb",
};

export const venueColor = (name) => VENUE_COLORS[name] || "#6b7280";
