import React, { useEffect, useMemo, useState } from "react";
import { addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { fullName, localDateKey } from "./rgUtils";

/* ============================================================================
   Keys — who holds physical keys to which store. Deliberately a simple record
   LIST, not a workflow (no issue/return states, no approvals).
   Data: venues/{venueId}/keys/{id} — rides the venue catch-all rule (member
   read/write), so NO Firestore rules change; the page itself is gated by the
   `keys` permission (admin edit / manager view / staff none).
   Doc shape: { keyLabel, staffId|null, holderName, issuedOn, notes,
   createdAt/updatedAt }. holderName is a denormalised snapshot so the record
   survives staff departures; staffId links back while the person exists.
   ========================================================================== */

const EMPTY = { venueId: "", staffId: "", holderName: "", keyLabel: "", issuedOn: "", notes: "" };

export default function KeysPage() {
  const { groupId, venues, scopedStaff, selectedVenue, can, showToast, noteErr } = useRG();
  const editable = can("keys", "edit");

  // one listener per venue; rows merged per-venue so a single failing venue
  // can't blank the others. Listener failures surface via noteErr (convention).
  const [byVenue, setByVenue] = useState({}); // venueId -> rows[]
  useEffect(() => {
    if (!groupId || !venues.length) return;
    const unsubs = venues.map((v) =>
      onSnapshot(venueCol(groupId, v.id, "keys"), (s) => {
        setByVenue((p) => ({ ...p, [v.id]: s.docs.map((d) => ({ id: d.id, venueId: v.id, ...d.data() })) }));
      }, () => { setByVenue((p) => ({ ...p, [v.id]: [] })); noteErr(`store keys (${v.name})`); })
    );
    return () => unsubs.forEach((u) => u());
  }, [groupId, venues]); // eslint-disable-line react-hooks/exhaustive-deps

  const venueName = (vid) => venues.find((v) => v.id === vid)?.name || "—";
  const rows = useMemo(() => {
    const all = Object.values(byVenue).flat();
    const scoped = selectedVenue === "all" ? all : all.filter((r) => r.venueId === selectedVenue);
    return scoped.sort((a, b) => venueName(a.venueId).localeCompare(venueName(b.venueId)) || (a.keyLabel || "").localeCompare(b.keyLabel || ""));
  }, [byVenue, selectedVenue, venues]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── add / edit form (inline card; editing loads the record into it) ──
  const [form, setForm] = useState(null); // null = closed; {id?} = edit
  const activeStaff = useMemo(() => (scopedStaff || []).filter((s) => s.status !== "Left"), [scopedStaff]);
  const openAdd = () => setForm({ ...EMPTY, venueId: selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || ""), issuedOn: localDateKey(new Date()) });
  const openEdit = (r) => setForm({ id: r.id, prevVenueId: r.venueId, venueId: r.venueId, staffId: r.staffId || "", holderName: r.holderName || "", keyLabel: r.keyLabel || "", issuedOn: r.issuedOn || "", notes: r.notes || "" });
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setStaff = (e) => {
    const staffId = e.target.value;
    const s = activeStaff.find((x) => x.id === staffId);
    setForm((p) => ({ ...p, staffId, holderName: s ? fullName(s) : p.holderName }));
  };

  const save = async () => {
    const keyLabel = (form.keyLabel || "").trim();
    const holderName = (form.holderName || "").trim();
    if (!form.venueId) return showToast("Pick a store");
    if (!keyLabel) return showToast("Enter which key (e.g. Front door)");
    if (!holderName) return showToast("Enter who holds it");
    const rec = {
      keyLabel, holderName,
      staffId: form.staffId || null,
      issuedOn: form.issuedOn || "",
      notes: (form.notes || "").trim(),
      updatedAt: serverTimestamp(),
    };
    try {
      if (form.id && form.prevVenueId === form.venueId) {
        await setDoc(doc(venueCol(groupId, form.venueId, "keys"), form.id), rec, { merge: true });
      } else {
        if (form.id) await deleteDoc(doc(venueCol(groupId, form.prevVenueId, "keys"), form.id)); // moved store
        await addDoc(venueCol(groupId, form.venueId, "keys"), { ...rec, createdAt: serverTimestamp() });
      }
      setForm(null);
      showToast("Key record saved");
    } catch { showToast("Could not save key record"); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Remove "${r.keyLabel}" held by ${r.holderName}?`)) return;
    try { await deleteDoc(doc(venueCol(groupId, r.venueId, "keys"), r.id)); showToast("Key record removed"); }
    catch { showToast("Could not remove key record"); }
  };

  const th = { padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--gray)", borderBottom: "0.5px solid var(--border)" };
  const td = { padding: "8px 12px", fontSize: 12, borderBottom: "0.5px solid var(--gray-light)" };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>
          A record of who holds physical keys to which store. {selectedVenue === "all" ? "All venues shown." : `Showing ${venueName(selectedVenue)} — switch the venue picker for others.`}
        </div>
        {editable && !form && <button className="btn btn-primary btn-sm" onClick={openAdd}>+ Add key record</button>}
      </div>

      {/* add / edit card */}
      {editable && form && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-title">{form.id ? "Edit key record" : "Add key record"}</span></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Store</label>
              <select className="form-input" value={form.venueId} onChange={set("venueId")}>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Key</label>
              <input className="form-input" value={form.keyLabel} onChange={set("keyLabel")} placeholder="e.g. Front door / Master #2" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Held by (staff)</label>
              <select className="form-input" value={form.staffId} onChange={setStaff}>
                <option value="">— not on staff / type below —</option>
                {activeStaff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Holder name</label>
              <input className="form-input" value={form.holderName} onChange={set("holderName")} placeholder="Who physically holds it" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Issued on</label>
              <input className="form-input" type="date" value={form.issuedOn} onChange={set("issuedOn")} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: 11 }}>Notes</label>
              <input className="form-input" value={form.notes} onChange={set("notes")} placeholder="e.g. spare in safe, alarm code holder" />
            </div>
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save}>{form.id ? "Save changes" : "Add record"}</button>
            <button className="btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {/* the list */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ background: "var(--gray-light)" }}>
                <th style={th}>Key</th>
                <th style={th}>Store</th>
                <th style={th}>Held by</th>
                <th style={th}>Issued</th>
                <th style={th}>Notes</th>
                {editable && <th style={{ ...th, textAlign: "right" }}></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.venueId}:${r.id}`}>
                  <td style={{ ...td, fontWeight: 600 }}>{r.keyLabel}</td>
                  <td style={td}>{venueName(r.venueId)}</td>
                  <td style={td}>{r.holderName}{r.staffId && !activeStaff.some((s) => s.id === r.staffId) && <span style={{ color: "var(--red)", fontSize: 10, marginLeft: 6 }}>staff record gone — chase this key</span>}</td>
                  <td style={td}>{r.issuedOn || "—"}</td>
                  <td style={{ ...td, color: "var(--gray)" }}>{r.notes || ""}</td>
                  {editable && (
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button className="btn btn-sm" onClick={() => openEdit(r)}>Edit</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: 6 }} onClick={() => remove(r)}>✕</button>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={editable ? 6 : 5} style={{ padding: 20, color: "var(--gray)", fontSize: 13 }}>
                  No key records yet{editable ? " — add who holds each store key." : "."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
