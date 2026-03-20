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

const SALON_CATEGORIES = [
  "Haircut",
  "Hair Spa",
  "Hair Color",
  "Facial",
  "Waxing",
  "Massage",
  "Manicure",
  "Pedicure",
  "Bridal",
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

const initialForm = {
  title: "",
  salonName: "",
  category: "",
  subcategory: "",
  shortDescription: "",
  description: "",

  price: "",
  salePrice: "",
  duration: "",
  stylistName: "",
  genderType: "unisex",
  chairCount: "",

  bookingType: "appointment",
  cancellationPolicy: "",

  active: true,
  featured: false,
  appointmentRequired: true,
  homeServiceAvailable: false,

  tagsText: "",
  metaTitle: "",
  metaDescription: "",

  imageUrl: "",
  imagePath: "",
  packages: [emptyPackage()],

  mondayOpen: true,
  mondayFrom: "10:00",
  mondayTo: "20:00",
  tuesdayOpen: true,
  tuesdayFrom: "10:00",
  tuesdayTo: "20:00",
  wednesdayOpen: true,
  wednesdayFrom: "10:00",
  wednesdayTo: "20:00",
  thursdayOpen: true,
  thursdayFrom: "10:00",
  thursdayTo: "20:00",
  fridayOpen: true,
  fridayFrom: "10:00",
  fridayTo: "20:00",
  saturdayOpen: true,
  saturdayFrom: "10:00",
  saturdayTo: "20:00",
  sundayOpen: false,
  sundayFrom: "10:00",
  sundayTo: "18:00",
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

async function uploadImage(file, folder = "salons/images") {
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

export default function SalonPage({ navbarHeight }) {
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
    timings: true,
    packages: true,
    booking: false,
    media: true,
    seo: false,
    visibility: true,
  });

  useEffect(() => {
    const qy = query(collection(db, "salons"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load salon items");
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
        r.salonName,
        r.category,
        r.subcategory,
        r.stylistName,
        r.shortDescription,
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
      timings: true,
      packages: true,
      booking: false,
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
      price: item?.price === 0 || item?.price ? String(item.price) : "",
      salePrice:
        item?.salePrice === 0 || item?.salePrice ? String(item.salePrice) : "",
      duration:
        item?.duration === 0 || item?.duration ? String(item.duration) : "",
      chairCount:
        item?.chairCount === 0 || item?.chairCount ? String(item.chairCount) : "",
      tagsText: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
      packages: normalizePackages(item?.packages),
    });
    setModalOpen(true);
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading image...");
      const res = await uploadImage(file, "salons/images");
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

  const onSave = async () => {
    if (!form.title.trim()) return toast.error("Salon service title is required");
    if (!form.category.trim()) return toast.error("Category is required");

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        salonName: form.salonName.trim(),
        category: form.category.trim(),
        subcategory: form.subcategory.trim(),
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),

        price: form.price === "" ? null : Number(form.price),
        salePrice: form.salePrice === "" ? null : Number(form.salePrice),
        duration: form.duration === "" ? null : Number(form.duration),
        stylistName: form.stylistName.trim(),
        genderType: form.genderType,
        chairCount: form.chairCount === "" ? null : Number(form.chairCount),

        bookingType: form.bookingType,
        cancellationPolicy: form.cancellationPolicy.trim(),

        active: !!form.active,
        featured: !!form.featured,
        appointmentRequired: !!form.appointmentRequired,
        homeServiceAvailable: !!form.homeServiceAvailable,

        tags: (form.tagsText || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),

        metaTitle: form.metaTitle.trim(),
        metaDescription: form.metaDescription.trim(),

        imageUrl: form.imageUrl || "",
        imagePath: form.imagePath || "",

        timings: {
          monday: {
            open: !!form.mondayOpen,
            from: form.mondayFrom,
            to: form.mondayTo,
          },
          tuesday: {
            open: !!form.tuesdayOpen,
            from: form.tuesdayFrom,
            to: form.tuesdayTo,
          },
          wednesday: {
            open: !!form.wednesdayOpen,
            from: form.wednesdayFrom,
            to: form.wednesdayTo,
          },
          thursday: {
            open: !!form.thursdayOpen,
            from: form.thursdayFrom,
            to: form.thursdayTo,
          },
          friday: {
            open: !!form.fridayOpen,
            from: form.fridayFrom,
            to: form.fridayTo,
          },
          saturday: {
            open: !!form.saturdayOpen,
            from: form.saturdayFrom,
            to: form.saturdayTo,
          },
          sunday: {
            open: !!form.sundayOpen,
            from: form.sundayFrom,
            to: form.sundayTo,
          },
        },

        packages: (form.packages || [])
          .map((x) => ({
            name: (x?.name || "").trim(),
            price: x?.price === "" ? null : Number(x.price),
            duration: x?.duration === "" ? null : Number(x.duration),
            description: (x?.description || "").trim(),
          }))
          .filter((x) => x.name),

        updatedAt: serverTimestamp(),
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, "salons", editingItem.id), payload);
        toast.success("Salon item updated ✅");
      } else {
        await addDoc(collection(db, "salons"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Salon item created ✅");
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
      await deleteDoc(doc(db, "salons", deleteId));
      toast.success("Salon item deleted ✅");
      setDeleteId(null);
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  const dayRows = [
    ["Monday", "mondayOpen", "mondayFrom", "mondayTo"],
    ["Tuesday", "tuesdayOpen", "tuesdayFrom", "tuesdayTo"],
    ["Wednesday", "wednesdayOpen", "wednesdayFrom", "wednesdayTo"],
    ["Thursday", "thursdayOpen", "thursdayFrom", "thursdayTo"],
    ["Friday", "fridayOpen", "fridayFrom", "fridayTo"],
    ["Saturday", "saturdayOpen", "saturdayFrom", "saturdayTo"],
    ["Sunday", "sundayOpen", "sundayFrom", "sundayTo"],
  ];

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Salon</h1>
          <p className="text-sm text-gray-500">
            Add and manage salon services in admin layout
          </p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add Salon Service
        </button>
      </div>

      <div className="flex gap-3 mb-3">
        <input
          className="w-full sm:w-96 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
          placeholder="Search salon items..."
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
                <th className="p-3 font-semibold">Salon Service</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Price</th>
                <th className="p-3 font-semibold">Stylist</th>
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
                          {item.salonName || "—"}
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
                      : item.price != null
                      ? `₹${item.price}`
                      : "—"}
                  </td>

                  <td className="p-3 text-gray-700">
                    {item.stylistName || "—"}
                  </td>

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
                    No salon items found.
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
                  {editingItem?.id ? "Edit Salon Service" : "Add Salon Service"}
                </h2>
                <p className="text-xs text-gray-500">Salon admin form</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onSave}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Salon Service"}
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
                    title="Basic Salon Information"
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
                          placeholder="e.g. Premium Haircut + Wash"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Salon Name</label>
                        <input
                          value={form.salonName}
                          onChange={set("salonName")}
                          className={inputCls}
                          placeholder="Salon name"
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
                          {SALON_CATEGORIES.map((x) => (
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
                        <label className={labelCls}>Stylist Name</label>
                        <input
                          value={form.stylistName}
                          onChange={set("stylistName")}
                          className={inputCls}
                          placeholder="Stylist"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Gender Type</label>
                        <select
                          value={form.genderType}
                          onChange={set("genderType")}
                          className={inputCls}
                        >
                          <option value="unisex">Unisex</option>
                          <option value="men">Men</option>
                          <option value="women">Women</option>
                          <option value="kids">Kids</option>
                        </select>
                      </div>

                      <div>
                        <label className={labelCls}>Chair Count</label>
                        <input
                          type="number"
                          value={form.chairCount}
                          onChange={set("chairCount")}
                          className={inputCls}
                          placeholder="4"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Short Description</label>
                        <input
                          value={form.shortDescription}
                          onChange={set("shortDescription")}
                          className={inputCls}
                          placeholder="One line summary"
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
                        <label className={labelCls}>Price</label>
                        <input
                          type="number"
                          value={form.price}
                          onChange={set("price")}
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
                          placeholder="45"
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Salon Timings"
                    open={open.timings}
                    onToggle={() => toggleOpen("timings")}
                  >
                    <div className="space-y-3">
                      {dayRows.map(([label, openKey, fromKey, toKey]) => (
                        <div
                          key={label}
                          className="grid grid-cols-1 md:grid-cols-[140px_90px_1fr_1fr] gap-3 items-end rounded-xl border border-gray-200 p-3 bg-white"
                        >
                          <div className="font-medium text-gray-900">{label}</div>

                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={!!form[openKey]}
                              onChange={set(openKey)}
                            />
                            Open
                          </label>

                          <div>
                            <label className={labelCls}>From</label>
                            <input
                              type="time"
                              value={form[fromKey]}
                              onChange={set(fromKey)}
                              className={inputCls}
                              disabled={!form[openKey]}
                            />
                          </div>

                          <div>
                            <label className={labelCls}>To</label>
                            <input
                              type="time"
                              value={form[toKey]}
                              onChange={set(toKey)}
                              className={inputCls}
                              disabled={!form[openKey]}
                            />
                          </div>
                        </div>
                      ))}
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
                                placeholder="Package name"
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
                          <option value="appointment">Appointment</option>
                          <option value="walkin">Walk-in</option>
                          <option value="both">Both</option>
                        </select>
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
                    title="Media"
                    open={open.media}
                    onToggle={() => toggleOpen("media")}
                  >
                    <div>
                      <label className={labelCls}>Salon Image</label>
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
                          placeholder="haircut, premium, salon"
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
                          Appointment Required
                        </span>
                        <input
                          type="checkbox"
                          checked={form.appointmentRequired}
                          onChange={set("appointmentRequired")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Home Service Available
                        </span>
                        <input
                          type="checkbox"
                          checked={form.homeServiceAvailable}
                          onChange={set("homeServiceAvailable")}
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
                          {form.title || "Salon service"}
                        </div>
                        <div className="text-sm text-gray-500">
                          {form.salonName || "Salon name"}
                        </div>
                        <div className="text-xl font-bold text-gray-900">
                          ₹{form.salePrice || form.price || 0}
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
                Delete Salon Service?
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