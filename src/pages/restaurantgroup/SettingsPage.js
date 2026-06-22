import React, { useEffect, useMemo, useState } from "react";
import { updateDoc, deleteDoc, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, groupDoc } from "../../utils/restaurantGroupPaths";
import { SUGGESTED_STATIONS } from "./rgConfig";
import { addToList, removeFromList, stationsInVenueArea, orphanStationsInVenue, buildStationPayload } from "./staffStructureUtils";
import { DEFAULT_STOCK_CATEGORIES, DEFAULT_STOCK_UNITS } from "./rgStockUtils";

const DEFAULT_ITEM_TYPES = ["ingredient", "product", "both"];

const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function SettingsPage() {
  const { groupId, group, venues, stations, equipment, roles, areas, empTypes, can, showToast } = useRG();
  const editable = can("settings", "edit");
  const [tab, setTab] = useState("structure");
  const [venueTab, setVenueTab] = useState(venues[0]?.id || "");
  useEffect(() => { if (!venueTab && venues[0]) setVenueTab(venues[0].id); }, [venues]); // eslint-disable-line

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

  // ── Areas ── (same shape as Roles: an editable group-doc list, FOH/BOH/Mgmt by default)
  const [newArea, setNewArea] = useState("");
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
        {[["structure", "Staff structure"], ["stations", "Stations"], ["units", "Temperature units"], ["stock", "Stock lists"]].map(([id, l]) => (
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
            {/* AREAS */}
            <div className="card">
              <div className="card-head"><div><span className="card-title">Areas</span><span className="card-sub">Staff &amp; checklists group by these (FOH, BOH, Mgmt…)</span></div></div>
              {areas.map((a) => (
                <div key={a} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>{a}</span>
                  {editable && areas.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the picklist (existing staff keep their area)" onClick={() => removeArea(a)}>✕</button>}
                </div>
              ))}
              {editable && (
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <input className="form-input" value={newArea} onChange={(e) => setNewArea(e.target.value)} placeholder="New area (e.g. Bar)" onKeyDown={(e) => e.key === "Enter" && addArea()} />
                  <button className="btn btn-primary" onClick={addArea}>Add</button>
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
              <div className="card-head"><div><span className="card-title">Employment types</span><span className="card-sub">Shown in the Add-staff &amp; profile employment picker</span></div></div>
              {empTypes.map((t) => (
                <div key={t} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span style={{ fontSize: 13 }}>{t}</span>
                  {editable && empTypes.length > 1 && <button className="btn btn-sm btn-danger" title="Remove from the picklist (existing staff keep their type)" onClick={() => removeEmpType(t)}>✕</button>}
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
    </>
  );
}
