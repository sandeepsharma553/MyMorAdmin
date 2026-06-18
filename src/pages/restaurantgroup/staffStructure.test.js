/* Area/Role/Station foundation (phase 2) tests — pure helpers, nothing real touched.
 * Covers: areas/roles read from config with fallback; Settings add/remove logic;
 * Junior present in defaults; no phantom CK anywhere; no staff mis-bucketed to CK;
 * config resolution never mutates the group doc (existing data untouched by the seed). */
import { resolveAreas, resolveRoles, resolveEmpTypes, addToList, removeFromList, staffAreaBucket, staffAreas, staffAreaBuckets } from "./staffStructureUtils";
import { DEFAULT_AREAS, DEFAULT_ROLES, DEFAULT_EMP_TYPES } from "./rgConfig";

describe("config resolution with fallback", () => {
  test("falls back to defaults when the group has no areas/roles", () => {
    expect(resolveAreas(null)).toEqual(["FOH", "BOH", "Mgmt"]);
    expect(resolveAreas({})).toEqual(["FOH", "BOH", "Mgmt"]);
    expect(resolveAreas({ areas: [] })).toEqual(["FOH", "BOH", "Mgmt"]);
    expect(resolveRoles({ roles: [] })).toEqual(DEFAULT_ROLES);
    expect(resolveRoles(null)).toEqual(DEFAULT_ROLES);
  });
  test("uses the group config when present", () => {
    expect(resolveAreas({ areas: ["FOH", "BOH", "Bar"] })).toEqual(["FOH", "BOH", "Bar"]);
    expect(resolveRoles({ roles: ["Boss"] })).toEqual(["Boss"]);
  });
  test("never mutates the group object (existing docs untouched by the seed)", () => {
    const g = { areas: ["FOH"], roles: ["Manager"] };
    const snap = JSON.parse(JSON.stringify(g));
    resolveAreas(g); resolveRoles(g);
    expect(g).toEqual(snap);
  });
});

describe("defaults", () => {
  test("Junior is in the default roles, exactly once", () => {
    expect(DEFAULT_ROLES.filter((r) => r === "Junior")).toEqual(["Junior"]);
  });
  test("default areas are exactly FOH/BOH/Mgmt — no CK/Kitchen anywhere", () => {
    expect(DEFAULT_AREAS).toEqual(["FOH", "BOH", "Mgmt"]);
    expect([...DEFAULT_AREAS, ...DEFAULT_ROLES].some((x) => /^ck$|kitchen/i.test(x))).toBe(false);
  });
});

describe("Settings add/remove list logic", () => {
  test("addToList appends a new value", () => {
    expect(addToList(["FOH", "BOH"], "Bar")).toEqual(["FOH", "BOH", "Bar"]);
  });
  test("addToList trims + de-dupes case-insensitively, returning the SAME ref so callers skip the write", () => {
    const list = ["FOH", "BOH"];
    expect(addToList(list, "  foh ")).toBe(list);
    expect(addToList(list, "")).toBe(list);
  });
  test("removeFromList removes the value (existing entries kept)", () => {
    expect(removeFromList(["FOH", "BOH", "Mgmt"], "Mgmt")).toEqual(["FOH", "BOH"]);
  });
  test("seeding 'Junior' into an existing roles[] keeps every existing role", () => {
    const live = ["Manager", "FOH", "BOH", "Chef"];
    expect(addToList(live, "Junior")).toEqual([...live, "Junior"]);
    expect(addToList([...live, "Junior"], "junior")).toEqual([...live, "Junior"]); // no dup
  });
});

