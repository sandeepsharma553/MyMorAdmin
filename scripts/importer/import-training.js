/* Import training modules into PER-VENUE subcollections:
 *   restaurantGroups/{groupId}/venues/{venueId}/trainingModules/{key}
 *
 * Each module's `venue` name is mapped to the matching venue doc id (by name,
 * fallback to a slug). Run from scripts/importer:
 *   node import-training.js <groupId> <jsonFile>
 * Env: RG_DATABASE_ID (default 'mymor-australia').
 */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const [, , groupId, jsonFile] = process.argv;
if (!groupId || !jsonFile) { console.error("Usage: node import-training.js <groupId> <jsonFile>"); process.exit(1); }

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

(async () => {
  console.log(`Target database: ${DATABASE_ID}, group: ${groupId}`);
  const venues = await db.collection("restaurantGroups").doc(groupId).collection("venues").get();
  const byName = {}, nameById = {};
  venues.forEach((v) => { byName[(v.data().name || "").toLowerCase()] = v.id; nameById[v.id] = v.data().name; });
  console.log("Venues:", venues.docs.map((v) => v.data().name + "=" + v.id).join(", "));

  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonFile), "utf8"));
  // Top-level `venues` list applies every module to each listed venue.
  // Otherwise each module's `venue` name is mapped to its venue id.
  const targetVenues = (raw.venues && raw.venues.length) ? raw.venues : null;
  let n = 0;
  for (const m of raw.modules || []) {
    const { key, ...rest } = m;
    const vids = targetVenues || [byName[(m.venue || "").toLowerCase()] || slug(m.venue)];
    for (const vid of vids) {
      await db.collection("restaurantGroups").doc(groupId).collection("venues").doc(vid).collection("trainingModules").doc(key)
        .set({ ...rest, venueId: vid, venue: nameById[vid] || rest.venue || "", groupId, source: raw.sourceTitle || "import", importedAt: FieldValue.serverTimestamp() }, { merge: true });
      n++; console.log(`  ✓ venues/${vid}/trainingModules/${key}`);
    }
  }
  console.log(`\nImported ${n} module-doc(s) across ${(targetVenues || []).length || "mapped"} venue(s).`);
  process.exit(0);
})().catch((e) => { console.error("Import failed:", e); process.exit(1); });
