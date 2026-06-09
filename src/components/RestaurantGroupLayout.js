import React, { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import {
  Users, CalendarDays, FileText, GraduationCap, CheckSquare, BarChart3, LogOut, Settings, ShieldCheck, SlidersHorizontal, MessageCircle, CalendarRange, Thermometer,
} from "lucide-react";
import { RGProvider, useRG } from "../pages/restaurantgroup/RGContext";
import VenueManager from "../pages/restaurantgroup/VenueManager";
import { logoutAdmin } from "../app/features/AuthSlice";
import "../pages/restaurantgroup/restaurantGroup.css";

const NAV = [
  { key: "staff", path: "/rg/staff", label: "Staff Directory", Icon: Users, title: "Staff Directory" },
  { key: "shifts", path: "/rg/shifts", label: "Shift Planner", Icon: CalendarDays, title: "Shift Planner" },
  { key: "leave", path: "/rg/leave", label: "Leave Requests", Icon: FileText, title: "Leave Requests" },
  { key: "training", path: "/rg/training", label: "Training", Icon: GraduationCap, title: "Training & Development" },
  { key: "checklists", path: "/rg/checklists", label: "SOPs & Checklists", Icon: CheckSquare, title: "SOPs & Checklists" },
  { key: "temperature", path: "/rg/temperature", label: "Temperature Log", Icon: Thermometer, title: "Temperature Log" },
  { key: "performance", path: "/rg/performance", label: "Performance", Icon: BarChart3, title: "Performance" },
  { key: "messages", path: "/rg/messages", label: "Messages", Icon: MessageCircle, title: "Messages" },
  { key: "calendar", path: "/rg/calendar", label: "Calendar", Icon: CalendarRange, title: "Calendar" },
  { key: "usermgmt", path: "/rg/users", label: "User Management", Icon: ShieldCheck, title: "User Management" },
  { key: "settings", path: "/rg/settings", label: "Settings", Icon: SlidersHorizontal, title: "Settings" },
];

function Shell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const {
    group, venues, staff, leave, assignments, unreadMessages,
    selectedVenue, setSelectedVenue, selectedVenueName, can, me,
  } = useRG();

  const [venueMgrOpen, setVenueMgrOpen] = useState(false);

  const visibleNav = useMemo(() => NAV.filter((n) => can(n.key, "view")), [can]);
  const activeKey = NAV.find((n) => location.pathname.startsWith(n.path))?.key || visibleNav[0]?.key || "staff";
  const current = NAV.find((n) => n.key === activeKey) || NAV[0];
  const isOwnerOrAdmin = me?.groupRole === "owner" || me?.groupRole === "storeAdmin";

  const pendingLeave = useMemo(() => leave.filter((l) => l.status === "Pending").length, [leave]);
  const openTraining = useMemo(
    () => assignments.filter((a) => a.status !== "Complete").length,
    [assignments]
  );

  const groupName = group?.name || "Main Kitchen";
  const initials = groupName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const venueStaffCount = (vId) =>
    vId === "all" ? staff.length : staff.filter((s) => s.venueId === vId).length;

  const subtitle = `${selectedVenueName} · ${venueStaffCount(selectedVenue)} staff`;

  return (
    <div className="rg-scope app">
      {/* ── SIDEBAR ── */}
      <aside className="sidebar">
        <div className="sb-logo">
          <div className="sb-logo-icon">{initials}</div>
          <div>
            <div className="sb-logo-text">{groupName}</div>
            <div className="sb-logo-sub">Group Operations</div>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Operations</div>
          {visibleNav.map(({ key, path, label, Icon }) => {
            const badge = key === "leave" ? pendingLeave : key === "training" ? openTraining : key === "messages" ? unreadMessages : 0;
            return (
              <button
                key={key}
                className={`nav-item ${activeKey === key ? "active" : ""}`}
                onClick={() => navigate(path)}
              >
                <Icon className="nav-icon" />
                <span>{label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </button>
            );
          })}
        </div>

        <div className="nav-section">
          <div className="nav-label">Locations</div>
          <button
            className={`nav-item ${selectedVenue === "all" ? "active" : ""}`}
            onClick={() => setSelectedVenue("all")}
          >
            <span className="nav-dot" style={{ background: "#9ca3af" }} />
            <span>All venues</span>
          </button>
          {venues.map((v) => (
            <button
              key={v.id}
              className={`nav-item ${selectedVenue === v.id ? "active" : ""}`}
              onClick={() => setSelectedVenue(v.id)}
            >
              <span className="nav-dot" style={{ background: v.color }} />
              <span>{v.name}{v.type === "CK" ? " (CK)" : ""}</span>
            </button>
          ))}
        </div>

        <div className="nav-section" style={{ marginTop: "auto" }}>
          <button className="nav-item" onClick={() => dispatch(logoutAdmin())}>
            <LogOut className="nav-icon" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      {/* ── MAIN ── */}
      <div className="main">
        <div className="topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className="tb-title">{current.title}</span>
            <span className="tb-sub">{subtitle}</span>
          </div>
          <div className="tb-right">
            <select
              className="form-input"
              style={{ width: 160 }}
              value={selectedVenue}
              onChange={(e) => setSelectedVenue(e.target.value)}
            >
              <option value="all">All venues</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
            {/* {isOwnerOrAdmin && (
              <button className="btn btn-sm" title="Manage venues" onClick={() => setVenueMgrOpen(true)}>
                <Settings size={14} /> Venues
              </button>
            )} */}
          </div>
        </div>

        <div className="content">{children}</div>
      </div>

      <VenueManager open={venueMgrOpen} onClose={() => setVenueMgrOpen(false)} />
    </div>
  );
}

export default function RestaurantGroupLayout({ children }) {
  return (
    <RGProvider>
      <Shell>{children}</Shell>
    </RGProvider>
  );
}
