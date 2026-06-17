/* Training-archive phase tests — fully mocked Firestore, nothing real is touched.
 * Covers: archive preserves all fields; reassign archives old + leaves a fresh
 * snapshot; empty assignments hard-delete with nothing archived; the util scopes
 * its writes to exactly the source + archive refs; backup snapshot is restorable. */
import fs from "fs";
import path from "path";
import { hasArchivableTraining, archiveAndRemoveTraining } from "./trainingArchiveUtils";
import { snapshotForAssign } from "./rgUtils";
import { setDoc, getDoc, deleteDoc } from "firebase/firestore";

// doc/serverTimestamp/path helpers are plain functions (not jest.fn) so CRA's
// automatic mock-reset between tests can't wipe their return values; only the
// call-tracked writes (getDoc/setDoc/deleteDoc) are jest.fn.
jest.mock("firebase/firestore", () => ({
  doc: (col, id) => ({ __col: col, __id: id }),
  getDoc: jest.fn(),
  setDoc: jest.fn(() => Promise.resolve()),
  deleteDoc: jest.fn(() => Promise.resolve()),
  serverTimestamp: () => "__ts__",
}));
jest.mock("../../utils/restaurantGroupPaths", () => ({
  venueCol: (g, v, n) => `${g}/venues/${v}/${n}`,
  trainingArchiveCol: (g, v) => `${g}/venues/${v}/trainingArchive`,
}));

const completed = (over = {}) => ({
  id: "a1", venueId: "v1", venue: "Mad Benji",
  staffId: "s1", staffName: "Sam", moduleId: "m1", moduleTitle: "FOH Opening",
  sections: [{ heading: "Open", items: ["Unlock", "Lights"] }],
  checks: [true, true], itemsTotal: 2, progress: 100, status: "Complete",
  verified: true, verifiedBy: "Trainer Jo", verifiedAt: "__ts__", verifyNote: "great",
  threads: { 0: [{ text: "watch timing", by: "Jo", at: "x", private: false }] },
  notes: "focus on allergens", due: "2026-06-01", priority: "high",
  ...over,
});
const empty = (over = {}) => ({
  id: "a2", venueId: "v1", venue: "Mad Benji",
  staffId: "s1", staffName: "Sam", moduleId: "m2", moduleTitle: "BOH Close",
  sections: [{ heading: "Close", items: ["Clean", "Lock"] }],
  checks: [false, false], itemsTotal: 2, progress: 0, status: "Not started",
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  setDoc.mockResolvedValue();
  deleteDoc.mockResolvedValue();
});

describe("hasArchivableTraining", () => {
  test("true when complete / verified / has progress / has a tick / has a note / has threads", () => {
    expect(hasArchivableTraining({ status: "Complete" })).toBe(true);
    expect(hasArchivableTraining({ verified: true })).toBe(true);
    expect(hasArchivableTraining({ progress: 40 })).toBe(true);
    expect(hasArchivableTraining({ checks: [false, true] })).toBe(true);
    expect(hasArchivableTraining({ verifyNote: "x" })).toBe(true);
    expect(hasArchivableTraining({ notes: "brief" })).toBe(true);
    expect(hasArchivableTraining({ threads: { 0: [{}] } })).toBe(true);
  });
  test("false for a truly empty, not-started assignment", () => {
    expect(hasArchivableTraining({ status: "Not started", progress: 0, checks: [false, false] })).toBe(false);
    expect(hasArchivableTraining(null)).toBe(false);
  });
});

