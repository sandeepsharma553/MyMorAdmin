import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import useDealSettings from "../../hooks/useDealSettings";

const DAYS = [
  { id: "mon", label: "M" },
  { id: "tue", label: "T" },
  { id: "wed", label: "W" },
  { id: "thu", label: "T" },
  { id: "fri", label: "F" },
  { id: "sat", label: "S" },
  { id: "sun", label: "S" },
];

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const cardCls = "rounded-2xl border border-gray-200 bg-white p-4";

const dayBtnOn =
  "h-9 w-10 rounded-lg border text-sm font-semibold bg-black text-white border-black";
const dayBtnOff =
  "h-9 w-10 rounded-lg border text-sm font-semibold bg-white text-gray-900 border-gray-200 hover:bg-gray-50";

const emptyForm = {
  label: "",
  type: "fixed_price",
  value: "",
  unit: "$", // ✅ $, %, AUD, special
  notes: "",
  timeOverride: "",
  redemptionOverride: "",

  validFrom: "",
  validTo: "",
  daysActive: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  timeWindowStart: "",
  timeWindowEnd: "",
};

export default function OfferBlocksEditor({ dealId, disabled, uid }) {
  const [offers, setOffers] = useState([]);

  const [v, setV] = useState(emptyForm);
  const [editingOfferId, setEditingOfferId] = useState(null);

  const settings = useDealSettings(uid);
  const settingsOfferTypes = settings?.offerTypes || []; // ✅ safe

  useEffect(() => {
    if (!dealId) return;
    const qy = query(
      collection(db, "deals", dealId, "offers"),
      orderBy("order", "asc")
    );
    return onSnapshot(qy, (snap) => {
      setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [dealId]);

  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  const toggleDay = (dayId) => {
    setV((p) => {
      const has = (p.daysActive || []).includes(dayId);
      return {
        ...p,
        daysActive: has
          ? p.daysActive.filter((d) => d !== dayId)
          : [...p.daysActive, dayId],
      };
    });
  };

  const isSpecial = v.unit === "special";

  const scheduleOverride = useMemo(() => {
    const timeWindow =
      v.timeWindowStart && v.timeWindowEnd
        ? { start: v.timeWindowStart, end: v.timeWindowEnd }
        : null;

    return {
      validFrom: v.validFrom || "",
      validTo: v.validTo || "",
      activeDays: v.daysActive || [],
      timeWindow,
    };
  }, [v.validFrom, v.validTo, v.daysActive, v.timeWindowStart, v.timeWindowEnd]);

  const resetForm = () => {
    setV(emptyForm);
    setEditingOfferId(null);
  };

  // ✅ NEW: Validation (days + time required)
  const validateOffer = () => {
    if (!v.label.trim()) return "Offer label required";

    // Special -> no value needed
    if (!isSpecial) {
      // if you want strict price required uncomment:
      // if (String(v.value).trim() === "") return "Value required OR choose SPECIAL";
    }

    if (!v.daysActive?.length) return "Select at least 1 active day";
    if (!v.timeWindowStart || !v.timeWindowEnd)
      return "Time window start & end required for this offer";

    return null;
  };

  const addOffer = async () => {
    if (!dealId) return;

    const err = validateOffer();
    if (err) return alert(err);

    const order = offers.length
      ? Math.max(...offers.map((o) => o.order || 0)) + 1
      : 1;

    await addDoc(collection(db, "deals", dealId, "offers"), {
      label: v.label.trim(),
      type: v.type,
      value: isSpecial ? null : (v.value === "" ? null : Number(v.value)),
      unit: v.unit,
      notes: v.notes.trim(),
      timeOverride: v.timeOverride.trim(),
      redemptionOverride: v.redemptionOverride.trim(),
      scheduleOverride,
      order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    resetForm();
  };

  const startEdit = (offer) => {
    const sch = offer?.scheduleOverride || {};
    setEditingOfferId(offer.id);
    setV({
      label: offer.label || "",
      type: offer.type || "fixed_price",
      value: offer.value == null ? "" : String(offer.value),
      unit: offer.unit || "$",
      notes: offer.notes || "",
      timeOverride: offer.timeOverride || "",
      redemptionOverride: offer.redemptionOverride || "",

      validFrom: sch.validFrom || "",
      validTo: sch.validTo || "",
      daysActive: sch.activeDays?.length
        ? sch.activeDays
        : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      timeWindowStart: sch.timeWindow?.start || "",
      timeWindowEnd: sch.timeWindow?.end || "",
    });
  };

  const updateOffer = async () => {
    if (!dealId || !editingOfferId) return;

    const err = validateOffer();
    if (err) return alert(err);

    await updateDoc(doc(db, "deals", dealId, "offers", editingOfferId), {
      label: v.label.trim(),
      type: v.type,
      value: isSpecial ? null : (v.value === "" ? null : Number(v.value)),
      unit: v.unit,
      notes: v.notes.trim(),
      timeOverride: v.timeOverride.trim(),
      redemptionOverride: v.redemptionOverride.trim(),
      scheduleOverride,
      updatedAt: serverTimestamp(),
    });

    resetForm();
  };

  const removeOffer = async (offerId) => {
    await deleteDoc(doc(db, "deals", dealId, "offers", offerId));
    if (editingOfferId === offerId) resetForm();
  };

  const renderDays = (arr = []) => {
    const map = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };
    return (arr || []).map((d) => map[d] || d).join("");
  };

  const renderTimeWindow = (tw) => {
    if (!tw?.start || !tw?.end) return "—";
    return `${tw.start} - ${tw.end}`;
  };

  const renderValue = (o) => {
    if (o.unit === "special") return "Special";
    if (o.value == null) return "—";
    return `${o.value} ${o.unit || ""}`.trim();
  };

  return (
    <div className="mt-6 space-y-3">
      <div>
        <div className="text-sm font-semibold text-gray-900">Offer Blocks</div>
        <div className="text-xs text-gray-500">
          Every offer has its own days + time window.
        </div>
      </div>

      {!dealId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Create the deal first, then add offer blocks.
        </div>
      )}

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900">
            {editingOfferId ? "Edit Offer Block" : "Add Offer Block"}
          </div>

          {editingOfferId && (
            <button
              type="button"
              onClick={resetForm}
              disabled={disabled}
              className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div className="text-xs text-gray-600">Label *</div>
            <input
              className={inputCls}
              value={v.label}
              onChange={set("label")}
              placeholder="$4 Beers"
              disabled={!dealId || disabled}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600">Type</div>
            <select
              className={inputCls}
              value={v.type}
              onChange={set("type")}
              disabled={!dealId || disabled}
            >
              {(settingsOfferTypes?.length ? settingsOfferTypes : []).map((t) => (
                <option
                  key={t.id}
                  value={t.key || t.id || t.name?.toLowerCase()}
                >
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Hide Value if SPECIAL */}
          {!isSpecial && (
            <div>
              <div className="text-xs text-gray-600">Value (optional)</div>
              <input
                className={inputCls}
                value={v.value}
                onChange={set("value")}
                placeholder="4 / 20 / 10"
                disabled={!dealId || disabled}
              />
            </div>
          )}

          <div>
            <div className="text-xs text-gray-600">Unit</div>
            <select
              className={inputCls}
              value={v.unit}
              onChange={(e) => {
                const next = e.target.value;
                setV((p) => ({
                  ...p,
                  unit: next,
                  value: next === "special" ? "" : p.value,
                }));
              }}
              disabled={!dealId || disabled}
            >
              <option value="$">$</option>
              <option value="%">%</option>
              <option value="AUD">AUD</option>
              <option value="special">SPECIAL (no price)</option>
            </select>

            {isSpecial && (
              <div className="mt-2 text-xs text-gray-500">
                Special selected → no price will be shown.
              </div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="text-xs text-gray-600">Notes</div>
            <input
              className={inputCls}
              value={v.notes}
              onChange={set("notes")}
              placeholder="Before 10pm, selected taps"
              disabled={!dealId || disabled}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600">Time Override (optional)</div>
            <input
              className={inputCls}
              value={v.timeOverride}
              onChange={set("timeOverride")}
              placeholder="Only after 7pm"
              disabled={!dealId || disabled}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600">Redemption Override (optional)</div>
            <input
              className={inputCls}
              value={v.redemptionOverride}
              onChange={set("redemptionOverride")}
              placeholder="QR only / Promo only"
              disabled={!dealId || disabled}
            />
          </div>
        </div>

        {/* Offer Schedule (required days+time) */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-semibold text-gray-900">
            Offer Schedule (days + time required)
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-gray-600">Valid From (optional)</div>
              <input
                type="date"
                className={inputCls}
                value={v.validFrom}
                onChange={set("validFrom")}
                disabled={!dealId || disabled}
              />
            </div>

            <div>
              <div className="text-xs text-gray-600">Valid To (optional)</div>
              <input
                type="date"
                className={inputCls}
                value={v.validTo}
                onChange={set("validTo")}
                disabled={!dealId || disabled}
              />
            </div>

            <div>
              <div className="text-xs text-gray-600">Time Window Start *</div>
              <input
                type="time"
                className={inputCls}
                value={v.timeWindowStart}
                onChange={set("timeWindowStart")}
                disabled={!dealId || disabled}
              />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-gray-600">Time Window End *</div>
              <input
                type="time"
                className={inputCls}
                value={v.timeWindowEnd}
                onChange={set("timeWindowEnd")}
                disabled={!dealId || disabled}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold text-gray-700">Active Days *</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {DAYS.map((d) => {
                const on = (v.daysActive || []).includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    disabled={!dealId || disabled}
                    className={on ? dayBtnOn : dayBtnOff}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-4 flex justify-end gap-2">
          {!editingOfferId ? (
            <button
              type="button"
              onClick={addOffer}
              disabled={!dealId || disabled}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              + Add Offer Block
            </button>
          ) : (
            <button
              type="button"
              onClick={updateOffer}
              disabled={!dealId || disabled}
              className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              Save Offer
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-[1400px] w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-gray-600">
              <th className="p-3 font-semibold">Label</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Value</th>
              <th className="p-3 font-semibold">Notes</th>
              <th className="p-3 font-semibold">Time Window</th>
              <th className="p-3 font-semibold">Days</th>
              <th className="p-3 font-semibold w-44">Actions</th>
            </tr>
          </thead>

          <tbody>
            {offers.map((o) => {
              const sch = o.scheduleOverride || {};
              return (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="p-3 font-semibold text-gray-900">{o.label}</td>
                  <td className="p-3 text-gray-700">{o.type}</td>

                  {/* ✅ SPECIAL render */}
                  <td className="p-3 text-gray-700">{renderValue(o)}</td>

                  <td className="p-3 text-gray-600">{o.notes || "—"}</td>

                  <td className="p-3 text-gray-600">
                    {renderTimeWindow(sch.timeWindow)}
                  </td>

                  <td className="p-3 text-gray-600">
                    {sch.activeDays?.length ? renderDays(sch.activeDays) : "—"}
                  </td>

                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(o)}
                        disabled={disabled}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Edit
                      </button>

                      <button
                        className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                        type="button"
                        onClick={() => removeOffer(o.id)}
                        disabled={disabled}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

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