import React, { useMemo, useState } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueTrainingCol, venueCol, staffInVenue } from "../../utils/restaurantGroupPaths";
import { fullName, trainingStatusPill, trainingBarColor, progressColor, trainingPct, moduleForStaff, snapshotForAssign } from "./rgUtils";
import { archiveAndRemoveTraining } from "./trainingArchiveUtils";
import { archiveCompletion } from "./completionArchive";
import { showInActiveList } from "./completionWindow";
import { orderItemsForStaff, orderStaffForItem, isSuggested } from "./assignmentUtils";
import { stationsForArea, groupItemsByStation, filterByStation, GENERAL_KEY } from "./itemDrilldown";
import { sendNotification } from "./notify";
import { RefImageViewer, RefImageEditor } from "./RefImages";
import { RichItemList, RichText } from "./RichItems";
import AssignmentDetail from "./AssignmentDetail";

const hasText = (h) => (h || "").replace(/<[^>]*>/g, "").trim().length > 0;

const TABS = [
  { id: "mine", label: "My Training" },
  { id: "overview", label: "Overview" },
  { id: "modules", label: "Modules" },
  { id: "assigned", label: "Assigned" },
  { id: "progress", label: "Progress" },
];
const PRIORITIES = [["normal", "Normal"], ["high", "High — 3 days"], ["urgent", "Urgent — today"]];
const ICONS = ["🌅", "🌙", "⭐", "🤝", "🍔", "🥗", "🍳", "🔥", "🛡️", "☕", "🏭", "👑", "📋", "🧂"];
const MOD_COLORS = [["Amber", "#fef3c7"], ["Purple", "#ede9fe"], ["Yellow", "#fef9c3"], ["Green", "#dcfce7"], ["Red", "#fee2e2"], ["Blue", "#e0f2fe"], ["Cyan", "#cffafe"], ["Pink", "#fce7f3"]];
const blankModule = () => ({ id: null, venueId: "", title: "", cat: "All", stationId: "", duration: "30 min", icon: "📋", color: "#e0f2fe", desc: "", link: "", mandatory: false, steps: [{ heading: "Procedure", items: [] }], images: [], autoRoles: [] });
const stepsToEditor = (steps) => (Array.isArray(steps) && steps.length ? steps.map((s) => ({ heading: s.heading || "", items: s.items || [] })) : [{ heading: "Procedure", items: [] }]);
const editorToSteps = (steps) => (steps || [])
  .map((s) => ({ heading: (s.heading || "").trim(), items: (s.items || []).filter(hasText) }))
  .filter((s) => s.heading || s.items.length);

