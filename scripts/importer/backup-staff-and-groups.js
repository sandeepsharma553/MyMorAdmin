/* Read-only backup of every group doc + all staff docs (all groups).
 *   node scripts/importer/backup-staff-and-groups.js
 * Backup-first safety step before the Area/Role/Station foundation (phase 2).
 * STRICTLY READ-ONLY — only .get() calls. Writes a timestamped JSON to backups/.
 *
 * Restore (manual, deliberate — NOT run here): for each group write
 *   restaurantGroups/{groupId} = group; for each staff write
 *   restaurantGroups/{groupId}/staff/{id} = data. */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = admin.firestore();
const DB_ID = process.env.RG_DATABASE_ID || "mymor-australia";
db.settings({ databaseId: DB_ID });

(async () => {
  console.log(`Backup staff + group docs — db=${db._settings.databaseId} (READ-ONLY)\n`);
  const groups = [];
  const staff = [];
  const gSnap = await db.collection("restaurantGroups").get();
  for (const g of gSnap.docs) {
    groups.push({ id: g.id, data: g.data() });
    const sSnap = await g.ref.collection("staff").get();
    for (const s of sSnap.docs) staff.push({ groupId: g.id, id: s.id, data: s.data() });
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(__dirname, "../../backups");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `staff-and-groups-${DB_ID}-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    db: DB_ID, exportedAt: new Date().toISOString(),
    groupCount: groups.length, staffCount: staff.length,
    groups, staff,
  }, null, 2));

  console.log(`groups=${groups.length} staff=${staff.length}`);
  console.log(`written: ${file}`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
