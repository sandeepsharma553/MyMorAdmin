/* shiftSectionArea — which ONE area section a single SHIFT belongs to (the Calendar
 * day detail). STRICT AREA-ONLY: for any staffer WITH areas this mirrors
 * ShiftPlannerPage groupRowsFor:355-361 exactly — venue areas → exclusive capture →
 * single area → "__multi__". The shift's station and role decide NOTHING when areas
 * exist; they survive only in the no-staff-doc fallback (station → role → "__none__")
 * so a shift is never dropped from the popup. Fixtures mirror the LIVE group shape
 * and the Tue 21 Jul 2026 audit cases. */
import { shiftSectionArea } from "./staffStructureUtils";

const G = { areas: ["FOH", "BOH", "Management"], areaExclusive: { Management: true }, areaPinned: { Management: true }, areaOrder: null };
const V = "mad-benji";
const STATIONS = [
  { id: "pass", name: "Pass", venueId: V, area: "BOH" },
  { id: "prep", name: "Prep", venueId: V, area: "BOH" },
  { id: "barista-cold-drinks", name: "Barista & Cold Drinks", venueId: V, area: "FOH" },
];
const sh = (over) => ({ venueId: V, stationId: "", role: "", ...over });

describe("shiftSectionArea — exclusive capture beats everything", () => {
  test("exclusive beats a resolved station (Van: Management-only on the BOH Pass)", () => {
    expect(shiftSectionArea(sh({ stationId: "pass", role: "Manager" }), { areas: ["Management"] }, STATIONS, G)).toBe("Management");
  });
  test("exclusive beats a resolved station for a multi-area holder (Steph on the FOH barista station)", () => {
    expect(shiftSectionArea(sh({ stationId: "barista-cold-drinks", role: "Manager" }), { areas: ["FOH", "Management"] }, STATIONS, G)).toBe("Management");
  });
  test("exclusive with no station (Chloe, rostered role FOH)", () => {
    expect(shiftSectionArea(sh({ role: "FOH" }), { areas: ["FOH", "Management"] }, STATIONS, G)).toBe("Management");
  });
});

describe("shiftSectionArea — strict area-only: station and role never decide", () => {
  test("single area passes through (Hudson)", () => {
    expect(shiftSectionArea(sh({ stationId: "prep", role: "BOH" }), { areas: ["BOH"] }, STATIONS, G)).toBe("BOH");
  });
  test("single-area staffer on a DIFFERENT area's station keeps their own area", () => {
    // ["BOH"] rostered on the FOH barista station — the station must not pull them to FOH
    expect(shiftSectionArea(sh({ stationId: "barista-cold-drinks", role: "FOH" }), { areas: ["BOH"] }, STATIONS, G)).toBe("BOH");
  });
  test("station does NOT arbitrate a multi-area holder (Jason on the BOH Prep → Multi-area)", () => {
    expect(shiftSectionArea(sh({ stationId: "prep", role: "BOH" }), { areas: ["FOH", "BOH"] }, STATIONS, G)).toBe("__multi__");
  });
  test("role does NOT arbitrate a multi-area holder (Bowser, role BOH, no station → Multi-area)", () => {
    expect(shiftSectionArea(sh({ role: "BOH" }), { areas: ["BOH", "FOH"] }, STATIONS, G)).toBe("__multi__");
  });
  test("multi-area with no signals at all is Multi-area too", () => {
    expect(shiftSectionArea(sh({ role: "Junior" }), { areas: ["FOH", "BOH"] }, STATIONS, G)).toBe("__multi__");
  });
});

describe("shiftSectionArea — fallbacks never throw, never drop", () => {
  test("null staff doc: station wins, else role inference, else __none__", () => {
    expect(shiftSectionArea(sh({ stationId: "pass" }), null, STATIONS, G)).toBe("BOH");
    expect(shiftSectionArea(sh({ role: "Manager" }), null, STATIONS, G)).toBe("Management");
    expect(shiftSectionArea(sh({}), null, STATIONS, G)).toBe("__none__");
    expect(shiftSectionArea({}, null, [], {})).toBe("__none__"); // bare inputs — no crash
  });
  test("area-less staff doc takes the same fallback", () => {
    expect(shiftSectionArea(sh({ stationId: "prep" }), { areas: [] }, STATIONS, G)).toBe("BOH");
  });
});

describe("shiftSectionArea — venueRoles override", () => {
  test("venueRoles[venueId].areas overrides staffAreas when non-empty", () => {
    const s = { areas: ["FOH"], venueRoles: { [V]: { areas: ["BOH"] } } };
    expect(shiftSectionArea(sh({}), s, STATIONS, G)).toBe("BOH");
  });
  test("an EMPTY venueRoles entry falls back to the cross-venue union", () => {
    const s = { areas: ["FOH"], venueRoles: { [V]: { areas: [] } } };
    expect(shiftSectionArea(sh({}), s, STATIONS, G)).toBe("FOH");
  });
  test("another venue's entry is ignored for this shift", () => {
    const s = { areas: ["FOH"], venueRoles: { "mad-hotpot": { areas: ["BOH"] } } };
    expect(shiftSectionArea(sh({}), s, STATIONS, G)).toBe("FOH");
  });
});
