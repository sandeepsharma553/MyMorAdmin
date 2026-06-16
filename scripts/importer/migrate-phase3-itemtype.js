/* Phase 3 — itemType (ADDITIVE, idempotent, NON-numeric).
 *   node migrate-phase3-itemtype.js [--apply]
 * Default itemType='ingredient' for ALL items; items whose category is in
 * BOTH_CATEGORIES become 'both' (none named → all 'ingredient'). Sets only the
 * classification label — no sell/cost value changed. Editor allows per-item
 * reclassification later. Idempotent (skip if itemType already set). */
const path=require("path"); const admin=require("firebase-admin");
const { FieldValue }=require("firebase-admin/firestore");
admin.initializeApp({credential:admin.credential.cert(require(path.resolve(__dirname,"../../secrets/serviceAccount.json")))});
const db=admin.firestore(); db.settings({databaseId:process.env.RG_DATABASE_ID||"mymor-australia"});
const GROUP=process.env.RG_GROUP_ID||"YQRkUwBO5wMIdLSgcpji"; const APPLY=process.argv.includes("--apply");
const BOTH_CATEGORIES = new Set([]); // none sold to customers as-is — all raw ingredients/packaging
const g=db.collection("restaurantGroups").doc(GROUP);
(async()=>{
  console.log(`Phase 3 itemType — ${APPLY?"APPLY":"DRY-RUN"} — db=${db._settings.databaseId}`);
  console.log(`BOTH_CATEGORIES = {${[...BOTH_CATEGORIES].join(", ")||"<none>"}}\n`);
  const inv=await g.collection("inventoryItems").get(); let mig=0,already=0,both=0,ing=0,shown=0;
  for(const d of inv.docs){ const x=d.data();
    if(x.itemType!==undefined){already++;continue;}
    const t=BOTH_CATEGORIES.has(x.category)?"both":"ingredient"; t==="both"?both++:ing++; mig++;
    if(shown<4){shown++;console.log(`  ${d.id} (${x.name}) [${x.category}] sell=${x.sell} -> itemType:'${t}' (sell UNCHANGED)`);}
    if(APPLY)await d.ref.set({itemType:t,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  }
  if(mig>4)console.log(`  …and ${mig-4} more`);
  console.log(`\nSUMMARY (${APPLY?"APPLIED":"would change"}): ${mig} to migrate (${both} 'both', ${ing} 'ingredient'), ${already} already, ${inv.size} total — NO numeric value changed`);
  console.log(APPLY?"\n✅ Applied.":"\n(DRY-RUN — nothing written.)");
  process.exit(0);
})().catch(e=>{console.error("FAILED:",e.message);process.exit(1);});
