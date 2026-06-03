/* Import a checklist into one or more venues' checklists subcollections:
 *   restaurantGroups/{groupId}/venues/{venueId}/checklists/{key}
 *
 * JSON shape: { title, type, sub, items:[...], venues:["venue-id", ...] }
 * The same checklist is written into every venue listed in `venues`.
 * Run from scripts/importer:  node import-checklists.js <groupId> <jsonFile>
 * Env: RG_DATABASE_ID (default 'mymor-australia').
 */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const [, , groupId, jsonFile] = process.argv;
if (!groupId || !jsonFile) { console.error("Usage: node import-checklists.js <groupId> <jsonFile>"); process.exit(1); }

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

(async () => {
  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonFile), "utf8"));
  const venuesSnap = await db.collection("restaurantGroups").doc(groupId).collection("venues").get();
  const nameById = {}; venuesSnap.forEach((v) => { nameById[v.id] = v.data().name; });

  // Support either a single checklist object or a `checklists` array.
  const list = raw.checklists || [raw];
  const defaultVenues = raw.venues;

  for (const c of list) {
    const key = c.key || slug(c.title) || "checklist";
    const items = c.items || [];
    for (const vid of (c.venues || defaultVenues || [])) {
      const venueName = nameById[vid];
      if (!venueName) { console.log(`  ! venue ${vid} not found, skipping`); continue; }
      await db.collection("restaurantGroups").doc(groupId).collection("venues").doc(vid).collection("checklists").doc(key).set({
        title: c.title, sub: `${venueName} · ${c.sub || "Daily"}`, type: c.type || "Opening",
        area: c.area || "All", venueId: vid, venue: venueName, items, checked: items.map(() => false), days: c.days || [],
        source: c.source || raw.sourceTitle || "import", importedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`  ✓ venues/${vid}/checklists/${key}  (${items.length} items, days=${(c.days || []).join("/") || "daily"})`);
    }
  }
  console.log("\nDone.");
  process.exit(0);
})().catch((e) => { console.error("Import failed:", e); process.exit(1); });
