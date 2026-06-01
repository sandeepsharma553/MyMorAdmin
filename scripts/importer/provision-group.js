/* One-off: provision the Mad Kitchen Group in mymor-one (prod) via Admin SDK.
 * Creates the group doc (reusing the id the imported training modules already
 * sit under), its 4 venues, and the Super Admin manager login. Idempotent. */
const path = require("path");
const admin = require("firebase-admin");
admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = admin.firestore();
const auth = admin.auth();
const FV = admin.firestore.FieldValue;

const GROUP_ID = "YQRkUwBO5wMldLSgcpji";          // same id the modules were imported under
const GROUP_NAME = "Mad Kitchen Group";
const ABN = "20 079 066 407";
const MANAGER_EMAIL = "manager@madkitchen.com";
const MANAGER_NAME = "Mad Kitchen Manager";
const MANAGER_PASSWORD = "MadKitchen2026!";       // tell the user; they can change it

const OWNER_PERMS = { staff: "edit", shifts: "edit", leave: "edit", training: "edit", checklists: "edit", performance: "edit", usermgmt: "edit" };

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const hours = (open, close) => DAYS.reduce((a, d) => ({ ...a, [d]: { open, close, closed: false } }), {});

const VENUES = [
  { id: "mad-benji", name: "Mad Benji", color: "#C0392B", type: "FOH", order: 0, cuisine: "Burgers & Coffee", hours: hours("07:00", "15:00") },
  { id: "hey-sister", name: "Hey Sister", color: "#e67e22", type: "FOH", order: 1, cuisine: "Cafe", hours: hours("07:00", "15:00") },
  { id: "mad-hot-pot", name: "Mad Hot Pot", color: "#8b5cf6", type: "FOH", order: 2, cuisine: "Hot Pot", hours: hours("11:00", "22:00") },
  { id: "main-kitchen", name: "Main Kitchen", color: "#2563eb", type: "CK", order: 3, cuisine: "Central Kitchen", hours: hours("06:00", "16:00") },
];

(async () => {
  // 1) manager Auth user (reuse if exists)
  let uid;
  try {
    const u = await auth.getUserByEmail(MANAGER_EMAIL);
    uid = u.uid;
    await auth.updateUser(uid, { password: MANAGER_PASSWORD, displayName: MANAGER_NAME });
    console.log("• Auth user existed → reused & password reset:", uid);
  } catch {
    const u = await auth.createUser({ email: MANAGER_EMAIL, password: MANAGER_PASSWORD, displayName: MANAGER_NAME });
    uid = u.uid;
    console.log("• Auth user created:", uid);
  }

  // 2) group doc (same id as imported modules)
  await db.collection("restaurantGroups").doc(GROUP_ID).set({
    name: GROUP_NAME, abn: ABN, ownerEmail: MANAGER_EMAIL, ownerName: MANAGER_NAME,
    ownerUid: uid, createdAt: FV.serverTimestamp(),
  }, { merge: true });
  console.log("• Group doc set:", GROUP_ID);

  // 3) venues
  const vcol = db.collection("restaurantGroups").doc(GROUP_ID).collection("venues");
  for (const v of VENUES) {
    await vcol.doc(v.id).set({ ...v, status: "Trading", abn: "", phone: "", email: "", website: "", priceRange: "$$", description: "", address: { line1: "", suburb: "", state: "", postcode: "" }, createdAt: FV.serverTimestamp() }, { merge: true });
    console.log("  ✓ venue", v.id);
  }

  // 4) employee + user docs for the manager (Super Admin / owner)
  await db.collection("employees").doc(uid).set({
    uid, name: MANAGER_NAME, email: MANAGER_EMAIL, mobileNo: "",
    type: "admin", role: "groupOwner", groupRole: "owner", empType: "restaurantGroup",
    groupId: GROUP_ID, groupName: GROUP_NAME, venueId: "all", permissions: OWNER_PERMS,
    isActive: true, status: "Active", password: MANAGER_PASSWORD, createdAt: FV.serverTimestamp(), updatedAt: FV.serverTimestamp(),
  }, { merge: true });
  await db.collection("users").doc(uid).set({
    uid, firstname: MANAGER_NAME, lastname: "", username: MANAGER_NAME, email: MANAGER_EMAIL,
    groupId: GROUP_ID, groupName: GROUP_NAME, roles: { groupOwner: true }, groupRole: "owner",
    permissions: OWNER_PERMS, password: MANAGER_PASSWORD, createddate: new Date(),
  }, { merge: true });
  console.log("• Manager employee + user docs set");

  // 5) report training modules already attached
  const tm = await db.collection("restaurantGroups").doc(GROUP_ID).collection("trainingModules").count().get();
  console.log(`• Training modules under this group: ${tm.data().count}`);

  console.log(`\n✅ Done. Log in at the app (mymor-one) as:\n   ${MANAGER_EMAIL} / ${MANAGER_PASSWORD}`);
  process.exit(0);
})().catch((e) => { console.error("Provision failed:", e); process.exit(1); });
