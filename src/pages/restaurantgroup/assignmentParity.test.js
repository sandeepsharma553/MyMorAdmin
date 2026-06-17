/* Phase 3c — auto-assign PARITY (client half).
 *
 * shouldAutoAssign is byte-identical in this repo (assignmentUtils.js) and in the
 * functions repo (functions/rgAutoAssign.js). Both are asserted against the SAME
 * truth table below — if both test files pass, the two halves are proven equivalent
 * (server auto-assign and client suggest pick the same staff for the same item).
 *
 * ⚠ KEEP CASES identical to functions/scripts/rgAutoAssign.test.js. */
import { shouldAutoAssign } from "./assignmentUtils";

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
