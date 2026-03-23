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
  where,
  getDoc,
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
import { useSelector } from "react-redux";

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const ORDER_STATUSES = ["draft", "placed", "accepted", "preparing", "ready", "completed", "cancelled", "rejected"];
const PAYMENT_STATUSES = ["pending", "paid", "partially_paid", "failed", "refunded"];
const RESERVATION_MODES = ["native", "redirect", "waitlist_only", "disabled"];
const SERVICE_MODES = ["delivery", "pickup", "dineIn", "menuOnly"];
const SPLIT_MODES = ["single", "equal", "by_item", "manual"];

const CUISINE_OPTIONS = [
  "Indian",
  "Chinese",
  "Italian",
  "Thai",
  "Japanese",
  "Korean",
  "Mexican",
  "American",
  "Australian",
  "Mediterranean",
  "Middle Eastern",
  "Vietnamese",
  "Malaysian",
  "Indonesian",
  "Sri Lankan",
  "Nepalese",
  "Turkish",
  "Greek",
  "Lebanese",
  "French",
  "Spanish",
  "Burger",
  "Pizza",
  "Seafood",
  "Desserts",
  "Cafe",
  "Bakery",
  "Healthy",
  "Vegan",
  "Vegetarian",
  "BBQ",
  "Steakhouse",
  "Fusion",
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

const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const newModifierOption = () => ({
  id: createId("modopt"),
  name: "",
  priceDelta: "",
  isDefault: false,
  isAvailable: true,
  calories: "",
  nestedGroupIds: [],
});

const newModifierGroup = () => ({
  id: createId("modgrp"),
  name: "",
  description: "",
  selectionType: "single",
  isRequired: false,
  minSelect: 0,
  maxSelect: 1,
  freeCount: 0,
  appliesToServiceModes: ["delivery", "pickup", "dineIn"],
  options: [newModifierOption()],
});

const newMenuItem = () => ({
  id: createId("item"),
  name: "",
  price: "",
  compareAtPrice: "",
  description: "",
  isVeg: false,
  bestseller: false,
  spicyLevel: "",
  dietaryTags: [],
  allergenTags: [],
  image: "",
  imageFile: null,
  notesEnabled: true,
  availabilityState: "active",
  appliesToServiceModes: ["delivery", "pickup", "dineIn"],
  modifierGroups: [],
  schedule: {
    enabled: false,
    days: [],
    startTime: "",
    endTime: "",
  },
});

const newMenuCategory = () => ({
  id: createId("cat"),
  name: "",
  sortOrder: 0,
  items: [newMenuItem()],
});

const newMenu = () => ({
  id: createId("menu"),
  name: "Main Menu",
  type: "all_day",
  description: "",
  isActive: true,
  appliesToServiceModes: ["delivery", "pickup", "dineIn"],
  schedule: {
    enabled: false,
    days: [],
    startTime: "",
    endTime: "",
  },
  categories: [newMenuCategory()],
});

const newDeal = () => ({
  id: createId("deal"),
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
});

const newStaffRole = () => ({
  id: createId("staff"),
  name: "",
  email: "",
  role: "staff",
  branchScope: "current",
  canManageOrders: true,
  canManageStock: true,
  canManageReservations: false,
  canManageTables: false,
});

const newTable = () => ({
  id: createId("table"),
  label: "",
  capacity: "",
  qrCodeToken: "",
  isActive: true,
});

const initialFormData = {
  id: "",
  brandId: "",
  brandName: "",
  brandSlug: "",
  branchName: "",
  branchCode: "",
  shortDesc: "",
  description: "",
  cuisines: [],
  tags: [],
  priceRange: "$$",
  logo: null,
  logoFile: null,
  coverImage: null,
  coverImageFile: null,
  avgCostForTwo: "",
  costForTwo: "",
  deliveryTime: "",
  pickupTime: "",
  offerText: "",
  location: "",
  suburb: "",
  city: "",
  state: "",
  country: "Australia",
  postcode: "",
  timings: "",
  isOpen: true,
  rating: "",
  phone: [""],
  website: {
    name: "",
    url: "",
  },
  booking: {
    name: "",
    url: "",
  },
  address: "",
  mapLocation: "",
  images: [],
  imageFiles: [],
  isActive: true,
  isFeatured: false,
  allowPreorderWhenClosed: false,
  services: {
    delivery: true,
    pickup: true,
    dineIn: true,
    menuOnly: false,
  },
  hours: makeDefaultHours(),
  deliverySettings: {
    enabled: true,
    radiusKm: "5",
    minimumOrder: "",
    feeType: "flat",
    flatFee: "",
    perKmFee: "",
    freeDeliveryAbove: "",
    etaMinMins: "25",
    etaMaxMins: "40",
    allowScheduled: true,
    allowOutsideRadius: false,
    instructionsEnabled: true,
    contactPhoneRequired: false,
  },
  pickupSettings: {
    enabled: true,
    asapEnabled: true,
    scheduledEnabled: true,
    prepMins: "20",
    collectionInstructions: "",
    pickupNotesEnabled: true,
  },
  reservationSettings: {
    mode: "redirect",
    enabled: true,
    externalUrl: "",
    nativeEnabled: false,
    waitlistEnabled: false,
    minPartySize: "1",
    maxPartySize: "12",
    slotIntervalMins: "15",
    leadTimeMins: "60",
    allowSameDay: true,
    requirePhone: true,
    requireNotes: false,
    autoConfirm: false,
  },
  qrSettings: {
    enabled: false,
    manualTableEntryEnabled: true,
    sessionTimeoutMins: "90",
    allowRepeatOrders: true,
    openTabSupported: false,
    tables: [],
  },
  groupOrderSettings: {
    enabled: false,
    joinByQr: true,
    joinByCode: true,
    joinByLink: true,
    allowedSplitModes: ["single", "equal", "by_item", "manual"],
    requireOnePaymentBeforePrep: true,
    allowMultiPaymentsBeforePrep: false,
    allowOpenTabLater: false,
    hostCanLockCart: true,
  },
  menus: [newMenu()],
  deals: [],
  staff: [],
  analytics: {
    promotedPlacement: false,
    acceptReviews: true,
    showOtherBranches: true,
    trackImpressions: true,
    trackMenuViews: true,
    trackAddToCart: true,
    trackCheckoutStart: true,
    trackPaidOrders: true,
  },
  operations: {
    autoAcceptOrders: false,
    autoMarkReady: false,
    kitchenDisplayEnabled: false,
    reservationConsoleEnabled: true,
    orderNotesEnabled: true,
    cancellationReasonsEnabled: true,
    stockManagementMode: "manual",
    outOfStockAutoHide: false,
    requireMerchantAcceptBeforePrep: true,
    allowMerchantReject: true,
    prepBufferMins: "10",
    maxSimultaneousOrders: "",
    supportPhone: "",
    supportEmail: "",
  },
  reviewSettings: {
    enabled: true,
    verifiedOrdersOnly: true,
    requireCompletedOrder: true,
    allowMerchantReplies: true,
    moderationEnabled: true,
    minRatingToPublish: "1",
    autoPublish: false,
    allowPhotoReviews: false,
  },
};

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniquePath(folder, file) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const base = file.name.replace(/\.[^/.]+$/, "");
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${folder}/${base}_${stamp}.${ext}`;
}

function toMillis(val) {
  if (!val) return null;
  if (typeof val === "object" && val.seconds != null) return val.seconds * 1000;
  if (val?.toDate) return val.toDate().getTime();
  const ms = new Date(val).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function deriveTimings(hours) {
  if (!hours) return "";
  const openDays = Object.values(hours).filter((d) => !d.closed && d.open && d.close);
  if (!openDays.length) return "";
  return `${openDays[0].open} - ${openDays[0].close}`;
}

async function uploadFileIfAny(file, folder) {
  if (!file) return null;
  const sRef = storageRef(storage, uniquePath(folder, file));
  await uploadBytes(sRef, file);
  return getDownloadURL(sRef);
}

function DayToggleRow({ value = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS.map((day) => {
        const active = value.includes(day.key);
        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onToggle(day.key)}
            className={`px-3 py-1 rounded-full text-xs border ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"}`}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

function SectionCard({ title, subtitle, right, children }) {
  return (
    <div className="border rounded-xl bg-white p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{title}</div>
          {subtitle ? <div className="text-sm text-gray-500">{subtitle}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function ChipList({ items = [], onRemove }) {
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 text-sm border"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            className="text-gray-500 hover:text-red-600"
          >
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

export default function ManageRestaurantPage({ navbarHeight }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState({ name: "", cuisine: "", location: "" });
  const debounceRef = useRef(null);
  const [sortConfig, setSortConfig] = useState({ key: "updated", direction: "desc" });
  const [activeTab, setActiveTab] = useState("basic");
  const [form, setForm] = useState(initialFormData);
  const [selectedCuisine, setSelectedCuisine] = useState("");
  const [tagInput, setTagInput] = useState("");

  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);
  const restaurantId = emp?.restaurantid || null;

  useEffect(() => {
    if (!restaurantId) return;

    getList();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [restaurantId]);

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

  const getList = async () => {
    if (!restaurantId) return;

    setIsLoading(true);
    try {
      const snap = await getDoc(doc(db, "restaurants", restaurantId));

      if (!snap.exists()) {
        setList([]);
        return;
      }

      const item = { id: snap.id, ...snap.data() };
      setList([item]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load restaurant");
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

  const addCuisine = () => {
    if (!selectedCuisine) return;
    setForm((prev) => {
      const next = Array.isArray(prev.cuisines) ? prev.cuisines : [];
      if (next.includes(selectedCuisine)) return prev;
      return { ...prev, cuisines: [...next, selectedCuisine] };
    });
    setSelectedCuisine("");
  };

  const removeCuisine = (value) => {
    setForm((prev) => ({
      ...prev,
      cuisines: (prev.cuisines || []).filter((x) => x !== value),
    }));
  };

  const addTag = () => {
    const value = tagInput.trim();
    if (!value) return;

    setForm((prev) => {
      const next = Array.isArray(prev.tags) ? prev.tags : [];
      if (next.some((x) => x.toLowerCase() === value.toLowerCase())) return prev;
      return { ...prev, tags: [...next, value] };
    });

    setTagInput("");
  };

  const removeTag = (value) => {
    setForm((prev) => ({
      ...prev,
      tags: (prev.tags || []).filter((x) => x !== value),
    }));
  };

  const isNonEmpty = (value) => String(value || "").trim() !== "";

  const cleanModifierOptions = (options = []) => {
    return (options || [])
      .filter((opt) => isNonEmpty(opt.name))
      .map((opt) => ({
        id: opt.id || createId("modopt"),
        name: (opt.name || "").trim(),
        priceDelta: opt.priceDelta === "" ? 0 : Number(opt.priceDelta || 0),
        isDefault: !!opt.isDefault,
        isAvailable: opt.isAvailable !== false,
        calories: opt.calories === "" ? null : Number(opt.calories),
        nestedGroupIds: Array.isArray(opt.nestedGroupIds) ? opt.nestedGroupIds : [],
      }));
  };

  const cleanModifierGroups = (groups = []) => {
    return (groups || [])
      .filter((group) => isNonEmpty(group.name))
      .map((group) => {
        const cleanedOptions = cleanModifierOptions(group.options || []);

        return {
          id: group.id || createId("modgrp"),
          name: (group.name || "").trim(),
          description: (group.description || "").trim(),
          selectionType: group.selectionType || "single",
          isRequired: !!group.isRequired,
          minSelect: Number(group.minSelect || 0),
          maxSelect: Number(
            group.maxSelect || (group.selectionType === "single" ? 1 : 0)
          ),
          freeCount: Number(group.freeCount || 0),
          appliesToServiceModes: Array.isArray(group.appliesToServiceModes)
            ? group.appliesToServiceModes
            : [],
          options: cleanedOptions,
        };
      })
      .filter((group) => group.options.length > 0 || !group.isRequired);
  };

  const cleanMenuItems = (items = []) => {
    return (items || [])
      .filter((it) => isNonEmpty(it.name))
      .map((it) => ({
        id: it.id || createId("item"),
        name: (it.name || "").trim(),
        price: it.price === "" ? null : Number(it.price),
        compareAtPrice: it.compareAtPrice === "" ? null : Number(it.compareAtPrice),
        description: (it.description || "").trim(),
        isVeg: !!it.isVeg,
        bestseller: !!it.bestseller,
        spicyLevel: (it.spicyLevel || "").trim(),
        dietaryTags: Array.isArray(it.dietaryTags)
          ? it.dietaryTags
          : parseCsv(it.dietaryTags),
        allergenTags: Array.isArray(it.allergenTags)
          ? it.allergenTags
          : parseCsv(it.allergenTags),
        image: it.image || "",
        notesEnabled: !!it.notesEnabled,
        availabilityState: it.availabilityState || "active",
        appliesToServiceModes: Array.isArray(it.appliesToServiceModes)
          ? it.appliesToServiceModes
          : [],
        schedule: {
          enabled: !!it.schedule?.enabled,
          days: Array.isArray(it.schedule?.days) ? it.schedule.days : [],
          startTime: it.schedule?.startTime || "",
          endTime: it.schedule?.endTime || "",
        },
        modifierGroups: cleanModifierGroups(it.modifierGroups || []),
      }));
  };

  const cleanMenuCategories = (categories = []) => {
    return (categories || [])
      .map((cat, catIndex) => {
        const cleanedItems = cleanMenuItems(cat.items || []);
        return {
          id: cat.id || createId("cat"),
          name: (cat.name || "").trim(),
          sortOrder: cat.sortOrder === "" ? catIndex : Number(cat.sortOrder || catIndex),
          items: cleanedItems,
        };
      })
      .filter((cat) => isNonEmpty(cat.name) || cat.items.length > 0)
      .map((cat, index) => ({
        ...cat,
        name: isNonEmpty(cat.name) ? cat.name : `Category ${index + 1}`,
        sortOrder: index,
      }));
  };

  const cleanMenusForSave = (menus = []) => {
    return (menus || [])
      .map((menu) => {
        const cleanedCategories = cleanMenuCategories(menu.categories || []);

        return {
          id: menu.id || createId("menu"),
          name: (menu.name || "").trim(),
          type: menu.type || "all_day",
          description: (menu.description || "").trim(),
          isActive: !!menu.isActive,
          appliesToServiceModes: Array.isArray(menu.appliesToServiceModes)
            ? menu.appliesToServiceModes
            : [],
          schedule: {
            enabled: !!menu.schedule?.enabled,
            days: Array.isArray(menu.schedule?.days) ? menu.schedule.days : [],
            startTime: menu.schedule?.startTime || "",
            endTime: menu.schedule?.endTime || "",
          },
          categories: cleanedCategories,
        };
      })
      .filter((menu) => isNonEmpty(menu.name) || menu.categories.length > 0)
      .map((menu, index) => ({
        ...menu,
        name: isNonEmpty(menu.name) ? menu.name : `Menu ${index + 1}`,
      }));
  };
  const openCreate = () => {
    setActiveTab("basic");
    setEditing(null);
    setSelectedCuisine("");
    setTagInput("");
    setForm({
      ...initialFormData,
      hours: makeDefaultHours(),
      menus: [newMenu()],
      cuisines: [],
      tags: [],
      phone: [""],
    });
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setActiveTab("basic");
    setEditing(item);
    setSelectedCuisine("");
    setTagInput("");
    setForm({
      ...initialFormData,
      ...item,
      id: item.id,
      cuisines: Array.isArray(item.cuisines) ? item.cuisines : parseCsv(item.cuisines),
      tags: Array.isArray(item.tags) ? item.tags : parseCsv(item.tags),
      images: Array.isArray(item.images) ? item.images : [],
      imageFiles: [],
      mapLocation: item.mapLocation
        ? typeof item.mapLocation === "string"
          ? item.mapLocation
          : `${item.mapLocation.lng},${item.mapLocation.lat}`
        : "",
      menus: Array.isArray(item.menus) && item.menus.length ? item.menus : [newMenu()],
      deals: Array.isArray(item.deals) ? item.deals : [],
      staff: Array.isArray(item.staff) ? item.staff : [],
      operations: item.operations || initialFormData.operations,
      reviewSettings: item.reviewSettings || initialFormData.reviewSettings,
      qrSettings: item.qrSettings || initialFormData.qrSettings,
      reservationSettings: item.reservationSettings || initialFormData.reservationSettings,
      deliverySettings: item.deliverySettings || initialFormData.deliverySettings,
      pickupSettings: item.pickupSettings || initialFormData.pickupSettings,
      groupOrderSettings: item.groupOrderSettings || initialFormData.groupOrderSettings,
      services: item.services || initialFormData.services,
      analytics: item.analytics || initialFormData.analytics,
      phone: Array.isArray(item.phone)
        ? item.phone
        : item.phone
          ? [item.phone]
          : [""],
          website: item.website
  ? typeof item.website === "object"
    ? item.website
    : { name: "", url: item.website }
  : item.websiteUrl
  ? { name: "", url: item.websiteUrl }
  : { name: "", url: "" },

booking: item.booking
  ? typeof item.booking === "object"
    ? item.booking
    : { name: "", url: item.booking }
  : item.bookingLink || item.bookingUrl
  ? { name: "", url: item.bookingLink || item.bookingUrl }
  : { name: "", url: "" },
    });
    setModalOpen(true);
  };
  const addPhoneField = () => {
    setForm((prev) => ({
      ...prev,
      phone: [...(prev.phone || []), ""],
    }));
  };
  
  const updatePhoneField = (index, value) => {
    setForm((prev) => ({
      ...prev,
      phone: (prev.phone || []).map((p, i) => (i === index ? value : p)),
    }));
  };
  
  const removePhoneField = (index) => {
    setForm((prev) => {
      const next = [...(prev.phone || [])];
      next.splice(index, 1);
  
      return {
        ...prev,
        phone: next.length ? next : [""],
      };
    });
  };
  const removeImageAt = (index, key) => {
    setForm((prev) => {
      const next = [...(prev[key] || [])];
      next.splice(index, 1);
      return { ...prev, [key]: next };
    });
  };

  const toggleHoursDay = (dayKey, patch) => {
    setForm((prev) => ({
      ...prev,
      hours: {
        ...(prev.hours || {}),
        [dayKey]: { ...(prev.hours?.[dayKey] || {}), ...patch },
      },
    }));
  };

  const toggleDealDay = (dealId, dayKey) => {
    setForm((prev) => ({
      ...prev,
      deals: (prev.deals || []).map((d) => {
        if (d.id !== dealId) return d;
        const exists = (d.days || []).includes(dayKey);
        return { ...d, days: exists ? d.days.filter((x) => x !== dayKey) : [...(d.days || []), dayKey] };
      }),
    }));
  };

  const toggleValueInArray = (current = [], value) =>
    current.includes(value) ? current.filter((x) => x !== value) : [...current, value];

  const addMenu = () => setForm((prev) => ({ ...prev, menus: [...(prev.menus || []), newMenu()] }));
  const removeMenu = (menuId) => setForm((prev) => ({ ...prev, menus: prev.menus.filter((m) => m.id !== menuId) }));
  const updateMenu = (menuId, patch) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) => (m.id === menuId ? { ...m, ...patch } : m)),
    }));

  const addCategory = (menuId) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) => (m.id === menuId ? { ...m, categories: [...(m.categories || []), newMenuCategory()] } : m)),
    }));

  const updateCategory = (menuId, catId, patch) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId
          ? {
            ...m,
            categories: (m.categories || []).map((c) => (c.id === catId ? { ...c, ...patch } : c)),
          }
          : m
      ),
    }));

  const removeCategory = (menuId, catId) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId ? { ...m, categories: (m.categories || []).filter((c) => c.id !== catId) } : m
      ),
    }));

  const addItem = (menuId, catId) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId
          ? {
            ...m,
            categories: (m.categories || []).map((c) =>
              c.id === catId ? { ...c, items: [...(c.items || []), newMenuItem()] } : c
            ),
          }
          : m
      ),
    }));

  const updateItem = (menuId, catId, itemId, patch) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId
          ? {
            ...m,
            categories: (m.categories || []).map((c) =>
              c.id === catId
                ? { ...c, items: (c.items || []).map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
                : c
            ),
          }
          : m
      ),
    }));

  const removeItem = (menuId, catId, itemId) =>
    setForm((prev) => ({
      ...prev,
      menus: prev.menus.map((m) =>
        m.id === menuId
          ? {
            ...m,
            categories: (m.categories || []).map((c) =>
              c.id === catId ? { ...c, items: (c.items || []).filter((it) => it.id !== itemId) } : c
            ),
          }
          : m
      ),
    }));

  const addModifierGroup = (menuId, catId, itemId) =>
    updateItem(menuId, catId, itemId, {
      modifierGroups: [
        ...(form.menus
          .find((m) => m.id === menuId)
          ?.categories.find((c) => c.id === catId)
          ?.items.find((it) => it.id === itemId)?.modifierGroups || []),
        newModifierGroup(),
      ],
    });

  const updateModifierGroup = (menuId, catId, itemId, groupId, patch) => {
    const item = form.menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);
    const modifierGroups = (item?.modifierGroups || []).map((g) => (g.id === groupId ? { ...g, ...patch } : g));
    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const removeModifierGroup = (menuId, catId, itemId, groupId) => {
    const item = form.menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);
    const modifierGroups = (item?.modifierGroups || []).filter((g) => g.id !== groupId);
    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const addModifierOption = (menuId, catId, itemId, groupId) => {
    const item = form.menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);
    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId ? { ...g, options: [...(g.options || []), newModifierOption()] } : g
    );
    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const updateModifierOption = (menuId, catId, itemId, groupId, optionId, patch) => {
    const item = form.menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);
    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId
        ? { ...g, options: (g.options || []).map((o) => (o.id === optionId ? { ...o, ...patch } : o)) }
        : g
    );
    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const removeModifierOption = (menuId, catId, itemId, groupId, optionId) => {
    const item = form.menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);
    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId ? { ...g, options: (g.options || []).filter((o) => o.id !== optionId) } : g
    );
    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const addDeal = () => setForm((prev) => ({ ...prev, deals: [...(prev.deals || []), newDeal()] }));
  const updateDeal = (dealId, patch) =>
    setForm((prev) => ({ ...prev, deals: prev.deals.map((d) => (d.id === dealId ? { ...d, ...patch } : d)) }));
  const removeDeal = (dealId) => setForm((prev) => ({ ...prev, deals: prev.deals.filter((d) => d.id !== dealId) }));

  const addStaff = () => setForm((prev) => ({ ...prev, staff: [...(prev.staff || []), newStaffRole()] }));
  const updateStaff = (id, patch) =>
    setForm((prev) => ({ ...prev, staff: prev.staff.map((s) => (s.id === id ? { ...s, ...patch } : s)) }));
  const removeStaff = (id) => setForm((prev) => ({ ...prev, staff: prev.staff.filter((s) => s.id !== id) }));

  const addTable = () =>
    setForm((prev) => ({
      ...prev,
      qrSettings: { ...(prev.qrSettings || {}), tables: [...(prev.qrSettings?.tables || []), newTable()] },
    }));

  const updateTable = (id, patch) =>
    setForm((prev) => ({
      ...prev,
      qrSettings: {
        ...(prev.qrSettings || {}),
        tables: (prev.qrSettings?.tables || []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
      },
    }));

  const removeTable = (id) =>
    setForm((prev) => ({
      ...prev,
      qrSettings: { ...(prev.qrSettings || {}), tables: (prev.qrSettings?.tables || []).filter((t) => t.id !== id) },
    }));

  const uploadMenuItemImagesIfAny = async (menus) => {
    const uploads = [];
    for (const menu of menus || []) {
      for (const cat of menu.categories || []) {
        for (const it of cat.items || []) {
          if (it?.imageFile) uploads.push({ menuId: menu.id, catId: cat.id, itemId: it.id, file: it.imageFile });
        }
      }
    }

    if (!uploads.length) return menus;

    const results = await Promise.all(
      uploads.map(async (u) => {
        const path = uniquePath(
          `restaurant_menu_items/${form.brandName || form.branchName || "restaurant"}/${u.menuId}/${u.catId}`,
          u.file
        );
        const sRef = storageRef(storage, path);
        await uploadBytes(sRef, u.file);
        const url = await getDownloadURL(sRef);
        return { ...u, url };
      })
    );

    return (menus || []).map((menu) => ({
      ...menu,
      categories: (menu.categories || []).map((cat) => ({
        ...cat,
        items: (cat.items || []).map((it) => {
          const hit = results.find((r) => r.menuId === menu.id && r.catId === cat.id && r.itemId === it.id);
          return hit ? { ...it, image: hit.url, imageFile: null } : it;
        }),
      })),
    }));
  };

  const validateForm = () => {
    // if (!form.brandName.trim()) return "Brand name required";
    if (!form.branchName.trim()) return "Branch name required";
    if (!form.address.trim()) return "Address required";

    const cleanedMenus = cleanMenusForSave(form.menus || []);

    for (const menu of cleanedMenus) {
      for (const cat of menu.categories || []) {
        for (const item of cat.items || []) {
          for (const group of item.modifierGroups || []) {
            if (!group.name?.trim()) return "Modifier group name required";

            if (group.isRequired && (!group.options || group.options.length < 1)) {
              return `Required modifier group "${group.name}" must have at least 1 option`;
            }

            if (
              group.isRequired &&
              (group.selectionType === "single" || Number(group.maxSelect) >= 1)
            ) {
              continue;
            }

            if (group.isRequired && Number(group.maxSelect || 0) < 1) {
              return `Modifier group "${group.name}" must allow at least 1 selection`;
            }
          }
        }
      }
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const error = validateForm();
      if (error) {
        toast.error(error);
        return;
      }

      const uploadedGallery = form.imageFiles?.length
        ? await Promise.all(
          form.imageFiles.map(async (file) => {
            const path = uniquePath(
              `restaurant_images/${form.brandName || form.branchName || "restaurant"}`,
              file
            );
            const sRef = storageRef(storage, path);
            await uploadBytes(sRef, file);
            const url = await getDownloadURL(sRef);
            return { url, name: file.name };
          })
        )
        : [];

      const logoUrl = form.logoFile
        ? await uploadFileIfAny(
          form.logoFile,
          `restaurant_brand_logos/${form.brandName || "brand"}`
        )
        : form.logo;

      const coverUrl = form.coverImageFile
        ? await uploadFileIfAny(
          form.coverImageFile,
          `restaurant_cover_images/${form.brandName || "brand"}`
        )
        : form.coverImage;

      const menusWithImages = await uploadMenuItemImagesIfAny(form.menus || []);
      const menusClean = cleanMenusForSave(menusWithImages || []);

      const payload = {
        brandId: form.brandId || "",
        brandName: form.brandName.trim(),
        brandSlug: form.brandSlug.trim(),
        branchName: form.branchName.trim(),
        branchCode: form.branchCode.trim(),
        shortDesc: form.shortDesc.trim(),
        description: form.description.trim(),
        cuisines: Array.isArray(form.cuisines) ? form.cuisines : parseCsv(form.cuisines),
        tags: Array.isArray(form.tags) ? form.tags : parseCsv(form.tags),
        priceRange: form.priceRange,
        logo: logoUrl || null,
        coverImage: coverUrl || null,
        avgCostForTwo: form.avgCostForTwo === "" ? null : Number(form.avgCostForTwo),
        costForTwo: form.costForTwo.trim(),
        deliveryTime: form.deliveryTime.trim(),
        pickupTime: form.pickupTime.trim(),
        offerText: form.offerText.trim(),
        location: form.location.trim(),
        suburb: form.suburb.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim(),
        postcode: form.postcode.trim(),
        timings: form.timings.trim() || deriveTimings(form.hours),
        isOpen: !!form.isOpen,
        rating: form.rating === "" ? null : Number(form.rating),
        // phone: form.phone.trim(),
        phone: Array.isArray(form.phone)
  ? form.phone.map((p) => String(p || "").trim()).filter(Boolean)
  : String(form.phone || "").trim()
  ? [String(form.phone || "").trim()]
  : [],
  website: {
    name: (form.website?.name || "").trim(),
    url: (form.website?.url || "").trim(),
  },
  booking: {
    name: (form.booking?.name || "").trim(),
    url: (form.booking?.url || "").trim(),
  },
        // website: form.website.trim(),
        // bookingUrl: form.bookingUrl.trim(),
        address: form.address.trim(),
        mapLocation: form.mapLocation
          ? (() => {
            const [lng, lat] = String(form.mapLocation)
              .split(",")
              .map((n) => Number(n));
            return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
          })()
          : null,
        images: [...(form.images || []), ...uploadedGallery],
        isActive: !!form.isActive,
        isFeatured: !!form.isFeatured,
        allowPreorderWhenClosed: !!form.allowPreorderWhenClosed,

        services: {
          delivery: !!form.services?.delivery,
          pickup: !!form.services?.pickup,
          dineIn: !!form.services?.dineIn,
          menuOnly: !!form.services?.menuOnly,
        },

        hours: form.hours || makeDefaultHours(),

        deliverySettings: {
          ...form.deliverySettings,
          radiusKm:
            form.deliverySettings.radiusKm === ""
              ? null
              : Number(form.deliverySettings.radiusKm),
          minimumOrder:
            form.deliverySettings.minimumOrder === ""
              ? null
              : Number(form.deliverySettings.minimumOrder),
          flatFee:
            form.deliverySettings.flatFee === ""
              ? null
              : Number(form.deliverySettings.flatFee),
          perKmFee:
            form.deliverySettings.perKmFee === ""
              ? null
              : Number(form.deliverySettings.perKmFee),
          freeDeliveryAbove:
            form.deliverySettings.freeDeliveryAbove === ""
              ? null
              : Number(form.deliverySettings.freeDeliveryAbove),
          etaMinMins:
            form.deliverySettings.etaMinMins === ""
              ? null
              : Number(form.deliverySettings.etaMinMins),
          etaMaxMins:
            form.deliverySettings.etaMaxMins === ""
              ? null
              : Number(form.deliverySettings.etaMaxMins),
        },

        pickupSettings: {
          ...form.pickupSettings,
          prepMins:
            form.pickupSettings.prepMins === ""
              ? null
              : Number(form.pickupSettings.prepMins),
        },

        reservationSettings: {
          ...form.reservationSettings,
          minPartySize: Number(form.reservationSettings.minPartySize || 1),
          maxPartySize: Number(form.reservationSettings.maxPartySize || 12),
          slotIntervalMins: Number(form.reservationSettings.slotIntervalMins || 15),
          leadTimeMins: Number(form.reservationSettings.leadTimeMins || 60),
        },

        qrSettings: {
          ...form.qrSettings,
          sessionTimeoutMins: Number(form.qrSettings.sessionTimeoutMins || 90),
          tables: (form.qrSettings.tables || []).map((t) => ({
            id: t.id,
            label: (t.label || "").trim(),
            capacity: t.capacity === "" ? null : Number(t.capacity),
            qrCodeToken: (t.qrCodeToken || "").trim(),
            isActive: !!t.isActive,
          })),
        },

        groupOrderSettings: form.groupOrderSettings,

        menus: menusClean,

        deals: (form.deals || [])
          .filter((d) => (d.title || "").trim())
          .map((d) => ({
            ...d,
            title: (d.title || "").trim(),
            subtitle: (d.subtitle || "").trim(),
            amount: d.amount === "" ? null : Number(d.amount),
            code: (d.code || "").trim(),
            valid: (d.valid || "").trim(),
            notes: (d.notes || "").trim(),
          })),

        staff: (form.staff || [])
          .filter((s) => (s.name || "").trim() || (s.email || "").trim())
          .map((s) => ({
            ...s,
            name: (s.name || "").trim(),
            email: (s.email || "").trim(),
          })),

        analytics: form.analytics,

        operations: {
          ...form.operations,
          prepBufferMins:
            form.operations.prepBufferMins === ""
              ? null
              : Number(form.operations.prepBufferMins),
          maxSimultaneousOrders:
            form.operations.maxSimultaneousOrders === ""
              ? null
              : Number(form.operations.maxSimultaneousOrders),
          supportPhone: form.operations.supportPhone?.trim?.() || "",
          supportEmail: form.operations.supportEmail?.trim?.() || "",
        },

        reviewSettings: {
          ...form.reviewSettings,
          minRatingToPublish: Number(form.reviewSettings.minRatingToPublish || 1),
        },

        updatedAt: Timestamp.now(),
        uid: uid || null,
        restaurantid: editingData?.id || restaurantId || "",
      };

      if (editingData?.id) {
        await updateDoc(doc(db, "restaurants", editingData.id), payload);
        toast.success("Restaurant updated ✅");
      } else if (restaurantId) {
        await updateDoc(doc(db, "restaurants", restaurantId), payload);
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
      setSelectedCuisine("");
      setTagInput("");
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

  const filtered = useMemo(() => {
    const nameQ = (filters.name || "").toLowerCase();
    const cuisineQ = (filters.cuisine || "").toLowerCase();
    const locQ = (filters.location || "").toLowerCase();

    return list.filter((r) => {
      const label = `${r.brandName || ""} ${r.branchName || r.name || ""}`.toLowerCase();
      const okName = !nameQ || label.includes(nameQ);
      const cuisineLabel = Array.isArray(r.cuisines) ? r.cuisines.join(", ") : r.cuisines || "";
      const okCuisine = !cuisineQ || cuisineLabel.toLowerCase().includes(cuisineQ);
      const okLoc = !locQ || `${r.address || ""} ${r.location || ""}`.toLowerCase().includes(locQ);
      return okName && okCuisine && okLoc;
    });
  }, [list, filters]);

  const getSortVal = (r, key) => {
    if (key === "name") return `${r.brandName || ""} ${r.branchName || r.name || ""}`.toLowerCase();
    if (key === "cuisine") return (Array.isArray(r.cuisines) ? r.cuisines : []).join(", ").toLowerCase();
    if (key === "location") return (r.address || "").toLowerCase();
    if (key === "updated") return toMillis(r.updatedAt) ?? toMillis(r.createdAt) ?? 0;
    return "";
  };

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
        {/* <button className="px-4 py-2 bg-black text-white rounded hover:bg-gray-900" onClick={openCreate}>
          + Add Restaurant Branch
        </button> */}
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
                  { key: "name", label: "Brand / Branch" },
                  { key: "cuisine", label: "Cuisines" },
                  { key: "location", label: "Location" },
                  { key: "services", label: "Service Modes", sortable: false },
                  { key: "menu", label: "Menus", sortable: false },
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
                        {sortConfig.key === col.key && <span className="text-gray-400">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="Search brand / branch" defaultValue={filters.name} onChange={(e) => setFilterDebounced("name", e.target.value)} />
                </th>
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="Search cuisine" defaultValue={filters.cuisine} onChange={(e) => setFilterDebounced("cuisine", e.target.value)} />
                </th>
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="Search location" defaultValue={filters.location} onChange={(e) => setFilterDebounced("location", e.target.value)} />
                </th>
                {Array.from({ length: 7 }).map((_, i) => <th key={i} className="px-6 pb-3" />)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-6 py-10 text-center text-gray-500">No restaurant branches found.</td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const menuCount = Array.isArray(item.menus) ? item.menus.length : Array.isArray(item.menu) ? 1 : 0;
                  const activeDealsCount = Array.isArray(item.deals) ? item.deals.filter((d) => d?.isActive).length : 0;
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold">{item.brandName || item.name || "—"}</div>
                        <div className="text-xs text-gray-500">{item.branchName || item.shortDesc || "—"}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{(item.cuisines || []).slice(0, 3).join(", ") || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">{item.address || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex flex-wrap gap-1">
                          {item?.services?.delivery ? <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Delivery</span> : null}
                          {item?.services?.pickup ? <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Pickup</span> : null}
                          {item?.services?.dineIn ? <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Dine-In</span> : null}
                          {item?.services?.menuOnly ? <span className="px-2 py-0.5 rounded-full text-xs bg-slate-100">Menu-Only</span> : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-flex items-center justify-center h-6 min-w-10 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{menuCount} menus</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-flex items-center justify-center h-6 min-w-10 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{activeDealsCount} active</span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{item.isActive ? "Active" : "Inactive"}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {item.coverImage || item.images?.[0]?.url ? <img src={item.coverImage || item.images[0].url} alt="" width={80} height={80} className="rounded object-cover" /> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{(() => { const ms = toMillis(item.updatedAt) ?? toMillis(item.createdAt); return ms ? dayjs(ms).format("MMM DD, YYYY") : "—"; })()}</td>
                      <td className="px-6 py-4 text-sm">
                        <button className="text-blue-600 hover:underline mr-3" onClick={() => openEdit(item)}>Edit</button>
                        {/* <button className="text-red-600 hover:underline" onClick={() => { setDelete(item); setConfirmDeleteOpen(true); }}>Delete</button> */}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-7xl max-h-[92vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">{editingData ? "Edit Restaurant Branch" : "Create Restaurant Branch"}</h2>
              <button type="button" className="text-gray-600 hover:text-black" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["basic", "Basic"],
                ["hours", "Hours"],
                ["serviceModes", "Service Modes"],
                ["delivery", "Delivery / Pickup"],
                ["ops", "Operations"],
              ].map(([k, t]) => (
                <button key={k} type="button" onClick={() => setActiveTab(k)} className={`px-3 py-1.5 rounded-full text-sm border ${activeTab === k ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"}`}>{t}</button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {activeTab === "basic" && (
                <div className="space-y-4">
                  <SectionCard title="Restaurant / Branch">
                    <div className="grid grid-cols-2 gap-3">
                      <input name="branchName" value={form.branchName} onChange={handleChange} placeholder="Branch name" className="w-full border border-gray-300 p-2 rounded" required />
                      <input name="branchCode" value={form.branchCode} onChange={handleChange} placeholder="Branch code" className="w-full border border-gray-300 p-2 rounded" />
                    </div>
                    <input name="shortDesc" value={form.shortDesc} onChange={handleChange} placeholder="Short description" className="w-full border border-gray-300 p-2 rounded" />
                    <textarea name="description" value={form.description} onChange={handleChange} placeholder="Full description" className="w-full border border-gray-300 p-2 rounded" rows={4} />
                  </SectionCard>

                  <SectionCard title="Storefront Content">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Cuisines</label>
                        <div className="flex gap-2">
                          <select
                            value={selectedCuisine}
                            onChange={(e) => setSelectedCuisine(e.target.value)}
                            className="w-full border border-gray-300 p-2 rounded"
                          >
                            <option value="">Select cuisine</option>
                            {CUISINE_OPTIONS.filter((c) => !(form.cuisines || []).includes(c)).map((cuisine) => (
                              <option key={cuisine} value={cuisine}>
                                {cuisine}
                              </option>
                            ))}
                          </select>
                          <button type="button" onClick={addCuisine} className="px-4 py-2 rounded bg-black text-white whitespace-nowrap">
                            Add
                          </button>
                        </div>
                        <ChipList items={form.cuisines || []} onRemove={removeCuisine} />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Tags</label>
                        <div className="flex gap-2">
                          <input
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addTag();
                              }
                            }}
                            placeholder="Enter tag"
                            className="w-full border border-gray-300 p-2 rounded"
                          />
                          <button type="button" onClick={addTag} className="px-4 py-2 rounded bg-black text-white whitespace-nowrap">
                            Add
                          </button>
                        </div>
                        <ChipList items={form.tags || []} onRemove={removeTag} />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-3">
                      <select name="priceRange" value={form.priceRange} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                        <option value="$">$</option>
                        <option value="$$">$$</option>
                        <option value="$$$">$$$</option>
                        <option value="$$$$">$$$$</option>
                      </select>
                      <input name="avgCostForTwo" value={form.avgCostForTwo} onChange={handleChange} placeholder="Avg cost for 2" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="costForTwo" value={form.costForTwo} onChange={handleChange} placeholder="Cost for two label" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="rating" value={form.rating} onChange={handleChange} placeholder="Rating" className="w-full border border-gray-300 p-2 rounded" />
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <input name="offerText" value={form.offerText} onChange={handleChange} placeholder="Offer text" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="deliveryTime" value={form.deliveryTime} onChange={handleChange} placeholder="Delivery ETA label" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="pickupTime" value={form.pickupTime} onChange={handleChange} placeholder="Pickup ETA label" className="w-full border border-gray-300 p-2 rounded" />
                    </div>
                  </SectionCard>

                  <SectionCard title="Contact & Location">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium">Phone</label>
                          <button
                            type="button"
                            onClick={addPhoneField}
                            className="px-3 py-1 rounded bg-black text-white text-xs"
                          >
                            + Add Phone
                          </button>
                        </div>

                        {(form.phone || [""]).map((phoneValue, index) => (
                          <div key={index} className="flex gap-2">
                            <input
                              name="phone"
                              value={phoneValue}
                              onChange={(e) => updatePhoneField(index, e.target.value)}
                              placeholder={`Phone ${index + 1}`}
                              className="w-full border border-gray-300 p-2 rounded"
                            />
                            {(form.phone || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePhoneField(index)}
                                className="px-3 py-2 border rounded text-red-600"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
  {/* Website */}
  <input
    value={form.website.name}
    onChange={(e) =>
      setForm((prev) => ({
        ...prev,
        website: { ...prev.website, name: e.target.value },
      }))
    }
    placeholder="Website Name (e.g. Google)"
    className="w-full border border-gray-300 p-2 rounded"
  />
  <input
    type="url"
    value={form.website.url}
    onChange={(e) =>
      setForm((prev) => ({
        ...prev,
        website: { ...prev.website, url: e.target.value },
      }))
    }
    placeholder="Website URL"
    className="w-full border border-gray-300 p-2 rounded"
  />

  {/* Booking */}
  <input
    value={form.booking.name}
    onChange={(e) =>
      setForm((prev) => ({
        ...prev,
        booking: { ...prev.booking, name: e.target.value },
      }))
    }
    placeholder="Booking Name (e.g. Reserve Table)"
    className="w-full border border-gray-300 p-2 rounded"
  />
  <input
    type="url"
    value={form.booking.url}
    onChange={(e) =>
      setForm((prev) => ({
        ...prev,
        booking: { ...prev.booking, url: e.target.value },
      }))
    }
    placeholder="Booking URL"
    className="w-full border border-gray-300 p-2 rounded"
  />
</div>
                      {/* <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" className="w-full border border-gray-300 p-2 rounded" /> */}
                      {/* <input name="website" value={form.website} onChange={handleChange} placeholder="Website" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="bookingUrl" value={form.bookingUrl} onChange={handleChange} placeholder="Booking URL" className="w-full border border-gray-300 p-2 rounded" /> */}
                      <input name="location" value={form.location} onChange={handleChange} placeholder="Location label" className="w-full border border-gray-300 p-2 rounded" />
                    </div>
                    <input name="address" value={form.address} onChange={handleChange} placeholder="Full address" className="w-full border border-gray-300 p-2 rounded" required />
                    <div className="grid grid-cols-4 gap-3">
                      <input name="suburb" value={form.suburb} onChange={handleChange} placeholder="Suburb" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="city" value={form.city} onChange={handleChange} placeholder="City" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="state" value={form.state} onChange={handleChange} placeholder="State" className="w-full border border-gray-300 p-2 rounded" />
                      <input name="postcode" value={form.postcode} onChange={handleChange} placeholder="Postcode" className="w-full border border-gray-300 p-2 rounded" />
                    </div>
                    <div className="relative">
                      <input name="mapLocation" readOnly value={form.mapLocation} onClick={() => setShowMapModal(true)} placeholder="Select on map" className="w-full border border-gray-300 p-2 pl-10 rounded cursor-pointer" />
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                    </div>
                  </SectionCard>

                  <SectionCard title="Media">
                    <div className="border rounded p-4 w-64">
                      <div className="font-medium mb-2">Logo</div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            logoFile: e.target.files?.[0] || null,
                          }))
                        }
                      />
                      {(form.logoFile || form.logo) && (
                        <img
                          src={form.logoFile ? URL.createObjectURL(form.logoFile) : form.logo}
                          alt="logo"
                          className="mt-3 h-28 w-28 object-cover rounded border"
                        />
                      )}
                    </div>
                  </SectionCard>

                  <SectionCard title="Branch Flags">
                    <div className="flex flex-wrap gap-4 text-sm">
                      {[["isOpen", "Open now"], ["isActive", "Active"], ["isFeatured", "Featured"], ["allowPreorderWhenClosed", "Allow preorder when closed"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form[key]} onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.checked }))} /> {label}</label>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              )}

              {activeTab === "hours" && (
                <SectionCard title="Weekly Hours" subtitle="Used for discovery, ordering availability, and scheduled validation">
                  {DAYS.map((d) => {
                    const day = form.hours?.[d.key] || {};
                    return (
                      <div key={d.key} className="flex items-center gap-3 border p-3 rounded">
                        <div className="w-20 font-semibold">{d.label}</div>
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={!!day.closed} onChange={(e) => toggleHoursDay(d.key, { closed: e.target.checked })} /> Closed
                        </label>
                        {!day.closed && (
                          <>
                            <input type="time" value={day.open || ""} onChange={(e) => toggleHoursDay(d.key, { open: e.target.value })} className="border p-2 rounded" />
                            <span>-</span>
                            <input type="time" value={day.close || ""} onChange={(e) => toggleHoursDay(d.key, { close: e.target.value })} className="border p-2 rounded" />
                          </>
                        )}
                      </div>
                    );
                  })}
                </SectionCard>
              )}

              {activeTab === "serviceModes" && (
                <div className="space-y-4">
                  <SectionCard title="Service Modes">
                    <div className="flex flex-wrap gap-4 text-sm">
                      {[["delivery", "Delivery"], ["pickup", "Pickup"], ["dineIn", "Dine-In QR"], ["menuOnly", "Menu-Only Display"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form.services?.[key]} onChange={(e) => setForm((prev) => ({ ...prev, services: { ...(prev.services || {}), [key]: e.target.checked } }))} /> {label}</label>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="Analytics / Visibility Flags">
                    <div className="flex flex-wrap gap-4 text-sm">
                      {[["promotedPlacement", "Promoted placement"], ["acceptReviews", "Accept reviews"], ["showOtherBranches", "Show other branches"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form.analytics?.[key]} onChange={(e) => setForm((prev) => ({ ...prev, analytics: { ...(prev.analytics || {}), [key]: e.target.checked } }))} /> {label}</label>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              )}

              {activeTab === "delivery" && (
                <div className="space-y-4">
                  <SectionCard title="Delivery Settings" subtitle="PRD: radius, fee, min order, ETA, scheduled ordering">
                    <div className="flex flex-wrap gap-4 text-sm mb-2">
                      {[["enabled", "Delivery enabled"], ["allowScheduled", "Allow scheduled delivery"], ["allowOutsideRadius", "Allow outside radius"], ["instructionsEnabled", "Delivery instructions enabled"], ["contactPhoneRequired", "Phone required"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form.deliverySettings?.[key]} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...(prev.deliverySettings || {}), [key]: e.target.checked } }))} /> {label}</label>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <input value={form.deliverySettings.radiusKm} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, radiusKm: e.target.value } }))} placeholder="Radius km" className="border p-2 rounded" />
                      <input value={form.deliverySettings.minimumOrder} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, minimumOrder: e.target.value } }))} placeholder="Minimum order" className="border p-2 rounded" />
                      <select value={form.deliverySettings.feeType} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, feeType: e.target.value } }))} className="border p-2 rounded">
                        <option value="flat">Flat fee</option>
                        <option value="distance">Distance fee</option>
                      </select>
                      <input value={form.deliverySettings.flatFee} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, flatFee: e.target.value } }))} placeholder="Flat fee" className="border p-2 rounded" />
                      <input value={form.deliverySettings.perKmFee} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, perKmFee: e.target.value } }))} placeholder="Per km fee" className="border p-2 rounded" />
                      <input value={form.deliverySettings.freeDeliveryAbove} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, freeDeliveryAbove: e.target.value } }))} placeholder="Free delivery above" className="border p-2 rounded" />
                      <input value={form.deliverySettings.etaMinMins} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, etaMinMins: e.target.value } }))} placeholder="ETA min mins" className="border p-2 rounded" />
                      <input value={form.deliverySettings.etaMaxMins} onChange={(e) => setForm((prev) => ({ ...prev, deliverySettings: { ...prev.deliverySettings, etaMaxMins: e.target.value } }))} placeholder="ETA max mins" className="border p-2 rounded" />
                    </div>
                  </SectionCard>

                  <SectionCard title="Pickup Settings" subtitle="PRD: ASAP vs scheduled, pickup notes, branch instructions">
                    <div className="flex flex-wrap gap-4 text-sm mb-2">
                      {[["enabled", "Pickup enabled"], ["asapEnabled", "ASAP enabled"], ["scheduledEnabled", "Scheduled pickup"], ["pickupNotesEnabled", "Pickup notes enabled"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form.pickupSettings?.[key]} onChange={(e) => setForm((prev) => ({ ...prev, pickupSettings: { ...(prev.pickupSettings || {}), [key]: e.target.checked } }))} /> {label}</label>
                      ))}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <input value={form.pickupSettings.prepMins} onChange={(e) => setForm((prev) => ({ ...prev, pickupSettings: { ...prev.pickupSettings, prepMins: e.target.value } }))} placeholder="Prep mins" className="border p-2 rounded" />
                      <input value={form.pickupSettings.collectionInstructions} onChange={(e) => setForm((prev) => ({ ...prev, pickupSettings: { ...prev.pickupSettings, collectionInstructions: e.target.value } }))} placeholder="Collection instructions" className="border p-2 rounded" />
                    </div>
                  </SectionCard>

                  <SectionCard title="Group Ordering Settings" subtitle="PRD: join methods + split logic scaffolding">
                    <div className="flex flex-wrap gap-4 text-sm mb-3">
                      {[["enabled", "Group ordering enabled"], ["joinByQr", "Join by QR"], ["joinByCode", "Join by code"], ["joinByLink", "Join by link"], ["requireOnePaymentBeforePrep", "Require one payment before prep"], ["allowMultiPaymentsBeforePrep", "Allow multiple payments before prep"], ["allowOpenTabLater", "Allow open tab later"], ["hostCanLockCart", "Host can lock cart"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form.groupOrderSettings?.[key]} onChange={(e) => setForm((prev) => ({ ...prev, groupOrderSettings: { ...(prev.groupOrderSettings || {}), [key]: e.target.checked } }))} /> {label}</label>
                      ))}
                    </div>
                    <div>
                      <div className="text-sm font-medium mb-2">Allowed split modes</div>
                      <div className="flex flex-wrap gap-2">
                        {SPLIT_MODES.map((mode) => {
                          const active = form.groupOrderSettings.allowedSplitModes.includes(mode);
                          return (
                            <button key={mode} type="button" onClick={() => setForm((prev) => ({ ...prev, groupOrderSettings: { ...prev.groupOrderSettings, allowedSplitModes: toggleValueInArray(prev.groupOrderSettings.allowedSplitModes, mode) } }))} className={`px-3 py-1 rounded-full text-xs border ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"}`}>{mode}</button>
                          );
                        })}
                      </div>
                    </div>
                  </SectionCard>
                </div>
              )}

              {activeTab === "ops" && (
                <div className="space-y-4">
                  <SectionCard title="Order Operations" subtitle="Merchant-side order handling rules">
                    <div className="flex flex-wrap gap-4 text-sm mb-3">
                      {[["autoAcceptOrders", "Auto accept orders"], ["autoMarkReady", "Auto mark ready"], ["kitchenDisplayEnabled", "Kitchen display enabled"], ["reservationConsoleEnabled", "Reservation console enabled"], ["orderNotesEnabled", "Order notes enabled"], ["cancellationReasonsEnabled", "Cancellation reasons enabled"], ["outOfStockAutoHide", "Out of stock auto hide"], ["requireMerchantAcceptBeforePrep", "Require merchant accept before prep"], ["allowMerchantReject", "Allow merchant reject"]].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={!!form.operations?.[key]} onChange={(e) => setForm((prev) => ({ ...prev, operations: { ...(prev.operations || {}), [key]: e.target.checked } }))} /> {label}</label>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <select value={form.operations.stockManagementMode} onChange={(e) => setForm((prev) => ({ ...prev, operations: { ...prev.operations, stockManagementMode: e.target.value } }))} className="border p-2 rounded">
                        <option value="manual">Manual stock</option>
                        <option value="item_toggle">Item toggle</option>
                        <option value="variant_stock">Variant stock</option>
                      </select>
                      <input value={form.operations.prepBufferMins} onChange={(e) => setForm((prev) => ({ ...prev, operations: { ...prev.operations, prepBufferMins: e.target.value } }))} placeholder="Prep buffer mins" className="border p-2 rounded" />
                      <input value={form.operations.maxSimultaneousOrders} onChange={(e) => setForm((prev) => ({ ...prev, operations: { ...prev.operations, maxSimultaneousOrders: e.target.value } }))} placeholder="Max simultaneous orders" className="border p-2 rounded" />
                      <input value={form.operations.supportPhone} onChange={(e) => setForm((prev) => ({ ...prev, operations: { ...prev.operations, supportPhone: e.target.value } }))} placeholder="Support phone" className="border p-2 rounded" />
                      <input value={form.operations.supportEmail} onChange={(e) => setForm((prev) => ({ ...prev, operations: { ...prev.operations, supportEmail: e.target.value } }))} placeholder="Support email" className="border p-2 rounded" />
                    </div>
                  </SectionCard>
                </div>
              )}

              <div className="flex justify-end mt-6 space-x-3 pt-2 border-t">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{editingData ? "Update Restaurant" : "Create Restaurant"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Restaurant</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.branchName || deleteData?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showMapModal} onClose={() => setShowMapModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Pick a Location</DialogTitle>
        <DialogContent dividers sx={{ overflow: "hidden" }}>
          <MapLocationInput value={form.mapLocation} onChange={(val) => { const coordsStr = `${val.lng.toFixed(6)},${val.lat.toFixed(6)}`; setForm((prev) => ({ ...prev, mapLocation: coordsStr })); }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMapModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowMapModal(false)} disabled={!form.mapLocation}>Save location</Button>
        </DialogActions>
      </Dialog>

      <ToastContainer />
    </main>
  );
}