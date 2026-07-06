/* Template + per-venue INSTANCE demo seed (ADDITIVE, idempotent).
 *   node scripts/importer/seed-template-instance-demo.js            # DRY-RUN (default — prints plan, writes NOTHING)
 *   node scripts/importer/seed-template-instance-demo.js --apply    # write
 *
 * Pattern copied from migrate-phase2-pervenue-cost.js (dry-run default, single
 * APPLY-gated write region, named db, env-overridable group) + batched writes
 * per import-madbenji-menu.js (450/chunk).
 *
 * What it seeds (all NEW doc ids `tmpl_demo_*` — existing docs are NEVER touched;
 * any doc that already exists is SKIPPED, not overwritten):
 *   TEMPLATES (group menuItems): 4 demo items; 2 get dish recipes linked to the
 *     first two REAL non-archived inventoryItems (so the inventory link shows).
 *   INSTANCES (venues/{v}/menuItems/{templateId}) across the first TWO venues:
 *     venue A: all 4 LINKED (pure inherit)
 *     venue B: item1 LINKED · item2 SEPARATE (own sellPrice + CLONED recipe +
 *              recipeSourceId — provenance demo) · item3 LINKED with a sellPrice
 *              override · item4 NO instance (→ "not sold at this venue" branch)
 * Templates carry NO available/e86 (instance-only state, per the decided model).  */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji";
const APPLY = process.argv.includes("--apply");
const db = getFirestore(admin.app(), DATABASE_ID);
const g = db.collection("restaurantGroups").doc(GROUP);
const TS = FieldValue.serverTimestamp();

const TEMPLATES = [
  { id: "tmpl_demo_burger", displayName: "Demo Classic Burger", category: "Burgers", sellPrice: 12, cost: 3.5, withRecipe: true },
  { id: "tmpl_demo_fries", displayName: "Demo Loaded Fries", category: "Sides", sellPrice: 8, cost: 1.8, withRecipe: true },
  { id: "tmpl_demo_coke", displayName: "Demo Cola Can", category: "Drinks", sellPrice: 3.5, cost: 1.1, withRecipe: false },
  { id: "tmpl_demo_wrap", displayName: "Demo Halloumi Wrap", category: "Burgers", sellPrice: 11, cost: 3.2, withRecipe: false },
];

