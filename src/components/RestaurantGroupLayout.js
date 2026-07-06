import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch } from "react-redux";
import {
  Users, CalendarDays, FileText, GraduationCap, CheckSquare, BarChart3, LogOut, Settings, ShieldCheck, SlidersHorizontal, MessageCircle, CalendarRange, Thermometer, Bell, Package, UtensilsCrossed, Truck, Scale, BookOpen, FileSignature, FileCheck, CalendarClock, ShoppingCart,
} from "lucide-react";
import { RGProvider, useRG } from "../pages/restaurantgroup/RGContext";
import { SOPS_NAV, CHECKLISTS_NAV_LABEL } from "../pages/restaurantgroup/rgConfig";
import { markNotificationRead } from "../pages/restaurantgroup/notify";
import VenueManager from "../pages/restaurantgroup/VenueManager";
import { staffInVenue } from "../utils/restaurantGroupPaths";
import { logoutAdmin } from "../app/features/AuthSlice";
import "../pages/restaurantgroup/restaurantGroup.css";

const NAV = [
  { key: "staff", path: "/rg/staff", label: "Staff Directory", Icon: Users, title: "Staff Directory" },
  { key: "shifts", path: "/rg/shifts", label: "Shift Planner", Icon: CalendarDays, title: "Shift Planner" },
  { key: "leave", path: "/rg/leave", label: "Leave Requests", Icon: FileText, title: "Leave Requests" },
  { key: "availability", path: "/rg/availability", label: "Availability", Icon: CalendarClock, title: "My Availability" },
  { key: "training", path: "/rg/training", label: "Training", Icon: GraduationCap, title: "Training & Development" },
  // SOPs = the training-module library; distinct nav item, gated by the `training`
  // permission (permKey) since it shares training's data — no new permission module.
  { key: SOPS_NAV.key, path: SOPS_NAV.path, permKey: SOPS_NAV.permKey, label: SOPS_NAV.label, Icon: BookOpen, title: SOPS_NAV.title },
  { key: "checklists", path: "/rg/checklists", label: CHECKLISTS_NAV_LABEL, Icon: CheckSquare, title: "Checklists" },
  { key: "temperature", path: "/rg/temperature", label: "Temperature Log", Icon: Thermometer, title: "Temperature Log" },
  { key: "stock", path: "/rg/stock", label: "Stock", Icon: Package, title: "Stock Management" },
  { key: "menus", path: "/rg/menus", label: "Menus", Icon: UtensilsCrossed, title: "Menus" },
  // POS Terminal (Phase 1) — gated by the `menus` permission (permKey), same
  // pattern as SOPs→training above; no new permission module.
  { key: "pos", path: "/rg/pos", permKey: "menus", label: "POS", Icon: ShoppingCart, title: "POS Terminal" },
  { key: "supplier", path: "/rg/supplier", label: "Supplier Ordering", Icon: Truck, title: "Supplier Ordering" },
  { key: "performance", path: "/rg/performance", label: "Performance", Icon: BarChart3, title: "Performance" },
  { key: "compliance", path: "/rg/compliance", label: "Awards & Compliance", Icon: Scale, title: "Awards & Compliance" },
  { key: "contracts", path: "/rg/contracts", label: "Contract Generator", Icon: FileSignature, title: "Contract Generator" },
  { key: "contractsSent", path: "/rg/contracts/sent", permKey: "contracts", label: "Sent Contracts", Icon: FileCheck, title: "Sent Contracts" },
  { key: "contractsTemplates", path: "/rg/contracts/templates", permKey: "contracts", label: "Contract Templates", Icon: BookOpen, title: "Contract Templates" },
  { key: "messages", path: "/rg/messages", label: "Messages", Icon: MessageCircle, title: "Messages" },
  { key: "calendar", path: "/rg/calendar", label: "Calendar", Icon: CalendarRange, title: "Calendar" },
  { key: "usermgmt", path: "/rg/users", label: "User Management", Icon: ShieldCheck, title: "User Management" },
  { key: "settings", path: "/rg/settings", label: "Settings", Icon: SlidersHorizontal, title: "Settings" },
];

