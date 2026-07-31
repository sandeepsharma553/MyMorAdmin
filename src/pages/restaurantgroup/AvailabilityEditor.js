import React, { useEffect, useMemo, useState } from "react";
import { doc, writeBatch, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { groupAvailabilityCol, availabilityDocId } from "../../utils/restaurantGroupPaths";
import { parseShiftTime, boundedTimes, clusterEnvelopeForDay, dayKeyOfDate, currentWeekKey, mondayFromWeekKey } from "./rgUtils";
import { clustersForStaffDefaulted, clusterName, groupClusters, DEFAULT_CLUSTER_ID } from "./staffStructureUtils";

/* THE ONE availability editor (extracted from AvailabilityPage, Jul 2026) — do NOT
 * re-inline or duplicate. Two callers share it:
 *   - AvailabilityPage: staff = the logged-in user's OWN staff doc (self-posting)
 *   - ShiftPlannerPage's amend modal: staff = the TARGET staffer (availability:edit only,
 *     audit-logged by the caller via onSaved)
 * Cluster-scoped + informational-only (Phase 3b). ONE doc per staffer per CLUSTER per day
 * in the group-level collection:
 *   restaurantGroups/{g}/availability/{staffId}_{clusterId}_{date}
 *   { staffId, staffName, clusterId, date, available, allDay, windows, note,
 *     updatedBy, updatedAt }
 * NO status / proposal / review fields — availability is information for rostering, not a
 * request needing approval. No VENUE anywhere: the staffer's cluster(s) resolve from their
 * venues via clustersForStaffDefaulted ("__default__" when their venues have no cluster
 * yet). Single cluster → no picker; 2+ clusters (rare) → a cluster picker. One doc per
 * cluster/day makes cross-venue overlap impossible by construction, so the old
 * crossVenueClash guard is GONE. The OLD per-venue availability collection is neither
 * read nor written here — the planner + manager machine keep using it until Phase 3c. */

// Time options are PER DAY as of Phase 3e — bounded to the cluster's widest hours-envelope
// via the shared rgUtils helpers (the local mkTimes/TIMES copy is gone); see timesFor below.
const endAfterStart = (s, e) => parseShiftTime(e) > parseShiftTime(s);
const windowsOverlap = (a, b) =>
  parseShiftTime(a.start) < parseShiftTime(b.end) && parseShiftTime(b.start) < parseShiftTime(a.end);

// ── Per-cluster lock settings (fortnightly lock, owner-confirmed Jul 2026) ──
// CROSS-REPO SHARED HELPER — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's copy
// (same twin convention as availabilityWindow below; this copy lives in-component).
// Settings live ON the cluster object in group.clusters[] ({ id, name, lockCycle?,
// anchorDate?, openDays? }): availability is POSTED per cluster, so the lock is scoped
// the same way — and the group doc is member-readable, so the staff tier (the locked
// population) can always read them. An UNCONFIGURED cluster resolves to today's exact
// behaviour: weekly lock, 21-day window. The virtual "__default__" cluster (venues with
// no cluster yet) has no object in group.clusters and therefore always resolves here.
const availabilityLockFor = (cluster) => {
  const fortnightly = cluster?.lockCycle === "fortnightly";
  const anchorDate = typeof cluster?.anchorDate === "string" ? cluster.anchorDate : "";
  const n = Number(cluster?.openDays);
  const openDays = Number.isFinite(n) && n >= 1 ? Math.round(n) : (fortnightly ? 14 : 21);
  return { lockCycle: fortnightly ? "fortnightly" : "weekly", anchorDate, openDays };
};

// CROSS-REPO SHARED HELPER — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's copy.
// Anchor "YYYY-MM-DD" → its week's LOCAL Monday midnight, or null when missing/invalid
// (a fortnightly cluster with no valid anchor falls back to weekly — the same null
// contract as the scheduler's rgFortnightDue: never guess a cadence nobody chose).
// Parsed by PARTS, never new Date(string) (that is UTC midnight and can shift the day).
const anchorMondayDate = (anchorStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorStr || "")) return null;
  const [y, m, d] = anchorStr.split("-").map(Number);
  const a = new Date(y, m - 1, d);
  if (a.getFullYear() !== y || a.getMonth() !== m - 1 || a.getDate() !== d) return null;
  a.setDate(a.getDate() - ((a.getDay() + 6) % 7));
  a.setHours(0, 0, 0, 0);
  return a;
};

