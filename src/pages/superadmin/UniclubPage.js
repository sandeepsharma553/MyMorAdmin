import React, { useState, useEffect, useRef } from "react";
import { database, storage, db } from "../../firebase";
import {
  ref as dbRef,
  onValue,
  set as rtdbSet,
  push,
  update as rtdbUpdate,
  remove,
  off,
  serverTimestamp,
  get as rtdbGet,
  orderByChild,
  equalTo,
  query,
} from "firebase/database";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  query as dbQuery,
  where,
  getDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useNavigate } from "react-router-dom";
import LocationPicker from "./LocationPicker";

dayjs.extend(customParseFormat);

const pad2 = (n) => String(n).padStart(2, "0");
const toLocalInputValue = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
};
const toDateInputValue = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const fromLocalInputValue = (str) => (str ? new Date(str).getTime() : 0);
const parseTags = (s = "") => s.split(",").map((t) => t.trim()).filter(Boolean);

/* Safe answers renderer */
const renderAnswers = (ans) => {
  if (!ans) return null;
  const isPrimitive = (x) => ["string", "number", "boolean"].includes(typeof x);

  if (Array.isArray(ans)) {
    return (
      <ul className="list-disc list-inside space-y-1">
        {ans.map((item, idx) => {
          if (isPrimitive(item)) return <li key={idx}>{String(item)}</li>;
          if (item && typeof item === "object") {
            if ("value" in item || "questionId" in item) {
              const label = item.questionId ?? `Q${idx + 1}`;
              const val = item.value ?? "";
              return (
                <li key={idx}>
                  <strong>{label}:</strong> {String(val)}
                </li>
              );
            }
            return <li key={idx}>{JSON.stringify(item)}</li>;
          }
          return <li key={idx}>{String(item)}</li>;
        })}
      </ul>
    );
  }

  if (typeof ans === "object") {
    return (
      <ul className="list-disc list-inside space-y-1">
        {Object.entries(ans).map(([k, v]) => (
          <li key={k}>
            <strong>{k}:</strong> {isPrimitive(v) ? String(v) : JSON.stringify(v)}
          </li>
        ))}
      </ul>
    );
  }
  return <span>{String(ans)}</span>;
};

