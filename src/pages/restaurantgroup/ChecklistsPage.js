import React, { useEffect, useMemo, useState } from "react";
import { updateDoc, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { RefImageViewer, RefImageEditor } from "./RefImages";
import { RichItemList, RichText } from "./RichItems";
import PrepListPanel from "./PrepListPanel";
import ChecklistAssignmentDetail from "./ChecklistAssignmentDetail";
import { trainingStatusPill, progressColor } from "./rgUtils";

const hasText = (h) => (h || "").replace(/<[^>]*>/g, "").trim().length > 0;

const TYPES = ["All checklists", "Opening", "Closing", "Cleaning", "Prep"];
const EDIT_TYPES = ["Opening", "Closing", "Cleaning", "Prep"];
const WEEKDAYS = [["mon", "Mon"], ["tue", "Tue"], ["wed", "Wed"], ["thu", "Thu"], ["fri", "Fri"], ["sat", "Sat"], ["sun", "Sun"]];
const todayKey = () => WEEKDAYS[(new Date().getDay() + 6) % 7][0];
const dayLabel = (days) => {
  if (!days || !days.length || days.length === 7) return "Daily";
  const ordered = WEEKDAYS.filter(([k]) => days.includes(k)).map(([, l]) => l);
  return ordered.join(", ");
};
const AREAS = ["FOH", "BOH", "All"];
const todayStr = () => new Date().toISOString().slice(0, 10);
const pushHist = (c) => {
  const done = (c.checked || []).filter(Boolean).length;
  if (!done) return c.history || [];
  return [...(c.history || []), { date: c.checkedDate || todayStr(), done, total: (c.items || []).length }].slice(-60);
};
const areaOf = (c) => c.area || (/\bboh\b|kitchen|grill|fry|wash|prep|cook|dressing/i.test(c.title || "") ? "BOH" : /\bfoh\b|floor|barista|bar|counter|service|opening|closing/i.test(c.title || "") ? "FOH" : "All");
const nowHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const fmt12 = (t) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); const ap = h >= 12 ? "pm" : "am"; const h12 = h % 12 || 12; return `${h12}:${String(m).padStart(2, "0")}${ap}`; };
const blankForm = (venueId) => ({ id: null, title: "", sub: "", venueId: venueId || "", type: "Opening", area: "FOH", stationId: "", time: "", items: [], days: [], images: [] });

