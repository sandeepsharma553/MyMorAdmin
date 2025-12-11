// Sidebar.jsx
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
import { useSelector } from "react-redux";

import { db } from "../firebase";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

/* ------------------------- Permissions helper ------------------------- */
const hasPermission = (perm, key) =>
  Array.isArray(perm) ? perm.includes(key) : !!perm?.[key];

/* ------------------------------- Sections ----------------------------- */
const SECTIONS = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "uniclubdashboard", label: "Dashboard", Icon: LayoutDashboard },
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
  { key: "uniclub", label: "Uniclub", Icon: Handshake },
  { key: "uniclubstudent", label: "Committee", Icon: UserPlus },
  { key: "uniclubmember", label: "Member", Icon: UserPlus },
  { key: "uniclubannouncement", label: "Announcement", Icon: Bell },
  { key: "uniclubevent", label: "Event", Icon: Calendar },
  { key: "uniclubeventbooking", label: "Event Booking", Icon: Calendar },
  { key: "subgroupannouncement", label: "Announcement", Icon: Bell },
  { key: "subgroupevent", label: "Event", Icon: Calendar },
  { key: "subgroupeventbooking", label: "Event Booking", Icon: Calendar },
  { key: "uniclubsubgroup", label: "Sub Group", Icon: Layers },
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

/* ------------------- utils ------------------- */
const safeParseInt = (x) => {
  const n = parseInt(x, 10);
  return Number.isNaN(n) ? null : n;
};

/**
 * Robustly extract ms from various "created" shapes:
 * - Firestore Timestamp: { toMillis() } or { _seconds }
 * - ISO string
 * - epoch number in ms or s
 * - legacy createdDate string
 */
const extractCreatedMs = (docData) => {
  const ts = docData?.createdAt ?? docData?.created_on ?? docData?.created ?? null;

  // Firestore Timestamp
  if (ts?.toMillis) return ts.toMillis();
  if (typeof ts?._seconds === "number") return ts._seconds * 1000;

  // ISO string
  if (typeof ts === "string") {
    const t = Date.parse(ts);
    if (!Number.isNaN(t)) return t;
  }

  // numeric epoch (ms or s)
  if (typeof ts === "number") {
    return ts < 10_000_000_000 ? ts * 1000 : ts; // seconds → ms
  }

  // Legacy field name support
  if (typeof docData?.createdDate === "string") {
    const t = Date.parse(docData.createdDate);
    if (!Number.isNaN(t)) return t;
  }

  return 0;
};

function useBadgeCount({
  adminUid,
  menuKey,
  collName,
  hostelid,
  statusIn = [],
  // On first-ever open (no lastOpened stored), we want to show existing unseen docs.
  preferZeroIfNoLastOpened = false,
}) {
  const storageKey = adminUid && menuKey ? `amState:${adminUid}:${menuKey}` : null;
  const [lastOpenedMs, setLastOpenedMs] = useState(() => {
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    return safeParseInt(raw);
  });

  const [firestoreLastOpened, setFirestoreLastOpened] = useState(null);
  const [docs, setDocs] = useState([]);

  // Track lastOpened from Firestore (source of truth)
  useEffect(() => {
    if (!adminUid || !menuKey) return;
    const ref = doc(db, "adminMenuState", adminUid, "menus", menuKey);
    return onSnapshot(ref, (snap) => {
      const val = snap.exists() ? snap.data().lastOpened : null;
      setFirestoreLastOpened(val ?? null);
    });
  }, [adminUid, menuKey]);

  // Sync Firestore lastOpened -> localStorage cache (ms)
  useEffect(() => {
    if (!storageKey) return;
    const ms = firestoreLastOpened?.toMillis?.() ?? null;
    if (ms) {
      try {
        localStorage.setItem(storageKey, String(ms));
        setLastOpenedMs(ms);
      } catch {
        // ignore storage issues
      }
    }
  }, [storageKey, firestoreLastOpened]);

  // Attach collection listener only when hostelid is present
  useEffect(() => {
    if (!collName || !hostelid) return;
    const baseRef = collection(db, collName);

    const clauses = [where("hostelid", "==", String(hostelid))];
    if (statusIn?.length) clauses.push(where("status", "in", statusIn));

    const q = query(baseRef, ...clauses);
    return onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => d.data()));
    });
  }, [collName, hostelid, JSON.stringify(statusIn)]);

  const count = useMemo(() => {
    // Decide which "last opened" to use (Firestore > cached > none)
    const openedAt =
      firestoreLastOpened?.toMillis?.() ??
      (typeof lastOpenedMs === "number" ? lastOpenedMs : null);

    if (!openedAt) {
      // No lastOpen known anywhere
      return preferZeroIfNoLastOpened ? 0 : docs.length;
    }

    return docs.filter((d) => extractCreatedMs(d) > openedAt).length;
  }, [docs, firestoreLastOpened, lastOpenedMs, preferZeroIfNoLastOpened]);

  return count;
}

