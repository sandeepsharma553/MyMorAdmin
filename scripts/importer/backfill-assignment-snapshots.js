/* Back-fill item snapshots onto existing training & checklist assignments.
 *
 * Older assignments were created before the per-assignment snapshot existed, so
 * they show 0/0 in the UI until opened. This walks every venue's
 * trainingAssignments + checklistAssignments and, where the snapshot is empty,
 * copies the current module steps / checklist items onto the assignment and
 * recomputes progress + status. Existing ticks are preserved.
 *
 * Usage (from scripts/importer):
 *   node backfill-assignment-snapshots.js [groupId] [--dry]
 *   - groupId omitted → all restaurant groups
 *   - --dry           → report what WOULD change, write nothing
 * Env: RG_DATABASE_ID (default 'mymor-australia').
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const groupArg = args.find((a) => !a.startsWith("--"));

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);

// mirror src/pages/restaurantgroup/rgUtils.js
const stepsItemCount = (steps) => (steps || []).reduce((a, s) => a + ((s.items || []).length), 0);
const resizeChecks = (old, total) => Array(total).fill(false).map((_, i) => !!(old || [])[i]);

const trainingStatus = (done, total, verified) =>
  verified ? "Complete" : (done === 0 ? "Not started" : done >= total && total > 0 ? "Awaiting sign-off" : "In progress");
const checklistStatus = (done, total) =>
  done === 0 ? "Not started" : done >= total && total > 0 ? "Complete" : "In progress";

async function backfillGroup(groupId) {
  const gref = db.collection("restaurantGroups").doc(groupId);
  const venues = await gref.collection("venues").get();
  let tFixed = 0, cFixed = 0, tSkip = 0, cSkip = 0;

  for (const v of venues.docs) {
    const vid = v.id;
    const vref = gref.collection("venues").doc(vid);

    // ── Training ──
    const [modulesSnap, tAssignSnap] = await Promise.all([
      vref.collection("trainingModules").get(),
      vref.collection("trainingAssignments").get(),
    ]);
    const modById = {}, modByTitle = {};
    modulesSnap.forEach((m) => { const d = m.data(); modById[m.id] = d; modByTitle[(d.title || "").toLowerCase()] = d; });

    for (const a of tAssignSnap.docs) {
      const d = a.data();
      const hasItems = (d.sections || []).some((s) => (s.items || []).length);
      if (hasItems) { tSkip++; continue; }
      const mod = modById[d.moduleId] || modByTitle[(d.moduleTitle || "").toLowerCase()];
      const total = stepsItemCount(mod?.steps);
      if (!mod || total === 0) { tSkip++; continue; } // nothing to snapshot (link-only module)
      const checks = resizeChecks(d.checks, total);
      const done = checks.filter(Boolean).length;
      const patch = {
        sections: mod.steps, itemsTotal: total, link: d.link || mod.link || "",
        checks, progress: Math.round((done / total) * 100),
        status: trainingStatus(done, total, !!d.verified),
      };
      console.log(`  TRAIN ${vid}/${a.id} "${d.moduleTitle}" → ${done}/${total} (${patch.status})`);
      if (!DRY) await a.ref.set(patch, { merge: true });
      tFixed++;
    }

    // ── Checklists ──
    const [clSnap, cAssignSnap] = await Promise.all([
      vref.collection("checklists").get(),
      vref.collection("checklistAssignments").get(),
    ]);
    const clById = {}, clByTitle = {};
    clSnap.forEach((c) => { const d = c.data(); clById[c.id] = d; clByTitle[(d.title || "").toLowerCase()] = d; });

    for (const a of cAssignSnap.docs) {
      const d = a.data();
      if ((d.items || []).length) { cSkip++; continue; }
      const cl = clById[d.checklistId] || clByTitle[(d.checklistTitle || "").toLowerCase()];
      const items = cl?.items || [];
      if (!cl || items.length === 0) { cSkip++; continue; }
      const checks = resizeChecks(d.checks, items.length);
      const done = checks.filter(Boolean).length;
      const patch = {
        items, itemsTotal: items.length, station: d.station || cl.station || "", area: d.area || cl.area || "All",
        checks, progress: Math.round((done / items.length) * 100),
        status: checklistStatus(done, items.length),
      };
      console.log(`  CHECK ${vid}/${a.id} "${d.checklistTitle}" → ${done}/${items.length} (${patch.status})`);
      if (!DRY) await a.ref.set(patch, { merge: true });
      cFixed++;
    }
  }
  console.log(`\nGroup ${groupId}: training fixed=${tFixed} skipped=${tSkip} · checklist fixed=${cFixed} skipped=${cSkip}`);
}

(async () => {
  console.log(`Target DB: ${DATABASE_ID}${DRY ? "  (DRY RUN — no writes)" : ""}`);
  const groups = groupArg
    ? [groupArg]
    : (await db.collection("restaurantGroups").get()).docs.map((g) => g.id);
  console.log("Groups:", groups.join(", "));
  for (const gid of groups) await backfillGroup(gid);
  console.log("\nDone.");
  process.exit(0);
})().catch((e) => { console.error("Back-fill failed:", e); process.exit(1); });
