/* Seed the Stock + Menus + Supplier module for a restaurant group from the
 * mymor_stock_menu_5 prototype data (Phase 0 of the module #2 handoff).
 *
 *   node seed-stock-module.js
 *
 * Env: RG_DATABASE_ID (default 'mymor-australia' = prod; dev is 'mymor-dev-aus')
 *      RG_GROUP_ID    (default Mad Kitchen Group)
 *
 * Idempotent: deterministic doc ids + set(..., {merge:true}); re-running
 * refreshes definitions without duplicating anything. Per-venue stock docs are
 * only CREATED, never overwritten, so live quantities survive a re-run.
 * Prices are stored EX-GST everywhere (menu prototype prices were inc-GST and
 * are divided by 1.1 here once). */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
// NB: capital I in ...wMIdLSg... — provision-group.js carries a lookalike id
// with a lowercase l that does NOT exist in the live database.
const GROUP_ID = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji"; // Mad Kitchen Group
const db = getFirestore(app, DATABASE_ID);
const groupRef = db.collection("restaurantGroups").doc(GROUP_ID);

// ── canonical status rule — keep in sync with src/pages/restaurantgroup/rgStockUtils.js ──
const computeStockStatus = (qty, reorderPoint, par) => {
  const q = Number(qty) || 0;
  if (q <= 0) return "critical";
  if (q <= (Number(reorderPoint) || 0)) return "critical";
  if (q <= (Number(par) || 0) * 0.5) return "low";
  return "ok";
};
const exGst = (inc) => Math.round(((Number(inc) || 0) / 1.1) * 100) / 100;
const pad3 = (n) => String(n).padStart(3, "0");
const invId = (protoId) => `inv-${pad3(protoId)}`;
const menuId = (protoId) => `menu-${protoId}`;

// ── suppliers (prototype directory + Packaging Supplier, referenced by items) ──
// venueIds filled at runtime: "all" → every venue in the group.
const SUPPLIERS = [
  { id: "vic-meats-co", company: "Vic Meats Co.", contactName: "Tom Bradley", phone: "0412 555 001", email: "orders@vicmeats.com.au", leadTime: "1-2 days", venues: "all" },
  { id: "five-ways", company: "5 Ways", contactName: "Sarah Chen", phone: "0412 555 002", email: "wholesale@5ways.com.au", leadTime: "2 days", venues: ["Mad Benji", "Hey Sister"] },
  { id: "triple-asian-grocery", company: "Triple Asian Grocery", contactName: "Wei Zhang", phone: "0412 555 003", email: "trade@tripleAsian.com.au", leadTime: "Tuesday", venues: "all" },
  { id: "veggie-order", company: "Veggie Order", contactName: "Mark Johnson", phone: "0412 555 004", email: "orders@veggieorder.com.au", leadTime: "Sun & Thu", venues: "all" },
  { id: "united-food-express", company: "United Food Express", contactName: "Lisa Park", phone: "0412 555 005", email: "orders@ufe.com.au", leadTime: "Sun & Thu", venues: ["Mad Hot Pot"] },
  { id: "packaging-supplier", company: "Packaging Supplier", contactName: "", phone: "", email: "", leadTime: "", venues: "all" },
];
const SUPPLIER_ID_BY_NAME = Object.fromEntries(SUPPLIERS.map((s) => [s.company, s.id]));

