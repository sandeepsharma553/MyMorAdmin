/* One-off: import Mad Kitchen staff personnel data into
 *   restaurantGroups/WjaBnLrRfFgXzDd60FnX/staff/{id}  (+ /private/details)
 * PROD project mymor-one, named DB mymor-australia. Admin SDK (bypasses rules).
 * NO Auth users / employees / users / PINs / passwords. set({merge:true}).
 * Validate-then-write: halts before ANY write on DOB mismatch, doc-id collision,
 * or unresolved venue code. Run:  node import-madkitchen-staff.js
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const XLSX = require("xlsx");

const GROUP = "WjaBnLrRfFgXzDd60FnX";
const DB_ID = "mymor-australia";
const FILE = "/Users/mac/Downloads/Staffs Details.xlsx";
const DO_WRITE = process.argv.includes("--write");

const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const isBlank = (v) => { const s = String(v == null ? "" : v).trim(); return s === "" || /^n\/?a$/i.test(s); };

const VENUE = { MB: ["mad-benji", "Mad Benji"], MHP: ["mad-hotpot", "Mad Hotpot"], CK: ["central-kitchen", "Central Kitchen"], HS: ["hey-sister", "Hey Sister"] };

// keyed by display name (col A, "*" stripped); the two "Jess" → "Jess <Last>"
const AREA = {
  "Ryan": ["FOH", "BOH"], "Steph": ["FOH"], "Cassie": ["FOH"], "Chloe": ["FOH", "BOH"], "Lina": ["FOH", "BOH"],
  "Jade": ["FOH"], "Rachele": ["FOH"], "Jolene": ["FOH"], "Bridie": ["FOH"], "Madison": ["FOH"],
  "Elyssa": ["FOH"], "Jess Sellers": ["FOH"], "Zoe": ["FOH"], "Angelina": ["FOH"], "Imogen": ["FOH"],
  "Kulith": ["BOH"], "Bowser": ["BOH", "FOH"], "Kav": ["BOH", "FOH"], "Hudson": ["BOH"], "Jackson": ["BOH"],
  "Jordan": ["BOH"], "Tien": ["BOH"], "Jason": ["FOH", "BOH"], "Van": ["FOH", "BOH"], "Devin": ["BOH"],
  "Jess Sutantio": ["FOH"], "Kelly": ["FOH"], "Jayley": ["FOH"], "Jiny": ["FOH"], "Su": ["FOH", "BOH"],
  "Elina": ["FOH", "BOH"], "Cha Cha": ["FOH", "BOH"], "Tessa": ["FOH"], "Sithumi": ["FOH", "BOH"], "Lily": ["FOH", "BOH"],
};
const DOB = {
  "Ryan": "1997-12-03", "Steph": "2000-09-15", "Cassie": "2005-08-12", "Chloe": "2005-04-26", "Lina": "2005-02-23",
  "Jade": "2003-09-07", "Rachele": "2007-11-09", "Jolene": "2007-12-23", "Bridie": "2008-01-11", "Madison": "2009-11-24",
  "Jess Sellers": "2009-01-24", "Zoe": "2006-02-18", "Angelina": "2010-07-16", "Imogen": "2003-06-19", "Kulith": "1997-02-18",
  "Bowser": "1997-05-11", "Kav": "1996-03-10", "Hudson": "2006-11-04", "Jackson": "2009-08-19", "Tien": "2009-12-24",
  "Jason": "1988-11-02", "Devin": "2002-10-05", "Jess Sutantio": "2006-11-26", "Kelly": "2003-12-18", "Jayley": "2006-10-30",
  "Su": "1998-09-22", "Elina": "2003-07-04", "Cha Cha": "1984-09-12", "Tessa": "2009-06-30",
  // blank: Elyssa, Jordan, Van, Jiny, Sithumi, Lily
};

const wb = XLSX.readFile(FILE);
const ws = wb.Sheets["Sheet2"];
const cellStr = (c, r) => { const x = ws[c + r]; return x && x.v != null ? String(x.w != null ? x.w : x.v).trim() : ""; };
const serialToISO = (n) => new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000).toISOString().slice(0, 10);
const parseDobCell = (r) => {
  const x = ws["F" + r];
  if (!x || x.v == null || x.v === "") return "";
  if (x.t === "n") return serialToISO(x.v);
  const s = String(x.v).trim();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let [, d, mo, y] = m; if (y.length === 2) y = "20" + y; return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  return "RAW:" + s;
};

const blanks = []; const issues = []; const docIds = new Map(); const rows = [];

for (let r = 3; r <= 42; r++) {
  if (r === 3 || r === 4) continue; // skip Ben (owner), Mei
  const A = cellStr("A", r).replace(/\*/g, "").trim();
  const B = cellStr("B", r).trim(); const C = cellStr("C", r).trim();
  if (!A && !B && !C) continue; // blank row (5,21,36)

  const name = [B, C].filter(Boolean).join(" ");
  if (!name) { issues.push(`r${r}: no first/last name`); continue; }
  const id = slug(name);
  if (docIds.has(id)) issues.push(`r${r}: doc-id collision "${id}" (also r${docIds.get(id)})`);
  docIds.set(id, r);

  const key = A === "Jess" ? `Jess ${C}` : A;
  const areas = AREA[key];
  if (!areas) issues.push(`r${r}: no AREA-table entry for "${key}"`);

  // DOB safety: cell-parsed must equal the DOB table value (or both blank)
  const cellDob = parseDobCell(r);
  const tblDob = DOB[key] || "";
  if (cellDob !== tblDob) issues.push(`r${r} ${key}: DOB mismatch — cell="${cellDob}" table="${tblDob}"`);

  // venues from Shop (col D), in listed order
  const codes = cellStr("D", r).split(",").map((x) => x.trim().toUpperCase()).filter(Boolean);
  const venueIds = [], venueNames = [];
  for (const code of codes) { if (!VENUE[code]) { issues.push(`r${r}: unresolved venue code "${code}"`); continue; } venueIds.push(VENUE[code][0]); venueNames.push(VENUE[code][1]); }
  if (!venueIds.length) issues.push(`r${r} ${key}: no venue resolved (Shop="${cellStr("D", r)}")`);

  // staff doc (omit blank phone/birthday)
  const staff = {
    name, displayName: A, areas: areas || [], area: (areas || [])[0],
    venueIds, venueNames, status: "Active", groupRole: "staff", hasAdminLogin: false, email: "",
    createdAt: FieldValue.serverTimestamp(),
  };
  const phone = cellStr("M", r); if (!isBlank(phone)) staff.phone = phone.trim(); else blanks.push(`r${r} ${key} phone`);
  if (tblDob) staff.birthday = tblDob.slice(5);

  // private/details — only non-blank values
  const priv = {};
  priv.legalName = name; // always present
  if (tblDob) priv.dob = tblDob;
  const map = { contactEmail: "N", address: "G", tfn: "H", superAccount: "I", superUsi: "J", bankBsb: "K", bankAccount: "L", emergencyName: "O", emergencyPhone: "P" };
  for (const [field, col] of Object.entries(map)) {
    const v = cellStr(col, r);
    if (isBlank(v)) blanks.push(`r${r} ${key} ${field}`); else priv[field] = v;
  }
  priv.updatedAt = FieldValue.serverTimestamp();

  rows.push({ r, id, key, name, displayName: A, staff, priv });
}