export default function UniclubPage({ navbarHeight }) {
  const uid = useSelector((s) => s.auth?.user?.uid);
  const emp = useSelector((s) => s.auth?.employee);
  const user = useSelector((s) => s.auth?.user);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [filterUniversity, setFilterUniversity] = useState([]);
  const [filterUniversityId, setFilterUniversityId] = useState("");

  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [fileName, setFileName] = useState("No file chosen");
  const [previewUrl, setPreviewUrl] = useState("");

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pageSize = 10;
  const navigate = useNavigate();

  const [sortConfig, setSortConfig] = useState({ key: "title", direction: "asc" });
  const [filters, setFilters] = useState({ title: "", desc: "" });

  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [field]: value }));
    }, 250);
  };

  const onSort = (key) =>
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  const initialForm = {
    id: 0,
    title: "",
    desc: "",
    location: "",
    website: "",
    link: "",
    contactName: "",
    contactPhone: "",
    contactEmail: "",
    startAtMs: 0,
    endAtMs: 0,
    imageFile: null,
    imageUrl: "",
    privacyType: "",
    category: "",
    tags: "",
    rules: "",
    joinQInput: "",
    joinQuestions: [],
    allowEventsByMembers: false,
    pollsEnabled: false,
    sharedFilesEnabled: false,
    allowSubGroups: false,
    enableChat: false,
    allowNotifications: true,
    maxMembers: "",
    paymentType: "free",
    paymentAmount: "",
    memberValidFromMs: 0,
    memberValidToMs: 0,
    successorUid: "",
    successor: "",
    memberId: "",
    roleId: "",
    role: "",
    universityid: "",
    university: "",
    countryCode: "",
    countryName: "",
    stateCode: "",
    stateName: "",
    cityName: "",
    lat: null,
    lng: null,

    // ✅ PIN fields (like EventPage)
    isPinned: false,
    pinnedAt: null,
    pinnedOrder: null,
  };

  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    const fetchMyUniversities = async () => {
      if (!emp?.uid) return;
      try {
        const qy = dbQuery(collection(db, "university"), where("uid", "==", emp.uid));
        const qs = await getDocs(qy);
        setFilterUniversity(qs.docs.map((d) => ({ id: d.id, name: d.data().name })));
      } catch (e) {
        console.error(e);
      }
    };
    fetchMyUniversities();
  }, [emp?.uid]);

  useEffect(() => {
    const cleanup = getList();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig, filterUniversityId, showPinnedOnly]);

  const getList = () => {
    if (!uid) {
      setList([]);
      setIsLoading(false);
      return;
    }
  
    setIsLoading(true);
  
    const refQ = query(
      dbRef(database, "uniclubs"),
      orderByChild("creatorId"),
      equalTo(uid)
    );
  
    const handler = (snap) => {
      if (!mountedRef.current) return;
  
      const val = snap.val();
  
      if (!val) {
        // 🔥 IMPORTANT: no data case
        setList([]);
        setIsLoading(false);
        return;
      }
  
      const arr = Object.entries(val).map(([id, v]) => ({
        id,
        ...v,
      }));
  
      setList(arr);
      setIsLoading(false);
    };
  
    onValue(refQ, handler, (error) => {
      console.error("RTDB error:", error);
      if (mountedRef.current) {
        setList([]);
        setIsLoading(false);
      }
    });
  
    return () => off(refQ, "value", handler);
  };
  

  const fetchUniversitiesByCountry = async (countryName) => {
    if (!countryName) {
      setUniversities([]);
      return;
    }
    setIsLoading(true);
    try {
      const qy = dbQuery(collection(db, "university"), where("countryName", "==", countryName));
      const uniSnap = await getDocs(qy);
      const uniArr = uniSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        features: d.data().features || {},
      }));
      if (mountedRef.current) setUniversities(uniArr);
    } catch (err) {
      console.error("fetchUniversitiesByCountry error:", err);
      toast.error("Failed to load universities");
      if (mountedRef.current) setUniversities([]);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, files, type } = e.target;
    if (type === "file") {
      const f = files?.[0] || null;
      setForm((prev) => ({ ...prev, imageFile: f }));
      setFileName(f?.name || "No file chosen");
      setPreviewUrl(f ? URL.createObjectURL(f) : "");
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const validate = () => {
    if (!form.title?.trim()) {
      toast.error("Title is required");
      return false;
    }
    if (form.website && !/^https?:\/\/.+/i.test(form.website)) {
      toast.error("Website must start with http(s)://");
      return false;
    }
    if (form.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail)) {
      toast.error("Enter a valid email");
      return false;
    }
    if (form.paymentType === "paid") {
      const amt = Number(form.paymentAmount);
      if (!Number.isFinite(amt) || amt <= 0) {
        toast.error("Enter a valid payment amount");
        return false;
      }
    }
    if (form.memberValidFromMs && form.memberValidToMs && form.memberValidToMs < form.memberValidFromMs) {
      toast.error("Membership end must be after start");
      return false;
    }
    if (form.startAtMs && form.endAtMs && form.endAtMs < form.startAtMs) {
      toast.error("End date/time must be after start date/time");
      return false;
    }
    return true;
  };

  // ---------------- PIN HELPERS (RTDB) ----------------
  const eNumber = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));

  const getPinnedSorted = () =>
    [...list]
      .filter((e) => !!e.isPinned)
      .sort((a, b) => {
        const ao = Number.isFinite(eNumber(a.pinnedOrder)) ? Number(a.pinnedOrder) : 1e9;
        const bo = Number.isFinite(eNumber(b.pinnedOrder)) ? Number(b.pinnedOrder) : 1e9;
        if (ao !== bo) return ao - bo;

        const aPA = Number(a.pinnedAt || 0);
        const bPA = Number(b.pinnedAt || 0);
        return bPA - aPA;
      });

  const renumberPinned = async () => {
    const pinned = getPinnedSorted();
    const updates = {};
    pinned.forEach((club, i) => {
      const order = i + 1;
      if (Number(club.pinnedOrder) !== order) {
        updates[`uniclubs/${club.id}/pinnedOrder`] = order;
      }
    });
    if (Object.keys(updates).length) {
      await rtdbUpdate(dbRef(database), updates);
    }
    getList();
  };

  const movePin = async (item, dir) => {
    const pinned = getPinnedSorted();
    const idx = pinned.findIndex((e) => e.id === item.id);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= pinned.length) return;

    const a = pinned[idx];
    const b = pinned[swapIdx];

    const updates = {
      [`uniclubs/${a.id}/pinnedOrder`]: Number(b.pinnedOrder) || swapIdx + 1,
      [`uniclubs/${b.id}/pinnedOrder`]: Number(a.pinnedOrder) || idx + 1,
    };
    await rtdbUpdate(dbRef(database), updates);
    getList();
  };

  const applyPinOrder = async (item, newOrderRaw) => {
    if (!item.isPinned) return;

    let newOrder = Math.max(1, Math.floor(Number(newOrderRaw) || 1));
    const pinned = getPinnedSorted().filter((e) => e.id !== item.id);

    newOrder = Math.min(newOrder, pinned.length + 1);

    const sequence = [...pinned];
    sequence.splice(newOrder - 1, 0, { ...item });

    const updates = {};
    sequence.forEach((club, i) => {
      updates[`uniclubs/${club.id}/pinnedOrder`] = i + 1;
    });

    await rtdbUpdate(dbRef(database), updates);
    getList();
  };

  const togglePin = async (item, makePinned) => {
    try {
      const base = `uniclubs/${item.id}`;

      if (makePinned) {
        const currentPinned = getPinnedSorted();
        const last = currentPinned[currentPinned.length - 1];
        const nextOrder = (Number(last?.pinnedOrder) || currentPinned.length || 0) + 1;

        await rtdbUpdate(dbRef(database, base), {
          isPinned: true,
          pinnedAt: Date.now(),
          pinnedOrder: nextOrder,
        });
        toast.success("Pinned");
      } else {
        await rtdbUpdate(dbRef(database, base), {
          isPinned: false,
          pinnedAt: null,
          pinnedOrder: null,
        });
        await renumberPinned();
        toast.success("Unpinned");
      }

      getList();
    } catch (e) {
      console.error(e);
      toast.error("Could not update pin");
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const startAtMs = form.startAtMs || 0;
      const endAtMs = form.endAtMs || 0;

      // ---- image upload ----
      let imageUrl = form.imageUrl || "";
      const isNewImage = !!(form.imageFile && typeof form.imageFile.name === "string");
      if (!editingData && !imageUrl && !isNewImage) {
        toast.error("Please choose the file");
        return;
      }
      if (isNewImage) {
        const key = `${Date.now()}_${form.imageFile.name}`;
        const storRef = storageRef(storage, `discover/${key}`);
        await uploadBytes(storRef, form.imageFile);
        imageUrl = await getDownloadURL(storRef);
      }

      // ---- derived values ----
      const cleanedTags = parseTags(form.tags);

      const settingsPayload = {
        chatEnabled: !!form.enableChat,
        allowEventsByMembers: !!form.allowEventsByMembers,
        pollsEnabled: !!form.pollsEnabled,
        sharedFilesEnabled: !!form.sharedFilesEnabled,
        allowSubGroups: !!form.allowSubGroups,
        allowNotifications: !!form.allowNotifications,
        maxMembers: form.maxMembers ? Number(form.maxMembers) : null,
        paymentType: form.paymentType,
        amount: form.paymentType === "paid" ? Number(form.paymentAmount) : 0,
        memberValidFromMs: form.memberValidFromMs || 0,
        memberValidToMs: form.memberValidToMs || 0,
      };

      const payload = {
        title: form.title.trim(),
        location: form.location.trim(),
        desc: form.desc.trim(),
        website: form.website?.trim() || "",
        link: form.link?.trim() || "",
        contactName: form.contactName?.trim() || "",
        contactPhone: form.contactPhone?.trim() || "",
        contactEmail: form.contactEmail?.trim() || "",
        date: startAtMs ? dayjs(startAtMs).format("dddd, MMMM D") : "",
        time: startAtMs ? dayjs(startAtMs).format("h:mm A") : "",
        startAt: startAtMs,
        endAt: endAtMs,
        image: imageUrl,
        createdAt: editingData ? undefined : Date.now(),
        updatedAt: Date.now(),
        creatorId: uid || "",
        uid: user?.uid || "",
        displayName: user?.displayName || emp?.name || "",
        photoURL: user?.photoURL || emp?.imageUrl || "",
        privacyType: form.privacyType,
        tags: cleanedTags,
        role: "Admin",
        rules: form.rules?.trim() || "",
        joinQuestions: (form.joinQuestions || []).map((s) => s.trim()).filter(Boolean),
        category: form.category || "",
        settings: settingsPayload,
        universityid: form.universityid || "",
        university: form.university || "",
        countryCode: form.countryCode || "",
        countryName: form.countryName || "",
        stateCode: form.stateCode || "",
        stateName: form.stateName || "",
        cityName: form.cityName || "",
        lat: form.lat ?? null,
        lng: form.lng ?? null,

        // ✅ keep existing pin fields when editing OR default on create
        isPinned: !!form.isPinned,
        pinnedAt: form.isPinned ? Number(form.pinnedAt || Date.now()) : null,
        pinnedOrder: form.isPinned ? (Number.isFinite(eNumber(form.pinnedOrder)) ? Number(form.pinnedOrder) : 1) : null,
      };

      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      // ---- create vs update ----
      let clubId;
      if (editingData?.id) {
        clubId = editingData.id;
        await rtdbUpdate(dbRef(database, `uniclubs/${clubId}`), payload);
        toast.success("Uniclub updated successfully!");
      } else {
        const newRef = push(dbRef(database, "uniclubs/"));
        clubId = newRef.key;

        // if creating and pinned, put it at bottom of pinned list
        let createPinnedOrder = null;
        let createPinnedAt = null;
        if (payload.isPinned) {
          const currentPinned = getPinnedSorted();
          const last = currentPinned[currentPinned.length - 1];
          createPinnedOrder = (Number(last?.pinnedOrder) || currentPinned.length || 0) + 1;
          createPinnedAt = Date.now();
        }

        await rtdbSet(newRef, {
          ...payload,
          id: clubId,
          pinnedOrder: payload.isPinned ? createPinnedOrder : null,
          pinnedAt: payload.isPinned ? createPinnedAt : null,
        });

        // add creator as admin
        if (user?.uid) {
          await rtdbSet(dbRef(database, `uniclubs/${clubId}/members/${user.uid}`), {
            uid: user.uid,
            name: user.displayName || "",
            photoURL: user.photoURL ?? "",
            role: "admin",
            status: "active",
            joinedAt: serverTimestamp(),
          });
        }
        toast.success("Uniclub created successfully");
      }

      const base = `uniclubs/${clubId}`;

      // successor logic
      if (form.successorUid && form.successorUid !== user?.uid) {
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/joinedAt`), serverTimestamp());
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/name`), form.successor?.name || "");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/photoURL`), form.successor?.photoURL || "");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/role`), "admin");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/status`), "active");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/uid`), form.successorUid);
        if (user?.uid) {
          await rtdbSet(dbRef(database, `${base}/members/${user.uid}/role`), "moderator");
        }
        await rtdbSet(dbRef(database, `${base}/uid`), form.successorUid);
      }

      // role assignment
      if (form.memberId && form.roleId) {
        await Promise.all([
          rtdbSet(dbRef(database, `${base}/roles/${form.memberId}`), { roleId: form.roleId, roleName: form.role }),
          rtdbSet(dbRef(database, `${base}/members/${form.memberId}/role`), form.role || "contributor"),
        ]);
      }

      // ---- reset + refresh ----
      getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
      setPreviewUrl("");
    } catch (error) {
      console.error("Error saving uniclubs:", error);
      toast.error("Failed to save uniclubs.");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await remove(dbRef(database, `uniclubs/${deleteData.id}`));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting uniclubs: ", error);
      toast.error("Failed to delete uniclub.");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  /* ---------- Approve / Reject join requests (if you use it elsewhere) ---------- */
  const approveRequest = async (clubId, req) => {
    const base = `uniclubs/${clubId}`;
    const memberRecord = {
      uid: req.uid,
      name: req.name || req.displayName || "",
      photoURL: req.photoURL || "",
      role: "member",
      status: "active",
      joinedAt: serverTimestamp(),
      answers: req.answers || null,
    };
    try {
      await Promise.all([rtdbSet(dbRef(database, `${base}/members/${req.uid}`), memberRecord), remove(dbRef(database, `${base}/joinRequests/${req.uid}`))]);
      getList();
      toast.success("Request approved");
    } catch (e) {
      console.error("approveRequest error", e);
      toast.error("Could not approve request");
    }
  };

  // ---------------- filtering + sorting ----------------
  const filteredData = list.filter((g) => {
    if (showPinnedOnly && !g.isPinned) return false;

    const titleOK = !filters.title || (g.title || "").toLowerCase().includes(filters.title.toLowerCase());
    const descOK = !filters.desc || (g.desc || "").toLowerCase().includes(filters.desc.toLowerCase());
    const uniOK = !filterUniversityId ? true : (g.universityid || "") === filterUniversityId;

    return titleOK && descOK && uniOK;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    // ✅ pinned first
    const ap = a.isPinned ? 1 : 0;
    const bp = b.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;

    // ✅ if both pinned, pinnedOrder then pinnedAt
    if (ap === 1 && bp === 1) {
      const ao = Number.isFinite(eNumber(a.pinnedOrder)) ? Number(a.pinnedOrder) : 1e9;
      const bo = Number.isFinite(eNumber(b.pinnedOrder)) ? Number(b.pinnedOrder) : 1e9;
      if (ao !== bo) return ao - bo;

      const aPA = Number(a.pinnedAt || 0);
      const bPA = Number(b.pinnedAt || 0);
      if (aPA !== bPA) return bPA - aPA;
    }

    // fallback sort
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const key = sortConfig.key;
    const sa = (a[key] ?? "").toString().toLowerCase();
    const sb = (b[key] ?? "").toString().toLowerCase();
    return sa.localeCompare(sb) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto no-scrollbar" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Uniclub</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setFileName("No file chosen");
            setPreviewUrl("");
            setModalOpen(true);
          }}
        >
          + Add uniclub
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
        <select
          className="border border-gray-300 px-3 py-2 rounded-xl bg-white text-sm"
          value={filterUniversityId}
          onChange={(e) => {
            setFilterUniversityId(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="">All Universities</option>
          {filterUniversity.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        {/* ✅ Show pinned only */}
        <label className="text-sm flex items-center gap-2 border border-gray-300 rounded-full px-3 py-2 bg-white w-fit">
          <input
            type="checkbox"
            checked={showPinnedOnly}
            onChange={(e) => {
              setShowPinnedOnly(e.target.checked);
              setCurrentPage(1);
            }}
          />
          Show pinned only
        </label>

        <span className="text-xs text-gray-500 md:ml-auto">
          Showing {sortedData.length} of {list.length}
        </span>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow no-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: "title", label: "Title" },
                  { key: "desc", label: "Description" },
                  { key: "image", label: "Image", sortable: false },
                  { key: "pin", label: "Pin", sortable: false }, // ✅ added
                  { key: "actions", label: "Action", sortable: false },
                ].map((col) => (
                  <th key={col.key} className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none">
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button type="button" className="flex items-center gap-1 hover:underline" onClick={() => onSort(col.key)} title="Sort">
                        <span>{col.label}</span>
                        {sortConfig.key === col.key && (
                          <span className="text-gray-400">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>

              {/* header filters */}
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search title"
                    defaultValue={filters.title}
                    onChange={(e) => setFilterDebounced("title", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search description"
                    defaultValue={filters.desc}
                    onChange={(e) => setFilterDebounced("desc", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No matching uniclubs found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => {
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>

                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-normal break-words max-w-xs">{item.desc}</td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {item.image ? <img src={item.image} width={80} height={80} className="rounded" alt="" /> : "—"}
                      </td>

                      {/* ✅ Pin column */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            title={item.isPinned ? "Unpin" : "Pin"}
                            onClick={() => togglePin(item, !item.isPinned)}
                            className={`text-lg leading-none ${item.isPinned ? "text-yellow-500" : "text-gray-300"} hover:opacity-80`}
                            aria-label={item.isPinned ? "Unpin club" : "Pin club"}
                          >
                            {item.isPinned ? "★" : "☆"}
                          </button>

                          {item.isPinned && (
                            <>
                              <input
                                type="number"
                                min={1}
                                value={Number.isFinite(eNumber(item.pinnedOrder)) ? Number(item.pinnedOrder) : 1}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setList((prev) => prev.map((c) => (c.id === item.id ? { ...c, pinnedOrder: Number(val) } : c)));
                                }}
                                onBlur={(e) => applyPinOrder(item, e.target.value)}
                                className="w-12 px-2 py-1 border rounded text-sm text-center"
                                title="Pinned order (1 = top)"
                              />
                              <div className="flex flex-col gap-1">
                                <button type="button" className="border rounded px-1 leading-none" title="Move up" onClick={() => movePin(item, -1)}>
                                  ↑
                                </button>
                                <button type="button" className="border rounded px-1 leading-none" title="Move down" onClick={() => movePin(item, 1)}>
                                  ↓
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => {
                              setEditing(item);
                              if (item.countryName) {
                                fetchUniversitiesByCountry(item.countryName);
                              }
                              setForm({
                                ...initialForm,
                                ...item,
                                imageFile: null,
                                imageUrl: item.image || "",
                                startAtMs: item.startAtMs || item.startAt || 0,
                                endAtMs: item.endAtMs || item.endAt || 0,
                                tags: Array.isArray(item.tags) ? item.tags.join(", ") : item.tags || "",
                                rules: item.rules || "",
                                joinQInput: "",
                                joinQuestions: Array.isArray(item.joinQuestions) ? item.joinQuestions : [],
                                category: item.category || "",
                                enableChat: !!item?.settings?.chatEnabled,
                                allowEventsByMembers: !!item?.settings?.allowEventsByMembers,
                                pollsEnabled: !!item?.settings?.pollsEnabled,
                                sharedFilesEnabled: !!item?.settings?.sharedFilesEnabled,
                                allowSubGroups: !!item?.settings?.allowSubGroups,
                                allowNotifications: item?.settings?.allowNotifications === false ? false : true,
                                maxMembers: Number.isFinite(item?.settings?.maxMembers) ? String(item?.settings?.maxMembers) : "",
                                paymentType: item?.settings?.paymentType || "free",
                                paymentAmount: item?.settings?.amount != null ? String(item.settings.amount) : "",
                                memberValidFromMs: item?.settings?.memberValidFromMs || 0,
                                memberValidToMs: item?.settings?.memberValidToMs || 0,
                                successorUid: item?.ownership?.successorUid || "",
                                memberId: "",
                                roleId: "",
                                role: "",
                                universityid: item.universityid || "",
                                university: item.university || "",
                                countryCode: item.countryCode || "",
                                countryName: item.countryName || "",
                                stateCode: item.stateCode || "",
                                stateName: item.stateName || "",
                                cityName: item.cityName || "",
                                lat: item.lat ?? null,
                                lng: item.lng ?? null,

                                // ✅ pin in edit form
                                isPinned: !!item.isPinned,
                                pinnedAt: item.pinnedAt ?? null,
                                pinnedOrder: item.pinnedOrder ?? null,
                              });
                              setTimeout(() => {
                                setSelectedUniversityId(item.universityid || "");
                              }, 200);
                              setFileName("No file chosen");
                              setPreviewUrl(item.image || "");
                              setModalOpen(true);
                            }}
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
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </p>
        <div className="space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit uniclub" : "Add uniclub"}</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Title"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />

                <textarea
                  placeholder="Description"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  required
                />

                <section className="space-y-4">
                  <select
                    name="privacyType"
                    value={form.privacyType}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                  >
                    <option value="">Select Privacy Type</option>
                    <option value="Public">Public</option>
                    <option value="Private">Private</option>
                    <option value="Hidden">Hidden / Invite-only</option>
                  </select>
                </section>

                <section className="space-y-4">
                  <LocationPicker
                    key={form.id || "new"}
                    value={{
                      countryCode: form.countryCode || "",
                      stateCode: form.stateCode || "",
                      cityName: form.cityName || "",
                    }}
                    onChange={(loc) => {
                      const next = {
                        countryCode: loc.country?.code || "",
                        countryName: loc.country?.name || "",
                        stateCode: loc.state?.code || "",
                        stateName: loc.state?.name || "",
                        cityName: loc.city?.name || "",
                        lat: loc.coords?.lat ?? null,
                        lng: loc.coords?.lng ?? null,
                      };
                      setForm((prev) => {
                        const same =
                          prev.countryCode === next.countryCode &&
                          prev.countryName === next.countryName &&
                          prev.stateCode === next.stateCode &&
                          prev.stateName === next.stateName &&
                          prev.cityName === next.cityName &&
                          prev.lat === next.lat &&
                          prev.lng === next.lng;
                        return same ? prev : { ...prev, ...next, universityid: "", university: "" };
                      });
                      setSelectedUniversityId("");
                      fetchUniversitiesByCountry(loc?.country?.name || "");
                    }}
                  />

                  <select
                    value={selectedUniversityId}
                    onChange={(e) => {
                      const uniId = e.target.value;
                      const uniName = universities.find((u) => u.id === uniId)?.name || "";
                      setSelectedUniversityId(uniId);
                      setForm((prev) => ({ ...prev, universityid: uniId, university: uniName }));
                    }}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                    disabled={!universities.length}
                  >
                    <option value="">{universities.length ? "Select University" : "Select University"}</option>
                    {universities.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </section>

                {/* Logo */}
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">Upload Logo</h2>
                  <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                    <label className="cursor-pointer">
                      <input type="file" name="image" accept="image/*" className="hidden" onChange={handleChange} />
                      📁 Choose File
                    </label>
                    <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
                  </div>
                  {(previewUrl || form.imageUrl) && <img src={previewUrl || form.imageUrl} alt="Logo Preview" width="150" />}
                </section>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete uniclub</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.title}</strong>?
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

      <ToastContainer />
    </main>
  );
}
