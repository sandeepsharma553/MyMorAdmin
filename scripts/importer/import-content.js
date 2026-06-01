/* Generic content importer for the restaurant-group platform.
 *
 * Usage:
 *   node import-content.js <groupId> <jsonFile> <collection> [idField]
 *
 * Example (training modules):
 *   node import-content.js YQRkUwBO5wMldLSgcpji ../content/mad-benji-training.json trainingModules key
 *
 * The JSON must have a top-level `modules` (or `items`) array. Each element is
 * written to restaurantGroups/{groupId}/{collection}/{<idField>} with merge,
 * so re-running updates rather than duplicating.
 */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const [, , groupId, jsonFile, collection, idField = "key"] = process.argv;
if (!groupId || !jsonFile || !collection) {
  console.error("Usage: node import-content.js <groupId> <jsonFile> <collection> [idField]");
  console.error("Env: RG_DATABASE_ID (default 'mymor-australia' = prod; dev is 'mymor-dev-aus')");
  process.exit(1);
}

// IMPORTANT: the app uses a NAMED Firestore database, not (default).
// Prod = mymor-australia (project mymor-one). Dev = mymor-dev-aus (project mymor-development).
const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const sa = require(path.resolve(__dirname, "../../secrets/serviceAccount.json"));
const app = admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = getFirestore(app, DATABASE_ID);
console.log(`Target database: ${DATABASE_ID}`);

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.resolve(__dirname, jsonFile), "utf8"));
  const items = raw.modules || raw.items || (Array.isArray(raw) ? raw : []);
  if (!items.length) { console.error("No items found in JSON."); process.exit(1); }

  const col = db.collection("restaurantGroups").doc(groupId).collection(collection);
  let n = 0;
  for (const it of items) {
    const id = it[idField] || db.collection("_").doc().id;
    const { [idField]: _drop, ...rest } = it;
    await col.doc(id).set(
      { ...rest, source: raw.sourceTitle || "import", importedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
    n++;
    console.log(`  ✓ ${collection}/${id}`);
  }
  console.log(`\nImported ${n} doc(s) into restaurantGroups/${groupId}/${collection}`);
  process.exit(0);
})().catch((e) => { console.error("Import failed:", e.message); process.exit(1); });