// Presentational sidebar grouping (keys only — items, routes, permissions unchanged).
// Anything NOT listed here falls into the Operations group by default.
const STAFF_NAV_KEYS = ["staff", "shifts", "leave", "availability", "training", "sops", "checklists", "compliance"];
// Documents group (Sent Contracts will join here later). Kept out of Operations.
const DOCS_NAV_KEYS = ["contracts", "contractsSent", "contractsTemplates"];

// ── Topbar notification bell: unread badge + feed dropdown + browser popups ──
function NotificationsBell() {
  const { groupId, myNotifications, unreadNotifications, myStaff, me } = useRG();
  const [open, setOpen] = useState(false);
  const myId = myStaff?.id || me?.uid || me?.id || null;
  const seenRef = useRef(null); // ids already seen this session (so we only pop NEW arrivals)

  useEffect(() => {
    if (!myId) return;
    // seed on the FIRST NON-EMPTY snapshot so the initial backlog never replays as popups
    if (seenRef.current === null) {
      if (myNotifications.length === 0) return;
      seenRef.current = new Set(myNotifications.map((n) => n.id));
      return;
    }
    myNotifications.forEach((n) => {
      if (seenRef.current.has(n.id)) return;
      seenRef.current.add(n.id);
      // belt-and-braces: only pop notifications created in the last 10 minutes
      const ageOk = n.at?.seconds ? (Date.now() / 1000 - n.at.seconds) < 600 : true;
      if (ageOk && typeof Notification !== "undefined" && Notification.permission === "granted" && !(n.readBy || []).includes(myId)) {
        try { new Notification(n.title || "MyMor", { body: n.body || "" }); } catch { /* blocked */ }
      }
    });
  }, [myNotifications, myId]);

  const toggle = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
    setOpen((o) => !o);
  };
  const markAll = () => myNotifications.filter((n) => !(n.readBy || []).includes(myId)).slice(0, 60).forEach((n) => markNotificationRead(groupId, n.id, myId));
  const ago = (at) => {
    const s = at?.seconds ? at.seconds * 1000 : null;
    if (!s) return "";
    const m = Math.round((Date.now() - s) / 60000);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.round(m / 60)}h`;
    return `${Math.round(m / 1440)}d`;
  };
  const TYPE_ICON = { shift: "🗓", training: "🎓", checklist: "✅", leave: "🌴", temperature: "🌡", info: "🔔" };

  return (
    <div style={{ position: "relative" }}>
      <button className="btn btn-sm" onClick={toggle} title="Notifications" style={{ position: "relative" }}>
        <Bell size={14} />
        {unreadNotifications > 0 && (
          <span style={{ position: "absolute", top: -6, right: -6, background: "var(--red)", color: "#fff", borderRadius: 999, fontSize: 9, fontWeight: 700, minWidth: 15, height: 15, lineHeight: "15px", textAlign: "center", padding: "0 3px" }}>
            {unreadNotifications > 99 ? "99+" : unreadNotifications}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: 340, maxHeight: 420, overflowY: "auto", background: "#fff", border: "0.5px solid var(--border)", borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.12)", zIndex: 1300 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "0.5px solid var(--border)" }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            <div style={{ display: "flex", gap: 6 }}>
              {unreadNotifications > 0 && <button className="btn btn-sm" onClick={markAll}>Mark all read</button>}
              <button className="btn btn-sm" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>
          {myNotifications.length === 0 && <div style={{ padding: 16, fontSize: 12, color: "var(--gray)" }}>Nothing yet — shift, training, checklist and leave updates will appear here.</div>}
          {myNotifications.map((n) => {
            const unread = !(n.readBy || []).includes(myId);
            return (
              <div key={n.id} onClick={() => unread && markNotificationRead(groupId, n.id, myId)}
                style={{ padding: "9px 12px", borderBottom: "0.5px solid var(--gray-light)", cursor: unread ? "pointer" : "default", background: unread ? "rgba(192,57,43,0.05)" : "transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: unread ? 700 : 600 }}>{TYPE_ICON[n.type] || "🔔"} {n.title}</span>
                  <span style={{ fontSize: 10, color: "var(--gray)", whiteSpace: "nowrap" }}>{ago(n.at)}</span>
                </div>
                {n.body && <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>{n.body}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Shell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const {
    group, venues, staff, leave, assignments, unreadMessages,
    stock, purchaseOrders,
    selectedVenue, setSelectedVenue, selectedVenueName, can,
  } = useRG();

  const [venueMgrOpen, setVenueMgrOpen] = useState(false);

  const visibleNav = useMemo(() => NAV.filter((n) => can(n.permKey || n.key, "view")), [can]);
  // presentational split into two labelled groups; unlisted keys default to Operations
  const staffNav = useMemo(() => visibleNav.filter((n) => STAFF_NAV_KEYS.includes(n.key)), [visibleNav]);
  const docsNav = useMemo(() => visibleNav.filter((n) => DOCS_NAV_KEYS.includes(n.key)), [visibleNav]);
  const opsNav = useMemo(() => visibleNav.filter((n) => !STAFF_NAV_KEYS.includes(n.key) && !DOCS_NAV_KEYS.includes(n.key)), [visibleNav]);
  // longest matching path wins, so /rg/contracts/sent highlights "Sent Contracts", not the generator
  const activeKey = NAV.filter((n) => location.pathname.startsWith(n.path)).sort((a, b) => b.path.length - a.path.length)[0]?.key || visibleNav[0]?.key || "staff";
  const current = NAV.find((n) => n.key === activeKey) || NAV[0];

  const pendingLeave = useMemo(() => leave.filter((l) => l.status === "Pending").length, [leave]);
  const openTraining = useMemo(
    () => assignments.filter((a) => a.status !== "Complete").length,
    [assignments]
  );
  const criticalStock = useMemo(() => stock.filter((s) => s.status === "critical").length, [stock]);
  const draftPOs = useMemo(() => purchaseOrders.filter((p) => p.status === "draft").length, [purchaseOrders]);

  const groupName = group?.name || "Group Operations";
  const initials = groupName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const venueStaffCount = (vId) =>
    vId === "all" ? staff.length : staff.filter((s) => staffInVenue(s, vId)).length;

  const subtitle = `${selectedVenueName} · ${venueStaffCount(selectedVenue)} staff`;

  // one sidebar item — identical markup for both groups (badge logic unchanged)
  const renderNavItem = ({ key, path, label, Icon }) => {
    const badge = key === "leave" ? pendingLeave : key === "training" ? openTraining : key === "messages" ? unreadMessages : key === "stock" ? criticalStock : key === "supplier" ? draftPOs : 0;
    return (
      <button key={key} className={`nav-item ${activeKey === key ? "active" : ""}`} onClick={() => navigate(path)}>
        <Icon className="nav-icon" />
        <span>{label}</span>
        {badge > 0 && <span className="nav-badge">{badge}</span>}
      </button>
    );
  };

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

        {staffNav.length > 0 && (
          <div className="nav-section">
            <div className="nav-label">Staff</div>
            {staffNav.map(renderNavItem)}
          </div>
        )}

        {opsNav.length > 0 && (
          <div className="nav-section">
            <div className="nav-label">Operations</div>
            {opsNav.map(renderNavItem)}
          </div>
        )}

        {docsNav.length > 0 && (
          <div className="nav-section">
            <div className="nav-label">Documents</div>
            {docsNav.map(renderNavItem)}
          </div>
        )}

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
            <NotificationsBell />
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
            {can("settings", "edit") && (
              <button className="btn btn-sm" title="Manage venues" onClick={() => setVenueMgrOpen(true)}>
                <Settings size={14} /> Venues
              </button>
            )}
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
