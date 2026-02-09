// Sidebar.jsx — FULL CODE (Hostel Firestore badges + UniClub member RTDB badge)

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

import {
  ref as dbRef,
  onValue,
  set as rtdbSet,
  serverTimestamp as rtdbServerTimestamp,
} from "firebase/database";

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
  { key: "uniclub", label: "Uniclub", Icon: Handshake },
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

/* ------------------- Firestore badge hook (Hostel) ------------------- */
function useBadgeCount({
  adminUid,
  menuKey,
  collName,
  hostelid,
  statusIn = [],
  statusField = "status",
  statusEq = null,               // ✅ add
  preferZeroIfNoLastOpened = false,
  enabled = true,
}) {
  const storageKey = adminUid && menuKey ? `amState:${adminUid}:${menuKey}` : null;

  const [lastOpenedMs, setLastOpenedMs] = useState(() => {
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    return safeParseInt(raw);
  });

  const [firestoreLastOpened, setFirestoreLastOpened] = useState(null);
  const [docs, setDocs] = useState([]);

  // lastOpened from Firestore
  useEffect(() => {
    if (!enabled) return;
    if (!adminUid || !menuKey) return;
    const refDoc = doc(db, "adminMenuState", adminUid, "menus", menuKey);
    return onSnapshot(refDoc, (snap) => {
      const val = snap.exists() ? snap.data().lastOpened : null;
      setFirestoreLastOpened(val ?? null);
    });
  }, [enabled, adminUid, menuKey]);

  // sync Firestore -> localStorage
  useEffect(() => {
    if (!enabled) return;
    if (!storageKey) return;
    const ms = firestoreLastOpened?.toMillis?.() ?? null;
    if (ms) {
      try {
        localStorage.setItem(storageKey, String(ms));
        setLastOpenedMs(ms);
      } catch { }
    }
  }, [enabled, storageKey, firestoreLastOpened]);

  // collection listener
  useEffect(() => {
    if (!enabled) return;
    if (!collName || !hostelid) return;

    const baseRef = collection(db, collName);
    const clauses = [where("hostelid", "==", String(hostelid))];
    if (statusEq !== null) clauses.push(where(statusField, "==", statusEq));
    if (statusIn?.length) clauses.push(where(statusField, "in", statusIn));

    const q = query(baseRef, ...clauses);
    return onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => d.data()));
    });
  }, [enabled, collName, hostelid, JSON.stringify(statusIn)]);

  const count = useMemo(() => {
    if (!enabled) return 0;

    const openedAt =
      firestoreLastOpened?.toMillis?.() ??
      (typeof lastOpenedMs === "number" ? lastOpenedMs : null);

    if (!openedAt) {
      return preferZeroIfNoLastOpened ? 0 : docs.length;
    }

    return docs.filter((d) => extractCreatedMs(d) > openedAt).length;
  }, [enabled, docs, firestoreLastOpened, lastOpenedMs, preferZeroIfNoLastOpened]);

  return count;
}

