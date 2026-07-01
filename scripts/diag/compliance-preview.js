/* READ-ONLY compliance-layer diagnostic across two groups on PROD (mymor-australia).
 * NO writes — only .get() and console.log.
 * Init reused from scripts/importer/import-madkitchen-staff.js.
 *   A = go-live target; B = staging (richer compliance data).
 * Run:  NODE_PATH=scripts/importer/node_modules node scripts/diag/compliance-preview.js
 */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

const DB_ID = "mymor-australia";
const A = "WjaBnLrRfFgXzDd60FnX"; // go-live target
const B = "YQRkUwBO5wMIdLSgcpji"; // staging

const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DB_ID);

const line = (c = "─") => c.repeat(78);
const grp = (g) => db.collection("restaurantGroups").doc(g);
const bytes = (o) => Buffer.byteLength(JSON.stringify(o || {}), "utf8");

// ── SECTION 1: compliance/manual ──
async function manualOf(g) {
  const doc = await grp(g).collection("compliance").doc("manual").get();
  console.log(`\n[${g === A ? "A" : "B"}] compliance/manual exists? ${doc.exists}`);
  if (!doc.exists) { console.log("  NO MANUAL"); return null; }
  const d = doc.data() || {};
  const secs = Array.isArray(d.sections) ? d.sections : [];
  console.log(`  title: ${JSON.stringify(d.title)} · version: ${JSON.stringify(d.version)} · updatedAt: ${d.updatedAt ? JSON.stringify(d.updatedAt) : "—"} · sections: ${secs.length} · ~${bytes(d)}B`);
  secs.forEach((s, i) => console.log(`    [${i}] id=${JSON.stringify(s.id ?? null)} title=${JSON.stringify(s.title ?? s.heading ?? null)} (~${bytes(s)}B)`));
  return { version: d.version, sections: secs.length };
}

// ── SECTION 2: awardLinks on the group doc ──
async function awardLinksOf(g) {
  const doc = await grp(g).get();
  const d = doc.data() || {};
  const al = d.awardLinks;
  console.log(`\n[${g === A ? "A" : "B"}] group.awardLinks: ${al == null ? "ABSENT" : (Array.isArray(al) && al.length === 0) || (typeof al === "object" && Object.keys(al).length === 0) ? "EMPTY" : ""}`);
  if (al != null) console.log(JSON.stringify(al, null, 2));
  return al;
}

// ── SECTION 3: acknowledgements per staff ──
async function acksOf(g) {
  const staffSnap = await grp(g).collection("staff").get();
  const withAcks = [];
  for (const s of staffSnap.docs) {
    const acks = await s.ref.collection("acknowledgements").get();
    if (acks.size > 0) {
      const rows = acks.docs.map((a) => { const d = a.data() || {}; return { id: a.id, version: d.version ?? a.id, ackedAt: d.ackedAt ? "set" : (d.acknowledgedAt ? "set" : null), ackedBy: d.ackedBy ?? d.by ?? null }; });
      withAcks.push({ staffId: s.id, name: (s.data() || {}).displayName || (s.data() || {}).name || s.id, acks: rows });
    }
  }
  return { total: staffSnap.size, staffIds: staffSnap.docs.map((x) => x.id), withAcks };
}

