/* Phase 4 — sub-recipes / central kitchen (ADDITIVE, idempotent, NON-numeric).
 *   node migrate-phase4-subrecipes.js [--apply]
 * Adds isPrepped=false and producedByRecipeId=null to inventoryItems. Keeps all
 * fields. Changes no numeric value. Items become "prepped" only when a manager sets
 * it in the editor + links a production recipe. Idempotent. */
const path=require("path"); const admin=require("firebase-admin");
const { FieldValue }=require("firebase-admin/firestore");
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,"../../secrets/serviceAccount.json")))});
const db=admin.firestore(); db.settings({databaseId:process.env.RG_DATABASE_ID||"mymor-australia"});
const GROUP=process.env.RG_GROUP_ID||"YQRkUwBO5wMIdLSgcpji"; const APPLY=process.argv.includes("--apply");
const g=db.collection("restaurantGroups").doc(GROUP);
(async()=>{
  console.log(`Phase 4 sub-recipes — ${APPLY?"APPLY":"DRY-RUN"} — db=${db._settings.databaseId}\n`);
  const inv=await g.collection("inventoryItems").get(); let mig=0,already=0,shown=0;
  for(const d of inv.docs){ const x=d.data();
    if(x.isPrepped!==undefined && x.producedByRecipeId!==undefined){already++;continue;}
    mig++;
    if(shown<4){shown++;console.log(`  ${d.id} (${x.name}) -> +isPrepped:false, producedByRecipeId:null`);}
    if(APPLY)await d.ref.set({isPrepped:false,producedByRecipeId:null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  }
  if(mig>4)console.log(`  …and ${mig-4} more`);
  console.log(`\nSUMMARY (${APPLY?"APPLIED":"would change"}): ${mig} to migrate, ${already} already, ${inv.size} total — NO numeric value changed`);
  console.log(APPLY?"\n✅ Applied.":"\n(DRY-RUN — nothing written.)");
  process.exit(0);
})().catch(e=>{console.error("FAILED:",e.message);process.exit(1);});
