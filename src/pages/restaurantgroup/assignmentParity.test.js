/* Phase 3c — auto-assign PARITY (client half).
 *
 * shouldAutoAssign is byte-identical in this repo (assignmentUtils.js) and in the
 * functions repo (functions/rgAutoAssign.js). Both are asserted against the SAME
 * truth table below — if both test files pass, the two halves are proven equivalent
 * (server auto-assign and client suggest pick the same staff for the same item).
 *
 * ⚠ KEEP CASES identical to functions/scripts/rgAutoAssign.test.js. */
import { shouldAutoAssign, areaFromRole } from "./assignmentUtils";

const foh = { area: "FOH", role: "FOH", venueIds: ["v1"] };
const boh = { area: "BOH", role: "BOH", venueIds: ["v1"] };
const mgr = { area: "Mgmt", role: "Manager", venueIds: ["v1"] };
const sup = { area: "FOH", role: "FOH Supervisor", venueIds: ["v1"] };
const fohV2 = { area: "FOH", role: "FOH", venueIds: ["v2"] };
const fohNoArea = { role: "FOH", venueIds: ["v1"] };

const clFOHrole = { area: "FOH", autoAssign: { roles: ["FOH"] } };
const clFOHroleLower = { area: "FOH", autoAssign: { roles: ["foh"] } };
const clAllRoleFOH = { area: "All", autoAssign: { roles: ["FOH"] } };
const clFOHnoRole = { area: "FOH" };
const clBOHnoRole = { area: "BOH" };
const mBOHrole = { cat: "BOH", autoAssign: { roles: ["BOH"] } };

// [label, item, staff, venueId, expected] — the canonical truth table.
const CASES = [
  ["role+area match", clFOHrole, foh, "v1", true],
  ["area+role mismatch", clFOHrole, boh, "v1", false],
  ["module cat match", mBOHrole, boh, "v1", true],
  ["role-targeted skips manager not in roles", mBOHrole, mgr, "v1", false],
  ["All area, role match", clAllRoleFOH, foh, "v1", true],
  ["All area, role mismatch", clAllRoleFOH, boh, "v1", false],
  ["no-roles item NOT auto-assigned to line staff", clFOHnoRole, foh, "v1", false],
  ["no-roles item goes to managers", clFOHnoRole, mgr, "v1", true],
  ["wrong venue excluded", clFOHrole, fohV2, "v1", false],
  ["unknown staff.area never blocks", clFOHrole, fohNoArea, "v1", true],
  ["role match is case-insensitive", clFOHroleLower, foh, "v1", true],
  ["supervisor (sees all) gets no-roles cross-area item", clBOHnoRole, sup, "v1", true],
];

describe("shouldAutoAssign — canonical truth table (client copy)", () => {
  test.each(CASES)("%s", (_label, item, staff, venueId, expected) => {
    expect(shouldAutoAssign(item, staff, venueId)).toBe(expected);
  });
});

describe("same-people proof — server filter == client filter for one item", () => {
  // The server auto-assigns staff.filter(shouldAutoAssign); the client suggest is
  // ordered over the same eligible set. Same predicate → same people.
  test("a role-targeted FOH checklist resolves to exactly the FOH-line staff", () => {
    const roster = [foh, boh, mgr, sup, fohV2, fohNoArea];
    const assigned = roster.filter((s) => shouldAutoAssign(clFOHrole, s, "v1"));
    expect(assigned).toEqual([foh, fohNoArea]); // FOH line + unknown-area FOH; NOT boh/mgr/sup/other-venue
  });
  test("a no-roles checklist resolves to exactly the managers/supervisors", () => {
    const roster = [foh, boh, mgr, sup, fohNoArea];
    const assigned = roster.filter((s) => shouldAutoAssign(clFOHnoRole, s, "v1"));
    expect(assigned).toEqual([mgr, sup]);
  });
});

// ── Rostered-role fix (the shift carries role + station but no area) ──
// ⚠ KEEP AREA_CASES + the rostered proof identical to functions/scripts/rgAutoAssign.test.js.
const AREA_CASES = [
  ["FOH", "FOH"],
  ["FOH — Bar", "FOH"],
  ["BOH", "BOH"],
  ["BOH — Kitchen", "BOH"],
  ["Chef", "BOH"],
  ["Central Kitchen", "BOH"], // a CK *role* is kitchen work → BOH (CK is a venue, not an area)
  ["Store Manager", "Mgmt"],
  ["FOH Supervisor", "Mgmt"],
  ["Junior", ""],             // unknown → "" so it never blocks
  ["", ""],
];

describe("areaFromRole — area derived from the rostered role", () => {
  test.each(AREA_CASES)("%s → %s", (role, area) => {
    expect(areaFromRole(role)).toBe(area);
  });
});

describe("rostered-role basis — assign off the shift's role/area, NOT the home profile", () => {
  // Mirrors how rgOnShiftCreated builds its match identity from the shift doc.
  const rosteredFromShift = (shift, venueId) => ({
    role: shift.role,
    area: areaFromRole(shift.role),
    venueIds: [venueId],
    stationIds: shift.stationId ? [shift.stationId] : [],
  });

  test("a BOH-home person rostered as FOH gets the FOH item, not the BOH item", () => {
    // home profile is BOH — but the function never reads it; only the shift matters.
    const shift = { staffId: "x", role: "FOH", venueId: "v1", stationId: "" };
    const rostered = rosteredFromShift(shift, "v1");
    expect(rostered.area).toBe("FOH");
    expect(shouldAutoAssign(clFOHrole, rostered, "v1")).toBe(true);  // FOH checklist → yes
    expect(shouldAutoAssign(mBOHrole, rostered, "v1")).toBe(false); // BOH module → no
  });
  test("the same person rostered as BOH the next day gets the BOH item instead", () => {
    const shift = { staffId: "x", role: "BOH", venueId: "v1", stationId: "" };
    const rostered = rosteredFromShift(shift, "v1");
    expect(rostered.area).toBe("BOH");
    expect(shouldAutoAssign(mBOHrole, rostered, "v1")).toBe(true);
    expect(shouldAutoAssign(clFOHrole, rostered, "v1")).toBe(false);
  });
});
