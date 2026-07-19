/* ════════════════════════════════════════════════════════════════════
 * CROSS-PHASE INTEGRATION TESTS (staff restructure, phases 1–3c + rostered fix).
 *
 * The per-phase suites check pieces in isolation. These exercise the CONNECTED flow
 * across phases — the seams where breakage hides — and assert the OBSERVABLE outcome
 * (which docs get created/archived/deleted, who is auto-assigned vs suggested).
 *
 * Firestore is fully mocked exactly like trainingArchive.test.js — nothing real is
 * touched. The pure helpers (shouldAutoAssign/areaFromRole/matchScore/resolve*) run
 * for real; only the call-tracked writes (getDoc/setDoc/deleteDoc) are jest.fn.
 * ════════════════════════════════════════════════════════════════════ */
import { setDoc, getDoc, deleteDoc } from "firebase/firestore";
import { archiveAndRemoveTraining, hasArchivableTraining } from "./trainingArchiveUtils";
import {
  shouldAutoAssign, areaFromRole, matchScore, orderStaffForItem, isSuggested,
  isAssignmentLocked, ROLE_WEIGHT,
} from "./assignmentUtils";
import { moduleForStaff, checklistForStaff, snapshotForAssign } from "./rgUtils";
import { resolveAreas, resolveRoles, resolveEmpTypes, roleConfiguredArea, addToList } from "./staffStructureUtils";
import {
  DEFAULT_AREAS, DEFAULT_ROLES, DEFAULT_EMP_TYPES, RG_MODULES, RG_MODULE_KEYS,
  SOPS_NAV, CHECKLISTS_NAV_LABEL,
} from "./rgConfig";

jest.mock("firebase/firestore", () => ({
  doc: (col, id) => ({ __col: col, __id: id }),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: () => "__ts__",
}));
jest.mock("../../utils/restaurantGroupPaths", () => ({
  venueCol: (g, v, n) => `${g}/venues/${v}/${n}`,
  trainingArchiveCol: (g, v) => `${g}/venues/${v}/trainingArchive`,
  venueColor: () => "#000",
}));

beforeEach(() => {
  jest.clearAllMocks();
  setDoc.mockResolvedValue();
  deleteDoc.mockResolvedValue();
});

// ── shared fixtures ─────────────────────────────────────────────────
const V = "v1";
// A person whose HOME profile is BOH, working at v1.
const homeBOH = { id: "s1", area: "BOH", role: "BOH", venueIds: [V], stationIds: [] };
// Items in the venue (training modules carry area in `cat`, checklists in `area`).
const mFOH = { id: "mFOH", venueId: V, venue: "Mad Benji", cat: "FOH", title: "FOH Opening",
  steps: [{ heading: "Open", items: ["Unlock", "Lights"] }], autoAssign: { roles: ["FOH"] } };
const mBOH = { id: "mBOH", venueId: V, venue: "Mad Benji", cat: "BOH", title: "BOH Close",
  steps: [{ heading: "Close", items: ["Clean", "Lock"] }], autoAssign: { roles: ["BOH"] } };
// rgOnShiftCreated builds this from the shift doc (role + station, area DERIVED from role).
const rosteredFromShift = (shift, venueId) => ({
  role: shift.role,
  area: areaFromRole(shift.role),
  venueIds: [venueId],
  stationIds: shift.stationId ? [shift.stationId] : [],
});

