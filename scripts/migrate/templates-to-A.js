/* Copy B's contractTemplates → A on PROD (mymor-australia) + dependency check.
 * DRY-RUN by default — reads/prints only, writes nothing. Pass --commit to write.
 * Init reused from import-madkitchen-staff.js. Admin SDK (bypasses rules).
 * The ONLY writes (on --commit) are set() on each A/contractTemplates/{id} (clean create).
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/templates-to-A.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/migrate/templates-to-A.js --commit
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
const grp = (g) => db.collection("restaurantGroups").doc(g);
const bytes = (o) => Buffer.byteLength(JSON.stringify(o || {}), "utf8");
const line = (c = "─") => c.repeat(78);

// classify a token to a data source (mirrors ContractGeneratorPage TOKEN_SOURCE intent)
function classify(tok) {
  const t = String(tok);
  if (/^employer_/.test(t)) return "entity";            // employer_name/address/abn ← legalEntities
  if (/^employee_/.test(t)) return "staff";             // per-staff at generate time
  if (["classification_level", "hourly_rate"].includes(t)) return "award/private"; // award levels + staff private
  if (["employment_type", "commence_date", "location_basis"].includes(t)) return "staff";
  if (["offer_date"].includes(t)) return "typed";
  if (["owner_name", "discount_during", "discount_outside", "family_discount", "probation_shifts", "probation_months", "notice_weeks", "min_days"].includes(t)) return "defaults";
  return "unknown";
}

(async () => {
  console.log(`\n${line("═")}`);
  console.log(`contractTemplates  B → A · DB ${DB_ID} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`  source B = ${B}\n  target A = ${A}`);
  console.log(line("═"));

  // STEP 0 — guard
  const aTpl = await grp(A).collection("contractTemplates").get();
  console.log(`\nSTEP 0 — A/contractTemplates count: ${aTpl.size}`);
  if (aTpl.size !== 0) {
    console.log("  A ALREADY HAS TEMPLATES: [" + aTpl.docs.map((d) => d.id).join(", ") + "]");
    console.error("\nHALT — A already has templates. No overwrite/duplicate. STOP.");
    process.exit(1);
  }
  console.log("  → clean additive copy (A has none).");

  // STEP 1 — read B's templates in full
  const bTplSnap = await grp(B).collection("contractTemplates").get();
  console.log(`\nSTEP 1 — B/contractTemplates: ${bTplSnap.size} docs\n`);
  const templates = [];
  const tokenUnion = new Set();
  bTplSnap.forEach((d) => {
    const data = d.data() || {};
    const keys = Object.keys(data);
    const secs = Array.isArray(data.sections) ? data.sections.length : (Array.isArray(data.body) ? data.body.length : 0);
    const tks = Array.isArray(data.tokenKeys) ? data.tokenKeys : [];
    tks.forEach((t) => tokenUnion.add(t));
    templates.push({ id: d.id, data, keys, secs, tks });
    console.log(`  ── ${d.id} ──`);
    console.log(`     keys: [${keys.join(", ")}]`);
    console.log(`     area=${JSON.stringify(data.area)} basis=${JSON.stringify(data.basis)} award=${JSON.stringify(data.award)} version=${JSON.stringify(data.version)} · sections=${secs} · ~${bytes(data)}B`);
    console.log(`     tokenKeys (${tks.length}): [${tks.join(", ")}]`);
  });

  // STEP 2 — dependency check against A's data
  console.log(`\n${line("═")}\nSTEP 2 — DEPENDENCY CHECK (A's data vs template tokens)\n${line("═")}`);
  const a119 = await grp(A).collection("awardRates").doc("MA000119").get();
  const awardOk = a119.exists && Array.isArray((a119.data() || {}).levels) && a119.data().levels.length > 0;
  const legalDoc = await grp(A).doc ? null : null; // placeholder (settings are docs, read below)
  const legalEntitiesSnap = await grp(A).collection("settings").doc("legalEntities").get();
  const ents = legalEntitiesSnap.exists ? (legalEntitiesSnap.data().entities || []) : [];
  const entsWithAddr = ents.filter((e) => e && String(e.address || "").trim()).length;
  const entsWithAbn = ents.filter((e) => e && String(e.abn || "").trim()).length;
  const defaultsSnap = await grp(A).collection("settings").doc("contractDefaults").get();
  const classSnap = await grp(A).collection("settings").doc("contractClassifications").get();

  console.log(`\n  A awardRates/MA000119: exists=${a119.exists} · levels=${a119.exists ? ((a119.data().levels || []).length) : 0} · verified=${a119.exists ? JSON.stringify(a119.data().verified) : "n/a"}`);
  console.log(`  A settings/legalEntities: ${legalEntitiesSnap.exists ? `${ents.length} entit${ents.length === 1 ? "y" : "ies"} (with address: ${entsWithAddr}, with abn: ${entsWithAbn})` : "ABSENT"}`);
  console.log(`  A settings/contractDefaults: ${defaultsSnap.exists ? "present" : "ABSENT"}`);
  console.log(`  A settings/contractClassifications: ${classSnap.exists ? `present (${((classSnap.data() || {}).levels || []).length} levels)` : "ABSENT"}`);

  const satisfiable = (tok) => {
    const src = classify(tok);
    if (src === "staff") return ["yes", "per-staff at generate time (depends on selected staff fields)"];
    if (src === "typed") return ["yes", "typed on the contract"];
    if (src === "entity") {
      if (!legalEntitiesSnap.exists || ents.length === 0) return ["NO", "A has no legalEntities → blank"];
      if (tok === "employer_address" && entsWithAddr === 0) return ["partial", "entities exist but none have address"];
      if (tok === "employer_abn" && entsWithAbn === 0) return ["partial", "entities exist but none have abn (no employer_abn wiring yet)"];
      return ["yes", `from legalEntities (${ents.length})`];
    }
    if (src === "award/private") {
      if (tok === "classification_level") return classSnap.exists ? ["yes", "classification list present (or staff private)"] : (awardOk ? ["yes", "award levels present (dropdown source)"] : ["NO", "no award levels / classification list"]);
      if (tok === "hourly_rate") return awardOk ? ["yes", "award MA000119 has levels (rate auto-fill; needs verified=true to apply)"] : ["NO", "no award levels"];
    }
    if (src === "defaults") return defaultsSnap.exists ? ["yes", "from contractDefaults"] : ["NO", "A has no contractDefaults → blank"];
    return ["?", "unknown source"];
  };

  console.log(`\n  token | source | satisfiable in A now?`);
  console.log("  " + line("-").slice(0, 74));
  const unresolved = [];
  [...tokenUnion].sort().forEach((tok) => {
    const src = classify(tok);
    const [ok, reason] = satisfiable(tok);
    if (ok === "NO" || ok === "?") unresolved.push(tok);
    console.log(`  ${String(tok).padEnd(22)} ${String(src).padEnd(14)} ${ok.padEnd(8)} ${reason}`);
  });

  // STEP 3 covered above (defaults/classifications reads); summarise B-vs-A settings gaps
  console.log(`\n${line("═")}\nSTEP 3 — A-side settings that templates may read\n${line("═")}`);
  const bDefaults = await grp(B).collection("settings").doc("contractDefaults").get();
  const bClass = await grp(B).collection("settings").doc("contractClassifications").get();
  console.log(`  contractDefaults:        A=${defaultsSnap.exists ? "present" : "ABSENT"} · B=${bDefaults.exists ? "present" : "absent"}${!defaultsSnap.exists && bDefaults.exists ? "  → COPY B→A candidate" : ""}`);
  console.log(`  contractClassifications: A=${classSnap.exists ? "present" : "ABSENT"} · B=${bClass.exists ? "present" : "absent"}${!classSnap.exists && bClass.exists ? "  → COPY B→A candidate" : ""}`);
  console.log(`  legalEntities:           A=${legalEntitiesSnap.exists ? ents.length + " entities" : "ABSENT"}`);

  // STEP 4 — output summary
  console.log(`\n${line("═")}\nSTEP 4 — DRY-RUN SUMMARY\n${line("═")}`);
  console.log(`  A templates: 0 → copy is PURELY ADDITIVE (${templates.length} docs created, nothing overwritten).`);
  templates.forEach((t) => console.log(`    - ${t.id.padEnd(14)} keys=${t.keys.length} tokens=${t.tks.length} sections=${t.secs} ~${bytes(t.data)}B → A/contractTemplates/${t.id}`));
  console.log(`\n  UNRESOLVED / blank-risk tokens after copy: ${unresolved.length ? unresolved.join(", ") : "none"}`);
  console.log(`  Missing A-side settings that would blank a generated contract:`);
  console.log(`    contractDefaults: ${defaultsSnap.exists ? "OK" : "ABSENT → defaults tokens blank"}`);
  console.log(`    legalEntities:    ${legalEntitiesSnap.exists && ents.length ? "OK" : "ABSENT/EMPTY → employer tokens blank"}`);
  console.log(`    MA000119 verified: ${a119.exists ? (a119.data().verified ? "true" : "FALSE → hourly_rate not applied until a manager verifies") : "award absent"}`);
  console.log(`\n  WRITE SCOPE (on --commit): ${templates.length} template docs created in A/contractTemplates. Nothing else.`);

  if (!DO_WRITE) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --commit to apply (only after approval).`);
    console.log(line("═") + "\n");
    process.exit(0);
  }

  let wrote = 0;
  for (const t of templates) {
    await grp(A).collection("contractTemplates").doc(t.id).set(t.data); // verbatim copy, every field
    wrote++;
    console.log(`  ✓ wrote A/contractTemplates/${t.id}`);
  }

  // READ-BACK VERIFY — side-by-side B vs A (section count + tokenKeys length per template)
  console.log(`\n${line("═")}\nREAD-BACK VERIFY\n${line("═")}`);
  const rb = await grp(A).collection("contractTemplates").get();
  const aById = Object.fromEntries(rb.docs.map((d) => [d.id, d.data() || {}]));
  const expectedIds = ["boh_casual", "boh_hourly", "foh_casual", "foh_hourly"];
  const gotIds = rb.docs.map((d) => d.id).sort();
  console.log(`  A/contractTemplates now: ${rb.size} doc(s) → [${gotIds.join(", ")}]`);
  console.log(`  exactly 4, ids match [${expectedIds.join(", ")}]? ${rb.size === 4 && expectedIds.every((id) => aById[id]) ? "YES" : "NO"}`);

  const sc = (d) => Array.isArray(d.sections) ? d.sections.length : (Array.isArray(d.body) ? d.body.length : 0);
  const tl = (d) => Array.isArray(d.tokenKeys) ? d.tokenKeys.length : 0;
  console.log(`\n  ${"id".padEnd(14)} ${"B.sec".padEnd(7)} ${"A.sec".padEnd(7)} ${"B.tok".padEnd(7)} ${"A.tok".padEnd(7)} ${"B.keys".padEnd(7)} ${"A.keys".padEnd(7)} match`);
  console.log("  " + line("-").slice(0, 72));
  let allMatch = true;
  for (const t of templates) {
    const a = aById[t.id] || {};
    const bK = Object.keys(t.data).length, aK = Object.keys(a).length;
    const m = sc(t.data) === sc(a) && tl(t.data) === tl(a) && bK === aK;
    if (!m) allMatch = false;
    console.log(`  ${t.id.padEnd(14)} ${String(sc(t.data)).padEnd(7)} ${String(sc(a)).padEnd(7)} ${String(tl(t.data)).padEnd(7)} ${String(tl(a)).padEnd(7)} ${String(bK).padEnd(7)} ${String(aK).padEnd(7)} ${m ? "✓" : "✗ MISMATCH"}`);
  }

  // confirm no other collection touched
  const [clsAfter, defAfter] = await Promise.all([
    grp(A).collection("settings").doc("contractClassifications").get(),
    grp(A).collection("settings").doc("contractDefaults").get(),
  ]);
  console.log(`\n  contractClassifications (A): ${clsAfter.exists ? "PRESENT (unexpected — not touched by this script!)" : "still ABSENT ✓"}`);
  console.log(`  contractDefaults (A): ${defAfter.exists ? "present, unchanged (not touched by this script) ✓" : "ABSENT"}`);

  console.log(`\n  WRITE SCOPE: ${wrote} template docs created in A/contractTemplates. Nothing else.`);
  console.log(`  RESULT: ${rb.size === 4 && allMatch ? "OK — 4 templates, section/token/key counts all match B" : "CHECK — mismatch above"}`);
  console.log(line("═") + "\n");
  process.exit(rb.size === 4 && allMatch ? 0 : 1);
})().catch((e) => { console.error("templates-to-A failed:", e); process.exit(1); });
