import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  onSnapshot,
  query as fsQuery,
  where,
  orderBy,
  deleteDoc,
} from "firebase/firestore";

import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage } from "../../firebase"; // ✅ adjust path
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import DealForm from "../Deals/DealForm"; // ✅ adjust path

/** ---------- Options ---------- */
const CUISINE_CATEGORIES = [
  "Food & entertainment",
  "Cafe",
  "Restaurant",
  "Bar",
  "Desserts",
  "Fast Food",
  "Asian",
  "Italian",
  "Indian",
  "Mexican",
];

const SERVICES = [
  "QR ordering",
  "Takeaway",
  "Valet",
  "Wifi",
  "Wine Tasting",
  "Live entertainment",
  "Family Friendly",
  "Dog friendly",
  "Wheel chair accessible",
  "Groups",
  "Playground",
  "Pool Table",
];

const BOOKING_TYPES = [
  { id: "email", label: "Email" },
  { id: "website", label: "Website" },
];

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const blankDay = () => ({ open: true, from: "00:00", to: "00:00" });

const defaults = {
  name: "",
  phone: "",
  email: "",
  abn: "",
  website: "",
  note: "",

  address: {
    line1: "",
    line2: "",
    city: "",
    state: "",
    postcode: "",
    lat: null,
    lng: null,
  },

  cuisineCategories: [],
  services: [],

  booking: { type: "email", value: "" },

  social: {
    instagram: "",
    facebook: "",
    x: "",
    tiktok: "",
    threads: "",
    tripAdvisor: "",
    youtube: "",
    snapchat: "",
    playstore: "",
    appstore: "",
  },

  customerCommunication: {
    contactNumber: "",
    contactEmail: "",
  },

  hours: {
    mode: "week", // week | custom
    week: {
      weekdays: { open: true, from: "00:00", to: "00:00" },
      weekend: { open: true, from: "00:00", to: "00:00" },
    },
    custom: {
      sunday: blankDay(),
      monday: blankDay(),
      tuesday: blankDay(),
      wednesday: blankDay(),
      thursday: blankDay(),
      friday: blankDay(),
      saturday: blankDay(),
    },
  },

  media: {
    portraitUrl: "",
    portraitPath: "",
    bannerUrl: "",
    bannerPath: "",
  },

  billing: {
    sameAsEmail: false,
    sameAsPhone: false,
    email: "",
    phone: "",
    address: { line1: "", line2: "", postcode: "", city: "", state: "" },
  },
};

