import React, { useMemo, useState } from "react";
import EditorPro from "../../components/EditorPro"; // path adjust

const DEAL_TYPES = [
  { id: "dining", label: "Dining" },
  { id: "entertainment", label: "Entertainment" },
  { id: "experience", label: "Experience" },
];

const SLOTS_BY_TYPE = {
  dining: ["Breakfast", "Lunch", "Dinner", "High Tea", "Bottomless", "All Day"],
  entertainment: ["Arcade/Games", "Movies", "Live Music", "Comedy", "Bowling", "Karaoke"],
  experience: ["Cooking School", "Wine Tour", "Sip Events", "Cocktail Class", "Eating Challenge", "Buffet", "Dinner & Show"],
};

const MAP_ICONS = [
  { id: "asian", label: "Asian" },
  { id: "byo", label: "BYO" },
  { id: "bottomless", label: "Bottomless" },
  { id: "arcade", label: "Arcade/Games" },
  { id: "movies", label: "Movies" },
  { id: "fitness", label: "Fitness" },
];

const OFFER_TYPES = [
  { id: "free", label: "Free" },
  { id: "price", label: "Price" },
  { id: "discount", label: "Discount" },
  { id: "kidsEatFree", label: "Kids Eat Free" },
  { id: "b1g1", label: "B1G1" },
];

const DAYS = [
  { id: "mon", label: "M" },
  { id: "tue", label: "T" },
  { id: "wed", label: "W" },
  { id: "thu", label: "T" },
  { id: "fri", label: "F" },
  { id: "sat", label: "S" },
  { id: "sun", label: "S" },
];

const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const selectCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const cardCls = "rounded-2xl border border-gray-200 bg-white p-4";

