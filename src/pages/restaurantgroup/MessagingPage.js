import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, arrayUnion } from "firebase/firestore";
import { useRG } from "./RGContext";
import { announcementsCol, messagesCol, convId } from "../../utils/restaurantGroupPaths";
import { initials, fullName } from "./rgUtils";

const fmtTs = (ts) => {
  if (!ts) return "";
  try {
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    const today = new Date(); const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
};
const tsVal = (ts) => ts?.seconds || (ts ? new Date(ts).getTime() / 1000 : 0);

export default function MessagingPage() {
  const { groupId, staff, venues, me, can, showToast } = useRG();
  const canPost = can("messages", "edit");

  // Identify the current user among staff (by adminUid, else email), else fall back to the login uid.
  const myUid = me?.uid || me?.id || null;
  const myStaff = useMemo(
    () => staff.find((s) => (s.adminUid && myUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())) || null,
    [staff, me, myUid]
  );
  const myId = myStaff?.id || myUid || "owner";
  const myName = myStaff?.displayName || myStaff?.name || me?.name || me?.displayName || "Admin";

  const [tab, setTab] = useState("announcements");

  // ── live data ──
  const [anns, setAnns] = useState([]);
  const [msgs, setMsgs] = useState([]);
  useEffect(() => {
    if (!groupId) return;
    const u1 = onSnapshot(announcementsCol(groupId), (s) => setAnns(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setAnns([]));
    const u2 = onSnapshot(messagesCol(groupId), (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMsgs([]));
    return () => { u1(); u2(); };
  }, [groupId]);

  // ── announcements ──
  const myVenueIds = myStaff?.venueIds || (me?.venueId && me.venueId !== "all" ? [me.venueId] : venues.map((v) => v.id));
  const visibleAnns = useMemo(() => anns
    .filter((a) => a.scope === "all" || myVenueIds.includes(a.scope))
    .sort((a, b) => tsVal(b.at) - tsVal(a.at)), [anns, myVenueIds]);

  const [annForm, setAnnForm] = useState({ title: "", body: "", scope: "all" });
  const postAnnouncement = async () => {
    if (!annForm.body.trim()) return showToast("Write something first");
    try {
      await addDoc(announcementsCol(groupId), {
        title: annForm.title.trim(), body: annForm.body.trim(), scope: annForm.scope,
        venueName: annForm.scope === "all" ? "All venues" : (venues.find((v) => v.id === annForm.scope)?.name || ""),
        fromId: myId, fromName: myName, at: serverTimestamp(), readBy: [myId],
      });
      setAnnForm({ title: "", body: "", scope: "all" });
      showToast("Announcement posted");
    } catch { showToast("Could not post"); }
  };
  const ackAnnouncement = async (a) => {
    if ((a.readBy || []).includes(myId)) return;
    try { await updateDoc(doc(announcementsCol(groupId), a.id), { readBy: arrayUnion(myId) }); } catch { /* */ }
  };
  const deleteAnnouncement = async (a) => {
    try { await deleteDoc(doc(announcementsCol(groupId), a.id)); showToast("Deleted"); } catch { showToast("Could not delete"); }
  };

  // ── direct messages ──
  const myMsgs = useMemo(() => msgs.filter((m) => m.fromId === myId || m.toId === myId), [msgs, myId]);
  const threads = useMemo(() => {
    const map = {};
    myMsgs.forEach((m) => {
      const otherId = m.fromId === myId ? m.toId : m.fromId;
      const otherName = m.fromId === myId ? m.toName : m.fromName;
      const t = map[otherId] || (map[otherId] = { otherId, otherName, last: null, unread: 0 });
      if (!t.last || tsVal(m.at) > tsVal(t.last.at)) t.last = m;
      if (m.toId === myId && !(m.readBy || []).includes(myId)) t.unread++;
      t.otherName = otherName || t.otherName;
    });
    return Object.values(map).sort((a, b) => tsVal(b.last?.at) - tsVal(a.last?.at));
  }, [myMsgs, myId]);

  const [activeOther, setActiveOther] = useState(null); // staff id
  const [draft, setDraft] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const scrollRef = useRef(null);

  const thread = useMemo(() => activeOther
    ? myMsgs.filter((m) => m.fromId === activeOther || m.toId === activeOther).sort((a, b) => tsVal(a.at) - tsVal(b.at))
    : [], [myMsgs, activeOther]);

  // mark incoming as read when a thread is opened/updated
  useEffect(() => {
    if (!activeOther) return;
    thread.filter((m) => m.toId === myId && !(m.readBy || []).includes(myId))
      .forEach((m) => updateDoc(doc(messagesCol(groupId), m.id), { readBy: arrayUnion(myId) }).catch(() => {}));
  }, [activeOther, thread, myId, groupId]);

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [thread.length, activeOther]);

  const otherStaff = useMemo(() => staff.find((s) => s.id === activeOther), [staff, activeOther]);
  const sendMessage = async () => {
    if (!draft.trim() || !activeOther) return;
    const to = staff.find((s) => s.id === activeOther);
    try {
      await addDoc(messagesCol(groupId), {
        conv: convId(myId, activeOther), fromId: myId, fromName: myName,
        toId: activeOther, toName: to ? (to.displayName || to.name) : "", text: draft.trim(),
        at: serverTimestamp(), readBy: [myId],
      });
      setDraft("");
    } catch { showToast("Could not send"); }
  };

  // people you can message: staff with a login, excluding yourself
  const contactable = useMemo(
    () => staff.filter((s) => s.id !== myId && (s.hasAdminLogin || s.adminUid)).sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "")),
    [staff, myId]
  );
  const startThread = (s) => { setActiveOther(s.id); setPickOpen(false); setTab("direct"); };

  const totalUnreadDM = threads.reduce((a, t) => a + t.unread, 0);

  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[["announcements", "Announcements"], ["direct", `Direct${totalUnreadDM ? ` (${totalUnreadDM})` : ""}`]].map(([id, l]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {/* ── ANNOUNCEMENTS ── */}
      {tab === "announcements" && (
        <>
          {canPost && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="card-head"><span className="card-title">Post an announcement</span></div>
              <div className="form-group"><label className="form-label">Title (optional)</label><input className="form-input" value={annForm.title} onChange={(e) => setAnnForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Roster change this week" /></div>
              <div className="form-group"><label className="form-label">Message</label><textarea className="form-input" rows={3} value={annForm.body} onChange={(e) => setAnnForm((p) => ({ ...p, body: e.target.value }))} placeholder="Write to the whole team or a single venue…" /></div>
              <div className="form-group"><label className="form-label">Audience</label>
                <select className="form-input" value={annForm.scope} onChange={(e) => setAnnForm((p) => ({ ...p, scope: e.target.value }))}>
                  <option value="all">All venues</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="btn-row"><button className="btn btn-primary" onClick={postAnnouncement}>Post announcement</button></div>
            </div>
          )}

          {visibleAnns.map((a) => {
            const acked = (a.readBy || []).includes(myId);
            return (
              <div key={a.id} className="card" style={{ marginBottom: 12 }}>
                <div className="card-head">
                  <div>
                    {a.title && <span className="card-title">{a.title}</span>}
                    <span className="card-sub">{a.fromName} · {fmtTs(a.at)}</span>
                  </div>
                  <span className="pill pill-gray">{a.venueName || (a.scope === "all" ? "All venues" : "")}</span>
                </div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{a.body}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                  {acked ? <span className="pill pill-green">✓ Acknowledged</span>
                    : <button className="btn btn-sm btn-primary" onClick={() => ackAnnouncement(a)}>Acknowledge</button>}
                  <span style={{ fontSize: 11, color: "var(--gray)" }}>{(a.readBy || []).length} acknowledged</span>
                  {canPost && a.fromId === myId && <button className="btn btn-sm btn-danger" style={{ marginLeft: "auto" }} onClick={() => deleteAnnouncement(a)}>Delete</button>}
                </div>
              </div>
            );
          })}
          {visibleAnns.length === 0 && <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No announcements yet.</div>}
        </>
      )}

      {/* ── DIRECT ── */}
      {tab === "direct" && (
        <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 14, height: "calc(100vh - 220px)", minHeight: 420 }}>
          {/* thread list */}
          <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 12, borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Conversations</strong>
              <button className="btn btn-sm btn-primary" onClick={() => setPickOpen(true)}>+ New</button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {threads.map((t) => (
                <button key={t.otherId} onClick={() => setActiveOther(t.otherId)}
                  className="staff-meta-row" style={{ width: "100%", textAlign: "left", gap: 10, padding: "10px 12px", borderBottom: "0.5px solid var(--gray-light)", background: activeOther === t.otherId ? "var(--gray-light)" : "transparent", cursor: "pointer", border: "none" }}>
                  <div className="staff-avatar" style={{ width: 34, height: 34, fontSize: 12, marginBottom: 0 }}>{initials({ name: t.otherName })}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>{t.otherName}{t.unread > 0 && <span className="pill pill-red" style={{ fontSize: 10 }}>{t.unread}</span>}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last?.fromId === myId ? "You: " : ""}{t.last?.text}</div>
                  </div>
                </button>
              ))}
              {threads.length === 0 && <div style={{ padding: 16, fontSize: 12, color: "var(--gray)" }}>No conversations yet. Start one with “+ New”.</div>}
            </div>
          </div>

          {/* thread view */}
          <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {activeOther ? (
              <>
                <div style={{ padding: 12, borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="staff-avatar" style={{ width: 34, height: 34, fontSize: 12, marginBottom: 0 }}>{initials({ name: otherStaff ? fullName(otherStaff) : "" })}</div>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{otherStaff ? (otherStaff.displayName || otherStaff.name) : "Conversation"}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)" }}>{otherStaff?.role}{otherStaff?.venueNames?.length ? ` · ${otherStaff.venueNames.join(", ")}` : ""}</div></div>
                </div>
                <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {thread.map((m) => {
                    const mine = m.fromId === myId;
                    return (
                      <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "72%" }}>
                        <div style={{ background: mine ? "var(--red)" : "var(--gray-light)", color: mine ? "#fff" : "var(--ink)", padding: "8px 11px", borderRadius: 12, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{m.text}</div>
                        <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{fmtTs(m.at)}</div>
                      </div>
                    );
                  })}
                  {thread.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", margin: "auto" }}>Say hello 👋</div>}
                </div>
                <div style={{ padding: 10, borderTop: "0.5px solid var(--border)", display: "flex", gap: 8 }}>
                  <input className="form-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())} />
                  <button className="btn btn-primary" onClick={sendMessage}>Send</button>
                </div>
              </>
            ) : (
              <div style={{ margin: "auto", textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Select a conversation or start a new one.</div>
            )}
          </div>
        </div>
      )}

      {/* recipient picker */}
      {pickOpen && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPickOpen(false)}>
          <div className="rg-modal" style={{ maxWidth: 420 }}>
            <div className="modal-head"><span className="modal-title">New message</span><button className="modal-close" onClick={() => setPickOpen(false)}>✕</button></div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>Only people with website login are shown — they can read messages here.</div>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {contactable.map((s) => (
                <button key={s.id} onClick={() => startThread(s)} className="staff-meta-row" style={{ width: "100%", textAlign: "left", gap: 10, padding: "9px 6px", borderBottom: "0.5px solid var(--gray-light)", background: "transparent", border: "none", cursor: "pointer" }}>
                  <div className="staff-avatar" style={{ width: 32, height: 32, fontSize: 12, marginBottom: 0 }}>{initials(s)}</div>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{s.displayName || s.name}</div><div style={{ fontSize: 11, color: "var(--gray)" }}>{s.role} · {(s.venueNames || []).join(", ")}</div></div>
                </button>
              ))}
              {contactable.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: 12 }}>No one has a website login yet. Add logins in Staff Directory.</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
