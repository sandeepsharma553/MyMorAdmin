/* ============================================================
   Restaurant Group — roles, modules and the permission model.
   Permission level per module: "none" | "view" | "edit".
     none → module hidden / inaccessible
     view → read-only (can open the page, no admin actions)
     edit → full access incl. admin actions (approve, add, delete)
   ============================================================ */

// Platform modules that can be permissioned. `path` ties to the route/nav.
export const RG_MODULES = [
  { key: "staff", label: "Staff Directory", path: "/rg/staff" },
  { key: "shifts", label: "Shift Planner", path: "/rg/shifts" },
  { key: "leave", label: "Leave Requests", path: "/rg/leave" },
  { key: "training", label: "Training", path: "/rg/training" },
  { key: "checklists", label: "SOPs & Checklists", path: "/rg/checklists" },
  { key: "performance", label: "Performance", path: "/rg/performance" },
  { key: "usermgmt", label: "User Management", path: "/rg/users" },
];

export const RG_MODULE_KEYS = RG_MODULES.map((m) => m.key);

export const LEVELS = { NONE: "none", VIEW: "view", EDIT: "edit" };
const order = { none: 0, view: 1, edit: 2 };

// Four roles mirroring the prototype hierarchy.
export const RG_ROLES = [
  { key: "owner", label: "Super Admin", desc: "Full access across all venues. Can manage users & permissions.", pill: "#111111", text: "#fff" },
  { key: "storeAdmin", label: "Store Admin", desc: "Manages one venue. Creates staff and edits their venue's data.", pill: "#fdf2f2", text: "#a93226" },
  { key: "manager", label: "Manager", desc: "Limited edit on assigned sections for their venue.", pill: "#fffbeb", text: "#d97706" },
  { key: "staff", label: "Staff", desc: "View permitted sections only. Submits leave, completes checklists.", pill: "#f4f4f5", text: "#6b7280" },
];

// Default permission matrix per role (per module → level).
export const DEFAULT_PERMISSIONS = {
  owner: { staff: "edit", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "edit", usermgmt: "edit" },
  storeAdmin: { staff: "edit", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "view", usermgmt: "edit" },
  manager: { staff: "view", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "view", usermgmt: "none" },
  staff: { staff: "none", shifts: "view", leave: "view", training: "view", checklists: "edit", performance: "none", usermgmt: "none" },
};

export const defaultPermsForRole = (role) => ({ ...(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.staff) });

// Map a staff job role (Manager / FOH Supervisor / FOH / BOH / Chef …) to a permission groupRole.
export const roleToGroupRole = (role) =>
  /manager/i.test(role || "") ? "storeAdmin"
    : /supervisor|in charge/i.test(role || "") ? "manager"
      : "staff";

// Default permission map for a staff job role.
export const defaultPermsForStaffRole = (role) => defaultPermsForRole(roleToGroupRole(role));

export const roleMeta = (role) => RG_ROLES.find((r) => r.key === role) || RG_ROLES[3];

// Does a permission map satisfy a required level for a module?
export const hasLevel = (perms, moduleKey, required = "view") => {
  const have = perms?.[moduleKey] || "none";
  return order[have] >= order[required];
};

export const levelMeta = (lvl) => {
  if (lvl === "edit") return { label: "✏ Edit", color: "var(--green)" };
  if (lvl === "view") return { label: "👁 View", color: "var(--blue)" };
  return { label: "✕ None", color: "var(--gray)" };
};
