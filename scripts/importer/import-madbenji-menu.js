/* Import the Mad Benji menu (modifierGroups + menuItems + menuCategories) into
 * MyMorAdmin Firestore. DRY-RUN BY DEFAULT — prints the full plan and sample
 * docs and writes NOTHING. Pass --commit to actually write.
 *
 *   node scripts/importer/import-madbenji-menu.js            # dry run (default)
 *   node scripts/importer/import-madbenji-menu.js --commit   # write
 *
 * Reuses the SAME firebase-admin init + service account as seed-stock-module.js.
 * Target DB mymor-australia, group YQRkUwBO5wMIdLSgcpji (capital I — the live id;
 * provision-group.js:11 has a lowercase-l typo, NOT used here).
 *
 * Idempotent: deterministic doc ids modifierGroups/{mg_<n>} and menuItems/{mi_<n>}
 * with setDoc(merge:true). On a re-run, existing docs keep their createdAt / recipeId
 * / e86 (those are only set when the doc is first created), so a later recipe link is
 * never clobbered. Existing DEMO items (ids not starting "mi_") are never touched.
 *
 * Source combos[] is empty; the 2 set-meals live under _needsManualSetup and are
 * built by hand — this loader writes NO combos. Prices are already EX-GST.        */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP_ID = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji"; // Mad Kitchen Group (capital I)
const COMMIT = process.argv.includes("--commit");

// ── locate the source JSON (filename in the repo uses spaces; accept both) ──
const IMPORT_DIR = path.resolve(__dirname, "../import");
const resolveSource = () => {
  const candidates = ["mymor_madbenji_import.json"];
  for (const c of candidates) { const p = path.join(IMPORT_DIR, c); if (fs.existsSync(p)) return p; }
  const anyJson = fs.existsSync(IMPORT_DIR) && fs.readdirSync(IMPORT_DIR).find((f) => f.toLowerCase().endsWith(".json"));
  if (anyJson) return path.join(IMPORT_DIR, anyJson);
  throw new Error(`No import JSON found in ${IMPORT_DIR}`);
};
const SRC = resolveSource();
const data = JSON.parse(fs.readFileSync(SRC, "utf8"));

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const groupRef = db.collection("restaurantGroups").doc(GROUP_ID);

const num = (v, d = 0) => (v == null || v === "" || isNaN(Number(v)) ? d : Number(v));
const TS = FieldValue.serverTimestamp();

// ── resolve a modifier group to the app's write shape (id = mg_<n>) ──
const resolveGroup = (g) => ({
  name: String(g.name || "").trim(),
  type: g.type === "single" ? "single" : "multi",
  required: !!g.required,
  minSelections: num(g.minSelections, 0),
  maxSelections: g.maxSelections == null ? null : num(g.maxSelections, 0),
  printer: g.printer || "kitchen",
  // app option shape is {label, priceDelta}; we PRESERVE the source posId too (app
  // ignores unknown fields; the POS sale consumer will later map options by posId).
  options: (g.options || []).map((o) => ({
    label: String(o.label || "").trim(),
    priceDelta: num(o.priceDelta, 0),
    ...(o.posId != null && o.posId !== "" ? { posId: String(o.posId) } : {}),
  })),
});

// ── resolve a menu item to the app's write shape (id = mi_<n>) ──
const resolveItem = (m) => {
  const hasVariants = m.hasVariants === true;
  let variants = [];
  if (hasVariants) {
    variants = (m.variants || []).map((v) => ({
      label: String(v.label || "").trim(),
      sellPrice: num(v.sellPrice, 0),
      takeawayPrice: v.takeawayPrice == null ? null : num(v.takeawayPrice, 0),
      posId: String(v.posId || ""),
      isDefault: !!v.isDefault,
      available: v.available !== false,
    }));
    // exactly one default — keep the first flagged, else default the first row
    const fd = variants.findIndex((v) => v.isDefault);
    variants = variants.map((v, i) => ({ ...v, isDefault: i === (fd === -1 ? 0 : fd) }));
  }
  const defaultVariant = variants.find((v) => v.isDefault);
  // top-level sellPrice tracks the default variant when variants are on (app rule)
  const sellPrice = hasVariants ? num(defaultVariant?.sellPrice, 0) : num(m.sellPrice, 0);
  return {
    displayName: String(m.displayName || "").trim(),
    kitchenName: m.kitchenName || "",
    category: m.category,
    sellPrice,
    cost: m.cost == null ? 0 : num(m.cost, 0),
    gstApplicable: m.gstApplicable !== false,
    venueIds: Array.isArray(m.venueIds) ? m.venueIds : [],
    posId: String(m.posId || ""),
    modifierGroupIds: Array.isArray(m.modifierGroupIds) ? m.modifierGroupIds : [],
    available: m.available !== false,
    takeawayPrice: m.takeawayPrice == null ? null : num(m.takeawayPrice, 0),
    hasVariants,
    variantGroupName: hasVariants ? (m.variantGroupName || "") : "",
    variants,
    isCombo: false,
    comboGroups: [],
  };
};

