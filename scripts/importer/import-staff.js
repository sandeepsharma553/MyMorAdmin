/* Import group-level multi-venue staff from a JSON file produced from the staff
 * Excel. Generates unique 4-digit PINs, unique display names (Name / Name 2),
 * maps venueIds -> venueNames. Admin (email+password) logins are created ONLY
 * for rows with adminAccess=true AND a non-blank email (Firebase Auth); rows
 * with admin requested but no email are left as PIN-only with adminAccess flag.
 * Run from scripts/importer: node import-staff.js <groupId> <jsonFile>
 * Env: RG_DATABASE_ID (default mymor-australia). */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const [, , groupId, jsonFile] = process.argv;
if (!groupId || !jsonFile) { console.error("Usage: node import-staff.js <groupId> <jsonFile>"); process.exit(1); }

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const auth = admin.auth();
const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const roleToGroupRole = (r) => /manager/i.test(r) ? "storeAdmin" : /supervisor|in charge/i.test(r) ? "manager" : "staff";
const DEFAULT_PERMS = {
  owner: { staff: "edit", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "edit", usermgmt: "edit" },
  storeAdmin: { staff: "edit", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "view", usermgmt: "edit" },
  manager: { staff: "view", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "view", usermgmt: "none" },
  staff: { staff: "none", shifts: "view", leave: "view", training: "view", checklists: "edit", performance: "none", usermgmt: "none" },
};

(async () => {
  console.log(`Target ${DATABASE_ID}, group ${groupId}`);
  const venuesSnap = await db.collection("restaurantGroups").doc(groupId).collection("venues").get();
  const nameById = {}; venuesSnap.forEach((v) => { nameById[v.id] = v.data().name; });
  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonFile), "utf8"));

  // existing staff (for PIN/displayName uniqueness across reruns)
  const existing = await db.collection("restaurantGroups").doc(groupId).collection("staff").get();
  const usedPins = new Set(); const usedNames = new Set();
  existing.forEach((d) => { if (d.data().pin) usedPins.add(d.data().pin); usedNames.add((d.data().displayName || "").toLowerCase()); });

  const genPin = () => { let p, t = 0; do { p = String(Math.floor(1000 + Math.random() * 9000)); t++; } while (usedPins.has(p) && t < 200); usedPins.add(p); return p; };
  const uniqueName = (base) => { base = base.trim(); if (!usedNames.has(base.toLowerCase())) { usedNames.add(base.toLowerCase()); return base; } let n = 2; while (usedNames.has(`${base} ${n}`.toLowerCase())) n++; const r = `${base} ${n}`; usedNames.add(r.toLowerCase()); return r; };

  let created = 0, logins = 0, skippedLogin = 0;
  for (const s of raw.staff) {
    const displayName = uniqueName(s.name);
    const pin = (s.pin && /^\d{4}$/.test(s.pin)) ? s.pin : genPin();
    const venueIds = (s.venueIds || []).filter((v) => nameById[v]);
    const venueNames = venueIds.map((v) => nameById[v]);

    let adminUid = "", hasAdminLogin = false, email = "";
    if (s.adminAccess && s.email) {
      email = s.email.toLowerCase().trim();
      try {
        let uid;
        try { uid = (await auth.getUserByEmail(email)).uid; } catch { uid = (await auth.createUser({ email, password: `${s.name.replace(/\s+/g, "")}654321`, displayName })).uid; }
        const groupRole = roleToGroupRole(s.role);
        await db.collection("employees").doc(uid).set({
          uid, name: displayName, email, type: "admin", role: "groupStaff", groupRole, empType: "restaurantGroup",
          groupId, groupName: raw.groupName || "", venueId: venueIds[0] || "all", venueIds,
          permissions: DEFAULT_PERMS[groupRole], isActive: true, status: "Active", createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        await db.collection("users").doc(uid).set({ uid, firstname: displayName, email, groupId, groupRole, roles: { groupStaff: true }, createddate: new Date() }, { merge: true });
        adminUid = uid; hasAdminLogin = true; logins++;
      } catch (e) { console.log(`  ! login failed for ${displayName}: ${e.message}`); }
    } else if (s.adminAccess && !s.email) { skippedLogin++; }

    await db.collection("restaurantGroups").doc(groupId).collection("staff").doc(slug(displayName)).set({
      name: s.name.trim(), displayName, role: s.role, area: s.area, inCharge: !!s.inCharge,
      venueIds, venueNames, type: s.type || "Casual", cert: "Not yet obtained", training: 0, hours: 0,
      status: "Active", pin, email, hasAdminLogin, adminUid,
      adminAccessRequested: !!s.adminAccess, source: "import", importedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    created++;
    console.log(`  ✓ ${displayName.padEnd(12)} pin=${pin} venues=[${venueNames.join(", ")}]${hasAdminLogin ? " +login" : (s.adminAccess ? " (admin requested, no email)" : "")}`);
  }
  console.log(`\nImported ${created} staff. Admin logins created: ${logins}. Admin requested but no email: ${skippedLogin}.`);
  process.exit(0);
})().catch((e) => { console.error("Import failed:", e); process.exit(1); });
