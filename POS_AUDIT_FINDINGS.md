# POS_AUDIT_FINDINGS.md
**Read-only audit — 6 Jul 2026.** Repos: MyMorAdmin (React 19 web), MyMorOps (React Native), MyMorFunction (Cloud Functions v2, `index.js` at repo ROOT — `functions/index.js` does not exist).
**Discipline:** every claim below is tagged VERIFIED-IN-CODE (file read line-by-line) or UNKNOWN. Code-present ≠ works-live; live behaviour items are tagged NEEDS LIVE CLICK-TEST with steps.

---

## SECTION 1 — MENU ITEM SCHEMA (MyMorAdmin)

### 1.1 Save payload — `src/pages/restaurantgroup/MenusPage.js`
VERIFIED-IN-CODE. The exact `data` object written on save (lines 155–165), then written at 167–168:

```js
// MenusPage.js:155-165
const data = {
  displayName: editor.displayName.trim(), kitchenName: editor.kitchenName || "", category: editor.category,
  sellPrice, cost: Number(editor.cost) || 0, gstApplicable: !!editor.gstApplicable,
  venueIds: editor.venueIds, posId: editor.posId || "", modifierGroupIds: editor.modifierGroupIds,
  available: !!editor.available,
  // New, all optional/back-compatible (default-off): existing items save unchanged in behaviour.
  takeawayPrice,
  hasVariants, variantGroupName: hasVariants ? (editor.variantGroupName || "") : "", variants,
  isCombo, comboGroups,
  updatedAt: serverTimestamp(),
};
// MenusPage.js:167-168
if (editor.id) await setDoc(menuItemDoc(groupId, editor.id), data, { merge: true });
else await addDoc(menuItemsCol(groupId), { ...data, e86: false, recipeId: null, createdAt: serverTimestamp() });
```

Full field list written: `displayName, kitchenName, category, sellPrice, cost, gstApplicable, venueIds, posId, modifierGroupIds, available, takeawayPrice, hasVariants, variantGroupName, variants, isCombo, comboGroups, updatedAt` (+ on create only: `e86: false, recipeId: null, createdAt`).

Per-field confirmation:

| Field | Present? | Evidence |
|---|---|---|
| `sellPrice` | **YES** | line 157; derived at 134: `const sellPrice = hasVariants ? (Number(defaultVariant?.sellPrice) || 0) : (Number(editor.sellPrice) || 0);` — number, ex-GST; when variants on, tracks the default variant |
| `takeawayPrice` | **YES** | line 161; derived at 137: `editor.takeawayPrice === "" || editor.takeawayPrice == null ? null : Number(editor.takeawayPrice)` — **null = "same as dine-in"** (line 50–52 comment) |
| PER-VENUE price field | **NO — does not exist.** Grep: `grep -rni "venuePrices\|priceByVenue\|sellPriceByVenue\|pricePerVenue\|venuePrice" MyMorAdmin MyMorOps MyMorFunction --include=*.js --include=*.jsx --include=*.ts --include=*.tsx` (node_modules/build/backups excluded) → **exit 1, zero matches** across all three repos | Single group-level `sellPrice` only |
| `venueIds` | **YES** (array) | written line 158. Filter usages: MenusPage.js:43 `(m.venueIds \|\| []).includes(selectedVenue)`; StockPage.js:119 `(m.venueIds \|\| []).includes(movVenue)`; MyMorFunction/index.js:3208 `m.venueIds.includes(String(venueId))`; MyMorOps MenusScreen.js:60-64 (same vItems filter) |
| `available` | **YES** (boolean) | line 159 `available: !!editor.available`; also patched at 62–63 (86-list) and 78 (bulk) |
| `e86` | **YES** (boolean, create-default false) | line 168; set true/false via `quick86`/`remove86` (62–63) with `e86Reason, e86By, e86At, e86Back` side-fields |
| `hasVariants` | **YES** (boolean) | line 162; normalised at 114 |
| `variants` | **YES** (array) | lines 117–131: `[{ label, sellPrice:Number, takeawayPrice:Number\|null, posId, isDefault, available }]`, exactly one `isDefault` enforced (129–130) |
| `isCombo` | **YES** (boolean) | line 163; normalised 140 |
| `comboGroups` | **YES** (array) | lines 141–152: `[{ name, maxChoice:Number\|null, optional, options:[{ menuItemId, priceDelta:Number }] }]` |
| `modifierGroupIds` | **YES** (array of ids) | line 158 |
| `recipeId` | **YES** | `null` on create (168); set by saveRecipe at 202: `setDoc(menuItemDoc(groupId, recEditor.menuItemId), { recipeId, updatedAt: serverTimestamp() }, { merge: true })` |
| `posId` | **YES** (string) | line 158 |
| `kitchenName` | **YES** (string) | line 156 |
| `gstApplicable` | **YES** (boolean) | line 157 |
| `cost` | **YES** (number — "Fallback food cost ex-GST", used only when no recipe; UI hint line 558) | line 157 |

