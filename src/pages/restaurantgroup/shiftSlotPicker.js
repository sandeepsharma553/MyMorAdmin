/* Checklist "Link to shifts" — pick recurring slots from the venue's REAL roster.
 *
 * Pure helpers for the in-modal Shift-Planner-style picker. The stored model is
 * UNCHANGED: shiftLinks is an array of recurring { day, start, label } (day name, start
 * time, role label) — a recurring "every <day> <start> shift", NOT a one-off instance.
 * checkAndCreateShiftAssignments + the shiftLinks-take-over precedence are untouched. */

export const SLOT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// minutes-of-day for a "7:00am" / "3:30pm" start (for sorting the grid rows).
export const slotMinutes = (t) => {
  const m = /(\d+):(\d+)(am|pm)/i.exec(t || "");
  if (!m) return 0;
  let h = parseInt(m[1], 10) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return h * 60 + parseInt(m[2], 10);
};

// A slot is identified by day+start (the recurring key); label is informational.
export const isSlotLinked = (shiftLinks, slot) =>
  (shiftLinks || []).some((l) => l.day === slot.day && l.start === slot.start);

// Toggle a recurring slot in shiftLinks — same shape as today (add the {day,start,label}
// or remove the matching day+start). Returns a new array.
export const toggleSlotLink = (shiftLinks, slot) =>
  isSlotLinked(shiftLinks, slot)
    ? (shiftLinks || []).filter((l) => !(l.day === slot.day && l.start === slot.start))
    : [...(shiftLinks || []), slot];

// Build a weekly Day×Start grid from the venue's REAL shift slots (venueShiftSlots — the
// same {day,start,label} data the planner shows). days = only those with shifts; starts =
// distinct start times sorted by time-of-day; slotAt(day,start) → the real slot or null.
export const buildSlotGrid = (venueShiftSlots) => {
  const cell = new Map();
  const starts = new Set();
  const dayHas = new Set();
  (venueShiftSlots || []).forEach((s) => {
    if (!s || !s.day || !s.start) return;
    cell.set(`${s.day}|${s.start}`, s);
    starts.add(s.start);
    dayHas.add(s.day);
  });
  return {
    days: SLOT_DAYS.filter((d) => dayHas.has(d)),
    starts: [...starts].sort((a, b) => slotMinutes(a) - slotMinutes(b)),
    slotAt: (day, start) => cell.get(`${day}|${start}`) || null,
    isEmpty: cell.size === 0,
  };
};
