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
// Archive of completed/in-progress training assignments removed or reassigned.
// Per-venue subcollection (same shape/location as trainingAssignments) so it is
// covered by the existing venues/{venueId}/{coll}/{docId=**} group-member rule.
// Grows over time → fetched on-demand per staff profile, NOT in PER_VENUE_COLLECTIONS.
export const trainingArchiveCol = (groupId, venueId) => venueCol(groupId, venueId, "trainingArchive");
export const trainingArchiveDoc = (groupId, venueId, id) => doc(trainingArchiveCol(groupId, venueId), String(id));
// Checklist archive — mirrors trainingArchive (same per-venue location, so the existing
// venues/{venueId}/{coll}/{docId=**} group-member rule covers it). On-demand, NOT in
// PER_VENUE_COLLECTIONS.
export const checklistArchiveCol = (groupId, venueId) => venueCol(groupId, venueId, "checklistArchive");
export const checklistArchiveDoc = (groupId, venueId, id) => doc(checklistArchiveCol(groupId, venueId), String(id));

// Collections stored per-venue (subscribed & merged by the context).
// NB: `staff` is GROUP-LEVEL (a staff member can belong to multiple venues via
// venueIds), so it is NOT in this list — see staffCol() below.
// NB: `stockMovements`, `stocktakes` and `batches` are also per-venue but are
// NOT in this list — they grow without bound, so pages subscribe to them
// directly with query limits (same precedent as tempLogs).
export const PER_VENUE_COLLECTIONS = [
  "shifts", "leaveRequests", "checklists", "stations", "equipment",
  "performanceNotes", "trainingModules", "trainingAssignments", "checklistAssignments", "kpis",
  "stock",
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
export const conversationsCol = (groupId) => groupCol(groupId, "conversations");
export const notificationsCol = (groupId) => groupCol(groupId, "notifications");
// Deterministic conversation id for a pair of staff ids (order-independent).
export const convId = (a, b) => [String(a), String(b)].sort().join("__");

/* ── Stock Management + Menus + Supplier Ordering (module #2) ──────────
 * Item DEFINITIONS are group-level (one master library across venues);
 * stock QUANTITY/status is per-venue at /venues/{v}/stock/{itemId} (same
 * doc id as the inventory item, so the two join trivially).            */
export const inventoryItemsCol = (groupId) => groupCol(groupId, "inventoryItems");
export const inventoryItemDoc = (groupId, itemId) => doc(inventoryItemsCol(groupId), String(itemId));
export const menuItemsCol = (groupId) => groupCol(groupId, "menuItems"); // shared with POS Settings
export const menuItemDoc = (groupId, menuItemId) => doc(menuItemsCol(groupId), String(menuItemId));
export const recipesCol = (groupId) => groupCol(groupId, "recipes");
export const recipeDoc = (groupId, recipeId) => doc(recipesCol(groupId), String(recipeId));
export const modifierGroupsCol = (groupId) => groupCol(groupId, "modifierGroups"); // shared with POS Settings
export const modifierGroupDoc = (groupId, id) => doc(modifierGroupsCol(groupId), String(id));
export const suppliersCol = (groupId) => groupCol(groupId, "suppliers");
export const supplierDoc = (groupId, supplierId) => doc(suppliersCol(groupId), String(supplierId));
export const purchaseOrdersCol = (groupId) => groupCol(groupId, "purchaseOrders");
export const purchaseOrderDoc = (groupId, poId) => doc(purchaseOrdersCol(groupId), String(poId));
// Per-venue stock state + audit collections.
export const stockCol = (groupId, venueId) => venueCol(groupId, venueId, "stock");
export const stockDoc = (groupId, venueId, itemId) => doc(stockCol(groupId, venueId), String(itemId));
export const stockMovementsCol = (groupId, venueId) => venueCol(groupId, venueId, "stockMovements");
export const stocktakesCol = (groupId, venueId) => venueCol(groupId, venueId, "stocktakes");
export const batchesCol = (groupId, venueId) => venueCol(groupId, venueId, "batches");
// Central-kitchen production log (Phase 4) — per venue, covered by the existing
// venues/{venueId}/{coll}/{docId=**} security rule (group-member read/write).
export const productionCol = (groupId, venueId) => venueCol(groupId, venueId, "production");

/* ── Awards & Compliance (module #3) ──────────────────────────────────
 * Group-level: one wage-award doc per Fair Work code (awardRates/{code})
 * and a single versioned manual doc (compliance/manual). Each venue
 * selects its award via an explicit venue.awardCode field (NOT venue.type,
 * which is the FOH|BOH|CK venue role). Per-staff acknowledgements live in a
 * subcollection of the staff doc, keyed by manual version — so history is
 * preserved and re-acknowledgement on a new version is one more doc.        */
export const awardRatesCol = (groupId) => groupCol(groupId, "awardRates");
export const awardRateDoc = (groupId, code) => doc(awardRatesCol(groupId), String(code));
export const complianceCol = (groupId) => groupCol(groupId, "compliance");
export const complianceManualDoc = (groupId) => doc(complianceCol(groupId), "manual");
export const acknowledgementsCol = (groupId, staffId) => collection(staffDoc(groupId, staffId), "acknowledgements");
export const acknowledgementDoc = (groupId, staffId, version) => doc(acknowledgementsCol(groupId, staffId), String(version));

/* ── Contract Generator (Documents module) ────────────────────────────
 * Templates are group-level master docs (seeded out-of-band); contract
 * defaults live in a gated settings/ subcollection (NOT the group doc,
 * which is group-readable). Both are owner/storeAdmin-gated in rules.
 * `contracts/{id}` (generated contracts) is added with Step 5.            */
export const contractTemplatesCol = (groupId) => groupCol(groupId, "contractTemplates");
export const contractTemplateDoc = (groupId, id) => doc(contractTemplatesCol(groupId), String(id));
export const contractDefaultsDoc = (groupId) => doc(db, "restaurantGroups", String(groupId), "settings", "contractDefaults");
// Contract settings (Step 8): MA000119 classification list + legal entities (gated subcollection docs).
export const contractClassificationsDoc = (groupId) => doc(db, "restaurantGroups", String(groupId), "settings", "contractClassifications");
export const legalEntitiesDoc = (groupId) => doc(db, "restaurantGroups", String(groupId), "settings", "legalEntities");
// Generated contracts (draft → sent → signed). Owner/storeAdmin gated in rules.
export const contractsCol = (groupId) => groupCol(groupId, "contracts");
export const contractDoc = (groupId, id) => doc(contractsCol(groupId), String(id));

// Brand colours for the first client's venues; any other venue gets a stable colour
// derived from its name (so new/renamed venues aren't all grey).
export const VENUE_COLORS = {
  "Mad Benji": "#C0392B",
  "Hey Sister": "#e67e22",
  "Mad Hot Pot": "#8b5cf6",
  "Main Kitchen": "#2563eb",
};
const VENUE_PALETTE = ["#C0392B", "#e67e22", "#8b5cf6", "#2563eb", "#16a34a", "#0d9488", "#db2777", "#475569"];
export const venueColor = (name) => {
  if (!name) return "#6b7280";
  if (VENUE_COLORS[name]) return VENUE_COLORS[name];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return VENUE_PALETTE[h % VENUE_PALETTE.length];
};
