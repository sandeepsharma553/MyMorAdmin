#!/usr/bin/env node
/* seedModifierKinds — one-off: stamp `kind` on modifier groups of the TEST group,
 * derived from the name prefix via the APP's own modGroupKind resolver.
 *
 *   DRY RUN (default):  prints the full id → name → derived-kind table and STOPS.
 *   WRITE:              node scripts/seed/seedModifierKinds.js --write
 *                       sets ONLY { kind } on each group doc — nothing else changes.
 *
 * Run from the repo root with firebase-admin resolvable, e.g.:
 *   NODE_PATH=../MyMorFunction/node_modules node scripts/seed/seedModifierKinds.js
 *
 * SINGLE SOURCE OF TRUTH: this script does NOT duplicate the derivation rules.
 * rgStockUtils.js is an ES module (CRA src), so it can't be require()d directly
 * from Node — instead we transpile it to CJS with esbuild at runtime (temp file)
 * and require THAT, so modGroupKind here is byte-for-byte the app's resolver
 * (same approach in spirit as scripts/verify-fill-parity.js, but with zero copies).
 *
 * TEST group only. The live group id appears nowhere in this file.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SRC = path.join(__dirname, "../../src/pages/restaurantgroup/rgStockUtils.js");
const TMP = path.join(os.tmpdir(), `rgStockUtils.cjs.${process.pid}.js`);
execSync(`npx --yes esbuild ${JSON.stringify(SRC)} --format=cjs --outfile=${JSON.stringify(TMP)} --log-level=error`, { stdio: "inherit" });
const { modGroupKind, MOD_KINDS } = require(TMP);
fs.unlinkSync(TMP);
if (typeof modGroupKind !== "function") { console.error("Could not load modGroupKind from rgStockUtils — abort."); process.exit(1); }

const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
admin.initializeApp({ credential: admin.credential.cert(require("/Users/chiragagarwal/Downloads/mymor-one-firebase-adminsdk-fbsvc-a87f936d1c.json")) });
const db = getFirestore(admin.app(), "mymor-australia");

const TEST_GROUP = "YQRkUwBO5wMIdLSgcpji";
const gref = db.collection("restaurantGroups").doc(TEST_GROUP);
const WRITE = process.argv.includes("--write");

// a derivation is "certain" only when a known prefix matched — mirror the check
// by re-deriving from a name-only stub; if the stub falls to the default AND the
// name doesn't start with "Add On", it's a fall-through worth flagging.
const matchedPrefix = (name) => /^(no|add\s*on|instead|mod|opt|cooking)\b/i.test(String(name || "").trim());

(async () => {
  const snap = await gref.collection("modifierGroups").get();
  const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  groups.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  console.log(`${groups.length} modifier groups in ${TEST_GROUP} (db mymor-australia) — mode: ${WRITE ? "WRITE" : "DRY RUN"}\n`);

  const counts = {};
  const flagged = [];
  for (const g of groups) {
    const kind = modGroupKind(g);
    counts[kind] = (counts[kind] || 0) + 1;
    const fallthrough = !matchedPrefix(g.name);
    const already = MOD_KINDS.includes(g.kind) ? ` (kind already set: ${g.kind})` : "";
    if (fallthrough) flagged.push(g);
    console.log(`${g.id.padEnd(8)} ${String(JSON.stringify(g.name)).padEnd(38)} → ${kind.padEnd(7)}${fallthrough ? "  ⚑ NO PREFIX MATCH — defaulted" : ""}${already}`);
  }
  console.log(`\nCOUNTS: ${Object.entries(counts).map(([k, n]) => `${k}:${n}`).join("  ")}`);
  console.log(`FLAGGED (no prefix matched, defaulted to "add"): ${flagged.length}`);
  flagged.forEach((g) => console.log(`   ${g.id} ${JSON.stringify(g.name)}`));

  if (!WRITE) { console.log("\nDRY RUN — nothing written. Re-run with --write to stamp `kind`."); process.exit(0); }

  for (const g of groups) {
    const kind = modGroupKind(g);
    await gref.collection("modifierGroups").doc(g.id).update({ kind });
    console.log(`WROTE ${g.id} kind:${kind}`);
  }
  console.log(`\nDone — kind stamped on ${groups.length} groups.`);
  process.exit(0);
})().catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });
