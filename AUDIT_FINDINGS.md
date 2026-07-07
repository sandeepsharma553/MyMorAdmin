# AUDIT_FINDINGS

## Phase 0 — Baseline

Read-only baseline map of **MyMorAdmin**. Nothing was edited, fixed, or committed.
Tags: `[VERIFIED-IN-CODE]` = read directly in source · `[NEEDS-LIVE-CONFIRM]` = depends on
runtime/Firestore-rules/live data · `[MECHANICAL]` = safe deterministic change ·
`[NEEDS-DECISION]` = requires product/security judgement.

Nothing below is asserted as "working", "done", or "fixed" — it is an inventory only.

---

### 0. Freshness check `[VERIFIED-IN-CODE]`

- **Branch:** `main`
- **Last commit:** `7fab002cea67f7c64c1188da5a9267ccae02e1a0` — `2026-07-02 22:32:05 +1000` — *"feat(shifts): grey closed days for selected venue + default add-shift times to venue window"*
- **Working tree:** clean (`nothing to commit`).
- **Sync:** "Your branch is up to date with 'origin/main'." No local divergence detected.
  - Caveat `[NEEDS-LIVE-CONFIRM]`: only a local status was available (this sandbox reset cwd on `git fetch`); the up-to-date claim reflects the local ref, not a fresh network fetch. If auditing against very recent server state, re-run `git fetch` manually.

---

### 1. Structure `[VERIFIED-IN-CODE]`

#### 1a. Folder tree (src/, 2–3 levels)

```
src/
├── App.js                     # Router root; picks route tree from Redux auth.type
├── firebase.js                # Firebase init (dual-database; named AU DB in prod)
├── app/
│   ├── Store.js
│   └── features/AuthSlice.js  # { isLoggedIn, type, employee, user, activeOrg }
├── auth/LoginPage.js
├── components/                # Layout, NavBar, Sidebar, SuperAdminSidebar,
│                              #   SuperAdminLayout, RestaurantGroupLayout,
│                              #   RestaurantShared, MapLocationInput, EditorPro …
├── hooks/                     # useRestaurantDoc, useDealSettings, useUniversityScope
├── routes/                    # AdminRoutes, SuperAdminRoutes,
│                              #   RestaurantGroupRoutes, RequireContext
├── pages/
│   ├── admin/            (36 files)  # hostel vertical
│   ├── university/       (36 files)  # university vertical
│   ├── uniclub/          (13 files)  # club vertical
│   ├── business/         (19 files)  # business / restaurant / POI-adjacent vertical
│   ├── restaurantgroup/  (66 files)  # RG vertical + rgConfig.js, RGContext.js, rgUtils
│   └── superadmin/       (24 files)  # cross-tenant oversight
└── utils/
    ├── firestorePaths.js         # hostelCol / universityCol / restaurantCol / productCol / serviceCol
    └── restaurantGroupPaths.js   # groupCol / venueCol / staffCol / staffPrivateDoc + PER_VENUE_COLLECTIONS
```

