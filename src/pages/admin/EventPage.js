import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, Timestamp,
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import dayjs from "dayjs";
import MapLocationInput from "../../components/MapLocationInput";
import EditorPro from "../../components/EditorPro"; // <<---- NEW
import { MapPin } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";

export default function EventPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState([]);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  // time filter
  const [timeFilter, setTimeFilter] = useState("current"); // 'past' | 'current' | 'future'

  // header sorting + filters
  const [sortConfig, setSortConfig] = useState({ key: "start", direction: "asc" });
  const [filters, setFilters] = useState({ name: "", date: "", location: "" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, [field]: value }));
    }, 250);
  };
  const onSort = (key) =>
    setSortConfig(prev =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  const initialFormData = {
    id: 0,
    eventName: "",
    shortDesc: "",
    // replaced textarea with HTML editor:
    eventDescriptionHtml: "",

    category: "",
    tags: "",
    startDateTime: "",
    endDateTime: "",
    isRecurring: false,
    frequency: "",
    locationName: "",
    address: "",
    mapLocation: "",
    onlineLink: "",

    // MULTI-POSTER
    posters: [],      // persisted: [{url, name}]
    posterFiles: [],  // transient: [File, File, ...]

    promoVideo: "",
    theme: "",
    rsvp: false,
    capacity: "",
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
  };
  const [form, setForm] = useState(initialFormData);

  useEffect(() => {
    getList();
    getCategory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getList = async () => {
    setIsLoading(true);
    try {
      const eventsQuery = query(
        collection(db, "events"),
        where("hostelid", "==", emp.hostelid)
      );
      const querySnapshot = await getDocs(eventsQuery);
      const documents = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      documents.sort((a, b) => (toMillis(a.startDateTime) ?? 0) - (toMillis(b.startDateTime) ?? 0));
      setList(documents);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load events");
    } finally {
      setIsLoading(false);
    }
  };

  const getCategory = async () => {
    try {
      const eventCategoryQuery = query(
        collection(db, "eventcategory"),
        where("hostelid", "==", emp.hostelid)
      );
      const querySnapshot = await getDocs(eventCategoryQuery);
      const documents = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setCategory(documents);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setForm({ ...form, [name]: checked });
    } else {
      setForm({ ...form, [name]: value });
    }
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
    // strip tags & &nbsp;
    const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    return text.length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const hasAnyPoster = (form.posters?.length || 0) > 0 || (form.posterFiles?.length || 0) > 0;
      if (!editingData && !hasAnyPoster) {
        toast.error("Please add at least one poster");
        return;
      }
      if (isBlankHtml(form.eventDescriptionHtml)) {
        toast.error("Please add a description");
        return;
      }

      // upload new poster files
      let uploadedPosters = [];
      if (form.posterFiles?.length) {
        const uploads = form.posterFiles.map(async (file) => {
          const path = uniquePath(`event_posters/${emp.hostelid}/${form.eventName || "event"}`, file);
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, file);
          const url = await getDownloadURL(sRef);
          return { url, name: file.name };
        });
        uploadedPosters = await Promise.all(uploads);
      }
      const posters = [...(form.posters || []), ...uploadedPosters];

      const eventData = {
        ...form,
        prices: form.priceType === "Free" ? [] : form.prices,
        startDateTime: Timestamp.fromDate(new Date(form.startDateTime)),
        endDateTime: form.endDateTime ? Timestamp.fromDate(new Date(form.endDateTime)) : null,
        posters,
        hostelid: emp.hostelid,
        uid,
        isPinned: !!form.isPinned,
        pinnedAt: form.isPinned
          ? (form.pinnedAt || Timestamp.now())
          : null,
      };

      // clean non-persist fields
      delete eventData.id;
      delete eventData.posterFiles;

      if (editingData) {
        const eventRef = doc(db, "events", editingData.id);
        const snap = await getDoc(eventRef);
        if (!snap.exists()) {
          toast.warning("Event does not exist! Cannot update.");
          return;
        }
        await updateDoc(eventRef, eventData);
        toast.success("Event updated successfully");
      } else {
        await addDoc(collection(db, "events"), eventData);
        toast.success("Event created successfully");
      }
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }

    await getList();
    setModalOpen(false);
    setEditing(null);
    setForm(initialFormData);
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "events", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const formatDateTime = (ts) => {
    const ms = toMillis(ts);
    if (!ms) return "—";
    return dayjs(ms).format("YYYY-MM-DD hh:mm A");
  };

  function toMillis(val) {
    if (!val) return null;
    if (typeof val === "object" && "seconds" in val) return val.seconds * 1000;
    if (val?.toDate) return val.toDate().getTime();
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  function classifyEvent(item) {
    const now = Date.now();
    const start = toMillis(item.startDateTime);
    const end = toMillis(item.endDateTime);
    if (!start && !end) return "current";
    if (start && now < start) return "future";
    if (end && now > end) return "past";
    if (start && end && start <= now && now <= end) return "current";
    if (!end && start && now >= start) return "current";
    if (!start && end && now <= end) return "current";
    return "current";
  }

  const timeFiltered = list.filter(ev => classifyEvent(ev) === timeFilter);
  const pinFiltered = showPinnedOnly
    ? timeFiltered.filter(ev => !!ev.isPinned)
    : timeFiltered;
  const filtered = pinFiltered.filter(ev => {
    const nameOK = !filters.name || (ev.eventName || "").toLowerCase().includes(filters.name.toLowerCase());
    const locOK = !filters.location || (ev.locationName || "").toLowerCase().includes(filters.location.toLowerCase());
    const dateStr = [ev.startDateTime, ev.endDateTime].map(formatDateTime).join(" ");
    const dateOK = !filters.date || dateStr.toLowerCase().includes(filters.date.toLowerCase());
    return nameOK && locOK && dateOK;
  });
  const getSortVal = (ev, key) => {
    if (key === "name") return (ev.eventName || "").toLowerCase();
    if (key === "start") return toMillis(ev.startDateTime) ?? 0;
    if (key === "location") return (ev.locationName || "").toLowerCase();
    return "";
  };
  // const sorted = [...filtered].sort((a, b) => {
  //   const dir = sortConfig.direction === "asc" ? 1 : -1;
  //   const va = getSortVal(a, sortConfig.key);
  //   const vb = getSortVal(b, sortConfig.key);
  //   if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
  //   return va.localeCompare(vb) * dir;
  // });
  const sorted = [...filtered].sort((a, b) => {
    // 1) Pinned first
    const ap = a.isPinned ? 1 : 0;
    const bp = b.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    // 2) Newest pinned first (by pinnedAt)
    if (ap === 1 && bp === 1) {
      const aPA = toMillis(a.pinnedAt) ?? 0;
      const bPA = toMillis(b.pinnedAt) ?? 0;
      if (aPA !== bPA) return bPA - aPA;
    }
    // 3) Fall back to current sort column
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const va = getSortVal(a, sortConfig.key);
    const vb = getSortVal(b, sortConfig.key);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
  const togglePin = async (item, makePinned) => {
    try {
      const ref = doc(db, "events", item.id);
      await updateDoc(ref, {
        isPinned: makePinned,
        pinnedAt: makePinned ? Timestamp.now() : null,
      });
      toast.success(makePinned ? "Pinned" : "Unpinned");
      getList();
    } catch (e) {
      console.error(e);
      toast.error("Could not update pin");
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
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

      {/* Past / Current / Future */}
      <div className="flex items-center gap-2 mb-3">
        {["past", "current", "future"].map((k) => {
          const active = timeFilter === k;
          return (
            <button
              key={k}
              onClick={() => setTimeFilter(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                }`}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          );
        })}
        <label className="ml-2 text-sm flex items-center gap-2 border border-gray-300 rounded-full px-3 py-1 bg-white">
          <input
            type="checkbox"
            checked={showPinnedOnly}
            onChange={(e) => setShowPinnedOnly(e.target.checked)}
          />
          Show pinned only
        </label>
        <span className="text-xs text-gray-500">
          Showing {sorted.length} of {list.length}
        </span>

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
                  { key: "start", label: "Event Date" },
                  { key: "location", label: "Location" },
                  { key: "image", label: "Poster(s)", sortable: false },
                  { key: "pin", label: "Pin", sortable: false },
                  { key: "actions", label: "Actions", sortable: false },
                ].map(col => (
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

              {/* Inline filters */}
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
                    placeholder="Filter date (e.g. 2025-01 or Jan)"
                    defaultValue={filters.date}
                    onChange={(e) => setFilterDebounced("date", e.target.value)}
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
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-10 text-center text-gray-500">
                    No events to show for this filter.
                  </td>
                </tr>
              ) : (
                sorted.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.eventName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {formatDateTime(item.startDateTime)} — {formatDateTime(item.endDateTime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.locationName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.posters?.[0]?.url ? (
                        <img src={item.posters[0].url} alt="" width={80} height={80} className="rounded" />
                      ) : null}
                      {item.posters?.length > 1 && (
                        <div className="text-xs text-gray-500 mt-1">+{item.posters.length - 1} more</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        type="button"
                        title={item.isPinned ? "Unpin" : "Pin"}
                        onClick={() => togglePin(item, !item.isPinned)}
                        className={`text-lg leading-none ${item.isPinned ? "text-yellow-500" : "text-gray-400"} hover:opacity-80`}
                        aria-label={item.isPinned ? "Unpin event" : "Pin event"}
                      >
                        {item.isPinned ? "★" : "☆"}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            startDateTime: item.startDateTime?.toDate?.().toISOString().slice(0, 16) || "",
                            endDateTime: item.endDateTime?.toDate?.().toISOString().slice(0, 16) || "",
                            posterFiles: [], // reset transient
                            posters: Array.isArray(item.posters) ? item.posters : [],
                            // Backward-compat: if old docs used eventDescription, load it
                            eventDescriptionHtml: item.eventDescriptionHtml || item.eventDescription || "",
                          }));
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit Event" : "Create Event"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <input name="eventName" placeholder="Event Name" value={form.eventName} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <input name="shortDesc" placeholder="Short Description" value={form.shortDesc} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />


                <label className="block font-medium">Description</label>
                <EditorPro
                  value={form.eventDescriptionHtml}
                  onChange={(html) => setForm((f) => ({ ...f, eventDescriptionHtml: html }))}
                  placeholder="Describe your event… format text, add links, images, emoji, etc."
                />

                <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required>
                  <option value="">Select Category</option>
                  {category?.map((item) => (
                    <option key={item.id} value={item.name}>{item.name}</option>
                  ))}
                </select>

                <input name="tags" placeholder="Tags (comma separated)" value={form.tags} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />

                <label>Start Date Time</label>
                <input type="datetime-local" name="startDateTime" value={form.startDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <label>End Date Time</label>
                <input type="datetime-local" name="endDateTime" value={form.endDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <label className="block mb-2"><input type="checkbox" name="isRecurring" checked={form.isRecurring} onChange={handleChange} /> Recurring Event?</label>
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

                {/* Multi posters */}
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
                          setForm(prev => ({ ...prev, posterFiles: [...prev.posterFiles, ...files] }));
                        }}
                      />
                      📁 Choose Posters
                    </label>
                    <span className="text-sm text-gray-600">
                      {form.posterFiles.length ? `${form.posterFiles.length} selected` : "No files selected"}
                    </span>
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
                              setForm(prev => {
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
                                setForm(prev => {
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

                <label className="block mb-2"><input type="checkbox" name="rsvp" checked={form.rsvp} onChange={handleChange} /> RSVP Required?</label>
                <input name="capacity" placeholder="Max Capacity" value={form.capacity} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
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
                          <select value={price.type} onChange={(e) => {
                            const updated = [...form.prices];
                            updated[index].type = e.target.value;
                            setForm({ ...form, prices: updated });
                          }} className="w-full border border-gray-300 p-2 rounded" required>
                            <option value="">Select Type</option>
                            <option value="General">General</option>
                            <option value="VIP">VIP</option>
                          </select>
                        )}
                        {form.priceType === "MultiPriceTimer" && (
                          <select value={price.type} onChange={(e) => {
                            const updated = [...form.prices];
                            updated[index].type = e.target.value;
                            setForm({ ...form, prices: updated });
                          }} className="w-full border border-gray-300 p-2 rounded" required>
                            <option value="">Select Type</option>
                            <option value="First Day">First Day</option>
                            <option value="Second Day">Second Day</option>
                            <option value="Third Day">Third Day</option>
                          </select>
                        )}
                        <input placeholder="Amount" type="number" value={price.amount} onChange={(e) => {
                          const updated = [...form.prices];
                          updated[index].amount = e.target.value;
                          setForm({ ...form, prices: updated });
                        }} className="border p-2 w-1/3" />
                        <input type="datetime-local" value={price.validUntil || ""} onChange={(e) => {
                          const updated = [...form.prices];
                          updated[index].validUntil = e.target.value;
                          setForm({ ...form, prices: updated });
                        }} className="border p-2 w-1/3" />
                      </div>
                    ))}
                    <button type="button" onClick={() => setForm(f => ({ ...f, prices: [...f.prices, { type: "", amount: "", validUntil: "" }] }))} className="bg-gray-300 px-3 py-1 rounded">
                      + Add Price
                    </button>
                  </div>
                )}

                <label className="block mb-2"><input type="checkbox" name="allowChat" checked={form.allowChat} onChange={handleChange} /> Allow Chat</label>
                <label className="block mb-2"><input type="checkbox" name="allowReactions" checked={form.allowReactions} onChange={handleChange} /> Allow Reactions</label>

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
                <label className="block mb-2"><input type="checkbox" name="boothOption" checked={form.boothOption} onChange={handleChange} /> Booth / Stall Option</label>
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
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.eventName}</strong>?</p>
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
          <MapLocationInput value={form.mapLocation} onChange={(val) => setForm({ ...form, mapLocation: val })} />
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
