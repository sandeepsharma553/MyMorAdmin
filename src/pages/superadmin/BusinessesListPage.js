import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";

import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import DealForm from "./DealForm"; // ✅ adjust path

/** ---------------- Defaults ---------------- */
const blankDay = () => ({ open: true, from: "00:00", to: "00:00" });
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const defaults = {
  name: "",
  phone: "",
  email: "",
  abn: "",
  website: "",
  note: "",

  address: { line1: "", line2: "", city: "", state: "", postcode: "", lat: null, lng: null },

  booking: { type: "email", value: "" },

  customerCommunication: { contactNumber: "", contactEmail: "" },

  hours: {
    mode: "week",
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

  media: { portraitUrl: "", portraitPath: "", bannerUrl: "", bannerPath: "" },

  billing: {
    sameAsEmail: false,
    sameAsPhone: false,
    email: "",
    phone: "",
    address: { line1: "", line2: "", postcode: "", city: "", state: "" },
  },
};

const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const selectCls = inputCls;

/** ---------------- Helpers ---------------- */
function Section({ title, open, onToggle, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <div className={`h-5 w-5 rounded-full border ${open ? "bg-black border-black" : "bg-white border-gray-300"}`} />
          <div className="text-base font-semibold text-gray-900">{title}</div>
        </div>
        <div className="text-gray-600">{open ? "▴" : "▾"}</div>
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

const uniquePath = (folder, file) => {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const base = file.name.replace(/\.[^/.]+$/, "");
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${folder}/${base}_${stamp}.${ext}`;
};

async function uploadImage(file, folder) {
  const path = uniquePath(folder, file);
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, path };
}

/** ---------------- Page ---------------- */
export default function BusinessesAndDealsPage({ navbarHeight }) {
  // list
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  // business modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingBiz, setEditingBiz] = useState(null); // {id,...} | null
  const [saving, setSaving] = useState(false);

  // delete business modal
  const [deleteBizId, setDeleteBizId] = useState(null);

  // business form
  const [v, setV] = useState(defaults);

  // advanced sections toggle
  const [open, setOpen] = useState({
    details: true,
    hours: false,
    billing: false,
    media: false,
    deals: true,
  });

  // deals for selected business (inside business modal)
  const [bizDeals, setBizDeals] = useState([]);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealEditing, setDealEditing] = useState(null); // deal object | null
  const [dealSaving, setDealSaving] = useState(false);
  const [dealDeleteId, setDealDeleteId] = useState(null);

  /** ---------- Load businesses list ---------- */
  useEffect(() => {
    const qy = query(collection(db, "businesses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load businesses");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  /** ---------- Search filter ---------- */
  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [r.name, r.email, r.phone, r.address?.city, r.address?.state, r.address?.postcode]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [rows, qText]);

  /** ---------- Load deals when business modal opened & has id ---------- */
  useEffect(() => {
    if (!modalOpen) return;
    if (!editingBiz?.id) {
      setBizDeals([]);
      return;
    }

    const qy = query(
      collection(db, "deals"),
      where("businessId", "==", editingBiz.id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(
      qy,
      (snap) => setBizDeals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => {
        console.error(err);
        toast.error("Failed to load deals");
      }
    );

    return () => unsub();
  }, [modalOpen, editingBiz?.id]);

  /** ---------- Open modal: create ---------- */
  const openCreate = () => {
    setEditingBiz(null);
    setV(defaults);
    setOpen({ details: true, hours: false, billing: false, media: false, deals: true });
    setBizDeals([]);
    setModalOpen(true);
  };

  /** ---------- Open modal: edit ---------- */
  const openEdit = (b) => {
    setEditingBiz(b);
    const data = b || {};
    setV({
      ...defaults,
      ...data,
      address: { ...defaults.address, ...(data.address || {}) },
      booking: { ...defaults.booking, ...(data.booking || {}) },
      customerCommunication: { ...defaults.customerCommunication, ...(data.customerCommunication || {}) },
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
    });
    setOpen({ details: true, hours: false, billing: false, media: false, deals: true });
    setModalOpen(true);
  };

  /** ---------- Setters ---------- */
  const set = (key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setV((p) => ({ ...p, [key]: val }));
  };

  const setAddress = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({ ...p, address: { ...(p.address || {}), [key]: val } }));
  };

  const setBilling = (key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setV((p) => ({ ...p, billing: { ...(p.billing || {}), [key]: val } }));
  };

  const setBillingAddr = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setV((p) => ({
      ...p,
      billing: { ...(p.billing || {}), address: { ...((p.billing || {}).address || {}), [key]: val } },
    }));
  };

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  /** ---------- Hours setters ---------- */
  const setHoursMode = (mode) => setV((p) => ({ ...p, hours: { ...(p.hours || {}), mode } }));

  const setWeekHours = (bucket, key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
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
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
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

  /** ---------- Upload media ---------- */
  const onPickPortrait = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading portrait...");
      const res = await uploadImage(file, "businesses/portrait");
      setV((p) => ({ ...p, media: { ...(p.media || {}), portraitUrl: res.url, portraitPath: res.path } }));
      toast.success("Portrait uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  const onPickBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading banner...");
      const res = await uploadImage(file, "businesses/banner");
      setV((p) => ({ ...p, media: { ...(p.media || {}), bannerUrl: res.url, bannerPath: res.path } }));
      toast.success("Banner uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  /** ---------- Save business (create/update) ---------- */
  const onSaveBusiness = async () => {
    if (!v.name.trim()) return toast.error("Business name is required");
    if (!v.email.trim()) return toast.error("Email is required");

    setSaving(true);
    try {
      const billingEmail = v.billing?.sameAsEmail ? (v.email || "") : (v.billing?.email || "");
      const billingPhone = v.billing?.sameAsPhone ? (v.phone || "") : (v.billing?.phone || "");

      const payload = {
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

        customerCommunication: {
          contactNumber: v.customerCommunication?.contactNumber || "",
          contactEmail: v.customerCommunication?.contactEmail || "",
        },

        hours: {
          mode: v.hours?.mode || "week",
          week: {
            weekdays: { ...(v.hours?.week?.weekdays || blankDay()) },
            weekend: { ...(v.hours?.week?.weekend || blankDay()) },
          },
          custom: DAYS.reduce((acc, d) => {
            acc[d] = { ...(v.hours?.custom?.[d] || blankDay()) };
            return acc;
          }, {}),
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

      // ✅ create
      if (!editingBiz?.id) {
        const ref = await addDoc(collection(db, "businesses"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Business created ✅");

        // IMPORTANT: modal same page, so set editingBiz now (so you can add deals)
        const newBiz = { id: ref.id, ...payload };
        setEditingBiz(newBiz);
      } else {
        // ✅ update
        await updateDoc(doc(db, "businesses", editingBiz.id), payload);
        toast.success("Business saved ✅");
        setEditingBiz((p) => ({ ...(p || {}), ...payload, id: editingBiz.id }));
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** ---------- Delete business ---------- */
  const confirmDeleteBusiness = async () => {
    if (!deleteBizId) return;
    try {
      await deleteDoc(doc(db, "businesses", deleteBizId));
      toast.success("Business deleted ✅");
      setDeleteBizId(null);
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  /** ---------- Deals: create/update for selected business ---------- */
  const saveDealForBusiness = async (values) => {
    if (!editingBiz?.id) {
      toast.error("Create business first, then add deals.");
      return;
    }

    setDealSaving(true);
    try {
      let imageUrl = values.imageUrl || "";
      let imagePath = "";

      if (values.imageFile) {
        imagePath = `deals/${editingBiz.id}/${Date.now()}_${values.imageFile.name}`;
        const r = storageRef(storage, imagePath);
        await uploadBytes(r, values.imageFile);
        imageUrl = await getDownloadURL(r);
      }

      const dealPayload = {
        businessId: editingBiz.id,
        businessName: v.name || "",
        businessAddress: [v.address?.line1, v.address?.city, v.address?.state].filter(Boolean).join(", "),
        businessLat: v.address?.lat ?? null,
        businessLng: v.address?.lng ?? null,

        // new (app style)
        dealType: values.dealType || "",
        header: values.header?.trim() || "",
        slot: values.slot || "",
        mapIcon: values.mapIcon || "",
        descriptionHtml: values.descriptionHtml || "",
        bookingLink: values.bookingLink?.trim() || "",
        offerType: values.offerType || "free",
        priceValue: values.priceValue ?? null,
        discountPercent: values.discountPercent ?? null,
        daysActive: values.daysActive || [],

        // compat
        title: values.title?.trim() || values.header?.trim() || "",
        subtitle: values.subtitle?.trim() || "",
        categoryId: values.categoryId || "food",
        categoryLabel: values.categoryLabel || "",
        featured: !!values.featured,
        active: !!values.active,

        validFrom: values.validFrom || "",
        validTo: values.validTo || "",
        daysLeft: typeof values.daysLeft === "number" ? values.daysLeft : null,

        // billing/content/terms etc
        terms: values.terms?.trim() || "",
        address: values.address?.trim() || "",
        lat: typeof values.lat === "number" ? values.lat : null,
        lng: typeof values.lng === "number" ? values.lng : null,

        imageUrl: imageUrl || "",
        imagePath: imagePath || "",

        updatedAt: serverTimestamp(),
      };

      if (dealEditing?.id) {
        await updateDoc(doc(db, "deals", dealEditing.id), dealPayload);
        toast.success("Deal updated ✅");
      } else {
        await addDoc(collection(db, "deals"), { ...dealPayload, createdAt: serverTimestamp() });
        toast.success("Deal created ✅");
      }

      setDealModalOpen(false);
      setDealEditing(null);
    } catch (e) {
      console.error(e);
      toast.error("Save deal failed");
    } finally {
      setDealSaving(false);
    }
  };

  const confirmDeleteDeal = async () => {
    if (!dealDeleteId) return;
    try {
      await deleteDoc(doc(db, "deals", dealDeleteId));
      toast.success("Deal deleted ✅");
      setDealDeleteId(null);
    } catch (e) {
      console.error(e);
      toast.error("Delete deal failed");
    }
  };

  /** ---------------- UI ---------------- */
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Businesses</h1>
          <p className="text-sm text-gray-500">List + Add/Edit (Advanced) + Deals — all in one page.</p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add Business
        </button>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-3">
        <input
          className="w-full sm:w-96 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
          placeholder="Search businesses..."
          value={qText}
          onChange={(e) => setQText(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-56">
            <FadeLoader color="#111827" loading />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3 font-semibold">Business</th>
                <th className="p-3 font-semibold">Location</th>
                <th className="p-3 font-semibold">Contact</th>
                <th className="p-3 font-semibold w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id} className="border-t border-gray-100">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        className="h-12 w-12 rounded-xl object-cover border border-gray-100"
                        src={b.media?.portraitUrl || "https://via.placeholder.com/80"}
                        alt=""
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{b.name || "—"}</div>
                        <div className="text-xs text-gray-500 truncate">{b.website || "—"}</div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">
                    {[b.address?.city, b.address?.state, b.address?.postcode].filter(Boolean).join(", ") || "—"}
                  </td>

                  <td className="p-3 text-gray-700">
                    <div>{b.email || "—"}</div>
                    <div className="text-xs text-gray-500">{b.phone || ""}</div>
                  </td>

                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(b)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                      >
                        Open
                      </button>

                      <button
                        onClick={() => setDeleteBizId(b.id)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td className="p-6 text-gray-500" colSpan={4}>
                    No businesses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ---------------- Business Modal (Simple + Advanced + Deals) ---------------- */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl overflow-hidden">
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingBiz?.id ? "Edit Business" : "Create Business"}
                </h2>
                <p className="text-xs text-gray-500">
                  {editingBiz?.id ? `Business ID: ${editingBiz.id}` : "Create first, then add deals inside this modal."}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => !saving && (setModalOpen(false), setDealModalOpen(false), setDealEditing(null))}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                  disabled={saving}
                >
                  Close
                </button>
              </div>
            </div>

            {/* body */}
            <div className="p-5 max-h-[80vh] overflow-auto bg-gray-50">
              <div className="flex items-center justify-end gap-3 mb-4">
                <button
                  onClick={onSaveBusiness}
                  className="rounded-xl bg-yellow-300 px-5 py-2 text-sm font-semibold text-gray-900 hover:opacity-90 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Business"}
                </button>
              </div>

              <div className="space-y-4">
                {/* DETAILS */}
                <Section title="Details" open={open.details} onToggle={() => toggleOpen("details")}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>Name *</label>
                      <input value={v.name} onChange={set("name")} className={inputCls} placeholder="Nandos" />
                    </div>

                    <div>
                      <label className={labelCls}>Phone</label>
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
                      <input value={v.address.line1} onChange={setAddress("line1")} className={inputCls} placeholder="Line 1" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Address Line 2</label>
                      <input value={v.address.line2} onChange={setAddress("line2")} className={inputCls} placeholder="Line 2" />
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
                      <input value={v.address.postcode} onChange={setAddress("postcode")} className={inputCls} placeholder="3000" />
                    </div>

                    <div>
                      <label className={labelCls}>Lat</label>
                      <input
                        value={v.address.lat ?? ""}
                        onChange={(e) => setV((p) => ({ ...p, address: { ...p.address, lat: e.target.value === "" ? null : Number(e.target.value) } }))}
                        className={inputCls}
                        placeholder="-37.8136"
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Lng</label>
                      <input
                        value={v.address.lng ?? ""}
                        onChange={(e) => setV((p) => ({ ...p, address: { ...p.address, lng: e.target.value === "" ? null : Number(e.target.value) } }))}
                        className={inputCls}
                        placeholder="144.9631"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Note</label>
                      <input value={v.note} onChange={set("note")} className={inputCls} placeholder="Optional note..." />
                    </div>
                  </div>
                </Section>

                {/* HOURS */}
                <Section title="Business Hours" open={open.hours} onToggle={() => toggleOpen("hours")}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setHoursMode("week")}
                      className={[
                        "rounded-xl px-5 py-2 text-sm font-semibold border",
                        v.hours.mode === "week" ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      Week
                    </button>
                    <button
                      type="button"
                      onClick={() => setHoursMode("custom")}
                      className={[
                        "rounded-xl px-5 py-2 text-sm font-semibold border",
                        v.hours.mode === "custom" ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      Custom
                    </button>
                  </div>

                  {v.hours.mode === "week" && (
                    <div className="mt-4 space-y-4">
                      <div className="rounded-2xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-gray-900">Weekdays</div>
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-gray-700">Open</span>
                            <input
                              type="checkbox"
                              checked={!!v.hours.week.weekdays.open}
                              onChange={setWeekHours("weekdays", "open")}
                              className="h-4 w-4"
                            />
                          </label>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
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

                      <div className="rounded-2xl border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <div className="font-semibold text-gray-900">Weekend</div>
                          <label className="flex items-center gap-2 text-sm">
                            <span className="text-gray-700">Open</span>
                            <input
                              type="checkbox"
                              checked={!!v.hours.week.weekend.open}
                              onChange={setWeekHours("weekend", "open")}
                              className="h-4 w-4"
                            />
                          </label>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
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
                              <input type="checkbox" checked={!!v.hours.custom[d].open} onChange={setCustomHours(d, "open")} className="h-4 w-4" />
                            </label>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-3">
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

                {/* BILLING */}
                <Section title="Billing Address" open={open.billing} onToggle={() => toggleOpen("billing")}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Email</label>
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
                          onChange={(e) =>
                            setV((p) => ({
                              ...p,
                              billing: {
                                ...(p.billing || {}),
                                sameAsEmail: e.target.checked,
                                email: e.target.checked ? (p.email || "") : (p.billing?.email || ""),
                              },
                            }))
                          }
                          className="h-4 w-4"
                        />
                        Same as profile email
                      </label>
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Phone</label>
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
                          onChange={(e) =>
                            setV((p) => ({
                              ...p,
                              billing: {
                                ...(p.billing || {}),
                                sameAsPhone: e.target.checked,
                                phone: e.target.checked ? (p.phone || "") : (p.billing?.phone || ""),
                              },
                            }))
                          }
                          className="h-4 w-4"
                        />
                        Same as profile phone
                      </label>
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Address Line 1</label>
                      <input className={inputCls} value={v.billing?.address?.line1 || ""} onChange={setBillingAddr("line1")} />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Address Line 2</label>
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
                </Section>

                {/* MEDIA */}
                <Section title="Media" open={open.media} onToggle={() => toggleOpen("media")}>
                  <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                    <div className="rounded-2xl border border-gray-200 p-4 bg-white">
                      <div className="text-sm font-semibold text-gray-900">Portrait</div>
                      <input type="file" accept="image/*" onChange={onPickPortrait} className="mt-3 text-sm" />
                      {v.media.portraitUrl && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                          <img src={v.media.portraitUrl} alt="" className="h-44 w-full object-cover" />
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-gray-200 p-4 bg-white">
                      <div className="text-sm font-semibold text-gray-900">Banner</div>
                      <input type="file" accept="image/*" onChange={onPickBanner} className="mt-3 text-sm" />
                      {v.media.bannerUrl && (
                        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
                          <img src={v.media.bannerUrl} alt="" className="h-44 w-full object-cover" />
                        </div>
                      )}
                    </div>
                  </div>
                </Section>

                {/* DEALS INSIDE SAME MODAL */}
                <Section title="Deals of this Business" open={open.deals} onToggle={() => toggleOpen("deals")}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {editingBiz?.id ? "Create offers linked to this business." : "Save business first to add deals."}
                    </div>

                    <button
                      onClick={() => {
                        if (!editingBiz?.id) return toast.error("Save business first");
                        setDealEditing(null);
                        setDealModalOpen(true);
                      }}
                      className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                      disabled={!editingBiz?.id}
                    >
                      + Add Deal
                    </button>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
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
                                  <div className="font-semibold text-gray-900 truncate">{d.header || d.title || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">{d.dealType || d.categoryLabel || "—"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-gray-700">{d.slot || "—"}</td>
                            <td className="p-3 text-gray-700">{d.offerType || "—"}</td>
                            <td className="p-3">
                              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${d.active ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-600"}`}>
                                {d.active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td className="p-3">
                              <div className="flex gap-2">
                                <button
                                  className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                                  onClick={() => {
                                    setDealEditing(d);
                                    setDealModalOpen(true);
                                  }}
                                >
                                  Edit
                                </button>
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
                </Section>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Deal Modal (inside same page) ---------------- */}
      {dealModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{dealEditing?.id ? "Edit Deal" : "Add Deal"}</h2>
                <p className="text-xs text-gray-500">Linked to: {v.name || "Business"}</p>
              </div>
              <button
                onClick={() => !dealSaving && (setDealModalOpen(false), setDealEditing(null))}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                disabled={dealSaving}
              >
                Close
              </button>
            </div>

            <div className="p-5 max-h-[75vh] overflow-auto">
              <DealForm
                initialValues={dealEditing || {}}
                onSubmit={saveDealForBusiness}
                loading={dealSaving}
                submitText={dealEditing?.id ? "Update Deal" : "Create Deal"}
              />
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Delete Business Modal ---------------- */}
      {deleteBizId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">Delete Business?</h3>
              <p className="mt-2 text-sm text-gray-500">This action cannot be undone.</p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteBizId(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteBusiness}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- Delete Deal Modal ---------------- */}
      {dealDeleteId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
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
                  onClick={confirmDeleteDeal}
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
