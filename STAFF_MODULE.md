# Staff Module — Deep Code Audit

A line-by-line audit of the MyMor restaurant‑group (staff) module: every file under
`src/pages/restaurantgroup/**` plus its layout, routes, and path helpers. Each file was read in
full. Findings are line‑referenced; the highest‑severity items at the bottom were re‑verified
against the source.

**Method:** every file read completely. For each: Firestore reads/writes, imported components
(existence confirmed), permission gates, form validation, listener cleanup, async error handling,
hardcoded values, `console.*`/`debugger`, and inconsistencies/bugs.

**No `console.log` / `console.warn` / `console.error` / `debugger` statements exist anywhere in the
module** — confirmed across all files.

---

## Files audited (25)

`RGContext.js`, `rgConfig.js`, `rgUtils.js`, `rgData.js`, `restaurantGroupPaths.js` (utils),
`RestaurantGroupLayout.js` (components), `RestaurantGroupRoutes.js` (routes),
`StaffDirectoryPage.js`, `Turning18Alert.js`, `ShiftPlannerPage.js`, `StaffCapabilityCard.js`,
`CalendarPage.js`, `TrainingPage.js`, `AssignmentDetail.js`, `ChecklistsPage.js`,
`ChecklistAssignmentDetail.js`, `PrepListPanel.js`, `MessagingPage.js`, `LeaveRequestsPage.js`,
`TemperatureLogPage.js`, `SettingsPage.js`, `PerformancePage.js`, `UserManagementPage.js`,
`RichItems.js`, `RefImages.js`, `VenueManager.js`.

All imports across all files resolve to existing exports (verified). Dead/unused imports are noted per file.

---

## 1. Firestore collections — read/write matrix

Root: `restaurantGroups/{groupId}`. Reads are mostly via `RGContext` subscriptions, not direct.

| Collection | Read by | Written by (file:line) |
|---|---|---|
| `…` (group doc) | RGContext L58 | `SettingsPage` L71 (`roles[]`); superadmin |
| `venues/{v}` | RGContext L59 | `VenueManager` L27/28/34 (**UI unreachable, see §VenueManager**) |
| `staff/{id}` | RGContext L60 | `StaffDirectory` L202/280/295, `UserManagement` L32, `AssignmentDetail` L64 (records) |
| `staff/{id}/private/details` | `StaffDirectory` L334 (getDoc), `Turning18Alert` L27 | `StaffDirectory` L214/283 |
| `auditLog` | superadmin RestaurantGroupsPage | `StaffDirectory` L81, `UserManagement` L37, `Turning18Alert` L50 |
| `announcements` | RGContext L61, `Messaging` L53 | `Messaging` L90/102/105 |
| `messages` | RGContext L62, `Messaging` L54 | `Messaging` L160/185 |
| `conversations` | `Messaging` L55 | `Messaging` L194 |
| `venues/{v}/shifts` | RGContext (PER_VENUE) | `ShiftPlanner` L134/148 |
| `venues/{v}/leaveRequests` | RGContext (PER_VENUE) | `LeaveRequests` L43/57 |
| `venues/{v}/checklists` | RGContext | `Checklists` L83/88/115/118/126 |
| `venues/{v}/checklistAssignments` | RGContext | `StaffDirectory` L415; `ChecklistAssignmentDetail` L30/35 |
| `venues/{v}/trainingModules` | RGContext | `Training` L121/122/127 |
| `venues/{v}/trainingAssignments` | RGContext | `StaffDirectory` L404/431, `Training` L77/81/92, `AssignmentDetail` L45/51/58/78 |
| `venues/{v}/stations` | RGContext | `SettingsPage` L24/25/31/35 |
| `venues/{v}/equipment` | RGContext | `SettingsPage` L52/53/60/64 |
| `venues/{v}/kpis` | RGContext | `Performance` L42/45/46 |
| `venues/{v}/performanceNotes` | RGContext | `Performance` L67 |
| `venues/{v}/prepList` | `PrepListPanel` L25 (own onSnapshot) | `PrepListPanel` L39/46/47/48/49/50 |
| `venues/{v}/tempLogs` | `TemperatureLog` L26 (own onSnapshot) | `TemperatureLog` L45 |
| `employees/{uid}` (top‑level) | — | `StaffDirectory` L177, `UserManagement` L33 (permission mirror) |
| `users/{uid}` (top‑level) | — | `StaffDirectory` L182 |
| **Storage** `rgUploads/{groupId}/messages/…` | — | `Messaging` L172 |
| **Storage** `rgUploads/{groupId}/announcements/…` | — | `Messaging` L79 |
| **Storage** `restaurantGroups/{groupId}/refimages/…` | — | `RefImages` (via `ChecklistsPage`/`TrainingPage`) |

