/* Migration: staff.area (single string) → staff.areas (array). ADDITIVE & reversible.
 *   node scripts/importer/migrate-staff-areas.js           (DRY-RUN — no writes)
 *   node scripts/importer/migrate-staff-areas.js --apply   (writes staff.areas[])
 *
 * Approach B (agreed): EVERY staff member — managers included — migrates to
 *   areas: [their current area]   (a one-item list from the existing single value).
 * No presuming all-areas for anyone; managers get their one area like everyone else
 * and can be given more in the UI afterwards.
 *
 *   - Already has a non-empty `areas` array → skip (idempotent).
 *   - area present → areas = [area]. If `area` is somehow missing, derive ONE area
 *     from the role (areaFromRole) — still a one-item list, never all-areas; else [].
 *   - The old `area` field is LEFT IN PLACE (backward-compat reads fall back to it).
 *
 * Also REPORTS any staff whose migrated area is NOT in their group's configured
 * areas list (e.g. area "Mgmt" when the group's areas are FOH/BOH/Kitchen) — those
 * need their areas set in the UI afterwards.
 *
 * Backup already committed: backups/staff-and-groups-mymor-australia-*.json */
const path = require("path");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const SA = process.env.RG_SA || path.resolve(__dirname, "../../secrets/serviceAccount.json");
admin.initializeApp({ credential: admin.credential.cert(require(SA)) });
const { getFirestore } = require("firebase-admin/firestore");
const DB_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const db = getFirestore(admin.app(), DB_ID);
const APPLY = process.argv.includes("--apply");

const DEFAULT_AREAS = ["FOH", "BOH", "Mgmt"];
// single-area fallback when a doc has no `area` (same derivation the app uses). NOT all-areas.
const areaFromRole = (role) => {
  const r = role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  return "";
};

(async () => {
  console.log(`Migrate staff.area → staff.areas[] (approach B) — ${APPLY ? "APPLY" : "DRY-RUN"} — db=${DB_ID}\n`);
  const groups = await db.collection("restaurantGroups").get();
  let total = 0, toChange = 0, skipped = 0;
  const flagged = []; // { name, group, areas, configured }
  for (const g of groups.docs) {
    const gd = g.data();
    const configuredAreas = (Array.isArray(gd.areas) && gd.areas.length) ? gd.areas : DEFAULT_AREAS;
    console.log(`\n— group ${g.id} (${gd.name || "?"}): configured areas = ${JSON.stringify(configuredAreas)}`);
    const staff = await g.ref.collection("staff").get();
    for (const s of staff.docs) {
      total++;
      const x = s.data();
      if (Array.isArray(x.areas) && x.areas.length) { skipped++; continue; }
      let areas;
      if (x.area) areas = [x.area];
      else { const d = areaFromRole(x.role); areas = d ? [d] : []; }
      toChange++;
      const offConfig = areas.filter((a) => !configuredAreas.includes(a));
      const mark = offConfig.length ? " ⚑ not in configured areas" : "";
      console.log(`   ${s.id}  ${(x.displayName || x.name || "?").padEnd(16)} role=${(x.role || "—").padEnd(16)} area=${String(x.area || "—").padEnd(5)} → areas=${JSON.stringify(areas)}${mark}`);
      if (offConfig.length) flagged.push({ name: x.displayName || x.name || s.id, group: gd.name || g.id, areas, configured: configuredAreas });
      if (APPLY) await s.ref.set({ areas, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  console.log(`\n===== ${APPLY ? "APPLIED" : "DRY-RUN"}: ${total} staff — ${toChange} set to a one-item list, ${skipped} already migrated =====`);
  if (flagged.length) {
    console.log(`\n⚑ ${flagged.length} staff whose migrated area is NOT in their group's configured areas — set these in the UI:`);
    flagged.forEach((f) => console.log(`   - ${f.name} (${f.group}): areas=${JSON.stringify(f.areas)}, configured=${JSON.stringify(f.configured)}`));
  } else {
    console.log("\n✅ Every migrated area is within its group's configured areas — none need follow-up.");
  }
  console.log(APPLY ? "\n✅ Written (area left intact for backward-compat)." : "\n(DRY-RUN — nothing written.)");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
