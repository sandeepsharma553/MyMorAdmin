import React, { useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueSopsCol, venueCol, staffInVenue } from "../../utils/restaurantGroupPaths";
import { fullName, trainingStatusPill, trainingBarColor, progressColor, trainingPct, moduleForStaff, snapshotForAssign } from "./rgUtils";
import { archiveAndRemoveSop } from "./trainingArchiveUtils";
import { completedAtMs } from "./completionWindow";
import { orderItemsForStaff, orderStaffForItem, isSuggested, shouldAutoAssign } from "./assignmentUtils";
import { stationsForArea, groupItemsByStation, filterByStation, GENERAL_KEY } from "./itemDrilldown";
import { sendNotification } from "./notify";
import { RefImageViewer, RefImageEditor } from "./RefImages";
import { RichItemList, RichText } from "./RichItems";
import AssignmentDetail from "./AssignmentDetail";

/* SOPs — Procedures. Structural twin of TrainingPage (same tabs/filters/flows) but
 * FULLY DECOUPLED data: reads `sops` + `sopAssignments` from the context (per-venue
 * collections venues/{v}/sops and venues/{v}/sopAssignments), never trainingModules /
 * trainingAssignments. The generic behaviour (status pills, eligibility, suggestion
 * ordering, station drill-down, archive-then-delete, assignment detail) is the SAME
 * shared utils Training uses — only the data source and the copy are this page's own. */

const hasText = (h) => (h || "").replace(/<[^>]*>/g, "").trim().length > 0;

const TABS = [
  { id: "mine", label: "My SOPs" },
  { id: "overview", label: "Overview" },
  { id: "modules", label: "Procedures" },
  { id: "assigned", label: "Assigned" },
  { id: "progress", label: "Progress" },
];
const PRIORITIES = [["normal", "Normal"], ["high", "High — 3 days"], ["urgent", "Urgent — today"]];
const ICONS = ["🌅", "🌙", "⭐", "🤝", "🍔", "🥗", "🍳", "🔥", "🛡️", "☕", "🏭", "👑", "📋", "🧂"];
const SOP_COLORS = [["Amber", "#fef3c7"], ["Purple", "#ede9fe"], ["Yellow", "#fef9c3"], ["Green", "#dcfce7"], ["Red", "#fee2e2"], ["Blue", "#e0f2fe"], ["Cyan", "#cffafe"], ["Pink", "#fce7f3"]];
const blankSop = () => ({ id: null, venueId: "", title: "", cat: "All", stationId: "", duration: "30 min", icon: "📋", color: "#e0f2fe", desc: "", link: "", mandatory: false, steps: [{ heading: "Procedure", items: [] }], images: [], autoRoles: [], autoStations: [] });
const stepsToEditor = (steps) => (Array.isArray(steps) && steps.length ? steps.map((s) => ({ heading: s.heading || "", items: s.items || [] })) : [{ heading: "Procedure", items: [] }]);
const editorToSteps = (steps) => (steps || [])
  .map((s) => ({ heading: (s.heading || "").trim(), items: (s.items || []).filter(hasText) }))
  .filter((s) => s.heading || s.items.length);

