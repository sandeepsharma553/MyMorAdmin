import React from "react";
import { updateDoc, doc } from "firebase/firestore";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { RichText } from "./RichItems";
import { trainingStatusPill } from "./rgUtils";

/**
 * Opened training-assignment view: the assignee ticks each step item to mark it
 * done (verifiable). Progress = ticked/total; auto-completes at 100%. `canTick`
 * gates whether checkboxes / mark-all are interactive.
 */
export default function AssignmentDetail({ assignment, groupId, canTick, showToast, onClose }) {
  if (!assignment) return null;
  const sections = assignment.sections || [];
  const checks = assignment.checks || [];
  const total = checks.length || sections.reduce((a, s) => a + ((s.items || []).length), 0);
  const done = checks.filter(Boolean).length;

  // flat-index offset per section
  let off = 0;
  const withOffset = sections.map((s) => { const o = off; off += (s.items || []).length; return { ...s, _off: o }; });

  const write = async (next) => {
    const d = next.filter(Boolean).length;
    const progress = total ? Math.round((d / total) * 100) : 0;
    const status = d === 0 ? "Not started" : d >= total ? "Complete" : "In progress";
    try { await updateDoc(doc(venueCol(groupId, assignment.venueId, "trainingAssignments"), assignment.id), { checks: next, progress, status }); }
    catch { showToast?.("Could not save"); }
  };
  const setCheck = (flatI, val) => { const next = [...(checks.length ? checks : Array(total).fill(false))]; next[flatI] = val; write(next); };
  const markAll = (val) => write(Array(total).fill(val));

  return (
    <div className="rg-modal-overlay" style={{ zIndex: 1200 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rg-modal" style={{ maxWidth: 640 }}>
        <div className="modal-head">
          <span className="modal-title">{assignment.moduleTitle}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: "var(--gray)" }}>{assignment.staffName} · {assignment.venue}{assignment.due ? ` · due ${assignment.due}` : ""}</span>
          <span><span className={`pill ${trainingStatusPill(assignment.status)}`}>{assignment.status}</span> <strong style={{ marginLeft: 6 }}>{done}/{total}</strong></span>
        </div>
        <div className="progress-wrap" style={{ marginBottom: 14 }}><div className="progress-bar" style={{ width: `${total ? Math.round((done / total) * 100) : 0}%`, background: "var(--green)" }} /></div>

        {withOffset.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>This module has no step items to tick.</div>}
        {withOffset.map((sec, si) => (
          <div key={si} style={{ marginBottom: 14 }}>
            {sec.heading && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{sec.heading}</div>}
            {(sec.items || []).map((it, ii) => {
              const flatI = sec._off + ii;
              const checked = !!checks[flatI];
              return (
                <div key={ii} className="checklist-item">
                  <div className={`check-box ${checked ? "checked" : ""}`} style={{ cursor: canTick ? "pointer" : "default" }} onClick={() => canTick && setCheck(flatI, !checked)} />
                  <RichText html={it} className={`check-text ${checked ? "done" : ""}`} />
                </div>
              );
            })}
          </div>
        ))}

        <div className="btn-row">
          {canTick && total > 0 && <button className="btn btn-primary" onClick={() => markAll(true)}>Mark all done</button>}
          {canTick && done > 0 && <button className="btn" onClick={() => markAll(false)}>Reset</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
