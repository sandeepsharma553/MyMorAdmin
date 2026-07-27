// Pure helpers to link a roster shift to its actual time entry (Availability clock).
// MIRROR of MyMorOps src/lib/shiftTimeLink.js (drift-guard convention) — the permitted
// difference is the date-helper name (Admin localDateKey ≡ Ops localBusinessDate).
// Matching is by staff + venue + the shift's local business date — the same local
// "YYYY-MM-DD" the time entry stores at clock-in, so both agree.
import { localDateKey, mondayFromWeekKey } from "./rgUtils";

// Local business date ("YYYY-MM-DD") for a shift from its weekKey (Monday) + day index (0=Mon).
// Uses the REAL local Monday (mondayFromWeekKey): the stored key is UTC-shifted, and re-parsing
// it made a Monday shift's business date the previous Sunday — so shifts NEVER matched their
// time entries (which store the true local business date at clock-in).
export const shiftBusinessDate = (shift) => {
  if (!shift?.weekKey) return "";
  const d = mondayFromWeekKey(shift.weekKey);
  d.setDate(d.getDate() + (shift.day || 0));
  return localDateKey(d);
};

// The timeEntry matching a shift: same staffId, same venueId, same business date. Read-only.
export const matchTimeEntry = (shift, timeEntries) => {
  if (!shift) return null;
  const bd = shiftBusinessDate(shift);
  if (!bd) return null;
  return (timeEntries || []).find(
    (e) => e.staffId === shift.staffId && e.venueId === shift.venueId && e.businessDate === bd
  ) || null;
};