export default function SOPsPage({ initialTab = "modules" }) {
  const { groupId, staff, scopedStaff: roleStaff, venues, sops, sopAssignments, stations, areas, selectedVenue, matchVenue, showToast, can, me } = useRG();
  const canEdit = can("training", "edit"); // SOPs keep the `training` permission module (SOPS_NAV.permKey) — data is separate, the gate is not

  const myUid = me?.uid || me?.id;
  const myStaff = useMemo(() => staff.find((s) => (s.adminUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())), [staff, myUid, me]);
  const myAssignments = useMemo(() => myStaff ? sopAssignments.filter((a) => a.staffId === myStaff.id) : [], [myStaff, sopAssignments]);
  // staff (non-management) only get the "My SOPs" tab; managers/admins get all
  const isMgr = ["owner", "storeAdmin", "manager"].includes(me?.groupRole);
  const visibleTabs = isMgr ? TABS : TABS.filter((t) => t.id === "mine");
  // initialTab (the SOPs nav opens to the procedure library) — clamped to a tab the
  // user is actually allowed to see, so it can never widen visibility.
  const [tab, setTab] = useState(() => (visibleTabs.some((t) => t.id === initialTab) ? initialTab : "mine"));
  const [openAssign, setOpenAssign] = useState(null); // assignment id
  const openAssignment = useMemo(() => sopAssignments.find((a) => a.id === openAssign) || null, [sopAssignments, openAssign]);
  const [areaTab, setAreaTab] = useState("all"); // "all" | a configured area name (FOH/BOH/Kitchen/…)
  const [modStation, setModStation] = useState("all"); // drill-down: all | stationId | GENERAL_KEY
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ staffId: "", sopId: "", due: "", priority: "normal", notes: "" });
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const scopedStaff = useMemo(
    () => roleStaff.filter((s) => staffInVenue(s, selectedVenue)),
    [roleStaff, selectedVenue]
  );
  const scopedAssign = useMemo(() => sopAssignments.filter(matchVenue), [sopAssignments, matchVenue]);
  // assigned table: only genuinely-open items (signed-off/Complete move to the Passed list below)
  const scopedOpen = useMemo(() => scopedAssign.filter((a) => a.status !== "Complete"), [scopedAssign]);
  // Passed / Completed list — newest completion first
  const scopedCompleted = useMemo(
    () => scopedAssign.filter((a) => a.status === "Complete")
                      .sort((a, b) => (completedAtMs(b.completedAt) || 0) - (completedAtMs(a.completedAt) || 0)),
    [scopedAssign]
  );
  // SOPs are per-venue: show the selected venue's procedures (or all when "All venues")
  const venueSops = useMemo(
    () => sops.filter((m) => selectedVenue === "all" || m.venueId === selectedVenue),
    [sops, selectedVenue]
  );
  // Area relevance filter — driven by the group's configured areas; universal ("All") SOPs show under every area
  const areaMatch = (m) => areaTab === "all" || m.cat === areaTab || m.cat === "All";
  const areaSops = useMemo(() => venueSops.filter(areaMatch), [venueSops, areaTab]); // eslint-disable-line
  // Area→Station drill-down (presentation only). Stations of the selected area for the
  // station picker; null when "all" areas (no drill-down).
  const areaForTab = areaTab === "all" ? null : areaTab;
  const drillStations = useMemo(() => (areaForTab ? stationsForArea(stations, areaForTab, selectedVenue) : []), [stations, areaForTab, selectedVenue]);

  const avgCompletion = scopedStaff.length
    ? Math.round(scopedStaff.reduce((a, s) => a + trainingPct(s.id, sopAssignments), 0) / scopedStaff.length)
    : 0;
  const upToDate = scopedStaff.filter((s) => trainingPct(s.id, sopAssignments) >= 90).length;
  const completionsDone = scopedAssign.filter((a) => a.status === "Complete").length;

  // SOPs eligible for the staff selected in the assign form (area-aware), ordered
  // by Area→Station→Role relevance (suggestion only — eligibility is unchanged).
  const assignStaff = staff.find((s) => s.id === form.staffId);
  const assignableSops = useMemo(
    () => assignStaff ? orderItemsForStaff(sops.filter((m) => moduleForStaff(m, assignStaff)), assignStaff) : venueSops,
    [assignStaff, sops, venueSops]
  );
  // the picked SOP, used to ORDER the staff dropdown by who best matches it
  const assignSop = useMemo(() => sops.find((m) => m.id === form.sopId) || null, [sops, form.sopId]);
  const suggestedStaff = useMemo(
    () => (assignSop ? orderStaffForItem(scopedStaff, assignSop) : scopedStaff),
    [assignSop, scopedStaff]
  );

  const removeAssign = async (a) => {
    try {
      const { archived } = await archiveAndRemoveSop(groupId, a, "removed");
      showToast(archived ? "Assignment archived & removed" : "Assignment removed");
    } catch { showToast("Could not remove"); }
  };

  const assign = async () => {
    if (!form.staffId || !form.sopId) return showToast("Pick a staff member and SOP");
    const st = staff.find((s) => s.id === form.staffId);
    const sop = sops.find((m) => m.id === form.sopId);
    if (!sop?.venueId) return showToast("SOP has no venue");
    try {
      // assignment lives under the SOP's venue (SOPs are per-venue)
      await addDoc(venueCol(groupId, sop.venueId, "sopAssignments"), {
        staffId: form.staffId, staffName: fullName(st), venue: sop.venue || "", venueId: sop.venueId,
        moduleId: form.sopId, moduleTitle: sop?.title || "", due: form.due, priority: form.priority,
        notes: form.notes.trim(), ...snapshotForAssign(sop), status: "Not started", progress: 0, createdAt: serverTimestamp(),
      });
      showToast("SOP assigned — staff notified");
      sendNotification(groupId, { to: form.staffId, type: "sop", title: "SOP assigned", body: `"${sop?.title || ""}"${form.due ? ` · due ${form.due}` : ""}`, venueId: sop.venueId, by: me?.displayName || me?.name || "" });
      setForm({ staffId: "", sopId: "", due: "", priority: "normal", notes: "" });
    } catch { showToast("Could not assign SOP"); }
  };

  // ── SOP create / edit / delete ──
  const [sopEditor, setSopEditor] = useState(null);
  const setM = (k) => (e) => setSopEditor((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const openNewSop = () => setSopEditor({ ...blankSop(), venueId: selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "") });
  const openEditSop = (m) => { setDetail(null); setSopEditor({ id: m.id, venueId: m.venueId || "", title: m.title, cat: m.cat || "All", stationId: m.stationId || "", duration: m.duration, icon: m.icon, color: m.color, desc: m.desc || "", link: m.link || "", mandatory: !!m.mandatory, steps: stepsToEditor(m.steps), images: m.images || [], autoRoles: m.autoAssign?.roles || [], autoStations: m.autoAssign?.stations || (m.stationId ? [m.stationId] : []) }); };
  // step-section editing
  const setStep = (i, k) => (e) => setSopEditor((p) => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, [k]: e.target.value } : s) }));
  const setStepItems = (i) => (items) => setSopEditor((p) => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, items } : s) }));
  const addStep = () => setSopEditor((p) => ({ ...p, steps: [...p.steps, { heading: "", items: [] }] }));
  const removeStep = (i) => setSopEditor((p) => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }));
  const saveSop = async () => {
    if (!sopEditor.title.trim()) return showToast("SOP title required");
    const vid = sopEditor.venueId || (selectedVenue !== "all" ? selectedVenue : venues[0]?.id);
    if (!vid) return showToast("Pick a venue for this SOP");
    const venueNameStr = venues.find((v) => v.id === vid)?.name || "";
    const steps = editorToSteps(sopEditor.steps);
    // Area is chosen directly; auto-assign targets one or more stations within that area+venue
    const cat = sopEditor.cat || "All";
    const autoStations = (sopEditor.autoStations || []).filter((id) => stations.some((s) => s.id === id && s.venueId === vid && s.area === cat));
    const payload = { title: sopEditor.title.trim(), cat, stationId: "", station: "", venueId: vid, venue: venueNameStr, duration: sopEditor.duration, icon: sopEditor.icon, color: sopEditor.color, desc: sopEditor.desc.trim(), link: (sopEditor.link || "").trim(), mandatory: sopEditor.mandatory, steps, images: sopEditor.images || [], autoAssign: { roles: [], stations: autoStations } };
    try {
      let sopId = sopEditor.id;
      if (sopEditor.id) { await updateDoc(doc(venueSopsCol(groupId, vid), sopEditor.id), payload); }
      else { const created = await addDoc(venueSopsCol(groupId, vid), payload); sopId = created.id; }
      // immediate auto-assign: every staff in this venue matching the area + selected stations
      // (by their Staff Directory profile) gets it now — shows in their "Assigned" list.
      const saved = { ...payload, id: sopId };
      let assigned = 0;
      if (autoStations.length) {
        const targets = staff.filter((s) => shouldAutoAssign(saved, s, vid) && !sopAssignments.some((a) => a.staffId === s.id && a.moduleId === sopId));
        for (const s of targets) {
          try {
            await addDoc(venueCol(groupId, vid, "sopAssignments"), {
              staffId: s.id, staffName: s.displayName || fullName(s), venue: venueNameStr, venueId: vid,
              moduleId: sopId, moduleTitle: saved.title, due: "", priority: "normal", notes: "",
              ...snapshotForAssign(saved), status: "Not started", progress: 0, createdAt: serverTimestamp(),
            });
            assigned++;
          } catch { /* skip one, keep going */ }
        }
      }
      showToast(`${sopEditor.id ? "SOP updated" : "SOP created"}${assigned ? ` · auto-assigned to ${assigned} staff` : ""}`);
      setSopEditor(null);
    } catch { showToast("Could not save SOP"); }
  };
  const deleteSop = async () => {
    try { await deleteDoc(doc(venueSopsCol(groupId, sopEditor.venueId), sopEditor.id)); showToast("SOP deleted"); setSopEditor(null); }
    catch { showToast("Could not delete"); }
  };

  const sopProgress = (mId) => {
    const list = sopAssignments.filter((a) => a.moduleId === mId);
    if (!list.length) return null;
    return Math.round(list.reduce((a, x) => a + (x.progress || 0), 0) / list.length);
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          {visibleTabs.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === "modules" && <span className="tab-badge">{venueSops.length}</span>}
              {t.id === "assigned" && <span className="tab-badge">{scopedAssign.filter((a) => a.status !== "Complete").length}</span>}
            </button>
          ))}
        </div>
        {canEdit && <button className="btn btn-sm btn-primary" onClick={openNewSop}>+ New SOP</button>}
      </div>

      {/* My SOPs — the logged-in user's assigned procedures */}
      {tab === "mine" && (
        <div>
          {!myStaff && <div className="card"><div style={{ fontSize: 13, color: "var(--gray)" }}>No staff profile is linked to your login yet. SOPs assigned to you will appear here once it is.</div></div>}
          {myStaff && myAssignments.length === 0 && <div className="card"><div style={{ fontSize: 13, color: "var(--gray)" }}>No SOPs assigned to you yet 🎉</div></div>}
          {myStaff && myAssignments.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
              {myAssignments.map((a) => (
                <div key={a.id} className="training-module" onClick={() => setOpenAssign(a.id)}>
                  <div className="module-title">{a.moduleTitle}</div>
                  <div className="module-meta">{a.venue}{a.due ? ` · due ${a.due}` : ""}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status}</span>
                    <span>{(a.checks || []).filter(Boolean).length}/{a.itemsTotal || (a.checks || []).length}</span>
                  </div>
                  <div className="progress-wrap"><div className="progress-bar" style={{ width: `${a.progress || 0}%`, background: trainingBarColor(a.status) }} /></div>
                  {/* trainer-ticked model: only training:edit holders can tick, so the copy
                      must not promise staff readers actionable checkboxes */}
                  <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 6 }}>{canEdit ? "Click to open & tick off each step" : "Your trainer ticks each step off with you, then signs off to complete"}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Overview */}
      {tab === "overview" && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <div className="metric"><div className="metric-label">SOPs total</div><div className="metric-value">{venueSops.length}</div><div className="metric-change" style={{ color: "var(--gray)" }}>{selectedVenue === "all" ? "All venues" : (venues.find((v) => v.id === selectedVenue)?.name || "")}</div><div className="metric-bar" style={{ background: "var(--blue)" }} /></div>
            <div className="metric"><div className="metric-label">Staff up to date</div><div className="metric-value">{upToDate}/{scopedStaff.length}</div><div className="metric-change down">{scopedStaff.length - upToDate} incomplete</div><div className="metric-bar" style={{ background: "var(--amber)" }} /></div>
            <div className="metric"><div className="metric-label">Completions</div><div className="metric-value">{completionsDone}</div><div className="metric-change up">assigned SOPs done</div><div className="metric-bar" style={{ background: "var(--green)" }} /></div>
            <div className="metric"><div className="metric-label">Avg. completion</div><div className="metric-value">{avgCompletion}%</div><div className="metric-change down">Target 90%</div><div className="metric-bar" style={{ background: "var(--red)" }} /></div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Staff SOP progress</span><span className="card-sub">{selectedVenue === "all" ? "All venues" : scopedStaff[0]?.venueNames?.[0]}</span></div>
            {scopedStaff.map((s) => { const tp = trainingPct(s.id, sopAssignments); return (
              <div key={s.id} className="perf-row">
                <span className="perf-name">{s.displayName || fullName(s)}</span>
                <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${tp}%`, background: progressColor(tp) }} /></div>
                <span className="perf-val">{tp}%</span>
              </div>
            ); })}
          </div>
        </>
      )}

      {/* FOH / BOH relevance filter (Procedures + Progress) + Area→Station drill-down */}
      {(tab === "modules" || tab === "progress") && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          {[["all", "All"], ...areas.map((a) => [a, a])].map(([id, l]) => (
            <button key={id} className="btn btn-sm" onClick={() => { setAreaTab(id); setModStation("all"); }}
              style={areaTab === id ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{l}</button>
          ))}
          {tab === "modules" && areaForTab && drillStations.length > 0 && (
            <select key={`${selectedVenue}-${areaForTab}`} className="form-input" style={{ width: 200, marginLeft: 6 }} value={modStation} onChange={(e) => setModStation(e.target.value)} title="Drill down to a station">
              <option value="all">All stations</option>
              {drillStations.map((st) => <option key={`${st.venueId}-${st.id}`} value={st.id}>{st.name}</option>)}
              <option value={GENERAL_KEY}>General (no station)</option>
            </select>
          )}
        </div>
      )}

      {/* Procedures — grouped by station when an area is selected (declutter); flat otherwise */}
      {tab === "modules" && (() => {
        const card = (m) => (
          <div key={`${m.venueId}-${m.id}`} className="training-module" onClick={() => setDetail(m)}>
            <div className="module-icon" style={{ background: m.color }}>{m.icon}</div>
            <div className="module-title">{m.title}</div>
            <div className="module-meta">{m.cat} · {m.venue} · {m.duration}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {m.mandatory && <span className="pill pill-red">Mandatory</span>}
              <span className="pill pill-gray">{m.cat}</span>
              {m.station && <span className="pill pill-blue">{m.station}</span>}
              {m.link && <span className="pill pill-blue">↗ External</span>}
            </div>
          </div>
        );
        const gridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 12 };
        if (areaForTab && modStation === "all") {
          const groups = groupItemsByStation(areaSops, drillStations);
          return (
            <div>
              {groups.map((g) => (
                <div key={g.key} style={{ marginBottom: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}><span className="card-title">{g.label}</span><span className="card-sub">{g.items.length}</span></div>
                  <div style={gridStyle}>{g.items.map(card)}</div>
                </div>
              ))}
              {areaSops.length === 0 && <div style={{ color: "var(--gray)", fontSize: 13 }}>No SOPs for this venue / area yet.</div>}
            </div>
          );
        }
        const shown = filterByStation(areaSops, modStation);
        return (
          <div style={gridStyle}>
            {shown.map(card)}
            {shown.length === 0 && <div style={{ color: "var(--gray)", fontSize: 13 }}>No SOPs for this venue / area / station yet.</div>}
          </div>
        );
      })()}

      {/* Assigned */}
      {tab === "assigned" && (
        <>
          {canEdit && (
          <div className="card">
            <div className="card-head"><span className="card-title">Assign SOP</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Staff member{assignSop ? " (suggested first)" : ""}</label>
                <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                  <option value="">Select staff...</option>
                  {suggestedStaff.map((s) => <option key={s.id} value={s.id}>{assignSop && isSuggested(assignSop, s) ? "⭐ " : ""}{fullName(s)}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">SOP</label>
                <select className="form-input" value={form.sopId} onChange={setF("sopId")}>
                  <option value="">{assignStaff ? `Select SOP (${assignStaff.area} + universal)...` : "Select staff first..."}</option>
                  {assignableSops.map((m) => <option key={`${m.venueId}-${m.id}`} value={m.id}>{assignStaff && isSuggested(m, assignStaff) ? "⭐ " : ""}{m.title} — {m.venue} [{m.cat}]</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Due date</label><input type="date" className="form-input" value={form.due} onChange={setF("due")} /></div>
              <div className="form-group"><label className="form-label">Priority</label>
                <select className="form-input" value={form.priority} onChange={setF("priority")}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Notes for staff member</label><textarea className="form-input" rows={2} value={form.notes} onChange={setF("notes")} placeholder="e.g. Focus on the close-down steps" /></div>
            <div className="btn-row"><button className="btn btn-primary" onClick={assign}>Assign SOP</button></div>
          </div>
          )}

          <div className="card">
            <div className="card-head"><span className="card-title">Currently assigned</span><span className="pill pill-amber">{scopedAssign.filter((a) => a.status !== "Complete").length} in progress</span></div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Staff</th><th>SOP</th><th>Venue</th><th>Due</th><th>Status</th><th>Progress</th><th>Action</th></tr></thead>
                <tbody>
                  {scopedOpen.map((a) => (
                    <tr key={a.id}>
                      <td>{a.staffName}</td><td>{a.moduleTitle}</td><td>{a.venue}</td><td>{a.due || "—"}</td>
                      <td><span className={`pill ${trainingStatusPill(a.status)}`}>{a.status}</span></td>
                      <td><div className="progress-wrap" style={{ width: 80 }}><div className="progress-bar" style={{ width: `${a.progress || 0}%`, background: trainingBarColor(a.status) }} /></div></td>
                      <td>
                        <div style={{ display: "inline-flex", gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => setOpenAssign(a.id)}>Open</button>
                          {canEdit && <button className="btn btn-sm btn-danger" title="Remove assignment" onClick={() => removeAssign(a)}>✕</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {scopedOpen.length === 0 && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>No assignments.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          {/* Passed / Completed — signed-off SOPs move here (read-only via AssignmentDetail lock) */}
          <div className="card">
            <div className="card-head"><span className="card-title">Passed / Completed</span><span className="pill pill-green">{scopedCompleted.length} passed</span></div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Staff</th><th>SOP</th><th>Venue</th><th>Completed</th><th>Signed off by</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {scopedCompleted.map((a) => (
                    <tr key={a.id}>
                      <td>{a.staffName}</td><td>{a.moduleTitle}</td><td>{a.venue}</td>
                      <td>{a.completedAt?.toDate ? a.completedAt.toDate().toLocaleDateString() : "—"}</td>
                      <td>{a.verifiedBy || "—"}</td>
                      <td>
                        <span className={`pill ${trainingStatusPill(a.status)}`}>{a.status}</span>
                        {a.verified && <span className="pill pill-green" style={{ marginLeft: 4 }}>✓ Verified</span>}
                      </td>
                      <td><button className="btn btn-sm" onClick={() => setOpenAssign(a.id)}>Open</button></td>
                    </tr>
                  ))}
                  {scopedCompleted.length === 0 && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>No completed SOPs yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Progress */}
      {tab === "progress" && (
        <div className="card">
          <div className="card-head"><span className="card-title">Completion by SOP</span></div>
          {areaSops.map((m) => {
            const p = sopProgress(m.id);
            return (
              <div key={`${m.venueId}-${m.id}`} className="perf-row">
                <span className="perf-name" style={{ width: 220 }}>{m.title}</span>
                <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${p ?? 0}%`, background: progressColor(p ?? 0) }} /></div>
                <span className="perf-val">{p == null ? "—" : `${p}%`}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* SOP detail modal */}
      {detail && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setDetail(null)}>
          <div className="rg-modal" style={{ maxWidth: 680 }}>
            <div className="modal-head">
              <span className="modal-title">{detail.icon} {detail.title}</span>
              <button className="modal-close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>{detail.cat} · {detail.venue} · {detail.duration}{detail.mandatory ? " · Mandatory" : ""}</div>
            <div style={{ fontSize: 13, marginBottom: 14 }}>{detail.desc}</div>
            {(detail.steps || []).map((step, i) => (
              <div key={i} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{step.heading}</div>
                {step.items.map((it, j) => (
                  <div key={j} className="checklist-item"><span className="nav-dot" style={{ background: "var(--red)", marginTop: 6 }} /><RichText html={it} className="check-text" /></div>
                ))}
              </div>
            ))}
            {(!detail.steps || detail.steps.length === 0) && (
              <div style={{ fontSize: 12, color: "var(--gray)" }}>This SOP has no step content yet. Edit it to add the procedure steps, or assign it to a staff member to track completion.</div>
            )}
            <RefImageViewer images={detail.images} />
            <div className="btn-row">
              {detail.link && <button className="btn btn-primary" onClick={() => window.open(detail.link, "_blank", "noopener")}>Open external SOP ↗</button>}
              {canEdit && <button className="btn btn-primary" onClick={() => { setForm((p) => ({ ...p, sopId: detail.id })); setDetail(null); setTab("assigned"); }}>Assign this SOP</button>}
              {canEdit && <button className="btn" onClick={() => openEditSop(detail)}>Edit SOP</button>}
              <button className="btn" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* SOP create / edit modal */}
      {sopEditor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setSopEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">{sopEditor.id ? "Edit SOP" : "New SOP"}</span><button className="modal-close" onClick={() => setSopEditor(null)}>✕</button></div>
            <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={sopEditor.title} onChange={setM("title")} placeholder="FOH Opening Procedure" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Venue</label>
                <select className="form-input" value={sopEditor.venueId} onChange={setM("venueId")} disabled={!!sopEditor.id} title={sopEditor.id ? "Venue can't be changed after creation" : ""}>
                  <option value="">Select venue...</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Area <span style={{ color: "var(--gray)", fontWeight: 400 }}>· who it's for; none = universal</span></label>
                <select className="form-input" value={sopEditor.cat || "All"} onChange={(e) => setSopEditor((p) => { const cat = e.target.value; const valid = stations.filter((s) => s.venueId === p.venueId && s.area === cat).map((s) => s.id); return { ...p, cat, autoStations: (p.autoStations || []).filter((id) => valid.includes(id)) }; })}>
                  <option value="All">— None (all areas) —</option>
                  {areas.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Duration</label><input className="form-input" value={sopEditor.duration} onChange={setM("duration")} placeholder="30 min" /></div>
              <div className="form-group"><label className="form-label">Icon</label>
                <select className="form-input" value={sopEditor.icon} onChange={setM("icon")}>{ICONS.map((ic) => <option key={ic}>{ic}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Colour</label>
                <select className="form-input" value={sopEditor.color} onChange={setM("color")}>{SOP_COLORS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 22, flexWrap: "wrap" }}>
                <label className="form-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={sopEditor.mandatory} onChange={setM("mandatory")} /> Mandatory</label>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={sopEditor.desc} onChange={setM("desc")} /></div>
            <div className="form-group"><label className="form-label">External link (optional — full procedure hosted elsewhere)</label><input className="form-input" value={sopEditor.link} onChange={setM("link")} placeholder="https://... (document on another platform)" /></div>

            {/* Auto-assign to STATIONS within the chosen area (multi-select) */}
            <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 12 }}>
              <label className="form-label">Auto-assign to stations</label>
              {(sopEditor.cat && sopEditor.cat !== "All") ? (() => {
                const opts = stations.filter((s) => s.venueId === sopEditor.venueId && s.area === sopEditor.cat);
                return opts.length ? (
                  <>
                    <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 6 }}>Staff in {sopEditor.cat} tagged any selected station get this SOP automatically.</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {opts.map((st) => { const on = (sopEditor.autoStations || []).includes(st.id); return <button key={st.id} type="button" className="btn btn-sm" onClick={() => setSopEditor((p) => ({ ...p, autoStations: on ? (p.autoStations || []).filter((x) => x !== st.id) : [...(p.autoStations || []), st.id] }))} style={on ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{st.name}</button>; })}
                    </div>
                  </>
                ) : <div style={{ fontSize: 12, color: "var(--gray)" }}>No stations in {sopEditor.cat} for this venue — add them in Settings.</div>;
              })() : <div style={{ fontSize: 12, color: "var(--gray)" }}>Universal SOP (no area) — won't auto-assign by station. Pick an Area above to choose stations.</div>}
              {!(sopEditor.autoStations || []).length && (
                <div style={{ fontSize: 10, color: "var(--amber)", marginTop: 6 }}>⚠ No stations selected — this SOP will not auto-assign to anyone (not even managers). Assign it manually, or pick stations above.</div>
              )}
            </div>

            {/* Step sections — matches the SOP detail layout */}
            <div className="form-group">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0 }}>Step sections</label>
                <button type="button" className="btn btn-sm" onClick={addStep}>+ Add section</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {sopEditor.steps.map((s, i) => (
                  <div key={i} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <input className="form-input" style={{ flex: 1 }} value={s.heading} onChange={setStep(i, "heading")} placeholder="Section heading (e.g. Before you do anything else)" />
                      {sopEditor.steps.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => removeStep(i)}>✕</button>}
                    </div>
                    <RichItemList value={s.items} onChange={setStepItems(i)} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>Each line becomes a bullet step. Add sections to group steps (Opening, Equipment, Final check…).</div>
            </div>

            <RefImageEditor value={sopEditor.images} onChange={(imgs) => setSopEditor((p) => ({ ...p, images: imgs }))} folder={`restaurantGroups/${groupId}/refimages/sops`} showToast={showToast} />

            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveSop}>{sopEditor.id ? "Save SOP" : "Create SOP"}</button>
              {sopEditor.id && <button className="btn btn-danger" onClick={deleteSop}>Delete</button>}
              <button className="btn" onClick={() => setSopEditor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {openAssignment && (
        <AssignmentDetail
          assignment={openAssignment}
          liveModule={sops.find((m) => m.id === openAssignment.moduleId) || sops.find((m) => m.title === openAssignment.moduleTitle && m.venueId === openAssignment.venueId)}
          groupId={groupId}
          canTick={canEdit}
          canVerify={canEdit}
          canComment={isMgr}
          actorName={me?.displayName || me?.name || me?.email || "Trainer"}
          actorId={myUid}
          showToast={showToast}
          onClose={() => setOpenAssign(null)}
          variant="sop"
        />
      )}
    </>
  );
}
