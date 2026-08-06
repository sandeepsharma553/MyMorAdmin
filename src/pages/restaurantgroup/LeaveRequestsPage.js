import React, { useEffect, useMemo, useRef, useState } from "react";
import { updateDoc, getDoc, doc, writeBatch, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage, db } from "../../firebase";
import { useRG } from "./RGContext";
import { venueCol, leaveSummaryDoc, leaveAccrualConfigDoc, leaveRequestPrivateDoc } from "../../utils/restaurantGroupPaths";
import { fullName, leaveTypePill, leaveStatusPill, leaveLabel, avatarColor, initials, downloadCsv, mondayFromWeekKey, localDateKey, fmtLeaveMinutes, shiftDateStr, shiftHours } from "./rgUtils";
import { resolveLeaveTypes, leaveTypeIsPaid, leaveTypeNeedsProof } from "./staffStructureUtils";
import { sendNotification } from "./notify";

// Leave TYPES are owner-editable as of Phase 4a — resolveLeaveTypes(group) (Settings →
// Leave types card), with a PERMANENT "Other" appended by the chooser that stores
// type:"Other" + typeOther:"<free text>". The old hardcoded TYPES const is gone.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtRange = (s, e) => {
  if (!s) return "";
  const sd = new Date(s), ed = e ? new Date(e) : null;
  const a = `${sd.getDate()} ${MONTHS[sd.getMonth()]}`;
  if (!ed || s === e) return a;
  return `${sd.getDate()}–${ed.getDate()} ${MONTHS[ed.getMonth()]}`;
};
const daysBetween = (s, e) => {
  if (!s) return 1;
  if (!e || s === e) return 1;
  return Math.max(1, Math.round((new Date(e) - new Date(s)) / 86400000) + 1);
};

// ── Balance-check estimate (Phase 5 Job 3) ── ⚠ KEEP the three helpers below
// byte-identical to Ops LeaveRequestsScreen.js (drift-guard convention), and
// KEEP them a MIRROR of the SERVER's basis code in MyMorFunction/
// rgLeaveAccrual.js (datesInRange / rosterDeductionMinutes /
// contractedDeductionMinutes / resolveDeductionMinutes / leaveBucketFor) — if
// the server changes, this must change with it or the dialog lies.
// Basis order, exactly the server's: 1. roster ∩ range (paid minutes = gross −
// stored breakMins, shifts dated inside startDate..endDate); 2. contracted
// proration (trunc(weekly×60/5) per Mon–Fri day in range); 3. NOTHING — the
// server's third step is an approver-entered deductMinutes no UI writes yet,
// and it returns null rather than invent a basis (resolveDeductionMinutes).
// Same refusal here: null → the balance check is SKIPPED entirely; an invented
// number in a warning dialog is worse than no dialog. ESTIMATE only — the
// ledger's real deduction is computed server-side at approval.
const leaveDaysInRange = (startDate, endDate) => {
  const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "").trim()); if (!m) return null; const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])); return isNaN(d.getTime()) ? null : d; };
  const s = parse(startDate); const e = parse(endDate || startDate) || s;
  if (!s || !e || e < s) return [];
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const out = []; const d = new Date(s);
  while (d <= e && out.length < 400) { out.push(key(d)); d.setDate(d.getDate() + 1); }
  return out;
};
const estimateLeaveMinutes = (l, staffRec, shifts) => {
  const days = leaveDaysInRange(l.startDate, l.endDate);
  if (!days.length) return null;
  const daySet = new Set(days);
  let roster = 0;
  for (const sh of (shifts || [])) {
    if (!sh || sh.staffId !== l.staffId) continue;
    const dk = shiftDateStr(sh.weekKey, sh.day);
    if (!dk || !daySet.has(dk)) continue;
    roster += Math.max(0, Math.round(shiftHours(sh) * 60) - (Number(sh.breakMins) || 0));
  }
  if (roster > 0) return { minutes: roster, basis: "roster" };
  const weekly = Number(staffRec?.contractedWeeklyHours);
  if (Number.isFinite(weekly) && weekly > 0) {
    const perDay = Math.trunc((weekly * 60) / 5);
    let weekdays = 0;
    for (const dk of days) { const [y, m, dd] = dk.split("-").map(Number); const wd = new Date(y, m - 1, dd).getDay(); if (wd >= 1 && wd <= 5) weekdays++; }
    if (weekdays * perDay > 0) return { minutes: weekdays * perDay, basis: "contracted" };
  }
  return null; // no reliable basis — mirror the server's refusal to guess
};
// Bucket mirror of the server's leaveBucketFor: paid === false ALWAYS wins →
// unpaid; else the owner's bucketMap; unmapped paid types fall to other-paid.
const leaveBucketOf = (l, bucketMap) => (l.paid === false ? "unpaid" : ((bucketMap || {})[l.type] || "other-paid"));

