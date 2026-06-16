/* Phase 2 (revised) — per-venue cost + history (ADDITIVE, idempotent).
 *   node migrate-phase2-pervenue-cost.js [--apply]
 * For every per-venue stock/{itemId}, ADD cost=<item's group cost>, costMethod:'wavg',
 * costHistory:[{cost,qty:null,source:'migration-seed',by:'migration',at:ISO}]. Keeps all
 * existing stock fields and keeps inventoryItems.cost (group last-known/reference).
 * No-op: each venue's seeded cost == old group cost, so valuation/recipe cost unchanged. */
const path=require("path"); const admin=require("firebase-admin");
const { FieldValue }=require("firebase-admin/firestore");
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,"../../secrets/serviceAccount.json")))});
const db=admin.firestore(); db.settings({databaseId:process.env.RG_DATABASE_ID||"mymor-australia"});
const GROUP=process.env.RG_GROUP_ID||"YQRkUwBO5wMIdLSgcpji"; const APPLY=process.argv.includes("--apply");
const g=db.collection("restaurantGroups").doc(GROUP);
(async()=>{
  console.log(`Phase 2 per-venue cost — ${APPLY?"APPLY":"DRY-RUN"} — db=${db._settings.databaseId}\n`);
  const inv=await g.collection("inventoryItems").get();
  const costById={}; inv.docs.forEach(d=>costById[d.id]=Number(d.data().cost)||0);
  const venues=(await g.collection("venues").get()).docs.map(d=>d.id);
  let mig=0,already=0,missingItem=0,shown=0;
  for(const v of venues){
    const stock=await g.collection("venues").doc(v).collection("stock").get();
    for(const d of stock.docs){ const x=d.data();
      if(x.cost!==undefined && x.costMethod!==undefined && Array.isArray(x.costHistory)){already++;continue;}
      const seedCost=costById[d.id]; if(seedCost===undefined){missingItem++;}
      mig++;
      const c=seedCost!==undefined?seedCost:0;
      const entry={cost:c,qty:null,source:"migration-seed",by:"migration",at:new Date().toISOString()};
      if(shown<4){shown++;console.log(`  ${v}/stock/${d.id} qtyOnHand=${x.qtyOnHand} -> +cost:${c}, costMethod:'wavg', costHistory:[seed] (group inventoryItems.cost unchanged)`);}
      if(APPLY)await d.ref.set({cost:c,costMethod:"wavg",costHistory:[entry],updatedAt:FieldValue.serverTimestamp()},{merge:true});
    }
  }
  if(mig>4)console.log(`  …and ${mig-4} more stock docs (seeded = each item's group cost)`);
  console.log(`\nSUMMARY (${APPLY?"APPLIED":"would change"}): ${mig} stock docs to migrate, ${already} already, across ${venues.length} venues`);
  if(missingItem)console.log(`  ⚠ ${missingItem} stock docs had no matching inventoryItem (seeded cost 0) — investigate`);
  console.log(APPLY?"\n✅ Applied.":"\n(DRY-RUN — nothing written. inventoryItems untouched.)");
  process.exit(0);
})().catch(e=>{console.error("FAILED:",e.message);process.exit(1);});
