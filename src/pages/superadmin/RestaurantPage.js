import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  query,
  Timestamp,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import dayjs from "dayjs";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import MapLocationInput from "../../components/MapLocationInput";
import { MapPin } from "lucide-react";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const makeDefaultHours = () => ({
  mon: { closed: false, open: "09:00", close: "22:00" },
  tue: { closed: false, open: "09:00", close: "22:00" },
  wed: { closed: false, open: "09:00", close: "22:00" },
  thu: { closed: false, open: "09:00", close: "22:00" },
  fri: { closed: false, open: "09:00", close: "22:00" },
  sat: { closed: false, open: "09:00", close: "22:00" },
  sun: { closed: false, open: "09:00", close: "22:00" },
});

const initialFormData = {
  id: "",
  name: "",
  shortDesc: "",
  description: "",
  cuisines: "",
  tags: "",
  priceRange: "$$",

  avgCostForTwo: "",
  costForTwo: "",
  deliveryTime: "",
  offerText: "",
  location: "",
  timings: "",
  isOpen: true,
  rating: "",

  phone: "",
  website: "",
  bookingUrl: "",
  address: "",
  mapLocation: "",
  images: [],
  imageFiles: [],
  isActive: true,
  isFeatured: false,

  services: {
    delivery: true,
    dineIn: true,
    takeaway: false,
  },

  hours: makeDefaultHours(),

  menu: [],

  deals: [],
};