export default function ChecklistsPage() {
  const { groupId, venues, staff, checklists, checklistAssignments, stations, selectedVenue, showToast, can, me } = useRG();
  const canEdit = can("checklists", "edit");
  const [venueTab, setVenueTab] = useState(selectedVenue === "all" ? (venues[0]?.id || "") : selectedVenue);
  const [typeFilter, setTypeFilter] = useState("All checklists");
  const [dayFilter, setDayFilter] = useState("all"); // "all" | "today" | weekday key
  const [areaFilter, setAreaFilter] = useState("all"); // all | foh | boh
  const [openMyId, setOpenMyId] = useState(null);

  // identity → which staff doc is this login, and are they management?
  const myUid = me?.uid || me?.id;
  const myStaff = useMemo(() => staff.find((s) => (s.adminUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())), [staff, myUid, me]);
  const isMgr = ["owner", "storeAdmin", "manager"].includes(me?.groupRole);
  const myChecklistAssignments = useMemo(() => myStaff ? checklistAssignments.filter((a) => a.staffId === myStaff.id) : [], [myStaff, checklistAssignments]);
  const openMyAssignment = useMemo(() => checklistAssignments.find((a) => a.id === openMyId) || null, [checklistAssignments, openMyId]);

  useEffect(() => {
    if (selectedVenue !== "all") setVenueTab(selectedVenue);
    else if (!venueTab && venues[0]) setVenueTab(venues[0].id);
  }, [selectedVenue, venues]); // eslint-disable-line

  const dayMatch = (c) => {
    if (dayFilter === "all") return true;
    const target = dayFilter === "today" ? todayKey() : dayFilter;
    const ds = c.days && c.days.length ? c.days : null; // null = daily (every day)
    return ds === null || ds.includes(target);
  };

  const areaMatch = (c) => {
    if (areaFilter === "all") return true;
    const a = areaOf(c);
    return areaFilter === "foh" ? (a === "FOH" || a === "All") : (a === "BOH" || a === "All");
  };

  const shown = useMemo(() => checklists.filter(
    (c) => c.venueId === venueTab && (typeFilter === "All checklists" || c.type === typeFilter) && dayMatch(c) && areaMatch(c)
  ).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")), [checklists, venueTab, typeFilter, dayFilter, areaFilter]); // eslint-disable-line

  // checks belong to a date — if it's a new day, they auto-reset (and the prior day is archived to history)
  const effChecks = (c) => (c.checkedDate === todayStr() ? (c.checked || []) : []);

  const toggle = async (c, idx) => {
    if (!canEdit) return;
    const today = todayStr();
    const rolled = c.checkedDate && c.checkedDate !== today;
    const base = rolled ? c.items.map(() => false) : (Array.isArray(c.checked) ? [...c.checked] : c.items.map(() => false));
    base[idx] = !base[idx];
    const patch = { checked: base, checkedDate: today };
    if (rolled) patch.history = pushHist(c); // archive yesterday's result
    try { await updateDoc(doc(venueCol(groupId, c.venueId, "checklists"), c.id), patch); }
    catch { showToast("Could not save"); }
  };

  const reset = async (c) => {
    try { await updateDoc(doc(venueCol(groupId, c.venueId, "checklists"), c.id), { checked: c.items.map(() => false), checkedDate: todayStr(), history: pushHist(c) }); showToast("Checklist reset & logged"); }
    catch { showToast("Could not reset"); }
  };

  const doneCount = (c) => effChecks(c).filter(Boolean).length;

  const [histFor, setHistFor] = useState(null);

  // ── Create / edit / delete ──
  const [editor, setEditor] = useState(null);
  const setEd = (k) => (e) => setEditor((p) => ({ ...p, [k]: e.target.value }));
  const openNew = () => setEditor(blankForm(venueTab));
  const openEdit = (c) => setEditor({ id: c.id, title: c.title, sub: c.sub || "", venueId: c.venueId, type: c.type, area: areaOf(c), stationId: c.stationId || "", time: c.time || "", items: c.items || [], days: c.days || [], images: c.images || [] });
  const toggleDay = (d) => setEditor((p) => ({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d] }));

  const saveChecklist = async () => {
    if (!editor.title.trim()) return showToast("Title required");
    const items = (editor.items || []).filter(hasText);
    if (!items.length) return showToast("Add at least one item");
    const venue = venues.find((v) => v.id === editor.venueId);
    if (!venue) return showToast("Pick a venue");
    const stn = stations.find((s) => s.id === editor.stationId && s.venueId === venue.id);
    const payload = { title: editor.title.trim(), sub: editor.sub.trim(), venueId: venue.id, venue: venue.name, type: editor.type, area: editor.area || "All", stationId: stn?.id || "", station: stn?.name || "", time: editor.time || "", items, days: editor.days || [], images: editor.images || [] };
    try {
      if (editor.id) {
        const existing = checklists.find((c) => c.id === editor.id);
        // preserve today's ticks by item CONTENT, not by index — so reorder/delete can't move a
        // tick onto a different item. (If the same item text appears twice, only the first is kept.)
        const tickedText = new Set((existing?.items || []).filter((_, i) => (existing?.checked || [])[i]));
        const checked = items.map((it) => tickedText.has(it));
        await updateDoc(doc(venueCol(groupId, venue.id, "checklists"), editor.id), { ...payload, checked });
        showToast("Checklist updated");
      } else {
        await addDoc(venueCol(groupId, venue.id, "checklists"), { ...payload, checked: items.map(() => false), createdAt: serverTimestamp() });
        showToast("Checklist created");
      }
      setEditor(null);
    } catch { showToast("Could not save checklist"); }
  };

  const removeChecklist = async () => {
    try { await deleteDoc(doc(venueCol(groupId, editor.venueId, "checklists"), editor.id)); showToast("Checklist deleted"); setEditor(null); }
    catch { showToast("Could not delete"); }
  };

  // ── STAFF VIEW: only the checklists assigned to this person, their own copy ──
  if (!isMgr) {
    const myVenueIds = myStaff?.venueIds || [];
    return (
      <>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-head">
            <span className="card-title">My checklists</span>
            <span className="card-sub">{myStaff ? "Tick off the checklists assigned to you" : "No staff profile is linked to your login yet"}</span>
          </div>
          {myStaff && myChecklistAssignments.length === 0 && <div style={{ fontSize: 13, color: "var(--gray)" }}>No checklists assigned to you yet.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
            {myChecklistAssignments.map((a) => {
              const total = a.itemsTotal || (a.checks || []).length;
              const done = (a.checks || []).filter(Boolean).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              return (
                <div key={a.id} className="training-module" onClick={() => setOpenMyId(a.id)}>
                  <div className="module-title">{a.checklistTitle}</div>
                  <div className="module-meta">{a.venue}{a.area ? ` · ${a.area}` : ""}{a.station ? ` · ${a.station}` : ""}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status || "Not started"}</span>
                    <span>{done}/{total}</span>
                  </div>
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${pct}%`, background: progressColor(pct) }} /></div>
                  <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 6 }}>Click to open & tick each item</div>
                </div>
              );
            })}
          </div>
        </div>

        {myVenueIds.map((vid) => (
          <PrepListPanel key={vid} groupId={groupId} venueId={vid} venueLabel={venues.find((v) => v.id === vid)?.name} canEdit={false} myStaffId={myStaff?.id} showToast={showToast} />
        ))}

        {openMyAssignment && (
          <ChecklistAssignmentDetail assignment={openMyAssignment} liveChecklist={checklists.find((c) => c.id === openMyAssignment.checklistId) || checklists.find((c) => c.title === openMyAssignment.checklistTitle && c.venueId === openMyAssignment.venueId)} groupId={groupId} canTick showToast={showToast} onClose={() => setOpenMyId(null)} />
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          {venues.map((v) => (
            <button key={v.id} className={`tab ${venueTab === v.id ? "active" : ""}`} onClick={() => setVenueTab(v.id)}>
              {v.type === "CK" ? "Central Kitchen" : v.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {[["all", "All"], ["foh", "FOH"], ["boh", "BOH"]].map(([id, l]) => (
            <button key={id} className="btn btn-sm" onClick={() => setAreaFilter(id)}
              style={areaFilter === id ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{l}</button>
          ))}
          <select className="form-input" style={{ width: 130 }} value={dayFilter} onChange={(e) => setDayFilter(e.target.value)}>
            <option value="all">All days</option>
            <option value="today">Today ({dayLabel([todayKey()])})</option>
            {WEEKDAYS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select className="form-input" style={{ width: 150 }} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={openNew}>+ New checklist</button>}
        </div>
      </div>

      <PrepListPanel groupId={groupId} venueId={venueTab} canEdit={canEdit} showToast={showToast}
        myStaffId={myStaff?.id}
        staffList={staff.filter((s) => (s.venueIds || []).includes(venueTab)).map((s) => ({ id: s.id, name: s.displayName || s.name }))} />

      <div className="grid-2">
        {shown.map((c) => {
          const eff = effChecks(c);
          const done = eff.filter(Boolean).length;
          const total = c.items.length;
          const pillCls = done === total && total > 0 ? "pill-green" : "pill-amber";
          const dueNow = c.time && nowHHMM() >= c.time && done < total;
          return (
            <div key={c.id} className="card" style={dueNow ? { borderColor: "var(--amber)", boxShadow: "0 0 0 1px var(--amber)" } : undefined}>
              <div className="card-head">
                <div>
                  <span className="card-title">{c.title}</span><span className="card-sub">{c.sub}</span>
                  {c.time && <span className="pill pill-blue" style={{ marginLeft: 8 }}>⏰ {fmt12(c.time)}</span>}
                  <span className="pill pill-gray" style={{ marginLeft: 4 }}>{areaOf(c)}</span>
                  {c.station && <span className="pill pill-blue" style={{ marginLeft: 4 }}>{c.station}</span>}
                  <span className={`pill ${dayLabel(c.days) === "Daily" ? "pill-gray" : "pill-blue"}`} style={{ marginLeft: 4 }}>{dayLabel(c.days)}</span>
                  {dueNow && <span className="pill pill-amber" style={{ marginLeft: 4 }}>Due now</span>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`pill ${pillCls}`}>{done}/{total} done</span>
                  <button className="btn btn-sm" onClick={() => setHistFor(c)}>History</button>
                  {canEdit && <button className="btn btn-sm" onClick={() => openEdit(c)}>Edit</button>}
                  {canEdit && <button className="btn btn-sm" onClick={() => reset(c)}>Reset</button>}
                </div>
              </div>
              <div>
                {c.items.map((item, idx) => {
                  const checked = eff[idx];
                  return (
                    <div key={idx} className="checklist-item">
                      <div className={`check-box ${checked ? "checked" : ""}`} onClick={() => toggle(c, idx)} />
                      <RichText html={item} className={`check-text ${checked ? "done" : ""}`} />
                    </div>
                  );
                })}
              </div>
              <RefImageViewer images={c.images} />
            </div>
          );
        })}
        {shown.length === 0 && <div style={{ color: "var(--gray)", fontSize: 13 }}>No checklists for this venue / filter.</div>}
      </div>

      {histFor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setHistFor(null)}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><span className="modal-title">History — {histFor.title}</span><button className="modal-close" onClick={() => setHistFor(null)}>✕</button></div>
            <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>Auto-resets daily; each day's result is logged here.</div>
            <table className="data-table">
              <thead><tr><th>Date</th><th>Completed</th></tr></thead>
              <tbody>
                {[...(histFor.history || [])].reverse().map((h, i) => (
                  <tr key={i}><td>{h.date}</td><td>{h.done}/{h.total}{h.done >= h.total && h.total > 0 ? " ✓" : ""}</td></tr>
                ))}
                {(!histFor.history || !histFor.history.length) && <tr><td colSpan={2} style={{ color: "var(--gray)" }}>No history yet — logged when a new day starts or on reset.</td></tr>}
              </tbody>
            </table>
            <div className="btn-row"><button className="btn" onClick={() => setHistFor(null)}>Close</button></div>
          </div>
        </div>
      )}

      {editor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">{editor.id ? "Edit checklist" : "New checklist"}</span><button className="modal-close" onClick={() => setEditor(null)}>✕</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={editor.title} onChange={setEd("title")} placeholder="7:15am Opening — FOH" /></div>
              <div className="form-group"><label className="form-label">Subtitle</label><input className="form-input" value={editor.sub} onChange={setEd("sub")} placeholder="Mad Benji · Daily" /></div>
              <div className="form-group"><label className="form-label">Venue</label>
                <select className="form-input" value={editor.venueId} onChange={setEd("venueId")}>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Type</label>
                <select className="form-input" value={editor.type} onChange={setEd("type")}>{EDIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Area (FOH / BOH / All)</label>
                <select className="form-input" value={editor.area} onChange={setEd("area")}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Station (optional)</label>
                <select className="form-input" value={editor.stationId} onChange={setEd("stationId")}>
                  <option value="">— None —</option>
                  {stations.filter((s) => s.venueId === editor.venueId).map((s) => <option key={s.id} value={s.id}>{s.name} · {s.area}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Scheduled time (optional)</label>
                <input type="time" className="form-input" value={editor.time} onChange={setEd("time")} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Runs on (leave all off = every day)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {WEEKDAYS.map(([k, l]) => (
                  <button key={k} type="button" className="btn btn-sm" onClick={() => toggleDay(k)}
                    style={editor.days.includes(k) ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{l}</button>
                ))}
              </div>
            </div>
            <div className="form-group"><label className="form-label">Items — add each separately, format with the toolbar</label>
              <RichItemList value={editor.items} onChange={(items) => setEditor((p) => ({ ...p, items }))} />
            </div>
            <RefImageEditor value={editor.images} onChange={(imgs) => setEditor((p) => ({ ...p, images: imgs }))} folder={`restaurantGroups/${groupId}/refimages/checklists`} showToast={showToast} />
            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveChecklist}>{editor.id ? "Save checklist" : "Create checklist"}</button>
              {editor.id && <button className="btn btn-danger" onClick={removeChecklist}>Delete</button>}
              <button className="btn" onClick={() => setEditor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
