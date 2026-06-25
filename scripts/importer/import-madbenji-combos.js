/* Import the 2 Mad Benji COMBOS from the import JSON's _needsManualSetup block
 * into Firestore as menuItems with isCombo:true. DRY-RUN BY DEFAULT — prints the
 * 2 resolved docs + checks and writes NOTHING. Pass --commit to write.
 *
 *   node scripts/importer/import-madbenji-combos.js            # dry run (default)
 *   node scripts/importer/import-madbenji-combos.js --commit   # write
 *
 * Same firebase-admin init + service account as import-madbenji-menu.js.
 * Target DB mymor-australia, group YQRkUwBO5wMIdLSgcpji (capital I — the live id).
 *
 * Source: _needsManualSetup.combos[] — each { displayName, sellPrice (EX-GST),
 * posId, groups[{ name, maxChoice, optional, chooseFrom[{ menuItemId, name }] }] }.
 * Written to menuItems/{mi_<posId>} matching the extended MenusPage.js combo shape.
 * Idempotent: deterministic id + setDoc(merge:true); createdAt/recipeId/e86 only
 * on first create, so re-runs never clobber a later edit.                          */
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
const TS = FieldValue.serverTimestamp();

// resolve a manual-combo entry → the extended MenusPage.js menuItem (combo) shape
const resolveCombo = (c, cats) => {
  const category = (c.category && cats.has(c.category)) ? c.category : (cats.has(c.displayName) ? c.displayName : null);
  return {
    _category: category, // null signals a category miss (gate handles it)
    doc: {
      displayName: String(c.displayName || "").trim(),
      kitchenName: "",
      category,
      sellPrice: Number(c.sellPrice) || 0,
      cost: 0,
      gstApplicable: true,
      venueIds: ["mad-benji"],
      posId: String(c.posId || ""),
      modifierGroupIds: [],
      available: true,
      takeawayPrice: null,
      hasVariants: false,
      variantGroupName: "",
      variants: [],
      isCombo: true,
      comboGroups: (c.groups || []).map((gr) => ({
        name: String(gr.name || "").trim(),
        maxChoice: gr.maxChoice == null ? null : Number(gr.maxChoice),
        optional: !!gr.optional,
        options: (gr.chooseFrom || []).map((x) => ({ menuItemId: x.menuItemId, priceDelta: 0 })),
      })),
    },
  };
};

(async () => {
  console.log(`# Mad Benji COMBO import  ${COMMIT ? "(COMMIT)" : "(DRY RUN — no writes)"}`);
  console.log(`# source   : ${SRC}`);
  console.log(`# database : ${DATABASE_ID}`);
  console.log(`# group    : ${GROUP_ID}`);

  const combos = (data._needsManualSetup && data._needsManualSetup.combos) || [];
  console.log(`# _needsManualSetup.combos: ${combos.length}`);
  if (!combos.length) { console.log("Nothing to import."); process.exit(0); }

  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new Error(`group ${GROUP_ID} missing in ${DATABASE_ID}`);
  const cats = new Set(Array.isArray(gSnap.data().menuCategories) ? gSnap.data().menuCategories : []);

  const miSnap = await groupRef.collection("menuItems").get();
  const existingIds = new Set(miSnap.docs.map((d) => d.id));

  const resolved = combos.map((c) => ({ id: `mi_${c.posId}`, ...resolveCombo(c, cats) }));

  // ── GATE 1: category exists ──
  const catMiss = resolved.filter((r) => !r._category).map((r) => `${r.id} "${r.doc.displayName}"`);
  // ── GATE 2: every option menuItemId resolves to an existing menuItem ──
  const dangling = {};
  resolved.forEach((r) => r.doc.comboGroups.forEach((gr) => gr.options.forEach((o) => {
    if (!existingIds.has(o.menuItemId)) (dangling[r.id] = dangling[r.id] || []).push(o.menuItemId);
  })));

  console.log(`\n## CHECKS`);
  console.log(`   category check: ${catMiss.length ? "FAIL → " + JSON.stringify(catMiss) : "OK (all combo categories exist in group.menuCategories)"}`);
  console.log(`   menuItemId resolution: ${Object.keys(dangling).length ? "FAIL → " + JSON.stringify(dangling) : "OK (every option resolves to an existing menuItem)"}`);
  resolved.forEach((r) => {
    const optCount = r.doc.comboGroups.reduce((s, gr) => s + gr.options.length, 0);
    console.log(`   ${r.id}  "${r.doc.displayName}"  cat=${r.doc.category}  targetExists=${existingIds.has(r.id)}  groups=${r.doc.comboGroups.length}  options=${optCount}`);
  });

  if (catMiss.length || Object.keys(dangling).length) {
    console.error(`\nABORT: check failed — see above. Nothing written.`);
    process.exit(2);
  }

  // ── SAMPLE RESOLVED DOCS (exactly as written) ──
  console.log(`\n## RESOLVED COMBO DOCS (as they will be written)`);
  resolved.forEach((r) => {
    const isNew = !existingIds.has(r.id);
    const out = { _docPath: `…/menuItems/${r.id}`, _mode: isNew ? "create" : "merge-update", ...r.doc,
      ...(isNew ? { e86: false, recipeId: null, createdAt: "<serverTimestamp>" } : {}), updatedAt: "<serverTimestamp>" };
    delete out._category;
    console.log(`\n--- ${r.id} ---`);
    console.log(JSON.stringify(out, null, 2));
  });

  if (!COMMIT) { console.log(`\n# DRY RUN complete — NOTHING written. Re-run with --commit to apply.`); process.exit(0); }

  // ── COMMIT ──
  console.log(`\n## COMMITTING…`);
  const batch = db.batch();
  resolved.forEach((r) => {
    const isNew = !existingIds.has(r.id);
    batch.set(groupRef.collection("menuItems").doc(r.id), {
      ...r.doc, updatedAt: TS, ...(isNew ? { e86: false, recipeId: null, createdAt: TS } : {}),
    }, { merge: true });
  });
  await batch.commit();
  console.log(`   committed ${resolved.length} combo menuItems`);

  // ── POST-COMMIT read-back probe (read-only) ──
  console.log(`\n## READ-BACK`);
  for (const r of resolved) {
    const snap = await groupRef.collection("menuItems").doc(r.id).get();
    const d = snap.data() || {};
    const optCount = (d.comboGroups || []).reduce((s, gr) => s + (gr.options || []).length, 0);
    console.log(`   ${r.id} "${d.displayName}" isCombo=${d.isCombo} cat=${d.category} sell=${d.sellPrice} groups=${(d.comboGroups || []).length} options=${optCount}`);
    (d.comboGroups || []).forEach((gr) => console.log(`        · ${gr.name}  maxChoice=${gr.maxChoice}  optional=${gr.optional}  options=${(gr.options || []).length}`));
  }
  console.log(`\n# COMMIT complete.`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