(async () => {
  console.log(`# template+instance demo seed  ${APPLY ? "(APPLY)" : "(DRY-RUN — no writes)"}  db=${DATABASE_ID}  group=${GROUP}\n`);

  // real inventory items for the recipe link (first two non-archived)
  const invSnap = await g.collection("inventoryItems").get();
  const inv = invSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((i) => !i.archived).slice(0, 2);
  if (inv.length < 2) { console.error(`ABORT: need ≥2 non-archived inventoryItems (found ${inv.length}). Nothing written.`); process.exit(2); }
  console.log(`  recipe ingredients will use REAL inventoryItems: ${inv.map((i) => `${i.id} "${i.name}"`).join("  ·  ")}`);

  const venues = (await g.collection("venues").get()).docs.map((d) => ({ id: d.id, name: d.data().name || d.id }));
  if (venues.length < 2) { console.error(`ABORT: need ≥2 venues (found ${venues.length}). Nothing written.`); process.exit(2); }
  const [vA, vB] = venues;
  console.log(`  venues: A=${vA.id} "${vA.name}"  B=${vB.id} "${vB.name}"\n`);

  // existence checks — additive only, skip anything already there
  const exists = async (ref) => (await ref.get()).exists;
  const ops = []; // { ref, data, label }
  const skips = [];
  const plan = (ref, data, label) => ops.push({ ref, data, label });

  // 1) templates + their recipes
  const recipeIdFor = {}; // templateId -> recipeId (template recipe)
  for (const t of TEMPLATES) {
    const tRef = g.collection("menuItems").doc(t.id);
    if (await exists(tRef)) { skips.push(`menuItems/${t.id} (already exists)`); const cur = (await tRef.get()).data(); recipeIdFor[t.id] = cur.recipeId || null; continue; }
    let recipeId = null;
    if (t.withRecipe) {
      recipeId = `rcp_demo_${t.id.replace("tmpl_demo_", "")}`;
      const rRef = g.collection("recipes").doc(recipeId);
      if (await exists(rRef)) skips.push(`recipes/${recipeId} (already exists)`);
      else plan(rRef, {
        menuItemId: t.id,
        ingredients: [
          { itemId: inv[0].id, qty: 0.15, netQty: 0.15, recipeUnit: inv[0].recipeUnit || inv[0].unit || "" },
          { itemId: inv[1].id, qty: 0.1, netQty: 0.1, recipeUnit: inv[1].recipeUnit || inv[1].unit || "" },
        ],
        createdAt: TS,
      }, `recipes/${recipeId} (dish recipe → real inventory)`);
    }
    recipeIdFor[t.id] = recipeId;
    plan(tRef, {
      displayName: t.displayName, kitchenName: "", category: t.category,
      sellPrice: t.sellPrice, cost: t.cost, gstApplicable: true,
      venueIds: [vA.id, vB.id], // legacy metadata — instance existence is the sale gate
      posId: "", modifierGroupIds: [], takeawayPrice: null,
      hasVariants: false, variantGroupName: "", variants: [], isCombo: false, comboGroups: [],
      recipeId, createdAt: TS, updatedAt: TS,
      // NOTE: no available/e86 — instance-only state in the template+instance model
    }, `menuItems/${t.id} (TEMPLATE)`);
  }

  // 2) instances — venue A: all linked
  for (const t of TEMPLATES) {
    const iRef = g.collection("venues").doc(vA.id).collection("menuItems").doc(t.id);
    if (await exists(iRef)) { skips.push(`venues/${vA.id}/menuItems/${t.id} (already exists)`); continue; }
    plan(iRef, { linked: true, available: true, e86: false, createdAt: TS, updatedAt: TS }, `venues/${vA.id}/menuItems/${t.id} (LINKED)`);
  }

  // 3) instances — venue B: linked / SEPARATE / linked+priceOverride / (none for item4)
  const [t1, t2, t3] = TEMPLATES;
  const bPlans = [];
  {
    const iRef = g.collection("venues").doc(vB.id).collection("menuItems").doc(t1.id);
    if (await exists(iRef)) skips.push(`venues/${vB.id}/menuItems/${t1.id} (already exists)`);
    else bPlans.push({ ref: iRef, data: { linked: true, available: true, e86: false, createdAt: TS, updatedAt: TS }, label: `venues/${vB.id}/menuItems/${t1.id} (LINKED)` });
  }
  {
    // SEPARATE: own sellPrice + CLONED recipe with provenance (recipeSourceId)
    const iRef = g.collection("venues").doc(vB.id).collection("menuItems").doc(t2.id);
    if (await exists(iRef)) skips.push(`venues/${vB.id}/menuItems/${t2.id} (already exists)`);
    else {
      const srcRecipeId = recipeIdFor[t2.id];
      let cloneId = null;
      if (srcRecipeId) {
        cloneId = `rcp_demo_${t2.id.replace("tmpl_demo_", "")}_${vB.id.slice(0, 6)}`;
        const cRef = g.collection("recipes").doc(cloneId);
        if (await exists(cRef)) skips.push(`recipes/${cloneId} (already exists)`);
        else bPlans.push({ ref: cRef, data: {
          menuItemId: t2.id, venueId: vB.id, clonedFrom: srcRecipeId,
          ingredients: [
            { itemId: inv[0].id, qty: 0.15, netQty: 0.15, recipeUnit: inv[0].recipeUnit || inv[0].unit || "" },
            { itemId: inv[1].id, qty: 0.1, netQty: 0.1, recipeUnit: inv[1].recipeUnit || inv[1].unit || "" },
          ],
          createdAt: TS,
        }, label: `recipes/${cloneId} (CLONED recipe for separate instance)` });
      }
      bPlans.push({ ref: iRef, data: {
        linked: false, available: true, e86: false,
        sellPrice: Number((t2.sellPrice * 1.25).toFixed(2)), // visibly different venue price
        hasVariants: false, variantGroupName: "", variants: [], modifierGroupIds: [],
        recipeId: cloneId, recipeSourceId: srcRecipeId || null,
        createdAt: TS, updatedAt: TS,
      }, label: `venues/${vB.id}/menuItems/${t2.id} (SEPARATE, own price + cloned recipe)` });
    }
  }
  {
    const iRef = g.collection("venues").doc(vB.id).collection("menuItems").doc(t3.id);
    if (await exists(iRef)) skips.push(`venues/${vB.id}/menuItems/${t3.id} (already exists)`);
    else bPlans.push({ ref: iRef, data: { linked: true, available: true, e86: false, sellPrice: Number((t3.sellPrice + 0.5).toFixed(2)), createdAt: TS, updatedAt: TS }, label: `venues/${vB.id}/menuItems/${t3.id} (LINKED + price override)` });
  }
  // t4 (tmpl_demo_wrap): deliberately NO instance at venue B → "not sold here" branch
  bPlans.forEach((p) => ops.push(p));

  // ── PLAN ──
  console.log(`## WRITE PLAN (${ops.length} docs)`);
  ops.forEach((o) => console.log(`   + ${o.label}`));
  console.log(`   (intentionally NO instance: venues/${vB.id}/menuItems/${TEMPLATES[3].id} — demos the "not sold at this venue" branch)`);
  if (skips.length) { console.log(`\n## SKIPPED (already exist — never overwritten): ${skips.length}`); skips.forEach((s) => console.log(`   = ${s}`)); }

  if (!APPLY) { console.log(`\n# DRY-RUN complete — NOTHING written. Re-run with --apply to write.`); process.exit(0); }

  // ── APPLY (single write region; batched ≤450/chunk) ──
  let written = 0;
  for (let i = 0; i < ops.length; i += 450) {
    const batch = db.batch();
    ops.slice(i, i + 450).forEach((o) => batch.set(o.ref, o.data)); // no merge — these are guaranteed-new docs
    await batch.commit();
    written += Math.min(450, ops.length - i);
    console.log(`   committed ${written}/${ops.length}`);
  }
  console.log(`\n✅ Applied. Demo data lives under tmpl_demo_* / rcp_demo_* ids — delete-safe, never collides with real items.`);
  process.exit(0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
