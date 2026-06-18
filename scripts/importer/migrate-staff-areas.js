/* Migration: staff.area (single string) → staff.areas (array). ADDITIVE & reversible.
 *   node scripts/importer/migrate-staff-areas.js           (DRY-RUN — no writes)
 *   node scripts/importer/migrate-staff-areas.js --apply   (writes staff.areas[])
 *
 * Rules:
 *   - Already has a non-empty `areas` array  → skip (idempotent).
 *   - Managerial ROLE (manager/supervisor/in charge/owner/admin) → seed `areas` with
 *     ALL of the group's CONFIGURED areas, so making visibility "exactly the ticked
 *     areas" (we drop area-based see-all) does NOT narrow a manager's current access.
 *   - Otherwise → areas = [area] (the existing single value); if `area` is missing,
 *     derive one from the role the same way the app does (areaFromRole); else [].
 *   - The old `area` field is LEFT IN PLACE (backward-compat reads fall back to it).
 *
 * Backup taken first: backups/staff-and-groups-mymor-australia-*.json
 * Held: do not --apply without sign-off. */
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
const MANAGERIAL = /manager|supervisor|in charge|owner|admin/i;
// same derivation the app uses (assignmentUtils.areaFromRole), for staff with no area set
const areaFromRole = (role) => {
  const r = role || "";
  if (/manager|owner|admin|supervisor|in charge/i.test(r)) return "Mgmt";
  if (/foh|floor|\bbar\b|barista|counter|service/i.test(r)) return "FOH";
  if (/boh|kitchen|chef|grill|fry|wash|prep|cook|dish/i.test(r)) return "BOH";
  return "";
};

(async () => {
  console.log(`Migrate staff.area → staff.areas[] — ${APPLY ? "APPLY" : "DRY-RUN"} — db=${DB_ID}\n`);
  const groups = await db.collection("restaurantGroups").get();
  let total = 0, toChange = 0, skipped = 0, mgr = 0;
  for (const g of groups.docs) {
    const gd = g.data();
    const configuredAreas = (Array.isArray(gd.areas) && gd.areas.length) ? gd.areas : DEFAULT_AREAS;
    console.log(`\n— group ${g.id} (${gd.name || "?"}): configured areas = ${JSON.stringify(configuredAreas)}`);
    const staff = await g.ref.collection("staff").get();
    for (const s of staff.docs) {
      total++;
      const x = s.data();
      if (Array.isArray(x.areas) && x.areas.length) { skipped++; continue; }
      const isMgr = MANAGERIAL.test(x.role || "");
      let areas;
      if (isMgr) { areas = [...configuredAreas]; mgr++; }
      else if (x.area) areas = [x.area];
      else { const d = areaFromRole(x.role); areas = d ? [d] : []; }
      toChange++;
      console.log(`   ${s.id}  ${(x.displayName || x.name || "?").padEnd(16)} role=${(x.role || "—").padEnd(16)} area=${String(x.area || "—").padEnd(5)} ${isMgr ? "[MGR]" : "     "} → areas=${JSON.stringify(areas)}`);
      if (APPLY) await s.ref.set({ areas, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  console.log(`\n===== ${APPLY ? "APPLIED" : "DRY-RUN"}: ${total} staff — ${toChange} to set (${mgr} managerial → all areas), ${skipped} already migrated =====`);
  console.log(APPLY ? "✅ Written (area left intact for backward-compat)." : "(DRY-RUN — nothing written.)");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
