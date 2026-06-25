/* Scaffold EMPTY, correctly-linked recipe docs for the top-40 recipe-priority menu
 * items, so Mad Benji can fill in ingredients later in the UI. DRY-RUN BY DEFAULT —
 * prints the plan and writes NOTHING. Pass --commit to write.
 *
 *   node scripts/importer/scaffold-recipes.js            # dry run (default)
 *   node scripts/importer/scaffold-recipes.js --commit   # write
 *
 * Same firebase-admin init + service account as import-madbenji-menu.js.
 * Target DB mymor-australia, group YQRkUwBO5wMIdLSgcpji.
 *
 * Source list: scripts/import/_recipe_priority_ids.json — the "MyMor id" column of
 * the "Recipe priority (top 40)" sheet (extracted with openpyxl; regenerate via
 * /tmp/dump_ids.py if the sheet changes).
 *
 * Recipe shape matches the existing dish-recipe model exactly:
 *   recipes/rec_<n> = { menuItemId:"mi_<n>", ingredients:[], createdAt, updatedAt }
 *   (NO producesItemId — that field is for production recipes only)
 * Two-way link: menuItems/mi_<n>.recipeId = "rec_<n>".
 *
 * Idempotent & non-destructive:
 *  - createdAt and ingredients:[] are written ONLY when the recipe doc is first
 *    created, so a re-run never wipes ingredients someone has already filled in.
 *  - a menuItem whose recipeId is already set to a DIFFERENT recipe is SKIPPED
 *    (recipe not created, link not changed) and reported.                          */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP_ID = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji";
const COMMIT = process.argv.includes("--commit");

const IDS_FILE = path.resolve(__dirname, "../import/_recipe_priority_ids.json");
if (!fs.existsSync(IDS_FILE)) throw new Error(`source id list not found: ${IDS_FILE}`);
const source = JSON.parse(fs.readFileSync(IDS_FILE, "utf8")); // [{id, item}]

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const groupRef = db.collection("restaurantGroups").doc(GROUP_ID);
const TS = FieldValue.serverTimestamp();

const recIdFor = (miId) => miId.replace(/^mi_/, "rec_");

