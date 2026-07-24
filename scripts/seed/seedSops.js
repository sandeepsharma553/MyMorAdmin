/* Seed the 3 on-duty SOPs into venues/{v}/sops for two groups.
 * PROD project mymor-one, named DB mymor-australia. Admin SDK (bypasses rules).
 * Init reused from scripts/seed/seed-award-ma000119.js.
 *
 * Doc shape matches src/pages/restaurantgroup/SOPsPage.js saveSop exactly:
 *   { title, cat, stationId:"", station:"", venueId, venue, duration, icon, color,
 *     desc, link, mandatory, steps:[{heading, items:[string]}], images:[],
 *     autoAssign:{roles:[], stations:[]} }
 * plus seed bookkeeping: _seed, createdAt (create only), updatedAt (always).
 * NO sop flag (SOPs collection docs ARE SOPs), NEVER touches trainingModules.
 *
 * DRY-RUN BY DEFAULT (also accepts --dry explicitly) — prints every intended
 * write, writes NOTHING. Pass --commit to write.
 * Optional filters: --group <groupId>   only that group
 *                   --venue <venueId>   only that venue (any group)
 *
 *   NODE_PATH=scripts/importer/node_modules node scripts/seed/seedSops.js
 *   NODE_PATH=scripts/importer/node_modules node scripts/seed/seedSops.js --commit --group X --venue Y
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const GROUPS = ["WjaBnLrRfFgXzDd60FnX", "YQRkUwBO5wMIdLSgcpji"];
const DB_ID = "mymor-australia";
const SEED_TAG = "sops-onduty-2026-07-24";
const DO_WRITE = process.argv.includes("--commit");
const argVal = (flag) => { const i = process.argv.indexOf(flag); return i > -1 ? process.argv[i + 1] : null; };
const ONLY_GROUP = argVal("--group");
const ONLY_VENUE = argVal("--venue");

const { sops } = require(path.resolve(__dirname, "data/sopsData.json"));

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

// The exact SOPsPage payload for one sop at one venue (slug/venue fields resolved).
const docFor = (sop, venueId, venueName) => ({
  title: sop.title,
  cat: sop.cat,
  stationId: "",
  station: "",
  venueId,
  venue: venueName,
  duration: sop.duration,
  icon: sop.icon,
  color: sop.color,
  desc: sop.desc,
  link: sop.link || "",
  mandatory: !!sop.mandatory,
  steps: sop.steps,
  images: [],
  autoAssign: { roles: [], stations: [] },
  _seed: SEED_TAG,
});

(async () => {
  console.log(`\n${"═".repeat(78)}`);
  console.log(`SEED SOPs · DB ${DB_ID} · mode: ${DO_WRITE ? "COMMIT (writing)" : "DRY-RUN (no writes)"}`);
  console.log(`SOPs: ${sops.map((s) => `${s.slug} [${s.cat}]`).join(" · ")}`);
  if (ONLY_GROUP) console.log(`filter: group ${ONLY_GROUP}`);
  if (ONLY_VENUE) console.log(`filter: venue ${ONLY_VENUE}`);
  console.log("═".repeat(78));

  let planned = 0, written = 0, created = 0, updated = 0;

  for (const groupId of GROUPS) {
    if (ONLY_GROUP && groupId !== ONLY_GROUP) continue;
    const groupRef = db.collection("restaurantGroups").doc(groupId);
    const gSnap = await groupRef.get();
    if (!gSnap.exists) { console.log(`\n✗ group ${groupId}: DOES NOT EXIST in ${DB_ID} — skipped entirely`); continue; }
    const gAreas = gSnap.data().areas;
    console.log(`\n### group ${groupId} (${gSnap.data().name || "no name"}) · configured areas: ${Array.isArray(gAreas) ? gAreas.join(", ") : "(default FOH/BOH)"}`);
    // flag any SOP cat that is not a configured area — it still renders (own cat
    // pill + the "All" filter) but has no matching area chip on the SOPs page
    const areaList = Array.isArray(gAreas) && gAreas.length ? gAreas : ["FOH", "BOH"];
    sops.forEach((s) => { if (!areaList.includes(s.cat)) console.log(`  ⚠ cat "${s.cat}" (${s.slug}) is not a configured area for this group — visible under "All" only`); });

    const vSnap = await groupRef.collection("venues").get();
    if (vSnap.empty) { console.log(`  ✗ no venues — nothing to seed`); continue; }

    for (const v of vSnap.docs) {
      if (ONLY_VENUE && v.id !== ONLY_VENUE) continue;
      const vName = (v.data() || {}).name || "";
      console.log(`\n  venue ${v.id} (${vName}):`);
      for (const sop of sops) {
        const ref = groupRef.collection("venues").doc(v.id).collection("sops").doc(sop.slug);
        const existing = await ref.get();
        const body = docFor(sop, v.id, vName);
        planned++;
        console.log(`    ${existing.exists ? "MERGE " : "CREATE"} sops/${sop.slug}  "${sop.title}" [${sop.cat}] · ${sop.steps.length} sections · ${sop.steps.reduce((a, s) => a + s.items.length, 0)} steps`);
        if (DO_WRITE) {
          const stamps = existing.exists
            ? { updatedAt: FieldValue.serverTimestamp() }
            : { createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
          await ref.set({ ...body, ...stamps }, { merge: true });
          written++; existing.exists ? updated++ : created++;
          // read-back: title + section count must match what we intended
          const rb = await ref.get();
          const ok = rb.exists && rb.data().title === sop.title && Array.isArray(rb.data().steps) && rb.data().steps.length === sop.steps.length && rb.data().cat === sop.cat;
          console.log(`      ${ok ? "✓ read-back OK" : "✗ READ-BACK MISMATCH"}`);
        }
      }
    }
  }

  console.log(`\n${"─".repeat(78)}`);
  if (DO_WRITE) console.log(`DONE — ${written} docs written (${created} created, ${updated} merged/updated).`);
  else console.log(`DRY-RUN — ${planned} writes planned, NOTHING written. Re-run with --commit to apply.`);
  console.log("═".repeat(78) + "\n");
  process.exit(0);
})().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