export default function DealForm({ initialValues, onSubmit, loading, submitText = "Save Deal" }) {
  const defaults = useMemo(
    () => ({
      dealType: "experience",
      header: "",
      imageFile: null,
      imageUrl: "",
      slot: "",
      mapIcon: "asian",
      descriptionHtml: "",

      bookingLink: "",
      offerType: "free",
      priceValue: "",
      discountPercent: "",

      // optional “days active”
      daysActive: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],

      featured: false,
      active: true,

      // keep old fields if you want compatibility
      title: "",
      subtitle: "",
      businessName: "",
      categoryId: "food",
      categoryLabel: "",
      validFrom: "",
      validTo: "",
      terms: "",
      address: "",
      lat: "",
      lng: "",

      ...initialValues,
    }),
    [initialValues]
  );

  const [v, setV] = useState(defaults);
  const [openEditor, setOpenEditor] = useState(false);

  const slotOptions = useMemo(() => SLOTS_BY_TYPE[v.dealType] || [], [v.dealType]);

  const daysLeft = useMemo(() => {
    if (!v.validTo) return null;
    const end = new Date(v.validTo);
    const now = new Date();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Number.isFinite(diff) ? Math.max(diff, 0) : null;
  }, [v.validTo]);

  const set = (key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setV((p) => ({ ...p, [key]: val }));
  };

  const toggleDay = (dayId) => {
    setV((p) => {
      const has = p.daysActive.includes(dayId);
      return {
        ...p,
        daysActive: has ? p.daysActive.filter((d) => d !== dayId) : [...p.daysActive, dayId],
      };
    });
  };

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const okTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!okTypes.includes(file.type)) {
      alert("Invalid image file. Only allowed formats: .jpg, .jpeg, .png, .gif, .webp");
      return;
    }
    setV((p) => ({ ...p, imageFile: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!v.header.trim()) return alert("Header is required");
    if (!v.imageFile && !v.imageUrl) return alert("Image is required");
    if (!v.slot) return alert("Slot is required");

    if (v.offerType === "price" && !String(v.priceValue).trim()) {
      return alert("Price is required");
    }
    if (v.offerType === "discount" && !String(v.discountPercent).trim()) {
      return alert("Discount % is required");
    }

    await onSubmit({
      ...v,
      title: v.title || v.header, // keep compatibility
      subtitle: v.subtitle || "",

      daysLeft,
      lat: v.lat === "" ? null : Number(v.lat),
      lng: v.lng === "" ? null : Number(v.lng),

      // normalize numbers
      priceValue: v.offerType === "price" ? Number(v.priceValue) : null,
      discountPercent: v.offerType === "discount" ? Number(v.discountPercent) : null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Deal Type */}
      <div>
        <label className={labelCls}>Select the Deal Type *</label>
        <select value={v.dealType} onChange={set("dealType")} className={selectCls}>
          {DEAL_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {/* Header */}
      <div>
        <label className={labelCls}>Offer / Listing Header *</label>
        <input
          value={v.header}
          onChange={set("header")}
          className={inputCls}
          placeholder="Thursday Steak Night"
          required
        />
      </div>

      {/* Image */}
      <div className={cardCls}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Offer / Listing Image *</div>
            <div className="text-xs text-gray-500">Allowed: .jpg, .jpeg, .png, .gif, .webp</div>
          </div>

          <input type="file" accept="image/*" onChange={onPickImage} className="text-sm" />
        </div>

        {(v.imageFile || v.imageUrl) && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <img
              alt="preview"
              className="h-44 w-full object-cover"
              src={v.imageFile ? URL.createObjectURL(v.imageFile) : v.imageUrl}
            />
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs text-gray-500">Or paste image URL</label>
          <input value={v.imageUrl} onChange={set("imageUrl")} className={inputCls} placeholder="https://..." />
        </div>
      </div>

      {/* Slot + Map Icon */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Select Slot *</label>
          <select value={v.slot} onChange={set("slot")} className={selectCls}>
            <option value="">Select Slot</option>
            {slotOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Select Map Icons</label>
          <select value={v.mapIcon} onChange={set("mapIcon")} className={selectCls}>
            {MAP_ICONS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Description with Editor button */}
      <div>
        <label className={labelCls}>Offer/Listing Description *</label>

        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpenEditor(true)}
            className="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:opacity-90"
          >
            ✍️ Open Editor
          </button>

          <div className="text-xs text-gray-500">
            {v.descriptionHtml ? "Description added ✅" : "No description yet"}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
          {v.descriptionHtml ? "Preview saved (HTML)" : "Tip: Use editor to add formatted content."}
        </div>
      </div>

      {/* Booking link */}
      <div>
        <label className={labelCls}>Booking Link</label>
        <input
          value={v.bookingLink}
          onChange={set("bookingLink")}
          className={inputCls}
          placeholder="https://..."
        />
      </div>

      {/* Offer Type + dynamic */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className={labelCls}>Offer Type *</label>
          <select value={v.offerType} onChange={set("offerType")} className={selectCls}>
            {OFFER_TYPES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Dynamic field */}
        <div>
          {v.offerType === "price" && (
            <>
              <label className={labelCls}>Price *</label>
              <input
                value={v.priceValue}
                onChange={set("priceValue")}
                className={inputCls}
                placeholder="30"
              />
            </>
          )}

          {v.offerType === "discount" && (
            <>
              <label className={labelCls}>Discount % *</label>
              <input
                value={v.discountPercent}
                onChange={set("discountPercent")}
                className={inputCls}
                placeholder="50"
              />
            </>
          )}

          {v.offerType !== "price" && v.offerType !== "discount" && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-700 mt-2">
              No extra fields needed for <b>{OFFER_TYPES.find((x) => x.id === v.offerType)?.label}</b>.
            </div>
          )}
        </div>
      </div>

      {/* Days Active (optional but matches app style) */}
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Active Days</div>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = v.daysActive.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDay(d.id)}
                className={[
                  "h-9 w-10 rounded-lg border text-sm font-semibold",
                  on ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Featured / Active */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input type="checkbox" checked={v.featured} onChange={set("featured")} className="h-4 w-4 rounded" />
          Featured
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input type="checkbox" checked={v.active} onChange={set("active")} className="h-4 w-4 rounded" />
          Active
        </label>
      </div>

      {/* Validity (optional) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label className={labelCls}>Valid From</label>
          <input type="date" value={v.validFrom} onChange={set("validFrom")} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Valid To</label>
          <input type="date" value={v.validTo} onChange={set("validTo")} className={inputCls} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
          <div className="text-xs text-gray-500">Days Left (auto)</div>
          <div className="mt-1 text-lg font-bold text-red-600">{daysLeft ?? "—"}</div>
        </div>
      </div>

      {/* Editor Modal */}
      {openEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div className="text-sm font-semibold text-gray-900">Offer/Listing Description</div>
              <button
                type="button"
                onClick={() => setOpenEditor(false)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-4">
              <EditorPro
                value={v.descriptionHtml}
                onChange={(html) => setV((p) => ({ ...p, descriptionHtml: html }))}
              />

              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setOpenEditor(false)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setOpenEditor(false)}
                  className="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        disabled={loading}
        className="w-full rounded-2xl bg-black px-4 py-3 text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
        type="submit"
      >
        {loading ? "Saving..." : submitText}
      </button>
    </form>
  );
}
