import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { venueCol, trainingArchiveCol, sopArchiveCol } from "../../utils/restaurantGroupPaths";

/**
 * Training archive (phase 1 of the staff restructure).
 *
 * The old behaviour hard-deleted a training assignment on remove/reassign,
 * destroying its completion history. We now copy any assignment that holds real
 * completion data to venues/{venueId}/trainingArchive/{id} BEFORE deleting it.
 *
 * Mirrors the checklist archive spirit (preserve, don't silently lose) — but for
 * training we keep a full copy rather than a status flag, because reassigning
 * needs the slot freed while the historical record is retained verbatim.
 */

// Does this assignment hold anything worth preserving? Truly empty, never-started
// assignments (no progress, no ticks, no notes, not signed off) have nothing to
// keep and may be hard-deleted. Anything else is archived.
export const hasArchivableTraining = (a) => {
  if (!a) return false;
  if (a.status === "Complete") return true;
  if (a.verified === true) return true;
  if ((Number(a.progress) || 0) > 0) return true;
  if (Array.isArray(a.checks) && a.checks.some(Boolean)) return true;
  if (a.verifyNote && String(a.verifyNote).trim()) return true;
  // manager brief OR per-step comment threads count as notes worth keeping
  if (a.notes && String(a.notes).trim()) return true;
  if (a.threads && Object.keys(a.threads).length > 0) return true;
  if (a.comments && Object.keys(a.comments).length > 0) return true;
  return false;
};

/**
 * Archive (if it has data) then remove a training assignment.
 *
 * Order is deliberate: the archive copy is written FIRST. If that write throws,
 * we never reach the delete, so the original is preserved (fail-safe). If the
 * assignment is empty, it is hard-deleted with nothing archived.
 *
 * @param groupId
 * @param a        the in-memory assignment row ({ id, venueId, ...data })
 * @param reason   "removed" | "reassigned"
 * @returns { archived: boolean }
 */
export async function archiveAndRemoveTraining(groupId, a, reason) {
  return archiveAndRemoveAssignment(groupId, a, reason, "trainingAssignments", trainingArchiveCol);
}

// SOP twin — same archive-first-then-delete flow, pointed at the SOP module's own
// collections (sopAssignments → sopArchive). Never touches training data.
export async function archiveAndRemoveSop(groupId, a, reason) {
  return archiveAndRemoveAssignment(groupId, a, reason, "sopAssignments", sopArchiveCol);
}

async function archiveAndRemoveAssignment(groupId, a, reason, assignCollName, archiveColFn) {
  const srcRef = doc(venueCol(groupId, a.venueId, assignCollName), a.id);

  // Prefer the freshest server copy so we capture ticks/threads added since the
  // page last rendered; fall back to the in-memory row if the read fails.
  let data = null;
  try {
    const snap = await getDoc(srcRef);
    if (snap.exists()) data = snap.data();
  } catch { /* fall back to in-memory below */ }

  const source = data || (() => { const { id, ...rest } = a; return rest; })();
  const archivable = hasArchivableTraining(source);

  if (archivable) {
    await setDoc(doc(archiveColFn(groupId, a.venueId), a.id), {
      ...source,                 // preserves sections, checks, notes, status,
                                 // verified/verifiedBy/verifiedAt/verifyNote, threads, dates
      originalId: a.id,
      archivedAt: serverTimestamp(),
      archivedReason: reason || "removed",
    });
  }

  await deleteDoc(srcRef);
  return { archived: archivable };
}
