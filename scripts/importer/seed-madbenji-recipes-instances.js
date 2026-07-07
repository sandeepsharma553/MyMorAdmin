/* Mad Benji TEST seed — venue INSTANCES + recipe-shell ingredient fill (ADDITIVE, idempotent).
 *   node scripts/importer/seed-madbenji-recipes-instances.js            # DRY-RUN (default — prints plan, writes NOTHING)
 *   node scripts/importer/seed-madbenji-recipes-instances.js --apply    # write
 *
 * Adapted from MadBenji_Seed_Instructions.md (Downloads) AFTER reading the live DB:
 * the 283 menu templates + 105 modifierGroups ALREADY exist (import-madbenji-menu.js
 * was run), so this script does NOT create templates. What was actually missing:
 *   1. venues/mad-benji/menuItems INSTANCES — count was 0, which blocks the POS
 *      render + rgSellOrder instance gate. Seeds a LINKED instance for every
 *      template whose venueIds includes mad-benji ({linked,available,e86} only —
 *      instance-only state per the template+instance model).
 *   2. The 40 recipe shells all have ingredients:[] — fills the ones matching the
 *      Mad Benji sheet's 40 items with APPROXIMATE ingredient lists (qty 1 / cost 0;
 *      the source sheet has no quantities — food cost renders $0 / 100% margin, expected).
 *      Matched sheet items with NO recipe get one created (rec_<n> convention) and
 *      linked via template.recipeId merge (only when recipeId is null).
 *   3. Ingredients resolve to inventoryItems by normalised name (existing inv-###
 *      reused; missing ones created as inv-mb-<slug>, full field parity, cost 0).
 *
 * TEST DATA: ingredient lists are approximate (flat sheet extraction — starred
 * composites like "*Pulled Pork + Cheese*" and "NO CHEESE" become literal inventory
 * items, per the instruction doc). Every created doc + filled recipe is stamped
 * _seed:"madbenji-test" for later cleanup. Existing docs are NEVER overwritten:
 * existing instances are skipped, non-empty recipes are skipped, template.recipeId
 * is only set when currently null.
 *
 * Sheet items with NO live template ("Spicy Chicken (GF)", "S&P Chicken" poke bowls)
 * are REPORTED and skipped — creating templates without a posId would break POS mapping. */
"use strict";
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji"; // Mad Kitchen Group (capital I)
const VENUE = process.env.RG_VENUE_ID || "mad-benji";
const APPLY = process.argv.includes("--apply");
const db = getFirestore(admin.app(), DATABASE_ID);
const g = db.collection("restaurantGroups").doc(GROUP);
const TS = FieldValue.serverTimestamp();
const SEED = "madbenji-test";

