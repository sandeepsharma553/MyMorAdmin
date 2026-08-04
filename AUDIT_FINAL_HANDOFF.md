# Final planning audit — developer handoff (26 Jul 2026)

REPORT ONLY. No source edited. Tags: **VIC** = VERIFIED-IN-CODE (file:line), **NLC** = NEEDS-LIVE-CONFIRM.

HEADs at audit time (all carry unpushed commits — untouched):

| Repo | Branch | HEAD | Unpushed | Tree |
|---|---|---|---|---|
| MyMorAdmin | main | `bf1604e` | ahead 5 | clean except `.firebase/hosting.YnVpbGQ.cache` noise |
| MyMorOps | development | `dcee864` | ahead 5 | clean |
| MyMorFunction | main | `1a38c60` | ahead 1 | clean |

The five unpushed Admin commits: live-auth bootstrap (b075829), planner zoom (844f228), venue scoping (144ead6), CLAUDE.md rules (63df09d), Friday lock + planner amend (bf1604e). Ops mirrors: ff37816, 52936e7, 5a058b1, 9d8a259, dcee864. Function: CLAUDE.md (1a38c60). **The developer must pull these into any estimate — several "asks" below live in them.**

---

# PART 1: THE SHARED KIOSK AND PIN

## 1a. Every PIN use, all three repos

**Generation** — `genPin(list)`: random unique 4-digit, `Ops rgUtils.js:285-290` (Admin twin used at StaffDirectoryPage:429); importer `MyMorAdmin/scripts/importer/import-staff.js:46` (`const pin = (s.pin && /^\d{4}$/.test(s.pin)) ? s.pin : genPin();` → written at :70). **VIC.**

**Storage** — `staff/{id}.pin` string, part of the staff doc schema (Admin CLAUDE.md:135). Written by: Admin staff add (`StaffDirectoryPage.js:429-430` — `(form.pin||"").trim() || genPin(staff)` + uniqueness check), Admin staff edit (:579-580), Ops StaffFormModal (:146-147 — same auto-gen + uniqueness), importer (:70). Drafts deliberately get NO pin (`StaffDirectoryPage.js:472, :491` — "Ops POS/PinIdentify key off a non-empty pin, so drafts stay invisible there"). **VIC.**

**Validation** — one place only: `matchStaffPin` in `MyMorOps/src/components/PinIdentify.js:18-19`:
```js
export const matchStaffPin = (staff, entered) =>
  !!staff && typeof staff.pin === "string" && staff.pin.length > 0 && staff.pin === String(entered);
```
Plain-text equality against the group-readable staff doc (already flagged in the Ops security audit as PIN exposure). `PinIdentify` renders a name grid → masked 4-digit pad → `onResolved(staff)` (:23-45). **VIC.**

**Display** — Admin: staff card pill `PIN {s.pin}` (`StaffDirectoryPage.js:1589`), profile "POS PIN" row (:1688), self-view KV (:1411), form input (:1620-1623), search includes pin (:276, :1529). Ops: StaffProfileScreen Info row (:150), StaffFormModal field (:203), directory search (:89, :157). **VIC.**

**Screens requiring a PIN** — exactly two, both Ops:
1. **Clock kiosk** — `AvailabilityScreen.js`: `withPin = inScope.filter((s) => typeof s.pin === "string" && s.pin.length > 0)` (:56), PinIdentify gate (:235), `guardWrite = () => canView && !!identified && typeof identified.pin === "string" && identified.pin.length > 0` (:101). Banner: "{n} staff don't have a PIN yet and can't clock in" (:231).
2. **Ops POS** — `PosScreen.js` (1b below).

**Function repo: PIN not found** (grep-complete — no PIN logic server-side; `rgSellOrder` validates the staff **id**, not the pin — the pin never leaves the client). Admin web POS **deliberately has no PIN gate** — "everyone signs in with their OWN account, so the login IS the identity" (`PosPage.js:150-158`). **VIC.**

## 1b. POS identification flow (Ops)

`PosScreen.js:166-189` — **VIC**:
- `operator` state = PIN-identified staff; `posStaff` = venue staff with a pin (:173).
- Venue switch signs the operator out if not at the new venue (:177-178).
- **Admin-tier bypass**: owner/storeAdmin sell WITHOUT a PIN — "deliberately unattributed — no staff key; soldByRole marks the intent" (:180-183); `wantPin` lets staff re-open the PIN gate on an admin-logged till (:184-187). `canSend = !!operator || adminSeller` (:189).
- **What the order stores**: client sends `orderMeta.staff = { id }`; "the server validates the id against the group's staff collection and stamps staffId/staffName on the order doc, which feeds the per-staff sales figures on the Performance screen" (:168-170). Attribution is therefore **staffId, not PIN** — the PIN is only the local unlock.
- **Nobody identified**: full-screen gate — "no orders until someone identifies with their POS PIN" (:412-424); if no venue staff have PINs, a "No staff with a POS PIN" empty state (:423-424).

