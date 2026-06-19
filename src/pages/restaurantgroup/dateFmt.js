/* Display-date formatter, tolerant of the three shapes the staff timeline mixes:
 *   - a Firestore Timestamp object (has .toDate()) — e.g. assignment.verifiedAt, note.createdAt
 *   - an ISO string / epoch number — e.g. records[].at
 *   - null / empty
 * Returns "" for empty/invalid so the timeline never renders "Invalid Date" or "[object Object]". */
export const fmtDate = (v) => {
  if (!v) return "";
  const d = typeof v.toDate === "function" ? v.toDate() : new Date(v);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
};
