import React, { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

const OFFER_TYPES = [
  { id: "fixed_price", label: "Fixed Price" },
  { id: "percent_off", label: "Percent Off" },
  { id: "amount_off", label: "Amount Off" },
  { id: "bundle", label: "Bundle (B1G1 etc)" },
  { id: "freebie", label: "Freebie" },
  { id: "tiered", label: "Tiered Pricing" },
  { id: "range", label: "Range" },
  { id: "limited", label: "Limited Qty" },
];

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const cardCls = "rounded-2xl border border-gray-200 bg-white p-4";

export default function OfferBlocksEditor({ dealId, disabled }) {
  const [offers, setOffers] = useState([]);
  const [v, setV] = useState({
    label: "",
    type: "fixed_price",
    value: "",
    unit: "$",
    notes: "",
    timeOverride: "",
    redemptionOverride: "",
  });

  useEffect(() => {
    if (!dealId) return;
    const qy = query(collection(db, "deals", dealId, "offers"), orderBy("order", "asc"));
    return onSnapshot(qy, (snap) => {
      setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [dealId]);

  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  const addOffer = async () => {
    if (!dealId) return;
    if (!v.label.trim()) return alert("Offer label required");

    const order = offers.length ? Math.max(...offers.map((o) => o.order || 0)) + 1 : 1;

    await addDoc(collection(db, "deals", dealId, "offers"), {
      label: v.label.trim(),
      type: v.type,
      value: v.value === "" ? null : Number(v.value),
      unit: v.unit,
      notes: v.notes.trim(),
      timeOverride: v.timeOverride.trim(),
      redemptionOverride: v.redemptionOverride.trim(),
      order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    setV({
      label: "",
      type: "fixed_price",
      value: "",
      unit: "$",
      notes: "",
      timeOverride: "",
      redemptionOverride: "",
    });
  };

  const removeOffer = async (offerId) => {
    await deleteDoc(doc(db, "deals", dealId, "offers", offerId));
  };

  return (
    <div className="mt-6 space-y-3">
      <div>
        <div className="text-sm font-semibold text-gray-900">Offer Blocks</div>
        <div className="text-xs text-gray-500">Add multiple offers inside the poster (menu mode).</div>
      </div>

      {!dealId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Create the deal first, then add offer blocks.
        </div>
      )}

      <div className={cardCls}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs text-gray-600">Label *</div>
            <input className={inputCls} value={v.label} onChange={set("label")} placeholder="$4 Beers" disabled={!dealId || disabled} />
          </div>

          <div>
            <div className="text-xs text-gray-600">Type</div>
            <select className={inputCls} value={v.type} onChange={set("type")} disabled={!dealId || disabled}>
              {OFFER_TYPES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="text-xs text-gray-600">Value (optional)</div>
            <input className={inputCls} value={v.value} onChange={set("value")} placeholder="4 / 20 / 10" disabled={!dealId || disabled} />
          </div>

          <div>
            <div className="text-xs text-gray-600">Unit</div>
            <select className={inputCls} value={v.unit} onChange={set("unit")} disabled={!dealId || disabled}>
              <option value="$">$</option>
              <option value="%">%</option>
              <option value="AUD">AUD</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-gray-600">Notes</div>
            <input className={inputCls} value={v.notes} onChange={set("notes")} placeholder="Before 10pm, selected taps" disabled={!dealId || disabled} />
          </div>

          <div>
            <div className="text-xs text-gray-600">Time Override (optional)</div>
            <input className={inputCls} value={v.timeOverride} onChange={set("timeOverride")} placeholder="Only after 7pm" disabled={!dealId || disabled} />
          </div>

          <div>
            <div className="text-xs text-gray-600">Redemption Override (optional)</div>
            <input className={inputCls} value={v.redemptionOverride} onChange={set("redemptionOverride")} placeholder="QR only / Promo only" disabled={!dealId || disabled} />
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={addOffer}
            disabled={!dealId || disabled}
            className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            + Add Offer Block
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-[1100px] w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-gray-600">
              <th className="p-3 font-semibold">Label</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Value</th>
              <th className="p-3 font-semibold">Notes</th>
              <th className="p-3 font-semibold">Time Override</th>
              <th className="p-3 font-semibold">Redemption Override</th>
              <th className="p-3 font-semibold w-32">Action</th>
            </tr>
          </thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} className="border-t border-gray-100">
                <td className="p-3 font-semibold text-gray-900">{o.label}</td>
                <td className="p-3 text-gray-700">{o.type}</td>
                <td className="p-3 text-gray-700">
                  {o.value ?? "—"} {o.unit || ""}
                </td>
                <td className="p-3 text-gray-600">{o.notes || "—"}</td>
                <td className="p-3 text-gray-600">{o.timeOverride || "—"}</td>
                <td className="p-3 text-gray-600">{o.redemptionOverride || "—"}</td>
                <td className="p-3">
                  <button
                    className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                    type="button"
                    onClick={() => removeOffer(o.id)}
                    disabled={disabled}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}

            {offers.length === 0 && (
              <tr>
                <td className="p-6 text-gray-500" colSpan={7}>
                  No offer blocks yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
