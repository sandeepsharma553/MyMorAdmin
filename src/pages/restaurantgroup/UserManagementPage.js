import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where, doc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { db, firebaseConfig } from "../../firebase";
import { useRG } from "./RGContext";
import { RG_MODULES, RG_ROLES, DEFAULT_PERMISSIONS, defaultPermsForRole, roleMeta, levelMeta } from "./rgConfig";
import { initials } from "./rgUtils";

const isEmailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
const LEVEL_OPTS = [["none", "✕ None"], ["view", "👁 View"], ["edit", "✏ Edit"]];

export default function UserManagementPage() {
  const { groupId, group, venues, can, showToast } = useRG();
  const editable = can("usermgmt", "edit");

  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (!groupId) return;
    const qy = query(collection(db, "employees"), where("groupId", "==", groupId));
    return onSnapshot(qy, (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setUsers([]));
  }, [groupId]);

  const venueLabel = (vId) => vId === "all" ? "All venues" : (venues.find((v) => v.id === vId)?.name || "—");

  // ── Add user ──
  const blank = () => ({ name: "", email: "", password: "", role: "staff", venueId: venues[0]?.id || "all" });
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const addUser = async () => {
    if (!form.name.trim()) return showToast("Name required");
    const email = form.email.toLowerCase().trim();
    if (!isEmailValid(email)) return showToast("Valid email required");
    const password = form.password.trim() || `${email.split("@")[0]}654321`;
    setSaving(true);
    let tempApp = null;
    try {
      tempApp = initializeApp(firebaseConfig, `userCreator_${Date.now()}`);
      const cred = await createUserWithEmailAndPassword(getAuth(tempApp), email, password);
      const uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: form.name.trim() });
      const venueId = form.role === "owner" ? "all" : form.venueId;
      await setDoc(doc(db, "employees", uid), {
        uid, name: form.name.trim(), email, type: "admin",
        role: form.role === "owner" ? "groupOwner" : "groupStaff", groupRole: form.role,
        empType: "restaurantGroup", groupId, groupName: group?.name || "",
        venueId, permissions: defaultPermsForRole(form.role),
        isActive: true, status: "Active", password, createdAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", uid), {
        uid, firstname: form.name.trim(), email, groupId, groupRole: form.role,
        roles: { groupStaff: true }, password, createddate: new Date(),
      });
      showToast(`${form.name} added — they can now log in with their own email`);
      setAddOpen(false); setForm(blank());
    } catch (e) {
      showToast(e?.code === "auth/email-already-in-use" ? "That email already has an account" : "Could not create user");
    } finally {
      setSaving(false);
      if (tempApp) { try { await deleteApp(tempApp); } catch {} }
    }
  };

  // ── Permissions editor ──
  const [permUser, setPermUser] = useState(null);
  const [permDraft, setPermDraft] = useState({});
  const [permRole, setPermRole] = useState("staff");
  const [permVenue, setPermVenue] = useState("all");
  const openPerms = (u) => {
    setPermUser(u);
    setPermRole(u.groupRole || "staff");
    setPermVenue(u.venueId || "all");
    setPermDraft({ ...defaultPermsForRole(u.groupRole), ...(u.permissions && !Array.isArray(u.permissions) ? u.permissions : {}) });
  };
  const applyRoleDefaults = (role) => { setPermRole(role); setPermDraft(defaultPermsForRole(role)); };
  const savePerms = async () => {
    try {
      await updateDoc(doc(db, "employees", permUser.id), {
        groupRole: permRole, venueId: permRole === "owner" ? "all" : permVenue,
        permissions: permDraft, updatedAt: serverTimestamp(),
      });
      showToast("Permissions updated");
      setPermUser(null);
    } catch { showToast("Could not save permissions"); }
  };
  const toggleStatus = async (u) => {
    try { await updateDoc(doc(db, "employees", u.id), { isActive: !(u.isActive ?? true), status: (u.isActive ?? true) ? "Suspended" : "Active" }); }
    catch { showToast("Could not update status"); }
  };

  const sorted = useMemo(() => {
    const rank = { owner: 0, storeAdmin: 1, manager: 2, staff: 3 };
    return [...users].sort((a, b) => (rank[a.groupRole] ?? 4) - (rank[b.groupRole] ?? 4));
  }, [users]);

  return (
    <>
      {/* Role hierarchy banner */}
      <div style={{ display: "flex", marginBottom: 18, borderRadius: 12, overflow: "hidden", border: "0.5px solid var(--border)" }}>
        {RG_ROLES.map((r, i) => (
          <React.Fragment key={r.key}>
            {i > 0 && <div style={{ width: 1, background: "var(--border)" }} />}
            <div style={{ flex: 1, padding: "14px 18px", background: r.pill, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: r.text }}>{r.label}</div>
              <div style={{ fontSize: 10, color: r.text, opacity: 0.75, marginTop: 2 }}>{r.desc}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div className="grid-2">
        {/* Users list */}
        <div className="card">
          <div className="card-head">
            <span className="card-title">Users & roles</span>
            {editable && <button className="btn btn-sm btn-primary" onClick={() => { setForm(blank()); setAddOpen(true); }}>+ Add user</button>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>User</th><th>Role</th><th>Venue</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
              <tbody>
                {sorted.map((u) => {
                  const rm = roleMeta(u.groupRole);
                  const active = u.isActive ?? true;
                  return (
                    <tr key={u.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div className="staff-avatar" style={{ width: 26, height: 26, fontSize: 10, marginBottom: 0, background: "var(--gray)" }}>{initials({ name: u.name })}</div>
                          <div><div style={{ fontSize: 12, fontWeight: 500 }}>{u.name}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{u.email}</div></div>
                        </div>
                      </td>
                      <td><span className="pill" style={{ background: rm.pill, color: rm.text }}>{rm.label}</span></td>
                      <td style={{ fontSize: 11, color: "var(--gray)" }}>{venueLabel(u.venueId)}</td>
                      <td><span className={`pill ${active ? "pill-green" : "pill-gray"}`}>{active ? "Active" : "Suspended"}</span></td>
                      <td style={{ textAlign: "right" }}>
                        {u.groupRole === "owner" ? (
                          <span style={{ fontSize: 11, color: "var(--gray)" }}>Super Admin</span>
                        ) : editable ? (
                          <div style={{ display: "inline-flex", gap: 6 }}>
                            <button className="btn btn-sm" onClick={() => openPerms(u)}>Permissions</button>
                            <button className="btn btn-sm" onClick={() => toggleStatus(u)}>{active ? "Suspend" : "Activate"}</button>
                          </div>
                        ) : <span style={{ fontSize: 11, color: "var(--gray)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && <tr><td colSpan={5} style={{ color: "var(--gray)" }}>No users yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Default matrix reference */}
        <div className="card">
          <div className="card-head"><span className="card-title">Page permissions matrix</span><span className="card-sub">Default by role</span></div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 4px", color: "var(--gray)", borderBottom: "0.5px solid var(--gray-light)" }}>Page</th>
                  {RG_ROLES.map((r) => <th key={r.key} style={{ padding: "6px 4px", color: "var(--gray)", borderBottom: "0.5px solid var(--gray-light)", textAlign: "center" }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {RG_MODULES.map((m) => (
                  <tr key={m.key}>
                    <td style={{ padding: "5px 4px", borderBottom: "0.5px solid var(--gray-light)", fontWeight: 500 }}>{m.label}</td>
                    {RG_ROLES.map((r) => {
                      const lm = levelMeta(DEFAULT_PERMISSIONS[r.key]?.[m.key] || "none");
                      return <td key={r.key} style={{ textAlign: "center", borderBottom: "0.5px solid var(--gray-light)" }}><span style={{ color: lm.color }}>{lm.label}</span></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add user modal */}
      {addOpen && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="rg-modal">
            <div className="modal-head"><span className="modal-title">Add user</span><button className="modal-close" onClick={() => setAddOpen(false)}>✕</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Full name *</label><input className="form-input" value={form.name} onChange={setF("name")} /></div>
              <div className="form-group"><label className="form-label">Email *</label><input className="form-input" value={form.email} onChange={setF("email")} placeholder="name@venue.com.au" /></div>
              <div className="form-group"><label className="form-label">Password</label><input className="form-input" value={form.password} onChange={setF("password")} placeholder="auto-generated if blank" /></div>
              <div className="form-group"><label className="form-label">Role</label>
                <select className="form-input" value={form.role} onChange={setF("role")}>{RG_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
              </div>
              {form.role !== "owner" && (
                <div className="form-group"><label className="form-label">Venue</label>
                  <select className="form-input" value={form.venueId} onChange={setF("venueId")}>
                    <option value="all">All venues</option>
                    {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--gray)" }}>{roleMeta(form.role).desc} Permissions can be fine-tuned after creating.</div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={addUser} disabled={saving}>{saving ? "Creating..." : "Create user"}</button>
              <button className="btn" onClick={() => setAddOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions modal */}
      {permUser && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPermUser(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">Permissions — {permUser.name}</span><button className="modal-close" onClick={() => setPermUser(null)}>✕</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Role preset</label>
                <select className="form-input" value={permRole} onChange={(e) => applyRoleDefaults(e.target.value)}>{RG_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Venue scope</label>
                <select className="form-input" value={permVenue} onChange={(e) => setPermVenue(e.target.value)} disabled={permRole === "owner"}>
                  <option value="all">All venues</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>Per-page access — override the role defaults as needed.</div>
            {RG_MODULES.map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <span style={{ fontSize: 12, fontWeight: 500 }}>{m.label}</span>
                <select className="form-input" style={{ width: 130 }} value={permDraft[m.key] || "none"} onChange={(e) => setPermDraft((p) => ({ ...p, [m.key]: e.target.value }))}>
                  {LEVEL_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            ))}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={savePerms}>Save permissions</button>
              <button className="btn" onClick={() => setPermUser(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
