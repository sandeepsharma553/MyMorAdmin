/* Public-holiday model (PURE — no firestore imports).
 * A holiday: { date:"YYYY-MM-DD", name:string, state:"ALL"|<one of AU_STATES> }
 *   "ALL"  → national (applies in every state)
 *   <state> → that state only (e.g. "VIC")
 *
 * AU_PUBLIC_HOLIDAYS_SEED below is a suggested starting list for the CURRENT
 * year (2026) and NEXT year (2027): the seven NATIONAL holidays + the clearly
 * known VIC-specific ones (Labour Day, King's Birthday, Melbourne Cup). The
 * AFL Grand Final Friday is omitted — it is declared yearly and not reliably
 * known in advance, so we do not invent it. Seeded into the editor in-memory
 * only; never auto-written.
 */
export const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

export const AU_PUBLIC_HOLIDAYS_SEED = [
  // ── 2026 ──
  { date: "2026-01-01", name: "New Year's Day", state: "ALL" },
  { date: "2026-01-26", name: "Australia Day", state: "ALL" },
  { date: "2026-03-09", name: "Labour Day", state: "VIC" },
  { date: "2026-04-03", name: "Good Friday", state: "ALL" },
  { date: "2026-04-06", name: "Easter Monday", state: "ALL" },
  { date: "2026-04-25", name: "Anzac Day", state: "ALL" },
  { date: "2026-06-08", name: "King's Birthday", state: "VIC" },
  { date: "2026-11-03", name: "Melbourne Cup", state: "VIC" },
  { date: "2026-12-25", name: "Christmas Day", state: "ALL" },
  { date: "2026-12-26", name: "Boxing Day", state: "ALL" },
  // ── 2027 ──
  { date: "2027-01-01", name: "New Year's Day", state: "ALL" },
  { date: "2027-01-26", name: "Australia Day", state: "ALL" },
  { date: "2027-03-08", name: "Labour Day", state: "VIC" },
  { date: "2027-03-26", name: "Good Friday", state: "ALL" },
  { date: "2027-03-29", name: "Easter Monday", state: "ALL" },
  { date: "2027-04-25", name: "Anzac Day", state: "ALL" },
  { date: "2027-06-14", name: "King's Birthday", state: "VIC" },
  { date: "2027-11-02", name: "Melbourne Cup", state: "VIC" },
  { date: "2027-12-25", name: "Christmas Day", state: "ALL" },
  { date: "2027-12-26", name: "Boxing Day", state: "ALL" },
];

// Is `dateStr` a public holiday for `state`? National ("ALL") matches any state.
export const isPublicHoliday = (dateStr, state, holidays) =>
  (holidays || []).some((h) => h.date === dateStr && (h.state === "ALL" || h.state === state));

// Name of the holiday on `dateStr` for `state` (national or that state); "" if none.
export const holidayName = (dateStr, state, holidays) => {
  const h = (holidays || []).find((x) => x.date === dateStr && (x.state === "ALL" || x.state === state));
  return h ? h.name : "";
};

// All holidays relevant to `state` (national + that state's).
export const holidaysForState = (holidays, state) =>
  (holidays || []).filter((h) => h.state === "ALL" || h.state === state);

// For the "all venues" view: PH if it's a holiday in ANY of the given states.
export const isPHForAnyState = (dateStr, states, holidays) =>
  (states || []).some((s) => isPublicHoliday(dateStr, s, holidays));
