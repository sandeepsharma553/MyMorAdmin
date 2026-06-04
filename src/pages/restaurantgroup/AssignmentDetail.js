import React, { useState } from "react";
import { updateDoc, doc, serverTimestamp } from "firebase/firestore";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { RichText } from "./RichItems";
import { trainingStatusPill } from "./rgUtils";

/**
 * Opened training-assignment view: the assignee ticks each step item to mark it
 * done (verifiable). Progress = ticked/total; auto-completes at 100%. `canTick`
 * gates whether checkboxes / mark-all are interactive.
 */
export default function AssignmentDetail({ assignment, groupId, canTick, canVerify, actorName, showToast, onClose }) {
  const [vNote, setVNote] = useState("");
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

  const ref = () => doc(venueCol(groupId, assignment.venueId, "trainingAssignments"), assignment.id);
  const verify = async () => {
    try { await updateDoc(ref(), { verified: true, verifiedBy: actorName || "Trainer", verifiedAt: serverTimestamp(), verifyNote: vNote.trim() }); showToast?.("Training verified"); setVNote(""); }
    catch { showToast?.("Could not verify"); }
  };
  const unverify = async () => {
    try { await updateDoc(ref(), { verified: false, verifiedBy: "", verifyNote: "" }); showToast?.("Verification removed"); }
    catch { showToast?.("Could not update"); }
  };

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
        {assignment.link && <div style={{ marginBottom: 12 }}><button className="btn btn-sm btn-primary" onClick={() => window.open(assignment.link, "_blank", "noopener")}>Open external training ↗</button></div>}

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

        {/* Trainer verification */}
        <div style={{ marginTop: 8, marginBottom: 8, padding: 12, border: "0.5px solid var(--border)", borderRadius: 10, background: assignment.verified ? "rgba(34,197,94,0.06)" : "transparent" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Trainer verification</div>
          {assignment.verified ? (
            <div>
              <span className="pill pill-green">✓ Verified by {assignment.verifiedBy || "trainer"}</span>
              {assignment.verifyNote && <div style={{ fontSize: 12, marginTop: 6 }}>“{assignment.verifyNote}”</div>}
              {canVerify && <div style={{ marginTop: 8 }}><button className="btn btn-sm" onClick={unverify}>Remove verification</button></div>}
            </div>
          ) : canVerify ? (
            <div>
              <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 6 }}>Confirm this person has been observed and is competent{done < total ? " (not all steps ticked yet)" : ""}.</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="form-input" value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="Optional note (e.g. observed on shift 12 Jun)" />
                <button className="btn btn-primary" onClick={verify}>Verify</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--gray)" }}>Not yet verified by a trainer.</div>
          )}
        </div>

        <div className="btn-row">
          {canTick && total > 0 && <button className="btn btn-primary" onClick={() => markAll(true)}>Mark all done</button>}
          {canTick && done > 0 && <button className="btn" onClick={() => markAll(false)}>Reset</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
