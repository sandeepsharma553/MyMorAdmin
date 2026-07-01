/* READ-ONLY migration preview across two groups on PROD (mymor-australia).
 * NO writes of any kind — only .get() and console.log.
 * Init reused from scripts/importer/import-madkitchen-staff.js.
 *   A = go-live target; B = staging/testing.
 * Run:  NODE_PATH=scripts/importer/node_modules node scripts/diag/migration-preview.js
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const A = "WjaBnLrRfFgXzDd60FnX"; // go-live target
const B = "YQRkUwBO5wMIdLSgcpji"; // staging/testing

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

const line = (c = "─") => c.repeat(78);
const grp = (g) => db.collection("restaurantGroups").doc(g);
const levelKeys = (lv) => (lv && typeof lv === "object") ? Object.keys(lv) : [];
const roughBytes = (obj) => Buffer.byteLength(JSON.stringify(obj || {}), "utf8");

(async () => {
  console.log(`\nMIGRATION PREVIEW · DB ${DB_ID} · READ-ONLY`);
  console.log(`A (go-live) = ${A}\nB (staging) = ${B}`);

  // ── SECTION 1: B's award docs ──
  console.log(`\n${line("═")}\nSECTION 1 — B's award docs (what an A→B copy may overwrite/delete)\n${line("═")}`);

  const b119 = await grp(B).collection("awardRates").doc("MA000119").get();
  console.log(`\n[B] awardRates/MA000119 exists? ${b119.exists}`);
  if (b119.exists) {
    const d = b119.data() || {};
    console.log("RAW:\n" + JSON.stringify(d, null, 2));
    console.log(`\nREPORT: verified=${JSON.stringify(d.verified)} (${typeof d.verified}) · effectiveFrom=${JSON.stringify(d.effectiveFrom)} · levels=${Array.isArray(d.levels) ? d.levels.length : "N/A"}`);
    console.log(`  levels[0] keys: [${levelKeys((d.levels || [])[0]).join(", ")}]`);
  }

  const b003 = await grp(B).collection("awardRates").doc("MA000003").get();
  console.log(`\n[B] awardRates/MA000003 exists? ${b003.exists}  (Fast Food award — slated for deletion)`);
  if (b003.exists) {
    const d = b003.data() || {};
    console.log("RAW:\n" + JSON.stringify(d, null, 2));
    console.log(`\nREPORT: verified=${JSON.stringify(d.verified)} (${typeof d.verified}) · name=${JSON.stringify(d.name)} · levels=${Array.isArray(d.levels) ? d.levels.length : "N/A"}`);
  }

  // ── SECTION 2: A's MA000119 (source of truth) ──
  console.log(`\n${line("═")}\nSECTION 2 — A's MA000119 (the source we'd copy to B)\n${line("═")}`);
  const a119 = await grp(A).collection("awardRates").doc("MA000119").get();
  console.log(`\n[A] awardRates/MA000119 exists? ${a119.exists}`);
  let aShape = [];
  if (a119.exists) {
    const d = a119.data() || {};
    console.log("RAW:\n" + JSON.stringify(d, null, 2));
    aShape = levelKeys((d.levels || [])[0]);
    console.log(`\nREPORT: verified=${JSON.stringify(d.verified)} (${typeof d.verified}) · effectiveFrom=${JSON.stringify(d.effectiveFrom)} · levels=${Array.isArray(d.levels) ? d.levels.length : "N/A"}`);
    console.log(`  levels[0] keys: [${aShape.join(", ")}]`);
    console.log(`  7 levels? ${Array.isArray(d.levels) && d.levels.length === 7 ? "YES" : "NO"} · verified===false? ${d.verified === false} · effectiveFrom==='2026-07-01'? ${d.effectiveFrom === "2026-07-01"}`);
  }
  const bShape = b119.exists ? levelKeys((b119.data().levels || [])[0]) : [];

  // ── SECTION 3: B's venues ──
  console.log(`\n${line("═")}\nSECTION 3 — B's venues (award references)\n${line("═")}`);
  const bVenues = await grp(B).collection("venues").get();
  const ma003Venues = [];
  bVenues.forEach((v) => {
    const d = v.data() || {};
    const ac = (d.awardCode == null || d.awardCode === "") ? "NOT SET" : d.awardCode;
    const st = (d.state == null || d.state === "") ? "NOT SET" : d.state;
    if (ac === "MA000003") ma003Venues.push(`${d.name || v.id} (${v.id})`);
    console.log(`  ${v.id.padEnd(18)} ${String(d.name || "").padEnd(16)} awardCode=${ac}  state=${st}`);
  });
  console.log(`\n  ANY B venue awardCode == "MA000003"? ${ma003Venues.length ? "YES → " + ma003Venues.join(", ") : "NO"}`);

  // ── SECTION 4: B's contract templates ──
  console.log(`\n${line("═")}\nSECTION 4 — B's contractTemplates (source for B→A copy)\n${line("═")}`);
  const bTpl = await grp(B).collection("contractTemplates").get();
  console.log(`  [B] contractTemplates: ${bTpl.size}`);
  bTpl.forEach((t) => {
    const d = t.data() || {};
    const keys = Object.keys(d);
    const secs = d.sections || d.body || null;
    const secInfo = Array.isArray(secs) ? `${secs.length} section(s)` : (secs ? typeof secs : "none");
    console.log(`  - ${t.id.padEnd(14)} keys=[${keys.join(", ")}]  area=${JSON.stringify(d.area)} basis=${JSON.stringify(d.basis)} version=${JSON.stringify(d.version)} tokenKeys=${Array.isArray(d.tokenKeys) ? d.tokenKeys.length : "—"}  sections=${secInfo}  ~${roughBytes(d)}B`);
  });
  const aTpl = await grp(A).collection("contractTemplates").get();
  console.log(`\n  [A] contractTemplates: ${aTpl.size}  (B→A copy is ${aTpl.size === 0 ? "PURELY ADDITIVE (overwrites nothing)" : "NOT clean — A already has templates"})`);

  // ── SECTION 5: SUMMARY ──
  console.log(`\n${line("═")}\nSECTION 5 — SUMMARY\n${line("═")}`);
  const shapesMatch = aShape.length && bShape.length && aShape.slice().sort().join(",") === bShape.slice().sort().join(",");
  console.log(`  (a) MA000119 level shape — A: [${aShape.join(", ")}]`);
  console.log(`                            B: [${bShape.join(", ")}]`);
  console.log(`      → ${!b119.exists ? "B has no MA000119 (A→B is a create, not overwrite)" : shapesMatch ? "SHAPES MATCH → safe overwrite" : "SHAPES DIFFER → needs field mapping before overwrite"}`);
  console.log(`  (b) MA000003 delete: ${ma003Venues.length ? "BLOCKED — venue(s) point at it: " + ma003Venues.join(", ") : "SAFE — no B venue references MA000003"}`);
  console.log(`  (c) A templates: ${aTpl.size} → B→A copy overwrites ${aTpl.size === 0 ? "NOTHING (purely additive)" : "EXISTING templates (not clean)"}`);

  console.log(`\n${line("═")}\nEND — read-only, nothing written.\n`);
  process.exit(0);
})().catch((e) => { console.error("migration-preview failed:", e); process.exit(1); });
