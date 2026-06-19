/* Checklist "Link to shifts" picker — pure helpers. Recurring {day,start,label} slots
 * from the real roster; stored shape unchanged; empty roster handled. */
import { slotMinutes, isSlotLinked, toggleSlotLink, buildSlotGrid } from "./shiftSlotPicker";

// real venue slots (as ChecklistsPage derives them from shifts)
const slots = [
  { day: "Mon", start: "7:00am", label: "FOH" },
  { day: "Mon", start: "3:00pm", label: "BOH" },
  { day: "Wed", start: "7:00am", label: "FOH" },
];

describe("slotMinutes — sorts starts by time of day", () => {
  test("am/pm parse", () => {
    expect(slotMinutes("7:00am")).toBe(420);
    expect(slotMinutes("12:00pm")).toBe(720);
    expect(slotMinutes("3:00pm")).toBe(900);
    expect(slotMinutes("12:00am")).toBe(0);
  });
});

describe("toggleSlotLink — stores the SAME recurring {day,start,label} shape", () => {
  test("selecting a slot stores exactly {day,start,label}", () => {
    const next = toggleSlotLink([], slots[0]);
    expect(next).toEqual([{ day: "Mon", start: "7:00am", label: "FOH" }]);
    expect(Object.keys(next[0]).sort()).toEqual(["day", "label", "start"]); // no one-off id/shapes
  });
  test("multiple slots link, then one unlinks (matched by day+start)", () => {
    let links = toggleSlotLink([], slots[0]);
    links = toggleSlotLink(links, slots[2]);
    expect(links.map((l) => `${l.day} ${l.start}`)).toEqual(["Mon 7:00am", "Wed 7:00am"]);
    links = toggleSlotLink(links, { day: "Mon", start: "7:00am" }); // unlink Mon 7am
    expect(links.map((l) => `${l.day} ${l.start}`)).toEqual(["Wed 7:00am"]);
  });
  test("isSlotLinked matches on day+start only", () => {
    expect(isSlotLinked(slots, { day: "Mon", start: "7:00am" })).toBe(true);
    expect(isSlotLinked(slots, { day: "Mon", start: "9:00am" })).toBe(false);
  });
});

describe("buildSlotGrid — weekly grid from the real roster", () => {
  const g = buildSlotGrid(slots);
  test("days are only those with shifts, in week order", () => {
    expect(g.days).toEqual(["Mon", "Wed"]); // no Tue/Thu/.. (no shifts)
  });
  test("starts are the distinct start times, sorted by time of day", () => {
    expect(g.starts).toEqual(["7:00am", "3:00pm"]);
  });
  test("slotAt returns the real slot where one exists, else null", () => {
    expect(g.slotAt("Mon", "7:00am")).toEqual({ day: "Mon", start: "7:00am", label: "FOH" });
    expect(g.slotAt("Wed", "3:00pm")).toBeNull(); // Wed has no 3pm shift
  });
  test("empty roster → isEmpty true, no days/starts (the empty case)", () => {
    const e = buildSlotGrid([]);
    expect(e.isEmpty).toBe(true);
    expect(e.days).toEqual([]);
    expect(e.starts).toEqual([]);
    expect(e.slotAt("Mon", "7:00am")).toBeNull();
  });
});
