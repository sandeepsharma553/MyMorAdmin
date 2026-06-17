/* Phase 3b tests — pure helpers + config, nothing real touched.
 * Suggest (Area→Station→Role ordering, fallback kept, no auto-create), the
 * completed-training LOCK predicate, and the SOP/Checklist nav split. */
import {
  matchScore, orderItemsForStaff, orderStaffForItem, isSuggested, isAssignmentLocked,
  AREA_WEIGHT, STATION_WEIGHT, ROLE_WEIGHT,
} from "./assignmentUtils";
import { SOPS_NAV, CHECKLISTS_NAV_LABEL, RG_MODULES, RG_MODULE_KEYS } from "./rgConfig";

const staff = (over = {}) => ({ id: "s1", area: "FOH", role: "FOH", stationIds: ["bar"], ...over });

describe("matchScore — Area dominates, then Station, then Role", () => {
  test("area match scores highest; station next; role next; nothing = 0", () => {
    const item = { cat: "FOH", stationId: "bar", autoAssign: { roles: ["FOH"] } };
    expect(matchScore(item, staff())).toBe(AREA_WEIGHT + STATION_WEIGHT + ROLE_WEIGHT);
    expect(matchScore({ cat: "FOH" }, staff({ stationIds: [], role: "" }))).toBe(AREA_WEIGHT);
    expect(matchScore({ cat: "BOH", stationId: "bar" }, staff())).toBe(STATION_WEIGHT); // area mismatch, station hit
    expect(matchScore({ cat: "BOH", autoAssign: { roles: ["FOH"] } }, staff())).toBe(ROLE_WEIGHT);
    expect(matchScore({ cat: "BOH" }, staff())).toBe(0);
  });
  test("ranking order: area > station > role", () => {
    expect(AREA_WEIGHT).toBeGreaterThan(STATION_WEIGHT);
    expect(STATION_WEIGHT).toBeGreaterThan(ROLE_WEIGHT);
  });
  test("a universal 'All' item is mildly relevant but below an area match", () => {
    expect(matchScore({ area: "All" }, staff())).toBeGreaterThan(0);
    expect(matchScore({ area: "All" }, staff())).toBeLessThan(AREA_WEIGHT);
  });
});

describe("ordering — suggestion only, fallback never dropped, no mutation", () => {
  const items = [
    { id: "m_none", cat: "BOH" },                                   // no match (fallback)
    { id: "m_area", cat: "FOH" },                                   // area match
    { id: "m_full", cat: "FOH", stationId: "bar", autoAssign: { roles: ["FOH"] } }, // best
  ];
  test("orders best-first AND keeps every input (valid fallback still included)", () => {
    const ordered = orderItemsForStaff(items, staff());
    expect(ordered.map((m) => m.id)).toEqual(["m_full", "m_area", "m_none"]);
    expect(ordered).toHaveLength(items.length);          // nothing dropped
    expect(new Set(ordered.map((m) => m.id))).toEqual(new Set(items.map((m) => m.id)));
  });
  test("does not mutate or create — same elements back, input array untouched", () => {
    const snapshot = items.map((m) => ({ ...m }));
    const ordered = orderItemsForStaff(items, staff());
    expect(items).toEqual(snapshot);                     // input unchanged (no side effects)
    expect(ordered).not.toBe(items);                     // returns a new array, creates nothing
  });
  test("orderStaffForItem ranks the matching staff first but keeps everyone", () => {
    const list = [staff({ id: "boh", area: "BOH", stationIds: [], role: "BOH" }), staff({ id: "foh" })];
    const ordered = orderStaffForItem(list, { cat: "FOH", stationId: "bar" });
    expect(ordered[0].id).toBe("foh");
    expect(ordered).toHaveLength(2);                     // fallback staff still present
  });
  test("isSuggested is true only for an area-level match", () => {
    expect(isSuggested({ cat: "FOH" }, staff())).toBe(true);
    expect(isSuggested({ cat: "BOH" }, staff())).toBe(false);
  });
});

describe("lock — a Complete assignment is read-only; reassign stays separate", () => {
  test("locked when Complete or verified; editable otherwise", () => {
    expect(isAssignmentLocked({ status: "Complete" })).toBe(true);
    expect(isAssignmentLocked({ verified: true })).toBe(true);
    expect(isAssignmentLocked({ status: "In progress" })).toBe(false);
    expect(isAssignmentLocked({ status: "Awaiting sign-off" })).toBe(false);
    expect(isAssignmentLocked({ status: "Not started" })).toBe(false);
    expect(isAssignmentLocked(null)).toBe(false);
  });
  // mirrors AssignmentDetail: effective edit caps fold in !locked; reassign is NOT gated here.
  const effectiveCaps = (caps, a) => {
    const locked = isAssignmentLocked(a);
    return { tickable: caps.canTick && !locked, verifiable: caps.canVerify && !locked, commentable: caps.canComment && !locked };
  };
  test("a Complete assignment rejects every edit action", () => {
    const caps = effectiveCaps({ canTick: true, canVerify: true, canComment: true }, { status: "Complete" });
    expect(caps).toEqual({ tickable: false, verifiable: false, commentable: false });
  });
  test("an in-progress assignment keeps the caller's edit caps", () => {
    const caps = effectiveCaps({ canTick: true, canVerify: true, canComment: true }, { status: "In progress" });
    expect(caps).toEqual({ tickable: true, verifiable: true, commentable: true });
  });
});

describe("SOP / Checklist nav split — presentation only, data intact", () => {
  test("SOPs is a distinct nav item from Checklists, reusing the training permission", () => {
    expect(SOPS_NAV.path).toBe("/rg/sops");
    expect(SOPS_NAV.path).not.toBe("/rg/checklists");
    expect(SOPS_NAV.permKey).toBe("training");           // reuses training data/permission — no new module
    expect(SOPS_NAV.label).toBe("SOPs");
  });
  test("the Checklists item is now plainly 'Checklists' (no 'SOPs' in the label)", () => {
    expect(CHECKLISTS_NAV_LABEL).toBe("Checklists");
    expect(/sop/i.test(CHECKLISTS_NAV_LABEL)).toBe(false);
    expect(RG_MODULES.find((m) => m.key === "checklists").label).toBe("Checklists");
  });
  test("no new permission/data module was added (SOPs is NOT a module key)", () => {
    expect(RG_MODULE_KEYS).toContain("training");
    expect(RG_MODULE_KEYS).toContain("checklists");
    expect(RG_MODULE_KEYS).not.toContain("sops");        // data intact: checklists + training only
  });
});