**Listener cleanup:** all `onSnapshot` listeners are unsubscribed — RGContext L65/L86, Messaging
L56, PrepListPanel L25 (returns the unsub), TemperatureLog L26. ✅

**Path‑helper risk:** `restaurantGroupPaths.js` L66–72 still exports **group‑level** builders
(`shiftsCol, leaveCol, modulesCol, assignmentsCol, checklistsCol, perfNotesCol, kpisCol`) that point
at `restaurantGroups/{g}/{name}` — the *wrong* level vs the per‑venue model. None are currently
imported by the pages (verified), but they are latent foot‑guns and should be deleted.

---

## 2. Permission model — how gating actually works

- Levels `none|view|edit` per module; defaults in `rgConfig.DEFAULT_PERMISSIONS` (L44–47, all 11
  module keys present for all 4 roles — consistent). `hasLevel` (rgConfig L66–69) denies safely on bad keys.
- **Nav** is permission‑filtered: `RestaurantGroupLayout` L37 `NAV.filter(n => can(n.key,"view"))` — keys match `RG_MODULES` exactly. ✅
- **Routes are NOT permission‑guarded:** `RestaurantGroupRoutes.js` L17–27 render every page
  unconditionally. Deep‑linking to `/rg/users`, `/rg/settings`, etc. bypasses the nav filter — the page
  renders regardless of `can(...)`. (Pages self‑gate to varying degrees; see below.) **Gap.**
- **In‑page gating is UI‑only:** essentially every write function across the module relies on the
  button being hidden — there is **no permission re‑check inside the mutating async functions**
  (Staff, Training, Checklists, Messaging, Leave, Temp, Settings, Performance, UserMgmt, AssignmentDetail).
  Server‑side Firestore rules are the only real backstop.
- **Two parallel gating sources** are mixed for the same controls: permission‑based `can(...)` vs
  role‑based `myScope`/`isMgr` (e.g. `TrainingPage` L406‑408 — `canComment={isMgr}` but
  `canVerify={canEdit}`; `ChecklistsPage` L35 vs L46). A manager downgraded to `view` keeps some rights and loses others.
- `CalendarPage` has **no `can()` call at all** (does not even destructure `can`, L18) — relies entirely on route/nav gating. (Default perms give `calendar:"view"` to everyone, so low impact, but the in‑page gate is absent.)
- `VenueManager` has **no `can()` gate** (its former trigger was role‑gated in the layout, now commented out).

---

## 3. Stubs / placeholders / hardcoded business values

- **Fake exports:** `LeaveRequests` L137 (`showToast("Exporting leave report...")`) and `ShiftPlanner`
  L245 (`showToast("Roster exported as PDF")`) — toasts only, nothing generated.
- **POS placeholder:** `StaffCapabilityCard` L113–118 — permanent "No POS data yet" block, no binding.
- **Hardcoded labour economics:** `ShiftPlanner` L14 `HOURLY = 32`, L15 `WEEKLY_REVENUE = 42000`,
  L310 target "20–25%". "Est. labour cost" (L309) and "Labour %" (L310) are therefore fabricated numbers.
