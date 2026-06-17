/* Phase 3a Parts B & C tests — pure helpers, nothing real touched.
 * Part B: Junior employment type via config with fallback; existing types intact.
 * Part C: the (reused) minor/Junior logic flags a Junior/under-18 staff member and
 * not an adult — using a fixed `asOf` so the assertions are deterministic. */
import { resolveEmpTypes } from "./staffStructureUtils";
import { DEFAULT_EMP_TYPES } from "./rgConfig";
import { isJuniorType, isMinorDob, daysToEighteen, parseDob } from "./staffMinorUtils";

const ASOF = new Date("2026-06-17T00:00:00"); // deterministic "today"

describe("Part B — Junior employment type (config + fallback)", () => {
  test("falls back to the defaults when the group has no empTypes", () => {
    expect(resolveEmpTypes(null)).toEqual(["Casual", "Part-time", "Full-time", "Junior"]);
    expect(resolveEmpTypes({})).toEqual(DEFAULT_EMP_TYPES);
    expect(resolveEmpTypes({ empTypes: [] })).toEqual(DEFAULT_EMP_TYPES);
  });
  test("Junior is present and the original three types are unchanged", () => {
    expect(DEFAULT_EMP_TYPES).toEqual(["Casual", "Part-time", "Full-time", "Junior"]);
    expect(["Casual", "Part-time", "Full-time"].every((t) => DEFAULT_EMP_TYPES.includes(t))).toBe(true);
  });
  test("uses group config when present (and never mutates the group)", () => {
    const g = { empTypes: ["Casual", "Salaried"] };
    const snap = JSON.parse(JSON.stringify(g));
    expect(resolveEmpTypes(g)).toEqual(["Casual", "Salaried"]);
    expect(g).toEqual(snap);
  });
});

describe("Part C — isJuniorType (public employment type)", () => {
  test("true for Junior in any case / padding, false otherwise", () => {
    expect(isJuniorType("Junior")).toBe(true);
    expect(isJuniorType("junior")).toBe(true);
    expect(isJuniorType("  JUNIOR ")).toBe(true);
    expect(isJuniorType("Casual")).toBe(false);
    expect(isJuniorType("")).toBe(false);
    expect(isJuniorType(undefined)).toBe(false);
  });
});

describe("Part C — under-18 DOB math (reused Turning18 logic)", () => {
  test("a clearly under-18 DOB is a minor with a positive countdown", () => {
    expect(isMinorDob("2010-01-01", ASOF)).toBe(true);
    expect(daysToEighteen("2010-01-01", ASOF)).toBeGreaterThan(0);
  });
  test("an adult DOB is not a minor and the countdown is negative", () => {
    expect(isMinorDob("1990-01-01", ASOF)).toBe(false);
    expect(daysToEighteen("1990-01-01", ASOF)).toBeLessThan(0);
  });
  test("the 18th birthday itself is NOT a minor (boundary)", () => {
    expect(isMinorDob("2008-06-17", ASOF)).toBe(false); // turns 18 today
    expect(daysToEighteen("2008-06-17", ASOF)).toBe(0);
  });
  test("no DOB → not a minor, null countdown", () => {
    expect(isMinorDob("", ASOF)).toBe(false);
    expect(parseDob("")).toBeNull();
    expect(daysToEighteen(null, ASOF)).toBeNull();
  });
});

// Mirrors exactly how Turning18Alert classifies each staff member.
const classify = (staffPublic, dobStr) => {
  const dob = parseDob(dobStr);
  const days = dob ? daysToEighteen(dob, ASOF) : null;
  if (days !== null && days <= 30 && days >= -14) return "imminent";        // existing flag (writes)
  if ((dob && isMinorDob(dob, ASOF)) || isJuniorType(staffPublic.type)) return "surface"; // read-only
  return "none";
};

describe("Part C — the alert triggers for Junior/under-18, not for adults", () => {
  test("under-18 (not imminent) is surfaced", () => {
    expect(classify({ type: "Casual" }, "2012-05-01")).toBe("surface");
  });
  test("about-to-turn-18 stays in the imminent (write) flow", () => {
    expect(classify({ type: "Casual" }, "2008-06-27")).toBe("imminent"); // turns 18 in ~10d
  });
  test("Junior employment type with no DOB is surfaced", () => {
    expect(classify({ type: "Junior" }, "")).toBe("surface");
  });
  test("an adult, non-Junior staff member is NOT flagged", () => {
    expect(classify({ type: "Full-time" }, "1995-03-03")).toBe("none");
  });
});
