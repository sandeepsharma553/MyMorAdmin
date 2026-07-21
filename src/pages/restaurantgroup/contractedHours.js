// ── Contracted hours as a RANGE (the client hires on "38–40") ── Admin-only feature;
// Ops has no contracted-hours surfaces. NAMING (deliberate): the legacy private field
// `contractedMinHours` is a STRING ("24", "38-40") — a name that has held strings must
// never start holding numbers (a sometimes-"38"/sometimes-38 field is the exact shape-
// mismatch class behind the POS rail crash). So the range lives under NEW, always-numeric
// keys and the legacy string is FROZEN: read as a fallback, never written by the staff form.
//   staff/{id}/private/details:  contractedHoursMin / contractedHoursMax  — number | null
//   staff doc (planner mirror):  contractedWeeklyHours (min — pre-existing, already
//                                number|null by construction) / contractedWeeklyHoursMax
// No rules change: new private keys sit outside the self-write whitelist automatically.

// number | null from any input shape ("" / "38" / 38 / garbage) — the ONLY coercion the
// writers use, so the new keys can never hold strings.
export const contractedNum = (v) => {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

// Legacy-string parser (migration-on-READ only — nothing batch-writes live docs).
// "38-40" / "38 - 40" / "38–40" (en) / "38—40" (em) → {min:38, max:40}; "38" → {min:38,
// max:null}; ""/null/garbage → {min:null, max:null}. A reversed "40-38" is returned AS
// FOUND — the form's max ≥ min validation makes a human resolve it on save, and
// fmtContractedRange collapses it to the min rather than displaying "40–38".
export const parseContractedLegacy = (raw) => {
  const s = String(raw ?? "").trim();
  if (!s) return { min: null, max: null };
  const m = s.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/);
  if (m) return { min: Number(m[1]), max: Number(m[2]) };
  const n = Number(s);
  return Number.isFinite(n) ? { min: n, max: null } : { min: null, max: null };
};

// THE read point for the private doc: the new keys win whenever EITHER is present
// (absent-vs-empty rule, same as rateSplitFromPrivate); only fully-absent docs fall back
// to parsing the frozen legacy string.
export const contractedRangeOf = (priv) => {
  const p = priv || {};
  if (p.contractedHoursMin !== undefined || p.contractedHoursMax !== undefined) {
    return { min: contractedNum(p.contractedHoursMin), max: contractedNum(p.contractedHoursMax) };
  }
  return parseContractedLegacy(p.contractedMinHours);
};

// Form-seeding fallback (spread in payrollFromProfile, mirroring rateSplitFromPrivate):
// returns {} when the new keys exist so stored values pass through untouched; otherwise
// splits the legacy string into the two inputs so the next save normalises it.
export const contractedSplitFromPrivate = (p) => {
  const d = p || {};
  if (d.contractedHoursMin !== undefined || d.contractedHoursMax !== undefined) return {};
  const { min, max } = parseContractedLegacy(d.contractedMinHours);
  return { contractedHoursMin: min ?? "", contractedHoursMax: max ?? "" };
};

// ONE formatter for every display site. null unless min > 0 (keeps the planner's historic
// > 0 gate — casuals stored as 0 render nothing); the max only shows when it's a real
// range (max > min); en-dash, matching the client's own wording ("38–40 hours").
// suffix defaults to the label form ("38–40h/wk"); the Hours-cell contracted line passes
// "h" ("38–40h contracted") — one formatter, two suffixes, zero drift.
export const fmtContractedRange = (min, max, suffix = "h/wk") => {
  const lo = contractedNum(min), hi = contractedNum(max);
  if (lo == null || lo <= 0) return null;
  return hi != null && hi > lo ? `${lo}–${hi}${suffix}` : `${lo}${suffix}`;
};

// Staff-doc (mirror) variant with the Casual gate baked in — the planner's two sites call
// ONLY this, so the gate can't drift between the main grid and the split pane.
export const contractedLabelForStaff = (s) =>
  !s || s.type === "Casual" ? null : fmtContractedRange(s.contractedWeeklyHours, s.contractedWeeklyHoursMax);

// ── Issue 6 (parts A+B): contracted vs rostered — ONE calculator feeding both the Hours
// cell and the under-contract strip, so the two can never disagree. ALL-VENUES by design:
// a contract is with the person, not a venue (the double-book guard's rule) — callers
// pass the staffer's shifts from the ALL-VENUES week list, never the picker-scoped one.
// paidHoursOf: injected because effective breaks are area-driven page state (effectiveBreak).
// onLeave: approved leave anywhere in the shown week → status "leave" — no contracted
// line, no strip entry, NOT prorated (a leave week is not an under-rostered week).
// Statuses: "none" (casual / no contracted min — decided by contractedLabelForStaff, the
// ONE scope gate), "leave", "short" (paid hours < min; shortBy carries the gap), "met"
// (>= min). Between min and max AND over the max both read "met" — the client's problem
// is under-rostering, and over-max is already visible in the headline number, so a
// distinct over status would be noise. byVenue is venue-name sorted for a stable render.
export const contractedWeekStatus = (s, staffShifts, paidHoursOf, onLeave) => {
  let hours = 0;
  const byVenue = [];
  for (const sh of staffShifts || []) {
    const h = paidHoursOf(sh);
    hours += h;
    const b = byVenue.find((v) => v.venueId === sh.venueId);
    if (b) b.hours += h; else byVenue.push({ venueId: sh.venueId, venue: sh.venue || "", hours: h });
  }
  byVenue.sort((a, b) => a.venue.localeCompare(b.venue));
  if (contractedLabelForStaff(s) === null) return { hours, byVenue, min: null, max: null, status: "none", shortBy: 0 };
  if (onLeave) return { hours, byVenue, min: null, max: null, status: "leave", shortBy: 0 };
  const min = contractedNum(s.contractedWeeklyHours), max = contractedNum(s.contractedWeeklyHoursMax);
  return hours < min
    ? { hours, byVenue, min, max, status: "short", shortBy: min - hours }
    : { hours, byVenue, min, max, status: "met", shortBy: 0 };
};