(async () => {
  console.log(`\nCOMPLIANCE PREVIEW · DB ${DB_ID} · READ-ONLY`);
  console.log(`A (go-live) = ${A}\nB (staging) = ${B}`);

  console.log(`\n${line("═")}\nSECTION 1 — Compliance manual\n${line("═")}`);
  const manA = await manualOf(A);
  const manB = await manualOf(B);

  console.log(`\n${line("═")}\nSECTION 2 — Award links (group.awardLinks)\n${line("═")}`);
  const alA = await awardLinksOf(A);
  const alB = await awardLinksOf(B);

  console.log(`\n${line("═")}\nSECTION 3 — Acknowledgements (per-staff)\n${line("═")}`);
  const ackB = await acksOf(B);
  console.log(`\n[B] staff: ${ackB.total} · staff WITH acks: ${ackB.withAcks.length}`);
  const bVersions = new Set();
  ackB.withAcks.forEach((r) => {
    r.acks.forEach((a) => bVersions.add(String(a.version)));
    console.log(`  ${r.staffId.padEnd(22)} ${String(r.name).padEnd(16)} acks=[${r.acks.map((a) => `v${a.version}${a.ackedBy ? " by " + a.ackedBy : ""}`).join(", ")}]`);
  });
  console.log(`  → B acked manual version(s): [${[...bVersions].join(", ") || "none"}]`);

  const ackA = await acksOf(A);
  console.log(`\n[A] staff: ${ackA.total} · staff WITH acks: ${ackA.withAcks.length}`);
  ackA.withAcks.forEach((r) => console.log(`  ${r.staffId.padEnd(22)} ${String(r.name).padEnd(16)} acks=[${r.acks.map((a) => `v${a.version}`).join(", ")}]`));

  // staffId overlap for acks
  const aIds = new Set(ackA.staffIds);
  const bAckedIds = ackB.withAcks.map((r) => r.staffId);
  const overlap = bAckedIds.filter((id) => aIds.has(id));
  console.log(`\n  B's acked staffIds: [${bAckedIds.join(", ") || "none"}]`);
  console.log(`  Of those, present in A's staff? ${overlap.length ? "YES → " + overlap.join(", ") : "NONE — staffId mismatch (acks not directly copyable)"}`);

  console.log(`\n${line("═")}\nSECTION 4 — Award docs recap\n${line("═")}`);
  const aAward = (await grp(A).collection("awardRates").get()).docs.map((x) => x.id);
  const bAwardSnap = await grp(B).collection("awardRates").get();
  const bAward = bAwardSnap.docs.map((x) => x.id);
  console.log(`  [A] awardRates ids: [${aAward.join(", ")}]`);
  console.log(`  [B] awardRates ids: [${bAward.join(", ")}]  MA000003 present? ${bAward.includes("MA000003")}`);
  const bVen = await grp(B).collection("venues").get();
  const ma003 = [];
  console.log(`  [B] venue awardCodes:`);
  bVen.forEach((v) => { const d = v.data() || {}; const ac = (d.awardCode == null || d.awardCode === "") ? "NOT SET" : d.awardCode; if (ac === "MA000003") ma003.push(v.id); console.log(`     ${v.id.padEnd(16)} awardCode=${ac}`); });
  console.log(`  Any B venue → MA000003? ${ma003.length ? "YES: " + ma003.join(", ") : "NO"}`);

  console.log(`\n${line("═")}\nSECTION 5 — SUMMARY\n${line("═")}`);
  console.log(`  manual: A=${manA ? "present (v" + manA.version + ")" : "ABSENT"} · B=${manB ? "present (v" + manB.version + ")" : "ABSENT"} → ${manB && !manA ? "COPY B→A candidate" : manA && manB ? "both present (compare)" : "n/a"}`);
  console.log(`  awardLinks: A=${alA == null ? "absent" : "present"} · B=${alB == null ? "absent" : "present"} → ${alB != null && alA == null ? "COPY B→A candidate" : "review"}`);
  console.log(`  acknowledgements copyable? ${bAckedIds.length === 0 ? "N/A (B has none)" : overlap.length ? "PARTIAL — some staffIds overlap" : "NO — staffId mismatch; must REGENERATE after staff exist in A"}`);
  const aTpl = (await grp(A).collection("contractTemplates").get()).size;
  const bTpl = (await grp(B).collection("contractTemplates").get()).size;
  console.log(`  contractTemplates: A=${aTpl} · B=${bTpl} (template copy pending, separate)`);

  console.log(`\n${line("═")}\nEND — read-only, nothing written.\n`);
  process.exit(0);
})().catch((e) => { console.error("compliance-preview failed:", e); process.exit(1); });
