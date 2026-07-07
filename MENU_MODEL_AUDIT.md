# MENU_MODEL_AUDIT.md
**Read-only audit — 7 Jul 2026** (working tree includes the uncommitted venuePrices/order changes — Section 5 covers them as instructed). Repos: MyMorAdmin, MyMorOps, MyMorFunction. Purpose: blast-radius map for the decided **template + per-venue-instance** menu model (per-field LINKED/OVERRIDDEN, one-directional template→instance, gate = existing `can("menus","edit")`).

Every claim: **VERIFIED-IN-CODE** (file:line, block read) or **UNKNOWN** (with the grep/command run). No edits, commits, or deploys were made.

Base greps run (results reproduced in terminal output):
- `grep -rn "menuItems\b\|menuItemDoc\|menuItemsCol" MyMorAdmin/src MyMorOps/src MyMorFunction/index.js MyMorFunction/rgAutoAssign.js | grep -v menuItemId` → 52 hits, all catalogued in §1 (rgAutoAssign.js: **zero** hits)
- `grep -rn "recipesCol\|recipeDoc\b\|recipeByMenuItemId\|recipeFoodCost\|\.ingredients\|recipeId" …` → catalogued in §2
- `grep -rn 'can("menus"' MyMorAdmin/src MyMorOps/src` → exactly 2 hits (§7)
- `grep -rn "venuePrices" …` → §5

---

## SECTION 1 — menuItems: EVERY reader/writer

### Firestore path (both repos, identical)
VERIFIED — group-level: `restaurantGroups/{g}/menuItems` — MyMorAdmin/src/utils/restaurantGroupPaths.js:89, MyMorOps/src/lib/restaurantGroupPaths.js:82 (`// shared with POS Settings`).

### 1A. MyMorAdmin

**RGContext.js — the single live subscription (READ, all fields raw)**
- :7 import, :56 state, **:83 `subColl(menuItemsCol(groupId), setMenuItems)`** (subColl = onSnapshot wrapper defined in the same file), exposed via context value :241/:248. Every consumer below gets docs from here — template+instance model must change THIS subscription (template col + instance col merge) once, and every consumer inherits it.

**MenusPage.js — main reader + main writer** (file read in full this session; current line numbers)
READS:
- :42-46 `vItems` — filter by `venueIds.includes(selectedVenue)`, `displayName` (search+sort), `category` (filter)
- :48 `foodCostOf` — `cost` via menuItemFoodCost fallback; :51 `sellAt` — `venuePrices`/`sellPrice` (working-tree); :52 `marginOf`; :55 `effectiveTakeaway` — `takeawayPrice`/`sellPrice`
- :69 find by id (86-form); :74 `e86List` — `e86`
- :274 `attachedCount` — `modifierGroupIds`
- :281-284 `recipePill` — via recipeByMenuItemId (`recipeId` indirectly)
- :294-299 pricing KPIs — `venuePrices`/`sellPrice` at recipeVenue + cost
- :344-368 overview row — `displayName, hasVariants, variants.length, isCombo, kitchenName, category, posId, gstApplicable, takeawayPrice, available, e86`
- :417 86-select options (`e86, displayName`); :450-471 recipes tab (sell/fc/margin at recipeVenue); :479-484 unlinked list; :536-553 pricing table; :713 combo option picker (`isCombo, displayName`); :742-771 recipe modal (`sellPrice/venuePrices` via venueSellPrice)
WRITES (all `setDoc(menuItemDoc(...), …, {merge:true})` or addDoc):
- **:57-62 `patchItem`** — `{ ...patch, updatedAt }`; patches sent: `{available}` (:357-358), 86-on `{e86:true, available:false, e86Reason, e86By, e86At, e86Back}` (:65), 86-off (:66), 86-form (:71). ⚠ **`patchItem` has NO write-time canEdit check** (controls are UI-disabled only) — see §7.
- :78-85 `setAll` bulk — `{available, updatedAt}` per non-e86 vItem (canEdit-checked :78)
- **:115-195 `saveItem`** — full object (canEdit-checked :116), quoted:
```js
// MenusPage.js:177-191
const data = {
  displayName: editor.displayName.trim(), kitchenName: editor.kitchenName || "", category: editor.category,
  sellPrice, cost: Number(editor.cost) || 0, gstApplicable: !!editor.gstApplicable,
  venueIds: editor.venueIds, posId: editor.posId || "", modifierGroupIds: editor.modifierGroupIds,
  available: !!editor.available,
  takeawayPrice,
  venuePrices,                    // working-tree (uncommitted) — numbers + deleteField() sentinels
  hasVariants, variantGroupName: hasVariants ? (editor.variantGroupName || "") : "", variants,
  isCombo, comboGroups,
  updatedAt: serverTimestamp(),
};
if (editor.id) await setDoc(menuItemDoc(groupId, editor.id), data, { merge: true });
else await addDoc(menuItemsCol(groupId), { ...data, e86: false, recipeId: null, createdAt: serverTimestamp() });
```
- :225 `saveRecipe` link-back — `{ recipeId, updatedAt }` (canEdit-checked :212)

