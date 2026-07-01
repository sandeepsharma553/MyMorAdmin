/* Copy ONLY B's settings/contractDefaults → A on PROD (mymor-australia), verbatim EXCEPT
 * timestamp/importer fields (fresh serverTimestamp / dropped). contractClassifications is
 * NOT touched this run. Init reused from import-madkitchen-staff.js. Admin SDK (bypasses rules).
 *
 * DRY-RUN by default — reads/prints only, writes nothing. Pass --commit to write.
 * The ONLY write (on --commit) is set() on A/settings/contractDefaults (clean create).
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/contract-settings-to-A.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/contract-settings-to-A.js --commit
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const A = "WjaBnLrRfFgXzDd60FnX"; // target
const B = "YQRkUwBO5wMIdLSgcpji"; // source
const DO_WRITE = process.argv.includes("--commit");

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);
const sref = (g, id) => db.collection("restaurantGroups").doc(g).collection("settings").doc(id);
const line = (c = "─") => c.repeat(78);

// strip timestamp/importer bookkeeping; caller re-adds fresh updatedAt at write
const STRIP = ["updatedAt", "createdAt", "updatedBy", "seededAt", "importedAt"];
const cleanForWrite = (src) => Object.fromEntries(Object.entries(src).filter(([k]) => !STRIP.includes(k)));

(async () => {
  console.log(`\n${line("═")}`);
  console.log(`contractDefaults ONLY  B → A · DB ${DB_ID} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`  source B = ${B}\n  target A = ${A}`);
  console.log(`  (contractClassifications is NOT touched this run)`);
  console.log(line("═"));

  // STEP 0 — guard
  const [aDef, bDef] = await Promise.all([sref(A, "contractDefaults").get(), sref(B, "contractDefaults").get()]);
  console.log(`\nSTEP 0 — existence:`);
  console.log(`  A/settings/contractDefaults: ${aDef.exists ? "PRESENT" : "ABSENT"}`);
  console.log(`  B/settings/contractDefaults: ${bDef.exists ? "present" : "absent"}`);
  if (aDef.exists) {
    console.log("\n  A contractDefaults ALREADY EXISTS:\n" + JSON.stringify(aDef.data(), null, 2));
    console.error("\nHALT — A already has contractDefaults. No overwrite. STOP.");
    process.exit(1);
  }
  if (!bDef.exists) { console.error("\nHALT — B has no contractDefaults to copy."); process.exit(1); }

  // STEP 1 — B contractDefaults full
  const defData = bDef.data() || {};
  console.log(`\n${line("═")}\nSTEP 1 — B/settings/contractDefaults (FULL)\n${line("═")}`);
  console.log(JSON.stringify(defData, null, 2));

  // STEP 2/3 — payload + token report
  const payload = cleanForWrite(defData);
  const nonBlank = (k) => payload[k] !== undefined && String(payload[k]).trim() !== "";
  const filled = ["ownerName", "discount_during", "discount_outside", "family_discount"].filter((k) => nonBlank(k));
  const blank = ["notice_weeks", "probation_months", "probation_shifts", "min_days", "employerName", "abn"].filter((k) => !nonBlank(k));

  console.log(`\n${line("═")}\nSTEP 3 — DRY-RUN OUTPUT\n${line("═")}`);
  console.log(`  A has no contractDefaults → clean additive create.`);
  console.log(`\n  WOULD WRITE A/settings/contractDefaults (verbatim minus ${STRIP.join("/")}, fresh updatedAt):`);
  console.log(JSON.stringify({ ...payload, updatedAt: "<serverTimestamp at write time>" }, null, 2));

  console.log(`\n  FILLS these tokens: ${filled.map((k) => `${k}=${JSON.stringify(payload[k])}`).join(", ") || "(none)"}`);
  console.log(`  STILL BLANK (render ‹token› on a contract): ${blank.join(", ") || "(none)"}`);
  console.log(`    → notice_weeks/probation_*/min_days: set in Settings → Contracts when ready.`);
  console.log(`    → employer_name: resolves from legalEntities first (A has none) then defaults.employerName ("") → blank until entities exist in A.`);

  console.log(`\n  WRITE SCOPE (on --commit): exactly 1 doc created (A/settings/contractDefaults). contractClassifications untouched. Nothing else.`);

  if (!DO_WRITE) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --commit to apply (only after approval).`);
    console.log(line("═") + "\n");
    process.exit(0);
  }

  await sref(A, "contractDefaults").set({ ...payload, updatedAt: FieldValue.serverTimestamp() });
  const rb = await sref(A, "contractDefaults").get();
  const ok = rb.exists && rb.data().ownerName === defData.ownerName && rb.data().updatedBy === undefined && rb.data().seededAt === undefined;
  console.log(`\n  ✓ wrote A/settings/contractDefaults`);
  console.log(`  read-back: ${ok ? "OK (ownerName preserved, no seededAt/updatedBy)" : "MISMATCH"}`);
  console.log(line("═") + "\n");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("contract-settings-to-A failed:", e); process.exit(1); });
