/* One-off backfill — per-venue menu CATEGORY documents (Job 3, Jul 2026).
 *   node scripts/importer/backfill-menu-categories.js            # DRY-RUN (default — prints plan, writes NOTHING)
 *   node scripts/importer/backfill-menu-categories.js --apply    # write
 *
 * Env: RG_DATABASE_ID (default 'mymor-australia'), RG_GROUP_ID (default Mad Kitchen Group)
 *
 * WHAT: for each venue, read the DISTINCT categories of the menu items sold there
 * (instance exists at venues/{v}/menuItems; category text lives on the group
 * template) and create venues/{v}/menuCategories/{slug} docs:
 *   { name (EMOJI STRIPPED), position, colour, active, createdAt, updatedAt }
 * plus write categoryId onto each instance so items point at the DOC, not the text.
 *
 * Rules honoured:
 * - item.category text is NOT touched (POS reads it until Job 4).
 * - group.posItemOrder / posCategoryOrder are NOT touched (name-keyed; Job 4 replaces).
 * - No merging of distinct words ("Smoothies" vs "VEGAN Smoothies" stay separate) —
 *   only emoji/whitespace variants of the SAME text collapse to one doc (reported).
 * - "Uncategorised" gets a real category doc; its items are left alone otherwise.
 * - Category docs are CREATE-only on re-run; categoryId rewrites only when changed. */
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

// ── keep in sync with src/pages/restaurantgroup/rgStockUtils.js (stripEmoji/categorySlug/CATEGORY_COLOURS) ──
const stripEmoji = (s) => String(s || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
const categorySlug = (name) => stripEmoji(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
const CATEGORY_COLOURS = ["#D85A30", "#2563eb", "#16a34a", "#d97706", "#9333ea", "#0e7490", "#dc2626", "#4338ca", "#ca8a04", "#059669"];

(async () => {
  console.log(`# menu-category backfill  ${APPLY ? "(APPLY)" : "(DRY-RUN — no writes)"}  db=${DATABASE_ID}  group=${GROUP}\n`);

  const [groupSnap, itemsSnap, venuesSnap] = await Promise.all([
    g.get(), g.collection("menuItems").get(), g.collection("venues").get(),
  ]);
  if (venuesSnap.empty) throw new Error("No venues under this group — wrong group id?");
  const tmplById = {}; itemsSnap.forEach((d) => (tmplById[d.id] = d.data()));
  // ordering seed: the legacy group list keeps its order; strays go after, alphabetical
  const legacyOrder = (Array.isArray(groupSnap.get("menuCategories")) ? groupSnap.get("menuCategories") : []).map(stripEmoji);

  const catOps = [], instOps = [];
  for (const v of venuesSnap.docs) {
    const [instSnap, existingSnap] = await Promise.all([
      g.collection("venues").doc(v.id).collection("menuItems").get(),
      g.collection("venues").doc(v.id).collection("menuCategories").get(),
    ]);
    const existing = new Set(existingSnap.docs.map((d) => d.id));
    const existingCatId = {}; existingSnap.forEach((d) => (existingCatId[d.get("name")] = d.id));

    // distinct STRIPPED names at this venue + which raw texts collapsed into each
    const rawsByName = {};
    instSnap.forEach((d) => {
      const raw = tmplById[d.id]?.category || "Uncategorised";
      const name = stripEmoji(raw) || "Uncategorised";
      (rawsByName[name] = rawsByName[name] || new Set()).add(raw);
    });
    const names = Object.keys(rawsByName);
    const ordered = [
      ...legacyOrder.filter((n) => names.includes(n)),
      ...names.filter((n) => !legacyOrder.includes(n)).sort((a, b) => a.localeCompare(b)),
    ];

    console.log(`  ${v.id}: ${instSnap.size} items · ${names.length} distinct categories (${existing.size} docs already exist)`);
    const idByName = {};
    ordered.forEach((name, i) => {
      const id = existingCatId[name] || categorySlug(name);
      idByName[name] = id;
      const merged = [...rawsByName[name]].filter((r) => r !== name);
      if (merged.length) console.log(`      ~ "${name}" absorbs emoji/space variants: ${merged.map((m) => JSON.stringify(m)).join(", ")}`);
      if (existing.has(id)) return; // create-only
      catOps.push({
        ref: g.collection("venues").doc(v.id).collection("menuCategories").doc(id),
        data: { name, position: i, colour: CATEGORY_COLOURS[i % CATEGORY_COLOURS.length], active: true, createdAt: TS, updatedAt: TS },
        label: `venues/${v.id}/menuCategories/${id} "${name}" pos=${i}`,
      });
    });

    instSnap.forEach((d) => {
      const raw = tmplById[d.id]?.category || "Uncategorised";
      const catId = idByName[stripEmoji(raw) || "Uncategorised"];
      if (catId && d.get("categoryId") !== catId) {
        instOps.push({ ref: d.ref, data: { categoryId: catId, updatedAt: TS }, label: `venues/${v.id}/menuItems/${d.id} categoryId=${catId}` });
      }
    });
  }

  console.log(`\ncategory docs to create: ${catOps.length}`);
  catOps.slice(0, 12).forEach((o) => console.log(`    ${o.label}`));
  if (catOps.length > 12) console.log(`    … +${catOps.length - 12} more`);
  console.log(`instance categoryId writes: ${instOps.length}`);

  if (!APPLY) { console.log("\nDRY-RUN — nothing written. Re-run with --apply to write."); process.exit(0); }

  console.log("\nAPPLYING…");
  const ops = [...catOps, ...instOps];
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 450)) b.set(op.ref, op.data, { merge: true });
    await b.commit();
    console.log(`  committed ${Math.min(i + 450, ops.length)}/${ops.length}`);
  }

  // verify by re-read: every venue's category count + every instance resolves
  console.log("\nVERIFY (re-read):");
  for (const v of venuesSnap.docs) {
    const [cats, inst] = await Promise.all([
      g.collection("venues").doc(v.id).collection("menuCategories").get(),
      g.collection("venues").doc(v.id).collection("menuItems").get(),
    ]);
    const catIds = new Set(cats.docs.map((d) => d.id));
    const missing = inst.docs.filter((d) => !d.get("categoryId") || !catIds.has(d.get("categoryId")));
    console.log(`  ${v.id}: ${cats.size} category docs, ${inst.size} instances${missing.length ? `  !! ${missing.length} without a valid categoryId` : " — all instances resolve"}`);
  }
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
