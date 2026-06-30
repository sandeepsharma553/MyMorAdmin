/* Backfill: mirror private/details.contractedMinHours → staff/{id}.contractedWeeklyHours
 * (manager-readable number on the staff doc; the private value is NEVER touched).
 * PROD project mymor-one, named DB mymor-australia. Admin SDK (bypasses rules).
 *
 * DRY-RUN BY DEFAULT — prints a table and writes NOTHING. Pass --commit to actually write.
 *   node scripts/backfill/mirror-contracted-hours.js            # dry run
 *   node scripts/backfill/mirror-contracted-hours.js --commit   # write (only when approved)
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const GROUP = "WjaBnLrRfFgXzDd60FnX";
const DB_ID = "mymor-australia";
const DO_WRITE = process.argv.includes("--commit");

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

// blank = empty / "NA" / "N/A" → no contracted minimum to mirror
const isBlank = (v) => { const s = String(v == null ? "" : v).trim(); return s === "" || /^n\/?a$/i.test(s); };

(async () => {
  console.log(`Group ${GROUP} | DB ${DB_ID} | mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}\n`);
  const staffCol = db.collection("restaurantGroups").doc(GROUP).collection("staff");
  const snap = await staffCol.get();

  const rows = [];
  let affected = 0, skipped = 0, alreadyOk = 0;
  for (const d of snap.docs) {
    const s = d.data() || {};
    const name = s.displayName || s.name || d.id;
    const priv = (await staffCol.doc(d.id).collection("private").doc("details").get()).data() || {};
    const raw = priv.contractedMinHours;
    if (isBlank(raw)) { skipped++; continue; }
    const N = Number(raw) || null;
    if (N == null) { skipped++; rows.push({ id: d.id, name, raw, action: `SKIP (non-numeric "${raw}")` }); continue; }
    const current = s.contractedWeeklyHours;
    if (Number(current) === N) { alreadyOk++; rows.push({ id: d.id, name, raw, action: `already = ${N} (no change)` }); continue; }
    affected++;
    rows.push({ id: d.id, name, raw, action: `would write contractedWeeklyHours = ${N}${current != null ? ` (was ${current})` : ""}` });
  }

  // table
  console.log("staffId".padEnd(30), "name".padEnd(22), "priv.contractedMinHours".padEnd(24), "action");
  console.log("-".repeat(110));
  for (const r of rows) {
    console.log(String(r.id).padEnd(30), String(r.name).slice(0, 21).padEnd(22), String(r.raw).padEnd(24), r.action);
  }

  console.log(`\nTotal staff: ${snap.size} | would write: ${affected} | already correct: ${alreadyOk} | skipped (blank/non-numeric): ${skipped}`);

  if (!DO_WRITE) { console.log("\nDRY-RUN — nothing written. Re-run with --commit to apply (only when approved)."); process.exit(0); }

  let wrote = 0;
  for (const r of rows) {
    if (!r.action.startsWith("would write")) continue;
    const N = Number(String(r.raw)) || null;
    await staffCol.doc(r.id).set({ contractedWeeklyHours: N, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    wrote++;
    console.log(`  ✓ ${r.id} → contractedWeeklyHours = ${N}`);
  }
  console.log(`\nDONE — wrote ${wrote} staff docs.`);
  process.exit(0);
})().catch((e) => { console.error("Backfill failed:", e); process.exit(1); });
