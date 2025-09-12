import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc, getDoc,
  query, where, writeBatch
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import * as XLSX from "xlsx";
import tutorialscheduleFile from "../../assets/excel/tutorial_schedule.xlsx";

export default function TutorialSchedulePage(props) {
  const { navbarHeight } = props;

  // ---------- Modal & CRUD state ----------
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // ---------- Data ----------
  const [list, setList] = useState([]);
  const [fileName, setFileName] = useState("No file chosen");
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  // ---------- Week controls (anchor = today; no date input in UI) ----------
  const [weekMode, setWeekMode] = useState("current"); // 'past' | 'current' | 'future'
  const anchorDate = new Date().toISOString().split("T")[0]; // yyyy-mm-dd

  const addDays = (d, days) => {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + days);
    return nd;
  };
  const fmt = (x) => x.toISOString().split("T")[0];

  const getWeekRange = (dateStr, mode = "current") => {
    const base = new Date(dateStr);
    const offsetDays = mode === "past" ? -7 : mode === "future" ? 7 : 0;
    const anchor = addDays(base, offsetDays);
    const day = anchor.getDay(); // 0=Sun
    const diffToMonday = anchor.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(anchor.setDate(diffToMonday));
    const sunday = addDays(monday, 6);
    return { start: fmt(monday), end: fmt(sunday), label: `${fmt(monday)} → ${fmt(sunday)}` };
  };

  // ---------- Filters + sorting ----------
  const [filters, setFilters] = useState({ roomtype: "", hall: "", day: "", time: "" });
  const [sortConfig, setSortConfig] = useState({ key: "roomtype", direction: "asc" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setFilters((p) => ({ ...p, [field]: value })), 250);
  };
  const onSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );
  };

  // ---------- Pagination ----------
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // ---------- Row selection ----------
  const [selectedIds, setSelectedIds] = useState(new Set());
  const headerCheckboxRef = useRef(null);

  const initialForm = { id: 0, roomtype: "", time: "", hall: "", day: "", date: "", empname: "" };
  const [form, setForm] = useState(initialForm);

  const getDayFromDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  // ---------- Load list (hostel scoped) ----------
  const getList = async () => {
    if (!emp?.hostelid) return;
    setIsLoading(true);
    try {
      // Note: Week mode UI shown, but backend query is hostel-wide (same as your Cleaning page).
      // If you want actual week filtering, add where("date", ">=", start) / where("date","<=", end)
      const qy = query(collection(db, "tutorialschedule"), where("hostelid", "==", emp.hostelid));
      const snapshot = await getDocs(qy);
      const documents = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      // stable sort: date -> time
      documents.sort((a, b) => {
        const dcmp = (a.date || "").localeCompare(b.date || "");
        if (dcmp !== 0) return dcmp;
        return (a.time || "").localeCompare(b.time || "");
      });
      setList(documents);
      setSelectedIds(new Set());
      setCurrentPage(1);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load tutorial schedules");
    } finally {
      setIsLoading(false);
    }
  };

  // initial load
  useEffect(() => { getList(); /* eslint-disable-next-line */ }, [emp?.hostelid]);

  // keep pagination sane on filter/sort change
  useEffect(() => { setCurrentPage(1); }, [filters, sortConfig]);

  // ---------- Add / Update ----------
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.roomtype) return;

    try {
      if (editingData) {
        const docRef = doc(db, "tutorialschedule", form.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) { toast.warning("Tutorial schedule does not exist!"); return; }

        await updateDoc(docRef, {
          uid,
          roomtype: form.roomtype,
          hall: form.hall,
          day: form.day,
          time: form.time,
          date: form.date,
          empname: form.empname,
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        await addDoc(collection(db, "tutorialschedule"), {
          uid,
          roomtype: form.roomtype,
          hall: form.hall,
          day: form.day,
          time: form.time,
          date: form.date,
          empname: form.empname,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
      }
      getList();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }

    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  // ---------- Delete ----------
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, "tutorialschedule", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  // ---------- Excel ingest ----------
  const readExcel = (file) => {
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const cleanedData = jsonData.map((row) => {
        const date =
          typeof row.Date === "number"
            ? XLSX.SSF.format("yyyy-mm-dd", row.Date)
            : new Date(row.Date).toISOString().split("T")[0];

        return {
          roomtype: row["Room Type"] || "",
          hall: row["Hall"] || "",
          day: row["Day"] || "",
          time: row["Time"] || "",
          date,
          empname: row["Name"] || "", // will be "" if sheet has no Name column
          hostelid: emp.hostelid,
        };
      });

      setData(cleanedData);
      setIsLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  const saveToFirebase = async () => {
    setIsLoading(true);
    try {
      for (const entry of data) {
        const qy = query(
          collection(db, "tutorialschedule"),
          where("roomtype", "==", entry.roomtype),
          where("date", "==", entry.date),
          where("hall", "==", entry.hall),
          where("hostelid", "==", emp.hostelid)
        );
        const qs = await getDocs(qy);
        if (!qs.empty) {
          toast.warn(`Duplicate: ${entry.roomtype} on ${entry.date} in ${entry.hall}. Skipping...`);
          continue;
        }
        await addDoc(collection(db, "tutorialschedule"), { ...entry, createdBy: uid, createdDate: new Date() });
      }

      toast.success("Tutorial schedule saved (duplicates skipped)!");
      getList();
      setFileName("No file chosen");
      setData([]);
    } catch (error) {
      console.error("Error saving data: ", error);
      toast.error("Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    const response = await fetch(tutorialscheduleFile);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "tutorial_schedule.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ---------- Bulk delete ----------
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} Tutorial schedule(s)?`)) return;

    setIsLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const chunkSize = 450;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, "tutorialschedule", id)));
        await batch.commit();
      }
      toast.success("Selected schedules deleted");
      setSelectedIds(new Set());
      getList();
    } catch (err) {
      console.error(err);
      toast.error("Bulk delete failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- Derive filtered/sorted/paginated ----------
  const filteredData = list.filter((r) => {
    const rt = (r.roomtype || "").toLowerCase();
    const hl = (r.hall || "").toLowerCase();
    const dy = (r.day || "").toLowerCase();
    const tm = (r.time || "").toLowerCase();
    return (
      (!filters.roomtype || rt.includes(filters.roomtype.toLowerCase())) &&
      (!filters.hall || hl.includes(filters.hall.toLowerCase())) &&
      (!filters.day || dy.includes(filters.day.toLowerCase())) &&
      (!filters.time || tm.includes(filters.time.toLowerCase()))
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const key = sortConfig.key;
    const va = (a[key] || "").toString().toLowerCase();
    const vb = (b[key] || "").toString().toLowerCase();
    return va.localeCompare(vb) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageIds = paginatedData.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const { label: weekLabel } = getWeekRange(anchorDate, weekMode);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Tutorial Schedule</h1>
          <div className="text-xs text-gray-500 mt-1">Week: {weekLabel}</div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Week toggle only (no date input) */}
          <div className="flex items-center gap-2">
            {["past", "current", "future"].map((k) => {
              const active = weekMode === k;
              return (
                <button
                  key={k}
                  onClick={() => setWeekMode(k)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    active ? "bg-black text-white border-black" : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              );
            })}
          </div>

          <button className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition" onClick={handleDownload}>
            Download Excel File
          </button>

          <div className="flex items-center gap-4 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files.length > 0) setFileName(e.target.files[0].name);
                  else setFileName("No file chosen");
                  const file = e.target.files[0];
                  if (file) readExcel(file);
                }}
              />
              📁 Choose File
            </label>
            <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
          </div>

          <button
            className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
            disabled={!data.length || isLoading}
            onClick={saveToFirebase}
          >
            Upload Excel
          </button>

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
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          <button onClick={handleBulkDelete} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
            Delete selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set(sortedData.map((r) => r.id)))}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Select all ({sortedData.length})
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 bg-gray-200 rounded text-sm">
            Clear selection
          </button>
        </div>
      )}

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
                  { key: "roomtype", label: "Room Type" },
                  { key: "hall", label: "Hall" },
                  { key: "day", label: "Day" },
                  { key: "time", label: "Time" },
                  { key: "empname", label: "Name" },
                  { key: "actions", label: "Actions", sortable: false },
                  { key: "select", label: "", sortable: false },
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

              {/* Row 2: filter inputs */}
              <tr className="border-t border-gray-2 00">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Filter room type"
                    defaultValue={filters.roomtype}
                    onChange={(e) => setFilterDebounced("roomtype", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Filter hall"
                    defaultValue={filters.hall}
                    onChange={(e) => setFilterDebounced("hall", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Filter day"
                    defaultValue={filters.day}
                    onChange={(e) => setFilterDebounced("day", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Filter time"
                    defaultValue={filters.time}
                    onChange={(e) => setFilterDebounced("time", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  {/* Name filter (optional; reuse roomtype filter style) */}
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Filter name"
                    onChange={(e) => setFilterDebounced("empname", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3">
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allPageSelected}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) pageIds.forEach((id) => next.add(id));
                        else pageIds.forEach((id) => next.delete(id));
                        return next;
                      });
                    }}
                  />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                    No matching schedules found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.roomtype}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.hall}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.day}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.time}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.empname || "-"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
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

      {/* Add/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit Tutorial Schedule" : "Add Tutorial Schedule"}</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-2">
                <label className="block font-medium mb-1">Room Type</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.roomtype}
                  onChange={(e) => setForm({ ...form, roomtype: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Hall</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.hall}
                  onChange={(e) => setForm({ ...form, hall: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.date}
                  onChange={(e) => {
                    const selectedDate = e.target.value;
                    const day = getDayFromDate(selectedDate);
                    setForm((prev) => ({ ...prev, date: selectedDate, day }));
                  }}
                  required
                />
                <label className="block font-medium mb-1">Day</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Time</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Name</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.empname}
                  onChange={(e) => setForm({ ...form, empname: e.target.value })}
                  required
                />
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Tutorial Schedule</h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>
                {deleteData?.roomtype} / {deleteData?.hall} ({deleteData?.day} {deleteData?.time})
              </strong>
              ?
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

      <ToastContainer />
    </main>
  );
}