/* ------------------- RTDB badge hook (UniClub Members) ------------------- */
function useRtdbMembersBadgeCount({ adminUid, menuKey, clubId, enabled = true }) {
  const storageKey = adminUid && menuKey ? `amState:${adminUid}:${menuKey}` : null;

  const [lastOpenedLocal, setLastOpenedLocal] = useState(() => {
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? null : n;
  });

  const [lastOpenedRtdb, setLastOpenedRtdb] = useState(null);
  const [members, setMembers] = useState([]);

  // ✅ admin lastOpened from RTDB
  useEffect(() => {
    if (!enabled) return;
    if (!adminUid || !menuKey) return;

    const sRef = dbRef(database, `adminMenuState/${adminUid}/menus/${menuKey}`);
    return onValue(sRef, (snap) => {
      const v = snap.val();
      const t =
        typeof v?.lastOpenedAt === "number"
          ? v.lastOpenedAt
          : typeof v?.lastOpenedServerAt === "number"
            ? v.lastOpenedServerAt
            : null;

      setLastOpenedRtdb(t);

    });
  }, [enabled, adminUid, menuKey]);

  // ✅ sync RTDB -> localStorage
  useEffect(() => {
    if (!enabled) return;
    if (!storageKey) return;
    if (typeof lastOpenedRtdb === "number") {
      try {
        localStorage.setItem(storageKey, String(lastOpenedRtdb));
        setLastOpenedLocal(lastOpenedRtdb);
      } catch { }
    }
  }, [enabled, storageKey, lastOpenedRtdb]);

  // ✅ listen members list from RTDB
  useEffect(() => {
    if (!enabled) return;
    if (!clubId) return;

    const mRef = dbRef(database, `uniclubs/${clubId}/members`);
    return onValue(mRef, (snap) => {
      const val = snap.val() || {};
      const arr = Object.values(val); // member objects
      setMembers(arr);
    });
  }, [enabled, clubId]);

  const count = useMemo(() => {
    if (!enabled) return 0;

    const openedAt =
      typeof lastOpenedRtdb === "number"
        ? lastOpenedRtdb
        : typeof lastOpenedLocal === "number"
          ? lastOpenedLocal
          : null;

    if (!openedAt) return members.length; // first time -> show all

    return members.filter((m) => {
      // joinedAt should be numeric once resolved
      const joinedAt = typeof m?.joinedAt === "number" ? m.joinedAt : 0;
      return joinedAt > openedAt;
    }).length;
  }, [enabled, members, lastOpenedRtdb, lastOpenedLocal]);

  return count;
}