// ── modifier groups (prototype buildMods, price deltas parsed out of labels) ──
const MODIFIER_GROUPS = [
  { id: "mod-burger-sauces", name: "Burger sauces", type: "multi", required: false, minSelections: 0, maxSelections: null, printer: "kitchen",
    options: [{ label: "BBQ", priceDelta: 0 }, { label: "Aioli", priceDelta: 0 }, { label: "Hot mayo", priceDelta: 0 }, { label: "Sweet chilli", priceDelta: 0 }, { label: "Sriracha", priceDelta: 0 }, { label: "Ketchup", priceDelta: 0 }] },
  { id: "mod-burger-extras", name: "Burger extras", type: "multi", required: false, minSelections: 0, maxSelections: null, printer: "kitchen",
    options: [{ label: "Extra patty", priceDelta: 4 }, { label: "Extra cheese", priceDelta: 2 }, { label: "Bacon", priceDelta: 3 }, { label: "Fried egg", priceDelta: 2 }] },
  { id: "mod-bun-choice", name: "Bun choice", type: "single", required: true, minSelections: 1, maxSelections: 1, printer: "kitchen",
    options: [{ label: "Brioche (default)", priceDelta: 0 }, { label: "Gluten free bun", priceDelta: 3 }, { label: "Lettuce wrap", priceDelta: -2 }] },
  { id: "mod-spice-level", name: "Spice level", type: "single", required: false, minSelections: 0, maxSelections: 1, printer: "kitchen",
    options: [{ label: "Mild", priceDelta: 0 }, { label: "Medium", priceDelta: 0 }, { label: "Hot", priceDelta: 0 }, { label: "Extra hot", priceDelta: 0 }] },
  { id: "mod-side-choice", name: "Side choice", type: "single", required: true, minSelections: 1, maxSelections: 1, printer: "kitchen",
    options: [{ label: "Beef fat chips (default)", priceDelta: 0 }, { label: "Sweet potato fries", priceDelta: 2 }, { label: "Side salad", priceDelta: 0 }] },
];