(File counts differ from CLAUDE.md's estimates — CLAUDE.md says ~39/29/11/14/12/13; actual is 36/36/13/19/66/24. `restaurantgroup` is materially bigger than documented.)

#### 1b. How the five verticals are organised `[VERIFIED-IN-CODE]`

The mechanism is **NOT** one shared component with a vertical flag. It is **three separate route
trees selected by `auth.type`, plus a per-page-folder split, plus an in-Redux `activeOrg` string
that toggles which of four "admin" verticals is shown.** Exact wiring:

- `App.js:48-77` computes `adminDefaultPath` and `App.js:86-127` mounts one of three trees:
  - `type === "superadmin"` → `SuperAdminLayout` + `SuperAdminRoutes` (`App.js:86-98`)
  - `type === "admin" && hasGroup` → `RestaurantGroupLayout` + `RestaurantGroupRoutes` (`App.js:100-112`)
  - `type === "admin" && !hasGroup` → `Layout` + `AdminRoutes` (`App.js:114-127`)
- Within the non-group admin tree, the four verticals **hostel / university / uniclub / business**
  are NOT separate route trees — they all live in one flat `AdminRoutes.js` (`AdminRoutes.js:100-201`)
  and are distinguished at runtime by `state.auth.activeOrg` (`"hostel" | "university" | "uniclub" | "business"`).
- The vertical a tenant "is" comes from which id field is present on the employee doc:
  `hasHostel = isValidId(employee?.hostelid)`, `hasUniclub`, `hasUniversity`, `hasGroup`, and
  `hasBusiness = !hasHostel && !hasUniclub && !hasUniversity && !hasGroup` (`App.js:42-46`,
  mirrored in `Sidebar.js:334-341` and `AuthSlice.js:52-63`).
- **POI/map is NOT a tenant vertical.** POI is a superadmin-only surface (`SuperAdminRoutes.js:42`,
  `pages/superadmin/PoiPage.js`). "Restaurant" is split across the `business/` folder (tenant self-service)
  and `superadmin/` (oversight). So the "five verticals" in practice are: hostel, university, uniclub,
  business/restaurant, restaurant-group — with POI as a superadmin feature.

#### 1c. Where a tenant's vertical/type is stored and read `[VERIFIED-IN-CODE]`

- **Stored on** `employees/{uid}`: `type` (`superadmin|admin|user`), plus scoping id fields
  `hostelid`, `universityid`, `uniclubid`, `groupId`/`groupid`, and `empType`
  (`restaurantGroup|hostel|university|uniclub|business`) — per CLAUDE.md §7 schema.
- **Read into Redux** in `AuthSlice.js:68-89` (`getEmployeeByUid` → `doc(db, "employees", uid)`),
  stored at `state.auth.employee` and `state.auth.type` (`AuthSlice.js:211`).
- **Vertical decided** by presence of id fields, not by `empType`:
  `AuthSlice.js:52-63` (`pickDefaultActiveOrg`), `App.js:42-46`, `Sidebar.js:334-350`.
  `empType` exists in the schema but the routing/nav logic keys off `hostelid`/`uniclubid`/
  `universityid`/`groupId` presence instead. `[NEEDS-DECISION]` — two parallel sources of truth
  (`empType` vs id-field presence) can disagree.

---

### 2. Tenant + vertical isolation  *(highest priority)*

#### 2a. Scoping mechanism `[VERIFIED-IN-CODE]`

Two path-helper modules embed the tenant id **in the document path** and throw if it is missing:

- `utils/firestorePaths.js:5-31` — `hostelCol(id,name)`, `universityCol`, `restaurantCol`,
  `productCol`, `serviceCol`. Each: `if (!id) throw new Error(...); return collection(db, root, String(id), name)`.
- `utils/restaurantGroupPaths.js:18-34` — `groupDoc(groupId)`, `groupCol(groupId,name)`,
  `venueCol(groupId,venueId,name)`; all throw on missing id. Paths are
  `restaurantGroups/{groupId}/…` and `restaurantGroups/{groupId}/venues/{venueId}/…`.

Where these helpers are used, scoping is path-enforced and cannot silently fall back to a global read.
**However, a large number of call sites bypass the helpers and query top-level collections directly**,
relying on a `where(...)` filter (or nothing). Firestore `where` clauses are not a security boundary —
they are enforced only by Firestore rules, which are audited in §2c/§6 below.

#### 2b. Unscoped / weakly-scoped Firestore reads & writes `[VERIFIED-IN-CODE]`

**Fully unscoped reads (no tenant filter at all)** — highest priority, all verified by reading the lines:

| File:line | Code | Note |
|---|---|---|
| `pages/admin/AnnouncementPage.js:166` | `getDocs(collection(db, 'employees'))` | Reads the entire `employees` collection to build a uid→username map. No `where`. |
| `pages/university/UniversityAnnouncementPage.js:244` | `getDocs(collection(db, "employees"))` | Same pattern, university variant. |
| `pages/uniclub/UniclubCommunity.js:79` | `getDocs(collection(db, "employees"))` | Same pattern, in `fetchEmployeeUsername`. Loops all employees to match one uid. |
| `pages/admin/OrientationPage.js:144` | `getDocs(query(collection(db, "users"), ...[]))` | Spread of empty array = **no filter**; reads all `users`, then filters in JS by `hostelid` (`OrientationPage.js:150`). |

> These four succeed only if Firestore rules let the caller read every doc in the collection. Under the
> prod `mymor-australia` rules (§6) `employees`/`users` reads require a hostelid match, so an unfiltered
> `getDocs` **would be rejected** for a tenant whose reads don't cover the whole collection — meaning
> either these run only for privileged accounts, rules are more permissive live, or these calls error at
> runtime. `[NEEDS-LIVE-CONFIRM]` which.

**Business-vertical global collections (`where` present but scoped by *user uid*, not a tenant id):**

| File:line | Code |
|---|---|
| `pages/business/ServicePage.js:622` | `query(collection(db, "services"), where("businessId", "==", businessId))` — top-level `services`, filtered by `businessId` (derived from employee/uid). |
| `pages/business/ProductPage.js:333` | `query(collection(db, "products"), where("businessId","==",businessId), orderBy("createdAt","desc"))` |
| `pages/business/ProductPage.js:839` | `addDoc(collection(db, "products"), …)` — writes to the global `products` collection. |
| `pages/business/DealPage.js:205` | `query(collection(db, "deals"), where("businessId", "==", uid))` — **tenant id == employee UID**; comment `DealPage.js:204` confirms "each deal is tagged to the admin employee's UID". |
| `pages/business/DealPage.js:286` | deal payload `{ businessId: uid, … }`; `DealPage.js:293` `addDoc(collection(db,"deals"), …)`. |

Earlier docs cited `ServicePage.js:623`/`ProductPage.js:334` as "no filter" — **corrected here**: both
DO carry `where("businessId","==",businessId)`. They are scoped, but by a per-user `businessId`, so the
isolation strength rests entirely on Firestore rules validating `businessId` server-side. `[NEEDS-LIVE-CONFIRM]`

**`collectionGroup` usage** `[VERIFIED-IN-CODE]` (both filtered by `businessId`, both with cleanup):

| File:line | Code |
|---|---|
| `pages/business/ServiceBookingPage.js:100` | `query(collectionGroup(db, "servicebookings"), where("businessId","==",businessId))` |
| `pages/business/ProductOrderPage.js:166` | `query(collectionGroup(db, "productOrders"), where("businessId","==",businessId))` |

`collectionGroup` spans **every** `servicebookings`/`productOrders` subcollection platform-wide; isolation
is 100% dependent on the `businessId` filter + a matching Firestore rule. `[NEEDS-DECISION]`

**Global collections used as look-ups / cross-cutting systems (appear intentional):**

- `dms_conversations` DM system — `pages/admin/MessagesPage.js:55,76,91,118` and
  `pages/university/UniversityMessagesPage.js:58,76,93,120`. No tenant scoping by design; conversations
  addressed by `selected.id`. `[NEEDS-DECISION]` whether cross-tenant DM enumeration is possible.
- Per-user UI badge state `adminMenuState/{uid}/menus/{key}` — many pages + `Sidebar.js:212,319`. Scoped
  by `uid`; if `uid` is undefined at mount the path becomes `adminMenuState/undefined/...`. `[NEEDS-LIVE-CONFIRM]`
- Platform-global taxonomy/category collections (`dealcategory`, `servicecategory`, `restaurantcategory`,
  `publiceventcategory`, `discovercategory`, `uniclubrole`, etc.) read across business/uniclub pages and
  `hooks/useDealSettings.js:34-41`. Intended global config.

**Weak-scope patterns worth noting** `[VERIFIED-IN-CODE]`:

- `emp?.hostelid || ""` fallback to empty string, then used in a `where`:
  `pages/admin/EmployeePage.js:249,381`, `pages/university/UniversityEmployeeAdminPage.js:396`.
  An empty-string tenant id would query for docs whose `hostelid == ""`. `[NEEDS-DECISION]`
- `employees`/`users`/`role` queried top-level with `where("hostelid","==",emp.hostelid)` across
  Maintenance / Feedback / ReportIncident / Student pages in both `admin/` and `university/`
  (≈40 call sites). Scoped by filter, not path; enumerated in the sweep transcripts. Rule-dependent.

**RG employee/login writes to a global collection** `[VERIFIED-IN-CODE]`:

- `pages/restaurantgroup/StaffDirectoryPage.js:348` `setDoc(doc(db, "employees", uid), { …, groupRole, empType:"restaurantGroup", groupId, … })` — writes the shared login doc (not under `restaurantGroups/{groupId}`).
- `pages/restaurantgroup/UserManagementPage.js:39` `updateDoc(doc(db, "employees", permUser.adminUid), { permissions: permDraft })` — mirrors permissions to the global login doc. Group scoping must be enforced by rules (see §6 `employees` create/update rules).

#### 2c. Nav-only vs route-level vs data-level enforcement `[VERIFIED-IN-CODE]`

There are **three different enforcement postures across the three route trees:**

1. **Admin tree (hostel/university/uniclub/business): nav-only gating.**
   - `AdminRoutes.js:100-201` — **every** route is a bare `<Route element={<Page/>}/>`; there is **no**
     per-route guard and **no** vertical check.
   - The only vertical filter is in the **sidebar**: `Sidebar.js:493-613` builds `visibleSections` from
     four hardcoded key-sets (`hostelKeys`, `universityKeys`, `uniclubKeys`, `businessKeys`) filtered by
     `activeOrg` (`Sidebar.js:600-606`) and then by `permissions` (`Sidebar.js:608-612`).
   - `routes/RequireContext.js` exists as a guard component **but has ZERO usages** — verified by
     `grep -rn "RequireContext" src` returning only its own definition. It is **dead code**; the org
     enforcement it implements (`RequireContext.js:26-33`) is not applied anywhere.
   - **Consequence:** any authenticated admin can deep-link to any page in `AdminRoutes` regardless of
     their `activeOrg` or which vertical they belong to. See §2d.

2. **Restaurant-group tree: real route-level guards.**
   - `RestaurantGroupRoutes.js:22` wraps every route in `ProtectedRoute` via `P(moduleKey, El)`.
   - `pages/restaurantgroup/ProtectedRoute.js:11-16` checks `useRG().can(moduleKey, level)` and
     redirects to the first viewable section or renders a no-access card. This is per-module permission
     enforcement at the route layer (client-side).

3. **Superadmin tree: no per-route guard, but the whole tree is behind `type === "superadmin"`.**
   - `SuperAdminRoutes.js` — plain routes; gate is the `type` check in `App.js:86`.

**Net:** vertical isolation for the four admin verticals is enforced **only in the sidebar (nav)**, not at
the route or data layer. RG isolation is enforced at nav + route (client) + rules (server). Data-layer
isolation everywhere ultimately depends on Firestore rules (§6). `[VERIFIED-IN-CODE]` for the enforcement
location; `[NEEDS-LIVE-CONFIRM]` for whether rules backstop the missing client checks.

#### 2d. Deep-link-reachable routes that nav hides `[VERIFIED-IN-CODE] / [NEEDS-DECISION]`

Because `AdminRoutes.js` has no guards and `RequireContext` is unused, the following are reachable by URL
regardless of the signed-in admin's vertical (the component mounts; whether its data loads depends on
Firestore rules):

