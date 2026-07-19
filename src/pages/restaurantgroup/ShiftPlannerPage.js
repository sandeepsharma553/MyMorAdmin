import React, { useMemo, useState, useEffect } from "react";
import { addDoc, updateDoc, deleteDoc, doc, serverTimestamp, onSnapshot, deleteField } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol, staffInVenue, publicHolidaysDoc } from "../../utils/restaurantGroupPaths";
import { isPublicHoliday, isPHForAnyState, AU_PUBLIC_HOLIDAYS_SEED, venueState } from "./publicHolidays";
import { fullName, downloadCsv, weekKeyOf, localDateKey, FULL_DAY_TIMES, boundedTimes, hoursEnvelopeForDay, HOURS_KEYS, leaveLabel, fmtHours } from "./rgUtils";
import { staffAreas, staffAtStation, areaGetsBreak, areaPinned, areaExclusive, orderedAreas } from "./staffStructureUtils";
import { stationsForArea } from "./itemDrilldown";
import StaffCapabilityCard from "./StaffCapabilityCard";
import { checkAndCreateShiftAssignments } from "./checklistShiftUtils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
// Unified time options (Phase 3e): the shared rgUtils FULL-DAY list; the form's pickers
// are bounded to venue hours (open−1h … close+1h) via boundedTimes below. The local
// mkTimes/hhmmToMin copies are gone — rgUtils is the single source.
const STARTS = FULL_DAY_TIMES;
const ENDS = FULL_DAY_TIMES;
// "h:mmam/pm" option label → minutes (same parse rules as parseTime; for sorting the union list)
const timeToMin = (t) => {
  const m = /(\d+):(\d+)(am|pm)/i.exec(String(t || "").trim()); if (!m) return null;
  let h = parseInt(m[1], 10) % 12; if (/pm/i.test(m[3])) h += 12; return h * 60 + parseInt(m[2], 10);
};
// FULL_DAYS index → venue.hours day key: the shared rgUtils.HOURS_KEYS (Monday-first).
const ROLES = ["FOH — Bar", "FOH — Floor", "FOH — Barista", "BOH — Kitchen", "BOH — Fryer", "BOH — Washing", "Store Manager", "Central Kitchen"];
const HOURLY = 32;
const WEEKLY_REVENUE = 42000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function mondayOf(offset) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
const fmt = (d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

function parseTime(t) {
  if (!t) return 0;
  const m = /(\d+):(\d+)(am|pm)/i.exec(t.trim());
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h + parseInt(m[2], 10) / 60;
}
// Hours are on the PAID basis everywhere on this page (gross − EFFECTIVE break; see
// effectiveBreak in the component: manual override ?? area-derived). Gross appears only
// inside per-shift/per-row breakdowns via deriveBreak's grossHours. The old local
// shiftHours helper is gone — rgUtils.shiftHours is unchanged for other pages.
// ── ROSTERED break rule: AREA-DRIVEN. Eligibility = the shift's station → station.area →
// group.areaBreak[area] (Settings toggle, missing entry → ON). No station or no area → NO
// auto break. Eligible AND gross ≥ 5h → 30 min UNPAID; otherwise none. No keyword/substring
// area guessing — the flag is looked up by the exact area string. PLANNED hours only —
// actual clocked breaks (timeEntries) are a separate system. SINGLE SOURCE for the rule:
// callers resolve `eligible` via shiftBreakEligible; manual overrides via effectiveBreak.
const deriveBreak = (startStr, endStr, eligible) => {
  const grossHours = Math.max(0, parseTime(endStr) - parseTime(startStr));
  const breakMins = eligible && grossHours >= 5 ? 30 : 0;
  const unpaidHours = breakMins / 60;
  return { grossHours, breakMins, unpaidHours, paidHours: Math.max(0, grossHours - unpaidHours) };
};

const cellClass = (type) =>
  type === "evening" ? "shift-evening" : type === "open" ? "shift-open" : type === "off" ? "shift-off" : "shift-morning";

// The old hardcoded AREA_GROUPS taxonomy + keyword role/area guessing (roleArea/AREA_COLORS,
// which were dead code) are GONE — planner sections, filters and the break rule now come
// from the owner's configured areas (group.areas / areaOrder / areaBreak). See groupedRows.

export default function ShiftPlannerPage() {
  const { groupId, group, staff, scopedStaff, shifts, venues, stations, roles, assignments, perfNotes, checklists, leave, availability, labourTargets, selectedVenue, selectedVenueName, showToast, can, myStaff, myScope, noteErr } = useRG();
  const canEdit = can("shifts", "edit");
  const [offset, setOffset] = useState(0);
  const [modal, setModal] = useState(null); // { staffId, day } | true
  const [shiftDetail, setShiftDetail] = useState(null);
  const [capStaff, setCapStaff] = useState(null); // staff capability card
  const [areaFilter, setAreaFilter] = useState("all"); // all | FOH | BOH | Mgmt
  const [sortBy, setSortBy] = useState("az"); // az | za | newest | oldest — staff order within each section
  const [planStation, setPlanStation] = useState("all"); // Area→Station drill-down: all | stationId
  const [splitMode, setSplitMode] = useState(false);
  const [splitA, setSplitA] = useState("");
  const [splitB, setSplitB] = useState("");
  useEffect(() => { if (!splitA && venues[0]) setSplitA(venues[0].id); if (!splitB && venues[1]) setSplitB(venues[1].id); }, [venues]); // eslint-disable-line

  const monday = mondayOf(offset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const wk = weekKeyOf(monday);
  const weekLabel = `Week of ${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;

  // Staff can SEE the full roster for their venue(s) — who they're working with —
  // while editing stays gated behind canEdit. Managers/owners keep their scope.
  const visibleStaff = useMemo(() => {
    if (myScope !== "staff") return scopedStaff;
    const mv = myStaff?.venueIds?.length ? myStaff.venueIds : (myStaff?.venueId ? [myStaff.venueId] : []);
    return staff.filter((s) => (s.venueIds || []).some((v) => mv.includes(v)) || (s.venueId && mv.includes(s.venueId)));
  }, [myScope, scopedStaff, staff, myStaff]);
  // Hide DEPARTED staff from the planner (keep Active / On leave). Real status values are
  // "Active"/"Inactive"/"On leave"/"Left"; also treat a past endDate as departed. Filtered
  // LOCALLY (not in RGContext.scopedStaff) so other pages are unaffected.
  // LOCAL today — toISOString() named YESTERDAY before ~10am AEST, keeping
  // departed staff visible for the first hours of their first day gone
  const todayISO = localDateKey(new Date());
  const hasLeft = (s) => {
    const st = (s.status || "Active").toLowerCase();
    if (["inactive", "left"].includes(st)) return true;
    if (s.endDate && String(s.endDate).slice(0, 10) <= todayISO) return true;
    return false;
  };
  const rows = useMemo(
    () => visibleStaff.filter((s) => staffInVenue(s, selectedVenue) && !hasLeft(s)),
    [visibleStaff, selectedVenue] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // #3 shared A→Z comparator (case-insensitive) for ordering members within a group.
  const byName = (a, b) => fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase());
  // createdAt may be a Firestore Timestamp, a raw {seconds}, or MISSING (imported staff) —
  // normalise safely; missing sorts as 0 (treated as oldest).
  const createdMs = (s) => {
    const c = s?.createdAt;
    if (!c) return 0;
    if (typeof c.toMillis === "function") return c.toMillis();
    if (typeof c.seconds === "number") return c.seconds * 1000;
    const t = new Date(c).getTime();
    return isNaN(t) ? 0 : t;
  };
  // Active comparator for the sort control. An "Under 18" filter was DELIBERATELY OMITTED:
  // the main staff doc only carries `birthday` as MM-DD (no year — StaffDirectoryPage writes
  // `(form.dob || "").slice(5)`); the full DOB lives in the owner-gated private subcollection
  // staff/{id}/private/details, which this page cannot read. Under-18 is not computable here.
  const staffSort =
    sortBy === "za" ? (a, b) => byName(b, a)
    : sortBy === "newest" ? (a, b) => createdMs(b) - createdMs(a)
    : sortBy === "oldest" ? (a, b) => createdMs(a) - createdMs(b)
    : byName;
  // colour-by-venue: consume the owner-picked venue.color (set in VenueManager). Slate
  // fallback (NOT grey — light grey is reserved for the availability state, a later batch).
  const venueColorOf = (venueId) => venues.find((v) => v.id === venueId)?.color || "#334155";

  // ── Clock in / out (staff, today's own shift) ──
  const todayIdx = (new Date().getDay() + 6) % 7;
  const fmtClock = (iso) => { try { return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
  const curWk = weekKeyOf(mondayOf(0));
  const myTodayShifts = useMemo(
    () => (myStaff ? shifts.filter((sh) => sh.staffId === myStaff.id && (sh.weekKey || curWk) === curWk && sh.day === todayIdx) : []),
    [shifts, myStaff, curWk, todayIdx]
  );
  const CLOCK_LABELS = { clockInAt: "Clocked in — have a good shift!", breakStartAt: "Break started", breakEndAt: "Back from break", clockOutAt: "Clocked out — see you next time!" };
  const clock = async (sh, field) => {
    try {
      await updateDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id), { [field]: new Date().toISOString() });
      showToast(CLOCK_LABELS[field] || "Time recorded");
    } catch { showToast("Could not record time"); }
  };
  // admin punch edit: set a clock field to a time-of-day on the shift's own date, or clear it
  // CLOCK edits only touch TODAY's shifts of the CURRENT week (myToday filters
  // weekKey === curWk), so the local current-week Monday is the correct anchor.
  // Never re-parse the stored weekKey — it's UTC-shifted, which anchored the
  // written clock timestamps one day early.
  const shiftDateObj = (sh) => { const d = mondayOf(0); d.setDate(d.getDate() + (sh.day || 0)); return d; };
  const hhmm = (iso) => { if (!iso) return ""; const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const setClock = async (sh, field, timeStr) => {
    try {
      let val = null;
      if (timeStr) { const [h, m] = timeStr.split(":").map(Number); const d = shiftDateObj(sh); d.setHours(h || 0, m || 0, 0, 0); val = d.toISOString(); }
      await updateDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id), { [field]: val });
      setShiftDetail((p) => (p && p.id === sh.id ? { ...p, [field]: val } : p));
    } catch { showToast("Could not update time"); }
  };
  // manual break override — same updateDoc path as the punch edits. null clears the field
  // (deleteField) so the shift reverts to the area-derived automatic value. The stored
  // breakMins mirror is kept EFFECTIVE in the same write so it never goes stale (nothing
  // local reads it — display/math stay derived).
  const setBreakOverride = async (sh, mins) => {
    try {
      const eff = mins != null ? mins : deriveBreak(sh.start, sh.end, shiftBreakEligible(sh)).breakMins;
      await updateDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id), {
        breakOverrideMins: mins != null ? mins : deleteField(), breakMins: eff,
      });
      setShiftDetail((p) => {
        if (!p || p.id !== sh.id) return p;
        const n = { ...p, breakMins: eff };
        if (mins != null) n.breakOverrideMins = mins; else delete n.breakOverrideMins;
        return n;
      });
    } catch { showToast("Could not update break"); }
  };

  const weekShifts = useMemo(() => shifts.filter((sh) => (sh.weekKey || wk) === wk), [shifts, wk]);

  // ── Area-driven break resolution ── station (exact id + venue match) → its area string →
  // the owner's per-area flag. Unknown station / missing area → null → no auto break.
  const shiftAreaOf = (sh) => stations.find((x) => x.id === sh.stationId && x.venueId === sh.venueId)?.area || null;
  const shiftBreakEligible = (sh) => { const a = shiftAreaOf(sh); return !!a && areaGetsBreak(group, a); };
  // EFFECTIVE break: manual breakOverrideMins (set in the shift-detail modal) wins when
  // present; ABSENT means "derive", so existing shifts need no edit. Same return shape as
  // deriveBreak plus `manual`.
  const effectiveBreak = (sh) => {
    const d = deriveBreak(sh.start, sh.end, shiftBreakEligible(sh));
    if (sh.breakOverrideMins == null) return { ...d, manual: false };
    const unpaidHours = sh.breakOverrideMins / 60;
    return { grossHours: d.grossHours, breakMins: sh.breakOverrideMins, unpaidHours, paidHours: Math.max(0, d.grossHours - unpaidHours), manual: true };
  };

  // ── Public holidays (read-only) ── live-listen to the settings doc; fall back to the
  // seed so PH still shows before the owner saves anything. (Editing lives in Settings.)
  const [phDoc, setPhDoc] = useState(null);
  useEffect(() => {
    if (!groupId) return;
    // On error phDoc stays null DELIBERATELY (null → AU seed fallback; [] means "doc
    // exists, no holidays") — but record it: seed dates may differ from the group's own.
    const unsub = onSnapshot(publicHolidaysDoc(groupId), (d) => setPhDoc(d.exists() ? (d.data().holidays || []) : []), () => noteErr("public holidays (using AU defaults)"));
    return () => unsub();
  }, [groupId]); // eslint-disable-line react-hooks/exhaustive-deps
  const holidays = (phDoc && phDoc.length) ? phDoc : AU_PUBLIC_HOLIDAYS_SEED;
  // 7 local YYYY-MM-DD strings for the current week — built from the LOCAL
  // monday Date, NEVER by re-parsing wk (the stored weekKey is UTC-shifted:
  // "2026-07-19" for Monday 20 Jul AEST, which put every column one day
  // behind). SAME construction as saveShift's shiftDate.
  const weekDates = useMemo(() => DAYS.map((_, i) => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return localDateKey(d);
  }), [offset]); // eslint-disable-line react-hooks/exhaustive-deps -- monday derives 1:1 from offset
  // single venue → that venue's state; "all venues" → PH if it's a holiday in ANY venue state.
  // venueState: top-level state OR address.state, normalised to a code ("Victoria" → "VIC")
  const phState = selectedVenue !== "all" ? venueState(venues.find((v) => v.id === selectedVenue)) : null;
  const venueStates = venues.map((v) => venueState(v)).filter(Boolean);
  const dayIsPH = (i) => phState ? isPublicHoliday(weekDates[i], phState, holidays) : isPHForAnyState(weekDates[i], venueStates, holidays);
  // Closed-day flag for the SELECTED venue (mark, don't remove — mirrors the PH pattern).
  // Three data states, all explicit: "all venues" → never closed; venue without hours or
  // day not flagged → open; hours[day].closed === true → closed. i is 0..6 Mon..Sun.
  const dayClosedForSelected = (i) => {
    if (selectedVenue === "all") return false;
    const h = venues.find((v) => v.id === selectedVenue)?.hours?.[HOURS_KEYS[i]];
    return h?.closed === true;
  };
  const dayPHName = (i) => {
    const states = phState ? [phState] : venueStates;
    const h = holidays.find((x) => x.date === weekDates[i] && (x.state === "ALL" || states.includes(x.state)));
    return h ? h.name : "";
  };

  // sorted chronologically by START time (#1) — filter() returns a fresh array so .sort is safe
  const cellShifts = (staffId, day) => weekShifts.filter((sh) => sh.staffId === staffId && sh.day === day).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  // Availability docs for this staff on this date — the DUAL-READ array (legacy per-venue
  // + new cluster-scoped rows, _src-tagged). INFORMATIONAL ONLY (Phase 3c): each renders
  // as one read-only chip; the six-state status machine is gone.
  const availAll = (staffId, date) => (availability || []).filter((a) => a.staffId === staffId && a.date === date);
  // ── Approved leave (Phase 4b) ── read-only grid block per covered day. SAME match as
  // the saveShift guard below (status "Approved", staffId, startDate<=day<=endDate) —
  // pending/declined leave never matches, so it never blocks a cell. The guard itself is
  // UNCHANGED; this is the visual counterpart.
  const leaveFor = (staffId, dateKey) =>
    (leave || []).find((l) => l.status === "Approved" && l.staffId === staffId
      && (l.startDate || "") <= dateKey && (l.endDate || l.startDate || "") >= dateKey) || null;

  // PAID hours (gross − effective break) — the payroll figure everywhere on this page.
  const staffHours = (staffId) =>
    weekShifts.filter((sh) => sh.staffId === staffId).reduce((a, sh) => a + effectiveBreak(sh).paidHours, 0);

  const totalHours = useMemo(
    () => rows.reduce((a, s) => a + staffHours(s.id), 0),
    [rows, weekShifts, stations, group] // eslint-disable-line react-hooks/exhaustive-deps
  );
  // configurable per group via the gated settings/labourTargets doc (Admin Settings →
  // Labour targets). null/denied read → the built-in estimates below. totalHours is PAID
  // hours (effective break subtracted), so labourCost/labourPct are paid-based too.
  const hourly = Number(labourTargets?.hourlyRate) || HOURLY;
  const weeklyRev = Number(labourTargets?.weeklyRevenue) || WEEKLY_REVENUE;
  const labourCost = totalHours * hourly;
  const labourPct = ((labourCost / weeklyRev) * 100).toFixed(1);

  // #11 weekly PAID hours by day-type — PH checked FIRST (PH-on-weekend counts as PH),
  // else Sat / Sun / Mon–Fri. PAID basis (effective break subtracted) so the four buckets
  // reconcile with the paid headline/footer totals.
  const hoursByType = useMemo(() => {
    const b = { mf: 0, sat: 0, sun: 0, ph: 0 };
    weekShifts.forEach((sh) => {
      const di = sh.day || 0; // DAYS: Mon..Sun → Sat=5, Sun=6
      const vState = venueState(venues.find((v) => v.id === sh.venueId));
      const h = effectiveBreak(sh).paidHours;
      if (isPublicHoliday(weekDates[di], vState, holidays)) b.ph += h;
      else if (di === 5) b.sat += h;
      else if (di === 6) b.sun += h;
      else b.mf += h;
    });
    return b;
  }, [weekShifts, weekDates, venues, holidays, stations, group]); // eslint-disable-line react-hooks/exhaustive-deps
  // weekly rostered paid/unpaid split from the EFFECTIVE break (override ?? area-derived) —
  // consistent with totalHours/labourCost, which are now paid-based.
  const weekSplit = useMemo(() => weekShifts.reduce((a, sh) => {
    const b = effectiveBreak(sh);
    a.paid += b.paidHours; a.unpaid += b.unpaidHours;
    return a;
  }, { paid: 0, unpaid: 0 }), [weekShifts, stations, group]); // eslint-disable-line react-hooks/exhaustive-deps
  // ── Approved leave this week, per type (Phase 4c) ── VISIBLE-ROSTER staff only; days
  // CLAMPED to the shown week (a multi-week leave counts only the 7 visible dates). All
  // "Other" requests group under ONE "Other" bucket regardless of their custom text.
  const weekLeave = useMemo(() => {
    const ids = new Set(rows.map((r) => r.id));
    const byType = {};
    (leave || []).forEach((l) => {
      if (l.status !== "Approved" || !ids.has(l.staffId)) return;
      const s = l.startDate || "", e = l.endDate || l.startDate || "";
      const days = weekDates.filter((d) => s <= d && e >= d).length;
      if (!days) return;
      const key = l.type === "Other" ? "Other" : (l.type || "—");
      byType[key] = (byType[key] || 0) + days;
    });
    return byType;
  }, [leave, rows, weekDates]);

  // Fortnight total: this week + the next week. Build nextWk via weekKeyOf(nextMonday)
  // (same path shifts are keyed with) so it matches stored weekKeys exactly (AEST Issue-18).
  const nextWk = useMemo(() => { const nextMonday = new Date(monday); nextMonday.setDate(monday.getDate() + 7); return weekKeyOf(nextMonday); }, [monday]);
  const fortnightHours = useMemo(() => shifts.filter((sh) => { const k = sh.weekKey || wk; return k === wk || k === nextWk; }).reduce((a, sh) => a + effectiveBreak(sh).paidHours, 0), [shifts, wk, nextWk, stations, group]); // eslint-disable-line react-hooks/exhaustive-deps

  // Area→Station drill-down: stations of the SELECTED area scoped to the selected venue
  // (respects "All venues"). Only meaningful once a specific area is picked.
  const drillStations = useMemo(() => (areaFilter !== "all" ? stationsForArea(stations, areaFilter, selectedVenue) : []), [stations, areaFilter, selectedVenue]);
  // effective station: revert to "all" if the current pick isn't in the area+venue list
  // (e.g. after switching venue/area), so a stale selection can't silently filter wrongly.
  const effStation = drillStations.some((st) => st.id === planStation) ? planStation : "all";

  // rows grouped into sections BY THE OWNER'S CONFIGURED AREAS (staff.areas[] strings — no
  // bucket/keyword guessing, no name-based special cases). ONE row per person, no duplication:
  //   • holds an EXCLUSIVE area (areaExclusive, Settings) → that area's section ONLY,
  //     ignoring their other areas — first exclusive in orderedAreas order wins as the
  //     deterministic tie-break, never duplicated;
  //   • exactly 1 area → that area's section;
  //   • 2+ areas → the single "Multi-area" section (no per-combination sections);
  //   • no areas → "No area assigned".
  // An exclusive section is a NORMAL single-area section (same rank/pin logic) — exclusivity
  // affects MEMBERSHIP only. SECTION ORDER: pinned areas (areaPinned) first in orderedAreas
  // order, then unpinned single-area sections in orderedAreas order, then "Multi-area", then
  // "No area assigned". The area filter shows sections whose MEMBERSHIP includes the picked
  // area — Multi-area appears under any area one of its members holds (whole section, members
  // unfiltered); an exclusive member's other areas do NOT leak into other filters.
  // Phase-2 grouping, PARAMETERISED (split-view fix): the exact grouping body, over an
  // arbitrary staff `list`; `areasOf(s)` supplies the areas to group a staffer by (main
  // grid: the cross-venue union staffAreas(s); split view: that COLUMN venue's areas).
  // Closes over group/areaFilter/staffSort so every caller gets the same pinned →
  // singles → Multi-area → No-area order, exclusive capture, and area filter. Callers
  // apply the station filter (staffAtStation) to `list` themselves.
  const groupRowsFor = (list, areasOf) => {
    const ordered = orderedAreas(group);
    const idx = (a) => { const i = ordered.indexOf(a); return i === -1 ? ordered.length : i; };
    const sections = new Map();
    const push = (key, label, areas, s) => {
      if (!sections.has(key)) sections.set(key, { key, label, areaSet: new Set(), members: [] });
      const g = sections.get(key);
      areas.forEach((a) => g.areaSet.add(a));
      g.members.push(s);
    };
    list.forEach((s) => {
      const sAreas = [...new Set(areasOf(s).filter(Boolean))];
      const exclusives = sAreas.filter((a) => areaExclusive(group, a)).sort((a, b) => (idx(a) - idx(b)) || a.localeCompare(b));
      if (exclusives.length) push(`area:${exclusives[0]}`, exclusives[0], [exclusives[0]], s);
      else if (sAreas.length === 1) push(`area:${sAreas[0]}`, sAreas[0], sAreas, s);
      else if (sAreas.length > 1) push("__multi__", "Multi-area", sAreas, s);
      else push("__none__", "No area assigned", [], s);
    });
    const rank = (g) => {
      if (g.key === "__none__") return [3];
      if (g.key === "__multi__") return [2];
      // single-area sections (incl. exclusive ones) are labelled by their area name
      return [areaPinned(group, g.label) ? 0 : 1, idx(g.label)];
    };
    return [...sections.values()]
      .map((g) => ({ ...g, areas: [...g.areaSet], members: g.members.slice().sort(staffSort) }))
      .filter((g) => areaFilter === "all" || g.areas.includes(areaFilter))
      .sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        for (let i = 0; i < Math.max(ra.length, rb.length); i++) { const d = (ra[i] ?? -1) - (rb[i] ?? -1); if (d) return d; }
        return a.label.localeCompare(b.label);
      });
  };
  const groupedRows = useMemo(
    () => groupRowsFor(rows.filter((s) => staffAtStation(s, effStation, weekShifts)), (s) => staffAreas(s)),
    [rows, areaFilter, effStation, weekShifts, sortBy, group] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // #5 distinct staff currently shown in the main grid (across all groups) — the basis
  // for the bottom "Staff rostered" headcount row (derived, no extra query).
  const rosteredIds = useMemo(() => new Set(groupedRows.flatMap((g) => g.members.map((s) => s.id))), [groupedRows]);
  const dayHeadcount = (day) => new Set(weekShifts.filter((sh) => sh.day === day && rosteredIds.has(sh.staffId)).map((sh) => sh.staffId)).size;
  const weekHeadcount = new Set(weekShifts.filter((sh) => rosteredIds.has(sh.staffId)).map((sh) => sh.staffId)).size;

  const [form, setForm] = useState({ editId: null, staffId: "", day: "Monday", start: STARTS[0], end: ENDS[0], role: (roles && roles[0]) || ROLES[0], venueId: "", stationId: "", notes: "" });
  const formStations = useMemo(() => stations.filter((s) => s.venueId === form.venueId), [stations, form.venueId]);
  // Time pickers bounded to the selected venue's trading hours ±1h (Phase 3e — was ±2h)
  // via the shared boundedTimes/hoursEnvelopeForDay; hours missing / day closed /
  // unparseable → the FULL-DAY list. The CURRENT form value is UNIONed in (deduped,
  // time-sorted) so editing an out-of-hours shift keeps its value selectable.
  const { startOptions, endOptions } = useMemo(() => {
    const dayKey = HOURS_KEYS[FULL_DAYS.indexOf(form.day)];
    const bounded = boundedTimes(hoursEnvelopeForDay(venues.find((v) => v.id === form.venueId), dayKey));
    const withCurrent = (val) => {
      const list = val && !bounded.includes(val) ? [val, ...bounded] : bounded;
      return [...new Set(list)].sort((a, b) => (timeToMin(a) ?? 0) - (timeToMin(b) ?? 0));
    };
    return { startOptions: withCurrent(form.start), endOptions: withCurrent(form.end) };
  }, [form.venueId, form.day, form.start, form.end, venues]);
  // Default Add-shift times from the venue's hours: start = open−1h (the bounded window's
  // left edge, Phase 3e — was open−2h), end = close. minToLabel repeats mkTimes' exact
  // formatting so the returned strings are byte-identical to picker <option> values; null
  // when the venue has no usable hours that day — caller falls back to prior times.
  const defaultTimesFor = (venueId, fullDay) => {
    const env = hoursEnvelopeForDay(venues.find((v) => v.id === venueId), HOURS_KEYS[FULL_DAYS.indexOf(fullDay)]);
    if (!env) return null;
    const minToLabel = (min) => { const m = Math.max(0, Math.min(23 * 60 + 45, min)); const hh = Math.floor(m / 60), mm = m % 60, ap = hh >= 12 ? "pm" : "am", h12 = (hh % 12) || 12; return `${h12}:${String(mm).padStart(2, "0")}${ap}`; };
    return { start: minToLabel(env.openMin - 60), end: minToLabel(env.closeMin) };
  };
  // 3rd arg: an optional venue-id STRING (split-view column override). The old
  // fromAvailability accept-to-roster prefill is GONE (Phase 3c) — availability is
  // informational only; managers read it and build shifts manually.
  const openAdd = (staffId, day, venueOverride = "") => {
    const st = staff.find((s) => s.id === staffId);
    // resolve venue + day BEFORE setForm so the hours-derived default uses these SAME values
    // (venueOverride wins, e.g. the split-view column you clicked; else staff's venue, else selected/first)
    const resolvedVenueId = venueOverride || st?.venueIds?.[0] || st?.venueId || (selectedVenue !== "all" ? selectedVenue : venues[0]?.id || "");
    const resolvedDay = typeof day === "number" ? FULL_DAYS[day] : "Monday";
    const def = defaultTimesFor(resolvedVenueId, resolvedDay);
    setForm((p) => ({
      ...p,
      staffId: staffId || rows[0]?.id || "",
      day: resolvedDay,
      // auto-fill the shift role from the staff member's assigned role (Staff Directory); fall back to a group role
      role: st?.role || (roles && roles.includes(p.role) ? p.role : ((roles && roles[0]) || ROLES[0])),
      venueId: resolvedVenueId,
      stationId: "",
      // venue-hours default (open−1h / close) → previous times
      start: def?.start || p.start,
      end: def?.end || p.end,
      editId: null,
    }));
    setModal(true);
  };
  // Edit an existing shift — load its values into the same modal.
  const openEdit = (sh) => {
    setForm({
      editId: sh.id, staffId: sh.staffId, day: FULL_DAYS[sh.day] || "Monday",
      start: sh.start, end: sh.end, role: sh.role || ((roles && roles[0]) || ROLES[0]),
      venueId: sh.venueId, stationId: sh.stationId || "", notes: sh.notes || "",
    });
    setShiftDetail(null);
    setModal(true);
  };
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const saveShift = async () => {
    if (!form.staffId) return showToast("Select a staff member");
    const st = staff.find((s) => s.id === form.staffId);
    const venue = venues.find((v) => v.id === form.venueId) || venues.find((v) => v.id === (st?.venueIds?.[0] || st?.venueId));
    if (!venue) return showToast("Select a venue");
    const dayIdx = FULL_DAYS.indexOf(form.day);
    const ns = parseTime(form.start), ne = parseTime(form.end);
    if (ne <= ns) return showToast("End time must be after start time");
    // Hard block: no overlapping shift for this person that day, across ANY venue.
    // (7am–3pm + 3pm–9pm is fine — they only touch; strict overlap = ns < end && start < ne.)
    // overlap check excludes the shift being edited (so re-saving its own times is allowed)
    const clash = weekShifts.find((sh) => sh.id !== form.editId && sh.staffId === form.staffId && sh.day === dayIdx
      && ns < parseTime(sh.end) && parseTime(sh.start) < ne);
    if (clash) return showToast(`Already rostered ${clash.start}–${clash.end} at ${clash.venue} that day — can't double-book.`);
    // approved leave blocks rostering across ALL venues (leave is group-wide for the person)
    // REAL calendar date of the shift, from the LOCAL monday (not the shifted
    // weekKey) — leave startDate/endDate are real local YYYY-MM-DD strings, so
    // this now compares like-for-like instead of one day early.
    const sd = new Date(monday); sd.setDate(monday.getDate() + dayIdx);
    const shiftDate = localDateKey(sd);
    const onLeave = (leave || []).find((l) => l.status === "Approved" && l.staffId === form.staffId && (l.startDate || "") <= shiftDate && (l.endDate || l.startDate || "") >= shiftDate);
    if (onLeave) return showToast(`${fullName(st)} is on approved ${leaveLabel(onLeave)} that day (${onLeave.dates}) — on leave across all venues.`);
    const type = parseTime(form.start) >= 15 ? "evening" : "morning";
    const station = stations.find((s) => s.id === form.stationId && s.venueId === venue.id);
    const editing = form.editId ? shifts.find((s) => s.id === form.editId) : null;
    try {
      const shiftData = {
        staffId: form.staffId, staffName: fullName(st),
        day: dayIdx, start: form.start, end: form.end, role: form.role,
        venueId: venue.id, venue: venue.name,
        stationId: station?.id || "", station: station?.name || "",
        // EFFECTIVE break stored (existing override ?? area-driven ≥5h rule) — for Ops/export
        // consistency only; nothing local READS this field (display/math stay derived). The
        // override is carried through so a venue-move (delete + recreate) can't drop it.
        breakMins: editing?.breakOverrideMins != null ? editing.breakOverrideMins
          : deriveBreak(form.start, form.end, !!(station?.area && areaGetsBreak(group, station.area))).breakMins,
        ...(editing?.breakOverrideMins != null ? { breakOverrideMins: editing.breakOverrideMins } : {}),
        type, notes: form.notes.trim(), weekKey: wk, published: true,
        // (Phase 3c) availabilityId is NO LONGER written — availability is informational
        // only. Existing shifts' stored availabilityId is left alone (no migration).
      };
      let shiftId;
      if (editing && editing.venueId === venue.id) {
        // edit in place (same venue subcollection)
        await updateDoc(doc(venueCol(groupId, venue.id, "shifts"), form.editId), shiftData);
        shiftId = form.editId;
      } else if (editing) {
        // venue changed → move: delete the old doc, create under the new venue
        await deleteDoc(doc(venueCol(groupId, editing.venueId, "shifts"), form.editId));
        const created = await addDoc(venueCol(groupId, venue.id, "shifts"), { ...shiftData, createdAt: serverTimestamp() });
        shiftId = created.id;
      } else {
        const created = await addDoc(venueCol(groupId, venue.id, "shifts"), { ...shiftData, createdAt: serverTimestamp() });
        shiftId = created.id;
      }
      showToast(editing ? "Shift updated" : "Shift saved");
      // slot-linked checklist auto-assignment — separate async op, NEVER blocks the shift save
      checkAndCreateShiftAssignments(shiftData, shiftId, groupId, checklists)
        .then((r) => {
          if (r.created) showToast(`${r.created} checklist(s) auto-assigned for this shift`);
          else if (r.errors.length) showToast("Shift saved — checklist auto-assign failed");
        })
        .catch(() => showToast("Shift saved — checklist auto-assign failed"));
      setModal(null);
    } catch (e) { showToast("Could not save shift"); }
  };

  const removeShift = async (sh) => {
    try { await deleteDoc(doc(venueCol(groupId, sh.venueId, "shifts"), sh.id)); showToast("Shift removed"); }
    catch { showToast("Could not remove shift"); }
  };

  // (Phase 3c) The availability accept/reject/counter-propose machine is GONE —
  // availability is DISPLAY ONLY. Managers read when a staffer is free and build
  // shifts manually via the normal "+" / "+ Add shift" flow.

  // Availability — INFORMATIONAL ONLY. ONE read-only line per posting: the posted
  // window(s) (or "All day") + note marker. No buttons, no onClick, no status colours.
  // Renders identically for legacy (venueId) and new cluster-scoped (clusterId) rows.
  const avTimeLabel = (a) => (a.windows?.length ? a.windows.map((w) => `${w.start}–${w.end}`).join(", ") : (a.allDay ? "All day" : ""));
  const renderAvailChip = (a) => {
    const key = `${a._src || "legacy"}:${a.clusterId || a.venueId || ""}:${a.id}`;
    if (a.available === false) return (
      <div key={key} style={{ background: "#f3f4f6", color: "#9ca3af", fontSize: 10, textAlign: "center", borderRadius: 4, padding: "2px 4px" }} title={a.note || "Marked unavailable"}>
        Unavailable
      </div>
    );
    return (
      <div key={key} style={{ background: "#ecfdf5", border: "1px dashed #10b981", color: "#047857", fontSize: 10, textAlign: "center", borderRadius: 4, padding: "2px 4px" }}
        title={`Posted availability (info only)${a.note ? ` — ${a.note}` : ""}`}>
        Free{avTimeLabel(a) ? `: ${avTimeLabel(a)}` : ""}{a.note ? " 📝" : ""}
      </div>
    );
  };

  const th = { padding: "10px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--gray)", borderBottom: "0.5px solid var(--border)" };
  // #4 sticky header variant for the MAIN roster only. With borderCollapse:collapse a
  // sticky cell drops its own border, so the divider is drawn as an inset box-shadow.
  const thSticky = { ...th, position: "sticky", top: 0, zIndex: 2, background: "var(--gray-light)", borderBottom: undefined, boxShadow: "inset 0 -1px 0 var(--border)" };

  // Cell shifts scoped to a venue (for the split comparison view) — START-time sorted (#1).
  const cellShiftsV = (staffId, day, vid) => weekShifts.filter((sh) => sh.staffId === staffId && sh.day === day && (vid === "all" || sh.venueId === vid)).sort((a, b) => parseTime(a.start) - parseTime(b.start));
  const VenueGrid = ({ vid }) => {
    // Phase-2 SECTIONS per column (split-view fix): the same grouping/order as the main
    // grid via groupRowsFor — and the area + station filters are now honoured here too
    // (this path previously ignored both). Each staffer groups by THIS venue's areas
    // (venueRoles[vid].areas); legacy docs with no venueRoles entry for the venue fall
    // back to the cross-venue union staffAreas(s), NOT to "No area assigned".
    // #2 hide Inactive + #3 sort control still apply (separate source: scopedStaff).
    const areasOfVenue = (s) => {
      const perVenue = s.venueRoles?.[vid]?.areas;
      return (perVenue && perVenue.length) ? perVenue : staffAreas(s);
    };
    const gridSections = groupRowsFor(
      scopedStaff.filter((s) => staffInVenue(s, vid) && !hasLeft(s) && staffAtStation(s, effStation, weekShifts)),
      areasOfVenue
    );
    const gridRows = gridSections.flatMap((g) => g.members); // footer hours + empty state
    const gh = gridRows.reduce((a, s) => a + weekShifts.filter((sh) => sh.staffId === s.id && (vid === "all" || sh.venueId === vid)).reduce((x, sh) => x + effectiveBreak(sh).paidHours, 0), 0);
    // split view is always per-venue → closed-day greying keys off vid directly
    const vClosed = (day) => venues.find((v) => v.id === vid)?.hours?.[HOURS_KEYS[day]]?.closed === true;
    return (
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
            <thead>
              <tr style={{ background: "var(--gray-light)" }}>
                <th style={{ ...th, textAlign: "left", width: 100, padding: "8px 10px" }}>Staff</th>
                {DAYS.map((d, i) => <th key={d} style={{ ...th, padding: "8px 4px", ...(vClosed(i) ? { opacity: 0.45 } : {}) }} title={vClosed(i) ? "Venue closed this day" : undefined}>{d}{vClosed(i) && <span style={{ fontSize: 8, fontWeight: 700, color: "var(--gray)", marginLeft: 3 }}>Closed</span>}</th>)}
              </tr>
            </thead>
            <tbody>
              {/* section header rows — same format as the main grid, incl. the member count */}
              {gridSections.map((g) => (
                <React.Fragment key={g.key}>
                  <tr>
                    <td colSpan={8} style={{ padding: "6px 10px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderBottom: "0.5px solid var(--border)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {g.label} <span style={{ fontWeight: 400 }}>· {g.members.length}</span>
                    </td>
                  </tr>
                  {g.members.map((s) => (
                <tr key={s.id}>
                  <td style={{ padding: "6px 10px", borderBottom: "0.5px solid var(--gray-light)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--red)" }} onClick={() => setCapStaff(s)} title="View capability">{fullName(s)}</div>
                    <div style={{ fontSize: 9, color: "var(--gray)" }}>{s.role}</div>
                    {s.type !== "Casual" && Number(s.contractedWeeklyHours) > 0 && (
                      <div style={{ fontSize: 8, color: "var(--gray)" }}>Contracted: {Number(s.contractedWeeklyHours)}h/wk</div>
                    )}
                  </td>
                  {DAYS.map((_, day) => {
                    const shs = cellShiftsV(s.id, day, vid);
                    // legacy postings are venue-scoped; new cluster rows are staffer-wide info
                    const avs = availAll(s.id, weekDates[day]).filter((a) => a._src === "cluster" || a.venueId === vid);
                    const closedDay = vClosed(day); // muted cell + no "+"; existing shifts still render
                    const lv = leaveFor(s.id, weekDates[day]); // APPROVED leave (Phase 4b) — read-only block, no "+"
                    return (
                      <td key={day} style={{ padding: 3, borderBottom: "0.5px solid var(--gray-light)", verticalAlign: "top", ...(closedDay ? { background: "var(--gray-light)", opacity: 0.55 } : {}) }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {lv && (
                            <div key={`leave-${lv.id}`} style={{ background: "var(--amber-light, #fffbeb)", border: "1px solid #f59e0b", color: "#92400e", fontSize: 10, fontWeight: 600, textAlign: "center", borderRadius: 4, padding: "2px 4px" }} title={`Approved leave — ${leaveLabel(lv)}${lv.dates ? ` (${lv.dates})` : ""}`}>
                              On leave: {leaveLabel(lv)}
                            </div>
                          )}
                          {shs.map((sh) => (
                            <div key={sh.id} className="shift-cell" style={{ background: venueColorOf(sh.venueId), color: "#fff" }} title={sh.notes ? sh.notes : "Click to view"} onClick={() => setShiftDetail(sh)}>
                              <div style={{ fontWeight: 600 }}>{sh.start}–{sh.end}{sh.notes ? " 📝" : ""}</div>
                              <div style={{ opacity: 0.8 }}>{(sh.role || "").replace(/^(FOH|BOH) — /, "")}{sh.station ? ` · ${sh.station}` : ""}</div>
                              {(() => { const b = effectiveBreak(sh); return b.breakMins > 0 ? <div style={{ fontSize: 9, opacity: 0.75 }}>{fmtHours(b.grossHours)}h gross · {fmtHours(b.paidHours)}h paid · {fmtHours(b.unpaidHours)}h unpaid</div> : null; })()}
                            </div>
                          ))}
                          {avs.map((a) => renderAvailChip(a))}
                          {canEdit && !closedDay && !lv && <div className="shift-cell" style={{ cursor: "pointer", color: "var(--gray)", textAlign: "center", minHeight: 0, padding: "2px 6px" }} onClick={() => openAdd(s.id, day, vid)}>+</div>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
                  ))}
                </React.Fragment>
              ))}
              {gridRows.length === 0 && <tr><td colSpan={8} style={{ padding: 16, color: "var(--gray)", fontSize: 12 }}>No staff here.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "8px 12px", background: "var(--gray-light)", borderTop: "0.5px solid var(--border)", fontSize: 11 }}>
          <span style={{ color: "var(--gray)" }}>Paid hours this week: </span><strong>{fmtHours(gh)}</strong>
        </div>
      </div>
    );
  };

  // one staff row in the main (categorized) roster — name is clickable → capability card
  const renderRow = (s) => (
    <tr key={s.id}>
      <td style={{ padding: "8px 14px", borderBottom: "0.5px solid var(--gray-light)" }}>
        <div style={{ fontSize: 11, fontWeight: 600, cursor: "pointer", color: "var(--red)" }} onClick={() => setCapStaff(s)} title="View capability (certs, training, history)">{fullName(s)}</div>
        <div style={{ fontSize: 10, color: "var(--gray)" }}>{s.role}</div>
        {/* contracted minimum under the name — only when set (contractedWeeklyHours populates on
            staff-edit / contract write-back, no bulk migration, so blank is EXPECTED); casuals
            have no contracted minimum. Absent/null/0 → render nothing. */}
        {s.type !== "Casual" && Number(s.contractedWeeklyHours) > 0 && (
          <div style={{ fontSize: 9, color: "var(--gray)" }}>Contracted: {Number(s.contractedWeeklyHours)}h/wk</div>
        )}
      </td>
      {DAYS.map((_, day) => {
        const shs = cellShifts(s.id, day);
        const date = weekDates[day];
        const avs = availAll(s.id, date); // ALL availability docs for this date (one per venue)
        const closedDay = dayClosedForSelected(day); // muted cell + no "+"; existing shifts still render
        const lv = leaveFor(s.id, date); // APPROVED leave covering this day (Phase 4b) — read-only block, no "+"
        // PH wash (visual only) — badge amber #b45309 at 5% so solid shift/leave
        // chips on top stay true; closed-day spread AFTER so closed still wins
        return (
          <td key={day} style={{ padding: 3, borderBottom: "0.5px solid var(--gray-light)", verticalAlign: "top", ...(dayIsPH(day) ? { background: "rgba(180, 83, 9, 0.05)" } : {}), ...(closedDay ? { background: "var(--gray-light)", opacity: 0.55 } : {}) }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {lv && (
                <div key={`leave-${lv.id}`} style={{ background: "var(--amber-light, #fffbeb)", border: "1px solid #f59e0b", color: "#92400e", fontSize: 10, fontWeight: 600, textAlign: "center", borderRadius: 4, padding: "2px 4px" }} title={`Approved leave — ${leaveLabel(lv)}${lv.dates ? ` (${lv.dates})` : ""}`}>
                  On leave: {leaveLabel(lv)}
                </div>
              )}
              {shs.map((sh) => (
                <div key={sh.id} className="shift-cell" style={{ background: venueColorOf(sh.venueId), color: "#fff", boxShadow: (effStation !== "all" && sh.stationId === effStation) ? "0 0 0 2px var(--red)" : undefined }} title={sh.notes ? sh.notes : "Click to view"} onClick={() => setShiftDetail(sh)}>
                  <div style={{ fontWeight: 600 }}>{sh.start}–{sh.end}{sh.notes ? " 📝" : ""}</div>
                  <div style={{ opacity: 0.8 }}>{(sh.role || "").replace(/^(FOH|BOH) — /, "")}{sh.station ? ` · ${sh.station}` : ""}{shs.length > 1 && sh.venue ? ` · ${sh.venue.split(" ").map((w) => w[0]).join("")}` : ""}</div>
                  {(() => { const b = effectiveBreak(sh); return b.breakMins > 0 ? <div style={{ fontSize: 9, opacity: 0.75 }}>{fmtHours(b.grossHours)}h gross · {fmtHours(b.paidHours)}h paid · {fmtHours(b.unpaidHours)}h unpaid</div> : null; })()}
                </div>
              ))}
              {avs.map((a) => renderAvailChip(a))}
              {canEdit && !closedDay && !lv && <div className="shift-cell" style={{ cursor: "pointer", color: "var(--gray)", textAlign: "center", minHeight: 0, padding: "2px 8px" }} onClick={() => openAdd(s.id, day)}>+</div>}
              {!canEdit && shs.length === 0 && !lv && <div className="shift-cell shift-off" style={{ textAlign: "center", opacity: 0.5 }}>·</div>}
            </div>
          </td>
        );
      })}
      <td style={{ textAlign: "center", fontSize: 11, fontWeight: 600, borderBottom: "0.5px solid var(--gray-light)" }}>
        {(() => {
          // PAID total headline (gross − EFFECTIVE break, override-aware) + gross/unpaid
          // subline. The break is area-driven per shift — see effectiveBreak.
          const t = weekShifts.filter((sh) => sh.staffId === s.id).reduce((a, sh) => {
            const b = effectiveBreak(sh);
            a.gross += b.grossHours; a.paid += b.paidHours; a.unpaid += b.unpaidHours;
            return a;
          }, { gross: 0, paid: 0, unpaid: 0 });
          return (
            <>
              <div>{fmtHours(t.paid)}h</div>
              <div style={{ fontSize: 9, fontWeight: 400, color: "var(--gray)" }}>{fmtHours(t.gross)}h gross · {fmtHours(t.unpaid)}h unpaid</div>
            </>
          );
        })()}
      </td>
    </tr>
  );

  return (
    <>
      {/* Week nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* staff are limited to the current + next week (2-week window) */}
          <button className="btn btn-sm" disabled={myScope === "staff" && offset <= 0} onClick={() => setOffset((o) => (myScope === "staff" ? Math.max(0, o - 1) : o - 1))}>← Prev</button>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 200, textAlign: "center" }}>{weekLabel}</span>
          <button className="btn btn-sm" disabled={myScope === "staff" && offset >= 1} onClick={() => setOffset((o) => (myScope === "staff" ? Math.min(1, o + 1) : o + 1))}>Next →</button>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setSplitMode((s) => !s)} style={splitMode ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>⊟ Split view</button>
          {canEdit && <button className="btn btn-sm btn-primary" onClick={() => openAdd("", 0)}>+ Add shift</button>}
          <button className="btn btn-sm" onClick={() => {
            // Gross / Paid / Unpaid per shift (effective break) — replaces the single "Hours" column
            const rows = [["Staff", "Day", "Start", "End", "Role", "Station", "Venue", "Gross", "Paid", "Unpaid"], ...weekShifts.slice().sort((a, b) => (a.day - b.day) || a.start.localeCompare(b.start)).map((sh) => { const b = effectiveBreak(sh); return [sh.staffName, FULL_DAYS[sh.day] || "", sh.start, sh.end, sh.role, sh.station || "", sh.venue, fmtHours(b.grossHours), fmtHours(b.paidHours), fmtHours(b.unpaidHours)]; })];
            downloadCsv(`roster-${wk}.csv`, rows); showToast("Roster exported");
          }}>Export</button>
        </div>
      </div>

      {/* My shift today — clock in / out */}
      {myTodayShifts.length > 0 && (
        <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>⏱ Your shift today</strong>
          {myTodayShifts.map((sh) => (
            <div key={sh.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
              <span>{sh.start}–{sh.end} · {sh.venue}{sh.station ? ` · ${sh.station}` : ""}</span>
              {sh.clockInAt && <span className="pill pill-green">In {fmtClock(sh.clockInAt)}</span>}
              {sh.breakStartAt && <span className="pill pill-amber">Break {fmtClock(sh.breakStartAt)}{sh.breakEndAt ? `–${fmtClock(sh.breakEndAt)}` : ""}</span>}
              {sh.clockOutAt && <span className="pill pill-gray">Out {fmtClock(sh.clockOutAt)}</span>}
              {!sh.clockInAt && <button className="btn btn-sm btn-primary" onClick={() => clock(sh, "clockInAt")}>Clock in</button>}
              {sh.clockInAt && !sh.clockOutAt && !sh.breakStartAt && <button className="btn btn-sm" onClick={() => clock(sh, "breakStartAt")}>Start break</button>}
              {sh.breakStartAt && !sh.breakEndAt && !sh.clockOutAt && <button className="btn btn-sm" onClick={() => clock(sh, "breakEndAt")}>End break</button>}
              {sh.clockInAt && !sh.clockOutAt && (!sh.breakStartAt || sh.breakEndAt) && <button className="btn btn-sm" onClick={() => clock(sh, "clockOutAt")}>Clock out</button>}
            </div>
          ))}
        </div>
      )}

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        {[["#e0f2fe", "Morning"], ["#f3e8ff", "Afternoon / evening"], ["#fffbeb", "Open (needs fill)"], ["#f4f4f5", "Day off / RDO"], ["#fef3c7", "Public holiday"]].map(([bg, lbl]) => (
          <span key={lbl} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11 }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: bg, border: "1px solid var(--border)", display: "inline-block" }} />{lbl}
          </span>
        ))}
      </div>

      {/* Area filter + Area→Station drill-down */}
      {!splitMode && (
        <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* filter buttons come from the owner's configured areas (orderedAreas) — no hardcoded taxonomy */}
          {[["all", "All"], ...orderedAreas(group).map((a) => [a, a])].map(([k, l]) => (
            <button key={k} className="btn btn-sm" onClick={() => { setAreaFilter(k); setPlanStation("all"); }}
              style={areaFilter === k ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>{l}</button>
          ))}
          {areaFilter !== "all" && drillStations.length > 0 && (
            <select className="form-input" style={{ width: 190, marginLeft: 6 }} value={effStation} onChange={(e) => setPlanStation(e.target.value)} title="Narrow the roster to a station">
              <option value="all">All stations</option>
              {drillStations.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
          {effStation !== "all" && <span style={{ fontSize: 11, color: "var(--gray)" }}>roster narrowed to staff on this station (rostered or tagged)</span>}
          {/* staff order (applies to the split view too). No "Under 18" option — see staffSort. */}
          <select className="form-input" style={{ width: 140, marginLeft: "auto" }} value={sortBy} onChange={(e) => setSortBy(e.target.value)} title="Order staff within each section">
            <option value="az">Sort: A–Z</option>
            <option value="za">Sort: Z–A</option>
            <option value="newest">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
        </div>
      )}

      {/* Split comparison view */}
      {splitMode ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, alignItems: "start" }}>
          {[[splitA, setSplitA], [splitB, setSplitB]].map(([val, setter], i) => (
            <div key={i}>
              <select className="form-input" style={{ marginBottom: 8 }} value={val} onChange={(e) => setter(e.target.value)}>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <VenueGrid vid={val} />
            </div>
          ))}
        </div>
      ) : (
      <>
      {/* venue-colour legend (main grid only) — for venues in scope */}
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12, padding: "0 2px 10px", fontSize: 11 }}>
        <span style={{ color: "var(--gray)" }}>Venues:</span>
        {(selectedVenue === "all" ? venues : venues.filter((v) => v.id === selectedVenue)).map((v) => (
          <span key={v.id} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: venueColorOf(v.id), display: "inline-block" }} />
            <span style={{ color: "var(--gray)" }}>{v.name}</span>
          </span>
        ))}
      </div>
      {/* Roster grid */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 260px)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
            <thead>
              <tr style={{ background: "var(--gray-light)" }}>
                <th style={{ ...thSticky, textAlign: "left", width: 130, padding: "10px 14px" }}>Staff</th>
                {DAYS.map((d, i) => (
                  <th key={d} style={{ ...thSticky, ...(dayIsPH(i) ? { background: "#fef3c7" } : {}), ...(dayClosedForSelected(i) ? { opacity: 0.45 } : {}) }} title={dayIsPH(i) ? dayPHName(i) : (dayClosedForSelected(i) ? "Venue closed this day" : undefined)}>
                    <div>{d}{weekDates[i] ? ` ${Number(weekDates[i].slice(8, 10))}` : ""}{dayIsPH(i) && <span style={{ fontSize: 9, fontWeight: 700, color: "#b45309", marginLeft: 4 }}>PH</span>}{dayClosedForSelected(i) && <span style={{ fontSize: 9, fontWeight: 700, color: "var(--gray)", marginLeft: 4 }}>Closed</span>}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--gray)" }}>{dayHeadcount(i)} on</div>
                  </th>
                ))}
                <th style={thSticky}>Hours</th>
              </tr>
            </thead>
            <tbody>
              {groupedRows.map((g) => (
                <React.Fragment key={g.key}>
                  <tr>
                    <td colSpan={9} style={{ padding: "6px 14px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderBottom: "0.5px solid var(--border)", textTransform: "uppercase", letterSpacing: 0.4 }}>
                      {g.label} <span style={{ fontWeight: 400 }}>· {g.members.length}</span>
                    </td>
                  </tr>
                  {g.members.map(renderRow)}
                </React.Fragment>
              ))}
              {groupedRows.length === 0 && <tr><td colSpan={9} style={{ padding: 20, color: "var(--gray)", fontSize: 13 }}>No staff for {selectedVenueName}{areaFilter !== "all" ? ` in ${areaFilter}` : ""}.</td></tr>}
              {/* #5 per-day distinct-staff headcount (rostered = ≥1 shift that day) */}
              {groupedRows.length > 0 && (
                <tr>
                  <td style={{ padding: "8px 14px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderTop: "0.5px solid var(--border)" }}>Staff rostered</td>
                  {DAYS.map((_, day) => <td key={day} style={{ textAlign: "center", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderTop: "0.5px solid var(--border)" }}>{dayHeadcount(day) || ""}</td>)}
                  <td style={{ textAlign: "center", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", borderTop: "0.5px solid var(--border)" }}>{weekHeadcount || ""}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ padding: "12px 14px", background: "var(--gray-light)", borderTop: "0.5px solid var(--border)", display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Total paid hours this week: </span><strong>{fmtHours(totalHours)}</strong></div>
          {/* labour $ / % are management info — shifts:edit only (staff still sees hours + break split below) */}
          {canEdit && (
            <>
              <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Est. labour cost: </span><strong>${labourCost.toLocaleString()}</strong></div>
              <div style={{ fontSize: 11 }}><span style={{ color: "var(--gray)" }}>Labour %: </span><strong>{labourPct}%</strong> <span style={{ color: "var(--gray)" }}>(target 20–25%)</span></div>
            </>
          )}
          <div style={{ fontSize: 11, width: "100%", color: "var(--gray)" }}>
            Mon–Fri <strong>{fmtHours(hoursByType.mf)}h</strong> · Sat <strong>{fmtHours(hoursByType.sat)}h</strong> · Sun <strong>{fmtHours(hoursByType.sun)}h</strong> · PH <strong>{fmtHours(hoursByType.ph)}h</strong> · Paid <strong>{fmtHours(weekSplit.paid)}h</strong> · Unpaid <strong>{fmtHours(weekSplit.unpaid)}h</strong>
            <span style={{ marginLeft: 16 }}>Fortnight paid total: <strong>{fmtHours(fortnightHours)}h</strong></span>
          </div>
          {/* per-type approved-leave days for the visible week (Phase 4c) — only types present */}
          {Object.keys(weekLeave).length > 0 && (
            <div style={{ fontSize: 11, width: "100%", color: "var(--gray)" }}>
              On leave this week (days): {Object.entries(weekLeave).map(([t, n]) => `${t}: ${n}`).join(" · ")}
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Add shift modal */}
      {modal && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModal(null)}>
          <div className="rg-modal">
            <div className="modal-head">
              <span className="modal-title">{form.editId ? "Edit shift" : "Add shift"}</span>
              <button className="modal-close" onClick={() => setModal(null)}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="form-group"><label className="form-label">Staff member</label>
                <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                  <option value="">Select...</option>
                  {scopedStaff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Day</label>
                <select className="form-input" value={form.day} onChange={setF("day")}>{FULL_DAYS.map((d) => <option key={d}>{d}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Start time</label>
                <select className="form-input" value={form.start} onChange={setF("start")}>{startOptions.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">End time</label>
                <select className="form-input" value={form.end} onChange={setF("end")}>{endOptions.map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Role for this shift</label>
                <select className="form-input" value={form.role} onChange={setF("role")}>{[...new Set([form.role, ...(roles?.length ? roles : ROLES)].filter(Boolean))].map((r) => <option key={r}>{r}</option>)}</select>
              </div>
              <div className="form-group"><label className="form-label">Venue</label>
                <select className="form-input" value={form.venueId} onChange={setF("venueId")}>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Station</label>
                <select className="form-input" value={form.stationId} onChange={setF("stationId")}>
                  <option value="">— None —</option>
                  {formStations.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.area}</option>)}
                </select>
              </div>
            </div>
            {(() => {
              // EFFECTIVE break preview — area-driven from the selected station, and
              // override-aware when editing a shift that carries breakOverrideMins (mirror
              // the Ops form). DISPLAY ONLY — reuses effectiveBreak on a synthetic shift
              // built from form state; the saveShift payload is untouched.
              const editingShift = form.editId ? shifts.find((s) => s.id === form.editId) : null;
              const b = effectiveBreak({ start: form.start, end: form.end, stationId: form.stationId, venueId: form.venueId, breakOverrideMins: editingShift?.breakOverrideMins });
              const fArea = stations.find((s) => s.id === form.stationId && s.venueId === form.venueId)?.area || null;
              const why = !fArea ? " (no station → no area → no auto break)" : (!areaGetsBreak(group, fArea) ? ` (${fArea}: breaks off)` : "");
              return (
                <div style={{ fontSize: 11, color: "var(--gray)", margin: "2px 0 8px" }}>
                  {b.breakMins > 0
                    ? `${fmtHours(b.paidHours)}h paid · ${fmtHours(b.unpaidHours)}h unpaid (${b.breakMins} min break ${b.manual ? "· manual override" : `auto — ${fArea}`})`
                    : b.manual
                      ? `${fmtHours(b.grossHours)}h · no break (manual override)`
                      : `${fmtHours(b.grossHours)}h · no auto break${why}`}
                </div>
              );
            })()}
            <div className="form-group"><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={setF("notes")} placeholder="e.g. Cover for sick call, train new staff" /></div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={saveShift}>Save shift</button>
              <button className="btn" onClick={() => setModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift detail (click a shift) */}
      {shiftDetail && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setShiftDetail(null)}>
          <div className="rg-modal" style={{ maxWidth: 440 }}>
            <div className="modal-head"><span className="modal-title">Shift — {shiftDetail.staffName}</span><button className="modal-close" onClick={() => setShiftDetail(null)}>✕</button></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[["Day", FULL_DAYS[shiftDetail.day]], ["Rostered", `${shiftDetail.start} – ${shiftDetail.end}`], ["Role", shiftDetail.role], ["Venue", shiftDetail.venue], ["Station", shiftDetail.station]].map(([k, v]) => (
                <div key={k}><div className="form-label">{k}</div><div style={{ fontSize: 13 }}>{v || "—"}</div></div>
              ))}
            </div>
            {/* hours + EFFECTIVE break (manual override ?? area-derived) with its source */}
            <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 8 }}>
              {(() => {
                const b = effectiveBreak(shiftDetail);
                const area = shiftAreaOf(shiftDetail);
                const src = b.manual ? "manual override"
                  : area ? (areaGetsBreak(group, area) ? `auto — ${area}` : `auto — ${area}: breaks off`)
                  : "auto — no station/area";
                return b.breakMins > 0
                  ? `${fmtHours(b.grossHours)}h gross · ${fmtHours(b.paidHours)}h paid · ${fmtHours(b.unpaidHours)}h unpaid (${b.breakMins} min break · ${src})`
                  : `${fmtHours(b.grossHours)}h gross · ${fmtHours(b.paidHours)}h paid · no break (${src})`;
              })()}
            </div>
            {/* manual break override — 0..60 in 15-min steps; "Automatic" clears the field so
                the shift reverts to the area-derived value */}
            {canEdit && (
              <div className="form-group" style={{ marginTop: 10, marginBottom: 0 }}>
                <label className="form-label">Break override</label>
                <select className="form-input" style={{ width: 230 }}
                  value={shiftDetail.breakOverrideMins != null ? String(shiftDetail.breakOverrideMins) : ""}
                  onChange={(e) => setBreakOverride(shiftDetail, e.target.value === "" ? null : Number(e.target.value))}>
                  <option value="">Automatic (use area rule)</option>
                  {[0, 15, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min{m === 0 ? " (no break)" : ""}</option>)}
                </select>
              </div>
            )}
            {/* Punch — clock in / break / clock out; admins can edit the times */}
            <div className="form-group" style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10, marginTop: 12 }}>
              <div className="form-label" style={{ marginBottom: 6 }}>Punch{canEdit ? " · admin can edit" : ""}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {[["Clock in", "clockInAt"], ["Break start", "breakStartAt"], ["Break end", "breakEndAt"], ["Clock out", "clockOutAt"]].map(([lbl, field]) => (
                  <div key={field}>
                    <div className="form-label">{lbl}</div>
                    {canEdit
                      ? <input type="time" className="form-input" value={hhmm(shiftDetail[field])} onChange={(e) => setClock(shiftDetail, field, e.target.value)} />
                      : <div style={{ fontSize: 13 }}>{shiftDetail[field] ? fmtClock(shiftDetail[field]) : "—"}</div>}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginTop: 12 }}><div className="form-label">Notes</div><div style={{ fontSize: 13, color: shiftDetail.notes ? "var(--ink)" : "var(--gray)" }}>{shiftDetail.notes || "No notes"}</div></div>
            <div className="btn-row">
              {canEdit && <button className="btn btn-primary" onClick={() => openEdit(shiftDetail)}>Edit shift</button>}
              {canEdit && <button className="btn btn-danger" onClick={async () => { if (window.confirm(`Remove ${shiftDetail.staffName}'s ${shiftDetail.start}–${shiftDetail.end} shift?`)) { await removeShift(shiftDetail); setShiftDetail(null); } }}>Remove shift</button>}
              <button className="btn" onClick={() => setShiftDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Staff capability card (click a name) */}
      {capStaff && (
        <StaffCapabilityCard
          staff={capStaff}
          assignments={assignments}
          shifts={shifts}
          perfNotes={perfNotes}
          canAssign={canEdit}
          onAssign={(id) => { setCapStaff(null); openAdd(id, 0); }}
          onClose={() => setCapStaff(null)}
        />
      )}
    </>
  );
}
