import React, { useEffect, useMemo, useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate, useLocation } from "react-router-dom";
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
  CheckSquare,
  BedDouble,
  MessageSquare,
  HeartPulse,
  Package,
  ClipboardList,
  Compass,
  GraduationCap,
  UserCheck,
  FileCheck,
  Heart,
  Archive,
} from "lucide-react";

import { useSelector, useDispatch } from "react-redux";
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
import { setActiveOrg } from "../app/features/AuthSlice";

const hasPermission = (perm, key) =>
  Array.isArray(perm) ? perm.includes(key) : !!perm?.[key];

const isValidId = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s !== "" && s !== "null" && s !== "undefined" && s !== "0";
};

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
  { key: "checklist", label: "Checklists", Icon: CheckSquare },
  { key: "roominfo", label: "Room Info", Icon: BedDouble },
  { key: "parcels", label: "Parcels", Icon: Package },
  { key: "wellnessprompts", label: "Wellness Prompts", Icon: HeartPulse },
  { key: "messages", label: "Messages", Icon: MessageSquare },
  { key: "firstweekjourney", label: "First Week Journey", Icon: Compass },
  { key: "orientation", label: "Orientation", Icon: GraduationCap },
  { key: "guestlog", label: "Guest Log", Icon: UserCheck },
  { key: "inspection", label: "Inspection", Icon: FileCheck },
  { key: "wellbeing", label: "Wellbeing", Icon: Heart },
  { key: "lostandfound", label: "Lost & Found", Icon: Archive },

  { key: "universitydashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "universityemployee", label: "Employee", Icon: UserPlus },
  { key: "universitystudent", label: "Student", Icon: UserPlus },
  { key: "universityannouncement", label: "Announcement", Icon: Bell },
  { key: "universitydiningmenu", label: "Dining Menu", Icon: Menu },
  { key: "universitycleaningschedule", label: "Cleaning Schedule", Icon: BrushCleaning },
  { key: "universitytutorialschedule", label: "Tutorial Schedule", Icon: BrushCleaning },
  { key: "universityassessments", label: "Assessments", Icon: ClipboardList },
  { key: "universitymaintenance", label: "Maintenance", Icon: SettingsCog },
  { key: "universityroombooking", label: "Book a Room", Icon: BookOpen },
  { key: "universityacademicgroup", label: "Academic Groups", Icon: Users },
  { key: "universityreportincident", label: "Report Incident", Icon: MessageSquareWarning },
  { key: "universityfeedback", label: "Feedback", Icon: SettingsIcon },
  { key: "universityresources", label: "Resources", Icon: Hotel },
  { key: "universityevent", label: "Event", Icon: Calendar },
  { key: "universityeventbooking", label: "Event Booking", Icon: Calendar },
  { key: "universitydeal", label: "Deals", Icon: Utensils },
  { key: "universityfaq", label: "FAQs", Icon: HelpCircle },
  { key: "universitychecklist", label: "Checklists", Icon: CheckSquare },
  { key: "universityroominfo", label: "Room Info", Icon: BedDouble },
  { key: "universityparcels", label: "Parcels", Icon: Package },
  { key: "universitywellnessprompts", label: "Wellness Prompts", Icon: HeartPulse },
  { key: "universitymessages", label: "Messages", Icon: MessageSquare },
  { key: "universityfirstweekjourney", label: "First Week Journey", Icon: Compass },
  { key: "universityorientation", label: "Orientation", Icon: GraduationCap },
  { key: "universityguestlog", label: "Guest Log", Icon: UserCheck },
  { key: "universityinspection", label: "Inspection", Icon: FileCheck },
  { key: "universitywellbeing", label: "Wellbeing", Icon: Heart },
  { key: "universitylostandfound", label: "Lost & Found", Icon: Archive },
  { key: "universitysetting", label: "Setting", Icon: SettingsIcon },
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

  { key: "setting", label: "Setting", Icon: SettingsIcon },
  { key: "contact", label: "Contact", Icon: HelpCircle },
];

