import React, { useMemo, useState } from "react";
import { updateDoc, doc, collection, getDocs, writeBatch, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { db } from "../../firebase";
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
 * diverge. No new permission module.
 *
 * ── Job 2: CLOSING A STUCK ENTRY ────────────────────────────────────────────
 * Someone who forgets to clock out leaves an entry open forever. The kiosk
 * cannot fix it — Ops's openEntry lookup is bound to TODAY
 * (AvailabilityScreen.js:84, `e.businessDate === today`), so from the next day
 * the staff member can no longer reach their own entry. This page can: the
 * RGContext listener is unfiltered (RGContext.js:282, no `where`), so old open
 * entries stay visible here indefinitely. On the sandbox that is three entries
 * up to six weeks old; the live group produced its first on 6 Aug 2026.
 *
 * THE MANAGER TYPES THE CLOCK-OUT TIME. Never now(), never defaulted to now().
 * Closing the 26 June entry at "now" would be a 978-hour shift, and approval
 * would book floor(58734/13) = 75h of annual leave off one click. The 16-hour
 * cap is what forces the right behaviour: a six-week-old entry can only be
 * closed with a six-week-old time, because that is when the shift ended. */

// Timestamp | Date | ISO → local "h:mm am" ("" when unresolved/absent)
const clockLabel = (v) => {
  const ms = toMillis(typeof v === "string" ? new Date(v) : v);
  return ms == null ? "" : new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
const msTimeLabel = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const shortDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
const longDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long" });

// Worked time for a MANAGER APPROVING it: minutes below the hour, hours at or
// above. fmtHours alone renders a 4-minute entry as "0.07h"; fmtLeaveMinutes
// does not fit either — it always renders hours (4m → "0.1h") and rounds 59m
// up to "1h", which on an approval screen reads as a full hour of work.
const workedLabel = (min) => (min < 60 ? `${Math.round(min)}m` : `${fmtHours(min / 60)}h`);

// A span the manager is about to commit to. Below two days it is a shift, so
// "7h 20m" is the useful shape. At or above two days it is not a shift at all
// and the only thing that matters is the magnitude — "978 hours" is meant to
// look wrong, because it is.
const spanLabel = (min) => {
  const h = Math.floor(min / 60), m = min % 60;
  if (h >= 48) return `${h.toLocaleString()} hours`;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

// How long ago the clock-in was. NOTHING in the data distinguishes a live shift
// from an abandoned one — "clocked in 6 weeks ago" versus "clocked in 20
// minutes ago" IS the manager's judgement, so it goes on the row. Recomputed on
// render (no ticking timer): the list re-renders on every snapshot, and minute
// precision on a six-week-old entry is not the point.
const agoLabel = (ms) => {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d} day${d === 1 ? "" : "s"} ago`;
  return `${Math.floor(d / 7)} week${Math.floor(d / 7) === 1 ? "" : "s"} ago`;
};

// 16 hours. A long hospitality shift is 12h and a split double can reach 14h;
// the NES sets no hard daily cap (s.62 is "reasonable additional hours"), so
// the ceiling comes from award practice, not statute. 16h clears every real
// shift and still rejects the failure this whole feature exists to prevent.
const MAX_SPAN_MINUTES = 16 * 60;

const pad2 = (n) => String(n).padStart(2, "0");
const dateInputValue = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export default function TimesheetsPage() {
  const { groupId, timeEntries, staff, scopedStaff, matchVenue, can, showToast, me } = useRG();
  const canApprove = can("availability", "approve");
  const actorName = me?.displayName || me?.name || me?.email || "Manager";
  const [busyId, setBusyId] = useState("");
  const [closer, setCloser] = useState(null);   // { entry, openBreaks, inMs, date, time, confirm }
  const [closerBusy, setCloserBusy] = useState("");

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

  // ── Close a stuck entry ───────────────────────────────────────────────────
  // Opening the dialog reads THIS entry's breaks (one getDocs, on demand — the
  // list itself still reads none). We need them for two reasons: an open break
  // must be closed in the same batch or its endAt stays null and computeWorked
  // silently ignores it (timeEntry.js:96, `e > s`), and the typed clock-out has
  // to be validated against the last break start.
  const openCloser = async (e) => {
    if (!canApprove || closerBusy) return;
    setCloserBusy(e.id);
    try {
      const bSnap = await getDocs(collection(doc(venueCol(groupId, e.venueId, "timeEntries"), e.id), "breaks"));
      const openBreaks = bSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((b) => b.endAt == null);
      const inMs = toMillis(e.clockInAt);
      setCloser({
        entry: e,
        openBreaks,
        inMs,
        // The DATE is prefilled from the clock-in — it is a fact about the
        // entry, not a default of "now", and it is what stops a manager typing
        // today's date out of habit on a six-week-old row. The TIME is left
        // blank on purpose: that is the number only a human can supply.
        date: inMs != null ? dateInputValue(inMs) : (e.businessDate || ""),
        time: "",
        confirm: false,
      });
    } catch (err) {
      showToast(String(err?.message || err || "Could not read this entry's breaks"));
    } finally { setCloserBusy(""); }
  };

  // All validation is client-side and runs before any write. An invalid span is
  // never sent.
  const closerCheck = useMemo(() => {
    if (!closer) return null;
    const { entry, openBreaks, inMs, date, time } = closer;

    // Hard blocks — no typed value can rescue these, so the input is hidden.
    if (inMs == null) {
      return { blocked: "This entry's clock-in time never resolved, so no span can be measured against it. It has to be repaired directly before it can be closed." };
    }
    // The breaks rule reads get(parent).data.approved, and a MISSING key in
    // Firestore rules denies — for an approver too, since that arm has no
    // super/approver bypass (firestore.mymor-australia.rules:402). The parent
    // write would be allowed and the break write refused, and a writeBatch is
    // all-or-nothing, so the manager would get a bare permission error on a
    // dialog that looked fine. Every open entry on both groups carries
    // approved:false today, so this is defensive — but the failure it prevents
    // is unreadable, and the check costs nothing.
    if (!("approved" in entry) && openBreaks.length > 0) {
      return { blocked: `This entry has no "approved" field and ${openBreaks.length === 1 ? "an open break" : `${openBreaks.length} open breaks`}. The security rules refuse the break write in that state, and the close is all-or-nothing, so it would fail halfway. The entry needs approved set on it before it can be closed here.` };
    }

    if (!date || !time) return { pending: true };
    const outMs = new Date(`${date}T${time}`).getTime();
    if (!Number.isFinite(outMs)) return { error: "That is not a real date and time." };

    if (outMs <= inMs) {
      return { error: `That is before the clock-in at ${clockLabel(entry.clockInAt)} on ${longDate(inMs)}. A shift cannot end before it starts.` };
    }
    // An open break closed at a time BEFORE it began fails computeWorked's
    // `e > s` test and is silently dropped — the unpaid minutes vanish and the
    // worked total comes out too high. Reject instead.
    const lastBreakStart = openBreaks
      .map((b) => toMillis(b.startAt))
      .filter((v) => v != null)
      .sort((a, b) => b - a)[0];
    if (lastBreakStart != null && outMs <= lastBreakStart) {
      return { error: `That is before the break that started at ${msTimeLabel(lastBreakStart)}. Enter a time after the last break began.` };
    }

    const span = Math.round((outMs - inMs) / 60000);
    if (span > MAX_SPAN_MINUTES) {
      // Say WHY in terms of THIS entry. "Span too long" on a form that just
      // accepted a valid-looking datetime reads as a bug; naming the clock-in
      // it was measured against makes the mistake obvious.
      return { span, error: `That is ${spanLabel(span)} after the clock-in on ${longDate(inMs)}. Enter the time the shift actually ended.` };
    }
    return { span, outMs, ok: true };
  }, [closer]);

  // ONE writeBatch: every open break closed at the same instant as the parent,
  // so both land or neither does. Ops's own clock-out does these as two
  // sequential updateDocs (AvailabilityScreen.js:167,169) and can half-fail.
  // approved is NOT written — closing and approving are separate acts. The
  // entry drops into the queue above and approve recomputes from fresh breaks
  // like any other. workedMinutes is left unwritten too, so the row honestly
  // shows "breaks not counted yet" until an approver commits the real number.
  const doClose = async () => {
    if (!canApprove || !closer || !closerCheck?.ok || busyId) return;
    const { entry, openBreaks } = closer;
    setBusyId(entry.id);
    try {
      const ref = doc(venueCol(groupId, entry.venueId, "timeEntries"), entry.id);
      const bcol = collection(ref, "breaks");
      const outDate = new Date(closerCheck.outMs); // a REAL Date — never serverTimestamp()
      const batch = writeBatch(db);
      openBreaks.forEach((b) => batch.update(doc(bcol, b.id), { endAt: outDate }));
      batch.update(ref, {
        status: "clocked_out",
        clockOutAt: outDate,
        // clockOutAt is now a TYPED ESTIMATE, not a measured event. These three
        // are what let payroll — and a dispute six months from now — tell the
        // difference and name who made the call. closedBy/closedAt mirror the
        // existing approvedBy/approvedAt idiom.
        clockOutSource: "manager",
        closedBy: actorName,
        closedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      showToast(`Closed — ${spanLabel(closerCheck.span)}, now waiting for approval`);
      setCloser(null);
    } catch (err) {
      showToast(String(err?.message || err || "Could not close this entry"));
    } finally { setBusyId(""); }
  };

  const row = (e, isOpen) => {
    const st = staff.find((s) => s.id === e.staffId);
    const p = preview(e);
    const inLbl = clockLabel(e.clockInAt), outLbl = clockLabel(e.clockOutAt);
    const inMs = toMillis(e.clockInAt);
    return (
      <div key={`${e.venueId}-${e.id}`} className="leave-card" style={{ marginBottom: 0, opacity: isOpen ? 0.75 : 1 }}>
        <div className="leave-avatar" style={{ background: avatarColor(st || { venue: e.venue }) }}>{initials(st || { name: e.staffName })}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600 }}>
            {e.staffName || "—"}
            {isOpen && <span className="pill pill-amber" style={{ marginLeft: 6 }}>in progress</span>}
          </div>
          <div style={{ fontSize: 11, color: "var(--gray)" }}>
            {e.venue || e.venueId} · {e.businessDate}
            {!isOpen && inLbl ? ` · ${inLbl}` : ""}{!isOpen && outLbl ? `–${outLbl}` : ""}
          </div>
          {isOpen ? (
            // The clock-in, prominently. A manager closing someone who is
            // actually working stops them clocking out normally afterwards,
            // and the age is the only signal that separates the two cases.
            <div style={{ fontSize: 11, marginTop: 2 }}>
              {inMs != null
                ? <>Clocked in <strong>{inLbl}</strong> · <strong>{agoLabel(inMs)}</strong><span style={{ color: "var(--gray)" }}> · no clock-out</span></>
                : <span style={{ color: "var(--amber)" }}>Clock-in time never resolved · no clock-out</span>}
            </div>
          ) : (
            <div style={{ fontSize: 11, marginTop: 2 }}>
              <strong>{workedLabel(p.workedMinutes)}</strong> worked
              {p.breaksCounted
                ? <> · {p.unpaidBreakMinutes}m unpaid break</>
                : <span style={{ color: "var(--amber)" }}> · breaks not counted yet</span>}
              <span style={{ color: "var(--gray)" }}> · recomputed on approve</span>
            </div>
          )}
        </div>
        {isOpen ? (
          canApprove ? (
            <button className="btn btn-sm" disabled={!!closerBusy || !!busyId} onClick={() => openCloser(e)}>
              {closerBusy === e.id ? "…" : "Close"}
            </button>
          ) : null
        ) : canApprove ? (
          <button className="btn btn-sm btn-primary" disabled={!!busyId} onClick={() => approve(e)}>
            {busyId === e.id ? "…" : "Approve"}
          </button>
        ) : (
          <span className="pill pill-gray" title="You don't have approval rights">Awaiting manager</span>
        )}
      </div>
    );
  };

  const closerName = closer?.entry?.staffName || "this person";
  const breakNote = closer && closer.openBreaks.length > 0
    ? (closer.openBreaks.length === 1
        ? "The open break will be closed at the same time."
        : `All ${closer.openBreaks.length} open breaks will be closed at the same time.`)
    : "";

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

      {/* Still clocked in — a fresh one is someone at work right now; an old one
          is a forgotten clock-out that nothing else in the system can fix. */}
      {open.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Still clocked in</span><span className="card-sub">Not finished, so not approvable yet — check how long ago before closing one</span></div>
            <span className="pill pill-gray">{open.length}</span>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {open.map((e) => row(e, true))}
          </div>
        </div>
      )}

      {closer && (
        <div className="rg-modal-overlay" onClick={(ev) => ev.target === ev.currentTarget && !busyId && setCloser(null)}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head">
              <span className="modal-title">Close {closerName}'s entry</span>
              <button className="modal-close" disabled={!!busyId} onClick={() => setCloser(null)}>✕</button>
            </div>

            <div style={{ fontSize: 12, marginBottom: 12 }}>
              {closer.inMs != null ? (
                <>Clocked in <strong>{clockLabel(closer.entry.clockInAt)}</strong> on <strong>{longDate(closer.inMs)}</strong> — {agoLabel(closer.inMs)}.</>
              ) : (
                <>{closer.entry.venue || closer.entry.venueId} · {closer.entry.businessDate}</>
              )}
            </div>

            {closerCheck?.blocked ? (
              <div style={{ fontSize: 12, color: "var(--amber)", marginBottom: 12 }}>{closerCheck.blocked}</div>
            ) : !closer.confirm ? (
              <>
                <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 10 }}>
                  Enter the time this shift actually ended. There is no default — the current time is
                  almost never the right answer for an entry that was left open.
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Date</label>
                    <input type="date" className="form-input" value={closer.date}
                      onChange={(ev) => setCloser((p) => ({ ...p, date: ev.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label className="form-label" style={{ fontSize: 11 }}>Time</label>
                    <input type="time" className="form-input" value={closer.time}
                      onChange={(ev) => setCloser((p) => ({ ...p, time: ev.target.value }))} />
                  </div>
                </div>

                <div style={{ fontSize: 12, marginTop: 10, minHeight: 34 }}>
                  {closerCheck?.error
                    ? <span style={{ color: "var(--amber)" }}>{closerCheck.error}</span>
                    : closerCheck?.ok
                      ? <>That is <strong>{spanLabel(closerCheck.span)}</strong> of shift.{breakNote ? ` ${breakNote}` : ""}</>
                      : <span style={{ color: "var(--gray)" }}>Pick a date and time to see the span.</span>}
                </div>

                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button className="btn" onClick={() => setCloser(null)}>Cancel</button>
                  <button className="btn btn-primary" disabled={!closerCheck?.ok}
                    onClick={() => setCloser((p) => ({ ...p, confirm: true }))}>Close entry…</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 12, marginBottom: 12 }}>
                  Close {closerName}'s entry from <strong>{shortDate(closer.inMs)}</strong>? Clocked in{" "}
                  <strong>{clockLabel(closer.entry.clockInAt)}</strong>, closing at{" "}
                  <strong>{msTimeLabel(closerCheck.outMs)}</strong> — <strong>{spanLabel(closerCheck.span)}</strong>.
                  {breakNote ? ` ${breakNote}` : ""}{" "}
                  <span style={{ color: "var(--amber)" }}>If they are still working they will not be able to clock out.</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 12 }}>
                  This records that you closed it by hand. It does not approve the entry — it moves to
                  the approval queue, where the worked time is recomputed before anything reaches the leave ledger.
                </div>
                <div className="btn-row">
                  <button className="btn" disabled={!!busyId} onClick={() => setCloser((p) => ({ ...p, confirm: false }))}>Back</button>
                  <button className="btn btn-primary" disabled={!!busyId} onClick={doClose}>
                    {busyId === closer.entry.id ? "Closing…" : "Yes, close it"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
