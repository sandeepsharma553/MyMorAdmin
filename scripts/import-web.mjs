/* Import content into a Firestore project using the WEB SDK + the app's own
 * env config (so it targets the SAME project the app reads). Relies on the
 * project's currently-open security rules for the write. Run from repo root:
 *
 *   node scripts/import-web.mjs <envFile> <groupId> <jsonFile> <collection> [idField]
 *   node scripts/import-web.mjs .env.development YQRkUwBO5wMldLSgcpji scripts/content/mad-benji-training.json trainingModules key
 */
import fs from "fs";
import path from "path";
import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";

const [, , envFile, groupId, jsonFile, collName, idField = "key"] = process.argv;
if (!envFile || !groupId || !jsonFile || !collName) {
  console.error("Usage: node scripts/import-web.mjs <envFile> <groupId> <jsonFile> <collection> [idField]");
  process.exit(1);
}

// parse .env file
const env = {};
fs.readFileSync(envFile, "utf8").split(/\r?\n/).forEach((line) => {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
});
const isProd = (env.REACT_APP_ENV === "production");
const P = isProd ? "PROD" : "DEV";
const cfg = {
  apiKey: env[`REACT_APP_FIREBASE_${P}_API_KEY`],
  authDomain: env[`REACT_APP_FIREBASE_${P}_AUTH_DOMAIN`],
  databaseURL: env[`REACT_APP_FIREBASE_${P}_DATABASE_URL`],
  projectId: env[`REACT_APP_FIREBASE_${P}_PROJECT_ID`],
  storageBucket: env[`REACT_APP_FIREBASE_${P}_STORAGE_BUCKET`],
  messagingSenderId: env[`REACT_APP_FIREBASE_${P}_MESSAGING_SENDER_ID`],
  appId: env[`REACT_APP_FIREBASE_${P}_APP_ID`],
};

const app = initializeApp(cfg);
const db = getFirestore(app);

const run = async () => {
  console.log(`Target project: ${cfg.projectId}  (env ${envFile}, ${P})`);
  const gref = doc(db, "restaurantGroups", groupId);
  const gsnap = await getDoc(gref);
  if (!gsnap.exists()) { console.error(`✗ Group ${groupId} NOT found in ${cfg.projectId}. Aborting.`); process.exit(2); }
  console.log(`✓ Group found: ${gsnap.data().name || "(unnamed)"}`);
  const venues = await getDocs(collection(db, "restaurantGroups", groupId, "venues"));
  console.log(`  venues: ${venues.size} → ${venues.docs.map((d) => d.data().name).join(", ") || "—"}`);

  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonFile), "utf8"));
  const items = raw.modules || raw.items || [];
  let n = 0;
  for (const it of items) {
    const id = it[idField];
    const { [idField]: _d, ...rest } = it;
    await setDoc(doc(db, "restaurantGroups", groupId, collName, id), { ...rest, source: raw.sourceTitle || "import", importedAt: Date.now() }, { merge: true });
    n++; console.log(`  ✓ ${collName}/${id}`);
  }
  console.log(`\nImported ${n} doc(s) into ${cfg.projectId}/restaurantGroups/${groupId}/${collName}`);
  process.exit(0);
};
run().catch((e) => { console.error("Import failed:", e); process.exit(1); });