## 1c. Clock in/out identification flow (Ops)

`AvailabilityScreen.js` — **VIC**: PinIdentify resolves `identified` (:38, :235) → venue resolution (`venueForClock` :60-66, multi-venue staff must pick :71) → `doClockIn` writes to `venues/{venueForClock}/timeEntries` via `newClockInPayload({ staff: identified, ... enteredByUid: actorUid })` + serverTimestamps (:105-117). Attribution on the entry: `staffId: staff?.id, staffName, enteredBy: enteredByUid` (`timeEntry.js:38-50`) — i.e. **the PIN-identified staffer is the subject; the LOGGED-IN device account is recorded as `enteredBy`**. Breaks are subcollection docs; clock-out closes + best-effort recompute; manager approve recomputes (`:534-543`). Every write re-checks `guardWrite()` (:101). The rules deliberately allow this shared-terminal model: "the kiosk is a SHARED terminal — the signed-in device account writes on behalf of staff (identity is the in-app PIN, NOT auth.uid)" (`firestore.mymor-australia.rules:203-206`, timeEntries member-write). **VIC** (rules parity NLC).

## 1d. Inactivity timeout / session release

**Not found anywhere in Ops** — no inactivity/idle/auto-lock timer exists (grep across PosScreen, AvailabilityScreen, AppShell; the only timers are the 30s elapsed-display tick and the 1s break countdown, `AvailabilityScreen.js:50, :204-209`). Current release mechanisms are manual/一-shot: clock kiosk returns to the name grid after clock-out (:177) or "Done" (:270); POS keeps `operator` until venue switch (:177) or manual sign-out. **Building one would touch**: a shared idle hook (last-interaction timestamp + timeout) applied to `operator` (PosScreen) and `identified` (AvailabilityScreen) — both are single `useState`s, so release = set to null; plus a decision on half-built carts (release mid-order discards or parks the cart). No navigation/library obstacle. **VIC** for absence.

## 1e. Would the kiosk account work TODAY? Walk-through

Setup assumed: employees/{uid} login with `groupRole:"staff"`, permissions `{ pos:"view"/"edit", availability:"view", everything else "none" }`; one staff doc per venue named after the venue, `adminUid` linked, `venueIds:[thatVenue]`.

