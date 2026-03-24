import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  query,
  where,
  setDoc,
  serverTimestamp,
  limit,
  getDoc,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { db, storage, firebaseConfig } from "../../firebase";
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
import LocationPicker from "../superadmin/LocationPicker";

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

const PERMISSION_MODULES = [
  { key: "managerestaurant", label: "Restaurant" },
  { key: "reservations", label: "Reservations" },
  { key: "qr", label: "QR / Tables" },
  { key: "menu", label: "Menus / Modifiers" },
  { key: "deals", label: "Deals" },
  { key: "orders", label: "Orders" },
  { key: "inventory", label: "Inventory" },
];

const emptyLinkRow = () => ({ name: "", url: "" });

const initialFormData = {
  id: "",
  restaurantdocid: "",
  restaurantid: "",
  authUid: "",
  uid: "",

  name: "",
  email: "",
  mobileNo: "",
  role: "branchmanager",

  brandName: "",
  branchName: "",
  branchCode: "",
  shortDesc: "",
  description: "",
  cuisines: [],
  tags: [],
  priceRange: "$$",
  avgCostForTwo: "",
  costForTwo: "",
  rating: "",
  offerText: "",
  deliveryTime: "",
  pickupTime: "",

  phone: [""],
  website: [emptyLinkRow()],
  booking: [emptyLinkRow()],

  location: "",
  address: "",
  suburb: "",
  city: "",
  state: "",
  country: "Australia",
  postcode: "",
  mapLocation: "",

  locationMeta: {
    countryCode: "",
    countryName: "",
    stateCode: "",
    stateName: "",
    cityName: "",
    lat: null,
    lng: null,
  },

  logo: null,
  logoFile: null,

  isOpen: true,
  isActive: true,
  isFeatured: false,

  permissions: [],
  defaultPassword: "",
};

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function uniquePath(folder, file) {
  const ext = file?.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const base = (file?.name || "file").replace(/\.[^/.]+$/, "");
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

function isEmailValid(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

function normalizePermissions(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (typeof raw === "object") {
    return Object.entries(raw)
      .filter(([, v]) => !!v)
      .map(([k]) => k);
  }
  return [];
}

function normalizeLinks(raw, fallbackUrl = "") {
  if (Array.isArray(raw)) {
    const cleaned = raw
      .map((item) => ({
        name: item?.name || "",
        url: item?.url || "",
      }))
      .filter((item) => item.name || item.url);
    return cleaned.length ? cleaned : [emptyLinkRow()];
  }

  if (raw && typeof raw === "object") {
    const one = {
      name: raw.name || "",
      url: raw.url || "",
    };
    return one.name || one.url ? [one] : [emptyLinkRow()];
  }

  if (typeof raw === "string" && raw.trim()) {
    return [{ name: "", url: raw.trim() }];
  }

  if (fallbackUrl && String(fallbackUrl).trim()) {
    return [{ name: "", url: String(fallbackUrl).trim() }];
  }

  return [emptyLinkRow()];
}

async function uploadFileIfAny(file, folder) {
  if (!file) return null;
  const sRef = storageRef(storage, uniquePath(folder, file));
  await uploadBytes(sRef, file);
  return getDownloadURL(sRef);
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

export default function RestaurantPage({ navbarHeight }) {
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

  const loggedInUid = useSelector((s) => s.auth?.user?.uid);

  useEffect(() => {
    if (!loggedInUid) return;

    getList();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loggedInUid]);

  const allPermissionsSelected = useMemo(() => {
    if (!PERMISSION_MODULES.length) return false;
    return PERMISSION_MODULES.every(({ key }) =>
      (form.permissions || []).includes(key)
    );
  }, [form.permissions]);

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
    if (!loggedInUid) return;

    setIsLoading(true);
    try {
      const q = query(collection(db, "restaurants"), where("createdBy", "==", loggedInUid));
      const snap = await getDocs(q);

      const docs = await Promise.all(
        snap.docs.map(async (d) => {
          const restaurantData = d.data();
          const authUid =
            restaurantData.authUid ||
            restaurantData.uid ||
            restaurantData.ownerUid ||
            restaurantData.restaurantUid ||
            "";

          let employeePermissions = [];
          if (authUid) {
            const empSnap = await getDoc(doc(db, "employees", authUid));
            if (empSnap.exists()) {
              const empData = empSnap.data() || {};
              employeePermissions = normalizePermissions(empData.permissions);
            }
          }

          return {
            id: d.id,
            restaurantdocid: d.id,
            restaurantid: d.id,
            ...restaurantData,
            employeePermissions,
          };
        })
      );

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

  const findRestaurantByEmail = async (emailLower) => {
    const q = query(
      collection(db, "restaurants"),
      where("email", "==", emailLower),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const first = snap.docs[0];
    return { id: first.id, data: first.data() };
  };

  const findUserByEmail = async (emailLower) => {
    const q = query(
      collection(db, "users"),
      where("email", "==", emailLower),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const first = snap.docs[0];
    return { id: first.id, data: first.data() || {} };
  };

  const findEmployeeByEmail = async (emailLower) => {
    const q = query(
      collection(db, "employees"),
      where("email", "==", emailLower),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const first = snap.docs[0];
    return { id: first.id, data: first.data() || {} };
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

  const addWebsiteField = () => {
    setForm((prev) => ({
      ...prev,
      website: [...(prev.website || []), emptyLinkRow()],
    }));
  };

  const updateWebsiteField = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      website: (prev.website || []).map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const removeWebsiteField = (index) => {
    setForm((prev) => {
      const next = [...(prev.website || [])];
      next.splice(index, 1);
      return {
        ...prev,
        website: next.length ? next : [emptyLinkRow()],
      };
    });
  };

  const addBookingField = () => {
    setForm((prev) => ({
      ...prev,
      booking: [...(prev.booking || []), emptyLinkRow()],
    }));
  };

  const updateBookingField = (index, key, value) => {
    setForm((prev) => ({
      ...prev,
      booking: (prev.booking || []).map((item, i) =>
        i === index ? { ...item, [key]: value } : item
      ),
    }));
  };

  const removeBookingField = (index) => {
    setForm((prev) => {
      const next = [...(prev.booking || [])];
      next.splice(index, 1);
      return {
        ...prev,
        booking: next.length ? next : [emptyLinkRow()],
      };
    });
  };

  const handlePermissionToggle = (key, checked) => {
    setForm((prev) => {
      const current = new Set(prev.permissions || []);
      if (checked) current.add(key);
      else current.delete(key);

      return {
        ...prev,
        permissions: Array.from(current),
      };
    });
  };

  const handleSelectAllPermissions = (checked) => {
    setForm((prev) => ({
      ...prev,
      permissions: checked ? PERMISSION_MODULES.map((item) => item.key) : [],
    }));
  };

  const resetFormState = () => {
    setModalOpen(false);
    setEditing(null);
    setSelectedCuisine("");
    setTagInput("");
    setForm({
      ...initialFormData,
      permissions: [],
      cuisines: [],
      tags: [],
      phone: [""],
      website: [emptyLinkRow()],
      booking: [emptyLinkRow()],
      locationMeta: {
        countryCode: "",
        countryName: "",
        stateCode: "",
        stateName: "",
        cityName: "",
        lat: null,
        lng: null,
      },
    });
  };

  const openCreate = () => {
    setActiveTab("basic");
    setEditing(null);
    setSelectedCuisine("");
    setTagInput("");
    setForm({
      ...initialFormData,
      permissions: [],
      cuisines: [],
      tags: [],
      phone: [""],
      website: [emptyLinkRow()],
      booking: [emptyLinkRow()],
      locationMeta: {
        countryCode: "",
        countryName: "",
        stateCode: "",
        stateName: "",
        cityName: "",
        lat: null,
        lng: null,
      },
    });
    setModalOpen(true);
  };

  const openEdit = async (item) => {
    setActiveTab("basic");
    setEditing(item);
    setSelectedCuisine("");
    setTagInput("");

    const authUid =
      item.authUid || item.uid || item.ownerUid || item.restaurantUid || "";

    let employeePermissions = [];
    let employeePassword = item.defaultPassword || "";

    if (authUid) {
      try {
        const empSnap = await getDoc(doc(db, "employees", authUid));
        if (empSnap.exists()) {
          const empData = empSnap.data() || {};
          employeePermissions = normalizePermissions(empData.permissions);
          employeePassword = empData.password || employeePassword;
        }
      } catch (err) {
        console.error("Failed to load employee permissions:", err);
      }
    }

    setForm({
      ...initialFormData,
      ...item,
      id: item.restaurantdocid || item.id,
      restaurantdocid: item.restaurantdocid || item.id,
      restaurantid: item.restaurantid || item.restaurantdocid || item.id,
      authUid,
      uid: authUid,
      name: item.name || "",
      email: item.email || "",
      mobileNo: item.mobileNo || "",
      role: item.role || "branchmanager",
      cuisines: Array.isArray(item.cuisines) ? item.cuisines : parseCsv(item.cuisines),
      tags: Array.isArray(item.tags) ? item.tags : parseCsv(item.tags),
      mapLocation: item.mapLocation
        ? typeof item.mapLocation === "string"
          ? item.mapLocation
          : `${item.mapLocation.lng},${item.mapLocation.lat}`
        : "",
      permissions: employeePermissions,
      defaultPassword: employeePassword,

      phone: Array.isArray(item.phone)
        ? item.phone
        : item.phone
        ? [item.phone]
        : [""],

      website: normalizeLinks(item.website, item.websiteUrl),
      booking: normalizeLinks(item.booking, item.bookingUrl || item.bookingLink),

      locationMeta: {
        countryCode: item.locationMeta?.countryCode || "",
        countryName: item.locationMeta?.countryName || item.country || "",
        stateCode: item.locationMeta?.stateCode || "",
        stateName: item.locationMeta?.stateName || item.state || "",
        cityName: item.locationMeta?.cityName || item.city || "",
        lat: item.locationMeta?.lat ?? item.mapLocation?.lat ?? null,
        lng: item.locationMeta?.lng ?? item.mapLocation?.lng ?? null,
      },
    });

    setModalOpen(true);
  };

  const validateForm = () => {
    if (!(form.name || "").trim()) return "Owner name required";
    if (!isEmailValid(form.email)) return "Valid email required";
    if (!(form.branchName || "").trim()) return "Branch name required";
    if (!(form.address || "").trim()) return "Address required";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let tempApp = null;

    try {
      const error = validateForm();
      if (error) {
        toast.error(error);
        return;
      }

      const emailLower = (form.email || "").trim().toLowerCase();
      const password = form.defaultPassword?.trim() || "Restaurant@123";

      const logoUrl = form.logoFile
        ? await uploadFileIfAny(
            form.logoFile,
            `restaurant_brand_logos/${form.branchName || "restaurant"}`
          )
        : form.logo;

      const parsedMapLocation = form.mapLocation
        ? (() => {
            const [lng, lat] = String(form.mapLocation)
              .split(",")
              .map((n) => Number(n));
            return Number.isFinite(lat) && Number.isFinite(lng)
              ? { lat, lng }
              : null;
          })()
        : null;

      const cleanedWebsite = (form.website || [])
        .map((w) => ({
          name: (w.name || "").trim(),
          url: (w.url || "").trim(),
        }))
        .filter((w) => w.name || w.url);

      const cleanedBooking = (form.booking || [])
        .map((b) => ({
          name: (b.name || "").trim(),
          url: (b.url || "").trim(),
        }))
        .filter((b) => b.name || b.url);

      const restaurantBasePayload = {
        name: (form.name || "").trim(),
        email: emailLower,
        mobileNo: (form.mobileNo || "").trim(),
        role: form.role || "branchmanager",

        brandName: (form.brandName || "").trim(),
        branchName: (form.branchName || "").trim(),
        branchCode: (form.branchCode || "").trim(),
        shortDesc: (form.shortDesc || "").trim(),
        description: (form.description || "").trim(),
        cuisines: Array.isArray(form.cuisines) ? form.cuisines : [],
        tags: Array.isArray(form.tags) ? form.tags : [],
        priceRange: form.priceRange || "$$",
        avgCostForTwo:
          form.avgCostForTwo === "" ? null : Number(form.avgCostForTwo),
        costForTwo: (form.costForTwo || "").trim(),
        rating: form.rating === "" ? null : Number(form.rating),
        offerText: (form.offerText || "").trim(),
        deliveryTime: (form.deliveryTime || "").trim(),
        pickupTime: (form.pickupTime || "").trim(),

        phone: Array.isArray(form.phone)
          ? form.phone.map((p) => String(p || "").trim()).filter(Boolean)
          : String(form.phone || "").trim()
          ? [String(form.phone || "").trim()]
          : [],

        website: cleanedWebsite,
        booking: cleanedBooking,
        bookingUrl: cleanedBooking[0]?.url || "",

        location: (form.location || "").trim(),
        address: (form.address || "").trim(),
        suburb: (form.suburb || "").trim(),
        city: (form.city || "").trim(),
        state: (form.state || "").trim(),
        country: (form.country || "Australia").trim(),
        postcode: (form.postcode || "").trim(),

        locationMeta: {
          countryCode: form.locationMeta?.countryCode || "",
          countryName: form.locationMeta?.countryName || (form.country || "").trim(),
          stateCode: form.locationMeta?.stateCode || "",
          stateName: form.locationMeta?.stateName || (form.state || "").trim(),
          cityName: form.locationMeta?.cityName || (form.city || "").trim(),
          lat: form.locationMeta?.lat ?? null,
          lng: form.locationMeta?.lng ?? null,
        },

        mapLocation: parsedMapLocation,
        logo: logoUrl || null,

        isOpen: !!form.isOpen,
        isActive: !!form.isActive,
        isFeatured: !!form.isFeatured,

        defaultPassword: password,

        createdBy: loggedInUid,
        updatedAt: serverTimestamp(),
      };

      if (editingData?.id) {
        const restaurantdocid = editingData.restaurantdocid || editingData.id;
        const authUid =
          editingData.authUid ||
          editingData.uid ||
          editingData.ownerUid ||
          editingData.restaurantUid ||
          "";

        await updateDoc(doc(db, "restaurants", restaurantdocid), {
          ...restaurantBasePayload,
          authUid,
          uid: authUid,
          ownerUid: authUid,
          restaurantUid: authUid,
          restaurantid: restaurantdocid,
          restaurantdocid,
        });

        if (authUid) {
          const existingEmpSnap = await getDoc(doc(db, "employees", authUid));
          const existingEmp = existingEmpSnap.exists() ? existingEmpSnap.data() : {};

          await setDoc(
            doc(db, "employees", authUid),
            {
              ...existingEmp,
              uid: authUid,
              authUid,
              email: emailLower,
              name: (form.name || "").trim(),
              mobileNo: (form.mobileNo || "").trim(),
              role: form.role || "branchmanager",
              type: "admin",
              empType: "restaurant",
              restaurantid: restaurantdocid,
              restaurantdocid,
              restaurantname: (form.branchName || "").trim(),
              branchName: (form.branchName || "").trim(),
              brandName: (form.brandName || "").trim(),
              permissions: normalizePermissions(form.permissions),
              isActive: !!form.isActive,
              password: existingEmp.password || password,
              createdBy: existingEmp.createdBy || loggedInUid,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          const existingUserSnap = await getDoc(doc(db, "users", authUid));
          const existingUser = existingUserSnap.exists() ? existingUserSnap.data() : {};

          await setDoc(
            doc(db, "users", authUid),
            {
              ...existingUser,
              uid: authUid,
              authUid,
              firstname: (form.name || "").trim(),
              username: (form.name || "").trim(),
              email: emailLower,
              mobileNo: (form.mobileNo || "").trim(),
              role: form.role || "branchmanager",
              livingtype: "restaurant",
              restaurantid: restaurantdocid,
              restaurantdocid,
              restaurantname: (form.branchName || "").trim(),
              branchName: (form.branchName || "").trim(),
              brandName: (form.brandName || "").trim(),
              imageUrl: logoUrl || existingUser.imageUrl || "",
              password: existingUser.password || password,
              isActive: !!form.isActive,
              createdBy: existingUser.createdBy || loggedInUid,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        }

        toast.success("Restaurant updated ✅");
        resetFormState();
        await getList();
        return;
      }

      const existingRestaurant = await findRestaurantByEmail(emailLower);
      if (existingRestaurant) {
        toast.error("This email is already used in restaurant");
        return;
      }

      const existingUser = await findUserByEmail(emailLower);
      const existingEmployee = await findEmployeeByEmail(emailLower);

      let authUid = "";
      const existingUserData = existingUser?.data || {};

      if (existingUser?.id) {
        authUid = existingUser.id;
      } else if (existingEmployee?.id) {
        authUid = existingEmployee.id;
      } else {
        tempApp = initializeApp(firebaseConfig, `restaurant_temp_${Date.now()}`);
        const tempAuth = getAuth(tempApp);

        try {
          const userCredential = await createUserWithEmailAndPassword(
            tempAuth,
            emailLower,
            password
          );
          const restaurantUser = userCredential.user;
          authUid = restaurantUser.uid;

          await updateProfile(restaurantUser, {
            displayName: (form.name || "").trim(),
            ...(logoUrl ? { photoURL: logoUrl } : {}),
          });
        } catch (authErr) {
          if (authErr?.code === "auth/email-already-in-use") {
            toast.error(
              "This email already exists in Firebase Auth, but users/employee doc not found. Pehle users ya employees doc me sync karao."
            );
            return;
          }
          throw authErr;
        }
      }

      if (!authUid) {
        toast.error("Could not resolve auth uid");
        return;
      }

      const restaurantRef = doc(collection(db, "restaurants"));
      const restaurantdocid = restaurantRef.id;

      await setDoc(restaurantRef, {
        ...restaurantBasePayload,
        uid: authUid,
        authUid,
        ownerUid: authUid,
        restaurantUid: authUid,
        restaurantid: restaurantdocid,
        restaurantdocid,
        authCreated: !existingUser?.id && !existingEmployee?.id,
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, "users", authUid),
        {
          ...existingUserData,
          uid: authUid,
          authUid,
          firstname: (form.name || "").trim(),
          lastname: existingUserData.lastname || "",
          username: (form.name || "").trim(),
          email: emailLower,
          mobileNo: (form.mobileNo || "").trim(),
          role: form.role || "branchmanager",
          livingtype: "restaurant",
          restaurantid: restaurantdocid,
          restaurantdocid,
          restaurantname: (form.branchName || "").trim(),
          branchName: (form.branchName || "").trim(),
          brandName: (form.brandName || "").trim(),
          imageUrl: logoUrl || existingUserData.imageUrl || "",
          password: existingUserData.password || password,
          isActive: !!form.isActive,
          createdBy: existingUserData.createdBy || loggedInUid,
          createdAt: existingUserData.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await setDoc(
        doc(db, "employees", authUid),
        {
          uid: authUid,
          authUid,
          email: emailLower,
          name: (form.name || "").trim(),
          mobileNo: (form.mobileNo || "").trim(),
          role: form.role || "branchmanager",
          type: "admin",
          empType: "restaurant",
          restaurantid: restaurantdocid,
          restaurantdocid,
          restaurantname: (form.branchName || "").trim(),
          branchName: (form.branchName || "").trim(),
          brandName: (form.brandName || "").trim(),
          permissions: normalizePermissions(form.permissions),
          isActive: !!form.isActive,
          password,
          createdBy: loggedInUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      toast.success("Restaurant created ✅");
      resetFormState();
      await getList();
    } catch (err) {
      console.error(err);

      if (err?.code === "auth/email-already-in-use") {
        toast.error("This email already exists in Firebase Auth");
      } else {
        toast.error(err?.message || "Save failed");
      }
    } finally {
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;

    try {
      const restaurantdocid = deleteData.restaurantdocid || deleteData.id;
      const authUid =
        deleteData.authUid ||
        deleteData.uid ||
        deleteData.ownerUid ||
        deleteData.restaurantUid ||
        "";

      await deleteDoc(doc(db, "restaurants", restaurantdocid));

      if (authUid) {
        try {
          await deleteDoc(doc(db, "employees", authUid));
        } catch (empErr) {
          console.error("Employee delete failed:", empErr);
        }
      }

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
      const label =
        `${r.brandName || ""} ${r.branchName || ""} ${r.name || ""}`.toLowerCase();
      const okName = !nameQ || label.includes(nameQ);
      const cuisineLabel = Array.isArray(r.cuisines)
        ? r.cuisines.join(", ")
        : r.cuisines || "";
      const okCuisine = !cuisineQ || cuisineLabel.toLowerCase().includes(cuisineQ);
      const okLoc =
        !locQ || `${r.address || ""} ${r.location || ""}`.toLowerCase().includes(locQ);
      return okName && okCuisine && okLoc;
    });
  }, [list, filters]);

  const getSortVal = (r, key) => {
    if (key === "name")
      return `${r.brandName || ""} ${r.branchName || ""} ${r.name || ""}`.toLowerCase();
    if (key === "cuisine")
      return (Array.isArray(r.cuisines) ? r.cuisines : []).join(", ").toLowerCase();
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
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Restaurants</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-900"
          onClick={openCreate}
        >
          + Add Restaurant Branch
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
                  { key: "name", label: "Owner / Branch" },
                  { key: "cuisine", label: "Cuisines" },
                  { key: "location", label: "Location" },
                  { key: "permissions", label: "Permissions", sortable: false },
                  { key: "status", label: "Status", sortable: false },
                  { key: "image", label: "Logo", sortable: false },
                  { key: "updated", label: "Updated" },
                  { key: "actions", label: "Actions", sortable: false },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none"
                  >
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:underline"
                        onClick={() => onSort(col.key)}
                      >
                        <span>{col.label}</span>
                        {sortConfig.key === col.key && (
                          <span className="text-gray-400">
                            {sortConfig.direction === "asc" ? "▲" : "▼"}
                          </span>
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
                    placeholder="Search owner / branch"
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

                {Array.from({ length: 5 }).map((_, i) => (
                  <th key={i} className="px-6 pb-3" />
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-10 text-center text-gray-500">
                    No restaurant branches found.
                  </td>
                </tr>
              ) : (
                sorted.map((item) => {
                  const activePermissionCount = Array.isArray(item.employeePermissions)
                    ? item.employeePermissions.length
                    : 0;

                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="font-semibold">{item.name || "—"}</div>
                        <div className="text-xs text-gray-500">{item.branchName || "—"}</div>
                        <div className="text-xs text-gray-400">{item.email || "—"}</div>
                        <div className="text-xs text-gray-400">
                          {item.defaultPassword || "—"}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        {(item.cuisines || []).slice(0, 3).join(", ") || "—"}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        {item.address || "—"}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-flex items-center justify-center h-6 min-w-10 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          {activePermissionCount} enabled
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            item.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        {item.logo ? (
                          <img
                            src={item.logo}
                            alt=""
                            width={80}
                            height={80}
                            className="rounded object-cover"
                          />
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-700">
                        {(() => {
                          const ms = toMillis(item.updatedAt) ?? toMillis(item.createdAt);
                          return ms ? dayjs(ms).format("MMM DD, YYYY") : "—";
                        })()}
                      </td>

                      <td className="px-6 py-4 text-sm">
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => openEdit(item)}
                        >
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-7xl max-h-[92vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-xl font-bold">
                {editingData ? "Edit Restaurant Branch" : "Create Restaurant Branch"}
              </h2>
              <button
                type="button"
                className="text-gray-600 hover:text-black"
                onClick={() => setModalOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[["basic", "Basic"]].map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setActiveTab(k)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    activeTab === k
                      ? "bg-black text-white border-black"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              {activeTab === "basic" && (
                <div className="space-y-4">
                  <SectionCard title="Owner Profile">
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        name="name"
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Owner name"
                        className="w-full border border-gray-300 p-2 rounded"
                        required
                      />

                      <input
                        name="email"
                        value={form.email}
                        onChange={handleChange}
                        placeholder="Email"
                        className="w-full border border-gray-300 p-2 rounded"
                        required
                        disabled={!!editingData}
                      />

                      <input
                        name="mobileNo"
                        value={form.mobileNo}
                        onChange={handleChange}
                        placeholder="Mobile No"
                        className="w-full border border-gray-300 p-2 rounded"
                        required
                      />

                      <select
                        name="role"
                        value={form.role}
                        onChange={handleChange}
                        className="w-full border border-gray-300 p-2 rounded"
                      >
                        <option value="">Select</option>
                        <option value="branchmanager">Branch Manager</option>
                        <option value="staff">Staff</option>
                        <option value="owner">Owner</option>
                      </select>
                    </div>

                    {!editingData && (
                      <input
                        name="defaultPassword"
                        value={form.defaultPassword}
                        onChange={handleChange}
                        placeholder="Password (leave blank for Restaurant@123)"
                        className="w-full border border-gray-300 p-2 rounded mt-3"
                      />
                    )}
                  </SectionCard>

                  <SectionCard title="Restaurant / Branch">
                    <div className="grid grid-cols-2 gap-3">
                      {/* <input
                        name="brandName"
                        value={form.brandName}
                        onChange={handleChange}
                        placeholder="Brand name"
                        className="w-full border border-gray-300 p-2 rounded"
                      /> */}

                      <input
                        name="branchName"
                        value={form.branchName}
                        onChange={handleChange}
                        placeholder="Branch name"
                        className="w-full border border-gray-300 p-2 rounded"
                        required
                      />

                      <input
                        name="branchCode"
                        value={form.branchCode}
                        onChange={handleChange}
                        placeholder="Branch code"
                        className="w-full border border-gray-300 p-2 rounded"
                      />

                     
                    </div>
                    <input
                        name="shortDesc"
                        value={form.shortDesc}
                        onChange={handleChange}
                        placeholder="Short description"
                        className="w-full border border-gray-300 p-2 rounded"
                      />
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      placeholder="Full description"
                      className="w-full border border-gray-300 p-2 rounded"
                      rows={4}
                    />
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
                            {CUISINE_OPTIONS.filter(
                              (c) => !(form.cuisines || []).includes(c)
                            ).map((cuisine) => (
                              <option key={cuisine} value={cuisine}>
                                {cuisine}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={addCuisine}
                            className="px-4 py-2 rounded bg-black text-white whitespace-nowrap"
                          >
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
                          <button
                            type="button"
                            onClick={addTag}
                            className="px-4 py-2 rounded bg-black text-white whitespace-nowrap"
                          >
                            Add
                          </button>
                        </div>

                        <ChipList items={form.tags || []} onRemove={removeTag} />
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-3">
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
                        value={form.avgCostForTwo}
                        onChange={handleChange}
                        placeholder="Avg cost for 2"
                        className="w-full border border-gray-300 p-2 rounded"
                      />

                      <input
                        name="costForTwo"
                        value={form.costForTwo}
                        onChange={handleChange}
                        placeholder="Cost for two label"
                        className="w-full border border-gray-300 p-2 rounded"
                      />

                      {/* <input
                        name="rating"
                        value={form.rating}
                        onChange={handleChange}
                        placeholder="Rating"
                        className="w-full border border-gray-300 p-2 rounded"
                      /> */}

                      <input
                        name="offerText"
                        value={form.offerText}
                        onChange={handleChange}
                        placeholder="Offer text"
                        className="w-full border border-gray-300 p-2 rounded"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <input
                        name="deliveryTime"
                        value={form.deliveryTime}
                        onChange={handleChange}
                        placeholder="Delivery ETA label"
                        className="w-full border border-gray-300 p-2 rounded"
                      />
                      <input
                        name="pickupTime"
                        value={form.pickupTime}
                        onChange={handleChange}
                        placeholder="Pickup ETA label"
                        className="w-full border border-gray-300 p-2 rounded"
                      />
                    </div>
                  </SectionCard>

                  <SectionCard
                    title="Contact & Location"
                    subtitle="Zomato / Swiggy style contact and address structure"
                  >
                    <div className="space-y-6">
                      <div className="space-y-2">
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
                              value={phoneValue}
                              onChange={(e) => updatePhoneField(index, e.target.value)}
                              placeholder={`Phone ${index + 1}`}
                              className="w-full border border-gray-300 p-3 rounded-lg"
                            />
                            {(form.phone || []).length > 1 && (
                              <button
                                type="button"
                                onClick={() => removePhoneField(index)}
                                className="px-3 py-2 border rounded-lg text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium">Website</label>
                          <button
                            type="button"
                            onClick={addWebsiteField}
                            className="px-3 py-1 rounded bg-black text-white text-xs"
                          >
                            + Add Website
                          </button>
                        </div>

                        {(form.website || []).map((item, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_110px] gap-2"
                          >
                            <input
                              value={item.name}
                              onChange={(e) =>
                                updateWebsiteField(index, "name", e.target.value)
                              }
                              placeholder="Website name (e.g. Official Site)"
                              className="w-full border border-gray-300 p-3 rounded-lg"
                            />
                            <input
                              type="url"
                              value={item.url}
                              onChange={(e) =>
                                updateWebsiteField(index, "url", e.target.value)
                              }
                              placeholder="Website URL"
                              className="w-full border border-gray-300 p-3 rounded-lg"
                            />
                            {(form.website || []).length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeWebsiteField(index)}
                                className="px-3 py-2 border rounded-lg text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            ) : (
                              <div />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium">Booking</label>
                          <button
                            type="button"
                            onClick={addBookingField}
                            className="px-3 py-1 rounded bg-black text-white text-xs"
                          >
                            + Add Booking
                          </button>
                        </div>

                        {(form.booking || []).map((item, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-1 md:grid-cols-[1fr_1fr_110px] gap-2"
                          >
                            <input
                              value={item.name}
                              onChange={(e) =>
                                updateBookingField(index, "name", e.target.value)
                              }
                              placeholder="Booking name (e.g. Reserve Table)"
                              className="w-full border border-gray-300 p-3 rounded-lg"
                            />
                            <input
                              type="url"
                              value={item.url}
                              onChange={(e) =>
                                updateBookingField(index, "url", e.target.value)
                              }
                              placeholder="Booking URL"
                              className="w-full border border-gray-300 p-3 rounded-lg"
                            />
                            {(form.booking || []).length > 1 ? (
                              <button
                                type="button"
                                onClick={() => removeBookingField(index)}
                                className="px-3 py-2 border rounded-lg text-red-600 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            ) : (
                              <div />
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium">
                          Country / State / City
                        </label>
                        <LocationPicker
                          value={{
                            countryCode: form.locationMeta?.countryCode || "",
                            stateCode: form.locationMeta?.stateCode || "",
                            cityName: form.locationMeta?.cityName || form.city || "",
                          }}
                          onChange={(loc) => {
                            setForm((prev) => ({
                              ...prev,
                              country: loc.country?.name || prev.country || "",
                              state: loc.state?.name || prev.state || "",
                              city: loc.city?.name || prev.city || "",
                              locationMeta: {
                                countryCode: loc.country?.code || "",
                                countryName: loc.country?.name || "",
                                stateCode: loc.state?.code || "",
                                stateName: loc.state?.name || "",
                                cityName: loc.city?.name || "",
                                lat: loc.coords?.lat ?? prev.locationMeta?.lat ?? null,
                                lng: loc.coords?.lng ?? prev.locationMeta?.lng ?? null,
                              },
                            }));
                          }}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          name="country"
                          value={form.country}
                          onChange={handleChange}
                          placeholder="Country"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                        />
                        <input
                          name="state"
                          value={form.state}
                          onChange={handleChange}
                          placeholder="State / Region"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                        />
                        <input
                          name="city"
                          value={form.city}
                          onChange={handleChange}
                          placeholder="City"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          name="suburb"
                          value={form.suburb}
                          onChange={handleChange}
                          placeholder="Suburb / Area"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                        />
                        <input
                          name="postcode"
                          value={form.postcode}
                          onChange={handleChange}
                          placeholder="Postcode"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Full Address</label>
                        <textarea
                          name="address"
                          value={form.address}
                          onChange={handleChange}
                          placeholder="Flat / shop no, street, landmark, full address"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                          rows={3}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Location Label</label>
                        <input
                          name="location"
                          value={form.location}
                          onChange={handleChange}
                          placeholder="e.g. Near City Mall, MG Road Branch"
                          className="w-full border border-gray-300 p-3 rounded-lg"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium">Pin on Map</label>
                        <div className="relative">
                          <input
                            name="mapLocation"
                            readOnly
                            value={form.mapLocation}
                            onClick={() => setShowMapModal(true)}
                            placeholder="Select on map"
                            className="w-full border border-gray-300 p-3 pl-10 rounded-lg cursor-pointer"
                          />
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="Permissions">
                    <div className="md:col-span-2">
                      <fieldset className="mt-2">
                        <div className="mb-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={allPermissionsSelected}
                              onChange={(e) =>
                                handleSelectAllPermissions(e.target.checked)
                              }
                            />
                            <span>
                              {allPermissionsSelected
                                ? "Unselect all permissions"
                                : "Select all permissions"}
                            </span>
                          </label>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          {PERMISSION_MODULES.map(({ key, label }) => (
                            <label
                              key={key}
                              className="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded border border-gray-200"
                            >
                              <input
                                type="checkbox"
                                checked={(form.permissions || []).includes(key)}
                                onChange={(e) =>
                                  handlePermissionToggle(key, e.target.checked)
                                }
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
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
                      {[
                        ["isOpen", "Open now"],
                        ["isActive", "Active"],
                        ["isFeatured", "Featured"],
                      ].map(([key, label]) => (
                        <label key={key} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!form[key]}
                            onChange={(e) =>
                              setForm((prev) => ({
                                ...prev,
                                [key]: e.target.checked,
                              }))
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              )}

              <div className="flex justify-end mt-6 space-x-3 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Restaurant
            </h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.branchName || deleteData?.name}</strong>?
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
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <Dialog
        open={showMapModal}
        onClose={() => setShowMapModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Pick a Location</DialogTitle>
        <DialogContent dividers sx={{ overflow: "hidden" }}>
          <MapLocationInput
            value={form.mapLocation}
            onChange={(val) => {
              const coordsStr = `${val.lng.toFixed(6)},${val.lat.toFixed(6)}`;
              setForm((prev) => ({
                ...prev,
                mapLocation: coordsStr,
                locationMeta: {
                  ...(prev.locationMeta || {}),
                  lat: val.lat,
                  lng: val.lng,
                },
              }));
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMapModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => setShowMapModal(false)}
            disabled={!form.mapLocation}
          >
            Save location
          </Button>
        </DialogActions>
      </Dialog>

      <ToastContainer />
    </main>
  );
}