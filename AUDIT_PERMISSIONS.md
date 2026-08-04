# PERMISSIONS AUDIT — what View/Edit actually do, and every subscription/write vs the live rules

Audited 23 Jul 2026 against MyMorAdmin main @ 9f8b160 and MyMorOps development @ 2228fbb.
Live ruleset: MyMorAdmin/firestore.mymor-australia.rules (see §B0 for why this file is authoritative).
REPORT ONLY — no fixes proposed, no code changed. Tags: VERIFIED-IN-CODE (file:line) / NEEDS-LIVE-CONFIRM.

═══════════════════════════════════════════════════════════════════
## QUESTION A — WHAT DO View AND Edit ACTUALLY DO?
═══════════════════════════════════════════════════════════════════

### A4 first — the plain-English answer (evidence follows)

For a STAFF-TIER user (groupRole "staff"; defaults: checklists **edit**, training **view**, temperature edit — Admin rgConfig.js:97, Ops rgConfig.js:68):

| Module | at "none" | at "view" | at "edit" |
|---|---|---|---|
| **Checklists (venue boards)** | Screen hidden (nav gates on view) | Can SEE boards; **cannot tick** — board ticking is `canEdit`-gated in both apps, no identity concept on a shared board | Tick/untick board items, reset boards, create/edit/delete checklist TEMPLATES, manage slot links & station targets, assign to staff (Ops AssignModal), edit prep lists |
| **Checklist ASSIGNMENTS (own)** | Screen hidden | **Ops: CAN tick own** (identity clause). **Admin: CAN tick own** (canTick hardcoded true on the my-assignments path). Cannot tick others' | Everything at view, plus tick ANYONE's assignment from the manager surfaces |
| **Training / SOPs (own module)** | Screen hidden (staff see only "My Training" tab regardless) | **Ops: CAN progress own module** (identity clause), cannot verify. **Admin: CANNOT tick own module** — canTick is `can("training","edit")` with no identity clause; the card even says "Click to open & tick off each step" but every checkbox is dead | Tick anyone's, verify/sign-off, create/edit/delete modules, immediate auto-assign on save |
| **Training verify** | — | No | Yes (verify = `canEdit`/`canVerify` in both apps) |

Because the DEFAULTS give staff `checklists: "edit"`, in practice staff tick boards and assignments everywhere; the view-level rows above only bite for a user whose stored map was explicitly downgraded. The training asymmetry (Admin dead checkboxes at "view") is live behaviour for every default staff user on the web app. VERIFIED-IN-CODE throughout — citations below.

**Admin↔Ops DIVERGENCE (found, not fixed):** own-assignment ticking:
- Ops training: `const canTick = canEdit || assignment.staffId === myStaffId;` — AssignmentDetailScreen.js:61.
- Ops checklist assignments: `canTick={canEdit || openAssignment.staffId === myStaff?.id}` — ChecklistsScreen.js:441.
- Admin checklist assignments (my list): `canTick` passed bare (=true) — ChecklistsPage.js:226, list pre-filtered to own (`a.staffId === myStaff.id`, :62).
- Admin training (my list): `canTick={canEdit}` — TrainingPage.js:525 — **no identity clause**; a training:"view" user cannot tick their own module on web while they can on the iPad. Also Ops StaffProfileScreen.js:319 passes `canTick={can("checklists","edit")}` without the identity clause — from the profile surface, a checklists:"view" user can't tick their own checklist assignment even though ChecklistsScreen would let them.

### A1 — level definitions (both repos byte-equivalent)

