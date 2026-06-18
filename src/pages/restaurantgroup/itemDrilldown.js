/* Area → Station drill-down — PRESENTATION ONLY (Build 2a). Pure, no React/Firestore.
 *
 * Organises training modules / SOPs / checklists within a selected area by their
 * station. It only filters/groups what is DISPLAYED — it never changes eligibility or
 * who gets auto-assigned. A training module carries its area in `cat`, a checklist in
 * `area`; both may carry a `stationId`. Stations carry `area` + `venueId`. */

// Stations that belong to an area (optionally scoped to a venue) — for the station picker.
export const stationsForArea = (stations, area, venueId) =>
  (stations || []).filter((st) => st.area === area && (!venueId || venueId === "all" || st.venueId === venueId));

// Group items by station within an already-area-filtered list. Returns ordered groups:
// one per station that has items (in areaStations order), then a "General" group for
// items with no station (or a station not in this area). Empty station groups are dropped.
export const GENERAL_KEY = "__general__";
export const groupItemsByStation = (items, areaStations) => {
  const byId = {};
  (areaStations || []).forEach((st) => { byId[st.id] = { key: st.id, label: st.name, items: [] }; });
  const general = { key: GENERAL_KEY, label: "General (no station)", items: [] };
  (items || []).forEach((it) => {
    if (it.stationId && byId[it.stationId]) byId[it.stationId].items.push(it);
    else general.items.push(it);
  });
  const groups = (areaStations || []).map((st) => byId[st.id]).filter((g) => g.items.length);
  if (general.items.length) groups.push(general);
  return groups;
};

// Narrow to one station selection: "all" → unchanged; GENERAL_KEY → items with no
// station; a stationId → items tagged that station. Filter only — never adds/removes
// eligibility, just what's shown.
export const filterByStation = (items, stationSel) => {
  if (!stationSel || stationSel === "all") return items || [];
  if (stationSel === GENERAL_KEY) return (items || []).filter((it) => !it.stationId);
  return (items || []).filter((it) => it.stationId === stationSel);
};