// Prototype data, verbatim (field-name contract). INV cost/sell are EX-GST;
// MENU sell is INC-GST (converted on write). st is recomputed, not trusted.
const PROTO_INV = [
  {"id":1,"n":"Beef brisket","sku":"MK-PROT-001","cat":"Protein","unit":"kg","sup":"Vic Meats Co.","qty":2,"par":15,"ro":5,"roq":15,"cost":20,"sell":30.91,"st":"critical"},
  {"id":2,"n":"Chicken thigh (trimmed)","sku":"MK-PROT-002","cat":"Protein","unit":"kg","sup":"Vic Meats Co.","qty":22,"par":30,"ro":10,"roq":20,"cost":9.09,"sell":12.73,"st":"ok"},
  {"id":3,"n":"Pork belly (cured)","sku":"MK-PROT-003","cat":"Protein","unit":"kg","sup":"Vic Meats Co.","qty":12,"par":15,"ro":5,"roq":10,"cost":10.91,"sell":16.36,"st":"ok"},
  {"id":4,"n":"Pulled pork","sku":"MK-PROT-004","cat":"Protein","unit":"kg","sup":"Vic Meats Co.","qty":3,"par":8,"ro":2,"roq":8,"cost":12,"sell":18,"st":"low"},
  {"id":5,"n":"Pulled beef","sku":"MK-PROT-005","cat":"Protein","unit":"kg","sup":"Vic Meats Co.","qty":2,"par":8,"ro":2,"roq":8,"cost":16,"sell":24,"st":"critical"},
  {"id":6,"n":"White fish fillet","sku":"MK-PROT-006","cat":"Protein","unit":"kg","sup":"United Food Express","qty":4,"par":8,"ro":2,"roq":6,"cost":14,"sell":21,"st":"low"},
  {"id":7,"n":"Frozen beef roll","sku":"MK-FROZ-001","cat":"Frozen","unit":"kg","sup":"Triple Asian Grocery","qty":80,"par":60,"ro":20,"roq":40,"cost":22,"sell":33,"st":"ok"},
  {"id":8,"n":"Frozen pork roll","sku":"MK-FROZ-002","cat":"Frozen","unit":"kg","sup":"Triple Asian Grocery","qty":20,"par":30,"ro":10,"roq":20,"cost":18,"sell":27,"st":"low"},
  {"id":9,"n":"Frozen lamb roll","sku":"MK-FROZ-003","cat":"Frozen","unit":"kg","sup":"Triple Asian Grocery","qty":30,"par":40,"ro":15,"roq":25,"cost":26,"sell":39,"st":"ok"},
  {"id":10,"n":"Lettuce","sku":"MK-PROD-001","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":4,"par":8,"ro":2,"roq":8,"cost":3.5,"sell":5.45,"st":"low"},
  {"id":11,"n":"Tomato","sku":"MK-PROD-002","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":6,"par":10,"ro":3,"roq":10,"cost":4,"sell":6.36,"st":"ok"},
  {"id":12,"n":"Red onion","sku":"MK-PROD-003","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":5,"par":8,"ro":2,"roq":8,"cost":2.5,"sell":4.09,"st":"ok"},
  {"id":13,"n":"Avocado","sku":"MK-PROD-004","cat":"Produce","unit":"units","sup":"Veggie Order","qty":12,"par":20,"ro":6,"roq":20,"cost":1.8,"sell":2.73,"st":"ok"},
  {"id":14,"n":"Shiitake mushroom","sku":"MK-PROD-005","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":3,"par":6,"ro":2,"roq":6,"cost":12,"sell":18.18,"st":"low"},
  {"id":15,"n":"Caramelised onion","sku":"MK-PROD-006","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":3,"par":5,"ro":1,"roq":5,"cost":5,"sell":7.73,"st":"ok"},
  {"id":16,"n":"Pickles","sku":"MK-PROD-007","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":2,"par":6,"ro":2,"roq":6,"cost":4.5,"sell":6.82,"st":"critical"},
  {"id":17,"n":"Jalapeno","sku":"MK-PROD-008","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":2,"par":4,"ro":1,"roq":4,"cost":6,"sell":9.09,"st":"low"},
  {"id":18,"n":"Spring onion (bunches)","sku":"MK-PROD-009","cat":"Produce","unit":"bunch","sup":"Veggie Order","qty":8,"par":20,"ro":6,"roq":15,"cost":1.36,"sell":2.73,"st":"low"},
  {"id":19,"n":"Coleslaw mix","sku":"MK-PROD-010","cat":"Produce","unit":"kg","sup":"Veggie Order","qty":3,"par":5,"ro":2,"roq":5,"cost":4,"sell":6.36,"st":"ok"},
  {"id":20,"n":"Cheese slices","sku":"MK-DAIR-001","cat":"Dairy","unit":"kg","sup":"Vic Meats Co.","qty":4,"par":6,"ro":2,"roq":6,"cost":10,"sell":15.45,"st":"ok"},
  {"id":21,"n":"Butter (unsalted)","sku":"MK-DAIR-002","cat":"Dairy","unit":"kg","sup":"Vic Meats Co.","qty":6,"par":8,"ro":3,"roq":5,"cost":7.27,"sell":10.91,"st":"ok"},
  {"id":22,"n":"Thickened cream 35%","sku":"MK-DAIR-003","cat":"Dairy","unit":"L","sup":"Vic Meats Co.","qty":10,"par":15,"ro":5,"roq":10,"cost":4.09,"sell":5.45,"st":"low"},
  {"id":23,"n":"Egg","sku":"MK-DAIR-004","cat":"Dairy","unit":"units","sup":"Veggie Order","qty":36,"par":60,"ro":20,"roq":60,"cost":0.4,"sell":0.64,"st":"ok"},
  {"id":24,"n":"Brioche bun","sku":"MK-DRY-001","cat":"Dry goods","unit":"units","sup":"Vic Meats Co.","qty":80,"par":150,"ro":40,"roq":150,"cost":0.8,"sell":1.27,"st":"ok"},
  {"id":25,"n":"Jasmine rice","sku":"MK-DRY-002","cat":"Dry goods","unit":"kg","sup":"Triple Asian Grocery","qty":40,"par":50,"ro":15,"roq":30,"cost":1.82,"sell":2.73,"st":"ok"},
  {"id":26,"n":"Coconut milk (400ml)","sku":"MK-DRY-003","cat":"Dry goods","unit":"can","sup":"Triple Asian Grocery","qty":18,"par":24,"ro":8,"roq":12,"cost":2.27,"sell":3.64,"st":"ok"},
  {"id":27,"n":"Potato noodle","sku":"MK-ASIA-001","cat":"Asian grocery","unit":"pack","sup":"Triple Asian Grocery","qty":40,"par":50,"ro":15,"roq":30,"cost":2.5,"sell":3.82,"st":"ok"},
  {"id":28,"n":"Sesame oil","sku":"MK-SAUC-001","cat":"Sauces","unit":"L","sup":"Triple Asian Grocery","qty":4.5,"par":10,"ro":3,"roq":6,"cost":9.09,"sell":12.73,"st":"ok"},
  {"id":29,"n":"Chilli paste","sku":"MK-SAUC-002","cat":"Sauces","unit":"kg","sup":"5 Ways","qty":0.5,"par":5,"ro":2,"roq":5,"cost":8,"sell":14.55,"st":"critical"},
  {"id":30,"n":"BBQ sauce","sku":"MK-SAUC-003","cat":"Sauces","unit":"L","sup":"5 Ways","qty":3,"par":6,"ro":2,"roq":6,"cost":6,"sell":9.09,"st":"ok"},
  {"id":31,"n":"Ketchup","sku":"MK-SAUC-004","cat":"Sauces","unit":"L","sup":"5 Ways","qty":4,"par":6,"ro":2,"roq":6,"cost":4,"sell":6.36,"st":"ok"},
  {"id":32,"n":"Aioli","sku":"MK-SAUC-005","cat":"Sauces","unit":"L","sup":"5 Ways","qty":2,"par":5,"ro":1,"roq":5,"cost":7,"sell":10.45,"st":"low"},
  {"id":33,"n":"Sweet chilli mayo","sku":"MK-SAUC-006","cat":"Sauces","unit":"L","sup":"5 Ways","qty":2,"par":5,"ro":1,"roq":5,"cost":7.5,"sell":11.36,"st":"low"},
  {"id":34,"n":"Hot mayo","sku":"MK-SAUC-007","cat":"Sauces","unit":"L","sup":"5 Ways","qty":3,"par":5,"ro":1,"roq":5,"cost":7.5,"sell":11.36,"st":"ok"},
  {"id":35,"n":"Sriracha mayo","sku":"MK-SAUC-008","cat":"Sauces","unit":"L","sup":"5 Ways","qty":2,"par":5,"ro":1,"roq":5,"cost":7.5,"sell":11.36,"st":"low"},
  {"id":36,"n":"Paper bag small","sku":"MK-PACK-001","cat":"Packaging","unit":"carton","sup":"Packaging Supplier","qty":0.5,"par":2,"ro":1,"roq":2,"cost":15,"sell":0,"st":"critical"},
  {"id":37,"n":"Coffee cup 6oz","sku":"MK-PACK-002","cat":"Packaging","unit":"pack","sup":"Packaging Supplier","qty":12,"par":20,"ro":6,"roq":10,"cost":6,"sell":0,"st":"ok"},
  {"id":38,"n":"Prawn 26/30","sku":"MK-SEAF-001","cat":"Seafood","unit":"pack","sup":"United Food Express","qty":20,"par":25,"ro":8,"roq":12,"cost":18,"sell":27.27,"st":"ok"},
  {"id":39,"n":"Squid ring","sku":"MK-SEAF-002","cat":"Seafood","unit":"pack","sup":"United Food Express","qty":5,"par":10,"ro":3,"roq":6,"cost":12,"sell":18.18,"st":"low"}
];