// ════════════════════════════════════════════════════════════════════
// SCENARIO 1 — shift → auto-assign → complete → lock → reassign → archive
// ════════════════════════════════════════════════════════════════════
describe("Scenario 1: rostered shift → auto-assign → complete → lock → reassign → archive", () => {
  // BOH-home person rostered as FOH for a shift at v1
  const shift = { staffId: "s1", staffName: "Sam", role: "FOH", venueId: V, stationId: "" };
  const rostered = rosteredFromShift(shift, V);

  test("auto-assign uses the ROSTERED identity, not the home profile", () => {
    expect(rostered.area).toBe("FOH"); // derived from rostered role, since the shift has no area
    // rostered FOH ⇒ gets the FOH module, NOT the home-BOH module
    expect(shouldAutoAssign(mFOH, rostered, V)).toBe(true);
    expect(shouldAutoAssign(mBOH, rostered, V)).toBe(false);
    // and the basis genuinely flips the outcome — the HOME identity would do the opposite
    expect(shouldAutoAssign(mFOH, homeBOH, V)).toBe(false);
    expect(shouldAutoAssign(mBOH, homeBOH, V)).toBe(true);
  });

  test("the assignment that gets created starts blank (fresh snapshot)", () => {
    const created = { ...snapshotForAssign(mFOH), status: "Not started", progress: 0 };
    expect(created.checks).toEqual([false, false]);
    expect(created.itemsTotal).toBe(2);
    expect(created.status).toBe("Not started");
  });

  test("once completed it LOCKS (no further edits); an in-progress one does not", () => {
    const completed = {
      id: "auto-mFOH-shiftX", venueId: V, venue: "Mad Benji", staffId: "s1", staffName: "Sam",
      moduleId: "mFOH", moduleTitle: "FOH Opening", sections: mFOH.steps,
      checks: [true, true], itemsTotal: 2, progress: 100, status: "Complete",
      verified: true, verifiedBy: "Jo", verifyNote: "great on coffee",
    };
    expect(isAssignmentLocked(completed)).toBe(true);
    expect(isAssignmentLocked({ ...completed, status: "In progress", verified: false })).toBe(false);
  });

  test("reassign ARCHIVES the completed record (preserved, appears in past-training) then frees the slot", async () => {
    const completed = {
      id: "auto-mFOH-shiftX", venueId: V, venue: "Mad Benji", staffId: "s1", staffName: "Sam",
      moduleId: "mFOH", moduleTitle: "FOH Opening", sections: mFOH.steps,
      checks: [true, true], itemsTotal: 2, progress: 100, status: "Complete",
      verified: true, verifiedBy: "Jo", verifyNote: "great on coffee",
    };
    expect(hasArchivableTraining(completed)).toBe(true);
    getDoc.mockResolvedValue({ exists: () => true, data: () => completed });

    const res = await archiveAndRemoveTraining("g1", completed, "reassigned");

    // archived (not destroyed), written to the trainingArchive collection (past-training source)
    expect(res).toEqual({ archived: true });
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [archiveRef, payload] = setDoc.mock.calls[0];
    expect(archiveRef.__col).toBe("g1/venues/v1/trainingArchive");
    expect(archiveRef.__id).toBe("auto-mFOH-shiftX");
    expect(payload.checks).toEqual([true, true]);          // completion preserved verbatim
    expect(payload.verifyNote).toBe("great on coffee");
    expect(payload.archivedReason).toBe("reassigned");
    // archive is written BEFORE the original is deleted (fail-safe), and only then freed
    expect(setDoc.mock.invocationCallOrder[0]).toBeLessThan(deleteDoc.mock.invocationCallOrder[0]);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc.mock.calls[0][0].__col).toBe("g1/venues/v1/trainingAssignments");

    // the replacement assignment starts blank again
    const fresh = { ...snapshotForAssign(mFOH), status: "Not started", progress: 0 };
    expect(fresh.checks).toEqual([false, false]);
    expect(isAssignmentLocked(fresh)).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════
// SCENARIO 2 — suggest and auto-assign do not contradict
// ════════════════════════════════════════════════════════════════════
describe("Scenario 2: suggest (matchScore) and auto-assign (shouldAutoAssign) agree", () => {
  const roster = [
    { id: "foh", area: "FOH", role: "FOH", venueIds: [V], stationIds: [] },
    { id: "boh", area: "BOH", role: "BOH", venueIds: [V], stationIds: [] },
    { id: "mgr", area: "Mgmt", role: "Manager", venueIds: [V], stationIds: [] },
    { id: "fohV2", area: "FOH", role: "FOH", venueIds: ["v2"], stationIds: [] }, // other venue
  ];

  test("everyone auto-assigned is also client-ELIGIBLE (auto ⊆ matcher) — never a contradiction", () => {
    const autoAssigned = roster.filter((s) => shouldAutoAssign(mFOH, s, V));
    const eligible = roster.filter((s) => moduleForStaff(mFOH, s));
    expect(autoAssigned.every((s) => eligible.includes(s))).toBe(true);
    // concretely: FOH-line is auto-assigned; BOH and the other-venue person are not
    expect(autoAssigned.map((s) => s.id)).toEqual(["foh"]);
  });

  test("the suggestion ordering never DROPS an auto-assigned person, and ranks them above zero-score staff", () => {
    const ordered = orderStaffForItem(roster, mFOH);
    expect(ordered).toHaveLength(roster.length); // nothing dropped
    const autoAssigned = roster.filter((s) => shouldAutoAssign(mFOH, s, V));
    autoAssigned.forEach((s) => expect(ordered).toContain(s));
    // the auto-assigned FOH person outranks a zero-score BOH person
    const boh = roster.find((s) => s.id === "boh");
    const foh = roster.find((s) => s.id === "foh");
    expect(ordered.indexOf(foh)).toBeLessThan(ordered.indexOf(boh));
  });

  test("for a role-targeted item, every auto-assigned person is a positive suggestion (score ≥ role weight)", () => {
    roster.filter((s) => shouldAutoAssign(mFOH, s, V)).forEach((s) => {
      expect(matchScore(mFOH, s)).toBeGreaterThanOrEqual(ROLE_WEIGHT);
      expect(isSuggested(mFOH, s)).toBe(true); // area-level match for the FOH-line
    });
  });
});

// ════════════════════════════════════════════════════════════════════
// SCENARIO 3 — config flows through with fallback; no phantom CK
// ════════════════════════════════════════════════════════════════════
describe("Scenario 3: config resolves with fallback, overrides when present, and CK is gone", () => {
  test("absent config (live null state) falls back to defaults incl. Junior", () => {
    for (const g of [null, {}, { areas: [], roles: [], empTypes: [] }]) {
      expect(resolveAreas(g)).toEqual(DEFAULT_AREAS);
      expect(resolveRoles(g)).toEqual(DEFAULT_ROLES);
      expect(resolveEmpTypes(g)).toEqual(DEFAULT_EMP_TYPES);
    }
    expect(DEFAULT_ROLES).toContain("Junior");
    expect(DEFAULT_EMP_TYPES).toContain("Junior");
  });

  test("present config overrides the defaults", () => {
    expect(resolveAreas({ areas: ["FOH", "Bar"] })).toEqual(["FOH", "Bar"]);
    expect(resolveRoles({ roles: ["Boss"] })).toEqual(["Boss"]);
    expect(resolveEmpTypes({ empTypes: ["Casual"] })).toEqual(["Casual"]);
    // and a Settings edit composes on top of the fallback (addToList over resolved roles)
    expect(addToList(resolveRoles(null), "Waitress")).toContain("Waitress");
  });

  test("phantom 'CK' appears NOWHERE — areas, roles, emp-types, bucketing, or area derivation", () => {
    const hasCK = (arr) => arr.some((x) => /^ck$|kitchen/i.test(x));
    expect(hasCK(DEFAULT_AREAS)).toBe(false);
    expect(hasCK(DEFAULT_ROLES)).toBe(false);
    expect(hasCK(DEFAULT_EMP_TYPES)).toBe(false);
    // area derivation: a "Central Kitchen" ROLE is kitchen work → BOH, never "CK" —
    // both for the rostered-shift path (areaFromRole) and the configured-matching
    // path (roleConfiguredArea, which replaced the deleted staffAreaBucket layer)
    for (const r of ["FOH", "BOH", "Chef", "Central Kitchen", "Store Manager", "Junior", "Kitchen Hand"]) {
      expect(roleConfiguredArea(r, ["FOH", "BOH", "Management"])).not.toMatch(/^ck$|kitchen/i);
      expect(areaFromRole(r)).not.toMatch(/ck|kitchen/i);
    }
    expect(roleConfiguredArea("Central Kitchen", ["FOH", "BOH", "Management"])).toBe("BOH");
    expect(areaFromRole("Central Kitchen")).toBe("BOH");
  });
});

// ════════════════════════════════════════════════════════════════════
// SCENARIO 4 — scheduled (home) vs shift-triggered (rostered) are deliberately different
// ════════════════════════════════════════════════════════════════════
describe("Scenario 4: rgRecurringChecklists is home-based, rgOnShiftCreated is rostered-based", () => {
  const cBOH = { id: "cBOH", venueId: V, venue: "Mad Benji", area: "BOH",
    items: ["wipe"], autoAssign: { roles: ["BOH"] }, frequency: "weekly" };
  const cFOH = { id: "cFOH", venueId: V, venue: "Mad Benji", area: "FOH",
    items: ["float"], autoAssign: { roles: ["FOH"] }, frequency: "weekly" };

  test("the SCHEDULER targets the staff's HOME identity (no shift in play)", () => {
    // rgRecurringChecklists filters staff.filter(shouldAutoAssign(c, s, v)) on the staff doc itself
    expect(shouldAutoAssign(cBOH, homeBOH, V)).toBe(true);  // BOH-home gets the BOH weekly
    expect(shouldAutoAssign(cFOH, homeBOH, V)).toBe(false); // not the FOH weekly
    // sanity: these are also what the client matcher would deem eligible for that person
    expect(checklistForStaff(cBOH, homeBOH)).toBe(true);
  });

  test("the SHIFT TRIGGER targets the ROSTERED identity for that shift", () => {
    const rostered = rosteredFromShift({ staffId: "s1", role: "FOH", venueId: V, stationId: "" }, V);
    expect(shouldAutoAssign(cFOH, rostered, V)).toBe(true);  // rostered FOH gets the FOH list
    expect(shouldAutoAssign(cBOH, rostered, V)).toBe(false); // not the BOH list for this shift
  });

  test("SAME person, deliberately different result: home → BOH items, rostered-FOH → FOH items", () => {
    const rosteredFOH = rosteredFromShift({ staffId: "s1", role: "FOH", venueId: V, stationId: "" }, V);
    // scheduler outcome for the person
    expect(shouldAutoAssign(cBOH, homeBOH, V)).toBe(true);
    expect(shouldAutoAssign(cFOH, homeBOH, V)).toBe(false);
    // shift outcome for the SAME person rostered FOH — the opposite, and that's intended
    expect(shouldAutoAssign(cFOH, rosteredFOH, V)).toBe(true);
    expect(shouldAutoAssign(cBOH, rosteredFOH, V)).toBe(false);
    // both internally consistent: each uses one predicate, fed a different (documented) identity
  });
});

// ════════════════════════════════════════════════════════════════════
// SCENARIO 5 — SOPs and Checklists are separate (presentation + permission), no shared data
// ════════════════════════════════════════════════════════════════════
describe("Scenario 5: SOP (training modules) and Checklist (own collection) resolve as separate", () => {
  test("they are DISTINCT nav items with distinct routes", () => {
    expect(SOPS_NAV.path).toBe("/rg/sops");
    expect(SOPS_NAV.path).not.toBe("/rg/checklists");
    expect(CHECKLISTS_NAV_LABEL).toBe("Checklists");
    expect(/sop/i.test(CHECKLISTS_NAV_LABEL)).toBe(false);
    expect(RG_MODULES.find((m) => m.key === "checklists").label).toBe("Checklists");
  });

  test("/rg/sops maps to the training-module library and respects the TRAINING permission", () => {
    expect(SOPS_NAV.permKey).toBe("training"); // SOPs reuse training's data + permission
    expect(RG_MODULE_KEYS).toContain("training");
    expect(RG_MODULE_KEYS).toContain("checklists");
    // SOPs is NOT a separate permission/data module — no new collection, no shared data with checklists
    expect(RG_MODULE_KEYS).not.toContain("sops");
  });

  test("no shared data: a training module (cat) and a checklist (area) are routed by different fields", () => {
    // training eligibility reads `cat`; checklist eligibility reads `area` — separate shapes
    const mod = { venueId: V, cat: "FOH" };
    const chk = { venueId: V, area: "FOH" };
    const s = { area: "FOH", role: "FOH", venueIds: [V] };
    expect(moduleForStaff(mod, s)).toBe(true);
    expect(checklistForStaff(chk, s)).toBe(true);
    // a module has no `area` and a checklist has no `cat` — they don't share the routing key
    expect(mod.area).toBeUndefined();
    expect(chk.cat).toBeUndefined();
  });
});

// ⚠ KEEP identical in all four parity test files (Admin ×2, Ops, Functions).
describe("missing-area ruling — neither cat nor area is NOT an implicit 'All'", () => {
  test("an item with neither cat nor area auto-assigns to nobody but see-all", () => {
    const orphan = {}; // no cat, no area, no autoAssign — an authoring oversight
    expect(shouldAutoAssign(orphan, { areas: ["FOH"], role: "FOH", venueIds: ["v1"] }, "v1")).toBe(false);
    expect(shouldAutoAssign(orphan, { area: "FOH", role: "FOH Supervisor", venueIds: ["v1"] }, "v1")).toBe(true);
  });
});
