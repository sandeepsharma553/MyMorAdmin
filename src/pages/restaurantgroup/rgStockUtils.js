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
export const INSTANCE_STATE_FIELDS = ["linked", "available", "e86", "e86Reason", "e86By", "e86At", "e86Back", "recipeSourceId"];

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

// The ONE client-side sell-price resolver (hoisted from the identical sellAt copies
// in MenusPage / PosPage / Ops MenusScreen). Mirrors the server priority in
// rgSellOrder: instance.sellPrice → legacy template.venuePrices[venueId] →
// template sellPrice. "all" has no venue context → raw template price.
export const resolvedSellPrice = (m, { menuInstanceById, menuItems, selectedVenue }) => {
  if (selectedVenue === "all") return Number(m?.sellPrice) || 0;
  const inst = menuInstanceById?.[m?.templateId || m?.id];
  if (inst && inst.sellPrice != null && !isNaN(Number(inst.sellPrice))) return Number(inst.sellPrice);
  const t = (menuItems || []).find((x) => x.id === (m?.templateId || m?.id)) || m;
  return venueSellPrice(t, selectedVenue);
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

// ── POS kitchen-note presets ── group.posNotePresets = string[] (owner-editable in
// Settings, whole-array writes — mirrors the leaveTypes/empTypes pattern exactly).
// Resolver falls back to the seed list when the group has none configured. Presets
// are tap-to-add shortcuts only: the POS composes them (plus free text) into ONE
// string sent as the line's `notes` — the server (rgSellOrder) trims and caps at 200.
export const DEFAULT_POS_NOTE_PRESETS = ["No cutlery", "Extra napkins", "Allergy — check", "Well done", "Cut in half", "Rush"];
export const resolvePosNotePresets = (group) => (group?.posNotePresets?.length ? group.posNotePresets : DEFAULT_POS_NOTE_PRESETS);

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

// ── POS pinned-first ordering ── group.posCategoryOrder = string[] (categories)
// and group.posItemOrder = { [category]: string[] } (item ids) — read-time only,
// the POS never writes them. Anything in `pinned` leads IN LIST ORDER; everything
// else follows alphabetically by nameOf. Pure + total: a missing/absent list means
// pure alphabetical (legacy behaviour), a stale entry (deleted item, renamed
// category) simply drops out — no crash, no hole — and duplicates are ignored.
export const pinnedFirst = (arr, pinned, idOf, nameOf) => {
  const list = [...new Set((Array.isArray(pinned) ? pinned : []).map(String))];
  const byId = new Map((arr || []).map((x) => [String(idOf(x)), x]));
  const head = list.map((id) => byId.get(id)).filter((x) => x !== undefined);
  const headSet = new Set(head);
  const tail = (arr || []).filter((x) => !headSet.has(x))
    .sort((a, b) => String(nameOf(a)).localeCompare(String(nameOf(b))));
  return [...head, ...tail];
};
