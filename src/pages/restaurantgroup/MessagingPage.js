import React, { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, where, serverTimestamp, arrayUnion } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../../firebase";
import { useRG } from "./RGContext";
import { announcementsCol, messagesCol, conversationsCol, convId, staffInVenue, venueDoc } from "../../utils/restaurantGroupPaths";
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
  const { groupId, staff, venues, me, myScope, groupRole, can, showToast, noteErr } = useRG();
  const canPost = can("messages", "edit");
  const canCreateGroup = myScope !== "staff"; // only managers/owners create custom groups
  // Who may add/remove group-chat members (Job 5): owner/storeAdmin, or an explicit
  // messages == 'approve' grant in User Management — mirrors rgCanEditChatMembers in
  // the rules exactly. Never hardcoded per person; the owner decides.
  const canEditMembers = ["owner", "storeAdmin"].includes(groupRole) || can("messages", "approve");

  const myUid = me?.uid || me?.id || null;
  const myStaff = useMemo(
    () => staff.find((s) => (s.adminUid && myUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())) || null,
    [staff, me, myUid]
  );
  const myId = myStaff?.id || myUid || "owner";
  const myName = myStaff?.displayName || myStaff?.name || me?.name || me?.displayName || "Admin";
  // an EMPTY venueIds array must not hide every channel — fall back like an absent value
  // owner ruling: a STAFF-tier user with no venues sees NO team channels (the old
  // fallback showed ALL venues' channels). Managers/owners keep the all-venues fallback
  // — an owner often has no staff doc at all and must still see every channel.
  const myVenueIds = (myStaff?.venueIds?.length) ? myStaff.venueIds : (me?.venueId && me.venueId !== "all" ? [me.venueId] : (myScope === "staff" ? [] : venues.map((v) => v.id)));

  const [tab, setTab] = useState("announcements");

  // ── live data ──
  const [anns, setAnns] = useState([]);
  const [msgs, setMsgs] = useState([]);
  const [convos, setConvos] = useState([]); // custom groups
  useEffect(() => {
    if (!groupId) return;
    const u1 = onSnapshot(announcementsCol(groupId), (s) => setAnns(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => { setAnns([]); noteErr("announcements"); });
    const u2 = onSnapshot(messagesCol(groupId), (s) => setMsgs(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => { setMsgs([]); noteErr("messages"); });
    // Job 5: only ask for conversations I am a MEMBER of (memberUids carries auth uids)
    // — matches the member-only read rule; a whole-collection listen would be denied.
    const u3 = myUid
      ? onSnapshot(query(conversationsCol(groupId), where("memberUids", "array-contains", myUid)),
          (s) => setConvos(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => { setConvos([]); noteErr("conversations"); })
      : undefined;
    return () => { u1(); u2(); if (u3) u3(); };
  }, [groupId, myUid]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Venue channel membership (WhatsApp-style, owner ruling) ── default = the venue's
  // staff, with per-channel OVERRIDES on the venue doc: chatRemovedIds[] (taken out of
  // the channel — stays out even though they remain venue staff) and chatExtraIds[]
  // (added in from outside the venue). New venue staff auto-join unless previously
  // removed. Declared BEFORE convList — the memo below calls it during render.
  const venueChannelMemberIds = (v) => {
    const removed = new Set(v.chatRemovedIds || []);
    const base = staff.filter((s) => staffInVenue(s, v.id) && s.status !== "Left").map((s) => s.id);
    const extra = (v.chatExtraIds || []).filter((id) => !removed.has(id) && !base.includes(id));
    return [...base.filter((id) => !removed.has(id)), ...extra];
  };

  // ── conversations (DMs + venue groups + custom groups) ──
  const convList = useMemo(() => {
    const list = [];
    // venue team groups — membership honours the channel overrides: removed members
    // lose the channel (canEditMembers holders keep their own venues' channels so they
    // can manage them); chatExtraIds members gain it even from outside the venue
    venues.forEach((v) => {
      const memberIds = venueChannelMemberIds(v);
      const visible = memberIds.includes(myId)
        || (myVenueIds.includes(v.id) && (canEditMembers || !(v.chatRemovedIds || []).includes(myId)));
      if (visible) list.push({ key: `venue_${v.id}`, kind: "venue", name: `${v.name} team`, venueRec: v });
    });
    // custom groups I'm a member of (the query already scopes by memberUids; the
    // memberIds check stays as a belt for owner-created legacy shapes)
    convos.filter((c) => (c.memberIds || []).includes(myId) || (c.memberUids || []).includes(myUid)).forEach((c) => {
      list.push({ key: `grp_${c.id}`, kind: "group", name: c.name, members: c.memberIds || [], convo: c });
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
  }, [venues, myVenueIds, convos, msgs, myId, staff, canEditMembers]); // eslint-disable-line react-hooks/exhaustive-deps

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
  useEffect(() => { setDraft(""); setPendingFiles([]); setGroupInfo(false); }, [activeKey]); // clear composer + info popup when switching conversations

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

  // Member id → auth uid (Job 5). Members are staff ids (picked from `contactable`,
  // all of whom hold a login) — except a creator with no staff record (the owner),
  // whose member id IS their auth uid already.
  const uidForMember = (mid) => {
    const s = staff.find((x) => x.id === mid);
    if (s) return s.adminUid || null; // staff without a resolvable uid can't be granted rules access
    return mid || null; // not a staff record — an owner/admin uid used as the member id
  };
  const memberUidsOf = (members) => Array.from(new Set(members.map(uidForMember).filter(Boolean)));

  const createGroup = async () => {
    if (!grpName.trim()) return showToast("Name the group");
    if (!grpMembers.length) return showToast("Pick at least one member");
    try {
      const members = Array.from(new Set([...grpMembers, myId]));
      // memberUids drives the member-only read rule + both apps' scoped queries;
      // the creator's own uid is always present so the group can't orphan itself.
      const memberUids = Array.from(new Set([...memberUidsOf(members), ...(myUid ? [myUid] : [])]));
      const ref = await addDoc(conversationsCol(groupId), {
        name: grpName.trim(), type: "group", memberIds: members,
        memberNames: members.map(nameOf), memberUids,
        createdBy: myId, createdByName: myName, createdByUid: myUid || "", createdAt: serverTimestamp(),
      });
      setActiveKey(`grp_${ref.id}`); setTab("direct"); setPick(null); setGrpName(""); setGrpMembers([]);
      showToast("Group created");
    } catch { showToast("Could not create group"); }
  };

  // ── Group info (WhatsApp-style): header click → members popup. Group chats offer
  // per-member Remove + Add/edit (canEditMembers); venue team channels list the
  // venue's staff read-only (membership comes from Staff Directory venues). ──
  const [groupInfo, setGroupInfo] = useState(false);
  const [infoTab, setInfoTab] = useState("members"); // members | media | docs (WhatsApp-style)
  const openGroupInfo = () => { setInfoTab("members"); setGroupInfo(true); };
  const fmtSize = (n) => (!n ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  const removeVenueMember = async (v, mid) => {
    const chatRemovedIds = Array.from(new Set([...(v.chatRemovedIds || []), mid]));
    const chatExtraIds = (v.chatExtraIds || []).filter((x) => x !== mid);
    try { await updateDoc(venueDoc(groupId, v.id), { chatRemovedIds, chatExtraIds }); showToast("Member removed from channel"); }
    catch { showToast("Could not remove member"); }
  };
  const addVenueMembers = async (v, ids) => {
    const chatRemovedIds = (v.chatRemovedIds || []).filter((x) => !ids.includes(x));
    const inVenue = (id) => staff.some((s) => s.id === id && staffInVenue(s, v.id));
    const chatExtraIds = Array.from(new Set([...(v.chatExtraIds || []).filter((x) => !chatRemovedIds.includes(x)), ...ids.filter((id) => !inVenue(id))]));
    try { await updateDoc(venueDoc(groupId, v.id), { chatRemovedIds, chatExtraIds }); showToast(`${ids.length} member${ids.length === 1 ? "" : "s"} added`); }
    catch { showToast("Could not add members"); }
  };
  const [editVenueRec, setEditVenueRec] = useState(null); // venue whose channel members are being added
  const removeMemberDirect = async (c, mid) => {
    const members = (c.memberIds || []).filter((x) => x !== mid);
    if (!members.length) return showToast("A group needs at least one member");
    const memberUids = memberUidsOf(members);
    if (!memberUids.length) return showToast("At least one member needs a login");
    try {
      await updateDoc(doc(conversationsCol(groupId), c.id), {
        memberIds: members,
        memberNames: members.map((m) => nameOf(m) || (c.memberNames || [])[(c.memberIds || []).indexOf(m)] || ""),
        memberUids, updatedAt: serverTimestamp(),
      });
      showToast("Member removed");
    } catch { showToast("Could not remove member"); }
  };

  // ── Edit group members (Job 5) — WhatsApp-like: whoever is removed loses the
  // conversation (and, once the member-only rules are live, its history too). ──
  const [editConv, setEditConv] = useState(null); // conversation doc being edited
  // ADD-ONLY picker: existing members never appear here (removal lives on the Group
  // info Members tab) — the list is only people who are NOT in the group yet.
  const openEditMembers = (c) => { setEditConv(c); setGrpMembers([]); setPick("editMembers"); };
  const saveMembers = async () => {
    if (!editConv) return;
    if (!grpMembers.length) return showToast("Pick who to add");
    const members = Array.from(new Set([...(editConv.memberIds || []), ...grpMembers]));
    const memberUids = memberUidsOf(members);
    if (!memberUids.length) return showToast("At least one member needs a login");
    try {
      await updateDoc(doc(conversationsCol(groupId), editConv.id), {
        memberIds: members, memberNames: members.map((m) => nameOf(m) || (editConv.memberNames || [])[(editConv.memberIds || []).indexOf(m)] || ""),
        memberUids, updatedAt: serverTimestamp(),
      });
      setPick(null); setEditConv(null); setGrpMembers([]);
      showToast(`${grpMembers.length} member${grpMembers.length === 1 ? "" : "s"} added`);
    } catch { showToast("Could not update members"); }
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
                  {/* WhatsApp-style: click the group/channel identity for group info (members) */}
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: activeResolved.kind !== "dm" ? "pointer" : "default", minWidth: 0 }}
                    title={activeResolved.kind !== "dm" ? "Click for group info" : undefined}
                    onClick={() => activeResolved.kind !== "dm" && openGroupInfo()}
                  >
                    <div className="staff-avatar" style={{ width: 34, height: 34, fontSize: 12, marginBottom: 0, background: activeResolved.kind === "dm" ? undefined : "var(--ink)" }}>{activeResolved.kind === "dm" ? initials({ name: activeResolved.name }) : (activeResolved.kind === "venue" ? "🏠" : "👥")}</div>
                    <div><div style={{ fontSize: 14, fontWeight: 600 }}>{activeResolved.name}</div>{(headerSub || activeResolved.kind !== "dm") && <div style={{ fontSize: 11, color: "var(--gray)" }}>{headerSub}{activeResolved.kind !== "dm" ? `${headerSub ? " · " : ""}click for group info` : ""}</div>}</div>
                  </div>
                  {/* Job 5: add/remove members live on the Group info popup (Members tab) */}
                  {activeResolved.kind === "group" && activeResolved.convo && canEditMembers && (
                    <button className="btn btn-sm" style={{ marginLeft: "auto" }} onClick={openGroupInfo}>Members</button>
                  )}
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

      {/* Group info (WhatsApp-style) — members of the open group/venue channel */}
      {groupInfo && activeResolved && activeResolved.kind !== "dm" && (() => {
        const isVenue = activeResolved.kind === "venue";
        const convo = !isVenue ? convos.find((c) => `grp_${c.id}` === activeResolved.key) : null;
        const vid = isVenue ? activeResolved.key.slice(6) : null;
        const vRec = isVenue ? venues.find((v) => v.id === vid) : null;
        const members = isVenue
          ? venueChannelMemberIds(vRec || { id: vid }).map((mid) => {
              const s = staff.find((x) => x.id === mid);
              return { id: mid, name: s ? (s.displayName || s.name) : (nameOf(mid) || "—"), role: s?.role || "" };
            }).sort((a, b) => a.name.localeCompare(b.name))
          : (convo?.memberIds || []).map((mid, i) => {
              const s = staff.find((x) => x.id === mid);
              return { id: mid, name: s ? (s.displayName || s.name) : ((convo.memberNames || [])[i] || nameOf(mid) || "Admin"), role: s ? (s.role || "") : "Admin login" };
            });
        // WhatsApp-style shared content: every attachment ever sent in this conversation
        const convAtts = msgs.filter((m) => m.conv === activeResolved.key)
          .flatMap((m) => (m.attachments || []).map((a) => ({ ...a, at: m.at, from: m.fromName || "" })))
          .sort((a, b) => tsVal(b.at) - tsVal(a.at));
        const mediaAtts = convAtts.filter((a) => a.type === "image" || a.type === "video");
        const docAtts = convAtts.filter((a) => a.type !== "image" && a.type !== "video");
        return (
          <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setGroupInfo(false)}>
            <div className="rg-modal" style={{ maxWidth: 440 }}>
              <div className="modal-head"><span className="modal-title">{activeResolved.name}</span><button className="modal-close" onClick={() => setGroupInfo(false)}>✕</button></div>
              <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>
                {isVenue
                  ? "Venue team channel — the venue's staff join automatically; you can add or remove anyone here"
                  : `Group${convo?.createdByName ? ` · created by ${convo.createdByName}` : ""}`}
                {" · "}{members.length} member{members.length === 1 ? "" : "s"}
              </div>
              <div className="tabs" style={{ marginBottom: 10 }}>
                {[["members", `Members (${members.length})`], ["media", `Media (${mediaAtts.length})`], ["docs", `Docs (${docAtts.length})`]].map(([id, l]) => (
                  <button key={id} className={`tab ${infoTab === id ? "active" : ""}`} onClick={() => setInfoTab(id)}>{l}</button>
                ))}
              </div>

              {infoTab === "members" && (
                <>
                  <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
                    {members.map((m) => (
                      <div key={m.id} className="staff-meta-row" style={{ gap: 10, padding: "7px 4px", borderBottom: "0.5px solid var(--gray-light)", justifyContent: "space-between" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <div className="staff-avatar" style={{ width: 30, height: 30, fontSize: 11, marginBottom: 0 }}>{initials({ name: m.name })}</div>
                          <span><div style={{ fontSize: 13, fontWeight: 600 }}>{m.name}{m.id === myId ? " (you)" : ""}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{m.role}</div></span>
                        </span>
                        {canEditMembers && members.length > 1 && (
                          <button className="btn btn-sm btn-danger" onClick={() => (isVenue ? removeVenueMember(vRec, m.id) : removeMemberDirect(convo, m.id))}>Remove</button>
                        )}
                      </div>
                    ))}
                    {members.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: 8 }}>No members found.</div>}
                  </div>
                  {canEditMembers && (isVenue ? vRec : convo) && (
                    <div className="btn-row" style={{ marginTop: 10 }}>
                      <button className="btn btn-primary" onClick={() => {
                        setGroupInfo(false);
                        if (isVenue) { setEditVenueRec(vRec); setGrpMembers([]); setPick("addVenueMembers"); }
                        else openEditMembers(convo);
                      }}>+ Add members</button>
                    </div>
                  )}
                </>
              )}

              {infoTab === "media" && (
                <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
                  {mediaAtts.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: 8 }}>No photos or videos shared yet.</div>}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(92px, 1fr))", gap: 6 }}>
                    {mediaAtts.map((a, i) => (
                      <div key={i} style={{ cursor: "pointer" }} title={`${a.name || ""}${a.from ? ` · ${a.from}` : ""} · ${fmtTs(a.at)}`} onClick={() => window.open(a.url, "_blank")}>
                        {a.type === "image"
                          ? <img src={a.url} alt={a.name} style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 8, display: "block" }} />
                          : <div style={{ width: "100%", height: 92, borderRadius: 8, background: "var(--gray-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🎬</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {infoTab === "docs" && (
                <div style={{ maxHeight: "48vh", overflowY: "auto" }}>
                  {docAtts.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: 8 }}>No documents shared yet.</div>}
                  {docAtts.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="staff-meta-row" style={{ gap: 10, padding: "8px 4px", borderBottom: "0.5px solid var(--gray-light)", textDecoration: "none", color: "var(--ink)" }}>
                      <span style={{ fontSize: 18 }}>📎</span>
                      <span style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name || "Document"}</div>
                        <div style={{ fontSize: 10, color: "var(--gray)" }}>{[a.from, fmtTs(a.at), fmtSize(a.size)].filter(Boolean).join(" · ")}</div>
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Edit group members (Job 5) — current members (removable) + everyone with a
          login (addable). Removing someone takes the chat off their screen; with the
          member-only rules live they lose the history too. */}
      {pick === "editMembers" && editConv && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && (setPick(null), setEditConv(null))}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><span className="modal-title">Add members — {editConv.name}</span><button className="modal-close" onClick={() => { setPick(null); setEditConv(null); }}>✕</button></div>
            <div className="form-group"><label className="form-label">Pick who to add ({grpMembers.length} selected)</label>
              <div style={{ maxHeight: "44vh", overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: 8 }}>
                {/* ONLY non-members — current members are managed (removed) on the Group
                    info Members tab, so they never clutter this list */}
                {contactable.filter((s) => !(editConv.memberIds || []).includes(s.id)).map((s) => {
                  const on = grpMembers.includes(s.id);
                  return (
                    <label key={s.id} className="staff-meta-row" style={{ gap: 10, padding: "8px 10px", borderBottom: "0.5px solid var(--gray-light)", cursor: "pointer" }}>
                      <input type="checkbox" checked={on} onChange={() => setGrpMembers((p) => on ? p.filter((x) => x !== s.id) : [...p, s.id])} />
                      <div className="staff-avatar" style={{ width: 28, height: 28, fontSize: 11, marginBottom: 0 }}>{initials(s)}</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600 }}>{s.displayName || s.name}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}</div></div>
                    </label>
                  );
                })}
                {contactable.filter((s) => !(editConv.memberIds || []).includes(s.id)).length === 0 && (
                  <div style={{ fontSize: 12, color: "var(--gray)", padding: 12 }}>Everyone with a login is already in this group.</div>
                )}
              </div>
            </div>
            <div className="btn-row"><button className="btn btn-primary" onClick={saveMembers}>Add</button><button className="btn" onClick={() => { setPick(null); setEditConv(null); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Add members to a VENUE channel — only people not already in the channel */}
      {pick === "addVenueMembers" && editVenueRec && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && (setPick(null), setEditVenueRec(null))}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><span className="modal-title">Add members — {editVenueRec.name} team</span><button className="modal-close" onClick={() => { setPick(null); setEditVenueRec(null); }}>✕</button></div>
            <div className="form-group"><label className="form-label">Pick who to add ({grpMembers.length} selected)</label>
              <div style={{ maxHeight: "44vh", overflowY: "auto", border: "0.5px solid var(--border)", borderRadius: 8 }}>
                {(() => {
                  // venue channels: membership is STAFF-based (base members join by staff
                  // record, no login needed) — so the picker offers every active staffer,
                  // not just login-holders like the custom-group picker (whose read rule is
                  // memberUids-scoped). A login-less member can't read messages until they
                  // get a login — same as any base member without one.
                  const current = new Set(venueChannelMemberIds(editVenueRec));
                  const candidates = staff
                    .filter((s) => s.status !== "Left" && !current.has(s.id))
                    .sort((a, b) => (a.displayName || a.name || "").localeCompare(b.displayName || b.name || ""));
                  return candidates.length ? candidates.map((s) => {
                    const on = grpMembers.includes(s.id);
                    return (
                      <label key={s.id} className="staff-meta-row" style={{ gap: 10, padding: "8px 10px", borderBottom: "0.5px solid var(--gray-light)", cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => setGrpMembers((p) => on ? p.filter((x) => x !== s.id) : [...p, s.id])} />
                        <div className="staff-avatar" style={{ width: 28, height: 28, fontSize: 11, marginBottom: 0 }}>{initials(s)}</div>
                        <div><div style={{ fontSize: 13, fontWeight: 600 }}>{s.displayName || s.name}</div><div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}</div></div>
                      </label>
                    );
                  }) : <div style={{ fontSize: 12, color: "var(--gray)", padding: 12 }}>Everyone is already in this channel.</div>;
                })()}
              </div>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={async () => { if (!grpMembers.length) return showToast("Pick who to add"); await addVenueMembers(editVenueRec, grpMembers); setPick(null); setEditVenueRec(null); setGrpMembers([]); }}>Add</button>
              <button className="btn" onClick={() => { setPick(null); setEditVenueRec(null); setGrpMembers([]); }}>Cancel</button>
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
