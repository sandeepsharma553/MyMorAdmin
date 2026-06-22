import React, { useEffect, useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp, arrayUnion, arrayRemove } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from "firebase/auth";
import { db, firebaseConfig } from "../../firebase";
import { useRG } from "./RGContext";
import { staffCol, staffDoc, staffPrivateDoc, auditLogCol, staffInVenue, venueCol, venueColor, trainingArchiveCol, checklistArchiveCol } from "../../utils/restaurantGroupPaths";
import { defaultPermsForStaffRole, roleToGroupRole } from "./rgConfig";
import { archiveAndRemoveTraining } from "./trainingArchiveUtils";
import { archiveCompletion } from "./completionArchive";
import { showInActiveList } from "./completionWindow";
import { isJuniorType } from "./staffMinorUtils";
import { orderItemsForStaff, isSuggested } from "./assignmentUtils";
import { staffAreas, stationsForVenue } from "./staffStructureUtils";
import { fullName, initials, certPill, progressColor, trainingStatusPill, moduleForStaff, checklistForStaff, trainingPct, checklistPct, staffSeesAll, snapshotForAssign, snapshotForChecklist, weeklyHours, certStatus, shiftHours } from "./rgUtils";
import { sendNotification } from "./notify";
import AssignmentDetail from "./AssignmentDetail";
import ChecklistAssignmentDetail from "./ChecklistAssignmentDetail";
import Turning18Alert from "./Turning18Alert";
import { fmtDate } from "./dateFmt";

const PRIORITIES = [["normal", "Normal"], ["high", "High — 3 days"], ["urgent", "Urgent — today"]];
const REC_TYPES = ["Coaching", "Mistake", "Commendation", "Incident"];
const recPill = (t) => t === "Mistake" ? "pill-red" : t === "Incident" ? "pill-amber" : t === "Commendation" ? "pill-green" : "pill-blue";
// Firestore Timestamp | {seconds} | ISO string → short date label
const tsLabel = (t) => {
  if (!t) return "";
  try {
    const d = t.toDate ? t.toDate() : (typeof t?.seconds === "number" ? new Date(t.seconds * 1000) : new Date(t));
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch { return ""; }
};

const SHIST_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const SHIST_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shiftDateLabel = (sh) => {
  if (!sh.weekKey) return SHIST_DAYS[sh.day] || "";
  const d = new Date(sh.weekKey); d.setDate(d.getDate() + (sh.day || 0));
  return `${SHIST_DAYS[sh.day] || ""} ${d.getDate()} ${SHIST_MONTHS[d.getMonth()]}`;
};
const CERT_OPTIONS = ["RSA", "Food Safety Supervisor", "Food Handler", "First Aid / CPR", "Working with Children", "Barista Certificate", "Allergen Awareness", "Other"];
const DAY_IDX = (new Date().getDay() + 6) % 7;
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());

const areaOf = (role) => /manager/i.test(role) ? "Mgmt" : /boh|chef|kitchen|wash|fry/i.test(role) ? "BOH" : "FOH";