export default function LeaveRequestsPage() {
  const { groupId, group, staff, venues, leave, shifts, selectedVenue, matchVenue, showToast, can, me, myStaff, myScope, scopedStaff } = useRG();
  // Approving others' requests needs the `approve` permission. The owner/superadmin tier is
  // full-access and ALWAYS approves (even if their stored permissions predate the approve
  // level). Submitting stays scoped (see submit() — your own team only).
  const canApprove = can("leave", "approve") || myScope === "owner" || me?.type === "superadmin";
  const isEmployee = myScope === "staff";
  const actorName = me?.displayName || me?.name || me?.email || "Manager";
  const leaveTypes = resolveLeaveTypes(group);
  const typeOptions = [...leaveTypes, "Other"]; // "Other" is permanent — never in group.leaveTypes
  const [form, setForm] = useState({ venueId: "", staffId: isEmployee ? (myStaff?.id || "") : "", type: "", typeOther: "", start: "", end: "", reason: "" });
  const setF = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  // proof screenshot (30 Jul 2026 list) — required for types flagged in Settings
  // (group.leaveTypeProof). Uploaded on submit, URL stored on the request doc.
  const [proofFile, setProofFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const proofRef = useRef(null);
  const needsProof = leaveTypeNeedsProof(group, form.type);
  // paid/unpaid for a request row: the stored flag when present, else derived from the
  // type's Settings default (legacy rows have no `paid` field)
  const paidOf = (l) => (typeof l.paid === "boolean" ? l.paid : leaveTypeIsPaid(group, l.type));
  // venue → staff: staff options narrow to the chosen venue (managers/owners submit for their team)
  const venueStaffOptions = useMemo(
    () => scopedStaff.filter((s) => !form.venueId || (s.venueIds || []).includes(form.venueId) || s.venueId === form.venueId),
    [scopedStaff, form.venueId]
  );

  // ── Private details (Phase 6 Job 4b) ── reason + proof live in
  // leaveRequests/{id}/private/details. LAZY: fetched only when a card's
  // "View reason & proof" is pressed — never bulk-loaded for a list (that
  // would be 50 reads to show a page). Denied/failed → render NOTHING for
  // those fields (acks posture; plain managers without leave:approve are
  // denied by design). Legacy pre-migration rows still carry the fields on
  // the parent and render directly with no fetch.
  const [privDetails, setPrivDetails] = useState({});
  const loadPrivate = async (l) => {
    if (privDetails[l.id]) return;
    setPrivDetails((p) => ({ ...p, [l.id]: { loading: true } }));
    try {
      const d = await getDoc(leaveRequestPrivateDoc(groupId, l.venueId, l.id));
      setPrivDetails((p) => ({ ...p, [l.id]: { loaded: true, ...(d.exists() ? (d.data() || {}) : {}) } }));
    } catch { setPrivDetails((p) => ({ ...p, [l.id]: { denied: true } })); }
  };

  // who this user is allowed to submit-for / see leave of
  const scopedIds = useMemo(() => new Set(scopedStaff.map((s) => s.id)), [scopedStaff]);
  const scoped = useMemo(
    () => leave.filter(matchVenue).filter((l) => myScope === "owner" || scopedIds.has(l.staffId)),
    [leave, matchVenue, myScope, scopedIds]
  );
  const pending = scoped.filter((l) => l.status === "Pending");
  const history = scoped.filter((l) => l.status !== "Pending");
  // ── history grouped into per-type SECTIONS (Phase 4c) ── ONE "Other" section (custom
  // texts show per-row via leaveLabel); rows inside keep the existing array order — there
  // was no explicit sort before (context fan-out order), and that is preserved.
  const historySections = useMemo(() => {
    const map = new Map();
    history.forEach((l) => {
      const key = l.type === "Other" ? "Other" : (l.type || "—");
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    });
    return [...map.entries()];
  }, [history]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Issue 4: approver actions on APPROVED history rows ──────────────────────
  // Both gate on the SAME canApprove the Approve/Decline buttons use — matching
  // the live rule (rgCanApproveLeave) exactly, so no denied writes.
  // Cancel = terminal "Cancelled" (never back to Pending — the record shows what
  // happened); every functional reader tests status === "Approved" explicitly
  // (planner block/saveShift guard/weekLeave/calendar — verified), so the roster
  // block clears with no reader changes.
  const cancelLeave = async (l) => {
    if (!canApprove) return;
    if (!window.confirm(`Cancel ${l.staffName}'s approved ${leaveLabel(l)} (${l.dates})? The roster block is removed.`)) return;
    try {
      await updateDoc(doc(venueCol(groupId, l.venueId, "leaveRequests"), l.id), { status: "Cancelled", approvedBy: actorName, decidedAt: serverTimestamp() });
      showToast("Leave cancelled — no longer blocks the roster");
      sendNotification(groupId, { to: l.staffId, type: "leave", title: "Leave cancelled", body: `${leaveLabel(l)} ${l.dates} — cancelled by ${actorName}`, venueId: l.venueId, by: actorName });
    } catch { showToast("Could not cancel request"); }
  };
  // Edit dates on an Approved request: stays Approved (the approver is editing —
  // no re-approval loop). editedBy/editedAt are NEW fields so the original
  // approval record (approvedBy/decidedAt) survives intact.
  const [editLeave, setEditLeave] = useState(null); // { l, start, end }
  const dateOfShift = (sh) => { if (!sh.weekKey) return ""; const d = mondayFromWeekKey(sh.weekKey); d.setDate(d.getDate() + (sh.day || 0)); return localDateKey(d); };
  const saveLeaveEdit = async () => {
    if (!canApprove || !editLeave) return;
    const { l } = editLeave;
    const s = editLeave.start, e = editLeave.end || editLeave.start;
    if (!s) return showToast("Choose a start date");
    if (e < s) return showToast("End date is before the start date");
    // roster warning — same shifts array the planner uses; warn, never block
    const n = shifts.filter((sh) => sh.staffId === l.staffId && (() => { const k = dateOfShift(sh); return k && s <= k && k <= e; })()).length;
    if (n > 0 && !window.confirm(`${n} shift${n === 1 ? "" : "s"} exist on the new dates for ${l.staffName}. Save anyway? (The planner will show the leave block over them.)`)) return;
    try {
      await updateDoc(doc(venueCol(groupId, l.venueId, "leaveRequests"), l.id), {
        startDate: s, endDate: e,
        // derived fields recomputed — they must describe the NEW range
        dates: fmtRange(s, e), days: daysBetween(s, e),
        editedBy: actorName, editedAt: serverTimestamp(),
      });
      showToast("Leave dates updated — still approved");
      sendNotification(groupId, { to: l.staffId, type: "leave", title: "Leave dates changed", body: `${leaveLabel(l)} now ${fmtRange(s, e)} — updated by ${actorName}`, venueId: l.venueId, by: actorName });
      setEditLeave(null);
    } catch { showToast("Could not update dates"); }
  };

  const decide = async (l, status) => {
    try {
      await updateDoc(doc(venueCol(groupId, l.venueId, "leaveRequests"), l.id), { status, approvedBy: actorName, decidedAt: serverTimestamp() });
      showToast(status === "Approved" ? "Leave approved — blocked in shift planner" : "Leave declined — staff notified");
      sendNotification(groupId, { to: l.staffId, type: "leave", title: `Leave ${status.toLowerCase()}`, body: `${leaveLabel(l)} ${l.dates} — ${status.toLowerCase()} by ${actorName}`, venueId: l.venueId, by: actorName });
    } catch { showToast("Could not update request"); }
  };

  // ── Balance check before approval (Phase 5 Job 3) ── WARNS, never blocks: the
  // entitlement outside MyMor may be larger than what MyMor has tracked, and a
  // manager may have a legitimate reason. SKIP the check entirely (approve
  // straight through, existing behaviour untouched) on ANY of: accrual not
  // enabled · legacy request without a boolean paid flag (the server excludes
  // those from the ledger) · bucket is unpaid/other-paid (neither draws on
  // annual/personal) · unmapped type or missing config (falls to other-paid) ·
  // no summary doc · any read fails · no reliable duration basis · balance
  // sufficient. Only a genuine "this will go negative" reaches the dialog.
  const [balWarn, setBalWarn] = useState(null); // {l, bucket, balanceMinutes, estMinutes, basis}

  // ── Inline deduction estimate on every pending card ──────────────────────
  // The balance check above only speaks when the balance FALLS SHORT. Every
  // other approval — the overwhelming majority once balances build — commits a
  // number the approver never saw. That is how a 960-vs-288 disagreement lived
  // in the ledger instead of on screen. This says the same thing BEFORE the
  // click, on every card, and changes nothing about what the click does.
  //
  // ONE page-level read of the config, into state — never per card. It is
  // display-only and deliberately NOT shared with approveWithBalanceCheck:
  // that one re-reads at click time because a stale page-level read must never
  // gate a write. null = still loading OR the read failed → render NO line at
  // all (silent, like the acks posture); a wrong estimate is worse than none.
  // An absent config doc is NOT a failure — {} is correct, and leaveBucketOf
  // then falls every paid type to other-paid exactly as the server does.
  //
  // TWIN — identical logic and wording in MyMorOps
  // src/screens/LeaveRequestsScreen.js (deductionNote). Keep them in step.
  const [laBucketMap, setLaBucketMap] = useState(null);
  useEffect(() => {
    if (!groupId) { setLaBucketMap(null); return undefined; }
    let alive = true;
    getDoc(leaveAccrualConfigDoc(groupId))
      .then((s) => { if (alive) setLaBucketMap(s.exists() ? ((s.data() || {}).bucketMap || {}) : {}); })
      .catch(() => { if (alive) setLaBucketMap(null); });
    return () => { alive = false; };
  }, [groupId]);

  // What the server will actually book, in the order the server decides it.
  // Every branch that books NOTHING says so in plain words — the silent-nothing
  // cases are the whole point, not an afterthought.
  const deductionNote = (l, st) => {
    if (laBucketMap === null) return null;                       // not loaded / read failed → say nothing
    if (group?.leaveAccrualEnabled !== true) return "Leave accrual is off — nothing will be deducted";
    // legacy rows carry no boolean paid flag; the server excludes them entirely
    // (planLeaveTransition → review "legacy-paid"). Its OWN string: this is a
    // broken record needing repair, not a rule being applied, and the review
    // card names it the same way ("no paid/unpaid flag").
    if (typeof l.paid !== "boolean") return "No paid/unpaid flag — nothing will be deducted";
    // ACCRUAL FLOOR — the stored date is the LAST DAY THAT DOES NOT COUNT
    // (comparison is `date <= asOfDate`), so a leave ENDING on it books nothing.
    // A leave that STRADDLES it books nothing either — the server refuses to
    // part-book (skipped "straddles-asOfDate"), which is its own sentence
    // because "before accrual started" would be untrue of the later days.
    const floor = String(group?.leaveAccrualStartDate || "");
    const start = String(l.startDate || ""), end = String(l.endDate || l.startDate || "");
    if (floor && end && end <= floor) return "Before accrual started — nothing will be deducted";
    if (floor && start && start <= floor) return "Starts before accrual began — nothing will be deducted";
    const bucket = leaveBucketOf(l, laBucketMap);
    if (bucket === "unpaid") return "Unpaid — nothing will be deducted";
    const est = estimateLeaveMinutes(l, st, shifts);
    if (!est) return "No roster or contracted hours — nothing will be deducted";
    // other-paid deductions are RECORD-ONLY (summaryDeltasFor skips any bucket
    // outside annual/personal). The ledger gets the row; no balance moves — and
    // for an accruing staff member the companion accrual actually raises it.
    if (bucket === "other-paid") return `About ${fmtLeaveMinutes(est.minutes)} — recorded, but no balance is deducted`;
    return `About ${fmtLeaveMinutes(est.minutes)}, based on their ${est.basis === "roster" ? "rostered shifts" : "contracted hours"}`;
  };
  const leaveAccruedSinceLabel = () => {
    // stored start date is the LAST DAY THAT DOES NOT COUNT → display + 1 day
    const [y, m, d] = String(group?.leaveAccrualStartDate || "").split("-").map(Number);
    return y && m && d ? new Date(y, m - 1, d + 1).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
  };
  const approveWithBalanceCheck = async (l) => {
    try {
      if (group?.leaveAccrualEnabled !== true) return decide(l, "Approved");
      if (typeof l.paid !== "boolean") return decide(l, "Approved"); // legacy — server books nothing for these
      const [cfgSnap, sumSnap] = await Promise.all([
        getDoc(leaveAccrualConfigDoc(groupId)),
        getDoc(leaveSummaryDoc(groupId, l.staffId)),
      ]);
      if (!sumSnap.exists()) return decide(l, "Approved"); // no summary yet — normal, not an error
      const bucket = leaveBucketOf(l, cfgSnap.exists() ? (cfgSnap.data() || {}).bucketMap : undefined);
      if (bucket !== "annual" && bucket !== "personal") return decide(l, "Approved");
      const est = estimateLeaveMinutes(l, staff.find((s) => s.id === l.staffId), shifts);
      if (!est) return decide(l, "Approved"); // no roster and no contracted hours — never invent a number
      const balanceMinutes = Number(sumSnap.data()?.[bucket]?.balanceMinutes) || 0;
      if (balanceMinutes >= est.minutes) return decide(l, "Approved");
      setBalWarn({ l, bucket, balanceMinutes, estMinutes: est.minutes, basis: est.basis });
    } catch { decide(l, "Approved"); } // a failed lookup must never block approval
  };

  const submit = async () => {
    const staffId = isEmployee ? (myStaff?.id || "") : form.staffId;
    if (!staffId) return showToast("Select a staff member");
    if (!scopedIds.has(staffId)) return showToast("You can only submit leave for your own team");
    if (!form.type) return showToast("Pick a leave type");
    if (form.type === "Other" && !form.typeOther.trim()) return showToast('Describe the leave type for "Other"');
    if (!form.start) return showToast("Choose a start date");
    const st = staff.find((s) => s.id === staffId);
    // file the request under a venue the staff member actually belongs to; derive the
    // venue NAME from the same id so the doc location and the displayed name never disagree.
    const stVenues = st?.venueIds?.length ? st.venueIds : (st?.venueId ? [st.venueId] : []);
    // prefer the venue chosen in the form, else the selected venue, else the staff's first venue
    const vid = (form.venueId && stVenues.includes(form.venueId)) ? form.venueId
      : (selectedVenue !== "all" && stVenues.includes(selectedVenue)) ? selectedVenue : stVenues[0];
    if (!vid) return showToast("This staff member has no venue assigned");
    if (needsProof && !proofFile) return showToast(`${form.type} needs a screenshot/photo attached — see Settings → Leave types`);
    const venueName = venues.find((v) => v.id === vid)?.name || st?.venueNames?.[0] || "";
    setSubmitting(true);
    try {
      // proof upload FIRST — a failed upload must fail the whole submission, never
      // file a proof-required request without its proof
      let proofUrl = "", proofName = "";
      if (proofFile) {
        const r = storageRef(storage, `rgUploads/${groupId}/leaveProofs/${staffId}/${Date.now()}_${proofFile.name.replace(/[^\w.\-]/g, "_")}`);
        await uploadBytes(r, proofFile);
        proofUrl = await getDownloadURL(r);
        proofName = proofFile.name;
      }
      // ── Field split (Phase 6 Job 4b) ── reason + the proof pointer go to the
      // PRIVATE subcollection (approvers + the requester only); the parent stays
      // member-readable and carries only hasProof (a boolean leaks nothing — it
      // drives the history paperclip). ONE atomic writeBatch: both docs land or
      // neither, so a request can never exist without its reason. The private
      // create rule validates the staffId copy against the parent via getAfter
      // (which sees batch state). doc() mints the parent id without writing.
      const reqRef = doc(venueCol(groupId, vid, "leaveRequests"));
      const batch = writeBatch(db);
      batch.set(reqRef, {
        staffId, staffName: st?.displayName || fullName(st),
        venue: venueName, venueId: vid, area: st?.area || (st?.role || "").split(" — ")[0] || "",
        type: form.type, typeOther: form.type === "Other" ? form.typeOther.trim() : "",
        dates: fmtRange(form.start, form.end), days: daysBetween(form.start, form.end),
        startDate: form.start, endDate: form.end || form.start,
        // paid/unpaid snapshot at submit time (Settings default for the type)
        paid: leaveTypeIsPaid(group, form.type), hasProof: !!proofUrl,
        status: "Pending", approvedBy: "", createdAt: serverTimestamp(),
      });
      batch.set(leaveRequestPrivateDoc(groupId, vid, reqRef.id), {
        staffId, reason: form.reason.trim(), proofUrl, proofName, createdAt: serverTimestamp(),
      });
      await batch.commit();
      showToast("Leave request submitted — manager notified");
      sendNotification(groupId, { to: "managers", type: "leave", title: "New leave request", body: `${st?.displayName || fullName(st)} · ${leaveLabel({ type: form.type, typeOther: form.typeOther })} ${fmtRange(form.start, form.end)}`, venueId: vid, by: st?.displayName || fullName(st) });
      setForm({ venueId: "", staffId: "", type: "", typeOther: "", start: "", end: "", reason: "" });
      setProofFile(null); if (proofRef.current) proofRef.current.value = "";
    } catch { showToast("Could not submit request"); }
    finally { setSubmitting(false); }
  };

  const bg = (type) => {
    const p = leaveTypePill(type);
    return p === "pill-blue" ? "var(--blue-light)" : p === "pill-purple" ? "var(--purple-light)" : "var(--amber-light)";
  };

  return (
    <>
      <div className="grid-2" style={{ marginBottom: 16 }}>
        {/* Pending */}
        <div className="card">
          <div className="card-head">
            <div><span className="card-title">Pending requests</span><span className="card-sub">Requires your approval</span></div>
            <span className="pill pill-amber">{pending.length} pending</span>
          </div>
          {pending.map((l) => {
            const st = staff.find((s) => s.id === l.staffId);
            return (
              <div key={l.id} className="leave-card" style={{ borderColor: bg(l.type), background: bg(l.type) }}>
                <div className="leave-avatar" style={{ background: avatarColor(st || { venue: l.venue }) }}>{initials(st || { name: l.staffName })}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{l.staffName} <span className={`pill ${leaveTypePill(l.type)}`} style={{ marginLeft: 4 }}>{leaveLabel(l)}</span> <span className={`pill ${paidOf(l) ? "pill-green" : "pill-amber"}`} style={{ marginLeft: 4 }}>{paidOf(l) ? "Paid" : "Unpaid"}</span></div>
                  <div style={{ fontSize: 11, color: "var(--gray)" }}>{l.venue} · {l.area} · {l.dates} ({l.days} {l.days === 1 ? "day" : "days"})</div>
                  {(() => {
                    // "About" on every figure — the server recomputes at approval.
                    const note = deductionNote(l, st);
                    return note ? <div style={{ fontSize: 11, marginTop: 2, color: /nothing will be deducted|no balance is deducted/.test(note) ? "var(--amber)" : "inherit" }}>{note}</div> : null;
                  })()}
                  {(() => {
                    // legacy rows carry the fields on the parent; new rows lazy-load
                    const pv = privDetails[l.id];
                    const reason = l.reason !== undefined ? l.reason : (pv?.loaded ? pv.reason : undefined);
                    const proofUrl = l.proofUrl || (pv?.loaded ? pv.proofUrl : "");
                    const proofName = l.proofName || (pv?.loaded ? pv.proofName : "");
                    return (
                      <>
                        {reason ? <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>"{reason}"</div> : null}
                        {proofUrl ? <div style={{ fontSize: 11, marginTop: 2 }}><a href={proofUrl} target="_blank" rel="noreferrer">📎 {proofName || "View attachment"}</a></div> : null}
                        {l.reason === undefined && !pv && (
                          <button className="btn btn-sm" style={{ marginTop: 4 }} onClick={() => loadPrivate(l)}>View reason &amp; proof</button>
                        )}
                        {pv?.loaded && !reason && !proofUrl ? <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 2 }}>No reason given.</div> : null}
                        {/* pv.denied → nothing at all (acks posture) */}
                      </>
                    );
                  })()}
                </div>
                {canApprove ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => approveWithBalanceCheck(l)}>Approve</button>
                    <button className="btn btn-sm btn-danger" onClick={() => decide(l, "Declined")}>Decline</button>
                  </div>
                ) : (
                  <span className="pill pill-gray" title="You don't have approval rights">Awaiting manager</span>
                )}
              </div>
            );
          })}
          {pending.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No pending requests 🎉</div>}
        </div>

        {/* Submit */}
        <div className="card">
          <div className="card-head"><span className="card-title">Submit leave request</span></div>
          {!isEmployee && (
            <div className="form-group">
              <label className="form-label">Venue</label>
              <select className="form-input" value={form.venueId} onChange={(e) => setForm((p) => ({ ...p, venueId: e.target.value, staffId: "" }))}>
                <option value="">All my venues</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Staff member {isEmployee && <span style={{ color: "var(--gray)", fontWeight: 400 }}>(you)</span>}</label>
            {isEmployee ? (
              <input className="form-input" value={myStaff ? fullName(myStaff) : "—"} disabled style={{ background: "var(--gray-light)", color: "var(--gray)" }} />
            ) : (
              <select className="form-input" value={form.staffId} onChange={setF("staffId")}>
                <option value="">{form.venueId ? "Select staff in this venue..." : "Select staff member..."}</option>
                {venueStaffOptions.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
              </select>
            )}
            {myScope === "manager" && <div style={{ fontSize: 10, color: "var(--gray)", marginTop: 4 }}>You can submit for staff at your venue(s).</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Leave type</label>
            <select className="form-input" value={form.type} onChange={setF("type")}>
              <option value="">Select type…</option>
              {typeOptions.map((t) => <option key={t}>{t}</option>)}
            </select>
            {form.type === "Other" && (
              <input className="form-input" style={{ marginTop: 6 }} value={form.typeOther} onChange={setF("typeOther")} placeholder="Describe the leave type (required)" />
            )}
            {form.type && (
              <div style={{ fontSize: 11, marginTop: 6 }}>
                <span className={`pill ${leaveTypeIsPaid(group, form.type) ? "pill-green" : "pill-amber"}`}>{leaveTypeIsPaid(group, form.type) ? "Paid leave" : "Unpaid leave"}</span>
                {needsProof && <span className="pill pill-blue" style={{ marginLeft: 6 }}>Screenshot required</span>}
              </div>
            )}
          </div>
          {/* proof screenshot — required for Settings-flagged types, hidden otherwise */}
          {needsProof && (
            <div className="form-group">
              <label className="form-label">Screenshot / photo (required for {form.type})</label>
              <input ref={proofRef} type="file" accept="image/*,.pdf" className="form-input" onChange={(e) => setProofFile(e.target.files?.[0] || null)} />
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={form.start} onChange={setF("start")} /></div>
            <div className="form-group"><label className="form-label">End date</label><input type="date" className="form-input" value={form.end} onChange={setF("end")} /></div>
          </div>
          <div className="form-group"><label className="form-label">Reason</label><textarea className="form-input" rows={3} value={form.reason} onChange={setF("reason")} placeholder="Brief reason for leave request..." /></div>
          <div className="btn-row"><button className="btn btn-primary" disabled={submitting} onClick={submit}>{submitting ? "Submitting…" : "Submit request"}</button></div>
        </div>
      </div>

      {/* History */}
      <div className="card">
        <div className="card-head"><span className="card-title">Leave history</span><button className="btn btn-sm" onClick={() => { downloadCsv("leave-history.csv", [["Staff", "Venue", "Type", "Paid", "Dates", "Days", "Status", "Approved by"], ...history.map((l) => [l.staffName, l.venue, leaveLabel(l), paidOf(l) ? "Paid" : "Unpaid", l.dates, l.days, l.status, l.approvedBy || ""])]); showToast("Leave history exported (CSV)"); }}>Export</button></div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Venue</th><th>Type</th><th>Paid</th><th>Dates</th><th>Days</th><th>Status</th><th>Approved by</th>{canApprove && <th></th>}</tr></thead>
            <tbody>
              {/* per-type sections (Phase 4c) — ONE "Other" section; CSV above stays flat */}
              {historySections.map(([t, rows]) => (
                <React.Fragment key={t}>
                  <tr><td colSpan={canApprove ? 9 : 8} style={{ padding: "6px 10px", background: "var(--gray-light)", fontSize: 11, fontWeight: 700, color: "var(--gray)", textTransform: "uppercase", letterSpacing: 0.4 }}>{t} <span style={{ fontWeight: 400 }}>· {rows.length}</span></td></tr>
                  {rows.map((l) => (
                    <tr key={l.id}>
                      {/* history paperclip is ICON-ONLY (Phase 6 Job 4b): the URL lives in
                          private/details now — a click that triggers a fetch in a table row
                          is worse than no click. hasProof drives it; l.proofUrl is the
                          legacy pre-migration fallback. */}
                      <td>{l.staffName}</td><td>{l.venue}</td><td>{leaveLabel(l)}{(l.hasProof || l.proofUrl) ? <span title="proof attached"> 📎</span> : null}</td><td><span className={`pill ${paidOf(l) ? "pill-green" : "pill-amber"}`}>{paidOf(l) ? "Paid" : "Unpaid"}</span></td><td>{l.dates}</td><td>{l.days}</td>
                      <td><span className={`pill ${leaveStatusPill(l.status)}`}>{l.status}</span></td><td>{l.approvedBy || "—"}</td>
                      {canApprove && <td style={{ whiteSpace: "nowrap" }}>{l.status === "Approved" ? <>
                        <button className="btn btn-sm" onClick={() => setEditLeave({ l, start: l.startDate || "", end: l.endDate || "" })}>Edit dates</button>{" "}
                        <button className="btn btn-sm btn-danger" onClick={() => cancelLeave(l)}>Cancel</button>
                      </> : null}</td>}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {history.length === 0 && <tr><td colSpan={canApprove ? 9 : 8} style={{ color: "var(--gray)" }}>No leave history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit approved-leave dates (issue 4) — approver-gated; stays Approved */}
      {editLeave && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditLeave(null)}>
          <div className="rg-modal" style={{ maxWidth: 420 }}>
            <div className="card-head"><span className="card-title">Edit leave dates</span></div>
            <div style={{ fontSize: 13, marginBottom: 10 }}>{editLeave.l.staffName} · <span className={`pill ${leaveTypePill(editLeave.l.type)}`}>{leaveLabel(editLeave.l)}</span> <span style={{ color: "var(--gray)" }}>· currently {editLeave.l.dates}</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="form-group"><label className="form-label">Start date</label><input type="date" className="form-input" value={editLeave.start} onChange={(e) => setEditLeave((p) => ({ ...p, start: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">End date</label><input type="date" className="form-input" value={editLeave.end} onChange={(e) => setEditLeave((p) => ({ ...p, end: e.target.value }))} /></div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button className="btn btn-sm" onClick={() => setEditLeave(null)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={saveLeaveEdit}>Save — stays approved</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Balance warning (Phase 5 Job 3) — warns, never blocks. The "may be
          higher" caveat is the point: MyMor balances start at the accrual start
          date, so a low number does NOT mean the person has no leave. */}
      {balWarn && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setBalWarn(null)}>
          <div className="rg-modal" style={{ maxWidth: 460 }}>
            <div className="modal-head"><span className="modal-title">Balance check</span><button className="modal-close" onClick={() => setBalWarn(null)}>✕</button></div>
            <div style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>
              {balWarn.l.staffName || "This person"} has <strong>{fmtLeaveMinutes(balWarn.balanceMinutes)}</strong> {balWarn.bucket} accrued in MyMor.
              This request is about <strong>{fmtLeaveMinutes(balWarn.estMinutes)}</strong> ({balWarn.basis === "roster" ? "based on their rostered shifts" : "based on their contracted hours"}).
              The exact amount is worked out when the approval is saved.<br />
              Approving will take the balance negative.<br />
              {leaveAccruedSinceLabel()
                ? <>MyMor only counts leave accrued since {leaveAccruedSinceLabel()} — their real entitlement may be higher.</>
                : <>MyMor only counts leave accrued since the group's start date — their real entitlement may be higher.</>}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="btn btn-sm" onClick={() => setBalWarn(null)}>Cancel</button>
              <button className="btn btn-sm btn-primary" onClick={() => { const l = balWarn.l; setBalWarn(null); decide(l, "Approved"); }}>Approve anyway</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
