import React, { useState } from "react";
import { addDoc, updateDoc, doc, serverTimestamp, writeBatch, getDocs, collection, deleteField } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { venuesCol, groupCol } from "../../utils/restaurantGroupPaths";
import { AU_STATES } from "./publicHolidays";

const VENUE_SUBCOLLECTIONS = ["shifts", "leaveRequests", "checklists", "checklistAssignments",
  "trainingModules", "trainingAssignments", "stations", "equipment", "kpis", "performanceNotes", "prepList", "tempLogs"];

const COLORS = [
  ["Red", "#C0392B"], ["Orange", "#e67e22"], ["Purple", "#8b5cf6"], ["Blue", "#2563eb"],
  ["Green", "#16a34a"], ["Teal", "#0d9488"], ["Pink", "#db2777"], ["Slate", "#475569"],
];
const TYPES = [["FOH", "Front of house venue"], ["CK", "Central / production kitchen"]];
const STATUSES = ["Trading", "Closed", "Renovation"];

// Trading hours — SAME day keys and per-day shape as the super-admin console
// (RestaurantGroupsPage.blankHours), so both editors read/write the identical
// hours{mon..sun{open,close,closed}} field on the venue doc.
const HOURS_DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];
const blankHours = () =>
  HOURS_DAYS.reduce((acc, [k]) => ({ ...acc, [k]: { open: "09:00", close: "17:00", closed: false } }), {});

const blank = (order) => ({ id: null, name: "", color: "#2563eb", type: "FOH", status: "Trading", state: "VIC", order, hours: blankHours() });

