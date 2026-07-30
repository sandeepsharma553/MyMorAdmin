/* ============================================================
   Stock / Menus / Supplier — shared business rules.
   Single source of truth for the status rule, the GST base and
   margin math. The rgSellOrder Cloud Function repeats the status
   rule server-side — if you change it here, change it there too.
   ============================================================ */

// All prices are stored EX-GST (signed off Q5). Inc-GST is display-only.
export const GST_RATE = 0.1;
export const incGst = (ex, gstApplicable = true) => (gstApplicable ? (Number(ex) || 0) * (1 + GST_RATE) : Number(ex) || 0);
export const exGst = (inc, gstApplicable = true) => (gstApplicable ? (Number(inc) || 0) / (1 + GST_RATE) : Number(inc) || 0);

// Canonical status rule (handoff §5, from the prototype's sell()/saveInv()):
//   qty <= 0            → critical
//   qty <= reorderPoint → critical
//   qty <= par * 0.5    → low
//   else                → ok
export const computeStockStatus = (qtyOnHand, reorderPoint, par) => {
  const q = Number(qtyOnHand) || 0;
  if (q <= 0) return "critical";
  if (q <= (Number(reorderPoint) || 0)) return "critical";
  if (q <= (Number(par) || 0) * 0.5) return "low";
  return "ok";
};

export const STOCK_STATUS_META = {
  critical: { label: "Low", color: "#dc2626", bg: "#fef2f2" },
  low: { label: "Med", color: "#d97706", bg: "#fffbeb" },
  ok: { label: "Good", color: "#16a34a", bg: "#f0fdf4" },
};
export const stockStatusMeta = (st) => STOCK_STATUS_META[st] || STOCK_STATUS_META.ok;

// Margin % on ONE base (ex-GST both sides) — never mix inc revenue with ex cost.
export const marginPct = (sellEx, costEx) => {
  const s = Number(sellEx) || 0;
  return s > 0 ? Math.round(((s - (Number(costEx) || 0)) / s) * 100) : 0;
};
export const marginColor = (m) => (m >= 60 ? "#16a34a" : m >= 35 ? "#d97706" : "#dc2626");

// % of par for the stock bar, capped at 100.
export const pctOfPar = (qty, par) => {
  const p = Number(par) || 0;
  return p > 0 ? Math.min(100, Math.round(((Number(qty) || 0) / p) * 100)) : 100;
};

// Phase 1 — convert a recipe-unit qty to GROSS stock units, applying unit
// conversion and yield. Keep this formula in sync with rgSellOrder in
// functions/index.js. Fallbacks (netQty→qty, factor→1, yield→100) make it a
// no-op on un-migrated data, so it equals the old `qty` exactly with identity.
export const grossStockQty = (ing, item) => {
  const recipeUnitQty = Number(ing?.netQty != null ? ing.netQty : ing?.qty) || 0;
  const stockToRecipe = Number(item?.stockToRecipe) > 0 ? Number(item.stockToRecipe) : 1; // stock units → recipe units
  const yieldPct = Number(item?.yieldPercent) > 0 ? Number(item.yieldPercent) : 100;
  return (recipeUnitQty / stockToRecipe) / (yieldPct / 100); // recipe qty → stock qty → gross (pre-yield-loss)
};

// Phase 2 (per-venue cost) — resolve the cost-per-stock-unit for an item at a
// venue: the venue's own weighted-average (stock.cost) if present, else the
// group last-known/reference (inventoryItems.cost). Keep in sync with rgSellOrder.
export const venueCost = (item, stockDoc) => {
  const v = Number(stockDoc?.cost);
  if (stockDoc && stockDoc.cost != null && !isNaN(v)) return v;
  return Number(item?.cost) || 0;
};

