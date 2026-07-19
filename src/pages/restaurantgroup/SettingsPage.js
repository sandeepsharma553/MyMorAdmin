import React, { useEffect, useMemo, useState } from "react";
import { updateDoc, deleteDoc, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, groupDoc, contractClassificationsDoc, legalEntitiesDoc, publicHolidaysDoc, labourTargetsDoc } from "../../utils/restaurantGroupPaths";
import { AU_STATES, AU_PUBLIC_HOLIDAYS_SEED } from "./publicHolidays";
import { SUGGESTED_STATIONS } from "./rgConfig";
import { addToList, removeFromList, stationsInVenueArea, orphanStationsInVenue, buildStationPayload, areaGetsBreak, areaPinned, areaExclusive, orderedAreas, groupClusters, resolveLeaveTypes, empTypeIsSalaried } from "./staffStructureUtils";
import { DEFAULT_STOCK_CATEGORIES, DEFAULT_STOCK_UNITS, resolvePosNotePresets } from "./rgStockUtils";

const DEFAULT_ITEM_TYPES = ["ingredient", "product", "both"];

const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function SettingsPage() {
  const { groupId, group, venues, stations, equipment, roles, areas, empTypes, can, showToast, me } = useRG();
  const editable = can("settings", "edit");
  const isOwner = me?.groupRole === "owner"; // legal-entity editing is owner-only
  const venueName = (id) => venues.find((v) => v.id === id)?.name || "";
  const [tab, setTab] = useState("structure");
  const [venueTab, setVenueTab] = useState(venues[0]?.id || "");
  useEffect(() => { if (!venueTab && venues[0]) setVenueTab(venues[0].id); }, [venues]); // eslint-disable-line

  // ── Contract settings (gated subcollection docs; loaded on mount) ──
  const [classLevels, setClassLevels] = useState([]);
  const [newClass, setNewClass] = useState("");
  const [entities, setEntities] = useState([]);
  const [entForm, setEntForm] = useState(null); // {id?, name, venueIds[]} edit buffer
  // ── Public holidays (gated settings doc) ── seeded in-memory if absent (never auto-written)
  const [holidays, setHolidays] = useState([]);
  const [phSeeded, setPhSeeded] = useState(false);
  // ── Labour targets (gated settings/labourTargets doc — NOT the group doc, which is
  // group-readable: staff must not read $/hr + weekly revenue). Editor is ADMIN-ONLY;
  // the Ops group-doc editor still coexists until Step 2 removes it (different docs).
  const [labour, setLabour] = useState({ hourlyRate: "", weeklyRevenue: "" });
  useEffect(() => {
    if (!groupId) return;
    getDoc(contractClassificationsDoc(groupId)).then((d) => setClassLevels(d.exists() ? (d.data().levels || []) : [])).catch(() => {});
    getDoc(legalEntitiesDoc(groupId)).then((d) => setEntities(d.exists() ? (d.data().entities || []) : [])).catch(() => {});
    getDoc(labourTargetsDoc(groupId)).then((d) => {
      const x = d.exists() ? d.data() : {};
      setLabour({ hourlyRate: x.hourlyRate ?? "", weeklyRevenue: x.weeklyRevenue ?? "" });
    }).catch(() => {});
    getDoc(publicHolidaysDoc(groupId)).then((d) => {
      const list = d.exists() ? (d.data().holidays || []) : [];
      if (list.length) { setHolidays(list); setPhSeeded(false); }
      else { setHolidays(AU_PUBLIC_HOLIDAYS_SEED); setPhSeeded(true); } // prefill only — not persisted
    }).catch(() => {});
  }, [groupId]);

  // PH edits stay in local state; a single Save writes the doc (sorted, blanks dropped).
  const phSet = (i, k, v) => setHolidays((p) => p.map((h, idx) => (idx === i ? { ...h, [k]: v } : h)));
  const phAdd = () => setHolidays((p) => [...p, { date: "", name: "", state: "ALL" }]);
  const phRemove = (i) => setHolidays((p) => p.filter((_, idx) => idx !== i));
  const savePH = async () => {
    const next = holidays.filter((h) => h.date && h.name).sort((a, b) => a.date.localeCompare(b.date));
    try { await setDoc(publicHolidaysDoc(groupId), { holidays: next, updatedAt: serverTimestamp() }, { merge: true }); setHolidays(next); setPhSeeded(false); showToast("Public holidays saved"); }
    catch { showToast("Could not save public holidays"); }
  };

  // Numbers only; blank clears to null (same convention as the old Ops saveNumber).
  const saveLabour = async () => {
    const num = (v) => { const t = String(v ?? "").trim(); if (t === "") return null; const n = Number(t); return isNaN(n) ? undefined : n; };
    const hourlyRate = num(labour.hourlyRate);
    const weeklyRevenue = num(labour.weeklyRevenue);
    if (hourlyRate === undefined || weeklyRevenue === undefined) return showToast("Labour targets must be numbers");
    try {
      await setDoc(labourTargetsDoc(groupId), { hourlyRate, weeklyRevenue, updatedAt: serverTimestamp() }, { merge: true });
      showToast("Labour targets saved");
    } catch { showToast("Could not save labour targets"); }
  };

  const saveClassLevels = async (next) => {
    setClassLevels(next);
    try { await setDoc(contractClassificationsDoc(groupId), { levels: next, updatedAt: serverTimestamp() }, { merge: true }); }
    catch { showToast("Could not save classification levels"); }
  };
  const addClass = () => { const v = newClass.trim(); if (!v || classLevels.includes(v)) return; saveClassLevels([...classLevels, v]); setNewClass(""); };
  const removeClass = (v) => saveClassLevels(classLevels.filter((x) => x !== v));
  const moveClass = (i, dir) => { const j = i + dir; if (j < 0 || j >= classLevels.length) return; const n = [...classLevels]; [n[i], n[j]] = [n[j], n[i]]; saveClassLevels(n); };

  const saveEntities = async (next) => {
    setEntities(next);
    try { await setDoc(legalEntitiesDoc(groupId), { entities: next, updatedAt: serverTimestamp() }, { merge: true }); }
    catch { showToast("Could not save legal entities"); }
  };
  const startEnt = (e) => setEntForm(e ? { ...e, venueIds: [...(e.venueIds || [])] } : { name: "", venueIds: [], address: "", abn: "" });
  const toggleEntVenue = (vid) => setEntForm((p) => ({ ...p, venueIds: p.venueIds.includes(vid) ? p.venueIds.filter((x) => x !== vid) : [...p.venueIds, vid] }));
  const saveEnt = () => {
    const name = (entForm.name || "").trim();
    if (!name) return showToast("Enter the full legal name");
    const id = entForm.id || slug(name) || `ent-${Date.now()}`;
    const rec = { id, name, venueIds: entForm.venueIds || [], address: (entForm.address || "").trim(), abn: (entForm.abn || "").trim() };
    saveEntities(entForm.id ? entities.map((e) => (e.id === entForm.id ? rec : e)) : [...entities, rec]);
    setEntForm(null);
  };
  const removeEnt = (e) => saveEntities(entities.filter((x) => x.id !== e.id));

  // ── Stations ──
  const venueStations = useMemo(() => stations.filter((s) => s.venueId === venueTab), [stations, venueTab]);
  const [stForm, setStForm] = useState(null); // {id, name, area, color}
  // station colour defaults by area (#5): FOH green, BOH blue, CK purple
  const AREA_COLOR_DEFAULT = { FOH: "#16a34a", BOH: "#2563eb", CK: "#8b5cf6" };
  const STATION_COLORS = [["Green (FOH)", "#16a34a"], ["Blue (BOH)", "#2563eb"], ["Purple (CK)", "#8b5cf6"], ["Amber", "#d97706"], ["Red", "#C0392B"], ["Pink", "#db2777"], ["Teal", "#0d9488"], ["Slate", "#475569"]];
  const saveStation = async () => {
    if (!stForm.name.trim()) return showToast("Station name required");
    const payload = { name: stForm.name.trim(), area: stForm.area, color: stForm.color || AREA_COLOR_DEFAULT[stForm.area] || "#6b7280", venueId: venueTab, order: stForm.order ?? venueStations.length };
    try {
      if (stForm.id) { await updateDoc(doc(venueCol(groupId, venueTab, "stations"), stForm.id), payload); }
      else {
        const id = slug(stForm.name) || `st-${Date.now()}`;
        if (venueStations.some((s) => s.id === id)) return showToast("A station with a similar name already exists");
        await setDoc(doc(venueCol(groupId, venueTab, "stations"), id), { ...payload, createdAt: serverTimestamp() });
      }
      showToast("Station saved"); setStForm(null);
    } catch { showToast("Could not save station"); }
  };
  const quickAdd = async (name, area) => {
    if (venueStations.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    try { await setDoc(doc(venueCol(groupId, venueTab, "stations"), slug(name)), { name, area, color: AREA_COLOR_DEFAULT[area] || "#6b7280", venueId: venueTab, order: venueStations.length, createdAt: serverTimestamp() }); }
    catch { showToast("Could not add"); }
  };
  const removeStation = async (s) => {
    try { await deleteDoc(doc(venueCol(groupId, venueTab, "stations"), s.id)); showToast("Station removed"); }
    catch { showToast("Could not remove"); }
  };

  // ── Venue → Area → Station linked authoring (Staff structure tab) ──
  // Add a station IN CONTEXT: its area + venueId come from where the owner is authoring.
  const [stnDraft, setStnDraft] = useState({}); // { "venueId::area": text }
  const ctxKey = (vid, a) => `${vid}::${a}`;
  const setDraft = (vid, a, val) => setStnDraft((p) => ({ ...p, [ctxKey(vid, a)]: val }));
  const addStationCtx = async (vid, area) => {
    const name = (stnDraft[ctxKey(vid, area)] || "").trim();
    if (!name) return;
    const venueStns = stations.filter((s) => s.venueId === vid);
    const id = slug(name) || `st-${Date.now()}`;
    if (venueStns.some((s) => s.id === id || s.name.toLowerCase() === name.toLowerCase())) return showToast("A station with a similar name already exists in this venue");
    try {
      await setDoc(doc(venueCol(groupId, vid, "stations"), id), { ...buildStationPayload(name, area, vid, AREA_COLOR_DEFAULT[area] || "#6b7280", venueStns.length), createdAt: serverTimestamp() });
      setDraft(vid, area, ""); showToast("Station added");
    } catch { showToast("Could not add station"); }
  };
  const delStation = async (vid, st) => {
    try { await deleteDoc(doc(venueCol(groupId, vid, "stations"), st.id)); showToast("Station removed"); }
    catch { showToast("Could not remove"); }
  };

  // ── Temperature units (fridges/freezers/etc.) ──
  const UNIT_TYPES = ["Fridge", "Freezer", "Cool room", "Hot hold", "Grill", "Display", "Other"];
  const DEFAULT_RANGE = { Fridge: [1, 5], Freezer: [-22, -15], "Cool room": [1, 5], "Hot hold": [60, 75], Grill: [165, 230], Display: [1, 5], Other: ["", ""] };
  const SUGGESTED_UNITS = [["Fridge 1", "Fridge"], ["Fridge 2", "Fridge"], ["Freezer 1", "Freezer"], ["Cool room", "Cool room"], ["Hot hold", "Hot hold"], ["Grill", "Grill"]];
  const venueEquipment = useMemo(() => equipment.filter((e) => e.venueId === venueTab), [equipment, venueTab]);
  const [eqForm, setEqForm] = useState(null); // {id, name, type, minTemp, maxTemp}
  const saveUnit = async () => {
    if (!eqForm.name.trim()) return showToast("Unit name required");
    const mn = eqForm.minTemp === "" ? null : Number(eqForm.minTemp);
    const mx = eqForm.maxTemp === "" ? null : Number(eqForm.maxTemp);
    if ((eqForm.minTemp !== "" && isNaN(mn)) || (eqForm.maxTemp !== "" && isNaN(mx))) return showToast("Min and max must be numbers");
    if (mn !== null && mx !== null && mn >= mx) return showToast("Safe min must be less than max");
    const payload = {
      name: eqForm.name.trim(), type: eqForm.type, venueId: venueTab, order: eqForm.order ?? venueEquipment.length,
      minTemp: mn, maxTemp: mx,
    };
    try {
      if (eqForm.id) { await updateDoc(doc(venueCol(groupId, venueTab, "equipment"), eqForm.id), payload); }
      else {
        const id = slug(eqForm.name) || `eq-${Date.now()}`;
        if (venueEquipment.some((e) => e.id === id)) return showToast("A unit with a similar name already exists");
        await setDoc(doc(venueCol(groupId, venueTab, "equipment"), id), { ...payload, createdAt: serverTimestamp() });
      }
      showToast("Unit saved"); setEqForm(null);
    } catch { showToast("Could not save unit"); }
  };
  const quickAddUnit = async (name, type) => {
    if (venueEquipment.some((e) => e.name.toLowerCase() === name.toLowerCase())) return;
    const [mn, mx] = DEFAULT_RANGE[type] || ["", ""];
    try { await setDoc(doc(venueCol(groupId, venueTab, "equipment"), slug(name)), { name, type, minTemp: mn === "" ? null : mn, maxTemp: mx === "" ? null : mx, venueId: venueTab, order: venueEquipment.length, createdAt: serverTimestamp() }); }
    catch { showToast("Could not add"); }
  };
  const removeUnit = async (e) => {
    try { await deleteDoc(doc(venueCol(groupId, venueTab, "equipment"), e.id)); showToast("Unit removed"); }
    catch { showToast("Could not remove"); }
  };

  // ── Roles ──
  const [newRole, setNewRole] = useState("");
  const saveRoles = async (next) => {
    try { await updateDoc(groupDoc(groupId), { roles: next }); }
    catch { showToast("Could not save roles"); }
  };
  const addRole = async () => {
    const next = addToList(roles, newRole);
    setNewRole("");
    if (next === roles) return; // empty or duplicate — nothing to save
    await saveRoles(next); showToast("Role added");
  };
  const removeRole = async (r) => { await saveRoles(removeFromList(roles, r)); };

  // ── Areas ── (same shape as Roles: an editable group-doc list, FOH/BOH by default).
  // Companion fields (group.areas STAYS a string[]): areaBreak — per-area rostered-break
  // flag (missing entry → ON), and areaOrder — explicit display order (drag to reorder).
  const [newArea, setNewArea] = useState("");
  const [dragArea, setDragArea] = useState(null); // index (within areasOrdered) being dragged
  const areasOrdered = orderedAreas(group);
  const saveAreas = async (next) => {
    try { await updateDoc(groupDoc(groupId), { areas: next }); }
    catch { showToast("Could not save areas"); }
  };
  const addArea = async () => {
    const next = addToList(areas, newArea);
    setNewArea("");
    if (next === areas) return; // empty or duplicate — nothing to save
    await saveAreas(next); showToast("Area added");
  };
  const removeArea = async (a) => { await saveAreas(removeFromList(areas, a)); };
  // whole-map writes (not dot-notation) — area names are free text and may contain dots
  const toggleAreaBreak = async (name) => {
    const next = { ...(group?.areaBreak || {}), [name]: !areaGetsBreak(group, name) };
    try { await updateDoc(groupDoc(groupId), { areaBreak: next }); }
    catch { showToast("Could not save break setting"); }
  };
  const toggleAreaPinned = async (name) => {
    const next = { ...(group?.areaPinned || {}), [name]: !areaPinned(group, name) };
    try { await updateDoc(groupDoc(groupId), { areaPinned: next }); }
    catch { showToast("Could not save pin setting"); }
  };
  // exclusive: staff who hold this area are shown ONLY under its planner section,
  // ignoring their other areas (membership capture — ordering is unaffected)
  const toggleAreaExclusive = async (name) => {
    const next = { ...(group?.areaExclusive || {}), [name]: !areaExclusive(group, name) };
    try { await updateDoc(groupDoc(groupId), { areaExclusive: next }); }
    catch { showToast("Could not save exclusive setting"); }
  };
  const dropArea = async (to) => {
    const from = dragArea; setDragArea(null);
    if (from === null || from === to) return;
    const next = [...areasOrdered]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    try { await updateDoc(groupDoc(groupId), { areaOrder: next }); }
    catch { showToast("Could not save area order"); }
  };

  // ── Clusters (Phase 3a) ── group.clusters = [{ id, name }] — named labour pools; venues
  // point at one via venue.clusterId (assigned in Venue Manager). Whole-array writes, same
  // pattern as Areas. Delete BLOCKS while any venue is still assigned (no silent orphaning).
  const clusters = groupClusters(group);
  const [newCluster, setNewCluster] = useState("");
  const [clusterEdit, setClusterEdit] = useState(null); // { id, name } rename buffer
  const saveClusters = async (next) => {
    try { await updateDoc(groupDoc(groupId), { clusters: next }); }
    catch { showToast("Could not save clusters"); }
  };
  const addCluster = async () => {
    const name = newCluster.trim();
    if (!name) return;
    if (clusters.some((c) => c.name.toLowerCase() === name.toLowerCase())) return showToast("A cluster with that name already exists");
    // stable generated id — NEVER the name (names are editable; availability keys need id stability)
    const id = `c-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36).padStart(2, "0")}`;
    await saveClusters([...clusters, { id, name }]);
    setNewCluster(""); showToast("Cluster added");
  };
  const renameCluster = async () => {
    const name = (clusterEdit?.name || "").trim();
    if (!name) return showToast("Cluster name required");
    await saveClusters(clusters.map((c) => (c.id === clusterEdit.id ? { ...c, name } : c)));
    setClusterEdit(null); showToast("Cluster renamed");
  };
  const removeCluster = async (c) => {
    const assigned = venues.filter((v) => v.clusterId === c.id);
    if (assigned.length) return showToast(`Can't delete "${c.name}" — ${assigned.length} venue${assigned.length === 1 ? "" : "s"} still assigned (${assigned.map((v) => v.name).join(", ")}). Reassign in Venue Manager first.`);
    await saveClusters(clusters.filter((x) => x.id !== c.id));
    showToast("Cluster deleted");
  };

  // ── Leave types (Phase 4a) ── group.leaveTypes = string[] (mirror Areas: whole-array
  // writes; order here = chooser order, drag to reorder). "Other" is PERMANENT in the
  // request forms — never stored in this list, never removable, always appended last.
  const leaveTypes = resolveLeaveTypes(group);
  const [newLeaveType, setNewLeaveType] = useState("");
  const [dragLeave, setDragLeave] = useState(null); // index being dragged
  const saveLeaveTypes = async (next) => {
    try { await updateDoc(groupDoc(groupId), { leaveTypes: next }); }
    catch { showToast("Could not save leave types"); }
  };
  const addLeaveType = async () => {
    const name = newLeaveType.trim();
    if (!name) return;
    if (name.toLowerCase() === "other") return showToast('"Other" is built-in — it always appears at the end of the chooser');
    const next = addToList(leaveTypes, name);
    setNewLeaveType("");
    if (next === leaveTypes) return; // duplicate — nothing to save
    await saveLeaveTypes(next); showToast("Leave type added");
  };
  const removeLeaveType = async (t) => { await saveLeaveTypes(removeFromList(leaveTypes, t)); };
  const dropLeaveType = async (to) => {
    const from = dragLeave; setDragLeave(null);
    if (from === null || from === to) return;
    const next = [...leaveTypes]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    await saveLeaveTypes(next);
  };

  // ── POS kitchen-note presets ── group.posNotePresets = string[] (mirror Leave types:
  // whole-array writes; order here = chip order on the POS; resolver seeds defaults).
  const posNotePresets = resolvePosNotePresets(group);
  const [newNotePreset, setNewNotePreset] = useState("");
  const [dragNote, setDragNote] = useState(null); // index being dragged
  const saveNotePresets = async (next) => {
    try { await updateDoc(groupDoc(groupId), { posNotePresets: next }); }
    catch { showToast("Could not save POS note presets"); }
  };
  const addNotePreset = async () => {
    const next = addToList(posNotePresets, newNotePreset);
    setNewNotePreset("");
    if (next === posNotePresets) return; // empty or duplicate — nothing to save
    await saveNotePresets(next); showToast("Preset added");
  };
  const removeNotePreset = async (t) => { await saveNotePresets(removeFromList(posNotePresets, t)); };
  const dropNotePreset = async (to) => {
    const from = dragNote; setDragNote(null);
    if (from === null || from === to) return;
    const next = [...posNotePresets]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
    await saveNotePresets(next);
  };

  // ── Employment types ── (same shape as Areas/Roles: an editable group-doc list)
  const [newEmpType, setNewEmpType] = useState("");
  const saveEmpTypes = async (next) => {
    try { await updateDoc(groupDoc(groupId), { empTypes: next }); }
    catch { showToast("Could not save employment types"); }
  };
  const addEmpType = async () => {
    const next = addToList(empTypes, newEmpType);
    setNewEmpType("");
    if (next === empTypes) return; // empty or duplicate — nothing to save
    await saveEmpTypes(next); showToast("Employment type added");
  };
  const removeEmpType = async (t) => { await saveEmpTypes(removeFromList(empTypes, t)); };
  // Salary/Hourly per employment type — companion map beside empTypes (mirrors the Areas
  // card's Break toggle exactly: plain map keyed by the type NAME, whole-value write).
  // Unset key → seed default (only "Full-time" salaried) via empTypeIsSalaried.
  const toggleEmpTypeSalaried = async (t) => {
    const next = { ...(group?.empTypeSalaried || {}), [t]: !empTypeIsSalaried(group, t) };
    try { await updateDoc(groupDoc(groupId), { empTypeSalaried: next }); }
    catch { showToast("Could not save pay basis"); }
  };

  // ── Certificates ── (owner-editable list; consumed by the Staff cert picker)
  const CERT_DEFAULTS = ["RSA", "Food Safety Supervisor", "Food Handler", "First Aid / CPR", "Working with Children", "Barista Certificate", "Allergen Awareness"];
  const certOptions = group?.certOptions?.length ? group.certOptions : CERT_DEFAULTS;
  const [newCert, setNewCert] = useState("");
  const saveCertOptions = async (next) => { try { await updateDoc(groupDoc(groupId), { certOptions: next }); } catch { showToast("Could not save certificates"); } };
  const addCertOption = async () => { const next = addToList(certOptions, newCert); setNewCert(""); if (next === certOptions) return; await saveCertOptions(next); showToast("Certificate added"); };
  const removeCertOption = async (c) => { await saveCertOptions(removeFromList(certOptions, c)); };

  // ── Stock master-lists ── (group-doc lists, same add/remove pattern; consumed by Stock)
  const stockCategories = group?.stockCategories?.length ? group.stockCategories : DEFAULT_STOCK_CATEGORIES;
  const stockUnits = group?.stockUnits?.length ? group.stockUnits : DEFAULT_STOCK_UNITS;
  const stockItemTypes = group?.stockItemTypes?.length ? group.stockItemTypes : DEFAULT_ITEM_TYPES;
  const purchaseUnits = group?.purchaseUnits?.length ? group.purchaseUnits : stockUnits;
  const recipeUnits = group?.recipeUnits?.length ? group.recipeUnits : stockUnits;
  const [stockDraft, setStockDraft] = useState({});
  const setSD = (field, v) => setStockDraft((p) => ({ ...p, [field]: v }));
  const saveGroupList = async (field, next) => {
    try { await updateDoc(groupDoc(groupId), { [field]: next }); }
    catch { showToast("Could not save list"); }
  };
  const addStockItem = async (field, list) => {
    const next = addToList(list, stockDraft[field] || "");
    setSD(field, "");
    if (next === list) return; // empty or duplicate
    await saveGroupList(field, next); showToast("Added");
  };
  const removeStockItem = (field, list, val) => saveGroupList(field, removeFromList(list, val));

  if (!can("settings", "view")) {
    return <div className="card" style={{ color: "var(--gray)", fontSize: 14 }}>You don’t have access to Settings. Ask an admin if you need it.</div>;
  }

  return (
    <>
      <div className="tabs" style={{ marginBottom: 16 }}>
        {[["structure", "Staff structure"], ["stations", "Stations"], ["units", "Temperature units"], ["stock", "Stock lists"], ["holidays", "Public Holidays"], ["contracts", "Contracts"]].map(([id, l]) => (
          <button key={id} className={`tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{l}</button>
        ))}
      </div>

      {/* STOCK MASTER-LISTS */}
      {tab === "stock" && (() => {
        const StockList = ({ title, sub, field, list, ph }) => (
          <div className="card">
            <div className="card-head"><div><span className="card-title">{title}</span><span className="card-sub">{sub}</span></div></div>
            {list.map((v) => (
              <div key={v} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <span style={{ fontSize: 13 }}>{v}</span>
                {editable && list.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the list (existing items keep their value)" onClick={() => removeStockItem(field, list, v)}>✕</button>}
              </div>
            ))}
            {editable && (
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <input className="form-input" value={stockDraft[field] || ""} onChange={(e) => setSD(field, e.target.value)} placeholder={ph} onKeyDown={(e) => e.key === "Enter" && addStockItem(field, list)} />
                <button className="btn btn-primary" onClick={() => addStockItem(field, list)}>Add</button>
              </div>
            )}
          </div>
        );
        return (
          <>
            <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>
              Master-lists used by the <strong>Stock</strong> module item editor. Suppliers are managed on the Stock → Suppliers tab.
            </div>
            <div className="grid-2">
              {StockList({ title: "Categories", sub: "Item category picker", field: "stockCategories", list: stockCategories, ph: "New category (e.g. Dairy)" })}
              {StockList({ title: "Stock units", sub: "Counted / on-hand unit", field: "stockUnits", list: stockUnits, ph: "New unit (e.g. tray)" })}
              {StockList({ title: "Item types", sub: "Ingredient / product / both — drives costing", field: "stockItemTypes", list: stockItemTypes, ph: "New item type" })}
              {StockList({ title: "Purchase units", sub: "Unit you buy in", field: "purchaseUnits", list: purchaseUnits, ph: "New purchase unit (e.g. case)" })}
              {StockList({ title: "Recipe units", sub: "Unit used in recipes", field: "recipeUnits", list: recipeUnits, ph: "New recipe unit (e.g. portion)" })}
            </div>
          </>
        );
      })()}

      {/* STATIONS */}
      {tab === "stations" && (
        <>
          <div className="tabs" style={{ marginBottom: 14 }}>
            {venues.map((v) => (
              <button key={v.id} className={`tab ${venueTab === v.id ? "active" : ""}`} onClick={() => setVenueTab(v.id)}>{v.name}</button>
            ))}
          </div>
          <div className="card">
            <div className="card-head">
              <div><span className="card-title">Stations</span><span className="card-sub">{venues.find((v) => v.id === venueTab)?.name} — staff/checklists/training attach to a station</span></div>
              {editable && <button className="btn btn-sm btn-primary" onClick={() => setStForm({ id: null, name: "", area: "BOH" })}>+ Add station</button>}
            </div>

            {editable && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "var(--gray)", alignSelf: "center" }}>Quick add:</span>
                {Object.keys(SUGGESTED_STATIONS).flatMap((a) => SUGGESTED_STATIONS[a].map((n) => (
                  <button key={a + n} className="btn btn-sm" onClick={() => quickAdd(n, a)} disabled={venueStations.some((s) => s.name.toLowerCase() === n.toLowerCase())}>{n} <span style={{ color: "var(--gray)" }}>· {a}</span></button>
                )))}
              </div>
            )}

            <div className="grid-2">
              {venueStations.map((s) => (
                <div key={s.id} className="leave-card" style={{ marginBottom: 0 }}>
                  <span className={`pill ${s.area === "BOH" ? "pill-amber" : "pill-green"}`}>{s.area}</span>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                  {editable && <><button className="btn btn-sm" onClick={() => setStForm({ id: s.id, name: s.name, area: s.area, color: s.color || "", order: s.order })}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeStation(s)}>✕</button></>}
                </div>
              ))}
              {venueStations.length === 0 && <div style={{ fontSize: 13, color: "var(--gray)" }}>No stations yet for this venue.</div>}
            </div>
          </div>
        </>
      )}

      {/* TEMPERATURE UNITS */}
      {tab === "units" && (
        <>
          <div className="tabs" style={{ marginBottom: 14 }}>
            {venues.map((v) => (
              <button key={v.id} className={`tab ${venueTab === v.id ? "active" : ""}`} onClick={() => setVenueTab(v.id)}>{v.name}</button>
            ))}
          </div>
          <div className="card">
            <div className="card-head">
              <div><span className="card-title">Temperature units</span><span className="card-sub">{venues.find((v) => v.id === venueTab)?.name} — fridges, freezers, grills… with safe ranges for the log</span></div>
              {editable && <button className="btn btn-sm btn-primary" onClick={() => setEqForm({ id: null, name: "", type: "Fridge", minTemp: 1, maxTemp: 5 })}>+ Add unit</button>}
            </div>

            {editable && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
                <span style={{ fontSize: 11, color: "var(--gray)", alignSelf: "center" }}>Quick add:</span>
                {SUGGESTED_UNITS.map(([n, t]) => (
                  <button key={n} className="btn btn-sm" onClick={() => quickAddUnit(n, t)} disabled={venueEquipment.some((e) => e.name.toLowerCase() === n.toLowerCase())}>{n}</button>
                ))}
              </div>
            )}

            <div className="grid-2">
              {venueEquipment.map((e) => (
                <div key={e.id} className="leave-card" style={{ marginBottom: 0 }}>
                  <span className="pill pill-blue">{e.type}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</div>
                    <div style={{ fontSize: 11, color: "var(--gray)" }}>Safe: {e.minTemp ?? "–"}°C to {e.maxTemp ?? "–"}°C</div>
                  </div>
                  {editable && <><button className="btn btn-sm" onClick={() => setEqForm({ id: e.id, name: e.name, type: e.type, minTemp: e.minTemp ?? "", maxTemp: e.maxTemp ?? "", order: e.order })}>Edit</button>
                    <button className="btn btn-sm btn-danger" onClick={() => removeUnit(e)}>✕</button></>}
                </div>
              ))}
              {venueEquipment.length === 0 && <div style={{ fontSize: 13, color: "var(--gray)" }}>No units yet for this venue.</div>}
            </div>
          </div>
        </>
      )}

      {/* STAFF STRUCTURE — Areas + Roles + Stations-by-area, the whole flow in one view */}
      {tab === "structure" && (
        <>
          <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>
            Define the staff structure — the <strong>Areas</strong> and <strong>Roles</strong> staff can be assigned, and the <strong>Stations</strong> within each venue. Used across Staff, Shifts, Training, Checklists &amp; permissions.
          </div>
          <div className="grid-2">
            {/* AREAS — drag to reorder (writes areaOrder); per-area rostered-break toggle (writes areaBreak) */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Areas</span><span className="card-sub">Staff &amp; checklists group by these — drag to reorder · Pin sorts first · Exclusive captures its staff · Break = rostered break</span></div></div>
              {areasOrdered.map((a, i) => (
                <div key={a} className="staff-meta-row" draggable={editable}
                  onDragStart={() => setDragArea(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropArea(i)} onDragEnd={() => setDragArea(null)}
                  style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)", cursor: editable ? "grab" : "default", opacity: dragArea === i ? 0.5 : 1 }}>
                  <span style={{ fontSize: 13 }}>{editable && <span style={{ color: "var(--gray)", marginRight: 6 }} title="Drag to reorder">⠿</span>}{a}</span>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <button className={`btn btn-sm ${areaPinned(group, a) ? "btn-primary" : ""}`} disabled={!editable}
                      title={areaPinned(group, a) ? "Pinned — this area's section sorts first on the Shift Planner" : "Not pinned — sorts in list order after pinned areas"}
                      onClick={() => editable && toggleAreaPinned(a)}>{areaPinned(group, a) ? "Pin ✓" : "Pin ✕"}</button>
                    <button className={`btn btn-sm ${areaExclusive(group, a) ? "btn-primary" : ""}`} disabled={!editable}
                      title={areaExclusive(group, a) ? "Exclusive — staff holding this area appear ONLY under it on the planner, ignoring their other areas" : "Not exclusive — combines normally into Multi-area"}
                      onClick={() => editable && toggleAreaExclusive(a)}>{areaExclusive(group, a) ? "Exclusive ✓" : "Exclusive ✕"}</button>
                    <button className={`btn btn-sm ${areaGetsBreak(group, a) ? "btn-primary" : ""}`} disabled={!editable}
                      title={areaGetsBreak(group, a) ? "Rostered break ON — ≥5h shifts on this area's stations get a 30 min unpaid break" : "Rostered break OFF for this area"}
                      onClick={() => editable && toggleAreaBreak(a)}>{areaGetsBreak(group, a) ? "Break ✓" : "Break ✕"}</button>
                    {editable && areas.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the picklist (existing staff keep their area)" onClick={() => removeArea(a)}>✕</button>}
                  </span>
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="New area (e.g. Bar)" onKeyDown={(e) => e.key === "Enter" && addArea()} />
                  <button className="btn btn-primary" onClick={addArea}>Add</button>
                </div>
              )}
            </div>
            {/* CLUSTERS (Phase 3a) — named labour pools of venues; venue.clusterId is assigned
                in Venue Manager. Delete BLOCKS while venues are still assigned. */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Clusters</span><span className="card-sub">Labour pools of venues — availability will be posted per cluster · assign venues in Venue Manager</span></div></div>
              {clusters.map((c) => {
                const count = venues.filter((v) => v.clusterId === c.id).length;
                return (
                  <div key={c.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                    {clusterEdit?.id === c.id ? (
                      <span style={{ display: "inline-flex", gap: 6, flex: 1 }}>
                        <input className="form-input" value={clusterEdit.name} onChange={(e) => setClusterEdit((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && renameCluster()} autoFocus />
                        <button className="btn btn-sm btn-primary" onClick={renameCluster}>Save</button>
                        <button className="btn btn-sm" onClick={() => setClusterEdit(null)}>Cancel</button>
                      </span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13 }}>{c.name} <span style={{ fontSize: 11, color: "var(--gray)" }}>· {count} venue{count === 1 ? "" : "s"}</span></span>
                        {editable && (
                          <span style={{ display: "inline-flex", gap: 4 }}>
                            <button className="btn btn-sm" onClick={() => setClusterEdit({ id: c.id, name: c.name })}>Rename</button>
                            <button className="btn btn-sm btn-danger" title={count ? "Blocked — reassign its venues first" : "Delete cluster"} onClick={() => removeCluster(c)}>✕</button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
              {!clusters.length && <div style={{ fontSize: 12, color: "var(--gray)" }}>No clusters yet — add one, then assign venues in Venue Manager.</div>}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newCluster} onChange={(e) => setNewCluster(e.target.value)} placeholder="New cluster (e.g. Sydney CBD)" onKeyDown={(e) => e.key === "Enter" && addCluster()} />
                  <button className="btn btn-primary" onClick={addCluster}>Add</button>
                </div>
              )}
            </div>
            {/* LEAVE TYPES (Phase 4a) — owner-editable chooser list for leave requests.
                "Other + free text" is permanent/appended by the forms and NOT in this list. */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Leave types</span><span className="card-sub">Offered in leave requests — drag to reorder · "Other + free text" is always available and not listed here</span></div></div>
              {leaveTypes.map((t, i) => (
                <div key={t} className="staff-meta-row" draggable={editable}
                  onDragStart={() => setDragLeave(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropLeaveType(i)} onDragEnd={() => setDragLeave(null)}
                  style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)", cursor: editable ? "grab" : "default", opacity: dragLeave === i ? 0.5 : 1 }}>
                  <span style={{ fontSize: 13 }}>{editable && <span style={{ color: "var(--gray)", marginRight: 6 }} title="Drag to reorder">⠿</span>}{t}</span>
                  {editable && leaveTypes.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the chooser (existing requests keep their stored type)" onClick={() => removeLeaveType(t)}>✕</button>}
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newLeaveType} onChange={(e) => setNewLeaveType(e.target.value)} placeholder="New leave type (e.g. Parental Leave)" onKeyDown={(e) => e.key === "Enter" && addLeaveType()} />
                  <button className="btn btn-primary" onClick={addLeaveType}>Add</button>
                </div>
              )}
            </div>
            {/* POS NOTE PRESETS — tap-to-add kitchen notes on the POS (global, all venues).
                Same editable group-doc list pattern as Leave types above. */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">POS note presets</span><span className="card-sub">Tap-to-add kitchen notes on the POS — drag to reorder · free text is always available too</span></div></div>
              {posNotePresets.map((t, i) => (
                <div key={t} className="staff-meta-row" draggable={editable}
                  onDragStart={() => setDragNote(i)} onDragOver={(e) => e.preventDefault()} onDrop={() => dropNotePreset(i)} onDragEnd={() => setDragNote(null)}
                  style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)", cursor: editable ? "grab" : "default", opacity: dragNote === i ? 0.5 : 1 }}>
                  <span style={{ fontSize: 13 }}>{editable && <span style={{ color: "var(--gray)", marginRight: 6 }} title="Drag to reorder">⠿</span>}{t}</span>
                  {editable && posNotePresets.length > 1 && <button className="btn btn-sm btn-danger" title="Remove the chip (existing order lines keep their stored note)" onClick={() => removeNotePreset(t)}>✕</button>}
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newNotePreset} onChange={(e) => setNewNotePreset(e.target.value)} placeholder="New preset (e.g. Sauce on the side)" onKeyDown={(e) => e.key === "Enter" && addNotePreset()} />
                  <button className="btn btn-primary" onClick={addNotePreset}>Add</button>
                </div>
              )}
            </div>
            {/* ROLES */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Roles</span><span className="card-sub">Used across staff, shifts &amp; permissions</span></div></div>
              {roles.map((r) => (
                <div key={r} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>{r}</span>
                  {editable && <button className="btn btn-sm btn-danger" onClick={() => removeRole(r)}>✕</button>}
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newRole} onChange={(e) => setNewRole(e.target.value)} placeholder="New role (e.g. Waitress)" onKeyDown={(e) => e.key === "Enter" && addRole()} />
                  <button className="btn btn-primary" onClick={addRole}>Add</button>
                </div>
              )}
            </div>
            {/* EMPLOYMENT TYPES */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Employment types</span><span className="card-sub">Shown in the Add-staff &amp; profile employment picker · Salary/Hourly drives the Employment-terms pay field</span></div></div>
              {empTypes.map((t) => (
                <div key={t} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>{t}</span>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {/* pay basis per type (Bug 1) — mirrors the Areas card's Break toggle */}
                    <button className={`btn btn-sm ${empTypeIsSalaried(group, t) ? "btn-primary" : ""}`} disabled={!editable}
                      title={empTypeIsSalaried(group, t) ? "Salary — staff of this type enter an ANNUAL salary in Employment terms" : "Hourly — staff of this type enter an HOURLY rate in Employment terms"}
                      onClick={() => editable && toggleEmpTypeSalaried(t)}>{empTypeIsSalaried(group, t) ? "Salary ✓" : "Hourly"}</button>
                    {editable && empTypes.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the picklist (existing staff keep their type)" onClick={() => removeEmpType(t)}>✕</button>}
                  </span>
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newEmpType} onChange={(e) => setNewEmpType(e.target.value)} placeholder="New type (e.g. Apprentice)" onKeyDown={(e) => e.key === "Enter" && addEmpType()} />
                  <button className="btn btn-primary" onClick={addEmpType}>Add</button>
                </div>
              )}
            </div>
            {/* CERTIFICATES */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Certificates</span><span className="card-sub">Shown in the Staff certificate picker</span></div></div>
              {certOptions.map((c) => (
                <div key={c} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>{c}</span>
                  {editable && certOptions.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the picklist (existing staff keep theirs)" onClick={() => removeCertOption(c)}>✕</button>}
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newCert} onChange={(e) => setNewCert(e.target.value)} placeholder="New certificate (e.g. Forklift Licence)" onKeyDown={(e) => e.key === "Enter" && addCertOption()} />
                  <button className="btn btn-primary" onClick={addCertOption}>Add</button>
                </div>
              )}
            </div>
            {/* LABOUR TARGETS — gated settings/labourTargets doc (NOT the group doc):
                staff must not read $/hr + weekly revenue from Firestore. */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Labour targets</span><span className="card-sub">Drive the labour % summary on the Shift Planner (gated doc — not staff-readable)</span></div></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div className="form-group"><label className="form-label">Default hourly rate ($)</label>
                  <input type="number" className="form-input" value={labour.hourlyRate} onChange={(e) => setLabour((p) => ({ ...p, hourlyRate: e.target.value }))} placeholder="e.g. 32" disabled={!editable} /></div>
                <div className="form-group"><label className="form-label">Weekly revenue ($)</label>
                  <input type="number" className="form-input" value={labour.weeklyRevenue} onChange={(e) => setLabour((p) => ({ ...p, weeklyRevenue: e.target.value }))} placeholder="e.g. 42000" disabled={!editable} /></div>
              </div>
              <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 8 }}>Blank clears a value (planner falls back to its built-in estimate).</div>
              {editable && <div className="btn-row"><button className="btn btn-primary" onClick={saveLabour}>Save</button></div>}
            </div>
          </div>

          {/* STATIONS — linked authoring: Venue → Area → Station. Add happens within a
              venue+area, so the station's area + venueId come from that context (mirrors
              the Add-staff cascade). Colour/advanced editing remains on the Stations tab. */}
          <div className="card" style={{ marginTop: 12 }}>
            <div className="card-head">
              <div><span className="card-title">Stations — by venue &amp; area</span><span className="card-sub">Add a station inside a venue + area; colour/advanced edits on the Stations tab</span></div>
              <button className="btn btn-sm" onClick={() => setTab("stations")}>Stations tab →</button>
            </div>
            {venues.map((v) => {
              const orphans = orphanStationsInVenue(stations, v.id, areas);
              return (
                <div key={v.id} style={{ padding: "8px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
                    <span className="nav-dot" style={{ background: v.color, marginRight: 5 }} />{v.name}
                  </div>
                  {areas.map((a) => {
                    const list = stationsInVenueArea(stations, v.id, a);
                    return (
                      <div key={a} style={{ margin: "0 0 8px 14px" }}>
                        <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 4 }}>{a}</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                          {list.map((s) => (
                            <span key={s.id} className="pill" style={{ background: s.color || "var(--gray-light)", color: s.color ? "#fff" : "var(--ink)" }}>
                              {s.name}{editable && <span style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => delStation(v.id, s)}>✕</span>}
                            </span>
                          ))}
                          {!list.length && <span style={{ fontSize: 11, color: "var(--gray)" }}>None yet</span>}
                          {editable && (
                            <span style={{ display: "inline-flex", gap: 4 }}>
                              <input className="form-input" style={{ width: 140, height: 28, fontSize: 12 }} placeholder={`+ ${a} station`} value={stnDraft[ctxKey(v.id, a)] || ""} onChange={(e) => setDraft(v.id, a, e.target.value)} onKeyDown={(e) => e.key === "Enter" && addStationCtx(v.id, a)} />
                              <button className="btn btn-sm" onClick={() => addStationCtx(v.id, a)}>Add</button>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {orphans.length > 0 && (
                    <div style={{ margin: "4px 0 0 14px" }}>
                      <div style={{ fontSize: 11, color: "var(--amber)", marginBottom: 4 }}>Other — area not in the current Areas list</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {orphans.map((s) => (
                          <span key={s.id} className="pill pill-amber" title="Station area is not in the current Areas list">{s.name} · {s.area || "—"}{editable && <span style={{ cursor: "pointer", marginLeft: 4 }} onClick={() => delStation(v.id, s)}>✕</span>}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {!areas.length && <div style={{ fontSize: 11, color: "var(--gray)", marginLeft: 14 }}>Add areas above first.</div>}
                </div>
              );
            })}
            {venues.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No venues.</div>}
          </div>
        </>
      )}

      {/* Station add/edit modal */}
      {stForm && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setStForm(null)}>
          <div className="rg-modal" style={{ maxWidth: 420 }}>
            <div className="modal-head"><span className="modal-title">{stForm.id ? "Edit station" : "New station"}</span><button className="modal-close" onClick={() => setStForm(null)}>✕</button></div>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={stForm.name} onChange={(e) => setStForm((p) => ({ ...p, name: e.target.value }))} placeholder="Grill" /></div>
            <div className="form-group"><label className="form-label">Area</label>
              <select className="form-input" value={stForm.area} onChange={(e) => setStForm((p) => ({ ...p, area: e.target.value, color: p.color || AREA_COLOR_DEFAULT[e.target.value] || "" }))}>{areas.map((a) => <option key={a}>{a}</option>)}</select>
            </div>
            <div className="form-group"><label className="form-label">Colour (shown on roster shift chips)</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STATION_COLORS.map(([l, c]) => (
                  <button key={c} type="button" className="btn btn-sm" title={l} onClick={() => setStForm((p) => ({ ...p, color: c }))}
                    style={{ background: c, width: 30, height: 30, borderRadius: 8, border: (stForm.color || AREA_COLOR_DEFAULT[stForm.area]) === c ? "2.5px solid var(--ink)" : "2.5px solid transparent" }} />
                ))}
              </div>
            </div>
            <div className="btn-row"><button className="btn btn-primary" onClick={saveStation}>Save station</button><button className="btn" onClick={() => setStForm(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Unit add/edit modal */}
      {eqForm && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEqForm(null)}>
          <div className="rg-modal" style={{ maxWidth: 440 }}>
            <div className="modal-head"><span className="modal-title">{eqForm.id ? "Edit unit" : "New unit"}</span><button className="modal-close" onClick={() => setEqForm(null)}>✕</button></div>
            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={eqForm.name} onChange={(e) => setEqForm((p) => ({ ...p, name: e.target.value }))} placeholder="Fridge 1" /></div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-input" value={eqForm.type} onChange={(e) => { const t = e.target.value; const [mn, mx] = DEFAULT_RANGE[t] || ["", ""]; setEqForm((p) => ({ ...p, type: t, minTemp: mn, maxTemp: mx })); }}>{UNIT_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="form-group"><label className="form-label">Safe min (°C)</label><input type="number" className="form-input" value={eqForm.minTemp} onChange={(e) => setEqForm((p) => ({ ...p, minTemp: e.target.value }))} placeholder="e.g. 1" /></div>
              <div className="form-group"><label className="form-label">Safe max (°C)</label><input type="number" className="form-input" value={eqForm.maxTemp} onChange={(e) => setEqForm((p) => ({ ...p, maxTemp: e.target.value }))} placeholder="e.g. 5" /></div>
            </div>
            <div style={{ fontSize: 10, color: "var(--gray)", marginBottom: 10 }}>Readings outside this range are flagged red in the Temperature Log. Leave blank for no limit.</div>
            <div className="btn-row"><button className="btn btn-primary" onClick={saveUnit}>Save unit</button><button className="btn" onClick={() => setEqForm(null)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* ── CONTRACTS: classification levels + legal entities ── */}
      {tab === "holidays" && (
        <>
          <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>
            Public holidays drive the <strong>Shift Planner</strong> day indicators (and penalty-rate calc later). National holidays use <strong>All states</strong>; add state-specific ones for the states your venues operate in.
          </div>
          {phSeeded && (
            <div className="card" style={{ background: "var(--amber-light, #fffbeb)", fontSize: 12, marginBottom: 12 }}>
              Suggested AU public holidays loaded — review and <strong>Save</strong> to keep them, or edit first. (Nothing is stored until you Save.)
            </div>
          )}
          <div className="card">
            <div className="card-head"><div><span className="card-title">Public holidays</span><span className="card-sub">Date, name and which state it applies to</span></div></div>
            {holidays.map((h, i) => (
              <div key={i} className="staff-meta-row" style={{ gap: 8, padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <input type="date" className="form-input" style={{ maxWidth: 160 }} value={h.date || ""} onChange={(e) => phSet(i, "date", e.target.value)} disabled={!editable} />
                <input className="form-input" style={{ flex: 1 }} value={h.name || ""} onChange={(e) => phSet(i, "name", e.target.value)} placeholder="Holiday name" disabled={!editable} />
                <select className="form-input" style={{ maxWidth: 140 }} value={h.state || "ALL"} onChange={(e) => phSet(i, "state", e.target.value)} disabled={!editable}>
                  <option value="ALL">All states</option>
                  {AU_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {editable && <button className="btn btn-sm btn-danger" onClick={() => phRemove(i)}>✕</button>}
              </div>
            ))}
            {holidays.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No public holidays yet — add them or load the suggestions.</div>}
            {editable && (
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button className="btn" onClick={phAdd}>+ Add holiday</button>
                <button className="btn btn-primary" onClick={savePH}>Save</button>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "contracts" && (
        <>
          <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 12 }}>
            Picklists for the <strong>Contract Generator</strong> — the MA000119 <strong>classification levels</strong> and your <strong>legal entities</strong> (full registered names) mapped to venues.
          </div>
          <div className="grid-2">
            {/* CLASSIFICATION LEVELS */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Classification levels</span><span className="card-sub">MA000119 levels offered in the generator</span></div></div>
              {classLevels.map((c, i) => (
                <div key={c} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>{c}</span>
                  {editable && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" disabled={i === 0} title="Move up" onClick={() => moveClass(i, -1)}>↑</button>
                      <button className="btn btn-sm" disabled={i === classLevels.length - 1} title="Move down" onClick={() => moveClass(i, 1)}>↓</button>
                      <button className="btn btn-sm btn-danger" onClick={() => removeClass(c)}>✕</button>
                    </div>
                  )}
                </div>
              ))}
              {classLevels.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No levels yet — add the MA000119 levels you use.</div>}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="e.g. Level 3 / Cook Grade 2" onKeyDown={(e) => e.key === "Enter" && addClass()} />
                  <button className="btn btn-primary" onClick={addClass}>Add</button>
                </div>
              )}
            </div>

            {/* LEGAL ENTITIES (owner-only edit) */}
            <div className="card">
              <div className="card-head">
                <div><span className="card-title">Legal entities</span><span className="card-sub">Full registered name + the venues each covers</span></div>
                {isOwner && <button className="btn btn-sm btn-primary" onClick={() => startEnt(null)}>+ Add entity</button>}
              </div>
              {entities.map((e) => (
                <div key={e.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>
                    <strong>{e.name}</strong>
                    <span style={{ fontSize: 11, color: "var(--gray)", marginLeft: 6 }}>{(e.venueIds || []).map(venueName).filter(Boolean).join(", ") || "— no venues —"}</span>
                  </span>
                  {isOwner && (
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-sm" onClick={() => startEnt(e)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => removeEnt(e)}>✕</button>
                    </div>
                  )}
                </div>
              ))}
              {entities.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No legal entities yet.</div>}
              {!isOwner && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 8 }}>Only the owner can add or edit legal entities.</div>}
            </div>
          </div>

          {/* Entity edit modal — owner only */}
          {entForm && isOwner && (
            <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEntForm(null)}>
              <div className="rg-modal" style={{ maxWidth: 460 }}>
                <div className="modal-head"><span className="modal-title">{entForm.id ? "Edit entity" : "Add entity"}</span><button className="modal-close" onClick={() => setEntForm(null)}>✕</button></div>
                <div className="form-group">
                  <label className="form-label">Full legal name (as registered — no auto “Pty Ltd”)</label>
                  <input className="form-input" value={entForm.name} onChange={(e) => setEntForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Mad Benji Pty Ltd" />
                </div>
                <div className="form-group">
                  <label className="form-label">Registered address (optional)</label>
                  <input className="form-input" value={entForm.address || ""} onChange={(e) => setEntForm((p) => ({ ...p, address: e.target.value }))} placeholder="e.g. 123 Smith St, Fitzroy VIC 3065" />
                </div>
                <div className="form-group">
                  <label className="form-label">ABN (optional)</label>
                  <input className="form-input" value={entForm.abn || ""} onChange={(e) => setEntForm((p) => ({ ...p, abn: e.target.value }))} placeholder="e.g. 12 345 678 901" />
                </div>
                <div className="form-group">
                  <label className="form-label">Venues this entity covers</label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {venues.map((v) => (
                      <button key={v.id} type="button" className={`btn btn-sm ${entForm.venueIds.includes(v.id) ? "btn-primary" : ""}`} onClick={() => toggleEntVenue(v.id)}>{v.name}</button>
                    ))}
                    {venues.length === 0 && <span style={{ fontSize: 11, color: "var(--gray)" }}>No venues.</span>}
                  </div>
                </div>
                <div className="btn-row"><button className="btn btn-primary" onClick={saveEnt}>Save entity</button><button className="btn" onClick={() => setEntForm(null)}>Cancel</button></div>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
