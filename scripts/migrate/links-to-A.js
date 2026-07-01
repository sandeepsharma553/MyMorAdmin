/* Copy corrected awardLinks into group A on PROD (mymor-australia).
 * MA000003 (Fast Food) intentionally OMITTED (wrong industry); MA000119 re-tagged Primary.
 * Init reused from scripts/importer/import-madkitchen-staff.js. Admin SDK (bypasses rules).
 *
 * DRY-RUN BY DEFAULT — prints before/after and writes NOTHING. Pass --commit to write.
 * The ONLY write is set({ awardLinks }, { merge:true }) on the single group A doc.
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/links-to-A.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/links-to-A.js --commit
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const A = "WjaBnLrRfFgXzDd60FnX";
const DO_WRITE = process.argv.includes("--commit");

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

// The exact array to write (MA000003 omitted; MA000119 = Primary).
const awardLinks = [
  { code: "MA000119", label: "Restaurant Industry Award", desc: "Dine-in cafés, table-service venues — summary & pay guide", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000119-summary", tag: "Primary" },
  { code: "MA000004", label: "General Retail Award", desc: "Only if operating as part of a retail business", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000004-summary", tag: "Occasional" },
  { code: "", label: "Fair Work pay guides", desc: "Authoritative source — updated annually around 1 July", url: "https://www.fairwork.gov.au/pay-and-wages/minimum-wages/pay-guides", tag: "Verify here" },
];

const line = (c = "─") => c.repeat(78);

(async () => {
  console.log(`\n${line("═")}`);
  console.log(`awardLinks → group A (${A}) · DB ${DB_ID} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log(line("═"));

  const ref = db.collection("restaurantGroups").doc(A);
  const doc = await ref.get();
  if (!doc.exists) { console.error("HALT — group A doc does not exist."); process.exit(1); }
  const current = (doc.data() || {}).awardLinks;

  // STEP 0 — guard: don't overwrite an existing awardLinks without review
  console.log(`\nSTEP 0 — A's CURRENT awardLinks: ${current == null ? "ABSENT" : (Array.isArray(current) && current.length === 0 ? "EMPTY []" : `PRESENT (${Array.isArray(current) ? current.length : "?"} entries)`) }`);
  if (current != null && !(Array.isArray(current) && current.length === 0)) {
    console.log(JSON.stringify(current, null, 2));
    console.error("\nHALT — A already has awardLinks. Not overwriting without review. STOP.");
    process.exit(1);
  }

  // STEP 2 — before / after
  console.log(`\nSTEP 2 — DRY-RUN diff:`);
  console.log(`  BEFORE (awardLinks): ${current == null ? "ABSENT" : JSON.stringify(current)}`);
  console.log(`  AFTER  (awardLinks):`);
  console.log(JSON.stringify(awardLinks, null, 2));
  console.log(`\n  WOULD SET exactly 1 field ('awardLinks', ${awardLinks.length} entries) on 1 doc (restaurantGroups/${A}) via merge. Nothing else touched.`);
  console.log(`  (MA000003 Fast Food OMITTED · MA000119 tag = Primary)`);

  if (!DO_WRITE) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --commit to apply (only after approval).`);
    console.log(line("═") + "\n");
    process.exit(0);
  }

  await ref.set({ awardLinks }, { merge: true });
  const rb = ((await ref.get()).data() || {}).awardLinks;
  const ok = Array.isArray(rb) && rb.length === 3 && rb[0].code === "MA000119" && rb[0].tag === "Primary" && !rb.some((l) => l.code === "MA000003");
  console.log(`\n  ✓ wrote awardLinks (${Array.isArray(rb) ? rb.length : "?"} entries) to restaurantGroups/${A}`);
  console.log(`  read-back: ${ok ? "OK (3 entries, MA000119=Primary, no MA000003)" : "MISMATCH"}`);
  console.log(line("═") + "\n");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("links-to-A failed:", e); process.exit(1); });
