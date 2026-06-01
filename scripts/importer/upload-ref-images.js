/* Upload the BOH Morning Open reference images (extracted from morning open boh.xlsx)
 * to Storage and attach them to the matching training module + checklist in both
 * venues. Run from scripts/importer: node upload-ref-images.js */
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(admin.app(), "mymor-australia");
const bucket = admin.storage().bucket("mymor-one"); // the AU bucket the app reads

const G = "YQRkUwBO5wMIdLSgcpji";
const DIR = path.resolve(__dirname, "../content/refimages");
const KEY = "boh-morning-open";
const VENUES = ["hey-sister", "mad-hotpot"];
const FILES = [
  { file: "boh-open-grill.jpeg", caption: "Grill & Cooking Station" },
  { file: "boh-open-dressing-setup.jpeg", caption: "Dressing Bench setup" },
  { file: "boh-open-speed-rack.jpeg", caption: "Dressing Bench — sauces on speed rack" },
];

(async () => {
  const images = [];
  for (const { file, caption } of FILES) {
    const dest = `restaurantGroups/${G}/refimages/training/${KEY}/${file}`;
    const token = crypto.randomUUID();
    await bucket.upload(path.join(DIR, file), {
      destination: dest,
      metadata: { contentType: "image/jpeg", metadata: { firebaseStorageDownloadTokens: token } },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;
    images.push({ caption, url, path: dest });
    console.log(`  ✓ uploaded ${file}`);
  }

  for (const v of VENUES) {
    for (const coll of ["trainingModules", "checklists"]) {
      const ref = db.collection("restaurantGroups").doc(G).collection("venues").doc(v).collection(coll).doc(KEY);
      const snap = await ref.get();
      if (!snap.exists) { console.log(`  ! ${v}/${coll}/${KEY} missing, skipping`); continue; }
      await ref.set({ images }, { merge: true });
      console.log(`  ✓ attached ${images.length} images → ${v}/${coll}/${KEY}`);
    }
  }
  console.log("\nDone.");
  process.exit(0);
})().catch((e) => { console.error("Failed:", e); process.exit(1); });
