import React, { useState } from "react";
import { BeatLoader } from "react-spinners";
import dummyProfileImage from "../assets/logo1.png";
import { useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Calendar, Menu, BookOpen, BrushCleaning, Settings,
  Users, MessageSquareWarning, Handshake, Utensils, GraduationCap,
  Hotel, Bell, UserPlus
} from "lucide-react";
import { useSelector } from "react-redux";

const hasPermission = (perm, key) =>
  Array.isArray(perm) ? perm.includes(key) : !!perm?.[key];

const SECTIONS = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "employee", label: "Employee", Icon: UserPlus },
  { key: "diningmenupage", label: "Dining Menu", Icon: Menu },
  { key: "cleaningpage", label: "Cleaning Schedule", Icon: BrushCleaning },
  { key: "maintenancepage", label: "Maintenance", Icon: Settings },
  { key: "bookingpage", label: "Book a Room", Icon: BookOpen },
  { key: "academicpage", label: "Academic Groups", Icon: Users },
  { key: "reportpage", label: "Report Incident", Icon: MessageSquareWarning },
  { key: "announcement", label: "Announcement", Icon: Bell },
  { key: "eventpage", label: "Event", Icon: Calendar },
  { key: "dealpage", label: "Deals", Icon: Utensils },
  { key: "university", label: "University", Icon: GraduationCap },
  { key: "hostel", label: "Hostel", Icon: Hotel },
];

function Sidebar({ onSectionClick, isLoading }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const navigate = useNavigate();
  const employee = useSelector(state => state.auth.employee);
  const perms = employee?.permissions ?? null;

  const handleClick = (sectionKey) => {
    setActiveSection(sectionKey);
    onSectionClick?.(sectionKey);
    navigate(`/home/${sectionKey}`);
  };

  return (
    <div
      className="bg-gray-200 p-2 w-60 min-h-screen shadow flex flex-col items-center  md:relative  "
      style={{ height: "100vh" }}
    >
      <div className="pb-2 fixed-top">
        {isLoading ? (
          <BeatLoader size={8} color={"#ffffff"} loading={true} />
        ) : (
          <>
            <img
              src={dummyProfileImage}
              alt="User Profile"
              className="w-20 h-20 rounded-full"
            />
            <h3 className="text-xl font-semibold">{employee?.name == null ? 'Admin': employee?.name}</h3>
          </>
        )}
      </div>
      <div className="w-full scroll-container custom-scroll overflow-hidden scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100">
        {SECTIONS
          .filter(({ key }) => !perms || hasPermission(perms, key))
          .map(({ key, label, Icon }) => (
            <div
              key={key}
              className={`cursor-pointer rounded-md ${activeSection === key
                ? "bg-blue-200 border-b-2 border-blue-500"
                : "hover:bg-gray-300"
                }`}
              onClick={() => handleClick(key)}
            >
              <h4 className="flex items-center gap-2 p-2 text-lg font-semibold">
                <Icon size={20} /> {label}
              </h4>
            </div>
          ))}
      </div>
    </div>
  );
}

export default Sidebar;
