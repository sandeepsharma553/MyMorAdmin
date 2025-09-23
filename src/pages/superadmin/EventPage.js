import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, Timestamp, writeBatch,
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import dayjs from "dayjs";
import MapLocationInput from "../../components/MapLocationInput";
import EditorPro from "../../components/EditorPro";
import { MapPin } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import { enUS } from "date-fns/locale";
import { format } from "date-fns";

export default function EventPage({ navbarHeight }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [paymentlist, setPaymentList] = useState([]);
  const [category, setCategory] = useState([]);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [range, setRange] = useState([{ startDate: new Date(), endDate: new Date(), key: "selection" }]);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef();

  const [showMapModal, setShowMapModal] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [timeFilter, setTimeFilter] = useState("current"); // 'past' | 'current' | 'future'
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [sortConfig, setSortConfig] = useState({ key: "start", direction: "asc" });
  const [filters, setFilters] = useState({ name: "", location: "" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilters((p) => ({ ...p, [field]: value })), 250);
  };
  const onSort = (key) =>
    setSortConfig((p) => (p.key === key ? { key, direction: p.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));

  const uid = useSelector((s) => s.auth.user.uid);
  const emp = useSelector((s) => s.auth.employee);

  const initialFormData = {
    id: 0,
    eventName: "",
    shortDesc: "",
    eventDescriptionHtml: "",
    category: "",
    tags: "",
    date: "",
    startDateTime: "",
    endDateTime: "",
    isRecurring: false,
    frequency: "",
    locationName: "",
    address: "",
    mapLocation: "",
    onlineLink: "",
    posters: [],
    posterFiles: [],
    promoVideo: "",
    theme: "",
    rsvp: false,
    capacity: "",
    maxPurchaseTickets: "",
    rsvpDeadline: "",
    priceType: "",
    prices: [],
    paymentLink: "",
    allowChat: false,
    allowReactions: false,
    challenges: "",
    visibility: "Public",
    cohosts: "",
    website: "",
    instagram: "",
    rules: "",
    boothOption: false,
    vendorInfo: "",
    sponsorship: "",
    interestedCount: 0,
    hostelid: "",
    isPinned: false,
    pinnedAt: null,
    pinnedOrder: null,
  };
  const [form, setForm] = useState(initialFormData);

  // --- BOOKINGS ---
  const [bookingsByEvent, setBookingsByEvent] = useState({});
  const [bookingModal, setBookingModal] = useState({
    open: false,
    event: null,
    page: 1,
    pageSize: 10,
    sort: { key: "timestamp", dir: "desc" }, // 'userName' | 'userEmail' | 'totalPrice' | 'timestamp'
    q: "",
  });

  // --- List header date-range filter (calendar) ---
  const [filterRange, setFilterRange] = useState([{ startDate: null, endDate: null, key: "selection" }]);
  const [showFilterPicker, setShowFilterPicker] = useState(false);
  const filterPickerRef = useRef(null);

  useEffect(() => {
    getList();
    getCategory();
    getPaymentList();
  }, []);

  // Load bookings for hostel
  useEffect(() => {
    (async () => {
      try {
        const qB = query(collection(db, "publiceventbookings"));
        const snap = await getDocs(qB);
        const grouped = {};
        snap.docs.forEach((d) => {
          const b = { id: d.id, ...d.data() };
          const key = b.eventId || "__unknown__";
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(b);
        });
        setBookingsByEvent(grouped);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load bookings");
      }
    })();
  }, []);

  const getList = async () => {
    setIsLoading(true);
    try {
      const qEvents = query(collection(db, "publicevents"));
      const snap = await getDocs(qEvents);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (toMillis(a.startDateTime) ?? 0) - (toMillis(b.startDateTime) ?? 0));
      setList(docs);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load events");
    } finally {
      setIsLoading(false);
    }
  };

  const getPaymentList = async () => {
    setIsLoading(true);
    try {
      const qPay = query(collection(db, "punliceventpaymenttype"));
      const snap = await getDocs(qPay);
      setPaymentList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally {
      setIsLoading(false);
    }
  };

  const getCategory = async () => {
    try {
      const qCat = query(collection(db, "publiceventcategory"));
      const snap = await getDocs(qCat);
      setCategory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  };

  const uniquePath = (folder, file) => {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const base = file.name.replace(/\.[^/.]+$/, "");
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prefix = folder ? `${folder}/` : "";
    return `${prefix}${base}_${stamp}.${ext}`;
  };

  const isBlankHtml = (html) => {
    if (!html) return true;
    const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return text.length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const hasPoster = (form.posters?.length || 0) > 0 || (form.posterFiles?.length || 0) > 0;
      if (!editingData && !hasPoster) return toast.error("Please add at least one poster");
      if (isBlankHtml(form.eventDescriptionHtml)) return toast.error("Please add a description");

      const sMs = new Date(form.startDateTime).getTime();
      const eMs = new Date(form.endDateTime).getTime();
      if (Number.isNaN(sMs) || Number.isNaN(eMs) || eMs <= sMs) return toast.error("End date/time must be after start date/time.");

      const capNum = parseInt(form.capacity, 10);
      const maxPerNum = parseInt(form.maxPurchaseTickets, 10);
      if (!Number.isNaN(maxPerNum) && maxPerNum < 1) return toast.error("Max purchase tickets must be at least 1.");
      if (!Number.isNaN(capNum) && !Number.isNaN(maxPerNum) && maxPerNum > capNum)
        return toast.error("Max purchase tickets cannot be greater than Max Capacity.");

      // upload new posters
      let uploaded = [];
      if (form.posterFiles?.length) {
        const uploads = form.posterFiles.map(async (file) => {
          const path = uniquePath(`public_event_posters/${emp.id}/${form.eventName || "publicevents"}`, file);
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, file);
          const url = await getDownloadURL(sRef);
          return { url, name: file.name };
        });
        uploaded = await Promise.all(uploads);
      }
      const posters = [...(form.posters || []), ...uploaded];

      const eventData = {
        ...form,
        prices: form.priceType === "Free" ? [] : form.prices,
        startDateTime: form.startDateTime,//Timestamp.fromDate(new Date(form.startDateTime)),
        endDateTime: form.endDateTime, //? Timestamp.fromDate(new Date(form.endDateTime)) : null,
        posters,
        imageUrl: emp?.imageUrl ?? null,
        uid,
        isPinned: !!form.isPinned,
        pinnedAt: form.isPinned ? form.pinnedAt || Timestamp.now() : null,
        pinnedOrder: Number.isFinite(Number(form.pinnedOrder)) ? Number(form.pinnedOrder) : null,
        maxPurchaseTickets: Number.isNaN(Number(form.maxPurchaseTickets)) ? null : Number(form.maxPurchaseTickets),
      };
      delete eventData.id;
      delete eventData.posterFiles;

      if (editingData) {
        const ref = doc(db, "publicevents", editingData.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return toast.warning("Event does not exist! Cannot update.");
        await updateDoc(ref, eventData);
        toast.success("Event updated successfully");
      } else {
        await addDoc(collection(db, "publicevents"), eventData);
        toast.success("Event created successfully");
      }
      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialFormData);
    } catch (err) {
      console.error(err);
      toast.error("Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "publicevents", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const toMillis = (val) => {
    if (!val) return null;
    if (typeof val === "object" && val.seconds != null) return val.seconds * 1000;
    if (val?.toDate) return val.toDate().getTime();
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? null : ms;
  };

  const formatDateTime = (ts) => {
    const ms = toMillis(ts);
    if (!ms) return "—";
    return dayjs(ms).format("YYYY-MM-DD hh:mm A");
  };

  // windows + classification
  function getEventWindowMillis(item) {
    const s1 = toMillis(item.startDateTime);
    const e1 = toMillis(item.endDateTime);
    if (s1 || e1) return { start: s1 ?? e1, end: e1 ?? s1, source: "dateTime" };
    const sd = toMillis(item?.date?.startDate);
    const ed = toMillis(item?.date?.endDate);
    if (sd || ed) {
      const start = sd ? new Date(sd) : (ed ? new Date(ed) : null);
      const end = ed ? new Date(ed) : (sd ? new Date(sd) : null);
      if (start && end) {
        const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0, 0).getTime();
        const dayEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).getTime();
        return { start: dayStart, end: dayEnd, source: "dateOnly" };
      }
    }
    return { start: null, end: null, source: "none" };
  }

  function classifyEvent(item) {
    const now = Date.now();
    const { start, end } = getEventWindowMillis(item);
    if (start == null && end == null) return "current";
    if (start != null && now < start) return "future";
    if (end != null && now > end) return "past";
    return "current";
  }

  // pin helpers
  const eNumber = (v) => (v === "" || v === null || v === undefined ? NaN : Number(v));
  const getPinnedSorted = () =>
    [...list].filter((e) => e.isPinned).sort((a, b) => {
      const ao = Number.isFinite(eNumber(a.pinnedOrder)) ? a.pinnedOrder : 1e9;
      const bo = Number.isFinite(eNumber(b.pinnedOrder)) ? b.pinnedOrder : 1e9;
      if (ao !== bo) return ao - bo;
      const aPA = toMillis(a.pinnedAt) ?? 0;
      const bPA = toMillis(b.pinnedAt) ?? 0;
      return bPA - aPA;
    });

  const renumberPinned = async () => {
    const pinned = getPinnedSorted();
    const batch = writeBatch(db);
    pinned.forEach((ev, i) => {
      const order = i + 1;
      if (ev.pinnedOrder !== order) batch.update(doc(db, "publicevents", ev.id), { pinnedOrder: order });
    });
    await batch.commit();
    await getList();
  };

  const movePin = async (item, dir) => {
    const pinned = getPinnedSorted();
    const idx = pinned.findIndex((e) => e.id === item.id);
    const swapIdx = idx + dir;
    if (idx === -1 || swapIdx < 0 || swapIdx >= pinned.length) return;
    const a = pinned[idx];
    const b = pinned[swapIdx];
    const batch = writeBatch(db);
    batch.update(doc(db, "publicevents", a.id), { pinnedOrder: b.pinnedOrder });
    batch.update(doc(db, "publicevents", b.id), { pinnedOrder: a.pinnedOrder });
    await batch.commit();
    await getList();
  };

  const applyPinOrder = async (item, newOrderRaw) => {
    if (!item.isPinned) return;
    let newOrder = Math.max(1, Math.floor(Number(newOrderRaw) || 1));
    const pinned = getPinnedSorted().filter((e) => e.id !== item.id);
    newOrder = Math.min(newOrder, pinned.length + 1);
    const sequence = [...pinned];
    sequence.splice(newOrder - 1, 0, { ...item });
    const batch = writeBatch(db);
    sequence.forEach((ev, i) => batch.update(doc(db, "publicevents", ev.id), { pinnedOrder: i + 1 }));
    await batch.commit();
    await getList();
  };

  const togglePin = async (item, makePinned) => {
    try {
      const ref = doc(db, "publicevents", item.id);
      if (makePinned) {
        const currentPinned = getPinnedSorted();
        const nextOrder = (currentPinned[currentPinned.length - 1]?.pinnedOrder || 0) + 1;
        await updateDoc(ref, { isPinned: true, pinnedAt: Timestamp.now(), pinnedOrder: nextOrder });
      } else {
        await updateDoc(ref, { isPinned: false, pinnedAt: null, pinnedOrder: null });
        await renumberPinned();
      }
      toast.success(makePinned ? "Pinned" : "Unpinned");
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Could not update pin");
    }
  };

  // ----- helper lines for compact time/date in table -----
  const SHOW_ALL_DAY_FOR_DATE_ONLY = true;
  const toMilli = toMillis;

  function getTimeLine(item) {
    const s = toMilli(item.startDateTime);
    const e = toMilli(item.endDateTime);
    if (s || e) {
      const st = s ? dayjs(s).format("hh:mm A") : "";
      const et = e ? dayjs(e).format("hh:mm A") : "";
      return st && et ? `${st} to ${et}` : (st || et || "");
    }
    return SHOW_ALL_DAY_FOR_DATE_ONLY ? "All day" : "";
  }

  function getDateLine(item) {
    let s = toMilli(item.startDateTime) ?? toMilli(item?.date?.startDate);
    let e = toMilli(item.endDateTime) ?? toMilli(item?.date?.endDate);

    if (!s && !e) return "—";
    if (!s) s = e;
    if (!e) e = s;

    const sd = dayjs(s), ed = dayjs(e);
    const sameMonth = sd.month() === ed.month() && sd.year() === ed.year();
    const sameYear = sd.year() === ed.year();

    const monLower = (d) => d.format("MMM").toLowerCase();
    const needYear = !sameYear || sd.year() !== dayjs().year();

    if (sameMonth) {
      return `${sd.format("D")}–${ed.format("D")} ${monLower(sd)}${needYear ? " " + sd.format("YYYY") : ""}`;
    }
    if (sameYear) {
      return `${sd.format("D")} ${monLower(sd)}–${ed.format("D")} ${monLower(ed)}${needYear ? " " + sd.format("YYYY") : ""}`;
    }
    return `${sd.format("D MMM YYYY")}–${ed.format("D MMM YYYY")}`.replace(/MMM/g, (m) => m.toLowerCase());
  }

  // ---- list filtering/sorting (with calendar header filter) ----
  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
  const dayEnd   = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  const overlaps = (evStartMs, evEndMs, fStart, fEnd) => {
    if (!fStart || !fEnd) return true; // no active filter
    const fs = dayStart(fStart);
    const fe = dayEnd(fEnd);
    return evStartMs <= fe && evEndMs >= fs;
  };

  const timeFiltered = list.filter((ev) => classifyEvent(ev) === timeFilter);
  const catFiltered = categoryFilter === "All" ? timeFiltered : timeFiltered.filter((ev) => (ev.category || "") === categoryFilter);
  const pinFiltered = showPinnedOnly ? catFiltered.filter((ev) => !!ev.isPinned) : catFiltered;

  const filtered = pinFiltered.filter((ev) => {
    const nameOK = !filters.name || (ev.eventName || "").toLowerCase().includes(filters.name.toLowerCase());
    const locOK = !filters.location || (ev.locationName || "").toLowerCase().includes(filters.location.toLowerCase());

    const { start, end } = getEventWindowMillis(ev);
    const fStart = filterRange?.[0]?.startDate;
    const fEnd   = filterRange?.[0]?.endDate;
    const rangeOK = (start == null && end == null) ? true : overlaps(start ?? 0, end ?? 0, fStart, fEnd);

    return nameOK && locOK && rangeOK;
  });

  const getSortVal = (ev, key) => {
    if (key === "name") return (ev.eventName || "").toLowerCase();
    if (key === "start") return toMillis(ev.startDateTime) ?? 0;
    if (key === "location") return (ev.locationName || "").toLowerCase();
    if (key === "category") return (ev.category || "").toLowerCase();
    return "";
  };

  const sorted = [...filtered].sort((a, b) => {
    const ap = a.isPinned ? 1 : 0;
    const bp = b.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;

    if (ap === 1 && bp === 1) {
      const ao = Number.isFinite(eNumber(a.pinnedOrder)) ? a.pinnedOrder : 1e9;
      const bo = Number.isFinite(eNumber(b.pinnedOrder)) ? b.pinnedOrder : 1e9;
      if (ao !== bo) return ao - bo;
      const aPA = toMillis(a.pinnedAt) ?? 0;
      const bPA = toMillis(b.pinnedAt) ?? 0;
      if (aPA !== bPA) return bPA - aPA;
    }

    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const va = getSortVal(a, sortConfig.key);
    const vb = getSortVal(b, sortConfig.key);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });

  const categoryOptions = ["All", ...Array.from(new Set((category || []).map((c) => c.name).filter(Boolean)))];

  const handleRangeChange = (item) => {
    const selected = item.selection;
    setRange([selected]);
    const bothSelected = selected.startDate && selected.endDate && selected.startDate.getTime() !== selected.endDate.getTime();
    if (bothSelected) {
      setForm((prev) => ({
        ...prev,
        date: { startDate: selected.startDate.toISOString(), endDate: selected.endDate.toISOString() },
      }));
      setShowPicker(false);
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Event</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialFormData);
            setModalOpen(true);
          }}
        >
          + Add Event
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {["past", "current", "future"].map((k) => {
          const active = timeFilter === k;
          return (
            <button
              key={k}
              onClick={() => setTimeFilter(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"}`}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          );
        })}

        <label className="ml-1 text-sm flex items-center gap-2 border border-gray-300 rounded-full px-3 py-1 bg-white">
          <input type="checkbox" checked={showPinnedOnly} onChange={(e) => setShowPinnedOnly(e.target.checked)} />
          Show pinned only
        </label>

        <span className="text-xs text-gray-500">Showing {sorted.length} of {list.length}</span>
      </div>

      <h2 className="text-xl font-semibold mb-2">
        {timeFilter === "past" ? "Past Events" : timeFilter === "future" ? "Upcoming Events" : "Happening Now"}
      </h2>

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
                  { key: "name", label: "Event" },
                  { key: "category", label: "Category" },
                  { key: "start", label: "Event Date" },
                  { key: "location", label: "Location" },
                  { key: "bookings", label: "Bookings", sortable: false },
                  { key: "image", label: "Poster(s)", sortable: false },
                  { key: "pin", label: "Pin", sortable: false },
                  { key: "actions", label: "Actions", sortable: false },
                ].map((col) => (
                  <th key={col.key} className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none">
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:underline"
                        onClick={() => onSort(col.key)}
                        title="Sort"
                      >
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
                  <select
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    title="Filter by category"
                  >
                    {categoryOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === "All" ? "All" : opt}
                      </option>
                    ))}
                  </select>
                </th>

                {/* DATE RANGE FILTER (calendar popover) */}
                <th className="px-6 pb-3 relative">
                  <button
                    type="button"
                    className="w-full border border-gray-300 rounded text-sm px-2 py-1 text-left bg-white hover:bg-gray-50"
                    onClick={() => setShowFilterPicker((v) => !v)}
                    title="Filter by date range"
                  >
                    {(() => {
                      const s = filterRange?.[0]?.startDate;
                      const e = filterRange?.[0]?.endDate;
                      if (s && e) {
                        return `${format(s, "MMM dd, yyyy")} – ${format(e, "MMM dd, yyyy")}`;
                      }
                      return "Any date";
                    })()}
                  </button>

                  {showFilterPicker && (
                    <div
                      ref={filterPickerRef}
                      className="absolute z-50 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg"
                      style={{ left: 0 }}
                    >
                      <DateRange
                        ranges={[
                          {
                            startDate: filterRange?.[0]?.startDate ?? new Date(),
                            endDate: filterRange?.[0]?.endDate ?? new Date(),
                            key: "selection",
                          },
                        ]}
                        onChange={(r) => {
                          const sel = r.selection;
                          setFilterRange([{ ...sel }]);
                        }}
                        moveRangeOnFirstSelection={false}
                        locale={enUS}
                        editableDateInputs
                      />
                      <div className="flex items-center justify-end gap-2 p-2 border-t bg-gray-50">
                        <button
                          type="button"
                          className="text-sm px-3 py-1 rounded border hover:bg-white"
                          onClick={() => {
                            setFilterRange([{ startDate: null, endDate: null, key: "selection" }]);
                            setShowFilterPicker(false);
                          }}
                        >
                          Clear
                        </button>
                        <button
                          type="button"
                          className="text-sm px-3 py-1 rounded border bg-black text-white hover:opacity-90"
                          onClick={() => setShowFilterPicker(false)}
                        >
                          Apply
                        </button>
                      </div>
                    </div>
                  )}
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
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="8" className="px-6 py-10 text-center text-gray-500">No events to show for this filter.</td>
                </tr>
              ) : (
                sorted.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.eventName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.category || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {getTimeLine(item)} <br />
                      {getDateLine(item)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.locationName}</td>

                    {/* Bookings column */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {(() => {
                        const arr = bookingsByEvent[item.eventName] || [];
                        const count = arr.length;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center justify-center h-6 min-w-6 px-2 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                              {count}
                            </span>
                            {count > 0 && (
                              <button
                                type="button"
                                className="text-blue-600 hover:underline"
                                onClick={() =>
                                  setBookingModal({
                                    open: true,
                                    event: item,
                                    page: 1,
                                    pageSize: 10,
                                    sort: { key: "timestamp", dir: "desc" },
                                    q: "",
                                  })
                                }
                              >
                                View
                              </button>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.posters?.[0]?.url ? (
                        <img src={item.posters[0].url} alt="" width={80} height={80} className="rounded" />
                      ) : null}
                      {item.posters?.length > 1 && (
                        <div className="text-xs text-gray-500 mt-1">+{item.posters.length - 1} more</div>
                      )}
                    </td>

                    {/* Pin column */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          title={item.isPinned ? "Unpin" : "Pin"}
                          onClick={() => togglePin(item, !item.isPinned)}
                          className={`text-lg leading-none ${item.isPinned ? "text-yellow-500" : "text-gray-300"} hover:opacity-80`}
                          aria-label={item.isPinned ? "Unpin event" : "Pin event"}
                        >
                          {item.isPinned ? "★" : "☆"}
                        </button>

                        {item.isPinned && (
                          <>
                            <input
                              type="number"
                              min={1}
                              value={Number.isFinite(item.pinnedOrder) ? item.pinnedOrder : 1}
                              onChange={(e) => {
                                const val = e.target.value;
                                setList((prev) =>
                                  prev.map((ev) => (ev.id === item.id ? { ...ev, pinnedOrder: Number(val) } : ev))
                                );
                              }}
                              onBlur={(e) => applyPinOrder(item, e.target.value)}
                              className="w-12 px-2 py-1 border rounded text-sm text-center"
                              title="Pinned order (1 = top)"
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                type="button"
                                className="border rounded px-1 leading-none"
                                title="Move up"
                                onClick={() => movePin(item, -1)}
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                className="border rounded px-1 leading-none"
                                title="Move down"
                                onClick={() => movePin(item, 1)}
                              >
                                ↓
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          const startDate = item.date?.startDate?.seconds
                            ? new Date(item.date.startDate.seconds * 1000)
                            : new Date(item.date?.startDate || new Date());
                          const endDate = item.date?.endDate?.seconds
                            ? new Date(item.date.endDate.seconds * 1000)
                            : new Date(item.date?.endDate || new Date());
                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            date: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
                            startDateTime: item.startDateTime || "",
                            endDateTime: item.endDateTime || "",
                            posterFiles: [],
                            posters: Array.isArray(item.posters) ? item.posters : [],
                            eventDescriptionHtml: item.eventDescriptionHtml || item.eventDescription || "",
                            pinnedOrder: Number.isFinite(item.pinnedOrder) ? item.pinnedOrder : null,
                          }));
                          setRange([{ startDate, endDate, key: "selection" }]);
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
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit Event" : "Create Event"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <input name="eventName" placeholder="Event Name" value={form.eventName} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <input name="shortDesc" placeholder="Short Description" value={form.shortDesc} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <label className="block font-medium">Description</label>
                <EditorPro value={form.eventDescriptionHtml} onChange={(html) => setForm((f) => ({ ...f, eventDescriptionHtml: html }))} placeholder="Describe your event…" />

                <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required>
                  <option value="">Select Category</option>
                  {category?.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>

                <input name="tags" placeholder="Tags (comma separated)" value={form.tags} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />

                <label>Date Range</label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={
                      form.date?.startDate && form.date?.endDate
                        ? `${format(new Date(form.date.startDate), "MMM dd, yyyy")} - ${format(new Date(form.date.endDate), "MMM dd, yyyy")}`
                        : ""
                    }
                    onClick={() => setShowPicker(!showPicker)}
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                  {showPicker && (
                    <div ref={pickerRef} style={{ position: "absolute", top: 50, zIndex: 1000, boxShadow: "0px 2px 10px rgba(0,0,0,0.2)" }}>
                      <DateRange editableDateInputs onChange={handleRangeChange} moveRangeOnFirstSelection={false} ranges={range} minDate={new Date()} locale={enUS} />
                    </div>
                  )}
                </div>

                <label>Start Date Time</label>
                <input type="datetime-local" name="startDateTime" value={form.startDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <label>End Date Time</label>
                <input type="datetime-local" name="endDateTime" value={form.endDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <label className="block mb-2">
                  <input type="checkbox" name="isRecurring" checked={form.isRecurring} onChange={handleChange} /> Recurring Event?
                </label>
                {form.isRecurring && (
                  <select name="frequency" value={form.frequency} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                    <option value="">Select Frequency</option>
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Custom">Custom</option>
                  </select>
                )}

                <input name="locationName" placeholder="Location Name" value={form.locationName} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <input name="address" placeholder="Address / Room" value={form.address} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <div className="relative">
                  <input name="mapLocation" readOnly placeholder="Select on map" value={form.mapLocation} onClick={() => setShowMapModal(true)} className="w-full border border-gray-300 p-2 pl-10 rounded cursor-pointer" />
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>

                {/* Posters */}
                <div className="space-y-2">
                  <label className="block font-medium">Posters (you can add multiple)</label>
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
                          setForm((prev) => ({ ...prev, posterFiles: [...prev.posterFiles, ...files] }));
                        }}
                      />
                      📁 Choose Posters
                    </label>
                    <span className="text-sm text-gray-600">{form.posterFiles.length ? `${form.posterFiles.length} selected` : "No files selected"}</span>
                  </div>

                  {!!form.posterFiles.length && (
                    <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2">
                      {form.posterFiles.map((f, i) => (
                        <div key={`${f.name}-${i}`} className="relative">
                          <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-24 object-cover rounded" />
                          <button
                            type="button"
                            className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                            onClick={() =>
                              setForm((prev) => {
                                const next = [...prev.posterFiles];
                                next.splice(i, 1);
                                return { ...prev, posterFiles: next };
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

                  {!!form.posters.length && (
                    <>
                      <div className="text-sm text-gray-500 mt-3">Already saved</div>
                      <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                        {form.posters.map((img, i) => (
                          <div key={`${img.url}-${i}`} className="relative">
                            <img src={img.url} alt={img.name || `poster-${i}`} className="w-full h-24 object-cover rounded" />
                            <button
                              type="button"
                              className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                              onClick={() =>
                                setForm((prev) => {
                                  const next = [...prev.posters];
                                  next.splice(i, 1);
                                  return { ...prev, posters: next };
                                })
                              }
                              title="Remove from event"
                            >
                              ✕
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <label className="block mb-2">
                  <input type="checkbox" name="rsvp" checked={form.rsvp} onChange={handleChange} /> RSVP Required?
                </label>
                <input name="capacity" placeholder="Max Capacity" value={form.capacity} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input
                  type="number"
                  name="maxPurchaseTickets"
                  min="1"
                  placeholder="Max Purchase Tickets (per booking/user)"
                  value={form.maxPurchaseTickets}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                />
                <p className="text-xs text-gray-500 -mt-1">Limit how many tickets one booking (or user) can purchase. Leave blank for no limit.</p>
                <input type="datetime-local" name="rsvpDeadline" value={form.rsvpDeadline} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />

                <select name="priceType" value={form.priceType} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required>
                  <option value="">Select Payment Type</option>
                  <option value="Free">Free</option>
                  <option value="Paid">Paid</option>
                  <option value="MultiPrice">Multi Price</option>
                  <option value="MultiPriceTimer">Multi Price Timer</option>
                </select>

                {form.priceType !== "Free" && form.priceType !== "" && (
                  <div>
                    <h2 className="font-semibold">Pricing Options</h2>
                    {form.prices.map((price, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        {form.priceType === "Paid" && (
                          <select
                            value={price.type}
                            onChange={(e) => {
                              const updated = [...form.prices];
                              updated[index].type = e.target.value;
                              setForm({ ...form, prices: updated });
                            }}
                            className="w-full border border-gray-300 p-2 rounded"
                            required
                          >
                            <option value="">Select Type</option>
                            {paymentlist.map((it) => (
                              <option key={it.id} value={it.name}>
                                {it.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {form.priceType === "MultiPriceTimer" && (
                          <select
                            value={price.type}
                            onChange={(e) => {
                              const updated = [...form.prices];
                              updated[index].type = e.target.value;
                              setForm({ ...form, prices: updated });
                            }}
                            className="w-full border border-gray-300 p-2 rounded"
                            required
                          >
                            <option value="">Select Type</option>
                            <option value="First Day">First Day</option>
                            <option value="Second Day">Second Day</option>
                            <option value="Third Day">Third Day</option>
                          </select>
                        )}
                        <input
                          placeholder="Amount"
                          type="number"
                          value={price.amount}
                          onChange={(e) => {
                            const updated = [...form.prices];
                            updated[index].amount = e.target.value;
                            setForm({ ...form, prices: updated });
                          }}
                          className="border p-2 w-1/3"
                        />
                        <input
                          type="datetime-local"
                          value={price.validUntil || ""}
                          onChange={(e) => {
                            const updated = [...form.prices];
                            updated[index].validUntil = e.target.value;
                            setForm({ ...form, prices: updated });
                          }}
                          className="border p-2 w-1/3"
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, prices: [...f.prices, { type: "", amount: "", validUntil: "" }] }))}
                      className="bg-gray-300 px-3 py-1 rounded"
                    >
                      + Add Price
                    </button>
                  </div>
                )}

                <label className="block mb-2">
                  <input type="checkbox" name="allowChat" checked={form.allowChat} onChange={handleChange} /> Allow Chat
                </label>
                <label className="block mb-2">
                  <input type="checkbox" name="allowReactions" checked={form.allowReactions} onChange={handleChange} /> Allow Reactions
                </label>

                <input name="challenges" placeholder="Event Challenges / Polls" value={form.challenges} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <select name="visibility" value={form.visibility} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                  <option value="Public">Public</option>
                  <option value="Friends">Friends Only</option>
                  <option value="Invite">Invite Only</option>
                  <option value="Campus">Campus Only</option>
                </select>
                <input name="cohosts" placeholder="Co-hosts" value={form.cohosts} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="website" placeholder="Website" value={form.website} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="instagram" placeholder="Instagram Link" value={form.instagram} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="rules" placeholder="Event Rules" value={form.rules} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <label className="block mb-2">
                  <input type="checkbox" name="boothOption" checked={form.boothOption} onChange={handleChange} /> Booth / Stall Option
                </label>
                <input name="vendorInfo" placeholder="Vendor Info" value={form.vendorInfo} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="sponsorship" placeholder="Sponsorship Info" value={form.sponsorship} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button onClick={() => setModalOpen(false)} type="button" className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editingData ? "Update Event" : "Create Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Event</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.eventName}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Map modal */}
      <Dialog open={showMapModal} onClose={() => setShowMapModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Pick a Location</DialogTitle>
        <DialogContent dividers sx={{ overflow: "hidden" }}>
          <MapLocationInput value={form.mapLocation} onChange={(val) => setForm({ ...form, mapLocation: val })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMapModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowMapModal(false)} disabled={!form.mapLocation}>
            Save location
          </Button>
        </DialogActions>
      </Dialog>

      {/* BOOKINGS MODAL */}
      {bookingModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
          <div className="bg-white w-full max-w-3xl max-h-[85vh] rounded-lg shadow-lg flex flex-col">
            <div className="px-5 py-4 border-b flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold">
                Bookings — {bookingModal.event?.eventName || "Event"}
              </h3>
              <div className="flex items-center gap-2">
                {/* Export CSV */}
                <button
                  className="text-sm px-2 py-1 border rounded hover:bg-gray-50"
                  onClick={() => {
                    const rows = bookingsByEvent[bookingModal.event?.id] || [];
                    const csv = [
                      ["userName","userEmail","totalPrice","timestamp","ticketsJSON"],
                      ...rows.map(b => [
                        (b.userName||"").replaceAll(",", " "),
                        (b.userEmail||""),
                        String(b.totalPrice ?? ""),
                        b.timestamp ? dayjs(toMillis(b.timestamp)).format("YYYY-MM-DD HH:mm") : "",
                        JSON.stringify(b.tickets || {})
                      ])
                    ].map(r => r.join(",")).join("\n");
                    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${(bookingModal.event?.eventName||"event").replace(/\s+/g,"_")}_bookings.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export CSV
                </button>

                <button
                  className="text-gray-600 hover:text-black"
                  onClick={() => setBookingModal((p) => ({ ...p, open: false }))}
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="px-5 py-3 border-b flex items-center gap-3">
              <input
                className="border rounded px-3 py-1.5 text-sm w-60"
                placeholder="Search name/email"
                value={bookingModal.q}
                onChange={(e) => setBookingModal((p) => ({ ...p, q: e.target.value, page: 1 }))}
              />

              <div className="ml-auto flex items-center gap-2">
                <span className="text-sm text-gray-600">Rows</span>
                <select
                  className="border rounded px-2 py-1 text-sm"
                  value={bookingModal.pageSize}
                  onChange={(e) => setBookingModal((p) => ({ ...p, pageSize: Number(e.target.value), page: 1 }))}
                >
                  {[5,10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {[
                      { key: "userName", label: "User" },
                      { key: "userEmail", label: "Email" },
                      { key: "tickets", label: "Tickets", sortable: false },
                      { key: "totalPrice", label: "Total Price" },
                      { key: "timestamp", label: "Booked At" },
                    ].map((c) => (
                      <th key={c.key} className="px-5 py-3 text-left text-sm font-medium text-gray-600">
                        {c.sortable === false ? (
                          <span>{c.label}</span>
                        ) : (
                          <button
                            className="flex items-center gap-1 hover:underline"
                            onClick={() =>
                              setBookingModal((p) =>
                                p.sort.key === c.key
                                  ? { ...p, sort: { key: c.key, dir: p.sort.dir === "asc" ? "desc" : "asc" } }
                                  : { ...p, sort: { key: c.key, dir: "asc" } }
                              )
                            }
                          >
                            <span>{c.label}</span>
                            {bookingModal.sort.key === c.key && (
                              <span className="text-gray-400">{bookingModal.sort.dir === "asc" ? "▲" : "▼"}</span>
                            )}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {(() => {
                    const rows = bookingsByEvent[bookingModal.event?.eventName] || [];

                    // filter
                    const q = (bookingModal.q || "").trim().toLowerCase();
                    const filtered = q
                      ? rows.filter(b =>
                          (b.userName || "").toLowerCase().includes(q) ||
                          (b.userEmail || "").toLowerCase().includes(q)
                        )
                      : rows;

                    // sort
                    const dir = bookingModal.sort.dir === "asc" ? 1 : -1;
                    const sortedRows = [...filtered].sort((a, b) => {
                      const key = bookingModal.sort.key;
                      switch (key) {
                        case "userName": return ((a.userName || "").localeCompare(b.userName || "")) * dir;
                        case "userEmail": return ((a.userEmail || "").localeCompare(b.userEmail || "")) * dir;
                        case "totalPrice": return ((Number(a.totalPrice || 0) - Number(b.totalPrice || 0)) * dir);
                        case "timestamp":
                        default: return (((toMillis(a.timestamp) ?? 0) - (toMillis(b.timestamp) ?? 0)) * dir);
                      }
                    });

                    // paginate
                    const total = sortedRows.length;
                    const start = (bookingModal.page - 1) * bookingModal.pageSize;
                    const pageRows = sortedRows.slice(start, start + bookingModal.pageSize);

                    if (pageRows.length === 0) {
                      return (
                        <tr>
                          <td colSpan={5} className="px-5 py-10 text-center text-gray-500">
                            No bookings found.
                          </td>
                        </tr>
                      );
                    }

                    return pageRows.map((b) => (
                      <tr key={b.id}>
                        <td className="px-5 py-3 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            {b.userPhotoURL ? <img src={b.userPhotoURL} alt="" className="w-8 h-8 rounded-full" /> : null}
                            <span>{b.userName || "—"}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-700">{b.userEmail || "—"}</td>
                        <td className="px-5 py-3 text-sm text-gray-700">
                          {b.tickets && Object.keys(b.tickets).length ? (
                            <ul className="space-y-0.5">
                              {Object.entries(b.tickets).map(([type, count]) => (
                                <li key={type}>{type}: <strong>{count}</strong></li>
                              ))}
                            </ul>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-700">
                          {typeof b.totalPrice === "number" ? `$${b.totalPrice}` : (b.totalPrice || "—")}
                        </td>
                        <td className="px-5 py-3 text-sm text-gray-700">
                          {b.timestamp ? dayjs(toMillis(b.timestamp)).format("MMM DD, YYYY hh:mm A") : "—"}
                        </td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pager */}
            <div className="px-5 py-3 border-t flex items-center justify-between">
              {(() => {
                const rows = bookingsByEvent[bookingModal.event?.id] || [];
                const q = (bookingModal.q || "").trim().toLowerCase();
                const filtered = q
                  ? rows.filter(b =>
                      (b.userName || "").toLowerCase().includes(q) ||
                      (b.userEmail || "").toLowerCase().includes(q)
                    )
                  : rows;
                const total = filtered.length;
                const totalPages = Math.max(1, Math.ceil(total / bookingModal.pageSize));
                const canPrev = bookingModal.page > 1;
                const canNext = bookingModal.page < totalPages;
                return (
                  <>
                    <span className="text-sm text-gray-600">
                      Page {bookingModal.page} of {totalPages} • {total} total
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        className={`px-3 py-1 rounded border ${canPrev ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                        onClick={() => canPrev && setBookingModal((p)=>({ ...p, page: p.page - 1 }))}
                        disabled={!canPrev}
                      >
                        Prev
                      </button>
                      <button
                        className={`px-3 py-1 rounded border ${canNext ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                        onClick={() => canNext && setBookingModal((p)=>({ ...p, page: p.page + 1 }))}
                        disabled={!canNext}
                      >
                        Next
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
