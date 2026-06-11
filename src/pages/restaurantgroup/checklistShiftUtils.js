import { doc, getDocs, query, where, writeBatch, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { snapshotForChecklist } from "./rgUtils";
import { sendNotification } from "./notify";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // shift.day is a 0–6 index (Mon=0)

/**
 * Slot-linked checklist auto-assignment (#shiftLinks).
 *
 * Called right after a shift doc is saved. For every checklist in the shift's venue
 * whose `shiftLinks` contains { day, start } matching this shift's slot:
 *   - creates a checklistAssignment for the rostered staff member
 *     (deterministic id `slot-{checklistId}-{shiftId}` → idempotent per shift)
 *   - if the same slot+week previously belonged to someone else, their assignment is
 *     marked status "Unassigned" (never deleted) — the assignment follows the slot
 *   - `recurring: false` checklists assign once per person ever; `recurring: true`
 *     re-assigns every week the slot is published
 *
 * Plain async function — no hooks, no context. All assignment writes go through ONE
 * writeBatch so they commit together or not at all; the shift itself was already
 * saved by the caller and is never blocked by this.
 *
 * Returns { created, unassigned, errors[] } so the caller can toast.
 */
export async function checkAndCreateShiftAssignments(shift, shiftId, groupId, checklists) {
  const results = { created: 0, unassigned: 0, errors: [] };
  try {
    if (!shift?.staffId || !shift?.venueId || !shiftId || !groupId) return results;
    const dayName = DAYS[shift.day] || "";
    if (!dayName) return results;

    // checklists in this venue linked to this exact day + start slot
    const linked = (checklists || []).filter((c) =>
      c.venueId === shift.venueId &&
      Array.isArray(c.shiftLinks) &&
      c.shiftLinks.some((l) => l.day === dayName && l.start === shift.start)
    );
    if (!linked.length) return results;

    const aCol = venueCol(groupId, shift.venueId, "checklistAssignments");
    const batch = writeBatch(db);
    const createdTitles = [];

    for (const c of linked) {
      try {
        // recurring:false → one assignment per person per checklist, EVER (any week)
        if (c.recurring === false) {
          const prev = await getDocs(query(aCol, where("checklistId", "==", c.id), where("staffId", "==", shift.staffId)));
          if (!prev.empty) continue;
        }

        // everything already written for this checklist + week (idempotency + staff-change)
        const wkSnap = await getDocs(query(aCol, where("checklistId", "==", c.id), where("weekKey", "==", shift.weekKey || "")));
        const slotDocs = wkSnap.docs.filter((d) => {
          const x = d.data();
          return x.triggeredBy === "shift" && x.day === dayName && x.shiftStart === shift.start;
        });

        // already assigned to this person for this slot+week → nothing to do
        if (slotDocs.some((d) => d.data().staffId === shift.staffId && d.data().status !== "Unassigned")) continue;

        // the slot changed hands → mark the previous person's assignment Unassigned (not deleted)
        slotDocs
          .filter((d) => d.data().staffId !== shift.staffId && d.data().status !== "Unassigned")
          .forEach((d) => {
            batch.update(d.ref, { status: "Unassigned", unassignedReason: "Shift reassigned" });
            results.unassigned++;
          });

        // canonical assignment shape (consumed unchanged by the existing detail views in
        // both apps) + slot-tracing fields. Deterministic id → re-saving the shift is a no-op.
        const aRef = doc(aCol, `slot-${c.id}-${shiftId}`);
        batch.set(aRef, {
          staffId: shift.staffId,
          staffName: shift.staffName || "",
          venueId: shift.venueId,
          venue: shift.venue || "",
          checklistId: c.id,
          checklistTitle: c.title || "",
          ...snapshotForChecklist(c), // items, checks[], itemsTotal, station, area
          status: "Not started",
          progress: 0,
          weekKey: shift.weekKey || "",
          day: dayName,
          shiftStart: shift.start || "",
          shiftId,
          triggeredBy: "shift",
          recurring: c.recurring !== false,
          assignedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
        results.created++;
        createdTitles.push(c.title || "Checklist");
      } catch (e) {
        results.errors.push(`${c.title || c.id}: ${e?.message || String(e)}`);
      }
    }

    if (results.created || results.unassigned) {
      try { await batch.commit(); }
      catch (e) {
        // nothing was written — don't report success counts
        results.errors.push(e?.message || String(e));
        results.created = 0;
        results.unassigned = 0;
        return results;
      }
    }

    // notify the staff member (fire-and-forget — never fails the assignment)
    if (results.created) {
      sendNotification(groupId, {
        to: shift.staffId,
        type: "checklist",
        title: "Checklist for your shift",
        body: `${createdTitles.join(", ")} — ${dayName} ${shift.start} at ${shift.venue || "your venue"}`,
        venueId: shift.venueId,
        by: "Shift link",
      });
    }
  } catch (e) {
    results.errors.push(e?.message || String(e));
  }
  return results;
}
