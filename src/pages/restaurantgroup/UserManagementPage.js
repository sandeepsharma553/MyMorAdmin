import React, { useMemo, useState } from "react";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { staffCol } from "../../utils/restaurantGroupPaths";
import { RG_MODULES, RG_ROLES, DEFAULT_PERMISSIONS, defaultPermsForStaffRole, roleToGroupRole, roleMeta, levelMeta } from "./rgConfig";
import { initials } from "./rgUtils";

const LEVEL_OPTS = [["none", "✕ None"], ["view", "👁 View"], ["edit", "✏ Edit"]];

export default function UserManagementPage() {
  const { groupId, group, staff, venues, can, showToast } = useRG();
  const editable = can("usermgmt", "edit");
  const venueLabel = (s) => (s.venueNames || []).join(", ") || "—";

  const sorted = useMemo(() => {
    const rank = { storeAdmin: 0, manager: 1, staff: 2 };
    return [...staff].sort((a, b) => (rank[a.groupRole || roleToGroupRole(a.role)] ?? 3) - (rank[b.groupRole || roleToGroupRole(b.role)] ?? 3) || (a.displayName || "").localeCompare(b.displayName || ""));
  }, [staff]);

  const [permUser, setPermUser] = useState(null);
  const [permDraft, setPermDraft] = useState({});
  const openPerms = (s) => {
    setPermUser(s);
    setPermDraft({ ...defaultPermsForStaffRole(s.role), ...(s.permissions && !Array.isArray(s.permissions) ? s.permissions : {}) });
  };
  const applyRoleDefaults = () => setPermDraft(defaultPermsForStaffRole(permUser.role));
  const savePerms = async () => {
    try {
      await updateDoc(doc(staffCol(groupId), permUser.id), { permissions: permDraft, updatedAt: serverTimestamp() });
      if (permUser.adminUid) await updateDoc(doc(db, "employees", permUser.adminUid), { permissions: permDraft }); // sync the login
      showToast(permUser.hasAdminLogin ? "Permissions saved & applied to their login" : "Permissions saved (applies when they get a login)");
      setPermUser(null);
    } catch { showToast("Could not save permissions"); }
  };

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
        {/* Users & roles (all staff) */}
        <div className="card">
          <div className="card-head">
            <span className="card-title">Users & permissions</span>
            <span className="card-sub">Add people in Staff Directory</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="data-table">
              <thead><tr><th>User</th><th>Role</th><th>Venues</th><th>Access</th><th style={{ textAlign: "right" }}>Permissions</th></tr></thead>
              <tbody>
                {/* Super Admin / owner */}
                <tr>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div className="staff-avatar" style={{ width: 26, height: 26, fontSize: 10, marginBottom: 0, background: "var(--black)" }}>{initials({ name: group?.ownerName || "Owner" })}</div>
                    <div><div style={{ fontSize: 12, fontWeight: 500 }}>{group?.ownerName || "Super Admin"}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{group?.ownerEmail}</div></div>
                  </div></td>
                  <td><span className="pill" style={{ background: "var(--black)", color: "#fff" }}>Super Admin</span></td>
                  <td style={{ fontSize: 11, color: "var(--gray)" }}>All venues</td>
                  <td><span className="pill pill-green">Website login</span></td>
                  <td style={{ textAlign: "right", fontSize: 11, color: "var(--gray)" }}>Full access</td>
                </tr>
                {sorted.map((s) => {
                  const rm = roleMeta(s.groupRole || roleToGroupRole(s.role));
                  const active = s.status !== "Inactive";
                  return (
                    <tr key={s.id}>
                      <td><div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div className="staff-avatar" style={{ width: 26, height: 26, fontSize: 10, marginBottom: 0, background: "var(--gray)" }}>{initials(s)}</div>
                        <div><div style={{ fontSize: 12, fontWeight: 500 }}>{s.displayName || s.name}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}{s.pin ? ` · PIN ${s.pin}` : ""}</div></div>
                      </div></td>
                      <td><span className="pill" style={{ background: rm.pill, color: rm.text }}>{rm.label}</span></td>
                      <td style={{ fontSize: 11, color: "var(--gray)" }}>{venueLabel(s)}</td>
                      <td>{s.hasAdminLogin ? <span className="pill pill-green" title={s.email}>Website login</span> : <span className="pill pill-gray">PIN only</span>}</td>
                      <td style={{ textAlign: "right" }}>
                        {editable ? <button className="btn btn-sm" onClick={() => openPerms(s)}>Permissions</button> : <span style={{ fontSize: 11, color: "var(--gray)" }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && <tr><td colSpan={5} style={{ color: "var(--gray)" }}>No staff yet — add them in Staff Directory.</td></tr>}
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

      {/* Permissions modal */}
      {permUser && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPermUser(null)}>
          <div className="rg-modal" style={{ maxWidth: 540 }}>
            <div className="modal-head"><span className="modal-title">Permissions — {permUser.displayName || permUser.name}</span><button className="modal-close" onClick={() => setPermUser(null)}>✕</button></div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{permUser.role} · {venueLabel(permUser)} · {permUser.hasAdminLogin ? "has website login" : "PIN only (applies when they log in)"}</span>
              <button className="btn btn-sm" onClick={applyRoleDefaults}>Reset to role default</button>
            </div>
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
