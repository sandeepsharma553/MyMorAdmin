import React, { useState } from "react";
import { updateDoc, doc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { RichText } from "./RichItems";
import { trainingStatusPill } from "./rgUtils";
import { archiveCompletion } from "./completionArchive";
import { sendNotification } from "./notify";

/**
 * A staff member's own copy of an assigned checklist. They tick their items and
 * get their own % (independent of the shared daily board). Falls back to the live
 * checklist's current items if the snapshot was empty.
 */
export default function ChecklistAssignmentDetail({ assignment, liveChecklist, groupId, canTick, canComment, actorName, showToast, onClose }) {
  const [cmt, setCmt] = useState({ i: null, text: "", priv: false });
  const [confirmFinish, setConfirmFinish] = useState(false); // #4 finish-incomplete confirm
  if (!assignment) return null;
  const comments = assignment.comments || {}; // legacy single-comment map (read-only)
  const threads = assignment.threads || {}; // v2: threads.{i} = [{ text, by, at, private }]
  const threadFor = (i) => {
    const legacy = comments[i] ? [{ text: comments[i], by: "Trainer", at: "", private: false }] : [];
    return [...legacy, ...(threads[i] || [])].filter((c) => canComment || !c.private);
  };
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
    const becameComplete = status === "Complete" && assignment.status !== "Complete";
    const droppedFromComplete = status !== "Complete" && assignment.status === "Complete";
    // completedAt drives the 48h active window + completion archive
    const tsPatch = becameComplete ? { completedAt: serverTimestamp() } : droppedFromComplete ? { completedAt: null } : {};
    try {
      await updateDoc(ref(), { checks: next, progress, status, ...heal, ...tsPatch });
      if (becameComplete) {
        archiveCompletion(groupId, "checklist", assignment, { status: "Complete", checks: next, progress }).catch(() => {}); // dated completion archive (additive)
        sendNotification(groupId, { to: "managers", type: "checklist", title: "Checklist completed", body: `${assignment.staffName} completed "${assignment.checklistTitle}"`, venueId: assignment.venueId, by: assignment.staffName });
      }
    } catch { showToast?.("Could not save"); }
  };
  const setCheck = (i, val) => { const next = [...checks]; next[i] = val; write(next); };
  const saveComment = async (i) => {
    const text = cmt.text.trim();
    if (!text) { setCmt({ i: null, text: "", priv: false }); return; }
    try {
      await updateDoc(ref(), { [`threads.${i}`]: arrayUnion({ text, by: actorName || "Trainer", at: new Date().toISOString(), private: !!cmt.priv }) });
      setCmt({ i: null, text: "", priv: false });
    } catch { showToast?.("Could not save note"); }
  };

  // #4 Finish-incomplete: notification ONLY — no status change, no doc write. (The COMPLETE
  // case is already handled in write()'s becameComplete block; this covers leaving items unticked.)
  const strip = (h) => (h || "").replace(/<[^>]*>/g, "").trim();
  const doFinishIncomplete = () => {
    const missingItems = items.filter((_, i) => !checks[i]).map(strip).filter(Boolean);
    const missingCount = missingItems.length;
    const preview = missingItems.slice(0, 3).join(", ") + (missingItems.length > 3 ? `, +${missingItems.length - 3} more` : "");
    sendNotification(groupId, {
      to: "managers", type: "checklist", title: "Checklist left incomplete",
      body: `${assignment.staffName} finished "${assignment.checklistTitle}" with ${missingCount} item(s) incomplete${preview ? `: ${preview}` : ""}`,
      venueId: assignment.venueId, by: assignment.staffName,
    });
    setConfirmFinish(false);
    onClose();
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
          const thread = threadFor(i);
          const editing = cmt.i === i;
          return (
            <div key={i} style={{ marginBottom: 2 }}>
              <div className="checklist-item">
                <div className={`check-box ${checked ? "checked" : ""}`} style={{ cursor: canTick ? "pointer" : "default" }} onClick={() => canTick && setCheck(i, !checked)} />
                <RichText html={it} className={`check-text ${checked ? "done" : ""}`} />
                {canComment && <button className="btn btn-sm" style={{ marginLeft: "auto" }} title="Add a comment on this item" onClick={() => setCmt({ i, text: "", priv: false })}>💬{thread.length ? ` ${thread.length}` : ""}</button>}
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
                  <input className="form-input" style={{ flex: 1, minWidth: 180 }} value={cmt.text} autoFocus onChange={(e) => setCmt((p) => ({ ...p, text: e.target.value }))} placeholder={thread.length ? "Add another comment…" : "Note for this item"} onKeyDown={(e) => e.key === "Enter" && saveComment(i)} />
                  <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={cmt.priv} onChange={(e) => setCmt((p) => ({ ...p, priv: e.target.checked }))} />🔒 just for trainers
                  </label>
                  <button className="btn btn-sm btn-primary" onClick={() => saveComment(i)}>Add</button>
                  <button className="btn btn-sm" onClick={() => setCmt({ i: null, text: "", priv: false })}>✕</button>
                </div>
              )}
            </div>
          );
        })}

        {/* #4 finish-incomplete confirm — shown in place of the Finish button while confirming */}
        {confirmFinish && (
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
            <span style={{ fontSize: 12, color: "var(--gray)" }}>{total - done} item(s) not ticked — notify managers it was left incomplete?</span>
            <button className="btn btn-sm btn-primary" onClick={doFinishIncomplete}>Yes, finish</button>
            <button className="btn btn-sm" onClick={() => setConfirmFinish(false)}>Cancel</button>
          </div>
        )}
        <div className="btn-row" style={{ marginTop: 12 }}>
          {/* bulk shortcuts are a supervisor action (canComment = manager/owner) — the assignee ticks items individually */}
          {canComment && total > 0 && <button className="btn btn-primary" onClick={() => write(Array(total).fill(true))}>Mark all done</button>}
          {canComment && done > 0 && <button className="btn" onClick={() => write(Array(total).fill(false))}>Reset</button>}
          {/* Finish: only when there are unticked items (complete already auto-notifies on the last tick) */}
          {canTick && total > 0 && done < total && !confirmFinish && (
            <button className="btn" onClick={() => setConfirmFinish(true)}>Finish checklist</button>
          )}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
