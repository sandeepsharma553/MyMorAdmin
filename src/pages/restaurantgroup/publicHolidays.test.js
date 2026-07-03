import {
  AU_STATES,
  AU_PUBLIC_HOLIDAYS_SEED,
  isPublicHoliday,
  holidayName,
  holidaysForState,
  isPHForAnyState,
  normalizeState,
  venueState,
} from "./publicHolidays";

const H = [
  { date: "2026-01-01", name: "New Year's Day", state: "ALL" }, // national
  { date: "2026-11-03", name: "Melbourne Cup", state: "VIC" },  // VIC-only
];

describe("isPublicHoliday", () => {
  test("national holiday matches any state", () => {
    expect(isPublicHoliday("2026-01-01", "NSW", H)).toBe(true);
    expect(isPublicHoliday("2026-01-01", "VIC", H)).toBe(true);
    expect(isPublicHoliday("2026-01-01", "WA", H)).toBe(true);
  });
  test("state-specific holiday matches only that state", () => {
    expect(isPublicHoliday("2026-11-03", "VIC", H)).toBe(true);
    expect(isPublicHoliday("2026-11-03", "NSW", H)).toBe(false);
  });
  test("non-holiday date is false", () => {
    expect(isPublicHoliday("2026-07-15", "VIC", H)).toBe(false);
  });
  test("tolerates missing/empty holidays array", () => {
    expect(isPublicHoliday("2026-01-01", "VIC", undefined)).toBe(false);
    expect(isPublicHoliday("2026-01-01", "VIC", [])).toBe(false);
  });
});

describe("holidayName", () => {
  test("returns name for national + state, '' otherwise", () => {
    expect(holidayName("2026-01-01", "QLD", H)).toBe("New Year's Day");
    expect(holidayName("2026-11-03", "VIC", H)).toBe("Melbourne Cup");
    expect(holidayName("2026-11-03", "NSW", H)).toBe("");
    expect(holidayName("2026-07-15", "VIC", H)).toBe("");
  });
});

describe("holidaysForState", () => {
  test("includes national + that state, excludes other states", () => {
    const vic = holidaysForState(H, "VIC");
    expect(vic).toHaveLength(2);
    const nsw = holidaysForState(H, "NSW");
    expect(nsw.map((h) => h.name)).toEqual(["New Year's Day"]);
  });
});

describe("isPHForAnyState", () => {
  test("true when a state in the list has the holiday", () => {
    expect(isPHForAnyState("2026-11-03", ["NSW", "VIC"], H)).toBe(true); // VIC matches
    expect(isPHForAnyState("2026-11-03", ["NSW", "QLD"], H)).toBe(false); // none match
    expect(isPHForAnyState("2026-01-01", ["NSW"], H)).toBe(true); // national
  });
});

describe("seed", () => {
  test("8 states defined", () => {
    expect(AU_STATES).toContain("VIC");
    expect(AU_STATES).toHaveLength(8);
  });
  test("every seed entry has valid shape + state", () => {
    AU_PUBLIC_HOLIDAYS_SEED.forEach((h) => {
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof h.name).toBe("string");
      expect(h.state === "ALL" || AU_STATES.includes(h.state)).toBe(true);
    });
  });
  test("a VIC-only seed date is PH for VIC but not NSW", () => {
    expect(isPublicHoliday("2026-11-03", "VIC", AU_PUBLIC_HOLIDAYS_SEED)).toBe(true);
    expect(isPublicHoliday("2026-11-03", "NSW", AU_PUBLIC_HOLIDAYS_SEED)).toBe(false);
  });
});

describe("normalizeState", () => {
  test("codes pass through (incl. lowercase/whitespace)", () => {
    expect(normalizeState("VIC")).toBe("VIC");
    expect(normalizeState("vic")).toBe("VIC");
    expect(normalizeState("  nsw ")).toBe("NSW");
  });
  test("full names map to codes", () => {
    expect(normalizeState("Victoria")).toBe("VIC");
    expect(normalizeState("new south wales")).toBe("NSW");
    expect(normalizeState("AUSTRALIAN CAPITAL TERRITORY")).toBe("ACT");
  });
  test("unknown values return null — never guesses", () => {
    expect(normalizeState("Melbourne")).toBe(null);
    expect(normalizeState("Vic.")).toBe(null);
    expect(normalizeState("")).toBe(null);
    expect(normalizeState(null)).toBe(null);
    expect(normalizeState(undefined)).toBe(null);
  });
});

describe("venueState", () => {
  test("prefers top-level state, normalised", () => {
    expect(venueState({ state: "vic" })).toBe("VIC");
    expect(venueState({ state: "VIC", address: { state: "NSW" } })).toBe("VIC");
  });
  test("falls back to address.state when top-level absent", () => {
    expect(venueState({ address: { state: "Victoria" } })).toBe("VIC");
    expect(venueState({ address: { state: "QLD" } })).toBe("QLD");
  });
  test("null for no state anywhere / unknown / no venue", () => {
    expect(venueState({})).toBe(null);
    expect(venueState({ address: { state: "somewhere" } })).toBe(null);
    expect(venueState(null)).toBe(null);
  });
});
