import React, { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { useRG } from "./RGContext";
import { notificationsCol } from "../../utils/restaurantGroupPaths";
import { fullName } from "./rgUtils";

/* ============================================================================
   Notifications (Job 6a) — the authoring page. This commit is the SHELL: the
   group's sent-notification history, gated by the NEW `notifications` module
   (view = open the page + read history; edit = send). The composer, audience
   tiers, and scheduling land in 6b/6c; delivery (push) in 6d.
   Sidebar + route hide at permission `none` — that is UX, not security; the
   real send enforcement is rgCanSendNotifications in the Firestore rules (6f).
   Data: restaurantGroups/{gid}/notifications (the bell feed both apps read).
   ========================================================================== */

const fmtTs = (ts) => {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : (typeof ts?.seconds === "number" ? new Date(ts.seconds * 1000) : new Date(ts));
    return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  } catch { return ""; }
};

export default function NotificationsPage() {
  const { groupId, staff, venues, can, noteErr } = useRG();
  const canSend = can("notifications", "edit"); // composer gate — wired up from 6b on

  // Standalone screen listener (convention): fail-soft to [] and RECORD the failure.
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(notificationsCol(groupId),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => { setRows([]); noteErr("notifications history"); });
    return () => unsub();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  const sorted = useMemo(() => [...rows].sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)), [rows]);
  const staffName = (id) => { const s = staff.find((x) => x.id === id); return s ? (s.displayName || fullName(s)) : ""; };
  // Audience label — `to` values (6b tiers): "all" | "managers" | "staffOnly" | a staffId
  const audienceLabel = (to) => (to === "all" ? "Everyone" : to === "managers" ? "Managers & above" : to === "staffOnly" ? "Staff only" : (staffName(to) || "One person"));
  const venueName = (id) => venues.find((v) => v.id === id)?.name || "";

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>
          Everything sent to the team&apos;s bell feed — by admins, or automatically by the system (shift assignments, temperature alerts…).
          {canSend ? " Composing and scheduling arrive with the next parts of this job." : ""}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {sorted.map((n) => (
          <div key={n.id} style={{ padding: "10px 14px", borderBottom: "0.5px solid var(--gray-light)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{n.title || "(no title)"}</span>
              <span className="pill pill-blue">{audienceLabel(n.to)}</span>
              {n.venueId && <span className="pill pill-gray">{venueName(n.venueId)}</span>}
              {n.type && n.type !== "info" && <span className="pill pill-amber">{n.type}</span>}
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--gray)" }}>{fmtTs(n.at)}</span>
            </div>
            {n.body && <div style={{ fontSize: 12, color: "var(--ink)", marginTop: 4, whiteSpace: "pre-wrap" }}>{n.body}</div>}
            <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>
              {n.by ? `Sent by ${n.by}` : "System"} · {(n.readBy || []).length} read
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: 20, color: "var(--gray)", fontSize: 13 }}>No notifications sent yet.</div>
        )}
      </div>
    </>
  );
}