// Employment-types Settings editor — same addToList/removeFromList + resolveEmpTypes
// pattern as Areas/Roles (the editor handlers call updateDoc(groupDoc, { empTypes })).
describe("Settings: employment-types editor logic mirrors Areas/Roles", () => {
  test("absent config falls back to the seeded defaults (incl. Junior)", () => {
    expect(resolveEmpTypes(null)).toEqual(DEFAULT_EMP_TYPES);
    expect(resolveEmpTypes({ empTypes: [] })).toEqual(DEFAULT_EMP_TYPES);
    expect(DEFAULT_EMP_TYPES).toContain("Junior");
  });
  test("add appends (case-insensitively de-duped); remove drops; existing kept", () => {
    expect(addToList(DEFAULT_EMP_TYPES, "Apprentice")).toEqual([...DEFAULT_EMP_TYPES, "Apprentice"]);
    expect(addToList(DEFAULT_EMP_TYPES, "casual")).toBe(DEFAULT_EMP_TYPES); // dup → same ref, no write
    expect(removeFromList(DEFAULT_EMP_TYPES, "Junior")).toEqual(["Casual", "Part-time", "Full-time"]);
  });
  test("present config overrides the defaults (what the Add-staff dropdown then shows)", () => {
    expect(resolveEmpTypes({ empTypes: ["Casual", "Apprentice"] })).toEqual(["Casual", "Apprentice"]);
  });
});

describe("staffAreaBucket — phantom CK removed", () => {
  // the 7 distinct live staff.role values from the read-only data check
  const LIVE_ROLES = ["FOH", "BOH", "Chef", "FOH Supervisor", "BOH / Manager", "Manager", "BOH In Charge"];
  test("never returns CK/Kitchen for any live role", () => {
    for (const role of LIVE_ROLES) expect(staffAreaBucket({ role })).not.toMatch(/ck|kitchen/i);
  });
  test("buckets kitchen/chef → BOH, managers/supervisors → Mgmt, FOH → FOH", () => {
    expect(staffAreaBucket({ role: "Chef" })).toBe("BOH");
    expect(staffAreaBucket({ role: "Kitchen Hand" })).toBe("BOH");
    expect(staffAreaBucket({ role: "Manager" })).toBe("Mgmt");
    expect(staffAreaBucket({ role: "BOH In Charge" })).toBe("Mgmt");
    expect(staffAreaBucket({ role: "FOH Supervisor" })).toBe("Mgmt");
    expect(staffAreaBucket({ role: "FOH" })).toBe("FOH");
  });
  test("explicit FOH/BOH/Mgmt area passes through", () => {
    expect(staffAreaBucket({ area: "Mgmt", role: "FOH" })).toBe("Mgmt");
    expect(staffAreaBucket({ area: "BOH", role: "Manager" })).toBe("BOH");
    expect(staffAreaBucket({ area: "FOH", role: "Chef" })).toBe("FOH");
  });
  test("a legacy area:'CK' no longer sticks — it re-buckets by role, never to CK", () => {
    expect(staffAreaBucket({ area: "CK", role: "Chef" })).toBe("BOH");
    expect(staffAreaBucket({ area: "CK", role: "FOH" })).toBe("FOH");
    expect(staffAreaBucket({ area: "CK", role: "Manager" })).toBe("Mgmt");
  });
});

describe("staffAreas — list with backward-compat fallback", () => {
  test("prefers areas[], falls back to legacy [area], else []", () => {
    expect(staffAreas({ areas: ["FOH", "BOH"] })).toEqual(["FOH", "BOH"]);
    expect(staffAreas({ area: "FOH" })).toEqual(["FOH"]);          // un-migrated doc
    expect(staffAreas({ areas: [], area: "BOH" })).toEqual(["BOH"]); // empty areas → fall back
    expect(staffAreas({ role: "FOH" })).toEqual([]);               // neither set
  });
});

describe("staffAreaBuckets — a multi-area person appears under EACH group", () => {
  test("multi-area → one bucket per area", () => {
    expect(staffAreaBuckets({ areas: ["FOH", "BOH"] }).sort()).toEqual(["BOH", "FOH"]);
    expect(staffAreaBuckets({ areas: ["FOH", "BOH", "Mgmt"] }).sort()).toEqual(["BOH", "FOH", "Mgmt"]);
  });
  test("single area → single bucket; custom 'Kitchen' folds to BOH", () => {
    expect(staffAreaBuckets({ areas: ["FOH"] })).toEqual(["FOH"]);
    expect(staffAreaBuckets({ areas: ["Kitchen"] })).toEqual(["BOH"]); // custom area → known bucket
  });
  test("no areas → falls back to the single role-based bucket (never dropped)", () => {
    expect(staffAreaBuckets({ role: "Chef" })).toEqual(["BOH"]);
    expect(staffAreaBuckets({ area: "FOH" })).toEqual(["FOH"]); // legacy single still works
  });
});
