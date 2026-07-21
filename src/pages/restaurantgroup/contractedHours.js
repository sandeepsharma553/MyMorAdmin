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
export const fmtContractedRange = (min, max) => {
  const lo = contractedNum(min), hi = contractedNum(max);
  if (lo == null || lo <= 0) return null;
  return hi != null && hi > lo ? `${lo}–${hi}h/wk` : `${lo}h/wk`;
};

// Staff-doc (mirror) variant with the Casual gate baked in — the planner's two sites call
// ONLY this, so the gate can't drift between the main grid and the split pane.
export const contractedLabelForStaff = (s) =>
  !s || s.type === "Casual" ? null : fmtContractedRange(s.contractedWeeklyHours, s.contractedWeeklyHoursMax);
