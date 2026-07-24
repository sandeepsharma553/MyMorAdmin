import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { trainingArchiveCol, checklistArchiveCol, sopArchiveCol } from "../../utils/restaurantGroupPaths";

/* Archive-on-completion (client-side, no scheduled function).
 *
 * Every time a training/checklist assignment becomes Complete we write a DATED archive
 * entry. The doc id is UNIQUE PER COMPLETION (`${originalId}-${completedAtMillis}`), so the
 * same item completed N times leaves N entries that never overwrite each other. This is
 * ADDITIVE to the reassign/remove archiving (trainingArchiveUtils) — both write to the
 * same per-venue archive collections. */

export const COMPLETION_ARCHIVE_REASON = "completed";

// Unique-per-completion archive doc id (vs the reassign/remove path which keys by the
// bare assignment id). Different completion timestamps → different ids → no overwrite.
export const completionArchiveId = (originalId, completedAtMillis) => `${originalId}-${completedAtMillis}`;

const colFor = (kind, groupId, venueId) =>
  kind === "checklist" ? checklistArchiveCol(groupId, venueId)
    : kind === "sop" ? sopArchiveCol(groupId, venueId)
      : trainingArchiveCol(groupId, venueId);

/**
 * Write a dated, unique completion-archive entry. Non-destructive (the active assignment
 * stays put) — callers fire-and-forget (.catch) so a failed archive never breaks completion.
 * @param kind        "training" | "checklist" | "sop"
 * @param assignment  in-memory row ({ id, venueId, ...data })
 * @param overrides   the just-completed fields to capture (status/checks/verifyNote…)
 * @param completedAtMillis  client ms for the unique id (defaults to now)
 */
export async function archiveCompletion(groupId, kind, assignment, overrides = {}, completedAtMillis) {
  const ms = completedAtMillis || Date.now();
  const { id, ...rest } = assignment;
  await setDoc(doc(colFor(kind, groupId, assignment.venueId), completionArchiveId(id, ms)), {
    ...rest,
    ...overrides,
    originalId: id,
    completedAtMillis: ms,
    completedAt: serverTimestamp(),
    archivedAt: serverTimestamp(),
    archivedReason: COMPLETION_ARCHIVE_REASON,
    kind,
  });
}
