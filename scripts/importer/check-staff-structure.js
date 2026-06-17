/* Read-only diagnostic for the Area/Role/Station foundation (phase 2).
 *   node scripts/importer/check-staff-structure.js
 * Reports distinct staff.area, staff.role and station.area values across every
 * group/venue. STRICTLY READ-ONLY — only .get() calls. */
const path = require("path");
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = admin.firestore();
db.settings({ databaseId: process.env.RG_DATABASE_ID || "mymor-australia" });

const tally = (map, key) => { const k = key === undefined ? "<undefined>" : key === "" ? "<empty>" : String(key); map.set(k, (map.get(k) || 0) + 1); };
const dump = (label, map) => {
  console.log(`\n${label} (${[...map.values()].reduce((a, b) => a + b, 0)} docs, ${map.size} distinct):`);
  [...map.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${String(n).padStart(4)}  ${k}`));
};

(async () => {
  console.log(`Staff-structure check — db=${db._settings.databaseId} (READ-ONLY)`);
  const areaVals = new Map(), roleVals = new Map(), stationAreaVals = new Map(), groupAreasCfg = new Map();
  let staffCount = 0, stationCount = 0;
  const groups = await db.collection("restaurantGroups").get();
  for (const g of groups.docs) {
    const gd = g.data();
    console.log(`\n— group ${g.id} (${gd.name || "?"}): roles[]=${JSON.stringify(gd.roles || null)} areas[]=${JSON.stringify(gd.areas || null)}`);
    (gd.areas || []).forEach((a) => tally(groupAreasCfg, a));
    const staff = await g.ref.collection("staff").get();
    for (const s of staff.docs) { staffCount++; const x = s.data(); tally(areaVals, x.area); tally(roleVals, x.role); }
    const venues = await g.ref.collection("venues").get();
    for (const v of venues.docs) {
      const stations = await v.ref.collection("stations").get();
      for (const st of stations.docs) { stationCount++; tally(stationAreaVals, st.data().area); }
    }
  }
  console.log(`\n===== SUMMARY (${groups.size} groups, ${staffCount} staff, ${stationCount} stations) =====`);
  dump("staff.area", areaVals);
  dump("staff.role", roleVals);
  dump("station.area", stationAreaVals);
  const outside = [...areaVals.keys()].filter((k) => !["FOH", "BOH", "Mgmt", "<undefined>", "<empty>"].includes(k));
  const hasCK = [...areaVals.keys()].some((k) => /^ck$|kitchen/i.test(k));
  console.log(`\n⚑ staff.area values outside FOH/BOH/Mgmt: ${outside.length ? outside.join(", ") : "NONE"}`);
  console.log(`⚑ any staff.area = CK/Kitchen: ${hasCK ? "YES — needs approval before data change" : "NO"}`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
