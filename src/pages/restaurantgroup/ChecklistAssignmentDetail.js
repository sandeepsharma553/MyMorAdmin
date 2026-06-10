import React, { useState } from "react";
import { updateDoc, doc } from "firebase/firestore";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { RichText } from "./RichItems";
import { trainingStatusPill } from "./rgUtils";

/**
 * A staff member's own copy of an assigned checklist. They tick their items and
 * get their own % (independent of the shared daily board). Falls back to the live
 * checklist's current items if the snapshot was empty.
 */
export default function ChecklistAssignmentDetail({ assignment, liveChecklist, groupId, canTick, canComment, showToast, onClose }) {
  const [cmt, setCmt] = useState({ i: null, text: "" });
  if (!assignment) return null;
  const comments = assignment.comments || {};
  const items = (assignment.items && assignment.items.length) ? assignment.items : (liveChecklist?.items || []);
  const total = items.length;
  const checks = (assignment.checks && assignment.checks.length === total)
    ? assignment.checks
    : Array(total).fill(false).map((_, i) => !!assignment.checks?.[i]);
  const done = checks.filter(Boolean).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  const ref = () => doc(venueCol(groupId, assignment.venueId, "checklistAssignments"), assignment.id);
  const write = async (next) => {
    const d = next.filter(Boolean).length;
    const progress = total ? Math.round((d / total) * 100) : 0;
    const status = d === 0 ? "Not started" : d >= total ? "Complete" : "In progress";
    const heal = (assignment.items && assignment.items.length) ? {} : { items, itemsTotal: total };
    try { await updateDoc(ref(), { checks: next, progress, status, ...heal }); }
    catch { showToast?.("Could not save"); }
  };
  const setCheck = (i, val) => { const next = [...checks]; next[i] = val; write(next); };
  const saveComment = async (i) => {
    const text = cmt.text.trim();
    if (!text && !comments[i]) { setCmt({ i: null, text: "" }); return; } // nothing to write
    try { await updateDoc(ref(), { [`comments.${i}`]: text }); setCmt({ i: null, text: "" }); }
    catch { showToast?.("Could not save note"); }
  };

  return (
    <div className="rg-modal-overlay" style={{ zIndex: 1200 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rg-modal" style={{ maxWidth: 600 }}>
        <div className="modal-head">
          <span className="modal-title">{assignment.checklistTitle}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--gray)" }}>
            {assignment.staffName} · {assignment.venue}
            {assignment.area ? <span className="pill pill-gray" style={{ marginLeft: 6 }}>{assignment.area}</span> : null}
            {assignment.station ? <span className="pill pill-blue" style={{ marginLeft: 4 }}>{assignment.station}</span> : null}
          </span>
          <span><span className={`pill ${trainingStatusPill(assignment.status)}`}>{assignment.status || "Not started"}</span> <strong style={{ marginLeft: 6 }}>{done}/{total}</strong></span>
        </div>
        <div className="progress-wrap" style={{ marginBottom: 14 }}><div className="progress-bar" style={{ width: `${pct}%`, background: "var(--green)" }} /></div>

        {total === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>This checklist has no items.</div>}
        {items.map((it, i) => {
          const checked = !!checks[i];
          const note = comments[i];
          const editing = cmt.i === i;
          return (
            <div key={i} style={{ marginBottom: 2 }}>
              <div className="checklist-item">
                <div className={`check-box ${checked ? "checked" : ""}`} style={{ cursor: canTick ? "pointer" : "default" }} onClick={() => canTick && setCheck(i, !checked)} />
                <RichText html={it} className={`check-text ${checked ? "done" : ""}`} />
                {canComment && <button className="btn btn-sm" style={{ marginLeft: "auto" }} title="Leave a note on this item" onClick={() => setCmt({ i, text: note || "" })}>💬</button>}
              </div>
              {note && !editing && <div style={{ fontSize: 11, color: "var(--gray)", margin: "1px 0 0 30px" }}>💬 <strong>Trainer:</strong> {note}</div>}
              {editing && (
                <div style={{ display: "flex", gap: 6, margin: "4px 0 0 30px" }}>
                  <input className="form-input" value={cmt.text} autoFocus onChange={(e) => setCmt({ i, text: e.target.value })} placeholder="Note for this item" onKeyDown={(e) => e.key === "Enter" && saveComment(i)} />
                  <button className="btn btn-sm btn-primary" onClick={() => saveComment(i)}>Save</button>
                  <button className="btn btn-sm" onClick={() => setCmt({ i: null, text: "" })}>✕</button>
                </div>
              )}
            </div>
          );
        })}

        <div className="btn-row" style={{ marginTop: 12 }}>
          {/* bulk shortcuts are a supervisor action (canComment = manager/owner) — the assignee ticks items individually */}
          {canComment && total > 0 && <button className="btn btn-primary" onClick={() => write(Array(total).fill(true))}>Mark all done</button>}
          {canComment && done > 0 && <button className="btn" onClick={() => write(Array(total).fill(false))}>Reset</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
