import React, { useState } from "react";
import { updateDoc, doc, serverTimestamp, arrayUnion } from "firebase/firestore";
import { venueCol, staffCol } from "../../utils/restaurantGroupPaths";
import { RichText } from "./RichItems";
import { trainingStatusPill } from "./rgUtils";
import { isAssignmentLocked } from "./assignmentUtils";
import { archiveCompletion } from "./completionArchive";
import { sendNotification } from "./notify";

/**
 * Opened training-assignment view. The assignee ticks each step item (verifiable).
 * Ticking everything moves it to "Awaiting sign-off"; a trainer's verification is
 * what marks it "Complete" and logs a note to the staff member's record.
 *
 * If the frozen snapshot has no items (e.g. assigned before the module had steps),
 * we fall back to the LIVE module's current steps so it's never empty.
 */
export default function AssignmentDetail({ assignment, liveModule, groupId, canTick, canVerify, canComment, actorName, showToast, onClose }) {
  const [vNote, setVNote] = useState("");
  const [cmt, setCmt] = useState({ i: null, text: "", priv: false });
  if (!assignment) return null;
  // Phase 3b: once Complete, the assignment is LOCKED — read-only in the UI. No
  // tick/un-tick, no mark-all/reset, no verify/unverify, no comment edits. The only
  // way to redo it is reassign (which archives the record via Phase 1). Effective
  // capabilities below all fold in !locked; write()/verify()/saveComment() also bail.
  const locked = isAssignmentLocked(assignment);
  const tickable = canTick && !locked;
  const verifiable = canVerify && !locked;
  const commentable = canComment && !locked;
  const comments = assignment.comments || {}; // legacy single-comment map (read-only)
  const threads = assignment.threads || {}; // v2: threads.{i} = [{ text, by, at, private }]
  // merged thread per item; private entries are trainer-only
  const threadFor = (i) => {
    const legacy = comments[i] ? [{ text: comments[i], by: "Trainer", at: "", private: false }] : [];
    return [...legacy, ...(threads[i] || [])].filter((c) => canComment || !c.private);
  };

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
    if (locked) return; // completed assignments are read-only (reassign to redo)
    const d = next.filter(Boolean).length;
    const progress = total ? Math.round((d / total) * 100) : 0;
    const allDone = total > 0 && d >= total;
    const status = d === 0 ? "Not started" : allDone ? (assignment.verified ? "Complete" : "Awaiting sign-off") : "In progress";
    // self-heal: if the snapshot was empty, persist the resolved sections so it sticks
    const heal = snapSections.length ? {} : { sections, itemsTotal: total, link };
    // if a verified assignment drops below complete, clear the sign-off — never "verified" + incomplete
    const clearVerify = (!allDone && assignment.verified) ? { verified: false, verifiedBy: "", verifyNote: "", completedAt: null } : {};
    try {
      await updateDoc(ref(), { checks: next, progress, status, ...heal, ...clearVerify });
      // tell the managers when someone finishes all steps (ready to sign off)
      if (status === "Awaiting sign-off" && assignment.status !== "Awaiting sign-off") {
        sendNotification(groupId, { to: "managers", type: "training", title: "Training ready for sign-off", body: `${assignment.staffName} completed all steps of "${assignment.moduleTitle}"`, venueId: assignment.venueId, by: assignment.staffName });
      }
    } catch { showToast?.("Could not save"); }
  };
  const setCheck = (flatI, val) => { const next = [...checks]; next[flatI] = val; write(next); };
  const markAll = (val) => write(Array(total).fill(val));
  const saveComment = async (flatI) => {
    if (locked) return; // read-only once complete
    const text = cmt.text.trim();
    if (!text) { setCmt({ i: null, text: "", priv: false }); return; }
    try {
      // append to the per-item thread; `private` notes are visible to trainers/managers only
      await updateDoc(ref(), { [`threads.${flatI}`]: arrayUnion({ text, by: actorName || "Trainer", at: new Date().toISOString(), private: !!cmt.priv }) });
      setCmt({ i: null, text: "", priv: false });
    } catch { showToast?.("Could not save note"); }
  };

  const verify = async () => {
    if (locked) return;
    const note = vNote.trim();
    const ms = Date.now();
    const pct = total ? Math.round((done / total) * 100) : 100;
    try {
      await updateDoc(ref(), {
        verified: true, verifiedBy: actorName || "Trainer", verifiedAt: serverTimestamp(),
        verifyNote: note, status: "Complete", progress: pct,
        completedAt: serverTimestamp(), // drives the 48h active window + completion archive
      });
      // on the not-verified → verified transition: write a dated completion archive entry
      // (additive, fire-and-forget) and log a record on the staff profile
      if (!assignment.verified) {
        archiveCompletion(groupId, "training", assignment, {
          status: "Complete", verified: true, verifiedBy: actorName || "Trainer", verifyNote: note, checks, progress: pct,
        }, ms).catch(() => {});
      }
      if (assignment.staffId && !assignment.verified) {
        await updateDoc(doc(staffCol(groupId), assignment.staffId), {
          records: arrayUnion({
            id: `train-${assignment.id}`, type: "Training",
            note: `Signed off "${assignment.moduleTitle}"${note ? ` — ${note}` : ""}`,
            at: new Date().toISOString(), by: actorName || "Trainer",
          }),
        });
      }
      showToast?.("Training verified & logged"); setVNote("");
      sendNotification(groupId, { to: assignment.staffId, type: "training", title: "Training signed off", body: `"${assignment.moduleTitle}" was verified by ${actorName || "your trainer"}`, venueId: assignment.venueId, by: actorName || "Trainer" });
    } catch { showToast?.("Could not verify — please try again"); }
  };
  const unverify = async () => {
    if (locked) return; // locked: un-verify is disabled — reassign to redo
    const allDone = total > 0 && done >= total;
    const status = done === 0 ? "Not started" : allDone ? "Awaiting sign-off" : "In progress";
    try { await updateDoc(ref(), { verified: false, verifiedBy: "", verifyNote: "", status, completedAt: null }); showToast?.("Verification removed"); }
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
        {locked && (
          <div style={{ marginBottom: 12, padding: "8px 10px", background: "rgba(34,197,94,0.08)", border: "0.5px solid var(--green)", borderRadius: 8, fontSize: 12 }}>
            🔒 <strong>Completed &amp; locked.</strong> This record is read-only. To redo this training, reassign it from the staff profile — the completed record is archived first.
          </div>
        )}
        {link && <div style={{ marginBottom: 12 }}><button className="btn btn-sm btn-primary" onClick={() => window.open(link, "_blank", "noopener")}>Open external training ↗</button></div>}

        {withOffset.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>This module has no step items to tick.</div>}
        {withOffset.map((sec, si) => (
          <div key={si} style={{ marginBottom: 14 }}>
            {sec.heading && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{sec.heading}</div>}
            {(sec.items || []).map((it, ii) => {
              const flatI = sec._off + ii;
              const checked = !!checks[flatI];
              const thread = threadFor(flatI);
              const editing = cmt.i === flatI;
              return (
                <div key={ii} style={{ marginBottom: 2 }}>
                  <div className="checklist-item">
                    <div className={`check-box ${checked ? "checked" : ""}`} style={{ cursor: tickable ? "pointer" : "default" }} onClick={() => tickable && setCheck(flatI, !checked)} />
                    <RichText html={it} className={`check-text ${checked ? "done" : ""}`} />
                    {commentable && <button className="btn btn-sm" style={{ marginLeft: "auto" }} title="Add a comment on this step" onClick={() => setCmt({ i: flatI, text: "", priv: false })}>💬{thread.length ? ` ${thread.length}` : ""}</button>}
                  </div>
                  {thread.map((c, ci) => (
                    <div key={ci} style={{ fontSize: 11, color: "var(--gray)", margin: "1px 0 0 30px" }}>
                      💬 <strong>{c.by || "Trainer"}:</strong> {c.text}
                      {c.private && <span className="pill pill-amber" style={{ marginLeft: 5 }}>🔒 trainer-only</span>}
                      {c.at && <span style={{ opacity: 0.7 }}> · {new Date(c.at).toLocaleDateString()}</span>}
                    </div>
                  ))}
                  {editing && (
                    <div style={{ display: "flex", gap: 6, margin: "4px 0 0 30px", alignItems: "center", flexWrap: "wrap" }}>
                      <input className="form-input" style={{ flex: 1, minWidth: 180 }} value={cmt.text} autoFocus onChange={(e) => setCmt((p) => ({ ...p, text: e.target.value }))} placeholder={thread.length ? "Add another comment…" : "Note for this step (e.g. watch the timing)"} onKeyDown={(e) => e.key === "Enter" && saveComment(flatI)} />
                      <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                        <input type="checkbox" checked={cmt.priv} onChange={(e) => setCmt((p) => ({ ...p, priv: e.target.checked }))} />🔒 just for trainers
                      </label>
                      <button className="btn btn-sm btn-primary" onClick={() => saveComment(flatI)}>Add</button>
                      <button className="btn btn-sm" onClick={() => setCmt({ i: null, text: "", priv: false })}>✕</button>
                    </div>
                  )}
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
              {verifiable && <div style={{ marginTop: 8 }}><button className="btn btn-sm" onClick={unverify}>Remove sign-off</button></div>}
            </div>
          ) : verifiable ? (
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
          {/* bulk shortcuts are a supervisor action — the assignee ticks items individually */}
          {verifiable && total > 0 && <button className="btn btn-primary" onClick={() => markAll(true)}>Mark all done</button>}
          {verifiable && done > 0 && <button className="btn" onClick={() => markAll(false)}>Reset</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
