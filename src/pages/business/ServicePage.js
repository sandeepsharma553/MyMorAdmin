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
  getDocs,
  where,
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

const labelCls = "text-sm font-semibold text-gray-900";
const hintCls = "mt-1 text-xs text-gray-500";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const textareaCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none resize-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const chipBtnCls =
  "rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium hover:bg-gray-50";
const chipActiveCls =
  "rounded-full border border-black bg-black px-3 py-1.5 text-xs font-medium text-white";

const SERVICE_CATEGORY_PRESETS = {
  salon: {
    icon: "💇",
    serviceTypes: ["At Salon", "Home Service", "Both"],
    pricingModels: ["fixed", "starts_at", "package", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: false,
      booking: true,
      requirements: false,
      deliverables: true,
      checklist: true,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "staffRole",
      "genderType",
      "experienceYears",
      "chairCount",
      "slotDuration",
      "bufferTime",
      "appointmentRequired",
      "homeServiceAvailable",
      "serviceType",
      "skinHairType",
      "benefits",
      "aftercareText",
    ],
  },
  cleaning: {
    icon: "🧼",
    serviceTypes: ["At Customer Place"],
    pricingModels: ["fixed", "hourly", "starts_at", "custom_quote"],
    sections: {
      staff: false,
      timings: true,
      coverage: true,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: true,
      equipment: true,
      faq: true,
      packages: true,
    },
    fields: [
      "teamSize",
      "areaUnit",
      "minArea",
      "maxArea",
      "includesMaterial",
      "includesMachine",
      "serviceAreaText",
      "travelFee",
      "leadTimeHours",
      "beforeServiceNotes",
      "afterServiceNotes",
      "whatToExpect",
    ],
  },
  repair: {
    icon: "🛠️",
    serviceTypes: ["At Customer Place", "Pickup & Drop", "At Shop", "Remote"],
    pricingModels: ["inspection_fee", "fixed", "starts_at", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: true,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: true,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "brandSupport",
      "warrantyDays",
      "inspectionFee",
      "serviceAreaText",
      "travelFee",
      "leadTimeHours",
      "visitType",
      "issueTypes",
      "whatToExpect",
    ],
  },
  tutoring: {
    icon: "📘",
    serviceTypes: ["Online", "At Student Place", "At Tutor Place", "Both"],
    pricingModels: ["hourly", "fixed", "package", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: false,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: false,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "subjectList",
      "classModes",
      "sessionFormat",
      "studentLevel",
      "experienceYears",
      "demoClassAvailable",
      "leadTimeHours",
      "learningOutcomes",
      "whatToExpect",
    ],
  },
  photography: {
    icon: "📸",
    serviceTypes: ["At Venue", "At Studio", "Both"],
    pricingModels: ["fixed", "package", "starts_at", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: true,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: false,
      equipment: true,
      faq: true,
      packages: true,
    },
    fields: [
      "teamSize",
      "editingTurnaroundDays",
      "rawFilesIncluded",
      "travelFee",
      "leadTimeHours",
      "deliverableCount",
      "shootType",
      "equipmentList",
      "whatToExpect",
    ],
  },
  fitness: {
    icon: "🏋️",
    serviceTypes: ["At Studio", "At Home", "Outdoor", "Online", "Both"],
    pricingModels: ["per_session", "hourly", "package", "monthly", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: false,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: true,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "trainerGender",
      "experienceYears",
      "sessionFormat",
      "fitnessLevel",
      "homeServiceAvailable",
      "slotDuration",
      "leadTimeHours",
      "benefits",
      "whatToExpect",
    ],
  },
  consulting: {
    icon: "🧠",
    serviceTypes: ["Online", "Office Visit", "Both"],
    pricingModels: ["hourly", "fixed", "retainer", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: false,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: false,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "experienceYears",
      "consultationMode",
      "leadTimeHours",
      "sessionFormat",
      "deliverablesSummary",
      "whatToExpect",
    ],
  },
  itservice: {
    icon: "💻",
    serviceTypes: ["Remote", "At Office", "At Customer Place", "Both"],
    pricingModels: ["hourly", "fixed", "inspection_fee", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: true,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: true,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "brandSupport",
      "issueTypes",
      "experienceYears",
      "inspectionFee",
      "travelFee",
      "serviceAreaText",
      "leadTimeHours",
      "warrantyDays",
      "whatToExpect",
    ],
  },
  homeservice: {
    icon: "🏠",
    serviceTypes: ["At Customer Place"],
    pricingModels: ["fixed", "hourly", "starts_at", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: true,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: true,
      equipment: true,
      faq: true,
      packages: true,
    },
    fields: [
      "teamSize",
      "travelFee",
      "serviceAreaText",
      "leadTimeHours",
      "includesMaterial",
      "includesMachine",
      "beforeServiceNotes",
      "afterServiceNotes",
      "whatToExpect",
    ],
  },
  other: {
    icon: "🧩",
    serviceTypes: ["Onsite", "Remote", "Home Visit", "Both"],
    pricingModels: ["fixed", "hourly", "starts_at", "package", "custom_quote"],
    sections: {
      staff: true,
      timings: true,
      coverage: true,
      booking: true,
      requirements: true,
      deliverables: true,
      checklist: true,
      equipment: false,
      faq: true,
      packages: true,
    },
    fields: [
      "experienceYears",
      "serviceAreaText",
      "travelFee",
      "leadTimeHours",
      "whatToExpect",
      "benefits",
    ],
  },
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

const emptyPackage = () => ({
  name: "",
  price: "",
  duration: "",
  description: "",
  badge: "",
});

const emptyFaq = () => ({
  question: "",
  answer: "",
});

const emptyChecklistItem = () => ({
  label: "",
});

const initialForm = {
  title: "",
  businessName: "",
  category: "",
  categoryid: "",
  categoryKey: "other",
  subcategory: "",
  subcategoryid: "",
  shortDescription: "",
  description: "",

  pricingModel: "fixed",
  price: "",
  salePrice: "",
  duration: "",
  slotDuration: "60",
  bufferTime: "0",
  minBookingAmount: "",
  inspectionFee: "",
  travelFee: "",
  leadTimeHours: "2",

  serviceType: "Onsite",
  bookingType: "appointment",
  appointmentRequired: true,
  instantConfirmation: true,
  allowReschedule: true,
  maxBookingsPerSlot: "1",
  cancellationPolicy: "",
  bookingNotes: "",

  active: true,
  featured: false,
  homeServiceAvailable: false,
  sameDayAvailable: false,
  recommended: false,

  staffRole: "",
  staffName: "",
  experienceYears: "",
  teamSize: "",
  genderType: "unisex",
  trainerGender: "any",
  chairCount: "",
  warrantyDays: "",

  areaUnit: "sqft",
  minArea: "",
  maxArea: "",
  serviceAreaText: "",
  cityText: "",
  postcodeText: "",

  includesMaterial: false,
  includesMachine: false,
  rawFilesIncluded: false,
  demoClassAvailable: false,

  classModes: "",
  sessionFormat: "",
  studentLevel: "",
  subjectList: "",
  learningOutcomes: "",

  consultationMode: "",
  deliverablesSummary: "",
  deliverableCount: "",
  shootType: "",
  equipmentList: "",
  brandSupport: "",
  issueTypes: "",
  visitType: "",
  fitnessLevel: "",
  skinHairType: "",

  whatToExpect: "",
  beforeServiceNotes: "",
  afterServiceNotes: "",
  benefits: "",
  requirementsText: "",
  deliverablesText: "",
  aftercareText: "",

  tagsText: "",
  metaTitle: "",
  metaDescription: "",

  imageUrl: "",
  imagePath: "",
  galleryUrls: [],
  packages: [emptyPackage()],
  faqs: [emptyFaq()],
  checklist: [emptyChecklistItem()],

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

function Section({ title, open, onToggle, children, badge }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          <div
            className={`h-5 w-5 rounded-full border ${
              open ? "border-black bg-black" : "border-gray-300 bg-white"
            }`}
          />
          <div>
            <div className="text-base font-semibold text-gray-900">{title}</div>
            {badge ? (
              <div className="mt-0.5 text-xs font-medium text-gray-500">{badge}</div>
            ) : null}
          </div>
        </div>
        <div className="text-gray-500">{open ? "▴" : "▾"}</div>
      </button>
      {open ? <div className="px-5 pb-5">{children}</div> : null}
    </div>
  );
}

function normalizeKey(value = "") {
  return String(value).replace(/\s+/g, "").toLowerCase();
}

function uniquePath(folder, file) {
  const ext = file?.name?.includes(".") ? file.name.split(".").pop() : "jpg";
  const base = String(file?.name || "file").replace(/\.[^/.]+$/, "");
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return `${folder}/${base}_${stamp}.${ext}`;
}

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
    badge: x?.badge || "",
  }));
}

