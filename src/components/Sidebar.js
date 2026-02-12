// Sidebar.jsx — Firestore menu-state badges + RTDB members/joinRequests counts

import React, { useEffect, useMemo, useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  Menu,
  BookOpen,
  BrushCleaning,
  Settings as SettingsCog,
  Users,
  MessageSquareWarning,
  Utensils,
  Hotel,
  Bell,
  UserPlus,
  Settings as SettingsIcon,
  HelpCircle,
  Handshake,
  Layers,
} from "lucide-react";

import { useSelector, useDispatch } from "react-redux";

import { db, database } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { ref as dbRef, onValue } from "firebase/database";
import { setActiveOrg } from "../app/features/AuthSlice";

/* ------------------------- Permissions helper ------------------------- */
const hasPermission = (perm, key) =>
  Array.isArray(perm) ? perm.includes(key) : !!perm?.[key];

/* ------------------------------- Sections ----------------------------- */
const SECTIONS = [
  // hostel
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "employee", label: "Employee", Icon: UserPlus },
  { key: "student", label: "Student", Icon: UserPlus },
  { key: "announcement", label: "Announcement", Icon: Bell },
  { key: "diningmenu", label: "Dining Menu", Icon: Menu },
  { key: "cleaningschedule", label: "Cleaning Schedule", Icon: BrushCleaning },
  { key: "tutorialschedule", label: "Tutorial Schedule", Icon: BrushCleaning },
  { key: "maintenance", label: "Maintenance", Icon: SettingsCog },
  { key: "bookingroom", label: "Book a Room", Icon: BookOpen },
  { key: "academicgroup", label: "Academic Groups", Icon: Users },
  { key: "reportincident", label: "Report Incident", Icon: MessageSquareWarning },
  { key: "feedback", label: "Feedback", Icon: SettingsIcon },
  { key: "resources", label: "Resources", Icon: Hotel },
  { key: "event", label: "Event", Icon: Calendar },
  { key: "eventbooking", label: "Event Booking", Icon: Calendar },
  { key: "deal", label: "Deals", Icon: Utensils },
  { key: "faq", label: "FAQs", Icon: HelpCircle },

  // uniclub
  { key: "uniclubdashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "uniclub", label: "Uniclub", Icon: Handshake }, // use as join-requests screen
  { key: "uniclubemp", label: "Uni Club Employee", Icon: UserPlus },
  { key: "uniclubstudent", label: "Committee", Icon: UserPlus },
  { key: "uniclubmember", label: "Member", Icon: UserPlus },
  { key: "uniclubannouncement", label: "Announcement", Icon: Bell },
  { key: "uniclubcommunity", label: "Community", Icon: Bell },
  { key: "uniclubevent", label: "Event", Icon: Calendar },
  { key: "uniclubeventbooking", label: "Event Booking", Icon: Calendar },
  { key: "uniclubsubgroup", label: "Sub Group", Icon: Layers },
  { key: "subgroupannouncement", label: "Announcement", Icon: Bell },
  { key: "subgroupevent", label: "Event", Icon: Calendar },
  { key: "subgroupeventbooking", label: "Event Booking", Icon: Calendar },

  // common
  { key: "setting", label: "Setting", Icon: SettingsIcon },
  { key: "contact", label: "Contact", Icon: HelpCircle },
];

/* -------------------------------- Badge ------------------------------- */
function Badge({ value }) {
  if (!value) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-2 text-xs font-bold rounded-full bg-red-600 text-white">
      {value}
    </span>
  );
}

/* ------------------- utils (Firestore docs createdAt) ------------------- */
const safeParseInt = (x) => {
  const n = parseInt(x, 10);
  return Number.isNaN(n) ? null : n;
};

const extractCreatedMs = (docData) => {
  const ts = docData?.createdAt ?? docData?.created_on ?? docData?.created ?? null;

  if (ts?.toMillis) return ts.toMillis();
  if (typeof ts?._seconds === "number") return ts._seconds * 1000;

  if (typeof ts === "string") {
    const t = Date.parse(ts);
    if (!Number.isNaN(t)) return t;
  }

  if (typeof ts === "number") {
    return ts < 10_000_000_000 ? ts * 1000 : ts;
  }

  if (typeof docData?.createdDate === "string") {
    const t = Date.parse(docData.createdDate);
    if (!Number.isNaN(t)) return t;
  }

  return 0;
};

