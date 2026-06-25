/* Remove the pre-existing DEMO menu data from Firestore now that the real Mad
 * Benji menu is imported. DRY-RUN BY DEFAULT — prints the full delete plan and
 * deletes NOTHING. Pass --commit to actually delete.
 *
 *   node scripts/importer/delete-demo-menu.js            # dry run (default)
 *   node scripts/importer/delete-demo-menu.js --commit   # delete
 *
 * Same firebase-admin init + service account as import-madbenji-menu.js.
 * Target DB mymor-australia, group YQRkUwBO5wMIdLSgcpji.
 *
 * SCOPE: menu data ONLY — menuItems, modifierGroups, recipes, group.menuCategories.
 * Never touches inventoryItems, venues/*, suppliers, purchaseOrders, staff, shifts.
 *
 * Demo sets are COMPUTED, not hardcoded:
 *   demo menuItems      = id NOT starting "mi_"
 *   demo modifierGroups = id NOT starting "mg_"
 *   demo categories     = current group.menuCategories MINUS the import JSON's list
 *   demo recipes        = recipes with a menuItemId pointing to a demo (or missing)
 *                         menuItem; production recipes (producesItemId, no menuItemId)
 *                         are stock data and are LEFT ALONE.                          */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP_ID = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji";
const COMMIT = process.argv.includes("--commit");

const IMPORT_DIR = path.resolve(__dirname, "../import");
const resolveSource = () => {
  for (const c of ["mymor_madbenji_import.json"]) {
    const p = path.join(IMPORT_DIR, c); if (fs.existsSync(p)) return p;
  }
  const any = fs.existsSync(IMPORT_DIR) && fs.readdirSync(IMPORT_DIR).find((f) => f.toLowerCase().endsWith(".json"));
  if (any) return path.join(IMPORT_DIR, any);
  throw new Error(`No import JSON found in ${IMPORT_DIR}`);
};
const SRC = resolveSource();
const data = JSON.parse(fs.readFileSync(SRC, "utf8"));

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const groupRef = db.collection("restaurantGroups").doc(GROUP_ID);

const EXPECT = { demoItems: 21, demoGroups: 5, demoCats: 7 };