function normalizeFaqs(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyFaq()];
  return raw.map((x) => ({
    question: x?.question || "",
    answer: x?.answer || "",
  }));
}

function normalizeChecklist(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyChecklistItem()];
  return raw.map((x) => ({
    label: x?.label || "",
  }));
}

function Input({ label, hint, ...props }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input {...props} className={inputCls} />
      {hint ? <p className={hintCls}>{hint}</p> : null}
    </div>
  );
}

function Textarea({ label, hint, className = "", ...props }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea {...props} className={`${textareaCls} ${className}`.trim()} />
      {hint ? <p className={hintCls}>{hint}</p> : null}
    </div>
  );
}

function Select({ label, hint, children, ...props }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <select {...props} className={inputCls}>
        {children}
      </select>
      {hint ? <p className={hintCls}>{hint}</p> : null}
    </div>
  );
}

function ToggleCard({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
      <div className="pr-4">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {hint ? <div className="mt-1 text-xs text-gray-500">{hint}</div> : null}
      </div>
      <input type="checkbox" checked={!!checked} onChange={onChange} />
    </label>
  );
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
  const [categoryOption, setCategoryOption] = useState([]);
  const [subCategoryOption, setSubCategoryOption] = useState([]);

  const [open, setOpen] = useState({
    basic: true,
    pricing: true,
    availability: true,
    staff: true,
    requirements: false,
    packages: true,
    faq: false,
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

  useEffect(() => {
    getCategory();
  }, []);

  const getCategory = async () => {
    try {
      const qCat = query(collection(db, "servicecategory"));
      const snap = await getDocs(qCat);
      setCategoryOption(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };

  const getSubCategory = async (categoryId) => {
    try {
      if (!categoryId) {
        setSubCategoryOption([]);
        return;
      }

      const qCat = query(
        collection(db, "servicesubcategory"),
        where("categoryId", "==", categoryId)
      );
      const snap = await getDocs(qCat);
      setSubCategoryOption(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load subcategories");
    }
  };

  const categoryConfig = useMemo(() => {
    return (
      SERVICE_CATEGORY_PRESETS[normalizeKey(form.category) || form.categoryKey] ||
      SERVICE_CATEGORY_PRESETS.other
    );
  }, [form.category, form.categoryKey]);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;

    return rows.filter((r) =>
      [
        r.title,
        r.businessName,
        r.category,
        r.subcategory,
        r.shortDescription,
        r.description,
        r.staffName,
        r.staffRole,
        r.serviceType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [rows, qText]);

  const toggleOpen = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));

  const set = (key) => (e) => {
    const value =
      e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((p) => ({ ...p, [key]: value }));
  };

  const setFromItem = (item) => {
    const next = {
      ...initialForm,
      ...item,
      categoryid: item?.categoryid || "",
      subcategoryid: item?.subcategoryid || "",
      categoryKey:
        item?.categoryKey ||
        normalizeKey(item?.category) ||
        initialForm.categoryKey,
      price: item?.price === 0 || item?.price ? String(item.price) : "",
      salePrice: item?.salePrice === 0 || item?.salePrice ? String(item.salePrice) : "",
      duration: item?.duration === 0 || item?.duration ? String(item.duration) : "",
      slotDuration:
        item?.slotDuration === 0 || item?.slotDuration
          ? String(item.slotDuration)
          : "60",
      bufferTime:
        item?.bufferTime === 0 || item?.bufferTime ? String(item.bufferTime) : "0",
      minBookingAmount:
        item?.minBookingAmount === 0 || item?.minBookingAmount
          ? String(item.minBookingAmount)
          : "",
      inspectionFee:
        item?.inspectionFee === 0 || item?.inspectionFee
          ? String(item.inspectionFee)
          : "",
      travelFee:
        item?.travelFee === 0 || item?.travelFee ? String(item.travelFee) : "",
      leadTimeHours:
        item?.leadTimeHours === 0 || item?.leadTimeHours
          ? String(item.leadTimeHours)
          : "2",
      experienceYears:
        item?.experienceYears === 0 || item?.experienceYears
          ? String(item.experienceYears)
          : "",
      teamSize:
        item?.teamSize === 0 || item?.teamSize ? String(item.teamSize) : "",
      chairCount:
        item?.chairCount === 0 || item?.chairCount ? String(item.chairCount) : "",
      warrantyDays:
        item?.warrantyDays === 0 || item?.warrantyDays
          ? String(item.warrantyDays)
          : "",
      maxBookingsPerSlot:
        item?.maxBookingsPerSlot === 0 || item?.maxBookingsPerSlot
          ? String(item.maxBookingsPerSlot)
          : "1",
      minArea:
        item?.minArea === 0 || item?.minArea ? String(item.minArea) : "",
      maxArea:
        item?.maxArea === 0 || item?.maxArea ? String(item.maxArea) : "",
      editingTurnaroundDays:
        item?.editingTurnaroundDays === 0 || item?.editingTurnaroundDays
          ? String(item.editingTurnaroundDays)
          : "",
      deliverableCount:
        item?.deliverableCount === 0 || item?.deliverableCount
          ? String(item.deliverableCount)
          : "",
      tagsText: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
      packages: normalizePackages(item?.packages),
      faqs: normalizeFaqs(item?.faqs),
      checklist: normalizeChecklist(item?.checklist),
      galleryUrls: Array.isArray(item?.galleryUrls) ? item.galleryUrls : [],
    };

    if (item?.timings) {
      next.mondayOpen = !!item.timings?.monday?.open;
      next.mondayFrom = item.timings?.monday?.from || "10:00";
      next.mondayTo = item.timings?.monday?.to || "20:00";
      next.tuesdayOpen = !!item.timings?.tuesday?.open;
      next.tuesdayFrom = item.timings?.tuesday?.from || "10:00";
      next.tuesdayTo = item.timings?.tuesday?.to || "20:00";
      next.wednesdayOpen = !!item.timings?.wednesday?.open;
      next.wednesdayFrom = item.timings?.wednesday?.from || "10:00";
      next.wednesdayTo = item.timings?.wednesday?.to || "20:00";
      next.thursdayOpen = !!item.timings?.thursday?.open;
      next.thursdayFrom = item.timings?.thursday?.from || "10:00";
      next.thursdayTo = item.timings?.thursday?.to || "20:00";
      next.fridayOpen = !!item.timings?.friday?.open;
      next.fridayFrom = item.timings?.friday?.from || "10:00";
      next.fridayTo = item.timings?.friday?.to || "20:00";
      next.saturdayOpen = !!item.timings?.saturday?.open;
      next.saturdayFrom = item.timings?.saturday?.from || "10:00";
      next.saturdayTo = item.timings?.saturday?.to || "20:00";
      next.sundayOpen = !!item.timings?.sunday?.open;
      next.sundayFrom = item.timings?.sunday?.from || "10:00";
      next.sundayTo = item.timings?.sunday?.to || "18:00";
    }

    setForm(next);
  };

  const resetForm = () => {
    setEditingItem(null);
    setForm(initialForm);
    setSubCategoryOption([]);
    setOpen({
      basic: true,
      pricing: true,
      availability: true,
      staff: true,
      requirements: false,
      packages: true,
      faq: false,
      media: true,
      seo: false,
      visibility: true,
    });
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = async (item) => {
    setEditingItem(item);
    setFromItem(item);
    if (item?.categoryid) {
      await getSubCategory(item.categoryid);
    } else {
      setSubCategoryOption([]);
    }
    setModalOpen(true);
  };

  const onPickImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      toast.info("Uploading cover image...");
      const res = await uploadImage(file, "services/images");
      setForm((p) => ({
        ...p,
        imageUrl: res.url,
        imagePath: res.path,
      }));
      toast.success("Cover image uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Upload failed");
    }
  };

  const onPickGallery = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      toast.info("Uploading gallery images...");
      const uploaded = [];
      for (const file of files) {
        const res = await uploadImage(file, "services/gallery");
        uploaded.push(res.url);
      }
      setForm((p) => ({
        ...p,
        galleryUrls: [...(p.galleryUrls || []), ...uploaded],
      }));
      toast.success("Gallery uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Gallery upload failed");
    }
  };

  const removeGalleryImage = (idx) => {
    setForm((p) => ({
      ...p,
      galleryUrls: (p.galleryUrls || []).filter((_, i) => i !== idx),
    }));
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

  const addChecklistItem = () => {
    setForm((p) => ({
      ...p,
      checklist: [...(p.checklist || []), emptyChecklistItem()],
    }));
  };

  const removeChecklistItem = (index) => {
    setForm((p) => {
      const next = (p.checklist || []).filter((_, i) => i !== index);
      return { ...p, checklist: next.length ? next : [emptyChecklistItem()] };
    });
  };

  const setChecklistItem = (index, value) => {
    setForm((p) => {
      const next = [...(p.checklist || [])];
      next[index] = { label: value };
      return { ...p, checklist: next };
    });
  };

  const selectCategoryTemplate = (categoryName) => {
    const key = normalizeKey(categoryName);
    const preset = SERVICE_CATEGORY_PRESETS[key] || SERVICE_CATEGORY_PRESETS.other;

    setForm((p) => ({
      ...p,
      categoryKey: key || "other",
      pricingModel: preset.pricingModels?.[0] || p.pricingModel,
      serviceType: preset.serviceTypes?.[0] || p.serviceType,
      appointmentRequired: key === "salon" ? true : p.appointmentRequired,
      homeServiceAvailable:
        key === "salon" || key === "fitness" || key === "homeservice"
          ? p.homeServiceAvailable
          : p.homeServiceAvailable,
      bookingType:
        key === "salon"
          ? "appointment"
          : key === "repair" || key === "cleaning"
          ? "appointment"
          : p.bookingType,
    }));
  };

  const numberOrNull = (v) => (v === "" ? null : Number(v));

  const onSave = async () => {
    if (!form.title.trim()) return toast.error("Service title is required");
    if (!form.category.trim()) return toast.error("Category is required");
    if (!form.shortDescription.trim())
      return toast.error("Short description is required");

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        businessName: form.businessName.trim(),
        category: form.category.trim(),
        categoryid: form.categoryid || "",
        categoryKey: form.categoryKey || normalizeKey(form.category) || "other",
        subcategory: form.subcategory.trim(),
        subcategoryid: form.subcategoryid || "",
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),

        pricingModel: form.pricingModel,
        price: numberOrNull(form.price),
        salePrice: numberOrNull(form.salePrice),
        duration: numberOrNull(form.duration),
        slotDuration: numberOrNull(form.slotDuration),
        bufferTime: numberOrNull(form.bufferTime),
        minBookingAmount: numberOrNull(form.minBookingAmount),
        inspectionFee: numberOrNull(form.inspectionFee),
        travelFee: numberOrNull(form.travelFee),
        leadTimeHours: numberOrNull(form.leadTimeHours),

        serviceType: form.serviceType,
        bookingType: form.bookingType,
        appointmentRequired: !!form.appointmentRequired,
        instantConfirmation: !!form.instantConfirmation,
        allowReschedule: !!form.allowReschedule,
        maxBookingsPerSlot: numberOrNull(form.maxBookingsPerSlot),
        cancellationPolicy: form.cancellationPolicy.trim(),
        bookingNotes: form.bookingNotes.trim(),

        active: !!form.active,
        featured: !!form.featured,
        homeServiceAvailable: !!form.homeServiceAvailable,
        sameDayAvailable: !!form.sameDayAvailable,
        recommended: !!form.recommended,

        staffRole: form.staffRole.trim(),
        staffName: form.staffName.trim(),
        experienceYears: numberOrNull(form.experienceYears),
        teamSize: numberOrNull(form.teamSize),
        genderType: form.genderType,
        trainerGender: form.trainerGender,
        chairCount: numberOrNull(form.chairCount),
        warrantyDays: numberOrNull(form.warrantyDays),

        areaUnit: form.areaUnit,
        minArea: numberOrNull(form.minArea),
        maxArea: numberOrNull(form.maxArea),
        serviceAreaText: form.serviceAreaText.trim(),
        cityText: form.cityText.trim(),
        postcodeText: form.postcodeText.trim(),

        includesMaterial: !!form.includesMaterial,
        includesMachine: !!form.includesMachine,
        rawFilesIncluded: !!form.rawFilesIncluded,
        demoClassAvailable: !!form.demoClassAvailable,

        classModes: form.classModes.trim(),
        sessionFormat: form.sessionFormat.trim(),
        studentLevel: form.studentLevel.trim(),
        subjectList: form.subjectList.trim(),
        learningOutcomes: form.learningOutcomes.trim(),

        consultationMode: form.consultationMode.trim(),
        deliverablesSummary: form.deliverablesSummary.trim(),
        deliverableCount: numberOrNull(form.deliverableCount),
        shootType: form.shootType.trim(),
        equipmentList: form.equipmentList.trim(),
        brandSupport: form.brandSupport.trim(),
        issueTypes: form.issueTypes.trim(),
        visitType: form.visitType.trim(),
        fitnessLevel: form.fitnessLevel.trim(),
        skinHairType: form.skinHairType.trim(),

        whatToExpect: form.whatToExpect.trim(),
        beforeServiceNotes: form.beforeServiceNotes.trim(),
        afterServiceNotes: form.afterServiceNotes.trim(),
        benefits: form.benefits.trim(),
        requirementsText: form.requirementsText.trim(),
        deliverablesText: form.deliverablesText.trim(),
        aftercareText: form.aftercareText.trim(),

        tags: (form.tagsText || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),

        metaTitle: form.metaTitle.trim(),
        metaDescription: form.metaDescription.trim(),

        imageUrl: form.imageUrl || "",
        imagePath: form.imagePath || "",
        galleryUrls: Array.isArray(form.galleryUrls) ? form.galleryUrls : [],

        timings: {
          monday: { open: !!form.mondayOpen, from: form.mondayFrom, to: form.mondayTo },
          tuesday: { open: !!form.tuesdayOpen, from: form.tuesdayFrom, to: form.tuesdayTo },
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
          friday: { open: !!form.fridayOpen, from: form.fridayFrom, to: form.fridayTo },
          saturday: {
            open: !!form.saturdayOpen,
            from: form.saturdayFrom,
            to: form.saturdayTo,
          },
          sunday: { open: !!form.sundayOpen, from: form.sundayFrom, to: form.sundayTo },
        },

        packages: (form.packages || [])
          .map((x) => ({
            name: (x?.name || "").trim(),
            price: x?.price === "" ? null : Number(x.price),
            duration: x?.duration === "" ? null : Number(x.duration),
            description: (x?.description || "").trim(),
            badge: (x?.badge || "").trim(),
          }))
          .filter((x) => x.name),

        faqs: (form.faqs || [])
          .map((x) => ({
            question: (x?.question || "").trim(),
            answer: (x?.answer || "").trim(),
          }))
          .filter((x) => x.question && x.answer),

        checklist: (form.checklist || [])
          .map((x) => ({ label: (x?.label || "").trim() }))
          .filter((x) => x.label),

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

  const showField = (field) => categoryConfig.fields.includes(field);

  return (
    <main
      className="flex-1 overflow-auto bg-gray-100 p-6"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
          <p className="mt-1 text-sm text-gray-500">
            Professional category-wise service management page
          </p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add Service
        </button>
      </div>

      <div className="mb-4 flex gap-3">
        <input
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200 sm:w-96"
          placeholder="Search service, category, staff, type..."
          value={qText}
          onChange={(e) => setQText(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <FadeLoader color="#111827" loading />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3 font-semibold">Service</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Pricing</th>
                <th className="p-3 font-semibold">Mode</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="w-48 p-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        className="h-12 w-12 rounded-xl border border-gray-100 object-cover"
                        src={item.imageUrl || "https://via.placeholder.com/80"}
                        alt=""
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-900">
                          {item.title || "—"}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {item.businessName || "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">
                    {[item.category, item.subcategory].filter(Boolean).join(" / ") || "—"}
                  </td>

                  <td className="p-3 text-gray-700">
                    {item.pricingModel
                      ? `${item.pricingModel.replace(/_/g, " ")}`
                      : "—"}
                    <div className="text-xs text-gray-500">
                      {item.salePrice != null
                        ? `₹${item.salePrice}`
                        : item.price != null
                        ? `₹${item.price}`
                        : "—"}
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">{item.serviceType || "—"}</td>

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
                        className="rounded-lg border border-gray-200 px-3 py-1.5 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 ? (
                <tr>
                  <td className="p-6 text-gray-500" colSpan={6}>
                    No services found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingItem?.id ? "Edit Service" : "Create Professional Service"}
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  Category-wise dynamic service form
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onSave}
                  disabled={saving}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Service"}
                </button>
                <button
                  onClick={() => !saving && setModalOpen(false)}
                  disabled={saving}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[82vh] overflow-auto bg-gray-50 p-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.55fr_0.65fr]">
                <div className="space-y-4">
                  <Section
                    title="Basic Service Information"
                    open={open.basic}
                    onToggle={() => toggleOpen("basic")}
                    badge="UrbanClap-style core profile"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <Input
                          label="Service Title *"
                          value={form.title}
                          onChange={set("title")}
                          placeholder="e.g. Deep Cleaning for 2BHK / Bridal Makeup / AC Repair"
                        />
                      </div>

                      <div>
                        <Input
                          label="Business / Provider Name"
                          value={form.businessName}
                          onChange={set("businessName")}
                          placeholder="Business name"
                        />
                      </div>

                      <div>
                        <Select
                          label="Category *"
                          value={form.categoryid || ""}
                          onChange={async (e) => {
                            const selectedId = e.target.value;
                            const selectedCategory = categoryOption.find(
                              (m) => m.id === selectedId
                            );
                            await getSubCategory(selectedId);
                            const categoryName = selectedCategory?.name || "";
                            const categoryKey =
                              normalizeKey(categoryName) || "other";

                            setForm((p) => ({
                              ...p,
                              categoryid: selectedId,
                              category: categoryName,
                              categoryKey,
                              subcategoryid: "",
                              subcategory: "",
                            }));

                            selectCategoryTemplate(categoryName);
                          }}
                        >
                          <option value="">Select category</option>
                          {categoryOption.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <Select
                          label="Subcategory"
                          value={form.subcategoryid || ""}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const selectedSubcategory = subCategoryOption.find(
                              (m) => m.id === selectedId
                            );
                            setForm((p) => ({
                              ...p,
                              subcategoryid: selectedId,
                              subcategory: selectedSubcategory?.name || "",
                            }));
                          }}
                        >
                          <option value="">Select subcategory</option>
                          {subCategoryOption.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.name}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <Select
                          label="Service Mode"
                          value={form.serviceType}
                          onChange={set("serviceType")}
                        >
                          {(categoryConfig.serviceTypes || ["Onsite"]).map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div className="md:col-span-2">
                        <Input
                          label="Short Description *"
                          value={form.shortDescription}
                          onChange={set("shortDescription")}
                          placeholder="One line professional summary"
                          hint="This will appear in list / search / preview."
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Textarea
                          label="Detailed Description"
                          value={form.description}
                          onChange={set("description")}
                          className="h-32"
                          placeholder="Explain the service in a professional way."
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                          <div className="mb-2 text-sm font-semibold text-gray-900">
                            Selected Template
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className={chipActiveCls}>
                              {categoryConfig.icon} {form.category || "Other"}
                            </span>
                            <span className={chipBtnCls}>
                              {form.subcategory || "No subcategory selected"}
                            </span>
                            <span className={chipBtnCls}>
                              {form.serviceType || "Mode not selected"}
                            </span>
                            <span className={chipBtnCls}>
                              {form.pricingModel.replace(/_/g, " ")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Pricing & Booking Rules"
                    open={open.pricing}
                    onToggle={() => toggleOpen("pricing")}
                    badge="Category-wise commercial setup"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <div>
                        <Select
                          label="Pricing Model"
                          value={form.pricingModel}
                          onChange={set("pricingModel")}
                        >
                          {(categoryConfig.pricingModels || ["fixed"]).map((x) => (
                            <option key={x} value={x}>
                              {x.replace(/_/g, " ")}
                            </option>
                          ))}
                        </Select>
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Base Price"
                          value={form.price}
                          onChange={set("price")}
                          placeholder="1000"
                        />
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Offer Price"
                          value={form.salePrice}
                          onChange={set("salePrice")}
                          placeholder="899"
                        />
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Duration (mins)"
                          value={form.duration}
                          onChange={set("duration")}
                          placeholder="60"
                        />
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Slot Duration (mins)"
                          value={form.slotDuration}
                          onChange={set("slotDuration")}
                          placeholder="60"
                        />
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Buffer Time (mins)"
                          value={form.bufferTime}
                          onChange={set("bufferTime")}
                          placeholder="0"
                        />
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Min Booking Amount"
                          value={form.minBookingAmount}
                          onChange={set("minBookingAmount")}
                          placeholder="0"
                        />
                      </div>

                      {(showField("inspectionFee") ||
                        form.pricingModel === "inspection_fee") && (
                        <div>
                          <Input
                            type="number"
                            label="Inspection Fee"
                            value={form.inspectionFee}
                            onChange={set("inspectionFee")}
                            placeholder="299"
                          />
                        </div>
                      )}

                      {showField("travelFee") && (
                        <div>
                          <Input
                            type="number"
                            label="Travel Fee"
                            value={form.travelFee}
                            onChange={set("travelFee")}
                            placeholder="99"
                          />
                        </div>
                      )}

                      <div>
                        <Input
                          type="number"
                          label="Lead Time (hours)"
                          value={form.leadTimeHours}
                          onChange={set("leadTimeHours")}
                          placeholder="2"
                        />
                      </div>

                      <div>
                        <Select
                          label="Booking Type"
                          value={form.bookingType}
                          onChange={set("bookingType")}
                        >
                          <option value="appointment">Appointment</option>
                          <option value="walkin">Walk-in</option>
                          <option value="both">Both</option>
                          <option value="inquiry">Inquiry</option>
                        </Select>
                      </div>

                      <div>
                        <Input
                          type="number"
                          label="Max Bookings / Slot"
                          value={form.maxBookingsPerSlot}
                          onChange={set("maxBookingsPerSlot")}
                          placeholder="1"
                        />
                      </div>

                      <div className="md:col-span-3">
                        <Textarea
                          label="Cancellation Policy"
                          value={form.cancellationPolicy}
                          onChange={set("cancellationPolicy")}
                          className="h-24"
                          placeholder="Cancellation / refund / reschedule rules..."
                        />
                      </div>

                      <div className="md:col-span-3">
                        <Textarea
                          label="Booking Notes"
                          value={form.bookingNotes}
                          onChange={set("bookingNotes")}
                          className="h-24"
                          placeholder="Any note customer should know before booking"
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Availability, Timings & Operational Setup"
                    open={open.availability}
                    onToggle={() => toggleOpen("availability")}
                    badge="Professional service operations"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {categoryConfig.sections.staff ? (
                        <>
                          {showField("staffRole") && (
                            <Input
                              label="Staff Role"
                              value={form.staffRole}
                              onChange={set("staffRole")}
                              placeholder="Beautician / Trainer / Technician / Consultant"
                            />
                          )}

                          <Input
                            label="Staff / Expert Name"
                            value={form.staffName}
                            onChange={set("staffName")}
                            placeholder="Expert name"
                          />

                          {showField("experienceYears") && (
                            <Input
                              type="number"
                              label="Experience (years)"
                              value={form.experienceYears}
                              onChange={set("experienceYears")}
                              placeholder="5"
                            />
                          )}

                          {showField("teamSize") && (
                            <Input
                              type="number"
                              label="Team Size"
                              value={form.teamSize}
                              onChange={set("teamSize")}
                              placeholder="2"
                            />
                          )}

                          {showField("chairCount") && (
                            <Input
                              type="number"
                              label="Chair Count"
                              value={form.chairCount}
                              onChange={set("chairCount")}
                              placeholder="4"
                            />
                          )}

                          {showField("genderType") && (
                            <Select
                              label="Gender Type"
                              value={form.genderType}
                              onChange={set("genderType")}
                            >
                              <option value="unisex">Unisex</option>
                              <option value="men">Men</option>
                              <option value="women">Women</option>
                              <option value="kids">Kids</option>
                            </Select>
                          )}

                          {showField("trainerGender") && (
                            <Select
                              label="Trainer Preference"
                              value={form.trainerGender}
                              onChange={set("trainerGender")}
                            >
                              <option value="any">Any</option>
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                            </Select>
                          )}

                          {showField("warrantyDays") && (
                            <Input
                              type="number"
                              label="Warranty (days)"
                              value={form.warrantyDays}
                              onChange={set("warrantyDays")}
                              placeholder="30"
                            />
                          )}
                        </>
                      ) : null}

                      {showField("serviceAreaText") && (
                        <Input
                          label="Service Area / Coverage"
                          value={form.serviceAreaText}
                          onChange={set("serviceAreaText")}
                          placeholder="e.g. Delhi NCR / 10 km around city center"
                        />
                      )}

                      <Input
                        label="City"
                        value={form.cityText}
                        onChange={set("cityText")}
                        placeholder="City / region"
                      />

                      <Input
                        label="Postcode / Area Codes"
                        value={form.postcodeText}
                        onChange={set("postcodeText")}
                        placeholder="400001, 400002"
                      />

                      {showField("areaUnit") && (
                        <Select
                          label="Area Unit"
                          value={form.areaUnit}
                          onChange={set("areaUnit")}
                        >
                          <option value="sqft">sq ft</option>
                          <option value="sqm">sq m</option>
                          <option value="room">room</option>
                        </Select>
                      )}

                      {showField("minArea") && (
                        <Input
                          type="number"
                          label="Minimum Area"
                          value={form.minArea}
                          onChange={set("minArea")}
                          placeholder="500"
                        />
                      )}

                      {showField("maxArea") && (
                        <Input
                          type="number"
                          label="Maximum Area"
                          value={form.maxArea}
                          onChange={set("maxArea")}
                          placeholder="2500"
                        />
                      )}
                    </div>

                    {categoryConfig.sections.timings ? (
                      <div className="mt-5 space-y-3">
                        <div className="text-sm font-semibold text-gray-900">
                          Weekly Timings
                        </div>
                        {dayRows.map(([label, openKey, fromKey, toKey]) => (
                          <div
                            key={label}
                            className="grid grid-cols-1 items-end gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[140px_90px_1fr_1fr]"
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
                    ) : null}
                  </Section>

                  <Section
                    title="Service Details, Requirements & Deliverables"
                    open={open.requirements}
                    onToggle={() => toggleOpen("requirements")}
                    badge="Shown category-wise"
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {showField("subjectList") && (
                        <Input
                          label="Subjects / Topics"
                          value={form.subjectList}
                          onChange={set("subjectList")}
                          placeholder="Math, Physics, Spoken English"
                        />
                      )}

                      {showField("classModes") && (
                        <Input
                          label="Class Modes"
                          value={form.classModes}
                          onChange={set("classModes")}
                          placeholder="1-on-1, group, online"
                        />
                      )}

                      {showField("sessionFormat") && (
                        <Input
                          label="Session Format"
                          value={form.sessionFormat}
                          onChange={set("sessionFormat")}
                          placeholder="1 hour live session / workshop"
                        />
                      )}

                      {showField("studentLevel") && (
                        <Input
                          label="Student Level"
                          value={form.studentLevel}
                          onChange={set("studentLevel")}
                          placeholder="School / College / Beginner / Advanced"
                        />
                      )}

                      {showField("consultationMode") && (
                        <Input
                          label="Consultation Mode"
                          value={form.consultationMode}
                          onChange={set("consultationMode")}
                          placeholder="Video / Phone / In-person"
                        />
                      )}

                      {showField("deliverablesSummary") && (
                        <Input
                          label="Deliverables Summary"
                          value={form.deliverablesSummary}
                          onChange={set("deliverablesSummary")}
                          placeholder="Audit report / action plan / consultation notes"
                        />
                      )}

                      {showField("deliverableCount") && (
                        <Input
                          type="number"
                          label="Deliverable Count"
                          value={form.deliverableCount}
                          onChange={set("deliverableCount")}
                          placeholder="50"
                        />
                      )}

                      {showField("shootType") && (
                        <Input
                          label="Shoot Type"
                          value={form.shootType}
                          onChange={set("shootType")}
                          placeholder="Wedding / Product / Maternity / Event"
                        />
                      )}

                      {showField("equipmentList") && (
                        <Input
                          label="Equipment Used"
                          value={form.equipmentList}
                          onChange={set("equipmentList")}
                          placeholder="DSLR, lights, stabilizer"
                        />
                      )}

                      {showField("brandSupport") && (
                        <Input
                          label="Supported Brands / Models"
                          value={form.brandSupport}
                          onChange={set("brandSupport")}
                          placeholder="LG, Samsung, Dell, HP..."
                        />
                      )}

                      {showField("issueTypes") && (
                        <Input
                          label="Issue Types"
                          value={form.issueTypes}
                          onChange={set("issueTypes")}
                          placeholder="Not cooling, no power, screen issue..."
                        />
                      )}

                      {showField("visitType") && (
                        <Input
                          label="Visit Type"
                          value={form.visitType}
                          onChange={set("visitType")}
                          placeholder="Inspection + repair / installation"
                        />
                      )}

                      {showField("fitnessLevel") && (
                        <Input
                          label="Fitness Level"
                          value={form.fitnessLevel}
                          onChange={set("fitnessLevel")}
                          placeholder="Beginner / Intermediate / Advanced"
                        />
                      )}

                      {showField("skinHairType") && (
                        <Input
                          label="Skin / Hair Type"
                          value={form.skinHairType}
                          onChange={set("skinHairType")}
                          placeholder="Dry / Oily / Curly / Damaged"
                        />
                      )}

                      {showField("learningOutcomes") && (
                        <Textarea
                          label="Learning Outcomes"
                          value={form.learningOutcomes}
                          onChange={set("learningOutcomes")}
                          className="h-24 md:col-span-2"
                          placeholder="What the learner will achieve"
                        />
                      )}

                      {showField("whatToExpect") && (
                        <Textarea
                          label="What To Expect"
                          value={form.whatToExpect}
                          onChange={set("whatToExpect")}
                          className="h-24 md:col-span-2"
                          placeholder="Explain journey / process for customer"
                        />
                      )}

                      {showField("benefits") && (
                        <Textarea
                          label="Benefits"
                          value={form.benefits}
                          onChange={set("benefits")}
                          className="h-24 md:col-span-2"
                          placeholder="Key customer benefits"
                        />
                      )}

                      {categoryConfig.sections.requirements ? (
                        <Textarea
                          label="Customer Requirements"
                          value={form.requirementsText}
                          onChange={set("requirementsText")}
                          className="h-24 md:col-span-2"
                          placeholder="What customer should arrange before service"
                        />
                      ) : null}

                      {categoryConfig.sections.deliverables ? (
                        <Textarea
                          label="Service Deliverables"
                          value={form.deliverablesText}
                          onChange={set("deliverablesText")}
                          className="h-24 md:col-span-2"
                          placeholder="What is included in the service"
                        />
                      ) : null}

                      {showField("beforeServiceNotes") && (
                        <Textarea
                          label="Before Service Notes"
                          value={form.beforeServiceNotes}
                          onChange={set("beforeServiceNotes")}
                          className="h-24 md:col-span-2"
                          placeholder="Preparation before service"
                        />
                      )}

                      {showField("afterServiceNotes") && (
                        <Textarea
                          label="After Service Notes"
                          value={form.afterServiceNotes}
                          onChange={set("afterServiceNotes")}
                          className="h-24 md:col-span-2"
                          placeholder="Aftercare / post service info"
                        />
                      )}

                      {showField("aftercareText") && (
                        <Textarea
                          label="Aftercare"
                          value={form.aftercareText}
                          onChange={set("aftercareText")}
                          className="h-24 md:col-span-2"
                          placeholder="Aftercare instructions"
                        />
                      )}
                    </div>

                    {categoryConfig.sections.checklist ? (
                      <div className="mt-5">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm font-semibold text-gray-900">
                            Checklist / Included Points
                          </div>
                          <button
                            type="button"
                            onClick={addChecklistItem}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                          >
                            + Add Item
                          </button>
                        </div>

                        <div className="space-y-3">
                          {(form.checklist || []).map((item, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
                            >
                              <input
                                value={item.label}
                                onChange={(e) => setChecklistItem(index, e.target.value)}
                                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
                                placeholder="e.g. Includes deep vacuuming / hair wash / consultation note"
                              />
                              <button
                                type="button"
                                onClick={() => removeChecklistItem(index)}
                                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </Section>

                  {categoryConfig.sections.packages ? (
                    <Section
                      title="Packages & Variants"
                      open={open.packages}
                      onToggle={() => toggleOpen("packages")}
                      badge="Multiple service options"
                    >
                      <div className="space-y-4">
                        {(form.packages || []).map((pkg, index) => (
                          <div
                            key={index}
                            className="rounded-2xl border border-gray-200 bg-white p-4"
                          >
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                              <Input
                                label="Package Name"
                                value={pkg.name}
                                onChange={(e) =>
                                  setPackageField(index, "name", e.target.value)
                                }
                                placeholder="Basic / Premium / Deluxe"
                              />

                              <Input
                                type="number"
                                label="Price"
                                value={pkg.price}
                                onChange={(e) =>
                                  setPackageField(index, "price", e.target.value)
                                }
                                placeholder="999"
                              />

                              <Input
                                type="number"
                                label="Duration"
                                value={pkg.duration}
                                onChange={(e) =>
                                  setPackageField(index, "duration", e.target.value)
                                }
                                placeholder="60"
                              />

                              <Input
                                label="Badge"
                                value={pkg.badge}
                                onChange={(e) =>
                                  setPackageField(index, "badge", e.target.value)
                                }
                                placeholder="Most Popular"
                              />

                              <div className="md:col-span-4">
                                <Textarea
                                  label="Description"
                                  value={pkg.description}
                                  onChange={(e) =>
                                    setPackageField(index, "description", e.target.value)
                                  }
                                  className="h-20"
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
                  ) : null}

                  {categoryConfig.sections.faq ? (
                    <Section
                      title="FAQs"
                      open={open.faq}
                      onToggle={() => toggleOpen("faq")}
                    >
                      <div className="space-y-4">
                        {(form.faqs || []).map((faq, index) => (
                          <div
                            key={index}
                            className="rounded-2xl border border-gray-200 bg-white p-4"
                          >
                            <div className="grid grid-cols-1 gap-4">
                              <Input
                                label="Question"
                                value={faq.question}
                                onChange={(e) =>
                                  setFaqField(index, "question", e.target.value)
                                }
                                placeholder="Question"
                              />

                              <Textarea
                                label="Answer"
                                value={faq.answer}
                                onChange={(e) =>
                                  setFaqField(index, "answer", e.target.value)
                                }
                                className="h-20"
                                placeholder="Answer"
                              />
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
                  ) : null}

                  <Section
                    title="Media"
                    open={open.media}
                    onToggle={() => toggleOpen("media")}
                  >
                    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                      <div>
                        <label className={labelCls}>Cover Image</label>
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
                            className="mt-3 h-44 w-44 rounded-xl border border-gray-200 object-cover"
                          />
                        ) : null}
                      </div>

                      <div>
                        <label className={labelCls}>Gallery Images</label>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          className="mt-2 block w-full text-sm"
                          onChange={onPickGallery}
                        />
                        <div className="mt-3 grid grid-cols-3 gap-3">
                          {(form.galleryUrls || []).map((url, idx) => (
                            <div
                              key={`${url}_${idx}`}
                              className="relative overflow-hidden rounded-xl border border-gray-200"
                            >
                              <img
                                src={url}
                                alt=""
                                className="h-24 w-full object-cover"
                              />
                              <button
                                type="button"
                                onClick={() => removeGalleryImage(idx)}
                                className="absolute right-1 top-1 rounded-md bg-black/70 px-2 py-1 text-[10px] text-white"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="SEO"
                    open={open.seo}
                    onToggle={() => toggleOpen("seo")}
                  >
                    <div className="grid grid-cols-1 gap-4">
                      <Input
                        label="Tags"
                        value={form.tagsText}
                        onChange={set("tagsText")}
                        placeholder="salon, bridal, repair, home cleaning"
                      />

                      <Input
                        label="Meta Title"
                        value={form.metaTitle}
                        onChange={set("metaTitle")}
                        placeholder="SEO title"
                      />

                      <Textarea
                        label="Meta Description"
                        value={form.metaDescription}
                        onChange={set("metaDescription")}
                        className="h-24"
                        placeholder="SEO description"
                      />
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
                      <ToggleCard
                        label="Active"
                        checked={form.active}
                        onChange={set("active")}
                        hint="Visible to users"
                      />
                      <ToggleCard
                        label="Featured"
                        checked={form.featured}
                        onChange={set("featured")}
                        hint="Highlight in list / homepage"
                      />
                      <ToggleCard
                        label="Recommended"
                        checked={form.recommended}
                        onChange={set("recommended")}
                        hint="Mark as recommended service"
                      />
                      <ToggleCard
                        label="Appointment Required"
                        checked={form.appointmentRequired}
                        onChange={set("appointmentRequired")}
                        hint="Booking requires appointment flow"
                      />
                      <ToggleCard
                        label="Instant Confirmation"
                        checked={form.instantConfirmation}
                        onChange={set("instantConfirmation")}
                        hint="Auto-confirm user bookings"
                      />
                      <ToggleCard
                        label="Allow Reschedule"
                        checked={form.allowReschedule}
                        onChange={set("allowReschedule")}
                        hint="User can reschedule appointment"
                      />
                      <ToggleCard
                        label="Same Day Available"
                        checked={form.sameDayAvailable}
                        onChange={set("sameDayAvailable")}
                        hint="Enable same-day service"
                      />
                      <ToggleCard
                        label="Home Service Available"
                        checked={form.homeServiceAvailable}
                        onChange={set("homeServiceAvailable")}
                        hint="At-home visit can be booked"
                      />
                      <ToggleCard
                        label="Includes Material"
                        checked={form.includesMaterial}
                        onChange={set("includesMaterial")}
                        hint="Provider brings service material"
                      />
                      <ToggleCard
                        label="Includes Machine / Equipment"
                        checked={form.includesMachine}
                        onChange={set("includesMachine")}
                        hint="Provider brings tools/machines"
                      />
                      <ToggleCard
                        label="Raw Files Included"
                        checked={form.rawFilesIncluded}
                        onChange={set("rawFilesIncluded")}
                        hint="Useful for photography category"
                      />
                      <ToggleCard
                        label="Demo Class Available"
                        checked={form.demoClassAvailable}
                        onChange={set("demoClassAvailable")}
                        hint="Useful for tutoring/fitness"
                      />
                    </div>
                  </Section>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-semibold text-gray-900">
                        Preview
                      </h3>
                      <span className={chipBtnCls}>
                        {categoryConfig.icon} {form.category || "Other"}
                      </span>
                    </div>

                    <div className="mt-4 overflow-hidden rounded-2xl border border-gray-100 bg-white">
                      <div className="flex h-52 items-center justify-center bg-gray-100">
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

                      <div className="space-y-2 p-4">
                        <div className="line-clamp-2 text-lg font-semibold text-gray-900">
                          {form.title || "Service title"}
                        </div>

                        <div className="text-sm text-gray-500">
                          {form.businessName || "Business name"}
                        </div>

                        <div className="flex flex-wrap gap-2 pt-1">
                          <span className={chipBtnCls}>
                            {form.serviceType || "Mode"}
                          </span>
                          <span className={chipBtnCls}>
                            {form.bookingType || "Booking"}
                          </span>
                          <span className={chipBtnCls}>
                            {form.pricingModel.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div className="pt-2 text-2xl font-bold text-gray-900">
                          ₹{form.salePrice || form.price || 0}
                        </div>

                        <div className="text-sm text-gray-500">
                          {form.duration ? `${form.duration} mins` : "Duration not set"}
                        </div>

                        <div className="pt-2 text-sm text-gray-600">
                          {form.shortDescription || "Short description"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="text-base font-semibold text-gray-900">
                      Smart Category Fields
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(categoryConfig.fields || []).map((f) => (
                        <span key={f} className={chipBtnCls}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {deleteId ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">Delete Service?</h3>
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
      ) : null}

      <ToastContainer />
    </main>
  );
}