// Option A (per-venue price) — the venue's override (menuItem.venuePrices[venueId])
// if present & numeric, else the group-level sellPrice. Mirrors venueCost's
// fallback shape. Keep in sync with the inline copy in rgSellOrder (functions/index.js).
export const venueSellPrice = (menuItem, venueId) => {
  const vp = menuItem?.venuePrices?.[venueId];
  const v = Number(vp);
  if (vp != null && !isNaN(v)) return v;
  return Number(menuItem?.sellPrice) || 0;
};

/* ── Template + per-venue INSTANCE model ────────────────────────────────
 * Template = group menuItems/{id} (definition). Instance = venues/{v}/menuItems/{id}
 * (same doc id). linked:true inherits the template (only explicitly-set override
 * fields win); linked:false ("separate") carries its own values.                */

// Drop undefined/null entries so an instance never clobbers template fields it
// doesn't explicitly set (Firestore never stores undefined; null = "inherit").
export const stripUndefined = (obj) => {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) out[k] = v; });
  return out;
};

// Fields a LINKED instance may override; everything else inherits the template.
export const INSTANCE_OVERRIDE_FIELDS = ["sellPrice", "variants", "hasVariants", "variantGroupName", "modifierGroupIds", "recipeId"];
// Instance-only state — always read from the instance when present (both modes).
// categoryId/position (Job 3/4): the venue's category doc ref + POS tile order —
// per-venue by nature, so they live here and flow onto the resolved item.
export const INSTANCE_STATE_FIELDS = ["linked", "available", "e86", "e86Reason", "e86By", "e86At", "e86Back", "recipeSourceId", "categoryId", "position", "stationId", "prepMinutes"];

// Resolve a menu item AT a venue: template is the base; a linked instance inherits
// it, a separate instance's non-null values win wholesale (template fills gaps —
// defensive against partial clones). Returns null when NO instance exists at this
// venue (item not sold here). Keep in sync with the server copy in rgSellOrder
// (functions/index.js — rgResolveAtVenue).
export const resolveMenuItemAtVenue = (template, instance) => {
  if (!template || !instance) return null;
  let r;
  if (instance.linked === false) {
    r = { ...template, ...stripUndefined(instance), _mode: "separate" };
  } else {
    r = { ...template, _mode: "linked" };
    INSTANCE_OVERRIDE_FIELDS.forEach((k) => { if (instance[k] !== undefined && instance[k] !== null) r[k] = instance[k]; });
    INSTANCE_STATE_FIELDS.forEach((k) => { if (instance[k] !== undefined) r[k] = instance[k]; });
  }
  r.id = template.id; r.templateId = template.id;
  // per-venue modifier overrides: attachment list + option price deltas
  if (instance.modifierOverrides && Array.isArray(instance.modifierOverrides.modifierGroupIds)) {
    r.modifierGroupIds = instance.modifierOverrides.modifierGroupIds;
  }
  r._optionPrices = (instance.modifierOverrides && instance.modifierOverrides.optionPrices) || null;
  return r;
};

// The ONE client-side sell-price resolver. Job 5 — THE VENUE IS THE TRUTH: at a
// venue the INSTANCE's own price is the only price (seeded from the template on
// add, backfilled once); the template is never read again at sale time and the
// legacy template.venuePrices map is dead data. A missing instance price reads
// $0 — rgSellOrder REFUSES such a line rather than charging $0 silently.
// "all" is a template-display context only → raw template price.
// Keep IDENTICAL to the Ops copy and in sync with rgSellOrder's resolution.
export const resolvedSellPrice = (m, { menuInstanceById, menuItems, selectedVenue }) => {
  if (selectedVenue === "all") return Number(m?.sellPrice) || 0;
  const inst = menuInstanceById?.[m?.templateId || m?.id];
  return inst && inst.sellPrice != null && !isNaN(Number(inst.sellPrice)) ? Number(inst.sellPrice) : 0;
};

