import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, Timestamp
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";

export default function DealPage(props) {
  const { navbarHeight } = props;

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("No file chosen");

  // Time filter (past | current | future)
  const [timeFilter, setTimeFilter] = useState("current");

  // Header filters + sorting
  const [filters, setFilters] = useState({
    name: "",
    category: "",
    discount: "",
    start: "", // YYYY-MM or date substring
    end: "",   // YYYY-MM or date substring
  });
  const [sortConfig, setSortConfig] = useState({ key: "start", direction: "desc" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((p) => ({ ...p, [field]: value }));
    }, 250);
  };
  const onSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  const initialForm = {
    id: 0,
    name: "",
    description: "",
    shortdescription: "",
    discount: "",
    category: "",
    type: "",
    tags: "",
    businessName: "",
    location: "",
    onlineOnly: false,
    deliveryOptions: "",
    startDateTime: "",
    endDateTime: "",
    recurring: false,
    happyHour: "",
    originalPrice: "",
    bundleOffer: "",
    quantityLimit: "",
    redeemVia: "",
    usageRules: "",
    verification: "",
    footfallGoal: "",
    pushNotification: false,
    reminderNotification: false,
    enableQiPoints: false,
    poster: null,
    posterUrl: "",
    hostelid: ""
  };
  const [form, setForm] = useState(initialForm);

  // Utils
  const toMillis = (val) => {
    if (!val) return null;
    if (typeof val === "object" && "seconds" in val) return val.seconds * 1000;
    if (val?.toDate) return val.toDate().getTime();
    const ms = new Date(val).getTime();
    return Number.isNaN(ms) ? null : ms;
  };
  const classifyDeal = (d) => {
    const now = Date.now();
    const start = toMillis(d.startDateTime);
    const end = toMillis(d.endDateTime);
    if (start && now < start) return "future";
    if (end && now > end) return "past";
    if (start && end && start <= now && now <= end) return "current";
    if (!end && start && now >= start) return "current";
    if (!start && end && now <= end) return "current";
    return "current";
  };
  const fmt = (val) => {
    const ms = toMillis(val);
    if (!ms) return "";
    const d = new Date(ms);
    // YYYY-MM-DD HH:mm
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  // Data
  useEffect(() => {
    getList();
  }, []);

  const getList = async () => {
    setIsLoading(true);
    const dealsQuery = query(
      collection(db, "deals"),
      where("hostelid", "==", emp.hostelid)
    );
    const querySnapshot = await getDocs(dealsQuery);
    const documents = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Stable initial sort by startDateTime ASC
    documents.sort((a, b) => {
      const am = toMillis(a.startDateTime) ?? 0;
      const bm = toMillis(b.startDateTime) ?? 0;
      return am - bm;
    });

    setList(documents);
    setIsLoading(false);
  };

  // Form handlers
  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else if (type === "file") {
      setForm((prev) => ({ ...prev, [name]: files[0] || null }));
      setFileName(files?.length ? files[0].name : "No file chosen");
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // Require poster when creating new
      if (!editingData && !form.poster) {
        toast.error("Please choose the file");
        return;
      }

      let posterUrl = form.posterUrl || "";
      const isNewImage = form.poster instanceof File;
      if (isNewImage) {
        const sRef = storageRef(storage, `deal_posters/${form.poster.name}`);
        await uploadBytes(sRef, form.poster);
        posterUrl = await getDownloadURL(sRef);
      }

      const dealData = {
        ...form,
        startDateTime: Timestamp.fromDate(new Date(form.startDateTime)),
        endDateTime: form.endDateTime
          ? Timestamp.fromDate(new Date(form.endDateTime))
          : null,
        ...(posterUrl && { posterUrl }),
        hostelid: emp.hostelid,
        uid: uid,
      };
      delete dealData.id;
      delete dealData.poster;

      if (editingData) {
        const docRef = doc(db, "deals", editingData.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          toast.warning("Deal does not exist! Cannot update.");
          return;
        }
        await updateDoc(docRef, dealData);
        toast.success("Deal updated successfully");
      } else {
        await addDoc(collection(db, "deals"), dealData);
        toast.success("Deal created successfully");
      }
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }

    getList();
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "deals", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  // Filtering & sorting
  const matchSearch = (item) =>
    (item.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.category || "").toLowerCase().includes(searchTerm.toLowerCase());

  const filteredBySearch = list.filter(matchSearch);
  const filteredByTime = filteredBySearch.filter((item) => classifyDeal(item) === timeFilter);

  const filteredByHeader = filteredByTime.filter((item) => {
    const nameOK = !filters.name || (item.name || "").toLowerCase().includes(filters.name.toLowerCase());
    const catOK = !filters.category || (item.category || "").toLowerCase().includes(filters.category.toLowerCase());
    const discOK = !filters.discount || String(item.discount || "").toLowerCase().includes(filters.discount.toLowerCase());
    const startS = fmt(item.startDateTime);
    const endS = fmt(item.endDateTime);
    const startOK = !filters.start || startS.toLowerCase().includes(filters.start.toLowerCase());
    const endOK = !filters.end || endS.toLowerCase().includes(filters.end.toLowerCase());
    return nameOK && catOK && discOK && startOK && endOK;
  });

  const sorted = [...filteredByHeader].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const av = (k) => {
      if (k === "name") return (a.name || "");
      if (k === "category") return (a.category || "");
      if (k === "discount") return (a.discount || "");
      if (k === "start") return toMillis(a.startDateTime) || 0;
      if (k === "end") return toMillis(a.endDateTime) || 0;
      return "";
    };
    const bv = (k) => {
      if (k === "name") return (b.name || "");
      if (k === "category") return (b.category || "");
      if (k === "discount") return (b.discount || "");
      if (k === "start") return toMillis(b.startDateTime) || 0;
      if (k === "end") return toMillis(b.endDateTime) || 0;
      return "";
    };

    if (["start", "end"].includes(sortConfig.key)) {
      return (av(sortConfig.key) - bv(sortConfig.key)) * dir;
    } else {
      return String(av(sortConfig.key)).localeCompare(String(bv(sortConfig.key))) * dir;
    }
  });

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginatedData = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, timeFilter, filters, sortConfig]);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Deals</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      {/* Time filter */}
      <div className="flex items-center gap-2 mb-3">
        {["past", "current", "future"].map((k) => {
          const active = timeFilter === k;
          return (
            <button
              key={k}
              onClick={() => setTimeFilter(k)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                active
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-700 border-gray-300"
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or category"
          className="p-2 border border-gray-300 rounded w-full md:w-1/3"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {/* Row 1: clickable sort headers */}
              <tr>
                {[
                  { key: "name", label: "Name" },
                  { key: "category", label: "Category" },
                  { key: "discount", label: "Discount" },
                  { key: "start", label: "Start" },
                  { key: "end", label: "End" },
                  { key: "image", label: "Image", sortable: false },
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
                          <span className="text-gray-400">
                            {sortConfig.direction === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>

              {/* Row 2: header filters */}
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="name"
                    defaultValue={filters.name}
                    onChange={(e) => setFilterDebounced("name", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="category"
                    defaultValue={filters.category}
                    onChange={(e) => setFilterDebounced("category", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="discount"
                    defaultValue={filters.discount}
                    onChange={(e) => setFilterDebounced("discount", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="YYYY-MM or date"
                    defaultValue={filters.start}
                    onChange={(e) => setFilterDebounced("start", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="YYYY-MM or date"
                    defaultValue={filters.end}
                    onChange={(e) => setFilterDebounced("end", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-gray-500">
                    No deals match your filters.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="font-medium">{item.name}</div>
                      <div className="text-xs text-gray-500">{item.shortdescription}</div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.category}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.discount}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fmt(item.startDateTime)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fmt(item.endDateTime)}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.posterUrl ? (
                        <img src={item.posterUrl} width={80} height={80} alt="deal" />
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
                            startDateTime:
                              item.startDateTime?.toDate?.()
                                ? item.startDateTime.toDate().toISOString().slice(0, 16)
                                : (item.startDateTime
                                    ? new Date(item.startDateTime).toISOString().slice(0, 16)
                                    : ""),
                            endDateTime:
                              item.endDateTime?.toDate?.()
                                ? item.endDateTime.toDate().toISOString().slice(0, 16)
                                : (item.endDateTime
                                    ? new Date(item.endDateTime).toISOString().slice(0, 16)
                                    : ""),
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Deal" : "Create Deal"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <input
                  name="name"
                  placeholder="Title"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />

                <input
                  name="shortdescription"
                  placeholder="Short Description"
                  value={form.shortdescription}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
                <textarea
                  name="description"
                  placeholder="Description"
                  value={form.description}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />

                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                >
                  <option value="">Select Category</option>
                  <option value="Food">Food</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Movies">Movies</option>
                  <option value="Fitness">Fitness</option>
                </select>

                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      name="poster"
                      accept="image/*"
                      className="hidden"
                      onChange={handleChange}
                    />
                    📁 Choose File
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">
                    {fileName}
                  </span>
                </div>
                {form.posterUrl && (
                  <img src={form.posterUrl} alt="Poster Preview" width="150" />
                )}

                <input
                  name="tags"
                  placeholder="Tags (vegan, student special, happy hour, etc.)"
                  value={form.tags}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                />
                <input
                  name="businessName"
                  placeholder="Business Name"
                  value={form.businessName}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                />

                {/* Location */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">📍 Location</h3>
                  <input
                    name="location"
                    value={form.location}
                    onChange={handleChange}
                    placeholder="Store Location"
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="onlineOnly"
                      checked={form.onlineOnly}
                      onChange={handleChange}
                    />
                    Online Only Deal?
                  </label>
                  <input
                    name="deliveryOptions"
                    value={form.deliveryOptions}
                    onChange={handleChange}
                    placeholder="Delivery or Pickup Options"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                </section>

                {/* Timing */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">📅 Timing</h3>
                  <label>Start Date Time</label>
                  <input
                    type="datetime-local"
                    name="startDateTime"
                    value={form.startDateTime}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />
                  <label>End Date Time</label>
                  <input
                    type="datetime-local"
                    name="endDateTime"
                    value={form.endDateTime}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="recurring"
                      checked={form.recurring}
                      onChange={handleChange}
                    />
                    Recurring Deal?
                  </label>
                  <input
                    name="happyHour"
                    value={form.happyHour}
                    onChange={handleChange}
                    placeholder="Happy Hour Timing (e.g. 3–6pm)"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                </section>

                {/* Pricing */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">💸 Pricing</h3>
                  <input
                    type="number"
                    min={0}
                    name="originalPrice"
                    value={form.originalPrice}
                    onChange={handleChange}
                    placeholder="Original Price"
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />
                  <input
                    type="number"
                    min={0}
                    name="discount"
                    value={form.discount}
                    onChange={handleChange}
                    placeholder="Discounted Price / % Off"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                  <input
                    name="bundleOffer"
                    value={form.bundleOffer}
                    onChange={handleChange}
                    placeholder="Bundle Offer"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                  <input
                    type="number"
                    min={0}
                    name="quantityLimit"
                    value={form.quantityLimit}
                    onChange={handleChange}
                    placeholder="Quantity Limit"
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  />
                </section>

                {/* Redemption & Rules */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">⚙ Redemption & Rules</h3>
                  <select
                    name="redeemVia"
                    value={form.redeemVia}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                  >
                    <option value="">Select Redemption Method</option>
                    <option value="qr">QR Code</option>
                    <option value="mention">In-store Mention</option>
                    <option value="onlineCode">Online Code</option>
                    <option value="appTap">App Tap-to-Redeem</option>
                  </select>
                  <textarea
                    name="usageRules"
                    value={form.usageRules}
                    onChange={handleChange}
                    placeholder="Usage Rules"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                  <input
                    name="verification"
                    value={form.verification}
                    onChange={handleChange}
                    placeholder="Verification Needed"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                </section>

                {/* Engagement */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">🧠 Engagement & Tracking</h3>
                  <input
                    type="number"
                    min={0}
                    name="footfallGoal"
                    value={form.footfallGoal}
                    onChange={handleChange}
                    placeholder="Estimated Footfall"
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="pushNotification"
                      checked={form.pushNotification}
                      onChange={handleChange}
                    />
                    Push Notification Opt-in
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="reminderNotification"
                      checked={form.reminderNotification}
                      onChange={handleChange}
                    />
                    Reminder Notification
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="enableQiPoints"
                      checked={form.enableQiPoints}
                      onChange={handleChange}
                    />
                    Enable Qi Points for Engagement
                  </label>
                </section>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setModalOpen(false)}
                  type="button"
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editingData ? "Update Deal" : "Create Deal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete dialog */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Deal</h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.name}</strong>?
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

      <ToastContainer />
    </main>
  );
}