// ── the 40-item sheet extraction (from MadBenji_Seed_Instructions.md — approximate) ──
const MENU = [
  { name: "Mad Lot", ingredients: ["Ketchup", "Lettuce", "Tomato", "Sweet Mayo", "Red Onion"] },
  { name: "Humpty Dumpty", ingredients: ["Ketchup", "Ketchup"] },
  { name: "Mad Moo", ingredients: ["Ketchup", "Lettuce", "Tomato", "Sweet Mayo"] },
  { name: "Mad Benji", ingredients: ["BBQ Sauce", "Lettuce", "BBQ Sauce"] },
  { name: "Hot & Mad", ingredients: ["Hot Mayo", "Lettuce", "Hot Mayo", "Pickles", "Jalapenos", "Caramelised Onion"] },
  { name: "King Solomon", ingredients: ["Sriracha Mayo", "Fried Jalapenos", "* Pulled Beef*", "NO CHEESE", "Sriracha Mayo", "Coleslaw", "Spring Onion"] },
  { name: "Double Madness", ingredients: ["Sweet Chilli Mayo", "Lettuce", "Sweet Chilli Mayo", "Caramelised Onion"] },
  { name: "Mad Scheme", ingredients: ["Sweet Mayo", "Sweet Mayo", "Pickles", "Jalapenos"] },
  { name: "Juicy Jason", ingredients: ["BBQ Sauce", "Lettuce", "BBQ Sauce", "Caramelised Onion", "Pickles"] },
  { name: "Sea Sick Steph", ingredients: ["BBQ Sauce", "Lettuce", "* White Fillet Fish + Cheese*", "Aioli", "Cucumber", "Red Onion"] },
  { name: "Slow Pork", ingredients: ["Sriracha Mayo", "Lettuce", "*Pulled Pork + Cheese*", "Sriracha Mayo", "Coleslaw", "Spring Onion", "Sesame Seed"] },
  { name: "Mad Cluck", ingredients: ["Avocado", "Lettuce", "Aioli", "Red Onion"] },
  { name: "Panko Tango", ingredients: ["Sweet Mayo", "Sweet Mayo", "Pickles", "Caramelised Onion"] },
  { name: "Alley Dancer", ingredients: ["Sweet Chilli Mayo", "Lettuce", "Tomato", "NO CHEESE", "Sweet Chilli Mayo", "Sesame Seed"] },
  { name: "Mad Pretender", ingredients: ["Lettuce", "Pineapple", "*Pretender*", "NO CHEESE", "Cucumber"] },
  { name: "Dream Weaver", ingredients: ["Ketchup", "Lettuce", "Tomato", "*Chicken Schitzel + Cheese*", "Ketchup", "Red Onion"] },
  { name: "Pretty Mad", ingredients: ["Avocado", "Lettuce", "Tomato", "*Pumpkin + Cheese*", "Aioli", "Red Onion", "Tomato Relish"] },
  { name: "Spud Light Year", ingredients: ["Cap. Relish", "Lettuce", "Tomato", "*Hashbrown + Cheese*", "Aioli", "Sweet Corn"] },
  { name: "Desert Blossom", ingredients: ["Aioli", "Lettuce", "* Pulled Mushroom*", "NO CHEESE", "Aioli", "Red Onion", "Cucumber"] },
  { name: "Fury Swipes", ingredients: ["Aioli", "Lettuce", "*Hashbrown + P. Mushroom*", "Cheese", "Aioli", "Red Onion", "Pickles"] },
  { name: "Double Blessing", ingredients: ["Cap. Relish", "Lettuce", "Pineapple", "* 2x Veg. Croquette*", "*2x Cheese*", "Aioli", "Red Onion"] },
  { name: "Hey Macarena", ingredients: ["Sweet Chilli Mayo", "Lettuce", "Tomato", "*M&C patty + Cheese*", "Sweet Chilli Mayo", "Pickles", "Red Onion"] },
  { name: "Tide Hunter (GF)", ingredients: ["Smoked salmon", "Seaweed salad", "Pickled cabbage", "Pink ginger", "Sweet corn", "Fried capers", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Aioli"] },
  { name: "Grilled Boss (GF)", ingredients: ["Grilled Chicken", "Seaweed salad", "Pickled cabbage", "Pink ginger", "Pineapple", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Hot Mayo"] },
  { name: "Fried Boss", ingredients: ["Panko Chicken", "Seaweed salad", "Coleslaw", "Pickle", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Sweet Chilli Mayo"] },
  { name: "Giant Kraken", ingredients: ["Calamari (5pcs)", "Seaweed salad", "Coleslaw", "Jalapeno", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Sweet Chilli Mayo"] },
  { name: "Slow Boss (GF)", ingredients: ["Pulled Pork", "Seaweed salad", "Pickled Onion", "Coleslaw", "Jalapeno", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Sriracha Mayo"] },
  { name: "Mushroom Boom (VG, GF)", ingredients: ["Pulled mushroom & artichoke", "Beetroot slice (1pcs good size)", "Cucumber (cut in cubes)", "Tomato relish", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Guacomole"] },
  { name: "Gentle Bowl of Goodness (VG)", ingredients: ["Plant based BBQ meat", "Seaweed salad", "Pickled cabbage", "Sweet corn", "Cucumber (cut in cubes)", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Guacomole"] },
  { name: "Glorious Gallus (VG)", ingredients: ["Vegan Schitzel", "Seaweed salad", "Pineapple", "Tomato relish", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Vegan Sweet Chilli Mayo"] },
  { name: "Spicy Chicken (GF)", ingredients: ["Grilled Chicken", "Seaweed salad", "Jalapenos", "Sweet Corn", "Pink Ginger", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Wing Chun Sauce"] },
  { name: "S&P Chicken", ingredients: ["Alley Dancer Chicken", "Pickled cabbage", "Pink Ginger", "Tomato relish", "Edamame", "Chickpea", "Sweet Potato Crisps", "Nori seaweed", "Sesame seed", "Sweet Chilli Mayo"] },
  { name: "Mad Wing Wing (10pcs)", ingredients: ["BBQ Sauce", "Spring Onion", "Sesame Seed"] },
  { name: "Wing Chun  (10pcs)", ingredients: ["Wing Chun Sauce", "Red Chili", "Spring Onion", "Sesame Seed"] },
  { name: "A", ingredients: ["Cheese Sauce", "Hot Mayo", "Jalapenos", "Spring Onion"] },
  { name: "B", ingredients: ["Cheese Sauce", "Ketchup", "Mustard", "Bacon"] },
  { name: "C", ingredients: ["Avocado", "Sour Cream", "Bacon", "Spring Onion"] },
  { name: "D", ingredients: ["Pulled Pork", "Jalapenos", "Sriracha Mayo", "Spring Onion", "Sesame Seeds"] },
  { name: "E", ingredients: ["Jalapenos", "Pickles", "Sweet Chili Mayo", "Spring Onion"] },
  { name: "F", ingredients: ["Pretender", "Aioli", "BBQ Sauce", "Spring Onion", "Sesame Seeds"] },
];

// ── sheet name → live template displayName, where they differ (normalised at build below) ──
const NAME_ALIASES_RAW = {
  "spud light year": "spud lightyear",
  "tide hunter": "tidehunter",
  "grilled boss": "grilled by boss",
  "fried boss": "fried by boss",
  "slow boss": "slow cooked by boss",
  "gentle bowl of goodness": "gentle bowl",
  "mad wing wing": "mad wing wing",
  a: "loaded a", b: "loaded b", c: "loaded c", d: "loaded d", e: "loaded e", f: "loaded f",
};
// sheet ingredient → existing inventory name, where they differ (normalised at build below)
const INV_ALIASES_RAW = { coleslaw: "coleslaw mix", cheese: "cheese slices" };

// normalise for matching: strip *…* markers, parentheticals, emoji, "chili"→"chilli",
// collapse spaces, lowercase, drop a trailing plural s
const norm = (s) =>
  String(s || "")
    .replace(/\*/g, "").replace(/\([^)]*\)/g, "")
    .replace(/[^\w&+.' -]/g, " ")
    .toLowerCase().replace(/chili/g, "chilli")
    .replace(/\s+/g, " ").trim().replace(/s$/, "");
const cleanName = (s) => String(s || "").replace(/\*/g, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
// alias keys/values must go through the SAME normalisation as lookups ("boss" → "bos")
const NAME_ALIASES = Object.fromEntries(Object.entries(NAME_ALIASES_RAW).map(([k, v]) => [norm(k), norm(v)]));
const INV_ALIASES = Object.fromEntries(Object.entries(INV_ALIASES_RAW).map(([k, v]) => [norm(k), norm(v)]));

(async () => {
  console.log(`# madbenji recipes+instances seed  ${APPLY ? "(APPLY)" : "(DRY-RUN — no writes)"}  db=${DATABASE_ID}  group=${GROUP}  venue=${VENUE}\n`);

  const [items, recs, inv, instSnap] = await Promise.all([
    g.collection("menuItems").get(),
    g.collection("recipes").get(),
    g.collection("inventoryItems").get(),
    g.collection("venues").doc(VENUE).collection("menuItems").get(),
  ]);

  const templates = items.docs.map((d) => ({ id: d.id, ...d.data() }));
  const recById = {}; recs.forEach((d) => (recById[d.id] = d.data()));
  const recIds = new Set(recs.docs.map((d) => d.id));
  const haveInstance = new Set(instSnap.docs.map((d) => d.id));
  // on duplicate displayNames prefer a categorised template — e.g. "Loaded A" exists as
  // mi_883 (Uncategorised, stray) AND mi_889 (Loaded, the real one the sheet means)
  const tmplByNorm = {};
  templates.forEach((t) => {
    const k = norm(t.displayName);
    if (!k) return;
    const cur = tmplByNorm[k];
    if (!cur || (cur.category === "Uncategorised" && t.category !== "Uncategorised")) tmplByNorm[k] = t;
  });

  // inventory lookup by normalised name (existing first; new ones added as planned)
  const invByNorm = {};
  inv.forEach((d) => { const k = norm(d.data().name); if (k && !invByNorm[k]) invByNorm[k] = { id: d.id, ...d.data() }; });

  const ops = []; // { ref, data, merge, label }
  const stats = { instances: 0, instSkip: 0, recFill: 0, recCreate: 0, recSkip: 0, linkSet: 0, invCreate: 0, invReuse: 0 };
  const unmatchedItems = [];
  const invCreated = [];

  const ensureInv = (rawName) => {
    let k = norm(rawName);
    if (INV_ALIASES[k]) k = INV_ALIASES[k];
    if (invByNorm[k]) { stats.invReuse++; return invByNorm[k]; }
    const name = cleanName(rawName);
    const id = `inv-mb-${slug(rawName)}`;
    const rec = { id, name, unit: "ea", purchaseUnit: "ea", stockUnit: "ea", recipeUnit: "ea",
      purchaseToStock: 1, stockToRecipe: 1, yieldPercent: 100, cost: 0, sell: 0,
      gstApplicable: true, supplierId: null, sku: "", storageLocation: "", category: "Uncategorised",
      itemType: "ingredient", producedByRecipeId: null, isPrepped: false, archived: false };
    invByNorm[k] = rec; stats.invCreate++; invCreated.push(`${id} "${name}"`);
    ops.push({ ref: g.collection("inventoryItems").doc(id),
      data: { ...rec, id: undefined, createdAt: TS, updatedAt: TS, _seed: SEED }, label: `inventoryItems/${id} "${name}"` });
    return rec;
  };

  // 1) recipe fills for the 40 sheet items
  for (const m of MENU) {
    let key = norm(m.name);
    if (NAME_ALIASES[key]) key = NAME_ALIASES[key];
    const t = tmplByNorm[key];
    if (!t) { unmatchedItems.push(m.name); continue; }

    // dedupe within a recipe by resolved inventory id (sheet has literal repeats)
    const seen = new Set();
    const ingredients = [];
    for (const raw of m.ingredients) {
      const iv = ensureInv(raw);
      if (seen.has(iv.id)) continue;
      seen.add(iv.id);
      ingredients.push({ itemId: iv.id, qty: 1, netQty: 1, recipeUnit: iv.recipeUnit || iv.unit || "ea" });
    }

    if (t.recipeId && recById[t.recipeId]) {
      const existing = recById[t.recipeId];
      if ((existing.ingredients || []).length > 0) { stats.recSkip++; continue; } // never clobber real data
      ops.push({ ref: g.collection("recipes").doc(t.recipeId), merge: true,
        data: { ingredients, updatedAt: TS, _seed: SEED },
        label: `recipes/${t.recipeId} FILL ${ingredients.length} ingredients ("${t.displayName}")` });
      stats.recFill++;
    } else {
      const rid = `rec_${t.id.replace(/^mi_/, "")}`; // house convention: rec_<n> for mi_<n>
      if (recIds.has(rid)) { console.log(`  !! rec id collision ${rid} (unexpected) — skipping "${t.displayName}"`); stats.recSkip++; continue; }
      ops.push({ ref: g.collection("recipes").doc(rid),
        data: { menuItemId: t.id, ingredients, createdAt: TS, updatedAt: TS, _seed: SEED },
        label: `recipes/${rid} CREATE ${ingredients.length} ingredients ("${t.displayName}")` });
      stats.recCreate++;
      if (!t.recipeId) {
        ops.push({ ref: g.collection("menuItems").doc(t.id), merge: true,
          data: { recipeId: rid, updatedAt: TS }, label: `menuItems/${t.id} link recipeId=${rid}` });
        stats.linkSet++;
      }
    }
  }

  // 2) linked instances for every template sold at the venue
  for (const t of templates) {
    if (!(t.venueIds || []).includes(VENUE)) continue;
    if (haveInstance.has(t.id)) { stats.instSkip++; continue; }
    ops.push({ ref: g.collection("venues").doc(VENUE).collection("menuItems").doc(t.id),
      data: { linked: true, available: true, e86: false, createdAt: TS, updatedAt: TS, _seed: SEED },
      label: `venues/${VENUE}/menuItems/${t.id} LINKED ("${t.displayName}")` });
    stats.instances++;
  }

  console.log("=== PLAN ===");
  console.log(`  instances create:   ${stats.instances}   (skip existing: ${stats.instSkip})`);
  console.log(`  recipes fill:       ${stats.recFill}`);
  console.log(`  recipes create:     ${stats.recCreate}   (+ ${stats.linkSet} template recipeId links)`);
  console.log(`  recipes skipped:    ${stats.recSkip}   (already have ingredients / collision)`);
  console.log(`  inventory create:   ${stats.invCreate}   reuse: ${stats.invReuse}`);
  console.log(`  total writes:       ${ops.length}`);
  if (unmatchedItems.length) console.log(`\n  !! sheet items with NO live template (SKIPPED): ${unmatchedItems.join(" · ")}`);
  if (invCreated.length) console.log(`\n  new inventory items:\n    ${invCreated.join("\n    ")}`);
  console.log("\n  recipe ops:");
  ops.filter((o) => o.label.startsWith("recipes/") || o.label.startsWith("menuItems/")).forEach((o) => console.log(`    ${o.label}`));

  if (!APPLY) { console.log("\nDRY-RUN — nothing written. Re-run with --apply to write."); process.exit(0); }

  console.log("\nAPPLYING…");
  for (let i = 0; i < ops.length; i += 450) {
    const b = db.batch();
    for (const op of ops.slice(i, i + 450)) {
      const { id, ...data } = op.data; // strip helper id if present
      if (op.merge) b.set(op.ref, data, { merge: true });
      else b.set(op.ref, data);
    }
    await b.commit();
    console.log(`  committed ${Math.min(i + 450, ops.length)}/${ops.length}`);
  }
  console.log(`DONE. Seeded venue instances + recipe fills for group ${GROUP} venue ${VENUE}.`);
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e); process.exit(1); });