const PROTO_MENU = [
  {"id":101,"n":"Mad Lot","cat":"Burgers","sell":17,"cost":5.2,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":102,"n":"Humpty Dumpty","cat":"Burgers","sell":18,"cost":5.5,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":103,"n":"Mad Moo","cat":"Burgers","sell":18,"cost":5.3,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":104,"n":"Mad Benji","cat":"Burgers","sell":15,"cost":4.8,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":105,"n":"Hot and Mad","cat":"Burgers","sell":19,"cost":5.9,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":106,"n":"King Solomon","cat":"Burgers","sell":19,"cost":6.2,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":107,"n":"Double Madness","cat":"Burgers","sell":22,"cost":7.5,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":108,"n":"Mad Scheme","cat":"Burgers","sell":18,"cost":5.6,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":109,"n":"Sea Sick Steph","cat":"Burgers","sell":20,"cost":6.8,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":110,"n":"Slow Pork","cat":"Burgers","sell":20,"cost":6.5,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":111,"n":"Mad Cluck","cat":"Chicken","sell":17,"cost":4.9,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":112,"n":"Panko Tango","cat":"Chicken","sell":17,"cost":5.2,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":113,"n":"Alley Dancer","cat":"Chicken","sell":18,"cost":5.5,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":114,"n":"Mad Pretender","cat":"Vegan","sell":19,"cost":6.5,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":115,"n":"Dream Weaver","cat":"Vegan","sell":19,"cost":6.2,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":116,"n":"Pretty Mad","cat":"Vegetarian","sell":17,"cost":5,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":117,"n":"Spud Light Year","cat":"Vegetarian","sell":17,"cost":4.8,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":118,"n":"Desert Blossom","cat":"Vegetarian","sell":17,"cost":5.2,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":119,"n":"Beef fat chips","cat":"Sides","sell":9,"cost":1.8,"v":["Mad Benji"],"av":true,"e86":false},
  {"id":120,"n":"Flat white","cat":"Coffee","sell":5,"cost":0.65,"v":["Mad Benji","Hey Sister"],"av":true,"e86":false},
  {"id":121,"n":"Cappuccino","cat":"Coffee","sell":5,"cost":0.65,"v":["Mad Benji","Hey Sister"],"av":true,"e86":false}
];