- A **business-only** admin (no hostel/uni/club id) can navigate to hostel/university/uniclub routes,
  e.g. `/dashboard`, `/student`, `/universitystudent`, `/uniclubmember`, `/announcement` — none are in
  their sidebar's `businessKeys` set but all are registered routes (`AdminRoutes.js:102-184`).
- Conversely a hostel admin can hit `/businessdashboard`, `/product`, `/deals`, `/managerestaurant`.
- The uniclub subgroup pages (`/subgroupevent`, `/subgroupannouncement`, `/subgroupeventbooking`) are
  reachable by anyone in the admin tree.
- Cross-vertical **surface exposure** is the concern: these pages issue the queries in §2b; if rules are
  permissive (the `(default)` DB catch-all is `allow read, write: if true`, §6), a deep-link would expose
  another vertical's data. Under the `mymor-australia` rules the tenant-scoped collections are gated, but
  the many `if true` / signed-in-only rules (events, eventcategory, University, the bottom catch-all) are
  not. `[NEEDS-LIVE-CONFIRM]` per-collection, per-account.

---

### 3. Build signal `[VERIFIED-IN-CODE]`

Commands run (read-only; nothing fixed):

- **Production build:** `npm run build:dev` → **exit 0** ("The build folder is ready to be deployed.").
  Build succeeds. It emits CRA/ESLint **warnings** (build does not fail on them). This is a CRA (react-scripts) project.
- **Typecheck:** N/A — **plain-JS project**, no `tsconfig.json`, zero `.ts`/`.tsx` files. There is no
  typecheck step to run.
- **Lint:** `npx eslint src --ext .js` → **`✖ 310 problems (1 error, 309 warnings)`**.

**The 1 ESLint error (verbatim):**
```
src/pages/restaurantgroup/permissions.test.js
  68:30  error  Avoid calling `expect` conditionally`  jest/no-conditional-expect
```
(Test-file-only; does not break the production build, which excludes tests.)

**Warning inventory (verbatim counts by rule):**
```
 217  no-unused-vars
  78  react-hooks/exhaustive-deps
   6  jsx-a11y/img-redundant-alt
   2  no-useless-escape
   2  no-duplicate-case
   2  no-dupe-keys
   1  no-sequences
   1  no-loop-func
   1  jest/no-conditional-expect   (the error above)
```
Two warning classes are worth a second look during later surfaces (possible real bugs, not just noise):
- `no-dupe-keys` (2) and `no-duplicate-case` (2) — duplicate object keys / switch cases silently drop a branch.
- A recurring dead-scoping smell in the university "Phase 1" pages: `emp`, `filterByScope`, `scopePayload`
  declared but unused (e.g. `UniversityGuestLogPage.js:34-35`, `UniversityWellbeingPage.js:47-49`,
  `UniversityOrientationPage.js:90-92`, `UniversityLostAndFoundPage.js:45-46`,
  `UniversityFirstWeekJourneyPage.js:41-43`). Suggests scoping helpers were imported then not wired in.
  `[NEEDS-DECISION]` — could indicate an intended tenant filter that was never applied.

Full per-file warning list is reproducible with `npx eslint src --ext .js`; not reproduced in full here.

---

### 4. Known footguns

#### 4a. `groupRole` defaults `[VERIFIED-IN-CODE]`

**Safe default (good):**
- `pages/restaurantgroup/RGContext.js:38` — `const groupRole = employee?.groupRole || "staff";`
  with inline comment `// safe default — never auto-grant owner`. **Does not default to elevated.**

**Hardcoded elevated `groupRole: "owner"` (all in group-provisioning paths, not defaults):**
- `pages/superadmin/RestaurantGroupsPage.js:294` — new group **employee** doc: `role:"groupOwner", groupRole:"owner", … permissions: defaultPermsForRole("owner")`.
- `pages/superadmin/RestaurantGroupsPage.js:301` — matching **user** doc: `roles:{groupOwner:true}, groupRole:"owner"`.
- `scripts/importer/provision-group.js:62` — provisioning employee doc: `groupRole:"owner"`.
- `scripts/importer/provision-group.js:67` — provisioning user doc: `groupRole:"owner"`.

Assessment: these are **intentional owner-creation** flows (superadmin creating a group's first owner /
provisioning script), not accidental defaults. No code path was found that silently defaults an ordinary
user to `owner`. `roleToGroupRole()` maps staff roles for `StaffDirectoryPage.js:347`. `[NEEDS-DECISION]`
only if the superadmin "create group" action is reachable by non-superadmins (gated by `type` in `App.js:86`).

#### 4b. `onSnapshot` listeners without cleanup `[VERIFIED-IN-CODE]`