/* -------------------------------- Sidebar ----------------------------- */
function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const employee = useSelector((state) => state.auth.employee);

  const perms = employee?.permissions ?? null;
  const adminUid = employee?.uid || employee?.id || null;
  const hostelid = employee?.hostelid || null;

  const maintenanceBadge = useBadgeCount({
    adminUid,
    menuKey: "maintenance",
    collName: "maintenance",
    hostelid,
    statusIn: ["Pending", "New"],
    // show counts even on first-ever open
    preferZeroIfNoLastOpened: false,
  });

  const reportBadge = useBadgeCount({
    adminUid,
    menuKey: "reportincident",
    collName: "reportIncident",
    hostelid,
    statusIn: ["Pending"],
    preferZeroIfNoLastOpened: false,
  });

  const feedbackBadge = useBadgeCount({
    adminUid,
    menuKey: "feedback",
    collName: "feedback",
    hostelid,
    statusIn: ["Pending"],
    preferZeroIfNoLastOpened: false,
  });

  const bookingBadge = useBadgeCount({
    adminUid,
    menuKey: "bookingroom",
    collName: "bookingroom",
    hostelid,
    statusIn: ["Booked"],
    preferZeroIfNoLastOpened: false,
  });

  const eventBadge = useBadgeCount({
    adminUid,
    menuKey: "eventbooking",
    collName: "eventbookings",
    hostelid,
    statusIn: ["Booked"],
    preferZeroIfNoLastOpened: false,
  });

  const resetMenuKey = async (menuKey) => {
    if (!adminUid) return;
    try {
      const ref = doc(db, "adminMenuState", adminUid, "menus", menuKey);
      await setDoc(ref, { lastOpened: serverTimestamp() }, { merge: true });
      // local cache will be updated by the onSnapshot -> sync effect
    } catch (e) {
      // optional: console.error("Failed to set lastOpened", e);
    }
  };

  const handleClick = async (sectionKey) => {
    setActiveSection(sectionKey);
    onSectionClick?.(sectionKey);
    navigate(`/${sectionKey}`);

    // Mark opened for the sections we badge
    if (
      sectionKey === "maintenance" ||
      sectionKey === "reportincident" ||
      sectionKey === "feedback" ||
      sectionKey === "bookingroom" ||
      sectionKey === "eventbooking"
    ) {
      resetMenuKey(sectionKey);
    }
  };

  /* ---------- Dashboard vs Uniclub Dashboard logic ---------- */
  const showUniDashboard =
    !!employee?.uniclubid && hasPermission(perms, "dashboard");

  const showHostelDashboard = !!employee?.hostelid && !showUniDashboard;

  const visibleSections = useMemo(() => {
    return SECTIONS.filter((s) => {
      // Normal dashboard visibility
      if (s.key === "dashboard" && !showHostelDashboard) return false;

      // Uniclub dashboard visibility
      if (s.key === "uniclubdashboard" && !showUniDashboard) return false;

      // ---- Permissions check ----
      if (!perms) return true;

      // For uniclubdashboard, use "dashboard" permission
      const permKey =
        s.key === "uniclubdashboard" ? "dashboard" : s.key;

      return hasPermission(perms, permKey);
    });
  }, [showHostelDashboard, showUniDashboard, perms]);

  useEffect(() => {
    if (showUniDashboard) {
      setActiveSection("uniclubdashboard");
    } else if (showHostelDashboard) {
      setActiveSection("dashboard");
    }
  }, [showUniDashboard, showHostelDashboard]);

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
          if (key === "maintenance") badgeValue = maintenanceBadge;
          if (key === "reportincident") badgeValue = reportBadge;
          if (key === "feedback") badgeValue = feedbackBadge;
          if (key === "bookingroom") badgeValue = bookingBadge;
          if (key === "eventbooking") badgeValue = eventBadge;

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
