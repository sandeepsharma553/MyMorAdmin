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
  arrayUnion,
  increment,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import DealForm from "./DealForm";
import LocationPicker from "./LocationPicker";

const blankDay = () => ({ open: true, from: "00:00", to: "00:00" });
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

const initialForm = {
  name: "",
  phone: "",
  email: "",
  abn: "",
  website: "",
  note: "",
  address: {
    line1: "",
    line2: "",
    postcode: "",
    countryCode: "",
    countryName: "",
    stateCode: "",
    stateName: "",
    cityName: "",
    city: "",
    state: "",
    lat: null,
    lng: null,
  },

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
    address: {
      line1: "",
      line2: "",
      postcode: "",
      countryCode: "",
      countryName: "",
      stateCode: "",
      stateName: "",
      cityName: "",
      city: "",
      state: "",
    },
  },
};

const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

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

export default function BusinessesAndDealsPage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBiz, setEditingBiz] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteBizId, setDeleteBizId] = useState(null);
  const [form, setForm] = useState(initialForm);

  const [open, setOpen] = useState({
    details: true,
    hours: false,
    billing: false,
    media: false,
    deals: true,
  });

  const [bizDeals, setBizDeals] = useState([]);
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealEditing, setDealEditing] = useState(null);
  const [dealSaving, setDealSaving] = useState(false);
  const [dealDeleteId, setDealDeleteId] = useState(null);

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
      (err) => console.error(err)
    );

    return () => unsub();
  }, [modalOpen, editingBiz?.id]);

  const openCreate = () => {
    setEditingBiz(null);
    setForm(initialForm);
    setOpen({ details: true, hours: false, billing: false, media: false, deals: true });
    setBizDeals([]);
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setEditingBiz(b);
    const data = b || {};
    setForm({
      ...initialForm,
      ...data,
      address: { ...initialForm.address, ...(data.address || {}) },
      booking: { ...initialForm.booking, ...(data.booking || {}) },
      customerCommunication: { ...initialForm.customerCommunication, ...(data.customerCommunication || {}) },
      hours: {
        ...initialForm.hours,
        ...(data.hours || {}),
        week: { ...initialForm.hours.week, ...(data.hours?.week || {}) },
        custom: { ...initialForm.hours.custom, ...(data.hours?.custom || {}) },
      },
      billing: {
        ...initialForm.billing,
        ...(data.billing || {}),
        address: { ...initialForm.billing.address, ...(data.billing?.address || {}) },
      },
      media: { ...initialForm.media, ...(data.media || {}) },
    });
    setOpen({ details: true, hours: false, billing: false, media: false, deals: true });
    setModalOpen(true);
  };

  const set = (key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((p) => ({ ...p, [key]: val }));
  };

  const setAddress = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setForm((p) => ({ ...p, address: { ...(p.address || {}), [key]: val } }));
  };

  const setBilling = (key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setForm((p) => ({ ...p, billing: { ...(p.billing || {}), [key]: val } }));
  };

  const setBillingAddr = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setForm((p) => ({
      ...p,
      billing: { ...(p.billing || {}), address: { ...((p.billing || {}).address || {}), [key]: val } },
    }));
  };

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const setHoursMode = (mode) => setForm((p) => ({ ...p, hours: { ...(p.hours || {}), mode } }));

  const setWeekHours = (bucket, key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setForm((p) => ({
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
    setForm((p) => ({
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

  const onPickPortrait = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading portrait...");
      const res = await uploadImage(file, "businesses/portrait");
      setForm((p) => ({ ...p, media: { ...(p.media || {}), portraitUrl: res.url, portraitPath: res.path } }));
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
      setForm((p) => ({ ...p, media: { ...(p.media || {}), bannerUrl: res.url, bannerPath: res.path } }));
      toast.success("Banner uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  const onSaveBusiness = async () => {
    if (!form.name.trim()) return toast.error("Business name is required");
    if (!form.email.trim()) return toast.error("Email is required");

    setSaving(true);
    try {
      const billingEmail = form.billing?.sameAsEmail ? (form.email || "") : (form.billing?.email || "");
      const billingPhone = form.billing?.sameAsPhone ? (form.phone || "") : (form.billing?.phone || "");

      const payload = {
        name: form.name?.trim() || "",
        phone: form.phone?.trim() || "",
        email: form.email?.trim() || "",
        abn: form.abn?.trim() || "",
        website: form.website?.trim() || "",
        note: form.note?.trim() || "",

        address: {
          ...form.address,
          city: form.address?.city || form.address?.cityName || "",
          state: form.address?.state || form.address?.stateName || "",
        },

        customerCommunication: {
          contactNumber: form.customerCommunication?.contactNumber || "",
          contactEmail: form.customerCommunication?.contactEmail || "",
        },

        hours: {
          mode: form.hours?.mode || "week",
          week: {
            weekdays: { ...(form.hours?.week?.weekdays || blankDay()) },
            weekend: { ...(form.hours?.week?.weekend || blankDay()) },
          },
          custom: DAYS.reduce((acc, d) => {
            acc[d] = { ...(form.hours?.custom?.[d] || blankDay()) };
            return acc;
          }, {}),
        },

        media: { ...(form.media || {}) },

        billing: {
          sameAsEmail: !!form.billing?.sameAsEmail,
          sameAsPhone: !!form.billing?.sameAsPhone,
          email: billingEmail,
          phone: billingPhone,
          address: {
            ...form.billing?.address,
            city: form.billing?.address?.city || form.billing?.address?.cityName || "",
            state: form.billing?.address?.state || form.billing?.address?.stateName || "",
          },
        },

        updatedAt: serverTimestamp(),
      };

      if (!editingBiz?.id) {
        const ref = await addDoc(collection(db, "businesses"), {
          ...payload,
          createdAt: serverTimestamp(),
          dealsCount: 0,
          dealIds: [],
        });
        toast.success("Business created ✅");

        setEditingBiz({ id: ref.id, ...payload });
      } else {
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

  const uploadIfFile = async (file, folder) => {
    const path = `${folder}/${editingBiz.id}/${Date.now()}_${file.name}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    return { url, path };
  };

  const saveDealForBusiness = async (values) => {
    if (!editingBiz?.id) return toast.error("Create business first, then add deals.");

    setDealSaving(true);
    try {
      let posterUrl = values.imageUrl || values.posterUrl || "";
      let posterPath = dealEditing?.posterPath || "";

      if (values.imageFile) {
        const up = await uploadIfFile(values.imageFile, "deals/posters");
        posterUrl = up.url;
        posterPath = up.path;
      } else if (!posterUrl && dealEditing?.posterUrl) {
        posterUrl = dealEditing.posterUrl;
      }

      let catalogUrl = values?.retail?.catalogUrl || "";
      let catalogPath = dealEditing?.retail?.catalogPath || "";

      if (values?.retail?.catalogFile) {
        const up2 = await uploadIfFile(values.retail.catalogFile, "deals/catalogs");
        catalogUrl = up2.url;
        catalogPath = up2.path;
      } else if (!catalogUrl && dealEditing?.retail?.catalogUrl) {
        catalogUrl = dealEditing.retail.catalogUrl;
      }

      const dealPayload = {
        businessId: editingBiz.id,
        businessName: form.name || "",
        businessAddress: [form.address?.line1, form.address?.city, form.address?.state, form.address?.postcode]
          .filter(Boolean)
          .join(", "),
        businessLat: form.address?.lat ?? null,
        businessLng: form.address?.lng ?? null,

        header: values.header?.trim() || "",
        campaignType: values.campaignType || "single_offer",
        category: values.category || "dining",
        slot: values.slot || "",
        mode: values.mode || "simple",

        status: values.status || "draft",
        active: !!values.active,
        featured: !!values.featured,

        discovery: {
          tags: values?.discovery?.tags || [],
          sections: values?.discovery?.sections || [],
        },

        partner: {
          partnerId: values?.partner?.partnerId || "",
          merchantId: values?.partner?.merchantId || editingBiz.id,
        },

        venue: {
          id: editingBiz.id,
          name: values?.venue?.name || form.name || "",
          locationLabel:
            values?.venue?.locationLabel ||
            [form.address?.city, form.address?.state].filter(Boolean).join(", "),
          lat: typeof values?.venue?.lat === "number" ? values.venue.lat : form.address?.lat ?? null,
          lng: typeof values?.venue?.lng === "number" ? values.venue.lng : form.address?.lng ?? null,
        },

        descriptionHtml: values.descriptionHtml || "",

        schedule: values.schedule || { activeDays: [], validFrom: "", validTo: "", timeWindow: null },

        redemption: values.redemption || {
          method: "student_id",
          requiresStudentId: true,
          oneClaimPerStudent: true,
          claimLimit: null,
          promoCode: "",
          instructions: "",
        },

        booking: values.booking || { enabled: false, bookingLink: "", sessionLabel: "" },

        retail:
          values.mode === "catalog"
            ? {
                saleType: values?.retail?.saleType || "storewide",
                discountRangeLabel: values?.retail?.discountRangeLabel || "",
                catalogUrl: catalogUrl || "",
                catalogPath: catalogPath || "",
                highlights: values?.retail?.highlights || [],
              }
            : null,

        posterUrl: posterUrl || "",
        posterPath: posterPath || "",
        daysLeft: typeof values.daysLeft === "number" ? values.daysLeft : null,

        updatedAt: serverTimestamp(),
      };

      if (dealEditing?.id) {
        await updateDoc(doc(db, "deals", dealEditing.id), dealPayload);
        toast.success("Deal updated ✅");
      } else {
        // ✅ CREATE deal
        const dealRef = await addDoc(collection(db, "deals"), {
          ...dealPayload,
          createdAt: serverTimestamp(),
          metrics: { views: 0, opens: 0, saves: 0, claims: 0, redemptions: 0, bookingClicks: 0 },
        });

        // ✅ BIND to business
        await updateDoc(doc(db, "businesses", editingBiz.id), {
          dealIds: arrayUnion(dealRef.id),
          dealsCount: increment(1),
          lastDealAt: serverTimestamp(),
        });

        toast.success("Deal created ✅");
      }

      setDealModalOpen(false);
      setDealEditing(null);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save deal failed");
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

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Businesses</h1>
          <p className="text-sm text-gray-500">List + Add/Edit + Deals — all in one page.</p>
        </div>

        <button onClick={openCreate} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
          + Add Business
        </button>
      </div>

      <div className="flex gap-3 mb-3">
        <input
          className="w-full sm:w-96 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
          placeholder="Search businesses..."
          value={qText}
          onChange={(e) => setQText(e.target.value)}
        />
      </div>

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
                      <button onClick={() => openEdit(b)} className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50">
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{editingBiz?.id ? "Edit Business" : "Create Business"}</h2>
                <p className="text-xs text-gray-500">
                  {editingBiz?.id ? `Business ID: ${editingBiz.id}` : "Create first, then add deals inside this modal."}
                </p>
              </div>

              <button
                onClick={() => !saving && (setModalOpen(false), setDealModalOpen(false), setDealEditing(null))}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                disabled={saving}
              >
                Close
              </button>
            </div>

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
                <Section title="Details" open={open.details} onToggle={() => toggleOpen("details")}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>Name *</label>
                      <input value={form.name} onChange={set("name")} className={inputCls} placeholder="Nandos" />
                    </div>

                    <div>
                      <label className={labelCls}>Phone</label>
                      <input value={form.phone} onChange={set("phone")} className={inputCls} placeholder="0466..." />
                    </div>

                    <div>
                      <label className={labelCls}>Email *</label>
                      <input value={form.email} onChange={set("email")} className={inputCls} placeholder="email@domain.com" />
                    </div>

                    <div>
                      <label className={labelCls}>ABN</label>
                      <input value={form.abn} onChange={set("abn")} className={inputCls} placeholder="20079066407" />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Website</label>
                      <input value={form.website} onChange={set("website")} className={inputCls} placeholder="https://..." />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Address Line 1</label>
                      <input value={form.address.line1} onChange={setAddress("line1")} className={inputCls} placeholder="Line 1" />
                    </div>
                    <div className="md:col-span-2">
                      <label className={labelCls}>Address Line 2</label>
                      <input value={form.address.line2} onChange={setAddress("line2")} className={inputCls} placeholder="Line 2" />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Postcode</label>
                      <input value={form.address.postcode} onChange={setAddress("postcode")} className={inputCls} placeholder="3000" />
                    </div>

                    <div className="md:col-span-2">
                      <LocationPicker
                        value={{
                          countryCode: form.address.countryCode || "",
                          stateCode: form.address.stateCode || "",
                          cityName: form.address.cityName || "",
                        }}
                        onChange={(loc) => {
                          setForm((prev) => ({
                            ...prev,
                            address: {
                              ...(prev.address || {}),
                              countryCode: loc.country?.code || "",
                              countryName: loc.country?.name || "",
                              stateCode: loc.state?.code || "",
                              stateName: loc.state?.name || "",
                              cityName: loc.city?.name || "",
                              city: loc.city?.name || "",
                              state: loc.state?.name || "",
                              lat: loc.coords?.lat ?? prev.address?.lat ?? null,
                              lng: loc.coords?.lng ?? prev.address?.lng ?? null,
                            },
                          }));
                        }}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Note</label>
                      <textarea value={form.note} onChange={set("note")} className={inputCls + " h-24 mt-2 resize-none"} placeholder="Optional note..." />
                    </div>
                  </div>
                </Section>

                <Section title="Billing Address" open={open.billing} onToggle={() => toggleOpen("billing")}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Email</label>
                      <input
                        className={inputCls}
                        value={form.billing?.sameAsEmail ? (form.email || "") : (form.billing?.email || "")}
                        disabled={!!form.billing?.sameAsEmail}
                        onChange={setBilling("email")}
                        placeholder="billing@email.com"
                      />
                      <label className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          checked={!!form.billing?.sameAsEmail}
                          onChange={(e) =>
                            setForm((p) => ({
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
                        value={form.billing?.sameAsPhone ? (form.phone || "") : (form.billing?.phone || "")}
                        disabled={!!form.billing?.sameAsPhone}
                        onChange={setBilling("phone")}
                        placeholder="billing phone"
                      />
                      <label className="mt-2 flex items-center gap-2 text-sm text-gray-900">
                        <input
                          type="checkbox"
                          checked={!!form.billing?.sameAsPhone}
                          onChange={(e) =>
                            setForm((p) => ({
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
                      <input className={inputCls} value={form.billing?.address?.line1 || ""} onChange={setBillingAddr("line1")} />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Address Line 2</label>
                      <input className={inputCls} value={form.billing?.address?.line2 || ""} onChange={setBillingAddr("line2")} />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Postcode</label>
                      <input className={inputCls} value={form.billing?.address?.postcode || ""} onChange={setBillingAddr("postcode")} placeholder="3000" />
                    </div>

                    <div className="md:col-span-2">
                      <LocationPicker
                        value={{
                          countryCode: form.billing?.address?.countryCode || "",
                          stateCode: form.billing?.address?.stateCode || "",
                          cityName: form.billing?.address?.cityName || "",
                        }}
                        onChange={(loc) => {
                          setForm((prev) => ({
                            ...prev,
                            billing: {
                              ...(prev.billing || {}),
                              address: {
                                ...(prev.billing?.address || {}),
                                countryCode: loc.country?.code || "",
                                countryName: loc.country?.name || "",
                                stateCode: loc.state?.code || "",
                                stateName: loc.state?.name || "",
                                cityName: loc.city?.name || "",
                                city: loc.city?.name || "",
                                state: loc.state?.name || "",
                              },
                            },
                          }));
                        }}
                      />
                    </div>
                  </div>
                </Section>

                <Section title="Deals of this Business" open={open.deals} onToggle={() => toggleOpen("deals")}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">{editingBiz?.id ? "Create offers linked to this business." : "Save business first to add deals."}</div>

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
                                <img className="h-10 w-16 rounded-xl object-cover border border-gray-100" src={d.posterUrl || d.imageUrl} alt="" />
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900 truncate">{d.header || d.title || "—"}</div>
                                  <div className="text-xs text-gray-500 truncate">{d.category || d.campaignType || "—"}</div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-gray-700">{d.slot || "—"}</td>
                            <td className="p-3 text-gray-700">{d.offerType || d.mode || "—"}</td>
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

      {dealModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{dealEditing?.id ? "Edit Deal" : "Add Deal"}</h2>
                <p className="text-xs text-gray-500">Linked to: {form.name || "Business"}</p>
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

      {deleteBizId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">Delete Business?</h3>
              <p className="mt-2 text-sm text-gray-500">This action cannot be undone.</p>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setDeleteBizId(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={confirmDeleteBusiness} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dealDeleteId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">Delete Deal?</h3>
              <p className="mt-2 text-sm text-gray-500">This action cannot be undone.</p>

              <div className="mt-6 flex justify-end gap-3">
                <button onClick={() => setDealDeleteId(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={confirmDeleteDeal} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90">
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