- Levels: `LEVELS = { NONE:"none", SELF:"self", VIEW:"view", EDIT:"edit", APPROVE:"approve" }`, ranked `order = { none:0, self:1, view:2, edit:3, approve:4 }` — Admin rgConfig.js:76/:82, Ops rgConfig.js:49/:55. `approve` ranks above `edit`; `self` is an Admin-only own-profile tier between none and view.
- `hasLevel(perms, moduleKey, required="view")` — monotonic ≥ with the staff-module `self` floor — Admin rgConfig.js:130-134, Ops rgConfig.js:120-124.
- `can(moduleKey, level="view") => hasLevel(myPerms, moduleKey, level)` — Admin RGContext.js:319, Ops RGContext.js:433.
- Staff DEFAULT_PERMISSIONS row — Admin rgConfig.js:97 / Ops rgConfig.js:68, identical on every shared key: `staff:"none", shifts:"view", leave:"view", availability:"view", training:"view", checklists:"edit", temperature:"edit", performance:"none", reports:"none", messages:"view", calendar:"view", usermgmt/settings:"none", stock:"none", menus:"none", pos:"view", supplier:"none", keys:"none", compliance:"view"` (Admin additionally `contracts:"none"`). myPerms = defaults overlaid with explicit `employee.permissions` (both RGContexts).

### A2 — every can("checklists", …) gate

| Gate | File:line | Controls |
|---|---|---|
| `const canEdit = can("checklists","edit")` | Admin ChecklistsPage.js:50 | Board tick `toggle()` (:96 `if (!canEdit) return`), board reset (:108 via button visibility), "+ New checklist" (:262), Edit/Reset buttons (:291-292), PrepListPanel edit (:266) |
| `canTick` (bare true) | Admin ChecklistsPage.js:226 | Own-assignment ticking — identity comes from the list filter :62 (`a.staffId === myStaff.id`), not from can() |
| `canTick={canEdit}` canEdit=can("staff","edit") | Admin StaffDirectoryPage.js:2069 | Ticking OTHERS' checklist assignments from a staff profile — staff-module edit, i.e. manager surface |
| `const canEdit = can("checklists","edit")` | Ops ChecklistsScreen.js:389 | Board tick/reset (BoardDetail :53/:61/:79), editor open/save/delete (:529, editor :162/:199/:298-300), AssignModal (:313), manager board buttons (:366) |
| `canTick={canEdit \|\| openAssignment.staffId === myStaff?.id}` | Ops ChecklistsScreen.js:441 | Assignment ticking: edit-level OR own |
| `canTick={can("checklists","edit")}` | Ops StaffProfileScreen.js:319 | Assignment ticking from a profile (no identity clause) |

What "edit" unlocks beyond "view", concretely: board ticking + reset, template create/edit/delete (incl. slot links, station targets, frequency/anchor), assigning to others (Ops AssignModal :308-313), prep-list editing, and ticking other people's assignments. "View" alone gets the screens plus (Ops, and Admin's my-list) own-assignment ticking.

### A3 — every can("training", …) gate

| Gate | File:line | Controls |
|---|---|---|
| `const canEdit = can("training","edit")` | Admin TrainingPage.js:36 | Module editor, delete, immediate auto-assign on save; AssignmentDetail `canTick/canVerify={canEdit}` (:525-526) — INCLUDING the my-training path (no identity clause) |
| `canVerify/canComment=can("training","edit")`, `canTick={can("staff","edit")}` | Admin StaffDirectoryPage.js:2066 | Profile-surface training detail (manager surface) |
| `const canEdit = can("training","edit")` | Ops TrainingScreen.js:196 | Module editor/save/delete; detail at :291 passes canEdit + myStaffId |
| `canTick = canEdit \|\| assignment.staffId === myStaffId` | Ops AssignmentDetailScreen.js:61 | Own module progression at ANY level ≥ the screen gate; `canVerify = canEdit` (:62) |
| `canEdit={can("training","edit")}` | Ops StaffProfileScreen.js:311 | Profile-surface training detail |

So on Ops a "view" user progresses their own module (identity), and "edit" adds verify + authoring + ticking others. On Admin, "view" users get a read-only my-training list (the canTick={canEdit} at TrainingPage.js:525 has no identity arm).

