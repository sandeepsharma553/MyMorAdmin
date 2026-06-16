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

// Food cost of a recipe at current ingredient costs (ex-GST). cost is per stock
// unit; line cost = gross stock used × cost. recipe.ingredients = [{ itemId, qty,
// netQty?, recipeUnit? }]; itemsById = { [itemId]: inventoryItem }.
export const recipeFoodCost = (recipe, itemsById) =>
  (recipe?.ingredients || []).reduce((sum, ing) => {
    const item = itemsById?.[ing.itemId];
    return sum + (item ? grossStockQty(ing, item) * (Number(item.cost) || 0) : 0);
  }, 0);

// A menu item's authoritative food cost: recipe-computed when a recipe exists,
// the stored fallback `cost` otherwise (signed-off discrepancy ruling).
export const menuItemFoodCost = (menuItem, recipesByMenuItemId, itemsById) => {
  const r = recipesByMenuItemId?.[menuItem?.id];
  if (r && (r.ingredients || []).length) return recipeFoodCost(r, itemsById);
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
];
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