const PROTO_RECIPES = [
  {"id":1,"mid":104,"ings":[{"iid":1,"qty":0.2},{"iid":24,"qty":1},{"iid":10,"qty":0.03},{"iid":30,"qty":0.02}]},
  {"id":2,"mid":105,"ings":[{"iid":1,"qty":0.2},{"iid":24,"qty":1},{"iid":34,"qty":0.025},{"iid":16,"qty":0.02},{"iid":17,"qty":0.015},{"iid":15,"qty":0.03}]},
  {"id":3,"mid":102,"ings":[{"iid":1,"qty":0.2},{"iid":24,"qty":1},{"iid":31,"qty":0.02},{"iid":16,"qty":0.02},{"iid":17,"qty":0.015}]},
  {"id":4,"mid":111,"ings":[{"iid":2,"qty":0.18},{"iid":24,"qty":1},{"iid":13,"qty":0.5},{"iid":10,"qty":0.03},{"iid":32,"qty":0.025}]},
  {"id":5,"mid":112,"ings":[{"iid":2,"qty":0.18},{"iid":24,"qty":1},{"iid":33,"qty":0.025},{"iid":16,"qty":0.02},{"iid":15,"qty":0.03}]},
  {"id":6,"mid":109,"ings":[{"iid":6,"qty":0.18},{"iid":24,"qty":1},{"iid":32,"qty":0.025},{"iid":11,"qty":0.04},{"iid":12,"qty":0.02}]},
  {"id":7,"mid":118,"ings":[{"iid":14,"qty":0.15},{"iid":24,"qty":1},{"iid":32,"qty":0.025},{"iid":10,"qty":0.03}]},
  {"id":8,"mid":119,"ings":[{"iid":21,"qty":0.02},{"iid":30,"qty":0.03}]}
];

