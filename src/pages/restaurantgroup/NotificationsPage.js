import React, { useEffect, useMemo, useState } from "react";
import { addDoc, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useRG } from "./RGContext";
import { notificationsCol, scheduledNotificationsCol } from "../../utils/restaurantGroupPaths";
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

const DAYS = [["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"], ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"]];
const HOURS = Array.from({ length: 24 }, (_, h) => [h, `${(h % 12) || 12}:00 ${h >= 12 ? "pm" : "am"}`]);

export default function NotificationsPage() {
  const { groupId, staff, venues, can, me, showToast, noteErr } = useRG();
  const canSend = can("notifications", "edit");
  const actorName = me?.displayName || me?.name || me?.email || "Admin";

  // Standalone screen listener (convention): fail-soft to [] and RECORD the failure.
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!groupId) return;
    const unsub = onSnapshot(notificationsCol(groupId),
      (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => { setRows([]); noteErr("notifications history"); });
    return () => unsub();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Schedules — subscribed ONLY for senders (rules gate reads by rgCanSendNotifications;
  // subscribing without the permission would pin an expected-denial banner — RULE 3).
  const [scheds, setScheds] = useState([]);
  useEffect(() => {
    if (!groupId || !canSend) return;
    const unsub = onSnapshot(scheduledNotificationsCol(groupId),
      (s) => setScheds(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => { setScheds([]); noteErr("notification schedules"); });
    return () => unsub();
  }, [groupId, canSend]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Composer (6b audiences + 6c delivery) ──
  const BLANK = { title: "", body: "", to: "all", person: "", delivery: "now", scheduleDay: "thu", n: 2, anchorDate: "", hour: 16 };
  const [form, setForm] = useState(BLANK);
  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const activeStaff = useMemo(() => staff.filter((s) => s.status !== "Left" && s.status !== "Inactive" && !s.isKiosk), [staff]);

  const send = async () => {
    const title = form.title.trim();
    if (!title) return showToast("Give the notification a title");
    const to = form.to === "person" ? form.person : form.to;
    if (form.to === "person" && !to) return showToast("Pick who it goes to");
    try {
      if (form.delivery === "now") {
        // type "custom" = authored broadcast (the 6f rule keys on it); the bell feeds
        // pick it up immediately — same collection rgNotify writes.
        await addDoc(notificationsCol(groupId), {
          to, type: "custom", title, body: form.body.trim(), venueId: "",
          by: actorName, readBy: [], at: serverTimestamp(),
        });
        showToast("Notification sent");
      } else {
        if (form.delivery === "everyN" && !form.anchorDate) return showToast("Pick the start date");
        const hour = Number(form.hour) || 0;
        await addDoc(scheduledNotificationsCol(groupId), {
          title, body: form.body.trim(), to,
          freq: form.delivery === "weekly" ? "weekly" : "everyN",
          scheduleDay: form.scheduleDay,
          // anchorDate is the date-input's local "YYYY-MM-DD" — never toISOString
          anchorDate: form.delivery === "everyN" ? form.anchorDate : "",
          n: form.delivery === "everyN" ? Math.max(1, Number(form.n) || 1) : 1,
          hour, active: true, lastSentKey: "",
          createdBy: me?.uid || me?.id || "", createdByName: actorName, createdAt: serverTimestamp(),
        });
        showToast("Schedule saved — first send at the next matching hour");
      }
      setForm(BLANK);
    } catch { showToast("Could not save — check your notifications permission"); }
  };

  const toggleSched = async (sc) => {
    try { await updateDoc(doc(scheduledNotificationsCol(groupId), sc.id), { active: sc.active === false }); }
    catch { showToast("Could not update schedule"); }
  };
  const removeSched = async (sc) => {
    if (!window.confirm(`Delete the schedule "${sc.title}"?`)) return;
    try { await deleteDoc(doc(scheduledNotificationsCol(groupId), sc.id)); showToast("Schedule deleted"); }
    catch { showToast("Could not delete schedule"); }
  };
  const schedLabel = (sc) => {
    const day = DAYS.find(([k]) => k === sc.scheduleDay)?.[1] || "";
    const hr = HOURS.find(([h]) => h === Number(sc.hour))?.[1] || `${sc.hour}:00`;
    if ((sc.freq || "weekly") === "weekly") return `Every ${day} · ${hr}`;
    const [y, m, d] = String(sc.anchorDate || "").split("-").map(Number);
    const anchorDay = y ? ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date(y, m - 1, d).getDay()] : "?";
    return `Every ${sc.n} weeks on ${anchorDay} · ${hr} · from ${sc.anchorDate}`;
  };

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
        </div>
      </div>

      {/* ── Composer (senders only) ── */}
      {canSend && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-title">New notification</span><span className="card-sub">Send now, or put it on a repeating schedule</span></div>
          <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={form.title} onChange={set("title")} placeholder="e.g. Confirm your availability" /></div>
          <div className="form-group"><label className="form-label">Message (optional)</label><textarea className="form-input" rows={2} value={form.body} onChange={set("body")} placeholder="e.g. Please confirm your availability by tomorrow. It locks Friday at 11:59pm." /></div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Audience</label>
              <select className="form-input" value={form.to} onChange={set("to")}>
                <option value="all">Everyone</option>
                <option value="managers">Managers &amp; above</option>
                <option value="staffOnly">Staff only</option>
                <option value="person">One person</option>
              </select>
            </div>
            {form.to === "person" && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Who</label>
                <select className="form-input" value={form.person} onChange={set("person")}>
                  <option value="">— pick a person —</option>
                  {activeStaff.map((s) => <option key={s.id} value={s.id}>{s.displayName || fullName(s)}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Delivery</label>
              <select className="form-input" value={form.delivery} onChange={set("delivery")}>
                <option value="now">Send now</option>
                <option value="weekly">Repeat weekly</option>
                <option value="everyN">Repeat every N weeks</option>
              </select>
            </div>
            {form.delivery === "weekly" && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Day</label>
                <select className="form-input" value={form.scheduleDay} onChange={set("scheduleDay")}>
                  {DAYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
            )}
            {form.delivery === "everyN" && (
              <>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Every N weeks</label>
                  <input type="number" min="1" max="12" className="form-input" value={form.n} onChange={set("n")} />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Starting from</label>
                  <input type="date" className="form-input" value={form.anchorDate} onChange={set("anchorDate")} />
                </div>
              </>
            )}
            {form.delivery !== "now" && (
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Time of day</label>
                <select className="form-input" value={form.hour} onChange={set("hour")}>
                  {HOURS.map(([h, l]) => <option key={h} value={h}>{l}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={send}>{form.delivery === "now" ? "Send now" : "Save schedule"}</button>
          </div>
          {form.delivery === "everyN" && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 6 }}>Repeats on the start date&apos;s weekday, every N weeks from that date. The scheduler checks hourly, so times are on the hour.</div>}
        </div>
      )}

      {/* ── Schedules (senders only) ── */}
      {canSend && scheds.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-title">Repeating schedules</span><span className="card-sub">Fired hourly by the scheduler at the chosen time</span></div>
          {scheds.map((sc) => (
            <div key={sc.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "0.5px solid var(--gray-light)", gap: 10, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{sc.title} {sc.active === false && <span className="pill pill-gray">paused</span>}</div>
                <div style={{ fontSize: 11, color: "var(--gray)" }}>{schedLabel(sc)} · to {audienceLabel(sc.to)}{sc.lastSentKey ? ` · last sent ${sc.lastSentKey.split("@")[0]}` : " · not sent yet"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-sm" onClick={() => toggleSched(sc)}>{sc.active === false ? "Resume" : "Pause"}</button>
                <button className="btn btn-sm btn-danger" onClick={() => removeSched(sc)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

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