const genPin = (list) => {
  const used = new Set(list.map((s) => s.pin).filter(Boolean));
  let p, t = 0;
  do { p = String(Math.floor(1000 + Math.random() * 9000)); t++; } while (used.has(p) && t < 60);
  return p;
};
const uniqueDisplayName = (base, list, excludeId) => {
  base = (base || "").trim();
  const used = new Set(list.filter((s) => s.id !== excludeId).map((s) => (s.displayName || s.name || "").trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) return base;
  let n = 2; while (used.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
};

// Payroll / personal onboarding fields (private — managers/admins only).
const PAYROLL_FIELDS = [
  { key: "legalName", label: "Full name (legal)", ph: "As on tax records" },
  { key: "dob", label: "Date of birth", type: "date" },
  { key: "contactEmail", label: "Email address", type: "email", ph: "name@email.com" },
  { key: "address", label: "Home address", ph: "Street, suburb, state, postcode", full: true },
  { key: "tfn", label: "Tax file number", ph: "9 digits", sensitive: true },
  { key: "superAccount", label: "Super account number", sensitive: true },
  { key: "superUsi", label: "Super fund USI number", ph: "Unique Super Identifier" },
  { key: "bankBsb", label: "Bank BSB", ph: "xxx-xxx" },
  { key: "bankAccount", label: "Bank account number", sensitive: true },
];
const payrollBlank = () => PAYROLL_FIELDS.reduce((o, f) => { o[f.key] = ""; return o; }, {});
const payrollFrom = (s) => PAYROLL_FIELDS.reduce((o, f) => { o[f.key] = (s[f.key] || "").trim(); return o; }, {});
const payrollFromProfile = (p) => PAYROLL_FIELDS.reduce((o, f) => { o[f.key] = p[f.key] || ""; return o; }, {});

const blankForm = (defaultVenue) => ({
  name: "", role: "FOH", areas: [], venueIds: defaultVenue && defaultVenue !== "all" ? [defaultVenue] : [],
  phone: "", start: "", endDate: "", type: "Casual", cert: "Not yet obtained", certs: [], status: "Active",
  stationIds: [], stationRefs: [], pin: "", hasAdminLogin: false, email: "", password: "", ...payrollBlank(),
});

export default function StaffDirectoryPage() {
  const { groupId, group, staff, scopedStaff, venues, shifts, leave, assignments, checklistAssignments, modules, checklists, perfNotes, stations, roles, areas, empTypes, selectedVenue, showToast, can, me } = useRG();
  const canEdit = can("staff", "edit");
  // Sensitive payroll (TFN/bank/super) is restricted to owner/storeAdmin (and super),
  // matching the Firestore rule on staff/{id}/private. Managers manage staff but not payroll.
  const canPayroll = ["owner", "storeAdmin"].includes(me?.groupRole) || me?.type === "superadmin";
  const actorName = me?.displayName || me?.name || me?.email || "Admin";
  const logChange = async (action, summary, extra = {}) => {
    try {
      await addDoc(auditLogCol(groupId), {
        action, summary, by: actorName, byRole: me?.groupRole || "",
        at: serverTimestamp(), notifySuperAdmin: true, seenBySuper: false, ...extra,
      });
    } catch { /* non-blocking */ }
  };
  const [roleFilter, setRoleFilter] = useState("all");
  const [showLeft, setShowLeft] = useState(false); // archive view: hide Left staff by default, toggle to see only them
  const [hoursPeriod, setHoursPeriod] = useState("week"); // history hours summary window
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(blankForm(selectedVenue));
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [confirmSave, setConfirmSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPayroll, setShowPayroll] = useState(false);
  const [payroll, setPayroll] = useState(null); // private payroll doc for the open profile
  const [profileTab, setProfileTab] = useState("profile"); // profile | history
  const [certDraft, setCertDraft] = useState({ name: "RSA", other: "", expiry: "" });
  const [recForm, setRecForm] = useState({ type: "Coaching", note: "" });

  const venueName = (id) => venues.find((v) => v.id === id)?.name || "";
  const stationName = (id) => stations.find((st) => st.id === id)?.name || "";
  // #3 per-venue station selection: keep venue-qualified refs "venueId:stationId" so the SAME
  // station id in two venues never cross-selects. Legacy bare stationIds + stationNames are
  // derived on save (auto-assign reads stationIds), so downstream is unchanged.
  const refKey = (vid, sid) => `${vid}:${sid}`;
  const stationByRef = (ref) => { const [vid, sid] = (ref || "").split(":"); return stations.find((st) => st.id === sid && st.venueId === vid); };
  const refsClean = (refs, venueIds) => (refs || []).filter((r) => (venueIds || []).includes(r.split(":")[0]));
  const refsToStationIds = (refs) => [...new Set((refs || []).map((r) => r.split(":")[1]).filter(Boolean))];
  const refsToStationNames = (refs) => [...new Set((refs || []).map((r) => stationByRef(r)?.name).filter(Boolean))];
  // legacy stationIds → refs: a bare id maps to every selected venue that actually has it
  const deriveRefs = (stationIds, venueIds) => {
    const out = [];
    (venueIds || []).forEach((vid) => (stationIds || []).forEach((sid) => { if (stations.some((st) => st.id === sid && st.venueId === vid)) out.push(refKey(vid, sid)); }));
    return out;
  };
  const avatarColor = (s) => venueColor(s?.venueNames?.[0] || venueName(s?.venueIds?.[0]) || s?.venue);

  const venueScoped = useMemo(() => scopedStaff.filter((s) => staffInVenue(s, selectedVenue)), [scopedStaff, selectedVenue]);
  const filtered = useMemo(() => {
    let list = venueScoped;
    if (roleFilter !== "all") list = list.filter((s) => {
      const sa = staffAreas(s).length ? staffAreas(s) : [areaOf(s.role)];
      // area buttons carry the configured area value (case-insensitive match); "manager" is special
      return sa.some((a) => a.toLowerCase() === roleFilter.toLowerCase()) || (roleFilter === "manager" && /manager|supervisor|in charge/i.test(s.role));
    });
    // archive: Left staff are hidden from the active grid; the "Left" toggle shows only them
    list = showLeft ? list.filter((s) => s.status === "Left") : list.filter((s) => s.status !== "Left");
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((s) => `${s.displayName || s.name} ${s.role} ${(s.venueNames || []).join(" ")} ${s.email || ""} ${s.pin || ""}`.toLowerCase().includes(t));
    return list;
  }, [venueScoped, roleFilter, search, showLeft]);
  const leftCount = useMemo(() => venueScoped.filter((s) => s.status === "Left").length, [venueScoped]);

  const onShiftToday = useMemo(() => {
    const ids = new Set(shifts.filter((sh) => sh.day === DAY_IDX).map((sh) => sh.staffId));
    return venueScoped.filter((s) => ids.has(s.id)).length;
  }, [shifts, venueScoped]);
  const pendingLeave = leave.filter((l) => l.status === "Pending").length;
  const trainingIncomplete = assignments.filter((a) => a.status !== "Complete").length;

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));

  // ── Certificates (multiple, each with optional expiry) ──
  const addCert = (setter) => {
    const name = certDraft.name === "Other" ? certDraft.other.trim() : certDraft.name;
    if (!name) return;
    setter((p) => ({ ...p, certs: [...(p.certs || []), { name, expiry: certDraft.expiry }] }));
    setCertDraft({ name: "RSA", other: "", expiry: "" });
  };
  const removeCert = (setter, idx) => setter((p) => ({ ...p, certs: (p.certs || []).filter((_, i) => i !== idx) }));
  const renderCerts = (state, setter) => (
    <div className="form-group">
      <label className="form-label">Certificates (with expiry)</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
        {(state.certs || []).map((c, i) => {
          const st = certStatus(c.expiry);
          return <span key={i} className={`pill ${st.pill}`}>{c.name}{c.expiry ? ` · ${c.expiry}` : ""}{st.note ? ` (${st.note})` : ""} <span style={{ cursor: "pointer" }} onClick={() => removeCert(setter, i)}>✕</span></span>;
        })}
        {!(state.certs || []).length && <span style={{ fontSize: 12, color: "var(--gray)" }}>None added yet</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <select className="form-input" style={{ width: 170 }} value={certDraft.name} onChange={(e) => setCertDraft((p) => ({ ...p, name: e.target.value }))}>{CERT_OPTIONS.map((c) => <option key={c}>{c}</option>)}</select>
        {certDraft.name === "Other" && <input className="form-input" style={{ width: 150 }} value={certDraft.other} onChange={(e) => setCertDraft((p) => ({ ...p, other: e.target.value }))} placeholder="Certificate name" />}
        <input type="date" className="form-input" style={{ width: 150 }} value={certDraft.expiry} onChange={(e) => setCertDraft((p) => ({ ...p, expiry: e.target.value }))} title="Expiry date (optional)" />
        <button type="button" className="btn btn-sm" onClick={() => addCert(setter)}>+ Add</button>
      </div>
    </div>
  );

  // Payroll & personal details block, shared by Add + Edit forms.
  const renderPayroll = (state, handler) => (
    <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10 }}>
      <label className="form-label" style={{ marginBottom: 8, display: "block" }}>Payroll &amp; personal details <span style={{ color: "var(--gray)", fontWeight: 400 }}>(private — managers/admins only)</span></label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {PAYROLL_FIELDS.map((f) => (
          <div key={f.key} className="form-group" style={{ margin: 0, gridColumn: f.full ? "1 / -1" : "auto" }}>
            <label className="form-label">{f.label}</label>
            <input className="form-input" type={f.type || "text"} value={state[f.key] || ""} onChange={handler(f.key)} placeholder={f.ph || ""} autoComplete="off" />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 6 }}>Sensitive data (TFN, super, bank). Used for payroll/onboarding only.</div>
    </div>
  );
  const toggleVenue = (vid, target, setter) => setter((p) => ({ ...p, venueIds: p.venueIds.includes(vid) ? p.venueIds.filter((x) => x !== vid) : [...p.venueIds, vid] }));

  // send a Firebase password-reset email to an existing login (client-doable; setting a
  // new password directly for another user needs the Admin SDK / a Cloud Function).
  const resetPassword = async (email) => {
    if (!email) return showToast("No login email on file");
    try { await sendPasswordResetEmail(getAuth(), email); showToast(`Password reset email sent to ${email}`); }
    catch { showToast("Could not send reset email"); }
  };
  // create the linked Firebase Auth (email+password) admin account + permissions
  const createAdminLogin = async ({ email, password, name, role, venueIds, permissions }) => {
    const tempApp = initializeApp(firebaseConfig, `staffCreator_${Date.now()}`);
    try {
      const cred = await createUserWithEmailAndPassword(getAuth(tempApp), email, password);
      const uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: name });
      const groupRole = roleToGroupRole(role);
      await setDoc(doc(db, "employees", uid), {
        uid, name, email, type: "admin", role: "groupStaff", groupRole, empType: "restaurantGroup",
        groupId, groupName: group?.name || "", venueId: venueIds[0] || "all", venueIds,
        permissions: permissions || defaultPermsForStaffRole(role), isActive: true, status: "Active", createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", uid), { uid, firstname: name, email, groupId, groupRole, roles: { groupStaff: true }, createddate: new Date() });
      return uid;
    } finally { try { await deleteApp(tempApp); } catch {} }
  };

  const saveStaff = async () => {
    if (!form.name.trim()) return showToast("Name is required");
    if (!form.venueIds.length) return showToast("Select at least one venue");
    if (form.hasAdminLogin && (!isEmail(form.email))) return showToast("Admin access needs a valid email");
    setSaving(true);
    try {
      const displayName = uniqueDisplayName(form.name, staff, null);
      const pin = (form.pin || "").trim() || genPin(staff);
      if (pin && staff.some((s) => s.pin === pin)) return showToast("PIN already in use — pick another");
      const permissions = defaultPermsForStaffRole(form.role);
      const pwd = form.hasAdminLogin ? ((form.password || "").trim() || `${form.name.replace(/\s+/g, "")}654321`) : "";
      let adminUid = "";
      if (form.hasAdminLogin) {
        adminUid = await createAdminLogin({ email: form.email.toLowerCase().trim(), password: pwd, name: displayName, role: form.role, venueIds: form.venueIds, permissions });
      }
      const created = await addDoc(staffCol(groupId), {
        name: form.name.trim(), displayName, role: form.role,
        areas: (form.areas && form.areas.length) ? form.areas : [areaOf(form.role)],
        area: (form.areas && form.areas[0]) || areaOf(form.role), // legacy single — backward-compat
        groupRole: roleToGroupRole(form.role), permissions,
        venueIds: form.venueIds, venueNames: form.venueIds.map(venueName),
        stationRefs: refsClean(form.stationRefs, form.venueIds), stationIds: refsToStationIds(refsClean(form.stationRefs, form.venueIds)), stationNames: refsToStationNames(refsClean(form.stationRefs, form.venueIds)),
        phone: form.phone.trim(), start: form.start, endDate: form.endDate || "", type: form.type,
        cert: (form.certs && form.certs[0]) ? form.certs[0].name : "Not yet obtained", certs: form.certs || [],
        birthday: (form.dob || "").slice(5), // MM-DD only (day+month, team-visible); full DOB stays private
        status: form.status, pin, email: form.hasAdminLogin ? form.email.toLowerCase().trim() : "",
        hasAdminLogin: !!form.hasAdminLogin, adminUid, createdAt: serverTimestamp(),
      });
      // sensitive data (payroll + login password) → private subcollection (owner/storeAdmin only in rules)
      if (canPayroll) await setDoc(staffPrivateDoc(groupId, created.id), { ...payrollFrom(form), password: pwd, updatedAt: serverTimestamp() });
      showToast(`${displayName} added`);
      logChange("staff.create", `Added staff member ${displayName} (${form.role})`, { venueIds: form.venueIds });
      setAddOpen(false); setForm(blankForm(selectedVenue));
    } catch (e) {
      showToast(e?.code === "auth/email-already-in-use" ? "That admin email already exists" : "Could not add staff");
    } finally { setSaving(false); }
  };

  // ── profile / edit ──
  const openProfile = (s) => { setProfile(s); setEditing(false); setConfirmDel(false); setProfileTab("profile"); };
  const startEdit = () => {
    setEdit({
      name: profile.name || profile.displayName, role: profile.role,
      areas: staffAreas(profile).length ? staffAreas(profile) : [areaOf(profile.role)],
      venueIds: profile.venueIds || (profile.venueId ? [profile.venueId] : []),
      phone: profile.phone || "", start: profile.start || "", endDate: profile.endDate || "", type: profile.type || "Casual",
      cert: profile.cert || "Not yet obtained", stationIds: profile.stationIds || [],
      stationRefs: profile.stationRefs?.length ? profile.stationRefs : deriveRefs(profile.stationIds, profile.venueIds || (profile.venueId ? [profile.venueId] : [])),
      certs: profile.certs || (profile.cert && profile.cert !== "Not yet obtained" ? [{ name: profile.cert, expiry: "" }] : []),
      status: profile.status || "Active", pin: profile.pin || "",
      hasAdminLogin: !!profile.hasAdminLogin, email: profile.email || "", password: "",
      ...payrollFromProfile(payroll || {}),
    });
    setConfirmSave(false);
    setEditing(true);
  };
  const setE = (k) => (e) => setEdit((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  // Compute a human-readable diff between the saved profile and pending edits.
  const diffStaff = () => {
    const out = [];
    const cmp = (label, a, b) => { if (String(a ?? "") !== String(b ?? "")) out.push(`${label}: ${a || "—"} → ${b || "—"}`); };
    cmp("Name", profile.displayName || profile.name, edit.name);
    cmp("Role", profile.role, edit.role);
    cmp("Areas", staffAreas(profile).join(", "), (edit.areas || []).join(", "));
    cmp("Employment", profile.type, edit.type);
    cmp("Phone", profile.phone, edit.phone);
    cmp("Status", profile.status || "Active", edit.status);
    cmp("Start date", profile.start, edit.start);
    cmp("End date", profile.endDate, edit.endDate);
    cmp("POS PIN", profile.pin, edit.pin);
    cmp("Certificates", (profile.certs || []).map((c) => c.name).join(", "), (edit.certs || []).map((c) => c.name).join(", "));
    cmp("Venues", (profile.venueNames || []).join(", "), edit.venueIds.map(venueName).join(", "));
    cmp("Stations", (profile.stationNames || []).join(", "), refsToStationNames(edit.stationRefs).join(", "));
    // audit THAT payroll/personal details changed, but never the sensitive values (auditLog is group-readable)
    if (canPayroll && payroll && PAYROLL_FIELDS.some((f) => String(payroll[f.key] ?? "") !== String(edit[f.key] ?? ""))) {
      out.push("Payroll/personal details updated");
    }
    return out;
  };
  const saveEdit = async () => {
    if (!edit.venueIds.length) return showToast("Select at least one venue");
    if (!confirmSave) { setConfirmSave(true); return; }
    setSaving(true);
    try {
      const displayName = uniqueDisplayName(edit.name, staff, profile.id);
      const pin = (edit.pin || "").trim();
      if (pin && staff.some((s) => s.id !== profile.id && s.pin === pin)) return showToast("PIN already in use");
      let adminUid = profile.adminUid || "";
      let newPwd = payroll?.password || profile.password || ""; // private doc first; fall back to legacy main-doc value (migrates it across on save)
      if (edit.hasAdminLogin && !adminUid) {
        if (!isEmail(edit.email)) return showToast("Admin access needs a valid email");
        newPwd = (edit.password || "").trim() || `${edit.name.replace(/\s+/g, "")}654321`;
        adminUid = await createAdminLogin({ email: edit.email.toLowerCase().trim(), password: newPwd, name: displayName, role: edit.role, venueIds: edit.venueIds, permissions: profile.permissions });
      }
      const patch = {
        name: edit.name.trim(), displayName, role: edit.role,
        areas: (edit.areas && edit.areas.length) ? edit.areas : [areaOf(edit.role)],
        area: (edit.areas && edit.areas[0]) || areaOf(edit.role), // legacy single — backward-compat
        venueIds: edit.venueIds, venueNames: edit.venueIds.map(venueName),
        stationRefs: refsClean(edit.stationRefs, edit.venueIds), stationIds: refsToStationIds(refsClean(edit.stationRefs, edit.venueIds)), stationNames: refsToStationNames(refsClean(edit.stationRefs, edit.venueIds)),
        phone: edit.phone.trim(), start: edit.start, endDate: edit.endDate || "", type: edit.type,
        cert: (edit.certs && edit.certs[0]) ? edit.certs[0].name : "Not yet obtained", certs: edit.certs || [],
        ...(canPayroll && payroll !== null ? { birthday: (edit.dob || "").slice(5) } : {}), // only once the private DOB has loaded, so we never clobber it
        status: edit.status, pin, hasAdminLogin: !!edit.hasAdminLogin, adminUid,
        email: edit.hasAdminLogin ? edit.email.toLowerCase().trim() : (profile.email || ""), updatedAt: serverTimestamp(),
      };
      const changes = diffStaff();
      const histEntry = changes.length ? { at: new Date().toISOString(), by: actorName, changes } : null;
      if (histEntry) patch.history = arrayUnion(histEntry);
      await updateDoc(doc(staffCol(groupId), profile.id), patch);
      // sensitive payroll data → private subcollection (owner/storeAdmin only in rules)
      if (canPayroll) {
        await setDoc(staffPrivateDoc(groupId, profile.id), { ...payrollFrom(edit), password: newPwd, updatedAt: serverTimestamp() }, { merge: true });
        setPayroll({ ...payrollFrom(edit), password: newPwd });
      }
      if (changes.length) logChange("staff.update", `Updated ${displayName}: ${changes.join("; ")}`, { staffId: profile.id, venueIds: edit.venueIds });
      showToast("Staff profile updated");
      const histMerge = histEntry ? { history: [...(profile.history || []), histEntry] } : {};
      setProfile((p) => ({ ...p, ...patch, ...histMerge })); setEditing(false); setConfirmSave(false);
    } catch (e) { showToast(e?.code === "auth/email-already-in-use" ? "Admin email already exists" : "Could not save"); }
    finally { setSaving(false); }
  };
  const removeStaff = async () => {
    try {
      await deleteDoc(doc(staffCol(groupId), profile.id));
      logChange("staff.remove", `Removed staff member ${fullName(profile)} (${profile.role})`, { venueIds: profile.venueIds || [] });
      showToast(`${fullName(profile)} removed`); setProfile(null);
    } catch { showToast("Could not remove"); }
  };
  // ── coaching / mistake records (group-level staff doc) ──
  const addRecord = async () => {
    if (!recForm.note.trim()) return showToast("Add a note");
    const entry = { id: `r${Date.now()}`, type: recForm.type, note: recForm.note.trim(), at: new Date().toISOString(), by: actorName };
    try {
      await updateDoc(staffDoc(groupId, profile.id), { records: arrayUnion(entry) });
      setProfile((p) => ({ ...p, records: [...(p.records || []), entry] }));
      setRecForm({ type: "Coaching", note: "" });
      logChange("staff.record", `${entry.type} logged for ${fullName(profile)}`, { staffId: profile.id });
      showToast("Record added");
    } catch { showToast("Could not add record"); }
  };
  const removeRecord = async (entry) => {
    try {
      await updateDoc(staffDoc(groupId, profile.id), { records: arrayRemove(entry) });
      setProfile((p) => ({ ...p, records: (p.records || []).filter((r) => r.id !== entry.id) }));
    } catch { showToast("Could not remove record"); }
  };

  // ── assign training / checklists (from the profile, multi-select, area-aware) ──
  const [assignKind, setAssignKind] = useState(null); // "training" | "checklist" | null
  const [picked, setPicked] = useState([]);
  const [assignDue, setAssignDue] = useState("");
  const [assignPriority, setAssignPriority] = useState("normal");
  const [assignNotes, setAssignNotes] = useState("");
  const [openAssignId, setOpenAssignId] = useState(null);
  const openAssignment = useMemo(() => assignments.find((a) => a.id === openAssignId) || null, [assignments, openAssignId]);
  const [openChecklistId, setOpenChecklistId] = useState(null);
  const openChecklistAssignment = useMemo(() => checklistAssignments.find((a) => a.id === openChecklistId) || null, [checklistAssignments, openChecklistId]);
  // archived (past) training for the open profile — fetched on demand (grows over time)
  const [archivedTraining, setArchivedTraining] = useState(null); // null = loading, [] = none
  const [archivedChecklists, setArchivedChecklists] = useState(null);
  const [openArchiveId, setOpenArchiveId] = useState(null);
  const openArchiveRecord = useMemo(() => (archivedTraining || []).find((a) => a.id === openArchiveId) || null, [archivedTraining, openArchiveId]);

  // fetch the private payroll doc when a profile opens (only managers/admins can read it)
  useEffect(() => {
    setPayroll(null);
    if (!profile || !groupId || !canPayroll) return;
    let alive = true;
    getDoc(staffPrivateDoc(groupId, profile.id))
      .then((d) => { if (alive) setPayroll(d.exists() ? d.data() : {}); })
      .catch(() => { if (alive) setPayroll(null); }); // null = load failed → birthday/diff guards skip, never clobber
    return () => { alive = false; };
  }, [profile, groupId, canPayroll]);

  // fetch archived training + checklists across the staff member's venues when a profile
  // opens. Both archives now also receive a dated entry on EACH completion (completionArchive),
  // so a training/checklist completed N times shows N dated entries here.
  useEffect(() => {
    setArchivedTraining(null); setArchivedChecklists(null); setOpenArchiveId(null);
    if (!profile || !groupId) return;
    let alive = true;
    const vids = profile.venueIds || (profile.venueId ? [profile.venueId] : []);
    const sortByDate = (a, b) => (b.completedAtMillis || (b.archivedAt?.seconds || 0) * 1000) - (a.completedAtMillis || (a.archivedAt?.seconds || 0) * 1000);
    const load = (colFn, setter) => Promise.all(vids.map((vid) =>
      getDocs(query(colFn(groupId, vid), where("staffId", "==", profile.id)))
        .then((snap) => snap.docs.map((d) => ({ id: d.id, venueId: vid, ...d.data() })))
        .catch(() => [])
    )).then((lists) => { if (alive) setter(lists.flat().sort(sortByDate)); })
      .catch(() => { if (alive) setter([]); });
    load(trainingArchiveCol, setArchivedTraining);
    load(checklistArchiveCol, setArchivedChecklists);
    return () => { alive = false; };
  }, [profile, groupId]);

  const myTraining = useMemo(() => profile ? assignments.filter((a) => a.staffId === profile.id) : [], [profile, assignments]);
  const myChecklists = useMemo(() => profile ? checklistAssignments.filter((a) => a.staffId === profile.id) : [], [profile, checklistAssignments]);
  // active-list views: hide Complete items older than 48h (stats/dedup keep the full lists)
  const myTrainingActive = useMemo(() => myTraining.filter((a) => showInActiveList(a)), [myTraining]);
  const myChecklistsActive = useMemo(() => myChecklists.filter((a) => showInActiveList(a)), [myChecklists]);

  // ── Activity & history tab ──
  const renderHistory = () => {
    const sh = shifts.filter((x) => x.staffId === profile.id)
      .sort((a, b) => (b.weekKey || "").localeCompare(a.weekKey || "") || (b.day || 0) - (a.day || 0));
    const tDone = myTraining.filter((a) => a.verified || a.status === "Complete");
    const cDone = myChecklists.filter((a) => a.status === "Complete");
    const notes = (perfNotes || []).filter((n) => n.staffId === profile.id);
    const timeline = [
      ...(profile.records || []).map((r) => ({ at: r.at, by: r.by, tag: r.type, text: r.note })),
      ...tDone.filter((a) => a.verifyNote).map((a) => ({ at: a.verifiedAt, by: a.verifiedBy, tag: "Training sign-off", text: `${a.moduleTitle}: ${a.verifyNote}` })),
      ...notes.map((n) => ({ at: n.createdAt || n.at, by: n.by, tag: n.type || "Note", text: n.note || n.text })),
    ].filter((t) => t.text).sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    const Stat = ({ n, l }) => <div style={{ flex: 1, textAlign: "center", padding: "8px 4px", background: "var(--gray-light)", borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700 }}>{n}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{l}</div></div>;
    // hours worked by period, split Mon–Fri vs Sat/Sun (shift date = weekKey + day index)
    const now = new Date();
    const startOfWeek = (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
    const shiftDateOf = (x) => { if (!x.weekKey) return null; const d = new Date(`${x.weekKey}T00:00:00`); d.setDate(d.getDate() + (x.day || 0)); return d; };
    const inPeriod = (d) => {
      if (!d) return false;
      if (hoursPeriod === "week") return d >= startOfWeek;
      if (hoursPeriod === "fortnight") { const c = new Date(startOfWeek); c.setDate(c.getDate() - 7); return d >= c; }
      if (hoursPeriod === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      if (hoursPeriod === "year") return d.getFullYear() === now.getFullYear();
      return true; // total
    };
    let wkday = 0, wkend = 0;
    sh.forEach((x) => { const d = shiftDateOf(x); if (!inPeriod(d)) return; const h = shiftHours(x); if ((x.day || 0) >= 5) wkend += h; else wkday += h; });
    const PERIODS = [["week", "This week"], ["fortnight", "Fortnight"], ["month", "This month"], ["year", "This year"], ["total", "Total"]];
    const Head = ({ t, top }) => <div className="card-head" style={{ margin: top ? "14px 0 6px" : "0 0 6px" }}><span className="card-title">{t}</span></div>;
    return (
      <div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Stat n={sh.length} l="Shifts worked" />
          <Stat n={`${tDone.length}/${myTraining.length}`} l="Training done" />
          <Stat n={`${cDone.length}/${myChecklists.length}`} l="Checklists done" />
        </div>
        {/* hours worked summary — period dropdown + Mon-Fri / Sat-Sun split */}
        <div className="card-head" style={{ margin: "0 0 6px", alignItems: "center" }}>
          <span className="card-title">Hours worked</span>
          <select className="form-input" style={{ width: 150 }} value={hoursPeriod} onChange={(e) => setHoursPeriod(e.target.value)}>
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <Stat n={`${(wkday + wkend).toFixed(1)}h`} l="Total" />
          <Stat n={`${wkday.toFixed(1)}h`} l="Mon–Fri" />
          <Stat n={`${wkend.toFixed(1)}h`} l="Sat–Sun" />
        </div>
        <Head t="Shift history" />
        {sh.length ? sh.slice(0, 40).map((x) => (
          <div key={x.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
            <span>{shiftDateLabel(x)} · <strong>{x.start}–{x.end}</strong></span>
            <span style={{ color: "var(--gray)" }}>{(x.role || "").replace(/^(FOH|BOH) — /, "")}{x.station ? ` · ${x.station}` : ""} · {x.venue} · {shiftHours(x).toFixed(1)}h</span>
          </div>
        )) : <div style={{ fontSize: 12, color: "var(--gray)" }}>No shifts recorded yet.</div>}
        <Head t="Completed training" top />
        {tDone.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{tDone.map((a) => <span key={a.id} className="pill pill-green">{a.moduleTitle}{a.verified ? " ✓" : ""}</span>)}</div> : <div style={{ fontSize: 12, color: "var(--gray)" }}>None yet.</div>}
        <Head t="Completed checklists" top />
        {cDone.length ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{cDone.map((a) => <span key={a.id} className="pill pill-blue">{a.checklistTitle}</span>)}</div> : <div style={{ fontSize: 12, color: "var(--gray)" }}>None yet.</div>}
        <Head t="Notes & feedback" top />
        {timeline.length ? timeline.map((t, i) => (
          <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
            <span className="pill pill-gray">{t.tag}</span> {t.text} <span style={{ color: "var(--gray)" }}>— {t.by || ""}{t.at ? `, ${fmtDate(t.at)}` : ""}</span>
          </div>
        )) : <div style={{ fontSize: 12, color: "var(--gray)" }}>No notes yet.</div>}
      </div>
    );
  };
  // Eligibility is unchanged (moduleForStaff/checklistForStaff); we only ORDER the
  // eligible items by Area→Station→Role relevance to this staff member (suggestion).
  const eligibleModules = useMemo(() => {
    if (!profile) return [];
    const taken = new Set(myTraining.map((a) => `${a.venueId}:${a.moduleId}`));
    const list = modules.filter((m) => moduleForStaff(m, profile) && !taken.has(`${m.venueId}:${m.id}`));
    return orderItemsForStaff(list, profile);
  }, [profile, modules, myTraining]);
  const eligibleChecklists = useMemo(() => {
    if (!profile) return [];
    const taken = new Set(myChecklists.map((a) => `${a.venueId}:${a.checklistId}`));
    const list = checklists.filter((c) => checklistForStaff(c, profile) && !taken.has(`${c.venueId}:${c.id}`));
    return orderItemsForStaff(list, profile);
  }, [profile, checklists, myChecklists]);

  const openAssign = (kind) => { setAssignKind(kind); setPicked([]); setAssignDue(""); setAssignPriority("normal"); setAssignNotes(""); };
  const togglePick = (key) => setPicked((p) => p.includes(key) ? p.filter((x) => x !== key) : [...p, key]);
  const submitAssign = async () => {
    if (!picked.length) return showToast("Pick at least one");
    try {
      if (assignKind === "training") {
        for (const key of picked) {
          const m = eligibleModules.find((x) => `${x.venueId}:${x.id}` === key);
          if (!m) continue;
          await addDoc(venueCol(groupId, m.venueId, "trainingAssignments"), {
            staffId: profile.id, staffName: profile.displayName || profile.name, venue: m.venue, venueId: m.venueId,
            moduleId: m.id, moduleTitle: m.title, due: assignDue, priority: assignPriority, notes: assignNotes.trim(),
            ...snapshotForAssign(m), status: "Not started", progress: 0, createdAt: serverTimestamp(),
          });
        }
        showToast(`Assigned ${picked.length} module(s)`);
        sendNotification(groupId, { to: profile.id, type: "training", title: "Training assigned", body: `${picked.length} module(s) assigned to you${assignDue ? ` · due ${assignDue}` : ""}`, by: actorName });
      } else {
        for (const key of picked) {
          const c = eligibleChecklists.find((x) => `${x.venueId}:${x.id}` === key);
          if (!c) continue;
          await addDoc(venueCol(groupId, c.venueId, "checklistAssignments"), {
            staffId: profile.id, staffName: profile.displayName || profile.name, venueId: c.venueId, venue: c.venue,
            checklistId: c.id, checklistTitle: c.title, ...snapshotForChecklist(c),
            status: "Not started", progress: 0, createdAt: serverTimestamp(),
          });
        }
        showToast(`Assigned ${picked.length} checklist(s)`);
        sendNotification(groupId, { to: profile.id, type: "checklist", title: "Checklists assigned", body: `${picked.length} checklist(s) assigned to you`, by: actorName });
      }
      setAssignKind(null);
    } catch { showToast("Could not assign"); }
  };
  const removeAssignment = async (a, kind) => {
    try {
      if (kind === "training") {
        // archive completion history before removing (reassign = remove + assign fresh)
        const { archived } = await archiveAndRemoveTraining(groupId, a, "removed");
        showToast(archived ? "Archived & removed" : "Removed");
      } else {
        await deleteDoc(doc(venueCol(groupId, a.venueId, "checklistAssignments"), a.id));
        showToast("Removed");
      }
    } catch { showToast("Could not remove"); }
  };
  const toggleAssignDone = async (a) => {
    try {
      const ref = doc(venueCol(groupId, a.venueId, "trainingAssignments"), a.id);
      if (a.status === "Complete") {
        await updateDoc(ref, { status: "Not started", progress: 0, completedAt: null });
      } else {
        await updateDoc(ref, { status: "Complete", progress: 100, completedAt: serverTimestamp() });
        archiveCompletion(groupId, "training", a, { status: "Complete", progress: 100 }).catch(() => {}); // dated completion archive (additive)
      }
    } catch { showToast("Could not update"); }
  };

  const Metric = ({ label, value, change, down, bar }) => (
    <div className="metric"><div className="metric-label">{label}</div><div className="metric-value">{value}</div>
      <div className={`metric-change ${down ? "down" : ""}`} style={!down ? { color: "var(--gray)" } : undefined}>{change}</div>
      <div className="metric-bar" style={{ background: bar }} /></div>
  );
  const FilterBtn = ({ id, children }) => (
    <button className="btn btn-sm" onClick={() => setRoleFilter(id)} style={roleFilter === id ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{children}</button>
  );
  const VenuePicker = ({ value, onToggle }) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {venues.map((v) => (
        <button key={v.id} type="button" className="btn btn-sm" onClick={() => onToggle(v.id)}
          style={value.includes(v.id) ? { background: v.color, color: "#fff", borderColor: v.color } : undefined}>{v.name}</button>
      ))}
    </div>
  );
  const toggleStation = (vid, sid, setter) => setter((p) => { const k = refKey(vid, sid); const refs = p.stationRefs || []; return { ...p, stationRefs: refs.includes(k) ? refs.filter((x) => x !== k) : [...refs, k] }; });
  const toggleArea = (a, setter) => setter((p) => ({ ...p, areas: (p.areas || []).includes(a) ? p.areas.filter((x) => x !== a) : [...(p.areas || []), a] }));
  // Multi-select Areas (the migration's areas[] shape).
  const AreaPicker = ({ value, setter }) => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {areas.map((a) => {
        const on = (value || []).includes(a);
        return <button key={a} type="button" className="btn btn-sm" onClick={() => toggleArea(a, setter)}
          style={on ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{a}</button>;
      })}
      {!areas.length && <span style={{ fontSize: 11, color: "var(--gray)" }}>No areas configured — add them in Settings.</span>}
    </div>
  );
  // Stations grouped into one block per selected venue, each filtered to stations whose
  // area is in the selected areas (fixes the all-stations bug) and labelled with their
  // venue (fixes look-alike duplicates across venues). Cascade: venues + areas → stations.
  const StationsByVenue = ({ venueIds, selectedAreas, value, setter }) => {
    if (!venueIds || !venueIds.length) return <div style={{ fontSize: 11, color: "var(--gray)" }}>Select at least one venue first.</div>;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {venueIds.map((vid) => {
          const opts = stationsForVenue(stations, vid, selectedAreas);
          return (
            <div key={vid} style={{ border: "0.5px solid var(--border)", borderRadius: 8, padding: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
                <span className="nav-dot" style={{ background: venueColor(venueName(vid)), marginRight: 5 }} />{venueName(vid)}
              </div>
              {opts.length ? (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {opts.map((st) => {
                    const on = (value || []).includes(refKey(vid, st.id));
                    return <button key={st.id} type="button" className="btn btn-sm" onClick={() => toggleStation(vid, st.id, setter)}
                      style={on ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{st.name} <span style={{ color: on ? "#fff" : "var(--gray)" }}>· {st.area}</span></button>;
                  })}
                </div>
              ) : <div style={{ fontSize: 11, color: "var(--gray)" }}>{(selectedAreas || []).length ? "No stations in the selected areas for this venue." : "No stations for this venue — add them in Settings."}</div>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Metric label="Total staff" value={venueScoped.length} change={`${venues.length} venues`} bar="var(--red)" />
        <Metric label="On shift today" value={onShiftToday} change="Today's roster" bar="var(--green)" />
        <Metric label="Leave pending" value={pendingLeave} change="Needs approval" down bar="var(--amber)" />
        <Metric label="Training incomplete" value={trainingIncomplete} change="modules outstanding" down bar="var(--blue)" />
      </div>

      {canPayroll && <Turning18Alert groupId={groupId} staff={scopedStaff} actorName={actorName} />}

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBtn id="all">All</FilterBtn>
        <FilterBtn id="manager">Managers</FilterBtn>
        {/* area filters from the group's configured areas (mirrors training/sop/checklist filters) */}
        {areas.map((a) => <FilterBtn key={a} id={a}>{a}</FilterBtn>)}
        {/* archive view — Left staff are hidden by default; toggle to review them */}
        <button className="btn btn-sm" onClick={() => setShowLeft((v) => !v)} title="Archived / left staff"
          style={showLeft ? { background: "var(--gray)", color: "#fff", borderColor: "var(--gray)" } : undefined}>🗄 Left{leftCount ? ` (${leftCount})` : ""}</button>
        <input className="form-input" style={{ width: 200, marginLeft: "auto" }} placeholder="🔍 Search staff / PIN..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canEdit && <button className="btn btn-sm btn-primary" onClick={() => { setForm(blankForm(selectedVenue)); setAddOpen(true); }}>+ Add Staff</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
        {filtered.map((s) => (
          <div key={s.id} className="staff-card" onClick={() => openProfile(s)} style={{ ...(s.status === "Left" ? { opacity: 0.55 } : {}), ...(isJuniorType(s.type) ? { borderLeft: "4px solid var(--amber)" } : {}) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
              <div className="staff-avatar" style={{ background: avatarColor(s) }}>{initials(s)}</div>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {isJuniorType(s.type) && <span className="pill pill-amber" title="Junior employment type">Junior</span>}
                {s.status === "Left" && <span className="pill pill-gray" title={s.endDate ? `Left ${s.endDate}` : "Left"}>Left</span>}
                {s.hasAdminLogin && <span className="pill pill-purple" title="Has admin website login">🔑 Admin</span>}
              </span>
            </div>
            <div className="staff-name">{s.displayName || s.name}</div>
            <div className="staff-role">{s.role}</div>
            <div className="staff-meta">
              <div className="staff-meta-row" style={{ flexWrap: "wrap", gap: 4 }}>
                {(s.venueNames || []).map((vn) => (
                  <span key={vn} className="pill" style={{ background: "var(--gray-light)", color: "var(--ink)" }}>
                    <span className="nav-dot" style={{ background: venueColor(vn), marginRight: 4 }} />{vn}
                  </span>
                ))}
              </div>
              <div className="staff-meta-row">🕐 {s.type}{weeklyHours(s.id, shifts) ? ` · ${weeklyHours(s.id, shifts)}h this wk` : ""}</div>
              <div className="staff-meta-row" style={{ gap: 6 }}>
                <span className={`pill ${certPill(s.cert)}`}>{s.cert}</span>
                {s.pin && <span className="pill pill-blue" title="POS PIN">PIN {s.pin}</span>}
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {(() => { const tp = trainingPct(s.id, assignments); const n = assignments.filter((a) => a.staffId === s.id).length; return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--gray)", marginBottom: 3 }}><span>Training {n ? `(${n})` : ""}</span><span>{tp}%</span></div>
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${tp}%`, background: progressColor(tp) }} /></div>
                </>
              ); })()}
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div style={{ color: "var(--gray)", fontSize: 13, padding: 20 }}>No staff match this filter.</div>}
      </div>

      {/* Add modal */}
      {addOpen && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="rg-modal" style={{ maxWidth: 600 }}>
            <div className="modal-head"><span className="modal-title">Add staff member</span><button className="modal-close" onClick={() => setAddOpen(false)}>✕</button></div>
            {/* Cascade: Name → Venue(s) → Role → Areas → Stations */}
            <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={setF("name")} placeholder="First name" /></div>
            <div className="form-group"><label className="form-label">Venues * (works at)</label><VenuePicker value={form.venueIds} onToggle={(vid) => toggleVenue(vid, form, setForm)} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Role *</label><select className="form-input" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value, areas: (p.areas && p.areas.length) ? p.areas : [areaOf(e.target.value)] }))}>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Areas (multi-select)</label><AreaPicker value={form.areas} setter={setForm} /></div>
            </div>
            <div className="form-group"><label className="form-label">Stations <span style={{ color: "var(--gray)", fontWeight: 400 }}>· filtered by selected area + venue</span></label><StationsByVenue venueIds={form.venueIds} selectedAreas={form.areas} value={form.stationRefs} setter={setForm} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Employment</label><select className="form-input" value={form.type} onChange={setF("type")}>{empTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={setF("phone")} placeholder="04xx xxx xxx" /></div>
              <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={form.start} onChange={setF("start")} /></div>
              <div className="form-group"><label className="form-label">End date (if leaving)</label><input type="date" className="form-input" value={form.endDate} onChange={setF("endDate")} /></div>
              {renderCerts(form, setForm)}
              <div className="form-group"><label className="form-label">POS PIN (4-digit, optional)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="form-input" maxLength={4} value={form.pin} onChange={(e) => setForm((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="auto" />
                  <button type="button" className="btn btn-sm" onClick={() => setForm((p) => ({ ...p, pin: genPin(staff) }))}>Auto</button>
                </div>
              </div>
            </div>
            {canPayroll && renderPayroll(form, setF)}
            <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10 }}>
              <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.hasAdminLogin} onChange={setF("hasAdminLogin")} /> Admin website access (email + password login)
              </label>
              {form.hasAdminLogin && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                  <div className="form-group" style={{ margin: 0 }}><label className="form-label">Email *</label><input className="form-input" value={form.email} onChange={setF("email")} placeholder="name@venue.com.au" /></div>
                  <div className="form-group" style={{ margin: 0 }}><label className="form-label">Password</label><input className="form-input" value={form.password} onChange={setF("password")} placeholder="auto if blank" /></div>
                  <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "var(--gray)" }}>Secure Firebase login for the website. Leave off for POS-only staff (PIN only).</div>
                </div>
              )}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveStaff} disabled={saving}>{saving ? "Saving..." : "Add staff member"}</button>
              <button className="btn" onClick={() => setAddOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Profile modal */}
      {profile && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setProfile(null)}>
          <div className="rg-modal" style={{ maxWidth: 600 }}>
            <div className="modal-head"><span className="modal-title">Staff profile</span><button className="modal-close" onClick={() => setProfile(null)}>✕</button></div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div className="staff-avatar" style={{ background: avatarColor(profile), marginBottom: 0, width: 56, height: 56, fontSize: 18 }}>{initials(profile)}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{profile.displayName || profile.name}</div>
                <div style={{ fontSize: 12, color: "var(--gray)" }}>{profile.role} · {(profile.venueNames || []).join(", ")}</div>
              </div>
            </div>

            {!editing ? (
              <>
                <div className="tabs" style={{ marginBottom: 12 }}>
                  {[["profile", "Profile"], ["history", "History"]].map(([id, l]) => (
                    <button key={id} className={`tab ${profileTab === id ? "active" : ""}`} onClick={() => setProfileTab(id)}>{l}</button>
                  ))}
                </div>
                {profileTab === "history" && renderHistory()}
                {profileTab === "profile" && (
                <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {(() => {
                    const hoursWk = weeklyHours(profile.id, shifts);
                    const pCerts = (profile.certs && profile.certs.length) ? profile.certs
                      : (profile.cert && profile.cert !== "Not yet obtained" ? [{ name: profile.cert, expiry: "" }] : []);
                    const certCell = pCerts.length ? (
                      <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
                        {pCerts.map((c, i) => { const st = certStatus(c.expiry); return <span key={i} className={`pill ${st.pill}`}>{c.name}{c.expiry ? ` · ${c.expiry}` : ""}{st.note ? ` (${st.note})` : ""}</span>; })}
                      </span>
                    ) : "Not yet obtained";
                    return [["Employment", profile.type], ["Weekly hours", hoursWk ? `${hoursWk}h · this week` : "— (no shifts)"], ["Start date", profile.start || "—"],
                      ["End date", profile.endDate || "—"], ["Status", profile.status || "Active"], ["Phone", profile.phone || "—"],
                      ["Stations", (profile.stationNames || []).join(", ") || "—"],
                      ["Certificates", certCell], ["POS PIN", profile.pin || "— (none)"], ["Admin login", profile.hasAdminLogin ? (profile.email || "yes") : "No"]];
                  })().map(([k, v]) => (
                    <div key={k}><div className="form-label">{k}</div><div style={{ fontSize: 13 }}>{v}</div></div>
                  ))}
                </div>

                {canPayroll && (
                  <div style={{ marginTop: 16 }}>
                    <div className="card-head" style={{ marginBottom: 8 }}>
                      <span className="card-title">Payroll &amp; personal</span>
                      <button className="btn btn-sm" onClick={() => setShowPayroll((s) => !s)}>{showPayroll ? "Hide" : "Show"} sensitive</button>
                    </div>
                    {payroll === null ? (
                      <div style={{ fontSize: 12, color: "var(--gray)" }}>Loading…</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                        {PAYROLL_FIELDS.map((f) => {
                          const raw = payroll[f.key];
                          let v = raw || "—";
                          if (raw && f.sensitive && !showPayroll) v = "•••• " + String(raw).slice(-3);
                          return <div key={f.key} style={{ gridColumn: f.full ? "1 / -1" : "auto" }}><div className="form-label">{f.label}</div><div style={{ fontSize: 13, wordBreak: "break-word" }}>{v}</div></div>;
                        })}
                        {profile.hasAdminLogin && (
                          <div><div className="form-label">Login password</div><div style={{ fontSize: 13, fontFamily: "monospace" }}>{payroll.password ? (showPayroll ? payroll.password : "••••••") : "—"}</div></div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>Training completion {myTraining.length ? `(${myTraining.filter((a) => a.status === "Complete").length}/${myTraining.length})` : ""}</span>
                    <strong>{trainingPct(profile.id, assignments)}%</strong>
                  </div>
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${trainingPct(profile.id, assignments)}%`, background: progressColor(trainingPct(profile.id, assignments)) }} /></div>
                  {staffSeesAll(profile) && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>Manager/admin — can be assigned any module.</div>}
                </div>
                {myChecklists.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                      <span>Checklist completion ({myChecklists.filter((a) => a.status === "Complete").length}/{myChecklists.length})</span>
                      <strong>{checklistPct(profile.id, checklistAssignments)}%</strong>
                    </div>
                    <div className="progress-wrap"><div className="progress-bar" style={{ width: `${checklistPct(profile.id, checklistAssignments)}%`, background: progressColor(checklistPct(profile.id, checklistAssignments)) }} /></div>
                  </div>
                )}

                {/* Assigned training */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">Assigned training</span>
                    {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAssign("training")}>+ Assign training</button>}
                  </div>
                  {myTrainingActive.map((a) => (
                    <div key={a.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <span style={{ fontSize: 12 }}>{a.moduleTitle} <span style={{ color: "var(--gray)" }}>· {a.venue}</span></span>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--gray)" }}>{(a.checks || []).filter(Boolean).length}/{a.itemsTotal || (a.checks || []).length}</span>
                        {a.verified && <span className="pill pill-green" title={`Verified by ${a.verifiedBy || "trainer"}`}>✓ Verified</span>}
                        <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status}</span>
                        <button className="btn btn-sm" onClick={() => setOpenAssignId(a.id)}>Open</button>
                        {canEdit && <button className="btn btn-sm btn-danger" title="Remove" onClick={() => removeAssignment(a, "training")}>✕</button>}
                      </span>
                    </div>
                  ))}
                  {myTrainingActive.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No training assigned.</div>}
                </div>

                {/* Past / archived training — preserved when a training was removed or reassigned */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">Past / archived training</span>
                    {archivedTraining && archivedTraining.length > 0 && <span className="pill pill-gray">{archivedTraining.length}</span>}
                  </div>
                  {archivedTraining === null && <div style={{ fontSize: 12, color: "var(--gray)" }}>Loading…</div>}
                  {archivedTraining && archivedTraining.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No archived training.</div>}
                  {(archivedTraining || []).map((a) => (
                    <div key={a.id} style={{ padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <div className="staff-meta-row" style={{ justifyContent: "space-between" }}>
                        <span style={{ fontSize: 12 }}>
                          {a.moduleTitle} <span style={{ color: "var(--gray)" }}>· {a.venue}</span>
                          {a.archivedReason && <span className="pill pill-gray" style={{ marginLeft: 6 }}>{a.archivedReason}</span>}
                        </span>
                        <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          {a.verified && <span className="pill pill-green">✓ Verified</span>}
                          <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status}</span>
                          <button className="btn btn-sm" onClick={() => setOpenArchiveId(a.id)}>View</button>
                        </span>
                      </div>
                      <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 2 }}>
                        {a.completedAt ? `completed ${tsLabel(a.completedAt)}` : ""}
                        {a.verifiedBy ? `${a.completedAt ? " · " : ""}Signed off by ${a.verifiedBy}` : ""}
                        {a.verifiedAt ? `${(a.completedAt || a.verifiedBy) ? " · " : ""}${tsLabel(a.verifiedAt)}` : ""}
                        {a.archivedAt ? `${(a.completedAt || a.verifiedBy || a.verifiedAt) ? " · " : ""}archived ${tsLabel(a.archivedAt)}` : ""}
                        {a.verifyNote ? <span style={{ display: "block", color: "var(--ink)" }}>“{a.verifyNote}”</span> : null}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Past / archived checklists — a dated entry per completion (+ reassign/remove) */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">Past / archived checklists</span>
                    {archivedChecklists && archivedChecklists.length > 0 && <span className="pill pill-gray">{archivedChecklists.length}</span>}
                  </div>
                  {archivedChecklists === null && <div style={{ fontSize: 12, color: "var(--gray)" }}>Loading…</div>}
                  {archivedChecklists && archivedChecklists.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No archived checklists.</div>}
                  {(archivedChecklists || []).map((a) => (
                    <div key={a.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <span style={{ fontSize: 12 }}>
                        {a.checklistTitle} <span style={{ color: "var(--gray)" }}>· {a.venue}</span>
                        {a.archivedReason && <span className="pill pill-gray" style={{ marginLeft: 6 }}>{a.archivedReason}</span>}
                      </span>
                      <span style={{ fontSize: 10, color: "var(--gray)" }}>{a.completedAt ? `completed ${tsLabel(a.completedAt)}` : (a.archivedAt ? `archived ${tsLabel(a.archivedAt)}` : "")}</span>
                    </div>
                  ))}
                </div>

                {/* Assigned checklists */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">Assigned checklists</span>
                    {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAssign("checklist")}>+ Assign checklist</button>}
                  </div>
                  {myChecklistsActive.map((a) => (
                    <div key={a.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <span style={{ fontSize: 12 }}>{a.checklistTitle} <span className="pill pill-gray" style={{ marginLeft: 4 }}>{a.area}</span> <span style={{ color: "var(--gray)" }}>· {a.venue}</span></span>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--gray)" }}>{(a.checks || []).filter(Boolean).length}/{a.itemsTotal || (a.checks || []).length}</span>
                        <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status || "Not started"}</span>
                        <button className="btn btn-sm" onClick={() => setOpenChecklistId(a.id)}>Open</button>
                        {canEdit && <button className="btn btn-sm btn-danger" title="Remove" onClick={() => removeAssignment(a, "checklist")}>✕</button>}
                      </span>
                    </div>
                  ))}
                  {myChecklistsActive.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No checklists assigned.</div>}
                </div>

                {/* Coaching & mistake records */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}><span className="card-title">Coaching & mistake records</span></div>
                  {(profile.records || []).slice().reverse().map((r) => (
                    <div key={r.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <span style={{ fontSize: 12 }}><span className={`pill ${recPill(r.type)}`}>{r.type}</span> {r.note} <span style={{ color: "var(--gray)" }}>· {fmtDate(r.at)} · {r.by}</span></span>
                      {canEdit && <button className="btn btn-sm btn-danger" title="Remove" onClick={() => removeRecord(r)}>✕</button>}
                    </div>
                  ))}
                  {!(profile.records || []).length && <div style={{ fontSize: 12, color: "var(--gray)" }}>No records yet.</div>}
                  {canEdit && (
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <select className="form-input" style={{ width: 150 }} value={recForm.type} onChange={(e) => setRecForm((p) => ({ ...p, type: e.target.value }))}>{REC_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                      <input className="form-input" value={recForm.note} onChange={(e) => setRecForm((p) => ({ ...p, note: e.target.value }))} placeholder="What happened / coaching given" onKeyDown={(e) => e.key === "Enter" && addRecord()} />
                      <button className="btn btn-primary" onClick={addRecord}>Add</button>
                    </div>
                  )}
                </div>

                {/* Role & venue history */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}><span className="card-title">Role & venue history</span></div>
                  {(profile.history || []).slice().reverse().map((h, i) => (
                    <div key={i} style={{ padding: "6px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <div style={{ fontSize: 11, color: "var(--gray)" }}>{fmtDate(h.at)} · {h.by}</div>
                      {(h.changes || []).map((c, j) => <div key={j} style={{ fontSize: 12 }}>{c}</div>)}
                    </div>
                  ))}
                  {!(profile.history || []).length && <div style={{ fontSize: 12, color: "var(--gray)" }}>No changes recorded yet.</div>}
                </div>
                </>
                )}

                {confirmDel ? (
                  <div className="btn-row" style={{ alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: "var(--red)" }}>Remove this staff member?</span>
                    <button className="btn btn-sm btn-primary" onClick={removeStaff}>Yes, remove</button>
                    <button className="btn btn-sm" onClick={() => setConfirmDel(false)}>Cancel</button>
                  </div>
                ) : (
                  <div className="btn-row">
                    {canEdit && <button className="btn btn-primary" onClick={startEdit}>Edit profile</button>}
                    {canEdit && <button className="btn btn-danger" onClick={() => setConfirmDel(true)}>Remove</button>}
                    <button className="btn" onClick={() => setProfile(null)}>Close</button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Cascade: Name → Venue(s) → Role → Areas → Stations */}
                <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={edit.name} onChange={setE("name")} /></div>
                <div className="form-group"><label className="form-label">Venues (works at)</label><VenuePicker value={edit.venueIds} onToggle={(vid) => toggleVenue(vid, edit, setEdit)} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group"><label className="form-label">Role</label><select className="form-input" value={edit.role} onChange={(e) => setEdit((p) => ({ ...p, role: e.target.value, areas: (p.areas && p.areas.length) ? p.areas : [areaOf(e.target.value)] }))}>{roles.map((r) => <option key={r}>{r}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Areas (multi-select)</label><AreaPicker value={edit.areas} setter={setEdit} /></div>
                </div>
                <div className="form-group"><label className="form-label">Stations <span style={{ color: "var(--gray)", fontWeight: 400 }}>· filtered by selected area + venue</span></label><StationsByVenue venueIds={edit.venueIds} selectedAreas={edit.areas} value={edit.stationRefs} setter={setEdit} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group"><label className="form-label">Employment</label><select className="form-input" value={edit.type} onChange={setE("type")}>{empTypes.map((t) => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={edit.phone} onChange={setE("phone")} /></div>
                  <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={edit.start} onChange={setE("start")} /></div>
                  <div className="form-group"><label className="form-label">End date (if leaving)</label><input type="date" className="form-input" value={edit.endDate} onChange={setE("endDate")} /></div>
                  <div className="form-group"><label className="form-label">Status</label><select className="form-input" value={edit.status} onChange={setE("status")}><option>Active</option><option>Inactive</option><option>On leave</option><option>Left</option></select></div>
                  <div className="form-group"><label className="form-label">Weekly hours</label><div className="form-input" style={{ color: "var(--gray)", background: "var(--gray-light)" }}>{weeklyHours(profile.id, shifts)}h · auto from roster</div></div>
                  <div className="form-group"><label className="form-label">POS PIN</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="form-input" maxLength={4} value={edit.pin} onChange={(e) => setEdit((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                      <button type="button" className="btn btn-sm" onClick={() => setEdit((p) => ({ ...p, pin: genPin(staff) }))}>Auto</button>
                    </div>
                  </div>
                </div>
                {renderCerts(edit, setEdit)}
                {canPayroll && renderPayroll(edit, setE)}
                <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10 }}>
                  <label className="form-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={edit.hasAdminLogin} onChange={setE("hasAdminLogin")} disabled={!!profile.adminUid} /> Admin website access
                  </label>
                  {edit.hasAdminLogin && !profile.adminUid && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                      <div className="form-group" style={{ margin: 0 }}><label className="form-label">Email *</label><input className="form-input" value={edit.email} onChange={setE("email")} /></div>
                      <div className="form-group" style={{ margin: 0 }}><label className="form-label">Password</label><input className="form-input" value={edit.password} onChange={setE("password")} placeholder="auto if blank" /></div>
                    </div>
                  )}
                  {profile.adminUid && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, color: "var(--gray)" }}>Login exists ({profile.email}) — manage permissions in User Management.</div>
                      <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => resetPassword(profile.email)}>Send password reset email</button>
                    </div>
                  )}
                </div>
                {confirmSave && <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 8, padding: "8px 10px", background: "var(--gray-light)", borderRadius: 8 }}>⚠ These changes will be logged and the super admin notified. Click <strong>Confirm &amp; save</strong> to proceed.</div>}
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : confirmSave ? "Confirm & save" : "Save changes"}</button>
                  <button className="btn" onClick={() => { setEditing(false); setConfirmSave(false); }}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Assign modal (multi-select training or checklists) */}
      {profile && assignKind && (
        <div className="rg-modal-overlay" style={{ zIndex: 1100 }} onClick={(e) => e.target === e.currentTarget && setAssignKind(null)}>
          <div className="rg-modal">
            <div className="modal-head">
              <span className="modal-title">Assign {assignKind === "training" ? "training" : "checklists"} — {profile.displayName || profile.name}</span>
              <button className="modal-close" onClick={() => setAssignKind(null)}>✕</button>
            </div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>
              {staffSeesAll(profile) ? "Manager/admin — all modules across their venues." : `Showing ${staffAreas(profile).join(", ") || "—"} + universal items for ${(profile.venueNames || []).join(", ")}.`}
            </div>
            {assignKind === "training" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Due date</label><input type="date" className="form-input" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Priority</label><select className="form-input" value={assignPriority} onChange={(e) => setAssignPriority(e.target.value)}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="form-group" style={{ margin: 0, gridColumn: "1 / -1" }}><label className="form-label">Notes for staff member (optional)</label><textarea className="form-input" rows={2} value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} placeholder="e.g. focus on espresso dial-in before your next close" /></div>
              </div>
            )}
            <div style={{ maxHeight: "45vh", overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: 8 }}>
              {(assignKind === "training" ? eligibleModules : eligibleChecklists).map((m) => {
                const key = `${m.venueId}:${m.id}`;
                return (
                  <label key={key} className="checklist-item" style={{ padding: "8px 10px", cursor: "pointer", margin: 0 }}>
                    <input type="checkbox" checked={picked.includes(key)} onChange={() => togglePick(key)} />
                    <span className="check-text">
                      {assignKind === "training" ? <>{m.icon} {m.title} <span className="pill pill-gray">{m.cat}</span></> : <>{m.title} <span className="pill pill-gray">{m.area || "All"}</span></>}
                      {profile && isSuggested(m, profile) && <span className="pill pill-green" style={{ marginLeft: 4 }} title="Matches this staff member's area / station / role">Suggested</span>}
                      <span style={{ color: "var(--gray)" }}> · {m.venue}</span>
                    </span>
                  </label>
                );
              })}
              {(assignKind === "training" ? eligibleModules : eligibleChecklists).length === 0 && (
                <div style={{ fontSize: 12, color: "var(--gray)", padding: 12 }}>Nothing left to assign — all relevant {assignKind === "training" ? "modules" : "checklists"} are already assigned.</div>
              )}
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={submitAssign} disabled={!picked.length}>Assign {picked.length || ""}</button>
              <button className="btn" onClick={() => setAssignKind(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {openAssignment && (
        <AssignmentDetail assignment={openAssignment} liveModule={modules.find((m) => m.id === openAssignment.moduleId) || modules.find((m) => m.title === openAssignment.moduleTitle && m.venueId === openAssignment.venueId)} groupId={groupId} canTick={canEdit} canVerify={can("training", "edit")} canComment={can("training", "edit")} actorName={actorName} showToast={showToast} onClose={() => setOpenAssignId(null)} />
      )}
      {openChecklistAssignment && (
        <ChecklistAssignmentDetail assignment={openChecklistAssignment} liveChecklist={checklists.find((c) => c.id === openChecklistAssignment.checklistId) || checklists.find((c) => c.title === openChecklistAssignment.checklistTitle && c.venueId === openChecklistAssignment.venueId)} groupId={groupId} canTick={canEdit} canComment={canEdit} actorName={actorName} showToast={showToast} onClose={() => setOpenChecklistId(null)} />
      )}
      {/* Archived training — strictly read-only (all caps disabled, so no writes can occur) */}
      {openArchiveRecord && (
        <AssignmentDetail assignment={openArchiveRecord} liveModule={modules.find((m) => m.id === openArchiveRecord.moduleId)} groupId={groupId} canTick={false} canVerify={false} canComment={false} actorName={actorName} showToast={showToast} onClose={() => setOpenArchiveId(null)} />
      )}
    </>
  );
}
