import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, arrayUnion } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { useRG } from "./RGContext";
import { announcementsCol, messagesCol, conversationsCol, convId } from "../../utils/restaurantGroupPaths";
import { initials } from "./rgUtils";

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

const LINK_RE = /(https?:\/\/[^\s]+)/g;
const Linkify = ({ text, mine }) => (text || "").split(LINK_RE).map((p, i) => /^https?:\/\//.test(p)
  ? <a key={i} href={p} target="_blank" rel="noopener noreferrer" style={{ color: mine ? "#fff" : "var(--red)", textDecoration: "underline", wordBreak: "break-all" }}>{p}</a>
  : <React.Fragment key={i}>{p}</React.Fragment>);

const Attachment = ({ a, mine }) => {
  if (a.type === "image") return <img src={a.url} alt={a.name} style={{ maxWidth: 220, maxHeight: 240, borderRadius: 8, marginTop: 4, cursor: "pointer", display: "block" }} onClick={() => window.open(a.url, "_blank")} />;
  if (a.type === "video") return <video src={a.url} controls style={{ maxWidth: 250, borderRadius: 8, marginTop: 4, display: "block" }} />;
  return <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", gap: 6, alignItems: "center", marginTop: 4, fontSize: 12, color: mine ? "#fff" : "var(--red)", textDecoration: "underline" }}>📎 {a.name}</a>;
};

