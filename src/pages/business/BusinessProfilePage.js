import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  updateDoc,
  doc,
  serverTimestamp,
  where,
  limit,
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

import LocationPicker from "../superadmin/LocationPicker";
import MapLocationInput from "../../components/MapLocationInput";

import { MapPin } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { useSelector } from "react-redux";

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
};

export default function BusinessProfilePage({ navbarHeight }) {
  const uid = useSelector((s) => s.auth.user?.uid);
  const employee = useSelector((s) => s.auth.employee);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [businessId, setBusinessId] = useState(null);
  const [businessDoc, setBusinessDoc] = useState(null);

  const [showMapModal, setShowMapModal] = useState(false);
  const [form, setForm] = useState(initialForm);

  const [open, setOpen] = useState({
    details: true,
    hours: false,
    billing: false,
    media: false,
  });

  /** ---------------- Load business by uid ---------------- */
  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const q1 = query(
      collection(db, "businesses"),
      where("uid", "==", uid),
      limit(1)
    );

    const unsub = onSnapshot(
      q1,
      (snap) => {
        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data() || {};
          setBusinessId(d.id);
          setBusinessDoc({ id: d.id, ...data });
          setLoading(false);
          return;
        }

        const q2 = query(
          collection(db, "businesses"),
          where("adminUID", "==", uid),
          limit(1)
        );

        const unsub2 = onSnapshot(
          q2,
          (snap2) => {
            if (!snap2.empty) {
              const d2 = snap2.docs[0];
              const data2 = d2.data() || {};
              setBusinessId(d2.id);
              setBusinessDoc({ id: d2.id, ...data2 });
            } else {
              setBusinessId(null);
              setBusinessDoc(null);
            }
            setLoading(false);
          },
          (err) => {
            console.error(err);
            toast.error("Failed to load business profile");
            setLoading(false);
          }
        );

        return () => unsub2();
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load business profile");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [uid]);

  /** ---------------- Fill form from business ---------------- */
  useEffect(() => {
    if (!businessDoc) {
      setForm({
        ...initialForm,
        email: employee?.email || "",
        name: employee?.name || "",
      });
      return;
    }

    const data = businessDoc;

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
  }, [businessDoc, employee]);

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
    if (!file || !businessId) return;
    try {
      toast.info("Uploading portrait...");
      const res = await uploadImage(file, `businesses/${businessId}/portrait`);
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
    if (!file || !businessId) return;
    try {
      toast.info("Uploading banner...");
      const res = await uploadImage(file, `businesses/${businessId}/banner`);
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

  /** ---------------- Save profile ---------------- */
  const onSaveBusiness = async () => {
    if (!businessId) return toast.error("Business profile not found");
    if (!form.name.trim()) return toast.error("Business name is required");
    if (!form.email.trim()) return toast.error("Email is required");

    setSaving(true);
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
        email: form.email?.toLowerCase()?.trim() || "",
        abn: form.abn?.trim() || "",
        website: form.website?.trim() || "",
        note: form.note?.trim() || "",
        password: form.password || "",
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

      await updateDoc(doc(db, "businesses", businessId), payload);

      if (uid) {
        await updateDoc(doc(db, "employees", uid), {
          name: payload.name,
          email: payload.email,
          mobileNo: payload.phone || "",
          address: payload.address?.line1 || "",
          businessName: payload.name,
          isActive: payload.isActive ?? true,
          password: payload.password || "",
          updatedAt: serverTimestamp(),
        }).catch(() => {});

        await updateDoc(doc(db, "users", uid), {
          firstname: payload.name,
          username: payload.name,
          email: payload.email,
          phone: payload.phone || "",
          businessName: payload.name,
          password: payload.password || "",
          updateddate: new Date(),
        }).catch(() => {});
      }

      toast.success("Business profile updated ✅");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="flex items-center justify-center h-72">
          <FadeLoader color="#36d7b7" loading />
        </div>
      </main>
    );
  }

  if (!businessId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="rounded-2xl border border-gray-200 bg-white p-8">
          <h1 className="text-2xl font-semibold">Business Profile</h1>
          <p className="mt-2 text-sm text-gray-500">
            No business profile found for this logged-in user.
          </p>
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Business Profile</h1>
          <p className="text-sm text-gray-500">
            Update your business details, hours, billing and media.
          </p>
        </div>

        <button
          onClick={onSaveBusiness}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          disabled={saving}
        >
          {saving ? "Saving..." : "Save Profile"}
        </button>
      </div>

      <div className="space-y-4">
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
              <input value={form.email} className={inputCls} disabled />
            </div>

            <div>
              <label className={labelCls}>Password</label>
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

        <Section
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
        </Section>

        <Section
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
        </Section>

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
      </div>

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