Permission gate: `const canEdit = can("menus", "edit");` (line 21); `saveItem` early-returns without it (line 109). Errors surface via toast `catch (e) { showToast(...) }` (line 171).

### 1.2 Paths — `src/utils/restaurantGroupPaths.js`
VERIFIED-IN-CODE (file read in full, 155 lines):

```js
// :87-92
export const inventoryItemsCol = (groupId) => groupCol(groupId, "inventoryItems");
export const inventoryItemDoc = (groupId, itemId) => doc(inventoryItemsCol(groupId), String(itemId));
export const menuItemsCol = (groupId) => groupCol(groupId, "menuItems"); // shared with POS Settings
export const menuItemDoc = (groupId, menuItemId) => doc(menuItemsCol(groupId), String(menuItemId));
export const recipesCol = (groupId) => groupCol(groupId, "recipes");
export const recipeDoc = (groupId, recipeId) => doc(recipesCol(groupId), String(recipeId));
// :100-102
export const stockCol = (groupId, venueId) => venueCol(groupId, venueId, "stock");
export const stockDoc = (groupId, venueId, itemId) => doc(stockCol(groupId, venueId), String(itemId));
export const stockMovementsCol = (groupId, venueId) => venueCol(groupId, venueId, "stockMovements");
```

- **menuItems: GROUP-LEVEL** — path takes only `groupId` → `restaurantGroups/{g}/menuItems` (no venueId). VERIFIED (line 89).
- **recipes: GROUP-LEVEL** (line 91). **inventoryItems: GROUP-LEVEL** (line 87). VERIFIED.
- **stock: PER-VENUE** — `restaurantGroups/{g}/venues/{v}/stock/{itemId}` via `venueCol` (lines 100–101, and comment 83–86: "stock QUANTITY/status is per-venue at /venues/{v}/stock/{itemId} (same doc id as the inventory item)"). VERIFIED.
- **Orders path: NO `ordersCol`/`orderDoc` exported.** Only `purchaseOrdersCol`/`purchaseOrderDoc` (lines 97–98). Grep proof: `grep -rni 'ordersCol\|orderDoc\|/orders/' MyMorAdmin --include=*.js…` → every hit is `purchaseOrdersCol`/`purchaseOrderDoc` (restaurantGroupPaths.js:97-98, RGContext.js:7,87, SupplierPage.js:7,44,65,103,136,173). No customer-orders path exists.

---

## SECTION 2 — rgSellOrder (MyMorFunction/index.js:3139–3357, read start-to-end)

VERIFIED-IN-CODE. Whole function read; nothing skipped.

**Input** (line 3140): `const { groupId, venueId, lines, reference } = request.data || {};`
`lines[]` shape: `{ menuItemId, qty }` — qty defaults to 1 when null (3147), must be `0 < qty ≤ 1000` (3148), max 50 lines (3145).

**Auth/permission (3141–3180), quoted:**
```js
if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");                    // 3141
const empSnap = await db.collection("employees").doc(request.auth.uid).get();                       // 3155
if (!emp || String(emp.groupId || emp.groupid || "") !== String(groupId)) {
  throw new HttpsError("permission-denied", "Not a member of this group.");                          // 3157-3159
}
const roleDefaults = { owner: "edit", storeAdmin: "edit", manager: "edit", staff: "none" };          // 3161-3163
// explicit-but-malformed permission value fails CLOSED (3164-3168)
if (stockPerm !== "view" && stockPerm !== "edit") throw new HttpsError("permission-denied", "No stock access."); // 3169-3171
// Fix 0.2 per-venue authorisation (3175-3179):
if (!isAdminTier && !empVenues.includes("all") && !empVenues.includes(String(venueId))) {
  throw new HttpsError("permission-denied", "Not authorized for this venue.");
}
```

