/* Seed MA000119 award rates for group WjaBnLrRfFgXzDd60FnX + point the 4 venues at it.
 * PROD project mymor-one, named DB mymor-australia. Admin SDK (bypasses rules).
 * Init reused from scripts/importer/import-madkitchen-staff.js.
 *
 * Figures reconciled cell-by-cell against Fair Work pay guide MA000119
 * (Effective 01/07/2026, Published 24/06/2026) — all MATCH.
 *
 * DRY-RUN BY DEFAULT — prints exactly what WOULD be written and writes NOTHING.
 * Pass --commit to actually write (only after explicit approval).
 *   NODE_PATH=scripts/importer/node_modules node scripts/seed/seed-award-ma000119.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/seed/seed-award-ma000119.js --commit
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const GROUP = "WjaBnLrRfFgXzDd60FnX";
const DB_ID = "mymor-australia";
const CODE = "MA000119";
const DO_WRITE = process.argv.includes("--commit");

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

// The award document (verified === false — a manager must verify in the rate editor).
const awardDoc = {
  code: "MA000119",
  name: "Restaurant Industry Award 2020",
  effectiveFrom: "2026-07-01",
  verified: false,
  reviewedBy: null,
  reviewedAt: null,
  notes: "Seeded from Fair Work pay guide MA000119, effective 01/07/2026 (published 24/06/2026). sat/sun/publicHol are FT/PT dollar figures. Casual weekend/PH pay derives from casualHourly + loading at pay-calc time.",
  penalties: { casualLoadingPct: 25 },
  levels: [
    { level: "Introductory", weekly: 978.10,  baseHourly: 25.74, casualHourly: 32.18, sat: 32.18, sun: 38.61, publicHol: 57.92, evening: null },
    { level: "Level 1",      weekly: 1004.90, baseHourly: 26.44, casualHourly: 33.05, sat: 33.05, sun: 39.66, publicHol: 59.49, evening: null },
    { level: "Level 2",      weekly: 1029.10, baseHourly: 27.08, casualHourly: 33.85, sat: 33.85, sun: 40.62, publicHol: 60.93, evening: null },
    { level: "Level 3",      weekly: 1062.90, baseHourly: 27.97, casualHourly: 34.96, sat: 34.96, sun: 41.96, publicHol: 62.93, evening: null },
    { level: "Level 4",      weekly: 1119.10, baseHourly: 29.45, casualHourly: 36.81, sat: 36.81, sun: 44.18, publicHol: 66.26, evening: null },
    { level: "Level 5",      weekly: 1189.40, baseHourly: 31.30, casualHourly: 39.13, sat: 39.13, sun: 46.95, publicHol: 70.43, evening: null },
    { level: "Level 6",      weekly: 1221.10, baseHourly: 32.13, casualHourly: 40.16, sat: 40.16, sun: 48.20, publicHol: 72.29, evening: null },
  ],
  juniorRates: [
    { ageBand: "Under 17", pct: 50 },
    { ageBand: "17",       pct: 60 },
    { ageBand: "18",       pct: 70 },
    { ageBand: "19",       pct: 85 },
    { ageBand: "20",       pct: 100 },
  ],
  // updatedAt added at write time (serverTimestamp)
};

const VENUE_PATCH = { awardCode: "MA000119", state: "VIC" };

(async () => {
  console.log(`\n${"═".repeat(78)}`);
  console.log(`SEED ${CODE} · group ${GROUP} · DB ${DB_ID} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log("═".repeat(78));

  const groupRef = db.collection("restaurantGroups").doc(GROUP);
  const awardRef = groupRef.collection("awardRates").doc(CODE);

  // does the award doc already exist? (context said EMPTY → this is a CREATE)
  const existing = await awardRef.get();
  console.log(`\nawardRates/${CODE} currently exists? ${existing.exists ? "YES (would MERGE/overwrite verified fields — STOP if unexpected)" : "NO (create)"}`);

  // ── the award doc that WOULD be written ──
  console.log(`\n### Award document to write at restaurantGroups/${GROUP}/awardRates/${CODE}:`);
  console.log(JSON.stringify({ ...awardDoc, updatedAt: "<serverTimestamp at write time>" }, null, 2));

  // ── venues: read current awardCode/state, show before → after ──
  const vSnap = await groupRef.collection("venues").get();
  console.log(`\n### Venue merges (${vSnap.size} venues) — touching ONLY awardCode + state:`);
  const venueRows = [];
  vSnap.forEach((d) => {
    const data = d.data() || {};
    const beforeAward = (data.awardCode == null || data.awardCode === "") ? "NOT SET" : data.awardCode;
    const beforeState = (data.state == null || data.state === "") ? "NOT SET" : data.state;
    venueRows.push({ id: d.id, name: data.name || "(no name)", beforeAward, beforeState });
    console.log(`  ${d.id.padEnd(18)} ${String(data.name || "").padEnd(16)}  awardCode: ${beforeAward} → ${VENUE_PATCH.awardCode}   state: ${beforeState} → ${VENUE_PATCH.state}`);
  });

  // ── summary ──
  console.log(`\n${"─".repeat(78)}`);
  console.log(`WOULD WRITE: 1 award doc (${CODE}) + ${vSnap.size} venue merges (${VENUE_PATCH.awardCode}/${VENUE_PATCH.state}).`);
  console.log(`Nothing else touched. verified = ${awardDoc.verified}. Venue merges set ONLY awardCode + state.`);

  if (!DO_WRITE) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --commit to apply (only after approval).`);
    console.log("═".repeat(78) + "\n");
    process.exit(0);
  }

  // ── real writes (only with --commit) ──
  await awardRef.set({ ...awardDoc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`\n  ✓ wrote awardRates/${CODE}`);
  for (const v of venueRows) {
    await groupRef.collection("venues").doc(v.id).set({ ...VENUE_PATCH, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    console.log(`  ✓ venue ${v.id} → awardCode=${VENUE_PATCH.awardCode}, state=${VENUE_PATCH.state}`);
  }
  // read-back verify
  const rb = await awardRef.get();
  const okAward = rb.exists && rb.data().code === CODE && Array.isArray(rb.data().levels) && rb.data().levels.length === 7 && rb.data().verified === false;
  console.log(`\nread-back award: ${okAward ? "OK (7 levels, verified=false)" : "MISMATCH"}`);
  console.log(`\nDONE — wrote 1 award doc + ${venueRows.length} venue merges.`);
  console.log("═".repeat(78) + "\n");
  process.exit(okAward ? 0 : 1);
})().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
