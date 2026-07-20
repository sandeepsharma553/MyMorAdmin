/* POS rail line editor — crash regression lock. The editor sheet reads
 * editSheet.presets; splitNote returns { sel, free }. Seeding the sheet by
 * SPREADING splitNote's result (no rename) left `presets` undefined and
 * editSheet.presets.includes(p) threw on the sheet's first render (found via
 * the Ops device repro: POS → add item → tap the rail line → crash; Admin
 * carried the identical bug). editSheetSeed owns the rename; these tests fail
 * if the seed ever loses the `presets` key again.
 * ⚠ KEEP the cases identical to Ops's PosScreen.test.js (twin lock).
 * The page's import chain pulls firebase — mock it so the pure exports load. */
jest.mock("firebase/app", () => ({ getApp: jest.fn() }));
jest.mock("firebase/functions", () => ({ getFunctions: jest.fn(), httpsCallable: jest.fn() }));
jest.mock("firebase/firestore", () => ({ collection: jest.fn(), doc: jest.fn(), onSnapshot: jest.fn() }));
jest.mock("../../firebase", () => ({ db: {} }));

const { splitNote, editSheetSeed } = require("./PosPage");

const PRESETS = ["Allergy — check", "Rush"];

describe("splitNote — returns { sel, free }, the shape openModify destructures", () => {
  test("splits a stored note into known presets + free text", () => {
    expect(splitNote("Allergy — check · extra hot", PRESETS)).toEqual({ sel: ["Allergy — check"], free: "extra hot" });
  });
  test("no notes field (undefined) → empty shape, never throws", () => {
    expect(splitNote(undefined, PRESETS)).toEqual({ sel: [], free: "" });
  });
});

describe("editSheetSeed — the sheet reads `presets`, so the seed must carry it", () => {
  test("a line WITH notes seeds presets as an array (the crash was seeding `sel`)", () => {
    const seeded = editSheetSeed({ key: "k1", notes: "Allergy — check · extra hot" }, PRESETS);
    expect(Array.isArray(seeded.presets)).toBe(true);
    expect(seeded.presets).toEqual(["Allergy — check"]);
    expect(seeded.free).toBe("extra hot");
    expect(seeded.key).toBe("k1");
    expect(seeded).not.toHaveProperty("sel"); // the old broken shape must not come back
    // the exact throw-site expression from the sheet render must run clean
    expect(PRESETS.map((p) => seeded.presets.includes(p))).toEqual([true, false]);
  });
  test("a line with NO notes seeds an EMPTY array, not undefined", () => {
    const seeded = editSheetSeed({ key: "k2" }, PRESETS);
    expect(seeded.presets).toEqual([]);
    expect(seeded.free).toBe("");
    expect(PRESETS.map((p) => seeded.presets.includes(p))).toEqual([false, false]);
  });
});