export default function RestaurantPage({ navbarHeight }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filters, setFilters] = useState({ name: "", cuisine: "", location: "" });
  const debounceRef = useRef(null);

  const [sortConfig, setSortConfig] = useState({ key: "name", direction: "asc" });
  const [showMapModal, setShowMapModal] = useState(false);

  const [activeTab, setActiveTab] = useState("basic"); // basic | hours | menu | deals
  const [form, setForm] = useState(initialFormData);

  useEffect(() => {
    getList();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [field]: value }));
    }, 250);
  };

  const onSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const toMillis = (val) => {
    if (!val) return null;
    if (typeof val === "object" && val.seconds != null) return val.seconds * 1000;
    if (val?.toDate) return val.toDate().getTime();
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const parseCsv = (s) =>
    String(s || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);

  const uniquePath = (folder, file) => {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const base = file.name.replace(/\.[^/.]+$/, "");
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prefix = folder ? `${folder}/` : "";
    return `${prefix}${base}_${stamp}.${ext}`;
  };

  const deriveTimings = (hours) => {
    if (!hours) return "";
    const openDays = Object.values(hours).filter((d) => !d.closed && d.open && d.close);
    if (!openDays.length) return "";
    return `${openDays[0].open} - ${openDays[0].close}`;
  };

  const getList = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "restaurants")));
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      docs.sort(
        (a, b) =>
          (toMillis(b.updatedAt) ?? toMillis(b.createdAt) ?? 0) -
          (toMillis(a.updatedAt) ?? toMillis(a.createdAt) ?? 0)
      );

      setList(docs);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load restaurants");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const openCreate = () => {
    setActiveTab("basic");
    setEditing(null);
    setForm({
      ...initialFormData,
      hours: makeDefaultHours(),
      services: {
        delivery: true,
        dineIn: true,
        takeaway: false,
      },
    });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setActiveTab("basic");
    setEditing(item);

    setForm({
      ...initialFormData,
      ...item,
      id: item.id,

      cuisines: Array.isArray(item.cuisines) ? item.cuisines.join(", ") : item.cuisines || "",
      tags: Array.isArray(item.tags) ? item.tags.join(", ") : item.tags || "",

      avgCostForTwo: item.avgCostForTwo ?? "",
      costForTwo: item.costForTwo || "",
      deliveryTime: item.deliveryTime || "",
      offerText: item.offerText || "",
      location: item.location || "",
      timings: item.timings || "",
      isOpen: item.isOpen !== false,
      rating: item.rating || "",

      images: Array.isArray(item.images) ? item.images : [],
      imageFiles: [],
      mapLocation: item.mapLocation || item.locationStr || "",

      services: {
        delivery: !!item?.services?.delivery,
        dineIn: item?.services?.dineIn !== false,
        takeaway: !!item?.services?.takeaway,
      },

      hours: item?.hours ? item.hours : makeDefaultHours(),

      menu: Array.isArray(item.menu)
        ? item.menu.map((cat) => ({
            ...cat,
            items: (cat.items || []).map((it) => ({
              ...it,
              description: it.description || it.desc || "",
              image: it.image || it.imageUrl || "",
              imageFile: null,
              bestseller: !!it.bestseller,
            })),
          }))
        : [],

      deals: Array.isArray(item.deals)
        ? item.deals.map((d) => ({
            ...d,
            subtitle: d.subtitle || "",
            valid: d.valid || "",
            days: d.days || [],
            startTime: d.startTime || "",
            endTime: d.endTime || "",
          }))
        : [],
    });

    setModalOpen(true);
  };

  const addCategory = () => {
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setForm((prev) => ({
      ...prev,
      menu: [...(prev.menu || []), { id, name: "", items: [] }],
    }));
  };

  const removeCategory = (catId) => {
    setForm((prev) => ({
      ...prev,
      menu: (prev.menu || []).filter((c) => c.id !== catId),
    }));
  };

  const updateCategoryName = (catId, name) => {
    setForm((prev) => ({
      ...prev,
      menu: (prev.menu || []).map((c) => (c.id === catId ? { ...c, name } : c)),
    }));
  };

  const addItem = (catId) => {
    const id = `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setForm((prev) => ({
      ...prev,
      menu: (prev.menu || []).map((c) =>
        c.id === catId
          ? {
              ...c,
              items: [
                ...(c.items || []),
                {
                  id,
                  name: "",
                  price: "",
                  description: "",
                  isVeg: false,
                  bestseller: false,
                  image: "",
                  imageFile: null,
                },
              ],
            }
          : c
      ),
    }));
  };

  const removeItem = (catId, itemId) => {
    setForm((prev) => ({
      ...prev,
      menu: (prev.menu || []).map((c) =>
        c.id === catId ? { ...c, items: (c.items || []).filter((it) => it.id !== itemId) } : c
      ),
    }));
  };

  const updateItem = (catId, itemId, patch) => {
    setForm((prev) => ({
      ...prev,
      menu: (prev.menu || []).map((c) =>
        c.id === catId
          ? {
              ...c,
              items: (c.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
            }
          : c
      ),
    }));
  };

  const addDeal = () => {
    const id = `deal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setForm((prev) => ({
      ...prev,
      deals: [
        ...(prev.deals || []),
        {
          id,
          title: "",
          subtitle: "",
          type: "percent",
          amount: "",
          code: "",
          valid: "",
          validFrom: "",
          validTo: "",
          days: [],
          startTime: "",
          endTime: "",
          isActive: true,
          notes: "",
        },
      ],
    }));
  };

  const removeDeal = (dealId) => {
    setForm((prev) => ({
      ...prev,
      deals: (prev.deals || []).filter((d) => d.id !== dealId),
    }));
  };

  const updateDeal = (dealId, patch) => {
    setForm((prev) => ({
      ...prev,
      deals: (prev.deals || []).map((d) => (d.id === dealId ? { ...d, ...patch } : d)),
    }));
  };

  const toggleDealDay = (dealId, day) => {
    setForm((prev) => ({
      ...prev,
      deals: (prev.deals || []).map((d) => {
        if (d.id !== dealId) return d;
        const currentDays = Array.isArray(d.days) ? d.days : [];
        const exists = currentDays.includes(day);
        return {
          ...d,
          days: exists ? currentDays.filter((x) => x !== day) : [...currentDays, day],
        };
      }),
    }));
  };

  const updateHours = (dayKey, patch) => {
    setForm((prev) => ({
      ...prev,
      hours: {
        ...(prev.hours || {}),
        [dayKey]: { ...(prev.hours?.[dayKey] || {}), ...patch },
      },
    }));
  };

  const uploadMenuItemImagesIfAny = async (currentMenu) => {
    const uploads = [];

    for (const cat of currentMenu || []) {
      for (const it of cat.items || []) {
        if (it?.imageFile) {
          uploads.push({
            catId: cat.id,
            itemId: it.id,
            file: it.imageFile,
          });
        }
      }
    }

    if (!uploads.length) return currentMenu;

    const results = await Promise.all(
      uploads.map(async (u) => {
        const path = uniquePath(`restaurant_menu_items/${form.name || "restaurant"}/${u.catId}`, u.file);
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, u.file);
        const url = await getDownloadURL(sRef);
        return { ...u, url };
      })
    );

    return (currentMenu || []).map((cat) => ({
      ...cat,
      items: (cat.items || []).map((it) => {
        const hit = results.find((r) => r.catId === cat.id && r.itemId === it.id);
        if (!hit) return it;
        return { ...it, image: hit.url, imageFile: null };
      }),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!form.name.trim()) {
        toast.error("Restaurant name required");
        return;
      }

      if (!form.address.trim()) {
        toast.error("Address required");
        return;
      }

      let uploaded = [];
      if (form.imageFiles?.length) {
        const uploads = form.imageFiles.map(async (file) => {
          const path = uniquePath(`restaurant_images/${form.name || "restaurant"}`, file);
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, file);
          const url = await getDownloadURL(sRef);
          return { url, name: file.name };
        });

        uploaded = await Promise.all(uploads);
      }

      const menuWithUploadedImages = await uploadMenuItemImagesIfAny(form.menu || []);

      const menuClean = (menuWithUploadedImages || []).map((cat) => ({
        id: cat.id,
        name: (cat.name || "").trim(),
        items: (cat.items || []).map((it) => ({
          id: it.id,
          name: (it.name || "").trim(),
          price: it.price === "" ? null : Number(it.price),
          description: (it.description || "").trim(),
          isVeg: !!it.isVeg,
          bestseller: !!it.bestseller,
          image: it.image || "",
        })),
      }));

      const dealsClean = (form.deals || []).map((d) => ({
        id: d.id,
        title: (d.title || "").trim(),
        subtitle: (d.subtitle || "").trim(),
        type: d.type || "percent",
        amount: d.amount === "" ? null : Number(d.amount),
        code: (d.code || "").trim(),
        valid: (d.valid || "").trim(),
        validFrom: d.validFrom || "",
        validTo: d.validTo || "",
        days: d.days || [],
        startTime: d.startTime || "",
        endTime: d.endTime || "",
        isActive: !!d.isActive,
        notes: (d.notes || "").trim(),
      }));

      const payload = {
        name: form.name.trim(),
        shortDesc: form.shortDesc.trim(),
        description: form.description.trim(),
        cuisines: parseCsv(form.cuisines),
        tags: parseCsv(form.tags),
        priceRange: form.priceRange,

        avgCostForTwo: form.avgCostForTwo === "" ? null : Number(form.avgCostForTwo),
        costForTwo: form.costForTwo.trim(),
        deliveryTime: form.deliveryTime.trim(),
        offerText: form.offerText.trim(),
        location: form.location.trim(),
        timings: form.timings.trim() || deriveTimings(form.hours),
        isOpen: !!form.isOpen,
        rating: form.rating.trim(),

        phone: form.phone.trim(),
        website: form.website.trim(),
        bookingUrl: form.bookingUrl.trim(),
        address: form.address.trim(),
        mapLocation: form.mapLocation || "",
        images: [...(form.images || []), ...uploaded],

        isActive: !!form.isActive,
        isFeatured: !!form.isFeatured,

        services: {
          delivery: !!form?.services?.delivery,
          dineIn: !!form?.services?.dineIn,
          takeaway: !!form?.services?.takeaway,
        },

        hours: form.hours || makeDefaultHours(),
        menu: menuClean,
        deals: dealsClean,

        updatedAt: Timestamp.now(),
      };

      if (editingData?.id) {
        await updateDoc(doc(db, "restaurants", editingData.id), payload);
        toast.success("Restaurant updated ✅");
      } else {
        await addDoc(collection(db, "restaurants"), {
          ...payload,
          createdAt: Timestamp.now(),
        });
        toast.success("Restaurant created ✅");
      }

      setModalOpen(false);
      setEditing(null);
      setForm(initialFormData);
      await getList();
    } catch (err) {
      console.error(err);
      toast.error("Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;

    try {
      await deleteDoc(doc(db, "restaurants", deleteData.id));
      toast.success("Successfully deleted!");
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }

    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const getSortVal = (r, key) => {
    if (key === "name") return (r.name || "").toLowerCase();
    if (key === "cuisine") return (r.cuisines || []).join(", ").toLowerCase();
    if (key === "location") return (r.address || "").toLowerCase();
    if (key === "updated") return toMillis(r.updatedAt) ?? toMillis(r.createdAt) ?? 0;
    return "";
  };

  const filtered = useMemo(() => {
    const nameQ = (filters.name || "").toLowerCase();
    const cuisineQ = (filters.cuisine || "").toLowerCase();
    const locQ = (filters.location || "").toLowerCase();

    return list.filter((r) => {
      const okName = !nameQ || (r.name || "").toLowerCase().includes(nameQ);
      const okCuisine =
        !cuisineQ ||
        (Array.isArray(r.cuisines) ? r.cuisines.join(", ") : r.cuisines || "")
          .toLowerCase()
          .includes(cuisineQ);
      const okLoc = !locQ || (r.address || "").toLowerCase().includes(locQ);
      return okName && okCuisine && okLoc;
    });
  }, [list, filters]);

  const sorted = useMemo(() => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = getSortVal(a, sortConfig.key);
      const vb = getSortVal(b, sortConfig.key);

      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
  }, [filtered, sortConfig]);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Restaurants</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-gray-900" onClick={openCreate}>
          + Add Restaurant
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: "name", label: "Restaurant" },
                  { key: "cuisine", label: "Cuisines" },
                  { key: "location", label: "Location" },
                  { key: "services", label: "Services", sortable: false },
                  { key: "menu", label: "Menu", sortable: false },
                  { key: "deals", label: "Deals", sortable: false },
                  { key: "status", label: "Status", sortable: false },
                  { key: "image", label: "Image", sortable: false },
                  { key: "updated", label: "Updated" },
                  { key: "actions", label: "Actions", sortable: false },
                ].map((col) => (
                  <th key={col.key} className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none">
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button type="button" className="flex items-center gap-1 hover:underline" onClick={() => onSort(col.key)}>
                        <span>{col.label}</span>
                        {sortConfig.key === col.key && (
                          <span className="text-gray-400">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>

              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search name"
                    defaultValue={filters.name}
                    onChange={(e) => setFilterDebounced("name", e.target.value)}
                  />
                </th>

                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search cuisine"
                    defaultValue={filters.cuisine}
                    onChange={(e) => setFilterDebounced("cuisine", e.target.value)}
                  />
                </th>

                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search location"
                    defaultValue={filters.location}
                    onChange={(e) => setFilterDebounced("location", e.target.value)}
                  />
                </th>

                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-6 py-10 text-center text-gray-500">
                    No restaurants found.
                  </td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const menuItemCount = Array.isArray(item.menu)
                    ? item.menu.reduce((acc, c) => acc + (c.items?.length || 0), 0)
                    : 0;

                  const activeDealsCount = Array.isArray(item.deals)
                    ? item.deals.filter((d) => d?.isActive).length
                    : 0;

                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="font-semibold">{item.name}</div>
                        <div className="text-xs text-gray-500">{item.shortDesc || "—"}</div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {(item.cuisines || []).slice(0, 3).join(", ") || "—"}
                        {(item.cuisines || []).length > 3 ? (
                          <div className="text-xs text-gray-500">+{item.cuisines.length - 3} more</div>
                        ) : null}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.address || "—"}</td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex flex-wrap gap-1">
                          {item?.services?.delivery ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Delivery</span>
                          ) : null}
                          {item?.services?.dineIn ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Dine-in</span>
                          ) : null}
                          {item?.services?.takeaway ? (
                            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Takeaway</span>
                          ) : null}
                          {!item?.services?.delivery && !item?.services?.dineIn && !item?.services?.takeaway ? (
                            <span className="text-gray-400">—</span>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {Array.isArray(item.menu) ? (
                          <span className="inline-flex items-center justify-center h-6 min-w-10 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {menuItemCount} items
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {Array.isArray(item.deals) ? (
                          <span className="inline-flex items-center justify-center h-6 min-w-10 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {activeDealsCount} active
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            item.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </span>

                        {item.isFeatured ? (
                          <span className="ml-2 px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                            Featured
                          </span>
                        ) : null}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {item.images?.[0]?.url ? (
                          <img src={item.images[0].url} alt="" width={80} height={80} className="rounded object-cover" />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                        {item.images?.length > 1 && (
                          <div className="text-xs text-gray-500 mt-1">+{item.images.length - 1} more</div>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {(() => {
                          const ms = toMillis(item.updatedAt) ?? toMillis(item.createdAt);
                          return ms ? dayjs(ms).format("MMM DD, YYYY") : "—";
                        })()}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button className="text-blue-600 hover:underline mr-3" onClick={() => openEdit(item)}>
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            setDelete(item);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">{editingData ? "Edit Restaurant" : "Create Restaurant"}</h2>
              <button type="button" className="text-gray-600 hover:text-black" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { k: "basic", t: "Basic" },
                { k: "hours", t: "Hours" },
                { k: "menu", t: "Menu" },
                { k: "deals", t: "Deals" },
              ].map((x) => {
                const active = activeTab === x.k;
                return (
                  <button
                    key={x.k}
                    type="button"
                    onClick={() => setActiveTab(x.k)}
                    className={`px-3 py-1.5 rounded-full text-sm border ${
                      active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                    }`}
                  >
                    {x.t}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {activeTab === "basic" && (
                <div className="space-y-4">
                  <input
                    name="name"
                    placeholder="Restaurant Name"
                    value={form.name}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />

                  <input
                    name="shortDesc"
                    placeholder="Short description (one line)"
                    value={form.shortDesc}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                  />

                  <textarea
                    name="description"
                    placeholder="Full description"
                    value={form.description}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    rows={4}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      name="cuisines"
                      placeholder="Cuisines (comma separated)"
                      value={form.cuisines}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />

                    <input
                      name="tags"
                      placeholder="Tags (comma separated)"
                      value={form.tags}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <select
                      name="priceRange"
                      value={form.priceRange}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    >
                      <option value="$">$</option>
                      <option value="$$">$$</option>
                      <option value="$$$">$$$</option>
                      <option value="$$$$">$$$$</option>
                    </select>

                    <input
                      name="avgCostForTwo"
                      placeholder="Avg cost for 2 (number)"
                      value={form.avgCostForTwo}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      name="costForTwo"
                      placeholder="Cost for two (e.g. ₹400 for two)"
                      value={form.costForTwo}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />

                    <input
                      name="deliveryTime"
                      placeholder="Delivery time (e.g. 25-30 mins)"
                      value={form.deliveryTime}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      name="offerText"
                      placeholder="Offer text (e.g. 50% OFF up to ₹100)"
                      value={form.offerText}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />

                    <input
                      name="rating"
                      placeholder="Rating (e.g. 4.5)"
                      value={form.rating}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      name="location"
                      placeholder="Location label (e.g. Civil Lines)"
                      value={form.location}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />

                    <input
                      name="timings"
                      placeholder="Timings (e.g. 10:00 AM - 11:00 PM)"
                      value={form.timings}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <input
                      name="phone"
                      placeholder="Phone"
                      value={form.phone}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />

                    <input
                      name="website"
                      placeholder="Website"
                      value={form.website}
                      onChange={handleChange}
                      className="w-full border border-gray-300 p-2 rounded"
                    />
                  </div>

                  <input
                    name="bookingUrl"
                    placeholder="Booking URL"
                    value={form.bookingUrl}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                  />

                  <input
                    name="address"
                    placeholder="Address"
                    value={form.address}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />

                  <div className="relative">
                    <input
                      name="mapLocation"
                      readOnly
                      placeholder="Select on map"
                      value={form.mapLocation}
                      onClick={() => setShowMapModal(true)}
                      className="w-full border border-gray-300 p-2 pl-10 rounded cursor-pointer"
                    />
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>

                  <div className="border rounded p-3 bg-gray-50">
                    <div className="font-semibold mb-2">Services</div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      {[
                        { k: "delivery", t: "Delivery" },
                        { k: "dineIn", t: "Dine-in" },
                        { k: "takeaway", t: "Takeaway" },
                      ].map((x) => (
                        <label key={x.k} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!form.services?.[x.k]}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                services: { ...(prev.services || {}), [x.k]: e.target.checked },
                              }))
                            }
                          />
                          {x.t}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!form.isOpen}
                        onChange={(e) => setForm((prev) => ({ ...prev, isOpen: e.target.checked }))}
                      />
                      Open now
                    </label>

                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="isActive" checked={form.isActive} onChange={handleChange} />
                      Active
                    </label>

                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="isFeatured" checked={form.isFeatured} onChange={handleChange} />
                      Featured
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="block font-medium">Images (you can add multiple)</label>

                    <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const files = Array.from(e.target.files || []);
                            if (!files.length) return;
                            setForm((prev) => ({ ...prev, imageFiles: [...prev.imageFiles, ...files] }));
                          }}
                        />
                        📁 Choose Images
                      </label>

                      <span className="text-sm text-gray-600">
                        {form.imageFiles.length ? `${form.imageFiles.length} selected` : "No files selected"}
                      </span>
                    </div>

                    {!!form.imageFiles.length && (
                      <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2">
                        {form.imageFiles.map((f, i) => (
                          <div key={`${f.name}-${i}`} className="relative">
                            <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-24 object-cover rounded" />
                            <button
                              type="button"
                              className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                              onClick={() =>
                                setForm((prev) => {
                                  const next = [...prev.imageFiles];
                                  next.splice(i, 1);
                                  return { ...prev, imageFiles: next };
                                })
                              }
                              title="Remove"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {!!form.images.length && (
                      <>
                        <div className="text-sm text-gray-500 mt-3">Already saved</div>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                          {form.images.map((img, i) => (
                            <div key={`${img.url}-${i}`} className="relative">
                              <img src={img.url} alt={img.name || `img-${i}`} className="w-full h-24 object-cover rounded" />
                              <button
                                type="button"
                                className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                                onClick={() =>
                                  setForm((prev) => {
                                    const next = [...prev.images];
                                    next.splice(i, 1);
                                    return { ...prev, images: next };
                                  })
                                }
                                title="Remove from restaurant"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "hours" && (
                <div className="space-y-3">
                  <div className="text-sm text-gray-600">Set weekly operating hours</div>

                  {DAYS.map((d) => {
                    const day = form.hours?.[d.key] || {};

                    return (
                      <div key={d.key} className="flex items-center gap-3 border p-3 rounded">
                        <div className="w-20 font-semibold">{d.label}</div>

                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!day.closed}
                            onChange={(e) => updateHours(d.key, { closed: e.target.checked })}
                          />
                          Closed
                        </label>

                        {!day.closed && (
                          <>
                            <input
                              type="time"
                              value={day.open || ""}
                              onChange={(e) => updateHours(d.key, { open: e.target.value })}
                              className="border p-2 rounded"
                            />

                            <span>-</span>

                            <input
                              type="time"
                              value={day.close || ""}
                              onChange={(e) => updateHours(d.key, { close: e.target.value })}
                              className="border p-2 rounded"
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {activeTab === "menu" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">Create categories and add items.</div>
                    <button
                      type="button"
                      onClick={addCategory}
                      className="px-3 py-1.5 rounded bg-black text-white text-sm hover:opacity-90"
                    >
                      + Add Category
                    </button>
                  </div>

                  {(form.menu || []).length === 0 ? (
                    <div className="text-sm text-gray-500 border rounded p-4 bg-white">
                      No categories yet. Click “Add Category”.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {(form.menu || []).map((cat) => (
                        <div key={cat.id} className="border rounded bg-white p-4">
                          <div className="flex items-center gap-2">
                            <input
                              value={cat.name || ""}
                              onChange={(e) => updateCategoryName(cat.id, e.target.value)}
                              placeholder="Category name (e.g. Pizza)"
                              className="flex-1 border rounded p-2"
                            />
                            <button
                              type="button"
                              onClick={() => removeCategory(cat.id)}
                              className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <div className="font-semibold text-sm">Items</div>
                            <button
                              type="button"
                              onClick={() => addItem(cat.id)}
                              className="px-3 py-1.5 rounded bg-gray-900 text-white text-sm hover:opacity-90"
                            >
                              + Add Item
                            </button>
                          </div>

                          {(cat.items || []).length === 0 ? (
                            <div className="text-sm text-gray-500 mt-2">No items.</div>
                          ) : (
                            <div className="mt-3 space-y-3">
                              {(cat.items || []).map((it) => (
                                <div key={it.id} className="border rounded p-3 bg-gray-50">
                                  <div className="grid grid-cols-12 gap-2 items-start">
                                    <input
                                      className="col-span-3 border rounded p-2"
                                      placeholder="Item name"
                                      value={it.name || ""}
                                      onChange={(e) => updateItem(cat.id, it.id, { name: e.target.value })}
                                    />

                                    <input
                                      className="col-span-2 border rounded p-2"
                                      placeholder="Price"
                                      type="number"
                                      value={it.price ?? ""}
                                      onChange={(e) => updateItem(cat.id, it.id, { price: e.target.value })}
                                    />

                                    <label className="col-span-2 flex items-center gap-2 text-sm pt-2">
                                      <input
                                        type="checkbox"
                                        checked={!!it.isVeg}
                                        onChange={(e) => updateItem(cat.id, it.id, { isVeg: e.target.checked })}
                                      />
                                      Veg
                                    </label>

                                    <label className="col-span-2 flex items-center gap-2 text-sm pt-2">
                                      <input
                                        type="checkbox"
                                        checked={!!it.bestseller}
                                        onChange={(e) => updateItem(cat.id, it.id, { bestseller: e.target.checked })}
                                      />
                                      Bestseller
                                    </label>

                                    <div className="col-span-2">
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => {
                                          const f = e.target.files?.[0] || null;
                                          updateItem(cat.id, it.id, { imageFile: f });
                                        }}
                                        className="text-sm"
                                      />
                                      <div className="text-xs text-gray-500 mt-1">
                                        {it.image ? "Saved image ✅" : it.imageFile ? "New image selected" : "No image"}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => removeItem(cat.id, it.id)}
                                      className="col-span-1 text-red-600 hover:underline text-sm pt-2 text-right"
                                    >
                                      Remove
                                    </button>
                                  </div>

                                  <textarea
                                    className="mt-2 w-full border rounded p-2"
                                    rows={2}
                                    placeholder="Item description"
                                    value={it.description || ""}
                                    onChange={(e) => updateItem(cat.id, it.id, { description: e.target.value })}
                                  />

                                  {(it.imageFile || it.image) && (
                                    <div className="mt-2">
                                      <img
                                        src={it.imageFile ? URL.createObjectURL(it.imageFile) : it.image}
                                        alt=""
                                        className="h-24 w-36 object-cover rounded border"
                                      />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === "deals" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">Add offers/discounts for this restaurant.</div>
                    <button
                      type="button"
                      onClick={addDeal}
                      className="px-3 py-1.5 rounded bg-black text-white text-sm hover:opacity-90"
                    >
                      + Add Deal
                    </button>
                  </div>

                  {(form.deals || []).length === 0 ? (
                    <div className="text-sm text-gray-500 border rounded p-4 bg-white">No deals yet.</div>
                  ) : (
                    <div className="space-y-3">
                      {(form.deals || []).map((d) => (
                        <div key={d.id} className="border rounded bg-white p-4">
                          <div className="flex items-center gap-2">
                            <input
                              className="flex-1 border rounded p-2"
                              placeholder="Deal title (e.g. Happy Hour 50% Off)"
                              value={d.title || ""}
                              onChange={(e) => updateDeal(d.id, { title: e.target.value })}
                            />

                            <label className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={!!d.isActive}
                                onChange={(e) => updateDeal(d.id, { isActive: e.target.checked })}
                              />
                              Active
                            </label>

                            <button
                              type="button"
                              onClick={() => removeDeal(d.id)}
                              className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                            >
                              Delete
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <input
                              className="border rounded p-2"
                              placeholder="Subtitle (e.g. On selected dishes)"
                              value={d.subtitle || ""}
                              onChange={(e) => updateDeal(d.id, { subtitle: e.target.value })}
                            />

                            <input
                              className="border rounded p-2"
                              placeholder="Valid text (e.g. Valid till 11 PM)"
                              value={d.valid || ""}
                              onChange={(e) => updateDeal(d.id, { valid: e.target.value })}
                            />
                          </div>

                          <div className="grid grid-cols-12 gap-2 mt-3">
                            <select
                              className="col-span-3 border rounded p-2"
                              value={d.type || "percent"}
                              onChange={(e) => updateDeal(d.id, { type: e.target.value })}
                            >
                              <option value="percent">Percent %</option>
                              <option value="flat">Flat $</option>
                              <option value="bogo">BOGO</option>
                              <option value="code">Promo Code</option>
                            </select>

                            <input
                              className="col-span-3 border rounded p-2"
                              type="number"
                              placeholder={d.type === "percent" ? "Percent (e.g. 20)" : "Amount"}
                              value={d.amount ?? ""}
                              onChange={(e) => updateDeal(d.id, { amount: e.target.value })}
                            />

                            <input
                              className="col-span-3 border rounded p-2"
                              placeholder="Code (optional)"
                              value={d.code || ""}
                              onChange={(e) => updateDeal(d.id, { code: e.target.value })}
                            />

                            <div className="col-span-3 text-xs text-gray-500 flex items-center">Schedule below ↓</div>
                          </div>

                          <div className="mt-3">
                            <div className="text-xs font-medium text-gray-600 mb-2">Active Days</div>
                            <div className="flex flex-wrap gap-2">
                              {DAYS.map((day) => {
                                const active = (d.days || []).includes(day.key);
                                return (
                                  <button
                                    key={day.key}
                                    type="button"
                                    onClick={() => toggleDealDay(d.id, day.key)}
                                    className={`px-3 py-1 rounded-full text-xs border ${
                                      active
                                        ? "bg-black text-white border-black"
                                        : "bg-white text-gray-700 border-gray-300"
                                    }`}
                                  >
                                    {day.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 mt-3">
                            <input
                              type="time"
                              value={d.startTime || ""}
                              onChange={(e) => updateDeal(d.id, { startTime: e.target.value })}
                              className="border p-2 rounded"
                            />

                            <input
                              type="time"
                              value={d.endTime || ""}
                              onChange={(e) => updateDeal(d.id, { endTime: e.target.value })}
                              className="border p-2 rounded"
                            />
                          </div>

                          <div className="grid grid-cols-12 gap-2 mt-2">
                            <input
                              className="col-span-3 border rounded p-2"
                              type="datetime-local"
                              value={d.validFrom || ""}
                              onChange={(e) => updateDeal(d.id, { validFrom: e.target.value })}
                            />

                            <input
                              className="col-span-3 border rounded p-2"
                              type="datetime-local"
                              value={d.validTo || ""}
                              onChange={(e) => updateDeal(d.id, { validTo: e.target.value })}
                            />

                            <textarea
                              className="col-span-6 border rounded p-2"
                              rows={2}
                              placeholder="Notes / rules"
                              value={d.notes || ""}
                              onChange={(e) => updateDeal(d.id, { notes: e.target.value })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end mt-6 space-x-3 pt-2 border-t">
                <button
                  onClick={() => setModalOpen(false)}
                  type="button"
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editingData ? "Update Restaurant" : "Create Restaurant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Restaurant</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showMapModal} onClose={() => setShowMapModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Pick a Location</DialogTitle>
        <DialogContent dividers sx={{ overflow: "hidden" }}>
          <MapLocationInput
            value={form.mapLocation}
            onChange={(val) => {
              const coordsStr = `${val.lng.toFixed(6)},${val.lat.toFixed(6)}`;
              setForm((prev) => ({ ...prev, mapLocation: coordsStr }));
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMapModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowMapModal(false)} disabled={!form.mapLocation}>
            Save location
          </Button>
        </DialogActions>
      </Dialog>

      <ToastContainer />
    </main>
  );
}