// Job 5: does this item HAVE a price at this venue? Missing (null) is NOT $0 —
// zero is a legal deliberate price (open items); only an ABSENT instance price
// renders "No price", cannot be added to an order, and is REFUSED by rgSellOrder
// with the same meaning. Keep IDENTICAL in Admin + Ops.
export const hasVenuePrice = (m, { menuInstanceById, selectedVenue }) => {
  if (selectedVenue === "all") return m?.sellPrice != null && !isNaN(Number(m.sellPrice));
  const inst = menuInstanceById?.[m?.templateId || m?.id];
  return !!inst && inst.sellPrice != null && !isNaN(Number(inst.sellPrice));
};

// Food cost of a recipe at current ingredient costs (ex-GST). cost is per stock
// unit; line cost = gross stock used × cost. recipe.ingredients = [{ itemId, qty,
// netQty?, recipeUnit? }]; itemsById = { [itemId]: inventoryItem }.
// Optional stockByItem = { [itemId]: venueStockDoc } makes costing VENUE-AWARE:
// each ingredient is costed at venueCost(item, stockByItem[itemId]); without it,
// falls back to the item's group cost (unchanged behaviour).
export const recipeFoodCost = (recipe, itemsById, stockByItem) =>
  (recipe?.ingredients || []).reduce((sum, ing) => {
    const item = itemsById?.[ing.itemId];
    if (!item) return sum;
    const unitCost = stockByItem ? venueCost(item, stockByItem[ing.itemId]) : (Number(item.cost) || 0);
    return sum + grossStockQty(ing, item) * unitCost;
  }, 0);

// A menu item's authoritative food cost: recipe-computed when a recipe exists,
// the stored fallback `cost` otherwise (signed-off discrepancy ruling).
export const menuItemFoodCost = (menuItem, recipesByMenuItemId, itemsById, stockByItem) => {
  const r = recipesByMenuItemId?.[menuItem?.id];
  if (r && (r.ingredients || []).length) return recipeFoodCost(r, itemsById, stockByItem);
  return Number(menuItem?.cost) || 0;
};

export const money = (n) =>
  "$" + (Number(n) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Movement types (stockMovements.type). reason is MANDATORY for manualAdj + wastage.
export const MOVEMENT_TYPES = [
  { key: "posSale", label: "POS sale" },
  { key: "delivery", label: "Delivery" },
  { key: "manualAdj", label: "Manual adjustment" },
  { key: "wastage", label: "Wastage" },
  { key: "transferIn", label: "Transfer in" },
  { key: "transferOut", label: "Transfer out" },
  { key: "stocktake", label: "Stocktake" },
  { key: "production", label: "Production" },
];

// Cycle-safe check: does prepped item `targetId` get consumed (directly or
// transitively) by `recipeId`'s production tree? prodRecipeByItem maps a prepped
// itemId -> its production recipe { ingredients:[{itemId}] }. Returns true if a cycle.
export const productionHasCycle = (targetId, ingredients, prodRecipeByItem, seen = new Set()) => {
  for (const ing of ingredients || []) {
    if (!ing?.itemId) continue;
    if (ing.itemId === targetId) return true;
    if (seen.has(ing.itemId)) continue;
    seen.add(ing.itemId);
    const sub = prodRecipeByItem?.[ing.itemId];
    if (sub && productionHasCycle(targetId, sub.ingredients, prodRecipeByItem, seen)) return true;
  }
  return false;
};
export const movementTypeLabel = (key) => MOVEMENT_TYPES.find((t) => t.key === key)?.label || key;
export const REASON_REQUIRED_TYPES = ["manualAdj", "wastage"];

export const PO_STATUSES = ["draft", "pending", "confirmed", "inTransit", "received", "completed"];
export const PO_STATUS_META = {
  draft: { label: "Draft", color: "#6b7280", bg: "#f4f4f5" },
  pending: { label: "Pending", color: "#d97706", bg: "#fffbeb" },
  confirmed: { label: "Confirmed", color: "#16a34a", bg: "#f0fdf4" },
  inTransit: { label: "In transit", color: "#2563eb", bg: "#eff6ff" },
  received: { label: "Received", color: "#16a34a", bg: "#f0fdf4" },
  completed: { label: "Completed", color: "#6b7280", bg: "#f4f4f5" },
};
export const poStatusMeta = (st) => PO_STATUS_META[st] || PO_STATUS_META.draft;

// Seed defaults — editable on the group doc (G13 category management).
export const DEFAULT_STOCK_CATEGORIES = [
  "Protein", "Frozen", "Produce", "Dairy", "Dry goods", "Asian grocery", "Sauces", "Packaging", "Seafood",
];
export const DEFAULT_MENU_CATEGORIES = ["Burgers", "Chicken", "Vegan", "Vegetarian", "Sides", "Coffee", "Drinks"];
export const DEFAULT_STOCK_UNITS = ["kg", "g", "L", "ml", "units", "pack", "box", "carton", "bunch", "can"];
export const DEFAULT_STORAGE_LOCATIONS = ["Fridge A", "Fridge B", "Freezer", "Dry store", "Bar fridge"];

export const stockCategoryColor = (cat) => ({
  Protein: "#C8392A", Produce: "#2D6A3F", Dairy: "#1A55A0", "Dry goods": "#B86A10",
  Sauces: "#B86A10", Frozen: "#6B3FA0", Seafood: "#1A55A0", "Asian grocery": "#B86A10", Packaging: "#8C867E",
}[cat] || "#8C867E");

// ── Menu categories (Job 3 — per-venue category docs) ────────────────────────
// Category names hold NO emoji (doc rule); free text still typed on legacy
// item.category may carry them, so both the manager UI and the backfill script
// strip through the SAME rule (script keeps a Node copy — keep in sync).
export const stripEmoji = (s) =>
  String(s || "").replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s+/g, " ").trim();
