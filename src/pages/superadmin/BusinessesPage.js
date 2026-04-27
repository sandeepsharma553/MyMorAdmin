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
  getDocs,
  getDoc,
  setDoc,
  limit,
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
import "react-toastify/dist/ReactToastify.css";

import DealForm from "../business/DealForm";
import LocationPicker from "./LocationPicker";
import MapLocationInput from "../../components/MapLocationInput";

import { MapPin } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";

/** ---------------- Helpers ---------------- */
const DAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const BUSINESS_PERMISSION_OPTIONS = [
  { key: "dashboard", label: "Dashboard" },
  { key: "businessemp", label: "Employee" },
  { key: "deal", label: "Deal" },
  { key: "restaurant", label: "Restaurant" },
  { key: "product", label: "Product" },
  { key: "service", label: "Service" },
];

const blankSlot = () => ({ from: "09:00", to: "17:00" });

const blankDay = () => ({
  open: true,
  slots: [blankSlot()],
});

const normalizeDay = (d) => {
  if (!d) return blankDay();
  if (Array.isArray(d.slots) && d.slots.length) {
    return { open: !!d.open, slots: d.slots };
  }
  if (typeof d.from === "string" && typeof d.to === "string") {
    return { open: d.open ?? true, slots: [{ from: d.from, to: d.to }] };
  }
  return { open: d.open ?? true, slots: [blankSlot()] };
};

const normalizeWeekBucket = (b) => {
  if (!b) return { open: true, slots: [blankSlot()] };
  if (Array.isArray(b.slots) && b.slots.length) {
    return { open: !!b.open, slots: b.slots };
  }
  if (typeof b.from === "string" && typeof b.to === "string") {
    return { open: b.open ?? true, slots: [{ from: b.from, to: b.to }] };
  }
  return { open: b.open ?? true, slots: [blankSlot()] };
};

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

const isEmailValid = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());

const normalizePermissions = (raw) => {
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
      .filter(([, value]) => !!value)
      .map(([key]) => key);
  }
  return [];
};

const mergePermissions = (oldPerms = [], newPerms = []) =>
  Array.from(
    new Set([
      ...normalizePermissions(oldPerms),
      ...normalizePermissions(newPerms),
    ])
  );

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
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const initialForm = {
  name: "",
  phone: "",
  email: "",
  abn: "",
  website: "",
  note: "",
  password: "",
  permissions: [],
  isActive: true,

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
    mapLocation: "",
  },

  booking: { type: "email", value: "" },
  customerCommunication: { contactNumber: "", contactEmail: "" },

  hours: {
    mode: "week",
    week: {
      weekdays: { open: true, slots: [blankSlot()] },
      weekend: { open: true, slots: [blankSlot()] },
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
      mapLocation: "",
    },
  },
  empType: "business",
};

