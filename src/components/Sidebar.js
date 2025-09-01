import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Calendar, Menu, BookOpen, BrushCleaning, Settings,
  Users, MessageSquareWarning, Handshake, Utensils, GraduationCap,
  Hotel, Bell, UserPlus, SettingsIcon,HelpCircle
} from "lucide-react";
import { useSelector } from "react-redux";

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
  { key: "deal", label: "Deals", Icon: Utensils },
  { key: "faq", label: "FAQs", Icon: HelpCircle },
  { key: "setting", label: "Setting", Icon: SettingsIcon },
];

function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const employee = useSelector(state => state.auth.employee);

  const perms = employee?.permissions ?? null;

  const handleClick = (sectionKey) => {
    setActiveSection(sectionKey);
    onSectionClick?.(sectionKey);
    navigate(`/${sectionKey}`);
  };

  return (
    <aside className="bg-gray-200 flex flex-col h-dvh shadow
    w-[220px] lg:w-[240px] xl:w-[260px] [1440px]:w-[260px] [1680px]:w-[900px] [1920px]:w-[300px]">

      {/* ==== HEADER (fixed height, avoid overflow) ==== */}
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

      {/* ==== MENU (scrollable section) ==== */}
      <nav className="flex-1 min-h-0 overflow-y-auto px-2 custom-scroll">
        {SECTIONS
          .filter(({ key }) => {
            // if (employee?.role === 'admin') return true;
            return !perms || hasPermission(perms, key);
          })
          .map(({ key, label, Icon }) => (

            <button
              key={key}
              onClick={() => handleClick(key)}
              className={`w-full flex items-center gap-2 p-2 mb-1 rounded-md text-left font-semibold
                        ${activeSection === key
                  ? "bg-blue-200 border-b-2 border-blue-500 text-blue-800"
                  : "hover:bg-gray-300"}`}
            >
              <Icon size={20} /> {label}
            </button>
          ))}
      </nav>
      <br />
      <br />
      <br />
      <br />
    </aside>

  );
}

export default Sidebar;
