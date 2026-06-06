import React, { useState } from "react";
import { updateDoc, doc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { venueCol, staffCol } from "../../utils/restaurantGroupPaths";
import { RichText } from "./RichItems";
import { trainingStatusPill } from "./rgUtils";

/**
 * Opened training-assignment view. The assignee ticks each step item (verifiable).
 * Ticking everything moves it to "Awaiting sign-off"; a trainer's verification is
 * what marks it "Complete" and logs a note to the staff member's record.
 *
 * If the frozen snapshot has no items (e.g. assigned before the module had steps),
 * we fall back to the LIVE module's current steps so it's never empty.
 */
export default function AssignmentDetail({ assignment, liveModule, groupId, canTick, canVerify, actorName, showToast, onClose }) {
  const [vNote, setVNote] = useState("");
  if (!assignment) return null;

  // Resolve sections: prefer the snapshot, fall back to the live module's steps.
  const snapSections = (assignment.sections || []).filter((s) => (s.items || []).length);
  const sections = snapSections.length ? assignment.sections : (liveModule?.steps || []);
  const total = sections.reduce((a, s) => a + ((s.items || []).length), 0);
  const link = assignment.link || liveModule?.link || "";

  // checks array sized to the resolved total
  const checks = (assignment.checks && assignment.checks.length === total)
    ? assignment.checks
    : Array(total).fill(false).map((_, i) => !!assignment.checks?.[i]);
  const done = checks.filter(Boolean).length;

  let off = 0;
  const withOffset = sections.map((s) => { const o = off; off += (s.items || []).length; return { ...s, _off: o }; });

  const ref = () => doc(venueCol(groupId, assignment.venueId, "trainingAssignments"), assignment.id);

  const write = async (next) => {
    const d = next.filter(Boolean).length;
    const progress = total ? Math.round((d / total) * 100) : 0;
    const allDone = total > 0 && d >= total;
    const status = d === 0 ? "Not started" : allDone ? (assignment.verified ? "Complete" : "Awaiting sign-off") : "In progress";
    // self-heal: if the snapshot was empty, persist the resolved sections so it sticks
    const heal = snapSections.length ? {} : { sections, itemsTotal: total, link };
    try { await updateDoc(ref(), { checks: next, progress, status, ...heal }); }
    catch { showToast?.("Could not save"); }
  };
  const setCheck = (flatI, val) => { const next = [...checks]; next[flatI] = val; write(next); };
  const markAll = (val) => write(Array(total).fill(val));

  const verify = async () => {
    const note = vNote.trim();
    try {
      await updateDoc(ref(), {
        verified: true, verifiedBy: actorName || "Trainer", verifiedAt: serverTimestamp(),
        verifyNote: note, status: "Complete", progress: total ? Math.round((done / total) * 100) : 100,
      });
      // log a record on the staff member's profile so progress is tracked in history
      if (assignment.staffId) {
        await updateDoc(doc(staffCol(groupId), assignment.staffId), {
          records: arrayUnion({
            id: `r${assignment.id}-${total}-${done}`, type: "Training",
            note: `Signed off "${assignment.moduleTitle}"${note ? ` — ${note}` : ""}`,
            at: new Date().toISOString(), by: actorName || "Trainer",
          }),
        }).catch(() => {});
      }
      showToast?.("Training verified & logged"); setVNote("");
    } catch { showToast?.("Could not verify"); }
  };
  const unverify = async () => {
    const allDone = total > 0 && done >= total;
    const status = done === 0 ? "Not started" : allDone ? "Awaiting sign-off" : "In progress";
    try { await updateDoc(ref(), { verified: false, verifiedBy: "", verifyNote: "", status }); showToast?.("Verification removed"); }
    catch { showToast?.("Could not update"); }
  };

  const pctNow = total ? Math.round((done / total) * 100) : (assignment.verified ? 100 : 0);

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
        <div className="progress-wrap" style={{ marginBottom: 14 }}><div className="progress-bar" style={{ width: `${pctNow}%`, background: "var(--green)" }} /></div>
        {link && <div style={{ marginBottom: 12 }}><button className="btn btn-sm btn-primary" onClick={() => window.open(link, "_blank", "noopener")}>Open external training ↗</button></div>}

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
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Trainer sign-off</div>
          {assignment.verified ? (
            <div>
              <span className="pill pill-green">✓ Verified by {assignment.verifiedBy || "trainer"}</span>
              {assignment.verifyNote && <div style={{ fontSize: 12, marginTop: 6 }}>“{assignment.verifyNote}”</div>}
              {canVerify && <div style={{ marginTop: 8 }}><button className="btn btn-sm" onClick={unverify}>Remove sign-off</button></div>}
            </div>
          ) : canVerify ? (
            <div>
              <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 6 }}>Confirm this person has been observed and is competent{done < total ? " (not all steps ticked yet)" : ""}. Your note is saved to their record.</div>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="form-input" value={vNote} onChange={(e) => setVNote(e.target.value)} placeholder="Note (e.g. great on coffee, slow on close)" />
                <button className="btn btn-primary" onClick={verify}>Sign off</button>
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--gray)" }}>{done >= total && total > 0 ? "All steps ticked — awaiting trainer sign-off." : "Not yet verified by a trainer."}</div>
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