/* ------------------- Firestore menu lastOpened hook ------------------- */
function useMenuLastOpenedMs({ uid, menuKey, enabled = true }) {
  const storageKey = uid && menuKey ? `amState:${uid}:${menuKey}` : null;

  const [localMs, setLocalMs] = useState(() => {
    if (!storageKey) return null;
    return safeParseInt(localStorage.getItem(storageKey));
  });

  const [fsTs, setFsTs] = useState(null);

  useEffect(() => {
    if (!enabled || !uid || !menuKey) return;
    const refDoc = doc(db, "adminMenuState", uid, "menus", menuKey);
    return onSnapshot(refDoc, (snap) => {
      const v = snap.exists() ? snap.data()?.lastOpened : null;
      setFsTs(v ?? null);
    });
  }, [enabled, uid, menuKey]);

  useEffect(() => {
    if (!enabled || !storageKey) return;
    const ms = fsTs?.toMillis?.() ?? null;
    if (ms) {
      try {
        localStorage.setItem(storageKey, String(ms));
        setLocalMs(ms);
      } catch {}
    }
  }, [enabled, storageKey, fsTs]);

  return fsTs?.toMillis?.() ?? (typeof localMs === "number" ? localMs : null);
}

/* ------------------- Firestore badge hook (Hostel collections) ------------------- */
function useFirestoreBadgeCount({
  uid,
  menuKey,
  collName,
  hostelid,
  statusIn = [],
  statusField = "status",
  statusEq = null,
  enabled = true,
}) {
  const openedAt = useMenuLastOpenedMs({ uid, menuKey, enabled });

  const [docs, setDocs] = useState([]);

  useEffect(() => {
    if (!enabled || !collName || !hostelid) return;

    const baseRef = collection(db, collName);
    const clauses = [where("hostelid", "==", String(hostelid))];

    if (statusEq !== null) clauses.push(where(statusField, "==", statusEq));
    if (statusIn?.length) clauses.push(where(statusField, "in", statusIn));

    const qRef = query(baseRef, ...clauses);
    return onSnapshot(qRef, (snap) => {
      setDocs(snap.docs.map((d) => d.data()));
    });
  }, [enabled, collName, hostelid, statusField, statusEq, JSON.stringify(statusIn)]);

  return useMemo(() => {
    if (!enabled) return 0;
    if (!openedAt) return docs.length;
    return docs.filter((d) => extractCreatedMs(d) > openedAt).length;
  }, [enabled, docs, openedAt]);
}

/* ------------------- RTDB badge: Members joined since lastOpened ------------------- */
function useRtdbMembersBadgeCount({ uid, menuKey, clubId, enabled = true }) {
  const openedAt = useMenuLastOpenedMs({ uid, menuKey, enabled });

  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!enabled || !clubId) return;
    const mRef = dbRef(database, `uniclubs/${clubId}/members`);
    return onValue(mRef, (snap) => {
      const val = snap.val() || {};
      setMembers(Object.values(val));
    });
  }, [enabled, clubId]);

  return useMemo(() => {
    if (!enabled) return 0;
    if (!openedAt) return members.length;

    return members.filter((m) => {
      const joinedAt = typeof m?.joinedAt === "number" ? m.joinedAt : 0;
      return joinedAt > openedAt;
    }).length;
  }, [enabled, members, openedAt]);
}

/* ------------------- RTDB badge: JoinRequests since lastOpened ------------------- */
function useRtdbJoinReqBadgeCount({ uid, menuKey, clubId, enabled = true }) {
  const openedAt = useMenuLastOpenedMs({ uid, menuKey, enabled });

  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!enabled || !clubId) return;
    const rRef = dbRef(database, `uniclubs/${clubId}/joinRequests`);
    return onValue(rRef, (snap) => {
      const val = snap.val() || {};
      setRequests(Object.values(val));
    });
  }, [enabled, clubId]);

  const getReqAt = (r) =>
    (typeof r?.requestedAt === "number" && r.requestedAt) ||
    (typeof r?.createdAt === "number" && r.createdAt) ||
    (typeof r?.requestedAtMs === "number" && r.requestedAtMs) ||
    (typeof r?.time === "number" && r.time) ||
    0;

  return useMemo(() => {
    if (!enabled) return 0;
    if (!openedAt) return requests.length;
    return requests.filter((r) => getReqAt(r) > openedAt).length;
  }, [enabled, requests, openedAt]);
}