export default function BusinessesAndDealsPage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBiz, setEditingBiz] = useState(null);
  const [saving, setSaving] = useState(false);

  const [deleteBizId, setDeleteBizId] = useState(null);

  const [showMapModal, setShowMapModal] = useState(false);
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

  /** ---------------- Permission helpers ---------------- */
  const allPermissionsSelected = useMemo(() => {
    if (!BUSINESS_PERMISSION_OPTIONS.length) return false;
    return BUSINESS_PERMISSION_OPTIONS.every(({ key }) =>
      (form.permissions || []).includes(key)
    );
  }, [form.permissions]);

  const handlePermissionToggle = (key, checked) => {
    setForm((prev) => {
      const current = new Set(normalizePermissions(prev.permissions));
      if (checked) current.add(key);
      else current.delete(key);
      return { ...prev, permissions: Array.from(current) };
    });
  };

  const handleSelectAllPermissions = (checked) => {
    setForm((prev) => {
      if (checked) {
        return {
          ...prev,
          permissions: BUSINESS_PERMISSION_OPTIONS.map((x) => x.key),
        };
      }
      return { ...prev, permissions: [] };
    });
  };

  /** ---------------- User / Employee helpers ---------------- */
  const findUserByEmail = async (email) => {
    const qy = query(
      collection(db, "users"),
      where("email", "==", email),
      limit(1)
    );
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, data: d.data() };
  };

  const findEmployeeByEmail = async (email) => {
    const qy = query(
      collection(db, "employees"),
      where("email", "==", email),
      limit(1)
    );
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, data: d.data() };
  };

  const assignBusinessAdminToUid = async ({
    targetUid,
    businessId,
    baseData,
    passwordFallback,
  }) => {
    const empRef = doc(db, "employees", targetUid);
    const empSnap = await getDoc(empRef);

    const existingEmp = empSnap.exists() ? empSnap.data() || {} : {};
    const mergedPerms = mergePermissions(
      existingEmp.permissions,
      baseData.permissions || []
    );
    const finalPassword = existingEmp.password || passwordFallback || "";

    await setDoc(
      empRef,
      {
        ...existingEmp,
        uid: targetUid,
        name: baseData.name,
        email: baseData.email,
        mobileNo: baseData.phone || "",
        address: baseData.address?.line1 || "",
        type: "admin",
        role: "businessAdmin",
        empType: "business",
        businessId,
        businessName: baseData.name,
        permissions: mergedPerms,
        isActive: baseData.isActive ?? true,
        password: finalPassword,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await setDoc(
      doc(db, "users", targetUid),
      {
        uid: targetUid,
        firstname: baseData.name,
        lastname: "",
        username: baseData.name,
        email: baseData.email,
        phone: baseData.phone || "",
        businessId,
        businessName: baseData.name,
        roles: {
          student: true,
          businessAdmin: true,
        },
        permissions: mergedPerms,
        password: finalPassword,
        updateddate: new Date(),
      },
      { merge: true }
    );

    await updateDoc(doc(db, "businesses", businessId), {
      uid: targetUid,
      adminUID: targetUid,
      permissions: mergedPerms,
      password: finalPassword,
      updatedAt: serverTimestamp(),
    });
  };

  /** ---------------- Firestore: Businesses ---------------- */
  useEffect(() => {
    const qy = query(collection(db, "businesses"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(
          snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            permissions: normalizePermissions(d.data()?.permissions),
          }))
        );
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
      [
        r.name,
        r.email,
        r.phone,
        r.password,
        r.address?.city,
        r.address?.state,
        r.address?.postcode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [rows, qText]);

  /** ---------------- Firestore: Deals by business ---------------- */
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

  /** ---------------- Deals mapping ---------------- */
  const dealToFormValues = (d) => {
    if (!d) return {};
    return {
      header: d.header || "",
      category: d.category || "",
      slotId: d.slotId || "",
      modeid: d.modeid || "",
      slot: d.slot || "",
      mode: d.mode || "",
      statusid: d.statusid || "",
      status: d.status || "draft",
      active: !!d.active,
      featured: !!d.featured,

      discoveryTags: d?.discovery?.tags || [],
      feedSections: d?.discovery?.sections || [],

      imageUrl: d.posterUrl || "",
      imageFile: null,

      venueName: d?.venue?.name || d?.businessName || "",
      venueLocationLabel: d?.venue?.locationLabel || d?.businessAddress || "",
      lat: d?.venue?.lat == null ? "" : String(d.venue.lat),
      lng: d?.venue?.lng == null ? "" : String(d.venue.lng),

      descriptionHtml: d.descriptionHtml || "",

      validFrom: d?.schedule?.validFrom || "",
      validTo: d?.schedule?.validTo || "",
      daysActive:
        d?.schedule?.activeDays || ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      timeWindowStart: d?.schedule?.timeWindow?.start || "",
      timeWindowEnd: d?.schedule?.timeWindow?.end || "",

      redemptionMethodId: d?.redemption?.methodId || "",
      redemptionMethod: d?.redemption?.method || "",
      requiresStudentId: d?.redemption?.requiresStudentId ?? true,
      oneClaimPerStudent: d?.redemption?.oneClaimPerStudent ?? true,
      claimLimit:
        d?.redemption?.claimLimit == null ? "" : String(d.redemption.claimLimit),
      promoCode: d?.redemption?.promoCode || "",
      instructions: d?.redemption?.instructions || "",

      bookingEnabled: d?.booking?.enabled ?? false,
      bookingLink: d?.booking?.bookingLink || "",
      sessionLabel: d?.booking?.sessionLabel || "",

      saleType: d?.retail?.saleType || "",
      discountRangeLabel: d?.retail?.discountRangeLabel || "",
      catalogUrl: d?.retail?.catalogUrl || "",
      catalogFile: null,
      retailHighlights: d?.retail?.highlights || [],
    };
  };

  const formToDealPayload = ({
    values,
    editingBiz,
    form,
    dealEditing,
    posterUrl,
    posterPath,
    catalogUrl,
    catalogPath,
  }) => {
    const timeWindow =
      values.timeWindowStart && values.timeWindowEnd
        ? { start: values.timeWindowStart, end: values.timeWindowEnd }
        : null;

    const isPromo = String(values.redemptionMethod || "")
      .toLowerCase()
      .includes("promo");
    const isCatalog = String(values.mode || "")
      .toLowerCase()
      .includes("catalog");

    return {
      businessId: editingBiz.id,
      businessName: form.name || "",
      businessAddress: [
        form.address?.line1,
        form.address?.city,
        form.address?.state,
        form.address?.postcode,
      ]
        .filter(Boolean)
        .join(", "),
      businessLat: form.address?.lat ?? null,
      businessLng: form.address?.lng ?? null,

      header: (values.header || "").trim(),
      campaignType: values.campaignType || "single_offer",
      category: values.category || "",
      slot: values.slot || "",
      mode: values.mode || "",

      status: values.status || "",
      active: !!values.active,
      featured: !!values.featured,

      discovery: {
        tags: values.discoveryTags || [],
        sections: values.feedSections || [],
      },

      partner: {
        partnerId: "",
        merchantId: editingBiz.id,
      },

      venue: {
        id: editingBiz.id,
        name: (values.venueName || form.name || "").trim(),
        locationLabel: (
          values.venueLocationLabel ||
          [form.address?.city, form.address?.state].filter(Boolean).join(", ")
        ).trim(),
        lat: values.lat === "" ? form.address?.lat ?? null : Number(values.lat),
        lng: values.lng === "" ? form.address?.lng ?? null : Number(values.lng),
      },

      descriptionHtml: values.descriptionHtml || "",

      schedule: {
        activeDays: values.daysActive || [],
        validFrom: values.validFrom || "",
        validTo: values.validTo || "",
        timeWindow,
      },

      redemption: {
        methodId: values.redemptionMethodId || "",
        method: values.redemptionMethod || "",
        requiresStudentId: !!values.requiresStudentId,
        oneClaimPerStudent: !!values.oneClaimPerStudent,
        claimLimit: values.claimLimit === "" ? null : Number(values.claimLimit),
        promoCode: isPromo ? (values.promoCode || "").trim() : "",
        instructions: (values.instructions || "").trim(),
      },

      booking: {
        enabled: !!values.bookingEnabled,
        bookingLink: values.bookingEnabled ? (values.bookingLink || "").trim() : "",
        sessionLabel: (values.sessionLabel || "").trim(),
      },

      retail: isCatalog
        ? {
            saleType: values.saleType || "storewide",
            discountRangeLabel: (values.discountRangeLabel || "").trim(),
            catalogUrl: catalogUrl || values.catalogUrl || "",
            catalogPath: catalogPath || dealEditing?.retail?.catalogPath || "",
            highlights: (values.retailHighlights || []).slice(0, 8).map((x) => ({
              title: (x.title || "").trim(),
              priceLabel: (x.priceLabel || "").trim(),
              imageUrl: (x.imageUrl || "").trim(),
            })),
          }
        : null,

      posterUrl: posterUrl || values.imageUrl || dealEditing?.posterUrl || "",
      posterPath: posterPath || dealEditing?.posterPath || "",
      daysLeft: typeof values.daysLeft === "number" ? values.daysLeft : null,
      updatedAt: serverTimestamp(),
    };
  };

  /** ---------------- Business modal open/close ---------------- */
  const resetBusinessForm = () => {
    setEditingBiz(null);
    setForm(initialForm);
    setOpen({
      details: true,
      hours: false,
      billing: false,
      media: false,
      deals: true,
    });
    setBizDeals([]);
  };

  const openCreate = () => {
    resetBusinessForm();
    setModalOpen(true);
  };

  const openEdit = (b) => {
    setEditingBiz(b);
    const data = b || {};

    const hours = {
      mode: data?.hours?.mode || "week",
      week: {
        weekdays: normalizeWeekBucket(data?.hours?.week?.weekdays),
        weekend: normalizeWeekBucket(data?.hours?.week?.weekend),
      },
      custom: DAYS.reduce((acc, day) => {
        acc[day] = normalizeDay(data?.hours?.custom?.[day]);
        return acc;
      }, {}),
    };

    setForm({
      ...initialForm,
      ...data,
      password: data.password || "",
      permissions: normalizePermissions(data.permissions),
      isActive: data.isActive ?? true,
      address: { ...initialForm.address, ...(data.address || {}) },
      booking: { ...initialForm.booking, ...(data.booking || {}) },
      customerCommunication: {
        ...initialForm.customerCommunication,
        ...(data.customerCommunication || {}),
      },
      hours,
      billing: {
        ...initialForm.billing,
        ...(data.billing || {}),
        address: {
          ...initialForm.billing.address,
          ...(data.billing?.address || {}),
        },
      },
      media: { ...initialForm.media, ...(data.media || {}) },
    });

    setOpen({
      details: true,
      hours: false,
      billing: false,
      media: false,
      deals: true,
    });
    setModalOpen(true);
  };

  /** ---------------- Form setters ---------------- */
  const set = (key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((p) => ({ ...p, [key]: val }));
  };

  const setAddress = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setForm((p) => ({ ...p, address: { ...(p.address || {}), [key]: val } }));
  };

  const setBilling = (key) => (e) => {
    const val =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? "";
    setForm((p) => ({ ...p, billing: { ...(p.billing || {}), [key]: val } }));
  };

  const setBillingAddr = (key) => (e) => {
    const val = e?.target?.value ?? "";
    setForm((p) => ({
      ...p,
      billing: {
        ...(p.billing || {}),
        address: { ...((p.billing || {}).address || {}), [key]: val },
      },
    }));
  };

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));
  const setHoursMode = (mode) =>
    setForm((p) => ({ ...p, hours: { ...(p.hours || {}), mode } }));

  const setWeekHoursOpen = (bucket) => (e) => {
    const checked = !!e?.target?.checked;
    setForm((p) => ({
      ...p,
      hours: {
        ...(p.hours || {}),
        week: {
          ...(p.hours?.week || {}),
          [bucket]: {
            ...normalizeWeekBucket(p.hours?.week?.[bucket]),
            open: checked,
          },
        },
      },
    }));
  };

  const setCustomHoursOpen = (day) => (e) => {
    const checked = !!e?.target?.checked;
    setForm((p) => ({
      ...p,
      hours: {
        ...(p.hours || {}),
        custom: {
          ...(p.hours?.custom || {}),
          [day]: {
            ...normalizeDay(p.hours?.custom?.[day]),
            open: checked,
          },
        },
      },
    }));
  };

  /** ---------------- Slots: add/remove/update ---------------- */
  const addWeekSlot = (bucket) => {
    setForm((p) => {
      const prev = normalizeWeekBucket(p.hours?.week?.[bucket]);
      return {
        ...p,
        hours: {
          ...(p.hours || {}),
          week: {
            ...(p.hours?.week || {}),
            [bucket]: { ...prev, slots: [...(prev.slots || []), blankSlot()] },
          },
        },
      };
    });
  };

  const removeWeekSlot = (bucket, idx) => {
    setForm((p) => {
      const prev = normalizeWeekBucket(p.hours?.week?.[bucket]);
      const nextSlots = (prev.slots || []).filter((_, i) => i !== idx);
      return {
        ...p,
        hours: {
          ...(p.hours || {}),
          week: {
            ...(p.hours?.week || {}),
            [bucket]: {
              ...prev,
              slots: nextSlots.length ? nextSlots : [blankSlot()],
            },
          },
        },
      };
    });
  };

  const setWeekSlot = (bucket, idx, key) => (e) => {
    const val = e?.target?.value ?? "";
    setForm((p) => {
      const prev = normalizeWeekBucket(p.hours?.week?.[bucket]);
      const slots = [...(prev.slots || [blankSlot()])];
      slots[idx] = { ...(slots[idx] || blankSlot()), [key]: val };
      return {
        ...p,
        hours: {
          ...(p.hours || {}),
          week: {
            ...(p.hours?.week || {}),
            [bucket]: { ...prev, slots },
          },
        },
      };
    });
  };

  const addCustomSlot = (day) => {
    setForm((p) => {
      const prev = normalizeDay(p.hours?.custom?.[day]);
      return {
        ...p,
        hours: {
          ...(p.hours || {}),
          custom: {
            ...(p.hours?.custom || {}),
            [day]: { ...prev, slots: [...(prev.slots || []), blankSlot()] },
          },
        },
      };
    });
  };

  const removeCustomSlot = (day, idx) => {
    setForm((p) => {
      const prev = normalizeDay(p.hours?.custom?.[day]);
      const nextSlots = (prev.slots || []).filter((_, i) => i !== idx);
      return {
        ...p,
        hours: {
          ...(p.hours || {}),
          custom: {
            ...(p.hours?.custom || {}),
            [day]: {
              ...prev,
              slots: nextSlots.length ? nextSlots : [blankSlot()],
            },
          },
        },
      };
    });
  };

  const setCustomSlot = (day, idx, key) => (e) => {
    const val = e?.target?.value ?? "";
    setForm((p) => {
      const prev = normalizeDay(p.hours?.custom?.[day]);
      const slots = [...(prev.slots || [blankSlot()])];
      slots[idx] = { ...(slots[idx] || blankSlot()), [key]: val };
      return {
        ...p,
        hours: {
          ...(p.hours || {}),
          custom: {
            ...(p.hours?.custom || {}),
            [day]: { ...prev, slots },
          },
        },
      };
    });
  };

  /** ---------------- Media uploads ---------------- */
  const onPickPortrait = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading portrait...");
      const res = await uploadImage(file, "businesses/portrait");
      setForm((p) => ({
        ...p,
        media: {
          ...(p.media || {}),
          portraitUrl: res.url,
          portraitPath: res.path,
        },
      }));
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
      setForm((p) => ({
        ...p,
        media: {
          ...(p.media || {}),
          bannerUrl: res.url,
          bannerPath: res.path,
        },
      }));
      toast.success("Banner uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  /** ---------------- Save business + create user/employee/admin ---------------- */
  const onSaveBusiness = async () => {
    if (!form.name.trim()) return toast.error("Business name is required");
    if (!form.email.trim()) return toast.error("Email is required");

    const emailLower = (form.email || "").toLowerCase().trim();
    const password = (form.password || "").trim() || `${form.name?.trim?.() || "Business"}321`;

    if (!isEmailValid(emailLower)) {
      return toast.error("Please enter a valid email address");
    }

    if (!normalizePermissions(form.permissions).length) {
      return toast.error("Please select at least one permission");
    }

    setSaving(true);
    let tempApp = null;

    try {
      const billingEmail = form.billing?.sameAsEmail
        ? form.email || ""
        : form.billing?.email || "";
      const billingPhone = form.billing?.sameAsPhone
        ? form.phone || ""
        : form.billing?.phone || "";

      const payload = {
        name: form.name?.trim() || "",
        phone: form.phone?.trim() || "",
        email: emailLower,
        abn: form.abn?.trim() || "",
        website: form.website?.trim() || "",
        note: form.note?.trim() || "",
        password,
        permissions: normalizePermissions(form.permissions),
        isActive: form.isActive ?? true,

        address: {
          ...form.address,
          city: form.address?.city || form.address?.cityName || "",
          state: form.address?.state || form.address?.stateName || "",
          lat: form.address?.lat == null ? null : Number(form.address.lat),
          lng: form.address?.lng == null ? null : Number(form.address.lng),
          mapLocation: form.address?.mapLocation || "",
        },

        customerCommunication: {
          contactNumber: form.customerCommunication?.contactNumber || "",
          contactEmail: form.customerCommunication?.contactEmail || "",
        },

        hours: {
          mode: form.hours?.mode || "week",
          week: {
            weekdays: {
              open: !!form.hours?.week?.weekdays?.open,
              slots: (
                normalizeWeekBucket(form.hours?.week?.weekdays).slots || [
                  blankSlot(),
                ]
              ).map((s) => ({
                from: s.from || "00:00",
                to: s.to || "00:00",
              })),
            },
            weekend: {
              open: !!form.hours?.week?.weekend?.open,
              slots: (
                normalizeWeekBucket(form.hours?.week?.weekend).slots || [
                  blankSlot(),
                ]
              ).map((s) => ({
                from: s.from || "00:00",
                to: s.to || "00:00",
              })),
            },
          },
          custom: DAYS.reduce((acc, day) => {
            const d = normalizeDay(form.hours?.custom?.[day]);
            acc[day] = {
              open: !!d.open,
              slots: (d.slots || [blankSlot()]).map((s) => ({
                from: s.from || "00:00",
                to: s.to || "00:00",
              })),
            };
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
            city:
              form.billing?.address?.city ||
              form.billing?.address?.cityName ||
              "",
            state:
              form.billing?.address?.state ||
              form.billing?.address?.stateName ||
              "",
          },
        },

        updatedAt: serverTimestamp(),
      };

      /** ---------------- EDIT MODE ---------------- */
      if (editingBiz?.id) {
        await updateDoc(doc(db, "businesses", editingBiz.id), payload);

        if (editingBiz.uid) {
          await setDoc(
            doc(db, "employees", editingBiz.uid),
            {
              uid: editingBiz.uid,
              name: payload.name,
              email: payload.email,
              mobileNo: payload.phone || "",
              address: payload.address?.line1 || "",
              type: "admin",
              role: "businessAdmin",
              empType: "business",
              businessId: editingBiz.id,
              businessName: payload.name,
              permissions: payload.permissions || [],
              isActive: payload.isActive ?? true,
              password,
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          await setDoc(
            doc(db, "users", editingBiz.uid),
            {
              uid: editingBiz.uid,
              firstname: payload.name,
              lastname: "",
              username: payload.name,
              email: payload.email,
              phone: payload.phone || "",
              businessId: editingBiz.id,
              businessName: payload.name,
              roles: {
                student: true,
                businessAdmin: true,
              },
              permissions: payload.permissions || [],
              password,
              updateddate: new Date(),
            },
            { merge: true }
          );
        }

        toast.success("Business saved ✅");

        setEditingBiz((p) => ({
          ...(p || {}),
          ...payload,
          id: editingBiz.id,
        }));
        return;
      }

      /** ---------------- CREATE MODE ---------------- */
      const qSame = query(
        collection(db, "businesses"),
        where("email", "==", emailLower),
        limit(1)
      );
      const sameSnap = await getDocs(qSame);
      if (!sameSnap.empty) {
        toast.warn("This email is already assigned to another business.");
        return;
      }

      const bizRef = await addDoc(collection(db, "businesses"), {
        ...payload,
        createdAt: serverTimestamp(),
        dealsCount: 0,
        dealIds: [],
        uid: null,
        adminUID: null,
      });

      const businessId = bizRef.id;
      const baseData = {
        ...payload,
        businessId,
      };

      const existingUser = await findUserByEmail(emailLower);
      if (existingUser?.uid) {
        await assignBusinessAdminToUid({
          targetUid: existingUser.uid,
          businessId,
          baseData,
          passwordFallback: existingUser.data?.password || password,
        });

        toast.success("Existing user assigned as Business Admin ✅");
        setEditingBiz({
          id: businessId,
          ...payload,
          uid: existingUser.uid,
          adminUID: existingUser.uid,
        });
        return;
      }

      const existingEmp = await findEmployeeByEmail(emailLower);
      if (existingEmp?.uid) {
        await assignBusinessAdminToUid({
          targetUid: existingEmp.uid,
          businessId,
          baseData,
          passwordFallback: existingEmp.data?.password || password,
        });

        toast.success("Existing employee assigned as Business Admin ✅");
        setEditingBiz({
          id: businessId,
          ...payload,
          uid: existingEmp.uid,
          adminUID: existingEmp.uid,
        });
        return;
      }

      tempApp = initializeApp(firebaseConfig, `businessCreator_${Date.now()}`);
      const tempAuth = getAuth(tempApp);

      try {
        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          emailLower,
          password
        );
        const user = userCredential.user;

        await updateProfile(user, {
          displayName: payload.name,
          photoURL: payload.media?.portraitUrl || undefined,
        });

        await setDoc(doc(db, "employees", user.uid), {
          uid: user.uid,
          name: payload.name,
          email: emailLower,
          mobileNo: payload.phone || "",
          address: payload.address?.line1 || "",
          type: "admin",
          role: "businessAdmin",
          empType: "business",
          businessId,
          businessName: payload.name,
          permissions: payload.permissions || [],
          isActive: payload.isActive ?? true,
          password,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          firstname: payload.name,
          lastname: "",
          username: payload.name,
          email: emailLower,
          phone: payload.phone || "",
          businessId,
          businessName: payload.name,
          createddate: new Date(),
          roles: {
            student: true,
            businessAdmin: true,
          },
          permissions: payload.permissions || [],
          password,
        });

        await updateDoc(doc(db, "businesses", businessId), {
          uid: user.uid,
          adminUID: user.uid,
          permissions: payload.permissions || [],
          password,
          updatedAt: serverTimestamp(),
        });

        toast.success("Business + Business Admin created ✅");
        setEditingBiz({
          id: businessId,
          ...payload,
          uid: user.uid,
          adminUID: user.uid,
        });
      } catch (err) {
        if (err?.code === "auth/email-already-in-use") {
          toast.warn(
            "Auth email already exists, but no matching user doc found."
          );
          return;
        }
        throw err;
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch {}
      }
    }
  };

  /** ---------------- Delete business ---------------- */
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

  /** ---------------- Deals: upload helper ---------------- */
  const uploadIfFile = async (file, folder) => {
    const path = `${folder}/${editingBiz.id}/${Date.now()}_${file.name}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    return { url, path };
  };

  /** ---------------- Save deal ---------------- */
  const saveDealForBusiness = async (values) => {
    if (!editingBiz?.id) return toast.error("Create business first, then add deals.");

    setDealSaving(true);
    try {
      let posterUrl = values.imageUrl || dealEditing?.posterUrl || "";
      let posterPath = dealEditing?.posterPath || "";

      if (values.imageFile) {
        const up = await uploadIfFile(values.imageFile, "deals/posters");
        posterUrl = up.url;
        posterPath = up.path;
      }

      let catalogUrl = values.catalogUrl || dealEditing?.retail?.catalogUrl || "";
      let catalogPath = dealEditing?.retail?.catalogPath || "";
      const isCatalog = String(values.mode || "").toLowerCase().includes("catalog");

      if (isCatalog && values.catalogFile) {
        const up2 = await uploadIfFile(values.catalogFile, "deals/catalogs");
        catalogUrl = up2.url;
        catalogPath = up2.path;
      }

      const dealPayload = formToDealPayload({
        values,
        editingBiz,
        form,
        dealEditing,
        posterUrl,
        posterPath,
        catalogUrl,
        catalogPath,
      });

      if (dealEditing?.id) {
        await updateDoc(doc(db, "deals", dealEditing.id), dealPayload);
        toast.success("Deal updated ✅");
      } else {
        const dealRef = await addDoc(collection(db, "deals"), {
          ...dealPayload,
          createdAt: serverTimestamp(),
          metrics: {
            views: 0,
            opens: 0,
            saves: 0,
            claims: 0,
            redemptions: 0,
            bookingClicks: 0,
          },
        });

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

  /** ---------------- Delete deal ---------------- */
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
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Businesses</h1>
          <p className="text-sm text-gray-500">
            List + Add/Edit + Deals — all in one page.
          </p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
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
            <FadeLoader color="#36d7b7" loading />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3 font-semibold">Business</th>
                <th className="p-3 font-semibold">Location</th>
                <th className="p-3 font-semibold">Contact</th>
                <th className="p-3 font-semibold">Password</th>
                <th className="p-3 font-semibold">Permissions</th>
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
                        <div className="font-semibold text-gray-900 truncate">
                          {b.name || "—"}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {b.website || "—"}
                        </div>
                        {b.uid ? (
                          <div className="text-[11px] text-gray-400 truncate">
                            UID: {b.uid}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">
                    {[b.address?.city, b.address?.state, b.address?.postcode]
                      .filter(Boolean)
                      .join(", ") || "—"}
                    {typeof b.address?.lat === "number" &&
                      typeof b.address?.lng === "number" && (
                        <span className="ml-2 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                          Pinned
                        </span>
                      )}
                  </td>

                  <td className="p-3 text-gray-700">
                    <div>{b.email || "—"}</div>
                    <div className="text-xs text-gray-500">{b.phone || ""}</div>
                  </td>

                  <td className="p-3 text-gray-700">
                    <span>{b.password || "—"}</span>
                  </td>

                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {(b.permissions || []).length ? (
                        (b.permissions || []).map((perm) => (
                          <span
                            key={perm}
                            className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
                          >
                            {perm}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
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
                  <td className="p-6 text-gray-500" colSpan={6}>
                    No businesses found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ===================== BUSINESS MODAL ===================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingBiz?.id ? "Edit Business" : "Create Business"}
                </h2>
                <p className="text-xs text-gray-500">
                  {editingBiz?.id
                    ? `Business ID: ${editingBiz.id}`
                    : "Create first, then add deals inside this modal."}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={onSaveBusiness}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Business"}
                </button>
                <button
                  onClick={() => {
                    if (!saving) {
                      setModalOpen(false);
                      setDealModalOpen(false);
                      setDealEditing(null);
                    }
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                  disabled={saving}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[80vh] overflow-auto bg-gray-50">
              <div className="space-y-4">
                {/* ---------------- Details ---------------- */}
                <Section
                  title="Details"
                  open={open.details}
                  onToggle={() => toggleOpen("details")}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={labelCls}>Name *</label>
                      <input
                        value={form.name}
                        onChange={set("name")}
                        className={inputCls}
                        placeholder="Nandos"
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Phone</label>
                      <input
                        value={form.phone}
                        onChange={set("phone")}
                        className={inputCls}
                        placeholder="0466..."
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Email *</label>
                      <input
                        value={form.email}
                        disabled={!!editingBiz?.id}
                        onChange={set("email")}
                        className={inputCls}
                        placeholder="email@domain.com"
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Password *</label>
                      <input
                        type="text"
                        value={form.password}
                        onChange={set("password")}
                        className={inputCls}
                        placeholder="Enter password"
                      />
                    </div>

                    <div>
                      <label className={labelCls}>ABN</label>
                      <input
                        value={form.abn}
                        onChange={set("abn")}
                        className={inputCls}
                        placeholder="20079066407"
                      />
                    </div>

                    <div>
                      <label className={labelCls}>Website</label>
                      <input
                        value={form.website}
                        onChange={set("website")}
                        className={inputCls}
                        placeholder="https://..."
                      />
                    </div>

                    <div className="md:col-span-2">
                      <fieldset className="mt-2">
                        <legend className="font-medium mb-2">Permissions</legend>

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
                          {BUSINESS_PERMISSION_OPTIONS.map(({ key, label }) => (
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

                    <div className="md:col-span-2">
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <span className="text-sm font-medium">Status</span>
                        <input
                          id="isActive"
                          type="checkbox"
                          name="isActive"
                          className="sr-only peer"
                          checked={form.isActive}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              isActive: e.target.checked,
                            }))
                          }
                        />
                        <div className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-green-500 transition-colors relative">
                          <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            form.isActive ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {form.isActive ? "Active" : "Inactive"}
                        </span>
                      </label>
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Address Line 1</label>
                      <input
                        value={form.address.line1}
                        onChange={setAddress("line1")}
                        className={inputCls}
                        placeholder="Line 1"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Address Line 2</label>
                      <input
                        value={form.address.line2}
                        onChange={setAddress("line2")}
                        className={inputCls}
                        placeholder="Line 2"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Postcode</label>
                      <input
                        value={form.address.postcode}
                        onChange={setAddress("postcode")}
                        className={inputCls}
                        placeholder="3000"
                      />
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

                    <div className="relative md:col-span-2">
                      <label className={labelCls}>Map Location</label>
                      <input
                        name="mapLocation"
                        readOnly
                        placeholder="Select on map"
                        value={form.address?.mapLocation || ""}
                        onClick={() => setShowMapModal(true)}
                        className="w-full border border-gray-300 p-2 pl-10 rounded cursor-pointer mt-2"
                      />
                      <MapPin className="absolute left-3 top-[58%] -translate-y-1/2 text-gray-500 pointer-events-none" />
                      <div className="mt-2 text-xs text-gray-500">
                        {typeof form.address?.lat === "number" &&
                        typeof form.address?.lng === "number"
                          ? `Saved: ${form.address.lat.toFixed(6)}, ${form.address.lng.toFixed(6)}`
                          : "No coordinates saved yet"}
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Note</label>
                      <textarea
                        value={form.note}
                        onChange={set("note")}
                        className={inputCls + " h-24 mt-2 resize-none"}
                        placeholder="Optional note..."
                      />
                    </div>
                  </div>
                </Section>

                {/* ---------------- Shop Hours ---------------- */}
                {/* <Section
                  title="Shop Hours"
                  open={open.hours}
                  onToggle={() => toggleOpen("hours")}
                >
                  <div className="flex gap-2 mb-4">
                    <button
                      type="button"
                      onClick={() => setHoursMode("week")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                        form.hours?.mode === "week"
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-900 border-gray-200"
                      }`}
                    >
                      Weekdays / Weekend
                    </button>

                    <button
                      type="button"
                      onClick={() => setHoursMode("custom")}
                      className={`rounded-full px-3 py-1 text-xs font-semibold border ${
                        form.hours?.mode === "custom"
                          ? "bg-black text-white border-black"
                          : "bg-white text-gray-900 border-gray-200"
                      }`}
                    >
                      Custom (per day)
                    </button>
                  </div>

                  {form.hours?.mode === "week" && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {["weekdays", "weekend"].map((bucket) => {
                        const bucketData = normalizeWeekBucket(form.hours?.week?.[bucket]);
                        const slots = bucketData.slots?.length
                          ? bucketData.slots
                          : [blankSlot()];

                        return (
                          <div
                            key={bucket}
                            className="rounded-xl border border-gray-200 p-4 bg-white"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-gray-900">
                                {bucket === "weekdays"
                                  ? "Weekdays (Mon–Fri)"
                                  : "Weekend (Sat–Sun)"}
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!bucketData.open}
                                  onChange={setWeekHoursOpen(bucket)}
                                />
                                Open
                              </label>
                            </div>

                            <div className="mt-3 space-y-3">
                              {slots.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="grid grid-cols-2 gap-3 items-end"
                                >
                                  <div>
                                    <label className={labelCls}>From</label>
                                    <input
                                      type="time"
                                      className={inputCls}
                                      value={s.from || "00:00"}
                                      onChange={setWeekSlot(bucket, idx, "from")}
                                      disabled={!bucketData.open}
                                    />
                                  </div>

                                  <div>
                                    <label className={labelCls}>To</label>
                                    <input
                                      type="time"
                                      className={inputCls}
                                      value={s.to || "00:00"}
                                      onChange={setWeekSlot(bucket, idx, "to")}
                                      disabled={!bucketData.open}
                                    />
                                  </div>

                                  <div className="col-span-2 flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                                      onClick={() => addWeekSlot(bucket)}
                                      disabled={!bucketData.open}
                                    >
                                      + Add time
                                    </button>

                                    <button
                                      type="button"
                                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                      onClick={() => removeWeekSlot(bucket, idx)}
                                      disabled={!bucketData.open}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {form.hours?.mode === "custom" && (
                    <div className="space-y-3">
                      {DAYS.map((day) => {
                        const d = normalizeDay(form.hours?.custom?.[day]);
                        const slots = d.slots?.length ? d.slots : [blankSlot()];

                        return (
                          <div
                            key={day}
                            className="rounded-xl border border-gray-200 p-4 bg-white"
                          >
                            <div className="flex items-center justify-between">
                              <div className="font-semibold text-gray-900 capitalize">
                                {day}
                              </div>

                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!d.open}
                                  onChange={setCustomHoursOpen(day)}
                                />
                                Open
                              </label>
                            </div>

                            <div className="mt-3 space-y-3">
                              {slots.map((s, idx) => (
                                <div
                                  key={idx}
                                  className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end"
                                >
                                  <div className="md:col-span-2">
                                    <label className={labelCls}>From</label>
                                    <input
                                      type="time"
                                      className={inputCls}
                                      value={s.from || "00:00"}
                                      onChange={setCustomSlot(day, idx, "from")}
                                      disabled={!d.open}
                                    />
                                  </div>

                                  <div className="md:col-span-2">
                                    <label className={labelCls}>To</label>
                                    <input
                                      type="time"
                                      className={inputCls}
                                      value={s.to || "00:00"}
                                      onChange={setCustomSlot(day, idx, "to")}
                                      disabled={!d.open}
                                    />
                                  </div>

                                  <div className="col-span-2 md:col-span-4 flex justify-end gap-2">
                                    <button
                                      type="button"
                                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                                      onClick={() => addCustomSlot(day)}
                                      disabled={!d.open}
                                    >
                                      + Add time
                                    </button>

                                    <button
                                      type="button"
                                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                                      onClick={() => removeCustomSlot(day, idx)}
                                      disabled={!d.open}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section> */}

                {/* ---------------- Billing ---------------- */}
                {/* <Section
                  title="Billing Address"
                  open={open.billing}
                  onToggle={() => toggleOpen("billing")}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Email</label>
                      <input
                        className={inputCls}
                        value={
                          form.billing?.sameAsEmail
                            ? form.email || ""
                            : form.billing?.email || ""
                        }
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
                                email: e.target.checked
                                  ? p.email || ""
                                  : p.billing?.email || "",
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
                        value={
                          form.billing?.sameAsPhone
                            ? form.phone || ""
                            : form.billing?.phone || ""
                        }
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
                                phone: e.target.checked
                                  ? p.phone || ""
                                  : p.billing?.phone || "",
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
                      <input
                        className={inputCls}
                        value={form.billing?.address?.line1 || ""}
                        onChange={setBillingAddr("line1")}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Billing Address Line 2</label>
                      <input
                        className={inputCls}
                        value={form.billing?.address?.line2 || ""}
                        onChange={setBillingAddr("line2")}
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className={labelCls}>Postcode</label>
                      <input
                        className={inputCls}
                        value={form.billing?.address?.postcode || ""}
                        onChange={setBillingAddr("postcode")}
                        placeholder="3000"
                      />
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
                </Section> */}

                {/* ---------------- Media ---------------- */}
                <Section
                  title="Media"
                  open={open.media}
                  onToggle={() => toggleOpen("media")}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className={labelCls}>Portrait</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-2 block w-full text-sm"
                        onChange={onPickPortrait}
                      />
                      {form.media?.portraitUrl ? (
                        <img
                          src={form.media.portraitUrl}
                          alt="Portrait"
                          className="mt-3 h-40 w-full rounded-xl object-cover border border-gray-200"
                        />
                      ) : null}
                    </div>

                    <div>
                      <label className={labelCls}>Banner</label>
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-2 block w-full text-sm"
                        onChange={onPickBanner}
                      />
                      {form.media?.bannerUrl ? (
                        <img
                          src={form.media.bannerUrl}
                          alt="Banner"
                          className="mt-3 h-40 w-full rounded-xl object-cover border border-gray-200"
                        />
                      ) : null}
                    </div>
                  </div>
                </Section>

                {/* ---------------- Deals ---------------- */}
                {/* <Section
                  title="Deals of this Business"
                  open={open.deals}
                  onToggle={() => toggleOpen("deals")}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {editingBiz?.id
                        ? "Create offers linked to this business."
                        : "Save business first to add deals."}
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
                                  src={d.posterUrl || d.imageUrl || "https://via.placeholder.com/120x80"}
                                  alt=""
                                />
                                <div className="min-w-0">
                                  <div className="font-semibold text-gray-900 truncate">
                                    {d.header || d.title || "—"}
                                  </div>
                                  <div className="text-xs text-gray-500 truncate">
                                    {d.category || d.campaignType || "—"}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 text-gray-700">{d.slot || "—"}</td>
                            <td className="p-3 text-gray-700">
                              {d.offerType || d.mode || "—"}
                            </td>
                            <td className="p-3">
                              <span
                                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                                  d.active
                                    ? "bg-green-50 text-green-700"
                                    : "bg-gray-100 text-gray-600"
                                }`}
                              >
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
                </Section> */}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== DEAL MODAL ===================== */}
      {dealModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {dealEditing?.id ? "Edit Deal" : "Add Deal"}
                </h2>
                <p className="text-xs text-gray-500">
                  Linked to: {form.name || "Business"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  form="deal-form"
                  disabled={dealSaving}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {dealSaving
                    ? "Saving..."
                    : dealEditing
                    ? "Save Changes"
                    : "Create Deal"}
                </button>
                <button
                  onClick={() => {
                    if (!dealSaving) {
                      setDealModalOpen(false);
                      setDealEditing(null);
                    }
                  }}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                  disabled={dealSaving}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="p-5 max-h-[75vh] overflow-auto">
              <DealForm
                initialValues={dealToFormValues(dealEditing)}
                onSubmit={saveDealForBusiness}
                loading={dealSaving}
                submitText={dealEditing?.id ? "Update Deal" : "Create Deal"}
                formId="deal-form"
                hideSubmit={true}
              />
            </div>
          </div>
        </div>
      )}

      {/* ===================== CONFIRM DELETE BUSINESS ===================== */}
      {deleteBizId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Business?
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                This action cannot be undone.
              </p>

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

      {/* ===================== CONFIRM DELETE DEAL ===================== */}
      {dealDeleteId && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Deal?
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                This action cannot be undone.
              </p>

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

      {/* ===================== MAP MODAL ===================== */}
      <Dialog
        open={showMapModal}
        keepMounted
        onClose={() => setShowMapModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Pick a Location</DialogTitle>
        <DialogContent dividers sx={{ height: 520, overflow: "hidden" }}>
          <MapLocationInput
            value={form.address?.mapLocation}
            onChange={(val) => {
              if (!val || val.lat == null || val.lng == null) return;

              const latNum = Number(Number(val.lat).toFixed(6));
              const lngNum = Number(Number(val.lng).toFixed(6));
              const coordsStr = `${lngNum.toFixed(6)},${latNum.toFixed(6)}`;

              setForm((p) => ({
                ...p,
                address: {
                  ...(p.address || {}),
                  lat: latNum,
                  lng: lngNum,
                  mapLocation: coordsStr,
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
            disabled={!form.address?.mapLocation}
          >
            Save location
          </Button>
        </DialogActions>
      </Dialog>

      <ToastContainer />
    </main>
  );
}