Swept every `onSnapshot(` hit in `src/`. **No missing-cleanup leak found** — all ~46 real-time listeners
inside `useEffect` capture the unsubscribe and call it on teardown (either `return onSnapshot(...)`,
`return () => unsub()`, or an array of unsubs cleaned in a `forEach`). Representative verified sites:
`Sidebar.js:213,254,272-275,293-296`; `RGContext.js:76-92,106-116,197-202`;
`restaurantgroup/MessagingPage.js:54-58`, `StaffDirectoryPage.js:177-178`, `ShiftPlannerPage.js:189-190`,
`StockPage.js:108-112`, `TemperatureLogPage.js:37-41`; `business/BusinessProfilePage.js:226-250`,
`ServicePage.js`, `ProductPage.js`, `ServiceBookingPage.js`, `ProductOrderPage.js`;
`admin/MessagesPage.js:60-86`, `AnnouncementPage.js`; `university/UniversityMessagesPage.js:63-86`;
`superadmin/RestaurantGroupsPage.js:134-159`, `DealPage.js`, `BusinessesPage.js`.
This category is clean pending spot-checks in later surfaces. `[NEEDS-LIVE-CONFIRM]` only that no
event-handler-scoped `onSnapshot` was missed by the grep.

#### 4c. `getDownloadURL` (token-based public access) `[VERIFIED-IN-CODE]`

~123 call sites across ~50 files. All observed usages resolve **user-uploaded media**: profile/staff
photos, logos, event/announcement/deal posters, maintenance & incident images, lost-&-found images,
orientation/assessment materials, and RG **reference images** (`restaurantgroup/RefImages.js:11`). Sample:
`uniclub/UniclubMembersPage.js:267`, `business/RestaurantPage.js:227`, `admin/EmployeePage.js:142`.
`getDownloadURL` mints a non-expiring tokenised URL — anyone with the URL can fetch the object regardless
of Storage rules. No **contract-PDF / staff-private-document** exposure via `getDownloadURL` was found in
this pass (contracts are emailed via a Cloud Function, §4e), but the storage-rules review is deferred.
`[NEEDS-DECISION]` whether any of these buckets hold sensitive media that should not be world-fetchable.

#### 4d. `pdfmake` version `[VERIFIED-IN-CODE]`

**`pdfmake` appears nowhere** — not in `package.json`, `package-lock.json`, `src/`, or `scripts/`
(grep returned zero hits). The required-version concern (must be `0.2.23`, not `0.3.x`) is **not
applicable to this repo**. PDF/printing here is done via **`react-to-print` `^3.1.1`** (`package.json:46`);
no `jsPDF` either. Contract PDFs are rendered server-side (Cloud Function, §4e). `[NEEDS-DECISION]` — if a
pinned `pdfmake@0.2.23` was expected, it may live in a **different** repo (functions backend / MyMorOps),
not MyMorAdmin.

#### 4e. Contract send target `[VERIFIED-IN-CODE]`

- `pages/restaurantgroup/ContractGeneratorPage.js:245` —
  `const sendTarget = (priv && priv.contactEmail) || selStaff?.email || "";`
- `priv` is the staff **private/details** doc (`staffPrivateDoc(groupId, staffId)`), so the **primary
  recipient is `contactEmail` from `private/details`** — matching the requirement (NOT the admin-login
  email). It **falls back** to `selStaff.email` (the group-level staff doc's email, which can be the
  admin-login email) only when no private `contactEmail` is set.
- The chosen address is persisted on the draft as `employeeContactEmail` (`ContractGeneratorPage.js:259`)
  and the actual send is a Cloud Function call `fn({ groupId, contractId, resend, confirmEmpty, testTo })`
  (server reads the stored email and sends).
- `[NEEDS-DECISION]`: fallback to admin-login email when `contactEmail` is blank could send a contract to
  the wrong inbox; there is no hard block on empty `sendTarget` (TODO noted at `ContractGeneratorPage.js:248`).

#### 4f. `rgConfig.js` / `RGContext.js` copies `[VERIFIED-IN-CODE]`

`find` over the whole repo (excluding `node_modules`) returned **exactly one of each**:
- `src/pages/restaurantgroup/rgConfig.js`
- `src/pages/restaurantgroup/RGContext.js`

**No duplicate copies exist**, so there is no divergence to diff. (The concern about multiple
out-of-sync copies does not apply in this repo — again, a second copy may live in **MyMorOps**, out of
scope here.)

#### 4g. Plaintext credentials / hardcoded IDs & keys `[VERIFIED-IN-CODE]`

**Plaintext passwords generated / stored / displayed:**
- `scripts/importer/provision-group.js:16` — `const MANAGER_PASSWORD = "MadKitchen2026!";` — hardcoded,
  written to both `employees` and `users` docs (`provision-group.js:63,68`, field `password`) and printed
  to stdout (`provision-group.js:76`).
- `scripts/importer/import-staff.js:55` — admin logins created with
  `password: \`${s.name.replace(/\s+/g,"")}654321\`` (e.g. `JaneDoe654321`) — **name-derived, guessable**.
  PINs printed to console (`import-staff.js:74`, `pin=${pin}`).
- `pages/business/RestaurantPage.js:698` — `const password = form.defaultPassword?.trim() || "Restaurant@123";`
  — hardcoded default password for created restaurant logins.
- `pages/business/BusinessEmployeePage.js:430` — `const password = \`${(form.name||"User").trim()}654321\`;`
  — same guessable name-based scheme.
- **`password` stored in Firestore** on `employees`/`users` docs in plaintext:
  `RestaurantGroupsPage.js:295,300` (`password` field on both docs), `provision-group.js:63,68`.
- **Credentials shown in the RG UI:** `StaffDirectoryPage.js:927` renders `PIN {s.pin}` on the staff card;
  `StaffDirectoryPage.js:1072` shows the login password when the `showPayroll` toggle is on;
  `UserManagementPage.js:78` adds `Email / Password / PIN` table columns behind a `showCreds` toggle.
  POS PINs and login passwords are therefore viewable in-app by anyone with the page + toggle.
  `[NEEDS-DECISION]` — storing/displaying plaintext passwords & PINs.

**API keys / tokens (client-side env):** `.env`, `.env.development`, `.env.production` contain Firebase
API keys (public by Firebase design), plus **Mapbox public tokens** and **FCM VAPID keys**. Firebase web
keys are safe to ship; Mapbox/VAPID should be URL-restricted/rotated if leaked. `[NEEDS-DECISION]`

