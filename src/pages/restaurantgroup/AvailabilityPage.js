import React, { useEffect, useMemo, useState } from "react";
import { doc, writeBatch, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { groupAvailabilityCol, availabilityDocId } from "../../utils/restaurantGroupPaths";
import { parseShiftTime, boundedTimes, clusterEnvelopeForDay, dayKeyOfDate, currentWeekKey, mondayFromWeekKey } from "./rgUtils";
import { clustersForStaffDefaulted, clusterName, DEFAULT_CLUSTER_ID } from "./staffStructureUtils";

/* Staff-SELF availability (web) — CLUSTER-SCOPED + INFORMATIONAL-ONLY (Phase 3b).
 * Identity is ALWAYS the logged-in user's own staff doc (myStaff). ONE doc per staffer
 * per CLUSTER per day in the NEW group-level collection:
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

// CROSS-REPO SHARED HELPER — must stay BYTE-IDENTICAL to Ops lib/availabilityModel's
// availabilityWindow (modGroupKind/staffSeesAll convention; this copy lives in-page).
// The ROLLING 3-WEEK posting window (client issue 6): 21 LOCAL dates ascending from the
// given WEEK-MONDAY anchor. The CALLER derives the anchor from the EXISTING week helpers
// (Ops mondayOf(0) / Admin mondayFromWeekKey(currentWeekKey())) — no new week-start math
// lives here. Mid-week the window still starts at THIS week's Monday (matching the
// planner), so someone on Wednesday can still change Saturday; it advances only when the
// week does. Dates are built from LOCAL year/month/day parts (never a UTC ISO slice) so
// both apps key the same days. Docs that roll OUT of the window are KEPT, never deleted —
// managers rostered against them; they just stop rendering (and stop being editable).
const availabilityWindow = (monday) => {
  const out = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
};
const dayLabel = (dstr) => { try { return new Date(`${dstr}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); } catch { return dstr; } };

export default function AvailabilityPage() {
  const { groupId, group, venues, myStaff, me, showToast, noteErr } = useRG();
  // anchor = THIS week's real local Monday via the existing frozen-key round-trip
  // (currentWeekKey ∘ mondayFromWeekKey — the exported pair the date fixes proved exact)
  const days = useMemo(() => availabilityWindow(mondayFromWeekKey(currentWeekKey())), []);
  // cluster resolution — NEVER empty ("__default__" fallback when venues have no cluster)
  const clusterIds = useMemo(() => clustersForStaffDefaulted(group, venues, myStaff), [group, venues, myStaff]);
  const [chosenCluster, setChosenCluster] = useState("");
  const clusterId = clusterIds.length === 1 ? clusterIds[0] : (clusterIds.includes(chosenCluster) ? chosenCluster : "");
  const clusterLabel = (id) => (id === DEFAULT_CLUSTER_ID ? "Default" : (clusterName(group, id) || id));
  // Phase 3e: per-day options bounded to the CLUSTER's widest hours-envelope (earliest
  // open −1h … latest close +1h across the pool's venues, per-venue fallback); the
  // FULL-DAY list when no venue in the cluster has usable hours that day.
  const timesFor = (d) => boundedTimes(clusterEnvelopeForDay(venues, clusterId, dayKeyOfDate(d)));
  // an out-of-range stored window stays selectable (prepended) — union-in, like the planner
  const optsWith = (T, v) => (v && !T.includes(v) ? [v, ...T] : T);
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // my OWN posts, read from the NEW collection only — poster-local listener. RGContext's
  // old per-venue availability subscription is untouched (the planner still uses it).
  const [myPosts, setMyPosts] = useState([]);
  useEffect(() => {
    if (!groupId || !myStaff?.id) { setMyPosts([]); return; }
    const unsub = onSnapshot(
      query(groupAvailabilityCol(groupId), where("staffId", "==", myStaff.id)),
      (snap) => setMyPosts(snap.docs.map((x) => ({ id: x.id, ...x.data() }))),
      () => { setMyPosts([]); noteErr("availability"); } // group-availability rule is LIVE — a denial here is a real failure now
    );
    return () => unsub();
  }, [groupId, myStaff?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // unlinked login (no staff doc via adminUid/email) → no poster, no crash
  if (!myStaff) {
    return (
      <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>
        Your account isn't linked to a staff profile — ask an admin.
      </div>
    );
  }

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
    const endIdx = Math.min(startIdx + 16, T.length - 1); // default 4h span
    w.push({ start: T[startIdx], end: T[endIdx] });
    change(d, { windows: w, allDay: false });
  };
  const removeWindow = (d, i) => change(d, { windows: (val(d).windows || []).filter((_, x) => x !== i) });
  // switch All day → windows mode, seeding one default window if none exist yet
  const toWindows = (d) => {
    const T = timesFor(d);
    const v = val(d);
    const s = T.indexOf("9:00am") >= 0 ? T.indexOf("9:00am") : 0;
    const w = (v.windows || []).length ? v.windows : [{ start: T[s], end: T[Math.min(s + 16, T.length - 1)] }]; // 4h from 9:00am (or the day's start)
    change(d, { allDay: false, windows: w });
  };
  // cluster switch: edits are keyed by date only, so carry-over would cross-write clusters
  const pickCluster = (id) => { setChosenCluster(id); setEdits({}); setDirty(new Set()); };

  const save = async () => {
    if (!clusterId) return showToast("Pick a cluster first");
    const toWrite = [...dirty];
    if (!toWrite.length) return showToast("Nothing to save — make a change first");
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
        const ref = doc(groupAvailabilityCol(groupId), availabilityDocId(myStaff.id, clusterId, d));
        // INFORMATIONAL shape — no status / proposal / review fields, no venue
        batch.set(ref, {
          staffId: myStaff.id,
          staffName: myStaff.displayName || myStaff.name || "",
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
    } catch { showToast("Could not save — try again"); }
    finally { setBusy(false); }
  };

  return (
    <>
      {/* header: cluster (only when the staffer spans 2+ clusters) + save */}
      <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>My availability — next 3 weeks</div>
          <div style={{ fontSize: 12, color: "var(--gray)" }}>Post when you can work — your manager sees it on the roster.</div>
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

      {days.map((d) => {
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
                {(v.windows || []).map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select className="form-input" style={{ width: 120 }} value={w.start} onChange={(e) => setWindow(d, i, { start: e.target.value })}>{optsWith(dayTimes, w.start).map((t) => <option key={t}>{t}</option>)}</select>
                    <span style={{ color: "var(--gray)" }}>–</span>
                    <select className="form-input" style={{ width: 120 }} value={w.end} onChange={(e) => setWindow(d, i, { end: e.target.value })}>{optsWith(dayTimes, w.end).map((t) => <option key={t}>{t}</option>)}</select>
                    <button className="btn btn-sm" title="Remove window" onClick={() => removeWindow(d, i)}>✕</button>
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
    </>
  );
}