### A5 — is completion can()-gated or identity-gated?

Identity-gated (client-side only), with can() as the OTHER arm of an OR — and **no gate at all at the database level**:
- Ops ChecklistAssignmentDetailScreen.js:56-65: `if (!canTick || locked) return;` then `updateDoc(ref(), { checks, progress, status, ... })` — canTick = edit-level OR `staffId === myStaff.id` (from the :441 call site). The write itself carries no identity check.
- Ops AssignmentDetailScreen.js:78 same shape for training (`canTick` from :61).
- Admin ChecklistAssignmentDetail.js:43/:50: `setCheck → write() → updateDoc(ref(), { checks, progress, status, ... })`, guarded only by the `canTick` prop at the click site (:101).
- The Firestore rule underneath is the venue catch-all (rules :148-152): checklistAssignments and trainingAssignments are member read+WRITE. **The database enforces neither identity nor level** — any group member may write any assignment doc. The identity discipline is purely client-side. (Ranked in §B4.)

═══════════════════════════════════════════════════════════════════
## QUESTION B — EVERY SUBSCRIPTION AND WRITE vs THE LIVE RULES
═══════════════════════════════════════════════════════════════════

### B0 — the rules files

Found (VERIFIED-IN-CODE):
- **MyMorAdmin/firestore.mymor-australia.rules** — THE authoritative file: Admin's firebase.json wires it to the named database (`{ "database": "mymor-australia", "rules": "firestore.mymor-australia.rules" }`, firebase.json:3), Admin's firebase.json is the only deploy config on this machine, and the file was synced to the console-published ruleset in e58de9a (21 Jul). All rule citations below are from it.
- MyMorAdmin/firestore.default.rules — the (default) database (firebase.json:4); not the rg database.
- MyMorAdmin/storage.rules / storage.default.rules / storage.backup-aus.rules — storage, out of scope.
- MyMorFunction/firestore.rules + storage.rules — **inert documentation**: MyMorFunction has no firebase.json, nothing deploys them.
- MyMorOps — no rules files, no firebase.json (client only).

### B1 + B2 — every listener, its rule, and the verdict

Verdicts: OK (staff can read; subscribed), GATED (staff can't read; correctly not subscribed), EXPECTED-DENIAL (staff can't read; still subscribed → banner-crying-wolf).

**RGContext group-level (both repos — Admin RGContext.js:141-178 effect, Ops :180-231; labels = GATE_LABELS Ops :70-75):**

| Listener (collection) | Gated? | Rule | Staff read? | Verdict |
|---|---|---|---|---|
| group doc (`restaurantGroups/{g}`) | no | :55 member read | yes | OK |
| venues | no | :142 member RW | yes | OK |
| staff | no | :59 member read | yes | OK |
| announcements | no | :313 member RW | yes | OK |
| messages | no | :314 member RW | yes | OK |
| conversations (Ops-only in context; Admin subscribes in MessagingPage) | no | :309-311 member RW | yes | OK |
| notifications | no | :306-308 member RW | yes | OK |
| group availability | no | :248-252 member read | yes | OK |
| awardRates | no | :297-300 member read | yes | OK |
| compliance manual (`compliance/*`) | no | :301-304 member read | yes | OK |
| menu items (group menuItems) | no | :260-265 member read | yes | OK |
| modifier groups | no | :273-282 member read | yes | OK |
| stock items (inventoryItems) | `...(managerTier ? [...] : [])` Admin :157 / Ops :196 | :257-259 manager+ | no | GATED |
| recipes | managerTier Admin :159 / Ops :198 | :267-272 manager+ | no | GATED |
| suppliers | managerTier Admin :161 / Ops :200 | :283-288 manager+ | no | GATED |
| purchaseOrders | managerTier Admin :162 / Ops :201 | :289-295 manager+ | no | GATED |
| settings/labourTargets | managerTier Admin :165 / Ops :209 | :137-140 manager+ | no | GATED |