**Hardcoded document/tenant IDs:** none found in production data paths. The only literals are venue
**color-palette** keys for the first client (`utils/restaurantGroupPaths.js:143-146`: "Mad Benji", "Hey
Sister", "Mad Hot Pot", "Main Kitchen"), form **placeholder** text in superadmin/RG settings pages, and
`"g1"/"v1"/"s1"` **test mocks**. The provisioning **script** hardcodes `GROUP_ID`/`GROUP_NAME`/manager
identity, which is expected for a one-off importer, not app code.

---

### 5. Firestore rules snapshot (context for every finding above) `[VERIFIED-IN-CODE] / [NEEDS-LIVE-CONFIRM]`

`firebase.json` maps two databases: `mymor-australia` → `firestore.mymor-australia.rules`, and
`(default)` → `firestore.default.rules`. The app connects to `mymor-australia` in prod and
`mymor-dev-aus`/named DB otherwise (`firebase.js:53-58`, `... || "mymor-australia"`).

- **`firestore.default.rules`** contains a wide-open bottom catch-all:
  `match /{document=**} { allow read, write: if true; }` (`firestore.default.rules:66-68`), plus
  `match /University/{document} { allow read,write: if true; }` and `emailVerifications … if true`.
  If any client ever targets the `(default)` DB, isolation is **entirely absent**. `[NEEDS-LIVE-CONFIRM]`
  whether the default DB holds real data / is reachable.
- **`firestore.mymor-australia.rules`** is materially stricter: RG collections gated by
  `rgIsGroupMember/rgIsGroupAdmin/rgCanManageStaff` helpers (`:210-212`, `:91-157`), `employees`/`users`
  gated by hostelid-match + self-read + RG create/update (`:225-243`), OTP collections denied to clients
  (`:249-251`). **But** it still has permissive rules: `eventcategory … if true` (`:256`),
  `University … read: if true` (`:257`), and a **bottom catch-all**
  `match /{coll}/{rest=**} { allow read, write: if isSignedIn() && coll != 'restaurantGroups' && !rgIsGroupUser(); }`
  (`:260-262`) — i.e. **any signed-in non-RG user can read/write any not-explicitly-matched top-level
  collection.** This is what backstops (or fails to backstop) the unscoped client reads in §2b.
  `[NEEDS-DECISION]` — this catch-all is the single most important isolation risk to evaluate live.

Storage rules (`storage.rules`, `storage.default.rules`, `storage.backup-aus.rules`) were located but not
analysed in this pass — deferred to the storage/media surface.

---

### 6. Proposed per-surface audit list (one per later session)

Derived from the **actual** folder structure and the findings above, ordered by isolation risk.

1. **Firestore & Storage security rules** — `firestore.mymor-australia.rules`, `firestore.default.rules`,
   `storage*.rules`. The bottom catch-alls (§5) decide whether every §2b unscoped read is contained.
   Highest priority; everything else is rule-dependent.
2. **Routing & auth backbone** — `App.js`, `routes/*` (incl. dead `RequireContext.js`), `Sidebar.js`
   vertical key-sets, `app/features/AuthSlice.js`. Confirm/decide the nav-only gating gap (§2c/§2d).
3. **`pages/admin/` (hostel, 36 files)** — focus: `AnnouncementPage` (all-employees read),
   `OrientationPage` (all-users read), Maintenance/Feedback/ReportIncident/Student filter-scoping,
   `EmployeePage`/`EmployeeSettingPage` `role` writes, `MessagesPage` DM scoping.
4. **`pages/university/` (36 files)** — same surfaces as hostel plus the unused `emp`/`filterByScope`/
   `scopePayload` dead-scoping smell across the Phase-1 pages; `UniversityAnnouncementPage` all-employees read.
5. **`pages/business/` (19 files)** — `services`/`products`/`deals` scoped by `businessId==uid`;
   `collectionGroup` on `servicebookings`/`productOrders`; login-creation plaintext passwords
   (`RestaurantPage`, `BusinessEmployeePage`).
6. **`pages/uniclub/` (13 files)** — `uniclubs/{id}/*` subcollection scoping; `UniclubCommunity`
   all-employees read; subgroup pages reachable via admin tree.
7. **`pages/restaurantgroup/` (66 files)** — largest surface; `RGContext`/`ProtectedRoute`/`rgConfig`
   permission model, global `employees` login/permission writes (`StaffDirectoryPage`,
   `UserManagementPage`), contract send flow (`ContractGeneratorPage`), plaintext PIN/password display.
   Consider splitting into staff/shifts/contracts vs stock/menus/compliance sub-sessions.
8. **`pages/superadmin/` (24 files)** — expected-global reads; verify no unintended writes with hardcoded
   ids and that owner-creation (`RestaurantGroupsPage`) is superadmin-gated end-to-end.
9. **`scripts/importer/` (provisioning + schema source of truth)** — plaintext credentials in
   `provision-group.js` / `import-staff.js`; confirm these are run-once operational scripts, not shipped.
10. **Shared components / hooks / storage media** — `components/*` (Layouts, `RestaurantShared`,
    `EditorPro`, `MapLocationInput`), `hooks/*`, and the `getDownloadURL` tokenised-media exposure across
    all verticals.
```

---

## Surface #1 — Firestore rules

Read-only audit of the Firestore security rules. Nothing was edited, deployed, or committed. No writes to
production; the emulator was **not** run (see below). A rule's real effect is the OR of every matching rule;
verdicts below distinguish what the rule *text* proves from what only an emulator/live test can confirm.

### 0. Freshness & scope `[VERIFIED-IN-CODE]`

- **Branch** `main`; **HEAD** `8c50bc6d7b3328af1fce3565b299c32557d2f325` — `2026-07-03 11:49:03 +1000` —
  *"fix(holidays): use venueState in planner weekly hoursByType (last raw venue-state read)"*.
  Tree carries one untracked file (`AUDIT_FINDINGS.md`). **HEAD advanced since Phase 0** (`7fab002` → `8c50bc6`).
- **Rules files (2), mapped in `firebase.json:2-5`:**
  ```
  2:  "firestore": [
  3:    { "database": "mymor-australia", "rules": "firestore.mymor-australia.rules" },
  4:    { "database": "(default)",       "rules": "firestore.default.rules" }
  5:  ],
  ```
  So `firestore.mymor-australia.rules` (264 lines) governs the DB the app actually uses in prod;
  `firestore.default.rules` (73 lines) governs `(default)`.
- **⚠ The rules text pasted in the task prompt is NOT the on-disk committed file.** The paste contains a
  helper `rgCanApproveAvailability` and a status-gated `/availability` block; the committed
  `firestore.mymor-australia.rules` at HEAD has **neither** — it defines only `rgCanApproveLeave` (`:41-45`)
  and its `/availability` block (`:147-152`) allows create/update for **any group member**. This audit is of
  the **on-disk committed file** (the deployable source of truth). If a newer hardened draft exists, it is
  uncommitted/undeployed. `[VERIFIED-IN-CODE]` (grep confirmed `rgCanApproveAvailability` absent on disk).
- **Emulator NOT run** `[NEEDS-LIVE-CONFIRM]`: this sandbox has **no Java runtime** (Firestore emulator
  requires it) and `@firebase/rules-unit-testing` is **not installed**. Per instructions I did not install a
  JRE or touch prod. A ready-to-run isolation test is provided in §"Emulator isolation test" below; until it
  runs, every table verdict is a rules-text prediction, tagged `[NEEDS-LIVE-CONFIRM]` for the live result even
  where the text is unambiguous.
- **Verification method:** the load-bearing semantic claims were run through a 21-agent adversarial refute
  panel (3 independent lenses per claim: OR-semantics, list/collectionGroup-query, exact-text). **All 7 claims
  survived 3–0.** That raises confidence in the *reading of the rules*; it is not a substitute for an emulator
  run, which is why leaks remain `[NEEDS-LIVE-CONFIRM]` for the live behaviour.

---

### 1. HEADLINE — the bottom catch-all defeats almost every other rule `[VERIFIED-IN-CODE] / [NEEDS-LIVE-CONFIRM]` · **CRITICAL**

`firestore.mymor-australia.rules:260-262`, verbatim:
```
    match /{coll}/{rest=**} {
      allow read, write: if isSignedIn() && coll != 'restaurantGroups' && !rgIsGroupUser();
    }
```
with the gate helper (`:31`):
```
    function rgIsGroupUser() { return rgHasEmp() && rgEmp().get('groupId', null) != null; }
```

**What the text proves.** Firestore rules are purely additive: a request is allowed if **any** matching
`allow` is true; there is no deny, no precedence, no specificity, and `allow … if false` contributes no grant
and therefore cannot cancel a `true` from another matching block. This catch-all is a sibling of every explicit
top-level block, and its path `/{coll}/{rest=**}` matches **every** top-level collection document. Its
condition depends only on the **caller** (`request.auth` + an `exists()/get()` on the caller's *own*
`employees/{uid}`), never on the queried doc's `resource` fields. Therefore, for any signed-in principal whose
own `employees` doc has **no `groupId`** (every hostel / university / uniclub / business admin, **and** any
authenticated account with no `employees` doc at all), the catch-all grants **read + write to every top-level
collection except `restaurantGroups`** — cross-tenant and cross-vertical, and (because the condition ignores
`resource`) it authorises **unfiltered list queries** too. The stricter explicit rules for `employees`,
`users`, `hostel`, and the `if false` locks on the OTP collections do **not** constrain these users at all.

> The rules author demonstrably knows OR-semantics — the `venues` block (`:96-98`) says *"Firestore ORs
> overlapping matches, so the only way to NARROW is to exclude here"* and uses `!(coll in […])* to narrow.
> That same technique was applied to `restaurantGroups` in the catch-all but **not** to `employees`, `users`,
> or the OTP collections — so this is an omission, not a misunderstanding of intent.

**Worst consequence — privilege escalation to superadmin `[VERIFIED-IN-CODE, rules text]`:**
`rgIsSuper()` (`:18-24`) returns true if `rgEmp().type == 'superadmin'`, i.e. it trusts the caller's own
`employees/{uid}.type` field. The catch-all grants that same caller **write** on `employees`. So a signed-in
non-RG user can `setDoc`/`updateDoc` **their own** `employees/{uid}` doc to `{ type: 'superadmin' }` (creating
it if absent), after which `rgIsSuper()` is true — unlocking **all `restaurantGroups` data** (payroll TFN /
bank / super in `restaurantGroups/*/staff/*/private`), which was the one subtree the catch-all otherwise
protects. Net: the isolation of the entire ruleset collapses to "any authenticated account." This chain is
proven by the rule text; the live exploit is `[NEEDS-LIVE-CONFIRM]` via the emulator test.

**This answers the Phase 0 open question:** the nav-only routing gap (unguarded `AdminRoutes`, dead
`RequireContext`) is **NOT contained by Firestore rules** — it is exploitable at the data layer. The Phase 0
unfiltered reads (`AnnouncementPage.js:166`, `UniversityAnnouncementPage.js:244`, `UniclubCommunity.js:79`,
`OrientationPage.js:144`) are authorised by the catch-all and return **all tenants' rows**.

---

### 2. Catch-all fall-through table  *(lead deliverable)*

Every collection the client touches (from `grep collection(db,…)` / `doc(db,…)` across `src/`) plus every
collection with an explicit rule. "Overridden" = has a stricter explicit block that the catch-all OR-defeats
for a signed-in non-RG user. All verdicts are `[NEEDS-LIVE-CONFIRM]` for the live result (emulator not run);
the rules-text basis is stated. Line numbers are `firestore.mymor-australia.rules`.

| collection | explicit match above catch-all? | that match's scope (verbatim cond.) | VERDICT (for a signed-in **non-RG** user) |
|---|---|---|---|
| `restaurantGroups/**` | yes, `:47-213` | `rgIsSuper() \|\| rgIsGroupMember(groupId)` (+ nested per-collection) | **intercepted-and-scoped** — catch-all excludes `restaurantGroups`; non-RG user gets nothing. The only isolated top-level tree. |
| `employees` | yes, `:225-232` | `resource.data.hostelid == userHostelId() && hostelActive(...)` (+ self-read + RG create/update) | **intercepted-but-unscoped** → catch-all grants **r/w to ALL** employees. **CRITICAL** (cross-tenant; enables the §1 escalation). |
| `users` | yes, `:234-241` | `resource.data.hostelid == userHostelId() && hostelActive(...)` (+ self) | **intercepted-but-unscoped** → catch-all grants **r/w to ALL** users. **CRITICAL** (cross-tenant PII). |
| `hostel` | yes, `:215-219` | read: `token.role=='superadmin'`; write: superadmin/type | **intercepted-but-unscoped** → catch-all grants non-superadmins **read AND write** to all hostel docs (write broader than the explicit superadmin-only intent). **CRITICAL**. |
| `emailVerifications` | yes, `:245` | `if false` | **intercepted-but-unscoped** → `if false` grants nothing; catch-all grants r/w. **CRITICAL** (lock defeated). |
| `emailOtps` | yes, `:250` | `if false` | **intercepted-but-unscoped** → catch-all grants r/w. **CRITICAL** — email + OTP **code-hash** exposed to any signed-in non-RG user; the `:247-249` comment ("deny … via the bottom catch-all") is inverted. |
| `passwordResetOtps` | yes, `:251` | `if false` | **intercepted-but-unscoped** → catch-all grants r/w. **CRITICAL** (password-reset OTP exposure/forgery). |
| `adminMenuState/**` | yes, `:221-223` | `request.auth.uid == uid` | **intercepted-but-unscoped** → catch-all grants r/w to anyone's UI state. **RISK** (low-sensitivity badge state). |
| `discoverfile/**` | yes, `:258` | write: `request.auth.uid == uid` | **intercepted-but-unscoped** → catch-all also grants r/w. **RISK**. |
| `events`,`eventBookings`,`eventcategory`,`User`,`University` | yes, `:253-257` | mixed (`if true` reads, self reads) | **DEAD + FALLS-THROUGH** — case/name-mismatched to the client's actual collections (client uses lowercase `university`, `users`, `publicevents…`); explicit rules never fire for this client, and grants come from the catch-all. **SMELL** (see §5). Note `eventcategory`/`University` reads are `if true` = **unauthenticated-readable**. |
| `university` (lowercase) | **no** | — | **FALLS-THROUGH** → catch-all r/w, cross-tenant. **CRITICAL** (100 client call-sites; primary university-vertical data). |
| `uniclubs`, `uniclubsubgroup` | **no** | — | **FALLS-THROUGH** → catch-all r/w, cross-tenant. **CRITICAL** (club data, members, join requests). |
| `deals` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **CRITICAL** (any admin can read/edit any business's deals). |
| `restaurants`, `businesses` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **CRITICAL** (business profiles cross-tenant). |
| `products`, `services` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **CRITICAL** (marketplace catalogue cross-tenant). |
| `dms_conversations/**` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **CRITICAL** (private DMs readable/writable by any signed-in non-RG user). |
| `poi` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **RISK/CRITICAL** (superadmin surface writable by any non-RG user). |
| `role`, `uniclubrole` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **CRITICAL** (role/permission taxonomy is writable → indirect priv-esc surface). |
| `publicevents`,`publiceventbookings`,`publiceventcategory`,`publiceventsView`,`punliceventpaymenttype` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **RISK** (public-event data + a typo'd collection name `punlic…`). |
| taxonomy: `dealcategory`,`dealmode`,`dealslot`,`dealstatus`,`dealoffertype`,`dealredemptionmethod`,`dealdiscoverytag`,`dealmfeedsection`,`discovercategory`,`servicecategory`,`servicesubcategory`,`productcategory`,`restaurantcategory`,`uniclubcategory`,`itemcategory`,`maintenanceitems`,`maintenancetype`,`problemcategory` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **RISK** (global lookup tables writable by any signed-in non-RG user → content tampering). |
| `restaurantAnalytics` | **no** | — | **FALLS-THROUGH** → catch-all r/w. **RISK**. |

**`employees` / `users` first (as required):** a signed-in non-RG user of vertical A (e.g. hostel-A admin,
`token.hostelId='hostelA'`, `employees` doc with no `groupId`) **can** read vertical/tenant B's `employees` and
`users` rows. The explicit blocks at `:225-241` would deny (hostelid mismatch), but the catch-all at `:260`
ORs a `true` grant that ignores `resource`, so both the per-doc get **and the unfiltered `getDocs(collection(
db,'employees'))` list** are authorised across all tenants. `[VERIFIED-IN-CODE, rules text; NEEDS-LIVE-CONFIRM]`.

**collectionGroup queries `[VERIFIED-IN-CODE, rules text] / [NEEDS-LIVE-CONFIRM]`:** `servicebookings`
(`src/pages/business/ServiceBookingPage.js:100`) and `productOrders` (`src/pages/business/ProductOrderPage.js:166`)
are **subcollections** (`services/{id}/servicebookings`, `products/{id}/productOrders` — confirmed at
`ServiceBookingPage.js:184,207`, `ProductOrderPage.js:292`, `utils/firestorePaths.js:20,26`). A collectionGroup
query is authorised **only** by a rule whose path has a recursive-wildcard **prefix** before the literal
collection id, e.g. `match /{path=**}/servicebookings/{doc}`. **No such rule exists** in either file (grep for
`/{…=**}/<coll>` returned none). The top-level catch-all `/{coll}/{rest=**}` binds `{coll}` to the *first*
segment and does **not** participate in collectionGroup evaluation. **Verdict:** these two collectionGroup
queries are **DENIED** by the rules → the feature likely errors at runtime (a functional bug), unless a
collection-group rule is deployed live that is absent from this repo (`[NEEDS-LIVE-CONFIRM]`). Independently:
the client `where("businessId","==",businessId)` is a **query filter, not a security boundary** — rules, not
client filters, decide access. Stated explicitly as requested.

---

### 3. The `(default)` database — `allow read, write: if true` `[VERIFIED-IN-CODE] / [NEEDS-LIVE-CONFIRM]` · **CRITICAL-if-populated**

`firestore.default.rules:64-66`, verbatim:
```
     match /{document=**} {
      allow read, write: if true;
    }
```
Recursive `{document=**}` matches every path; `if true` requires **no sign-in**. So **any caller, including
unauthenticated**, has full read+write to the entire `(default)` database. Additivity makes every narrower rule
in that file redundant (and note `firestore.default.rules:33-35` is a second fully-open `emailVerifications …
if true`). `firebase.json:4` maps this file to `(default)`.

**Which DB does the client connect to?** The **only** Firestore initialisation in client code is
`src/firebase.js:60-64`:
```
60:const db = initializeFirestore(app, {}, FIRESTORE_DATABASE_ID);
```
with (`:56-59`) `FIRESTORE_DATABASE_ID = production ? (REACT_APP_FIREBASE_PROD_DATABASE_ID || "mymor-australia")
: (REACT_APP_FIREBASE_DEV_DATABASE_ID || "mymor-dev-aus")`. There is **exactly one** `initializeFirestore`
and **no other** `getFirestore(...)` call anywhere in `src/`. **No client path resolves to `(default)`.** So
the open rule is reachable only by a caller that *explicitly* targets the `(default)` DB (e.g. Admin SDK,
another app, or a hand-crafted client). **Severity is `[NEEDS-LIVE-CONFIRM]`:** it depends entirely on whether
the `(default)` database exists and holds any collections in `mymor-one`/`mymor-development` — a one-look check
in the Firebase console for the human, not assertible from code. If `(default)` is empty/unused, this is latent;
if it holds any data, it is world-readable/writable.

**Additional gap — the dev DB has no rules file `[VERIFIED-IN-CODE]` · BUG:** the dev client connects to
`mymor-dev-aus` (`firebase.js:59`), but `firebase.json:2-5` maps rules only for `mymor-australia` and
`(default)`. **No rules file is mapped to `mymor-dev-aus`.** This repo does not manage or deploy rules for the
database the app uses in development; whatever is live there is out of source control. `[NEEDS-LIVE-CONFIRM]`
what those deployed rules are.

---

### 4. Emulator isolation test (authored; NOT run) `[NEEDS-LIVE-CONFIRM]`

The Firestore emulator cannot run here (no Java). A ready test is written to
`scratchpad/rules.isolation.test.js` (copy into the repo under e.g. `rules-tests/` to run). Assertions encode
the **secure** expectation, so a **failing** test = a **verified leak**. Coverage: (a) hostel-A admin → hostel-B
`employees` = expect DENY; (b) same for `users`; (c) unfiltered `employees` list = expect DENY; (e) locked
`emailOtps` read = expect DENY; (d) RG scoping sanity — groupX manager reads own staff = ALLOW, other group's
staff = DENY. Per the table, (a)(b)(c)(e) are **predicted to ALLOW** on the current rules — i.e. those tests are
expected to **fail**, which is the point: their failure is the confirmed leak. Run commands:
```bash
# from the MyMorAdmin repo root; requires a Java runtime installed first (e.g. `brew install temurin`)
npm i -D @firebase/rules-unit-testing            # dev-only; talks ONLY to the local emulator
npx firebase emulators:exec --only firestore \
  "npx jest rules-tests/rules.isolation.test.js" # emulator is local + in-memory — never touches prod
```
Until this runs, §1–§3 leaks are `[VERIFIED-IN-CODE]` at the rules-text level and `[NEEDS-LIVE-CONFIRM]` for
live behaviour.

---

### 5. Other rule findings

- **Write broader than read / unintended write** `[VERIFIED-IN-CODE]` · RISK: `hostel` (`:215-219`) intends
  superadmin-only, but the catch-all opens **write** to any non-RG user (§2). `University` (`:257`) is
  `read: if true` (unauthenticated read) with `write: if signed-in`. `eventcategory` (`:256`) is `read: if
  true` — both allow **unauthenticated reads** on the prod DB regardless of the client. `[NEEDS-DECISION]`.
- **Unauthenticated access** `[VERIFIED-IN-CODE]`: `(default)` catch-all `if true` (§3); `University:257` and
  `eventcategory:256` reads `if true` in the prod file. No `isSignedIn()` guard on those three.
- **`if false` that does nothing** `[VERIFIED-IN-CODE]` · BUG: `emailVerifications:245`, `emailOtps:250`,
  `passwordResetOtps:251` — defeated by the catch-all (§1/§2). The protective comment is inverted.
- **Dead / shadowed explicit rules** `[VERIFIED-IN-CODE]` · SMELL: `events:253`, `eventBookings:254`,
  `User:255`, `eventcategory:256`, `University:257` target collection ids the admin client does not use under
  those exact (case-sensitive) names; they never fire for this client and are also OR-superseded by the
  catch-all. The tenant-scoped `employees:225-228` / `users:234-237` conditions are likewise **effectively
  dead** for non-RG users (OR-defeated). `[NEEDS-DECISION]` whether MyMorApp relies on the mixed-case ones.
- **`supervisor`/`areaOf` fallback check:** none present — `rgIsOwnStaff` (`:33-38`) uses an **exact** `adminUid
  == request.auth.uid` or exact `email` match, not an area/supervisor fallback. Clean on that specific concern.
- **Default-DB helper bug** `[VERIFIED-IN-CODE]` · SMELL (moot): `firestore.default.rules:8` calls
  `get(/databases/$(db)/…)` but the path variable is `{database}` (`:4`) — `$(db)` is undefined. Harmless only
  because the `if true` catch-all short-circuits any need for it.
- **RG subtree** `[VERIFIED-IN-CODE, rules text]`: the nested `restaurantGroups/*` rules (`:47-212`) are the one
  area that is genuinely group-scoped (member/admin/manage helpers, `private` payroll gated to owner/storeAdmin,
  the `!(coll in […])` narrowing at `:99-101`). This scoping holds **only** as long as the §1 self-escalation to
  `rgIsSuper()` is closed — otherwise it is bypassable. `[NEEDS-LIVE-CONFIRM]`.

---

### 6. Categorised summary & proposed fixes *(proposals only — DO NOT APPLY, DO NOT DEPLOY)*

**CRITICAL**
1. **Catch-all grants blanket cross-tenant read+write to non-RG users; enables self-escalation to superadmin**
   (`:260-262`, §1). This subsumes: cross-tenant `employees`/`users` reads (Phase 0 leaks confirmed at the
   rules layer), OTP/email-hash exposure, cross-vertical read/write of `deals`/`restaurants`/`businesses`/
   `products`/`services`/`dms_conversations`/`university`/`uniclubs`/`poi`, and writable role taxonomies.
   - *Minimal containment* `[NEEDS-DECISION]` (changes behaviour for all legacy collections — needs product
     sign-off, not mechanical): make the catch-all **read-only and exclude the sensitive collections**, mirroring
     the existing `restaurantGroups` exclusion, e.g.
     `allow read: if isSignedIn() && !(coll in ['restaurantGroups','employees','users','emailOtps','emailVerifications','passwordResetOtps','hostel','adminMenuState']) && !rgIsGroupUser();`
     and **drop `write`** from the catch-all entirely, adding explicit tenant-scoped write rules per collection.
     This is a design change, not a one-liner; the real fix is deny-by-default + per-collection tenant rules.
   - *Immediately, independently* `[MECHANICAL]`: the `write` grant in the catch-all is what enables the
     `employees.type='superadmin'` escalation — removing `write` from the catch-all (leaving read) closes the
     escalation chain even before the broader redesign. Still `[NEEDS-DECISION]` because some legacy collections
     may depend on client writes; enumerate those first.
2. **`(default)` DB world-open** (`firestore.default.rules:64-66`, §3) — replace the `if true` catch-all with
   `if false` (or real rules). `[MECHANICAL]` to change the text; `[NEEDS-DECISION] / [NEEDS-LIVE-CONFIRM]` on
   what legitimately uses `(default)` first. Severity pending the console check for data in `(default)`.

**BUG**
3. **`if false` OTP locks are ineffective** (`:245/250/251`) — resolved automatically once the catch-all stops
   granting these collections (fix #1). No standalone change; do not rely on `if false` as a lock.
4. **Dev DB `mymor-dev-aus` has no mapped rules file** (`firebase.json:2-5` vs `firebase.js:59`) — add a
   `{ "database": "mymor-dev-aus", "rules": "firestore.mymor-dev-aus.rules" }` mapping and a rules file.
   `[NEEDS-DECISION]` (need the intended dev ruleset).
5. **collectionGroup queries denied by rules** (`ServiceBookingPage.js:100`, `ProductOrderPage.js:166`, §2) —
   if the feature is meant to work, add a scoped collection-group rule
   `match /{path=**}/servicebookings/{id} { allow read: if <server-validated businessId ownership>; }`;
   otherwise the client should query the scoped subcollection path. `[NEEDS-DECISION]`.

**RISK**
6. Unauthenticated reads on `University:257` / `eventcategory:256` in the prod file — add `isSignedIn()` or a
   tighter guard. `[MECHANICAL]` (but confirm no anonymous surface depends on them).
7. Writable global taxonomy/lookup tables and `poi` via the catch-all (§2) — folded into fix #1 (drop catch-all
   write).

**SMELL**
8. Case/name-mismatched dead rules `events/eventBookings/User/eventcategory/University` (`:253-257`) and the
   `$(db)` typo in `firestore.default.rules:8` — remove or correct once the collections they were meant to
   protect are identified. `[NEEDS-DECISION]`.

**Bottom line for the routing question:** Phase 0's nav-only vertical gating is **not** backstopped by rules —
the catch-all makes the deep-link exposure real at the data layer for any signed-in non-RG user, and the
`employees` write path escalates that to full superadmin. This is the highest-priority item across both phases.
All predictions are `[VERIFIED-IN-CODE]` at the rules-text level and adversarially confirmed 3–0; promote them
to `[VERIFIED-LIVE]` by running the §4 emulator test (needs a Java runtime), and do the one-look console check
for whether `(default)` holds data.
