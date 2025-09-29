import React, { useState, useEffect, useRef } from "react";
import { database, storage } from "../../firebase";
import {
  ref as dbRef,
  onValue,
  set,
  push,
  update,
  remove,
  off,
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

// ----- helpers -----
const toLocalInputValue = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
};
const fromLocalInputValue = (str) => (str ? new Date(str).getTime() : 0);

// combine a base date (ms) with a time string ("HH:mm" or "h:mm A") -> ms
const combineDateAndTimeMs = (baseMs, timeStr) => {
  if (!baseMs || !timeStr) return 0;
  const base = dayjs(baseMs);
  const candidate = dayjs(
    `${base.format("YYYY-MM-DD")} ${timeStr}`,
    ["YYYY-MM-DD HH:mm", "YYYY-MM-DD H:mm", "YYYY-MM-DD h:mm A"],
    true
  );
  return candidate.isValid() ? candidate.valueOf() : 0;
};

export default function UniclubPage({ navbarHeight }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Sorting + Filters
  const [sortConfig, setSortConfig] = useState({ key: "title", direction: "asc" });
  const [filters, setFilters] = useState({ title: "" });
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

  // Auth
  const uid = useSelector((s) => s.auth?.user?.uid);
  const emp = useSelector((s) => s.auth?.employee);

  // File input
  const [fileName, setFileName] = useState("No file chosen");
  const [previewUrl, setPreviewUrl] = useState("");

  // Form
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
    endTimeStr: "",      
    endAtMs: 0,          
    imageFile: null,      
    imageUrl: "",         
  };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    getList();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig]);

  const getList = () => {
    setIsLoading(true);
    const ref = dbRef(database, "uniclubs/");
    const handler = (snap) => {
      const val = snap.val();
      const arr = val ? Object.entries(val).map(([id, v]) => ({ id, ...v })) : [];
      setList(arr);
      setIsLoading(false);
    };
    onValue(ref, handler, { onlyOnce: false });
    return () => off(ref, "value", handler);
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
    return true;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      // compute endAtMs from endTimeStr (may be empty)
      let startAtMs = form.startAtMs || 0;
      let endAtMs = form.endAtMs || 0;
      if (startAtMs && form.endTimeStr) {
        endAtMs = combineDateAndTimeMs(startAtMs, form.endTimeStr);
        // if end time appears before start, assume next day
        if (endAtMs && endAtMs < startAtMs) endAtMs = dayjs(endAtMs).add(1, "day").valueOf();
      }

      // image upload
      let imageUrl = form.imageUrl || "";
      const isNewImage = form.imageFile instanceof File;
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
        uid: emp?.uid || "",
        displayName: (emp?.firstName || "") + (emp?.lastName ? ` ${emp.lastName}` : ""),
        photoURL: emp?.photoURL || "",
      };

      // strip undefined so we don't overwrite createdAt on edit with undefined
      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      if (editingData?.id) {
        await update(dbRef(database, `uniclubs/${editingData.id}`), payload);
        toast.success("Uniclub updated successfully!");
      } else {
        const newRef = push(dbRef(database, "uniclubs/"));
        const withId = { ...payload, id: newRef.key };
        await set(newRef, withId);
        toast.success("Uniclub created successfully");
      }
    } catch (error) {
      console.error("Error saving uniclubs:", error);
      toast.error("Failed to save uniclubs.");
    }

    getList();
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
    setPreviewUrl("");
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

  // ---------- Filter + Sort + Paginate ----------
  const filteredData = list.filter((g) => {
    const titleOK = !filters.title || (g.title || "").toLowerCase().includes(filters.title.toLowerCase());
    return titleOK;
  });

  const sortedData = [...filteredData].sort((a, b) => {
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
                  { key: "location", label: "Location" },
                  { key: "when", label: "When", sortable: false },
                  { key: "desc", label: "Description" },
                  { key: "actions", label: "Action", sortable: false },
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
                <th className="px-6 pb-3" />
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
                  const whenLabel = item.startAtMs
                    ? `${dayjs(item.startAtMs).format("DD MMM, h:mm A")}${
                        item.endAtMs ? ` – ${dayjs(item.endAtMs).format("h:mm A")}` : ""
                      }`
                    : item.date || item.time
                    ? `${item.date || ""}${item.time ? ` • ${item.time}${item.endAt ? ` – ${item.endAt}` : ""}` : ""}`
                    : "-";

                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.location || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{whenLabel}</td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-normal break-words max-w-xs">
                        {item.desc}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => {
                              setEditing(item);
                              setForm({
                                ...initialForm,
                                ...item,
                                // normalize legacy fields into the new form keys
                                imageFile: null,
                                imageUrl: item.image || "",
                                startAtMs: item.startAtMs || 0,
                                endTimeStr: item.endAt ? dayjs(item.endAt, ["h:mm A"], true).isValid() ? dayjs(item.endAt, "h:mm A").format("HH:mm") : "" : "",
                              });
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
        <p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p>
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

                {/* Location */}
                <input
                  type="text"
                  name="location"
                  placeholder="Location"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.location}
                  onChange={handleChange}
                />

                {/* When */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">When</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="datetime-local"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={toLocalInputValue(form.startAtMs)}
                      onChange={(e) => setForm((p) => ({ ...p, startAtMs: fromLocalInputValue(e.target.value) }))}
                    />
                    <input
                      type="time"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={form.endTimeStr}
                      onChange={(e) => setForm((p) => ({ ...p, endTimeStr: e.target.value }))}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Tip: End time is on the same day by default; if it’s earlier than start, we roll it to the next day.</p>
                </div>

                {/* Links */}
                <div>
                  <h3 className="text-sm font-semibold mb-1">Links</h3>
                  <input
                    type="url"
                    name="website"
                    placeholder="Website (https://…)"
                    className="w-full border border-gray-300 p-2 rounded mb-2"
                    value={form.website}
                    onChange={handleChange}
                    autoCapitalize="none"
                  />
                  <input
                    type="url"
                    name="link"
                    placeholder="External Link (Instagram/WhatsApp/Telegram/etc.)"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.link}
                    onChange={handleChange}
                    autoCapitalize="none"
                  />
                </div>

                {/* Contact */}
                <div>
                  <h3 className="text-sm font-semibold mb-1">Contact</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      name="contactName"
                      placeholder="Contact name"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={form.contactName}
                      onChange={handleChange}
                    />
                    <input
                      type="tel"
                      name="contactPhone"
                      placeholder="Phone"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={form.contactPhone}
                      onChange={handleChange}
                    />
                    <input
                      type="email"
                      name="contactEmail"
                      placeholder="Email"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={form.contactEmail}
                      onChange={handleChange}
                      autoCapitalize="none"
                    />
                  </div>
                </div>

                {/* Logo */}
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">Upload Logo</h2>
                  <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        name="image"
                        accept="image/*"
                        className="hidden"
                        onChange={handleChange}
                      />
                      📁 Choose File
                    </label>
                    <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
                  </div>
                  {(previewUrl || form.imageUrl) && (
                    <img src={previewUrl || form.imageUrl} alt="Poster Preview" width="150" />
                  )}
                </section>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
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