- **Hardcoded author:** `PerformancePage` L69 `by: "Manager"` — every performance note is attributed to
  the literal "Manager" (the real `me` is not used).
- **Hardcoded enums that arguably belong in Firestore/Settings:** `StaffDirectory` `CERT_OPTIONS` L30,
  `EMP_TYPES`/`AREAS`/`PRIORITIES`/`REC_TYPES`; `Leave` `TYPES` L7; `Training` `PRIORITIES/CATS/ICONS/MOD_COLORS`;
  `Settings` `AREAS`/`UNIT_TYPES`/`DEFAULT_RANGE`/`SUGGESTED_UNITS` (L8/40‑42, recreated each render);
  `Performance` `NOTE_TYPES` L12; `VenueManager` `COLORS/TYPES/STATUSES` L6‑11; `ShiftPlanner` `STARTS/ENDS/ROLES`.
- **`VENUE_COLORS` keyed by venue *name*** (`restaurantGroupPaths.js` L74–81): venues are created
  dynamically with their own `color` field, but this static 4‑name map drives `rgUtils.avatarColor` (L13) —
  so any venue not in the hardcoded names renders gray. Three independent color sources exist
  (`VENUE_COLORS`, `VenueManager.COLORS`, `Performance.KPI_COLORS`).
- **Default password scheme:** `StaffDirectory` L197/264 — `\`${name}654321\``, predictable.
- **Dead constants/state:** `StaffDirectory` `ROLES` L19 and `CERTS` L29 (unused); `hours` state
  (blankForm L68 / startEdit L230) is **never written** to Firestore; `RestaurantGroupLayout` unused
  `Settings` import L5 + unused `isOwnerOrAdmin` L40; `rgData.js` self‑declared deprecated yet still
  exports `weekKeyOf` (dup of `rgUtils.currentWeekKey`); dead imports `fullName` (Messaging L7),
  `addDoc` (Settings L2), `db` (ShiftPlanner L5).

---

## 4. Per‑file notes (condensed)

**RGContext.js** — Read‑only provider; all listeners cleaned up. ⚠ L34 `groupRole = employee?.groupRole || "owner"`
(insecure default, see Critical). L58 group‑doc `onSnapshot` has **no error callback** (every other listener does).
L51‑52‑style venue match via display name (`matchVenue` L123) is fragile. Per‑venue listeners keyed on
`venueIdsKey` (L70/87) → a venue **rename** doesn't refresh stamped `venue` names until the next emit.

**rgConfig.js** — Pure config; all 11 module keys consistent across roles. Note `roleToGroupRole` (L55‑58)
maps the job title "Manager" → **`storeAdmin`** tier (regex order), supervisor/in‑charge → `manager` — surprising but intentional.

**rgUtils.js** — ⚠ `parseShiftTime` (L106‑113) only parses `h:mm(am|pm)`; a 24‑hour or space‑before‑meridiem
string returns 0 → `weeklyHours` undercounts. `currentWeekKey` (L115‑121) mixes local `setHours` with
`toISOString` (UTC) — week key can roll to the wrong day in non‑UTC zones. `noteTypeLabel` (L148‑149)
uses the same ⚠️ emoji for Warning and Coaching.

**rgData.js** — Deprecated stub; still exports `weekKeyOf` (L12‑18) duplicating `currentWeekKey` with the same TZ bug.

**restaurantGroupPaths.js** — Path builders only. ⚠ Stale group‑level builders L66‑72 (wrong level);
⚠ name‑keyed `VENUE_COLORS` L74‑81.

**RestaurantGroupLayout.js** — Nav correctly permission‑filtered (L37). ⚠ L51‑52 `venueStaffCount` uses
only legacy single `s.venueId`, ignoring multi‑venue `s.venueIds` → subtitle staff counts wrong/zero.
Dead: `Settings` import L5, `isOwnerOrAdmin` L40, `VenueManager` modal unreachable (trigger commented L134‑138).
Hardcoded fallback group name "Main Kitchen" L48.