(async () => {
  console.log(`Seeding stock module → db=${DATABASE_ID} group=${GROUP_ID}`);

  // venues drive venueIds resolution + per-venue stock fan-out
  const venuesSnap = await groupRef.collection("venues").get();
  if (venuesSnap.empty) throw new Error("No venues under this group — provision the group first.");
  const venues = venuesSnap.docs.map((d) => ({ id: d.id, name: d.get("name") || d.id }));
  const allVenueIds = venues.map((v) => v.id);
  // live names drift from the prototype ("Mad Hotpot" vs "Mad Hot Pot",
  // "Central Kitchen" vs "Main Kitchen") — match ignoring case/spacing
  const normName = (n) => String(n || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const venueIdByName = Object.fromEntries(venues.map((v) => [normName(v.name), v.id]));
  const lookupVenue = (n) => venueIdByName[normName(n)];
  const resolveVenues = (spec) => spec === "all" ? allVenueIds : spec.map(lookupVenue).filter(Boolean);
  console.log("• venues:", allVenueIds.join(", "));

  // group-doc reference lists (G13) — only seeded when absent so later edits survive re-runs
  const groupSnap = await groupRef.get();
  const listDefaults = {
    stockCategories: ["Protein", "Frozen", "Produce", "Dairy", "Dry goods", "Asian grocery", "Sauces", "Packaging", "Seafood"],
    menuCategories: ["Burgers", "Chicken", "Vegan", "Vegetarian", "Sides", "Coffee", "Drinks"],
    stockUnits: ["kg", "g", "L", "ml", "units", "pack", "box", "carton", "bunch", "can"],
    storageLocations: ["Fridge A", "Fridge B", "Freezer", "Dry store", "Bar fridge"],
  };
  const listPatch = {};
  for (const [k, v] of Object.entries(listDefaults)) if (!Array.isArray(groupSnap.get(k))) listPatch[k] = v;
  if (Object.keys(listPatch).length) { await groupRef.set(listPatch, { merge: true }); console.log("• group lists seeded:", Object.keys(listPatch).join(", ")); }

  // suppliers
  for (const s of SUPPLIERS) {
    await groupRef.collection("suppliers").doc(s.id).set({
      company: s.company, contactName: s.contactName, phone: s.phone, email: s.email,
      leadTime: s.leadTime, terms: "", venueIds: resolveVenues(s.venues), archived: false,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`• suppliers: ${SUPPLIERS.length}`);

  // inventory items (group-level definitions, EX-GST)
  for (const i of PROTO_INV) {
    await groupRef.collection("inventoryItems").doc(invId(i.id)).set({
      name: i.n, sku: i.sku, category: i.cat, unit: i.unit,
      supplierId: SUPPLIER_ID_BY_NAME[i.sup] || null,
      cost: i.cost, sell: i.sell, gstApplicable: true,
      storageLocation: "", archived: false,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`• inventoryItems: ${PROTO_INV.length}`);

  // per-venue stock (CREATE-only: live quantities are never clobbered by a re-run)
  let stockCreated = 0, stockKept = 0;
  for (const v of venues) {
    for (const i of PROTO_INV) {
      const ref = groupRef.collection("venues").doc(v.id).collection("stock").doc(invId(i.id));
      const existing = await ref.get();
      if (existing.exists) { stockKept++; continue; }
      await ref.set({
        qtyOnHand: i.qty, par: i.par, reorderPoint: i.ro, reorderQty: i.roq,
        status: computeStockStatus(i.qty, i.ro, i.par),
        lastCountedAt: null, updatedAt: FieldValue.serverTimestamp(),
      });
      stockCreated++;
    }
  }
  console.log(`• stock docs: ${stockCreated} created, ${stockKept} already existed`);

  // recipes (id rec-{menuProtoId}; ingredient refs remapped to inv-### ids)
  const recipeIdByMenuProtoId = {};
  for (const r of PROTO_RECIPES) {
    const id = `rec-${r.mid}`;
    recipeIdByMenuProtoId[r.mid] = id;
    await groupRef.collection("recipes").doc(id).set({
      menuItemId: menuId(r.mid),
      ingredients: r.ings.map((g) => ({ itemId: invId(g.iid), qty: g.qty })),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`• recipes: ${PROTO_RECIPES.length}`);

  // menu items (sellPrice converted inc→EX-GST once, here)
  for (const m of PROTO_MENU) {
    await groupRef.collection("menuItems").doc(menuId(m.id)).set({
      displayName: m.n, kitchenName: "", category: m.cat,
      sellPrice: exGst(m.sell), cost: m.cost, gstApplicable: true,
      venueIds: m.v.map(lookupVenue).filter(Boolean),
      available: m.av, e86: m.e86,
      posId: `MB-${pad3(m.id % 100)}`,
      modifierGroupIds: [], recipeId: recipeIdByMenuProtoId[m.id] || null,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  console.log(`• menuItems: ${PROTO_MENU.length}`);

  // modifier groups
  for (const g of MODIFIER_GROUPS) {
    const { id, ...data } = g;
    await groupRef.collection("modifierGroups").doc(id).set({ ...data, attachedMenuItemIds: [], createdAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log(`• modifierGroups: ${MODIFIER_GROUPS.length}`);

  console.log("\n✅ Stock module seeded.");
  process.exit(0);
})().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
