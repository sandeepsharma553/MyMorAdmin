/* Phase 2 — cost history + weighted-average (ADDITIVE, idempotent).
 *   node migrate-phase2-cost.js [--apply]
 * Adds costMethod:'wavg' and costHistory:[{cost,qty,source,by,at}] seeded with the
 * CURRENT cost (so `cost` value is unchanged). Keeps `cost`. Idempotent. */
const path=require("path"); const admin=require("firebase-admin");
const { FieldValue }=require("firebase-admin/firestore");
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,"../../secrets/serviceAccount.json")))});
const db=admin.firestore(); db.settings({databaseId:process.env.RG_DATABASE_ID||"mymor-australia"});
const GROUP=process.env.RG_GROUP_ID||"YQRkUwBO5wMIdLSgcpji"; const APPLY=process.argv.includes("--apply");
const g=db.collection("restaurantGroups").doc(GROUP);
(async()=>{
  console.log(`Phase 2 — ${APPLY?"APPLY":"DRY-RUN"} — db=${db._settings.databaseId}\n`);
  const inv=await g.collection("inventoryItems").get(); let mig=0,already=0;
  for(const d of inv.docs){ const x=d.data();
    if(x.costMethod!==undefined && Array.isArray(x.costHistory)){already++;continue;}
    mig++; const entry={cost:Number(x.cost)||0,qty:null,source:"migration-seed",by:"migration",at:new Date().toISOString()};
    if(mig<=3)console.log(`  ${d.id} (${x.name}) cost=${x.cost} -> +costMethod:'wavg', costHistory:[{cost:${entry.cost},source:'migration-seed'}] (cost value UNCHANGED)`);
    if(APPLY)await d.ref.set({costMethod:"wavg",costHistory:[entry],updatedAt:FieldValue.serverTimestamp()},{merge:true});
  }
  if(mig>3)console.log(`  …and ${mig-3} more (identical seeding, cost unchanged)`);
  console.log(`\nSUMMARY (${APPLY?"APPLIED":"would change"}): ${mig} to migrate, ${already} already, ${inv.size} total`);
  console.log(APPLY?"\n✅ Applied.":"\n(DRY-RUN — nothing written.)");
  process.exit(0);
})().catch(e=>{console.error("FAILED:",e.message);process.exit(1);});
