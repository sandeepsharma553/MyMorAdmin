# Item 1 — "SOP / training / checklist assignments never reach staff" — findings (2026-07-22)

Live-data audit of group `WjaBnLrRfFgXzDd60FnX` (mymor-australia) + code read across
Admin/Ops. Read-only — no data was changed. PDF hypotheses answered first, root causes after.

## Hypothesis verdicts

**H1 — "the scheduler hasn't run": NO (it runs), but it can only assign what the data targets.**
`rec-foh-weekly-cleaning-<staffId>-<weekKey>` docs exist for 2026-07-13 and 2026-07-20 —
the recurring checklist Function fires Mondays and writes assignments. However the daily
checklists (5 of 6 at Mad Benji) have **zero** `rec-*` docs ever — daily recurrence produces
nothing (see cause 3). Training/SOP immediate assign is client-side and works (proof: the
station-targeted "Bar On Duty — SOP" auto-assigned Angelina on 2026-07-20).

**H2 — "area and station are checked in different places": NO mismatch.**
Assign path (`shouldAutoAssign`) gates venue → area → station-targets/roles; visibility path
(`checklistForStaff` / `moduleForStaff`) gates venue → area, station deliberately a ranking
nudge only. Both byte-identical across Admin/Ops (parity tests green). An area+station item
assigned to a station-tagged staff member is visible to them — no read/write field divergence.

**H3 — "SOPs have no assignment mechanism": PARTLY.**
SOPs share the training-module save path (`sop: true` flag) including immediate auto-assign —
mechanism exists and works. But 2 of the 3 live SOPs carry no `autoAssign` targets at all, so
they assign to nobody automatically (manual assign only).

**H4 — "write lands where the read doesn't look": NO.**
Writes land under the item's venue; both apps flatten ALL venues' assignment subcollections
(Ops `flat("trainingAssignments")`, Admin RGContext equivalent). Angelina's assignment doc
joins correctly by staffId + moduleId.

## Root causes, ranked

1. **No live item carries a target, and untargeted items reach managers only.** All 6
   checklists have `autoAssign: { roles: [], stations: [] }`. Under the parity truth table,
   no stations + no roles → only seesAll (manager/supervisor) staff. Proof from the
   2026-07-20 scheduler run: recipients were exactly the 4 Managers (Mei, Ben, Steph, Ryan);
   plain-FOH staff got nothing. (The 07-13 run still included two FOH staff — both their
   staff docs were edited 07-18/07-20, and the deploy backlog spans this window, so
   old-code-vs-data-change can't be pinned from here.)
2. **Role targeting cannot be expressed anywhere.** All FOUR editors (Admin + Ops ×
   Training + Checklists) hardcode `autoAssign.roles: []` on save and render no role
   toggles (dead `autoRoles` editor state remains). Stations are the only working targeting
   channel — and:
3. **The station channel is starved of data.** Only 3 of 37 staff carry `stationIds`
   (Angelina 6, Elyssa 1, Tien 9). Items targeted at area+station cannot reach untagged
   staff by definition. Also: daily checklists rely on shift-links (`rgOnShiftCreated`) —
   every live checklist has `shiftLinks: []`, so the daily path never fires.
4. **Deploy backlog** (PDF page 1): five MyMorFunction commits incl. `f56b13c` auto-assign
   parity are pushed-but-undeployed; MyMorFunction repo is not on this machine, so deployed
   revision could not be inspected directly — behavioral evidence above is from live docs.

## What fixes it (recommendations — decisions, not code bugs)

- **Data: tag staff stations in Staff Directory** (34 of 37 missing). This alone makes the
  intended area+station flow work — the one properly-targeted SOP proves the pipeline.
- **Data: add station targets (or shift links for daily) to the 6 checklists** — they were
  saved with none. Monthly/weekly need station targets; daily need shift-link slots.
- **Product decision: re-introduce role targeting** ("assign to every FOH") if the client
  wants area-wide reach without station tagging — `shouldAutoAssign` already supports
  `autoAssign.roles`; only the editor UI + save (4 files) would change. Alternatively an
  explicit "everyone in this area" toggle.
- **Deploy the MyMorFunction backlog** so server truth-table matches the clients (f56b13c).
- Client-side training immediate-assign only runs when stations are selected
  (`if (autoStations.length)`) — if role targeting returns, extend that gate.
