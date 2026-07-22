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
  { key: "availability", label: "Availability", path: "/rg/availability" }, // mirrors Ops lib/rgConfig — keep levels in sync
  { key: "training", label: "Training", path: "/rg/training" },
  { key: "checklists", label: "Checklists", path: "/rg/checklists" },
  { key: "temperature", label: "Temperature Log", path: "/rg/temperature" },
  { key: "performance", label: "Performance", path: "/rg/performance" },
  // Read-only reports (contracted-vs-rostered first; more to follow). Placed beside
  // Performance — its people-analytics neighbour — so the permissions matrix rows group
  // sensibly. Levels follow the CALENDAR precedent (view even for owner): a read-only
  // page has nothing to edit, and seeding a level nothing enforces is what
  // permissions.test.js's approve guard exists to prevent.
  { key: "reports", label: "Reports", path: "/rg/reports" },
  { key: "stock", label: "Stock", path: "/rg/stock" },
  { key: "menus", label: "Menus", path: "/rg/menus" },
  // POS is its OWN permission (not `menus`): every role may SELL by default — the
  // POS PIN attributes each order — while menu/stock management stays manager+.
  // An explicit permissions.pos = "none" revokes the POS for an individual.
  { key: "pos", label: "POS", path: "/rg/pos" },
  { key: "supplier", label: "Supplier Ordering", path: "/rg/supplier" },
  // Keys — who holds physical keys to which store. Deliberately a simple record list,
  // not a workflow. Levels: admin edit, manager view, staff none — and NO approve
  // (permissions.test.js enforces that only leave/availability carry approve).
  // Mirrored in MyMorOps lib/rgConfig (keep levels in sync — live employee.permissions
  // docs are shared data both apps fall back from).
  { key: "keys", label: "Keys", path: "/rg/keys" },
  { key: "compliance", label: "Awards & Compliance", path: "/rg/compliance" },
  { key: "contracts", label: "Contract Generator", path: "/rg/contracts" },
  { key: "messages", label: "Messages", path: "/rg/messages" },
  { key: "calendar", label: "Calendar", path: "/rg/calendar" },
  { key: "usermgmt", label: "User Management", path: "/rg/users" },
  { key: "settings", label: "Settings", path: "/rg/settings" },
];

// Phase 3b presentation split: SOPs and Checklists are now DISTINCT nav items.
// SOPs are the training-module library, so the SOPs item reuses the `training`
// permission + data (NO new permission module, NO data migration) — its route just
// opens the Training page focused on the module/SOP library. Checklists keep their
// own collection + the `checklists` permission, now plainly labelled "Checklists".
export const SOPS_NAV = { key: "sops", path: "/rg/sops", permKey: "training", label: "SOPs", title: "SOPs — Procedures" };
export const CHECKLISTS_NAV_LABEL = "Checklists";

// Editable in Settings; these are the seed defaults.
export const DEFAULT_ROLES = ["Manager", "FOH Supervisor", "FOH In Charge", "FOH", "BOH In Charge", "BOH", "Chef", "Junior"];
// Staff areas. Editable in Settings (group.areas[]); these are the seed defaults.
// NB: "CK"/"Kitchen" is NOT an area — Central Kitchen is a VENUE; its staff carry
// their real FOH/BOH area and are found via the venue filter. The legacy "Mgmt"
// token is GONE: a management area exists only if the owner configures one
// (e.g. "Management"), and role→area inference matches against that config
// (roleConfiguredArea) instead of emitting a baked-in string.
export const DEFAULT_AREAS = ["FOH", "BOH"];
// Employment types. Editable in Settings (group.empTypes[]); seed defaults.
export const DEFAULT_EMP_TYPES = ["Casual", "Part-time", "Full-time", "Junior"];
// Leave types. Editable in Settings (group.leaveTypes[]); seed defaults. "Other" is NOT
// in this list — it is PERMANENT: the request forms always append it, and it stores
// type:"Other" + typeOther:"<free text>" so history never depends on an editable label.
export const DEFAULT_LEAVE_TYPES = ["Annual Leave", "Sick Leave", "Personal Leave", "Study Leave", "Unpaid Leave", "RDO", "Compassionate Leave"];
export const SUGGESTED_STATIONS = {
  FOH: ["Counter", "Floor", "Barista", "Bar"],
  BOH: ["Grill", "Salad", "Food Prep", "Restock", "Fryer", "Dishwashing"],
};

export const RG_MODULE_KEYS = RG_MODULES.map((m) => m.key);

export const LEVELS = { NONE: "none", SELF: "self", VIEW: "view", EDIT: "edit", APPROVE: "approve" };
// Ranked, monotonic. `approve` sits ABOVE `edit`: because hasLevel() is "has AT LEAST
// this level" (order[have] >= order[required]), anyone with approve automatically
// passes edit/view checks, while can(key,"approve") admits only approve.
// "self" (Phase 5a) sits strictly BETWEEN none and view: it opens ONLY own-profile
// surfaces (can(key,"self")) and passes no existing >= "view" / >= "edit" check.
const order = { none: 0, self: 1, view: 2, edit: 3, approve: 4 };

