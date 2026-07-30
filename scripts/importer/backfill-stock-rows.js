/* One-off backfill — stock rows for inventory items that have none (Jul 2026).
 *   node scripts/importer/backfill-stock-rows.js            # DRY-RUN (default — prints plan, writes NOTHING)
 *   node scripts/importer/backfill-stock-rows.js --apply    # write
 *
 * Env: RG_DATABASE_ID (default 'mymor-australia'), RG_GROUP_ID (default Mad Kitchen Group)
 *
 * WHY: rgSellOrder SKIPS the deduction for an item with no stock row at the
 * selling venue ("No stock record" in the order's skipped[] that nobody reads) —
 * the sale goes through but stock never moves. The Stock editor fans a stock row
 * into every venue on create (StockPage.js); seed-madbenji-recipes-instances.js
 * did not, leaving its inv-mb-* items with no stock row anywhere.
 *
 * WHAT: for every inventoryItems/{itemId} with no venues/{venueId}/stock/{itemId},
 * create one — SAME doc id (the join), qtyOnHand 0 (a number, not null), par /
 * reorderPoint / reorderQty 0, status via the canonical rule, lastCountedAt null.
 * CREATE-only: existing stock rows are never touched. Archived items included —
 * recipes can still reference them, so the join must have no holes. */
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

// ── canonical status rule — keep in sync with src/pages/restaurantgroup/rgStockUtils.js ──
const computeStockStatus = (qty, reorderPoint, par) => {
  const q = Number(qty) || 0;
  if (q <= 0) return "critical";
  if (q <= (Number(reorderPoint) || 0)) return "critical";
  if (q <= (Number(par) || 0) * 0.5) return "low";
  return "ok";
};

(async () => {
  console.log(`# stock-row backfill  ${APPLY ? "(APPLY)" : "(DRY-RUN — no writes)"}  db=${DATABASE_ID}  group=${GROUP}\n`);

  const [invSnap, venuesSnap] = await Promise.all([
    g.collection("inventoryItems").get(),
    g.collection("venues").get(),
  ]);
  if (venuesSnap.empty) throw new Error("No venues under this group — wrong group id?");
  const items = invSnap.docs.map((d) => ({ id: d.id, name: d.get("name") || d.id }));
  console.log(`inventory items: ${items.length}   venues: ${venuesSnap.docs.map((d) => d.id).join(", ")}\n`);

  const ops = []; // { ref, label }
  for (const v of venuesSnap.docs) {
    const stockSnap = await g.collection("venues").doc(v.id).collection("stock").get();
    const have = new Set(stockSnap.docs.map((d) => d.id));
    const missing = items.filter((i) => !have.has(i.id));
    console.log(`  ${v.id}: ${have.size} stock rows, ${missing.length} missing → after: ${have.size + missing.length}`);
    for (const i of missing) ops.push({ ref: g.collection("venues").doc(v.id).collection("stock").doc(i.id), label: `venues/${v.id}/stock/${i.id} "${i.name}"` });
  }
  console.log(`\ntotal rows to create: ${ops.length}`);
  if (!ops.length) { console.log("Nothing to do."); process.exit(0); }
  ops.slice(0, 8).forEach((o) => console.log(`    e.g. ${o.label}`));

  if (!APPLY) { console.log("\nDRY-RUN — nothing written. Re-run with --apply to write."); process.exit(0); }

  console.log("\nAPPLYING…");
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 450)) {
      // create(), not set(): hard-fails instead of clobbering if a row appeared
      // between the read above and this write (e.g. a concurrent editor save)
      b.create(op.ref, {
        qtyOnHand: 0, par: 0, reorderPoint: 0, reorderQty: 0,
        status: computeStockStatus(0, 0, 0), lastCountedAt: null, updatedAt: TS,
      });
    }
    await b.commit();
    console.log(`  committed ${Math.min(i + 450, ops.length)}/${ops.length}`);
  }

  // verify by re-reading: every venue must now hold a row for every item
  console.log("\nVERIFY (re-read):");
  let holes = 0;
  for (const v of venuesSnap.docs) {
    const stockSnap = await g.collection("venues").doc(v.id).collection("stock").get();
    const have = new Set(stockSnap.docs.map((d) => d.id));
    const still = items.filter((i) => !have.has(i.id));
    holes += still.length;
    console.log(`  ${v.id}: ${have.size} stock rows${still.length ? `  !! STILL MISSING: ${still.map((i) => i.id).join(", ")}` : ""}`);
  }
  console.log(holes ? `\n!! ${holes} holes remain — investigate before trusting deductions.` : "\n✅ Every inventory item has a stock row at every venue.");
  process.exit(holes ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