/* ------------------- Write lastOpened to Firestore ------------------- */
async function markMenuOpenedFirestore(uid, menuKey) {
  if (!uid || !menuKey) return;
  const refDoc = doc(db, "adminMenuState", uid, "menus", menuKey);
  await setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
}

/* -------------------------------- Sidebar ----------------------------- */
export default function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const employee = useSelector((s) => s.auth.employee);
  const perms = employee?.permissions ?? null;

  // ✅ MUST be auth.uid for menu state
  const uid = useSelector((s) => s.auth.user?.uid);

  const hostelid = employee?.hostelid || null;
  const uniclubid = employee?.uniclubid || null;

  const activeOrg = useSelector((s) => s.auth.activeOrg);

  const hasHostel = !!hostelid;
  const hasUniclub = !!uniclubid;

  useEffect(() => {
    if (hasHostel && hasUniclub && !activeOrg) navigate("/choose");
  }, [hasHostel, hasUniclub, activeOrg, navigate]);

  const hostelBadgeEnabled = activeOrg === "hostel";
  const uniclubBadgeEnabled = activeOrg === "uniclub";

  /* -------- Hostel badges (Firestore collections) -------- */
  const maintenanceBadge = useFirestoreBadgeCount({
    uid,
    menuKey: "maintenance",
    collName: "maintenance",
    hostelid,
    statusIn: ["Pending", "New"],
    enabled: hostelBadgeEnabled,
  });

  const reportBadge = useFirestoreBadgeCount({
    uid,
    menuKey: "reportincident",
    collName: "reportIncident",
    hostelid,
    statusIn: ["Pending"],
    enabled: hostelBadgeEnabled,
  });

  const feedbackBadge = useFirestoreBadgeCount({
    uid,
    menuKey: "feedback",
    collName: "feedback",
    hostelid,
    statusIn: ["Pending"],
    enabled: hostelBadgeEnabled,
  });

  const bookingBadge = useFirestoreBadgeCount({
    uid,
    menuKey: "bookingroom",
    collName: "bookingroom",
    hostelid,
    statusIn: ["Booked"],
    enabled: hostelBadgeEnabled,
  });

  const eventBadge = useFirestoreBadgeCount({
    uid,
    menuKey: "eventbooking",
    collName: "eventbookings",
    hostelid,
    statusIn: ["Booked"],
    enabled: hostelBadgeEnabled,
  });

  const studentBadge = useFirestoreBadgeCount({
    uid,
    menuKey: "student",
    collName: "users",
    hostelid,
    statusField: "hostelApprovalStatus",
    statusEq: "pending",
    enabled: hostelBadgeEnabled,
  });

  /* -------- UniClub badges (RTDB list compared to Firestore lastOpened) -------- */
  const uniclubMemberBadge = useRtdbMembersBadgeCount({
    uid,
    menuKey: "uniclubmember",
    clubId: uniclubid,
    enabled: uniclubBadgeEnabled,
  });

  const uniclubJoinReqBadge = useRtdbJoinReqBadgeCount({
    uid,
    menuKey: "uniclub",
    clubId: uniclubid,
    enabled: uniclubBadgeEnabled,
  });

  const handleClick = async (sectionKey) => {
    setActiveSection(sectionKey);
    onSectionClick?.(sectionKey);
    navigate(`/${sectionKey}`);

    // ✅ On click, clear badge by writing lastOpened to Firestore
    const hostelClearKeys = new Set([
      "maintenance",
      "reportincident",
      "feedback",
      "bookingroom",
      "eventbooking",
      "student",
    ]);

    const uniclubClearKeys = new Set(["uniclubmember", "uniclub"]);

    if (hostelClearKeys.has(sectionKey) || uniclubClearKeys.has(sectionKey)) {
      try {
        await markMenuOpenedFirestore(uid, sectionKey);
      } catch (e) {
        console.error("markMenuOpenedFirestore failed:", sectionKey, e);
      }
    }
  };

  const visibleSections = useMemo(() => {
    const uniclubKeys = new Set([
      "uniclubdashboard",
      "uniclub",
      "uniclubemp",
      "uniclubstudent",
      "uniclubmember",
      "uniclubannouncement",
      "uniclubcommunity",
      "uniclubevent",
      "uniclubeventbooking",
      "uniclubsubgroup",
      "subgroupannouncement",
      "subgroupevent",
      "subgroupeventbooking",
    ]);

    const hostelKeys = new Set([
      "dashboard",
      "employee",
      "student",
      "announcement",
      "diningmenu",
      "cleaningschedule",
      "tutorialschedule",
      "maintenance",
      "bookingroom",
      "academicgroup",
      "reportincident",
      "feedback",
      "resources",
      "event",
      "eventbooking",
      "deal",
      "faq",
    ]);

    const byOrg = SECTIONS.filter((s) => {
      if (activeOrg === "hostel") {
        if (uniclubKeys.has(s.key)) return false;
        return hostelKeys.has(s.key) || s.key === "setting" || s.key === "contact";
      }
      if (activeOrg === "uniclub") {
        if (hostelKeys.has(s.key)) return false;
        return uniclubKeys.has(s.key) || s.key === "setting" || s.key === "contact";
      }
      return s.key === "setting" || s.key === "contact";
    });

    return byOrg.filter((s) => {
      if (!perms) return true;
      const permKey = s.key === "uniclubdashboard" ? "dashboard" : s.key;
      return hasPermission(perms, permKey);
    });
  }, [activeOrg, perms]);

  useEffect(() => {
    if (activeOrg === "uniclub") setActiveSection("uniclubdashboard");
    if (activeOrg === "hostel") setActiveSection("dashboard");
  }, [activeOrg]);

  return (
    <aside className="bg-gray-200 flex flex-col h-dvh shadow w-[220px] lg:w-[240px] xl:w-[260px]">
      {/* Header */}
      <div className="flex flex-col items-center justify-center gap-2 py-4 px-2 shrink-0">
        {isLoading ? (
          <BeatLoader size={8} color="#666" />
        ) : (
          <>
            <img
              src={dummyProfileImage}
              alt="profile"
              className="w-16 h-16 rounded-full object-cover"
            />
            <h3 className="text-base font-semibold text-center break-words">
              {employee?.name ?? "Admin"}
            </h3>
          </>
        )}
      </div>

      {/* Switch org */}
      {hasHostel && hasUniclub && (
        <div className="px-2 pb-2">
          <div className="bg-white rounded-lg p-2 shadow-sm flex gap-2">
            <button
              className={`flex-1 py-2 rounded font-semibold text-sm ${
                activeOrg === "hostel" ? "bg-black text-white" : "bg-gray-100"
              }`}
              onClick={() => {
                dispatch(setActiveOrg("hostel"));
                navigate("/dashboard");
              }}
            >
              Hostel
            </button>

            <button
              className={`flex-1 py-2 rounded font-semibold text-sm ${
                activeOrg === "uniclub" ? "bg-blue-600 text-white" : "bg-gray-100"
              }`}
              onClick={() => {
                dispatch(setActiveOrg("uniclub"));
                navigate("/uniclubdashboard");
              }}
            >
              UniClub
            </button>
          </div>
        </div>
      )}

      {/* Menu */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 custom-scroll">
        {visibleSections.map(({ key, label, Icon }) => {
          const isActive = activeSection === key;

          const base =
            "w-full flex items-center gap-2 p-2 mb-1 rounded-md text-left font-semibold";
          const cls = isActive
            ? `${base} bg-blue-200 border-b-2 border-blue-500 text-blue-800`
            : `${base} hover:bg-gray-300`;

          let badgeValue = 0;

          if (hostelBadgeEnabled) {
            if (key === "maintenance") badgeValue = maintenanceBadge;
            if (key === "reportincident") badgeValue = reportBadge;
            if (key === "feedback") badgeValue = feedbackBadge;
            if (key === "bookingroom") badgeValue = bookingBadge;
            if (key === "eventbooking") badgeValue = eventBadge;
            if (key === "student") badgeValue = studentBadge;
          }

          if (uniclubBadgeEnabled) {
            if (key === "uniclubmember") badgeValue = uniclubMemberBadge;
            if (key === "uniclub") badgeValue = uniclubJoinReqBadge;
          }

          return (
            <button key={key} onClick={() => handleClick(key)} className={cls}>
              <Icon size={20} />
              <span>{label}</span>
              <Badge value={badgeValue} />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