**StockPage.js** — READ only: :31 ctx; :117-121 `demoItems = menuItems.filter((m) => recipesByMenuItemId[m.id] && (m.venueIds || []).includes(movVenue))`; :126-131 demoSell reads `displayName` and calls sellOrder. No menuItems writes.

**SupplierPage.js** — READ only: :27 `menuById`; consumed at **:216** `po.triggeredBy.map((t) => menuById[t.menuItemId]?.displayName || t.menuItemId)` — PO provenance display. No writes.

**StockExtraTabs.js (PriceAdjustTab)** — READ only: :236 ctx; :243-261 margin-impact preview — reads `sellPrice` (:258 `marginPct(m.sellPrice, oldFc/newFc)` — group price, group cost; no venue context). No menuItems writes.

### 1B. MyMorOps
- **context/RGContext.js:114** `subColl(menuItemsCol(groupId), setMenuItems)` (READ, all fields), exposed :288/:296.
- **MenusScreen.js** — mirror of MenusPage minus variants/combos/takeaway/venuePrices editing. READS: :60-64 vItems (venueIds/displayName/category), :66-72 sellAt/marginOf/foodCostAtVenue (venuePrices/sellPrice/cost — working-tree readers), :87/:92 e86, :110 editor open fields, :136 attachedCount (modifierGroupIds), :192-211 overview row (displayName/kitchenName/category/posId/gst/sellPrice/venuePrices/e86/available), :273-275 86-select, :297-316 recipes tab, :381-391 pricing tab. WRITES: :74-77 `patchItem` `{...patch, updatedAt}` — **HAS** `if (!canEdit) return;` (:75); :93-99 setAll bulk `{available}`; **:431-449 save** (canEdit :432) — REDUCED field set, quoted:
```js
// MenusScreen.js:435-440 — note: NO takeawayPrice/variants/combos/venuePrices (merge:true, so it never clobbers them)
const data = {
  displayName: editor.displayName.trim(), kitchenName: editor.kitchenName || "", category: editor.category,
  sellPrice: Number(editor.sellPrice) || 0, cost: Number(editor.cost) || 0, gstApplicable: !!editor.gstApplicable,
  venueIds: editor.venueIds, posId: editor.posId || "", modifierGroupIds: editor.modifierGroupIds,
  available: !!editor.available, updatedAt: serverTimestamp(),
};
```
:443-444 setDoc/addDoc (create adds `e86:false, recipeId:null, createdAt`); :544 recipeId link-back.
- **SupplierScreen.js** — READ only: :32 menuById, :228 provenance names (same as Admin :216).

### 1C. MyMorFunction — index.js (rgSellOrder only; rgAutoAssign.js has zero hits)
READ at :3197 `db.getAll(...menuIds.map((id) => groupRef.collection("menuItems").doc(id)))`. Fields consumed (full list in §4): `venueIds` (:3229), `venuePrices` (:3237, working-tree), `sellPrice` (:3239), `hasVariants`/`variants[].label/.sellPrice` (:3241-3244), `modifierGroupIds` (:3252), `displayName` (:3261,:3272,:3280), `gstApplicable` (:3265), `recipeId` (:3269). **No menuItems writes server-side.**

