/* Seed the Awards & Compliance module (module #3) for a restaurant group.
 *
 *   node import-award-rates.js
 *
 * Env: RG_DATABASE_ID (default 'mymor-australia' = prod), RG_GROUP_ID.
 *
 * EVERY wage figure here is an AI-GENERATED DRAFT and is written with
 * verified:false / reviewedAt:null. The UI shows the amber "not yet verified"
 * banner until a manager verifies, and unverified rates must not feed payroll
 * or labour-cost calculations. Verify against the official Fair Work pay guides
 * (rates change on the first full pay period on or after 1 July each year).
 *
 * Idempotent: deterministic doc ids + merge. Re-running refreshes the draft but
 * never flips verified back to false once a manager has set it true (see merge
 * guard below). The manual doc is only seeded if absent, so edits survive. */
const path = require("path");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const GROUP_ID = process.env.RG_GROUP_ID || "YQRkUwBO5wMIdLSgcpji"; // Mad Kitchen Group (capital I)
const db = getFirestore(app, DATABASE_ID);
const groupRef = db.collection("restaurantGroups").doc(GROUP_ID);

const EFFECTIVE_FROM = "2025-07-01"; // draft window 1 Jul 2025 → 30 Jun 2026
const SOURCE = "AI-generated draft — VERIFY against fairwork.gov.au pay guides before payroll use";

// Junior % of adult — applies to both awards (demo figures).
const JUNIOR_RATES = [
  { ageBand: "Under 16", pct: 40 }, { ageBand: "16", pct: 50 }, { ageBand: "17", pct: 60 },
  { ageBand: "18", pct: 70 }, { ageBand: "19", pct: 80 }, { ageBand: "20", pct: 90 },
];

// Fast Food Industry Award — adult rates (demo gives all penalty columns).
const FAST_FOOD = {
  code: "MA000003", name: "Fast Food Industry Award", type: "fastfood",
  levels: [
    { level: "Level 1", weekly: 1008.90, baseHourly: 26.55, casualHourly: 33.19, sat: 33.19, sun: 39.83, publicHol: 59.74, evening: 29.21 },
    { level: "Level 2", weekly: 1068.56, baseHourly: 28.12, casualHourly: 35.15, sat: 35.15, sun: 42.18, publicHol: 63.27, evening: 30.93 },
    { level: "Level 3", weekly: 1084.90, baseHourly: 28.55, casualHourly: 35.69, sat: 35.69, sun: 42.83, publicHol: 64.24, evening: 31.41 },
  ],
  penalties: { casualLoadingPct: 25, saturdayPct: 125, sundayPct: 150, publicHolidayPct: 225, eveningPct: 110, eveningNote: "9pm–midnight", overtimeFirst2hPct: 150, overtimeAfterPct: 200 },
};

// Restaurant Industry Award — adult rates (demo gives weekly/base/casual only;
// sat/sun/publicHol/evening left null rather than fabricated; multipliers in penalties).
const RESTAURANT = {
  code: "MA000119", name: "Restaurant Industry Award", type: "restaurant",
  levels: [
    { level: "Introductory", weekly: 922.70, baseHourly: 24.28, casualHourly: 30.35, sat: null, sun: null, publicHol: null, evening: null },
    { level: "Level 1", weekly: 948.00, baseHourly: 24.95, casualHourly: 31.19, sat: null, sun: null, publicHol: null, evening: null },
    { level: "Level 2", weekly: 982.40, baseHourly: 25.85, casualHourly: 32.31, sat: null, sun: null, publicHol: null, evening: null },
    { level: "Level 3", weekly: 1014.70, baseHourly: 26.70, casualHourly: 33.38, sat: null, sun: null, publicHol: null, evening: null },
    { level: "Level 4", weekly: 1068.40, baseHourly: 28.12, casualHourly: 35.15, sat: null, sun: null, publicHol: null, evening: null },
    { level: "Level 5", weekly: 1135.50, baseHourly: 29.88, casualHourly: 37.35, sat: null, sun: null, publicHol: null, evening: null },
    { level: "Level 6", weekly: 1165.70, baseHourly: 30.68, casualHourly: 38.35, sat: null, sun: null, publicHol: null, evening: null },
  ],
  penalties: { casualLoadingPct: 25, saturdayPct: 125, sundayPct: 150, publicHolidayPct: 225, lateNightPerHour: 2.81, lateNightNote: "10pm–midnight", earlyMorningPerHour: 4.22, earlyMorningNote: "midnight–6am" },
};

const SUPER = { note: "Super Guarantee paid on top of wages to the nominated fund at the current federal rate — verify.", ratePct: null };