(async () => {
  console.log(`# Delete DEMO menu data  ${COMMIT ? "(COMMIT)" : "(DRY RUN — no deletes)"}`);
  console.log(`# source   : ${SRC}`);
  console.log(`# database : ${DATABASE_ID}`);
  console.log(`# group    : ${GROUP_ID}`);

  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new Error(`group ${GROUP_ID} missing in ${DATABASE_ID}`);
  const curCats = Array.isArray(gSnap.data().menuCategories) ? gSnap.data().menuCategories : [];
  const jsonCats = data.menuCategories || [];
  const jsonCatSet = new Set(jsonCats);

  const [miSnap, mgSnap, recSnap] = await Promise.all([
    groupRef.collection("menuItems").get(),
    groupRef.collection("modifierGroups").get(),
    groupRef.collection("recipes").get(),
  ]);

  const allItemIds = new Set(miSnap.docs.map((d) => d.id));
  const demoItems = miSnap.docs.filter((d) => !/^mi_/.test(d.id));
  const realItems = miSnap.docs.filter((d) => /^mi_/.test(d.id));
  const demoItemIds = new Set(demoItems.map((d) => d.id));
  const demoGroups = mgSnap.docs.filter((d) => !/^mg_/.test(d.id));
  const demoGroupIds = new Set(demoGroups.map((d) => d.id));
  const demoCats = curCats.filter((c) => !jsonCatSet.has(c));
  const demoCatSet = new Set(demoCats);

  // demo recipes: have a menuItemId pointing to a demo OR missing menuItem.
  // production recipes (producesItemId & no menuItemId) are NOT menu data → skip.
  const recDelete = [], recReportOnly = [], recProduction = [];
  recSnap.docs.forEach((d) => {
    const r = d.data();
    if (r.producesItemId && !r.menuItemId) { recProduction.push(d.id); return; }
    const mid = r.menuItemId;
    if (!mid) { recReportOnly.push({ id: d.id, why: "no menuItemId / no producesItemId" }); return; }
    if (demoItemIds.has(mid)) recDelete.push({ id: d.id, menuItemId: mid, why: "→ demo menuItem" });
    else if (!allItemIds.has(mid)) recDelete.push({ id: d.id, menuItemId: mid, why: "→ missing menuItem (orphan)" });
    // else points to a real mi_ item → keep (not demo)
  });

  // ── SAFETY GATES ──
  const gate1 = [];
  realItems.forEach((d) => (d.data().modifierGroupIds || []).forEach((id) => { if (demoGroupIds.has(id)) gate1.push(`${d.id} → ${id}`); }));
  const gate2 = realItems.filter((d) => demoCatSet.has(d.data().category)).map((d) => `${d.id} cat=${d.data().category}`);

  console.log(`\n## CURRENT COUNTS`);
  console.log(`   menuItems ${miSnap.size} (real mi_*: ${realItems.length} | demo: ${demoItems.length})`);
  console.log(`   modifierGroups ${mgSnap.size} (demo: ${demoGroups.length})`);
  console.log(`   recipes ${recSnap.size} | menuCategories ${curCats.length} (demo: ${demoCats.length}, json: ${jsonCats.length})`);

  const flag = (label, got, exp) => got === exp ? "" : `  ⚠ expected ~${exp}, got ${got}`;
  console.log(`\n## EXPECTATION CHECK`);
  console.log(`   demo menuItems ${demoItems.length}${flag("", demoItems.length, EXPECT.demoItems)}`);
  console.log(`   demo modifierGroups ${demoGroups.length}${flag("", demoGroups.length, EXPECT.demoGroups)}`);
  console.log(`   demo categories ${demoCats.length}${flag("", demoCats.length, EXPECT.demoCats)}`);
  console.log(`   NOTE: final menuItems will be ${realItems.length} (= 281 imported items + 2 combos mi_995/mi_1029),`);
  console.log(`         NOT 281 — the combo import added 2 legitimate mi_* docs after this task's expectation was written.`);

  console.log(`\n## SAFETY GATES`);
  console.log(`   GATE1 (no mi_ item references a demo modifierGroup): ${gate1.length ? "FAIL → " + JSON.stringify(gate1) : "PASS"}`);
  console.log(`   GATE2 (no mi_ item uses a demo category): ${gate2.length ? "FAIL → " + JSON.stringify(gate2) : "PASS"}`);
  console.log(`   Recipes reported-but-NOT-deleted (production): ${recProduction.length ? JSON.stringify(recProduction) : "none"}`);
  console.log(`   Recipes reported-but-NOT-deleted (no link, manual review): ${recReportOnly.length ? JSON.stringify(recReportOnly) : "none"}`);

  if (gate1.length || gate2.length) { console.error(`\nABORT: safety gate failed — see above. Nothing deleted.`); process.exit(2); }

  // ── DELETE PLAN ──
  console.log(`\n## DELETE PLAN`);
  console.log(`\n# menuItems to delete (${demoItems.length}):`);
  demoItems.forEach((d) => console.log(`   DEL menuItems/${d.id}  "${d.data().displayName || ""}"`));
  console.log(`\n# modifierGroups to delete (${demoGroups.length}):`);
  demoGroups.forEach((d) => console.log(`   DEL modifierGroups/${d.id}  "${d.data().name || ""}"`));
  console.log(`\n# recipes to delete (${recDelete.length}):`);
  recDelete.forEach((r) => console.log(`   DEL recipes/${r.id}  (${r.menuItemId} ${r.why})`));
  console.log(`\n# group.menuCategories rewrite → ${jsonCats.length} real categories:`);
  console.log(`   ${JSON.stringify(jsonCats)}`);
  console.log(`\n# Removing categories: ${JSON.stringify(demoCats)}`);

  if (!COMMIT) {
    console.log(`\n## RESULT AFTER DELETE (projected)`);
    console.log(`   menuItems ${realItems.length} · modifierGroups ${mgSnap.size - demoGroups.length} · recipes ${recSnap.size - recDelete.length} · menuCategories ${jsonCats.length}`);
    console.log(`\n# DRY RUN complete — NOTHING deleted. Re-run with --commit to apply.`);
    process.exit(0);
  }

  // ── COMMIT (delete) ──
  console.log(`\n## DELETING…`);
  const refs = [
    ...demoItems.map((d) => groupRef.collection("menuItems").doc(d.id)),
    ...demoGroups.map((d) => groupRef.collection("modifierGroups").doc(d.id)),
    ...recDelete.map((r) => groupRef.collection("recipes").doc(r.id)),
  ];
  let done = 0;
  for (let i = 0; i < refs.length; i += 450) {
    const batch = db.batch();
    refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
    await batch.commit();
    done += Math.min(450, refs.length - i);
    console.log(`   deleted ${done}/${refs.length} docs`);
  }
  await groupRef.set({ menuCategories: jsonCats, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`   group.menuCategories rewritten → ${jsonCats.length}`);

  // ── READ-BACK ──
  const [miA, mgA, recA, gA] = await Promise.all([
    groupRef.collection("menuItems").get(),
    groupRef.collection("modifierGroups").get(),
    groupRef.collection("recipes").get(),
    groupRef.get(),
  ]);
  console.log(`\n## READ-BACK (final counts)`);
  console.log(`   menuItems ${miA.size}  (expect 283 = 281 items + 2 combos; task line said 281 pre-combos)`);
  console.log(`   modifierGroups ${mgA.size}  (expect 105)`);
  console.log(`   recipes ${recA.size}`);
  console.log(`   menuCategories ${(gA.data().menuCategories || []).length}  (expect 30)`);
  console.log(`   remaining non-mi_ menuItems: ${miA.docs.filter((d) => !/^mi_/.test(d.id)).length}  | non-mg_ modifierGroups: ${mgA.docs.filter((d) => !/^mg_/.test(d.id)).length}`);
  console.log(`\n# COMMIT complete.`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
