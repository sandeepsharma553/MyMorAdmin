import React, { useMemo, useState } from "react";
import { updateDoc, doc, collection, getDocs, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { initials, avatarColor, fmtHours } from "./rgUtils";
import { computeWorked, toMillis } from "./timeEntry";

/* Timesheet approval (Clock module, Job 1) — the web twin of Ops's
 * Availability → Manager tab. Approving is what puts worked time into the
 * accrual ledger, and until now it existed ONLY on the iPad: on the sandbox,
 * 6 of 11 finished entries had never been approved.
 *
 * The maths is NOT reimplemented here. computeWorked/toMillis come from
 * timeEntry.js, the byte-identical mirror of MyMorOps src/lib/timeEntry.js —
 * approving must produce exactly the number Ops would produce.
 *
 * Gate: can("availability", "approve") — the SAME key the rules check
 * (rgCanApproveAvailability), so the UI gate and the server gate can never
 * diverge. No new permission module. */

// Timestamp | Date | ISO → local "h:mm am" ("" when unresolved/absent)
const clockLabel = (v) => {
  const ms = toMillis(typeof v === "string" ? new Date(v) : v);
  return ms == null ? "" : new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

// Worked time for a MANAGER APPROVING it: minutes below the hour, hours at or
// above. fmtHours alone renders a 4-minute entry as "0.07h"; fmtLeaveMinutes
// does not fit either — it always renders hours (4m → "0.1h") and rounds 59m
// up to "1h", which on an approval screen reads as a full hour of work.
const workedLabel = (min) => (min < 60 ? `${Math.round(min)}m` : `${fmtHours(min / 60)}h`);

export default function TimesheetsPage() {
  const { groupId, timeEntries, staff, scopedStaff, matchVenue, can, showToast, me } = useRG();
  const canApprove = can("availability", "approve");
  const actorName = me?.displayName || me?.name || me?.email || "Manager";
  const [busyId, setBusyId] = useState("");

  // BOTH filters are needed, and neither is redundant:
  //   matchVenue  — respects the top-bar venue picker, and scopes a STAFF-tier
  //                 viewer to their own venues. It deliberately does NOT
  //                 restrict manager tier (myScope !== "staff" short-circuits).
  //   scopedIds   — that manager-tier gap: scopedStaff is who this caller may
  //                 act on (owner → everyone; manager/storeAdmin → staff at
  //                 THEIR venues). LeaveRequestsPage pairs the same two for the
  //                 same reason.
  const scopedIds = useMemo(() => new Set(scopedStaff.map((s) => s.id)), [scopedStaff]);
  const inScope = useMemo(
    () => (timeEntries || []).filter((e) => e && matchVenue(e) && scopedIds.has(e.staffId)),
    [timeEntries, matchVenue, scopedIds]
  );
  // newest first; businessDate is a local "YYYY-MM-DD" string, so a plain
  // string compare is the correct ordering. NO week boundary — the queue is
  // whatever is outstanding, and on the sandbox that spanned six weeks.
  const byDateDesc = (a, b) => String(b.businessDate || "").localeCompare(String(a.businessDate || ""));
  const pending = useMemo(() => inScope.filter((e) => e.status === "clocked_out" && e.approved !== true).sort(byDateDesc), [inScope]);
  const open = useMemo(() => inScope.filter((e) => e.status !== "clocked_out").sort(byDateDesc), [inScope]);

  // ── Preview figures, WITHOUT reading any breaks subcollection ──
  // A 20-row list must not fire 20 break reads on mount, and there is NO field
  // on the entry that says whether breaks exist (the full stored shape is
  // approved/approvedAt/approvedBy/awardCode/businessDate/clockInAt/clockOutAt/
  // createdAt/enteredBy/staffId/staffMeal*/staffName/status/unpaidBreakMinutes/
  // updatedAt/venue/venueId/workedMinutes — no breakCount, no hasBreaks). And
  // unpaidBreakMinutes is NOT a usable proxy: on live data, entries with 1 and
  // 2 break docs both carry 0, identical to entries with none.
  // So: prefer the STORED workedMinutes/unpaidBreakMinutes when present —
  // Ops's clock-out step 2 wrote those from RESOLVED breaks, so they are
  // break-aware and usually exactly what approval will write. When absent
  // (step 2 was skipped because clockOutAt was still an unresolved sentinel),
  // fall back to computeWorked(entry, []) — gross, breaks not yet counted —
  // and say so on the row. Either way the figure is PROVISIONAL: approval
  // reloads the breaks and recomputes, and that value is what gets stored.
  const preview = (e) => {
    const stored = Number(e.workedMinutes);
    if (Number.isFinite(stored) && "workedMinutes" in e) {
      return { workedMinutes: stored, unpaidBreakMinutes: Number(e.unpaidBreakMinutes) || 0, breaksCounted: true };
    }
    const c = computeWorked(e, []);
    return { ...c, breaksCounted: false };
  };

  // Approve = EXACTLY Ops's TimesheetRow.approve: reload this row's breaks,
  // recompute, then one updateDoc. Never trust the stored workedMinutes for
  // the WRITE — clock-out's best-effort persist can be skipped entirely, and
  // a member may have edited breaks after clock-out (rules only freeze breaks
  // once the entry is approved).
  const approve = async (e) => {
    if (!canApprove || busyId) return;
    setBusyId(e.id);
    try {
      const bSnap = await getDocs(collection(doc(venueCol(groupId, e.venueId, "timeEntries"), e.id), "breaks"));
      const breaks = bSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const snap = computeWorked(e, breaks);
      await updateDoc(doc(venueCol(groupId, e.venueId, "timeEntries"), e.id), {
        approved: true, approvedBy: actorName, approvedAt: serverTimestamp(),
        workedMinutes: snap.workedMinutes, unpaidBreakMinutes: snap.unpaidBreakMinutes, updatedAt: serverTimestamp(),
      });
      showToast(`Approved — ${workedLabel(snap.workedMinutes)} worked`);
    } catch (err) {
      // surface the real reason (permission-denied reads very differently from
      // a network failure) — never swallow it
      showToast(String(err?.message || err || "Could not approve"));
    } finally { setBusyId(""); }
  };

  const row = (e, isOpen) => {
    const st = staff.find((s) => s.id === e.staffId);
    const p = preview(e);
    const inLbl = clockLabel(e.clockInAt), outLbl = clockLabel(e.clockOutAt);
    return (
      <div key={`${e.venueId}-${e.id}`} className="leave-card" style={{ marginBottom: 0, opacity: isOpen ? 0.6 : 1 }}>
        <div className="leave-avatar" style={{ background: avatarColor(st || { venue: e.venue }) }}>{initials(st || { name: e.staffName })}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {e.staffName || "—"}
            {isOpen && <span className="pill pill-amber" style={{ marginLeft: 6 }}>in progress</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--gray)" }}>
            {e.venue || e.venueId} · {e.businessDate}
            {inLbl ? ` · ${inLbl}` : ""}{outLbl ? `–${outLbl}` : isOpen ? " · no clock-out" : ""}
          </div>
          {!isOpen && (
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <strong>{workedLabel(p.workedMinutes)}</strong> worked
              {p.breaksCounted
                ? <> · {p.unpaidBreakMinutes}m unpaid break</>
                : <span style={{ color: "var(--amber)" }}> · breaks not counted yet</span>}
              <span style={{ color: "var(--gray)" }}> · recomputed on approve</span>
            </div>
          )}
        </div>
        {isOpen ? null : canApprove ? (
          <button className="btn btn-sm btn-primary" disabled={!!busyId} onClick={() => approve(e)}>
            {busyId === e.id ? "…" : "Approve"}
          </button>
        ) : (
          <span className="pill pill-gray" title="You don't have approval rights">Awaiting manager</span>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div><span className="card-title">Awaiting approval</span><span className="card-sub">Clocked-out shifts — approving is what sends worked time to the leave ledger</span></div>
          <span className="pill pill-amber">{pending.length} to approve</span>
        </div>
        <div style={{ display: "grid", gap: 8 }}>
          {pending.map((e) => row(e, false))}
        </div>
        {pending.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>Nothing waiting — every clocked-out shift has been approved 🎉</div>}
      </div>

      {/* Still clocked in — shown so nobody has to wonder where a shift went, but
          there is no action here: closing a stuck entry is Job 2. */}
      {open.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Still clocked in</span><span className="card-sub">Not finished, so not approvable yet — an old one usually means someone forgot to clock out</span></div>
            <span className="pill pill-gray">{open.length}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {open.map((e) => row(e, true))}
          </div>
        </div>
      )}
    </>
  );
}
