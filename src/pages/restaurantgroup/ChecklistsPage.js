import React, { useEffect, useMemo, useState } from "react";
import { updateDoc, addDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { RefImageViewer, RefImageEditor } from "./RefImages";
import { RichItemList, RichText } from "./RichItems";

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
const areaOf = (c) => c.area || (/\bboh\b|kitchen|grill|fry|wash|prep|cook|dressing/i.test(c.title || "") ? "BOH" : /\bfoh\b|floor|barista|bar|counter|service|opening|closing/i.test(c.title || "") ? "FOH" : "All");
const blankForm = (venueId) => ({ id: null, title: "", sub: "", venueId: venueId || "", type: "Opening", area: "FOH", items: [], days: [], images: [] });

export default function ChecklistsPage() {
  const { groupId, venues, checklists, selectedVenue, showToast, can } = useRG();
  const canEdit = can("checklists", "edit");
  const [venueTab, setVenueTab] = useState(selectedVenue === "all" ? (venues[0]?.id || "") : selectedVenue);
  const [typeFilter, setTypeFilter] = useState("All checklists");
  const [dayFilter, setDayFilter] = useState("all"); // "all" | "today" | weekday key
  const [areaFilter, setAreaFilter] = useState("all"); // all | foh | boh

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
  ), [checklists, venueTab, typeFilter, dayFilter, areaFilter]); // eslint-disable-line

  const toggle = async (c, idx) => {
    if (!canEdit) return;
    const checked = Array.isArray(c.checked) ? [...c.checked] : c.items.map(() => false);
    checked[idx] = !checked[idx];
    try { await updateDoc(doc(venueCol(groupId, c.venueId, "checklists"), c.id), { checked }); }
    catch { showToast("Could not save"); }
  };

  const reset = async (c) => {
    try { await updateDoc(doc(venueCol(groupId, c.venueId, "checklists"), c.id), { checked: c.items.map(() => false) }); showToast("Checklist reset"); }
    catch { showToast("Could not reset"); }
  };

  const doneCount = (c) => (c.checked || []).filter(Boolean).length;

  // ── Create / edit / delete ──
  const [editor, setEditor] = useState(null);
  const setEd = (k) => (e) => setEditor((p) => ({ ...p, [k]: e.target.value }));
  const openNew = () => setEditor(blankForm(venueTab));
  const openEdit = (c) => setEditor({ id: c.id, title: c.title, sub: c.sub || "", venueId: c.venueId, type: c.type, area: areaOf(c), items: c.items || [], days: c.days || [], images: c.images || [] });
  const toggleDay = (d) => setEditor((p) => ({ ...p, days: p.days.includes(d) ? p.days.filter((x) => x !== d) : [...p.days, d] }));

  const saveChecklist = async () => {
    if (!editor.title.trim()) return showToast("Title required");
    const items = (editor.items || []).filter(hasText);
    if (!items.length) return showToast("Add at least one item");
    const venue = venues.find((v) => v.id === editor.venueId);
    if (!venue) return showToast("Pick a venue");
    const payload = { title: editor.title.trim(), sub: editor.sub.trim(), venueId: venue.id, venue: venue.name, type: editor.type, area: editor.area || "All", items, days: editor.days || [], images: editor.images || [] };
    try {
      if (editor.id) {
        const existing = checklists.find((c) => c.id === editor.id);
        const checked = items.map((_, i) => (existing?.checked || [])[i] || false);
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

      <div className="grid-2">
        {shown.map((c) => {
          const done = doneCount(c);
          const total = c.items.length;
          const pillCls = done === total && total > 0 ? "pill-green" : "pill-amber";
          return (
            <div key={c.id} className="card">
              <div className="card-head">
                <div>
                  <span className="card-title">{c.title}</span><span className="card-sub">{c.sub}</span>
                  <span className="pill pill-gray" style={{ marginLeft: 8 }}>{areaOf(c)}</span>
                  <span className={`pill ${dayLabel(c.days) === "Daily" ? "pill-gray" : "pill-blue"}`} style={{ marginLeft: 4 }}>{dayLabel(c.days)}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`pill ${pillCls}`}>{done}/{total} done</span>
                  {canEdit && <button className="btn btn-sm" onClick={() => openEdit(c)}>Edit</button>}
                  {canEdit && <button className="btn btn-sm" onClick={() => reset(c)}>Reset</button>}
                </div>
              </div>
              <div>
                {c.items.map((item, idx) => {
                  const checked = (c.checked || [])[idx];
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
