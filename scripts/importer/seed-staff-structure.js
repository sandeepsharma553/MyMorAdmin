/* OPTIONAL seed for the Area/Role/Station foundation (phase 2) — DRY-RUN by default.
 *   node scripts/importer/seed-staff-structure.js          (dry-run, no writes)
 *   node scripts/importer/seed-staff-structure.js --apply  (writes group.areas[]/roles[])
 *
 * NOT required: the app falls back to DEFAULT_AREAS (FOH/BOH/Mgmt) and DEFAULT_ROLES
 * (incl. Junior) whenever group.areas[]/roles[] are absent, so both live groups already
 * render correctly without this. This only materialises the fields on the group doc so
 * the owner sees them pre-filled in Settings. Idempotent & additive: it never removes a
 * value the group already has, only fills a missing field / appends a missing default.
 * Existing staff docs are never touched. Held pending sign-off (do not --apply blindly). */
const path = require("path");
const admin = require("firebase-admin");
const { FieldValue } = require("firebase-admin/firestore");

const DEFAULT_AREAS = ["FOH", "BOH", "Mgmt"];
const DEFAULT_ROLES = ["Manager", "FOH Supervisor", "FOH In Charge", "FOH", "BOH In Charge", "BOH", "Chef", "Junior"];

admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = admin.firestore();
db.settings({ databaseId: process.env.RG_DATABASE_ID || "mymor-australia" });
const APPLY = process.argv.includes("--apply");

(async () => {
  console.log(`Seed staff structure — ${APPLY ? "APPLY" : "DRY-RUN"} — db=${db._settings.databaseId}\n`);
  const groups = await db.collection("restaurantGroups").get();
  for (const g of groups.docs) {
    const x = g.data();
    const patch = {};
    if (!Array.isArray(x.areas) || !x.areas.length) patch.areas = DEFAULT_AREAS;
    // roles: seed defaults if absent; else append only the missing "Junior"
    if (!Array.isArray(x.roles) || !x.roles.length) patch.roles = DEFAULT_ROLES;
    else if (!x.roles.some((r) => r.toLowerCase() === "junior")) patch.roles = [...x.roles, "Junior"];

    if (!Object.keys(patch).length) { console.log(`  ${g.id} (${x.name || "?"}): already seeded — skip`); continue; }
    console.log(`  ${g.id} (${x.name || "?"}): set ${JSON.stringify(patch)}`);
    if (APPLY) await g.ref.set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  console.log(APPLY ? "\n✅ Applied." : "\n(DRY-RUN — nothing written.)");
  process.exit(0);
})().catch((e) => { console.error("FAILED:", e.message); process.exit(1); });
