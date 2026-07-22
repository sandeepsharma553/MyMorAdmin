/* Replace the v1 contractTemplates set with the v2 set parsed from the client's new docx
 * templates (scripts/seed/data/contract-templates-v2.json — source docx in
 * src/assets/contract-templates/). v2 splits "hourly" into fulltime/parttime, so the set
 * goes 4 → 6 docs, and each doc now carries tokenTypes (pink=system / green=settings /
 * yellow=text, from the client's highlight legend) + tokenDefaults (doc-baked values).
 *
 * DRY-RUN by default — reads/prints only, writes nothing. Pass --commit to write.
 * On --commit: set() each of the 6 v2 ids (clean overwrite of boh_casual/foh_casual),
 * then delete() the retired ids (boh_hourly, foh_hourly). Admin SDK (bypasses rules).
 *   NODE_PATH=scripts/importer/node_modules node scripts/seed/seed-contract-templates-v2.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/seed/seed-contract-templates-v2.js --commit
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const GROUP = "WjaBnLrRfFgXzDd60FnX"; // Mad Kitchen Group (live A group)
const DO_WRITE = process.argv.includes("--commit");
const RETIRED_IDS = ["boh_hourly", "foh_hourly"];

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);
const col = db.collection("restaurantGroups").doc(GROUP).collection("contractTemplates");
const line = (c = "─") => c.repeat(78);

const V2 = require("./data/contract-templates-v2.json");

(async () => {
  console.log(`\n${line("═")}`);
  console.log(`contractTemplates v2 reseed · DB ${DB_ID} · group ${GROUP} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log(line("═"));

  // STEP 0 — current state
  const cur = await col.get();
  console.log(`\nSTEP 0 — current templates (${cur.size}): [${cur.docs.map((d) => d.id).join(", ")}]`);

  // STEP 1 — what v2 will write
  const ids = Object.keys(V2);
  console.log(`\nSTEP 1 — v2 set (${ids.length}):`);
  for (const id of ids) {
    const t = V2[id];
    const lines = t.sections.reduce((n, s) => n + s.body.length, 0);
    console.log(`  ${id.padEnd(13)} ${t.label.padEnd(16)} sections:${String(t.sections.length).padStart(2)} lines:${String(lines).padStart(3)} tokens:${t.tokenKeys.length}`);
    console.log(`     tokens: ${t.tokenKeys.join(", ")}`);
  }
  const toDelete = cur.docs.map((d) => d.id).filter((id) => RETIRED_IDS.includes(id));
  const unexpected = cur.docs.map((d) => d.id).filter((id) => !ids.includes(id) && !RETIRED_IDS.includes(id));
  console.log(`\n  will overwrite: [${ids.filter((id) => cur.docs.some((d) => d.id === id)).join(", ")}]`);
  console.log(`  will create:    [${ids.filter((id) => !cur.docs.some((d) => d.id === id)).join(", ")}]`);
  console.log(`  will delete:    [${toDelete.join(", ")}]`);
  if (unexpected.length) console.log(`  LEFT UNTOUCHED (unknown ids): [${unexpected.join(", ")}]`);

  if (!DO_WRITE) {
    console.log(`\nDRY-RUN complete — nothing written. Re-run with --commit to apply.\n`);
    process.exit(0);
  }

  // STEP 2 — write the 6 v2 docs
  console.log(`\nSTEP 2 — writing ${ids.length} template docs…`);
  for (const id of ids) {
    await col.doc(id).set({ ...V2[id], seededAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    console.log(`  ✓ set ${id}`);
  }

  // STEP 3 — delete the retired hourly ids
  for (const id of toDelete) {
    await col.doc(id).delete();
    console.log(`  ✓ deleted ${id}`);
  }

  const after = await col.get();
  console.log(`\nDONE — templates now (${after.size}): [${after.docs.map((d) => d.id).join(", ")}]\n`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