**RestaurantGroupRoutes.js** — All imports resolve. ⚠ No route‑level permission guards (L17‑27). Path strings
duplicated across rgConfig / NAV / Routes (drift risk).

**StaffDirectoryPage.js** (833 lines) — Largest file. Validates name/venues/email on add; ⚠ `saveEdit`
does **not** re‑validate blank name (L257). **No payroll validation** (TFN/BSB/bank/DOB/`contactEmail`
written raw L214/283; `isEmail` exists but unused for `contactEmail`). ⚠ `diffStaff` (L241‑251) only diffs
role/area/status/endDate/venues/stations — **name, phone, type, PIN, certs, start, payroll changes produce
no history and no audit log**. ⚠ birthday clobber: guard is `canPayroll && payroll !== null` (L273) but the
failed‑load catch sets `payroll = {}` (L336), so a load *failure* can still write `birthday: ""`. Payroll
getDoc effect properly `alive`‑guarded (L330‑338). Dead `hours`/`ROLES`/`CERTS`. ⚠⚠ **plaintext passwords**
(see Critical).

**Turning18Alert.js** — Reads private DOBs in a loop (L27); idempotent audit via deterministic id
(L48‑50); notification guarded. ⚠ Effect deps `[groupId, staff, actorName]` (L59) + `staff` identity
changes on every snapshot → **re‑reads every private/details doc on each staff update** (N‑read amplification).
Hardcoded age 18 / ±window (L33). No internal gate (relies on parent `canPayroll`).

**ShiftPlannerPage.js** — ✅ end>start (L125) and overlap/double‑booking (L128‑130) checks correct
(touching 7–3/3–9 allowed; cross‑venue intentional). Both writers have try/catch. ⚠ Fake PDF export (L245).
⚠ `vid === "all"` branches dead in split view (L155/158/177). ⚠ `openAdd` venue resolution (L112, legacy
`venueId`) differs from `saveShift` (L121, `venueIds[0]`). Split‑view per‑grid hours overlap‑count multi‑venue staff.

**StaffCapabilityCard.js** — Presentational, no reads/writes. ⚠ `shiftDate` (L8) `new Date(weekKey)` parses
UTC then reads local → can show the previous day west of UTC. Records not matching mistake/praise regex (L11‑12)
are silently dropped from the card. POS block hardcoded (L113‑118).

**CalendarPage.js** — Read‑only. ⚠ **No `can()` gate** (L18). ⚠ `scopeIds`/`teamStaff` (L31‑42) check only
`s.venueIds`, ignoring legacy `s.venueId`, unlike `staffInVenue` → legacy single‑venue staff vanish under a
venue filter. ⚠ Manager birthday scope (`teamStaff`) ≠ shift/leave scope (`scopeIds`) → different staff sets
on the same calendar. ⚠ `dayKey` (local) vs `cellWeekInfo` weekKey (UTC) mismatch at week boundaries; shifts
still match ShiftPlanner because both use the same UTC pattern. L129 renders `l.dates` (may be blank if absent).

**TrainingPage.js** — Six writers all try/catch (bare, swallow error). ⚠ `saveModule` allows a module with
zero step items → later "no step items to tick". ⚠ "Completions this week" metric (L67/182) counts ALL
Complete assignments ever, not this week — misleading. Divergent gating L406‑408.

**AssignmentDetail.js** — ⚠ `verified` is **not cleared** when ticks drop below total (L42/77): an assignment
can be `verified:true` with status `"In progress"`. ⚠ Re‑verify appends **duplicate** staff `records`
(fresh `at` defeats `arrayUnion` dedupe, L66) and the record write is `.catch(()=>{})` while the toast still
says "verified & logged" (L70/72) — false success. ⚠ `saveComment` (L51) writes empty comments (no trim‑check).
Verifying a zero‑item module reports 100% (L60).