**venueIds gate (3208–3211), quoted:**
```js
if (!Array.isArray(m.venueIds) || !m.venueIds.includes(String(venueId))) {
  skipped.push({ menuItemId: mid, reason: "menu item not sold at this venue" });
  continue;
}
```

**Full deduction flow:**
1. Outside the transaction (stable reference data): `db.getAll` menuItems (3188), then their `recipeId`s → recipes (3192–3195), expand `lines → moves[]` per ingredient with `recipeQty = netQty×lineQty` (3217–3223); no recipe → skipped with reason (3213–3215). Load inventoryItems (3228) and compute gross deduction `mv.deduct = (recipeQty / stockToRecipe) / (yieldPct/100)` (3235–3240).
2. **Transaction reads** (3243–3291): per-venue stock docs `venueRef.collection("stock").doc(id)` via `tx.getAll` (3244–3245); for items falling to/below reorderPoint, existing open draft POs `where status=="draft" && venueId && itemKey` read INSIDE the tx (3287–3291) so concurrent sales can't double-create.
3. **Transaction writes** (3293–3334): (a) each stock doc → `{ qtyOnHand: after, status: rgStockStatus(...), updatedAt }` merge (3296–3300); (b) one `stockMovements` doc per move, `type: "posSale"`, with before/after, `costAtMove` at the **selling venue's** `stock.cost` falling back to `item.cost` (3265, 3302); (c) reorder tail: if an open draft PO exists → arrayUnion provenance onto it (3312–3317, "one open draft per item+venue — never duplicate"); else if `reorderQty || par > 0` → create a new draft PO `{ status:"draft", autoDraft:true, itemKey, supplierId, venueId, lines, total, triggeredBy, … }` (3319–3333); `qty <= 0` → no $0 draft (3320).
4. Deduction clamps at zero: `after = Math.max(0, before - deduct)` (3259) and movement records `qtyChange: after - before` so the audit trail sums even when clamped (3268–3270).
5. Post-commit: low-stock notification to managers via `rgNotify(...).catch(() => {})` — "never fails the sale" (3349–3354).

**HttpsErrors thrown:** `unauthenticated` (3141); `invalid-argument` ×2 (3142–3145, 3148–3149); `permission-denied` ×3 (group member 3158, stock access 3170, venue 3178). No others inside the function.

**Return** (3356): `return { ok: true, deducted: result.deducted, skipped, lowStock, draftsCreated: result.draftsCreated };` (early return 3225 when no moves: `{ ok:true, deducted:[], skipped, lowStock:[], draftsCreated:0 }`). `deducted[]` items: `{ itemId, name, unit, after, status }` (3336–3340).

**Does rgSellOrder write an order document? VERIFIED NO.** Entire function read (3139–3357). The only `tx.set`/writes are: per-venue `stock` docs (3296), `stockMovements` docs (3302), `purchaaseOrders` draft create/update (3313, 3322) — plus post-commit `rgNotify`. There is **no** `collection("orders")` and no order persistence of any kind.

### Client wrapper — `MyMorAdmin/src/pages/restaurantgroup/sellOrder.js` (full file, 12 lines)
```js
import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

/* The ONE entry point for POS deductions (module #2 §6). The deduction runs
 * server-side in a Firestore transaction inside the rgSellOrder callable —
 * never reimplement it client-side. POS (#3) must import this same caller. */
export async function sellOrder({ groupId, venueId, lines, reference }) {
  const fns = getFunctions(getApp(), "us-central1");
  const call = httpsCallable(fns, "rgSellOrder");
  const res = await call({ groupId, venueId, lines, reference });
  return res.data; // { ok, deducted[], skipped[], lowStock[], draftsCreated }
}
```

