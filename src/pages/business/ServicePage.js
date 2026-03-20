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
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const SERVICE_CATEGORIES = [
  "Cleaning",
  "Repair",
  "Consulting",
  "Fitness",
  "Photography",
  "Education",
  "Home Service",
  "IT Service",
  "Other",
];

const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const textareaCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none resize-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const emptyPackage = () => ({
  name: "",
  price: "",
  duration: "",
  description: "",
});

const emptyFaq = () => ({
  question: "",
  answer: "",
});

const initialForm = {
  title: "",
  providerName: "",
  category: "",
  subcategory: "",
  shortDescription: "",
  description: "",

  basePrice: "",
  salePrice: "",
  duration: "",
  serviceArea: "",
  locationType: "onsite",

  bookingType: "instant",
  advanceBookingDays: "",
  cancellationPolicy: "",

  active: true,
  featured: false,
  sameDayAvailable: false,
  atHomeAvailable: false,

  tagsText: "",
  metaTitle: "",
  metaDescription: "",

  imageUrl: "",
  imagePath: "",
  packages: [emptyPackage()],
  faqs: [emptyFaq()],
};

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

const uniquePath = (folder, file) => {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const base = file.name.replace(/\.[^/.]+$/, "");
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${folder}/${base}_${stamp}.${ext}`;
};

async function uploadImage(file, folder = "services/images") {
  const path = uniquePath(folder, file);
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, path };
}

function normalizePackages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyPackage()];
  return raw.map((x) => ({
    name: x?.name || "",
    price: x?.price === 0 || x?.price ? String(x.price) : "",
    duration: x?.duration === 0 || x?.duration ? String(x.duration) : "",
    description: x?.description || "",
  }));
}

function normalizeFaqs(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyFaq()];
  return raw.map((x) => ({
    question: x?.question || "",
    answer: x?.answer || "",
  }));
}

export default function ServicePage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const [form, setForm] = useState(initialForm);

  const [open, setOpen] = useState({
    basic: true,
    pricing: true,
    booking: true,
    packages: true,
    faqs: false,
    media: true,
    seo: false,
    visibility: true,
  });

  useEffect(() => {
    const qy = query(collection(db, "services"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load services");
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [
        r.title,
        r.providerName,
        r.category,
        r.subcategory,
        r.shortDescription,
        r.serviceArea,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [rows, qText]);

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const set = (key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((p) => ({ ...p, [key]: val }));
  };

  const resetForm = () => {
    setEditingItem(null);
    setForm(initialForm);
    setOpen({
      basic: true,
      pricing: true,
      booking: true,
      packages: true,
      faqs: false,
      media: true,
      seo: false,
      visibility: true,
    });
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      ...initialForm,
      ...item,
      basePrice:
        item?.basePrice === 0 || item?.basePrice ? String(item.basePrice) : "",
      salePrice:
        item?.salePrice === 0 || item?.salePrice ? String(item.salePrice) : "",
      duration:
        item?.duration === 0 || item?.duration ? String(item.duration) : "",
      advanceBookingDays:
        item?.advanceBookingDays === 0 || item?.advanceBookingDays
          ? String(item.advanceBookingDays)
          : "",
      tagsText: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
      packages: normalizePackages(item?.packages),
      faqs: normalizeFaqs(item?.faqs),
    });
    setModalOpen(true);
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading image...");
      const res = await uploadImage(file, "services/images");
      setForm((p) => ({
        ...p,
        imageUrl: res.url,
        imagePath: res.path,
      }));
      toast.success("Image uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  const addPackage = () => {
    setForm((p) => ({
      ...p,
      packages: [...(p.packages || []), emptyPackage()],
    }));
  };

  const removePackage = (index) => {
    setForm((p) => {
      const next = (p.packages || []).filter((_, i) => i !== index);
      return { ...p, packages: next.length ? next : [emptyPackage()] };
    });
  };

  const setPackageField = (index, key, value) => {
    setForm((p) => {
      const next = [...(p.packages || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...p, packages: next };
    });
  };

  const addFaq = () => {
    setForm((p) => ({
      ...p,
      faqs: [...(p.faqs || []), emptyFaq()],
    }));
  };

  const removeFaq = (index) => {
    setForm((p) => {
      const next = (p.faqs || []).filter((_, i) => i !== index);
      return { ...p, faqs: next.length ? next : [emptyFaq()] };
    });
  };

  const setFaqField = (index, key, value) => {
    setForm((p) => {
      const next = [...(p.faqs || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...p, faqs: next };
    });
  };

  const onSave = async () => {
    if (!form.title.trim()) return toast.error("Service title is required");
    if (!form.category.trim()) return toast.error("Category is required");

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        providerName: form.providerName.trim(),
        category: form.category.trim(),
        subcategory: form.subcategory.trim(),
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),

        basePrice: form.basePrice === "" ? null : Number(form.basePrice),
        salePrice: form.salePrice === "" ? null : Number(form.salePrice),
        duration: form.duration === "" ? null : Number(form.duration),
        serviceArea: form.serviceArea.trim(),
        locationType: form.locationType,

        bookingType: form.bookingType,
        advanceBookingDays:
          form.advanceBookingDays === "" ? null : Number(form.advanceBookingDays),
        cancellationPolicy: form.cancellationPolicy.trim(),

        active: !!form.active,
        featured: !!form.featured,
        sameDayAvailable: !!form.sameDayAvailable,
        atHomeAvailable: !!form.atHomeAvailable,

        tags: (form.tagsText || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),

        metaTitle: form.metaTitle.trim(),
        metaDescription: form.metaDescription.trim(),

        imageUrl: form.imageUrl || "",
        imagePath: form.imagePath || "",

        packages: (form.packages || [])
          .map((x) => ({
            name: (x?.name || "").trim(),
            price: x?.price === "" ? null : Number(x.price),
            duration: x?.duration === "" ? null : Number(x.duration),
            description: (x?.description || "").trim(),
          }))
          .filter((x) => x.name),

        faqs: (form.faqs || [])
          .map((x) => ({
            question: (x?.question || "").trim(),
            answer: (x?.answer || "").trim(),
          }))
          .filter((x) => x.question && x.answer),

        updatedAt: serverTimestamp(),
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, "services", editingItem.id), payload);
        toast.success("Service updated ✅");
      } else {
        await addDoc(collection(db, "services"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Service created ✅");
      }

      setModalOpen(false);
      resetForm();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, "services", deleteId));
      toast.success("Service deleted ✅");
      setDeleteId(null);
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Services</h1>
          <p className="text-sm text-gray-500">
            Add and manage services in Amazon-style admin layout
          </p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add Service
        </button>
      </div>

      <div className="flex gap-3 mb-3">
        <input
          className="w-full sm:w-96 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
          placeholder="Search services..."
          value={qText}
          onChange={(e) => setQText(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-56">
            <FadeLoader color="#36d7b7" loading />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3 font-semibold">Service</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Price</th>
                <th className="p-3 font-semibold">Area</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold w-48">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        className="h-12 w-12 rounded-xl object-cover border border-gray-100"
                        src={item.imageUrl || "https://via.placeholder.com/80"}
                        alt=""
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {item.title || "—"}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {item.providerName || "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">
                    {[item.category, item.subcategory].filter(Boolean).join(" / ") || "—"}
                  </td>

                  <td className="p-3 text-gray-700">
                    {item.salePrice != null
                      ? `₹${item.salePrice}`
                      : item.basePrice != null
                      ? `₹${item.basePrice}`
                      : "—"}
                  </td>

                  <td className="p-3 text-gray-700">{item.serviceArea || "—"}</td>

                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${
                        item.active
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {item.active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => openEdit(item)}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => setDeleteId(item.id)}
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
                  <td className="p-6 text-gray-500" colSpan={6}>
                    No services found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingItem?.id ? "Edit Service" : "Add Service"}
                </h2>
                <p className="text-xs text-gray-500">
                  Service admin form
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onSave}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Service"}
                </button>
                <button
                  onClick={() => !saving && setModalOpen(false)}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                  disabled={saving}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[82vh] overflow-auto bg-gray-50">
              <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_0.6fr] gap-5">
                <div className="space-y-4">
                  <Section
                    title="Basic Service Information"
                    open={open.basic}
                    onToggle={() => toggleOpen("basic")}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className={labelCls}>Service Title *</label>
                        <input
                          value={form.title}
                          onChange={set("title")}
                          className={inputCls}
                          placeholder="e.g. Deep Home Cleaning"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Provider Name</label>
                        <input
                          value={form.providerName}
                          onChange={set("providerName")}
                          className={inputCls}
                          placeholder="Provider / business name"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Category *</label>
                        <select
                          value={form.category}
                          onChange={set("category")}
                          className={inputCls}
                        >
                          <option value="">Select category</option>
                          {SERVICE_CATEGORIES.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className={labelCls}>Subcategory</label>
                        <input
                          value={form.subcategory}
                          onChange={set("subcategory")}
                          className={inputCls}
                          placeholder="Subcategory"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Service Area</label>
                        <input
                          value={form.serviceArea}
                          onChange={set("serviceArea")}
                          className={inputCls}
                          placeholder="e.g. Delhi NCR"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Short Description</label>
                        <input
                          value={form.shortDescription}
                          onChange={set("shortDescription")}
                          className={inputCls}
                          placeholder="One line description"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Full Description</label>
                        <textarea
                          value={form.description}
                          onChange={set("description")}
                          className={textareaCls + " h-32"}
                          placeholder="Full description"
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Pricing"
                    open={open.pricing}
                    onToggle={() => toggleOpen("pricing")}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <label className={labelCls}>Base Price</label>
                        <input
                          type="number"
                          value={form.basePrice}
                          onChange={set("basePrice")}
                          className={inputCls}
                          placeholder="1000"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Sale Price</label>
                        <input
                          type="number"
                          value={form.salePrice}
                          onChange={set("salePrice")}
                          className={inputCls}
                          placeholder="899"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Duration (mins)</label>
                        <input
                          type="number"
                          value={form.duration}
                          onChange={set("duration")}
                          className={inputCls}
                          placeholder="60"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Location Type</label>
                        <select
                          value={form.locationType}
                          onChange={set("locationType")}
                          className={inputCls}
                        >
                          <option value="onsite">Onsite</option>
                          <option value="customer_place">Customer Place</option>
                          <option value="online">Online</option>
                        </select>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Booking Settings"
                    open={open.booking}
                    onToggle={() => toggleOpen("booking")}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelCls}>Booking Type</label>
                        <select
                          value={form.bookingType}
                          onChange={set("bookingType")}
                          className={inputCls}
                        >
                          <option value="instant">Instant</option>
                          <option value="approval_required">Approval Required</option>
                          <option value="inquiry">Inquiry Only</option>
                        </select>
                      </div>

                      <div>
                        <label className={labelCls}>Advance Booking Days</label>
                        <input
                          type="number"
                          value={form.advanceBookingDays}
                          onChange={set("advanceBookingDays")}
                          className={inputCls}
                          placeholder="7"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Cancellation Policy</label>
                        <textarea
                          value={form.cancellationPolicy}
                          onChange={set("cancellationPolicy")}
                          className={textareaCls + " h-24"}
                          placeholder="Cancellation policy"
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Packages"
                    open={open.packages}
                    onToggle={() => toggleOpen("packages")}
                  >
                    <div className="space-y-4">
                      {(form.packages || []).map((pkg, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-gray-200 bg-white p-4"
                        >
                          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div>
                              <label className={labelCls}>Package Name</label>
                              <input
                                value={pkg.name}
                                onChange={(e) =>
                                  setPackageField(index, "name", e.target.value)
                                }
                                className={inputCls}
                                placeholder="Basic / Premium"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Price</label>
                              <input
                                type="number"
                                value={pkg.price}
                                onChange={(e) =>
                                  setPackageField(index, "price", e.target.value)
                                }
                                className={inputCls}
                                placeholder="999"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Duration</label>
                              <input
                                type="number"
                                value={pkg.duration}
                                onChange={(e) =>
                                  setPackageField(index, "duration", e.target.value)
                                }
                                className={inputCls}
                                placeholder="60"
                              />
                            </div>

                            <div className="md:col-span-3">
                              <label className={labelCls}>Description</label>
                              <textarea
                                value={pkg.description}
                                onChange={(e) =>
                                  setPackageField(index, "description", e.target.value)
                                }
                                className={textareaCls + " h-20"}
                                placeholder="Package details"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removePackage(index)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            >
                              Remove Package
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addPackage}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          + Add Package
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="FAQs"
                    open={open.faqs}
                    onToggle={() => toggleOpen("faqs")}
                  >
                    <div className="space-y-4">
                      {(form.faqs || []).map((faq, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-gray-200 bg-white p-4"
                        >
                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <label className={labelCls}>Question</label>
                              <input
                                value={faq.question}
                                onChange={(e) =>
                                  setFaqField(index, "question", e.target.value)
                                }
                                className={inputCls}
                                placeholder="Question"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Answer</label>
                              <textarea
                                value={faq.answer}
                                onChange={(e) =>
                                  setFaqField(index, "answer", e.target.value)
                                }
                                className={textareaCls + " h-20"}
                                placeholder="Answer"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeFaq(index)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            >
                              Remove FAQ
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addFaq}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          + Add FAQ
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Media"
                    open={open.media}
                    onToggle={() => toggleOpen("media")}
                  >
                    <div>
                      <label className={labelCls}>Service Image</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-2 block w-full text-sm"
                        onChange={onPickImage}
                      />
                      {form.imageUrl ? (
                        <img
                          src={form.imageUrl}
                          alt="preview"
                          className="mt-3 h-44 w-44 rounded-xl object-cover border border-gray-200"
                        />
                      ) : null}
                    </div>
                  </Section>

                  <Section
                    title="SEO"
                    open={open.seo}
                    onToggle={() => toggleOpen("seo")}
                  >
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className={labelCls}>Tags</label>
                        <input
                          value={form.tagsText}
                          onChange={set("tagsText")}
                          className={inputCls}
                          placeholder="cleaning, home, deep clean"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Meta Title</label>
                        <input
                          value={form.metaTitle}
                          onChange={set("metaTitle")}
                          className={inputCls}
                          placeholder="SEO title"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Meta Description</label>
                        <textarea
                          value={form.metaDescription}
                          onChange={set("metaDescription")}
                          className={textareaCls + " h-24"}
                          placeholder="SEO description"
                        />
                      </div>
                    </div>
                  </Section>
                </div>

                <div className="space-y-4">
                  <Section
                    title="Visibility & Controls"
                    open={open.visibility}
                    onToggle={() => toggleOpen("visibility")}
                  >
                    <div className="space-y-4">
                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Active
                        </span>
                        <input
                          type="checkbox"
                          checked={form.active}
                          onChange={set("active")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Featured
                        </span>
                        <input
                          type="checkbox"
                          checked={form.featured}
                          onChange={set("featured")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Same Day Available
                        </span>
                        <input
                          type="checkbox"
                          checked={form.sameDayAvailable}
                          onChange={set("sameDayAvailable")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          At Home Available
                        </span>
                        <input
                          type="checkbox"
                          checked={form.atHomeAvailable}
                          onChange={set("atHomeAvailable")}
                        />
                      </label>
                    </div>
                  </Section>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <h3 className="text-base font-semibold text-gray-900">
                      Preview
                    </h3>

                    <div className="mt-4 rounded-2xl border border-gray-100 overflow-hidden bg-white">
                      <div className="h-52 bg-gray-100 flex items-center justify-center">
                        {form.imageUrl ? (
                          <img
                            src={form.imageUrl}
                            alt="preview"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-sm text-gray-400">No image</span>
                        )}
                      </div>

                      <div className="p-4 space-y-2">
                        <div className="font-semibold text-gray-900 line-clamp-2">
                          {form.title || "Service title"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {form.providerName || "Provider"}
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          ₹{form.salePrice || form.basePrice || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                          {form.duration ? `${form.duration} mins` : "Duration not set"}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Service?
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                This action cannot be undone.
              </p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
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