export default function MessagingPage() {
  const { groupId, staff, venues, me, myScope, can, showToast } = useRG();
  const canPost = can("messages", "edit");
  const canCreateGroup = myScope !== "staff"; // only managers/owners create custom groups

  const myUid = me?.uid || me?.id || null;
  const myStaff = useMemo(
    () => staff.find((s) => (s.adminUid && myUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())) || null,
    [staff, me, myUid]
  );
  const myId = myStaff?.id || myUid || "owner";
  const myName = myStaff?.displayName || myStaff?.name || me?.name || me?.displayName || "Admin";
  // an EMPTY venueIds array must not hide every channel — fall back like an absent value
  const myVenueIds = (myStaff?.venueIds?.length) ? myStaff.venueIds : (me?.venueId && me.venueId !== "all" ? [me.venueId] : venues.map((v) => v.id));

  const [tab, setTab] = useState("announcements");

  // ── live data ──
  const [anns, setAnns] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [convos, setConvos] = useState([]); // custom groups
  useEffect(() => {
    if (!groupId) return;
    const u1 = onSnapshot(announcementsCol(groupId), (s) => setAnns(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setAnns([]));
    const u2 = onSnapshot(messagesCol(groupId), (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setMsgs([]));
    const u3 = onSnapshot(conversationsCol(groupId), (s) => setConvos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setConvos([]));
    return () => { u1(); u2(); u3(); };
  }, [groupId]);

  const nameOf = (id) => { const s = staff.find((x) => x.id === id); return s ? (s.displayName || s.name) : (id === myId ? myName : ""); };
  const contactable = useMemo(
    () => staff.filter((s) => s.id !== myId && (s.hasAdminLogin || s.adminUid)).sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || "")),
    [staff, myId]
  );

  // ── announcements ──
  const visibleAnns = useMemo(() => anns
    .filter((a) => a.scope === "all" || myVenueIds.includes(a.scope))
    .sort((a, b) => tsVal(b.at) - tsVal(a.at)), [anns, myVenueIds]);
  const [annForm, setAnnForm] = useState({ title: "", body: "", scope: "all", attachments: [] });
  const [annUploading, setAnnUploading] = useState(false);
  const annFileRef = useRef(null);
  const annFiles = async (e) => {
    const files = Array.from(e.target.files || []); if (annFileRef.current) annFileRef.current.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 25 * 1024 * 1024)) return showToast("Each file must be under 25 MB");
    setAnnUploading(true);
    try {
      for (const f of files) {
        const type = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "file";
        const r = storageRef(storage, `rgUploads/${groupId}/announcements/${Date.now()}_${f.name.replace(/[^\w.\-]/g, "_")}`);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        setAnnForm((p) => ({ ...p, attachments: [...(p.attachments || []), { url, type, name: f.name, size: f.size }] }));
      }
    } catch { showToast("Upload failed — check storage permissions"); }
    finally { setAnnUploading(false); }
  };
  const postAnnouncement = async () => {
    if (!annForm.body.trim() && !(annForm.attachments || []).length) return showToast("Write something or attach a file");
    try {
      await addDoc(announcementsCol(groupId), {
        title: annForm.title.trim(), body: annForm.body.trim(), scope: annForm.scope,
        venueName: annForm.scope === "all" ? "All venues" : (venues.find((v) => v.id === annForm.scope)?.name || ""),
        attachments: annForm.attachments || [],
        fromId: myId, fromName: myName, at: serverTimestamp(), readBy: [myId],
      });
      setAnnForm({ title: "", body: "", scope: "all", attachments: [] });
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

  // ── conversations (DMs + venue groups + custom groups) ──
  const convList = useMemo(() => {
    const list = [];
    // venue team groups (for each venue I belong to)
    venues.filter((v) => myVenueIds.includes(v.id)).forEach((v) => {
      list.push({ key: `venue_${v.id}`, kind: "venue", name: `${v.name} team` });
    });
    // custom groups I'm a member of
    convos.filter((c) => (c.memberIds || []).includes(myId)).forEach((c) => {
      list.push({ key: `grp_${c.id}`, kind: "group", name: c.name, members: c.memberIds || [] });
    });
    // 1:1 DMs derived from messages
    const dmMap = {};
    msgs.forEach((m) => {
      if (m.kind && m.kind !== "dm") return;
      if (m.fromId !== myId && m.toId !== myId) return;
      const otherId = m.fromId === myId ? m.toId : m.fromId;
      if (!otherId) return;
      if (!dmMap[otherId]) dmMap[otherId] = { key: convId(myId, otherId), kind: "dm", otherId, name: nameOf(otherId) || (m.fromId === myId ? m.toName : m.fromName) };
    });
    Object.values(dmMap).forEach((d) => list.push(d));
    // attach last message + unread per conversation
    return list.map((c) => {
      const cm = msgs.filter((m) => m.conv === c.key);
      const last = cm.reduce((a, m) => (!a || tsVal(m.at) > tsVal(a.at) ? m : a), null);
      const unread = cm.filter((m) => m.fromId !== myId && !(m.readBy || []).includes(myId)).length;
      return { ...c, last, unread };
    }).sort((a, b) => tsVal(b.last?.at) - tsVal(a.last?.at));
  }, [venues, myVenueIds, convos, msgs, myId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [activeKey, setActiveKey] = useState(null);
  const active = useMemo(() => convList.find((c) => c.key === activeKey) || null, [convList, activeKey]);
  const thread = useMemo(() => activeKey ? msgs.filter((m) => m.conv === activeKey).sort((a, b) => tsVal(a.at) - tsVal(b.at)) : [], [msgs, activeKey]);

  // seed for a brand-new DM not yet in convList (no messages sent); resolve the active conversation
  const [dmSeed, setDmSeed] = useState(null);
  const startDM = (s) => { setActiveKey(convId(myId, s.id)); setDmSeed(s); setPick(null); setTab("direct"); };
  const activeResolved = active || (dmSeed && activeKey === convId(myId, dmSeed.id) ? { key: activeKey, kind: "dm", otherId: dmSeed.id, name: dmSeed.displayName || dmSeed.name } : null);

  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [pick, setPick] = useState(null); // "dm" | "group" | null
  const [grpName, setGrpName] = useState("");
  const [grpMembers, setGrpMembers] = useState([]);
  const scrollRef = useRef(null);
  const fileRef = useRef(null);

  // mark incoming read on open
  useEffect(() => {
    if (!activeKey) return;
    thread.filter((m) => m.fromId !== myId && !(m.readBy || []).includes(myId))
      .forEach((m) => updateDoc(doc(messagesCol(groupId), m.id), { readBy: arrayUnion(myId) }).catch(() => {}));
  }, [activeKey, thread, myId, groupId]);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [thread.length, activeKey]);
  useEffect(() => { setDraft(""); setPendingFiles([]); }, [activeKey]); // clear composer when switching conversations

  const onFiles = async (e) => {
    const files = Array.from(e.target.files || []); if (fileRef.current) fileRef.current.value = "";
    if (!files.length) return;
    if (files.some((f) => f.size > 25 * 1024 * 1024)) return showToast("Each file must be under 25 MB");
    setUploading(true);
    try {
      for (const f of files) {
        const type = f.type.startsWith("image/") ? "image" : f.type.startsWith("video/") ? "video" : "file";
        const r = storageRef(storage, `rgUploads/${groupId}/messages/${Date.now()}_${f.name.replace(/[^\w.\-]/g, "_")}`);
        await uploadBytes(r, f);
        const url = await getDownloadURL(r);
        setPendingFiles((p) => [...p, { url, type, name: f.name, size: f.size }]);
      }
    } catch { showToast("Upload failed — check storage permissions"); }
    finally { setUploading(false); }
  };

  const send = async () => {
    if (!canPost) return; // messages:view users are read-only
    if ((!draft.trim() && !pendingFiles.length) || !activeResolved) return;
    const base = { conv: activeResolved.key, kind: activeResolved.kind, fromId: myId, fromName: myName, text: draft.trim(), attachments: pendingFiles, at: serverTimestamp(), readBy: [myId] };
    if (activeResolved.kind === "dm") { base.toId = activeResolved.otherId; base.toName = activeResolved.name || nameOf(activeResolved.otherId); }
    try { await addDoc(messagesCol(groupId), base); setDraft(""); setPendingFiles([]); }
    catch { showToast("Could not send"); }
  };

  const createGroup = async () => {
    if (!grpName.trim()) return showToast("Name the group");
    if (!grpMembers.length) return showToast("Pick at least one member");
    try {
      const members = Array.from(new Set([...grpMembers, myId]));
      const ref = await addDoc(conversationsCol(groupId), {
        name: grpName.trim(), type: "group", memberIds: members,
        memberNames: members.map(nameOf), createdBy: myId, createdByName: myName, createdAt: serverTimestamp(),
      });
      setActiveKey(`grp_${ref.id}`); setTab("direct"); setPick(null); setGrpName(""); setGrpMembers([]);
      showToast("Group created");
    } catch { showToast("Could not create group"); }
  };

  const totalUnread = convList.reduce((a, c) => a + c.unread, 0);
  const headerSub = activeResolved?.kind === "venue" ? "Venue team" : activeResolved?.kind === "group" ? `${(activeResolved.members || []).length} members` : "";

  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[["announcements", "Announcements"], ["direct", `Messages${totalUnread ? ` (${totalUnread})` : ""}`]].map(([id, l]) => (
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
              <div className="form-group">
                <label className="form-label">Attachments (optional)</label>
                <input ref={annFileRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: "none" }} onChange={annFiles} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <button type="button" className="btn btn-sm" onClick={() => annFileRef.current?.click()} disabled={annUploading}>{annUploading ? "Uploading…" : "📎 Add image / file"}</button>
                  {(annForm.attachments || []).map((a, i) => (
                    <span key={i} className="pill pill-gray" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                      {a.type === "image" ? "🖼" : a.type === "video" ? "🎬" : "📎"} {a.name.slice(0, 18)}
                      <span style={{ cursor: "pointer" }} onClick={() => setAnnForm((p) => ({ ...p, attachments: p.attachments.filter((_, j) => j !== i) }))}>✕</span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="btn-row"><button className="btn btn-primary" onClick={postAnnouncement} disabled={annUploading}>Post announcement</button></div>
            </div>
          )}
          {visibleAnns.map((a) => {
            const acked = (a.readBy || []).includes(myId);
            return (
              <div key={a.id} className="card" style={{ marginBottom: 12 }}>
                <div className="card-head">
                  <div>{a.title && <span className="card-title">{a.title}</span>}<span className="card-sub">{a.fromName} · {fmtTs(a.at)}</span></div>
                  <span className="pill pill-gray">{a.venueName || (a.scope === "all" ? "All venues" : "")}</span>
                </div>
                {a.body && <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}><Linkify text={a.body} /></div>}
                {(a.attachments || []).length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {a.attachments.map((att, i) => <Attachment key={i} a={att} mine={false} />)}
                  </div>
                )}
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

      {/* ── MESSAGES (DMs + groups) ── */}
      {tab === "direct" && (
        <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 14, height: "calc(100vh - 220px)", minHeight: 420 }}>
          {/* conversation list */}
          <div className="card" style={{ padding: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ padding: 12, borderBottom: "0.5px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: 13 }}>Conversations</strong>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-sm btn-primary" onClick={() => setPick("dm")}>+ DM</button>
                {canCreateGroup && <button className="btn btn-sm" onClick={() => { setGrpMembers([]); setGrpName(""); setPick("group"); }}>+ Group</button>}
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {convList.map((t) => (
                <button key={t.key} onClick={() => setActiveKey(t.key)}
                  className="staff-meta-row" style={{ width: "100%", textAlign: "left", gap: 10, padding: "10px 12px", borderBottom: "0.5px solid var(--gray-light)", background: activeKey === t.key ? "var(--gray-light)" : "transparent", cursor: "pointer", border: "none" }}>
                  <div className="staff-avatar" style={{ width: 34, height: 34, fontSize: 12, marginBottom: 0, background: t.kind === "dm" ? undefined : "var(--ink)" }}>{t.kind === "dm" ? initials({ name: t.name }) : (t.kind === "venue" ? "🏠" : "👥")}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between" }}>{t.name}{t.unread > 0 && <span className="pill pill-red" style={{ fontSize: 10 }}>{t.unread}</span>}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last ? `${t.last.fromId === myId ? "You: " : ""}${t.last.text || (t.last.attachments?.length ? "📎 attachment" : "")}` : (t.kind === "venue" ? "Team channel" : "No messages yet")}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* thread view */}
          <div className="card" style={{ padding: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {activeResolved ? (
              <>
                <div style={{ padding: 12, borderBottom: "0.5px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="staff-avatar" style={{ width: 34, height: 34, fontSize: 12, marginBottom: 0, background: activeResolved.kind === "dm" ? undefined : "var(--ink)" }}>{activeResolved.kind === "dm" ? initials({ name: activeResolved.name }) : (activeResolved.kind === "venue" ? "🏠" : "👥")}</div>
                  <div><div style={{ fontSize: 14, fontWeight: 600 }}>{activeResolved.name}</div>{headerSub && <div style={{ fontSize: 11, color: "var(--gray)" }}>{headerSub}</div>}</div>
                </div>
                <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  {thread.map((m) => {
                    const mine = m.fromId === myId;
                    const showName = !mine && activeResolved.kind !== "dm";
                    return (
                      <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "74%" }}>
                        {showName && <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 2, marginLeft: 4 }}>{m.fromName}</div>}
                        <div style={{ background: mine ? "var(--red)" : "var(--gray-light)", color: mine ? "#fff" : "var(--ink)", padding: "8px 11px", borderRadius: 12, fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                          {m.text && <Linkify text={m.text} mine={mine} />}
                          {(m.attachments || []).map((a, i) => <Attachment key={i} a={a} mine={mine} />)}
                        </div>
                        <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 2, textAlign: mine ? "right" : "left" }}>{fmtTs(m.at)}</div>
                      </div>
                    );
                  })}
                  {thread.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", margin: "auto" }}>Say hello 👋</div>}
                </div>
                {pendingFiles.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", padding: "8px 10px", borderTop: "0.5px solid var(--border)" }}>
                    {pendingFiles.map((a, i) => (
                      <span key={i} className="pill pill-gray" style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                        {a.type === "image" ? "🖼" : a.type === "video" ? "🎬" : "📎"} {a.name.slice(0, 18)}
                        <span style={{ cursor: "pointer" }} onClick={() => setPendingFiles((p) => p.filter((_, j) => j !== i))}>✕</span>
                      </span>
                    ))}
                  </div>
                )}
                {canPost ? (
                  <div style={{ padding: 10, borderTop: "0.5px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
                    <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: "none" }} onChange={onFiles} />
                    <button className="btn btn-sm" title="Attach photo / video / document" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? "…" : "📎"}</button>
                    <input className="form-input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type a message…" onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send())} />
                    <button className="btn btn-primary" onClick={send} disabled={uploading}>Send</button>
                  </div>
                ) : (
                  <div style={{ padding: 10, borderTop: "0.5px solid var(--border)", fontSize: 12, color: "var(--gray)", textAlign: "center" }}>You have read‑only access to messages.</div>
                )}
              </>
            ) : (
              <div style={{ margin: "auto", textAlign: "center", color: "var(--gray)", fontSize: 13 }}>Select a conversation, or start a DM / group.</div>
            )}
          </div>
        </div>
      )}

      {/* DM recipient picker */}
      {pick === "dm" && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          <div className="rg-modal" style={{ maxWidth: 420 }}>
            <div className="modal-head"><span className="modal-title">New message</span><button className="modal-close" onClick={() => setPick(null)}>✕</button></div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>Only people with a website login are shown.</div>
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {contactable.map((s) => (
                <button key={s.id} onClick={() => startDM(s)} className="staff-meta-row" style={{ width: "100%", textAlign: "left", gap: 10, padding: "9px 6px", borderBottom: "0.5px solid var(--gray-light)", background: "transparent", border: "none", cursor: "pointer" }}>
                  <div className="staff-avatar" style={{ width: 32, height: 32, fontSize: 12, marginBottom: 0 }}>{initials(s)}</div>
                  <div><div style={{ fontSize: 13, fontWeight: 600 }}>{s.displayName || s.name}</div><div style={{ fontSize: 11, color: "var(--gray)" }}>{s.role} · {(s.venueNames || []).join(", ")}</div></div>
                </button>
              ))}
              {contactable.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: 12 }}>No one has a website login yet.</div>}
            </div>
          </div>
        </div>
      )}

      {/* Group create */}
      {pick === "group" && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setPick(null)}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><span className="modal-title">New group</span><button className="modal-close" onClick={() => setPick(null)}>✕</button></div>
            <div className="form-group"><label className="form-label">Group name</label><input className="form-input" value={grpName} onChange={(e) => setGrpName(e.target.value)} placeholder="e.g. Closing crew" /></div>
            <div className="form-group"><label className="form-label">Members ({grpMembers.length})</label>
              <div style={{ maxHeight: "44vh", overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: 8 }}>
                {contactable.map((s) => {
                  const on = grpMembers.includes(s.id);
                  return (
                    <label key={s.id} className="staff-meta-row" style={{ gap: 10, padding: "8px 10px", borderBottom: "0.5px solid var(--gray-light)", cursor: "pointer" }}>
                      <input type="checkbox" checked={on} onChange={() => setGrpMembers((p) => on ? p.filter((x) => x !== s.id) : [...p, s.id])} />
                      <div className="staff-avatar" style={{ width: 28, height: 28, fontSize: 11, marginBottom: 0 }}>{initials(s)}</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{s.displayName || s.name}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}</div></div>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="btn-row"><button className="btn btn-primary" onClick={createGroup}>Create group</button><button className="btn" onClick={() => setPick(null)}>Cancel</button></div>
          </div>
        </div>
      )}
    </>
  );
}