**All callers** (`grep -rn "sellOrder\|rgSellOrder"` across the three repos, code hits only):
- MyMorAdmin **MenusPage.js:6** (import) and **:217** — `demoSell` "Demo sale" button (Recipe costing tab), 1 line qty 1, `reference: DEMO-…`.
- MyMorAdmin **StockPage.js:6** (import) and **:126** — same demo-sale pattern.
- MyMorFunction **index.js:3139** — the definition.
- **MyMorOps: ZERO callers** — its only hits are comments in `lib/rgStockUtils.js:4,49,61` and a test-file comment. Ops never invokes the sale.
- Everything else = comments/rules references (firestore.rules:102,183).

---

## SECTION 3 — DOES AN ORDER DOCUMENT EXIST ANYWHERE?

Commands run per repo (node_modules, build, backups excluded; *.js/jsx/ts/tsx):

1. `grep -rni 'collection("orders")' <repo>` → **MyMorAdmin: exit 1 (no matches). MyMorOps: exit 1. MyMorFunction: exit 1.**
2. `grep -rni 'ordersCol\|orderDoc\|/orders/' <repo>` → MyMorAdmin & MyMorOps: hits are ALL `purchaseOrdersCol`/`purchaseOrderDoc` (listed in §1.2 / SupplierScreen.js:8,50,72,118,151,189, restaurantGroupPaths.js:90-91, RGContext.js:26,118). MyMorFunction: exit 1.
3. `grep -rni '"orders"\|'orders'' <repo>` → MyMorOps: exit 1. MyMorFunction: exit 1. MyMorAdmin hits:
   - `scripts/diag/compare-groups.js:75,102` — read-only diagnostic counting `["orders","posSales","sales","posOrders"]`
   - `src/components/Sidebar.js:155,592`, `src/pages/business/RestaurantPage.js:83`, `BusinessEmployeePage.js:97` — nav labels/keys for the **legacy per-restaurant "business" module**
   - `src/pages/business/RestaurantOrdersPage.js:800` `restaurantCol(restaurantId, "orders")` (subscription/read), `:913` and `:974` `updateDoc(doc(restaurantCol(restaurantId,"orders"), id), {...})` — **status updates on EXISTING order docs** in the legacy consumer-app collection (`restaurants/{r}/orders`, populated by the separate MyMorApp end-user app, not in these three repos).
   - `grep -n "addDoc\|setDoc" RestaurantOrdersPage.js` → **exit 1, zero matches** — this page never CREATES an order.

**Final: VERIFIED NO order document is ever created/persisted anywhere in these three repos.** The restaurant-group platform (menus/stock/POS module) has no orders collection at all; the legacy business module only reads + `updateDoc`s pre-existing docs written by an out-of-scope app.

---

## SECTION 4 — ALL menuItems + sellPrice READERS/WRITERS (Option A blast radius)

### (a) menuItems readers/writers — every code touchpoint

**MyMorAdmin**
| File:line | What |
|---|---|
| utils/restaurantGroupPaths.js:89-90 | path builders (group-level) |
| pages/restaurantgroup/RGContext.js:83 | **the ONE live subscription**: `subColl(menuItemsCol(groupId), setMenuItems)` (subColl = onSnapshot wrapper); exposed via context value :241,248 |
| MenusPage.js:42-46 (read vItems), 56 (WRITE patchItem), 66,71 (read), 78 (WRITE bulk availability), 167-168 (WRITE save), 202 (WRITE recipeId), 251, 392, 669 (reads) | main writer/reader |
| StockPage.js:31,119-120 | read: recipe-linked items filtered by `venueIds` for demo sale |
| SupplierPage.js:18,27 | read: `menuById` for PO provenance display |
| StockExtraTabs.js:236,261 | read: margin-impact preview on cost change |

**MyMorOps**
| File:line | What |
|---|---|
| lib/restaurantGroupPaths.js:82 | path builder (same group-level path) |
| context/RGContext.js:114 | subscription `subColl(menuItemsCol(groupId), setMenuItems)`; exposed :288,296 |
| screens/MenusScreen.js:60-64 (read), 74 (WRITE patch), 84,89 (read), 96 (WRITE bulk), 268-270 (read), 405 (read), 434-435 (WRITE save — **note: Ops save `data` at :426-431 writes ONLY** `displayName, kitchenName, category, sellPrice, cost, gstApplicable, venueIds, posId, modifierGroupIds, available, updatedAt` — no takeawayPrice/variants/combos; merge:true so it won't delete Admin-written fields, but Ops' editor cannot see or edit them) |
| screens/SupplierScreen.js:23,32 | read: menuById for PO provenance |

