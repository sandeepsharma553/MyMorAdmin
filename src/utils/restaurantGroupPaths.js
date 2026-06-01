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

// Collections that are stored per-venue (used by the context to subscribe & merge).
export const PER_VENUE_COLLECTIONS = [
  "staff", "shifts", "leaveRequests", "checklists",
  "performanceNotes", "trainingModules", "trainingAssignments", "kpis",
];
export const staffCol = (groupId) => groupCol(groupId, "staff");
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
