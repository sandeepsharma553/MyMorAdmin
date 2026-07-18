import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { onSnapshot } from "firebase/firestore";
import { useSelector } from "react-redux";
import {
  groupDoc, venuesCol, venueCol, staffCol, announcementsCol, messagesCol, PER_VENUE_COLLECTIONS,
  notificationsCol, groupAvailabilityCol,
  inventoryItemsCol, menuItemsCol, recipesCol, modifierGroupsCol, suppliersCol, purchaseOrdersCol,
  awardRatesCol, complianceManualDoc, acknowledgementsCol,
  venueMenuItemsCol, labourTargetsDoc,
} from "../../utils/restaurantGroupPaths";
import { resolveMenuItemAtVenue } from "./rgStockUtils";
import { defaultPermsForRole, hasLevel } from "./rgConfig";
import { resolveAreas, resolveRoles, resolveEmpTypes } from "./staffStructureUtils";

const RGContext = createContext(null);
export const useRG = () => useContext(RGContext);

// Fetch the whole collection and sort client-side. We deliberately avoid
// Firestore orderBy() here: orderBy silently drops any doc missing the sort
// field, which would make venues/kpis vanish if a doc was added without one.
const subColl = (col, setter, sortKey, label, noteErr) => onSnapshot(
  col,
  (snap) => {
    let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (sortKey) {
      rows = rows.slice().sort((a, b) => {
        const av = a[sortKey] ?? Number.MAX_SAFE_INTEGER;
        const bv = b[sortKey] ?? Number.MAX_SAFE_INTEGER;
        return av > bv ? 1 : av < bv ? -1 : 0;
      });
    }
    setter(rows);
  },
  // fail-soft stays ([] so screens keep working) — but RECORD the failure so a
  // rules denial no longer renders identically to a genuinely empty tenant
  () => { setter([]); if (label && noteErr) noteErr(label); }
);