// slug for a category DOC ID — set once at creation, never changed by rename.
export const categorySlug = (name) =>
  stripEmoji(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "category";
// default colour cycle for new/backfilled categories (position-indexed).
export const CATEGORY_COLOURS = [
  "#D85A30", "#2563eb", "#16a34a", "#d97706", "#9333ea",
  "#0e7490", "#dc2626", "#4338ca", "#ca8a04", "#059669",
];

// ── POS kitchen-note presets ── group.posNotePresets = string[] (owner-editable in
// Settings, whole-array writes — mirrors the leaveTypes/empTypes pattern exactly).
// Resolver falls back to the seed list when the group has none configured. Presets
// are tap-to-add shortcuts only: the POS composes them (plus free text) into ONE
// string sent as the line's `notes` — the server (rgSellOrder) trims and caps at 200.
export const DEFAULT_POS_NOTE_PRESETS = ["No cutlery", "Extra napkins", "Allergy — check", "Well done", "Cut in half", "Rush"];
export const resolvePosNotePresets = (group) => (group?.posNotePresets?.length ? group.posNotePresets : DEFAULT_POS_NOTE_PRESETS);

// ── Default prep time (Job 6 — kitchen display groundwork) ── group-level
// default, minutes. Same pattern as posNotePresets: a field on the group doc,
// whole-value writes from Settings, resolver seeds the default. An instance's
// prepMinutes overrides it per item; null/absent = use this venue-wide default.
export const DEFAULT_PREP_MINUTES = 10;
export const resolvePrepMinutes = (group) =>
  (Number(group?.defaultPrepMinutes) > 0 ? Number(group.defaultPrepMinutes) : DEFAULT_PREP_MINUTES);

// ── modifier-group KIND ── semantic category of a modifier group. The imported
// MobiPOS data carries no kind field — the name prefix is the only signal
// (audited 14 Jul 2026: "No …" = free removals, "Add On …" = paid extras,
// "Instead …" = free substitutions, "MOD …" = preparation of an included
// component, "OPT …" = mandatory serving choice). modGroupKind prefers an
// explicit group.kind and DERIVES from the prefix otherwise, so readers work
// with or without the seed migration — no migration dependency.
export const MOD_KINDS = ["add", "remove", "swap", "prep", "choose"];
export const modGroupKind = (g) => {
  if (g && MOD_KINDS.includes(g.kind)) return g.kind;
  const s = String(g?.name || "").trim();
  if (/^no\b/i.test(s)) return "remove";        // "No Mad Benji", "No A"…
  if (/^add\s*on\b/i.test(s)) return "add";     // "Add On Burger"…
  if (/^instead\b/i.test(s)) return "swap";     // "Instead Meat"…
  if (/^mod\b/i.test(s)) return "prep";         // "MOD Coffee"…
  if (/^opt\b/i.test(s)) return "choose";       // "OPT Egg Types"…
  if (/^cooking\b/i.test(s)) return "prep";     // "Cooking Instructions" behaves like MOD
  return "add"; // unmatched (e.g. "Dietary(B)") — safest default: optional + visibly priced
};
// Behaviour DEFAULTS each kind implies — for the group-template feature later.
// DEFINITIONS ONLY: nothing applies these yet; existing groups keep their own
// stored type/required/priceDelta untouched.
export const MOD_KIND_DEFAULTS = {
  add:    { type: "multi",  required: false, pricing: "priced" },
  remove: { type: "multi",  required: false, pricing: "free" },
  swap:   { type: "multi",  required: false, pricing: "free" },
  prep:   { type: "multi",  required: false, pricing: "free-or-small" },
  choose: { type: "single", required: true,  pricing: "free" },
};

// ── POS position ordering (Job 4 — replaced pinnedFirst / the retired pin lists
// group.posCategoryOrder + group.posItemOrder, which are now legacy data nothing
// reads). Byte-identical twin in Ops lib/rgStockUtils.js — keep in sync.
// Anything WITHOUT a position must NOT vanish: it follows the positioned run,
// alphabetical. Pure + total — no crash, no hole.
export const byPosition = (arr, posOf, nameOf) => {
  const withPos = [], without = [];
  (arr || []).forEach((x) => (Number.isFinite(Number(posOf(x))) && posOf(x) !== null && posOf(x) !== "" ? withPos : without).push(x));
  withPos.sort((a, b) => Number(posOf(a)) - Number(posOf(b)));
  without.sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
  return [...withPos, ...without];
};
// Which category KEY an item belongs to at a venue: the instance's categoryId
// when it points at a real doc; else a name match on the emoji-stripped legacy
// text; else a synthetic "text:<raw>" key so the item still gets a tile.
export const posCatKeyOf = (m, venueCats) => {
  if (m?.categoryId && (venueCats || []).some((c) => c.id === m.categoryId)) return m.categoryId;
  const raw = m?.category || "Uncategorised";
  const byName = (venueCats || []).find((c) => c.name === stripEmoji(raw));
  return byName ? byName.id : `text:${raw}`;
};
// SCREEN-A category tiles: active category docs in position order (empty ones
// hidden, deactivated ones hidden — their items stay reachable via search-all),
// then synthetic tiles for docless categories, alphabetical, so no item is
// unreachable. Returns [{ key, name, colour, count }].
export const posCategoryTiles = (venueCats, items) => {
  const counts = {};
  (items || []).forEach((m) => { const k = posCatKeyOf(m, venueCats); counts[k] = (counts[k] || 0) + 1; });
  const docTiles = byPosition((venueCats || []).filter((c) => c.active !== false), (c) => c.position, (c) => c.name)
    .filter((c) => counts[c.id])
    .map((c) => ({ key: c.id, name: c.name, colour: c.colour || null, count: counts[c.id] }));
  const strays = Object.keys(counts).filter((k) => k.startsWith("text:"))
    .map((k) => ({ key: k, name: stripEmoji(k.slice(5)) || k.slice(5), colour: null, count: counts[k] }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return [...docTiles, ...strays];
};