// Four roles mirroring the prototype hierarchy.
export const RG_ROLES = [
  { key: "owner", label: "Super Admin", desc: "Full access across all venues. Can manage users & permissions.", pill: "#111111", text: "#fff" },
  { key: "storeAdmin", label: "Store Admin", desc: "Manages one venue. Creates staff and edits their venue's data.", pill: "#fdf2f2", text: "#a93226" },
  { key: "manager", label: "Manager", desc: "Limited edit on assigned sections for their venue.", pill: "#fffbeb", text: "#d97706" },
  { key: "staff", label: "Staff", desc: "View permitted sections only. Submits leave, completes checklists.", pill: "#f4f4f5", text: "#6b7280" },
];

// Default permission matrix per role (per module → level).
export const DEFAULT_PERMISSIONS = {
  owner: { staff: "edit", shifts: "edit", leave: "approve", availability: "approve", training: "edit", checklists: "edit", temperature: "edit", performance: "edit", reports: "view", messages: "edit", calendar: "view", usermgmt: "edit", settings: "edit", stock: "edit", menus: "edit", pos: "edit", supplier: "edit", keys: "edit", compliance: "edit", contracts: "edit" },
  storeAdmin: { staff: "edit", shifts: "edit", leave: "approve", availability: "approve", training: "edit", checklists: "edit", temperature: "edit", performance: "view", reports: "view", messages: "edit", calendar: "view", usermgmt: "edit", settings: "edit", stock: "edit", menus: "edit", pos: "edit", supplier: "edit", keys: "edit", compliance: "edit", contracts: "edit" },
  manager: { staff: "view", shifts: "edit", leave: "edit", availability: "approve", training: "edit", checklists: "edit", temperature: "edit", performance: "view", reports: "view", messages: "edit", calendar: "view", usermgmt: "none", settings: "none", stock: "edit", menus: "edit", pos: "edit", supplier: "view", keys: "view", compliance: "edit", contracts: "none" },
  staff: { staff: "none", shifts: "view", leave: "view", availability: "view", training: "view", checklists: "edit", temperature: "edit", performance: "none", reports: "none", messages: "view", calendar: "view", usermgmt: "none", settings: "none", stock: "none", menus: "none", pos: "view", supplier: "none", keys: "none", compliance: "view", contracts: "none" },
};

export const defaultPermsForRole = (role) => ({ ...(DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.staff) });

// Map a staff job role (Manager / FOH Supervisor / FOH / BOH / Chef …) to a permission groupRole.
export const roleToGroupRole = (role) =>
  /manager/i.test(role || "") ? "storeAdmin"
    : /supervisor|in charge/i.test(role || "") ? "manager"
      : "staff";

// Default permission map for a staff job role.
export const defaultPermsForStaffRole = (role) => defaultPermsForRole(roleToGroupRole(role));

// Exact "Manager" test — the SINGLE source of truth for "is this person a manager?",
// shared by the employment-terms editor (payBasis visibility) and the Contract Generator's
// §4 template selection, so the entry surface and selection surface can never diverge.
// Deliberately EXACT (role === "Manager"): the role keywords elsewhere (supervisor /
// in-charge) classify as management, and those hourly staff must NOT be managers here.
export const isManager = (staff) => (staff?.role || "") === "Manager";

// Step 7 ROLLOUT GATE: signed-contract upload/download UI stays dark until the Storage
// deny-rule + the upload/getSignedContractUrl callables are live. Flip to true LAST.
export const SIGNED_UPLOAD_ENABLED = true;

export const roleMeta = (role) => RG_ROLES.find((r) => r.key === role) || RG_ROLES[3];

// Does a permission map satisfy a required level for a module?
// Phase 5a: the STAFF module has a derived "self" FLOOR — every group member counts as
// at least staff:"self" (own profile only) even when their STORED map says "none"
// (stored maps are full snapshots, so a default-map change alone would never reach
// existing users). Floored here at resolve time: zero Firestore writes, and since
// self < view, no staff-list gate or other module's check changes behaviour.
export const hasLevel = (perms, moduleKey, required = "view") => {
  let have = perms?.[moduleKey] || "none";
  if (moduleKey === "staff" && order[have] < order.self) have = "self";
  return order[have] >= order[required];
};

export const levelMeta = (lvl) => {
  if (lvl === "approve") return { label: "✓ Approve", color: "var(--red)" };
  if (lvl === "edit") return { label: "✏ Edit", color: "var(--green)" };
  if (lvl === "view") return { label: "👁 View", color: "var(--blue)" };
  if (lvl === "self") return { label: "👤 Self", color: "var(--amber)" };
  return { label: "✕ None", color: "var(--gray)" };
};
