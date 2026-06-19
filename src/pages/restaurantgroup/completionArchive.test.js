/* Archive-on-completion — mocked Firestore, nothing real touched.
 * Covers: unique-per-completion doc id; writes to the right archive collection
 * (training vs checklist); preserves data + overrides + completedAt; the SAME item
 * completed twice yields TWO entries (different ids → no overwrite). */
import { setDoc } from "firebase/firestore";
import { archiveCompletion, completionArchiveId, COMPLETION_ARCHIVE_REASON } from "./completionArchive";

jest.mock("firebase/firestore", () => ({
  doc: (col, id) => ({ __col: col, __id: id }),
  setDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: () => "__ts__",
}));
jest.mock("../../utils/restaurantGroupPaths", () => ({
  trainingArchiveCol: (g, v) => `${g}/venues/${v}/trainingArchive`,
  checklistArchiveCol: (g, v) => `${g}/venues/${v}/checklistArchive`,
}));

const training = (over = {}) => ({
  id: "a1", venueId: "v1", venue: "Mad Benji", staffId: "s1", staffName: "Sam",
  moduleId: "m1", moduleTitle: "FOH Opening", sections: [{ heading: "Open", items: ["Unlock"] }],
  checks: [true], itemsTotal: 1, progress: 100, status: "Complete", verified: true, verifyNote: "great", ...over,
});
const checklist = () => ({ id: "c1", venueId: "v1", checklistId: "cl1", checklistTitle: "Close", items: ["Lock"], checks: [true], status: "Complete" });

beforeEach(() => { jest.clearAllMocks(); setDoc.mockResolvedValue(); });

describe("completionArchiveId", () => {
  test("is unique per completion timestamp (so repeats never collide)", () => {
    expect(completionArchiveId("a1", 1000)).toBe("a1-1000");
    expect(completionArchiveId("a1", 1000)).not.toBe(completionArchiveId("a1", 2000));
  });
});

describe("archiveCompletion — training", () => {
  test("writes a dated entry to trainingArchive with the unique id + preserved data", async () => {
    await archiveCompletion("g1", "training", training(), { progress: 100 }, 1700000000000);
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref.__col).toBe("g1/venues/v1/trainingArchive");
    expect(ref.__id).toBe("a1-1700000000000");               // ${id}-${ms}, NOT the bare id
    expect(payload.originalId).toBe("a1");
    expect(payload.completedAtMillis).toBe(1700000000000);
    expect(payload.completedAt).toBe("__ts__");
    expect(payload.archivedReason).toBe(COMPLETION_ARCHIVE_REASON); // "completed"
    expect(payload.kind).toBe("training");
    for (const k of ["sections", "checks", "verifyNote", "moduleTitle", "staffId"]) expect(payload[k]).toEqual(training()[k]);
    expect(payload.id).toBeUndefined();                       // id stripped from the body
  });

  test("the SAME training completed twice → TWO entries, never overwritten", async () => {
    await archiveCompletion("g1", "training", training(), {}, 1000);
    await archiveCompletion("g1", "training", training(), {}, 2000);
    expect(setDoc).toHaveBeenCalledTimes(2);
    expect(setDoc.mock.calls[0][0].__id).toBe("a1-1000");
    expect(setDoc.mock.calls[1][0].__id).toBe("a1-2000");    // different doc → no overwrite
  });
});

describe("archiveCompletion — checklist", () => {
  test("writes to the checklistArchive collection", async () => {
    await archiveCompletion("g1", "checklist", checklist(), { status: "Complete" }, 5000);
    const [ref, payload] = setDoc.mock.calls[0];
    expect(ref.__col).toBe("g1/venues/v1/checklistArchive");
    expect(ref.__id).toBe("c1-5000");
    expect(payload.kind).toBe("checklist");
    expect(payload.checklistTitle).toBe("Close");
  });
});
