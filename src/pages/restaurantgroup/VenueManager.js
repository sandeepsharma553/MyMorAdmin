import React, { useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venuesCol, groupCol } from "../../utils/restaurantGroupPaths";

const COLORS = [
  ["Red", "#C0392B"], ["Orange", "#e67e22"], ["Purple", "#8b5cf6"], ["Blue", "#2563eb"],
  ["Green", "#16a34a"], ["Teal", "#0d9488"], ["Pink", "#db2777"], ["Slate", "#475569"],
];
const TYPES = [["FOH", "Front of house venue"], ["CK", "Central / production kitchen"]];
const STATUSES = ["Trading", "Closed", "Renovation"];

const blank = (order) => ({ id: null, name: "", color: "#2563eb", type: "FOH", status: "Trading", order });

export default function VenueManager({ open, onClose }) {
  const { groupId, venues, showToast } = useRG();
  const [editor, setEditor] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const setF = (k) => (e) => setEditor((p) => ({ ...p, [k]: e.target.value }));

  if (!open) return null;

  const save = async () => {
    if (!editor.name.trim()) return showToast("Venue name required");
    const payload = { name: editor.name.trim(), color: editor.color, type: editor.type, status: editor.status, order: Number(editor.order) || 0 };
    try {
      if (editor.id) { await updateDoc(doc(groupCol(groupId, "venues"), editor.id), payload); showToast("Venue updated"); }
      else { await addDoc(venuesCol(groupId), { ...payload, createdAt: serverTimestamp() }); showToast("Venue added"); }
      setEditor(null);
    } catch { showToast("Could not save venue"); }
  };

  const remove = async (id) => {
    try { await deleteDoc(doc(groupCol(groupId, "venues"), id)); showToast("Venue removed"); setConfirmId(null); }
    catch { showToast("Could not remove venue"); }
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
                    <button className="btn btn-sm btn-primary" onClick={() => remove(v.id)}>Remove</button>
                    <button className="btn btn-sm" onClick={() => setConfirmId(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <button className="btn btn-sm" onClick={() => setEditor({ id: v.id, name: v.name, color: v.color || "#2563eb", type: v.type || "FOH", status: v.status || "Trading", order: v.order ?? venues.length })}>Edit</button>
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
              <div className="form-group"><label className="form-label">Sort order</label><input type="number" className="form-input" value={editor.order} onChange={setF("order")} /></div>
            </div>
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
