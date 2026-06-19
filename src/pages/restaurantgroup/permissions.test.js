/* Permission core — the 4th level `approve` (ranked above edit). Proves the new level
 * is monotonic and that NOTHING about the existing none/view/edit gates changed. */
import { hasLevel, levelMeta, LEVELS, DEFAULT_PERMISSIONS, defaultPermsForRole } from "./rgConfig";

const p = (lvl) => ({ leave: lvl });

describe("hasLevel — monotonic 'has at least this level'", () => {
  test("LEVELS exposes the new approve level", () => {
    expect(LEVELS.APPROVE).toBe("approve");
  });
  test("approve (top) passes view/edit/approve", () => {
    expect(hasLevel(p("approve"), "leave", "view")).toBe(true);
    expect(hasLevel(p("approve"), "leave", "edit")).toBe(true);
    expect(hasLevel(p("approve"), "leave", "approve")).toBe(true);
  });
  test("edit passes view/edit but NOT approve", () => {
    expect(hasLevel(p("edit"), "leave", "view")).toBe(true);
    expect(hasLevel(p("edit"), "leave", "edit")).toBe(true);
    expect(hasLevel(p("edit"), "leave", "approve")).toBe(false);
  });
  test("view passes view but NOT edit/approve", () => {
    expect(hasLevel(p("view"), "leave", "view")).toBe(true);
    expect(hasLevel(p("view"), "leave", "edit")).toBe(false);
    expect(hasLevel(p("view"), "leave", "approve")).toBe(false);
  });
  test("none / missing module / null map blocks everything", () => {
    expect(hasLevel(p("none"), "leave", "view")).toBe(false);
    expect(hasLevel({}, "leave", "view")).toBe(false);
    expect(hasLevel(null, "leave", "edit")).toBe(false);
  });
});

describe("REGRESSION — adding approve(3) did not change any none/view/edit comparison", () => {
  const OLD = ["none", "view", "edit"];
  // the pre-approve truth table — must be reproduced exactly
  const expected = {
    "none|none": true, "none|view": false, "none|edit": false,
    "view|none": true, "view|view": true, "view|edit": false,
    "edit|none": true, "edit|view": true, "edit|edit": true,
  };
  test("every (have, required) over none/view/edit is unchanged", () => {
    for (const have of OLD) for (const required of OLD) {
      expect(hasLevel({ m: have }, "m", required)).toBe(expected[`${have}|${required}`]);
    }
  });
});

describe("levelMeta renders the new level distinctly", () => {
  test("approve has its own label; the others are unchanged", () => {
    expect(levelMeta("approve").label).toMatch(/approve/i);
    expect(levelMeta("approve")).not.toEqual(levelMeta("nonsense")); // not the None fallback
    expect(levelMeta("edit").label).toMatch(/edit/i);
    expect(levelMeta("view").label).toMatch(/view/i);
    expect(levelMeta("none").label).toMatch(/none/i);
  });
});

describe("seeded defaults — leave:approve only where intended", () => {
  test("owner + storeAdmin get leave:approve; manager edit; staff view", () => {
    expect(DEFAULT_PERMISSIONS.owner.leave).toBe("approve");
    expect(DEFAULT_PERMISSIONS.storeAdmin.leave).toBe("approve");
    expect(DEFAULT_PERMISSIONS.manager.leave).toBe("edit");
    expect(DEFAULT_PERMISSIONS.staff.leave).toBe("view");
  });
  test("approve was NOT seeded onto any OTHER module for any role", () => {
    for (const role of Object.keys(DEFAULT_PERMISSIONS)) {
      for (const [mod, lvl] of Object.entries(DEFAULT_PERMISSIONS[role])) {
        if (mod !== "leave") expect(lvl).not.toBe("approve");
      }
    }
  });
  test("other modules' edit defaults unchanged (spot-checks)", () => {
    expect(DEFAULT_PERMISSIONS.owner.staff).toBe("edit");
    expect(DEFAULT_PERMISSIONS.manager.shifts).toBe("edit");
    expect(DEFAULT_PERMISSIONS.staff.checklists).toBe("edit");
  });
});

describe("leave gating — submit (edit) vs approve, role-tier dropped", () => {
  // mirrors the re-gated LeaveRequestsPage: canApprove = can("leave","approve")
  const canApprove = (perms) => hasLevel(perms, "leave", "approve");
  test("non-approvers (edit/view default) do NOT get approve; owner/storeAdmin do", () => {
    expect(canApprove(defaultPermsForRole("manager"))).toBe(false); // leave edit
    expect(canApprove(defaultPermsForRole("staff"))).toBe(false);   // leave view
    expect(canApprove(defaultPermsForRole("owner"))).toBe(true);
    expect(canApprove(defaultPermsForRole("storeAdmin"))).toBe(true);
  });
  test("granting approve per-person enables it regardless of role/area", () => {
    expect(canApprove({ ...defaultPermsForRole("staff"), leave: "approve" })).toBe(true);
  });
});
