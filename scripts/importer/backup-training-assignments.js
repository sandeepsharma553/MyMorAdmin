/* Read-only backup of ALL trainingAssignments across every group & venue.
 *   node scripts/importer/backup-training-assignments.js
 * Iterates restaurantGroups/* / venues/* / trainingAssignments/* and writes a
 * timestamped JSON snapshot to backups/. STRICTLY READ-ONLY — only .get() calls,
 * no Firestore writes. Mirrors the connection pattern of the other importer
 * scripts (named database "mymor-australia" in project mymor-one).
 *
 * Restore (manual, deliberate — NOT run here): for each record, write
 *   restaurantGroups/{groupId}/venues/{venueId}/trainingAssignments/{id} = data
 * to reproduce the pre-change state exactly. */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = admin.firestore();
const DB_ID = process.env.RG_DATABASE_ID || "mymor-australia";
db.settings({ databaseId: DB_ID });

(async () => {
  console.log(`Backup trainingAssignments — db=${db._settings.databaseId} (READ-ONLY)\n`);
  const records = [];
  let groupCount = 0, venueCount = 0;
  const groups = await db.collection("restaurantGroups").get();
  for (const g of groups.docs) {
    groupCount++;
    const venues = await g.ref.collection("venues").get();
    for (const v of venues.docs) {
      venueCount++;
      const assigns = await v.ref.collection("trainingAssignments").get();
      for (const a of assigns.docs) {
        records.push({ groupId: g.id, venueId: v.id, id: a.id, data: a.data() });
      }
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(__dirname, "../../backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `training-assignments-${DB_ID}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    db: DB_ID,
    exportedAt: new Date().toISOString(),
    groups: groupCount,
    venues: venueCount,
    count: records.length,
    records,
  }, null, 2));

  console.log(`groups=${groupCount} venues=${venueCount} trainingAssignments=${records.length}`);
  console.log(`written: ${file}`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