/* -------------------------------- Sidebar ----------------------------- */
function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const employee = useSelector((state) => state.auth.employee);
  const perms = employee?.permissions ?? null;
  const adminUid = employee?.uid || employee?.id || null;

  const hostelid = employee?.hostelid || null;
  const uniclubid = employee?.uniclubid || null;

  const activeOrg = useSelector((s) => s.auth.activeOrg);

  const hasHostel = !!hostelid;
  const hasUniclub = !!uniclubid;

  // ✅ if both exist but no selection => force chooser
  useEffect(() => {
    if (hasHostel && hasUniclub && !activeOrg) {
      navigate("/choose");
    }
  }, [hasHostel, hasUniclub, activeOrg, navigate]);

  // badges enabled flags
  const hostelBadgeEnabled = activeOrg === "hostel";
  const uniclubBadgeEnabled = activeOrg === "uniclub";

  /* -------- Hostel badges (Firestore collections) -------- */
  const maintenanceBadge = useBadgeCount({
    adminUid,
    menuKey: "maintenance",
    collName: "maintenance",
    hostelid,
    statusIn: ["Pending", "New"],
    preferZeroIfNoLastOpened: false,
    enabled: hostelBadgeEnabled,
  });

  const reportBadge = useBadgeCount({
    adminUid,
    menuKey: "reportincident",
    collName: "reportIncident",
    hostelid,
    statusIn: ["Pending"],
    preferZeroIfNoLastOpened: false,
    enabled: hostelBadgeEnabled,
  });

  const feedbackBadge = useBadgeCount({
    adminUid,
    menuKey: "feedback",
    collName: "feedback",
    hostelid,
    statusIn: ["Pending"],
    preferZeroIfNoLastOpened: false,
    enabled: hostelBadgeEnabled,
  });

  const bookingBadge = useBadgeCount({
    adminUid,
    menuKey: "bookingroom",
    collName: "bookingroom",
    hostelid,
    statusIn: ["Booked"],
    preferZeroIfNoLastOpened: false,
    enabled: hostelBadgeEnabled,
  });

  const eventBadge = useBadgeCount({
    adminUid,
    menuKey: "eventbooking",
    collName: "eventbookings",
    hostelid,
    statusIn: ["Booked"],
    preferZeroIfNoLastOpened: false,
    enabled: hostelBadgeEnabled,
  });
  /* -------- Student badge (NEW join requests) -------- */
  const studentBadge = useBadgeCount({
    adminUid,
    menuKey: "student",
    collName: "users",
    hostelid,
    statusField: "hostelApprovalStatus",
    statusEq: "pending", // ✅ only pending join requests
    enabled: hostelBadgeEnabled,
  });

  /* -------- UniClub member badge (RTDB members joinedAt) -------- */
  const uniclubMemberBadge = useRtdbMembersBadgeCount({
    adminUid,
    menuKey: "uniclubmember",
    clubId: uniclubid,
    enabled: uniclubBadgeEnabled,
  });
  const uniclubJoinReqBadge = useRtdbJoinRequestsBadgeCount({
    adminUid,
    menuKey: "uniclub",   // sidebar menu item key
    clubId: uniclubid,    // single club
    enabled: uniclubBadgeEnabled,
  });
  const resetMenuKeyFirestore = async (menuKey) => {
    if (!adminUid) return;
    try {
      const refDoc = doc(db, "adminMenuState", adminUid, "menus", menuKey);
      await setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
    } catch { }
  };

  const resetMenuKeyRTDB = async (menuKey) => {
    if (!adminUid) return;
    try {
      const ref = dbRef(database, `adminMenuState/${adminUid}/menus/${menuKey}`);
      await rtdbSet(ref, {
        lastOpenedAt: Date.now(),                 // ✅ number
        lastOpenedServerAt: rtdbServerTimestamp() // optional audit
      });
    } catch (e) {
      console.error("resetMenuKeyRTDB failed:", e);
    }
  };

  /* ------------------- RTDB badge hook (UniClub Join Requests) ------------------- */
  function useRtdbJoinRequestsBadgeCount({ adminUid, menuKey, clubId, enabled = true }) {
    const storageKey = adminUid && menuKey ? `amState:${adminUid}:${menuKey}` : null;

    const [lastOpenedLocal, setLastOpenedLocal] = useState(() => {
      if (!storageKey) return null;
      const raw = localStorage.getItem(storageKey);
      const n = parseInt(raw, 10);
      return Number.isNaN(n) ? null : n;
    });

    const [lastOpenedRtdb, setLastOpenedRtdb] = useState(null);
    const [requests, setRequests] = useState([]);

    // admin lastOpened from RTDB
    useEffect(() => {
      if (!enabled) return;
      if (!adminUid || !menuKey) return;

      const sRef = dbRef(database, `adminMenuState/${adminUid}/menus/${menuKey}`);
      return onValue(sRef, (snap) => {
        const v = snap.val();
        const t =
          typeof v?.lastOpenedAt === "number"
            ? v.lastOpenedAt
            : typeof v?.lastOpenedServerAt === "number"
              ? v.lastOpenedServerAt
              : null;

        setLastOpenedRtdb(t);
      });
    }, [enabled, adminUid, menuKey]);

    // sync RTDB -> localStorage
    useEffect(() => {
      if (!enabled) return;
      if (!storageKey) return;
      if (typeof lastOpenedRtdb === "number") {
        try {
          localStorage.setItem(storageKey, String(lastOpenedRtdb));
          setLastOpenedLocal(lastOpenedRtdb);
        } catch { }
      }
    }, [enabled, storageKey, lastOpenedRtdb]);

    // listen joinRequests from RTDB
    useEffect(() => {
      if (!enabled) return;
      if (!clubId) return;

      const rRef = dbRef(database, `uniclubs/${clubId}/joinRequests`);
      return onValue(rRef, (snap) => {
        const val = snap.val() || {};
        const arr = Object.values(val); // request objects
        setRequests(arr);
      });
    }, [enabled, clubId]);

    const count = useMemo(() => {
      if (!enabled) return 0;

      const openedAt =
        typeof lastOpenedRtdb === "number"
          ? lastOpenedRtdb
          : typeof lastOpenedLocal === "number"
            ? lastOpenedLocal
            : null;

      // helper: request time field (robust)
      const getReqAt = (r) => {
        const t =
          (typeof r?.requestedAt === "number" && r.requestedAt) ||
          (typeof r?.createdAt === "number" && r.createdAt) ||
          (typeof r?.requestedAtMs === "number" && r.requestedAtMs) ||
          (typeof r?.time === "number" && r.time) ||
          0;
        return t;
      };

      if (!openedAt) return requests.length; // first time -> show all

      return requests.filter((r) => getReqAt(r) > openedAt).length;
    }, [enabled, requests, lastOpenedRtdb, lastOpenedLocal]);

    return count;
  }

  const handleClick = async (sectionKey) => {
    setActiveSection(sectionKey);
    onSectionClick?.(sectionKey);
    navigate(`/${sectionKey}`);

    // Hostel: mark opened for hostel badges (Firestore)
    if (
      sectionKey === "maintenance" ||
      sectionKey === "reportincident" ||
      sectionKey === "feedback" ||
      sectionKey === "bookingroom" ||
      sectionKey === "eventbooking" ||
      sectionKey === "student"
    ) {
      resetMenuKeyFirestore(sectionKey);
    }

    // UniClub: mark opened for uniclub member badge (RTDB)
    if (sectionKey === "uniclubmember") {
      resetMenuKeyRTDB("uniclubmember");
    }
    if (sectionKey === "uniclub") {
      resetMenuKeyRTDB("uniclub"); // ✅ open uniclub page => clear join-request badge
    }
  };

  // ✅ filter sections by activeOrg
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

    // org filter
    const byOrg = SECTIONS.filter((s) => {
      if (activeOrg === "hostel") {
        if (uniclubKeys.has(s.key)) return false;
        return hostelKeys.has(s.key) || s.key === "setting" || s.key === "contact";
      }

      if (activeOrg === "uniclub") {
        if (hostelKeys.has(s.key)) return false;
        return uniclubKeys.has(s.key) || s.key === "setting" || s.key === "contact";
      }

      // no selection yet (should go choose)
      return s.key === "setting" || s.key === "contact";
    });

    // permission check
    return byOrg.filter((s) => {
      if (!perms) return true;

      // Uniclub dashboard uses "dashboard" permission
      const permKey = s.key === "uniclubdashboard" ? "dashboard" : s.key;
      return hasPermission(perms, permKey);
    });
  }, [activeOrg, perms]);

  // ✅ when org changes set default active section
  useEffect(() => {
    if (activeOrg === "uniclub") setActiveSection("uniclubdashboard");
    if (activeOrg === "hostel") setActiveSection("dashboard");
  }, [activeOrg]);

  return (
    <aside
      className="bg-gray-200 flex flex-col h-dvh shadow
      w-[220px] lg:w-[240px] xl:w-[260px] [1440px]:w-[260px] [1680px]:w-[900px] [1920px]:w-[300px]"
    >
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

      {/* ✅ Switch only if both */}
      {hasHostel && hasUniclub && (
        <div className="px-2 pb-2">
          <div className="bg-white rounded-lg p-2 shadow-sm flex gap-2">
            <button
              className={`flex-1 py-2 rounded font-semibold text-sm ${activeOrg === "hostel" ? "bg-black text-white" : "bg-gray-100"
                }`}
              onClick={() => {
                dispatch(setActiveOrg("hostel"));
                navigate("/dashboard");
              }}
            >
              Hostel
            </button>

            <button
              className={`flex-1 py-2 rounded font-semibold text-sm ${activeOrg === "uniclub" ? "bg-blue-600 text-white" : "bg-gray-100"
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

          // Hostel badge mapping
          if (hostelBadgeEnabled) {
            if (key === "maintenance") badgeValue = maintenanceBadge;
            if (key === "reportincident") badgeValue = reportBadge;
            if (key === "feedback") badgeValue = feedbackBadge;
            if (key === "bookingroom") badgeValue = bookingBadge;
            if (key === "eventbooking") badgeValue = eventBadge;
            if (key === "student") badgeValue = studentBadge;
          }

          // UniClub badge mapping (members)
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

      <br />
      <br />
      <br />
      <br />
    </aside>
  );
}

export default Sidebar;
