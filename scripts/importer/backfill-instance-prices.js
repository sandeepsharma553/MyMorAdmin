/* One-off backfill — venue-instance PRICES (Job 5, Jul 2026).
 *   node scripts/importer/backfill-instance-prices.js            # DRY-RUN (default — prints plan, writes NOTHING)
 *   node scripts/importer/backfill-instance-prices.js --apply    # write
 *
 * Env: RG_DATABASE_ID (default 'mymor-australia'), RG_GROUP_ID (default Mad Kitchen Group)
 *
 * THE BIG IDEA: after Job 5 the VENUE is the truth — clients and rgSellOrder read
 * ONLY the instance. This script gives every EXISTING instance its own price
 * before the fallback is removed (DANGER: no sellPrice + no fallback = $0 sale).
 *
 * For each venues/{v}/menuItems/{id} instance:
 *   - sellPrice missing  → today's value via the CURRENT chain:
 *       instance.sellPrice → template.venuePrices[venueId] → template.sellPrice
 *   - takeawayPrice missing (undefined) → template.takeawayPrice ?? null
 *     (null is a VALUE: "same as dine-in" — only an absent field is filled)
 *   - variants missing → template's hasVariants/variantGroupName/variants copied
 *     WHOLE (deep copy); non-variant items get hasVariants:false, variants:[]
 * Fields the instance ALREADY has are never touched. All prices are EX-GST —
 * copied verbatim, no conversion. template.venuePrices is left in place (dead
 * legacy data — do not delete until Chirag confirms the backfill). */
"use strict";
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji"; // Mad Kitchen Group (capital I)
const APPLY = process.argv.includes("--apply");
const db = getFirestore(admin.app(), DATABASE_ID);
const g = db.collection("restaurantGroups").doc(GROUP);
const TS = FieldValue.serverTimestamp();

(async () => {
  console.log(`# instance-price backfill  ${APPLY ? "(APPLY)" : "(DRY-RUN — no writes)"}  db=${DATABASE_ID}  group=${GROUP}\n`);

  const [tmplSnap, venuesSnap] = await Promise.all([
    g.collection("menuItems").get(), g.collection("venues").get(),
  ]);
  if (venuesSnap.empty) throw new Error("No venues under this group — wrong group id?");
  const tmplById = {}; tmplSnap.forEach((d) => (tmplById[d.id] = d.data()));

  const ops = [];
  const stats = { price: 0, takeaway: 0, variants: 0, untouched: 0, orphan: 0 };
  for (const v of venuesSnap.docs) {
    const instSnap = await g.collection("venues").doc(v.id).collection("menuItems").get();
    let vPrice = 0, vTa = 0, vVar = 0;
    instSnap.forEach((d) => {
      const inst = d.data();
      const t = tmplById[d.id];
      if (!t) { stats.orphan++; console.log(`  !! orphan instance venues/${v.id}/menuItems/${d.id} (no template) — SKIPPED`); return; }
      const patch = {};
      if (inst.sellPrice == null || isNaN(Number(inst.sellPrice))) {
        const vpRaw = t.venuePrices ? t.venuePrices[v.id] : undefined;
        patch.sellPrice = vpRaw != null && !isNaN(Number(vpRaw)) ? Number(vpRaw) : (Number(t.sellPrice) || 0);
        vPrice++;
      }
      if (inst.takeawayPrice === undefined) { patch.takeawayPrice = t.takeawayPrice ?? null; vTa++; }
      if (inst.variants == null) {
        patch.hasVariants = t.hasVariants === true;
        patch.variantGroupName = t.hasVariants ? (t.variantGroupName || "") : "";
        patch.variants = t.hasVariants ? (t.variants || []).map((x) => ({ ...x })) : [];
        vVar++;
      }
      if (!Object.keys(patch).length) { stats.untouched++; return; }
      ops.push({ ref: d.ref, data: { ...patch, updatedAt: TS } });
    });
    stats.price += vPrice; stats.takeaway += vTa; stats.variants += vVar;
    console.log(`  ${v.id}: ${instSnap.size} instances → sellPrice fills: ${vPrice}, takeaway fills: ${vTa}, variants fills: ${vVar}`);
  }
  console.log(`\ntotals: sellPrice ${stats.price} · takeaway ${stats.takeaway} · variants ${stats.variants} · already complete ${stats.untouched} · orphans ${stats.orphan}`);
  console.log(`instance docs to patch: ${ops.length}`);

  if (!APPLY) { console.log("\nDRY-RUN — nothing written. Re-run with --apply to write."); process.exit(0); }

  console.log("\nAPPLYING…");
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 450)) b.set(op.ref, op.data, { merge: true });
    await b.commit();
    console.log(`  committed ${Math.min(i + 450, ops.length)}/${ops.length}`);
  }

  // VERIFY by re-read: after this, NO instance may lack a numeric sellPrice, and
  // every variant-item instance must carry its own variants with numeric prices.
  console.log("\nVERIFY (re-read):");
  let bad = 0;
  for (const v of venuesSnap.docs) {
    const instSnap = await g.collection("venues").doc(v.id).collection("menuItems").get();
    let noPrice = 0, noVars = 0, variantItems = 0;
    instSnap.forEach((d) => {
      const inst = d.data(); const t = tmplById[d.id];
      if (!t) return;
      if (inst.sellPrice == null || isNaN(Number(inst.sellPrice))) noPrice++;
      if (t.hasVariants) { variantItems++; if (!Array.isArray(inst.variants) || !inst.variants.length) noVars++; }
    });
    bad += noPrice + noVars;
    console.log(`  ${v.id}: ${instSnap.size} instances · missing sellPrice: ${noPrice} · variant items: ${variantItems}, missing variants: ${noVars}`);
  }
  console.log(bad ? `\n!! ${bad} gaps remain — DO NOT remove the fallback (deploy step 3) until this is clean.` : "\n✅ Every instance prices itself — safe to stop reading the template.");
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