function Badge({ value }) {
  if (!value) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-2 text-xs font-bold rounded-full bg-red-600 text-white">
      {value}
    </span>
  );
}

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
      localStorage.setItem(storageKey, String(ms));
      setLocalMs(ms);
    }
  }, [enabled, storageKey, fsTs]);

  return fsTs?.toMillis?.() ?? (typeof localMs === "number" ? localMs : null);
}

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

function useRtdbMembersBadgeCount({ uid, menuKey, clubId, enabled = true }) {
  const openedAt = useMenuLastOpenedMs({ uid, menuKey, enabled });
  const [members, setMembers] = useState([]);

  useEffect(() => {
    if (!enabled || !clubId) return;
    const unsub = onSnapshot(collection(db, 'uniclubs', clubId, 'members'), (snap) => {
      setMembers(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, [enabled, clubId]);

  return useMemo(() => {
    if (!enabled) return 0;
    if (!openedAt) return members.length;
    return members.filter((m) =>
      Number((m?.joinedAt?.toMillis?.() ?? m?.joinedAt ?? 0)) > openedAt
    ).length;
  }, [enabled, members, openedAt]);
}

function useRtdbJoinReqBadgeCount({ uid, menuKey, clubId, enabled = true }) {
  const openedAt = useMenuLastOpenedMs({ uid, menuKey, enabled });
  const [requests, setRequests] = useState([]);

  useEffect(() => {
    if (!enabled || !clubId) return;
    const unsub = onSnapshot(collection(db, 'uniclubs', clubId, 'joinRequests'), (snap) => {
      setRequests(snap.docs.map((d) => d.data()));
    });
    return () => unsub();
  }, [enabled, clubId]);

  const getReqAt = (r) =>
    Number(
      r?.requestedAt?.toMillis?.() ??
      r?.requestedAt ??
      r?.createdAt?.toMillis?.() ??
      r?.createdAt ??
      r?.requestedAtMs ??
      r?.time ??
      0
    );
  return useMemo(() => {
    if (!enabled) return 0;
    if (!openedAt) return requests.length;
    return requests.filter((r) => getReqAt(r) > openedAt).length;
  }, [enabled, requests, openedAt]);
}

async function markMenuOpenedFirestore(uid, menuKey) {
  if (!uid || !menuKey) return;
  const refDoc = doc(db, "adminMenuState", uid, "menus", menuKey);
  await setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
}

export default function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();

  const employee = useSelector((s) => s.auth.employee);
  const perms = employee?.permissions ?? null;
  const uid = useSelector((s) => s.auth.user?.uid);
  const activeOrg = useSelector((s) => s.auth.activeOrg);

  const hostelid = employee?.hostelid || employee?.hostelId || null;
  const uniclubid = employee?.uniclubid || employee?.uniclubId || null;
  const universityid = employee?.universityid || employee?.universityId || null;

  const hasHostel = isValidId(hostelid);
  const hasUniversity = isValidId(universityid);
  const hasUniclub = isValidId(uniclubid);

  const availableOrgs = useMemo(() => {
    const arr = [];
    if (hasHostel) arr.push("hostel");
    if (hasUniversity) arr.push("university");
    if (hasUniclub) arr.push("uniclub");
    return arr;
  }, [hasHostel, hasUniversity, hasUniclub]);

  const showOrgSwitcher = availableOrgs.length > 1;

  useEffect(() => {
    if (activeOrg && availableOrgs.includes(activeOrg)) return;

    if (hasUniversity) {
      dispatch(setActiveOrg("university"));
      navigate("/universitydashboard", { replace: true });
      return;
    }

    if (hasHostel) {
      dispatch(setActiveOrg("hostel"));
      navigate("/dashboard", { replace: true });
      return;
    }

    if (hasUniclub) {
      dispatch(setActiveOrg("uniclub"));
      navigate("/uniclubdashboard", { replace: true });
    }
  }, [activeOrg, availableOrgs, hasHostel, hasUniversity, hasUniclub, dispatch, navigate]);

  useEffect(() => {
    const pathKey = location.pathname.replace(/^\/+/, "").split("/")[0];
    if (pathKey) setActiveSection(pathKey);
  }, [location.pathname]);

  const hostelBadgeEnabled = activeOrg === "hostel";
  const uniclubBadgeEnabled = activeOrg === "uniclub";
  const universityBadgeEnabled = activeOrg === "university";

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
    const universityKeys = new Set([
      "universitydashboard",
      "universityemployee",
      "universitystudent",
      "universityannouncement",
      "universitydiningmenu",
      "universitycleaningschedule",
      "universitytutorialschedule",
      "universityassessments",
      "universitymaintenance",
      "universityroombooking",
      "universityacademicgroup",
      "universityreportincident",
      "universityfeedback",
      "universityresources",
      "universityevent",
      "universityeventbooking",
      "universitydeal",
      "universityfaq",
      "universitychecklist",
      "universityroominfo",
      "universityparcels",
      "universitywellnessprompts",
      "universitymessages",
      "universitysetting",
      "universityfirstweekjourney",
      "universityorientation",
      "universityguestlog",
      "universityinspection",
      "universitywellbeing",
      "universitylostandfound",
      "contact",
    ]);

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
      "contact",
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
      "checklist",
      "roominfo",
      "parcels",
      "wellnessprompts",
      "messages",
      "firstweekjourney",
      "orientation",
      "guestlog",
      "inspection",
      "wellbeing",
      "lostandfound",
      "setting",
      "contact",
    ]);

    const byOrg = SECTIONS.filter((s) => {
      if (activeOrg === "hostel") return hostelKeys.has(s.key);
      if (activeOrg === "university") return universityKeys.has(s.key);
      if (activeOrg === "uniclub") return uniclubKeys.has(s.key);
      return s.key === "contact";
    });

    return byOrg.filter((s) => {
      if (!perms) return true;
      if (s.key === "contact") return true;
      return hasPermission(perms, s.key);
    });
  }, [activeOrg, perms]);

  return (
    <aside className="bg-gray-200 flex flex-col h-full min-h-0 shadow w-[220px] lg:w-[240px] xl:w-[260px] overflow-x-hidden">
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

      {showOrgSwitcher && (
        <div className="px-2 pb-2">
          <div className="bg-white rounded-lg p-2 shadow-sm flex flex-wrap gap-2">
            {hasHostel && (
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
            )}

            {hasUniversity && (
              <button
                className={`flex-1 py-2 rounded font-semibold text-sm ${
                  activeOrg === "university"
                    ? "bg-green-800 text-white"
                    : "bg-gray-100"
                }`}
                onClick={() => {
                  dispatch(setActiveOrg("university"));
                  navigate("/universitydashboard");
                }}
              >
                University
              </button>
            )}

            {hasUniclub && (
              <button
                className={`flex-1 py-2 rounded font-semibold text-sm ${
                  activeOrg === "uniclub"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100"
                }`}
                onClick={() => {
                  dispatch(setActiveOrg("uniclub"));
                  navigate("/uniclubdashboard");
                }}
              >
                UniClub
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 pb-6 custom-scroll">
        {visibleSections.map(({ key, label, Icon }) => {
          const isActive = activeSection === key;

          const base =
            "w-full flex items-center gap-2 p-2 mb-1 rounded-md text-left font-semibold overflow-hidden";

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

          if (universityBadgeEnabled) {
            badgeValue = 0;
          }

          return (
            <button key={key} onClick={() => handleClick(key)} className={cls}>
              <Icon size={20} />
              <span className="truncate">{label}</span>
              <Badge value={badgeValue} />
            </button>
          );
        })}
      </nav>
    </aside>
  );
}