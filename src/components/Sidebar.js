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
  { key: "setting", label: "Setting", Icon: SettingsIcon },
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

/* ------------------- Badge Hook (pre-warmed, lastOpen-based) -------------------
   - Pre-warm lastOpened from localStorage to show badge on first paint
   - If no lastOpened anywhere, show 0 (since "last open" basis)
   - Listeners attach only when hostelid is ready
--------------------------------------------------------------------------- */
function useBadgeCount({
  adminUid,
  menuKey,
  collName,
  hostelid,
  statusIn = [],
  preferZeroIfNoLastOpened = true,
}) {
  const storageKey = adminUid && menuKey ? `amState:${adminUid}:${menuKey}` : null;

  // Pre-warm lastOpened from localStorage (ms)
  const [lastOpenedMs, setLastOpenedMs] = useState(() => {
    if (!storageKey) return null;
    const raw = localStorage.getItem(storageKey);
    return safeParseInt(raw);
  });

  const [firestoreLastOpened, setFirestoreLastOpened] = useState(null);
  const [docs, setDocs] = useState([]);

  // Track lastOpened from Firestore (real source of truth)
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
        setLastOpenedMs(ms); // update state to reflect latest
      } catch {
        // ignore storage issues
      }
    }
  }, [storageKey, firestoreLastOpened]);

  // Attach collection listener only when hostelid is present
  useEffect(() => {
    if (!collName || !hostelid) return;
    const baseRef = collection(db, collName);

    const clauses = [where("hostelid", "==", hostelid)];
    if (statusIn?.length) clauses.push(where("status", "in", statusIn));

    const q = query(baseRef, ...clauses);
    return onSnapshot(q, (snap) => {
      setDocs(snap.docs.map((d) => d.data()));
    });
  }, [collName, hostelid, JSON.stringify(statusIn)]);

  const count = useMemo(() => {
    const toMillis = (d) => {
      if (d?.createdAt?.toMillis) return d.createdAt.toMillis();
      if (d?.createdAt?._seconds) return d.createdAt._seconds * 1000;
      if (typeof d?.createdDate === "string") {
        const t = Date.parse(d.createdDate);
        return Number.isNaN(t) ? 0 : t;
      }
      return 0;
    };

    // Decide which "last opened" to use (Firestore > cached > none)
    const openedAt =
      firestoreLastOpened?.toMillis?.() ??
      (typeof lastOpenedMs === "number" ? lastOpenedMs : null);

    if (!openedAt) {
      // No lastOpen known anywhere
      return preferZeroIfNoLastOpened ? 0 : docs.length;
    }

    return docs.filter((d) => toMillis(d) > openedAt).length;
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

  // --- Badges (last open based, pre-warmed) ---
  const maintenanceBadge = useBadgeCount({
    adminUid,
    menuKey: "maintenance",
    collName: "maintenance",
    hostelid,
    statusIn: ["Pending", "New"],
    preferZeroIfNoLastOpened: true,
  });

  const reportBadge = useBadgeCount({
    adminUid,
    menuKey: "reportincident",
    collName: "reportIncident",
    hostelid,
    statusIn: ["Pending"],
    preferZeroIfNoLastOpened: true,
  });

  const feedbackBadge = useBadgeCount({
    adminUid,
    menuKey: "feedback",
    collName: "feedbacks",
    hostelid,
    statusIn: ["Pending"],
    preferZeroIfNoLastOpened: true,
  });

  const resetMenuKey = async (menuKey) => {
    if (!adminUid) return;
    const ref = doc(db, "adminMenuState", adminUid, "menus", menuKey);
    await setDoc(ref, { lastOpened: serverTimestamp() }, { merge: true });
  };

  const handleClick = async (sectionKey) => {
    setActiveSection(sectionKey);
    onSectionClick?.(sectionKey);
    navigate(`/${sectionKey}`);

    // Mark opened
    if (sectionKey === "maintenance") resetMenuKey("maintenance");
    if (sectionKey === "reportincident") resetMenuKey("reportincident");
    if (sectionKey === "feedback") resetMenuKey("feedback");
  };

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
        {SECTIONS.filter(({ key }) => !perms || hasPermission(perms, key)).map(
          ({ key, label, Icon }) => {
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

            return (
              <button key={key} onClick={() => handleClick(key)} className={cls}>
                <Icon size={20} />
                <span>{label}</span>
                <Badge value={badgeValue} />
              </button>
            );
          }
        )}
      </nav>

      <br />
      <br />
      <br />
      <br />
    </aside>
  );
}

export default Sidebar;