// Compliance manual v1 — content from the demo (Q1: single versioned doc).
const MANUAL_V1 = {
  version: "1.0",
  title: "VIC Café & Fast Food Staff Manual",
  sections: [
    { id: "legal", icon: "⚖️", title: "Legal framework", meta: "Fair Work Act · NES · OHS Act 2004 (VIC) · Food Act 1984", body: "Employees are entitled to: minimum wage rates per award; paid breaks and leave where applicable; protection from unfair dismissal after the qualifying period; a safe workplace. Must adhere to anti-discrimination & harassment laws, equal opportunity legislation, and privacy laws for customer/staff information." },
    { id: "employment", icon: "👥", title: "Employment types", meta: "Full-time · part-time · casual", body: "Full-time: 38 hrs/week, full leave entitlements. Part-time: fixed hours, pro-rata entitlements. Casual: no guaranteed hours, +25% loading, no paid leave." },
    { id: "training", icon: "🎓", title: "Competencies & mandatory training", meta: "Links to the Training module", body: "Core skills: customer service, food handling, cash handling. Mandatory training: Food Safety (Level 1 minimum); WHS induction, manual handling, emergency procedures." },
    { id: "whs", icon: "🦺", title: "Workplace Health & Safety (WHS)", meta: "Responsibilities & incident reporting", body: "Follow safety procedures, report hazards immediately, use PPE. Employer provides safe equipment, training, risk assessments. Incidents reported immediately, documented, escalated if required." },
    { id: "food", icon: "🧼", title: "Food safety", meta: "Food Standards Code · council regulations", body: "Wash hands regularly, use gloves when required, avoid cross-contamination. Do NOT work if experiencing vomiting/diarrhoea or diagnosed with an infectious disease." },
    { id: "roster", icon: "🕐", title: "Rostering & breaks", meta: "Award break entitlements", body: "30-min unpaid break after 5+ hours; paid rest breaks where applicable. Rosters issued in advance, follow award conditions, changes communicated promptly." },
    { id: "conduct", icon: "📋", title: "Code of conduct & performance", meta: "Misconduct · disciplinary process", body: "Be punctual, professional, respectful; follow lawful instructions. Misconduct: theft, harassment, safety breaches, repeated lateness. Disciplinary steps: verbal → written → final warning → termination." },
    { id: "leave", icon: "🌴", title: "Leave entitlements", meta: "Links to the Leave Requests module", body: "Full-time / part-time: annual, personal/carer's, compassionate leave. Casual: no paid leave; unpaid leave in certain situations." },
    { id: "eo", icon: "🤝", title: "Equal opportunity, privacy & emergencies", meta: "Protected attributes · confidentiality · evacuation", body: "No discrimination, harassment or bullying. Protected: gender, age, disability, race, religion. Protect customer/company data. Know fire evacuation routes, emergency contacts, first aid procedures." },
  ],
};

// Official Fair Work links (demo) — stored so the page renders from data, not hardcoded JSX.
const AWARD_LINKS = [
  { code: "MA000003", label: "Fast Food Industry Award", desc: "Takeaway cafés & fast food outlets — summary & pay guide", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000003-summary", tag: "Primary" },
  { code: "MA000119", label: "Restaurant Industry Award", desc: "Dine-in cafés, table-service venues — summary & pay guide", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000119-summary", tag: "Dine-in" },
  { code: "MA000004", label: "General Retail Award", desc: "Only if operating as part of a retail business", url: "https://www.fairwork.gov.au/employment-conditions/awards/awards-summary/ma000004-summary", tag: "Occasional" },
  { code: "", label: "Fair Work pay guides", desc: "Authoritative source — updated annually around 1 July", url: "https://www.fairwork.gov.au/pay-and-wages/minimum-wages/pay-guides", tag: "Verify here" },
];

async function seedAward(a) {
  const ref = groupRef.collection("awardRates").doc(a.code);
  const existing = await ref.get();
  // Never silently un-verify a record a manager already verified.
  const keepVerified = existing.exists && existing.get("verified") === true;
  await ref.set({
    code: a.code, name: a.name, type: a.type, effectiveFrom: EFFECTIVE_FROM,
    levels: a.levels, juniorRates: JUNIOR_RATES, penalties: a.penalties, super: SUPER,
    notes: "Draft figures — internally consistent multipliers, base rates unconfirmed.",
    source: SOURCE,
    ...(keepVerified ? {} : { verified: false, reviewedBy: null, reviewedAt: null }),
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });
  console.log(`• awardRates/${a.code} (${a.name})${keepVerified ? " — kept verified:true" : " — verified:false"}`);
}

(async () => {
  console.log(`Seeding awards & compliance → db=${DATABASE_ID} group=${GROUP_ID}`);
  const g = await groupRef.get();
  if (!g.exists) throw new Error("Group not found — check RG_GROUP_ID.");

  await seedAward(FAST_FOOD);
  await seedAward(RESTAURANT);

  // award links → group doc field (editable later; only seed if absent)
  if (!Array.isArray(g.get("awardLinks"))) {
    await groupRef.set({ awardLinks: AWARD_LINKS }, { merge: true });
    console.log("• group.awardLinks seeded");
  }

  // manual v1 → only if absent (don't clobber later edits / version bumps)
  const manualRef = groupRef.collection("compliance").doc("manual");
  const m = await manualRef.get();
  if (!m.exists) {
    await manualRef.set({ ...MANUAL_V1, updatedBy: "importer", updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp() });
    console.log(`• compliance/manual seeded (v${MANUAL_V1.version}, ${MANUAL_V1.sections.length} sections)`);
  } else {
    console.log(`• compliance/manual already exists (v${m.get("version")}) — left untouched`);
  }

  console.log("\n✅ Awards & compliance seeded (all wage figures verified:false).");
  process.exit(0);
})().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