export function RGProvider({ children }) {
  const employee = useSelector((s) => s.auth.employee);
  const groupId = employee?.groupId || employee?.groupid || null;
  const groupRole = employee?.groupRole || "staff"; // safe default — never auto-grant owner
  // current user's effective permission map (explicit overrides, else role defaults)
  const myPerms = useMemo(
    () => ({ ...defaultPermsForRole(groupRole), ...(employee?.permissions && !Array.isArray(employee.permissions) ? employee.permissions : {}) }),
    [groupRole, employee?.permissions]
  );
  // user's venue scope ("all" or a venueId)
  const myVenueId = employee?.venueId || "all";

  const [group, setGroup] = useState(null);
  const [venues, setVenues] = useState([]);
  const [staffAll, setStaffAll] = useState([]); // GROUP-LEVEL (multi-venue via venueIds) — RAW, incl. drafts
  // ── Phase 5c: DRAFT containment — THE one choke point. Drafts (status "draft",
  // case-safe) are excluded from the `staff` array every consumer reads (and therefore
  // from scopedStaff, planner rows, leave/calendar/training/performance targets, pickers
  // and counts) — nothing else about the array changes. ONLY the Staff Directory renders
  // drafts, via the separate draftStaff array below.
  const staff = useMemo(() => staffAll.filter((s) => String(s.status || "").toLowerCase() !== "draft"), [staffAll]);
  const draftStaff = useMemo(() => staffAll.filter((s) => String(s.status || "").toLowerCase() === "draft"), [staffAll]);
  const [announcements, setAnnouncements] = useState([]);
  const [messages, setMessages] = useState([]);
  const [notifications, setNotifications] = useState([]);
  // Stock module — group-level shared definitions (item library is one master
  // list across venues; per-venue quantities live in pv.stock below).
  const [inventoryItems, setInventoryItems] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [modifierGroups, setModifierGroups] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  // Awards & Compliance — group-level award rates + the single versioned manual.
  const [awardRates, setAwardRates] = useState([]);
  const [complianceManual, setComplianceManual] = useState(null);
  // Labour targets (settings/labourTargets — gated doc, NOT the group doc).
  // null = missing OR permission-denied; consumers fall back to their defaults.
  const [labourTargets, setLabourTargets] = useState(null);
  // Acknowledgements: per-staff subcollections, keyed by staffId (fan-out below).
  const [acks, setAcks] = useState({}); // { [staffId]: [{id, ...}] }
  // pv[collection][venueId] = rows[]  — the rest is per-venue
  const [pv, setPv] = useState({});
  const [selectedVenue, setSelectedVenue] = useState("all"); // "all" | venueId
  const [loading, setLoading] = useState(true);
  // Listener failures: { [label]: true } for every collection whose listener
  // errored (rules denial, dropped listener). Data still fail-softs to []/null;
  // this only makes the failure VISIBLE (persistent banner below). Cleared when
  // groupId changes, alongside the loading reset.
  const [loadErrors, setLoadErrors] = useState({});
  const noteErr = useCallback(
    (label) => setLoadErrors((prev) => (prev[label] ? prev : { ...prev, [label]: true })),
    []
  );

  // group doc + venues + staff are group-level
  useEffect(() => {
    if (!groupId) { setLoading(false); setLoadErrors({}); return; }
    setLoading(true);
    setLoadErrors({});
    const unsubs = [
      onSnapshot(groupDoc(groupId), (d) => setGroup(d.exists() ? { id: d.id, ...d.data() } : null), () => { setLoading(false); noteErr("group settings"); }),
      subColl(venuesCol(groupId), setVenues, "order", "venues", noteErr),
      subColl(staffCol(groupId), setStaffAll, undefined, "staff", noteErr),
      subColl(announcementsCol(groupId), setAnnouncements, undefined, "announcements", noteErr),
      subColl(messagesCol(groupId), setMessages, undefined, "messages", noteErr),
      subColl(notificationsCol(groupId), setNotifications, undefined, "notifications", noteErr),
      subColl(inventoryItemsCol(groupId), setInventoryItems, undefined, "stock items", noteErr),
      subColl(menuItemsCol(groupId), setMenuItems, undefined, "menu items", noteErr),
      subColl(recipesCol(groupId), setRecipes, undefined, "recipes", noteErr),
      subColl(modifierGroupsCol(groupId), setModifierGroups, undefined, "modifier groups", noteErr),
      subColl(suppliersCol(groupId), setSuppliers, undefined, "suppliers", noteErr),
      subColl(purchaseOrdersCol(groupId), setPurchaseOrders, undefined, "purchase orders", noteErr),
      subColl(awardRatesCol(groupId), setAwardRates, undefined, "award rates", noteErr),
      onSnapshot(complianceManualDoc(groupId), (d) => setComplianceManual(d.exists() ? { id: d.id, ...d.data() } : null), () => { setComplianceManual(null); noteErr("compliance manual"); }),
      onSnapshot(labourTargetsDoc(groupId), (d) => setLabourTargets(d.exists() ? { id: d.id, ...d.data() } : null), () => { setLabourTargets(null); noteErr("labour targets"); }),
    ];
    const t = setTimeout(() => setLoading(false), 600);
    return () => { clearTimeout(t); unsubs.forEach((u) => u && u()); };
  }, [groupId]);

  // ── Per-venue menu INSTANCES (template+instance model) — subscribed for the
  // SELECTED venue only; at "all" the raw templates are shown (no resolution).
  // ⚠ RULES DEFERRED for venues/{v}/menuItems: until the rules block lands this
  // collection is group-member writable, and any rules error will silently EMPTY
  // the venue menu (subColl error callback → setter([])).
  const [venueMenuInstances, setVenueMenuInstances] = useState([]);
  useEffect(() => {
    // This is the ONLY listener re-subscribed per selected venue, so its stale
    // failure label clears here (venue A's denial must not flag venue B — a
    // false alarm trains people to ignore the banner). The per-venue fan-out
    // labels do NOT clear on venue switch: those listeners subscribe every
    // venue at once, an errored Firestore listener never fires again, and no
    // re-subscription happens on switch — clearing them would silently hide a
    // still-broken listener (a false all-clear).
    setLoadErrors((prev) => {
      if (!prev["venue menu"]) return prev;
      const { "venue menu": _gone, ...rest } = prev;
      return rest;
    });
    if (!groupId || selectedVenue === "all") { setVenueMenuInstances([]); return; }
    return subColl(venueMenuItemsCol(groupId, selectedVenue), setVenueMenuInstances, undefined, "venue menu", noteErr);
  }, [groupId, selectedVenue]); // eslint-disable-line react-hooks/exhaustive-deps
  const menuInstanceById = useMemo(
    () => Object.fromEntries(venueMenuInstances.map((i) => [i.id, i])),
    [venueMenuInstances]
  );
  // Templates resolved against the selected venue's instances. At "all": templates
  // as-is (tagged _mode:"template"). At a venue: items WITHOUT an instance are NOT
  // sold there and drop out of this list entirely.
  const resolvedMenuItems = useMemo(() => (
    selectedVenue === "all"
      ? menuItems.map((m) => ({ ...m, templateId: m.id, _mode: "template" }))
      : menuItems.map((m) => resolveMenuItemAtVenue(m, menuInstanceById[m.id])).filter(Boolean)
  ), [menuItems, menuInstanceById, selectedVenue]);

  // Everything else lives INSIDE each venue. Subscribe to every per-venue
  // collection for every venue, merge, and stamp venueId/venue on each row.
  const venueIdsKey = venues.map((v) => v.id).join(",");
  useEffect(() => {
    if (!groupId || !venues.length) { setPv({}); return; }
    const unsubs = [];
    venues.forEach((v) => {
      // "availability" reuses the SAME per-venue onSnapshot machinery (no ad-hoc listener).
      // It lives in restaurantGroupPaths.PER_VENUE_COLLECTIONS conceptually; extended here
      // locally to keep this change within the two in-scope files.
      [...PER_VENUE_COLLECTIONS, "availability"].forEach((coll) => {
        unsubs.push(onSnapshot(
          venueCol(groupId, v.id, coll),
          (snap) => setPv((prev) => ({
            ...prev,
            [coll]: { ...(prev[coll] || {}), [v.id]: snap.docs.map((d) => ({ id: d.id, venueId: v.id, venue: v.name, ...d.data() })) },
          })),
          () => { setPv((prev) => ({ ...prev, [coll]: { ...(prev[coll] || {}), [v.id]: [] } })); noteErr(`${coll} (${v.name || v.id})`); }
        ));
      });
    });
    return () => unsubs.forEach((u) => u && u());
  }, [groupId, venueIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cluster-scoped availability (NEW group-level collection) — Phase 3c dual-read ──
  const [clusterAvail, setClusterAvail] = useState([]);
  useEffect(() => {
    if (!groupId) { setClusterAvail([]); return; }
    return subColl(groupAvailabilityCol(groupId), setClusterAvail, undefined, "availability", noteErr); // fail-soft → [] until 3d rules land
  }, [groupId]);

  const flat = (coll, sortKey) => {
    let rows = Object.values(pv[coll] || {}).flat();
    if (sortKey) rows = rows.slice().sort((a, b) => ((a[sortKey] ?? 1e15) > (b[sortKey] ?? 1e15) ? 1 : (a[sortKey] ?? 1e15) < (b[sortKey] ?? 1e15) ? -1 : 0));
    return rows;
  };
  const shifts = useMemo(() => flat("shifts"), [pv.shifts]); // eslint-disable-line react-hooks/exhaustive-deps
  const leave = useMemo(() => flat("leaveRequests"), [pv.leaveRequests]); // eslint-disable-line react-hooks/exhaustive-deps
  const checklists = useMemo(() => flat("checklists"), [pv.checklists]); // eslint-disable-line react-hooks/exhaustive-deps
  const perfNotes = useMemo(() => flat("performanceNotes"), [pv.performanceNotes]); // eslint-disable-line react-hooks/exhaustive-deps
  const assignments = useMemo(() => flat("trainingAssignments"), [pv.trainingAssignments]); // eslint-disable-line react-hooks/exhaustive-deps
  const checklistAssignments = useMemo(() => flat("checklistAssignments"), [pv.checklistAssignments]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpis = useMemo(() => flat("kpis", "order"), [pv.kpis]); // eslint-disable-line react-hooks/exhaustive-deps
  const modules = useMemo(() => flat("trainingModules"), [pv.trainingModules]); // eslint-disable-line react-hooks/exhaustive-deps
  const stations = useMemo(() => flat("stations", "order"), [pv.stations]); // eslint-disable-line react-hooks/exhaustive-deps
  const equipment = useMemo(() => flat("equipment", "order"), [pv.equipment]); // eslint-disable-line react-hooks/exhaustive-deps
  const stock = useMemo(() => flat("stock"), [pv.stock]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── Availability DUAL-READ (Phase 3c) ── merges the LEGACY per-venue docs (status-era,
  // venueId/venue stamped by the fan-out) with the NEW cluster-scoped group-level docs into
  // the one informational array downstream consumes (staffId, date, available, allDay,
  // windows, note are common to both; legacy rows also carry venueId/venue, new rows
  // clusterId). _src tags each row so the two sources stay separable.
  // ⚠ LEGACY BRANCH REMOVABLE after the 14-day cutover window clears (post-Phase-3 cleanup):
  // drop the flat("availability") arm here AND the "availability" entry in the per-venue
  // fan-out above.
  const availability = useMemo(() => [
    ...flat("availability").map((a) => ({ ...a, _src: "legacy" })),
    ...clusterAvail.map((a) => ({ ...a, _src: "cluster" })),
  ], [pv.availability, clusterAvail]); // eslint-disable-line react-hooks/exhaustive-deps
  const roles = useMemo(() => resolveRoles(group), [group]);
  // Staff areas: group config when present, else the seed defaults (FOH/BOH/Mgmt).
  const areas = useMemo(() => resolveAreas(group), [group]);
  // Employment types: group config when present, else Casual/Part-time/Full-time/Junior.
  const empTypes = useMemo(() => resolveEmpTypes(group), [group]);

  // ── Toast ─────────────────────────────────────────────
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const venueName = useCallback(
    (id) => venues.find((v) => v.id === id)?.name || "",
    [venues]
  );
  const selectedVenueName = selectedVenue === "all" ? "All venues" : venueName(selectedVenue);

  // helper: does a record match the current venue filter
  const matchVenue = useCallback(
    (rec) => selectedVenue === "all" || rec?.venueId === selectedVenue || rec?.venue === selectedVenueName,
    [selectedVenue, selectedVenueName]
  );

  // permission helpers
  const can = useCallback((moduleKey, level = "view") => hasLevel(myPerms, moduleKey, level), [myPerms]);
  const me = useMemo(() => ({ ...(employee || {}), groupRole, venueId: myVenueId, perms: myPerms }), [employee, groupRole, myVenueId, myPerms]);

  // ── who is this login, and which staff can they act on? ──
  // owner/super → all staff; manager/storeAdmin → staff at their venue(s); staff → only themselves.
  const myUidTop = employee?.uid || employee?.id;
  const myStaff = useMemo(
    () => staff.find((s) => (s.adminUid && s.adminUid === myUidTop) || (s.email && employee?.email && s.email.toLowerCase() === employee.email.toLowerCase())) || null,
    [staff, myUidTop, employee]
  );
  const isOwnerTier = groupRole === "owner" || employee?.type === "superadmin";
  const isManagerTier = groupRole === "manager" || groupRole === "storeAdmin";
  const myScope = isOwnerTier ? "owner" : isManagerTier ? "manager" : "staff";
  const scopedStaff = useMemo(() => {
    if (isOwnerTier) return staff;
    const mv = myStaff?.venueIds || [];
    if (isManagerTier) return staff.filter((s) => (s.venueIds || []).some((v) => mv.includes(v)));
    return myStaff ? [myStaff] : [];
  }, [staff, myStaff, isOwnerTier, isManagerTier]);

  // ── Acknowledgements fan-out (compliance) ──
  // Per-staff subcollection. Managers+ can read everyone's (overview tab); a
  // plain staff member can read only their OWN per firestore.rules, so we
  // subscribe only to the staff ids this caller is allowed to read — avoids a
  // wall of permission-denied listeners. Each listener has an error callback
  // (resets that staff's slot to []) and is unsubscribed on cleanup.
  const ackStaffIds = useMemo(
    () => (isOwnerTier || isManagerTier ? staff.map((s) => s.id) : (myStaff ? [myStaff.id] : [])),
    [staff, isOwnerTier, isManagerTier, myStaff]
  );
  const ackStaffKey = ackStaffIds.join(",");
  useEffect(() => {
    if (!groupId || !ackStaffIds.length) { setAcks({}); return; }
    const unsubs = ackStaffIds.map((sid) => onSnapshot(
      acknowledgementsCol(groupId, sid),
      (snap) => setAcks((prev) => ({ ...prev, [sid]: snap.docs.map((d) => ({ id: d.id, staffId: sid, ...d.data() })) })),
      () => { setAcks((prev) => ({ ...prev, [sid]: [] })); noteErr("acknowledgements"); }
    ));
    return () => unsubs.forEach((u) => u && u());
  }, [groupId, ackStaffKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const acksByStaff = acks; // { staffId: [{id, version, ackedAt, ...}] }
  const acknowledgements = useMemo(() => Object.values(acks).flat(), [acks]);

  // Unread messaging badge (direct messages addressed to me + un-acked announcements in my scope).
  const unreadMessages = useMemo(() => {
    const myUid = me?.uid || me?.id || null;
    const myStaff = staff.find((s) => (s.adminUid && myUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase()));
    const myId = myStaff?.id || myUid;
    if (!myId) return 0;
    const myVenueIds = myStaff?.venueIds || (myVenueId && myVenueId !== "all" ? [myVenueId] : venues.map((v) => v.id));
    const dm = messages.filter((m) => m.toId === myId && !(m.readBy || []).includes(myId)).length;
    const ann = announcements.filter((a) => (a.scope === "all" || myVenueIds.includes(a.scope)) && !(a.readBy || []).includes(myId)).length;
    // venue team-group messages (conv = "venue_<venueId>") I haven't read
    const grp = messages.filter((m) => typeof m.conv === "string" && m.conv.startsWith("venue_")
      && myVenueIds.includes(m.conv.slice(6)) && m.fromId !== myId && !(m.readBy || []).includes(myId)).length;
    return dm + ann + grp;
  }, [messages, announcements, staff, me, myVenueId, venues]);

  // In-app notification feed: addressed to me, to managers (if I am one), or to everyone.
  const myNotifications = useMemo(() => {
    const myId = myStaff?.id || me?.uid || me?.id || null;
    if (!myId) return [];
    const mgr = myScope !== "staff";
    return notifications
      .filter((n) => n.to === "all" || n.to === myId || (n.to === "managers" && mgr))
      .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))
      .slice(0, 80);
  }, [notifications, myStaff, myScope, me]);
  const unreadNotifications = useMemo(() => {
    const myId = myStaff?.id || me?.uid || me?.id || null;
    if (!myId) return 0;
    return myNotifications.filter((n) => !(n.readBy || []).includes(myId)).length;
  }, [myNotifications, myStaff, me]);

  const value = useMemo(() => ({
    groupId, group, venues, staff, draftStaff, shifts, leave, availability, modules, assignments, checklistAssignments, checklists, perfNotes, kpis, stations, equipment, roles, areas, empTypes,
    announcements, messages, unreadMessages, myNotifications, unreadNotifications,
    inventoryItems, menuItems, recipes, modifierGroups, suppliers, purchaseOrders, stock,
    resolvedMenuItems, menuInstanceById, venueMenuInstances,
    awardRates, complianceManual, labourTargets, acksByStaff, acknowledgements,
    selectedVenue, setSelectedVenue, selectedVenueName, venueName, matchVenue,
    me, groupRole, myPerms, can, myStaff, myScope, scopedStaff,
    loading, loadErrors, showToast,
  }), [groupId, group, venues, staff, draftStaff, shifts, leave, availability, modules, assignments, checklistAssignments, checklists, perfNotes, kpis, stations, equipment, roles, areas, empTypes,
      announcements, messages, unreadMessages, myNotifications, unreadNotifications,
      inventoryItems, menuItems, recipes, modifierGroups, suppliers, purchaseOrders, stock,
      resolvedMenuItems, menuInstanceById, venueMenuInstances,
      awardRates, complianceManual, labourTargets, acksByStaff, acknowledgements,
      selectedVenue, selectedVenueName, venueName, matchVenue, me, groupRole, myPerms, can, myStaff, myScope, scopedStaff, loading, loadErrors, showToast]);

  return (
    <RGContext.Provider value={value}>
      {children}
      {toast && <div className="rg-toast show">{toast}</div>}
      {Object.keys(loadErrors).length > 0 && (
        <div className="rg-loaderr" role="alert">
          Some data couldn't load ({Object.keys(loadErrors).join(", ")}). This may be a permissions issue — try reloading.
        </div>
      )}
    </RGContext.Provider>
  );
}