**RGContext per-venue fan-out** (Admin :220-240, Ops :269-296; filter `managerTier || !MGR_ONLY_VENUE_COLLS.includes(coll)` with the list now `["stock","kpis","performanceNotes"]` — Admin :66, Ops :93, this session's fix):

| Collection | Rule | Staff read? | Verdict |
|---|---|---|---|
| shifts | :198-201 member read / manager write | yes (read) | OK |
| leaveRequests | :188-193 member read | yes | OK |
| checklists | catch-all :148-152 member RW | yes | OK |
| stations, equipment, trainingModules, trainingAssignments, checklistAssignments | catch-all :148-152 member RW | yes | OK |
| performanceNotes | :169 manager+ | no | GATED (fixed this session — was EXPECTED-DENIAL) |
| kpis | :170 manager+ | no | GATED (fixed this session — was EXPECTED-DENIAL) |
| stock | :157 manager+ | no | GATED |
| timeEntries (Ops fan-out only) | :206-216 member RW | yes | OK |
| availability legacy per-venue (both; Admin adds it locally at :226) | :224-238 member read | yes | OK |
| venue menu (selected venue, menuItems instance) — Admin :~199 effect, Ops :243-256 | :174-177 member read | yes | OK |

**Acknowledgements fan-out** (Admin RGContext.js:345-358, Ops :374-387): subscribes `staff/{sid}/acknowledgements` for every staff id **only for manager tier**; staff-tier subscribes to `[myStaff.id]` alone (`ackStaffIds = isOwnerTier || isManagerTier ? staff.map(id) : [myStaff.id]`). Rule :104-107: read = manager+ OR own. **GATED — correctly.** The comment at Admin :340-344 records exactly this design. The acknowledgements fan-out the brief flagged is clean.

**Standalone screen listeners:**

| Screen listener | File:line | Rule | Verdict |
|---|---|---|---|
| Admin MessagingPage anns/msgs/convos | MessagingPage.js:54-56 | :309-314 member | OK |
| Admin+Ops publicHolidays doc | ShiftPlannerPage.js:199, StaffDirectoryPage.js:239, Ops ShiftPlannerScreen.js:185, Ops StaffProfileScreen.js:33 | :129-132 member read | OK |
| Admin KeysPage venue `keys` | KeysPage.js:30 | catch-all member RW | OK (page nav-gated keys:none for staff anyway) |
| Admin+Ops PrepListPanel `prepList` | PrepListPanel.js:27 / Ops :23 | catch-all member | OK |
| Admin+Ops tempLogs | TemperatureLogPage.js:37 / Ops TemperatureLogScreen.js:44 | catch-all member | OK |
| Admin payrollChangeRequests (own: :910, profile: :986) | StaffDirectoryPage.js | :84-91 own or owner/storeAdmin | OK — own-doc path; the :986 profile path only mounts on a profile the viewer opened (staff can open only their own) |
| Admin StockPage movements / StockExtraTabs stocktakes+batches+movements | StockPage.js:108, StockExtraTabs.js:51/:431/:584 | :157-161 manager+ | GATED-BY-NAV (stock:"none" hides the pages; the c1ea20c pattern additionally suppresses noteErr for staff — StockPage.js:111-112 comment) |
| Ops StockScreen movements | StockScreen.js:119 | :158 manager+ | GATED-BY-NAV (same pattern, comment quoted at :122-123) |
| Ops timeEntries breaks subcoll | AvailabilityScreen.js:339 (breaksColOf) | :212-215 member RW | OK |
| Admin+Ops my availability posts | AvailabilityPage.js:74 / Ops AvailabilityScreen.js:89 | :248-252 member | OK |

**EXPECTED-DENIAL class remaining: NONE FOUND.** After this session's kpis/performanceNotes fix, every listener in both apps is either member-readable or tier-gated before subscribing. The banner now only fires on genuine failures. (Caveat: GATED-BY-NAV rows rely on the nav gate — a staff user granted stock:"view" as an explicit override would mount those listeners and be rules-denied; the noteErr suppression means no banner, just silent empty. Edge case, recorded, not a crying-wolf case.)

### B5 — which staff can authenticate at all (live-data pointers, NOT queried)

The B4 exposure below applies only to staff who hold a Firebase Auth account. Where to look in the console (NEEDS-LIVE-CONFIRM):
- `restaurantGroups/{groupId}/staff/{sid}` → **`hasAdminLogin: true`**, **`adminUid` non-null**, and/or non-empty **`email`** — written by Admin StaffDirectoryPage on create/update (payload :448 writes email only when hasAdminLogin; adminUid set via createAdminLogin :437).
- Cross-check `employees/{uid}` docs with `groupId == <the group>` — one per authenticated login; `groupRole` tells you the tier the rules will apply (`rgEmp().groupRole`, rules :25-29).
- PIN-only staff (no adminUid, no employees doc) cannot sign in to Firebase at all — the rules' `rgIsGroupMember` is false for them; they act only through a signed-in shared device (the kiosk model, rules :202-205 comment).

*(B3/B4 — the full client-write enumeration versus rules — follow below.)*

═══════════════════════════════════════════════════════════════════
## B3 — every client WRITE vs the rule (grouped by collection)
═══════════════════════════════════════════════════════════════════

Both repos enumerated exhaustively (Admin ~140 write sites, Ops ~72). Below is grouped by
target collection with the governing rule and the DATABASE-level verdict for a staff-tier
user (independent of the client can() gate). "Client gate" = what the UI enforces; "DB
allows staff?" = what the rules permit. Representative file:lines cited; the exhaustive
site list is in this session's enumeration. VERIFIED-IN-CODE unless marked.

### Group-level

| Collection | Rule (line) | DB allows staff write? | Client gate | Staff-reachable in UI? |
|---|---|---|---|---|
| group doc `restaurantGroups/{g}` | :57 update = owner/storeAdmin | No | settings:edit (Admin SettingsPage.js:207-386, MenusPage.js:119/124; Ops SettingsScreen.js:85-160) | No |
| staff/{id} | :60 write = manager+ | No | staff:edit (Admin StaffDirectoryPage.js:456-816; Ops StaffFormModal.js:153/179, StaffProfileScreen.js:78-92) | No — **except** self doc-sign Admin :659 (see note ‡) |
| staff/{id}/private/details | :67-74 own = 4-key whitelist | **Own, 4 keys only** | self-service (Admin StaffDirectoryPage.js:933; Ops has none) | **Yes (own, whitelisted)** — DB enforces the whitelist |
| staff/{id}/payrollChangeRequests | :84-91 own = status:pending + 5-key | **Own, bounded** | self-service (Admin :961) | **Yes (own, bounded)** — DB enforces |
| staff/{id}/acknowledgements | :104-107 own or manager+ | **Own** | self-ack (Admin CompliancePage.js:127; Ops ComplianceScreen.js:144) | **Yes (own)** — DB enforces |
| staff/{id}/docHistory | :97-101 create = manager+ | No | staff:edit (Admin :166) | No |
| contracts, settings/*, contractTemplates | :112-140 = owner/storeAdmin | No | contracts/settings:edit | No |
| auditLog | :312 member read+**WRITE** | **YES** | manager-gated in UI (Admin StaffDirectoryPage.js:155, UserManagementPage.js:49; Ops StaffFormModal.js:117) | Indirectly — self-edit/request paths (Admin) fire logChange. **Client stricter than DB — see B4** |
| announcements | :313 member **RW** | **YES** | post = messages:edit; ack readBy = ungated | ack yes; post no. **Client stricter for posting — B4** |
| messages | :314 member **RW** | **YES** | send = messages:edit; readBy = ungated | read-receipt yes; send no. **Client stricter for send — B4** |
| conversations | :309-311 member **RW** | **YES** | create = non-staff | No. **Client stricter — B4** |
| notifications | :306-308 member **RW** | **YES** | mostly ungated; already staff-writable | Yes (notify.js sendNotification + markRead) — DB & client agree |
| availability (group cluster) | :248-252 member RW | **Yes** | self-service PIN (Admin AvailabilityPage.js:144; Ops AvailabilityScreen.js:405) | **Yes (own)** — aligned |
| inventoryItems / recipes / suppliers / purchaseOrders | :257/:267/:283/:289 = manager+ | No | stock/menus/supplier:edit | No — aligned |
| menuItems (group) / modifierGroups | read member / write manager+ (:260-282) | No (write) | menus:edit | No — aligned |
| awardRates / compliance manual | read member / write manager+ (:297-304) | No (write) | compliance:edit | No — aligned |

### Per-venue (`venues/{v}/…`)

| Collection | Rule (line) | DB allows staff write? | Client gate | Staff-reachable? |
|---|---|---|---|---|
| shifts | :198-201 write manager+ | No | shifts:edit (Admin ShiftPlannerPage.js:141-557; Ops ShiftPlannerScreen.js:321-348) | No — aligned |
| timeEntries (+breaks) | :206-216 member create/update | **Yes (kiosk model)** | PIN guardWrite (Ops AvailabilityScreen.js:108-187) | **Yes (PIN)** — DB intentionally loose |
| leaveRequests | :188-193 create own / update manager+ | **Create own** | submit self / decide manager (Admin LeaveRequestsPage.js:134/111; Ops LeaveRequestsScreen.js:203/108) | **Yes (submit own)** — aligned |
| checklists (venue master) | catch-all :148-152 member **RW** | **YES** | checklists:edit + isMgr view (Admin ChecklistsPage.js:103-185; Ops ChecklistsScreen.js:59-200) | No (isMgr branch). **Client stricter — B4** |
| checklistAssignments | catch-all member **RW** | **YES** | own tick allowed; others manager | **Yes (own tick)**; forging others is **client-stricter — B4** |
| trainingModules | catch-all member **RW** | **YES** | training:edit | No. **Client stricter — B4** |
| trainingAssignments | catch-all member **RW** | **YES** | tick/verify = training:edit; own tick read-only on Admin, own on Ops | Ops own tick yes; **verify/forge is client-stricter — B4** |
| trainingArchive / checklistArchive | catch-all member **RW** | **YES** | via completion (completionArchive.js) | checklistArchive **yes (own completion)**; both writable by SDK — B4 |
| stations / equipment | catch-all member **RW** | **YES** | settings:edit (Admin SettingsPage.js:127-200; Ops SettingsScreen.js:54-83) | No. **Client stricter — B4** |
| prepList | catch-all member **RW** | **YES** | canEdit prop (false for staff view) | No. **Client stricter — B4** |
| tempLogs | catch-all member **RW** | **YES** | temperature:edit (staff default edit) | **Yes** — aligned |
| performanceNotes | :169 manager+ | No | performance:edit (Admin PerformancePage.js:102; Ops PerformanceScreen.js:63) | No — aligned |
| kpis | :170 manager+ | No | performance:edit (Admin PerformancePage.js:45-48; Ops PerformanceScreen.js:122-127) | No — aligned |
| stock / stockMovements / stocktakes / batches / production | :157-161 manager+ | No | stock/supplier:edit | No — aligned |
| menuItems (venue instance) | :174-177 write manager+ | No | menus:edit | No — aligned |
| keys (Admin only) | catch-all member **RW** | **YES** | keys:edit (Admin KeysPage.js:71-83) | No. **Client stricter — B4** |
| orders | :181-184 write = **false** (server only) | No (nobody) | — read-only client-side | No — aligned |

‡ **Note (functional, not a security gap):** Admin StaffDirectoryPage.js:659 lets a staffer
"sign their own doc" by writing `signDocs` onto their own `staff/{id}` doc — but rule :60
restricts staff-doc writes to manager+, so the DB would DENY a staff user here. Client is
LOOSER than the rule (would fail at runtime), the opposite of a security exposure — and it
is likely unreachable anyway (Staff Directory is view-gated; staff sit at the "self" floor
< view). Flagged for correctness, not security. NEEDS-LIVE-CONFIRM whether any staff user
can reach that button.

═══════════════════════════════════════════════════════════════════
## B4 — where the CLIENT is STRICTER than the RULE (UI blocks staff; DB would not)
═══════════════════════════════════════════════════════════════════

These are the real exposure: a staff-tier user with a **website login** (B5) who opens a
console/SDK session authenticates as a group member and can write anything the rules permit,
bypassing every client can() gate. Ranked by what the data is.

**1. Assignment completion & training verification — checklistAssignments + trainingAssignments (HIGHEST).**
Rule: venue catch-all :148-152 = member read+WRITE. Client: ticking others is manager-gated;
training verify is `training:edit`. Via SDK a staff user could: mark ANY checklist or training
assignment "Complete" without doing it; **self-sign-off their own training** (`verified:true,
verifiedBy:…`) — defeating the entire compliance-verification purpose; forge assignments for
anyone; delete assignments. This is the one that matters — training sign-off is a controlled
manager action in the UI but wide open at the DB. NEEDS-LIVE-CONFIRM impact per group.

**2. Audit log integrity — auditLog (HIGH).**
Rule :312 = member read+WRITE. Client writes it only from manager actions (and the self-edit/
self-request logging paths). Via SDK a staff user could forge audit entries (frame another
user) or write junk; they cannot DELETE (no rule allows delete → default deny on delete), so
the trail is append-only-ish but forgeable. Integrity, not confidentiality.

**3. Operational templates & config — checklists, trainingModules, stations, equipment,
prepList, keys (MEDIUM).**
Rule: venue catch-all / member RW. Client: settings/checklists/training/keys:edit, all
manager in practice. Via SDK a staff user could create/edit/delete checklist and training
TEMPLATES, add/remove stations and equipment, edit prep lists and key records — operational
vandalism, recoverable, no sensitive data exposed.

**4. Group messaging — announcements, messages, conversations (MEDIUM-LOW).**
Rule :306-314 = member RW. Client gates posting/sending to messages:edit and group-create to
non-staff. Via SDK a staff user could post announcements group-wide, send messages as
themselves to anyone, and create group chats. Impersonation is limited (writes carry their
own identity), so this is spam/nuisance, not escalation.

**5. Notifications — notifications (LOW).**
Rule :306-308 member RW; the client already writes these from staff paths (notify.js), so
this is not a new escalation — but SDK access means a staff user could fire arbitrary
notifications to any user. Nuisance-tier.

**NOT exposures (client and DB agree):** shifts, leaveRequests (create-own), performanceNotes,
kpis, all stock/cost collections, group doc, staff doc, contracts, settings, menuItems,
recipes, suppliers, purchaseOrders, awardRates, compliance manual, orders. The rules already
deny staff writes to every one of these; the recent performanceNotes/kpis rule tightening
(this month) plus the shifts/leaveRequests/stock blocks are what closed them. The remaining
gaps are exactly the collections still riding the venue member-RW catch-all (:148-152).

**Scope bound (B5):** every B4 exposure applies ONLY to staff who hold a Firebase Auth
account (hasAdminLogin/adminUid/email — see B5). PIN-only staff have no auth account, so
`rgIsGroupMember` is false and they cannot touch Firestore directly at all — their only
path is the shared signed-in kiosk device. The population at risk = staff-tier employees
docs with a login. NEEDS-LIVE-CONFIRM (console).
