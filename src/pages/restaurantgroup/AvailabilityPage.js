import React, { useMemo, useState } from "react";
import { doc, writeBatch, updateDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { parseShiftTime } from "./rgUtils";

/* Staff-SELF availability (web) — the Ops AvailabilityPoster ported to the admin app.
 * Identity is ALWAYS the logged-in user's own staff doc (myStaff) — this page never
 * shows or writes another staffer's availability. Doc contract mirrors Ops
 * lib/availabilityModel.buildAvailabilityDoc + the planner's accept/reject/propose:
 *   venues/{venueId}/availability/{staffId}_{date}
 *   { staffId, staffName, venueId, venue, date, available, allDay, windows, note,
 *     status: "pending", updatedBy, updatedAt }                                   */

// 15-minute options — same output shape as ShiftPlannerPage's mkTimes ("h:mmam/pm")
const mkTimes = (fromMin, toMin) => {
  const out = [];
  for (let m = fromMin; m <= toMin; m += 15) {
    const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? "pm" : "am", h12 = (h % 12) || 12;
    out.push(`${h12}:${String(mm).padStart(2, "0")}${ap}`);
  }
  return out;
};
const TIMES = mkTimes(0, 23 * 60 + 45);

// All-day availability behaves as one full-day window for overlap math.
// parseShiftTime (rgUtils) reads both "h:mmam" and 24h strings, so 0:00–24:00 is safe.
const FULL_DAY = { start: "0:00", end: "24:00" };
const endAfterStart = (s, e) => parseShiftTime(e) > parseShiftTime(s);
const windowsOverlap = (a, b) =>
  parseShiftTime(a.start) < parseShiftTime(b.end) && parseShiftTime(b.start) < parseShiftTime(a.end);

// 14 LOCAL dates as YYYY-MM-DD built from local year/month/day parts (NOT a UTC ISO
// slice) — mirrors Ops lib/availabilityModel.dateRange14 so both apps key the same days.
const dkey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dateRange14 = () => {
  const out = []; const now = new Date();
  for (let i = 0; i < 14; i++) out.push(dkey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)));
  return out;
};
const dayLabel = (dstr) => { try { return new Date(`${dstr}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }); } catch { return dstr; } };

// deterministic per-staff-per-day id — same convention as Ops + the planner's accept/reject
const availabilityDocId = (staffId, date) => `${staffId}_${date}`;

// day status → pill colours/label ("proposed" gets its own label; the banner carries the actions)
const statusPill = (st) =>
  st === "accepted" ? ["#dcfce7", "#166534", "Accepted"]
    : st === "rejected" ? ["#fee2e2", "#991b1b", "Rejected"]
      : st === "declined" ? ["#f3f4f6", "#6b7280", "Declined"]
        : st === "proposed" ? ["#fef3c7", "#92400e", "Suggestion awaiting you"]
          : ["#fef9c3", "#854d0e", "Pending review"];

export default function AvailabilityPage() {
  const { groupId, venues, availability, myStaff, me, showToast } = useRG();
  const days = useMemo(dateRange14, []);
  const vids = myStaff?.venueIds?.length ? myStaff.venueIds : (myStaff?.venueId ? [myStaff.venueId] : []);
  const [chosenVenue, setChosenVenue] = useState("");
  const venueId = vids.length === 1 ? vids[0] : (vids.includes(chosenVenue) ? chosenVenue : "");
  const venueNameOf = (id) => venues.find((v) => v.id === id)?.name || "";
  const [edits, setEdits] = useState({});
  const [dirty, setDirty] = useState(() => new Set());
  const [busy, setBusy] = useState(false);

  // unlinked login (no staff doc via adminUid/email) → no poster, no crash
  if (!myStaff) {
    return (
      <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>
        Your account isn't linked to a staff profile — ask an admin.
      </div>
    );
  }

  // THIS venue's existing doc for a date. Venue-specific on purpose: a proposal or a
  // posting can live at another of my venues, and a date-keyed map would be last-wins.
  const existing = (d) => (availability || []).find((a) => a.venueId === venueId && a.staffId === myStaff.id && a.date === d) || null;
  const val = (d) => edits[d] || existing(d) || { available: false, allDay: true, windows: [], note: "" };
  const change = (d, patch) => { setEdits((p) => ({ ...p, [d]: { ...val(d), ...patch } })); setDirty((p) => new Set(p).add(d)); };
  const setWindow = (d, i, patch) => { const w = [...(val(d).windows || [])]; w[i] = { ...w[i], ...patch }; change(d, { windows: w }); };
  const addWindow = (d) => {
    const w = [...(val(d).windows || [])];
    const lastEndIdx = TIMES.indexOf(w[w.length - 1]?.end); // new window starts where the last one ends
    const startIdx = lastEndIdx >= 0 ? Math.min(lastEndIdx, TIMES.length - 2) : 36; // 36 = 9:00am
    const endIdx = Math.min(startIdx + 16, TIMES.length - 1); // default 4h span
    w.push({ start: TIMES[startIdx], end: TIMES[endIdx] });
    change(d, { windows: w, allDay: false });
  };
  const removeWindow = (d, i) => change(d, { windows: (val(d).windows || []).filter((_, x) => x !== i) });
  // switch All day → windows mode, seeding one default window if none exist yet
  const toWindows = (d) => {
    const v = val(d);
    const w = (v.windows || []).length ? v.windows : [{ start: TIMES[36], end: TIMES[52] }]; // 9:00am–1:00pm
    change(d, { allDay: false, windows: w });
  };
  // venue switch: edits are keyed by date only, so carry-over would cross-write venues
  const pickVenue = (id) => { setChosenVenue(id); setEdits({}); setDirty(new Set()); };

  // Manager counter-proposal for a date — looked up across ALL my venues (the proposed
  // doc is venue-specific and may not be at the venue currently being edited).
  const proposedFor = (d) => (availability || []).find((a) => a.staffId === myStaff.id && a.date === d && a.status === "proposed");
  const propLabel = (p) => (p.proposedAllDay ? "All day" : (p.proposedWindows || []).map((w) => `${w.start}–${w.end}`).join(", "));
  const postedLabel = (p) => (p.available === false ? "Unavailable" : (p.allDay ? "All day" : ((p.windows || []).map((w) => `${w.start}–${w.end}`).join(", ") || "—")));

  // cross-venue HARD block: candidate windows ([] = all day) vs my available docs at my
  // OTHER venues on the same date — a LOCAL filter over the context array, no extra reads.
  const crossVenueClash = (d, wins, excludeVenueId) => {
    const mine = wins.length ? wins : [FULL_DAY];
    for (const ov of vids.filter((id) => id !== excludeVenueId)) {
      const other = (availability || []).find((a) => a.venueId === ov && a.staffId === myStaff.id && a.date === d && a.available);
      if (!other) continue;
      const theirs = other.allDay ? [FULL_DAY] : (other.windows || []);
      for (const ow of theirs) {
        if (mine.some((w) => windowsOverlap(w, ow))) {
          const span = other.allDay ? "all day" : `${ow.start}–${ow.end}`;
          return `${dayLabel(d)}: overlaps your availability at ${venueNameOf(ov) || other.venue || "another venue"} (${span})`;
        }
      }
    }
    return null;
  };

  const acceptProposal = async (d, p) => {
    // same cross-venue gate as save(): suggested times must not clash at my OTHER venues
    const clash = crossVenueClash(d, p.proposedAllDay ? [] : (p.proposedWindows || []), p.venueId);
    if (clash) return showToast(`Can't accept — ${clash}. Ask your manager to adjust.`);
    setBusy(true);
    try {
      await updateDoc(doc(venueCol(groupId, p.venueId, "availability"), availabilityDocId(myStaff.id, d)), {
        status: "accepted",
        windows: p.proposedAllDay ? [] : (p.proposedWindows || []),
        allDay: p.proposedAllDay === true,
        proposedWindows: deleteField(), proposedBy: deleteField(), proposedAt: deleteField(), proposedAllDay: deleteField(),
        updatedAt: serverTimestamp(),
      });
      showToast("Accepted — your availability now matches the suggested times");
    } catch { showToast("Could not accept — try again"); }
    finally { setBusy(false); }
  };

  const declineProposal = async (d, p) => {
    setBusy(true);
    try {
      // original windows/allDay survive untouched — only the proposal is cleared
      await updateDoc(doc(venueCol(groupId, p.venueId, "availability"), availabilityDocId(myStaff.id, d)), {
        status: "declined",
        proposedWindows: deleteField(), proposedBy: deleteField(), proposedAt: deleteField(), proposedAllDay: deleteField(),
        updatedAt: serverTimestamp(),
      });
      showToast("Declined the suggested times");
    } catch { showToast("Could not decline — try again"); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!venueId) return showToast("Pick a venue first");
    const toWrite = [...dirty];
    if (!toWrite.length) return showToast("Nothing to save — make a change first");
    // ── validation gates — any failure blocks the WHOLE save; nothing is written ──
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
      const clash = crossVenueClash(d, wins, venueId);
      if (clash) return showToast(`Clash — ${clash}. Overlapping availability across venues isn't allowed.`);
    }
    setBusy(true);
    try {
      const batch = writeBatch(db);
      toWrite.forEach((d) => {
        const v = val(d);
        const ref = doc(venueCol(groupId, venueId, "availability"), availabilityDocId(myStaff.id, d));
        // re-posting over a proposal resets status to "pending"; merge:true would leave the
        // proposal fields orphaned — clear them explicitly (mirrors Ops save()).
        const prior = existing(d);
        const clearProposal = prior?.status === "proposed"
          ? { proposedWindows: deleteField(), proposedBy: deleteField(), proposedAt: deleteField(), proposedAllDay: deleteField() }
          : {};
        batch.set(ref, {
          staffId: myStaff.id,
          staffName: myStaff.displayName || myStaff.name || "",
          venueId, venue: venueNameOf(venueId),
          date: d,
          available: !!v.available,
          allDay: v.allDay !== false, // default true (whole day) unless explicitly windowed
          windows: Array.isArray(v.windows) ? v.windows : [],
          note: v.note || "",
          status: "pending", // staff posting → pending; a manager accepts/rejects/proposes
          updatedBy: me?.uid || me?.id || "",
          ...clearProposal,
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
      {/* header: venue + save */}
      <div className="card" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>My availability — next 14 days</div>
          <div style={{ fontSize: 12, color: "var(--gray)" }}>Post when you can work; your manager reviews it. Suggested changes appear under the day.</div>
        </div>
        {vids.length > 1 ? (
          <select className="form-input" style={{ width: 200, marginLeft: "auto" }} value={venueId} onChange={(e) => pickVenue(e.target.value)} title="Venue for your availability">
            <option value="">Select venue…</option>
            {vids.map((id) => <option key={id} value={id}>{venueNameOf(id) || id}</option>)}
          </select>
        ) : (
          <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--gray)" }}>Venue: <strong>{venueNameOf(venueId) || "—"}</strong></span>
        )}
        <button className="btn btn-primary" onClick={save} disabled={busy || dirty.size === 0}>{busy ? "Saving…" : `Save${dirty.size ? ` (${dirty.size})` : ""}`}</button>
      </div>

      {vids.length > 1 && !venueId && (
        <div className="card" style={{ marginBottom: 8, fontSize: 12, color: "var(--gray)" }}>Pick a venue above to set your availability. Manager suggestions still show below.</div>
      )}

      {days.map((d) => {
        const v = val(d);
        const ex = existing(d);
        const p = proposedFor(d);
        const [bg, fg, lbl] = ex ? statusPill(ex.status || "pending") : [null, null, null];
        return (
          <div key={d} className="card" style={{ marginBottom: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <div style={{ width: 120, fontSize: 13, fontWeight: 700 }}>{dayLabel(d)}</div>
              <button className="btn btn-sm" disabled={!venueId} onClick={() => change(d, { available: true })} style={v.available ? { background: "#16a34a", color: "#fff", borderColor: "#16a34a" } : undefined}>Available</button>
              <button className="btn btn-sm" disabled={!venueId} onClick={() => change(d, { available: false })} style={!v.available ? { background: "#111827", color: "#fff", borderColor: "#111827" } : undefined}>Unavailable</button>
              {v.available && (
                <>
                  <button className="btn btn-sm" disabled={!venueId} onClick={() => change(d, { allDay: true })} style={v.allDay ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>All day</button>
                  <button className="btn btn-sm" disabled={!venueId} onClick={() => toWindows(d)} style={!v.allDay ? { background: "var(--red)", color: "#fff", borderColor: "var(--red)" } : undefined}>Set window</button>
                </>
              )}
              {dirty.has(d)
                ? <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: "#d97706" }}>Unsaved</span>
                : (ex && <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, background: bg, color: fg, borderRadius: 999, padding: "2px 8px" }}>{lbl}</span>)}
            </div>

            {v.available && !v.allDay && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {(v.windows || []).map((w, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select className="form-input" style={{ width: 120 }} value={w.start} onChange={(e) => setWindow(d, i, { start: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
                    <span style={{ color: "var(--gray)" }}>–</span>
                    <select className="form-input" style={{ width: 120 }} value={w.end} onChange={(e) => setWindow(d, i, { end: e.target.value })}>{TIMES.map((t) => <option key={t}>{t}</option>)}</select>
                    <button className="btn btn-sm" title="Remove window" onClick={() => removeWindow(d, i)}>✕</button>
                  </div>
                ))}
                <div><button className="btn btn-sm" onClick={() => addWindow(d)}>+ Add window</button></div>
              </div>
            )}
            {v.available && (
              <input className="form-input" style={{ marginTop: 8, maxWidth: 420 }} placeholder="Note (optional)" value={v.note || ""} onChange={(e) => change(d, { note: e.target.value })} />
            )}

            {/* proposal banner — outside the Available toggle so it shows even on unavailable days.
                Option B: proposals from ANY of my venues surface here; for multi-venue staff a
                prominent venue-tag pill (top row) says which venue the suggestion belongs to. */}
            {p && (
              <div style={{ marginTop: 8, background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 12px" }}>
                {vids.length > 1 && (
                  <div style={{ marginBottom: 4 }}>
                    <span style={{ background: "#92400e", color: "#fff", fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 999 }}>
                      📍 {venueNameOf(p.venueId) || p.venue || "your venue"}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
                  Manager suggested: {propLabel(p) || "—"}{p.proposedBy ? ` — ${p.proposedBy}` : ""}
                </div>
                <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>You posted: {postedLabel(p)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button className="btn btn-sm" style={{ background: "#16a34a", color: "#fff", borderColor: "#16a34a" }} disabled={busy} onClick={() => acceptProposal(d, p)}>Accept</button>
                  <button className="btn btn-sm" disabled={busy} onClick={() => declineProposal(d, p)}>Decline</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
