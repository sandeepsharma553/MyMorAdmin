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
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { db, storage } from "../../firebase";
import useDealSettings from "../../hooks/useDealSettings";

const DAYS = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const DAYS_SHORT = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const cardCls = "rounded-2xl border border-gray-200 bg-white p-4";

const dayPillOn =
  "inline-flex items-center justify-center rounded-xl border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-semibold text-white";
const dayPillOff =
  "inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-900 hover:bg-gray-50";

const initDaySchedules = (allActive = true) =>
  DAYS.reduce((acc, d) => {
    acc[d.id] = {
      active: allActive,
      slots: [{ start: "", end: "" }], // allow multiple
    };
    return acc;
  }, {});

const initialForm = {
  label: "",
  type: "fixed_price",
  lineItems: [{ title: "", price: "", unit: "$", note: "", highlight: false }],
  notes: "",
  timeOverride: "",
  redemptionOverride: "",
  bookingEnabled: false,
  bookingLink: "",
  bookingname: "",

  // ✅ Banner (Upload only)
  bannerUrl: "",
  bannerPath: "",

  scheduleEnabled: false,
  validFrom: "",
  validTo: "",
  daySchedules: initDaySchedules(true),
};

export default function OfferBlocksEditor({ dealId, disabled, uid }) {
  const [offers, setOffers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [editingOfferId, setEditingOfferId] = useState(null);

  // ✅ Schedule UI (collapsible)
  const [showSchedule, setShowSchedule] = useState(false);

  // ✅ Day accordion open state
  const [openDay, setOpenDay] = useState("mon");

  const settings = useDealSettings(uid);
  const settingsOfferTypes = settings?.offerTypes || [];

  useEffect(() => {
    if (!dealId) return;
    const qy = query(collection(db, "deals", dealId, "offers"), orderBy("order", "asc"));
    return onSnapshot(qy, (snap) => {
      setOffers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, [dealId]);

  const set = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));

  // ---------- Banner helpers (upload only) ----------
  const uploadOfferBanner = async (file) => {
    if (!dealId) return null;

    const ext = (file?.name || "banner.jpg").split(".").pop() || "jpg";
    const path = `deals/${dealId}/offers/banners/${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}.${ext}`;

    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    return { url, path };
  };

  const removeBannerFromStorage = async (path) => {
    if (!path) return;
    try {
      await deleteObject(storageRef(storage, path));
    } catch (e) {
      // ignore
    }
  };

  const onPickBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // old banner delete if exists
    const oldPath = form.bannerPath;
    if (oldPath) await removeBannerFromStorage(oldPath);

    const res = await uploadOfferBanner(file);
    if (!res) return;

    setForm((p) => ({
      ...p,
      bannerUrl: res.url,
      bannerPath: res.path,
    }));

    // allow re-pick same file
    e.target.value = "";
  };

  // ---------- Line Items ----------
  const addLineItem = () => {
    setForm((p) => ({
      ...p,
      lineItems: [...(p.lineItems || []), { title: "", price: "", unit: "$", note: "", highlight: false }],
    }));
  };

  const removeLineItem = (idx) => {
    setForm((p) => ({
      ...p,
      lineItems: (p.lineItems || []).filter((_, i) => i !== idx),
    }));
  };

  const setLineItem = (idx, key, val) => {
    setForm((p) => ({
      ...p,
      lineItems: (p.lineItems || []).map((it, i) => (i === idx ? { ...it, [key]: val } : it)),
    }));
  };

  // ---------- Per-day schedule helpers ----------
  const toggleDayActive = (dayId) => {
    setForm((p) => {
      const next = !p.daySchedules?.[dayId]?.active;
      const curr = p.daySchedules?.[dayId] || { active: false, slots: [{ start: "", end: "" }] };
      return {
        ...p,
        daySchedules: {
          ...(p.daySchedules || {}),
          [dayId]: {
            ...curr,
            active: next,
            slots: curr.slots?.length ? curr.slots : [{ start: "", end: "" }],
          },
        },
      };
    });
  };

  const addSlot = (dayId) => {
    setForm((p) => {
      const curr = p.daySchedules?.[dayId] || { active: true, slots: [] };
      return {
        ...p,
        daySchedules: {
          ...(p.daySchedules || {}),
          [dayId]: {
            ...curr,
            slots: [...(curr.slots || []), { start: "", end: "" }],
          },
        },
      };
    });
  };

  const removeSlot = (dayId, slotIdx) => {
    setForm((p) => {
      const curr = p.daySchedules?.[dayId] || { active: true, slots: [] };
      const nextSlots = (curr.slots || []).filter((_, i) => i !== slotIdx);
      return {
        ...p,
        daySchedules: {
          ...(p.daySchedules || {}),
          [dayId]: {
            ...curr,
            slots: nextSlots.length ? nextSlots : [{ start: "", end: "" }],
          },
        },
      };
    });
  };

  const setSlot = (dayId, slotIdx, key, val) => {
    setForm((p) => {
      const curr = p.daySchedules?.[dayId] || { active: true, slots: [{ start: "", end: "" }] };
      const slots = (curr.slots || []).map((s, i) => (i === slotIdx ? { ...s, [key]: val } : s));
      return {
        ...p,
        daySchedules: {
          ...(p.daySchedules || {}),
          [dayId]: { ...curr, slots },
        },
      };
    });
  };

  // ✅ Copy Monday → all active days
  const copyMondayToAll = () => {
    setForm((p) => {
      const mon = p.daySchedules?.mon || { active: true, slots: [{ start: "", end: "" }] };
      const monSlots = (mon.slots || []).map((s) => ({ start: s.start || "", end: s.end || "" }));

      const ds = { ...(p.daySchedules || {}) };
      DAYS.forEach((d) => {
        const cur = ds[d.id] || { active: false, slots: [{ start: "", end: "" }] };
        if (cur.active) {
          ds[d.id] = { ...cur, slots: monSlots.length ? monSlots : [{ start: "", end: "" }] };
        }
      });

      return { ...p, daySchedules: ds };
    });
  };

  // ---------- scheduleOverride ----------
  const scheduleOverride = useMemo(() => {
    if (!form.scheduleEnabled) return null;

    const daysObj = {};
    const ds = form.daySchedules || {};

    DAYS.forEach((d) => {
      const day = ds[d.id];
      if (!day?.active) return;

      const cleanSlots = (day.slots || [])
        .map((s) => ({ start: (s.start || "").trim(), end: (s.end || "").trim() }))
        .filter((s) => s.start && s.end);

      if (cleanSlots.length) daysObj[d.id] = cleanSlots;
    });

    return {
      validFrom: form.validFrom || "",
      validTo: form.validTo || "",
      days: daysObj,
    };
  }, [form.scheduleEnabled, form.validFrom, form.validTo, form.daySchedules]);

  const resetForm = () => {
    setForm(initialForm);
    setEditingOfferId(null);
    setShowSchedule(false);
    setOpenDay("mon");
  };

  // ---------- validation ----------
  const validateOffer = () => {
    if (!form.label.trim()) return "Offer label required";

    const items = form.lineItems || [];
    if (!items.length) return "Add at least 1 line item";

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!String(it.title || "").trim()) return `Line item ${i + 1}: title required`;

      const unit = it.unit || "$";
      if (unit !== "special") {
        if (String(it.price || "").trim() === "") return `Line item ${i + 1}: price required`;
        if (Number.isNaN(Number(it.price))) return `Line item ${i + 1}: price must be a number`;
      }
    }

    if (form.bookingEnabled && !String(form.bookingLink || "").trim()) return "Booking link required";

    if (form.scheduleEnabled) {
      const ds = form.daySchedules || {};
      const activeDays = DAYS.filter((d) => ds[d.id]?.active);
      if (!activeDays.length) return "Select at least 1 active day";

      for (const d of activeDays) {
        const slots = ds[d.id]?.slots || [];
        const ok = slots.some((s) => (s.start || "").trim() && (s.end || "").trim());
        if (!ok) return `Add start & end time for ${d.label}`;
      }
    }

    return null;
  };

  const normalizeLineItems = (lineItems = []) =>
    (lineItems || []).map((it) => ({
      title: (it.title || "").trim(),
      price:
        (it.unit || "$") === "special"
          ? null
          : it.price === "" || it.price == null
          ? null
          : Number(it.price),
      unit: it.unit || "$",
      note: (it.note || "").trim(),
      highlight: !!it.highlight,
    }));

  // ---------- create/update ----------
  const addOffer = async () => {
    if (!dealId) return;
    const err = validateOffer();
    if (err) return alert(err);

    const order = offers.length ? Math.max(...offers.map((o) => o.order || 0)) + 1 : 1;

    await addDoc(collection(db, "deals", dealId, "offers"), {
      label: form.label.trim(),
      type: form.type,

      pricingMode: "multiple",
      lineItems: normalizeLineItems(form.lineItems),

      notes: form.notes.trim(),
      timeOverride: form.timeOverride.trim(),
      redemptionOverride: form.redemptionOverride.trim(),

      bookingEnabled: !!form.bookingEnabled,
      bookingLink: (form.bookingLink || "").trim(),
      bookingname: (form.bookingname || "").trim(),

      // ✅ Banner save (upload only)
      bannerUrl: (form.bannerUrl || "").trim(),
      bannerPath: (form.bannerPath || "").trim(),

      scheduleOverride,
      order,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    resetForm();
  };

  const startEdit = (offer) => {
    const sch = offer?.scheduleOverride || null;

    const nextDaySchedules = initDaySchedules(false);

    if (sch?.days && typeof sch.days === "object") {
      DAYS.forEach((d) => {
        const slots = Array.isArray(sch.days[d.id]) ? sch.days[d.id] : [];
        if (slots.length) {
          nextDaySchedules[d.id] = {
            active: true,
            slots: slots.map((s) => ({ start: s.start || "", end: s.end || "" })),
          };
        }
      });
    } else {
      const active = sch?.activeDays?.length ? sch.activeDays : [];
      const twStart = sch?.timeWindow?.start || "";
      const twEnd = sch?.timeWindow?.end || "";
      active.forEach((dayId) => {
        nextDaySchedules[dayId] = { active: true, slots: [{ start: twStart, end: twEnd }] };
      });
    }

    const hasSchedule =
      !!sch &&
      (sch.validFrom ||
        sch.validTo ||
        (sch.days && Object.keys(sch.days).length) ||
        (sch.activeDays && sch.activeDays.length));

    // pricing backward compat
    const hasLineItems = offer.lineItems?.length;
    const fallbackSingleToLineItem = () => {
      const unit = offer.unit || "$";
      if (unit === "special")
        return [{ title: offer.label || "Special", price: "", unit: "special", note: "", highlight: false }];
      if (offer.value == null)
        return [{ title: offer.label || "", price: "", unit: "$", note: "", highlight: false }];
      return [{ title: offer.label || "", price: String(offer.value), unit: unit || "$", note: "", highlight: false }];
    };

    setEditingOfferId(offer.id);
    setShowSchedule(!!hasSchedule);

    // open first active day (accordion)
    const firstActive = DAYS.find((d) => nextDaySchedules[d.id]?.active) || DAYS[0];
    setOpenDay(firstActive?.id || "mon");

    setForm({
      label: offer.label || "",
      type: offer.type || "fixed_price",
      lineItems: (hasLineItems ? offer.lineItems : fallbackSingleToLineItem()).map((it) => ({
        title: it.title || "",
        price: it.price == null ? "" : String(it.price),
        unit: it.unit || "$",
        note: it.note || "",
        highlight: !!it.highlight,
      })),
      notes: offer.notes || "",
      timeOverride: offer.timeOverride || "",
      redemptionOverride: offer.redemptionOverride || "",

      bookingEnabled: !!offer.bookingEnabled,
      bookingLink: offer.bookingLink || "",
      bookingname: offer.bookingname || "",

      // ✅ Banner load
      bannerUrl: offer.bannerUrl || "",
      bannerPath: offer.bannerPath || "",

      scheduleEnabled: !!hasSchedule,
      validFrom: sch?.validFrom || "",
      validTo: sch?.validTo || "",
      daySchedules: hasSchedule ? nextDaySchedules : initDaySchedules(true),
    });
  };

  const updateOffer = async () => {
    if (!dealId || !editingOfferId) return;
    const err = validateOffer();
    if (err) return alert(err);

    await updateDoc(doc(db, "deals", dealId, "offers", editingOfferId), {
      label: form.label.trim(),
      type: form.type,

      pricingMode: "multiple",
      lineItems: normalizeLineItems(form.lineItems),

      notes: form.notes.trim(),
      timeOverride: form.timeOverride.trim(),
      redemptionOverride: form.redemptionOverride.trim(),

      bookingEnabled: !!form.bookingEnabled,
      bookingLink: (form.bookingLink || "").trim(),
      bookingname: (form.bookingname || "").trim(),

      // ✅ Banner save (upload only)
      bannerUrl: (form.bannerUrl || "").trim(),
      bannerPath: (form.bannerPath || "").trim(),

      scheduleOverride,
      updatedAt: serverTimestamp(),
    });

    resetForm();
  };

  const removeOffer = async (offerId) => {
    const offer = offers.find((x) => x.id === offerId);
    const bannerPath = offer?.bannerPath;

    await deleteDoc(doc(db, "deals", dealId, "offers", offerId));
    if (bannerPath) await removeBannerFromStorage(bannerPath);

    if (editingOfferId === offerId) resetForm();
  };

  // ---------- table helpers ----------
  const renderPricingSummary = (o) => {
    const n = o.lineItems?.length || 0;
    return n ? `${n} items` : "—";
  };

  const renderLineItemsPreview = (o) => {
    const items = o.lineItems || [];
    if (!items.length) return <span className="text-gray-400">—</span>;
    const first = items[0];
    const firstText =
      first.unit === "special" || first.price == null
        ? `${first.title} (Special)`
        : `${first.title} — ${first.price}${first.unit || ""}`;
    const more = items.length - 1;
    return (
      <div className="text-xs text-gray-500">
        {firstText}
        {more > 0 ? ` +${more} more` : ""}
      </div>
    );
  };

  const renderScheduleSummary = (sch) => {
    if (!sch) return "—";
    if (sch.days && typeof sch.days === "object") {
      const dayKeys = Object.keys(sch.days || {}).filter((k) => (sch.days[k] || []).length);
      if (!dayKeys.length) return "—";
      const firstDay = dayKeys[0];
      const firstSlot = (sch.days[firstDay] || [])[0];
      const firstTxt =
        firstSlot?.start && firstSlot?.end ? `${firstDay.toUpperCase()} ${firstSlot.start}-${firstSlot.end}` : firstDay.toUpperCase();
      const moreDays = dayKeys.length - 1;
      return moreDays > 0 ? `${firstTxt} (+${moreDays}d)` : firstTxt;
    }
    if (sch.activeDays?.length && sch.timeWindow?.start && sch.timeWindow?.end) {
      const first = sch.activeDays[0];
      const txt = `${first.toUpperCase()} ${sch.timeWindow.start}-${sch.timeWindow.end}`;
      const more = sch.activeDays.length - 1;
      return more > 0 ? `${txt} (+${more}d)` : txt;
    }
    return "—";
  };

  const renderDaysShort = (sch) => {
    if (!sch) return "—";
    const dayKeys =
      sch?.days && typeof sch.days === "object"
        ? Object.keys(sch.days).filter((k) => (sch.days[k] || []).length)
        : sch?.activeDays || [];
    return (dayKeys || []).map((k) => DAYS_SHORT[k] || k).join("") || "—";
  };

  return (
    <div className="mt-6 space-y-3">
      <div>
        <div className="text-sm font-semibold text-gray-900">Offer Blocks</div>
        <div className="text-xs text-gray-500">Multi-price line items + optional schedule.</div>
      </div>

      {!dealId && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Create the deal first, then add offer blocks.
        </div>
      )}

      <div className={cardCls}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-gray-900">{editingOfferId ? "Edit Offer Block" : "Add Offer Block"}</div>

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
              value={form.label}
              onChange={set("label")}
              placeholder="Champagne Hour / Steak Night"
              disabled={!dealId || disabled}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600">Type</div>
            <select className={inputCls} value={form.type} onChange={set("type")} disabled={!dealId || disabled}>
              {(settingsOfferTypes?.length ? settingsOfferTypes : []).map((t) => (
                <option key={t.id} value={t.key || t.id || t.name?.toLowerCase()}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* ✅ Line Items */}
          <div className="md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-700">Line Items *</div>
              <button
                type="button"
                onClick={addLineItem}
                disabled={!dealId || disabled}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                + Add Line Item
              </button>
            </div>

            <div className="mt-2 space-y-2">
              {(form.lineItems || []).map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-12"
                >
                  <div className="md:col-span-5">
                    <div className="text-xs text-gray-600">Title *</div>
                    <input
                      className={inputCls}
                      value={it.title}
                      onChange={(e) => setLineItem(idx, "title", e.target.value)}
                      placeholder="Monopole Heidsieck – Glass"
                      disabled={!dealId || disabled}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600">Price</div>
                    <input
                      className={inputCls}
                      value={it.price}
                      onChange={(e) => setLineItem(idx, "price", e.target.value)}
                      placeholder="15"
                      disabled={!dealId || disabled || (it.unit || "$") === "special"}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600">Unit</div>
                    <select
                      className={inputCls}
                      value={it.unit || "$"}
                      onChange={(e) => {
                        const u = e.target.value;
                        setLineItem(idx, "unit", u);
                        if (u === "special") setLineItem(idx, "price", "");
                      }}
                      disabled={!dealId || disabled}
                    >
                      <option value="$">$</option>
                      <option value="%">%</option>
                      <option value="AUD">AUD</option>
                      <option value="special">SPECIAL (no price)</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <div className="text-xs text-gray-600">Note (optional)</div>
                    <input
                      className={inputCls}
                      value={it.note || ""}
                      onChange={(e) => setLineItem(idx, "note", e.target.value)}
                      placeholder="From $8 / Limited"
                      disabled={!dealId || disabled}
                    />
                  </div>

                  <div className="md:col-span-1 flex items-end justify-between gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!it.highlight}
                        onChange={(e) => setLineItem(idx, "highlight", e.target.checked)}
                        disabled={!dealId || disabled}
                      />
                      ⭐
                    </label>

                    <button
                      type="button"
                      onClick={() => removeLineItem(idx)}
                      disabled={!dealId || disabled || (form.lineItems || []).length <= 1}
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ✅ Upload Banner ONLY */}
          <div className="md:col-span-2">
            <div className="text-xs text-gray-600">Upload Banner (optional)</div>
            <input
              type="file"
              accept="image/*"
              onChange={onPickBanner}
              disabled={!dealId || disabled}
              className="block w-full text-sm"
            />

            {form.bannerUrl ? (
              <img
                src={form.bannerUrl}
                alt="Offer banner"
                className="mt-2 h-28 w-full rounded-xl object-cover border border-gray-200"
              />
            ) : null}
          </div>

          <div>
            <div className="text-xs text-gray-600">Time Override (optional)</div>
            <input
              className={inputCls}
              value={form.timeOverride}
              onChange={set("timeOverride")}
              placeholder="Only after 7pm"
              disabled={!dealId || disabled}
            />
          </div>

          <div>
            <div className="text-xs text-gray-600">Redemption Override (optional)</div>
            <input
              className={inputCls}
              value={form.redemptionOverride}
              onChange={set("redemptionOverride")}
              placeholder="QR only / Promo only"
              disabled={!dealId || disabled}
            />
          </div>

          {/* ✅ Booking (Offer-level) */}
          <div className="md:col-span-2 mt-2 rounded-xl border border-gray-200 bg-white p-3">
            <div className="text-sm font-semibold text-gray-900">Booking</div>
            <div className="mt-3 flex items-center gap-3">
              <input
                type="checkbox"
                checked={!!form.bookingEnabled}
                onChange={(e) => setForm((p) => ({ ...p, bookingEnabled: e.target.checked }))}
                disabled={!dealId || disabled}
                className="h-4 w-4 rounded"
              />
              <div className="text-sm text-gray-900">Enable booking link for this offer</div>
            </div>

            {form.bookingEnabled && (
              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div>
                  <div className="text-xs text-gray-600">Booking Link *</div>
                  <input
                    className={inputCls}
                    value={form.bookingLink}
                    onChange={(e) => setForm((p) => ({ ...p, bookingLink: e.target.value }))}
                    placeholder="https://..."
                    disabled={!dealId || disabled}
                  />
                </div>

                <div>
                  <div className="text-xs text-gray-600">Booking Name (optional)</div>
                  <input
                    className={inputCls}
                    value={form.bookingname}
                    onChange={(e) => setForm((p) => ({ ...p, bookingname: e.target.value }))}
                    placeholder="booking name shown to customers (e.g. 'Dinner Reservation')"
                    disabled={!dealId || disabled}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ✅ Schedule toggle */}
        <div className="mt-6 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Offer Schedule</div>
            <div className="text-xs text-gray-500">Accordion: click day to open.</div>
          </div>

          <button
            type="button"
            disabled={!dealId || disabled}
            onClick={() => {
              setShowSchedule((s) => !s);
              setForm((p) => ({ ...p, scheduleEnabled: !showSchedule ? true : false }));
              if (showSchedule) {
                setForm((p) => ({
                  ...p,
                  scheduleEnabled: false,
                  validFrom: "",
                  validTo: "",
                  daySchedules: initDaySchedules(true),
                }));
              }
            }}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
          >
            {showSchedule ? "Hide Offer Schedule" : "+ Add Offer Schedule"}
          </button>
        </div>

        {/* ✅ Collapsible Schedule */}
        {showSchedule && (
          <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-sm font-semibold text-gray-900">Schedule Details</div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs text-gray-600">Valid From (optional)</div>
                <input
                  type="date"
                  className={inputCls}
                  value={form.validFrom}
                  onChange={set("validFrom")}
                  disabled={!dealId || disabled}
                />
              </div>

              <div>
                <div className="text-xs text-gray-600">Valid To (optional)</div>
                <input
                  type="date"
                  className={inputCls}
                  value={form.validTo}
                  onChange={set("validTo")}
                  disabled={!dealId || disabled}
                />
              </div>
            </div>

            {/* ✅ Copy button */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-gray-600">Tip: Set Monday times then copy to all active days.</div>

              <button
                type="button"
                onClick={copyMondayToAll}
                disabled={!dealId || disabled}
                className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Copy Monday → All Active Days
              </button>
            </div>

            {/* ✅ Accordion days */}
            <div className="mt-4 space-y-2">
              {DAYS.map((d) => {
                const ds = form.daySchedules?.[d.id] || { active: false, slots: [{ start: "", end: "" }] };
                const active = !!ds.active;
                const open = openDay === d.id;
                const slots = ds.slots || [{ start: "", end: "" }];

                return (
                  <div
                    key={d.id}
                    className={`overflow-hidden rounded-2xl border ${
                      active ? "border-blue-200 bg-blue-50" : "border-gray-200 bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenDay((cur) => (cur === d.id ? null : d.id))}
                      disabled={!dealId || disabled}
                      className="w-full px-3 py-3 text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={active ? dayPillOn : dayPillOff}>{d.label}</span>
                          <span className="text-xs text-gray-600">{active ? "Active" : "Inactive"}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleDayActive(d.id);
                            }}
                            disabled={!dealId || disabled}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                              active
                                ? "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {active ? "Disable" : "Enable"}
                          </button>

                          <span className="text-gray-400">{open ? "▾" : "▸"}</span>
                        </div>
                      </div>
                    </button>

                    {open && (
                      <div className="border-t border-gray-200 bg-white px-3 py-3">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-gray-700">Time Slots (multiple allowed)</div>

                          <button
                            type="button"
                            onClick={() => addSlot(d.id)}
                            disabled={!dealId || disabled || !active}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
                          >
                            + Add Time
                          </button>
                        </div>

                        <div className="mt-3 space-y-2">
                          {slots.map((s, idx) => (
                            <div key={idx} className="grid grid-cols-1 gap-2 md:grid-cols-12">
                              <div className="md:col-span-5">
                                <div className="text-xs text-gray-600">Start</div>
                                <input
                                  type="time"
                                  className={inputCls}
                                  value={s.start}
                                  onChange={(e) => setSlot(d.id, idx, "start", e.target.value)}
                                  disabled={!dealId || disabled || !active}
                                />
                              </div>

                              <div className="md:col-span-5">
                                <div className="text-xs text-gray-600">End</div>
                                <input
                                  type="time"
                                  className={inputCls}
                                  value={s.end}
                                  onChange={(e) => setSlot(d.id, idx, "end", e.target.value)}
                                  disabled={!dealId || disabled || !active}
                                />
                              </div>

                              <div className="md:col-span-2 flex items-end justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeSlot(d.id, idx)}
                                  disabled={!dealId || disabled || !active || slots.length <= 1}
                                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs hover:bg-red-50 hover:border-red-200 hover:text-red-700 disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        {!active && <div className="mt-2 text-xs text-gray-500">Enable this day to edit times.</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

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

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="min-w-[1400px] w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr className="text-gray-600">
              <th className="p-3 font-semibold">Label</th>
              <th className="p-3 font-semibold">Type</th>
              <th className="p-3 font-semibold">Pricing</th>
              <th className="p-3 font-semibold">Schedule</th>
              <th className="p-3 font-semibold">Booking</th>
              <th className="p-3 font-semibold">Days</th>
              <th className="p-3 font-semibold w-44">Actions</th>
            </tr>
          </thead>

          <tbody>
            {offers.map((o) => {
              const sch = o.scheduleOverride || null;
              return (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className="p-3 font-semibold text-gray-900">{o.label}</td>
                  <td className="p-3 text-gray-700">{o.type}</td>

                  <td className="p-3 text-gray-700">
                    <div className="font-medium">{renderPricingSummary(o)}</div>
                    {renderLineItemsPreview(o)}
                  </td>

                  <td className="p-3 text-gray-600">{renderScheduleSummary(sch)}</td>
                  <td className="p-3 text-gray-600">{o.bookingEnabled && o.bookingLink ? "Enabled" : "—"}</td>
                  <td className="p-3 text-gray-600">{renderDaysShort(sch)}</td>

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