(async () => {
  console.log(`# Scaffold empty recipes for top-40 items  ${COMMIT ? "(COMMIT)" : "(DRY RUN — no writes)"}`);
  console.log(`# source   : ${IDS_FILE}`);
  console.log(`# database : ${DATABASE_ID}`);
  console.log(`# group    : ${GROUP_ID}`);
  console.log(`# ids in sheet: ${source.length}`);

  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new Error(`group ${GROUP_ID} missing in ${DATABASE_ID}`);

  // read all menuItems + existing recipes once
  const [miSnap, recSnap] = await Promise.all([
    groupRef.collection("menuItems").get(),
    groupRef.collection("recipes").get(),
  ]);
  const itemById = new Map(miSnap.docs.map((d) => [d.id, d.data()]));
  const existingRecIds = new Set(recSnap.docs.map((d) => d.id));

  // ── GATE: every sheet id must resolve to a menuItem ──
  const unresolved = source.filter((s) => !itemById.has(s.id));
  if (unresolved.length) {
    console.log(`\n## GATE FAILED — unresolved menuItem ids (${unresolved.length}):`);
    unresolved.forEach((s) => console.log(`   ${s.id}  "${s.item}"  ← no menuItem doc in group`));
    console.error(`\nABORT: ${unresolved.length} sheet id(s) do not resolve. Nothing written.`);
    process.exit(2);
  }
  console.log(`\n## GATE: all ${source.length} sheet ids resolve to existing menuItems ✓`);

  // ── classify each ──
  const toCreate = [], reLinkOnly = [], conflicts = [], withVariants = [];
  source.forEach((s) => {
    const recId = recIdFor(s.id);
    const item = itemById.get(s.id);
    const curRecipeId = item.recipeId || null;
    const name = item.displayName || s.item || "";
    const hasVariants = item.hasVariants === true;
    if (hasVariants) withVariants.push({ id: s.id, recId, name, variants: (item.variants || []).length });

    if (curRecipeId && curRecipeId !== recId) {
      conflicts.push({ id: s.id, recId, name, curRecipeId });
      return; // skip entirely — do not create or relink
    }
    const recipeExists = existingRecIds.has(recId);
    const needsLink = curRecipeId !== recId; // null/undefined → needs link
    const row = { id: s.id, recId, name, recipeExists, needsLink, hasVariants };
    if (!recipeExists) toCreate.push(row);
    else reLinkOnly.push(row); // recipe doc already there — only refresh link/updatedAt
  });

  // ── PLAN ──
  console.log(`\n## PLAN`);
  console.log(`   recipe docs to CREATE (new rec_*): ${toCreate.length}`);
  console.log(`   recipe docs already present (link refresh only): ${reLinkOnly.length}`);
  console.log(`   skipped — menuItem already linked to a DIFFERENT recipe: ${conflicts.length}`);
  console.log(`   scaffolded items that have VARIANTS (one menu-level recipe only): ${withVariants.length}`);

  console.log(`\n# Recipes to create (rec_<n> → item):`);
  toCreate.forEach((r) => console.log(`   CREATE recipes/${r.recId}  → menuItemId ${r.id}  "${r.name}"${r.hasVariants ? "  [variants]" : ""}`));
  if (reLinkOnly.length) {
    console.log(`\n# Already-present recipe docs (ingredients preserved, link/updatedAt refreshed):`);
    reLinkOnly.forEach((r) => console.log(`   KEEP   recipes/${r.recId}  → ${r.id}  "${r.name}"${r.needsLink ? "  (will set recipeId)" : "  (link already set)"}`));
  }
  if (conflicts.length) {
    console.log(`\n# ⚠ SKIPPED — menuItem.recipeId already points elsewhere (not overwritten):`);
    conflicts.forEach((r) => console.log(`   SKIP   ${r.id}  "${r.name}"  recipeId=${r.curRecipeId} (≠ ${r.recId})`));
  }

  // ── FLAG: variants have no per-variant recipe support ──
  console.log(`\n## FLAG — variant items get ONE menu-level recipe (size-level costing NOT captured): ${withVariants.length}`);
  withVariants.forEach((r) => console.log(`   ⚠ ${r.id} "${r.name}" — ${r.variants} variants → single recipe ${r.recId}`));

  if (!COMMIT) {
    console.log(`\n## PROJECTED AFTER COMMIT`);
    console.log(`   recipes created: ${toCreate.length} | links set/refreshed: ${toCreate.length + reLinkOnly.length} | skipped: ${conflicts.length}`);
    console.log(`\n# DRY RUN complete — NOTHING written. Re-run with --commit to apply.`);
    process.exit(0);
  }

  // ── COMMIT ──
  console.log(`\n## COMMITTING…`);
  const writeRows = [...toCreate, ...reLinkOnly]; // conflicts excluded
  const batch = db.batch();
  writeRows.forEach((r) => {
    const recRef = groupRef.collection("recipes").doc(r.recId);
    if (!r.recipeExists) {
      // first create — empty shell with both timestamps
      batch.set(recRef, { menuItemId: r.id, ingredients: [], createdAt: TS, updatedAt: TS }, { merge: true });
    } else {
      // already exists — DO NOT touch ingredients/createdAt; just reassert link + updatedAt
      batch.set(recRef, { menuItemId: r.id, updatedAt: TS }, { merge: true });
    }
    // two-way link on the menu item
    batch.set(groupRef.collection("menuItems").doc(r.id), { recipeId: r.recId, updatedAt: TS }, { merge: true });
  });
  await batch.commit();
  console.log(`   committed ${writeRows.length} recipe doc(s) + ${writeRows.length} menuItem link(s)`);

  // ── POST-COMMIT read-back probe (read-only) ──
  const recAfter = await groupRef.collection("recipes").get();
  const targetIds = source.filter((s) => !conflicts.find((c) => c.id === s.id)).map((s) => s.id);
  const itemDocs = await Promise.all(targetIds.map((id) => groupRef.collection("menuItems").doc(id).get()));
  let linkedOk = 0, linkBad = [];
  itemDocs.forEach((d) => {
    const want = recIdFor(d.id);
    if ((d.data() || {}).recipeId === want) linkedOk++; else linkBad.push(`${d.id}→${(d.data() || {}).recipeId}`);
  });
  console.log(`\n## READ-BACK`);
  console.log(`   recipes in group now: ${recAfter.size}`);
  console.log(`   top-40 menuItems with correct recipeId: ${linkedOk}/${targetIds.length}${linkBad.length ? "  MISMATCH: " + JSON.stringify(linkBad) : ""}`);
  console.log(`\n# COMMIT complete.`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
