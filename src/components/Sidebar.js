// Sidebar.jsx
import React, { useEffect, useMemo, useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Calendar, Menu, BookOpen, BrushCleaning, Settings,
  Users, MessageSquareWarning, Utensils, Hotel, Bell, UserPlus, Settings as SettingsIcon, HelpCircle
} from "lucide-react";
import { useSelector } from "react-redux";

import { db } from "../firebase";
import {
  collection, doc, onSnapshot, query, where,
  setDoc, serverTimestamp
} from "firebase/firestore";

const hasPermission = (perm, key) =>
  Array.isArray(perm) ? perm.includes(key) : !!perm?.[key];

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "employee", label: "Employee", Icon: UserPlus },
  { key: "student", label: "Student", Icon: UserPlus },
  { key: "announcement", label: "Announcement", Icon: Bell },
  { key: "diningmenu", label: "Dining Menu", Icon: Menu },
  { key: "cleaningschedule", label: "Cleaning Schedule", Icon: BrushCleaning },
  { key: "tutorialschedule", label: "Tutorial Schedule", Icon: BrushCleaning },
  { key: "maintenance", label: "Maintenance", Icon: Settings },
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

function Badge({ value }) {
  if (!value) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-5 h-5 px-2 text-xs font-bold rounded-full bg-red-600 text-white">
      {value}
    </span>
  );
}

// ------- Badge Hook (handles createdAt Timestamp OR createdDate string) -------
function useBadgeCount({ adminUid, menuKey, collName, filters = [] }) {
  const [lastOpened, setLastOpened] = useState(null);
  const [docs, setDocs] = useState([]);

  useEffect(() => {
    if (!adminUid || !menuKey) return;
    const ref = doc(db, "adminMenuState", adminUid, "menus", menuKey);
    return onSnapshot(ref, (snap) => {
      setLastOpened(snap.exists() ? snap.data().lastOpened : null);
    });
  }, [adminUid, menuKey]);

  useEffect(() => {
    if (!collName) return;
    const ref = collection(db, collName);
    const q = (filters && filters.length)
      ? query(ref, ...filters)
      : query(ref);
    return onSnapshot(q, (snap) => {
      setDocs(snap.docs.map(d => d.data()));
    });
  }, [collName, JSON.stringify(filters)]);

  const count = useMemo(() => {
    // convert createdAt/createdDate to ms
    const toMillis = (d) => {
      if (d?.createdAt?.toMillis) return d.createdAt.toMillis();
      if (d?.createdAt?._seconds) return d.createdAt._seconds * 1000;
      if (typeof d?.createdDate === "string") {
        const t = Date.parse(d.createdDate); // supports "YYYY-MM-DD"
        return Number.isNaN(t) ? 0 : t;
      }
      return 0;
    };

    return docs.filter(d => {
      if (!lastOpened) return true;
      return toMillis(d) > lastOpened.toMillis();
    }).length;
  }, [docs, lastOpened]);

  return count;
}

function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const employee = useSelector(state => state.auth.employee);

  const perms = employee?.permissions ?? null;
  const adminUid = employee?.uid || employee?.id;
  const hostelid = employee?.hostelid;

  // ✅ Use capital-case statuses to match your data ("Pending"/"New")
  const maintenanceBadge = useBadgeCount({
    adminUid,
    menuKey: "maintenance",
    collName: "maintenance",
    filters: [
      where("hostelid", "==", hostelid),
      where("status", "in", ["Pending", "New"]),
    ],
  });

  const reportBadge = useBadgeCount({
    adminUid,
    menuKey: "reportincident",
    collName: "reportIncident",
    filters: [
      where("hostelid", "==", hostelid),
      where("status", "in", ["Pending"]),
    ],
  });

  const feedbackBadge = useBadgeCount({
    adminUid,
    menuKey: "feedback",
    collName: "feedbacks",
    filters: [
      where("hostelid", "==", hostelid),
      where("status", "in", ["Pending"]),
    ],
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

    if (sectionKey === "maintenance") resetMenuKey("maintenance");
    if (sectionKey === "reportincident") resetMenuKey("reportincident");
    if (sectionKey === "feedback") resetMenuKey("feedback");
  };

  return (
    <aside className="bg-gray-200 flex flex-col h-dvh shadow
      w-[220px] lg:w-[240px] xl:w-[260px] [1440px]:w-[260px] [1680px]:w-[900px] [1920px]:w-[300px]">

      <div className="flex flex-col items-center justify-center gap-2 py-4 px-2 shrink-0">
        {isLoading ? (
          <BeatLoader size={8} color="#666" />
        ) : (
          <>
            <img src={dummyProfileImage} alt="profile" className="w-16 h-16 rounded-full object-cover" />
            <h3 className="text-base font-semibold text-center break-words">{employee?.name ?? "Admin"}</h3>
          </>
        )}
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto px-2 custom-scroll">
        {SECTIONS
          .filter(({ key }) => !perms || hasPermission(perms, key))
          .map(({ key, label, Icon }) => {
            const isActive = activeSection === key;
            const base = "w-full flex items-center gap-2 p-2 mb-1 rounded-md text-left font-semibold";
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
          })}
      </nav>
      <br /><br /><br /><br />
    </aside>
  );
}