/** ---------- UI helpers ---------- */
function Section({ title, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <div
            className={`h-5 w-5 rounded-full border ${
              open ? "bg-black border-black" : "bg-white border-gray-300"
            }`}
          />
          <div className="text-base font-semibold text-gray-900">{title}</div>
        </div>
        <div className="text-gray-600">{open ? "▴" : "▾"}</div>
      </button>

      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const selectCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

export default function BusinessPage({ navbarHeight }) {
  const { id } = useParams(); // /admin/businesses/:id  or /admin/businesses/new
  const navigate = useNavigate();

  const isEdit = !!id && id !== "new";

  const [v, setV] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [open, setOpen] = useState({
    details: true,
    customer: false,
    bookings: false,
    hours: false,
    social: false,
    billing: false,
    media: false,
  });

  // Deals states
  const [bizDeals, setBizDeals] = useState([]);
  const [openDealModal, setOpenDealModal] = useState(false);
  const [dealSaving, setDealSaving] = useState(false);
  const [dealDeleteId, setDealDeleteId] = useState(null);

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  /** ---------- Load business ---------- */
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!isEdit) {
          if (alive) setLoading(false);
          return;
        }

        const snap = await getDoc(doc(db, "businesses", id));
        if (!snap.exists()) {
          toast.error("Business not found");
          if (alive) setLoading(false);
          return;
        }

        const data = snap.data();
        if (!alive) return;

        setV((p) => ({
          ...p,
          ...data,
          address: { ...defaults.address, ...(data.address || {}) },
          booking: { ...defaults.booking, ...(data.booking || {}) },
          social: { ...defaults.social, ...(data.social || {}) },
          customerCommunication: {
            ...defaults.customerCommunication,
            ...(data.customerCommunication || {}),
          },
          hours: {
            ...defaults.hours,
            ...(data.hours || {}),
            week: { ...defaults.hours.week, ...(data.hours?.week || {}) },
            custom: { ...defaults.hours.custom, ...(data.hours?.custom || {}) },
          },
          billing: {
            ...defaults.billing,
            ...(data.billing || {}),
            address: { ...defaults.billing.address, ...(data.billing?.address || {}) },
          },
          media: { ...defaults.media, ...(data.media || {}) },
        }));

        setLoading(false);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load business");
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, isEdit]);

  /** ---------- Load deals for this business ---------- */
  useEffect(() => {
    if (!isEdit) return;

    const qy = fsQuery(
      collection(db, "deals"),
      where("businessId", "==", id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(qy, (snap) => {
      setBizDeals(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => unsub();
  }, [isEdit, id]);

  /** ---------- Setters ---------- */
  const set = (key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setV((p) => ({ ...p, [key]: val }));
  };

  const setAddress = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({ ...p, address: { ...(p.address || {}), [key]: val } }));
  };

  const setBooking = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({ ...p, booking: { ...(p.booking || {}), [key]: val } }));
  };

  const setSocial = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({ ...p, social: { ...(p.social || {}), [key]: val } }));
  };

  const setCustomer = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({
      ...p,
      customerCommunication: { ...(p.customerCommunication || {}), [key]: val },
    }));
  };

  const setBilling = (key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setV((p) => ({ ...p, billing: { ...(p.billing || {}), [key]: val } }));
  };

  const setBillingAddr = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({
      ...p,
      billing: {
        ...(p.billing || {}),
        address: { ...((p.billing || {}).address || {}), [key]: val },
      },
    }));
  };

  const toggleArray = (path, item) => {
    setV((p) => {
      const arr = (path === "services" ? p.services : p.cuisineCategories) || [];
      const has = arr.includes(item);
      const next = has ? arr.filter((x) => x !== item) : [...arr, item];
      return { ...p, [path]: next };
    });
  };

  /** ---------- Hours ---------- */
  const setHoursMode = (mode) =>
    setV((p) => ({ ...p, hours: { ...(p.hours || {}), mode } }));

  const setWeekHours = (bucket, key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setV((p) => ({
      ...p,
      hours: {
        ...(p.hours || {}),
        week: {
          ...(p.hours?.week || {}),
          [bucket]: { ...(p.hours?.week?.[bucket] || {}), [key]: val },
        },
      },
    }));
  };

  const setCustomHours = (day, key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setV((p) => ({
      ...p,
      hours: {
        ...(p.hours || {}),
        custom: {
          ...(p.hours?.custom || {}),
          [day]: { ...(p.hours?.custom?.[day] || {}), [key]: val },
        },
      },
    }));
  };

  /** ---------- Media uploads ---------- */
  const uploadImage = async (file, folder) => {
    const path = `${folder}/${Date.now()}_${file.name}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    return { url, path };
  };

  const onPickPortrait = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.info("Uploading portrait...");
      const res = await uploadImage(file, "businesses/portrait");
      setV((p) => ({
        ...p,
        media: { ...(p.media || {}), portraitUrl: res.url, portraitPath: res.path },
      }));
      toast.success("Portrait uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Portrait upload failed");
    }
  };

  const onPickBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.info("Uploading banner...");
      const res = await uploadImage(file, "businesses/banner");
      setV((p) => ({
        ...p,
        media: { ...(p.media || {}), bannerUrl: res.url, bannerPath: res.path },
      }));
      toast.success("Banner uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Banner upload failed");
    }
  };

  /** ---------- Save business ---------- */
  const payload = useMemo(() => {
    const billingEmail = v.billing?.sameAsEmail ? (v.email || "") : (v.billing?.email || "");
    const billingPhone = v.billing?.sameAsPhone ? (v.phone || "") : (v.billing?.phone || "");

    return {
      name: v.name?.trim() || "",
      phone: v.phone?.trim() || "",
      email: v.email?.trim() || "",
      abn: v.abn?.trim() || "",
      website: v.website?.trim() || "",
      note: v.note?.trim() || "",

      address: {
        line1: v.address?.line1 || "",
        line2: v.address?.line2 || "",
        city: v.address?.city || "",
        state: v.address?.state || "",
        postcode: v.address?.postcode || "",
        lat: v.address?.lat ?? null,
        lng: v.address?.lng ?? null,
      },

      cuisineCategories: v.cuisineCategories || [],
      services: v.services || [],

      booking: { type: v.booking?.type || "email", value: v.booking?.value || "" },

      customerCommunication: {
        contactNumber: v.customerCommunication?.contactNumber || "",
        contactEmail: v.customerCommunication?.contactEmail || "",
      },

      social: { ...(v.social || {}) },

      hours: {
        mode: v.hours?.mode || "week",
        week: {
          weekdays: { ...(v.hours?.week?.weekdays || blankDay()) },
          weekend: { ...(v.hours?.week?.weekend || blankDay()) },
        },
        custom: {
          ...DAYS.reduce((acc, d) => {
            acc[d] = { ...(v.hours?.custom?.[d] || blankDay()) };
            return acc;
          }, {}),
        },
      },

      media: { ...(v.media || {}) },

      billing: {
        sameAsEmail: !!v.billing?.sameAsEmail,
        sameAsPhone: !!v.billing?.sameAsPhone,
        email: billingEmail,
        phone: billingPhone,
        address: {
          line1: v.billing?.address?.line1 || "",
          line2: v.billing?.address?.line2 || "",
          postcode: v.billing?.address?.postcode || "",
          city: v.billing?.address?.city || "",
          state: v.billing?.address?.state || "",
        },
      },

      updatedAt: serverTimestamp(),
    };
  }, [v]);

  const onSave = async () => {
    if (!v.name.trim()) return toast.error("Business name is required");
    if (!v.email.trim()) return toast.error("Email is required");

    setSaving(true);
    try {
      if (isEdit) {
        await updateDoc(doc(db, "businesses", id), payload);
        toast.success("Saved ✅");
        navigate("/admin/businesses");
      } else {
        const ref = await addDoc(collection(db, "businesses"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Created ✅");
        navigate(`/admin/businesses/${ref.id}`);
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** ---------- Create deal for this business ---------- */
  const createDealForThisBusiness = async (values) => {
    if (!isEdit) {
      toast.error("Create business first, then add deals.");
      return;
    }

    setDealSaving(true);
    try {
      let imageUrl = values.imageUrl || "";
      let imagePath = "";

      if (values.imageFile) {
        imagePath = `deals/${id}/${Date.now()}_${values.imageFile.name}`;
        const r = storageRef(storage, imagePath);
        await uploadBytes(r, values.imageFile);
        imageUrl = await getDownloadURL(r);
      }

      const dealPayload = {
        businessId: id,
        businessName: v.name || "",
        businessAddress: [v.address?.line1, v.address?.city, v.address?.state]
          .filter(Boolean)
          .join(", "),
        businessLat: v.address?.lat ?? null,
        businessLng: v.address?.lng ?? null,

        dealType: values.dealType,
        header: values.header?.trim() || "",
        slot: values.slot || "",
        mapIcon: values.mapIcon || "",
        descriptionHtml: values.descriptionHtml || "",
        bookingLink: values.bookingLink || "",

        offerType: values.offerType || "free",
        priceValue: values.priceValue ?? null,
        discountPercent: values.discountPercent ?? null,
        daysActive: values.daysActive || [],

        imageUrl: imageUrl || "",
        imagePath: imagePath || "",

        featured: !!values.featured,
        active: !!values.active,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "deals"), dealPayload);
      toast.success("Deal created ✅");
      setOpenDealModal(false);
    } catch (e) {
      console.error(e);
      toast.error("Create deal failed");
    } finally {
      setDealSaving(false);
    }
  };

  /** ---------- UI ---------- */
  if (loading) {
    return (
      <main className="flex-1 p-6 bg-gray-100" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="flex items-center justify-center h-64">
          <FadeLoader color="#111827" loading />
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Businesses</h1>
          <p className="text-sm text-gray-500">{isEdit ? "Edit Business" : "Create new business"}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin/businesses")}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>

          <button
            onClick={onSave}
            className="rounded-xl bg-yellow-300 px-5 py-2 text-sm font-semibold text-gray-900 hover:opacity-90 disabled:opacity-60"
            disabled={saving}
          >
            {saving ? "Saving..." : "Save & Exit"}
          </button>
        </div>
      </div>

      <div className="space-y-4 max-w-5xl">
        {/* Details */}
        <Section title="Details" open={open.details} onToggle={() => toggleOpen("details")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Name of Business *</label>
              <input value={v.name} onChange={set("name")} className={inputCls} placeholder="Nandos" />
            </div>

            <div>
              <label className={labelCls}>Phone Number</label>
              <input value={v.phone} onChange={set("phone")} className={inputCls} placeholder="0466..." />
            </div>

            <div>
              <label className={labelCls}>Email *</label>
              <input value={v.email} onChange={set("email")} className={inputCls} placeholder="email@domain.com" />
            </div>

            <div>
              <label className={labelCls}>ABN</label>
              <input value={v.abn} onChange={set("abn")} className={inputCls} placeholder="20079066407" />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Website</label>
              <input value={v.website} onChange={set("website")} className={inputCls} placeholder="https://..." />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Address Line 1</label>
              <input value={v.address.line1} onChange={setAddress("line1")} className={inputCls} placeholder="Address 1" />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Address Line 2</label>
              <input value={v.address.line2} onChange={setAddress("line2")} className={inputCls} placeholder="Address 2" />
            </div>

            <div>
              <label className={labelCls}>City</label>
              <input value={v.address.city} onChange={setAddress("city")} className={inputCls} placeholder="Melbourne" />
            </div>

            <div>
              <label className={labelCls}>State</label>
              <input value={v.address.state} onChange={setAddress("state")} className={inputCls} placeholder="VIC" />
            </div>

            <div>
              <label className={labelCls}>Postcode</label>
              <input value={v.address.postcode} onChange={setAddress("postcode")} className={inputCls} placeholder="3168" />
            </div>

            <div>
              <label className={labelCls}>Lat (optional)</label>
              <input
                value={v.address.lat ?? ""}
                onChange={(e) =>
                  setV((p) => ({
                    ...p,
                    address: { ...p.address, lat: e.target.value === "" ? null : Number(e.target.value) },
                  }))
                }
                className={inputCls}
                placeholder="-37.8136"
              />
            </div>

            <div>
              <label className={labelCls}>Lng (optional)</label>
              <input
                value={v.address.lng ?? ""}
                onChange={(e) =>
                  setV((p) => ({
                    ...p,
                    address: { ...p.address, lng: e.target.value === "" ? null : Number(e.target.value) },
                  }))
                }
                className={inputCls}
                placeholder="144.9631"
              />
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Note</label>
              <input value={v.note} onChange={set("note")} className={inputCls} placeholder="Optional note..." />
            </div>
          </div>

          {/* Cuisine/Category chips */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className={labelCls}>Cuisine/Category (select up to 5)</div>
              <div className="text-xs text-gray-500">{(v.cuisineCategories || []).length}/5</div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {CUISINE_CATEGORIES.map((c) => {
                const on = (v.cuisineCategories || []).includes(c);
                const disabled = !on && (v.cuisineCategories || []).length >= 5;
                return (
                  <button
                    key={c}
                    type="button"
                    disabled={disabled}
                    onClick={() => !disabled && toggleArray("cuisineCategories", c)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm",
                      on ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50",
                      disabled ? "opacity-40 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    {c} {on ? "×" : ""}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Services chips */}
          <div className="mt-6">
            <div className={labelCls}>Services (select multiple)</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {SERVICES.map((s) => {
                const on = (v.services || []).includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleArray("services", s)}
                    className={[
                      "rounded-full border px-3 py-1.5 text-sm",
                      on ? "bg-gray-100 border-gray-300 text-gray-900" : "bg-white border-gray-200 text-gray-900 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    {s} {on ? "×" : ""}
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* Customer Communication */}
        <Section title="Customer Communication" open={open.customer} onToggle={() => toggleOpen("customer")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Contact Number</label>
              <input
                value={v.customerCommunication.contactNumber}
                onChange={setCustomer("contactNumber")}
                className={inputCls}
                placeholder="Contact Number"
              />
            </div>
            <div>
              <label className={labelCls}>Contact Email</label>
              <input
                value={v.customerCommunication.contactEmail}
                onChange={setCustomer("contactEmail")}
                className={inputCls}
                placeholder="Contact Email"
              />
            </div>
          </div>
        </Section>

        {/* Bookings */}
        <Section title="Bookings" open={open.bookings} onToggle={() => toggleOpen("bookings")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Booking System</label>
              <select value={v.booking.type} onChange={setBooking("type")} className={selectCls}>
                {BOOKING_TYPES.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-xs text-gray-500">If you don’t have booking platform, use Email.</div>
            </div>

            <div>
              <label className={labelCls}>{v.booking.type === "email" ? "Booking Email" : "Booking URL"}</label>
              <input
                value={v.booking.value}
                onChange={setBooking("value")}
                className={inputCls}
                placeholder={v.booking.type === "email" ? "bookings@domain.com" : "https://..."}
              />
            </div>
          </div>
        </Section>

        {/* Business Hours */}
        <Section title="Business Hours" open={open.hours} onToggle={() => toggleOpen("hours")}>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setHoursMode("week")}
              className={[
                "rounded-xl px-5 py-2 text-sm font-semibold border",
                v.hours.mode === "week"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-gray-100 text-gray-900 border-gray-200",
              ].join(" ")}
            >
              Week
            </button>

            <button
              type="button"
              onClick={() => setHoursMode("custom")}
              className={[
                "rounded-xl px-5 py-2 text-sm font-semibold border",
                v.hours.mode === "custom"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-gray-100 text-gray-900 border-gray-200",
              ].join(" ")}
            >
              Custom
            </button>
          </div>

          {v.hours.mode === "week" && (
            <div className="mt-4 space-y-4">
              {/* Weekdays */}
              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">Week days</div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-700">Open</span>
                    <input
                      type="checkbox"
                      checked={!!v.hours.week.weekdays.open}
                      onChange={setWeekHours("weekdays", "open")}
                      className="h-5 w-10 accent-green-600"
                    />
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div>
                    <label className="text-xs text-gray-500">From</label>
                    <input type="time" value={v.hours.week.weekdays.from} onChange={setWeekHours("weekdays", "from")} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">To</label>
                    <input type="time" value={v.hours.week.weekdays.to} onChange={setWeekHours("weekdays", "to")} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Weekend */}
              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">Week end</div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-700">Open</span>
                    <input
                      type="checkbox"
                      checked={!!v.hours.week.weekend.open}
                      onChange={setWeekHours("weekend", "open")}
                      className="h-5 w-10 accent-green-600"
                    />
                  </label>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div>
                    <label className="text-xs text-gray-500">From</label>
                    <input type="time" value={v.hours.week.weekend.from} onChange={setWeekHours("weekend", "from")} className={inputCls} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">To</label>
                    <input type="time" value={v.hours.week.weekend.to} onChange={setWeekHours("weekend", "to")} className={inputCls} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {v.hours.mode === "custom" && (
            <div className="mt-4 space-y-3">
              {DAYS.map((d) => (
                <div key={d} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-gray-900 capitalize">{d}</div>
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-gray-700">Open</span>
                      <input
                        type="checkbox"
                        checked={!!v.hours.custom[d].open}
                        onChange={setCustomHours(d, "open")}
                        className="h-5 w-10 accent-green-600"
                      />
                    </label>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div>
                      <label className="text-xs text-gray-500">From</label>
                      <input type="time" value={v.hours.custom[d].from} onChange={setCustomHours(d, "from")} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">To</label>
                      <input type="time" value={v.hours.custom[d].to} onChange={setCustomHours(d, "to")} className={inputCls} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Social Media */}
        <Section title="Social Media" open={open.social} onToggle={() => toggleOpen("social")}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Object.keys(v.social).map((k) => (
              <div key={k}>
                <label className={labelCls}>{k}</label>
                <input value={v.social[k] || ""} onChange={setSocial(k)} className={inputCls} placeholder={`${k} link`} />
              </div>
            ))}
          </div>
        </Section>

        {/* Media */}
        <Section title="Media" open={open.media} onToggle={() => toggleOpen("media")}>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Portrait Thumbnail</div>
              <div className="mt-3">
                <input type="file" accept="image/*" onChange={onPickPortrait} className="text-sm" />
              </div>
              {v.media.portraitUrl && (
                <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                  <img src={v.media.portraitUrl} alt="" className="h-44 w-full object-cover" />
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-900">Banner Landscape</div>
              <div className="mt-3">
                <input type="file" accept="image/*" onChange={onPickBanner} className="text-sm" />
              </div>
              {v.media.bannerUrl && (
                <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                  <img src={v.media.bannerUrl} alt="" className="h-44 w-full object-cover" />
                </div>
              )}
            </div>
          </div>
        </Section>

        {/* Billing Address */}
        <Section title="Billing Address" open={open.billing} onToggle={() => toggleOpen("billing")}>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-gray-900">Billing Address</h3>

            <div className="mt-5">
              <label className={labelCls}>Billing Email (optional)</label>
              <input
                className={inputCls}
                value={v.billing?.sameAsEmail ? (v.email || "") : (v.billing?.email || "")}
                disabled={!!v.billing?.sameAsEmail}
                onChange={setBilling("email")}
                placeholder="billing@email.com"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={!!v.billing?.sameAsEmail}
                  onChange={(e) => setV((p) => ({
                    ...p,
                    billing: { ...(p.billing || {}), sameAsEmail: e.target.checked, email: e.target.checked ? (p.email || "") : (p.billing?.email || "") }
                  }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Same as profile email
              </label>
            </div>

            <div className="mt-5">
              <label className={labelCls}>Billing Phone (optional)</label>
              <input
                className={inputCls}
                value={v.billing?.sameAsPhone ? (v.phone || "") : (v.billing?.phone || "")}
                disabled={!!v.billing?.sameAsPhone}
                onChange={setBilling("phone")}
                placeholder="billing phone"
              />
              <label className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                <input
                  type="checkbox"
                  checked={!!v.billing?.sameAsPhone}
                  onChange={(e) => setV((p) => ({
                    ...p,
                    billing: { ...(p.billing || {}), sameAsPhone: e.target.checked, phone: e.target.checked ? (p.phone || "") : (p.billing?.phone || "") }
                  }))}
                  className="h-4 w-4 rounded border-gray-300"
                />
                Same as profile phone
              </label>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelCls}>Address Line 1</label>
                <input className={inputCls} value={v.billing?.address?.line1 || ""} onChange={setBillingAddr("line1")} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Address Line 2</label>
                <input className={inputCls} value={v.billing?.address?.line2 || ""} onChange={setBillingAddr("line2")} />
              </div>
              <div>
                <label className={labelCls}>Postcode</label>
                <input className={inputCls} value={v.billing?.address?.postcode || ""} onChange={setBillingAddr("postcode")} />
              </div>
              <div>
                <label className={labelCls}>City</label>
                <input className={inputCls} value={v.billing?.address?.city || ""} onChange={setBillingAddr("city")} />
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>State</label>
                <input className={inputCls} value={v.billing?.address?.state || ""} onChange={setBillingAddr("state")} />
              </div>
            </div>
          </div>
        </Section>

        {/* ✅ Deals of this business */}
        {isEdit && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Deals of this Business</h3>
                <p className="text-xs text-gray-500">Create offers linked to this business.</p>
              </div>

              <button
                onClick={() => setOpenDealModal(true)}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                + Add Deal
              </button>
            </div>

            <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-[750px] w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="p-3 font-semibold">Offer</th>
                    <th className="p-3 font-semibold">Slot</th>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold">Active</th>
                    <th className="p-3 font-semibold w-40">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bizDeals.map((d) => (
                    <tr key={d.id} className="border-t border-gray-100">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <img
                            className="h-10 w-16 rounded-xl object-cover border border-gray-100"
                            src={d.imageUrl || "https://via.placeholder.com/160x96"}
                            alt=""
                          />
                          <div className="min-w-0">
                            <div className="font-semibold text-gray-900 truncate">{d.header || "—"}</div>
                            <div className="text-xs text-gray-500 truncate">{d.dealType || "—"}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-gray-700">{d.slot || "—"}</td>
                      <td className="p-3 text-gray-700">{d.offerType || "—"}</td>
                      <td className="p-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            d.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {d.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <a
                            className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                            href={`/admin/deals/${d.id}`}
                          >
                            Edit
                          </a>
                          <button
                            className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                            onClick={() => setDealDeleteId(d.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {bizDeals.length === 0 && (
                    <tr>
                      <td className="p-6 text-gray-500" colSpan={5}>
                        No deals created for this business yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ✅ Add Deal Modal */}
      {openDealModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add Deal</h2>
                <p className="text-xs text-gray-500">Linked to: {v.name}</p>
              </div>
              <button
                onClick={() => !dealSaving && setOpenDealModal(false)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-5 max-h-[75vh] overflow-auto">
              <DealForm
                initialValues={{}}
                onSubmit={createDealForThisBusiness}
                loading={dealSaving}
                submitText="Create Deal"
              />
            </div>
          </div>
        </div>
      )}

      {/* ✅ Deal Delete Modal */}
      {dealDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">Delete Deal?</h3>
              <p className="mt-2 text-sm text-gray-500">This action cannot be undone.</p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDealDeleteId(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  onClick={async () => {
                    try {
                      await deleteDoc(doc(db, "deals", dealDeleteId));
                      toast.success("Deleted ✅");
                      setDealDeleteId(null);
                    } catch (e) {
                      console.error(e);
                      toast.error("Delete failed");
                    }
                  }}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
