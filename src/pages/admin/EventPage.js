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
  const [fileName, setFileName] = useState("No file chosen");
  const [category, setCategory] = useState([]);
  const [showMapModal, setShowMapModal] = useState(false);

  // Existing time filter
  const [timeFilter, setTimeFilter] = useState("current"); // 'past' | 'current' | 'future'

  // NEW: header sorting + filters
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
    eventDescription: "",
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
    poster: null,
    posterUrl: "",
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
  };
  const [form, setForm] = useState(initialFormData);

  useEffect(() => {
    getList();
    getCategory();
  }, []);

  const getList = async () => {
    setIsLoading(true);
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
    setIsLoading(false);
  };

  const getCategory = async () => {
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
  };

  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "checkbox") {
      setForm({ ...form, [name]: checked });
    } else if (type === "file") {
      setForm({ ...form, [name]: files[0] || null });
      setFileName(files?.length ? files[0].name : "No file chosen");
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!editingData && !form.poster) {
        toast.error("Please choose the poster file");
        return;
      }
      let posterUrl = form.posterUrl || "";
      const isNewImage = form.poster instanceof File;
      if (isNewImage) {
        const sRef = storageRef(storage, `event_posters/${form.poster.name}`);
        await uploadBytes(sRef, form.poster);
        posterUrl = await getDownloadURL(sRef);
      }
      const eventData = {
        ...form,
        prices: form.priceType === "Free" ? [] : form.prices,
        startDateTime: Timestamp.fromDate(new Date(form.startDateTime)),
        endDateTime: form.endDateTime ? Timestamp.fromDate(new Date(form.endDateTime)) : null,
        ...(posterUrl && { posterUrl }),
        hostelid: emp.hostelid,
        uid,
      };
      delete eventData.id;
      delete eventData.poster;

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
    setFileName("No file chosen");
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

  // --- helpers for timestamps + classify ---
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

  // ----- Apply time filter, then header filters, then sort -----
  const timeFiltered = list.filter(ev => classifyEvent(ev) === timeFilter);

  const filtered = timeFiltered.filter(ev => {
    const nameOK = !filters.name || (ev.eventName || "").toLowerCase().includes(filters.name.toLowerCase());
    const locOK  = !filters.location || (ev.locationName || "").toLowerCase().includes(filters.location.toLowerCase());
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
  const sorted = [...filtered].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const va = getSortVal(a, sortConfig.key);
    const vb = getSortVal(b, sortConfig.key);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return va.localeCompare(vb) * dir;
  });

  const addPriceOption = () => {
    setForm(f => ({ ...f, prices: [...f.prices, { type: "", amount: "", validUntil: "" }] }));
  };
  const handlePriceChange = (index, field, value) => {
    const updated = [...form.prices];
    updated[index][field] = value;
    setForm({ ...form, prices: updated });
  };
  const descRef = useRef(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const EMOJIS = [
    "😀","😁","😂","🤣","😊","🙂","😉","😍","😘","😎",
    "😇","🤩","🤗","🤔","🙃","😴","😅","🥳","😤","😭",
    "👍","👎","👏","🙏","💪","🔥","✨","🎉","📣","📍"
  ];
  
  // Wrap current selection with ** ** (Markdown bold)
  const applyBoldToDescription = () => {
    const ta = descRef.current;
    if (!ta) return;
    const { selectionStart: s = 0, selectionEnd: e = 0 } = ta;
    const value = form.eventDescription || "";
    const selected = value.slice(s, e) || "bold text";
    const insert = `**${selected}**`;
    const next = value.slice(0, s) + insert + value.slice(e);
    setForm(prev => ({ ...prev, eventDescription: next }));
  
    // restore focus + selection inside inserted text
    requestAnimationFrame(() => {
      ta.focus();
      const startPos = s + 2; // after opening **
      const endPos = startPos + selected.length;
      ta.setSelectionRange(startPos, endPos);
    });
  };
  
  const insertEmojiIntoDescription = (emoji) => {
    const ta = descRef.current;
    const value = form.eventDescription || "";
    const s = ta?.selectionStart ?? value.length;
    const e = ta?.selectionEnd ?? value.length;
    const next = value.slice(0, s) + emoji + value.slice(e);
    setForm(prev => ({ ...prev, eventDescription: next }));
    setShowEmojiPicker(false);
  
    requestAnimationFrame(() => {
      if (!ta) return;
      const caret = s + emoji.length;
      ta.focus();
      ta.setSelectionRange(caret, caret);
    });
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add + time filter */}
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

      {/* Past / Current / Future filter */}
      <div className="flex items-center gap-2 mb-3">
        {["past", "current", "future"].map((k) => {
          const active = timeFilter === k;
          return (
            <button
              key={k}
              onClick={() => setTimeFilter(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {k[0].toUpperCase() + k.slice(1)}
            </button>
          );
        })}
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
              {/* Row 1: Sortable headers */}
              <tr>
                {[
                  { key: "name", label: "Event" },
                  { key: "start", label: "Event Date" },
                  { key: "location", label: "Location" },
                  { key: "image", label: "Image", sortable: false },
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

              {/* Row 2: Inline filters */}
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
                      {item.posterUrl ? (
                        <img src={item.posterUrl} alt="" width={80} height={80} className="rounded" />
                      ) : null}
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
                            poster: null,
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

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit Event" : "Create Event"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <input name="eventName" placeholder="Event Name" value={form.eventName} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <input name="shortDesc" placeholder="Short Description" value={form.shortDesc} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <textarea name="eventDescription" placeholder="Description" value={form.eventDescription} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>
                <label className="block font-medium">Description</label>
                {/* <div className="border border-gray-300 rounded">
               
                  <div className="flex items-center gap-2 p-2 border-b bg-gray-50">
                    <button
                      type="button"
                      onClick={applyBoldToDescription}
                      className="px-2 py-1 text-sm font-semibold rounded border hover:bg-gray-100"
                      title="Bold (**selection**)"
                    >
                      B
                    </button>

                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(v => !v)}
                        className="px-2 py-1 text-lg rounded border hover:bg-gray-100"
                        title="Insert emoji"
                      >
                        😊
                      </button>

                      {showEmojiPicker && (
                        <div className="absolute z-10 mt-2 w-56 p-2 bg-white border rounded shadow grid grid-cols-8 gap-1">
                          {EMOJIS.map(e => (
                            <button
                              key={e}
                              type="button"
                              className="text-xl rounded hover:bg-gray-100"
                              onClick={() => insertEmojiIntoDescription(e)}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <span className="ml-auto text-xs text-gray-500">
                      Supports **bold** + emoji
                    </span>
                  </div>
                  <textarea
                    ref={descRef}
                    name="eventDescription"
                    placeholder="Describe your event… Use **bold** and add emojis!"
                    value={form.eventDescription}
                    onChange={handleChange}
                    className="w-full p-2 rounded-b focus:outline-none"
                    style={{ minHeight: 120 }}
                    required
                  />
                </div> */}

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

                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input type="file" name="poster" accept="image/*" className="hidden" onChange={handleChange} />
                    📁 Choose File
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
                </div>
                {form.posterUrl && <img src={form.posterUrl} alt="Poster Preview" width="150" />}

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
                          <select value={price.type} onChange={(e) => handlePriceChange(index, "type", e.target.value)} className="w-full border border-gray-300 p-2 rounded" required>
                            <option value="">Select Type</option>
                            <option value="General">General</option>
                            <option value="VIP">VIP</option>
                          </select>
                        )}
                        {form.priceType === "MultiPriceTimer" && (
                          <select value={price.type} onChange={(e) => handlePriceChange(index, "type", e.target.value)} className="w-full border border-gray-300 p-2 rounded" required>
                            <option value="">Select Type</option>
                            <option value="First Day">First Day</option>
                            <option value="Second Day">Second Day</option>
                            <option value="Third Day">Third Day</option>
                          </select>
                        )}
                        <input placeholder="Amount" type="number" value={price.amount} onChange={(e) => handlePriceChange(index, "amount", e.target.value)} className="border p-2 w-1/3" />
                        <input type="datetime-local" value={price.validUntil || ""} onChange={(e) => handlePriceChange(index, "validUntil", e.target.value)} className="border p-2 w-1/3" />
                      </div>
                    ))}
                    <button type="button" onClick={addPriceOption} className="bg-gray-300 px-3 py-1 rounded">
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