**MyMorFunction**
| File:line | What |
|---|---|
| index.js:3188 | read: `db.getAll(...menuIds.map((id) => groupRef.collection("menuItems").doc(id)))` — uses `venueIds` (3208), `recipeId` (3212), `displayName` (3214, 3222). **Never reads sellPrice/takeawayPrice** — no revenue is recorded. |

### (b) sellPrice readers (per-venue price will need EVERY one of these taught to prefer the venue price)

`grep -rn "sellPrice" MyMorAdmin MyMorOps MyMorFunction` (full result reproduced in terminal output; classified here):

**MyMorAdmin — src (runtime):**
- MenusPage.js:49 margin calc `marginPct(m.sellPrice, foodCostOf(m))`; :52 takeaway fallback; :88,103,134,157 editor/save; :272-273 pricing KPI aggregates (avg sell, margin); :327 overview cell display (inc-GST + ex); :428-429,433 recipe-costing food-cost% + display; :511-512,516-517 pricing table margin/GP/display; :547-548 editor input + inc-GST preview; :593,613-614,631 variant rows; :721,724-725 recipe modal margin.
- StockExtraTabs.js:258 — cost-change margin impact `marginPct(m.sellPrice, oldFc/newFc)` ×2.
- scripts/importer/* (import-madbenji-menu.js:71,83,88; seed-stock-module.js:224,228; import-madbenji-combos.js:51,144) — one-off seeders (write sellPrice).

**MyMorOps — src:**
- MenusScreen.js:67 margin; :106,109 editor open/new; :140-141 pricing KPIs; :204-205 row display; :295-296,309 recipe tab; :376-377,382 pricing tab; :428 save; :442,463 input/preview; :544,581-582 recipe modal margin.

**MyMorFunction:** **zero sellPrice reads** (grep hits none in index.js).

**takeawayPrice readers:** `grep -rn "takeawayPrice"` → **MyMorAdmin only**: MenusPage.js:51-52 (effectiveTakeaway fallback), :91,94,106,122,137,161 (editor/save), :327 (display "TA …"), :552-553,593,615-616,631 (inputs); importers :71-72,95,170,172 and import-madbenji-combos.js:58. **MyMorOps: zero. MyMorFunction: zero.**

---

## SECTION 5 — EXISTING PER-VENUE OVERRIDE PATTERN (the convention to copy)

VERIFIED-IN-CODE — `MyMorAdmin/src/pages/restaurantgroup/rgStockUtils.js:57-64` (byte-equivalent copy at `MyMorOps/src/lib/rgStockUtils.js:62`):

```js
// Phase 2 (per-venue cost) — resolve the cost-per-stock-unit for an item at a
// venue: the venue's own weighted-average (stock.cost) if present, else the
// group last-known/reference (inventoryItems.cost). Keep in sync with rgSellOrder.
export const venueCost = (item, stockDoc) => {
  const v = Number(stockDoc?.cost);
  if (stockDoc && stockDoc.cost != null && !isNaN(v)) return v;
  return Number(item?.cost) || 0;
};
```

How it overrides: the per-venue doc (`venues/{v}/stock/{itemId}`, **same doc id** as the group-level `inventoryItems/{itemId}` — restaurantGroupPaths.js:83-86) carries an optional `cost`; if present & numeric → use it, else fall back to the group item's `cost`. The server mirrors it inline at MyMorFunction/index.js:3265: `const unitCost = (st.data.cost != null && !isNaN(Number(st.data.cost))) ? Number(st.data.cost) : (Number(item.cost) || 0);` (comment 3262-3264: "Keep in sync with rgStockUtils.venueCost"). Tested at MyMorOps/src/lib/rgStockUtils.test.js:125-128 (`venueCost({cost:10},{cost:7})→7`, `null→10`, `{}→10`).

Callers of the pattern: recipeFoodCost (rgStockUtils.js:76), MenusPage.js:700, StockExtraTabs.js:703,747, Ops MenusScreen.js:557.

**Any other per-venue override pattern?** Searched: per-venue price fields (grep §1.1, zero), and reviewed restaurantGroupPaths + rgStockUtils. `venueCost` is the **only** venue-overrides-group value pattern found. (The `venueIds` array on menuItems/staff is membership filtering, not a value override.) For per-venue PRICE, the matching convention would be: same-id per-venue doc (or field) → prefer venue value when present & numeric → fall back to group `sellPrice` — exactly `venueCost`'s shape.

---

## SECTION 6 — CONFIG DUPLICATION: WHICH COPY IS LIVE?

**The premise needs correcting: within MyMorAdmin there are NOT two copies.** VERIFIED:
```
ls MyMorAdmin/src/lib/rgConfig.js      → No such file or directory
ls MyMorAdmin/src/context/RGContext.js → No such file or directory
```
The duplication is **cross-repo** (Admin vs Ops), each live in its own app:

| Repo | Live rgConfig | Live RGContext | Proof (`grep -rn "from.*rgConfig" / "from.*RGContext"`) |
|---|---|---|---|
| MyMorAdmin | `src/pages/restaurantgroup/rgConfig.js` | `src/pages/restaurantgroup/RGContext.js` | every Admin import is `./rgConfig` / `./RGContext` from pages/restaurantgroup or `../pages/restaurantgroup/...` (e.g. RestaurantGroupLayout.js:7-8, RGContext.js:10, UserManagementPage.js:6 — full grep in terminal output). Zero imports of any lib/ or context/ copy (files don't exist). |
| MyMorOps | `src/lib/rgConfig.js` | `src/context/RGContext.js` | all Ops imports are `../lib/rgConfig` (TrainingScreen.js:13, RGContext.js:31, …) and `../context/RGContext` (all screens). `MyMorOps/src/pages` does not exist. |

**DEFAULT_PERMISSIONS — LIVE Admin copy, quoted in full** (`MyMorAdmin/src/pages/restaurantgroup/rgConfig.js:68-73`):
```js
export const DEFAULT_PERMISSIONS = {
  owner:      { staff: "edit", shifts: "edit", leave: "approve", availability: "approve", training: "edit", checklists: "edit", temperature: "edit", performance: "edit", messages: "edit", calendar: "view", usermgmt: "edit", settings: "edit", stock: "edit", menus: "edit", supplier: "edit", compliance: "edit", contracts: "edit" },
  storeAdmin: { staff: "edit", shifts: "edit", leave: "approve", availability: "approve", training: "edit", checklists: "edit", temperature: "edit", performance: "view", messages: "edit", calendar: "view", usermgmt: "edit", settings: "edit", stock: "edit", menus: "edit", supplier: "edit", compliance: "edit", contracts: "edit" },
  manager:    { staff: "view", shifts: "edit", leave: "edit", availability: "approve", training: "edit", checklists: "edit", temperature: "edit", performance: "view", messages: "edit", calendar: "view", usermgmt: "none", settings: "none", stock: "edit", menus: "edit", supplier: "view", compliance: "edit", contracts: "none" },
  staff:      { staff: "none", shifts: "view", leave: "view", availability: "view", training: "view", checklists: "edit", temperature: "edit", performance: "none", messages: "view", calendar: "view", usermgmt: "none", settings: "none", stock: "none", menus: "none", supplier: "none", compliance: "view", contracts: "none" },
};
```
**`pos` / `orders` / `loyalty` / `discounts` / `tables` permission keys: NO — none exist.** Grep `grep -n "pos\|orders\|loyalty\|discounts\|tables" <both rgConfig files>` → the only match is the substring "postcode" in an Ops address-field label (MyMorOps/src/lib/rgConfig.js:73) — a false positive. Module keys are exactly the 17 in RG_MODULES (Admin rgConfig.js:10-28), ending at `settings`.

**Known drift between the two live copies:** Ops DEFAULT_PERMISSIONS (lib/rgConfig.js:45-50) has **no `contracts` key** and owner `calendar: "edit"` (Admin has `"view"`); Admin includes `contracts` for all roles. Both copies otherwise match for stock/menus/supplier.

---

## SECTION 7 — MyMorOps: POS SCREEN?

**VERIFIED: NO POS terminal / order-entry / payment / live-orders screen exists in MyMorOps.**

Screen tree (`ls MyMorOps/src/screens/`): AppShell, AssignmentDetailScreen, AvailabilityScreen, CalendarScreen, ChecklistAssignmentDetailScreen, ChecklistsScreen, CompletionArchiveList, ComplianceScreen, LeaveRequestsScreen, LoginScreen, MenusScreen, MessagingScreen, PerformanceScreen, PlaceholderScreen, PrepListPanel, SettingsScreen, ShiftPlannerScreen, StaffCapabilityCard, StaffDirectoryScreen, StaffFormModal, StaffProfileScreen, StationDrillBar, StockScreen, SupplierScreen, TemperatureLogScreen, TrainingScreen, Turning18Alert, VenueManager — no POS/Order/Payment/Terminal screen file.

`grep -rni "POS\b|Terminal|Payment" MyMorOps/src` — every match classified, none is a POS:
- MenusScreen.js:195,236,251,288,317,338,458,478,536 — the `posId` field, "Show on POS" toggle, and copy text about POS deductions (menu MANAGEMENT screen, not order entry)
- StockScreen.js:275,351 — audit-trail copy / comment about POS deductions
- StaffFormModal.js:122,191 + StaffProfileScreen.js:136 — "POS PIN" staff field
- SupplierScreen.js:229,261 — auto-reorder provenance text ("Triggered by N POS sales") — this is **supplier purchase-order** UI, not customer orders
- lib/rgStockUtils.js:95 — movement-type label `posSale`
- `grep -rni '"orders"|'orders'' MyMorOps` → exit 1 (§3). No `sellOrder` caller in Ops (§2).

---

## FINAL SUMMARY TABLE

| Row | VERIFIED-IN-CODE | UNKNOWN / NEEDS LIVE CLICK-TEST |
|---|---|---|
| Menu model | **Group-level shared docs** — `restaurantGroups/{g}/menuItems` (restaurantGroupPaths.js:89), venue membership via `venueIds[]` filter | Live render of venue filtering: NEEDS LIVE CLICK-TEST — Menus page → switch venue selector top-right → item list should shrink to that venue's items |
| Per-venue price | **Does NOT exist.** Single group `sellPrice` (+ optional `takeawayPrice`, variant prices) — MenusPage.js:155-165; zero grep hits for venuePrices/priceByVenue/sellPriceByVenue across all 3 repos | — |
| Stock per-venue | **YES** — `venues/{v}/stock/{itemId}` (restaurantGroupPaths.js:100-101; server venueRef.collection("stock") index.js:3244) | — |
| Order document persisted anywhere | **NO** — greps in §3 all empty for creation; legacy RestaurantOrdersPage only reads/updateDocs pre-existing docs from an out-of-scope app | — |
| rgSellOrder writes an order? | **NO — stock deduction only.** Writes: stock docs, stockMovements, draft purchaseOrders (index.js:3296,3302,3313,3322). Read 3139–3357 in full; no orders write | Whether the deployed CF matches this source: UNKNOWN (deployed ≠ committed) — confirm via a live Demo sale (Menus → Recipe costing → "Demo sale") and check Firestore console: stock qty drops, stockMovements doc appears, NO orders collection appears |
| Existing per-venue override pattern | **YES — `venueCost(item, stockDoc)`**: `stock.cost` (venue) overrides `inventoryItems.cost` (group), rgStockUtils.js:60-64, mirrored server-side index.js:3265; the only such pattern found — copy this for per-venue price | — |
| Config live copy | Admin: `src/pages/restaurantgroup/rgConfig.js` + `RGContext.js` (the lib/ + context/ copies **do not exist in Admin**). Ops: `src/lib/rgConfig.js` + `src/context/RGContext.js`. Cross-repo duplication with drift (Ops lacks `contracts` key) | — |
| POS permission keys | **NO** — no pos/orders/loyalty/discounts/tables key in either live DEFAULT_PERMISSIONS; modules end at the 17 RG_MODULES keys | — |
| MyMorOps POS screen | **NO** — screen tree + POS grep all classified as menu-management labels, POS PIN field, supplier auto-reorder copy | — |

**Standing caveat:** everything above proves what the code SAYS, in the working copies on this machine, today. It does not prove any feature renders or behaves correctly against live data, and it does not prove the deployed Cloud Function matches this source. Where behaviour matters, run the click-tests listed.
