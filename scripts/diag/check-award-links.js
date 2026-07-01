/* READ-ONLY — print group B's awardLinks + verify each URL resolves.
 * NO Firestore writes — only .get(). Outbound HTTP is read-only link checking.
 * Init reused from scripts/importer/import-madkitchen-staff.js.
 * Run:  NODE_PATH=scripts/importer/node_modules node scripts/diag/check-award-links.js
 */
const path = require("path");
const https = require("https");
const http = require("http");
const { URL } = require("url");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const B = "YQRkUwBO5wMIdLSgcpji";
const TIMEOUT_MS = 10000;
const MAX_REDIRECTS = 6;

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

// follow redirects manually so we can report the FINAL url. GET (some servers 405 a HEAD).
function resolveUrl(startUrl, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(startUrl); } catch { return resolve({ status: "BAD_URL", finalUrl: startUrl, verdict: "FAIL" }); }
    const lib = u.protocol === "http:" ? http : https;
    const req = lib.request(u, { method: "GET", headers: { "User-Agent": "Mozilla/5.0 (link-check)", "Accept": "*/*" } }, (res) => {
      const code = res.statusCode;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirectsLeft > 0) {
        const next = new URL(res.headers.location, u).toString();
        res.resume(); // drain
        return resolveUrl(next, redirectsLeft - 1).then(resolve);
      }
      res.resume(); // don't read body — status only
      const verdict = code >= 200 && code < 300 ? "PASS" : "FAIL";
      resolve({ status: code, finalUrl: u.toString(), verdict });
    });
    req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ status: "TIMEOUT", finalUrl: u.toString(), verdict: "TIMEOUT" }); });
    req.on("error", (e) => resolve({ status: "ERR:" + (e.code || e.message), finalUrl: u.toString(), verdict: "FAIL" }));
    req.end();
  });
}

(async () => {
  console.log(`\nAWARD-LINK CHECK · DB ${DB_ID} · group B ${B} · READ-ONLY\n`);

  // STEP 1 — read awardLinks
  const doc = await db.collection("restaurantGroups").doc(B).get();
  if (!doc.exists) { console.log("Group B document DOES NOT EXIST."); process.exit(1); }
  const links = (doc.data() || {}).awardLinks;
  console.log("=".repeat(78));
  console.log("STEP 1 — awardLinks (full):");
  console.log("=".repeat(78));
  console.log(JSON.stringify(links, null, 2));

  if (!Array.isArray(links) || links.length === 0) { console.log("\n(awardLinks absent or empty — nothing to check.)"); process.exit(0); }

  // STEP 2 — check each url
  console.log("\n" + "=".repeat(78));
  console.log("STEP 2 — URL resolution:");
  console.log("=".repeat(78));
  const results = [];
  for (const l of links) {
    const url = (l && l.url) || "";
    if (!url) { console.log(`\n[${l.label || "?"}] (no url) → SKIP`); results.push({ ...l, status: "NO_URL", verdict: "SKIP" }); continue; }
    const r = await resolveUrl(url);
    console.log(`\n[${l.label || "?"}] ${url}`);
    console.log(`   status: ${r.status}`);
    console.log(`   final:  ${r.finalUrl}`);
    console.log(`   → ${r.verdict === "TIMEOUT" ? "TIMEOUT — could not verify" : r.verdict}`);
    results.push({ label: l.label, code: l.code, tag: l.tag, url, status: r.status, finalUrl: r.finalUrl, verdict: r.verdict });
  }

  // STEP 3 — summary table
  console.log("\n" + "=".repeat(78));
  console.log("STEP 3 — SUMMARY");
  console.log("=".repeat(78));
  console.log(`  ${"label".padEnd(28)} ${"code".padEnd(10)} ${"tag".padEnd(12)} ${"status".padEnd(10)} verdict`);
  console.log("  " + "-".repeat(74));
  results.forEach((r) => {
    console.log(`  ${String(r.label || "").slice(0, 27).padEnd(28)} ${String(r.code || "").padEnd(10)} ${String(r.tag || "").padEnd(12)} ${String(r.status).padEnd(10)} ${r.verdict}`);
  });

  console.log("\n" + "=".repeat(78));
  console.log("END — no Firestore writes (one .get()). Outbound HTTP was read-only link checking.");
  process.exit(0);
})().catch((e) => { console.error("check-award-links failed:", e); process.exit(1); });
