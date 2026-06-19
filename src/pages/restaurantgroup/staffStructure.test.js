/* Area/Role/Station foundation (phase 2) tests — pure helpers, nothing real touched.
 * Covers: areas/roles read from config with fallback; Settings add/remove logic;
 * Junior present in defaults; no phantom CK anywhere; no staff mis-bucketed to CK;
 * config resolution never mutates the group doc (existing data untouched by the seed). */
import { resolveAreas, resolveRoles, resolveEmpTypes, addToList, removeFromList, staffAreaBucket, staffAreas, staffAreaBuckets, stationsForVenue, stationsInVenueArea, orphanStationsInVenue, buildStationPayload, staffAtStation } from "./staffStructureUtils";
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

describe("stationsForVenue — Add-staff cascade (area + venue filter, fixes the bugs)", () => {
  const stations = [
    { id: "b1", name: "Bar", area: "FOH", venueId: "v1" },
    { id: "g1", name: "Grill", area: "BOH", venueId: "v1" },
    { id: "g2", name: "Grill", area: "BOH", venueId: "v2" }, // same NAME, different venue
    { id: "c2", name: "Counter", area: "FOH", venueId: "v2" },
  ];
  test("filters to ONLY the venue's stations whose area is in the selected areas", () => {
    // a BOH-only person at v1 no longer sees the FOH 'Bar' (the all-stations bug)
    expect(stationsForVenue(stations, "v1", ["BOH"]).map((s) => s.id)).toEqual(["g1"]);
    expect(stationsForVenue(stations, "v1", ["FOH"]).map((s) => s.id)).toEqual(["b1"]);
    expect(stationsForVenue(stations, "v1", ["FOH", "BOH"]).map((s) => s.id)).toEqual(["b1", "g1"]);
  });
  test("scopes to the one venue — the other venue's look-alike 'Grill' never leaks in", () => {
    expect(stationsForVenue(stations, "v1", ["BOH"]).map((s) => s.venueId)).toEqual(["v1"]); // not v2's g2
    expect(stationsForVenue(stations, "v2", ["BOH"]).map((s) => s.id)).toEqual(["g2"]);
  });
  test("no areas selected yet → all of that venue's stations (then they narrow as areas are picked)", () => {
    expect(stationsForVenue(stations, "v1", []).map((s) => s.id)).toEqual(["b1", "g1"]);
  });
});

describe("Settings linked authoring — Venue → Area → Station", () => {
  const stations = [
    { id: "bar", name: "Bar", area: "FOH", venueId: "v1" },
    { id: "grill", name: "Grill", area: "BOH", venueId: "v1" },
    { id: "g2", name: "Grill", area: "BOH", venueId: "v2" },
    { id: "old", name: "Pass", area: "Kitchen", venueId: "v1" }, // area no longer configured
  ];
  test("stationsInVenueArea groups existing stations by venue→area", () => {
    expect(stationsInVenueArea(stations, "v1", "FOH").map((s) => s.id)).toEqual(["bar"]);
    expect(stationsInVenueArea(stations, "v1", "BOH").map((s) => s.id)).toEqual(["grill"]); // not v2's g2
    expect(stationsInVenueArea(stations, "v2", "BOH").map((s) => s.id)).toEqual(["g2"]);
  });
  test("orphanStationsInVenue surfaces stations whose area isn't in the configured list", () => {
    expect(orphanStationsInVenue(stations, "v1", ["FOH", "BOH"]).map((s) => s.id)).toEqual(["old"]);
    expect(orphanStationsInVenue(stations, "v1", ["FOH", "BOH", "Kitchen"])).toEqual([]); // configured → not orphan
  });
  test("buildStationPayload takes area + venueId FROM THE CONTEXT (not picked separately)", () => {
    expect(buildStationPayload("  Salad  ", "BOH", "v1", "#2563eb", 3)).toEqual({
      name: "Salad", area: "BOH", venueId: "v1", color: "#2563eb", order: 3,
    });
    // a station authored under (v2, FOH) carries exactly that venue + area
    const p = buildStationPayload("Counter", "FOH", "v2", "", 0);
    expect(p.venueId).toBe("v2");
    expect(p.area).toBe("FOH");
  });
});

describe("staffAtStation — Shift Planner station drill-down (rostered OR tagged)", () => {
  const weekShifts = [
    { staffId: "s1", stationId: "bar" },   // rostered at bar
    { staffId: "s2", stationId: "" },      // rostered, no station
    { staffId: "s3", stationId: "grill" },
  ];
  test("'all' / empty / null → everyone (no filter)", () => {
    expect(staffAtStation({ id: "x" }, "all", weekShifts)).toBe(true);
    expect(staffAtStation({ id: "x" }, "", weekShifts)).toBe(true);
    expect(staffAtStation({ id: "x" }, null, weekShifts)).toBe(true);
  });
  test("tagged the station → true (even if not rostered there this week)", () => {
    expect(staffAtStation({ id: "z", stationIds: ["bar"] }, "bar", [])).toBe(true);
  });
  test("ROSTERED at the station but NOT tagged → still true (not hidden — the flagged edge)", () => {
    expect(staffAtStation({ id: "s1", stationIds: [] }, "bar", weekShifts)).toBe(true);
  });
  test("neither rostered nor tagged → false", () => {
    expect(staffAtStation({ id: "nobody", stationIds: ["counter"] }, "bar", weekShifts)).toBe(false);
    expect(staffAtStation({ id: "s3", stationIds: ["grill"] }, "bar", weekShifts)).toBe(false); // grill person, not bar
  });
});
