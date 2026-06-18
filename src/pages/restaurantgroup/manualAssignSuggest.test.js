/* Build 2a-2 — manual-assign suggestion: suggest by area+station+role, NEVER block.
 * Proves the existing suggestion ordering (TrainingPage staff dropdown via
 * orderStaffForItem + ⭐; StaffDirectory item lists via orderItemsForStaff + "Suggested")
 * reorders/marks but never removes or disables anyone — so a manager can still assign
 * cross-training to someone outside the item's area/station. Multi-area aware (STEP 3). */
import { matchScore, orderStaffForItem, orderItemsForStaff, isSuggested, AREA_WEIGHT, STATION_WEIGHT, ROLE_WEIGHT } from "./assignmentUtils";

// item: a FOH module/SOP tagged the "bar" station, aimed at the FOH role
const fohBarItem = { cat: "FOH", stationId: "bar", autoAssign: { roles: ["FOH"] } };
const bohItem = { cat: "BOH", autoAssign: { roles: ["BOH"] } };

const fohBar = { id: "fohBar", areas: ["FOH"], role: "FOH", stationIds: ["bar"] }; // area + station + role
const fohOnly = { id: "fohOnly", areas: ["FOH"], role: "FOH", stationIds: [] };    // area + role, no station
const bohPerson = { id: "boh", areas: ["BOH"], role: "BOH", stationIds: [] };      // NOT in the item's area (cross-train candidate)
const multi = { id: "multi", areas: ["FOH", "BOH"], role: "FOH", stationIds: [] }; // multi-area

describe("manual-assign suggestion — suggest, never block", () => {
  test("orders the most relevant staff first (station-tagged > area-only > non-matching)", () => {
    const ordered = orderStaffForItem([bohPerson, fohOnly, fohBar], fohBarItem);
    expect(ordered.map((s) => s.id)).toEqual(["fohBar", "fohOnly", "boh"]);
  });

  test("NEVER restricts the list — a non-area, non-station person stays selectable (cross-training)", () => {
    const roster = [fohBar, fohOnly, bohPerson, multi];
    const ordered = orderStaffForItem(roster, fohBarItem);
    expect(ordered).toHaveLength(roster.length);      // no one dropped
    expect(ordered.map((s) => s.id)).toContain("boh"); // the cross-train candidate remains
  });

  test("a multi-area person is SUGGESTED for an item in ANY of their areas", () => {
    expect(isSuggested(fohBarItem, multi)).toBe(true); // FOH item
    expect(isSuggested(bohItem, multi)).toBe(true);    // BOH item — same person
    expect(matchScore(fohBarItem, multi)).toBeGreaterThanOrEqual(AREA_WEIGHT);
    expect(matchScore(bohItem, multi)).toBeGreaterThanOrEqual(AREA_WEIGHT);
  });

  test("station tag boosts a person above a pure area match", () => {
    expect(matchScore(fohBarItem, fohBar)).toBe(AREA_WEIGHT + STATION_WEIGHT + ROLE_WEIGHT);
    expect(matchScore(fohBarItem, fohBar)).toBeGreaterThan(matchScore(fohBarItem, fohOnly));
  });

  test("item-ordering for a person (StaffDirectory assign) keeps ALL items and suggests across areas", () => {
    const items = [bohItem, fohBarItem];
    const ordered = orderItemsForStaff(items, multi);
    expect(ordered).toHaveLength(2); // nothing dropped
    expect(isSuggested(bohItem, multi) && isSuggested(fohBarItem, multi)).toBe(true); // both areas suggested
  });
});
