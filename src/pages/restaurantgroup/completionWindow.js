/* 48-hour active-window filter (client-side DISPLAY only — no scheduled function).
 *
 * A Complete training/checklist assignment stays in the active lists only while it's
 * within 48h of completion; after that it's hidden from the active view. It is NEVER
 * deleted — the record stays in Firestore and in the completion archive. */

export const ACTIVE_WINDOW_MS = 48 * 60 * 60 * 1000;

// Milliseconds of a completedAt value across the shapes it can take: a Firestore
// Timestamp (.toDate()/.seconds), an ISO string / epoch number, or null/missing.
export const completedAtMs = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v.seconds === "number") return v.seconds * 1000;
  const t = new Date(v).getTime();
  return isNaN(t) ? null : t;
};

// Is a Complete item still inside the active window? A Complete item with NO completedAt
// (pre-existing data) counts as PAST the window — see showInActiveList.
export const isWithinActiveWindow = (a, nowMs = Date.now(), windowMs = ACTIVE_WINDOW_MS) => {
  const ms = completedAtMs(a && a.completedAt);
  if (ms == null) return false;
  return nowMs - ms < windowMs;
};

// The active-list predicate: keep anything NOT Complete; keep Complete only within the
// window. DECISION for pre-existing completed items with no completedAt: treat them as
// already past the window (hidden), so old completed items don't linger forever — they
// remain in History/stats and the archive, just not the active "outstanding" list.
export const showInActiveList = (a, nowMs = Date.now(), windowMs = ACTIVE_WINDOW_MS) =>
  (a && a.status === "Complete") ? isWithinActiveWindow(a, nowMs, windowMs) : true;