**ChecklistsPage.js** — ⚠ Edit re‑maps tick state by index (L114): reordering/deleting items mid‑list moves
ticks to the wrong items. ⚠ Daily‑reset/history only archives on user interaction the next day; multi‑day
untouched gaps lose history, and `pushHist` (L24‑28) drops days with 0 completions → History tab unreliable as
a compliance record. ⚠ `areaOf` keyword heuristic (L29) can mis‑classify FOH/BOH from the title. Staff have
`checklists:edit` yet are routed away from the shared board by `isMgr` (L131) — role vs perm divergence.

**ChecklistAssignmentDetail.js** — Mirrors AssignmentDetail (tick + comment) but **no verify/sign‑off step**
(auto‑Completes, L28) — intentional asymmetry vs training. Empty comments writable (L35). Hardcoded "Trainer:"
label (L68) even though the commenter may be a manager, not a trainer.

**PrepListPanel.js** — ⚠⚠ **Toggle is NOT gated by `canEdit`** (L68 `onClick={()=>toggle(it)}`, L46 no guard):
the read‑only staff view (`ChecklistsPage` L163 passes `canEdit=false`) still lets **any staff tick/un‑tick any
prep item** (verified). ⚠ All mutation catches are empty `catch { /* */ }` — silent failures. ⚠ `order:
items.length` (L41) collides after deletions → ordering drifts.

**MessagingPage.js** — All listeners unsubscribed; all Storage/Firestore writes try/catch. ⚠ `myVenueIds`
(L43) treats an **empty `venueIds: []` as truthy** → user sees zero venue channels/announcements. ⚠ **Sending
DMs and acknowledging announcements is available to `messages:view` staff** — only group *creation* is scoped
(L34); `send`/`postAnnouncement` have no edit gate (UI shows the composer for any active conversation). ⚠
**Orphaned Storage uploads**: attachments are never deleted when removed from the form (L236/327), on convo
switch (L163), or on failed send. No max file‑size cap. Dead `fullName` import.

**LeaveRequestsPage.js** — ✅ Staff‑submit‑own enforced on write (L48‑51); scoped visibility correct (L34‑37).
⚠ **Wrong‑venue write:** `vid` resolves from `selectedVenue` (L54) while `venue` name uses the staff's first
venue (L59) — a request can be stored under venue B but display venue A's name → breaks shift‑planner blocking
and venue filtering. ⚠ "Declined" requests still record a name in `approvedBy` shown under "Approved by" (L43/145).
No end≥start guard (mitigated by `Math.max(1,…)`). Fake export L137. Hardcoded `TYPES`.

**TemperatureLogPage.js** — ✅ NaN guard on the reading (L41); onSnapshot unsubscribed (L26); try/catch on write.
⚠ Venue tab strip (L62) shows **all venues** regardless of scope — a manager can log/read any venue's temps
(no scoping by `scopedStaff`). Newly added reading sorts to the bottom until the server timestamp resolves (L28).

**SettingsPage.js** — All writers try/catch; view/edit gated (L13/82). ⚠ **Unit min/max has no NaN guard and
no `min ≤ max` check** (L49) — saving min>max makes `inRange` always false, flagging every reading out of range
(food‑safety log corruption). ⚠ **Slug‑collision overwrite** (L25/53): `setDoc(doc(...,slug(name)))` silently
overwrites an existing station/unit whose name slugs identically → data loss. ⚠ Changing unit Type in the modal
resets min/max from defaults, losing custom ranges (L213). Roles save is optimistic/silent on failure (L70‑80).
`UNIT_TYPES/DEFAULT_RANGE/SUGGESTED_UNITS` declared in‑render (L40‑42). Dead `addDoc` import.

