import React, { useEffect, useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { useRG } from "./RGContext";

/**
 * Carryover prep list (per venue). Unlike checklists, prep items are NOT reset
 * daily — they carry over until someone removes them. Ticking marks an item
 * "done for now"; "Reset ticks" un-ticks everything for the next service.
 *
 * Items can be assigned to a specific person (assignedTo/assignedName). The
 * assignee's own items are highlighted in their view.
 */
export default function PrepListPanel({ groupId, venueId, venueLabel, canEdit, staffList = [], myStaffId, showToast }) {
  const { noteErr } = useRG(); // failure-banner recorder — everything else stays prop-driven
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(true);
  const [text, setText] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [editId, setEditId] = useState(null);
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    if (!groupId || !venueId) { setItems([]); return; }
    return onSnapshot(venueCol(groupId, venueId, "prepList"), (s) => {
      const list = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.done === b.done ? (a.order ?? 0) - (b.order ?? 0) : a.done ? 1 : -1));
      setItems(list);
    }, () => { setItems([]); noteErr("prep list"); });
  }, [groupId, venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  const col = () => venueCol(groupId, venueId, "prepList");
  const doneCount = useMemo(() => items.filter((i) => i.done).length, [items]);
  const nameFor = (id) => staffList.find((s) => s.id === id)?.name || "";

  const add = async () => {
    if (!text.trim()) return;
    try {
      await addDoc(col(), {
        text: text.trim(), qty: qty.trim(), note: note.trim(), done: false, order: items.length,
        assignedTo: assignee || "", assignedName: assignee ? nameFor(assignee) : "", createdAt: serverTimestamp(),
      });
      setText(""); setQty(""); setNote(""); setAssignee("");
    } catch { showToast?.("Could not add"); }
  };
  const toggle = async (it) => { try { await updateDoc(doc(col(), it.id), { done: !it.done }); } catch { /* */ } };
  const remove = async (it) => { try { await deleteDoc(doc(col(), it.id)); } catch { /* */ } };
  const resetTicks = async () => { for (const it of items.filter((i) => i.done)) { try { await updateDoc(doc(col(), it.id), { done: false }); } catch { /* */ } } };
  const saveNote = async (it) => { try { await updateDoc(doc(col(), it.id), { note: editNote.trim() }); setEditId(null); } catch { /* */ } };
  const reassign = async (it, sid) => { try { await updateDoc(doc(col(), it.id), { assignedTo: sid || "", assignedName: sid ? nameFor(sid) : "" }); } catch { /* */ } };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-head">
        <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setOpen((o) => !o)}>
          <span className="card-title">🥬 Prep list{venueLabel ? ` — ${venueLabel}` : ""} <span style={{ color: "var(--gray)", fontWeight: 400 }}>({items.length - doneCount} to do)</span></span>
          <span className="card-sub">end-of-shift carryover — not reset daily</span>
        </div>
        {canEdit && doneCount > 0 && <button className="btn btn-sm" onClick={resetTicks}>Reset ticks</button>}
      </div>

      {open && (
        <>
          {items.map((it) => {
            const mine = myStaffId && it.assignedTo === myStaffId;
            return (
              <div key={it.id} className="checklist-item" style={{ alignItems: "flex-start", background: mine ? "rgba(192,57,43,0.06)" : undefined, borderRadius: mine ? 8 : undefined, padding: mine ? "4px 6px" : undefined }}>
                <div className={`check-box ${it.done ? "checked" : ""}`} style={{ cursor: canEdit ? "pointer" : "default", opacity: canEdit ? 1 : 0.6, marginTop: 2 }} onClick={() => canEdit && toggle(it)} />
                <div style={{ flex: 1 }}>
                  <span className={`check-text ${it.done ? "done" : ""}`}>{it.text}{it.qty ? <strong style={{ marginLeft: 6 }}>× {it.qty}</strong> : null}</span>
                  {it.assignedName ? <span className={`pill ${mine ? "pill-red" : "pill-gray"}`} style={{ marginLeft: 6 }}>{mine ? "You" : it.assignedName}</span> : null}
                  {editId === it.id ? (
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <input className="form-input" value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Note" onKeyDown={(e) => e.key === "Enter" && saveNote(it)} />
                      <button className="btn btn-sm btn-primary" onClick={() => saveNote(it)}>Save</button>
                      <button className="btn btn-sm" onClick={() => setEditId(null)}>✕</button>
                    </div>
                  ) : it.note ? (
                    <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>📝 {it.note}</div>
                  ) : null}
                </div>
                {canEdit && staffList.length > 0 && (
                  <select className="form-input" style={{ width: 120, fontSize: 11 }} value={it.assignedTo || ""} onChange={(e) => reassign(it, e.target.value)} title="Assign to">
                    <option value="">Unassigned</option>
                    {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                {canEdit && editId !== it.id && <button className="btn btn-sm" onClick={() => { setEditId(it.id); setEditNote(it.note || ""); }}>Note</button>}
                {canEdit && <button className="btn btn-sm btn-danger" onClick={() => remove(it)}>✕</button>}
              </div>
            );
          })}
          {items.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: "6px 0" }}>No prep items yet.</div>}

          {canEdit && (
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
              <input className="form-input" style={{ flex: 2, minWidth: 160 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Prep item (e.g. Cut beef slices)" onKeyDown={(e) => e.key === "Enter" && add()} />
              <input className="form-input" style={{ width: 80 }} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" />
              <input className="form-input" style={{ flex: 1, minWidth: 110 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" onKeyDown={(e) => e.key === "Enter" && add()} />
              <select className="form-input" style={{ width: 130 }} value={assignee} onChange={(e) => setAssignee(e.target.value)} title="Assign to (optional)">
                <option value="">Assign to…</option>
                {staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn btn-primary" onClick={add}>Add</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
