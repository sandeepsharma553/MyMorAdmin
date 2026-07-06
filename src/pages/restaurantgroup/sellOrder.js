import { getApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";

/* The ONE entry point for POS deductions (module #2 §6). The deduction runs
 * server-side in a Firestore transaction inside the rgSellOrder callable —
 * never reimplement it client-side. POS (#3) must import this same caller. */
export async function sellOrder({ groupId, venueId, lines, reference, orderMeta }) {
  const fns = getFunctions(getApp(), "us-central1");
  const call = httpsCallable(fns, "rgSellOrder");
  const res = await call({ groupId, venueId, lines, reference, orderMeta });
  // { ok, orderId, orderNumber, amounts, deducted[], skipped[], lowStock[], draftsCreated }
  // orderMeta is optional: { serviceMode, customer?, tableNumber?, covers? } — omitted by
  // the demo-sell callers, which produce a minimal dine-in order.
  return res.data;
}
