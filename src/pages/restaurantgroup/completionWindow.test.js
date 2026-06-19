/* 48-hour active-window filter (display only). */
import { completedAtMs, isWithinActiveWindow, showInActiveList, ACTIVE_WINDOW_MS } from "./completionWindow";

const NOW = 1_700_000_000_000;
const hoursAgo = (h) => NOW - h * 3600 * 1000;

describe("completedAtMs — tolerant of Timestamp / ISO / epoch / null", () => {
  test("reads the ms across shapes", () => {
    expect(completedAtMs({ toDate: () => new Date(NOW) })).toBe(NOW);   // Firestore Timestamp
    expect(completedAtMs({ seconds: Math.floor(NOW / 1000) })).toBe(Math.floor(NOW / 1000) * 1000);
    expect(completedAtMs(new Date(NOW).toISOString())).toBe(NOW);       // ISO string
    expect(completedAtMs(null)).toBeNull();
    expect(completedAtMs("nope")).toBeNull();
  });
});

describe("isWithinActiveWindow — 48h since completion", () => {
  test("true within 48h, false after", () => {
    expect(isWithinActiveWindow({ completedAt: hoursAgo(1) }, NOW)).toBe(true);
    expect(isWithinActiveWindow({ completedAt: hoursAgo(47) }, NOW)).toBe(true);
    expect(isWithinActiveWindow({ completedAt: hoursAgo(49) }, NOW)).toBe(false);
    expect(ACTIVE_WINDOW_MS).toBe(48 * 3600 * 1000);
  });
  test("no completedAt → false (treated as past the window)", () => {
    expect(isWithinActiveWindow({}, NOW)).toBe(false);
  });
});

describe("showInActiveList — the active-list predicate", () => {
  test("non-Complete items always show", () => {
    expect(showInActiveList({ status: "In progress" }, NOW)).toBe(true);
    expect(showInActiveList({ status: "Not started", completedAt: null }, NOW)).toBe(true);
    expect(showInActiveList({ status: "Awaiting sign-off" }, NOW)).toBe(true);
  });
  test("Complete shows within 48h, hidden after 48h", () => {
    expect(showInActiveList({ status: "Complete", completedAt: hoursAgo(2) }, NOW)).toBe(true);
    expect(showInActiveList({ status: "Complete", completedAt: hoursAgo(72) }, NOW)).toBe(false);
  });
  test("pre-existing Complete with NO completedAt → hidden (chosen default)", () => {
    expect(showInActiveList({ status: "Complete" }, NOW)).toBe(false);
  });
});
