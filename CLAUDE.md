# CLAUDE.md — MyMorAdmin

> Persistent context for Claude Code. This repo is **MyMorAdmin**, the web admin dashboard for the entire MyMor platform and the **source of truth for the Firestore schema**. See [Platform Context](#platform-context) for the other three apps.

---

## 1. What this app is

A multi‑tenant **admin SaaS dashboard** managing every MyMor entity type: hostels, universities, uni clubs, businesses/restaurants, and restaurant groups — with a superadmin tier overseeing all of them.

- **Stack:** React 19 + React Router 7 + Redux Toolkit, **Create React App** (`react-scripts`), MUI 7 + Tailwind 3.
- **Firebase:** `firebase` JS SDK 11.8 (modular). Dual‑database aware (named AU database in prod).
- **Deploy:** Firebase Hosting, two targets (`dev` → `mymor-development`, `prod` → `mymor-one`). Build output in `build/`.

### Run / deploy
```bash
npm run start:dev     # dotenv -e .env.development react-scripts start
npm run start:prod
npm run build:dev     # / build:prod
npm run deploy:dev    # build:dev + firebase deploy --only hosting:dev --project dev
npm run deploy:prod
```
`prestart`/`prebuild` run `scripts/inject-sw.js` (injects the FCM messaging service worker). Env files: `.env.development`, `.env.production` (prefixed `REACT_APP_FIREBASE_DEV_*` / `_PROD_*`).

---

## 2. Folder structure & conventions

```
src/
├── App.js                # Router root; picks layout by auth type
├── firebase.js           # Firebase init (dual-database)
├── app/
│   ├── Store.js
│   └── features/AuthSlice.js     # { isLoggedIn, type, employee, user, activeOrg }
├── auth/LoginPage.js
├── components/           # Layout(s), NavBar, Sidebar(s), Header, MapLocationInput,
│                         #   EditorPro (Tiptap), RestaurantShared, UniversityScopeBanner …
├── hooks/                # useRestaurantDoc, useDealSettings, useUniversityScope
├── routes/               # AdminRoutes, SuperAdminRoutes, RestaurantGroupRoutes, RequireContext
├── pages/
│   ├── admin/            # ~39 hostel pages
│   ├── university/       # ~29 university pages
│   ├── uniclub/          # ~11 club pages
│   ├── business/         # ~14 business/restaurant pages
│   ├── restaurantgroup/  # ~12 RG pages + RGContext.js, rgConfig.js, rgUtils.js
│   └── superadmin/       # ~13 superadmin pages
└── utils/
    ├── firestorePaths.js          # hostelCol/universityCol/restaurantCol/productCol/serviceCol
    └── restaurantGroupPaths.js    # groupCol/venueCol/staffCol/staffPrivateDoc + PER_VENUE_COLLECTIONS
scripts/                  # importers + Excel/PDF parsers (see §6)
```

**Conventions:** Pages PascalCase ending `Page.js`; one folder per entity tenant. Path helpers always go through `utils/*Paths.js`. Forms use Formik + Yup. Charts use `@mui/x-charts`.

---

## 3. Routing (by auth type)

`App.js` chooses a layout/route tree from the Redux `type`:

- **`type === "superadmin"`** → `SuperAdminLayout` + `SuperAdminRoutes` (`/dashboard`, `/employee`, `/university`, `/hostel`, `/uniclub`, `/business`, `/restaurantgroups`, `/event`, `/deal`, `/poi`, `/setting`).
- **`type === "admin"` with a restaurant group** → `RestaurantGroupLayout` + `RestaurantGroupRoutes` under `/rg/*`: `staff, shifts, leave, training, checklists, performance, messages, users, settings`.
- **`type === "admin"` (hostel/uni/club/business)** → `Layout` + `AdminRoutes`: hostel/university/uniclub/business pages (dining, cleaning, maintenance, bookings, announcements, events, resources, feedback, FAQ, checklists, parcels, wellbeing, orientation, restaurants, deals, orders, reservations, analytics, etc.).
- Public: `/login`, `/privacy`, `/support`, `/requestdelete`, `/choose` (multi‑org picker).

---

## 4. Modules built & live

All entity dashboards are live. Highlights:
- **Hostel** (~39): dining, cleaning, tutorial schedule, maintenance, room booking, announcements, events, academic groups, feedback, FAQ, checklists, room info, parcels, wellness prompts, first‑week journey, orientation, guest log, inspection, wellbeing, lost & found, student/employee mgmt.
- **University** (~29): hostel set + assessments (`units/{unitId}/tutorials`), deals, inspection, custom feedback/report/maintenance taxonomies.
- **Uni Club** (~11): club CRUD, members, join requests, events, announcements, community feed, subgroups.
- **Business** (~14): business/restaurant profiles, menu, QR tables, deals, orders, reservations, reviews, analytics, inventory, products, services.
- **Restaurant Group** (`/rg/*`, ~12): staff directory (with payroll/cert/PIN), shift planner, leave, training assignment, checklists/SOPs, performance notes, messaging, audit log, user permissions, settings. *(Mirrors the MyMorOps mobile app.)*
- **Superadmin** (~13): cross‑entity oversight, employee/role mgmt, global deal/event/product/service/market settings, business registry, restaurant groups, POI.

---

## 5. Third‑party integrations

| Lib | Purpose |
|-----|---------|
| `firebase` 11.8 + `firebase-tools` | backend + deploy |
| `@reduxjs/toolkit`, `react-redux` | auth/app state |
| `react-router-dom` 7 | routing |
| `@mui/material` 7, `@mui/x-charts`, `@emotion/*` | UI + dashboard charts |
| `tailwindcss` 3, `lucide-react` | utility styling + icons |
| `formik` + `yup` | forms + validation |
| `@tiptap/react` + starter‑kit | rich text (deals, announcements) → `EditorPro.js` |
| `mapbox-gl` + `@mapbox/mapbox-gl-geocoder`, `@react-google-maps/api`, `use-places-autocomplete` | maps/geocoding/address |
| `xlsx`, `file-saver`, `react-to-print` | import/export/print |
| `html5-qrcode` | QR table scanning |
| `react-toastify`, `react-spinners` | toasts / loaders |
| `dayjs`, `date-fns`, `react-datepicker`, `react-date-range` | dates |
| `country-state-city` | address dropdowns |

Storage: image uploads (logos, deal posters, event/parcel images). FCM web push via `firebase-messaging-sw.js` (injected at build).

---

## 6. Scripts / importers (provisioning + schema source of truth)

`scripts/importer/` (Node) provisions restaurant groups — these reveal the canonical schema:
- `provision-group.js` — creates group doc, venues, manager user (used for **Mad Kitchen Group**).
- `import-staff.js` — CSV → `restaurantGroups/{groupId}/staff/{id}`, generates PINs, creates Firebase Auth + `employees/{uid}` + `users/{uid}` for staff with admin access.
- `import-training.js`, `import-checklists.js`, `import-content.js` — per‑venue content.
- `upload-ref-images.js`, `backfill-assignment-snapshots.js`.
- Python parsers (`parse_*.py`, `make_test_list.py`, `update_station_template.py`) parse duty rosters / training PDFs / Excel.

---

## 7. Firestore schema (CANONICAL)

> Field lists are inferred from code usage; the importers + `utils/*Paths.js` are authoritative. Camel‑case JS / lowercase‑id fields (`hostelid`, `universityid`, `uniclubid`, `groupId`) scope records to a tenant.

**Identity / access**
- **`users/{uid}`** — app users (students/guests): `uid, firstname, lastname, email, createddate, hostelid, universityid, uniclubid, groupId, roles{}, groupRole, permissions{}`.
- **`employees/{uid}`** — staff/admin: `uid, name, email, type(superadmin|admin|user), role, groupRole, empType(restaurantGroup|hostel|university|uniclub|business), groupId, groupName, venueId, venueIds[], permissions{}, isActive, status, hostelid, uniclubid, universityid, createdAt`.

**Tenant trees** (each `{id}` doc has many subcollections)
- **`hostel/{id}`** + subs: `announcements, events, resources, feedback, feedbackitems, faq, maintenance, tutorialschedule, menus, checklists, checklistSubmissions, guestLogs, journeyTemplates, studentJourneys, studentOrientation, orientationModules, lostAndFound, parcels, parcelTemplates, roomInfo, wellbeingCheckIns, wellbeingResources, wellnessPrompts`.
  - `maintenance`: `roomno, problemcategory, itemcategory, item, description, cause, comments, image, status(pending|in progress|closed|resolved), assignedTo[], assignEmails[], createdAt`.
  - `menus`: `date, breakfast[], lunch[], dinner[]`. `tutorialschedule`: `date, time, subject, tutor`.
- **`university/{id}`** + subs: hostel‑like set plus `roombookings, bookingroomtype, cleaning, diningmenu(+_uploads), eventcategory, eventpaymenttype, eventbookings, reports, reportitems, roominfo, roles, units, assessments, academiccategory, groups, maintenance(+taxonomies)`.
  - `units/{unitId}/tutorials`: `date, time, location, tutor`. `groups/{groupId}` → `members`, `joinRequests`.
- **`uniclubs/{id}`** — `name, description, category, presidentId, universityid, memberCount, joinRequestCount, createdAt` + subs `members, joinRequests, events, eventbookings, announcements, community`. **`uniclubsubgroup/{id}`** mirrors club subs with `parentGroupId`.
- **`restaurants/{id}`** — `name, brandName, branchName, branchCode, cuisines[], email, phone[], location, address, suburb, city, state, postcode, mapLocation, logoUrl, rating, avgCostForTwo, priceRange, isOpen, isActive, createdBy, createdAt`.

**Restaurant groups** (shared with MyMorOps mobile)
- **`restaurantGroups/{groupId}`** — `name, abn, ownerEmail, ownerName, ownerUid, roles[], createdAt`.
  - **`/venues/{venueId}`** — `name, color, type(FOH|CK|BOH), order, cuisine, status, abn, phone, email, website, priceRange, address{line1,suburb,state,postcode}, hours{mon..sun{open,close}}, createdAt`.
    - per‑venue subs (`PER_VENUE_COLLECTIONS`): `shifts, leaveRequests, trainingModules, trainingAssignments, checklists, checklistAssignments, performanceNotes, kpis, stations`.
  - **`/staff/{staffId}`** (group‑level) — `name, displayName, role, area, inCharge, venueIds[], venueNames[], stationIds[], stationNames[], type(Casual|Part-time|Full-time), certs[]{name,expiry}, hours, training, status(Active|Inactive), pin, email, phone, start, endDate, hasAdminLogin, adminUid, groupRole, permissions{}, createdAt`.
    - **`/staff/{staffId}/private/details`** — sensitive: `legalName, dob, contactEmail, address, tfn, superAccount, superUsi, bankBsb, bankAccount`.
  - `/auditLog, /announcements, /messages` (+ group‑level shifts/leave/training mirrors).

**Commerce / global**
- **`products/{id}`**, **`services/{id}`**, **`deals/{id}`** (rich: `header, category, businessId, businessType, venue{}, discovery{}, schedule{}, redemption{}, booking{}, retail{}, metrics{views,opens,saves,claims,redemptions}, …` + `offers` sub), **`businesses`**, **`publicevents`/`publiceventbookings`/`publiceventsView`**, **`poi`**, **`dms_conversations/{id}/messages`**.
- **Taxonomy/lookup tables:** `dealcategory, dealmode, dealstatus, dealslot, dealdiscoverytag, dealmfeedsection, dealoffertype, dealredemptionmethod, discovercategory, publiceventcategory, productcategory, servicecategory, servicesubcategory, restaurantcategory, itemcategory, maintenanceitems, maintenancetype, problemcategory, role, uniclubrole, uniclubcategory`.

**Auth model:** `type` (superadmin/admin/user) + `groupRole` (owner/storeAdmin/manager/staff) + per‑module `permissions{ staff:'edit|view|none', … }`. Scoped by `hostelid|universityid|uniclubid|groupId|businessid`.

---

## Platform Context

| Repo | Stack | Role |
|------|-------|------|
| **MyMorApp** | React Native 0.78 (JS), React Navigation v7 | Student‑facing app (hostels/universities, marketplace, shop, chat) |
| **MyMorOps** | React Native 0.85 (JS), Redux | Restaurant‑group staff ops (mobile) — mirrors `/rg/*` here |
| **MyMorAdmin** *(this repo)* | React 19 + RR7 + MUI (CRA) | Web admin (all tenants) — schema source of truth |
| **MyMorWeb** | Vite + React + shadcn/ui | Marketing site; Hosting only, no Firestore |

### Shared Firebase
| Env | Project ID | Firestore DB ID | Storage bucket |
|-----|-----------|-----------------|----------------|
| dev | `mymor-development` | `mymor-dev-aus` (MyMorOps) / `mymor-australia` (MyMorApp default) | `mymor-development.firebasestorage.app` |
| prod | `mymor-one` | `mymor-australia` | `mymor-one.firebasestorage.app` (AU bucket `mymor-one`) |

Firestore is a **named non‑default database** in AU‑Southeast1 — pass the DB id when constructing clients. `restaurantGroups/*` schema changes must be kept in sync with **MyMorOps**.

---

## Dates & timezones (restaurant group) — status as of Jul 2026

### THE INVARIANT — read before touching any date code

- **`weekKeyOf` (src/pages/restaurantgroup/rgUtils.js) is DELIBERATE FROZEN LEGACY.** It returns a
  UTC‑shifted date string (`toISOString().slice(0,10)` of a LOCAL Monday midnight → in UTC+10 the key
  names the previous day, e.g. `"2026-07-19"` for Mon 20 Jul). Every stored shift uses it and both
  repos (Admin + Ops) share the convention. **NEVER "fix" it in passing** — changing it requires a
  data migration of every stored `weekKey` AND a synchronised Admin+Ops deploy.
- **Business dates** (a calendar day: roster columns, checklist ticks, stocktake dates, offer dates)
  must be built from LOCAL getters — `localDateKey` (Admin) / `localBusinessDate` (Ops) — **never**
  through `toISOString()`. **Moments** (clock‑ins, order timestamps) are genuine instants and SHOULD
  be ISO timestamps. Do not conflate the two.

### What was fixed (Jul 2026 — Admin `02a869e` + `351a1d1`, Ops `e41b8ab`)

- **The bug class:** `toISOString().slice(0,10)` applied to a LOCAL date yields the PREVIOUS day in
  UTC+10 (any local time before ~10am, and any weekKey re‑parse).
- **Admin sites fixed:** Shift Planner (columns, leave‑check, PH flags, clock anchor, todayISO);
  ChecklistsPage `todayStr`; StockExtraTabs `todayISO` (stocktake date, batch receivedAt);
  ContractGeneratorPage `todayISO` (offer_date); StaffDirectoryPage `shiftDateOf` (hours‑by‑period).
  **Ops:** six equivalent sites (rgUtils `shiftDateStr`/`shiftDateLabel`, shiftTimeLink, Calendar,
  StaffProfile, Checklists).
- **The helpers:** Admin `localDateKey` + `mondayFromWeekKey` (both in rgUtils, next to `weekKeyOf`);
  Ops `localBusinessDate` + `mondayFromWeekKey` (in pure `timeEntry.js`, with a frozen mirror of the
  key function so the jest suite stays firebase‑free). The inverse requires a candidate that IS a
  local Monday AND round‑trips through the key function. Keep the two algorithms in sync.
- **Notable:** shift↔time‑entry matching on Ops had NEVER worked (the shift computed Sunday's date,
  the clock‑in stored Monday's) — fixed by `e41b8ab`.

### Still open

1. **DST (verified 18 Jul 2026 — Melbourne keys survive it, but only by luck of the offset).**
   Executed check across the Oct 2026 spring‑forward (UTC+10 → UTC+11): both offsets shift the key
   by exactly one day, so keys stay consistent either side and within the transition week, and all
   52 Mondays of 2026 round‑trip through `mondayFromWeekKey` (both transitions). The residual risk
   is real but different: the key is still UTC‑derived, and any timezone whose offset crosses 0
   across DST (e.g. UK/Ireland UTC+0↔+1) WOULD key the same week differently in summer vs winter.
   For Australia the format holds; it is safe only as long as the tenant base stays UTC+8…+11.
2. **Multi‑timezone:** the key depends on the DEVICE's timezone — a Melbourne owner opening the
   roster while travelling, or a future client in another timezone, keys the same week differently.
   Blocks multi‑tenant expansion beyond one timezone.
3. **The real fix (Option B):** `weekKeyOf` builds from local getters + each venue carries a
   `timeZone` field; moments display in VENUE time, not device time. Requires migrating every stored
   `weekKey` and a synchronised two‑app deploy. A planned project, not a drive‑by.
4. **The hostel/university tail:** ~35 more hits of the same class in the admin/university/business
   modules. Highest priority within it: student DOB normalisation (StudentPage/UniversityStudentPage)
   — potential stored‑DOB corruption, which the under‑18 compliance logic reads.

---

## Areas (restaurant group) — status as of Jul 2026 (`a1bfced` / Ops `0e31737` / Function `e4c0c84`)

### The model — areas are OWNER‑CONFIGURED, never baked in

- **Areas live on the group doc:** `group.areas` (string[]) plus `areaOrder` (string[]) and the maps
  `areaPinned` / `areaExclusive` / `areaBreak`, each keyed by area NAME. All authored in Settings
  (both repos). **Whole‑map writes, never dot‑notation** — area names are free text and may contain
  dots.
- **The planner groups by those configured strings** (`groupRowsFor`): an EXCLUSIVE area captures its
  holders out of Multi‑area; PINNED areas rank first; `orderedAreas` = `areaOrder` order, then any
  unmentioned areas in `group.areas` order. Live group: `["FOH","BOH","Management"]` with Management
  pinned + exclusive → sections read Management → FOH → BOH.
- **The legacy hardcoded `"Mgmt"` token is GONE from all three repos.** `DEFAULT_AREAS` is now
  `["FOH","BOH"]` — the seed for a group that has configured nothing. A management area exists only
  if the owner creates one, under whatever name they choose.

### The deliberate debt — `roleConfiguredArea` (read before "improving" it)

- **A shift stores no area.** When it also has no station, the Calendar's day detail infers one by
  matching the rostered ROLE against the group's CONFIGURED area names — `roleConfiguredArea`, in
  `staffStructureUtils.js` next to `shiftAreaOf`, **byte‑identical in both repos** (drift‑guard
  convention). It returns the owner's own spelling, which is why 15 live manager shifts (Mei/Ryan/Ben,
  all station‑less) still group under Management. The staff‑save fallback (nothing ticked in the form)
  uses the same matcher and writes `areas: []` when nothing matches — it never invents a string the
  group didn't configure.
- **Three stated limitations — do not rediscover these the hard way:**
  1. It matches **ENGLISH keywords** (`/manage|mgmt|lead|admin|supervis/`, `/front|floor|service/`,
     `/back|kitchen/`). An area named "Duty", "Leads", or anything non‑English gets no match and its
     station‑less shifts fall to "Other".
  2. If a group configures TWO areas matching the same class (e.g. "Management" and "Managers
     Office"), it returns whichever comes **FIRST in `group.areas`** — deterministic but arbitrary.
     No live group does this today.
  3. It is **INFERENCE**, which the configured‑areas model exists to avoid. It survives only because
     removing it would drop those 15 live shifts into "Other".
- **The exit:** give manager shifts a STATION when rostering. `shiftAreaOf` then resolves them from
  the station's area and `roleConfiguredArea` can be deleted with nothing to regress.

### Related facts (so nobody wires the past back in)

- **`areaFromRole`** (byte‑identical triplet: Admin/Ops `assignmentUtils.js` + Function
  `rgAutoAssign.js`) now has **NO production callers in either client** — it survives only as the
  Function's documented twin (the rostered auto‑assign identity, where its managerial arm returning
  `""` is provably inert: `seesAll` uses the same word list). **Don't wire it back into client code.**
- **The bucket helpers** (`staffAreaBucket` / `staffAreaBuckets` / `classifyArea`) were **DELETED** —
  zero callers. The roster groups by configured area strings, never keyword buckets.
- **The orphaned area strings are TIDIED (20 Jul 2026, nine docs, verified by re‑read):** no `"Mgmt"`
  or `"BOTH"` area string remains anywhere in Firestore. Live group: `"BOTH"` removed from `areas`
  AND every `venueRoles[*].areas` on seven staff (legacy `area` untouched — all held real values);
  two deliberate split‑view corrections — Bowser@mad‑benji and Chloe@mad‑benji moved Multi‑area →
  BOH/FOH ("BOTH" had inflated a single‑area venue entry into Multi‑area). Test group: Ryan's `"Mgmt"`
  SWAPPED to `"Management"` (areas, both venueRoles, legacy area — it was his only management‑ish
  string); Mei's STRIPPED (she already held "Management"; her venueRoles keep it only where it was
  already configured — removing a dead token must not add an area that wasn't there).
- **The non‑obvious rule for any future orphan cleanup:** orphan tokens live in BOTH `areas` and
  `venueRoles[*].areas`. The staff form renders toggles only for CONFIGURED areas — an orphan is
  invisible and untoggleable — and the save path UNIONS `venueRoles` back into `areas`, so cleaning
  `areas` alone gets undone by the next form save. **Any orphan cleanup must touch both.**

---

## Firestore listeners & the loadErrors banner — the convention (Jul 2026)

### THE RULE — every new listener records its failure

A listener whose error arm silently resets to `[]`/`null` renders a denial as EMPTY DATA — the
bug class `a34bae3`/`78c3750` (Ops `e539173`/`7dfc523`) closed by hand, screen by screen. Nothing
enforces it mechanically, so every NEW `onSnapshot` must follow one of the two patterns:

- **RGContext‑level collections** go through `subColl` — the label drives BOTH the ready gate and
  the failure banner:
  ```js
  const subColl = (col, setter, sortKey, label, noteErr, noteReady) => onSnapshot(…)
  // e.g. subColl(staffCol(groupId), setStaffAll, undefined, "staff", noteErr, noteReady)
  ```
- **Standalone screen listeners** keep their fail‑soft reset and ADD `noteErr` with a
  human‑readable label (the copyable example is the public‑holidays listener, identical on
  four surfaces across both repos):
  ```js
  const unsub = onSnapshot(publicHolidaysDoc(groupId),
    (d) => setPhDoc(d.exists() ? (d.data().holidays || []) : []),
    () => noteErr("public holidays (using AU defaults)"));
  ```

**Manager‑only collections must role‑gate the recording** (`c1ea20c`): either skip subscribing for
staff tier entirely (RGContext's `managerTier ? [subColl(…)] : []` / the `MGR_ONLY_VENUE_COLLS`
filter) or gate the record — `() => { setRows([]); if (myScope !== "staff") noteErr("stocktakes"); }`
— otherwise a staff‑tier user pins a PERMANENT banner for a denial the rules intend.

**Ops mirrors Admin's labels verbatim** ("group settings", "staff", "public holidays (using AU
defaults)", …) so a support screenshot reads the same on both devices.

