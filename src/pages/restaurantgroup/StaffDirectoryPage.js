import React, { useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { db, firebaseConfig } from "../../firebase";
import { useRG } from "./RGContext";
import { staffCol, staffInVenue, venueCol, venueColor } from "../../utils/restaurantGroupPaths";
import { defaultPermsForStaffRole, roleToGroupRole } from "./rgConfig";
import { fullName, initials, certPill, progressColor, trainingStatusPill, moduleForStaff, checklistForStaff, trainingPct, staffSeesAll, snapshotForAssign } from "./rgUtils";
import AssignmentDetail from "./AssignmentDetail";

const PRIORITIES = [["normal", "Normal"], ["high", "High — 3 days"], ["urgent", "Urgent — today"]];

const ROLES = ["Manager", "FOH Supervisor", "FOH In Charge", "FOH", "BOH In Charge", "BOH", "Chef"];
const AREAS = ["FOH", "BOH", "Mgmt"];
const EMP_TYPES = ["Casual", "Part-time", "Full-time"];
const CERTS = ["Not yet obtained", "Food Handler", "Food Safety Supervisor", "RSA"];
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

const blankForm = (defaultVenue) => ({
  name: "", role: "FOH", area: "FOH", venueIds: defaultVenue && defaultVenue !== "all" ? [defaultVenue] : [],
  phone: "", start: "", type: "Casual", cert: "Not yet obtained", training: 0, hours: 0, status: "Active",
  pin: "", hasAdminLogin: false, email: "", password: "",
});

export default function StaffDirectoryPage() {
  const { groupId, group, staff, venues, shifts, leave, assignments, checklistAssignments, modules, checklists, selectedVenue, showToast, can } = useRG();
  const canEdit = can("staff", "edit");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(blankForm(selectedVenue));
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);

  const venueName = (id) => venues.find((v) => v.id === id)?.name || "";
  const avatarColor = (s) => venueColor(s?.venueNames?.[0] || venueName(s?.venueIds?.[0]) || s?.venue);

  const venueScoped = useMemo(() => staff.filter((s) => staffInVenue(s, selectedVenue)), [staff, selectedVenue]);
  const filtered = useMemo(() => {
    let list = venueScoped;
    if (roleFilter !== "all") list = list.filter((s) => (s.area || areaOf(s.role)).toLowerCase() === roleFilter || (roleFilter === "manager" && /manager|supervisor|in charge/i.test(s.role)));
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((s) => `${s.displayName || s.name} ${s.role} ${(s.venueNames || []).join(" ")} ${s.email || ""} ${s.pin || ""}`.toLowerCase().includes(t));
    return list;
  }, [venueScoped, roleFilter, search]);

  const onShiftToday = useMemo(() => {
    const ids = new Set(shifts.filter((sh) => sh.day === DAY_IDX).map((sh) => sh.staffId));
    return venueScoped.filter((s) => ids.has(s.id)).length;
  }, [shifts, venueScoped]);
  const pendingLeave = leave.filter((l) => l.status === "Pending").length;
  const trainingIncomplete = assignments.filter((a) => a.status !== "Complete").length;

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const toggleVenue = (vid, target, setter) => setter((p) => ({ ...p, venueIds: p.venueIds.includes(vid) ? p.venueIds.filter((x) => x !== vid) : [...p.venueIds, vid] }));

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
      let adminUid = "";
      if (form.hasAdminLogin) {
        adminUid = await createAdminLogin({ email: form.email.toLowerCase().trim(), password: (form.password || "").trim() || `${form.name.replace(/\s+/g, "")}654321`, name: displayName, role: form.role, venueIds: form.venueIds, permissions });
      }
      await addDoc(staffCol(groupId), {
        name: form.name.trim(), displayName, role: form.role, area: form.area || areaOf(form.role),
        groupRole: roleToGroupRole(form.role), permissions,
        venueIds: form.venueIds, venueNames: form.venueIds.map(venueName),
        phone: form.phone.trim(), start: form.start, type: form.type, cert: form.cert,
        hours: Number(form.hours) || 0,
        status: form.status, pin, email: form.hasAdminLogin ? form.email.toLowerCase().trim() : "",
        hasAdminLogin: !!form.hasAdminLogin, adminUid, createdAt: serverTimestamp(),
      });
      showToast(`${displayName} added`);
      setAddOpen(false); setForm(blankForm(selectedVenue));
    } catch (e) {
      showToast(e?.code === "auth/email-already-in-use" ? "That admin email already exists" : "Could not add staff");
    } finally { setSaving(false); }
  };

  // ── profile / edit ──
  const openProfile = (s) => { setProfile(s); setEditing(false); setConfirmDel(false); };
  const startEdit = () => {
    setEdit({
      name: profile.name || profile.displayName, role: profile.role, area: profile.area || areaOf(profile.role),
      venueIds: profile.venueIds || (profile.venueId ? [profile.venueId] : []),
      phone: profile.phone || "", start: profile.start || "", type: profile.type || "Casual",
      cert: profile.cert || "Not yet obtained", training: profile.training || 0, hours: profile.hours || 0,
      status: profile.status || "Active", pin: profile.pin || "",
      hasAdminLogin: !!profile.hasAdminLogin, email: profile.email || "", password: "",
    });
    setEditing(true);
  };
  const setE = (k) => (e) => setEdit((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const saveEdit = async () => {
    if (!edit.venueIds.length) return showToast("Select at least one venue");
    setSaving(true);
    try {
      const displayName = uniqueDisplayName(edit.name, staff, profile.id);
      const pin = (edit.pin || "").trim();
      if (pin && staff.some((s) => s.id !== profile.id && s.pin === pin)) return showToast("PIN already in use");
      let adminUid = profile.adminUid || "";
      if (edit.hasAdminLogin && !adminUid) {
        if (!isEmail(edit.email)) return showToast("Admin access needs a valid email");
        adminUid = await createAdminLogin({ email: edit.email.toLowerCase().trim(), password: (edit.password || "").trim() || `${edit.name.replace(/\s+/g, "")}654321`, name: displayName, role: edit.role, venueIds: edit.venueIds, permissions: profile.permissions });
      }
      const patch = {
        name: edit.name.trim(), displayName, role: edit.role, area: edit.area || areaOf(edit.role),
        venueIds: edit.venueIds, venueNames: edit.venueIds.map(venueName),
        phone: edit.phone.trim(), start: edit.start, type: edit.type, cert: edit.cert,
        training: Math.max(0, Math.min(100, Number(edit.training) || 0)), hours: Number(edit.hours) || 0,
        status: edit.status, pin, hasAdminLogin: !!edit.hasAdminLogin, adminUid,
        email: edit.hasAdminLogin ? edit.email.toLowerCase().trim() : (profile.email || ""), updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(staffCol(groupId), profile.id), patch);
      showToast("Staff profile updated");
      setProfile((p) => ({ ...p, ...patch })); setEditing(false);
    } catch (e) { showToast(e?.code === "auth/email-already-in-use" ? "Admin email already exists" : "Could not save"); }
    finally { setSaving(false); }
  };
  const removeStaff = async () => {
    try { await deleteDoc(doc(staffCol(groupId), profile.id)); showToast(`${fullName(profile)} removed`); setProfile(null); }
    catch { showToast("Could not remove"); }
  };

  // ── assign training / checklists (from the profile, multi-select, area-aware) ──
  const [assignKind, setAssignKind] = useState(null); // "training" | "checklist" | null
  const [picked, setPicked] = useState([]);
  const [assignDue, setAssignDue] = useState("");
  const [assignPriority, setAssignPriority] = useState("normal");
  const [openAssignId, setOpenAssignId] = useState(null);
  const openAssignment = useMemo(() => assignments.find((a) => a.id === openAssignId) || null, [assignments, openAssignId]);

  const myTraining = useMemo(() => profile ? assignments.filter((a) => a.staffId === profile.id) : [], [profile, assignments]);
  const myChecklists = useMemo(() => profile ? checklistAssignments.filter((a) => a.staffId === profile.id) : [], [profile, checklistAssignments]);
  const eligibleModules = useMemo(() => {
    if (!profile) return [];
    const taken = new Set(myTraining.map((a) => `${a.venueId}:${a.moduleId}`));
    return modules.filter((m) => moduleForStaff(m, profile) && !taken.has(`${m.venueId}:${m.id}`));
  }, [profile, modules, myTraining]);
  const eligibleChecklists = useMemo(() => {
    if (!profile) return [];
    const taken = new Set(myChecklists.map((a) => `${a.venueId}:${a.checklistId}`));
    return checklists.filter((c) => checklistForStaff(c, profile) && !taken.has(`${c.venueId}:${c.id}`));
  }, [profile, checklists, myChecklists]);

  const openAssign = (kind) => { setAssignKind(kind); setPicked([]); setAssignDue(""); setAssignPriority("normal"); };
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
            moduleId: m.id, moduleTitle: m.title, due: assignDue, priority: assignPriority,
            ...snapshotForAssign(m), status: "Not started", progress: 0, createdAt: serverTimestamp(),
          });
        }
        showToast(`Assigned ${picked.length} module(s)`);
      } else {
        for (const key of picked) {
          const c = eligibleChecklists.find((x) => `${x.venueId}:${x.id}` === key);
          if (!c) continue;
          await addDoc(venueCol(groupId, c.venueId, "checklistAssignments"), {
            staffId: profile.id, staffName: profile.displayName || profile.name, venueId: c.venueId, venue: c.venue,
            checklistId: c.id, checklistTitle: c.title, area: c.area || "All", createdAt: serverTimestamp(),
          });
        }
        showToast(`Assigned ${picked.length} checklist(s)`);
      }
      setAssignKind(null);
    } catch { showToast("Could not assign"); }
  };
  const removeAssignment = async (a, kind) => {
    try { await deleteDoc(doc(venueCol(groupId, a.venueId, kind === "training" ? "trainingAssignments" : "checklistAssignments"), a.id)); showToast("Removed"); }
    catch { showToast("Could not remove"); }
  };
  const toggleAssignDone = async (a) => {
    try { await updateDoc(doc(venueCol(groupId, a.venueId, "trainingAssignments"), a.id), a.status === "Complete" ? { status: "Not started", progress: 0 } : { status: "Complete", progress: 100 }); }
    catch { showToast("Could not update"); }
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

  return (
    <>
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Metric label="Total staff" value={venueScoped.length} change={`${venues.length} venues`} bar="var(--red)" />
        <Metric label="On shift today" value={onShiftToday} change="Today's roster" bar="var(--green)" />
        <Metric label="Leave pending" value={pendingLeave} change="Needs approval" down bar="var(--amber)" />
        <Metric label="Training incomplete" value={trainingIncomplete} change="modules outstanding" down bar="var(--blue)" />
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBtn id="all">All</FilterBtn>
        <FilterBtn id="manager">Managers</FilterBtn>
        <FilterBtn id="foh">FOH</FilterBtn>
        <FilterBtn id="boh">BOH</FilterBtn>
        <input className="form-input" style={{ width: 200, marginLeft: "auto" }} placeholder="🔍 Search staff / PIN..." value={search} onChange={(e) => setSearch(e.target.value)} />
        {canEdit && <button className="btn btn-sm btn-primary" onClick={() => { setForm(blankForm(selectedVenue)); setAddOpen(true); }}>+ Add Staff</button>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))", gap: 12 }}>
        {filtered.map((s) => (
          <div key={s.id} className="staff-card" onClick={() => openProfile(s)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div className="staff-avatar" style={{ background: avatarColor(s) }}>{initials(s)}</div>
              {s.hasAdminLogin && <span className="pill pill-purple" title="Has admin website login">🔑 Admin</span>}
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
              <div className="staff-meta-row">🕐 {s.type}{s.hours ? ` · ${s.hours}h/wk` : ""}</div>
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
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={setF("name")} placeholder="First name" /></div>
              <div className="form-group"><label className="form-label">Role *</label><select className="form-input" value={form.role} onChange={(e) => setForm((p) => ({ ...p, role: e.target.value, area: areaOf(e.target.value) }))}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Area</label><select className="form-input" value={form.area} onChange={setF("area")}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Employment</label><select className="form-input" value={form.type} onChange={setF("type")}>{EMP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={setF("phone")} placeholder="04xx xxx xxx" /></div>
              <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={form.start} onChange={setF("start")} /></div>
              <div className="form-group"><label className="form-label">Certificate</label><select className="form-input" value={form.cert} onChange={setF("cert")}>{CERTS.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="form-group"><label className="form-label">POS PIN (4-digit, optional)</label>
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="form-input" maxLength={4} value={form.pin} onChange={(e) => setForm((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="auto" />
                  <button type="button" className="btn btn-sm" onClick={() => setForm((p) => ({ ...p, pin: genPin(staff) }))}>Auto</button>
                </div>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Venues * (works at)</label><VenuePicker value={form.venueIds} onToggle={(vid) => toggleVenue(vid, form, setForm)} /></div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[["Employment", profile.type], ["Weekly hours", profile.hours ? `${profile.hours}h` : "—"], ["Start date", profile.start || "—"],
                    ["Status", profile.status || "Active"], ["Phone", profile.phone || "—"], ["Certificate", profile.cert || "—"],
                    ["POS PIN", profile.pin || "— (none)"], ["Admin login", profile.hasAdminLogin ? (profile.email || "yes") : "No"]].map(([k, v]) => (
                    <div key={k}><div className="form-label">{k}</div><div style={{ fontSize: 13 }}>{v}</div></div>
                  ))}
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>Training completion {myTraining.length ? `(${myTraining.filter((a) => a.status === "Complete").length}/${myTraining.length})` : ""}</span>
                    <strong>{trainingPct(profile.id, assignments)}%</strong>
                  </div>
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${trainingPct(profile.id, assignments)}%`, background: progressColor(trainingPct(profile.id, assignments)) }} /></div>
                  {staffSeesAll(profile) && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>Manager/admin — can be assigned any module.</div>}
                </div>

                {/* Assigned training */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">Assigned training</span>
                    {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAssign("training")}>+ Assign training</button>}
                  </div>
                  {myTraining.map((a) => (
                    <div key={a.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <span style={{ fontSize: 12 }}>{a.moduleTitle} <span style={{ color: "var(--gray)" }}>· {a.venue}</span></span>
                      <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 11, color: "var(--gray)" }}>{(a.checks || []).filter(Boolean).length}/{a.itemsTotal || (a.checks || []).length}</span>
                        <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status}</span>
                        <button className="btn btn-sm" onClick={() => setOpenAssignId(a.id)}>Open</button>
                        {canEdit && <button className="btn btn-sm btn-danger" title="Remove" onClick={() => removeAssignment(a, "training")}>✕</button>}
                      </span>
                    </div>
                  ))}
                  {myTraining.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No training assigned.</div>}
                </div>

                {/* Assigned checklists */}
                <div style={{ marginTop: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}>
                    <span className="card-title">Assigned checklists</span>
                    {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAssign("checklist")}>+ Assign checklist</button>}
                  </div>
                  {myChecklists.map((a) => (
                    <div key={a.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                      <span style={{ fontSize: 12 }}>{a.checklistTitle} <span className="pill pill-gray" style={{ marginLeft: 4 }}>{a.area}</span> <span style={{ color: "var(--gray)" }}>· {a.venue}</span></span>
                      {canEdit && <button className="btn btn-sm btn-danger" title="Remove" onClick={() => removeAssignment(a, "checklist")}>✕</button>}
                    </div>
                  ))}
                  {myChecklists.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No checklists assigned.</div>}
                </div>

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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={edit.name} onChange={setE("name")} /></div>
                  <div className="form-group"><label className="form-label">Role</label><select className="form-input" value={edit.role} onChange={(e) => setEdit((p) => ({ ...p, role: e.target.value, area: areaOf(e.target.value) }))}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Area</label><select className="form-input" value={edit.area} onChange={setE("area")}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Employment</label><select className="form-input" value={edit.type} onChange={setE("type")}>{EMP_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={edit.phone} onChange={setE("phone")} /></div>
                  <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={edit.start} onChange={setE("start")} /></div>
                  <div className="form-group"><label className="form-label">Certificate</label><select className="form-input" value={edit.cert} onChange={setE("cert")}>{CERTS.map((c) => <option key={c}>{c}</option>)}</select></div>
                  <div className="form-group"><label className="form-label">Status</label><select className="form-input" value={edit.status} onChange={setE("status")}><option>Active</option><option>Inactive</option><option>On leave</option></select></div>
                  <div className="form-group"><label className="form-label">Weekly hours</label><input type="number" min="0" className="form-input" value={edit.hours} onChange={setE("hours")} /></div>
                  <div className="form-group"><label className="form-label">POS PIN</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      <input className="form-input" maxLength={4} value={edit.pin} onChange={(e) => setEdit((p) => ({ ...p, pin: e.target.value.replace(/\D/g, "").slice(0, 4) }))} />
                      <button type="button" className="btn btn-sm" onClick={() => setEdit((p) => ({ ...p, pin: genPin(staff) }))}>Auto</button>
                    </div>
                  </div>
                </div>
                <div className="form-group"><label className="form-label">Venues (works at)</label><VenuePicker value={edit.venueIds} onToggle={(vid) => toggleVenue(vid, edit, setEdit)} /></div>
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
                  {profile.adminUid && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>Login exists ({profile.email}) — manage permissions in User Management.</div>}
                </div>
                <div className="btn-row">
                  <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? "Saving..." : "Save changes"}</button>
                  <button className="btn" onClick={() => setEditing(false)}>Cancel</button>
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
              {staffSeesAll(profile) ? "Manager/admin — all modules across their venues." : `Showing ${profile.area} + universal items for ${(profile.venueNames || []).join(", ")}.`}
            </div>
            {assignKind === "training" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 8 }}>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Due date</label><input type="date" className="form-input" value={assignDue} onChange={(e) => setAssignDue(e.target.value)} /></div>
                <div className="form-group" style={{ margin: 0 }}><label className="form-label">Priority</label><select className="form-input" value={assignPriority} onChange={(e) => setAssignPriority(e.target.value)}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
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
        <AssignmentDetail assignment={openAssignment} groupId={groupId} canTick={canEdit} showToast={showToast} onClose={() => setOpenAssignId(null)} />
      )}
    </>
  );
}