**PerformancePage.js** — ⚠ Hardcoded `by: "Manager"` (L69). ⚠ `saveKpis` uses `Promise.all` of independent
writes (L41) — a mid‑batch failure leaves partial writes committed while toasting failure (no transaction).
Empty `catch {}` (L50/74). KPI add requires a single selected venue (intentional, L27).

**UserManagementPage.js** — ⚠ Staff‑doc update + `employees/{uid}` permission mirror are in **one try block with
no isolation** (L32‑33): a mirror failure reports "Could not save permissions" after the staff doc already
changed → login perms desync. ⚠ Toast keys off `hasAdminLogin` (L42) while the mirror keys off `adminUid` (L33)
— can disagree. ⚠ No privilege‑ceiling check — an editor could grant `usermgmt:edit`/escalate. Audit "changed"
diff (L34) misreads legacy array‑shaped `permissions`.

**RichItems.js** — Pure editor. ⚠ `document.execCommand` (L38) is **deprecated** (silent `try/catch`;
`hiliteColor` non‑standard). ⚠ Mount‑once effect (L21) + index keys (L70): `move()` reorders the data array but
the contentEditable boxes don't re‑sync → visible content desyncs from stored value after a reorder. `cleanHtml`
(L4‑8) is a **best‑effort sanitizer** feeding `dangerouslySetInnerHTML` (L12) — bounded to admin content but a real XSS surface.

**RefImages.js** — ⚠ `remove` (L62) drops the image from the array but **never `deleteObject`s** the Storage path
(`img.path` stored for exactly this, unused) → every removed/replaced image leaks a file. ⚠ No size/MIME/extension
validation (L77 `accept` is a hint; L7 sniffs ext from filename, defaults "jpg"). `uploadRefImage` has no internal
try/catch but its only caller wraps it (L50‑59).

**VenueManager.js** — ⚠⚠ **Entirely unreachable**: its only open trigger is commented out in the layout
(L134‑138), so `venueMgrOpen` is permanently false. There is **no in‑app way for a group owner/admin to
add/edit/delete venues** (only the superadmin page does). ⚠ No `can()` gate in the component. ⚠ `remove` (L33)
deletes the venue doc with **no cascade** — orphans all per‑venue subcollections and leaves stale `venueIds` on staff.

---

## 5. Issues ranked by severity

### Critical
1. **Insecure default role.** `RGContext.js:34` — `const groupRole = employee?.groupRole || "owner";`
   Any login with an unset/blank `groupRole` gets **owner‑tier, all‑venue, all‑`edit`** access. Default to `"staff"`. *(verified)*