### What the banner does NOT cover — and what covers it instead

- **One‑shot reads** (`getDoc`/`getDocs`): no error arm feeds the banner; they fail as
  empty/absent results (blank private fields, missing under‑18 badges, empty archives) the user
  can't distinguish from real data. Audited Jul 2026 — every site is caught‑and‑silent or has its
  own on‑page error state (Contract pages' `loadErr`); a change of policy here is a separate pass.
- **WRITES**: a denied write NEVER reaches the banner. User‑action writes surface through their own
  `try/catch` → toast (Admin) / `Alert.alert` (Ops); side‑channel writes (notifications, audit
  logs, doc history, completion archives, read receipts) are deliberately fire‑and‑forget with
  silent `.catch(() => {})` — a denial there is invisible everywhere, by design.
- **Cloud Function errors** — separate surface entirely (function logs / their own callers).
- **Most importantly, LOGIC BUGS**: when the data arrives and the code does the wrong thing with
  it, the banner sees nothing. The shift↔time‑entry date mismatch that started this whole line of
  work (`e41b8ab`) would NOT have been caught by the banner. That class is covered by
  **byte‑identical cross‑repo predicates** (the drift‑guard convention) and **parity tests**
  (`assignmentParity` / `rgAutoAssign` truth tables, the twin describes) — not by runtime error
  reporting. Keep both disciplines; they catch disjoint failure classes.
