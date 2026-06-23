/* Import a checklist into one or more venues' checklists subcollections:
 *   restaurantGroups/{groupId}/venues/{venueId}/checklists/{key}
 *
 * Mirrors the doc shape saved by ChecklistsPage.js: frequency/type/area/items/
 * checked/autoAssign/shiftLinks/recurring/scheduleDay/scheduleDate.
 * JSON shape: { sourceTitle, venues:["venue-id"], checklists:[{ key, title, sub,
 *   type, area, frequency, scheduleDay, scheduleDate, items:[...] , venues?:[...] }] }
 * (top-level `venues` applies to every checklist; a checklist may override with its own `venues`.)
 * Re-runnable (merge by key). Run from scripts/importer:
 *   node import-checklists.js <groupId> <jsonFile>
 * Env: RG_DATABASE_ID (default 'mymor-australia' = prod; dev is 'mymor-dev-aus').
 */
const path = require("path");
const fs = require("fs");
const admin = require("firebase-admin");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

const [, , groupId, jsonFile] = process.argv;
if (!groupId || !jsonFile) { console.error("Usage: node import-checklists.js <groupId> <jsonFile>"); process.exit(1); }

const DATABASE_ID = process.env.RG_DATABASE_ID || "mymor-australia";
const app = admin.initializeApp({ credential: admin.credential.cert(require(path.resolve(__dirname, "../../secrets/serviceAccount.json"))) });
const db = getFirestore(app, DATABASE_ID);
const slug = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

(async () => {
  console.log(`Target database: ${DATABASE_ID}, group: ${groupId}`);
  const raw = JSON.parse(fs.readFileSync(path.resolve(jsonFile), "utf8"));
  const venuesSnap = await db.collection("restaurantGroups").doc(groupId).collection("venues").get();
  const nameById = {}; venuesSnap.forEach((v) => { nameById[v.id] = v.data().name; });
  console.log("Venues:", venuesSnap.docs.map((v) => v.data().name + "=" + v.id).join(", "));

  const list = raw.checklists || [raw];
  const defaultVenues = raw.venues;
  let n = 0;
  for (const c of list) {
    const key = c.key || slug(c.title) || "checklist";
    const items = (c.items || []).filter((s) => (s || "").trim());
    for (const vid of (c.venues || defaultVenues || [])) {
      const venueName = nameById[vid];
      if (!venueName) { console.log(`  ! venue ${vid} not found, skipping`); continue; }
      await db.collection("restaurantGroups").doc(groupId).collection("venues").doc(vid).collection("checklists").doc(key).set({
        title: c.title || "",
        sub: c.sub || `${venueName} · Daily`,
        venueId: vid, venue: venueName, groupId,
        type: c.type || "",
        area: c.area || "All",
        stationId: "", station: "",
        time: c.time || "",
        items, checked: items.map(() => false),
        days: c.days || [], images: c.images || [], history: c.history || [],
        frequency: c.frequency || "daily",
        scheduleDay: c.scheduleDay || "mon",
        scheduleDate: Math.max(1, Math.min(28, Number(c.scheduleDate) || 1)),
        autoAssign: { roles: (c.autoAssign && c.autoAssign.roles) || [], shiftStart: (c.autoAssign && c.autoAssign.shiftStart) || "", stations: (c.autoAssign && c.autoAssign.stations) || [] },
        shiftLinks: c.shiftLinks || [],
        recurring: c.recurring !== false,
        source: c.source || raw.sourceTitle || "import",
        importedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      n++;
      console.log(`  ✓ venues/${vid}/checklists/${key}  (${items.length} items, ${c.frequency || "daily"})`);
    }
  }
  console.log(`\nImported ${n} checklist-doc(s).`);
  process.exit(0);
})().catch((e) => { console.error("Import failed:", e); process.exit(1); });