---

## SECTION 2 — recipes: EVERY reader/writer

### Path + link mechanism (VERIFIED)
- Group-level: `restaurantGroups/{g}/recipes` (Admin paths :91-92, Ops :84-85).
- **Two doc kinds share ONE collection** — template model must handle both:
  1. **Dish recipe** — `{ menuItemId, ingredients:[{itemId, qty, netQty, recipeUnit}], createdAt/updatedAt }`. Link is BIDIRECTIONAL: recipe carries `menuItemId` (MenusPage:220,222) AND the menu item carries `recipeId` back-link (MenusPage:225; server follows `m.recipeId` at index.js:3269).
  2. **Production recipe** — `{ producesItemId, ingredients }` (StockExtraTabs:716-717), back-linked from `inventoryItems.{producedByRecipeId, isPrepped}` (:718). Keyed map `prodRecipeByItem` built at StockExtraTabs:691-693: `if (r.producesItemId) m[r.producesItemId] = r;`.

### Writers
- **MenusPage.js:213-225 saveRecipe** (canEdit :212): `ingredients = [{itemId, qty:Number(netQty), netQty:Number(netQty), recipeUnit}]`; update `setDoc(recipeDoc, { menuItemId, ingredients, updatedAt }, {merge:true})` (:220) or create `addDoc(recipesCol, { menuItemId, ingredients, createdAt })` (:222); then menuItem `{recipeId}` (:225).
- **Ops MenusScreen.js:530-544** — identical shape (:539 update / :541 create / :544 link-back), canEdit :521-ish (`if (!canEdit) return;` at :530-area — VERIFIED in full read).
- **StockExtraTabs.js:707-722 saveRecipe (Production)** (canEdit :708): `{ producesItemId: sel, ingredients }` (:716-717) + inventoryItem link (:718). Cycle guards :712-713.
- Seeder: scripts/importer/seed-stock-module.js:216-220 writes dish recipes `{ menuItemId, ingredients:[{itemId, qty}] }` (old shape, no netQty/recipeUnit — the Phase 1 fallbacks cover this).

### Readers
- Subscriptions: Admin RGContext:84, Ops RGContext:115 (whole collection, both kinds mixed).
- Keyed maps: `recipeByMenuItemId` — MenusPage:30, Ops MenusScreen:48, StockPage:117 (`Object.fromEntries(recipes.map((r) => [r.menuItemId, r]))` — production docs get key `undefined`, harmlessly collapsed); `prodRecipeByItem` — StockExtraTabs:691-693.
- Cost math: rgStockUtils `recipeFoodCost` (Admin :82-88 / Ops :84-90) reduces `recipe.ingredients` with `grossStockQty × venueCost`; `menuItemFoodCost` (Admin :92-96) picks recipe vs item.cost fallback.
- **rgSellOrder** (server): :3201-3204 load by `m.recipeId`; :3269-3281 expansion — full quote in §4.
- MenusPage recipe-costing tab :450-471 + recipe modal :742-771; unlinked list :479-484; recipePill :281-284. Ops mirrors :297-333, :566-593.
- StockPage:117-121 (demo-sale eligibility). StockExtraTabs PriceAdjust :246-258 (`r.ingredients.some/reduce` — margin cascade preview, uses OLD `g.qty` only — pre-Phase-1 formula, no grossStockQty; noted as drift). StockExtraTabs Production :696-704 (unitCostAt), :728-751 (produce transaction consumes `selRecipe.ingredients`).

---

## SECTION 3 — variants (sizes) + modifiers (add-ons): current shape