// CROSS-REPO SHARED HELPERS — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's copies.
const mondayOfDate = (dt) => {
  const x = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
};
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
// Which LOCKING BLOCK does a day belong to? Weekly: its own week. Fortnightly (valid
// anchor, day ON/AFTER the anchor Monday — DIRECTIONAL, days before it keep weekly):
// the anchored two-week block.
// PARITY MATHS PORTED FROM functions rgFortnightDue: both dates reduce to their LOCAL
// Monday midnight and whole weeks are counted with Math.round, NOT floor — in a
// DST-observing runtime a Monday-to-Monday interval spanning a transition is 167 or
// 169 hours (6.96/7.04 days) and floor would misread it; round always lands on the
// integer. ⚠ That guard has NEVER RUN IN ANGER: Cloud Functions run in UTC where there
// is no DST and round is a no-op — running on a DEVICE makes it load-bearing for the
// first time (see availabilityModel.dst.test.js).
const blockStartFor = (day, lock) => {
  const wkMonday = mondayOfDate(day);
  if (lock && lock.lockCycle === "fortnightly") {
    const a = anchorMondayDate(lock.anchorDate);
    if (a && day.getTime() >= a.getTime()) {
      const weeks = Math.round((wkMonday - a) / WEEK_MS);
      return weeks % 2 === 0 ? wkMonday : new Date(wkMonday.getFullYear(), wkMonday.getMonth(), wkMonday.getDate() - 7);
    }
  }
  return wkMonday;
};

// CROSS-REPO SHARED HELPER — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's copy
// (modGroupKind/staffSeesAll convention; this copy lives in-component).
// The rolling posting window: `length` LOCAL dates ascending from the given WEEK-MONDAY
// anchor (default 21 — today's 3-week behaviour; the caller derives a longer length via
// availabilityWindowLength when a cluster locks fortnightly). The CALLER derives the
// anchor from the EXISTING week helpers (Ops mondayOf(0) / Admin
// mondayFromWeekKey(currentWeekKey())) — no new week-start math lives here. Mid-week the
// window still starts at THIS week's Monday (matching the planner), so someone on
// Wednesday can still change Saturday; it advances only when the week does. Dates are
// built from LOCAL year/month/day parts (never a UTC ISO slice) so both apps key the
// same days. Docs that roll OUT of the window are KEPT, never deleted — managers
// rostered against them; they just stop rendering (and stop being editable).
const availabilityWindow = (monday, length = 21) => {
  const out = [];
  for (let i = 0; i < length; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
};

// CROSS-REPO SHARED HELPER — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's copy
// (same twin convention as availabilityWindow above).
// THE FRIDAY LOCK (owner-confirmed): a locking BLOCK closes at 11:59pm on the Friday
// BEFORE the block starts. Weekly (the default, and every pre-anchor day): the block is
// the day's own week — byte-for-byte today's outcomes over a 21-day window (current week
// always locked, next week locks past Friday 23:59:59.999, third week still open).
// Fortnightly: the block is the anchored two-week span, so the mid-block Friday closes
// nothing. One deliberate refinement over the old index-hardcoded version (<= 6 / >= 14):
// in a session left open 2+ weeks, far indices now lock by DATE once their block's
// Friday actually passes — the old code held them open forever.
// `monday` is the SAME anchor the caller fed availabilityWindow; the cutoff is built
// from LOCAL parts — never by parsing a date string (bare new Date("YYYY-MM-DD") is UTC
// midnight). DEVICE-LOCAL TIME: neither app pins a client timezone, so a mis-set or
// overseas device gets a displaced cutoff — and nothing server-side enforces the lock
// (the availability rule is flat member-write). This is a UX boundary, not a security
// one (CLAUDE.md RULE 2). Tier-blind by design: the CALLER exempts
// can("availability","edit") holders.
const isDayLocked = (dayIndex, monday, now = new Date(), lock = null) => {
  const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + dayIndex);
  const b = blockStartFor(day, lock);
  const cutoff = new Date(b.getFullYear(), b.getMonth(), b.getDate() - 3, 23, 59, 59, 999);
  return now.getTime() > cutoff.getTime();
};