2. **Plaintext passwords stored & displayed.** `StaffDirectoryPage.js:211,274` write `password: pwd` onto the
   group‑readable `staff` doc (predictable default `\`${name}654321\``, L197/264); read back at L261 and shown in
   `UserManagementPage.js:97` via "Show logins". Cleartext credentials in Firestore. *(verified — note this is the
   product's intentional "show logins" feature, but it is a real exposure.)*
3. **No route‑level authorization.** `RestaurantGroupRoutes.js:17‑27` render every page unconditionally; nav
   hiding via `can()` is cosmetic. Deep‑linking to `/rg/users`, `/rg/settings` works regardless of permission. *(verified)*

### High
4. **Prep list not read‑only for staff.** `PrepListPanel.js:68/46` — ticking is ungated; staff (`canEdit=false`)
   can tick/un‑tick any prep item. *(verified)*
5. **Leave written to the wrong venue.** `LeaveRequestsPage.js:54,59` — doc created under `selectedVenue` while
   the `venue` name uses the staff's first venue; breaks blocking + filtering.
6. **Sign‑off integrity.** `AssignmentDetail.js:42,66,70` — `verified` not cleared when ticks drop; re‑verify
   duplicates staff records; record‑write failure reported as success.
7. **Temperature range corruption.** `SettingsPage.js:49` — no NaN/`min ≤ max` guard; an inverted range flags
   every food‑safety reading out of range.
8. **Settings slug‑collision overwrite.** `SettingsPage.js:25,53` — same‑slug name silently overwrites an
   existing station/unit (data loss).
9. **Checklist edit re‑maps ticks by index.** `ChecklistsPage.js:114` — reorder/delete moves ticks to wrong items.
10. **Messaging view≠read‑only.** `MessagingPage.js` — `messages:view` staff can send DMs and ack announcements
    (only group creation is scoped). Empty‑`venueIds` (L43) hides all venue channels.
11. **VenueManager unreachable.** `RestaurantGroupLayout.js:134‑138` commented out → no in‑app venue
    management; `remove` has no cascade.
12. **CalendarPage has no permission gate** (`CalendarPage.js:18`) and **legacy `venueId` staff vanish** under a
    venue filter (L31‑42). *(gate absence verified)*

### Medium
13. Hardcoded labour economics drive fabricated metrics — `ShiftPlanner.js:14‑15,310`.
14. Performance note author hardcoded `"Manager"` — `PerformancePage.js:69`.
15. Permission mirror non‑atomic / source‑of‑truth mismatch — `UserManagementPage.js:32‑33,42`.
16. Incomplete audit/history coverage — `StaffDirectoryPage.js:241‑251` (name/phone/PIN/cert/payroll changes unlogged).
17. Birthday clobber on failed payroll load — `StaffDirectoryPage.js:273` vs `336`.
18. Timezone fragility in week keys — `rgUtils.js:115‑121`, `rgData.js:12‑18`, `CalendarPage.js`, `StaffCapabilityCard.js:8`.
19. Shift‑time parser too strict — `rgUtils.js:106‑113` (24h/spaced formats → 0 hours).
20. `Promise.all` partial‑write hazard in KPI save — `PerformancePage.js:41`.
21. Temperature page shows all venues regardless of scope — `TemperatureLogPage.js:62`.
22. `RestaurantGroupLayout` staff counts ignore `venueIds` — L51‑52.
23. RGContext group‑doc listener has no error callback — L58.
24. Storage leaks — `MessagingPage.js` (attachments), `RefImages.js:62` (no `deleteObject`).
25. Turning18Alert re‑read storm — `Turning18Alert.js:59`.

### Low / cleanup
- Deprecated `document.execCommand` + reorder desync — `RichItems.js:21,38,70`.
- Best‑effort HTML sanitizer into `dangerouslySetInnerHTML` — `RichItems.js:4‑12`.
- No upload size/MIME validation — `RefImages.js`, `MessagingPage.js`.
- Fake "Export" buttons — `LeaveRequests.js:137`, `ShiftPlanner.js:245`.
- "Completions this week" counts all‑time — `TrainingPage.js:67,182`.
- Empty‑string comment writes — `AssignmentDetail.js:51`, `ChecklistAssignmentDetail.js:35`.
- Stale group‑level path builders — `restaurantGroupPaths.js:66‑72`; name‑keyed `VENUE_COLORS` L74‑81.
- Dead code: `StaffDirectory` `hours`/`ROLES`/`CERTS`; layout `Settings`/`isOwnerOrAdmin`; `rgData.weekKeyOf`;
  dead imports `fullName` (Messaging), `addDoc` (Settings), `db` (ShiftPlanner).
- UI‑only write enforcement everywhere (no in‑function permission re‑check) — relies on Firestore rules.
- Hardcoded taxonomies that should be Firestore/Settings‑driven (cert options, leave types, unit types/ranges, note types, venue colors/types/statuses).

### Operational (not code)
- Rotate the exposed service‑account key (`secrets/serviceAccount.json`, project `mymor-one`).
- Change the manager password set during setup (`MadKitchen2026!`).

---

*No `console.*`/`debugger` statements were found in any module file. All imports resolve. All
`onSnapshot` listeners are unsubscribed. The remaining risks are the items listed above.*
