/* ============================================================
   Awards & Compliance — verification gating for labour cost.

   THE RULE (handoff Phase 5): a wage award whose `verified` flag is not
   strictly true must NEVER contribute a number to any payroll / labour-cost
   calculation. Every labour consumer must resolve its hourly rate through
   `labourHourlyForStaff` (or check `isAwardUsableForLabour`) — which returns
   null for an unverified, unassigned or unmapped award, so the caller falls
   back to its own flat estimate instead of an unconfirmed figure.
   ============================================================ */

// Hard gate: only a strictly-true verified flag unlocks a rate for labour use.
export const isAwardUsableForLabour = (award) => !!award && award.verified === true;

export const staffIsCasual = (s) =>
  /casual/i.test(String(s?.type || s?.empType || s?.employmentType || ""));

// Map a staff member to an award level. Explicit `awardLevel` on the staff doc
// wins; otherwise fall back to the award's first level (never guess a number).
const levelRowFor = (award, staff) => {
  const levels = award?.levels || [];
  if (!levels.length) return null;
  const want = staff?.awardLevel != null ? String(staff.awardLevel).trim().toLowerCase() : null;
  if (want) {
    const hit = levels.find((l) => String(l.level || "").trim().toLowerCase() === want);
    if (hit) return hit;
  }
  return levels[0];
};

// The award a venue selects — EXPLICIT venue.awardCode only (never venue.type,
// which is the FOH|BOH|CK venue role). Returns the award doc or null.
export const awardForVenue = (venue, awardRates) => {
  if (!venue?.awardCode) return null;
  return (awardRates || []).find((a) => a.code === venue.awardCode) || null;
};

// Resolve the hourly rate a labour calc may use for one staff member.
// Returns { rate, reason, award, level }. `rate` is a number ONLY when reason
// === "ok"; in every other case rate is null and the caller must NOT substitute
// an award figure.
//   reason: "ok" | "no-venue" | "unassigned" | "no-award" | "unverified" | "no-rate"
export const labourHourlyForStaff = (staff, venues, awardRates) => {
  const venueId = (staff?.venueIds || [])[0] || staff?.venueId;
  const venue = (venues || []).find((v) => v.id === venueId);
  if (!venue) return { rate: null, reason: "no-venue" };
  if (!venue.awardCode) return { rate: null, reason: "unassigned" };
  const award = awardForVenue(venue, awardRates);
  if (!award) return { rate: null, reason: "no-award" };
  if (!isAwardUsableForLabour(award)) return { rate: null, reason: "unverified", award };
  const row = levelRowFor(award, staff);
  const rate = staffIsCasual(staff) ? row?.casualHourly : row?.baseHourly;
  if (rate == null || isNaN(Number(rate))) return { rate: null, reason: "no-rate", award, level: row };
  return { rate: Number(rate), reason: "ok", award, level: row };
};

// Per-venue readiness for the labour calc (level-1 base, gated). For display.
//   { award, assigned, verified, usable, baseRate }
export const venueLabourReadiness = (venue, awardRates) => {
  const award = awardForVenue(venue, awardRates);
  const verified = isAwardUsableForLabour(award);
  const base = verified ? (award.levels || [])[0]?.baseHourly : null;
  return {
    award,
    assigned: !!venue?.awardCode,
    verified,
    usable: verified && base != null,
    baseRate: base != null ? Number(base) : null,
  };
};

export const LABOUR_REASON_TEXT = {
  ok: "verified award rate",
  "no-venue": "no venue assigned to staff",
  unassigned: "venue has no award set",
  "no-award": "award code not found",
  unverified: "award not verified — flat estimate used",
  "no-rate": "award has no rate for this level",
};
