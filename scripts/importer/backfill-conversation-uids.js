/* Back-fill memberUids onto existing group-chat conversation docs (Job 5).
 *
 * The member-only conversations rule + both apps' scoped queries key off
 * memberUids[] (Firebase auth uids). Conversations created before Job 5 only
 * carry memberIds[] (staff ids) — without this back-fill they disappear from
 * every member's screen once the apps query by memberUids (and become
 * unreadable once the member-only rule deploys).
 *
 * For each restaurantGroups/{gid}/conversations doc missing memberUids:
 *   - each memberId that matches a staff doc → that staff doc's adminUid
 *   - each memberId with NO staff doc → treated as an auth uid itself
 *     (the owner/admin creator case — both apps store the login uid there)
 *   - createdByUid (if present) is always included
 * Docs that already have a non-empty memberUids are left untouched.
 *
 * Usage (from scripts/importer):
 *   node backfill-conversation-uids.js [groupId] [--dry]
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

async function backfillGroup(groupId) {
  const gref = db.collection("restaurantGroups").doc(groupId);
  const [staffSnap, convSnap] = await Promise.all([
    gref.collection("staff").get(),
    gref.collection("conversations").get(),
  ]);
  const uidByStaffId = {};
  staffSnap.forEach((d) => { const s = d.data(); if (s.adminUid) uidByStaffId[d.id] = s.adminUid; });
  const staffIds = new Set(staffSnap.docs.map((d) => d.id));

  let stamped = 0, skipped = 0, unresolved = 0;
  for (const d of convSnap.docs) {
    const c = d.data();
    if (Array.isArray(c.memberUids) && c.memberUids.length) { skipped++; continue; }
    const uids = new Set();
    for (const mid of c.memberIds || []) {
      if (uidByStaffId[mid]) uids.add(uidByStaffId[mid]);
      else if (!staffIds.has(mid) && mid) uids.add(mid); // not a staff record — the id IS an auth uid
      else unresolved++; // staff record exists but has no adminUid — they can't hold rules access anyway
    }
    if (c.createdByUid) uids.add(c.createdByUid);
    const memberUids = [...uids];
    if (!memberUids.length) {
      console.log(`  ⚠ ${groupId}/conversations/${d.id} "${c.name || ""}" — no resolvable uids, NOT stamping (would lock everyone out)`);
      continue;
    }
    console.log(`  ${DRY ? "[dry] would stamp" : "stamping"} ${groupId}/conversations/${d.id} "${c.name || ""}" → ${memberUids.length} uid(s)`);
    if (!DRY) await d.ref.update({ memberUids });
    stamped++;
  }
  console.log(`${groupId}: ${stamped} stamped, ${skipped} already had memberUids, ${unresolved} member(s) without a login skipped`);
}

(async () => {
  const groupIds = groupArg
    ? [groupArg]
    : (await db.collection("restaurantGroups").get()).docs.map((d) => d.id);
  for (const gid of groupIds) await backfillGroup(gid);
  console.log(DRY ? "Dry run complete — nothing written." : "Back-fill complete.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