- **RGContext**: `myStaff` resolves by adminUid/email → the kiosk staff doc; `myScope = "staff"`; `myVenues` = the one venue (144ead6); the guard effect **pins `selectedVenue` to that venue and hides "All venues"** — correct kiosk behaviour for free. Staff-tier fan-out subscribes only that venue; `MGR_ONLY_VENUE_COLLS` skipped. **VIC** (unpushed commits).
- **AppShell nav**: `NAV.filter((n) => can(n.permKey || n.key, "view"))` (`AppShell.js:78`). With the permissions above the sidebar shows: **POS**, **Clock in** (permKey `availability`), and — unavoidable coupling — **Availability** (same `availability` key gates both entries, `AppShell.js:41-42`). So the kiosk also gets the self-availability poster, where it could post availability *as the kiosk staff doc*. Cosmetic but wrong; no per-entry gate exists to separate clock from availability today. **VIC.**
- **Clock kiosk works**: `withPin` lists the venue's staff (kiosk pinned to its venue); PIN → timeEntries attributed to the real staffer; `guardWrite` passes (`canView` = availability:view). **VIC.**
- **POS works**: `posStaff` lists venue staff with PINs; kiosk login is `groupRole:"staff"` so **no admin bypass** — every order needs a staff PIN (desired); sale itself is server-gated by rgSellOrder (stock OR pos permission — the kiosk's own permission, fail-closed). **NLC**: confirm rgSellOrder accepts the kiosk employee's permission set (it checks the CALLER's permission; kiosk has pos → passes).
- **Failure/wrinkle points**: (i) the Availability entry above; (ii) **the kiosk staff doc cannot avoid having a PIN** — both save paths auto-generate one when blank (`StaffDirectoryPage.js:429`, `StaffFormModal.js:146`), so "the venue" appears as a tappable name in the clock grid and POS operator grid, and someone who learns its PIN can clock in/sell as "Benji Kiosk"; (iii) Messages default staff `view` — set to none or the kiosk shows the venue channel; (iv) notifications `to:"all"` reach the kiosk bell (cosmetic); (v) the kiosk can see the venue's roster via `shifts:view` default — set to none if unwanted (defaults: staff shifts:"view", `rgConfig.js:97`).

**Verdict: substantially workable today** via permissions alone; the real gaps are 1f (appearing in people lists) and 1d (no inactivity release).

## 1f. Everywhere a kiosk STAFF DOC would appear (the critical list)

The kiosk staff doc is an ordinary Active staff doc, so it appears in every staff-derived surface — **VIC** for each:

| Surface | Inclusion code |
|---|---|
| Admin Staff Directory list + header count | `rows` filter over all staff (`StaffDirectoryPage.js:272-280` — filters are search/venue/station, no type exclusion) |
| Admin Shift Planner grid row | `const rows = useMemo(() => visibleStaff.filter((s) => staffInVenue(s, selectedVenue) && !hasLeft(s)), ...)` (`ShiftPlannerPage.js:126-128`) → `groupedRows` (:426); appears under "No area assigned"/its area at its venue |
| Ops planner grid | same shape via `scopedStaff.filter(staffInVenue(...))` (`ShiftPlannerScreen.js` RosterGrid sections) |
| Clock kiosk name grid + POS operator grid | `withPin` / `posStaff` filters (`AvailabilityScreen.js:56`, `PosScreen.js:173`) — kiosk doc auto-has a PIN (1e) |
| Leave request form staff picker + history | LeaveRequestsPage staff pickers list active staff |
| Training/Checklist/SOP manual-assign pickers | staff lists on those pages (e.g. eligible-staff pickers; `moduleForStaff`/`checklistForStaff` gate by venue/area/role, which a kiosk doc may pass for venue-wide items) |
| Recurring auto-assign (Function) | `staff.filter((s) => (s.status || "Active") === "Active" && shouldAutoAssign(c, s, v.id))` (`index.js:3214-3216`) — kiosk is Active at the venue. It escapes ONLY because it has no stations and (presumably) no matching role; an untargeted item now assigns to NOBODY. **If the owner gives the kiosk doc a real role name (e.g. "FOH"), role-targeted checklists/training will auto-assign to the kiosk.** Shift-trigger paths are safe (kiosk is never rostered) |
| Messaging | venue team channel membership (staff.venueIds), DM pickers |
| Contract generator staff picker, capability card, staff CSV exports | staff-list driven |
| Headcounts and totals | directory header count; planner hours column shows a 0h row; labour totals unaffected (no shifts) |

**No existing mechanism excludes a staff doc from people-surfaces** — there is no `isKiosk`/`type:"Kiosk"` concept anywhere (not found). Whatever the developer builds (a flag, a reserved type, an empType), every surface above filters on nothing today. The cheapest robust shape given `resolveEmpTypes` is owner-configurable types (`staffStructureUtils.js:9`) is NOT enough by itself — nothing consumes a type as an exclusion. This is the core build of Part 1.

## 1g. What relies on PIN that the new model touches

PIN *stays* for kiosk identification, so PinIdentify/POS gate/genPin all survive. What needs rethinking under "every real staff member has their own login":
- The **"PIN-only staff" concept** — Admin form copy "Secure Firebase login for the website. Leave off for POS-only staff (PIN only)." (`StaffDirectoryPage.js:1637`); importer's optional-login path (`import-staff.js:70` `hasAdminLogin`); capability-card "unresolvable (PIN-only, no link)" state (:1378). Under the new model these become setup errors, not supported states.
- **noPinCount banner** (`AvailabilityScreen.js:231`) — still valid (kiosk-identification needs a pin), but its framing ("can't clock in") now describes the kiosk flow only.
- **PIN visibility**: staff-visible per owner ruling — currently visible to ANY directory viewer (Admin pill :1589 renders for everyone with staff view; Ops profile :150). "remains visible to the staff member" ≠ "visible to everyone" — the current display is broader than the stated model. Decision needed.
- **Plain-text PIN on a group-readable doc** (security-audit residual) — unchanged by this model; the kiosk shared-terminal design makes PIN the only barrier between colleagues on that device.

---

# PART 2: TEMPERATURE LOG — RE-AUDIT

Both the owner and the previous audit are right — about different halves.

## 2a-2b. The Settings UI and the doc

`SettingsPage.js:167-204` — **VIC**:
```js
const UNIT_TYPES = ["Fridge", "Freezer", "Cool room", "Hot hold", "Grill", "Display", "Other"];
const DEFAULT_RANGE = { Fridge: [1, 5], Freezer: [-22, -15], "Cool room": [1, 5], "Hot hold": [60, 75], Grill: [165, 230], Display: [1, 5], Other: ["", ""] };
const SUGGESTED_UNITS = [["Fridge 1", "Fridge"], ["Fridge 2", "Fridge"], ...];
```
Create: "+ Add unit" opens a form with free-text **name**, a **type `<select>` hard-bound to `UNIT_TYPES`** (:798), min/max safe range (auto-seeded from `DEFAULT_RANGE` on type change), saved via `saveUnit` (:173-193) to `venues/{venueTab}/equipment/{slug}` with payload `{ name, type, venueId: venueTab, order, minTemp, maxTemp, createdAt }` — **venueId IS written** (:181, :196). "Quick add" buttons seed the SUGGESTED_UNITS per venue (:194-198). Venue tabs select which venue you're editing (:486-489); empty state "No units yet for this venue." (:518).

## 2c. The log pages

Admin `TemperatureLogPage.js`: venue tabs over the user's scoped venues (:20-30), `venueUnits = equipment.filter((e) => e.venueId === venueTab)` (:33), readings → `venues/{venueTab}/tempLogs` `{ unitId, unitName, type, temp, ok, minTemp, maxTemp, note, recordedBy, recordedById, venueId, dateKey, at }` (:58-64), out-of-range fires `sendNotification(to:"managers")` (:68). Ops `TemperatureLogScreen.js` mirrors (scopedVenues :29-34, venueTab :35-43). **VIC.**

## 2d. The two claims, resolved precisely

- **"Prefilled unit types with no way to add new ones" — TRUE.** `UNIT_TYPES` is a hardcoded constant; the type field is a `<select>` over it with no free-entry (:798). The escape hatch is the literal type `"Other"` (no seeded range). The unit NAME is free text — the owner can create any unit, but its TYPE label must be one of seven. **VIC.**
- **"Nothing is assigned to a location" — FALSE in code.** Units are created under a venue tab, stored in that venue's subcollection with `venueId`, and both log pages filter by venue. If every venue shows the same units, that is quick-add seeding per venue (data), not shared definitions. **VIC**; live data check **NLC**.

## 2e. What "owner-managed types, per venue" would require

Types are display labels + a range-seeding convenience — readings copy `type` as a string. So: an owner-editable type list (the established pattern is a group-doc field like `group.empTypes`/`certOptions` — e.g. `group.tempUnitTypes` with seed fallback, plus optionally a ranges map mirroring `DEFAULT_RANGE`'s shape, cf. `areaBreak`/`empTypeSalaried` whole-map-write convention) + swapping the two constants for resolvers in the ONE Settings site and keeping `DEFAULT_RANGE` as the seed. **Existing readings need nothing** — they carry their own `type` string and range snapshot. Per-venue assignment already exists. No rules change (group doc is already owner-writable; equipment rides the venue rule). **VIC.**

---

# PART 3: THE CLIENT'S ORIGINAL LIST, RE-CHECKED

| # | Item | Status | Evidence |
|---|---|---|---|
| 3a | Multi-venue split view | **PARTIALLY** | Two panes exist, each with its own venue select (`ShiftPlannerPage.js:81-83, :856-864`; Ops :432-440). Missing: >2 panes / multi-select. |
| 3b | Zoom in/out | **ALREADY BUILT** (Admin, unpushed 844f228) | Presets 75/100/125/150 via `--rg-zoom` (`ShiftPlannerPage.js:790-795`). Ops zoom NOT built (5d). |
| 3c | Contracted vs rostered per person | **ALREADY BUILT** (Admin) | Hours cell contracted line + shortfall (`ShiftPlannerPage.js:773-783`), under-contract strip (:907), ReportsPage (:64). Gate is currently non-Casual (the full/part-time-only narrowing was built then reverted on owner instruction — diff preserved in session log). Ops: no contracted surfaces (by design, `contractedHours.js:1-2`). |
| 3d | Leave explains under-hours | **ALREADY BUILT** (as suppression) | `contractedWeekStatus` `onLeave → status "leave"` — no contracted line/strip entry for leave weeks (`contractedHours.js:89-95`; planner :441, :773). If the owner wants "short BY x, because leave" displayed, that's a change (leave has no hours dimension — days only). |
| 3e | Owner manually adjusting hours in profile history | **NOT BUILT** (built once as hours-owed, then discarded at owner's request — clean tree) | Nothing in tree; `records` free-text log exists (`StaffDirectoryPage.js:626-641`). |
| 3f | Hours owed manual field | **NOT BUILT** (same revert) | The reverted implementation (date-ranged entries, calculated-vs-override reusing `contractedWeekStatus`) is fully specified in the session log if wanted again. |
| 3g | Pay from clock in/out | **NOT BUILT** | No pay calculation exists anywhere; planner labour is rostered×flat-rate (`ShiftPlannerPage.js:314-317`); nothing reads timeEntries for money; Admin doesn't even subscribe timeEntries (`restaurantGroupPaths.js:71-76` excludes it). Two disjoint punch systems (Admin shift-doc ISO fields :825-830 vs Ops timeEntries) must be reconciled first. |
| 3h | Dashboards (staff + owner) | **NOT BUILT** | No dashboard page/module/route in the RG tree (grep "Dashboard" in rg pages + routes: not found). Part 6 inventories feedable metrics. |
| 3i | Clock in/out in User Management | **NOT BUILT** | UserManagementPage has no timeEntries/clock reference (grep: only an auditLog write). Also NB: Admin has no timeEntries subscription at all. |
| 3j | Keys in User Management | **NOT BUILT** | No keys reference in UserManagementPage (grep-complete). Data ready (5b). |
| 3k | Notifications composer + recurring | **NOT BUILT** | No composing UI for `notifications` anywhere (every sendNotification is a side effect); no templates/schedule/scheduler arm (Part 4). |
| 3l | Temperature per location | **ALREADY BUILT** (venue-scoped end to end — Part 2); the real gap is owner-managed TYPES | `SettingsPage.js:181` venueId; `TemperatureLogPage.js:33` filter. |
| 3m | Keys count on staff record | **NOT BUILT** | StaffDirectoryPage never reads keys (grep-complete). |
| 3n | Group message member edit | **NOT BUILT** | No updateDoc on conversations in either app (Admin MessagingPage updateDocs are readBy acks only :107/:165; Ops same). |
| 3o | Staff see only their own location (Admin) | **ALREADY BUILT** (unpushed 144ead6) | myVenues fan-out + switchers + matchVenue (`RGContext.js:234-262`, `RestaurantGroupLayout.js:146-149`). UI/data-layer only — rules still group-wide (stated in the commit). |
| 3p | Refresh in the Ops app | **NOT BUILT** | No RefreshControl/onRefresh anywhere in Ops src (grep-complete). NB everything is onSnapshot-live, so "refresh" likely means perceived staleness — worth asking what the owner observes. |
| 3q | Ops planner own-location only | **ALREADY BUILT** (unpushed 5a058b1) | Ops RGContext venue scoping + AppShell chips + planner myVenues (`5a058b1` diff). |
| 3r | Availability Friday lock | **ALREADY BUILT** (unpushed bf1604e/dcee864) | `isDayLocked` twins + poster read-only rows + save guards + tests (`availabilityModel.js:25-46` + AvailabilityEditor.js). |
| 3s | Push notifications | **NOT BUILT for Ops/RG** | Function has FCM machinery for hostel/uni surfaces (`index.js:481-929` sendEachForMulticast) but no RG arm; Ops has NO firebase-messaging client (package.json grep: not found); the announcement push trigger is dead (path+db mismatch — prior audit). Certificate/APNs work + token collection + staffId→uid bridge all outstanding. |
| 3t | Notes icon on shifts (Ops) | **ALREADY BUILT** (unpushed 52936e7) | Chip renders `{sh.notes ? " 📝" : ""}`. Admin already had it. |

---

# PART 4: NOTIFICATIONS — THE FULL PICTURE

## 4a. rgNotify + shape + rule

Function `index.js:2826-2841` (quoted in AUDIT_PHASES_2_3_4.md §2a); client twins Admin `notify.js` / Ops `lib/notify.js`. Doc: `{ to, type, title, body, venueId, by, readBy[], at }`. Rule (`rules:306-308`): flat `rgIsGroupMember` read/write. **VIC** (parity NLC).

## 4b. Every `to` consumer + what a "staff" audience touches

Consumers (grep-complete): Ops `RGContext.js:439-447` and Admin `RGContext.js:422-430` — the identical filter `n.to === "all" || n.to === myId || (n.to === "managers" && mgr)`; the bells render `myNotifications` (Admin `RestaurantGroupLayout.js:58-71`, Ops AppShell). Writers never filter. Adding `to:"staff"` touches exactly: **both RGContext filters** (one line each — `(n.to === "staff" && !mgr)`), the composer, and optionally the Function's comment. Old app versions ignore the new value silently (filter mismatch = not shown) — an Ops TestFlight release is required for staff-tier phones to SEE staff-addressed sends. **VIC.**

## 4c. The scheduling pattern

`rgRecurringChecklists` (`index.js:3172-3245`): daily 03:00 `Australia/Sydney` `onSchedule`; per-doc schedule fields `frequency` / `scheduleDay` / `scheduleDate` / `anchorDate`; fortnightly parity via `rgFortnightDue(anchorStr, now)` (:3156-3170 — parse-by-parts, Monday-reduce both ends, `Math.round` week count, null on invalid anchor → log and skip, never fall back to createdAt); dueness recomputed each run (no next-run field); idempotency via deterministic ids `rec-{id}-{staffId}-{dateKey}` + exists-check (:3221-3224). **VIC.**

## 4d. What a recurring notification needs that does not exist

Nothing of it exists: no template doc, no schedule fields, no scheduler arm, no dedupe convention, and **no rules match block for any new group-level collection** (group-level has no catch-all — a `notificationTemplates` collection is denied until a rule ships; NLC vs deployed). Needed: a template collection `{ title, body, to, frequency ("weekly"|"fortnightly"|custom), scheduleDay, anchorDate, active }`, a new arm in the SAME daily job (reuse `rgFortnightDue`; "custom" cadence needs a definition — see decisions), deterministic send-ids (e.g. `ntf-{templateId}-{dateKey}`) — note the notifications feed uses `.add()` today, so deterministic ids mean a `.doc(id).set()` variant, and the composer's "send now" can keep `.add()`. Delivery time is the job's 03:00 unless a separate schedule/arm is added. **VIC** for all absences.

## 4e. Retention (owner wants 90 days)

**Nothing deletes notifications today** (grep-complete: no deleteDoc/TTL/cleanup in either notify.js or index.js; only client display cap `.slice(0, 80)`). A 90-day retention needs BOTH: a scheduled Function arm (batch-delete `at < now-90d` — the daily job is the natural home; needs nothing new in rules since Functions bypass them) AND nothing client-side strictly, though the whole-collection subscription (`subColl(notificationsCol...)`, Admin :166 / Ops :204) is the real cost driver — cleanup caps it; a `where("at", ">")` query would too but changes the subColl pattern. **VIC.**

## 4f. Push (summary only)

Server: generic FCM fan-out machinery exists (`sendEachForMulticast` ×9 call sites, hostel/university surfaces) but **no RG-scoped push arm**; the one announcement-push trigger is dead (path + database mismatch — prior audit, NLC unchanged). Ops client: **no `@react-native-firebase/messaging`/token collection at all** (not found) — APNs certificates/entitlements + token storage are greenfield. **The staffId→uid bridge**: notifications address staffIds/"managers"/"all", but push targets device tokens keyed by AUTH USER — the bridge is `staff.adminUid` (now guaranteed under "everyone has a login", making push *more* feasible than at the last audit). **Kiosk complication**: the kiosk uid maps to a venue-named staff doc; pushing to "all"/"staff" would ping the kiosk iPad — the audience filter (4b) and/or the kiosk-exclusion flag (1f) must exclude it from push fan-out too. **VIC/NLC as marked.**

---

# PART 5: THE REMAINING SMALL ITEMS

## 5a. Group chat membership — WhatsApp-style removal

Doc: `{ name, type:"group", memberIds[], memberNames[], createdBy, createdByName, createdAt }` in group-level `conversations`; created by one addDoc with self force-included (`MessagingPage.js:200-203`; Ops `MessagingScreen.js:247`). Messages under `conversations/{id}/...`. List filter is client-side membership (`Admin :121`, `Ops :119`). **No edit path exists** (3n). Rule today (`rules:309-311`):
```
match /conversations/{conversationId}/{rest=**} {
  allow read, write: if rgIsSuper() || rgIsGroupMember(groupId);
}
```
**What it would need to become** for true removal: split parent-doc vs messages, and gate on membership, e.g. read/write of `{rest=**}` requires `get(conversation).data.memberIds hasAny [staffId]` — with the structural catch that `memberIds` hold **staffIds** while rules see `auth.uid`; the existing `rgIsOwnStaff(gid, staffId)` helper (adminUid OR email match) is the bridge, but a rules-side "is my staffId in this array" requires either storing UIDs alongside (`memberUids[]` — the clean fix, needs a backfill for existing groups) or an exists() lookup per staffId (expensive/impractical). Also membership edits themselves need a writer rule (creator/managers per decision). **Breakage check**: both apps' conversation LIST subscriptions read the whole `conversations` collection (Admin `MessagingPage.js:59`, Ops RGContext) — a membership-gated read on conversation DOCS would make those listeners fail for non-members (collection queries fail wholesale if any doc is unreadable) → the subscription must become a `where("memberUids", "array-contains", uid)` query in BOTH apps. That is the true cost of enforcement. **VIC** (rule parity NLC).

## 5b. Keys → staff-record count

Feature end-to-end: `venues/{v}/keys/{id}` `{ keyLabel, staffId|null, holderName, issuedOn, notes, createdAt, updatedAt }`, one screen (`KeysPage.js` — per-venue listeners :27-35, table :141-179, move-venue = delete+re-add :70-75, departed-staff chase flag :160), permission `keys` (owner/storeAdmin edit, manager view, staff none; Ops entry inert). Staff profile today renders: profile/history/docs tabs — payroll, certs, training, checklists, records, role/venue history, shift history — **no keys anywhere**. Adding a count touches: a keys read in StaffDirectoryPage (either a new per-venue listener set mirroring KeysPage's, or a one-shot getDocs on profile open), a `filter((k) => k.staffId === profile.id)` count + optionally the key labels, gated for display by the `keys` permission (manager view suffices). No schema/rules change. **VIC.**

## 5c. Split view — more panes / multiple venues per pane

Today: `splitMode` boolean; exactly two panes; per-pane `<select>` over `myVenues`; `VenueGrid vid` renders ONE venue (`ShiftPlannerPage.js:81-83, :856-864`; VenueGrid :598+; Ops mirror :432-440). Supporting N panes = state array + map (layout: two panes already fill the width — 3+ needs horizontal scroll or relies on the zoom feature to shrink). "Multiple venues per pane" is a different thing: `VenueGrid` and `cellShiftsV` already accept `vid === "all"` (:597 — `(vid === "all" || sh.venueId === vid)`), so a pane CAN show all venues today; arbitrary venue SUBSETS per pane would generalise that equality to a set membership — small change to `cellShiftsV` + the pane select becoming multi-select. Decide which of the two the owner means. **VIC.**

## 5d. Ops zoom

Grid sizing: `const CELL_W = 120` (`ShiftPlannerScreen.js:33`) → `dayCell`/`dayCellBody` widths + `minHeight: 64` (:651, :658); chip fonts fixed (`chipTime` 11 / `chipSub` 10, :663-664). **No gesture library installed** (no gesture-handler/reanimated in package.json — grep-complete). Preset buttons (Admin-parity, `844f228` pattern): convert the size constants to zoom-derived values, move the affected style keys to computed styles, session-only state — no dependency, no native rebuild beyond the normal release. Pinch gesture: new native dependency (pod install, TestFlight) or raw PanResponder math, plus continuous-scale re-layout cost on a 7×N grid. **VIC.**

---

# PART 6: DASHBOARDS — WHAT DATA EXISTS

## 6a-6b. Metrics already computed (and where rendered)

| Metric | Computed | Rendered |
|---|---|---|
| Weekly rostered hours (paid/gross/unpaid, per staff + totals) | `effectiveBreak` sums (`ShiftPlannerPage.js:761-790`); Ops `labourSummary` (`rgUtils.js:158-166`) | Planner hours column + footer, both apps |
| Labour cost + labour % of revenue | `labourCost = totalHours * hourly`, `labourPct` vs `labourTargets.weeklyRevenue` (`ShiftPlannerPage.js:314-317`; Ops :245-249) | Planner header line (:954); Ops summary |
| Under-contract staff + shortfall | `contractedWeekStatus` (`contractedHours.js:84-100`) | Planner strip (:907) + Hours cell; ReportsPage (:64) — the one existing "report" page |
| POS sales by staff (month) | client aggregation of venue `orders` — `by[k].orders += 1; by[k].total += Number(o.amounts?.total)` (`PerformancePage.js:59-82`) | Performance page (both apps) |
| Training / checklist completion % per staff | `trainingPct` (`rgUtils.js:109-112`), `checklistPct` | Staff directory cards, training pages, capability card |
| Hours worked by period, 4 pay buckets (Mon–Fri/Sat/Sun/PH) + break split | `renderHistory` buckets (`StaffDirectoryPage.js:1102-1152`) | Staff profile History tab |
| Temperature compliance today (logged count, out-of-range count) + month calendar | `todayDone`/`outToday`/`byDate` (`TemperatureLogPage.js:50-99`) | Temperature page |
| Unread messages / notifications counts | RGContext unread memos | Sidebar badges/bells both apps |
| KPI docs (per-venue `kpis` collection, manager-only) | subscribed via fan-out | PerformancePage KPI section |
| Weekly shifts-per-staff (current week) | `weeklyHours` (`rgUtils.js:264-267`) | directory cards |

**No dashboard surface exists** (3h); ReportsPage is the only aggregation page (module levels deliberately view-only).

## 6c. Staff-facing dashboard inputs (already computed per person)

Own shifts (planner staff-tier view is already self-scoped person-wise + now venue-scoped), own training/checklist assignments + pct, own availability postings (poster), own leave requests + statuses, own hours-by-period (profile History), own capability card, notifications/messages unread. All per-person computations exist; a staff dashboard is composition, not new math. **VIC.**

## 6d. What an owner dashboard would want that does NOT exist

- **Revenue actuals over time** — orders exist per venue, but the only aggregation is month-to-date-by-staff (PerformancePage); no daily/weekly revenue series, no venue comparison.
- **Actual wage cost** — nothing computes money from timeEntries (3g); labour cost is rostered×one flat group rate, not per-person rates.
- **Rostered vs actual hours variance** — Ops has `matchTimeEntry` per shift (`shiftTimeLink.js:19-27`) but nothing aggregates it; Admin can't (no timeEntries subscription).
- **Cross-venue temperature/checklist compliance rollup** — per-venue counts exist; no group-level rollup.
- **Leave liability / balances** — leave has no balance concept anywhere (days requested only).
- Any **historical trend storage** — everything is computed live from raw docs; no aggregates collection, so long-range trends re-read everything (cost grows with data).

---

# (A) ALREADY BUILT — no work needed

1. **Temperature per-venue scoping** (3l) — units, log pages, readings all venue-scoped (`SettingsPage.js:181`, `TemperatureLogPage.js:33`). Gap is only the hardcoded `UNIT_TYPES` list (Part 2).
2. **Contracted vs rostered per person** (3c) + **leave-week suppression** (3d) — planner Hours cell, strip, ReportsPage (`contractedHours.js:84-100`).
3. **Admin planner zoom presets** (3b) — unpushed 844f228.
4. **Venue scoping, staff see own location only** — Admin (3o, 144ead6) and Ops (3q, 5a058b1), unpushed. UI/data boundary, not rules.
5. **Friday availability lock** (3r) — both apps, unpushed bf1604e/dcee864, test-locked.
6. **Ops shift notes icon** (3t) — unpushed 52936e7.
7. **Manager amend-availability from the planner** — bonus of bf1604e (chip → shared editor, audit-logged).
8. **Clock kiosk + POS PIN attribution machinery** (Part 1) — the kiosk MODEL is largely operable via permissions today; what's missing is the exclusion flag (1f), inactivity release (1d), and the Availability-entry coupling (1e).
9. **Notification SEND plumbing ×3 repos** — only the composer UI + recurring/retention machinery are new.

# (B) DECISIONS STILL OPEN

1. **Kiosk exclusion**: the kiosk staff doc will appear in the directory, planner grid, leave/training pickers, PIN name grids and headcounts (1f). Do you want a dedicated marker (e.g. a reserved employment type or an `isKiosk` flag) that all people-surfaces filter on? (Something must be chosen — nothing exists.)
2. **Kiosk PIN**: staff-doc saves auto-generate a PIN, so "Benji Kiosk" becomes a tappable clock/POS identity. Should kiosk docs be PIN-less (needs a form change) or is a kiosk PIN acceptable?
3. **Kiosk sidebar**: the `availability` permission gates BOTH "Clock in" and the self-availability poster — the kiosk gets both or neither today. Split them into separate permissions, or accept the poster's presence on the kiosk?
4. **Inactivity release**: how long is "a period of inactivity" (POS operator and clock kiosk), and does releasing mid-order discard or park the cart?
5. **PIN visibility**: PINs currently show to anyone with staff-view (directory pill). The model says visible to the staff member — restrict display to self + owner/storeAdmin, or leave as is?
6. **"Everyone has a login" migration**: existing PIN-only staff (no adminUid/email) — who creates their logins, and is the importer's no-login path retired? (Push delivery in Part 4f depends on this bridge.)
7. **Temperature types**: owner-editable type list stored on the group doc (with per-type default ranges), keeping the current seven as seed — confirm, and confirm existing readings stay untouched.
8. **Hours owed**: the reverted implementation recorded date-ranged entries with a calculated shortfall (leave weeks contributing 0) + manual override. Rebuild as designed, or a simpler single manual number per staff?
9. **Pay from clock**: Admin planner still writes punches onto SHIFT docs while Ops writes timeEntries — which is the single source of truth for pay, and does Admin gain a timeEntries subscription? Also: per-person rates are owner-only private data — may managers see computed pay?
10. **Composer audience**: "staff and managers only" — is `to:"staff"` a new audience alongside "managers" (both apps' filters change; old Ops builds won't show it until updated), and should the kiosk account be excluded from "all"/"staff"?
11. **Composer permission**: which module gates the new sidebar item — a NEW `notifications` module row (cleanest under RULE 1), or reuse `messages`? And is send-permission enforced in rules or client-only (must be labelled if cosmetic)?
12. **"Custom" recurrence**: weekly and fortnightly map to the existing scheduler pattern — what does "custom" mean concretely (every N weeks? specific dates?), and is 03:00 Sydney delivery acceptable or do you need send-time control (a different scheduling mechanism)?
13. **Retention**: confirm hard-delete at 90 days via a daily Function arm (bell history disappears at 90 days — no archive).
14. **Push scope**: push for "messages, rostering, assignments" requires Ops FCM client work + APNs certificates + an RG server arm — confirm this is in scope for this phase, and whether bell-only is an acceptable first ship.
15. **Group chats**: true removal requires storing member UIDs and switching both apps' conversation subscriptions to membership queries (5a). Accept that scope, or ship client-only hide (removed member's app no longer lists it, but a crafted client could still read history)?
16. **Group chat editors**: who may add/remove — creator only, any member, or managers+?
17. **Split view**: which ask is it — more than two single-venue panes, or fewer panes each showing a venue SUBSET? (Both are possible; costs differ.)
18. **Ops zoom**: preset buttons (no new dependency, Admin parity) or true pinch (new native dependency + TestFlight)?
19. **Ops "refresh"**: everything is live onSnapshot — what staleness is actually being observed? (If it's the frozen-permissions/kill-restart class, that was fixed in unpushed ff37816; a pull-to-refresh gesture may be treating the symptom.)
20. **Dashboards**: given Part 6, which 3-5 owner metrics come first (labour % vs revenue, under-contract, sales by venue, temperature compliance…), and is a staff dashboard a separate nav item or the existing self-scoped screens recomposed?
21. **Deploy sequencing**: 11 unpushed commits across three repos predate all of this. Push + deploy (Admin hosting, Ops TestFlight, Functions) first so the developer builds on what's actually live? (Functions deploy also carries Sandeep's unverified 1f41851/81f9e1d — NLC.)
