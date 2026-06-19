/* Build 2a — Area→Station drill-down (presentation organisation). Pure helpers. */
import { stationsForArea, groupItemsByStation, filterByStation, stationOptionsForItem, GENERAL_KEY } from "./itemDrilldown";

const stations = [
  { id: "bar", name: "Bar", area: "FOH", venueId: "v1" },
  { id: "counter", name: "Counter", area: "FOH", venueId: "v1" },
  { id: "grill", name: "Grill", area: "BOH", venueId: "v1" },
  { id: "barV2", name: "Bar", area: "FOH", venueId: "v2" },
];
// FOH training modules (cat) — some tagged a station, one not
const modules = [
  { id: "m1", cat: "FOH", stationId: "bar", title: "Bar open" },
  { id: "m2", cat: "FOH", stationId: "counter", title: "Counter" },
  { id: "m3", cat: "FOH", stationId: "", title: "FOH general" },   // no station → General
  { id: "m4", cat: "All", title: "Allergens" },                    // universal, no station → General
];

describe("stationsForArea — the station picker for a selected area", () => {
  test("returns only that area's stations, venue-scoped", () => {
    expect(stationsForArea(stations, "FOH", "v1").map((s) => s.id)).toEqual(["bar", "counter"]);
    expect(stationsForArea(stations, "BOH", "v1").map((s) => s.id)).toEqual(["grill"]);
    expect(stationsForArea(stations, "FOH", "all").map((s) => s.id)).toEqual(["bar", "counter", "barV2"]);
  });
});

describe("groupItemsByStation — items show under their station; no-station → General", () => {
  const groups = groupItemsByStation(modules, stationsForArea(stations, "FOH", "v1"));
  test("one group per station that has items, in station order, then General last", () => {
    expect(groups.map((g) => g.key)).toEqual(["bar", "counter", GENERAL_KEY]);
    expect(groups.map((g) => g.label)).toEqual(["Bar", "Counter", "General (no station)"]);
  });
  test("station-tagged items land under their station", () => {
    expect(groups[0].items.map((m) => m.id)).toEqual(["m1"]);
    expect(groups[1].items.map((m) => m.id)).toEqual(["m2"]);
  });
  test("items with no station (or no matching area station) fall under General", () => {
    expect(groups[2].items.map((m) => m.id)).toEqual(["m3", "m4"]);
  });
  test("empty station groups are dropped (declutter)", () => {
    const g = groupItemsByStation([{ id: "x", cat: "FOH", stationId: "bar" }], stationsForArea(stations, "FOH", "v1"));
    expect(g.map((x) => x.key)).toEqual(["bar"]); // Counter dropped (no items), no General (none)
  });
});

describe("filterByStation — narrow to one station / General / all", () => {
  test("'all' is unchanged; a stationId keeps only that station; General keeps no-station", () => {
    expect(filterByStation(modules, "all").map((m) => m.id)).toEqual(["m1", "m2", "m3", "m4"]);
    expect(filterByStation(modules, "bar").map((m) => m.id)).toEqual(["m1"]);
    expect(filterByStation(modules, GENERAL_KEY).map((m) => m.id)).toEqual(["m3", "m4"]);
  });
  test("checklists use `area`/`stationId` the same way (helper is shape-agnostic on station)", () => {
    const checklists = [{ id: "c1", area: "BOH", stationId: "grill" }, { id: "c2", area: "BOH", stationId: "" }];
    expect(filterByStation(checklists, "grill").map((c) => c.id)).toEqual(["c1"]);
    expect(filterByStation(checklists, GENERAL_KEY).map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("stationOptionsForItem — editor 'Station (optional)' dropdown (FIX 1)", () => {
  // bar/counter are FOH in v1; grill is BOH in v1; barV2 is FOH in v2
  test("offers ONLY stations of the item's area in the item's venue", () => {
    expect(stationOptionsForItem(stations, "v1", "FOH").map((s) => s.id)).toEqual(["bar", "counter"]);
    expect(stationOptionsForItem(stations, "v1", "BOH").map((s) => s.id)).toEqual(["grill"]); // no FOH bar/counter
    expect(stationOptionsForItem(stations, "v2", "FOH").map((s) => s.id)).toEqual(["barV2"]); // not v1's stations
  });
  test("area 'All' offers every station in the venue (no area restriction)", () => {
    expect(stationOptionsForItem(stations, "v1", "All").map((s) => s.id)).toEqual(["bar", "counter", "grill"]);
  });
  test("an already-set OUT-OF-AREA station is KEPT (prepended) so editing never drops it", () => {
    // FOH item currently has the BOH 'grill' station set → grill stays selectable, plus the FOH options
    const opts = stationOptionsForItem(stations, "v1", "FOH", "grill");
    expect(opts.map((s) => s.id)).toEqual(["grill", "bar", "counter"]);
  });
  test("an already-set in-area station is NOT duplicated", () => {
    expect(stationOptionsForItem(stations, "v1", "FOH", "bar").map((s) => s.id)).toEqual(["bar", "counter"]);
  });
  test("no current station → just the area+venue options", () => {
    expect(stationOptionsForItem(stations, "v1", "FOH", "").map((s) => s.id)).toEqual(["bar", "counter"]);
  });
});
