/* READ-ONLY audit dump of the Stock + Menu/POS data model for one restaurant group.
 *
 *   node scripts/audit/dump-stock-menu.js
 *
 * Reuses the SAME firebase-admin service account the importers use
 * (secrets/serviceAccount.json) and the SAME named database (mymor-australia).
 * It NEVER writes: getDocs/listDocuments only, zero set/update/delete/add.
 *
 * Env (all optional, defaults = live Mad Kitchen prod):
 *   RG_DATABASE_ID  default 'mymor-australia'
 *   RG_GROUP_ID     default 'YQRkUwBO5wMIdLSgcpji'  (Mad Kitchen Group — capital I)
 *
 * For each stock/menu collection it prints the path, the document COUNT, and ONE
 * full sample document (all fields), with tfn/bank/pin-like values redacted.    */
const path = require("path");
// reuse the importer's firebase-admin install (no new dependency added). Run with
//   NODE_PATH=scripts/importer/node_modules node scripts/audit/dump-stock-menu.js
// so the bare specifiers below resolve there (preserves the package exports map
// that an absolute-path require would break for the /firestore subpath).
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP_ID = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji"; // Mad Kitchen Group (capital I — the live id)

const app = admin.initializeApp({
  credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))),
});
const db = getFirestore(app, DATABASE_ID);
const groupRef = db.collection("restaurantGroups").doc(GROUP_ID);

// Group-level stock/menu collections (definitions live once per group).
const GROUP_COLLECTIONS = [
  "inventoryItems", "menuItems", "recipes", "modifierGroups", "suppliers", "purchaseOrders",
];
// Per-venue stock/menu collections (under venues/{venueId}/...).
const VENUE_COLLECTIONS = [
  "stock", "stockMovements", "stocktakes", "batches", "production",
];

// Redact obviously sensitive leaf values by key name (defensive — stock/menu
// docs should not contain these, but the dump is generic).
const SENSITIVE = /(tfn|bank|bsb|account(no|number)?|pin|password|secret|token)/i;
const redact = (v, key) => {
  if (key && SENSITIVE.test(key) && v != null && v !== "") return "«REDACTED»";
  if (Array.isArray(v)) return v.map((x) => redact(x));
  if (v && typeof v === "object") {
    // Firestore Timestamp → leave a readable marker, don't recurse into internals
    if (typeof v.toDate === "function") { try { return `«ts:${v.toDate().toISOString()}»`; } catch { return "«ts»"; } }
    const out = {};
    for (const k of Object.keys(v)) out[k] = redact(v[k], k);
    return out;
  }
  return v;
};

const printColl = async (label, colRef) => {
  let snap;
  try {
    snap = await colRef.get();
  } catch (e) {
    console.log(`\n### ${label}`);
    console.log(`    path : ${colRef.path}`);
    console.log(`    ERROR: ${e.code || e.message}`);
    return;
  }
  console.log(`\n### ${label}`);
  console.log(`    path : ${colRef.path}`);
  console.log(`    count: ${snap.size}`);
  if (!snap.empty) {
    const d = snap.docs[0];
    console.log(`    sample doc id: ${d.id}`);
    console.log(JSON.stringify(redact(d.data()), null, 2).split("\n").map((l) => "      " + l).join("\n"));
  }
};

(async () => {
  console.log(`# Stock/Menu live dump`);
  console.log(`# database = ${DATABASE_ID}`);
  console.log(`# group    = ${GROUP_ID}`);

  // group doc existence + a few config fields relevant to the model
  const gSnap = await groupRef.get();
  console.log(`\n## restaurantGroups/${GROUP_ID}  exists=${gSnap.exists}`);
  if (gSnap.exists) {
    const g = gSnap.data() || {};
    const cfg = {};
    ["name", "menuCategories", "stockCategories", "stockUnits", "purchaseUnits", "recipeUnits", "storageLocations", "stockItemTypes"]
      .forEach((k) => { if (g[k] !== undefined) cfg[k] = g[k]; });
    console.log("   config keys present: " + JSON.stringify(cfg, null, 2).split("\n").map((l, i) => i ? "   " + l : l).join("\n"));
  }

  console.log(`\n===== GROUP-LEVEL COLLECTIONS =====`);
  for (const c of GROUP_COLLECTIONS) {
    await printColl(c, groupRef.collection(c));
  }

  // enumerate venues, then dump each per-venue collection for every venue
  const venuesSnap = await groupRef.collection("venues").get();
  const venues = venuesSnap.docs.map((d) => ({ id: d.id, name: (d.data() || {}).name || d.id }));
  console.log(`\n===== VENUES (${venues.length}) =====`);
  venues.forEach((v) => console.log(`   ${v.id}  ${v.name}`));

  console.log(`\n===== PER-VENUE COLLECTIONS =====`);
  for (const v of venues) {
    for (const c of VENUE_COLLECTIONS) {
      await printColl(`${c}  @ ${v.name} (${v.id})`, groupRef.collection("venues").doc(v.id).collection(c));
    }
  }

  console.log(`\n# done — read-only, no writes performed.`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
