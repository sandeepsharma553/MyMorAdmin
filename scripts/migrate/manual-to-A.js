/* Copy B's compliance manual → A on PROD (mymor-australia), WITH edits:
 *   - title  → "VIC Café & Restaurant Staff Manual"
 *   - createdAt/updatedAt → serverTimestamp at write time (do NOT carry B's 2025 createdAt)
 *   - DROP updatedBy ("importer")
 *   - keep version + all sections + everything else verbatim
 * Section bodies/titles are scanned for "fast food" and REPORTED, never auto-edited.
 * Init reused from import-madkitchen-staff.js. Admin SDK (bypasses rules).
 *
 * DRY-RUN BY DEFAULT — reads both, prints the full doc, writes NOTHING.
 * Pass --commit to write. The ONLY write is set() on A/compliance/manual (clean create).
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/manual-to-A.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/manual-to-A.js --commit
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const A = "WjaBnLrRfFgXzDd60FnX"; // target
const B = "YQRkUwBO5wMIdLSgcpji"; // source
const DO_WRITE = process.argv.includes("--commit");

const NEW_TITLE = "VIC Café & Restaurant Staff Manual";

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);
const manualRef = (g) => db.collection("restaurantGroups").doc(g).collection("compliance").doc("manual");
const line = (c = "─") => c.repeat(78);

(async () => {
  console.log(`\n${line("═")}`);
  console.log(`compliance/manual  B → A (WITH edits) · DB ${DB_ID} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`  source B = ${B}\n  target A = ${A}`);
  console.log(line("═"));

  // STEP 0 — read both
  const bDoc = await manualRef(B).get();
  const aDoc = await manualRef(A).get();
  console.log(`\nSTEP 0:`);
  console.log(`  B/compliance/manual exists? ${bDoc.exists}`);
  console.log(`  A/compliance/manual exists? ${aDoc.exists}`);
  if (!bDoc.exists) { console.error("\nHALT — B has no manual to copy."); process.exit(1); }
  if (aDoc.exists) {
    console.log("\n  A ALREADY HAS A MANUAL:");
    console.log(JSON.stringify(aDoc.data(), null, 2));
    console.error("\nHALT — A already has a manual. Not overwriting without review. STOP.");
    process.exit(1);
  }

  // STEP 1 — B's manual in full
  const src = bDoc.data() || {};
  const secs = Array.isArray(src.sections) ? src.sections : [];
  console.log(`\nSTEP 1 — B's manual: title=${JSON.stringify(src.title)} · version=${JSON.stringify(src.version)} · sections=${secs.length} · other keys=[${Object.keys(src).filter((k) => !["title", "version", "sections"].includes(k)).join(", ")}]`);

  // STEP 2 — build payload: verbatim EXCEPT title/timestamps; DROP updatedBy.
  const { updatedAt, createdAt, updatedBy, title, ...restKeep } = src; // strip these; restKeep = sections/version/anything else
  const payload = { ...restKeep, title: NEW_TITLE }; // + createdAt/updatedAt added at write time
  const payloadPreview = { ...payload, createdAt: "<serverTimestamp at write time>", updatedAt: "<serverTimestamp at write time>" };

  // scan for "fast food" in titles + bodies (report only; never auto-edit)
  const hits = [];
  secs.forEach((s) => {
    const inTitle = /fast\s*food/i.test(s.title || "");
    const inBody = /fast\s*food/i.test(s.body || "");
    if (inTitle || inBody) {
      const m = (s.body || "").match(/[^.]*fast\s*food[^.]*\.?/i);
      hits.push({ id: s.id, where: [inTitle && "title", inBody && "body"].filter(Boolean).join("+"), text: (inTitle ? `title="${s.title}" ` : "") + (m ? m[0].trim() : "") });
    }
  });
  // also flag the dropped-vs-kept fields
  console.log(`\nSTEP 2 — edits applied to the copy:`);
  console.log(`  title: ${JSON.stringify(src.title)} → ${JSON.stringify(NEW_TITLE)}`);
  console.log(`  createdAt: B's ${createdAt ? JSON.stringify(createdAt) : "—"} → serverTimestamp (fresh)`);
  console.log(`  updatedAt: → serverTimestamp (fresh)`);
  console.log(`  updatedBy: ${updatedBy !== undefined ? JSON.stringify(updatedBy) + " → DROPPED" : "(not present)"}`);
  console.log(`  version + all ${secs.length} sections + any other field: kept verbatim`);

  console.log(`\n  "fast food" scan (section titles + bodies): ${hits.length ? hits.length + " hit(s)" : "none found"}`);
  hits.forEach((h) => console.log(`    - [${h.id}] (${h.where}): ${h.text}`));

  console.log(`\nSTEP 3 — FULL doc that WOULD be written to A/compliance/manual:`);
  console.log(JSON.stringify(payloadPreview, null, 2));
  console.log(`\n  WOULD CREATE exactly 1 doc: restaurantGroups/${A}/compliance/manual (${secs.length} sections). A has NO manual → clean create, nothing else touched.`);

  if (!DO_WRITE) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --commit to apply (only after approval).`);
    console.log(line("═") + "\n");
    process.exit(0);
  }

  await manualRef(A).set({ ...payload, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  const rb = (await manualRef(A).get()).data() || {};
  const ok = rb.title === NEW_TITLE && rb.version === src.version && Array.isArray(rb.sections) && rb.sections.length === secs.length && rb.updatedBy === undefined;
  console.log(`\n  ✓ wrote A/compliance/manual (title=${JSON.stringify(rb.title)}, version=${JSON.stringify(rb.version)}, sections=${Array.isArray(rb.sections) ? rb.sections.length : "?"}, updatedBy present? ${rb.updatedBy !== undefined})`);
  console.log(`  read-back: ${ok ? "OK (new title, version + 9 sections, no updatedBy)" : "MISMATCH"}`);
  console.log(line("═") + "\n");
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error("manual-to-A failed:", e); process.exit(1); });
