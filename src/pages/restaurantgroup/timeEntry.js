// Pure time-entry logic — MIRROR of MyMorOps src/lib/timeEntry.js (drift-guard
// convention: keep the exported behaviour identical in both repos; the permitted
// difference is the date-helper home — Admin's localBusinessDate/mondayFromWeekKey
// twins live in rgUtils (localDateKey/mondayFromWeekKey), so this file only mirrors
// the entry/break machinery). NO Firestore calls and NO serverTimestamp() here — the
// caller injects clockInAt/clockOutAt via serverTimestamp() and writes break docs
// (with serverTimestamp() start/end) to a per-entry `breaks` SUBCOLLECTION
// (FieldValue sentinels can't live inside array elements, so breaks are docs).
// `businessDate` is a LOCAL "YYYY-MM-DD" (device tz) so day-grouping is tz-stable.

import { localDateKey } from "./rgUtils";

// Doc fields at clock-in WITHOUT timestamps. The caller spreads this and adds
// clockInAt / createdAt / updatedAt: serverTimestamp(). No breaks array — breaks are a subcollection.
export const newClockInPayload = ({ staff, venueId, venueName, awardCode, enteredByUid } = {}) => ({
  staffId: staff?.id || "",
  staffName: staff?.displayName || staff?.name || "",
  venueId: venueId || "",
  venue: venueName || "",
  businessDate: localDateKey(new Date()),
  awardCode: awardCode || null,
  status: "clocked_in",
  staffMealCleared: false,
  approved: false,
  enteredBy: enteredByUid || "",
});

// State machine — returns the INTENT (entry status update + what to do with the break
// subcollection), not array mutations. The caller performs the addDoc/updateDoc on the
// breaks subcollection with serverTimestamp(). Illegal transitions return null.
//   pause    (from clocked_in) -> open a new break doc
//   resume   (from on_break)   -> close the open break doc
//   clockOut (not clocked_out) -> close the open break if any, then close the entry
export const reduceState = (entry, action) => {
  const status = entry?.status;
  if (action === "pause") {
    if (status !== "clocked_in") return null;
    return { entryUpdate: { status: "on_break" }, break: "open" };
  }
  if (action === "resume") {
    if (status !== "on_break") return null;
    return { entryUpdate: { status: "clocked_in" }, break: "close" };
  }
  if (action === "clockOut") {
    if (status === "clocked_out") return null;
    return { entryUpdate: { status: "clocked_out" }, break: "closeIfOpen" };
  }
  return null;
};

// Convert a Firestore/JS time value to millis, or null if unresolved (serverTimestamp sentinel).
export const toMillis = (v) => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  return null; // unresolved serverTimestamp sentinel / unknown shape → ignore safely
};

// workedMinutes (paid breaks count as worked; unpaid subtracted) + unpaidBreakMinutes.
// `breaks` is an array of resolved break docs ({ startAt, endAt, paid }). Open breaks
// (endAt unresolved/null) and unresolved sentinels are ignored safely.
export const computeWorked = (entry, breaks = []) => {
  const inMs = toMillis(entry?.clockInAt);
  const outMs = toMillis(entry?.clockOutAt);
  let unpaidBreakMinutes = 0;
  (Array.isArray(breaks) ? breaks : []).forEach((b) => {
    if (b && b.paid === false) {
      const s = toMillis(b.startAt), e = toMillis(b.endAt);
      if (s != null && e != null && e > s) unpaidBreakMinutes += Math.round((e - s) / 60000);
    }
  });
  const gross = inMs != null && outMs != null && outMs > inMs ? Math.round((outMs - inMs) / 60000) : 0;
  const workedMinutes = Math.max(0, gross - unpaidBreakMinutes);
  return { workedMinutes, unpaidBreakMinutes };
};