### menuItem.variants — VERIFIED shape (written MenusPage:124-137, mirrored by importer :69-79):
```js
variants: [{ label, sellPrice: Number, takeawayPrice: Number|null, posId: "", isDefault: bool, available: bool }]
// exactly one isDefault enforced (MenusPage:136-137); top-level sellPrice tracks the default variant (:141)
// hasVariants: bool, variantGroupName: "" (cleared when off)
```
Readers: MenusPage overview badge :347 (`variants.length`), editor rows :622-660-ish, rgSellOrder :3241-3244 (label-match → variant.sellPrice). **Ops MenusScreen neither displays nor edits variants** (save drops them; overview shows only headline price).

### modifierGroups collection — VERIFIED shape
Path: group-level `restaurantGroups/{g}/modifierGroups` (Admin paths :93-94, Ops :86-87). Written by MenusPage saveMod :261-269 (canEdit :257):
```js
{ name, type: "multi"|"single", required: bool, minSelections: Number, maxSelections: Number|null,
  printer: "kitchen"|"bar"|"receipt", options: [{ label, priceDelta: Number }] }
// create adds: attachedMenuItemIds: [], createdAt   (:269)
```
Ops ModEditor writes the identical shape (MenusScreen:604-624). Link: menuItem.`modifierGroupIds: [id]` (attachment lives on the ITEM; `attachedMenuItemIds` on the group is written `[]` at create and — grep shows — never updated afterwards; `attachedCount` is computed live from menuItems :274/Ops :136).
⚠ **Data-loss trap (VERIFIED)**: the importer preserves per-option `posId` (import-madbenji-menu.js:57-61 `...(o.posId != null … ? { posId } : {})`), but app-side saveMod REBUILDS options as `{label, priceDelta}` only (:259) — editing an imported group in the app silently DROPS option posIds. Template/instance work touching modifiers should fix or at least preserve unknown option fields.
Subscriptions: Admin RGContext:85, Ops RGContext:116. Readers: MenusPage modifiers tab :497-510-ish + editor checkboxes :618-626; Ops :349-357/:503-507; **rgSellOrder :3246-3258** (server-side delta resolution).

### rgSellOrder variant+modifier pricing block — VERIFIED, full quote (index.js:3234-3267):
```js
    // ── price this line at the SELLING venue (Option A / module #3).
    // Keep in sync with rgStockUtils.venueSellPrice: venuePrices[venueId] present
    // & numeric → per-venue override, else group sellPrice.
    const vpRaw = m.venuePrices ? m.venuePrices[String(venueId)] : undefined;
    const vpNum = Number(vpRaw);
    let unitPrice = vpRaw != null && !isNaN(vpNum) ? vpNum : (Number(m.sellPrice) || 0);
    let variantLabel = null;
    if (m.hasVariants && l.variantLabel && Array.isArray(m.variants)) {
      const variant = m.variants.find((v) => v && v.label === String(l.variantLabel));
      // no per-venue VARIANT overrides exist yet — a matched variant prices at its own sellPrice
      if (variant) { unitPrice = Number(variant.sellPrice) || 0; variantLabel = variant.label; }
    }
    const mods = [];
    if (Array.isArray(l.modifiers)) {
      for (const md of l.modifiers.slice(0, 20)) {
        const label = md && md.label != null ? String(md.label).slice(0, 60) : "";
        if (!label) continue;
        let delta = 0;
        for (const gid of (Array.isArray(m.modifierGroupIds) ? m.modifierGroupIds : [])) {
          const opt = ((modGroupById[gid] || {}).options || []).find((o) => o && o.label === label);
          if (opt) { delta = Number(opt.priceDelta) || 0; break; }
        }
        mods.push({ label, priceDelta: delta }); // unmatched label → $0 delta (never client-priced)
      }
    }
    const modsDelta = mods.reduce((s, x) => s + x.priceDelta, 0);
    orderLines.push({
      menuItemId: mid, name: m.displayName || mid, qty: lineQty,
      unitPrice: rgRound4(unitPrice), variantLabel, modifiers: mods,
      notes: l.notes != null ? String(l.notes).slice(0, 200) : "",
      course: l.course != null ? String(l.course).slice(0, 40) : "",
      gstApplicable: m.gstApplicable !== false,
      lineTotal: rgRound4(lineQty * (unitPrice + modsDelta)),
    });
```
Per-venue extension blast radius here: variant lookup is by LABEL against the group item's `variants[]`; modifier delta lookup is by LABEL against group `modifierGroups`. A per-venue instance with its own variants/modifier attachments must feed THESE two lookups (`m.variants`, `m.modifierGroupIds`) with the resolved instance view, or the server prices from the template while the venue shows something else.