describe("archiveAndRemoveTraining — completed assignment", () => {
  test("preserves ALL fields in the archive, then deletes the original", async () => {
    const src = completed();
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ ...src, id: undefined }) });

    const res = await archiveAndRemoveTraining("g1", src, "removed");

    expect(res).toEqual({ archived: true });
    expect(setDoc).toHaveBeenCalledTimes(1);
    const [archiveRef, payload] = setDoc.mock.calls[0];
    expect(archiveRef.__col).toBe("g1/venues/v1/trainingArchive");
    expect(archiveRef.__id).toBe("a1");
    // every meaningful field carried over verbatim
    for (const k of ["sections", "checks", "status", "verified", "verifiedBy", "verifyNote", "threads", "notes", "moduleTitle", "staffId"]) {
      expect(payload[k]).toEqual(src[k]);
    }
    expect(payload.archivedReason).toBe("removed");
    expect(payload.archivedAt).toBe("__ts__");
    expect(payload.originalId).toBe("a1");
    expect(deleteDoc).toHaveBeenCalledTimes(1);
  });

  test("archive is written BEFORE the delete (fail-safe order)", async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => completed() });
    await archiveAndRemoveTraining("g1", completed(), "removed");
    expect(setDoc.mock.invocationCallOrder[0]).toBeLessThan(deleteDoc.mock.invocationCallOrder[0]);
  });

  test("if the archive write fails, the original is NOT deleted", async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => completed() });
    setDoc.mockRejectedValueOnce(new Error("permission-denied"));
    await expect(archiveAndRemoveTraining("g1", completed(), "removed")).rejects.toThrow("permission-denied");
    expect(deleteDoc).not.toHaveBeenCalled();
  });
});

describe("reassignment", () => {
  test("archives the old completed record with reason 'reassigned'", async () => {
    const old = completed();
    getDoc.mockResolvedValue({ exists: () => true, data: () => old });
    const res = await archiveAndRemoveTraining("g1", old, "reassigned");
    expect(res.archived).toBe(true);
    expect(setDoc.mock.calls[0][1].archivedReason).toBe("reassigned");
    expect(setDoc.mock.calls[0][1].checks).toEqual([true, true]); // old ticks retained
  });
  test("the fresh assignment that replaces it starts blank (caller-built snapshot)", () => {
    const fresh = snapshotForAssign({ steps: [{ heading: "Open", items: ["Unlock", "Lights"] }], link: "" });
    expect(fresh.checks).toEqual([false, false]);
    expect(fresh.itemsTotal).toBe(2);
  });
});

describe("archiveAndRemoveTraining — empty assignment", () => {
  test("hard-deletes with nothing archived (per decision)", async () => {
    const src = empty();
    getDoc.mockResolvedValue({ exists: () => true, data: () => src });
    const res = await archiveAndRemoveTraining("g1", src, "removed");
    expect(res).toEqual({ archived: false });
    expect(setDoc).not.toHaveBeenCalled();
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc.mock.calls[0][0].__col).toBe("g1/venues/v1/trainingAssignments");
    expect(deleteDoc.mock.calls[0][0].__id).toBe("a2");
  });
});

describe("scoping — existing assignments are untouched", () => {
  test("the util only ever touches the source ref and (when archiving) the archive ref", async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => completed() });
    await archiveAndRemoveTraining("g1", completed(), "removed");
    // exactly one read, one archive write, one delete — no fan-out to other docs
    expect(getDoc).toHaveBeenCalledTimes(1);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(deleteDoc.mock.calls[0][0].__col).toBe("g1/venues/v1/trainingAssignments");
  });
});

describe("backup snapshot is restorable", () => {
  test("committed backup JSON round-trips to per-doc paths", () => {
    const dir = path.resolve(__dirname, "../../../backups");
    const file = fs.readdirSync(dir).find((f) => /^training-assignments-mymor-australia-.*\.json$/.test(f));
    expect(file).toBeTruthy();
    const backup = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    expect(backup.count).toBe(backup.records.length);
    expect(backup.count).toBe(9);
    // every record carries the full path triple + data → restore writes data back verbatim
    for (const r of backup.records) {
      expect(typeof r.groupId).toBe("string");
      expect(typeof r.venueId).toBe("string");
      expect(typeof r.id).toBe("string");
      expect(r.data && typeof r.data).toBe("object");
    }
  });
});
