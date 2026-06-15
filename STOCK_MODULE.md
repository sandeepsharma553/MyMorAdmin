# Stock Management + Menus + Supplier Ordering (Module #2)

Schema + behaviour reference. **MyMorOps must mirror these shapes exactly** (direct-translation rule, CLAUDE.md). Built from the `mymor_stock_menu_5.html` prototype with the signed-off Q1–Q6 decisions (2026-06-12).

## Signed-off decisions

| Q | Decision |
|---|---|
| Q1 | Item definitions are **group-level** (`inventoryItems`); quantities are **per-venue** (`venues/{v}/stock/{itemId}`, same doc id as the item) |
| Q2 | `sell()` is the **`rgSellOrder` callable Cloud Function** (`/Users/mac/functions/index.js`, region `us-central1`, DB `mymor-australia`) using a server-side `runTransaction`. POS (#3) must call it via `src/pages/restaurantgroup/sellOrder.js` — never reimplement the deduction |
| Q3 | Reorder triggers create **persisted draft `purchaseOrders` docs** with `triggeredBy` provenance; one open draft per item+venue (deduped inside the transaction) |
| Q4 | Permission keys: **`stock`, `menus`, `supplier`** (`edit|view|none`, missing → `none`). Defaults: owner/storeAdmin all `edit`; manager `stock:edit, menus:edit, supplier:view`; staff all `none` |
| Q5 | **All prices stored ex-GST** + `gstApplicable` boolean; inc-GST computed at display (`rgStockUtils.incGst`). Margins are ex/ex — never mix bases |
| Q6 | Routes `/rg/stock`, `/rg/menus`, `/rg/supplier`, each `ProtectedRoute`-gated |

## Canonical business rules (`src/pages/restaurantgroup/rgStockUtils.js`)

Status rule (duplicated in the CF — keep in sync):
```
qtyOnHand <= 0            → critical
qtyOnHand <= reorderPoint → critical
qtyOnHand <= par * 0.5    → low
else                      → ok
```
Display labels: critical→"Low" (red), low→"Med" (amber), ok→"Good" (green).
Quantities round to 4 dp and clamp at 0. Margin % = `round((sellEx − costEx)/sellEx × 100)`.
A menu item's authoritative food cost is **recipe-computed** when a recipe exists; the stored `cost` field is the fallback for unlinked items.

## Firestore collections (all under `restaurantGroups/{groupId}`, DB `mymor-australia`)

### Group-level
- **`inventoryItems/{itemId}`** — `name, sku, category, unit, supplierId, cost(ex-GST), sell(ex-GST), gstApplicable, storageLocation, archived, priceHistory[{oldCost,newCost,by,at(ISO)}], createdAt, updatedAt`. Seeded ids `inv-001…inv-039`.
- **`menuItems/{id}`** — `displayName, kitchenName, category, sellPrice(ex-GST), cost(ex-GST fallback), gstApplicable, venueIds[], available, e86, e86Reason, e86By, e86At(ISO), e86Back, posId, modifierGroupIds[], recipeId, createdAt, updatedAt`. Seeded ids `menu-101…menu-121`. 86ing sets `available:false`; un-86 sets `available:true`.
- **`recipes/{id}`** — `menuItemId, ingredients[{itemId, qty}]` (qty in the item's unit). Seeded `rec-{menuProtoId}`.
- **`modifierGroups/{id}`** — `name, type(single|multi), required, minSelections, maxSelections(null=∞), printer(kitchen|bar|receipt), options[{label, priceDelta}], attachedMenuItemIds[]` (attachment lives on `menuItems.modifierGroupIds`; counts computed live). Shared with POS Settings.
- **`suppliers/{id}`** — `company, contactName, phone, email, leadTime, terms, venueIds[], archived, createdAt`.
- **`purchaseOrders/{id}`** — `status(draft|pending|confirmed|inTransit|received|completed|dismissed), autoDraft, itemKey` (triggering item for auto-drafts — dedupe key), `poNumber?, supplierId, venueId, lines[{itemId,itemName,qty,unitCost,unit}], total(ex-GST), triggeredBy[{menuItemId,soldQty,reference,at(ISO)}], notes, createdBy("auto"|name), approvedBy, sentAt, expectedAt, receivedAt, receivedBy, receivedLines[{itemId,qtyReceived}], discrepancies[string], invoiceUrl, createdAt, updatedAt`.

### Per-venue (`venues/{venueId}/…`)
- **`stock/{itemId}`** — `qtyOnHand, par, reorderPoint, reorderQty, status, lastCountedAt, updatedAt`. Doc id = inventory item id. In `PER_VENUE_COLLECTIONS` (RGContext subscribes & stamps venueId).
- **`stockMovements/{autoId}`** — `itemId, itemName, type(posSale|delivery|manualAdj|wastage|transferIn|transferOut|stocktake), qtyChange(signed), before, after, unit, reason` (MANDATORY for manualAdj/wastage), `reference, menuItemId, menuName, by, byUid?, costAtMove(real cost), createdAt`. **Not** in PER_VENUE_COLLECTIONS — unbounded; subscribe per page with `orderBy(createdAt desc) + limit` (single-field index, no composite needed).
- **`stocktakes/{autoId}`** — `date(YYYY-MM-DD), venueId, countedBy, witnessedBy, method(full|spot|abc), freezeDeductions, notes, status(draft|finalised), lines[{itemId,itemName,systemQty,physicalCount,variance,varianceValue,reason}], totalVariance, totalVarianceValue, itemsCounted, finalisedAt, createdAt, by`. Finalising sets counted quantities as absolute on `stock` and writes one `stocktake` movement per variance — all in one transaction.
- **`batches/{autoId}`** — `itemId, itemName, batchCode, qty, receivedAt(date), bestBefore(date), status(ok|used), by, createdAt`.

### Group doc fields (reference lists, editable later — G13)
`stockCategories[]`, `menuCategories[]`, `stockUnits[]`, `storageLocations[]` — seeded only when absent.

## The `rgSellOrder` callable (centerpiece — VERIFIED LIVE)

Input `{groupId, venueId, lines:[{menuItemId, qty}], reference}` → output `{ok, deducted[{itemId,name,unit,after,status}], skipped[{menuItemId,reason}], lowStock[], draftsCreated}`.

- Caller must be authed, belong to the group, and hold `stock` view+ (missing key/groupRole fails closed — returns 403).
- Per line: resolve `menuItems.recipeId` → recipe; no recipe → skip with reason (sale not failed).
- Single transaction: read stock docs → `after = max(0, round4(before − qty×lineQty))` → status rule → write stock + one movement per ingredient (`costAtMove` = real unit cost) → if `after <= reorderPoint`, dedupe-check open drafts (`status==draft && venueId && itemKey`) **inside the tx** and create/append the draft.
- §9 gates passed against the deployed function on 2026-06-12: T2.1 exact deductions/movements, T2.2 single draft + appended provenance, T2.3 concurrent sales sum correctly, staff-without-permission denied. Test data cleaned up afterwards.

## Pages
- `/rg/stock` → `StockPage.js` (+ `StockExtraTabs.js`): Item library, Stock overview, Movements (+demo sale), Stocktake, Price adjustments, Valuation, Expiry & batches, Scanner (html5-qrcode), Adjustments.
- `/rg/menus` → `MenusPage.js`: Overview, Availability (real bulk enable/disable), 86 list, Recipe costing (+demo sale), Modifier groups, Pricing & margins.
- `/rg/supplier` → `SupplierPage.js`: Auto-reorder drafts (edit qty, approve, approve-all, dismiss), Active orders (confirm → in transit → receive), Create order, Directory, History. **Receiving** updates stock in a client transaction + writes `delivery` movements + uploads invoice to Storage at `restaurantGroups/{g}/invoices/{poId}/…`.

## Known deviations from the handoff (raised + justified)
1. `stockMovements`/`stocktakes`/`batches` are NOT in `PER_VENUE_COLLECTIONS` (unbounded growth; pages subscribe with limits — same precedent as `tempLogs`).
2. `triggeredBy` is an **array** of provenance events (handoff sketched an object) so repeated triggers accumulate on one draft.
3. Plain controls (repo RG style) instead of Formik/MUI — hard rule 1 ("match the repo's existing style") wins; no RG page uses Formik.
4. Prototype bugs intentionally NOT replicated: `||`-blocked zero saves, un-86 forcing availability is kept (per prototype) but documented, ×8 fake movement cost, "Affects N items" random, dead Item-management tab (merged into Overview), GST-mixed margins.

## Live environment facts (verified 2026-06-12)
- Group id **`YQRkUwBO5wMIdLSgcpji`** (capital I — `provision-group.js` carries a lookalike with lowercase l that matches nothing).
- Venue ids: `mad-benji`, `hey-sister`, `mad-hotpot` (no hyphen between hot/pot), `main-kitchen` (named "Central Kitchen").
- All data in named DB `mymor-australia`; the default DB is empty.
- Seeded: 39 inventoryItems, 156 stock docs (4 venues), 21 menuItems (sellPrice converted inc→ex ÷1.1), 8 recipes, 6 suppliers, 5 modifierGroups.

## Post-review hardening (adversarial review, all fixed 2026-06-12)
- Receive flow re-reads the PO inside its transaction and aborts if already received (double-receive cannot double-increment stock); button gets a busy guard.
- Item-edit saves the stock fields in a transaction; quantity only overwritten when the user actually changed it, and the change writes a `manualAdj` movement ("Item edit").
- CF movements record `qtyChange = after − before` (audit sums even when a deduction clamps at 0) and `costAtMove` from the actual change.
- CF skips raising qty-0 drafts; tx-retry no longer duplicates `skipped` reasons; an explicitly malformed permission value fails closed.
- Adjustment + receive buttons have in-flight guards; price-adjust preview accepts $0; expiry countdown parses dates as local (no AEST off-by-one); stocktake drafts are resumable and finalise updates the same doc; pricing KPI memo deps fixed.

## Ops checklist (user-side)
- [x] `rgSellOrder` deployed (done from this session).
- [ ] Firestore **rules** for the new collections (stock/menus/supplier read for group members; writes per permission). Ask for pasteable rules if needed.
- [ ] Storage rules must allow authed uploads to `restaurantGroups/{g}/invoices/**` for the receive-flow invoice capture.
- [ ] Still pending from earlier: deploy `rgOnShiftCreated` + `rgRecurringChecklists`.
- [ ] MyMorOps port of the three pages (separate task — read shapes above).
