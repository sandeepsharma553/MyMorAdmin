import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, writeBatch, setDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { format, parse, isValid } from "date-fns";

// Date range in header
import { DateRange } from "react-date-range";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";
import { enUS } from "date-fns/locale";
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const DAY_LABEL = { sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday" };

const defaultWeeklyHours = () =>
  DAY_KEYS.reduce((acc, k) => { acc[k] = { open: false, start: "", end: "" }; return acc; }, {});

const hmToMinutes = (hm) => {
  if (!hm || !/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
};

export default function BookingPage({ navbarHeight }) {
  // Modals
  const [modalOpen, setModalOpen] = useState(false);         // Room Type (Add/Edit)
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [listOpen, setListModelOpen] = useState(false);      // Manage Types list
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [roomTypeInput, setRoomTypeInput] = useState("");

  // Data
  const [list, setList] = useState([]);
  const [bookingTypeList, setBookingTypeList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Selection
  const [selectedBookingIds, setSelectedBookingIds] = useState(new Set());
  const [selectedTypeIds, setSelectedTypeIds] = useState(new Set());

  // Auth
  const uid = useSelector((s) => s.auth.user.uid);
  const emp = useSelector((s) => s.auth.employee);

  // Table & filters
  const [currentPage, setCurrentPage] = useState(1);
  const [roomFilter, setRoomFilter] = useState("All");
  const [roomTypeFilter, setRoomTypeFilter] = useState("All");
  const [rooms, setRooms] = useState([]);
  const [allTypes, setAllTypes] = useState([]);
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const [filters, setFilters] = useState({ username: "", email: "", status: "All", time: "" });
  const debounceRef = useRef();
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilters((p) => ({ ...p, [field]: value })), 250);
  };
  const onSort = (key) =>
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  // HEADER filters: DateRange + TimeRange
  const [range, setRange] = useState([{ startDate: null, endDate: null, key: "selection" }]);
  const [dateActive, setDateActive] = useState(false); // NEW
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef();
  const [timeRange, setTimeRange] = useState({ start: "", end: "" }); // HH:mm – HH:mm
  const adminId = emp?.uid || uid;
  useEffect(() => {
    if (!adminId) return;
    const refDoc = doc(db, "adminMenuState", adminId, "menus", "bookingroom");
    setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
  }, [adminId]);
  useEffect(() => {
    const onClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Edit Room Type form
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const initialForm = {
    id: 0, roomname: "", description: "", location: "",
    maxDurationMins: 120, startTime: "", endTime: "",
    weeklyHours: defaultWeeklyHours(),
    roomtypes: []
  };
  const [form, setForm] = useState(initialForm);

  // New Booking form
  const initialBookingForm = { roomname: "", date: "", startTime: "", endTime: "", note: "" };
  const [bookingForm, setBookingForm] = useState(initialBookingForm);

  // Helpers
  const toJsDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    const d = new Date(v);
    return isNaN(d) ? null : d;
  };
  const toLocalDateOnly = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const sameDay = (d) => {
    const y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(m)}/${pad(day)}/${y}`;
  };
  const fmtTime = (d) => (d ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "");
  const parseBookingDate = (raw) => {
    if (!raw) return null;
    if (/\d{4}-\d{2}-\d{2}/.test(raw)) return new Date(raw);
    const p = parse(raw, "dd/MM/yyyy", new Date());
    return isValid(p) ? p : null;
  };

  // Tag helpers
  const sanitizeType = (s) => s.trim().replace(/\s+/g, " ");
  const addTypesFromString = (src) => {
    const parts = src.split(",").map(sanitizeType).filter(Boolean);
    setForm((prev) => ({ ...prev, roomtypes: Array.from(new Set([...(prev.roomtypes || []), ...parts])) }));
    setRoomTypeInput("");
  };
  const removeType = (t) =>
    setForm((prev) => ({ ...prev, roomtypes: (prev.roomtypes || []).filter((x) => x !== t) }));

  // Load
  useEffect(() => { getList(); /* eslint-disable-next-line */ }, [roomFilter, roomTypeFilter]);
  useEffect(() => { setCurrentPage(1); }, [filters, sortConfig, roomFilter, roomTypeFilter, range, timeRange]);

  const getList = async () => {
    setIsLoading(true);
    try {
      // Users
      const usersQuery = query(collection(db, "users"), where("hostelid", "==", emp.hostelid));
      const userSnap = await getDocs(usersQuery);
      const userMap = {};
      userSnap.forEach((d) => {
        const u = d.data();
        userMap[u.uid] = { username: u.username || u.UserName || u.USERNAME || "Unknown", email: u.email || "No email" };
      });

      // Bookings
      const bookingQ = query(
        collection(db, "bookingroom"),
        where("hostelid", "==", emp?.hostelid)
      );
      const bookingSnap = await getDocs(bookingQ);
      const allBookings = bookingSnap.docs.map((d) => {
        const raw = d.data();
        const s = toJsDate(raw.startdate);
        const e = toJsDate(raw.enddate);
        return {
          id: d.id,
          ...raw,
          username: userMap[raw.uid]?.username || "Unknown",
          email: userMap[raw.uid]?.email || "N/A",
          displayDate: s ? sameDay(s) : (raw.date || ""),
          displayTime: s ? `${fmtTime(s)}${e ? ` – ${fmtTime(e)}` : ""}` : (raw.time || ""),
        };
      });

      // Room types
      const bookingTypeSnap = await getDocs(query(collection(db, "bookingroomtype"), where("hostelid", "==", emp.hostelid)));
      const BookingType = bookingTypeSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const uniqueRooms = Array.from(new Set(BookingType.map((b) => b.roomname))).filter(Boolean);
      const allTypesLocal = Array.from(new Set(BookingType.flatMap((rt) => rt.roomtypes || [])));

      // Allowed rooms based on selected type
      const roomsForType = new Set(
        roomTypeFilter === "All"
          ? BookingType.map((x) => x.roomname)
          : BookingType.filter((x) => (x.roomtypes || []).includes(roomTypeFilter)).map((x) => x.roomname)
      );

      const roomFiltered0 = allBookings.filter((b) => roomsForType.has(b.roomname));
      const roomFiltered = roomFilter === "All" ? roomFiltered0 : roomFiltered0.filter((b) => b.roomname === roomFilter);

      setRooms(["All", ...uniqueRooms]);
      setAllTypes(["All", ...allTypesLocal]);
      setBookingTypeList(BookingType);
      setList(roomFiltered);

      setSelectedBookingIds(new Set());
      setSelectedTypeIds(new Set());
    } catch (err) {
      console.error(err);
      toast.error("Failed to load bookings.");
    } finally {
      setIsLoading(false);
    }
  };

  // Save Room Type
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.roomname) return;

    // validate weekly hours
    for (const k of DAY_KEYS) {
      const day = form.weeklyHours[k];
      if (day?.open) {
        const s = hmToMinutes(day.start), ed = hmToMinutes(day.end);
        if (s == null || ed == null) { toast.warning(`${DAY_LABEL[k]}: start/end must be HH:mm`); return; }
        if (s === ed) { toast.warning(`${DAY_LABEL[k]}: start and end cannot be same`); return; }
      }
    }

    try {
      if (editingData) {
        const docRef = doc(db, "bookingroomtype", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) { toast.warning("BookingRoomType does not exist!"); return; }
        await updateDoc(docRef, {
          uid,
          roomname: form.roomname,
          description: form.description,
          location: form.location,
          maxDurationMins: Number(form.maxDurationMins) || 120,
          startTime: form.startTime || "",
          endTime: form.endTime || "",
          weeklyHours: form.weeklyHours || defaultWeeklyHours(),
          roomtypes: Array.isArray(form.roomtypes) ? form.roomtypes : [],
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        await addDoc(collection(db, "bookingroomtype"), {
          uid,
          roomname: form.roomname,
          description: form.description,
          location: form.location,
          maxDurationMins: Number(form.maxDurationMins) || 120,
          startTime: form.startTime || "",
          endTime: form.endTime || "",
          weeklyHours: form.weeklyHours || defaultWeeklyHours(),
          roomtypes: Array.isArray(form.roomtypes) ? form.roomtypes : [],
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
      }
    } catch {
      toast.error("Save failed.");
    }

    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    getList();
    setListModelOpen(true);
  };

  // Delete single Room Type
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, "bookingroomtype", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch {
      toast.error("Delete failed.");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
    setListModelOpen(true);
  };

  // Bulk delete bookings
  const deleteSelectedBookings = async () => {
    if (selectedBookingIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedBookingIds.size} booking(s)? This cannot be undone.`)) return;
    setIsLoading(true);
    try {
      const ids = Array.from(selectedBookingIds);
      const CHUNK = 400;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = writeBatch(db);
        ids.slice(i, i + CHUNK).forEach((id) => batch.delete(doc(db, "bookingroom", id)));
        await batch.commit();
      }
      toast.success("Selected bookings deleted");
      setSelectedBookingIds(new Set());
      getList();
    } catch {
      toast.error("Failed to delete selected bookings");
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk delete room types
  const deleteSelectedRoomTypes = async () => {
    if (selectedTypeIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedTypeIds.size} room type(s)? This cannot be undone.`)) return;
    setIsLoading(true);
    try {
      const ids = Array.from(selectedTypeIds);
      const CHUNK = 400;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = writeBatch(db);
        ids.slice(i, i + CHUNK).forEach((id) => batch.delete(doc(db, "bookingroomtype", id)));
        await batch.commit();
      }
      toast.success("Selected room types deleted");
      setSelectedTypeIds(new Set());
      getList();
      setListModelOpen(true);
    } catch {
      toast.error("Failed to delete selected room types");
    } finally {
      setIsLoading(false);
    }
  };

  // Booking: Reject
  const handleReject = async () => {
    if (!editingData) return;
    try {
      await updateDoc(doc(db, "bookingroom", editingData.id), { status: "Rejected" });
      toast.success("Booking has been rejected.");
      getList();
    } catch {
      toast.error("Failed to reject booking.");
    }
    setConfirmRejectOpen(false);
    setEditing(null);
  };

  // ---------- Header filter logic (DATE + TIME) ----------
  const withinDateHeaderRange = (row) => {
    if (!dateActive) return true; // not filtering by date
    const s = toJsDate(row.startdate);
    const e = toJsDate(row.enddate);
    const r = range[0];

    if (!s || !e) {
      const bd = row.date ? parseBookingDate(row.date) : null;
      if (!bd) return false;
      const d0 = toLocalDateOnly(bd);
      return d0 >= toLocalDateOnly(r.startDate) && d0 <= toLocalDateOnly(r.endDate);
    }
    const s0 = toLocalDateOnly(s), e0 = toLocalDateOnly(e);
    const rs = toLocalDateOnly(r.startDate), re = toLocalDateOnly(r.endDate);
    return s0 <= re && e0 >= rs;
  };


  const withinTimeHeaderRange = (row) => {
    const start = toJsDate(row.startdate);
    const end = toJsDate(row.enddate);
    if (!timeRange.start && !timeRange.end) return true;
    if (!start || !end) return false;

    const rowStartM = start.getHours() * 60 + start.getMinutes();
    const rowEndM = end.getHours() * 60 + end.getMinutes();

    const filterStartM = hmToMinutes(timeRange.start) ?? 0;
    const filterEndM = hmToMinutes(timeRange.end) ?? 24 * 60;

    // overlap (supports overnight window)
    if (filterStartM <= filterEndM) {
      return rowStartM < filterEndM && rowEndM > filterStartM;
    } else {
      const a = rowStartM < 1440 && rowEndM > filterStartM; // late-night part
      const b = rowStartM < filterEndM && rowEndM > 0;     // early-morning part
      return a || b;
    }
  };

  // ---------- Client-side filter/sort/paginate ----------
  const filteredData = list.filter((row) => {
    const uOK = !filters.username || (row.username || "").toLowerCase().includes(filters.username.toLowerCase());
    const eOK = !filters.email || (row.email || "").toLowerCase().includes(filters.email.toLowerCase());
    const sOK = filters.status === "All" || (row.status || "").toLowerCase() === filters.status.toLowerCase();
    const tOK = !filters.time || (row.displayTime || row.time || "").toLowerCase().includes(filters.time.toLowerCase());
    const dateHeaderOK = withinDateHeaderRange(row);
    const timeHeaderOK = withinTimeHeaderRange(row);
    return uOK && eOK && sOK && tOK && dateHeaderOK && timeHeaderOK;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    if (sortConfig.key === "date") {
      const da = toJsDate(a.startdate) || parseBookingDate(a.date);
      const dbb = toJsDate(b.startdate) || parseBookingDate(b.date);
      if (!da && !dbb) return 0; if (!da) return -1 * dir; if (!dbb) return 1 * dir; return (da - dbb) * dir;
    }
    if (sortConfig.key === "time") {
      const ta = (a.displayTime || a.time || ""), tb = (b.displayTime || b.time || "");
      return ta.localeCompare(tb) * dir;
    }
    const sa = (a[sortConfig.key] || "").toString().toLowerCase();
    const sb = (b[sortConfig.key] || "").toString().toLowerCase();
    return sa.localeCompare(sb) * dir;
  });

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const bookingPageIds = paginatedData.map((r) => r.id);
  const allBookingsPageSelected = bookingPageIds.length > 0 && bookingPageIds.every((id) => selectedBookingIds.has(id));
  const someBookingsPageSelected = bookingPageIds.some((id) => selectedBookingIds.has(id));

  const condenseWeekly = (wh) => {
    if (!wh) return "";
    return DAY_KEYS.map((k) => {
      const d = wh[k];
      if (!d?.open) return `${DAY_LABEL[k].slice(0, 3)} Closed`;
      return `${DAY_LABEL[k].slice(0, 3)} ${d.start || "--:--"}–${d.end || "--:--"}`;
    }).join(" • ");
  };

  const formattedRange = dateActive
    ? `${format(range[0].startDate, "MM/dd/yyyy")} - ${format(range[0].endDate, "MM/dd/yyyy")}`
    : "";

  return (
    <main className="flex-1 p-1 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex flex-wrap gap-2 justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Booking (When a notification appears, the app page should refresh.)</h1>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-black text-white rounded hover:bg-black" onClick={() => setListModelOpen(true)}>Manage Room Types</button>
          <button className="px-4 py-2 bg-black text-white rounded hover:bg-black" onClick={() => { setEditing(null); setForm(initialForm); setModalOpen(true); }}>
            + Add Room Type
          </button>
        </div>
      </div>

      <h2 className="text-lg font-semibold">Room Type</h2>
      <div className="flex items-center gap-4 flex-wrap mb-2">
        <select className="border px-3 py-2 rounded text-sm" value={roomFilter} onChange={(e) => setRoomFilter(e.target.value)}>
          {["All", ...rooms.filter((v, i, a) => a.indexOf(v) === i)].map((room) => (<option key={room} value={room}>{room}</option>))}
        </select>

        <select className="border px-3 py-2 rounded text-sm" value={roomTypeFilter} onChange={(e) => setRoomTypeFilter(e.target.value)}>
          {["All", ...allTypes].map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </div>

      {/* Bulk actions for bookings */}
      {selectedBookingIds.size > 0 && (
        <div className="mt-1 mb-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{selectedBookingIds.size} selected</span>
          <button onClick={deleteSelectedBookings} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm">Delete selected</button>
          <button onClick={() => setSelectedBookingIds(new Set(sortedData.map((r) => r.id)))} className="px-3 py-1.5 bg-gray-200 rounded text-sm">Select all ({sortedData.length})</button>
          <button onClick={() => setSelectedBookingIds(new Set())} className="px-3 py-1.5 bg-gray-200 rounded text-sm">Clear selection</button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" loading={isLoading} /></div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {/* Row 1: sort headers */}
              <tr>
                {[
                  { key: "username", label: "Username" },
                  { key: "email", label: "Email" },
                  { key: "date", label: "Date" },
                  { key: "time", label: "Time" },
                  { key: "status", label: "Status" },
                  { key: "actions", label: "Actions", sortable: false },
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
                <th className="px-6 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allBookingsPageSelected}
                    ref={(el) => { if (el) el.indeterminate = !allBookingsPageSelected && someBookingsPageSelected; }}
                    onChange={(e) => {
                      setSelectedBookingIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) bookingPageIds.forEach((id) => next.add(id));
                        else bookingPageIds.forEach((id) => next.delete(id));
                        return next;
                      });
                    }}
                  />
                </th>
              </tr>

              {/* Row 2: header filters */}
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="Search username" defaultValue={filters.username} onChange={(e) => setFilterDebounced("username", e.target.value)} />
                </th>
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="Search email" defaultValue={filters.email} onChange={(e) => setFilterDebounced("email", e.target.value)} />
                </th>

                {/* DATE RANGE picker in header */}
                <th className="px-6 pb-3">
                  <div className="relative">
                    <input
                      type="text"
                      readOnly
                      value={formattedRange}
                      onClick={() => setShowPicker((v) => !v)}
                      className="w-full border border-gray-300 p-1 rounded text-sm cursor-pointer"
                      placeholder="Select date range"
                    />
                    {dateActive && (
                      <button
                        type="button"
                        className="absolute right-1 top-1 text-xs px-1.5 py-0.5 border rounded bg-white"
                        onClick={() => setDateActive(false)}  // don’t null the dates
                        title="Clear"
                      >
                        Clear
                      </button>
                    )}
                    {showPicker && (
                      <div
                        ref={pickerRef}
                        style={{ position: "absolute", top: 34, zIndex: 1000, boxShadow: "0 2px 10px rgba(0,0,0,0.2)" }}
                      >
                        <DateRange
                          onChange={(r) => { setRange([r.selection]); setDateActive(true); }} // mark active
                          moveRangeOnFirstSelection={false}
                          ranges={range}
                          editableDateInputs
                          locale={enUS} // <-- important
                        />
                      </div>
                    )}
                  </div>
                </th>

                {/* TIME RANGE inputs in header */}
                <th className="px-6 pb-3">
                  <div className="flex items-center gap-1">
                    <input type="time" className="w-full border border-gray-300 p-1 rounded text-sm" value={timeRange.start} onChange={(e) => setTimeRange((r) => ({ ...r, start: e.target.value }))} />
                    <span className="text-gray-500 text-xs">to</span>
                    <input type="time" className="w-full border border-gray-300 p-1 rounded text-sm" value={timeRange.end} onChange={(e) => setTimeRange((r) => ({ ...r, end: e.target.value }))} />
                    {(timeRange.start || timeRange.end) && (
                      <button type="button" className="text-xs underline ml-1" onClick={() => setTimeRange({ start: "", end: "" })}>Clear</button>
                    )}
                  </div>
                </th>

                <th className="px-6 pb-3">
                  <select className="w-full border border-gray-300 p-1 rounded text-sm" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option>All</option>
                    <option>Pending</option>
                    <option>Approved</option>
                    <option>Rejected</option>
                    <option>Booked</option>
                  </select>
                </th>
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-4 text-center text-gray-500">No matching data found.</td></tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm text-gray-800">{item.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.displayDate}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.displayTime}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === "Rejected" ? "bg-red-200 text-red-800"
                        : (item.status === "Approved" || item.status === "Booked") ? "bg-green-200 text-green-800"
                          : "bg-yellow-200 text-yellow-800"
                        }`}>{item.status}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.status !== "Rejected" && (
                        <button className="text-blue-600 hover:underline mr-3" onClick={() => { setEditing(item); setConfirmRejectOpen(true); }}>
                          Reject
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedBookingIds.has(item.id)}
                        onChange={(e) => {
                          setSelectedBookingIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id); else next.delete(item.id);
                            return next;
                          });
                        }}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p>
        <div className="space-x-2">
          <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Previous</button>
          <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* Room Type modal (Add/Edit) */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? 'Edit Room Type' : 'Add Room Type'}</h2>
            <form onSubmit={handleAdd} className="space-y-6">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Title</label>
                <input type="text" className="w-full border border-gray-300 p-2 rounded" value={form.roomname} onChange={(e) => setForm({ ...form, roomname: e.target.value })} required />

                {/* ROOM TYPES TAG UI */}
                <label className="block font-medium mb-1">Room Types</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 border border-gray-300 p-2 rounded"
                    value={roomTypeInput}
                    onChange={(e) => setRoomTypeInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTypesFromString(roomTypeInput); } }}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={() => addTypesFromString(roomTypeInput)}
                  >
                    Add
                  </button>
                </div>

                {/* chips list */}
                <div className="flex flex-wrap gap-2 mt-2">
                  {(form.roomtypes || []).length === 0 ? (
                    <span className="text-xs text-gray-400">No types added</span>
                  ) : (
                    (form.roomtypes || []).map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-2 bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs"
                      >
                        {t}
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => removeType(t)}
                          aria-label={`Remove ${t}`}
                          title="Remove"
                        >
                          ✕
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <label className="block font-medium mb-1">Description</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required />

                <label className="block font-medium mb-1">Location</label>
                <input type="text" className="w-full border border-gray-300 p-2 rounded" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} required />

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-1">
                    <label className="block font-medium mb-1">Max Duration (mins)</label>
                    <input type="number" min={15} step={15} className="w-full border border-gray-300 p-2 rounded" value={form.maxDurationMins} onChange={(e) => setForm({ ...form, maxDurationMins: Number(e.target.value) })} />
                    <p className="text-xs text-gray-500 mt-1">Keep ≤ 120 for 2-hour max.</p>
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Fill Start</label>
                    <input type="time" className="w-full border border-gray-300 p-2 rounded" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Fill End</label>
                    <input type="time" className="w-full border border-gray-300 p-2 rounded" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                  </div>
                </div>

                <div className="mt-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Weekly Hours</span>
                    <button type="button" className="text-xs underline" onClick={() => {
                      const wh = defaultWeeklyHours();
                      DAY_KEYS.forEach(k => { wh[k] = { open: true, start: form.startTime, end: form.endTime }; });
                      setForm(prev => ({ ...prev, weeklyHours: wh }));
                    }}>Fill {form.startTime || '--:--'}–{form.endTime || '--:--'}</button>
                  </div>

                  <div className="space-y-2">
                    {DAY_KEYS.map(k => (
                      <div key={k} className="grid grid-cols-6 items-center gap-2">
                        <div className="col-span-2 text-sm">{DAY_LABEL[k]}</div>
                        <div className="col-span-1 flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={!!form.weeklyHours[k]?.open}
                            onChange={(e) => {
                              const wh = { ...form.weeklyHours, [k]: { ...(form.weeklyHours[k] || {}), open: e.target.checked } };
                              setForm(prev => ({ ...prev, weeklyHours: wh }));
                            }}
                          />
                          <span className="text-sm">{form.weeklyHours[k]?.open ? 'Open' : 'Closed'}</span>
                        </div>
                        <div className="col-span-1">
                          <input
                            type="time"
                            className="w-full border border-gray-300 p-2 rounded"
                            disabled={!form.weeklyHours[k]?.open}
                            value={form.weeklyHours[k]?.start || ''}
                            onChange={(e) => {
                              const wh = { ...form.weeklyHours, [k]: { ...(form.weeklyHours[k] || { open: true }), start: e.target.value } };
                              setForm(prev => ({ ...prev, weeklyHours: wh }));
                            }}
                          />
                        </div>
                        <div className="col-span-1">
                          <input
                            type="time"
                            className="w-full border border-gray-300 p-2 rounded"
                            disabled={!form.weeklyHours[k]?.open}
                            value={form.weeklyHours[k]?.end || ''}
                            onChange={(e) => {
                              const wh = { ...form.weeklyHours, [k]: { ...(form.weeklyHours[k] || { open: true }), end: e.target.value } };
                              setForm(prev => ({ ...prev, weeklyHours: wh }));
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Leave a day closed to disable bookings that day.</p>
                </div>
              </div>

              <div className="flex justify-end mt-2 space-x-3">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Booking modal */}
      {bookingModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">New Booking</h2>
            <form onSubmit={() => { }} className="space-y-4">
              {/* If you want to enable creation from here again, rewire to handleAddBooking */}
              <div className="space-y-4">
                <label className="block font-medium mb-1">Room</label>
                <select className="w-full border border-gray-300 p-2 rounded" value={bookingForm.roomname} onChange={(e) => setBookingForm({ ...bookingForm, roomname: e.target.value })} required>
                  <option value="" disabled>Select room</option>
                  {bookingTypeList.map(rt => (
                    <option key={rt.id} value={rt.roomname}>{rt.roomname}</option>
                  ))}
                </select>

                <label className="block font-medium mb-1">Date</label>
                <input type="date" className="w-full border border-gray-300 p-2 rounded" value={bookingForm.date} onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })} required />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-medium mb-1">Start Time</label>
                    <input type="time" className="w-full border border-gray-300 p-2 rounded" value={bookingForm.startTime} onChange={(e) => setBookingForm({ ...bookingForm, startTime: e.target.value })} required />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">End Time</label>
                    <input type="time" className="w-full border border-gray-300 p-2 rounded" value={bookingForm.endTime} onChange={(e) => setBookingForm({ ...bookingForm, endTime: e.target.value })} required />
                  </div>
                </div>

                <label className="block font-medium mb-1">Note (optional)</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" value={bookingForm.note} onChange={(e) => setBookingForm({ ...bookingForm, note: e.target.value })} placeholder="Purpose or notes" />
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button type="button" onClick={() => setBookingModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" type="button" onClick={() => toast.info("Hook this to handleAddBooking if needed")}>Save Booking</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Room Types list */}
      {listOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[95%] max-w-6xl shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Manage Room Types</h2>
              <button className="text-gray-600 hover:text-gray-800" onClick={() => setListModelOpen(false)}>✕</button>
            </div>

            {/* Bulk actions for Room Types */}
            {selectedTypeIds.size > 0 && (
              <div className="mb-2 flex items-center gap-3">
                <span className="text-sm text-gray-700">{selectedTypeIds.size} selected</span>
                <button
                  onClick={deleteSelectedRoomTypes}
                  className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                >
                  Delete selected
                </button>
                <button
                  onClick={() => setSelectedTypeIds(new Set(bookingTypeList.map(r => r.id)))}
                  className="px-3 py-1.5 bg-gray-200 rounded text-sm"
                >
                  Select all ({bookingTypeList.length})
                </button>
                <button
                  onClick={() => setSelectedTypeIds(new Set())}
                  className="px-3 py-1.5 bg-gray-200 rounded text-sm"
                >
                  Clear selection
                </button>
              </div>
            )}

            <div className="overflow-x-auto bg-white rounded shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {/* Select-all for types (entire list, no paging in modal) */}
                    <th className="px-6 py-3">
                      <input
                        type="checkbox"
                        aria-label="Select all room types"
                        checked={bookingTypeList.length > 0 && bookingTypeList.every(x => selectedTypeIds.has(x.id))}
                        ref={el => {
                          if (!el) return;
                          const all = bookingTypeList.length > 0 && bookingTypeList.every(x => selectedTypeIds.has(x.id));
                          const some = bookingTypeList.some(x => selectedTypeIds.has(x.id));
                          el.indeterminate = some && !all;
                        }}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTypeIds(new Set(bookingTypeList.map(x => x.id)));
                          } else {
                            setSelectedTypeIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Room Name</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Types</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Max (mins)</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hours</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bookingTypeList.map((roomData, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedTypeIds.has(roomData.id)}
                          onChange={(e) => {
                            setSelectedTypeIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(roomData.id);
                              else next.delete(roomData.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-800">{roomData.roomname}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {(roomData.roomtypes && roomData.roomtypes.length > 0)
                          ? roomData.roomtypes.join(', ')
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{roomData.description}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{roomData.location}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{roomData.maxDurationMins ?? 120}</td>
                      <td className="px-6 py-4 text-xs text-gray-600">
                        {(() => {
                          const wh = roomData.weeklyHours;
                          if (!wh) return "";
                          return DAY_KEYS.map(k => {
                            const d = wh[k];
                            if (!d?.open) return `${DAY_LABEL[k].slice(0, 3)} Closed`;
                            return `${DAY_LABEL[k].slice(0, 3)} ${d.start || "--:--"}–${d.end || "--:--"}`;
                          }).join(" • ");
                        })()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing(roomData);
                            setForm({
                              ...initialForm,
                              ...roomData,
                              id: roomData.id,
                              maxDurationMins: roomData.maxDurationMins ?? 120,
                              startTime: roomData.startTime || '',
                              endTime: roomData.endTime || '',
                              weeklyHours: roomData.weeklyHours || defaultWeeklyHours(),
                              roomtypes: Array.isArray(roomData.roomtypes) ? roomData.roomtypes : []
                            });
                            setModalOpen(true);
                            setListModelOpen(false);
                          }}>
                          Edit
                        </button>
                        <button className="text-red-600 hover:underline"
                          onClick={() => { setDelete(roomData); setConfirmDeleteOpen(true); }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Delete confirmation */}
            {confirmDeleteOpen && (
              <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
                  <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Booking Type</h2>
                  <p className="mb-4">Delete <strong>{deleteData?.roomname}</strong>?</p>
                  <div className="flex justify-end space-x-3">
                    <button onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                    <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reject booking */}
      {confirmRejectOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Booking Reject</h2>
            <p className="mb-4">Are you sure you want to reject this booking <strong>{editingData?.roomname}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setConfirmRejectOpen(false); setEditing(false); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={handleReject} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Reject</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
