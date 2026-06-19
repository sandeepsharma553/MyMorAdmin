/* FIX 2 — fmtDate handles Firestore Timestamp / ISO string / null without breaking. */
import { fmtDate } from "./dateFmt";

const direct = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

describe("fmtDate", () => {
  test("ISO string (records[].at) formats correctly", () => {
    const iso = "2026-06-10T10:38:10.083Z";
    expect(fmtDate(iso)).toBe(direct(new Date(iso)));
    expect(fmtDate(iso)).not.toBe("Invalid Date");
  });
  test("Firestore Timestamp (verifiedAt / createdAt) is converted via .toDate()", () => {
    const day = new Date("2026-06-19T00:00:00Z");
    const ts = { toDate: () => day, seconds: Math.floor(day.getTime() / 1000) };
    expect(fmtDate(ts)).toBe(direct(day)); // not "Invalid Date" / "[object Object]"
  });
  test("null / undefined / empty → '' (no garbage)", () => {
    expect(fmtDate(null)).toBe("");
    expect(fmtDate(undefined)).toBe("");
    expect(fmtDate("")).toBe("");
  });
  test("unparseable values → '' and never throw", () => {
    expect(fmtDate("not-a-date")).toBe("");
    expect(fmtDate({})).toBe(""); // object without .toDate → Invalid Date → ""
  });
});
