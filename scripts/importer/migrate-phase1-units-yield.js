/* Phase 1 — units + yield migration (ADDITIVE, idempotent, reversible).
 *
 *   node migrate-phase1-units-yield.js            # DRY-RUN (writes nothing)
 *   node migrate-phase1-units-yield.js --apply    # applies after a backup exists
 *
 * inventoryItems: add purchaseUnit=stockUnit=recipeUnit=<existing unit>,
 *   purchaseToStock=1, stockToRecipe=1, yieldPercent=100. KEEPS `unit`, `cost`, etc.
 * recipes: each ingredient {itemId, qty} → add netQty=qty, recipeUnit=item.recipeUnit.
 *   KEEPS `qty`. With identity factors/yield this changes no deduction or cost.
 * Idempotent: skips docs/lines that already carry the new fields. */
const path = require("path");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = admin.firestore(); db.settings({ databaseId: process.env.RG_DATABASE_ID || "mymor-australia" });
const GROUP = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji";
const APPLY = process.argv.includes("--apply");
const g = db.collection("restaurantGroups").doc(GROUP);

(async () => {
  console.log(`Phase 1 migration — ${APPLY ? "APPLY" : "DRY-RUN"} — db=${db._settings.databaseId} group=${GROUP}\n`);

  // ── inventoryItems ──
  const inv = await g.collection("inventoryItems").get();
  const items = {}; // id -> recipeUnit (for recipe pass)
  let itemsToMigrate = 0, itemsAlready = 0;
  for (const d of inv.docs) {
    const x = d.data();
    const u = x.unit || "unit";
    items[d.id] = x.recipeUnit || u; // recipeUnit after migration
    const already = x.purchaseUnit !== undefined && x.stockUnit !== undefined && x.recipeUnit !== undefined
      && x.purchaseToStock !== undefined && x.stockToRecipe !== undefined && x.yieldPercent !== undefined;
    if (already) { itemsAlready++; continue; }
    itemsToMigrate++;
    const add = { purchaseUnit: u, stockUnit: u, recipeUnit: u, purchaseToStock: 1, stockToRecipe: 1, yieldPercent: 100 };
    if (itemsToMigrate <= 3) console.log(`  inv ${d.id} (${x.name}) + ${JSON.stringify(add)} (keeps unit="${u}", cost=${x.cost})`);
    if (APPLY) await d.ref.set({ ...add, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (itemsToMigrate > 3) console.log(`  …and ${itemsToMigrate - 3} more inventory items with identical identity defaults`);

  // ── recipes ──
  const rec = await g.collection("recipes").get();
  let recToMigrate = 0, recAlready = 0, lineCount = 0;
  for (const d of rec.docs) {
    const ings = d.get("ingredients") || [];
    const needs = ings.some((l) => l.netQty === undefined || l.recipeUnit === undefined);
    if (!needs) { recAlready++; continue; }
    recToMigrate++;
    const migrated = ings.map((l) => {
      lineCount++;
      return { ...l, netQty: (l.netQty !== undefined ? l.netQty : l.qty), recipeUnit: (l.recipeUnit !== undefined ? l.recipeUnit : (items[l.itemId] || "unit")) };
    });
    if (recToMigrate <= 2) console.log(`  recipe ${d.id}: ${JSON.stringify(ings)}\n            -> ${JSON.stringify(migrated)}`);
    if (APPLY) await d.ref.set({ ingredients: migrated, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  console.log(`\nSUMMARY (${APPLY ? "APPLIED" : "would change"}):`);
  console.log(`  inventoryItems: ${itemsToMigrate} to migrate, ${itemsAlready} already migrated, ${inv.size} total`);
  console.log(`  recipes: ${recToMigrate} to migrate (${lineCount} ingredient lines), ${recAlready} already migrated, ${rec.size} total`);
  console.log(APPLY ? "\n✅ Applied." : "\n(DRY-RUN — nothing written. Re-run with --apply after approval + backup.)");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
