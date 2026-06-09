import React, { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { onSnapshot } from "firebase/firestore";
import { useSelector } from "react-redux";
import {
  groupDoc, venuesCol, venueCol, staffCol, announcementsCol, messagesCol, PER_VENUE_COLLECTIONS,
} from "../../utils/restaurantGroupPaths";
import { defaultPermsForRole, hasLevel, DEFAULT_ROLES } from "./rgConfig";

const RGContext = createContext(null);
export const useRG = () => useContext(RGContext);

// Fetch the whole collection and sort client-side. We deliberately avoid
// Firestore orderBy() here: orderBy silently drops any doc missing the sort
// field, which would make venues/kpis vanish if a doc was added without one.
const subColl = (col, setter, sortKey) => onSnapshot(
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
  () => setter([])
);

export function RGProvider({ children }) {
  const employee = useSelector((s) => s.auth.employee);
  const groupId = employee?.groupId || employee?.groupid || null;
  const groupRole = employee?.groupRole || "owner";
  // current user's effective permission map (explicit overrides, else role defaults)
  const myPerms = useMemo(
    () => ({ ...defaultPermsForRole(groupRole), ...(employee?.permissions && !Array.isArray(employee.permissions) ? employee.permissions : {}) }),
    [groupRole, employee?.permissions]
  );
  // user's venue scope ("all" or a venueId)
  const myVenueId = employee?.venueId || "all";

  const [group, setGroup] = useState(null);
  const [venues, setVenues] = useState([]);
  const [staff, setStaff] = useState([]); // GROUP-LEVEL (multi-venue via venueIds)
  const [announcements, setAnnouncements] = useState([]);
  const [messages, setMessages] = useState([]);
  // pv[collection][venueId] = rows[]  — the rest is per-venue
  const [pv, setPv] = useState({});
  const [selectedVenue, setSelectedVenue] = useState("all"); // "all" | venueId
  const [loading, setLoading] = useState(true);

  // group doc + venues + staff are group-level
  useEffect(() => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true);
    const unsubs = [
      onSnapshot(groupDoc(groupId), (d) => setGroup(d.exists() ? { id: d.id, ...d.data() } : null)),
      subColl(venuesCol(groupId), setVenues, "order"),
      subColl(staffCol(groupId), setStaff),
      subColl(announcementsCol(groupId), setAnnouncements),
      subColl(messagesCol(groupId), setMessages),
    ];
    const t = setTimeout(() => setLoading(false), 600);
    return () => { clearTimeout(t); unsubs.forEach((u) => u && u()); };
  }, [groupId]);

  // Everything else lives INSIDE each venue. Subscribe to every per-venue
  // collection for every venue, merge, and stamp venueId/venue on each row.
  const venueIdsKey = venues.map((v) => v.id).join(",");
  useEffect(() => {
    if (!groupId || !venues.length) { setPv({}); return; }
    const unsubs = [];
    venues.forEach((v) => {
      PER_VENUE_COLLECTIONS.forEach((coll) => {
        unsubs.push(onSnapshot(
          venueCol(groupId, v.id, coll),
          (snap) => setPv((prev) => ({
            ...prev,
            [coll]: { ...(prev[coll] || {}), [v.id]: snap.docs.map((d) => ({ id: d.id, venueId: v.id, venue: v.name, ...d.data() })) },
          })),
          () => setPv((prev) => ({ ...prev, [coll]: { ...(prev[coll] || {}), [v.id]: [] } }))
        ));
      });
    });
    return () => unsubs.forEach((u) => u && u());
  }, [groupId, venueIdsKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const roles = useMemo(() => (group?.roles?.length ? group.roles : DEFAULT_ROLES), [group]);

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

  const value = useMemo(() => ({
    groupId, group, venues, staff, shifts, leave, modules, assignments, checklistAssignments, checklists, perfNotes, kpis, stations, equipment, roles,
    announcements, messages, unreadMessages,
    selectedVenue, setSelectedVenue, selectedVenueName, venueName, matchVenue,
    me, groupRole, myPerms, can, myStaff, myScope, scopedStaff,
    loading, showToast,
  }), [groupId, group, venues, staff, shifts, leave, modules, assignments, checklistAssignments, checklists, perfNotes, kpis, stations, equipment, roles,
      announcements, messages, unreadMessages,
      selectedVenue, selectedVenueName, venueName, matchVenue, me, groupRole, myPerms, can, myStaff, myScope, scopedStaff, loading, showToast]);

  return (
    <RGContext.Provider value={value}>
      {children}
      {toast && <div className="rg-toast show">{toast}</div>}
    </RGContext.Provider>
  );
}
