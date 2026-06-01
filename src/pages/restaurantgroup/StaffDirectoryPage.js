import React, { useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, venueColor } from "../../utils/restaurantGroupPaths";
import {
  fullName, initials, avatarColor, isManager, isFOH, isBOH,
  certPill, progressColor,
} from "./rgUtils";

const ROLES = ["FOH — Bar", "FOH — Floor", "FOH — Barista", "BOH — Kitchen", "BOH — Washing", "BOH — Fryer", "Store Manager", "Central Kitchen"];
const EMP_TYPES = ["Casual", "Part-time", "Full-time"];
const CERTS = ["Not yet obtained", "Food Handler", "Food Safety Supervisor", "RSA"];
const DAY_IDX = (new Date().getDay() + 6) % 7;

const blankStaff = () => ({ first: "", last: "", role: ROLES[0], venueId: "", phone: "", email: "", start: "", type: "Casual", cert: "Not yet obtained" });

export default function StaffDirectoryPage() {
  const { groupId, staff, venues, shifts, leave, assignments, selectedVenue, showToast, can } = useRG();
  const canEdit = can("staff", "edit");
  const [roleFilter, setRoleFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(blankStaff());
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [saving, setSaving] = useState(false);

  const openProfile = (s) => { setProfile(s); setEditing(false); setConfirmDel(false); };
  const startEdit = () => {
    setEdit({
      role: profile.role, venueId: profile.venueId || "", type: profile.type, phone: profile.phone || "",
      email: profile.email || "", start: profile.start || "", cert: profile.cert || "Not yet obtained",
      training: profile.training || 0, hours: profile.hours || 0, status: profile.status || "Active",
    });
    setEditing(true);
  };
  const setE = (k) => (e) => setEdit((p) => ({ ...p, [k]: e.target.value }));
  const saveEdit = async () => {
    setSaving(true);
    try {
      // venue is fixed to the staff member's venue subcollection (locked in edit)
      const patch = {
        role: edit.role, type: edit.type,
        phone: edit.phone.trim(), email: edit.email.trim(), start: edit.start, cert: edit.cert,
        training: Math.max(0, Math.min(100, Number(edit.training) || 0)), hours: Number(edit.hours) || 0,
        status: edit.status, updatedAt: serverTimestamp(),
      };
      await updateDoc(doc(venueCol(groupId, profile.venueId, "staff"), profile.id), patch);
      showToast("Staff profile updated");
      setProfile((p) => ({ ...p, ...patch }));
      setEditing(false);
    } catch { showToast("Could not save"); }
    finally { setSaving(false); }
  };
  const removeStaff = async () => {
    try { await deleteDoc(doc(venueCol(groupId, profile.venueId, "staff"), profile.id)); showToast(`${fullName(profile)} removed`); setProfile(null); }
    catch { showToast("Could not remove"); }
  };

  const venueScoped = useMemo(
    () => staff.filter((s) => selectedVenue === "all" || s.venueId === selectedVenue),
    [staff, selectedVenue]
  );

  const filtered = useMemo(() => {
    let list = venueScoped;
    if (roleFilter === "manager") list = list.filter(isManager);
    else if (roleFilter === "foh") list = list.filter(isFOH);
    else if (roleFilter === "boh") list = list.filter(isBOH);
    const t = search.trim().toLowerCase();
    if (t) list = list.filter((s) => `${fullName(s)} ${s.role} ${s.venue} ${s.email}`.toLowerCase().includes(t));
    return list;
  }, [venueScoped, roleFilter, search]);

  const onShiftToday = useMemo(() => {
    const ids = new Set(shifts.filter((sh) => sh.day === DAY_IDX).map((sh) => sh.staffId));
    return venueScoped.filter((s) => ids.has(s.id)).length;
  }, [shifts, venueScoped]);

  const pendingLeave = leave.filter((l) => l.status === "Pending").length;
  const trainingIncomplete = assignments.filter((a) => a.status !== "Complete").length;

  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const saveStaff = async () => {
    if (!form.first.trim() || !form.last.trim()) return showToast("First and last name required");
    const venue = venues.find((v) => v.id === form.venueId);
    if (!venue) return showToast("Select a venue for this staff member");
    setSaving(true);
    try {
      await addDoc(venueCol(groupId, venue.id, "staff"), {
        first: form.first.trim(), last: form.last.trim(),
        name: `${form.first.trim()} ${form.last.trim()}`,
        role: form.role, venueId: venue?.id || "", venue: venue?.name || "",
        phone: form.phone.trim(), email: form.email.trim(), start: form.start,
        type: form.type, cert: form.cert, training: 0, hours: 0, status: "Active",
        createdAt: serverTimestamp(),
      });
      showToast(`${form.first} added to ${venue?.name || "the team"} — welcome aboard`);
      setAddOpen(false);
      setForm(blankStaff());
    } catch (e) {
      showToast("Could not add staff");
    } finally {
      setSaving(false);
    }
  };

  const Metric = ({ label, value, change, down, bar }) => (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className={`metric-change ${down ? "down" : ""}`} style={!down && !change?.startsWith?.("↑") ? { color: "var(--gray)" } : undefined}>{change}</div>
      <div className="metric-bar" style={{ background: bar }} />
    </div>
  );

  const FilterBtn = ({ id, children }) => (
    <button
      className="btn btn-sm"
      onClick={() => setRoleFilter(id)}
      style={roleFilter === id ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}
    >
      {children}
    </button>
  );

  return (
    <>
      {/* Metrics */}
      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Metric label="Total staff" value={venueScoped.length} change={`${venues.length} venues`} bar="var(--red)" />
        <Metric label="On shift today" value={onShiftToday} change="Today's roster" bar="var(--green)" />
        <Metric label="Leave pending" value={pendingLeave} change="Needs approval" down bar="var(--amber)" />
        <Metric label="Training incomplete" value={trainingIncomplete} change="modules outstanding" down bar="var(--blue)" />
      </div>

      {/* Action + filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <FilterBtn id="all">All</FilterBtn>
        <FilterBtn id="manager">Managers</FilterBtn>
        <FilterBtn id="foh">FOH</FilterBtn>
        <FilterBtn id="boh">BOH</FilterBtn>
        <input
          className="form-input"
          style={{ width: 200, marginLeft: "auto" }}
          placeholder="🔍 Search staff..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {canEdit && <button className="btn btn-sm btn-primary" onClick={() => setAddOpen(true)}>+ Add Staff</button>}
      </div>

      {/* Staff grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
        {filtered.map((s) => (
          <div key={s.id} className="staff-card" onClick={() => openProfile(s)}>
            <div className="staff-avatar" style={{ background: avatarColor(s) }}>{initials(s)}</div>
            <div className="staff-name">{fullName(s)}</div>
            <div className="staff-role">{s.role}</div>
            <div className="staff-meta">
              <div className="staff-meta-row">
                <span className="nav-dot" style={{ background: venueColor(s.venue) }} />{s.venue}
              </div>
              <div className="staff-meta-row">🕐 {s.type}{s.hours ? ` · ${s.hours}h/wk` : ""}</div>
              <div className="staff-meta-row"><span className={`pill ${certPill(s.cert)}`}>{s.cert}</span></div>
            </div>
            <div style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--gray)", marginBottom: 3 }}>
                <span>Training</span><span>{s.training || 0}%</span>
              </div>
              <div className="progress-wrap">
                <div className="progress-bar" style={{ width: `${s.training || 0}%`, background: progressColor(s.training || 0) }} />
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: "var(--gray)", fontSize: 13, padding: 20 }}>No staff match this filter.</div>
        )}
      </div>

      {/* Add staff modal */}
      {addOpen && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="rg-modal">
            <div className="modal-head">
              <span className="modal-title">Add staff member</span>
              <button className="modal-close" onClick={() => setAddOpen(false)}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">First name *</label><input className="form-input" value={form.first} onChange={setF("first")} placeholder="First name" /></div>
              <div className="form-group"><label className="form-label">Last name *</label><input className="form-input" value={form.last} onChange={setF("last")} placeholder="Last name" /></div>
              <div className="form-group"><label className="form-label">Role *</label>
                <select className="form-input" value={form.role} onChange={setF("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Venue *</label>
                <select className="form-input" value={form.venueId} onChange={setF("venueId")}>
                  <option value="">Select venue...</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={setF("phone")} placeholder="04xx xxx xxx" /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={form.email} onChange={setF("email")} placeholder="email@example.com" /></div>
              <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={form.start} onChange={setF("start")} /></div>
              <div className="form-group"><label className="form-label">Employment type</label>
                <select className="form-input" value={form.type} onChange={setF("type")}>{EMP_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Food handler certificate</label>
              <select className="form-input" value={form.cert} onChange={setF("cert")}>{CERTS.map((c) => <option key={c}>{c}</option>)}</select>
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
          <div className="rg-modal">
            <div className="modal-head">
              <span className="modal-title">Staff profile</span>
              <button className="modal-close" onClick={() => setProfile(null)}>✕</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div className="staff-avatar" style={{ background: avatarColor(profile), marginBottom: 0, width: 56, height: 56, fontSize: 18 }}>{initials(profile)}</div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 600 }}>{fullName(profile)}</div>
                <div style={{ fontSize: 12, color: "var(--gray)" }}>{profile.role} · {profile.venue}</div>
              </div>
            </div>
            {!editing ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    ["Employment", profile.type],
                    ["Weekly hours", profile.hours ? `${profile.hours}h` : "—"],
                    ["Start date", profile.start || "—"],
                    ["Status", profile.status || "Active"],
                    ["Phone", profile.phone || "—"],
                    ["Email", profile.email || "—"],
                    ["Certificate", profile.cert || "—"],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <div className="form-label">{k}</div>
                      <div style={{ fontSize: 13 }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                    <span>Training completion</span><strong>{profile.training || 0}%</strong>
                  </div>
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${profile.training || 0}%`, background: progressColor(profile.training || 0) }} /></div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div className="card-title" style={{ marginBottom: 8 }}>Assigned training</div>
                  {assignments.filter((a) => a.staffId === profile.id).map((a) => (
                    <div key={a.id} className="staff-meta-row" style={{ justifyContent: "space-between" }}>
                      <span>{a.moduleTitle}</span><span className="pill pill-gray">{a.status}</span>
                    </div>
                  ))}
                  {assignments.filter((a) => a.staffId === profile.id).length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--gray)" }}>No modules currently assigned.</div>
                  )}
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
                  <div className="form-group"><label className="form-label">Role</label>
                    <select className="form-input" value={edit.role} onChange={setE("role")}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">Venue</label>
                    <select className="form-input" value={edit.venueId} onChange={setE("venueId")} disabled title="Venue can't be changed after creation">{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">Employment type</label>
                    <select className="form-input" value={edit.type} onChange={setE("type")}>{EMP_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">Status</label>
                    <select className="form-input" value={edit.status} onChange={setE("status")}><option>Active</option><option>Inactive</option><option>On leave</option></select>
                  </div>
                  <div className="form-group"><label className="form-label">Phone</label><input className="form-input" value={edit.phone} onChange={setE("phone")} /></div>
                  <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={edit.email} onChange={setE("email")} /></div>
                  <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={edit.start} onChange={setE("start")} /></div>
                  <div className="form-group"><label className="form-label">Certificate</label>
                    <select className="form-input" value={edit.cert} onChange={setE("cert")}>{CERTS.map((c) => <option key={c}>{c}</option>)}</select>
                  </div>
                  <div className="form-group"><label className="form-label">Training %</label><input type="number" min="0" max="100" className="form-input" value={edit.training} onChange={setE("training")} /></div>
                  <div className="form-group"><label className="form-label">Weekly hours</label><input type="number" min="0" className="form-input" value={edit.hours} onChange={setE("hours")} /></div>
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
    </>
  );
}
