/* READ-ONLY diagnostic — compare two restaurant groups on PROD (mymor-australia)
 * to determine which is the live/in-use one. NO writes of any kind.
 * Init reused from scripts/importer/import-madkitchen-staff.js.
 * Run:  NODE_PATH=scripts/importer/node_modules node scripts/diag/compare-groups.js
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const GROUPS = { A: "WjaBnLrRfFgXzDd60FnX", B: "YQRkUwBO5wMIdLSgcpji" };

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

const line = (c = "─") => c.repeat(78);

async function inspect(label, gid) {
  const groupRef = db.collection("restaurantGroups").doc(gid);
  const out = { label, gid };

  console.log(`\n${line("═")}`);
  console.log(`GROUP ${label} · ${gid}`);
  console.log(line("═"));

  // group doc
  const g = await groupRef.get();
  out.exists = g.exists;
  if (!g.exists) {
    console.log("  restaurantGroups doc: DOES NOT EXIST");
  } else {
    const d = g.data() || {};
    out.name = d.name || d.groupName || "(no name)";
    console.log(`  restaurantGroups doc: EXISTS`);
    console.log(`    name: ${JSON.stringify(d.name ?? d.groupName ?? null)}`);
    // print a few identifying fields if present
    ["tier", "plan", "status", "clientName", "createdAt", "ownerEmail", "billingStatus"].forEach((k) => {
      if (d[k] !== undefined) console.log(`    ${k}: ${JSON.stringify(d[k])}`);
    });
  }

  // helper: count a subcollection
  const count = async (name) => (await groupRef.collection(name).get()).size;

  // staff
  const staffSnap = await groupRef.collection("staff").get();
  out.staff = staffSnap.size;
  const names = staffSnap.docs.slice(0, 10).map((x) => (x.data() || {}).displayName || (x.data() || {}).name || x.id);
  console.log(`  staff: ${staffSnap.size}${names.length ? `  first ${names.length}: ${names.join(", ")}` : ""}`);

  // venues
  const venueSnap = await groupRef.collection("venues").get();
  out.venues = venueSnap.size;
  const vnames = venueSnap.docs.map((x) => (x.data() || {}).name || x.id);
  console.log(`  venues: ${venueSnap.size}${vnames.length ? `  [${vnames.join(", ")}]` : ""}`);

  // awardRates
  const arSnap = await groupRef.collection("awardRates").get();
  out.awardRates = arSnap.size;
  const arIds = arSnap.docs.map((x) => x.id);
  const ma = arSnap.docs.find((x) => x.id === "MA000119");
  out.ma119 = ma ? `yes(verified=${(ma.data() || {}).verified})` : "no";
  console.log(`  awardRates: ${arSnap.size}  ids: [${arIds.join(", ")}]  MA000119: ${out.ma119}`);

  // contractTemplates
  const ctSnap = await groupRef.collection("contractTemplates").get();
  out.contractTemplates = ctSnap.size;
  console.log(`  contractTemplates: ${ctSnap.size}  ids: [${ctSnap.docs.map((x) => x.id).join(", ")}]`);

  // menuItems (group-level)
  out.menuItems = await count("menuItems");
  console.log(`  menuItems: ${out.menuItems}`);

  // orders / posSales — probe a few likely names (group-level)
  for (const c of ["orders", "posSales", "sales", "posOrders"]) {
    const n = await count(c);
    if (n > 0) { out[c] = n; console.log(`  ${c}: ${n}`); }
    else console.log(`  ${c}: 0`);
  }

  return out;
}

(async () => {
  console.log(`\nREAD-ONLY group comparison · DB ${DB_ID}`);
  const A = await inspect("A", GROUPS.A);
  const B = await inspect("B", GROUPS.B);

  // side-by-side summary
  console.log(`\n${line("═")}`);
  console.log("SIDE-BY-SIDE SUMMARY");
  console.log(line("═"));
  const rows = [
    ["group doc exists", A.exists, B.exists],
    ["name", A.name || "—", B.name || "—"],
    ["staff", A.staff, B.staff],
    ["venues", A.venues, B.venues],
    ["awardRates", A.awardRates, B.awardRates],
    ["MA000119", A.ma119, B.ma119],
    ["contractTemplates", A.contractTemplates, B.contractTemplates],
    ["menuItems", A.menuItems, B.menuItems],
    ["orders", A.orders || 0, B.orders || 0],
    ["posSales", A.posSales || 0, B.posSales || 0],
    ["sales", A.sales || 0, B.sales || 0],
  ];
  console.log(`  ${"metric".padEnd(20)} ${"A ("+GROUPS.A.slice(0,8)+"…)".padEnd(24)} ${"B ("+GROUPS.B.slice(0,8)+"…)"}`);
  console.log("  " + line("-").slice(0, 72));
  rows.forEach(([m, a, b]) => console.log(`  ${String(m).padEnd(20)} ${String(a).padEnd(24)} ${String(b)}`));

  console.log(`\n${line("═")}\nEND — read-only, nothing written.\n`);
  process.exit(0);
})().catch((e) => { console.error("compare-groups failed:", e); process.exit(1); });
