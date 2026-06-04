import React, { useEffect, useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, groupDoc } from "../../utils/restaurantGroupPaths";
import { SUGGESTED_STATIONS } from "./rgConfig";

const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const AREAS = ["FOH", "BOH"];

export default function SettingsPage() {
  const { groupId, group, venues, stations, roles, can, showToast } = useRG();
  const editable = can("settings", "edit");
  const [tab, setTab] = useState("stations");
  const [venueTab, setVenueTab] = useState(venues[0]?.id || "");
  useEffect(() => { if (!venueTab && venues[0]) setVenueTab(venues[0].id); }, [venues]); // eslint-disable-line

  // ── Stations ──
  const venueStations = useMemo(() => stations.filter((s) => s.venueId === venueTab), [stations, venueTab]);
  const [stForm, setStForm] = useState(null); // {id, name, area}
  const saveStation = async () => {
    if (!stForm.name.trim()) return showToast("Station name required");
    const payload = { name: stForm.name.trim(), area: stForm.area, venueId: venueTab, order: stForm.order ?? venueStations.length };
    try {
      if (stForm.id) await updateDoc(doc(venueCol(groupId, venueTab, "stations"), stForm.id), payload);
      else await setDoc(doc(venueCol(groupId, venueTab, "stations"), slug(stForm.name) || `st-${Date.now()}`), { ...payload, createdAt: serverTimestamp() });
      showToast("Station saved"); setStForm(null);
    } catch { showToast("Could not save station"); }
  };
  const quickAdd = async (name, area) => {
    if (venueStations.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    try { await setDoc(doc(venueCol(groupId, venueTab, "stations"), slug(name)), { name, area, venueId: venueTab, order: venueStations.length, createdAt: serverTimestamp() }); }
    catch { showToast("Could not add"); }
  };
  const removeStation = async (s) => {
    try { await deleteDoc(doc(venueCol(groupId, venueTab, "stations"), s.id)); showToast("Station removed"); }
    catch { showToast("Could not remove"); }
  };

  // ── Roles ──
  const [newRole, setNewRole] = useState("");
  const saveRoles = async (next) => {
    try { await updateDoc(groupDoc(groupId), { roles: next }); }
    catch { showToast("Could not save roles"); }
  };
  const addRole = async () => {
    const r = newRole.trim();
    if (!r) return;
    if (roles.some((x) => x.toLowerCase() === r.toLowerCase())) { setNewRole(""); return; }
    await saveRoles([...roles, r]); setNewRole(""); showToast("Role added");
  };
  const removeRole = async (r) => { await saveRoles(roles.filter((x) => x !== r)); };

  if (!can("settings", "view")) {
    return <div className="card" style={{ color: "var(--gray)", fontSize: 14 }}>You don’t have access to Settings. Ask an admin if you need it.</div>;
  }

  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[["stations", "Stations"], ["roles", "Roles"]].map(([id, l]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {/* STATIONS */}
      {tab === "stations" && (
        <>
          <div className="tabs" style={{ marginBottom: 14 }}>
            {venues.map((v) => (
              <button key={v.id} className={`tab ${venueTab === v.id ? "active" : ""}`} onClick={() => setVenueTab(v.id)}>{v.name}</button>
            ))}
          </div>
          <div className="card">
            <div className="card-head">
              <div><span className="card-title">Stations</span><span className="card-sub">{venues.find((v) => v.id === venueTab)?.name} — staff/checklists/training attach to a station</span></div>
              {editable && <button className="btn btn-sm btn-primary" onClick={() => setStForm({ id: null, name: "", area: "BOH" })}>+ Add station</button>}
            </div>

            {editable && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "var(--gray)", alignSelf: "center" }}>Quick add:</span>
                {AREAS.flatMap((a) => SUGGESTED_STATIONS[a].map((n) => (
                  <button key={a + n} className="btn btn-sm" onClick={() => quickAdd(n, a)} disabled={venueStations.some((s) => s.name.toLowerCase() === n.toLowerCase())}>{n} <span style={{ color: "var(--gray)" }}>· {a}</span></button>
                )))}
              </div>
            )}

            <div className="grid-2">
              {venueStations.map((s) => (
                <div key={s.id} className="leave-card" style={{ marginBottom: 0 }}>
                  <span className={`pill ${s.area === "BOH" ? "pill-amber" : "pill-green"}`}>{s.area}</span>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                  {editable && <><button className="btn btn-sm" onClick={() => setStForm({ id: s.id, name: s.name, area: s.area, order: s.order })}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeStation(s)}>✕</button></>}
                </div>
              ))}
              {venueStations.length === 0 && <div style={{ fontSize: 13, color: "var(--gray)" }}>No stations yet for this venue.</div>}
            </div>
          </div>
        </>
      )}

      {/* ROLES */}
      {tab === "roles" && (
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-head"><div><span className="card-title">Roles</span><span className="card-sub">Used across staff, shifts & permissions</span></div></div>
          {roles.map((r) => (
            <div key={r} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
              <span style={{ fontSize: 13 }}>{r}</span>
              {editable && <button className="btn btn-sm btn-danger" onClick={() => removeRole(r)}>✕</button>}
            </div>
          ))}
          {editable && (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input className="form-input" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="New role (e.g. Waitress)" onKeyDown={(e) => e.key === "Enter" && addRole()} />
              <button className="btn btn-primary" onClick={addRole}>Add</button>
            </div>
          )}
        </div>
      )}

      {/* Station add/edit modal */}
      {stForm && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setStForm(null)}>
          <div className="rg-modal" style={{ maxWidth: 420 }}>
            <div className="modal-head"><span className="modal-title">{stForm.id ? "Edit station" : "New station"}</span><button className="modal-close" onClick={() => setStForm(null)}>✕</button></div>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={stForm.name} onChange={(e) => setStForm((p) => ({ ...p, name: e.target.value }))} placeholder="Grill" /></div>
            <div className="form-group"><label className="form-label">Area</label>
              <select className="form-input" value={stForm.area} onChange={(e) => setStForm((p) => ({ ...p, area: e.target.value }))}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
            </div>
            <div className="btn-row"><button className="btn btn-primary" onClick={saveStation}>Save station</button><button className="btn" onClick={() => setStForm(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}