export default function VenueManager({ open, onClose }) {
  const { groupId, venues, staff, can, showToast, me } = useRG();
  const isOwner = me?.groupRole === "owner"; // hours editing is OWNER-only (tighter than the modal's settings:edit gate)
  const [editor, setEditor] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [busy, setBusy] = useState(false);
  const setF = (k) => (e) => setEditor((p) => ({ ...p, [k]: e.target.value }));
  const setHours = (day, k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setEditor((p) => ({ ...p, hours: { ...p.hours, [day]: { ...p.hours[day], [k]: val } } }));
  };

  if (!open) return null;
  if (!can("settings", "edit")) {
    return (
      <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div className="rg-modal" style={{ maxWidth: 420 }}>
          <div className="modal-head"><span className="modal-title">Manage venues</span><button className="modal-close" onClick={onClose}>✕</button></div>
          <div style={{ fontSize: 13, color: "var(--gray)" }}>You don’t have access to manage venues.</div>
        </div>
      </div>
    );
  }

  const save = async () => {
    if (!editor.name.trim()) return showToast("Venue name required");
    // hours goes in the payload ONLY for the owner: updateDoc writes named keys only, so a
    // storeAdmin save omits hours entirely and the stored value (e.g. super-admin-set) survives.
    const payload = { name: editor.name.trim(), color: editor.color, type: editor.type, status: editor.status, state: editor.state, order: Number(editor.order) || 0, ...(isOwner ? { hours: editor.hours } : {}) };
    try {
      if (editor.id) { await updateDoc(doc(groupCol(groupId, "venues"), editor.id), payload); showToast("Venue updated"); }
      else { await addDoc(venuesCol(groupId), { ...payload, createdAt: serverTimestamp() }); showToast("Venue added"); }
      setEditor(null);
    } catch { showToast("Could not save venue"); }
  };

  // Cascade delete: remove the venue doc, all its per-venue subcollections, and strip the
  // venueId from any staff who reference it. Batched (watch the 500-write cap for huge venues).
  const remove = async (id) => {
    setBusy(true);
    try {
      const batch = writeBatch(db);
      for (const col of VENUE_SUBCOLLECTIONS) {
        const snap = await getDocs(collection(db, "restaurantGroups", groupId, "venues", id, col));
        snap.docs.forEach((d) => batch.delete(d.ref));
      }
      staff.forEach((s) => {
        const inArray = Array.isArray(s.venueIds) && s.venueIds.includes(id);
        if (inArray || s.venueId === id) {
          batch.update(doc(groupCol(groupId, "staff"), s.id), {
            venueIds: (s.venueIds || []).filter((vid) => vid !== id),
            venueNames: (s.venueNames || []).filter((_, i) => (s.venueIds || [])[i] !== id),
            ...(s.venueId === id ? { venueId: deleteField() } : {}),
          });
        }
      });
      batch.delete(doc(groupCol(groupId, "venues"), id));
      await batch.commit();
      showToast("Venue removed");
      setConfirmId(null);
    } catch { showToast("Could not remove venue — it may have too much data to delete at once"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rg-modal" style={{ maxWidth: 560 }}>
        <div className="modal-head">
          <span className="modal-title">Manage venues</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {!editor && (
          <>
            {venues.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>
                No venues yet. Add your venues (e.g. Mad Benji, Hey Sister, Mad Hot Pot, Main Kitchen) so they appear across every page.
              </div>
            )}
            {venues.map((v) => (
              <div key={v.id} className="leave-card" style={{ marginBottom: 8 }}>
                <span className="nav-dot" style={{ background: v.color, width: 12, height: 12 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{v.name} {v.type === "CK" && <span className="pill pill-gray" style={{ marginLeft: 4 }}>CK</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--gray)" }}>{v.status || "Trading"}</div>
                </div>
                {confirmId === v.id ? (
                  <>
                    <span style={{ fontSize: 10, color: "var(--red)" }}>Deletes all its shifts, leave, checklists, training…</span>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(v.id)} disabled={busy}>{busy ? "Removing…" : "Delete venue"}</button>
                    <button className="btn btn-sm" onClick={() => setConfirmId(null)} disabled={busy}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => setEditor({ id: v.id, name: v.name, color: v.color || "#2563eb", type: v.type || "FOH", status: v.status || "Trading", state: v.state || "VIC", order: v.order ?? venues.length, hours: { ...blankHours(), ...(v.hours || {}) } })}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => setConfirmId(v.id)}>✕</button>
                  </>
                )}
              </div>
            ))}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={() => setEditor(blank(venues.length))}>+ Add venue</button>
              <button className="btn" onClick={onClose}>Done</button>
            </div>
          </>
        )}

        {editor && (
          <>
            <div className="form-group"><label className="form-label">Venue name</label><input className="form-input" value={editor.name} onChange={setF("name")} placeholder="Mad Benji" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Colour</label>
                <select className="form-input" value={editor.color} onChange={setF("color")}>{COLORS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-input" value={editor.type} onChange={setF("type")}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Status</label>
                <select className="form-input" value={editor.status} onChange={setF("status")}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">State (public holidays)</label>
                <select className="form-input" value={editor.state} onChange={setF("state")}>{AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Sort order</label><input type="number" className="form-input" value={editor.order} onChange={setF("order")} /></div>
            </div>
            {/* Trading hours — OWNER only. Markup mirrors the super-admin VenueFields hours
                section so both editors present/write the same hours shape. storeAdmins can
                edit the other fields; hours stays out of their view AND their save payload. */}
            {isOwner && (
              <div className="form-group">
                <label className="form-label">Trading hours</label>
                <div className="mt-1 rounded-lg border border-gray-200 divide-y">
                  {HOURS_DAYS.map(([k, lbl]) => (
                    <div key={k} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                      <span className="w-24 text-gray-700">{lbl}</span>
                      <label className="flex items-center gap-1 text-xs text-gray-500">
                        <input type="checkbox" checked={editor.hours[k].closed} onChange={setHours(k, "closed")} /> Closed
                      </label>
                      {!editor.hours[k].closed && (
                        <>
                          <input type="time" className="rounded border border-gray-200 px-2 py-1 text-sm" value={editor.hours[k].open} onChange={setHours(k, "open")} />
                          <span className="text-gray-400">–</span>
                          <input type="time" className="rounded border border-gray-200 px-2 py-1 text-sm" value={editor.hours[k].close} onChange={setHours(k, "close")} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="btn-row">
              <button className="btn btn-primary" onClick={save}>{editor.id ? "Save venue" : "Add venue"}</button>
              <button className="btn" onClick={() => setEditor(null)}>Back</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