---

## SECTION 4 — rgSellOrder menuItem/recipe dependency map (line-level, VERIFIED — function read in full again this session)

| Line(s) | Field read | Used for |
|---|---|---|
| 3196-3199 | menuItems docs (`db.getAll`) | reference data, outside tx |
| 3201-3204 | `m.recipeId` → recipes `db.getAll` | recipe load |
| 3209-3215 | `m.modifierGroupIds` (via menuById) → modifierGroups getAll | modifier delta resolution (only when a line sends modifiers) |
| 3226 | doc existence | "Menu item not found" skip |
| 3229-3232 | `m.venueIds` | **venue gate**: `!m.venueIds.includes(String(venueId))` → skip line |
| 3237-3239 | `m.venuePrices[venueId]`, `m.sellPrice` | per-venue price resolution (inline venueSellPrice mirror) |
| 3241-3244 | `m.hasVariants`, `m.variants[].label/.sellPrice` | variant pricing by label |
| 3252-3254 | `m.modifierGroupIds`, `modGroup.options[].label/.priceDelta` | server-authoritative modifier deltas |
| 3261 | `m.displayName` | order line name |
| 3265 | `m.gstApplicable` | per-line GST flag |
| 3269-3274 | `m.recipeId`, `r.ingredients` (exists/length) | deduction eligibility; no-recipe → skip deduction (line stays on order) |
| 3275-3281 | `ing.itemId`, `ing.netQty`/`ing.qty` | moves expansion (recipeQty × lineQty) |
| 3280 | `m.displayName` | movement provenance menuName |

Everything downstream (3294+) reads inventoryItems/stock, not menuItems/recipes — except movement `menuName` carried from :3280. **Template-model change point:** everything above must resolve TEMPLATE→INSTANCE before line 3229 (the venue gate itself becomes "instance exists at this venue?").

---

## SECTION 5 — existing per-venue patterns (conventions to copy)

**Status note: `venuePrices` + `venueSellPrice` + order-write exist ONLY in the uncommitted working tree** (git status: Admin 4 files M, Ops 3 files M, Function index.js M — nothing committed). Live/deployed code has none of this.

1. **`venueCost(item, stockDoc)`** — venue value → group fallback. Admin rgStockUtils.js:60-64, Ops :62-66 (identical); server inline index.js:3333. The original pattern.
2. **`venueSellPrice(menuItem, venueId)`** — Admin rgStockUtils.js:69-74, Ops :71-76 (identical), server inline :3237-3239. Working-tree.
   Readers (working-tree): Admin MenusPage :51,:296,:454,:539,:766-770; Ops MenusScreen :69,:144,:301,:384,:554. Writer: MenusPage saveItem :152-158 (+deleteField cleanup) → data :184.
3. **Same-doc-id join** — per-venue `stock/{itemId}` shares the id of group `inventoryItems/{itemId}` (paths comment Admin :83-86). This is the natural shape for menu instances too: `venues/{v}/menuItems/{templateId}`.
4. **Membership filter (NOT override)** — `venueIds[]` on menuItems/staff (`staffInVenue` Admin paths :64-67). The instance model would REPLACE menuItem.venueIds with instance existence.
5. **Migration precedent** — `scripts/importer/migrate-phase2-pervenue-cost.js` (read in full, 37 lines): dry-run default, `--apply` flag; seeds each venue's value = the group value so the migration is a behavioural NO-OP (`cost`, `costMethod:'wavg'`, `costHistory:[seed]`); idempotent (skips docs already migrated); reports counts + missing-parent warnings. **This is the exact template a menuItems→template+instances migration should follow** (seed every instance LINKED — inherit-all — so day-1 behaviour is unchanged).