// CROSS-REPO SHARED HELPER — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's copy.
// How long the window must be: the LOCKED prefix plus the cluster's open days. Weekly
// stays a fixed 21 (today's behaviour, untouched). Fortnightly scans forward from the
// window anchor to the first day whose block is still open — the scan uses isDayLocked
// itself, so the length and the per-day lock can never disagree — then adds openDays,
// so the whole open block is always visible (21-day windows go 100% read-only every
// other week under a fortnight lock; this is the fix). Bounded: 366-day scan guard.
const availabilityWindowLength = (monday, now = new Date(), lock = null) => {
  if (!lock || lock.lockCycle !== "fortnightly" || !anchorMondayDate(lock.anchorDate)) return 21;
  let firstOpen = 0;
  while (firstOpen < 366 && isDayLocked(firstOpen, monday, now, lock)) firstOpen++;
  return firstOpen + lock.openDays;
};

const dayLabel = (dstr) => { try { return new Date(`${dstr}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); } catch { return dstr; } };

export default function AvailabilityEditor({ staff, onSaved }) {
  const { groupId, group, venues, myStaff, me, can, showToast, noteErr } = useRG();
  const isSelf = myStaff?.id === staff?.id;
  // FRIDAY LOCK exemption: managers/owners (availability:edit — defaults grant them
  // approve, which ranks above edit) are never locked; everyone else is.
  const lockExempt = can("availability", "edit");
  // anchor = THIS week's real local Monday via the existing frozen-key round-trip
  // (currentWeekKey ∘ mondayFromWeekKey — the exported pair the date fixes proved exact).
  // The SAME anchor feeds availabilityWindow and isDayLocked, so lock indices and window
  // indices can never disagree — even in a session left open across a week boundary.
  const anchorMonday = useMemo(() => mondayFromWeekKey(currentWeekKey()), []);
  // cluster resolution — NEVER empty ("__default__" fallback when venues have no cluster)
  const clusterIds = useMemo(() => clustersForStaffDefaulted(group, venues, staff), [group, venues, staff]);
  const [chosenCluster, setChosenCluster] = useState("");
  const clusterId = clusterIds.length === 1 ? clusterIds[0] : (clusterIds.includes(chosenCluster) ? chosenCluster : "");
  // Per-cluster lock config (fortnightly lock, Jul 2026): resolves from the cluster
  // object in group.clusters; the virtual "__default__" cluster has no object there,
  // so it — and every unconfigured cluster — resolves to weekly/21, today's behaviour.
  const lock = useMemo(() => availabilityLockFor(groupClusters(group).find((c) => c.id === clusterId)), [group, clusterId]);
  // window length = locked prefix + the cluster's open days (weekly stays fixed 21);
  // the SAME anchor + lock feed the window, the lock checks and the passed section,
  // so their indices can never disagree.
  const winLen = useMemo(() => availabilityWindowLength(anchorMonday, new Date(), lock), [anchorMonday, lock]);
  const days = useMemo(() => availabilityWindow(anchorMonday, winLen), [anchorMonday, winLen]);
  // locked days are always a leading PREFIX (block cutoffs never decrease with the
  // index) — the passed section renders this prefix, the editable map renders the rest
  const lockedCount = useMemo(() => {
    if (lockExempt) return 0;
    const now = new Date();
    let i = 0;
    while (i < days.length && isDayLocked(i, anchorMonday, now, lock)) i++;
    return i;
  }, [days, anchorMonday, lock, lockExempt]);
  const clusterLabel = (id) => (id === DEFAULT_CLUSTER_ID ? "Default" : (clusterName(group, id) || id));
  // Phase 3e: per-day options bounded to the CLUSTER's widest hours-envelope (earliest
  // open −1h … latest close +1h across the pool's venues, per-venue fallback); the
  // FULL-DAY list when no venue in the cluster has usable hours that day.
  // 30-MIN increments (30 Jul 2026 list): the shared envelope list is 15-min (planner
  // keeps it) — availability keeps only the :00/:30 options. Stored :15/:45 values from
  // before the change stay selectable via optsWith below.
  const timesFor = (d) => boundedTimes(clusterEnvelopeForDay(venues, clusterId, dayKeyOfDate(d))).filter((t) => /:(00|30)[ap]m$/.test(t));
  // an out-of-range stored window stays selectable (prepended) — union-in, like the planner
  const optsWith = (T, v) => (v && !T.includes(v) ? [v, ...T] : T);
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // the TARGET's posts, read from the NEW collection only — editor-local listener.
  // RGContext's old per-venue availability subscription is untouched (the planner still
  // uses it for display).
  const [myPosts, setMyPosts] = useState([]);
  useEffect(() => {
    if (!groupId || !staff?.id) { setMyPosts([]); return; }
    const unsub = onSnapshot(
      query(groupAvailabilityCol(groupId), where("staffId", "==", staff.id)),
      (snap) => setMyPosts(snap.docs.map((x) => ({ id: x.id, ...x.data() }))),
      () => { setMyPosts([]); noteErr("availability"); } // group-availability rule is LIVE — a denial here is a real failure now
    );
    return () => unsub();
  }, [groupId, staff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // THIS cluster's existing doc for a date (one doc per staffer/cluster/day by key design).
  const existing = (d) => myPosts.find((a) => a.clusterId === clusterId && a.date === d) || null;
  const val = (d) => edits[d] || existing(d) || { available: false, allDay: true, windows: [], note: "" };
  const change = (d, patch) => { setEdits((p) => ({ ...p, [d]: { ...val(d), ...patch } })); setDirty((p) => new Set(p).add(d)); };
  const setWindow = (d, i, patch) => { const w = [...(val(d).windows || [])]; w[i] = { ...w[i], ...patch }; change(d, { windows: w }); };
  const addWindow = (d) => {
    const T = timesFor(d);
    const w = [...(val(d).windows || [])];
    const lastEndIdx = T.indexOf(w[w.length - 1]?.end); // new window starts where the last one ends
    const nineIdx = T.indexOf("9:00am"); // 9:00am default when in range, else the day's earliest option
    const startIdx = lastEndIdx >= 0 ? Math.min(lastEndIdx, T.length - 2) : (nineIdx >= 0 ? nineIdx : 0);
    const endIdx = Math.min(startIdx + 8, T.length - 1); // default 4h span (30-min steps)
    w.push({ start: T[startIdx], end: T[endIdx] });
    change(d, { windows: w, allDay: false });
  };
  const removeWindow = (d, i) => change(d, { windows: (val(d).windows || []).filter((_, x) => x !== i) });
  // switch All day → windows mode, seeding one default window if none exist yet
  const toWindows = (d) => {
    const T = timesFor(d);
    const v = val(d);
    const s = T.indexOf("9:00am") >= 0 ? T.indexOf("9:00am") : 0;
    const w = (v.windows || []).length ? v.windows : [{ start: T[s], end: T[Math.min(s + 8, T.length - 1)] }]; // 4h from 9:00am (or the day's start), 30-min steps
    change(d, { allDay: false, windows: w });
  };
  // cluster switch: edits are keyed by date only, so carry-over would cross-write clusters
  const pickCluster = (id) => { setChosenCluster(id); setEdits({}); setDirty(new Set()); };

  const save = async () => {
    if (!clusterId) return showToast("Pick a cluster first");
    const toWrite = [...dirty];
    if (!toWrite.length) return showToast("Nothing to save — make a change first");
    // FRIDAY LOCK (belt-and-braces): locked days render no controls, but a stale edit
    // could still sit in `dirty` (e.g. the cutoff passed mid-session) — refuse the save
    // outright rather than silently skipping days.
    if (!lockExempt && toWrite.some((d) => isDayLocked(days.indexOf(d), anchorMonday, new Date(), lock))) {
      return showToast("Availability for that week has closed — it can no longer be changed");
    }
    // ── validation gates — any failure blocks the WHOLE save; nothing is written ──
    // (same-day window checks only; the old crossVenueClash guard is obsolete — one doc
    // per staffer/cluster/day means cross-venue overlap can no longer exist.)
    for (const d of toWrite) {
      const v = val(d);
      if (!v.available) continue; // unavailable days carry no windows to validate
      const wins = v.allDay ? [] : (v.windows || []);
      if (!v.allDay && !wins.length) return showToast(`${dayLabel(d)}: add a time window or choose All day`);
      for (const w of wins) {
        if (!endAfterStart(w.start, w.end)) return showToast(`${dayLabel(d)}: end must be after start`);
      }
      if (wins.some((w, i) => wins.slice(i + 1).some((x) => windowsOverlap(w, x)))) {
        return showToast(`${dayLabel(d)}: time windows overlap — adjust or remove one`);
      }
    }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      toWrite.forEach((d) => {
        const v = val(d);
        const ref = doc(groupAvailabilityCol(groupId), availabilityDocId(staff.id, clusterId, d));
        // INFORMATIONAL shape — no status / proposal / review fields, no venue.
        // updatedBy is the ACTOR (a manager amending writes THEIR uid, not the staffer's).
        batch.set(ref, {
          staffId: staff.id,
          staffName: staff.displayName || staff.name || "",
          clusterId,
          date: d,
          available: !!v.available,
          allDay: v.allDay !== false, // default true (whole day) unless explicitly windowed
          windows: Array.isArray(v.windows) ? v.windows : [],
          note: v.note || "",
          updatedBy: me?.uid || me?.id || "",
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      setDirty(new Set());
      showToast("Availability saved");
      if (onSaved) onSaved({ count: toWrite.length }); // planner amend modal audit-logs here
    } catch { showToast("Could not save — try again"); }
    finally { setBusy(false); }
  };

  return (
    <>
      {/* header: cluster (only when the staffer spans 2+ clusters) + save */}
      <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{isSelf ? `My availability — next ${days.length} days` : `${staff.displayName || staff.name || "Staff"} — availability, next ${days.length} days`}</div>
          <div style={{ fontSize: 12, color: "var(--gray)" }}>{isSelf ? "Post when you can work — your manager sees it on the roster." : "Amendments save to their posted availability."}</div>
        </div>
        {clusterIds.length > 1 ? (
          <select className="form-input" style={{ width: 200, marginLeft: "auto" }} value={clusterId} onChange={(e) => pickCluster(e.target.value)} title="Cluster for your availability">
            <option value="">Select cluster…</option>
            {clusterIds.map((id) => <option key={id} value={id}>{clusterLabel(id)}</option>)}
          </select>
        ) : (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray)" }}>Cluster: <strong>{clusterLabel(clusterId)}</strong></span>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy || dirty.size === 0}>{busy ? "Saving…" : `Save${dirty.size ? ` (${dirty.size})` : ""}`}</button>
      </div>

      {clusterIds.length > 1 && !clusterId && (
        <div className="card" style={{ marginBottom: 8, fontSize: 12, color: "var(--gray)" }}>Pick a cluster above to set your availability.</div>
      )}

      {/* Friday-lock disclaimer (30 Jul 2026 list) — the lock itself is isDayLocked */}
      <div className="card" style={{ marginBottom: 8, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", fontSize: 12, color: "#92400e", fontWeight: 600 }}>
        Availability closes at 11:59pm Friday. After the cutoff the next two weeks are locked and
        can't be edited — ask a manager if something changes.
      </div>

      {/* PASSED section — the locked prefix, GROUPED BY WEEK: each week one collapsed
          <details> row (same idiom as the self-profile's past change requests) that
          expands to the SAME read-only content the old locked rows carried — the posted
          value string; the closed message moves to the week summary. */}
      {(() => {
        if (!lockedCount) return null;
        const chunks = [];
        for (let s = 0; s < lockedCount; s += 7) chunks.push(days.slice(s, Math.min(s + 7, lockedCount)));
        return chunks.map((week) => (
          <details key={week[0]} className="card" style={{ marginBottom: 8, padding: "10px 14px", opacity: 0.75 }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
              Week of {dayLabel(week[0])}
              <span style={{ marginLeft: 10, fontSize: 10, fontWeight: 700, color: "#9ca3af" }}>Closed — availability can no longer be changed</span>
            </summary>
            {week.map((d) => {
              const ex = existing(d);
              const posted = ex
                ? (ex.available ? (ex.allDay !== false ? "Available: all day" : `Available: ${(ex.windows || []).map((w) => `${w.start}–${w.end}`).join(", ")}`) : "Unavailable")
                : "Not set";
              return (
                <div key={d} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderTop: "0.5px solid var(--gray-light)", marginTop: 5 }}>
                  <div style={{ width: 120, fontSize: 12, fontWeight: 600 }}>{dayLabel(d)}</div>
                  <span style={{ fontSize: 12, color: "var(--gray)" }}>{posted}</span>
                </div>
              );
            })}
          </details>
        ));
      })()}
      {/* OPEN weeks — grouped under the SAME week headers as the passed section (owner
          request): each week is a <details> too, but defaults OPEN (these rows are
          being edited). Mirror Ops's openWeeks-default-true grouping. */}
      {(() => {
        const weeks = [];
        for (let s = lockedCount; s < days.length; s += 7) weeks.push(days.slice(s, Math.min(s + 7, days.length)));
        return weeks.map((week) => (
          // SAME card box as the closed-week section (owner request) — open weeks just
          // aren't dimmed and default expanded
          <details key={week[0]} open className="card" style={{ marginBottom: 8, padding: "10px 14px" }}>
            <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, padding: "2px 0 8px" }}>Week of {dayLabel(week[0])}</summary>
            {week.map((d) => {
        const v = val(d);
        const ex = existing(d);
        const dayTimes = timesFor(d); // cluster envelope ±1h (or full-day)
        return (
          <div key={d} className="card" style={{ marginBottom: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ width: 120, fontSize: 13, fontWeight: 700 }}>{dayLabel(d)}</div>
              <button className="btn btn-sm" disabled={!clusterId} onClick={() => change(d, { available: true })} style={v.available ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}>Available</button>
              <button className="btn btn-sm" disabled={!clusterId} onClick={() => change(d, { available: false })} style={!v.available ? { background: "#111827", color: "#fff", borderColor: "#111827" } : undefined}>Unavailable</button>
              {v.available && (
                <>
                  <button className="btn btn-sm" disabled={!clusterId} onClick={() => change(d, { allDay: true })} style={v.allDay ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>All day</button>
                  <button className="btn btn-sm" disabled={!clusterId} onClick={() => toWindows(d)} style={!v.allDay ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>Set window</button>
                </>
              )}
              {dirty.has(d)
                ? <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#d97706" }}>Unsaved</span>
                : (ex && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: "#dcfce7", color: "#166534", borderRadius: 999, padding: "2px 8px" }}>Posted</span>)}
            </div>

            {v.available && !v.allDay && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {(v.windows || []).map((w, i2) => (
                  <div key={i2} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select className="form-input" style={{ width: 120 }} value={w.start} onChange={(e) => setWindow(d, i2, { start: e.target.value })}>{optsWith(dayTimes, w.start).map((t) => <option key={t}>{t}</option>)}</select>
                    <span style={{ color: "var(--gray)" }}>–</span>
                    <select className="form-input" style={{ width: 120 }} value={w.end} onChange={(e) => setWindow(d, i2, { end: e.target.value })}>{optsWith(dayTimes, w.end).map((t) => <option key={t}>{t}</option>)}</select>
                    <button className="btn btn-sm" title="Remove window" onClick={() => removeWindow(d, i2)}>✕</button>
                  </div>
                ))}
                <div><button className="btn btn-sm" onClick={() => addWindow(d)}>+ Add window</button></div>
              </div>
            )}
            {v.available && (
              <input className="form-input" style={{ marginTop: 8, maxWidth: 420 }} placeholder="Note (optional)" value={v.note || ""} onChange={(e) => change(d, { note: e.target.value })} />
            )}
          </div>
        );
            })}
          </details>
        ));
      })()}
    </>
  );
}
