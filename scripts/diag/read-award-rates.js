/* READ-ONLY diagnostic — award rate data for group WjaBnLrRfFgXzDd60FnX on PROD (mymor-australia).
 * NO writes of any kind (no set/update/add/delete). Reads + prints only.
 * Init reused verbatim from scripts/importer/import-madkitchen-staff.js.
 * Run:  NODE_PATH=scripts/importer/node_modules node scripts/diag/read-award-rates.js
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const GROUP = "WjaBnLrRfFgXzDd60FnX";
const DB_ID = "mymor-australia";

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

const line = (c = "─") => c.repeat(78);
const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
// exact-value + type readout for a scalar field; flags MISSING vs null explicitly
const field = (obj, key) => {
  if (!has(obj, key)) return `${key}: MISSING`;
  const v = obj[key];
  if (v === null) return `${key}: null`;
  return `${key}: ${JSON.stringify(v)} (${typeof v})`;
};

(async () => {
  console.log(`\n${line("═")}`);
  console.log(`AWARD-RATE DIAGNOSTIC · group ${GROUP} · DB ${DB_ID} · READ-ONLY`);
  console.log(line("═"));

  // ── (A) awardRates ──
  const arSnap = await db.collection("restaurantGroups").doc(GROUP).collection("awardRates").get();
  const awardIds = [];
  console.log(`\n### (A) awardRates — ${arSnap.size} document(s)\n`);

  arSnap.forEach((doc) => {
    awardIds.push(doc.id);
    const d = doc.data() || {};
    console.log(line());
    console.log(`DOC ID: ${doc.id}`);
    console.log(line());
    console.log("RAW:");
    console.log(JSON.stringify(d, null, 2));
    console.log("\nREADOUT:");
    ["code", "name", "verified", "effectiveFrom", "reviewedBy", "reviewedAt"].forEach((k) => console.log("  " + field(d, k)));

    // levels
    console.log("  levels:");
    if (!has(d, "levels")) console.log("    levels: MISSING");
    else if (d.levels === null) console.log("    levels: null");
    else if (!Array.isArray(d.levels)) console.log(`    levels: NOT AN ARRAY (${typeof d.levels}) → ${JSON.stringify(d.levels)}`);
    else if (d.levels.length === 0) console.log("    levels: [] (empty)");
    else {
      const KNOWN = ["level", "weekly", "baseHourly", "casualHourly", "sat", "sun", "publicHol", "evening"];
      d.levels.forEach((lv, i) => {
        if (lv === null || typeof lv !== "object") { console.log(`    levels[${i}]: ${JSON.stringify(lv)}`); return; }
        const parts = KNOWN.map((k) => has(lv, k) ? `${k}=${JSON.stringify(lv[k])}` : `${k}=MISSING`);
        const extra = Object.keys(lv).filter((k) => !KNOWN.includes(k)).map((k) => `${k}=${JSON.stringify(lv[k])}`);
        console.log(`    levels[${i}]: ${parts.join(" · ")}${extra.length ? "  ||EXTRA: " + extra.join(" · ") : ""}`);
      });
    }

    // juniorRates
    console.log("  juniorRates:");
    if (!has(d, "juniorRates")) console.log("    juniorRates: MISSING");
    else if (d.juniorRates === null) console.log("    juniorRates: null");
    else if (!Array.isArray(d.juniorRates)) console.log(`    juniorRates: NOT AN ARRAY (${typeof d.juniorRates}) → ${JSON.stringify(d.juniorRates)}`);
    else if (d.juniorRates.length === 0) console.log("    juniorRates: [] (empty)");
    else d.juniorRates.forEach((jr, i) => {
      if (jr === null || typeof jr !== "object") { console.log(`    juniorRates[${i}]: ${JSON.stringify(jr)}`); return; }
      const parts = Object.keys(jr).map((k) => `${k}=${JSON.stringify(jr[k])}`);
      console.log(`    juniorRates[${i}]: ${parts.join(" · ")}`);
    });

    // penalties
    console.log("  penalties:");
    if (!has(d, "penalties")) console.log("    penalties: MISSING");
    else console.log("    " + JSON.stringify(d.penalties, null, 2).replace(/\n/g, "\n    "));

    // super
    console.log("  super:");
    if (!has(d, "super")) console.log("    super: MISSING");
    else console.log("    " + JSON.stringify(d.super, null, 2).replace(/\n/g, "\n    "));

    console.log("");
  });

  // ── (B) venues ──
  const vSnap = await db.collection("restaurantGroups").doc(GROUP).collection("venues").get();
  console.log(`\n### (B) venues — ${vSnap.size} document(s)\n`);
  const venues = [];
  vSnap.forEach((doc) => {
    const d = doc.data() || {};
    const awardCode = has(d, "awardCode") && d.awardCode != null && d.awardCode !== "" ? d.awardCode : "NOT SET";
    const state = has(d, "state") && d.state != null && d.state !== "" ? d.state : "NOT SET";
    venues.push({ id: doc.id, name: d.name || "(no name)", awardCode, state });
    console.log(`  ${doc.id.padEnd(20)} name=${JSON.stringify(d.name || "")}  awardCode=${awardCode}  state=${state}`);
  });

  // ── (C) SUMMARY ──
  console.log(`\n${line("═")}`);
  console.log("### (C) SUMMARY");
  console.log(line("═"));
  console.log(`Award codes found (doc IDs): ${awardIds.length ? awardIds.join(", ") : "(none)"}`);
  console.log(`MA000119 exists? ${awardIds.includes("MA000119") ? "YES" : "NO"}`);

  const nonStd = awardIds.filter((id) => id !== "MA000119");
  if (nonStd.length) {
    console.log("Award codes that are NOT MA000119:");
    nonStd.forEach((id) => {
      const d = (arSnap.docs.find((x) => x.id === id)?.data()) || {};
      console.log(`  - ${id}  name=${JSON.stringify(d.name || "(no name)")}  code(field)=${JSON.stringify(d.code)}`);
    });
  } else {
    console.log("Award codes that are NOT MA000119: (none)");
  }

  console.log("\nVenue → awardCode resolution:");
  venues.forEach((v) => {
    if (v.awardCode === "NOT SET") { console.log(`  ⚠ ${v.name} (${v.id}): awardCode NOT SET`); return; }
    const ok = awardIds.includes(v.awardCode);
    console.log(`  ${ok ? "✓" : "⚠"} ${v.name} (${v.id}): awardCode=${v.awardCode} → ${ok ? "exists in awardRates" : "MISSING from awardRates"}`);
  });

  console.log(`\n${line("═")}\nEND — read-only, nothing written.\n`);
  process.exit(0);
})().catch((e) => { console.error("Diagnostic failed:", e); process.exit(1); });
