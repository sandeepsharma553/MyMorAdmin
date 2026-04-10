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
  serverTimestamp, getDocs,
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

/* ---------------------------- constants ---------------------------- */
const PRODUCT_CATEGORIES = [
  "Electronics",
  "Fashion",
  "Beauty",
  "Home & Kitchen",
  "Grocery",
  "Sports",
  "Books",
  "Accessories",
  "Other",
];

const BADGE_COLOR_OPTIONS = [
  { value: "orange", label: "Orange" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
  { value: "purple", label: "Purple" },
  { value: "red", label: "Red" },
  { value: "gray", label: "Gray" },
];

const OFFER_ICON_OPTIONS = [
  { value: "coupon", label: "Coupon" },
  { value: "bank", label: "Bank" },
  { value: "bundle", label: "Bundle" },
  { value: "offer", label: "Offer" },
];

const TRUST_ICON_OPTIONS = [
  { value: "return", label: "Return" },
  { value: "cod", label: "Cash / COD" },
  { value: "secure", label: "Secure" },
  { value: "delivery", label: "Delivery" },
  { value: "support", label: "Support" },
];

const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const textareaCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none resize-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const emptyVariant = () => ({
  name: "",
  options: [{ value: "", price: "", stock: "", sku: "", image: null }],
});

const emptySpec = () => ({
  key: "",
  value: "",
});

const emptyBadge = () => ({
  text: "",
  color: "orange",
});

const emptyOffer = () => ({
  title: "",
  description: "",
  icon: "coupon",
});

const emptyTrustBadge = () => ({
  title: "",
  icon: "secure",
});

/* ---------------------------- initial form ---------------------------- */
const initialForm = {
  title: "",
  brand: "",
  sku: "",
  category: "",
  subcategory: "",
  shortDescription: "",
  description: "",

  price: "",
  salePrice: "",
  taxRate: "",
  stock: "",
  minOrderQty: "1",

  weight: "",
  length: "",
  width: "",
  height: "",

  tagsText: "",
  metaTitle: "",
  metaDescription: "",

  featured: false,
  active: true,
  cod: true,
  returnable: true,

  images: [],
  variants: [emptyVariant()],
  specifications: [emptySpec()],

  /* -------- customer product page fields -------- */
  displayBrand: "",
  productType: "",
  rating: "",
  ratingCount: "",
  inStockText: "In stock",
  taxInclusiveText: "Inclusive of all taxes",

  badges: [emptyBadge()],

  offersTitle: "Offers & Coupons",
  offers: [emptyOffer()],

  deliveryTitle: "Delivery",
  deliverySubtitle: "Deliver to your address",
  pincodeEnabled: true,
  pincodePlaceholder: "Enter pincode",
  checkButtonText: "Check",
  deliveryMessage: "FREE delivery by tomorrow. Order within 8 hrs 25 mins.",

  sellerTitle: "Seller",
  sellerName: "MyMor Verified Store",
  sellerMeta: "92% positive ratings • Trusted seller",
  sellerButtonText: "Visit",

  trustBadges: [
    { title: "7-day return", icon: "return" },
    { title: "Pay on delivery", icon: "cod" },
    { title: "Secure transaction", icon: "secure" },
  ],

  aboutTitle: "About this item",
  aboutDescription:
    "Write a detailed description that appears on the customer product page.",
  aboutBulletsText: "",

  buyNowEnabled: true,
  addToCartEnabled: true,
};

/* ---------------------------- helpers ---------------------------- */
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
            className={`h-5 w-5 rounded-full border ${open ? "bg-black border-black" : "bg-white border-gray-300"
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

async function uploadImage(file, folder = "products/images") {
  const path = uniquePath(folder, file);
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, path };
}

function normalizeVariants(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyVariant()];
  return raw.map((v) => ({
    name: v?.name || "",
    options:
      Array.isArray(v?.options) && v.options.length
        ? v.options.map((o) => ({
          value: o?.value || "",
          price: o?.price === 0 || o?.price ? String(o.price) : "",
          stock: o?.stock === 0 || o?.stock ? String(o.stock) : "",
          sku: o?.sku || "",
          image: o?.image
            ? {
              url: o.image?.url || "",
              path: o.image?.path || "",
            }
            : null,
        }))
        : [{ value: "", price: "", stock: "", sku: "", image: null }],
  }));
}

function normalizeSpecifications(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptySpec()];
  return raw.map((x) => ({
    key: x?.key || "",
    value: x?.value || "",
  }));
}

function normalizeBadges(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyBadge()];
  return raw.map((x) => ({
    text: x?.text || "",
    color: x?.color || "orange",
  }));
}

function normalizeOffers(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [emptyOffer()];
  return raw.map((x) => ({
    title: x?.title || "",
    description: x?.description || "",
    icon: x?.icon || "coupon",
  }));
}

function normalizeTrustBadges(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return [
      { title: "7-day return", icon: "return" },
      { title: "Pay on delivery", icon: "cod" },
      { title: "Secure transaction", icon: "secure" },
    ];
  }
  return raw.map((x) => ({
    title: x?.title || "",
    icon: x?.icon || "secure",
  }));
}

function badgePreviewCls(color) {
  switch (color) {
    case "orange":
      return "bg-orange-50 text-orange-700";
    case "blue":
      return "bg-blue-50 text-blue-700";
    case "green":
      return "bg-green-50 text-green-700";
    case "purple":
      return "bg-purple-50 text-purple-700";
    case "red":
      return "bg-red-50 text-red-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

/* ---------------------------- page ---------------------------- */
export default function ProductPage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const [form, setForm] = useState(initialForm);
  const [categoryOption, setCategoryOption] = useState([]);
  const [open, setOpen] = useState({
    basic: true,
    pricing: true,
    media: true,
    variants: true,
    specs: false,
    shipping: false,
    seo: false,
    visibility: true,
    storefront: true,
    offers: true,
    delivery: true,
    seller: true,
    about: true,
  });

  /* ---------------- load firestore ---------------- */
  useEffect(() => {
    const qy = query(collection(db, "products"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load products");
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
      const qCat = query(collection(db, "productcategory"));
      const snap = await getDocs(qCat);
      setCategoryOption(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };
  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [
        r.title,
        r.brand,
        r.sku,
        r.category,
        r.subcategory,
        r.shortDescription,
        r.displayBrand,
        r.productType,
        r.sellerName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [rows, qText]);

  /* ---------------- form helpers ---------------- */
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
      media: true,
      variants: true,
      specs: false,
      shipping: false,
      seo: false,
      visibility: true,
      storefront: true,
      offers: true,
      delivery: true,
      seller: true,
      about: true,
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
      taxRate:
        item?.taxRate === 0 || item?.taxRate ? String(item.taxRate) : "",
      stock: item?.stock === 0 || item?.stock ? String(item.stock) : "",
      minOrderQty:
        item?.minOrderQty === 0 || item?.minOrderQty
          ? String(item.minOrderQty)
          : "1",
      weight: item?.weight === 0 || item?.weight ? String(item.weight) : "",
      length: item?.length === 0 || item?.length ? String(item.length) : "",
      width: item?.width === 0 || item?.width ? String(item.width) : "",
      height: item?.height === 0 || item?.height ? String(item.height) : "",
      rating: item?.rating === 0 || item?.rating ? String(item.rating) : "",
      ratingCount:
        item?.ratingCount === 0 || item?.ratingCount
          ? String(item.ratingCount)
          : "",
      tagsText: Array.isArray(item?.tags) ? item.tags.join(", ") : "",
      aboutBulletsText: Array.isArray(item?.aboutBullets)
        ? item.aboutBullets.join("\n")
        : "",
      images: Array.isArray(item?.images) ? item.images : [],
      variants: normalizeVariants(item?.variants),
      specifications: normalizeSpecifications(item?.specifications),
      badges: normalizeBadges(item?.badges),
      offers: normalizeOffers(item?.offers),
      trustBadges: normalizeTrustBadges(item?.trustBadges),
    });
    setModalOpen(true);
  };

  /* ---------------- image upload ---------------- */
  const onPickImages = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    try {
      toast.info("Uploading images...");
      const uploaded = [];
      for (const file of files) {
        const res = await uploadImage(file, "products/images");
        uploaded.push(res);
      }

      setForm((p) => ({
        ...p,
        images: [...(p.images || []), ...uploaded],
      }));

      toast.success("Images uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Image upload failed");
    }
  };

  const removeImage = (index) => {
    setForm((p) => ({
      ...p,
      images: (p.images || []).filter((_, i) => i !== index),
    }));
  };
  const onPickVariantImage = async (groupIndex, optionIndex, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.info("Uploading variant image...");
      const uploaded = await uploadImage(file, "products/variants");

      setForm((p) => {
        const next = [...(p.variants || [])];
        const options = [...(next[groupIndex]?.options || [])];

        options[optionIndex] = {
          ...(options[optionIndex] || {}),
          image: uploaded,
        };

        next[groupIndex] = {
          ...next[groupIndex],
          options,
        };

        return { ...p, variants: next };
      });

      toast.success("Variant image uploaded ✅");
    } catch (err) {
      console.error(err);
      toast.error("Variant image upload failed");
    }
  };

  const removeVariantImage = (groupIndex, optionIndex) => {
    setForm((p) => {
      const next = [...(p.variants || [])];
      const options = [...(next[groupIndex]?.options || [])];

      options[optionIndex] = {
        ...(options[optionIndex] || {}),
        image: null,
      };

      next[groupIndex] = {
        ...next[groupIndex],
        options,
      };

      return { ...p, variants: next };
    });
  };
  /* ---------------- variants ---------------- */
  const addVariantGroup = () => {
    setForm((p) => ({
      ...p,
      variants: [...(p.variants || []), emptyVariant()],
    }));
  };

  const removeVariantGroup = (groupIndex) => {
    setForm((p) => {
      const next = (p.variants || []).filter((_, i) => i !== groupIndex);
      return {
        ...p,
        variants: next.length ? next : [emptyVariant()],
      };
    });
  };

  const setVariantGroupName = (groupIndex, value) => {
    setForm((p) => {
      const next = [...(p.variants || [])];
      next[groupIndex] = { ...next[groupIndex], name: value };
      return { ...p, variants: next };
    });
  };

  const addVariantOption = (groupIndex) => {
    setForm((p) => {
      const next = [...(p.variants || [])];
      next[groupIndex] = {
        ...next[groupIndex],
        options: [
          ...(next[groupIndex]?.options || []),
          { value: "", price: "", stock: "", sku: "", image: null },
        ],
      };
      return { ...p, variants: next };
    });
  };

  const removeVariantOption = (groupIndex, optionIndex) => {
    setForm((p) => {
      const next = [...(p.variants || [])];
      const currentOptions = next[groupIndex]?.options || [];
      const newOptions = currentOptions.filter((_, i) => i !== optionIndex);

      next[groupIndex] = {
        ...next[groupIndex],
        options: newOptions.length
          ? newOptions
          : [{ value: "", price: "", stock: "", sku: "" }],
      };

      return { ...p, variants: next };
    });
  };

  const setVariantOptionField = (groupIndex, optionIndex, key, value) => {
    setForm((p) => {
      const next = [...(p.variants || [])];
      const options = [...(next[groupIndex]?.options || [])];
      options[optionIndex] = {
        ...(options[optionIndex] || {
          value: "",
          price: "",
          stock: "",
          sku: "",
          image: null,
        }),
        [key]: value,
      };
      next[groupIndex] = { ...next[groupIndex], options };
      return { ...p, variants: next };
    });
  };

  /* ---------------- specifications ---------------- */
  const addSpec = () => {
    setForm((p) => ({
      ...p,
      specifications: [...(p.specifications || []), emptySpec()],
    }));
  };

  const removeSpec = (index) => {
    setForm((p) => {
      const next = (p.specifications || []).filter((_, i) => i !== index);
      return {
        ...p,
        specifications: next.length ? next : [emptySpec()],
      };
    });
  };

  const setSpecField = (index, key, value) => {
    setForm((p) => {
      const next = [...(p.specifications || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...p, specifications: next };
    });
  };

  /* ---------------- badges ---------------- */
  const addBadge = () => {
    setForm((p) => ({ ...p, badges: [...(p.badges || []), emptyBadge()] }));
  };

  const removeBadge = (index) => {
    setForm((p) => {
      const next = (p.badges || []).filter((_, i) => i !== index);
      return { ...p, badges: next.length ? next : [emptyBadge()] };
    });
  };

  const setBadgeField = (index, key, value) => {
    setForm((p) => {
      const next = [...(p.badges || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...p, badges: next };
    });
  };

  /* ---------------- offers ---------------- */
  const addOffer = () => {
    setForm((p) => ({ ...p, offers: [...(p.offers || []), emptyOffer()] }));
  };

  const removeOffer = (index) => {
    setForm((p) => {
      const next = (p.offers || []).filter((_, i) => i !== index);
      return { ...p, offers: next.length ? next : [emptyOffer()] };
    });
  };

  const setOfferField = (index, key, value) => {
    setForm((p) => {
      const next = [...(p.offers || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...p, offers: next };
    });
  };

  /* ---------------- trust badges ---------------- */
  const addTrustBadge = () => {
    setForm((p) => ({
      ...p,
      trustBadges: [...(p.trustBadges || []), emptyTrustBadge()],
    }));
  };

  const removeTrustBadge = (index) => {
    setForm((p) => {
      const next = (p.trustBadges || []).filter((_, i) => i !== index);
      return {
        ...p,
        trustBadges: next.length ? next : [emptyTrustBadge()],
      };
    });
  };

  const setTrustBadgeField = (index, key, value) => {
    setForm((p) => {
      const next = [...(p.trustBadges || [])];
      next[index] = { ...next[index], [key]: value };
      return { ...p, trustBadges: next };
    });
  };

  /* ---------------- save ---------------- */
  const onSave = async () => {
    if (!form.title.trim()) return toast.error("Product title is required");
    if (!form.category.trim()) return toast.error("Category is required");

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        brand: form.brand.trim(),
        sku: form.sku.trim(),
        category: form.category.trim(),
        subcategory: form.subcategory.trim(),
        shortDescription: form.shortDescription.trim(),
        description: form.description.trim(),

        price: form.price === "" ? null : Number(form.price),
        salePrice: form.salePrice === "" ? null : Number(form.salePrice),
        taxRate: form.taxRate === "" ? null : Number(form.taxRate),
        stock: form.stock === "" ? null : Number(form.stock),
        minOrderQty: form.minOrderQty === "" ? 1 : Number(form.minOrderQty),

        weight: form.weight === "" ? null : Number(form.weight),
        length: form.length === "" ? null : Number(form.length),
        width: form.width === "" ? null : Number(form.width),
        height: form.height === "" ? null : Number(form.height),

        tags: (form.tagsText || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),

        metaTitle: form.metaTitle.trim(),
        metaDescription: form.metaDescription.trim(),

        featured: !!form.featured,
        active: !!form.active,
        cod: !!form.cod,
        returnable: !!form.returnable,

        images: (form.images || []).map((x) => ({
          url: x?.url || "",
          path: x?.path || "",
        })),

        variants: (form.variants || [])
          .map((group) => ({
            name: (group?.name || "").trim(),
            options: (group?.options || [])
              .map((o) => ({
                value: (o?.value || "").trim(),
                price: o?.price === "" ? null : Number(o.price),
                stock: o?.stock === "" ? null : Number(o.stock),
                sku: (o?.sku || "").trim(),
              }))
              .filter((o) => o.value),
          }))
          .filter((g) => g.name && g.options.length),

        specifications: (form.specifications || [])
          .map((s) => ({
            key: (s?.key || "").trim(),
            value: (s?.value || "").trim(),
          }))
          .filter((s) => s.key && s.value),

        /* -------- storefront / customer page -------- */
        displayBrand: form.displayBrand.trim(),
        productType: form.productType.trim(),
        rating: form.rating === "" ? null : Number(form.rating),
        ratingCount: form.ratingCount === "" ? null : Number(form.ratingCount),
        inStockText: form.inStockText.trim(),
        taxInclusiveText: form.taxInclusiveText.trim(),

        badges: (form.badges || [])
          .map((b) => ({
            text: (b?.text || "").trim(),
            color: (b?.color || "orange").trim(),
          }))
          .filter((b) => b.text),

        offersTitle: form.offersTitle.trim(),
        offers: (form.offers || [])
          .map((o) => ({
            title: (o?.title || "").trim(),
            description: (o?.description || "").trim(),
            icon: (o?.icon || "coupon").trim(),
          }))
          .filter((o) => o.title || o.description),

        deliveryTitle: form.deliveryTitle.trim(),
        deliverySubtitle: form.deliverySubtitle.trim(),
        pincodeEnabled: !!form.pincodeEnabled,
        pincodePlaceholder: form.pincodePlaceholder.trim(),
        checkButtonText: form.checkButtonText.trim(),
        deliveryMessage: form.deliveryMessage.trim(),

        sellerTitle: form.sellerTitle.trim(),
        sellerName: form.sellerName.trim(),
        sellerMeta: form.sellerMeta.trim(),
        sellerButtonText: form.sellerButtonText.trim(),

        trustBadges: (form.trustBadges || [])
          .map((x) => ({
            title: (x?.title || "").trim(),
            icon: (x?.icon || "secure").trim(),
          }))
          .filter((x) => x.title),

        aboutTitle: form.aboutTitle.trim(),
        aboutDescription: form.aboutDescription.trim(),
        aboutBullets: (form.aboutBulletsText || "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),

        buyNowEnabled: !!form.buyNowEnabled,
        addToCartEnabled: !!form.addToCartEnabled,

        updatedAt: serverTimestamp(),
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, "products", editingItem.id), payload);
        toast.success("Product updated ✅");
      } else {
        await addDoc(collection(db, "products"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Product created ✅");
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

  /* ---------------- delete ---------------- */
  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, "products", deleteId));
      toast.success("Product deleted ✅");
      setDeleteId(null);
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  /* ---------------- preview values ---------------- */
  const previewBrand = form.displayBrand || form.brand || "Brand";
  const previewPrice = form.salePrice || form.price || 0;
  const previewComparePrice =
    form.salePrice && form.price ? form.price : null;

  /* ---------------- ui ---------------- */
  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-gray-500">
            Product admin with storefront detail management
          </p>
        </div>

        <button
          onClick={openCreate}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          + Add Product
        </button>
      </div>

      <div className="flex gap-3 mb-3">
        <input
          className="w-full sm:w-96 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
          placeholder="Search products..."
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
                <th className="p-3 font-semibold">Product</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Price</th>
                <th className="p-3 font-semibold">Stock</th>
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
                        src={
                          item?.images?.[0]?.url ||
                          "https://via.placeholder.com/80"
                        }
                        alt=""
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {item.title || "—"}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {item.displayBrand || item.brand || item.sku || "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">
                    {[item.category, item.subcategory].filter(Boolean).join(" / ") ||
                      "—"}
                  </td>

                  <td className="p-3 text-gray-700">
                    {item.salePrice != null
                      ? `₹${item.salePrice}`
                      : item.price != null
                        ? `₹${item.price}`
                        : "—"}
                  </td>

                  <td className="p-3 text-gray-700">
                    {item.stock != null ? item.stock : "—"}
                  </td>

                  <td className="p-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${item.active
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
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ===================== MODAL ===================== */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-7xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editingItem?.id ? "Edit Product" : "Add Product"}
                </h2>
                <p className="text-xs text-gray-500">
                  Admin-managed product page data
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onSave}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save Product"}
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
              <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_0.55fr] gap-5">
                {/* LEFT */}
                <div className="space-y-4">
                  <Section
                    title="Basic Product Information"
                    open={open.basic}
                    onToggle={() => toggleOpen("basic")}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className={labelCls}>Product Title *</label>
                        <input
                          value={form.title}
                          onChange={set("title")}
                          className={inputCls}
                          placeholder="e.g. Trucker Hat - White"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Brand</label>
                        <input
                          value={form.brand}
                          onChange={set("brand")}
                          className={inputCls}
                          placeholder="Brand name"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Display Brand</label>
                        <input
                          value={form.displayBrand}
                          onChange={set("displayBrand")}
                          className={inputCls}
                          placeholder="e.g. ACAP"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>SKU</label>
                        <input
                          value={form.sku}
                          onChange={set("sku")}
                          className={inputCls}
                          placeholder="SKU-1001"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Product Type</label>
                        <input
                          value={form.productType}
                          onChange={set("productType")}
                          className={inputCls}
                          placeholder="e.g. Accessories • Hats"
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
                          {categoryOption.map((option) => (
                                  <option key={option.id} value={option.name}>
                                    {option.name}
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
                          placeholder="e.g. Hats"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Rating</label>
                        <input
                          type="number"
                          step="0.1"
                          value={form.rating}
                          onChange={set("rating")}
                          className={inputCls}
                          placeholder="4.4"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Ratings Count</label>
                        <input
                          type="number"
                          value={form.ratingCount}
                          onChange={set("ratingCount")}
                          className={inputCls}
                          placeholder="1824"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Short Description</label>
                        <input
                          value={form.shortDescription}
                          onChange={set("shortDescription")}
                          className={inputCls}
                          placeholder="Short line for listing page"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Full Description</label>
                        <textarea
                          value={form.description}
                          onChange={set("description")}
                          className={textareaCls + " h-36"}
                          placeholder="Write full product description..."
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Pricing & Inventory"
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
                        <label className={labelCls}>Tax Rate (%)</label>
                        <input
                          type="number"
                          value={form.taxRate}
                          onChange={set("taxRate")}
                          className={inputCls}
                          placeholder="18"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Stock</label>
                        <input
                          type="number"
                          value={form.stock}
                          onChange={set("stock")}
                          className={inputCls}
                          placeholder="50"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Minimum Order Qty</label>
                        <input
                          type="number"
                          value={form.minOrderQty}
                          onChange={set("minOrderQty")}
                          className={inputCls}
                          placeholder="1"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Stock Label</label>
                        <input
                          value={form.inStockText}
                          onChange={set("inStockText")}
                          className={inputCls}
                          placeholder="In stock"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Tax Info Text</label>
                        <input
                          value={form.taxInclusiveText}
                          onChange={set("taxInclusiveText")}
                          className={inputCls}
                          placeholder="Inclusive of all taxes"
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Product Images"
                    open={open.media}
                    onToggle={() => toggleOpen("media")}
                  >
                    <div>
                      <label className={labelCls}>Upload Images</label>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="mt-2 block w-full text-sm"
                        onChange={onPickImages}
                      />

                      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                        {(form.images || []).map((img, idx) => (
                          <div
                            key={`${img?.url || ""}_${idx}`}
                            className="rounded-xl border border-gray-200 bg-white p-2"
                          >
                            <img
                              src={img?.url}
                              alt=""
                              className="h-28 w-full rounded-lg object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(idx)}
                              className="mt-2 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        ))}

                        {(form.images || []).length === 0 && (
                          <div className="col-span-full rounded-xl border border-dashed border-gray-300 bg-gray-50 p-8 text-center text-sm text-gray-500">
                            No images uploaded yet
                          </div>
                        )}
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Top Badges / Chips"
                    open={open.storefront}
                    onToggle={() => toggleOpen("storefront")}
                  >
                    <div className="space-y-3">
                      {(form.badges || []).map((badge, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3"
                        >
                          <div>
                            <label className={labelCls}>Badge Text</label>
                            <input
                              value={badge.text}
                              onChange={(e) =>
                                setBadgeField(index, "text", e.target.value)
                              }
                              className={inputCls}
                              placeholder="e.g. Amazon's Choice"
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Color</label>
                            <select
                              value={badge.color}
                              onChange={(e) =>
                                setBadgeField(index, "color", e.target.value)
                              }
                              className={inputCls}
                            >
                              {BADGE_COLOR_OPTIONS.map((x) => (
                                <option key={x.value} value={x.value}>
                                  {x.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeBadge(index)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addBadge}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          + Add Badge
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Offers & Coupons"
                    open={open.offers}
                    onToggle={() => toggleOpen("offers")}
                  >
                    <div className="space-y-4">
                      <div>
                        <label className={labelCls}>Section Title</label>
                        <input
                          value={form.offersTitle}
                          onChange={set("offersTitle")}
                          className={inputCls}
                          placeholder="Offers & Coupons"
                        />
                      </div>

                      {(form.offers || []).map((offer, index) => (
                        <div
                          key={index}
                          className="rounded-2xl border border-gray-200 bg-white p-4"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className={labelCls}>Offer Title</label>
                              <input
                                value={offer.title}
                                onChange={(e) =>
                                  setOfferField(index, "title", e.target.value)
                                }
                                className={inputCls}
                                placeholder="e.g. Coupon available"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Icon Type</label>
                              <select
                                value={offer.icon}
                                onChange={(e) =>
                                  setOfferField(index, "icon", e.target.value)
                                }
                                className={inputCls}
                              >
                                {OFFER_ICON_OPTIONS.map((x) => (
                                  <option key={x.value} value={x.value}>
                                    {x.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="md:col-span-2">
                              <label className={labelCls}>Description</label>
                              <textarea
                                value={offer.description}
                                onChange={(e) =>
                                  setOfferField(
                                    index,
                                    "description",
                                    e.target.value
                                  )
                                }
                                className={textareaCls + " h-24"}
                                placeholder="Offer description"
                              />
                            </div>
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeOffer(index)}
                              className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                            >
                              Remove Offer
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addOffer}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          + Add Offer
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Delivery Section"
                    open={open.delivery}
                    onToggle={() => toggleOpen("delivery")}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className={labelCls}>Section Title</label>
                        <input
                          value={form.deliveryTitle}
                          onChange={set("deliveryTitle")}
                          className={inputCls}
                          placeholder="Delivery"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Subtitle</label>
                        <input
                          value={form.deliverySubtitle}
                          onChange={set("deliverySubtitle")}
                          className={inputCls}
                          placeholder="Deliver to your address"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Pincode Placeholder</label>
                        <input
                          value={form.pincodePlaceholder}
                          onChange={set("pincodePlaceholder")}
                          className={inputCls}
                          placeholder="Enter pincode"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Check Button Text</label>
                        <input
                          value={form.checkButtonText}
                          onChange={set("checkButtonText")}
                          className={inputCls}
                          placeholder="Check"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className={labelCls}>Delivery Message</label>
                        <textarea
                          value={form.deliveryMessage}
                          onChange={set("deliveryMessage")}
                          className={textareaCls + " h-24"}
                          placeholder="FREE delivery by tomorrow..."
                        />
                      </div>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 md:col-span-2">
                        <span className="text-sm font-medium text-gray-900">
                          Show Pincode Input
                        </span>
                        <input
                          type="checkbox"
                          checked={form.pincodeEnabled}
                          onChange={set("pincodeEnabled")}
                        />
                      </label>
                    </div>
                  </Section>

                  <Section
                    title="Seller & Service Info"
                    open={open.seller}
                    onToggle={() => toggleOpen("seller")}
                  >
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={labelCls}>Seller Section Title</label>
                          <input
                            value={form.sellerTitle}
                            onChange={set("sellerTitle")}
                            className={inputCls}
                            placeholder="Seller"
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Seller Button</label>
                          <input
                            value={form.sellerButtonText}
                            onChange={set("sellerButtonText")}
                            className={inputCls}
                            placeholder="Visit"
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Seller Name</label>
                          <input
                            value={form.sellerName}
                            onChange={set("sellerName")}
                            className={inputCls}
                            placeholder="MyMor Verified Store"
                          />
                        </div>

                        <div>
                          <label className={labelCls}>Seller Meta</label>
                          <input
                            value={form.sellerMeta}
                            onChange={set("sellerMeta")}
                            className={inputCls}
                            placeholder="92% positive ratings • Trusted seller"
                          />
                        </div>
                      </div>

                      <div className="space-y-3">
                        {(form.trustBadges || []).map((item, index) => (
                          <div
                            key={index}
                            className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-3"
                          >
                            <div>
                              <label className={labelCls}>Card Title</label>
                              <input
                                value={item.title}
                                onChange={(e) =>
                                  setTrustBadgeField(
                                    index,
                                    "title",
                                    e.target.value
                                  )
                                }
                                className={inputCls}
                                placeholder="e.g. 7-day return"
                              />
                            </div>

                            <div>
                              <label className={labelCls}>Icon Type</label>
                              <select
                                value={item.icon}
                                onChange={(e) =>
                                  setTrustBadgeField(
                                    index,
                                    "icon",
                                    e.target.value
                                  )
                                }
                                className={inputCls}
                              >
                                {TRUST_ICON_OPTIONS.map((x) => (
                                  <option key={x.value} value={x.value}>
                                    {x.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="flex items-end">
                              <button
                                type="button"
                                onClick={() => removeTrustBadge(index)}
                                className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}

                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={addTrustBadge}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                          >
                            + Add Service Card
                          </button>
                        </div>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="About This Item"
                    open={open.about}
                    onToggle={() => toggleOpen("about")}
                  >
                    <div className="grid grid-cols-1 gap-4">
                      <div>
                        <label className={labelCls}>Section Title</label>
                        <input
                          value={form.aboutTitle}
                          onChange={set("aboutTitle")}
                          className={inputCls}
                          placeholder="About this item"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Description</label>
                        <textarea
                          value={form.aboutDescription}
                          onChange={set("aboutDescription")}
                          className={textareaCls + " h-36"}
                          placeholder="Main about section description"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>
                          Bullet Points (one per line)
                        </label>
                        <textarea
                          value={form.aboutBulletsText}
                          onChange={set("aboutBulletsText")}
                          className={textareaCls + " h-40"}
                          placeholder={`Premium mesh panels\nHard buckram, structured\nMatching plastic snapback closure`}
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Variants"
                    open={open.variants}
                    onToggle={() => toggleOpen("variants")}
                  >
                    <div className="space-y-4">
                      {(form.variants || []).map((group, groupIndex) => (
                        <div
                          key={groupIndex}
                          className="rounded-2xl border border-gray-200 bg-white p-4"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1">
                              <label className={labelCls}>Variant Name</label>
                              <input
                                value={group.name}
                                onChange={(e) =>
                                  setVariantGroupName(groupIndex, e.target.value)
                                }
                                className={inputCls}
                                placeholder="e.g. Size or Color"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() => removeVariantGroup(groupIndex)}
                              className="mt-7 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            >
                              Remove Group
                            </button>
                          </div>

                          <div className="mt-4 space-y-3">
                            {(group.options || []).map((option, optionIndex) => (
                              <div
                                key={optionIndex}
                                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3 rounded-xl border border-gray-100 p-3"
                              >
                                <div>
                                  <label className={labelCls}>Option</label>
                                  <input
                                    value={option.value}
                                    onChange={(e) =>
                                      setVariantOptionField(
                                        groupIndex,
                                        optionIndex,
                                        "value",
                                        e.target.value
                                      )
                                    }
                                    className={inputCls}
                                    placeholder="e.g. Large / Red"
                                  />
                                </div>

                                <div>
                                  <label className={labelCls}>Extra Price</label>
                                  <input
                                    type="number"
                                    value={option.price}
                                    onChange={(e) =>
                                      setVariantOptionField(
                                        groupIndex,
                                        optionIndex,
                                        "price",
                                        e.target.value
                                      )
                                    }
                                    className={inputCls}
                                    placeholder="0"
                                  />
                                </div>

                                <div>
                                  <label className={labelCls}>Stock</label>
                                  <input
                                    type="number"
                                    value={option.stock}
                                    onChange={(e) =>
                                      setVariantOptionField(
                                        groupIndex,
                                        optionIndex,
                                        "stock",
                                        e.target.value
                                      )
                                    }
                                    className={inputCls}
                                    placeholder="10"
                                  />
                                </div>

                                <div>
                                  <label className={labelCls}>Variant SKU</label>
                                  <input
                                    value={option.sku}
                                    onChange={(e) =>
                                      setVariantOptionField(
                                        groupIndex,
                                        optionIndex,
                                        "sku",
                                        e.target.value
                                      )
                                    }
                                    className={inputCls}
                                    placeholder="SKU-RED-L"
                                  />
                                </div>
                                <div className="xl:col-span-1">
                                  <label className={labelCls}>Variant Image</label>

                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="mt-2 block w-full text-sm"
                                    onChange={(e) => onPickVariantImage(groupIndex, optionIndex, e)}
                                  />

                                  {option?.image?.url ? (
                                    <div className="mt-3 rounded-xl border border-gray-200 bg-white p-2">
                                      <img
                                        src={option.image.url}
                                        alt="variant"
                                        className="h-24 w-full rounded-lg object-cover"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeVariantImage(groupIndex, optionIndex)}
                                        className="mt-2 w-full rounded-lg border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50"
                                      >
                                        Remove Image
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="mt-3 flex h-24 items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
                                      No image
                                    </div>
                                  )}
                                </div>
                                <div className="md:col-span-2 xl:col-span-5 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeVariantOption(groupIndex, optionIndex)
                                    }
                                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                                  >
                                    Remove Option
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              onClick={() => addVariantOption(groupIndex)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                            >
                              + Add Option
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addVariantGroup}
                          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                        >
                          + Add Variant Group
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Specifications"
                    open={open.specs}
                    onToggle={() => toggleOpen("specs")}
                  >
                    <div className="space-y-3">
                      {(form.specifications || []).map((spec, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3"
                        >
                          <div>
                            <label className={labelCls}>Specification</label>
                            <input
                              value={spec.key}
                              onChange={(e) =>
                                setSpecField(index, "key", e.target.value)
                              }
                              className={inputCls}
                              placeholder="e.g. Display"
                            />
                          </div>

                          <div>
                            <label className={labelCls}>Value</label>
                            <input
                              value={spec.value}
                              onChange={(e) =>
                                setSpecField(index, "value", e.target.value)
                              }
                              className={inputCls}
                              placeholder="e.g. AMOLED"
                            />
                          </div>

                          <div className="flex items-end">
                            <button
                              type="button"
                              onClick={() => removeSpec(index)}
                              className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addSpec}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                        >
                          + Add Specification
                        </button>
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="Shipping Details"
                    open={open.shipping}
                    onToggle={() => toggleOpen("shipping")}
                  >
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div>
                        <label className={labelCls}>Weight (kg)</label>
                        <input
                          type="number"
                          value={form.weight}
                          onChange={set("weight")}
                          className={inputCls}
                          placeholder="0.5"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Length</label>
                        <input
                          type="number"
                          value={form.length}
                          onChange={set("length")}
                          className={inputCls}
                          placeholder="10"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Width</label>
                        <input
                          type="number"
                          value={form.width}
                          onChange={set("width")}
                          className={inputCls}
                          placeholder="8"
                        />
                      </div>

                      <div>
                        <label className={labelCls}>Height</label>
                        <input
                          type="number"
                          value={form.height}
                          onChange={set("height")}
                          className={inputCls}
                          placeholder="5"
                        />
                      </div>
                    </div>
                  </Section>

                  <Section
                    title="SEO / Search"
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
                          placeholder="smartwatch, bluetooth, premium"
                        />
                        <p className="mt-2 text-xs text-gray-500">
                          Comma separated tags
                        </p>
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

                {/* RIGHT */}
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
                          Cash on Delivery
                        </span>
                        <input
                          type="checkbox"
                          checked={form.cod}
                          onChange={set("cod")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Returnable
                        </span>
                        <input
                          type="checkbox"
                          checked={form.returnable}
                          onChange={set("returnable")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Enable Add to Cart
                        </span>
                        <input
                          type="checkbox"
                          checked={form.addToCartEnabled}
                          onChange={set("addToCartEnabled")}
                        />
                      </label>

                      <label className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                        <span className="text-sm font-medium text-gray-900">
                          Enable Buy Now
                        </span>
                        <input
                          type="checkbox"
                          checked={form.buyNowEnabled}
                          onChange={set("buyNowEnabled")}
                        />
                      </label>
                    </div>
                  </Section>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5">
                    <h3 className="text-base font-semibold text-gray-900">
                      Customer Page Preview
                    </h3>

                    <div className="mt-4 rounded-3xl border border-gray-100 overflow-hidden bg-[#f5f6fa]">
                      <div className="p-4 border-b border-gray-200 bg-white">
                        <div className="text-center text-lg font-semibold text-gray-900">
                          Product
                        </div>
                      </div>

                      <div className="p-4 space-y-4 max-h-[70vh] overflow-auto">
                        <div className="rounded-3xl bg-white p-3 border border-gray-100">
                          <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100 flex items-center justify-center">
                            {form.images?.[0]?.url ? (
                              <img
                                src={form.images[0].url}
                                alt="preview"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <span className="text-sm text-gray-400">
                                No image
                              </span>
                            )}
                          </div>
                        </div>

                        {(form.badges || []).some((x) => x.text) && (
                          <div className="flex flex-wrap gap-2">
                            {(form.badges || [])
                              .filter((x) => x.text)
                              .map((badge, idx) => (
                                <span
                                  key={idx}
                                  className={`rounded-full px-3 py-1 text-xs font-semibold ${badgePreviewCls(
                                    badge.color
                                  )}`}
                                >
                                  {badge.text}
                                </span>
                              ))}
                          </div>
                        )}

                        <div className="rounded-3xl bg-white p-4 border border-gray-100">
                          <div className="text-blue-600 font-semibold text-sm">
                            {previewBrand}
                          </div>
                          <div className="mt-1 text-2xl font-bold text-gray-900">
                            {form.title || "Product title"}
                          </div>

                          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                            {form.rating ? (
                              <span className="rounded-full bg-orange-50 text-orange-700 px-2.5 py-1 font-semibold">
                                ★ {form.rating}
                              </span>
                            ) : null}
                            {form.ratingCount ? (
                              <span className="text-blue-600 font-semibold">
                                {form.ratingCount} ratings
                              </span>
                            ) : null}
                            {form.productType ? (
                              <span>{form.productType}</span>
                            ) : null}
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white p-4 border border-gray-100">
                          <div className="text-4xl font-bold text-gray-900">
                            ₹{previewPrice}
                          </div>
                          {previewComparePrice ? (
                            <div className="mt-1 text-sm text-gray-400 line-through">
                              ₹{previewComparePrice}
                            </div>
                          ) : null}
                          <div className="mt-2 text-sm text-gray-500">
                            {form.taxInclusiveText || "Inclusive of all taxes"}
                          </div>
                          <div className="mt-3 text-green-700 font-semibold">
                            {form.inStockText || "In stock"}
                          </div>
                        </div>

                        {(form.offers || []).some(
                          (x) => x.title || x.description
                        ) && (
                            <div className="rounded-3xl bg-white p-4 border border-gray-100">
                              <div className="text-2xl font-bold text-gray-900">
                                {form.offersTitle || "Offers & Coupons"}
                              </div>

                              <div className="mt-4 space-y-3">
                                {(form.offers || [])
                                  .filter((x) => x.title || x.description)
                                  .map((offer, idx) => (
                                    <div
                                      key={idx}
                                      className="rounded-2xl border border-blue-100 bg-slate-50 p-4"
                                    >
                                      <div className="font-semibold text-gray-900">
                                        {offer.title || "Offer"}
                                      </div>
                                      <div className="mt-1 text-sm text-gray-500">
                                        {offer.description || "Offer description"}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}

                        <div className="rounded-3xl bg-white p-4 border border-gray-100">
                          <div className="text-2xl font-bold text-gray-900">
                            {form.deliveryTitle || "Delivery"}
                          </div>
                          <div className="mt-4 font-semibold text-gray-900">
                            {form.deliverySubtitle || "Deliver to your address"}
                          </div>

                          {form.pincodeEnabled && (
                            <div className="mt-4 flex gap-3">
                              <input
                                disabled
                                className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm"
                                placeholder={
                                  form.pincodePlaceholder || "Enter pincode"
                                }
                              />
                              <button className="rounded-2xl bg-slate-900 px-5 py-3 text-white font-semibold">
                                {form.checkButtonText || "Check"}
                              </button>
                            </div>
                          )}

                          <div className="mt-4 text-sm font-semibold text-gray-700">
                            {form.deliveryMessage ||
                              "FREE delivery by tomorrow."}
                          </div>
                        </div>

                        <div className="rounded-3xl bg-white p-4 border border-gray-100">
                          <div className="text-2xl font-bold text-gray-900">
                            {form.sellerTitle || "Seller"}
                          </div>

                          <div className="mt-4 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xl font-semibold text-gray-900">
                                {form.sellerName || "Seller name"}
                              </div>
                              <div className="mt-1 text-sm text-gray-500">
                                {form.sellerMeta || "Seller meta"}
                              </div>
                            </div>

                            <button className="rounded-2xl border border-gray-200 px-4 py-2.5 font-semibold text-gray-900">
                              {form.sellerButtonText || "Visit"}
                            </button>
                          </div>
                        </div>

                        {(form.trustBadges || []).some((x) => x.title) && (
                          <div className="grid grid-cols-3 gap-3">
                            {(form.trustBadges || [])
                              .filter((x) => x.title)
                              .map((item, idx) => (
                                <div
                                  key={idx}
                                  className="rounded-3xl bg-white p-4 border border-gray-100 text-center"
                                >
                                  <div className="text-sm font-semibold text-gray-800">
                                    {item.title}
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}

                        <div className="rounded-3xl bg-white p-4 border border-gray-100">
                          <div className="text-2xl font-bold text-gray-900">
                            {form.aboutTitle || "About this item"}
                          </div>
                          <div className="mt-4 whitespace-pre-line text-gray-600 leading-8">
                            {form.aboutDescription ||
                              "Write a detailed description."}
                          </div>

                          {(form.aboutBulletsText || "").trim() && (
                            <ul className="mt-4 space-y-2 text-gray-600 list-disc pl-5">
                              {(form.aboutBulletsText || "")
                                .split("\n")
                                .map((x) => x.trim())
                                .filter(Boolean)
                                .map((bullet, idx) => (
                                  <li key={idx}>{bullet}</li>
                                ))}
                            </ul>
                          )}
                        </div>
                      </div>

                      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4">
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            className={`rounded-2xl px-4 py-3 font-semibold ${form.addToCartEnabled
                                ? "bg-yellow-400 text-gray-900"
                                : "bg-gray-200 text-gray-500"
                              }`}
                          >
                            Add to Cart
                          </button>
                          <button
                            className={`rounded-2xl px-4 py-3 font-semibold ${form.buyNowEnabled
                                ? "bg-orange-400 text-white"
                                : "bg-gray-200 text-gray-500"
                              }`}
                          >
                            Buy Now
                          </button>
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

      {/* ===================== DELETE MODAL ===================== */}
      {deleteId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                Delete Product?
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