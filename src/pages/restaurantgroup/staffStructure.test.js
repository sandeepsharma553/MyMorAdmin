/* Area/Role/Station foundation (phase 2) tests — pure helpers, nothing real touched.
 * Covers: areas/roles read from config with fallback; Settings add/remove logic;
 * Junior present in defaults; no phantom CK anywhere; no staff mis-bucketed to CK;
 * config resolution never mutates the group doc (existing data untouched by the seed). */
import { resolveAreas, resolveRoles, resolveEmpTypes, addToList, removeFromList, staffAreas, roleConfiguredArea, isMultiArea, stationsForVenue, stationsInVenueArea, orphanStationsInVenue, buildStationPayload, staffAtStation } from "./staffStructureUtils";
import { DEFAULT_AREAS, DEFAULT_ROLES, DEFAULT_EMP_TYPES } from "./rgConfig";

describe("config resolution with fallback", () => {
  test("falls back to defaults when the group has no areas/roles", () => {
    expect(resolveAreas(null)).toEqual(["FOH", "BOH"]);
    expect(resolveAreas({})).toEqual(["FOH", "BOH"]);
    expect(resolveAreas({ areas: [] })).toEqual(["FOH", "BOH"]);
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
  test("default areas are exactly FOH/BOH — no CK/Kitchen and no legacy Mgmt token", () => {
    expect(DEFAULT_AREAS).toEqual(["FOH", "BOH"]);
    expect([...DEFAULT_AREAS, ...DEFAULT_ROLES].some((x) => /^ck$|kitchen|^mgmt$/i.test(x))).toBe(false);
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
    expect(removeFromList(["FOH", "BOH", "Bar"], "Bar")).toEqual(["FOH", "BOH"]);
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

// (staffAreaBucket / staffAreaBuckets tests removed with the helpers — the caller-less
// keyword-bucket layer was deleted in the legacy-"Mgmt" removal. Inference is now
// roleConfiguredArea below: it matches the group's CONFIGURED areas and returns the
// owner's own spelling, never a baked-in token.)
// ⚠ KEEP this describe identical in spirit to the Ops staffStructureUtils.test.js block.
describe("roleConfiguredArea — role inference against CONFIGURED areas", () => {
  const LIVE = ["FOH", "BOH", "Management"]; // the live group's config
  test("managerial roles find the group's own management spelling", () => {
    expect(roleConfiguredArea("Manager", LIVE)).toBe("Management");
    expect(roleConfiguredArea("FOH Supervisor", LIVE)).toBe("Management"); // managerial beats FOH
    expect(roleConfiguredArea("Manager", ["FOH", "BOH", "Leadership"])).toBe("Leadership");
  });
  test("no management-flavoured area configured → '' (never falls through to FOH/BOH)", () => {
    expect(roleConfiguredArea("Manager", ["FOH", "BOH"])).toBe("");
  });
  test("FOH/BOH roles resolve to the configured FOH/BOH", () => {
    expect(roleConfiguredArea("FOH", LIVE)).toBe("FOH");
    expect(roleConfiguredArea("Grill Chef", LIVE)).toBe("BOH");
    expect(roleConfiguredArea("Barista", LIVE)).toBe("FOH");
  });
  test("unknown role or empty config → ''", () => {
    expect(roleConfiguredArea("Junior", LIVE)).toBe("");
    expect(roleConfiguredArea("Manager", [])).toBe("");
    expect(roleConfiguredArea("", LIVE)).toBe("");
  });
});

// ⚠ KEEP identical in Admin staffStructure.test.js / Ops staffStructureUtils.test.js.
// Twin contract: isMultiArea must stay equivalent to groupRowsFor's __multi__ branch
// (ShiftPlannerPage :355-361 — 2+ DISTINCT areas AND none of them exclusive), because
// the directory's Multi-area chip and the planner's Multi-area section must bucket the
// SAME person the SAME way; nothing else enforces that equivalence.
describe("isMultiArea — the planner's Multi-area membership (2+ distinct areas, none exclusive)", () => {
  const G = { areas: ["FOH", "BOH", "Management"], areaExclusive: { Management: true } }; // live shape
  test("2+ non-exclusive areas → multi", () => {
    expect(isMultiArea({ areas: ["FOH", "BOH"] }, G)).toBe(true);
  });
  test("exclusive capture: any exclusive area pulls them OUT of Multi-area (Mei)", () => {
    expect(isMultiArea({ areas: ["FOH", "BOH", "Management"] }, G)).toBe(false);
    expect(isMultiArea({ areas: ["Management"] }, G)).toBe(false); // single AND exclusive
  });
  test("single or no areas → not multi", () => {
    expect(isMultiArea({ areas: ["FOH"] }, G)).toBe(false);
    expect(isMultiArea({ areas: [] }, G)).toBe(false);
  });
  test("dedupe + Boolean filter mirror groupRowsFor's sAreas", () => {
    expect(isMultiArea({ areas: ["FOH", "FOH"] }, G)).toBe(false);    // same area twice is not multi
    expect(isMultiArea({ areas: ["FOH", "", null] }, G)).toBe(false); // falsy entries dropped first
  });
  test("no exclusives configured at all → 2+ areas is multi", () => {
    expect(isMultiArea({ areas: ["FOH", "BOH", "Management"] }, { areas: ["FOH", "BOH", "Management"] })).toBe(true);
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