(async () => {
  console.log(`# Mad Benji menu import  ${COMMIT ? "(COMMIT)" : "(DRY RUN — no writes)"}`);
  console.log(`# source   : ${SRC}`);
  console.log(`# database : ${DATABASE_ID}`);
  console.log(`# group    : ${GROUP_ID}`);
  console.log(`# _report.counts: ${JSON.stringify(data._report?.counts || {})}`);

  const groups = data.modifierGroups || [];
  const items = data.menuItems || [];
  const jsonCats = data.menuCategories || [];

  // ── read live group (for category union + demo report + idempotency existence) ──
  const gSnap = await groupRef.get();
  if (!gSnap.exists) throw new Error(`group ${GROUP_ID} does not exist in ${DATABASE_ID}`);
  const existingCats = Array.isArray(gSnap.data().menuCategories) ? gSnap.data().menuCategories : [];
  // union, existing order preserved, then new JSON cats appended in JSON order
  const finalCats = [...existingCats];
  jsonCats.forEach((c) => { if (!finalCats.includes(c)) finalCats.push(c); });

  // ── INTEGRITY GATES ──
  // 1) every item.category must exist in the FINAL menuCategories (silent-filter trap)
  const catSet = new Set(finalCats);
  const catMismatch = [...new Set(items.filter((m) => !catSet.has(m.category)).map((m) => m.category))];
  // 2) every referenced modifierGroupId must exist in the groups set
  const groupIdSet = new Set(groups.map((g) => g.id));
  const missingRefs = {};
  items.forEach((m) => (m.modifierGroupIds || []).forEach((id) => {
    if (!groupIdSet.has(id)) (missingRefs[id] = missingRefs[id] || []).push(m.id);
  }));
  // 3) id format / dup sanity
  const badItemIds = items.filter((m) => !/^mi_/.test(m.id || "")).map((m) => m.id);
  const badGroupIds = groups.filter((g) => !/^mg_/.test(g.id || "")).map((g) => g.id);

  console.log(`\n## INTEGRITY`);
  console.log(`   menuCategories: ${existingCats.length} existing + ${jsonCats.length} json → ${finalCats.length} after union`);
  console.log(`   category mismatches (item.category not in final menuCategories): ${catMismatch.length ? JSON.stringify(catMismatch) : "none"}`);
  console.log(`   modifierGroupIds referenced but missing: ${Object.keys(missingRefs).length ? JSON.stringify(missingRefs) : "none"}`);
  console.log(`   malformed ids — items: ${badItemIds.length ? JSON.stringify(badItemIds) : "none"}, groups: ${badGroupIds.length ? JSON.stringify(badGroupIds) : "none"}`);

  if (catMismatch.length || Object.keys(missingRefs).length || badItemIds.length || badGroupIds.length) {
    console.error(`\nABORT: integrity gate failed — see above. Nothing written.`);
    process.exit(2);
  }

  // ── WRITE PLAN ──
  console.log(`\n## WRITE PLAN (per collection)`);
  console.log(`   restaurantGroups/${GROUP_ID}            menuCategories → ${finalCats.length} entries (1 group-doc update)`);
  console.log(`   modifierGroups/{mg_<n>}                 ${groups.length} docs (setDoc merge)`);
  console.log(`   menuItems/{mi_<n>}                      ${items.length} docs (setDoc merge)`);
  console.log(`   combos                                  0 (source combos[] empty; _needsManualSetup ignored)`);

  // existing imported docs (for createdAt/recipeId/e86 preservation) + demo report
  const [miSnap, mgSnap] = await Promise.all([groupRef.collection("menuItems").get(), groupRef.collection("modifierGroups").get()]);
  const existingItemIds = new Set(miSnap.docs.map((d) => d.id));
  const existingGroupIds = new Set(mgSnap.docs.map((d) => d.id));
  const newItems = items.filter((m) => !existingItemIds.has(m.id)).length;
  const newGroups = groups.filter((g) => !existingGroupIds.has(g.id)).length;
  console.log(`   → menuItems: ${newItems} new, ${items.length - newItems} upsert/update | modifierGroups: ${newGroups} new, ${groups.length - newGroups} upsert/update`);

  // pre-existing NON-imported (demo) menuItems — review only, never deleted
  const demo = miSnap.docs.filter((d) => !/^mi_/.test(d.id)).map((d) => ({ id: d.id, name: d.data().displayName || "", posId: d.data().posId || "" }));
  console.log(`\n## PRE-EXISTING (non-imported) menuItems — review only, NOT modified or deleted: ${demo.length}`);
  demo.forEach((x) => console.log(`   ${x.id}  "${x.name}"  posId=${x.posId || "—"}${x.posId ? "" : "  ⟵ no posId"}`));

  // ── SAMPLE RESOLVED DOCS (exactly as written) ──
  const sampleOf = (id) => { const m = items.find((x) => x.id === id); return m ? { id: m.id, ...resolveItem(m) } : null; };
  const plain = items.find((m) => !m.hasVariants && m.takeawayPrice == null && (m.modifierGroupIds || []).length);
  const variant = items.find((m) => m.hasVariants);
  const takeaway = items.find((m) => m.takeawayPrice != null);
  const stamp = (id, doc) => {
    const isNew = !existingItemIds.has(id);
    return { _docPath: `…/menuItems/${id}`, _mode: isNew ? "create" : "merge-update", ...doc,
      ...(isNew ? { e86: false, recipeId: null, createdAt: "<serverTimestamp>" } : { /* createdAt/recipeId/e86 preserved */ }),
      updatedAt: "<serverTimestamp>" };
  };
  console.log(`\n## SAMPLE RESOLVED menuItem DOCS (as they will be written)`);
  console.log(`\n--- PLAIN (${plain?.id}) ---`);  console.log(JSON.stringify(stamp(plain.id, resolveItem(plain)), null, 2));
  console.log(`\n--- VARIANT (${variant?.id}) ---`);  console.log(JSON.stringify(stamp(variant.id, resolveItem(variant)), null, 2));
  console.log(`\n--- TAKEAWAY (${takeaway?.id}) ---`);  console.log(JSON.stringify(stamp(takeaway.id, resolveItem(takeaway)), null, 2));
  console.log(`\n--- SAMPLE modifierGroup (${groups[0]?.id}) ---`);
  console.log(JSON.stringify({ _docPath: `…/modifierGroups/${groups[0].id}`, ...resolveGroup(groups[0]) }, null, 2).slice(0, 900) + " …(options truncated)");

  if (!COMMIT) {
    console.log(`\n# DRY RUN complete — NOTHING written. Re-run with --commit to apply.`);
    process.exit(0);
  }

  // ── COMMIT ──
  console.log(`\n## COMMITTING…`);
  // 1) group menuCategories (union)
  await groupRef.set({ menuCategories: finalCats, updatedAt: TS }, { merge: true });
  console.log(`   group menuCategories set (${finalCats.length})`);

  // 2) modifierGroups + menuItems in chunked batches (<=450/batch)
  const ops = [];
  groups.forEach((g) => {
    const isNew = !existingGroupIds.has(g.id);
    ops.push({ ref: groupRef.collection("modifierGroups").doc(g.id), data: {
      ...resolveGroup(g), updatedAt: TS,
      ...(isNew ? { attachedMenuItemIds: [], createdAt: TS } : {}),
    } });
  });
  items.forEach((m) => {
    const isNew = !existingItemIds.has(m.id);
    ops.push({ ref: groupRef.collection("menuItems").doc(m.id), data: {
      ...resolveItem(m), updatedAt: TS,
      ...(isNew ? { e86: false, recipeId: null, createdAt: TS } : {}),
    } });
  });
  let written = 0;
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    ops.slice(i, i + 450).forEach((o) => batch.set(o.ref, o.data, { merge: true }));
    await batch.commit();
    written += Math.min(450, ops.length - i);
    console.log(`   committed ${written}/${ops.length}`);
  }

  // ── POST-COMMIT read-back probe (read-only) ──
  const [miAfter, mgAfter] = await Promise.all([groupRef.collection("menuItems").get(), groupRef.collection("modifierGroups").get()]);
  console.log(`\n## READ-BACK`);
  console.log(`   menuItems now: ${miAfter.size}  (imported mi_*: ${miAfter.docs.filter((d) => /^mi_/.test(d.id)).length})`);
  console.log(`   modifierGroups now: ${mgAfter.size}`);
  const vBack = miAfter.docs.find((d) => /^mi_/.test(d.id) && d.data().hasVariants);
  if (vBack) { console.log(`   round-tripped variant item ${vBack.id}:`); console.log(JSON.stringify({ id: vBack.id, ...vBack.data(), createdAt: "<ts>", updatedAt: "<ts>" }, null, 2)); }
  console.log(`\n# COMMIT complete.`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