Other override patterns searched: `grep -rni "venuePrices\|priceByVenue\|sellPriceByVenue\|pricePerVenue\|venuePrice"` → only the working-tree hits above; no other value-override convention exists. VERIFIED.

---

## SECTION 6 — migration surface (OBSERVE only)

**Source-of-truth counts (VERIFIED from the import JSON, `scripts/import/mymor_madbenji_import.json` `_report.counts`):**
```
categories: 29 · modifierGroups: 105 (920 options) · menuItems: 281
  — 66 with variants (146 variant children folded in) · 4 with takeawayPrice
combos: 2 (hand-built via import-madbenji-combos.js from _needsManualSetup)
```
Plus the demo seed (seed-stock-module.js): PROTO_MENU = 11 items + PROTO_RECIPES dish recipes (`{menuItemId, ingredients:[{itemId, qty}]}` old shape, :216-234).
**LIVE Firestore doc counts: UNKNOWN** — needs a console read-back (the importer prints them on `--commit`: "menuItems now: N"). Import ids are deterministic (`mi_<n>`, `mg_<n>`, setDoc merge, idempotent; demo ids don't match `^mi_`), target group `YQRkUwBO5wMIdLSgcpji`, db `mymor-australia` (import-madbenji-menu.js:9-25).

**Field → destination observation (data as it exists today):**
- Template (definition): `displayName, kitchenName, category, posId, gstApplicable, cost, modifierGroupIds, recipeId, hasVariants, variantGroupName, variants[], isCombo, comboGroups, takeawayPrice, sellPrice (base)`
- Per-venue instance: existence (replaces `venueIds[]`), price override (today's working-tree `venuePrices` folds into instance `sellPrice` override), **`available` + `e86` (+ reason/by/at/back)** — today these are GROUP-GLOBAL: 86'ing an item hides it at EVERY venue (MenusPage:65 writes one doc). The instance model changes this semantic — flag for product sign-off.
- Recipes: dish recipes are group-level and venue-costed at read time (venueCost) — per-venue recipe DIFFERENCES need instance-level `recipeId` override; production recipes (`producesItemId`) are inventory-side and untouched by this model.
- Modifiers: group-level `modifierGroups` + item-side `modifierGroupIds` — per-venue differences need instance-level `modifierGroupIds` override; option-posId preservation bug (§3) should be fixed en route.

---

## SECTION 7 — permission gates (menus)

**`can("menus","edit")` — exactly 2 hits (grep above):** MenusPage.js:21 and MenusScreen.js:38 (`const canEdit = can("menus", "edit")`). `can` is provided by each repo's RGContext (hasLevel over the staff permission map; rgConfig DEFAULT_PERMISSIONS: menus = edit for owner/storeAdmin/manager, none for staff — Admin rgConfig.js:68-73).

**Write-time enforcement per write path (VERIFIED):**
| Write | Gate |
|---|---|
| Admin saveItem :116, setAll :78, saveRecipe :212, saveMod :257 | ✅ `if (!canEdit…) return` |
| **Admin patchItem :57-62 (available/86 writes)** | ❌ **NO function-level check** — UI-only (checkbox `disabled={!canEdit}` :357, buttons conditionally rendered). Inconsistent with Ops. |
| Ops patchItem :74-77, setAll :93, save :432, RecipeEditor save :530-area, ModEditor save :600-area | ✅ all have `if (!canEdit) return; // write-time re-check (hard rule)` |
Route/nav gate (view level): Admin `RestaurantGroupRoutes.js:41` `<Route path="/rg/menus" element={P("menus", <MenusPage />)} />` with `P = (moduleKey, El) => <ProtectedRoute moduleKey={moduleKey}>{El}</ProtectedRoute>` (:23; ProtectedRoute.js:11-16, default level "view"); Ops AppShell.js:48 nav entry filtered by `can(n.permKey || n.key, "view")` (:66).
**Conclusion:** the override gate CAN ride on `can("menus","edit")` as decided — it's the uniform page gate — but fix the Admin `patchItem` gap when touching this code, and remember the SERVER gate for sales is `stock` (rgSellOrder :3161-3171), not `menus`.

**firestore.rules (MyMorFunction/firestore.rules, working tree = live+orders):**
```
// :162-167
match /menuItems/{menuItemId} {
  // ⚠ COST-FIELD TENSION (flagged): doc contains `cost`. Kept member-read so POS/
  // floor can read sellPrice/variants/modifierGroupIds. See review §2 for options.
  allow read:  if rgIsSuper() || rgIsGroupMember(groupId);
  allow write: if rgIsSuper() || rgCanManageStaff(groupId);
}
// :168-173
match /recipes/{recipeId} {
  allow read:  if rgIsSuper() || rgCanManageStaff(groupId);
  allow write: if rgIsSuper() || rgCanManageStaff(groupId);
}
// :174-177
match /modifierGroups/{modId} {
  allow read:  if rgIsSuper() || rgIsGroupMember(groupId);
  allow write: if rgIsSuper() || rgCanManageStaff(groupId);
}
```
So Firestore-level menu writes = manager+ (`rgCanManageStaff` = owner/storeAdmin/manager) — matches the app's menus:edit defaults. NOTE: per-venue INSTANCES will live under `venues/{v}/…` — a new subcollection name there falls into the wildcard member-read/WRITE rule (rules :106-109) unless excluded, exactly like orders was. Plan a rules block for the instance collection on day one.

---

## SUMMARY

**Reader/writer footprint (files):**
- menuItems — **11 files**: Admin RGContext, MenusPage (R+W), StockPage (R), SupplierPage (R), StockExtraTabs (R), Ops RGContext, MenusScreen (R+W), SupplierScreen (R), Function index.js (R), + 2 path modules. (Importer/seed scripts additionally: 3.)
- recipes — **9 files**: Admin RGContext, MenusPage (R+W), StockPage (R), StockExtraTabs (R+W production), rgStockUtils (helpers), Ops RGContext, MenusScreen (R+W), Ops rgStockUtils, Function index.js (R).
- modifierGroups — **6 files**: both RGContexts, MenusPage (R+W), MenusScreen (R+W), Function index.js (R), importer.

**HIGH-RISK to change (pricing/deduction path — server + money):**
1. `MyMorFunction/index.js` rgSellOrder :3196-3281 — template→instance resolution must land BEFORE the venue gate, price, variant, modifier, and recipe reads (§4 table)
2. `rgStockUtils` venueSellPrice/venueCost/recipeFoodCost/menuItemFoodCost (both repos) — every margin number flows through these
3. RGContext subscriptions (Admin :83-85, Ops :114-116) — the single choke point where template+instance merge should happen so all consumers see one resolved shape
4. MenusPage saveItem/saveRecipe + Ops save — writers must learn template-vs-instance targets

**MEDIUM:** MenusPage/MenusScreen pricing+recipes tabs (venue-priced display), StockPage demoItems (venueIds→instance existence), firestore.rules new instance collection.

**LOW-RISK (display-only):** SupplierPage:216 / SupplierScreen:228 (provenance names), StockExtraTabs PriceAdjust :258 (group-level preview), 86-select dropdowns, overview badges.

**Loose ends found while auditing:** Admin patchItem missing write-time canEdit (§7); modifier option posId dropped on app edit (§3); StockExtraTabs PriceAdjust uses pre-Phase-1 `g.qty` cost formula (§2); `available`/`e86` are group-global today (§6); production recipes share the recipes collection (§2) — template work must not treat every recipe doc as a dish recipe.

**Live-data caveat:** everything above proves code shape in the working tree today (including uncommitted changes, marked). Live Firestore contents/counts and deployed-function behaviour are UNKNOWN from code alone — confirm with console + click-tests before/after any migration.