export default Sidebar;





// import React, { useState } from "react";
// import { BeatLoader } from "react-spinners";
// import dummyProfileImage from "../assets/logo1.png";
// import { useNavigate } from "react-router-dom";
// import {
//   LayoutDashboard, Calendar, Menu, BookOpen, BrushCleaning, Settings,
//   Users, MessageSquareWarning, Handshake, Utensils, GraduationCap,
//   Hotel, Bell, UserPlus, SettingsIcon,HelpCircle
// } from "lucide-react";
// import { useSelector } from "react-redux";

// const hasPermission = (perm, key) =>
//   Array.isArray(perm) ? perm.includes(key) : !!perm?.[key];

// const SECTIONS = [
//   { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
//   { key: "employee", label: "Employee", Icon: UserPlus },
//   { key: "student", label: "Student", Icon: UserPlus },
//   { key: "announcement", label: "Announcement", Icon: Bell },
//   { key: "diningmenu", label: "Dining Menu", Icon: Menu },
//   { key: "cleaningschedule", label: "Cleaning Schedule", Icon: BrushCleaning },
//   { key: "tutorialschedule", label: "Tutorial Schedule", Icon: BrushCleaning },
//   { key: "maintenance", label: "Maintenance", Icon: Settings },
//   { key: "bookingroom", label: "Book a Room", Icon: BookOpen },
//   { key: "academicgroup", label: "Academic Groups", Icon: Users },
//   { key: "reportincident", label: "Report Incident", Icon: MessageSquareWarning },
//   { key: "feedback", label: "Feedback", Icon: SettingsIcon },
//   { key: "resources", label: "Resources", Icon: Hotel },
//   { key: "event", label: "Event", Icon: Calendar },
//   { key: "deal", label: "Deals", Icon: Utensils },
//   { key: "faq", label: "FAQs", Icon: HelpCircle },
//   { key: "setting", label: "Setting", Icon: SettingsIcon },
// ];

// function Sidebar({ onSectionClick, isLoading }) {
//   const [activeSection, setActiveSection] = useState("dashboard");
//   const navigate = useNavigate();
//   const employee = useSelector(state => state.auth.employee);

//   const perms = employee?.permissions ?? null;

//   const handleClick = (sectionKey) => {
//     setActiveSection(sectionKey);
//     onSectionClick?.(sectionKey);
//     navigate(`/${sectionKey}`);
//   };

//   return (
//     <aside className="bg-gray-200 flex flex-col h-dvh shadow
//     w-[220px] lg:w-[240px] xl:w-[260px] [1440px]:w-[260px] [1680px]:w-[900px] [1920px]:w-[300px]">

//       {/* ==== HEADER (fixed height, avoid overflow) ==== */}
//       <div className="flex flex-col items-center justify-center gap-2 py-4 px-2 shrink-0">
//         {isLoading ? (
//           <BeatLoader size={8} color="#666" />
//         ) : (
//           <>
//             <img
//               src={dummyProfileImage}
//               alt="profile"
//               className="w-16 h-16 rounded-full object-cover"
//             />
//             <h3 className="text-base font-semibold text-center break-words">
//               {employee?.name ?? "Admin"}
//             </h3>
//           </>
//         )}
//       </div>

//       {/* ==== MENU (scrollable section) ==== */}
//       <nav className="flex-1 min-h-0 overflow-y-auto px-2 custom-scroll">
//         {SECTIONS
//           .filter(({ key }) => {
//             // if (employee?.role === 'admin') return true;
//             return !perms || hasPermission(perms, key);
//           })
//           .map(({ key, label, Icon }) => (

//             <button
//               key={key}
//               onClick={() => handleClick(key)}
//               className={`w-full flex items-center gap-2 p-2 mb-1 rounded-md text-left font-semibold
//                         ${activeSection === key
//                   ? "bg-blue-200 border-b-2 border-blue-500 text-blue-800"
//                   : "hover:bg-gray-300"}`}
//             >
//               <Icon size={20} /> {label}
//             </button>
//           ))}
//       </nav>
//       <br />
//       <br />
//       <br />
//       <br />
//     </aside>

//   );
// }

// export default Sidebar;