(async () => {
  console.log(`Group ${GROUP} | DB ${DB_ID} | importable rows: ${rows.length} | mode: ${DO_WRITE ? "WRITE" : "VALIDATE-ONLY (pass --write to write)"}`);
  if (issues.length) { console.error("\n❌ HALT — issues found (NOTHING written):"); issues.forEach((i) => console.error("  - " + i)); process.exit(1); }
  console.log("✓ validation passed: DOBs match table, no doc-id collisions, all venues resolved.");
  console.log("doc-ids:", rows.map((x) => x.id).join(", "));
  console.log(`blank cells omitted (${blanks.length}):`); blanks.forEach((b) => console.log("  · " + b));

  if (!DO_WRITE) { console.log("\nVALIDATE-ONLY — re-run with --write to commit."); process.exit(0); }

  const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
  const db = getFirestore(app, DB_ID);
  const staffCol = db.collection("restaurantGroups").doc(GROUP).collection("staff");
  let nStaff = 0, nPriv = 0;
  for (const x of rows) {
    await staffCol.doc(x.id).set(x.staff, { merge: true });
    nStaff++;
    const hasPriv = Object.keys(x.priv).some((k) => k !== "updatedAt"); // legalName always present → true
    if (hasPriv) { await staffCol.doc(x.id).collection("private").doc("details").set(x.priv, { merge: true }); nPriv++; }
    console.log(`  ✓ ${x.id.padEnd(28)} venues=[${x.staff.venueNames.join(", ")}]${hasPriv ? " +private" : ""}`);
  }
  console.log(`\nWrote ${nStaff} staff docs, ${nPriv} private docs.`);

  // ── read-back verify ──
  console.log("\n=== READ-BACK VERIFY ===");
  let mism = 0;
  for (const x of rows) {
    const sd = await staffCol.doc(x.id).get();
    if (!sd.exists) { console.error(`  ✗ MISSING staff ${x.id}`); mism++; continue; }
    const d = sd.data();
    const chk = d.name === x.staff.name && d.displayName === x.staff.displayName && d.area === x.staff.area
      && JSON.stringify(d.areas) === JSON.stringify(x.staff.areas) && JSON.stringify(d.venueIds) === JSON.stringify(x.staff.venueIds)
      && d.status === "Active" && d.groupRole === "staff" && d.hasAdminLogin === false;
    const pd = await staffCol.doc(x.id).collection("private").doc("details").get();
    const privOk = pd.exists && pd.data().legalName === x.priv.legalName && (x.priv.dob ? pd.data().dob === x.priv.dob : true)
      && (x.priv.tfn ? pd.data().tfn === x.priv.tfn : true) && (x.priv.bankAccount ? pd.data().bankAccount === x.priv.bankAccount : true);
    if (!chk || !privOk) { console.error(`  ✗ MISMATCH ${x.id} staffOk=${chk} privOk=${privOk}`); mism++; }
  }
  console.log(mism === 0 ? `✓ read-back OK — all ${rows.length} match.` : `✗ ${mism} mismatches.`);
  console.log(`\nFINAL: ${nStaff} staff docs, ${nPriv} private docs (of ${rows.length} expected).`);
  process.exit(mism === 0 ? 0 : 1);
})().catch((e) => { console.error("Import failed:", e); process.exit(1); });