export default function TrainingPage({ initialTab }) {
  const { groupId, staff, scopedStaff: roleStaff, venues, modules, assignments, stations, roles, areas, selectedVenue, matchVenue, showToast, can, me } = useRG();
  const canEdit = can("training", "edit");

  const myUid = me?.uid || me?.id;
  const myStaff = useMemo(() => staff.find((s) => (s.adminUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())), [staff, myUid, me]);
  const myAssignments = useMemo(() => myStaff ? assignments.filter((a) => a.staffId === myStaff.id) : [], [myStaff, assignments]);
  // staff (non-management) only get the "My Training" tab; managers/admins get all
  const isMgr = ["owner", "storeAdmin", "manager"].includes(me?.groupRole);
  const visibleTabs = isMgr ? TABS : TABS.filter((t) => t.id === "mine");
  // initialTab (e.g. the SOPs nav opens to the module library) — clamped to a tab the
  // user is actually allowed to see, so it can never widen visibility.
  const [tab, setTab] = useState(() => (visibleTabs.some((t) => t.id === initialTab) ? initialTab : "mine"));
  const [openAssign, setOpenAssign] = useState(null); // assignment id
  const openAssignment = useMemo(() => assignments.find((a) => a.id === openAssign) || null, [assignments, openAssign]);
  const [areaTab, setAreaTab] = useState("all"); // "all" | a configured area name (FOH/BOH/Kitchen/…)
  const [modStation, setModStation] = useState("all"); // drill-down: all | stationId | GENERAL_KEY
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState({ staffId: "", moduleId: "", due: "", priority: "normal", notes: "" });
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const scopedStaff = useMemo(
    () => roleStaff.filter((s) => staffInVenue(s, selectedVenue)),
    [roleStaff, selectedVenue]
  );
  const scopedAssign = useMemo(() => assignments.filter(matchVenue), [assignments, matchVenue]);
  // active table: hide Complete items older than 48h (counts/metrics keep full scopedAssign)
  const scopedAssignActive = useMemo(() => scopedAssign.filter((a) => showInActiveList(a)), [scopedAssign]);
  // training is per-venue: show the selected venue's modules (or all when "All venues")
  const venueModules = useMemo(
    () => modules.filter((m) => selectedVenue === "all" || m.venueId === selectedVenue),
    [modules, selectedVenue]
  );
  // Area relevance filter — driven by the group's configured areas; universal ("All") modules show under every area
  const areaMatch = (m) => areaTab === "all" || m.cat === areaTab || m.cat === "All";
  const areaModules = useMemo(() => venueModules.filter(areaMatch), [venueModules, areaTab]); // eslint-disable-line
  // Area→Station drill-down (presentation only). Stations of the selected area for the
  // station picker; null when "all" areas (no drill-down).
  const areaForTab = areaTab === "all" ? null : areaTab;
  const drillStations = useMemo(() => (areaForTab ? stationsForArea(stations, areaForTab, selectedVenue) : []), [stations, areaForTab, selectedVenue]);

  const avgCompletion = scopedStaff.length
    ? Math.round(scopedStaff.reduce((a, s) => a + trainingPct(s.id, assignments), 0) / scopedStaff.length)
    : 0;
  const trained = scopedStaff.filter((s) => trainingPct(s.id, assignments) >= 90).length;
  const completionsDone = scopedAssign.filter((a) => a.status === "Complete").length;

  // modules eligible for the staff selected in the assign form (area-aware), ordered
  // by Area→Station→Role relevance (suggestion only — eligibility is unchanged).
  const assignStaff = staff.find((s) => s.id === form.staffId);
  const assignableModules = useMemo(
    () => assignStaff ? orderItemsForStaff(modules.filter((m) => moduleForStaff(m, assignStaff)), assignStaff) : venueModules,
    [assignStaff, modules, venueModules]
  );
  // the picked module, used to ORDER the staff dropdown by who best matches it
  const assignModule = useMemo(() => modules.find((m) => m.id === form.moduleId) || null, [modules, form.moduleId]);
  const suggestedStaff = useMemo(
    () => (assignModule ? orderStaffForItem(scopedStaff, assignModule) : scopedStaff),
    [assignModule, scopedStaff]
  );

  const markDone = async (a) => {
    try {
      await updateDoc(doc(venueCol(groupId, a.venueId, "trainingAssignments"), a.id), { status: "Complete", progress: 100, completedAt: serverTimestamp() });
      if (a.status !== "Complete") archiveCompletion(groupId, "training", a, { status: "Complete", progress: 100 }).catch(() => {}); // dated completion archive (additive)
      showToast(`Marked complete for ${a.staffName}`);
    } catch { showToast("Could not update"); }
  };
  const removeAssign = async (a) => {
    try {
      const { archived } = await archiveAndRemoveTraining(groupId, a, "removed");
      showToast(archived ? "Assignment archived & removed" : "Assignment removed");
    } catch { showToast("Could not remove"); }
  };

  const assign = async () => {
    if (!form.staffId || !form.moduleId) return showToast("Pick a staff member and module");
    const st = staff.find((s) => s.id === form.staffId);
    const mod = modules.find((m) => m.id === form.moduleId);
    if (!mod?.venueId) return showToast("Module has no venue");
    try {
      // assignment lives under the module's venue (training is per-venue)
      await addDoc(venueCol(groupId, mod.venueId, "trainingAssignments"), {
        staffId: form.staffId, staffName: fullName(st), venue: mod.venue || "", venueId: mod.venueId,
        moduleId: form.moduleId, moduleTitle: mod?.title || "", due: form.due, priority: form.priority,
        notes: form.notes.trim(), ...snapshotForAssign(mod), status: "Not started", progress: 0, createdAt: serverTimestamp(),
      });
      showToast("Training module assigned — staff notified");
      sendNotification(groupId, { to: form.staffId, type: "training", title: "Training assigned", body: `"${mod?.title || ""}"${form.due ? ` · due ${form.due}` : ""}`, venueId: mod.venueId, by: me?.displayName || me?.name || "" });
      setForm({ staffId: "", moduleId: "", due: "", priority: "normal", notes: "" });
    } catch { showToast("Could not assign module"); }
  };

  // ── Module create / edit / delete ──
  const [modEditor, setModEditor] = useState(null);
  const setM = (k) => (e) => setModEditor((p) => ({ ...p, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const openNewModule = () => setModEditor({ ...blankModule(), venueId: selectedVenue !== "all" ? selectedVenue : (venues[0]?.id || "") });
  const openEditModule = (m) => { setDetail(null); setModEditor({ id: m.id, venueId: m.venueId || "", title: m.title, cat: m.cat, stationId: m.stationId || "", duration: m.duration, icon: m.icon, color: m.color, desc: m.desc || "", link: m.link || "", mandatory: !!m.mandatory, steps: stepsToEditor(m.steps), images: m.images || [], autoRoles: m.autoAssign?.roles || [] }); };
  // step-section editing
  const setStep = (i, k) => (e) => setModEditor((p) => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, [k]: e.target.value } : s) }));
  const setStepItems = (i) => (items) => setModEditor((p) => ({ ...p, steps: p.steps.map((s, idx) => idx === i ? { ...s, items } : s) }));
  const addStep = () => setModEditor((p) => ({ ...p, steps: [...p.steps, { heading: "", items: [] }] }));
  const removeStep = (i) => setModEditor((p) => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }));
  const saveModule = async () => {
    if (!modEditor.title.trim()) return showToast("Module title required");
    const vid = modEditor.venueId || (selectedVenue !== "all" ? selectedVenue : venues[0]?.id);
    if (!vid) return showToast("Pick a venue for this module");
    const venueNameStr = venues.find((v) => v.id === vid)?.name || "";
    const steps = editorToSteps(modEditor.steps);
    const stn = stations.find((s) => s.id === modEditor.stationId && s.venueId === vid);
    // category removed from the UI — a module's area now follows its station (universal "All" if none)
    const cat = stn?.area || "All";
    const payload = { title: modEditor.title.trim(), cat, stationId: stn?.id || "", station: stn?.name || "", venueId: vid, venue: venueNameStr, duration: modEditor.duration, icon: modEditor.icon, color: modEditor.color, desc: modEditor.desc.trim(), link: (modEditor.link || "").trim(), mandatory: modEditor.mandatory, steps, images: modEditor.images || [], autoAssign: { roles: [] } };
    try {
      if (modEditor.id) { await updateDoc(doc(venueTrainingCol(groupId, vid), modEditor.id), payload); showToast("Module updated"); }
      else { await addDoc(venueTrainingCol(groupId, vid), payload); showToast("Module created"); }
      setModEditor(null);
    } catch { showToast("Could not save module"); }
  };
  const deleteModule = async () => {
    try { await deleteDoc(doc(venueTrainingCol(groupId, modEditor.venueId), modEditor.id)); showToast("Module deleted"); setModEditor(null); }
    catch { showToast("Could not delete"); }
  };

  const moduleProgress = (mId) => {
    const list = assignments.filter((a) => a.moduleId === mId);
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
              {t.id === "modules" && <span className="tab-badge">{venueModules.length}</span>}
              {t.id === "assigned" && <span className="tab-badge">{scopedAssign.filter((a) => a.status !== "Complete").length}</span>}
            </button>
          ))}
        </div>
        {canEdit && <button className="btn btn-sm btn-primary" onClick={openNewModule}>+ New module</button>}
      </div>

      {/* My Training — the logged-in user ticks off their own assigned steps */}
      {tab === "mine" && (
        <div>
          {!myStaff && <div className="card"><div style={{ fontSize: 13, color: "var(--gray)" }}>No staff profile is linked to your login yet. Training assigned to you will appear here once it is.</div></div>}
          {myStaff && myAssignments.length === 0 && <div className="card"><div style={{ fontSize: 13, color: "var(--gray)" }}>No training assigned to you yet 🎉</div></div>}
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
                  <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 6 }}>Click to open & tick off each step</div>
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
            <div className="metric"><div className="metric-label">Modules total</div><div className="metric-value">{venueModules.length}</div><div className="metric-change" style={{ color: "var(--gray)" }}>{selectedVenue === "all" ? "All venues" : (venues.find((v) => v.id === selectedVenue)?.name || "")}</div><div className="metric-bar" style={{ background: "var(--blue)" }} /></div>
            <div className="metric"><div className="metric-label">Staff trained</div><div className="metric-value">{trained}/{scopedStaff.length}</div><div className="metric-change down">{scopedStaff.length - trained} incomplete</div><div className="metric-bar" style={{ background: "var(--amber)" }} /></div>
            <div className="metric"><div className="metric-label">Completions</div><div className="metric-value">{completionsDone}</div><div className="metric-change up">assigned modules done</div><div className="metric-bar" style={{ background: "var(--green)" }} /></div>
            <div className="metric"><div className="metric-label">Avg. completion</div><div className="metric-value">{avgCompletion}%</div><div className="metric-change down">Target 90%</div><div className="metric-bar" style={{ background: "var(--red)" }} /></div>
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Staff training progress</span><span className="card-sub">{selectedVenue === "all" ? "All venues" : scopedStaff[0]?.venueNames?.[0]}</span></div>
            {scopedStaff.map((s) => { const tp = trainingPct(s.id, assignments); return (
              <div key={s.id} className="perf-row">
                <span className="perf-name">{s.displayName || fullName(s)}</span>
                <div className="perf-bar-wrap"><div className="perf-bar" style={{ width: `${tp}%`, background: progressColor(tp) }} /></div>
                <span className="perf-val">{tp}%</span>
              </div>
            ); })}
          </div>
        </>
      )}

      {/* FOH / BOH relevance filter (Modules + Progress) + Area→Station drill-down */}
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

      {/* Modules — grouped by station when an area is selected (declutter); flat otherwise */}
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
          const groups = groupItemsByStation(areaModules, drillStations);
          return (
            <div>
              {groups.map((g) => (
                <div key={g.key} style={{ marginBottom: 16 }}>
                  <div className="card-head" style={{ marginBottom: 8 }}><span className="card-title">{g.label}</span><span className="card-sub">{g.items.length}</span></div>
                  <div style={gridStyle}>{g.items.map(card)}</div>
                </div>
              ))}
              {areaModules.length === 0 && <div style={{ color: "var(--gray)", fontSize: 13 }}>No training modules for this venue / area yet.</div>}
            </div>
          );
        }
        const shown = filterByStation(areaModules, modStation);
        return (
          <div style={gridStyle}>
            {shown.map(card)}
            {shown.length === 0 && <div style={{ color: "var(--gray)", fontSize: 13 }}>No training modules for this venue / area / station yet.</div>}
          </div>
        );
      })()}

      {/* Assigned */}
      {tab === "assigned" && (
        <>
          {canEdit && (
          <div className="card">
            <div className="card-head"><span className="card-title">Assign training module</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Staff member{assignModule ? " (suggested first)" : ""}</label>
                <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                  <option value="">Select staff...</option>
                  {suggestedStaff.map((s) => <option key={s.id} value={s.id}>{assignModule && isSuggested(assignModule, s) ? "⭐ " : ""}{fullName(s)}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Module</label>
                <select className="form-input" value={form.moduleId} onChange={setF("moduleId")}>
                  <option value="">{assignStaff ? `Select module (${assignStaff.area} + universal)...` : "Select staff first..."}</option>
                  {assignableModules.map((m) => <option key={`${m.venueId}-${m.id}`} value={m.id}>{assignStaff && isSuggested(m, assignStaff) ? "⭐ " : ""}{m.title} — {m.venue} [{m.cat}]</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Due date</label><input type="date" className="form-input" value={form.due} onChange={setF("due")} /></div>
              <div className="form-group"><label className="form-label">Priority</label>
                <select className="form-input" value={form.priority} onChange={setF("priority")}>{PRIORITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Notes for staff member</label><textarea className="form-input" rows={2} value={form.notes} onChange={setF("notes")} placeholder="e.g. Focus on allergen section" /></div>
            <div className="btn-row"><button className="btn btn-primary" onClick={assign}>Assign module</button></div>
          </div>
          )}

          <div className="card">
            <div className="card-head"><span className="card-title">Currently assigned</span><span className="pill pill-amber">{scopedAssign.filter((a) => a.status !== "Complete").length} in progress</span></div>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Staff</th><th>Module</th><th>Venue</th><th>Due</th><th>Status</th><th>Progress</th><th>Action</th></tr></thead>
                <tbody>
                  {scopedAssignActive.map((a) => (
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
                  {scopedAssignActive.length === 0 && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>No assignments.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Progress */}
      {tab === "progress" && (
        <div className="card">
          <div className="card-head"><span className="card-title">Completion by module</span></div>
          {areaModules.map((m) => {
            const p = moduleProgress(m.id);
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

      {/* Module detail modal */}
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
              <div style={{ fontSize: 12, color: "var(--gray)" }}>Full SOP content is available in the staff handbook. Assign this module to a staff member to track completion.</div>
            )}
            <RefImageViewer images={detail.images} />
            <div className="btn-row">
              {detail.link && <button className="btn btn-primary" onClick={() => window.open(detail.link, "_blank", "noopener")}>Open external training ↗</button>}
              {canEdit && <button className="btn btn-primary" onClick={() => { setForm((p) => ({ ...p, moduleId: detail.id })); setDetail(null); setTab("assigned"); }}>Assign this module</button>}
              {canEdit && <button className="btn" onClick={() => openEditModule(detail)}>Edit module</button>}
              <button className="btn" onClick={() => setDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Module create / edit modal */}
      {modEditor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 560 }}>
            <div className="modal-head"><span className="modal-title">{modEditor.id ? "Edit module" : "New training module"}</span><button className="modal-close" onClick={() => setModEditor(null)}>✕</button></div>
            <div className="form-group"><label className="form-label">Title</label><input className="form-input" value={modEditor.title} onChange={setM("title")} placeholder="FOH Opening Procedure" /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Venue</label>
                <select className="form-input" value={modEditor.venueId} onChange={setM("venueId")} disabled={!!modEditor.id} title={modEditor.id ? "Venue can't be changed after creation" : ""}>
                  <option value="">Select venue...</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Station (optional) <span style={{ color: "var(--gray)", fontWeight: 400 }}>· sets the module's area; none = universal</span></label>
                <select key={modEditor.venueId} className="form-input" value={modEditor.stationId} onChange={setM("stationId")}>
                  <option value="">— None (all areas) —</option>
                  {stations.filter((s) => s.venueId === modEditor.venueId).map((s) => <option key={`${s.venueId}-${s.id}`} value={s.id}>{s.name} · {s.area}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Duration</label><input className="form-input" value={modEditor.duration} onChange={setM("duration")} placeholder="30 min" /></div>
              <div className="form-group"><label className="form-label">Icon</label>
                <select className="form-input" value={modEditor.icon} onChange={setM("icon")}>{ICONS.map((ic) => <option key={ic}>{ic}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Colour</label>
                <select className="form-input" value={modEditor.color} onChange={setM("color")}>{MOD_COLORS.map(([l, v]) => <option key={v} value={v}>{l}</option>)}</select>
              </div>
              <div className="form-group" style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 22 }}>
                <input type="checkbox" checked={modEditor.mandatory} onChange={setM("mandatory")} id="modMand" />
                <label htmlFor="modMand" className="form-label" style={{ margin: 0 }}>Mandatory</label>
              </div>
            </div>
            <div className="form-group"><label className="form-label">Description</label><textarea className="form-input" rows={2} value={modEditor.desc} onChange={setM("desc")} /></div>
            <div className="form-group"><label className="form-label">External training link (optional — redirect to another platform)</label><input className="form-input" value={modEditor.link} onChange={setM("link")} placeholder="https://... (course on another platform)" /></div>

            {/* Auto-assign BY STATION — categorisation is the station now (category removed) */}
            <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 12 }}>
              <label className="form-label">Auto-assign</label>
              <div style={{ fontSize: 12, color: "var(--gray)" }}>
                {modEditor.stationId
                  ? `Auto-assigns to staff at the “${stations.find((s) => s.id === modEditor.stationId)?.name || "selected"}” station when they're rostered there.`
                  : "No station selected — this module stays universal and won't auto-assign by station. Pick a Station above to drive auto-assign."}
              </div>
            </div>

            {/* Step sections — matches the module detail layout */}
            <div className="form-group">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <label className="form-label" style={{ margin: 0 }}>Step sections</label>
                <button type="button" className="btn btn-sm" onClick={addStep}>+ Add section</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {modEditor.steps.map((s, i) => (
                  <div key={i} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <input className="form-input" style={{ flex: 1 }} value={s.heading} onChange={setStep(i, "heading")} placeholder="Section heading (e.g. Before you do anything else)" />
                      {modEditor.steps.length > 1 && <button type="button" className="btn btn-sm btn-danger" onClick={() => removeStep(i)}>✕</button>}
                    </div>
                    <RichItemList value={s.items} onChange={setStepItems(i)} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>Each line becomes a bullet step. Add sections to group steps (Opening, Equipment, Final check…).</div>
            </div>

            <RefImageEditor value={modEditor.images} onChange={(imgs) => setModEditor((p) => ({ ...p, images: imgs }))} folder={`restaurantGroups/${groupId}/refimages/training`} showToast={showToast} />

            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveModule}>{modEditor.id ? "Save module" : "Create module"}</button>
              {modEditor.id && <button className="btn btn-danger" onClick={deleteModule}>Delete</button>}
              <button className="btn" onClick={() => setModEditor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {openAssignment && (
        <AssignmentDetail
          assignment={openAssignment}
          liveModule={modules.find((m) => m.id === openAssignment.moduleId) || modules.find((m) => m.title === openAssignment.moduleTitle && m.venueId === openAssignment.venueId)}
          groupId={groupId}
          canTick={canEdit || openAssignment.staffId === myStaff?.id}
          canVerify={canEdit}
          canComment={isMgr}
          actorName={me?.displayName || me?.name || me?.email || "Trainer"}
          showToast={showToast}
          onClose={() => setOpenAssign(null)}
        />
      )}
    </>
  );
}
