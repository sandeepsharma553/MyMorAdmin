import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, setDoc, serverTimestamp
} from "firebase/firestore"; // ✅ setDoc, serverTimestamp added
import { db, storage } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import dayjs from "dayjs";
import { useReactToPrint } from "react-to-print";

export default function ReportIncidentPage(props) {
  const { navbarHeight } = props;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [fileName, setFileName] = useState("No file chosen");
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [viewData, setViewData] = useState(null);

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  // Filters & sorting
  const [filters, setFilters] = useState({
    report: "",
    user: "",
    type: "",
    date: "",
    status: "All",
  });
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setFilters((p) => ({ ...p, [field]: value })),
      250
    );
  };
  const onSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  useEffect(() => { setCurrentPage(1); }, [filters, sortConfig]);

  const initialForm = {
    id: 0,
    incidenttype: "",
    other: "",
    description: "",
    datetime: "",
    isreport: false,
    image: null,
    hostelid: "",
    status: "Pending",
  };
  const [form, setForm] = useState(initialForm);

  const contentRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef });

  useEffect(() => {
    getList();
  }, []);

  // ✅ NEW: Page open par reportincident badge reset
  useEffect(() => {
    const doReset = async () => {
      if (!uid) return;
      const refDoc = doc(db, "adminMenuState", uid, "menus", "reportincident");
      await setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
    };
    doReset();
  }, [uid]);

  const getList = async () => {
    setIsLoading(true);

    // uid -> username map
    const usersQuery = query(
      collection(db, "users"),
      where("hostelid", "==", emp.hostelid)
    );
    const usersSnap = await getDocs(usersQuery);
    const userMap = {};
    usersSnap.forEach((d) => {
      const data = d.data();
      const username = data.username || data.UserName || data.USERNAME || "Unknown";
      userMap[data.uid] = username;
    });

    // incidents  (collection: repotincident)
    const repotincidentQuery = query(
      collection(db, "repotincident"),
      where("hostelid", "==", emp.hostelid)
    );
    const repotincidentSnapshot = await getDocs(repotincidentQuery);
    const rows = repotincidentSnapshot.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        ...data,
        username: userMap[data.uid] || "",
      };
    });

    setList(rows);
    setIsLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.incidenttype) return;

    setIsLoading(true);
    let imageUrl = "";

    if (form.image) {
      const imageRef = ref(storage, `repotincident/${Date.now()}_${form.image.name}`);
      await uploadBytes(imageRef, form.image);
      imageUrl = await getDownloadURL(imageRef);
    }

    try {
      if (editingData) {
        const docRef = doc(db, "repotincident", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("Report does not exist! Cannot update.");
          setIsLoading(false);
          return;
        }
        await updateDoc(docRef, {
          uid,
          incidenttype: form.incidenttype === "Other" ? form.other : form.incidenttype,
          description: form.description,
          datetime: form.datetime,
          isreport: form.isreport,
          ...(imageUrl && { imageUrl }), // keep old image if not replaced
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),          // human-readable
          updatedAt: serverTimestamp(),     // ✅ machine (badge)
          status: form.status || "Pending",
        });
        toast.success("Successfully updated");
      } else {
        await addDoc(collection(db, "repotincident"), {
          uid,
          incidenttype: form.incidenttype === "Other" ? form.other : form.incidenttype,
          description: form.description,
          datetime: form.datetime,
          isreport: form.isreport,
          imageUrl,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),          // human-readable
          createdAt: serverTimestamp(),     // ✅ machine (badge)
          status: "Pending",
        });
        toast.success("Successfully saved");
      }
      getList();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }

    setIsLoading(false);
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "repotincident", deleteData.id)); // ✅ collection fixed
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const openView = (row) => {
    setViewData(row);
    setViewModalOpen(true);
  };

  const updateStatus = async (id, newStatus) => {
    try {
      const requestRef = doc(db, "repotincident", id);
      await updateDoc(requestRef, { status: newStatus });
      toast.success("Status updated!");
      getList();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status.");
    }
  };

  // ---------- Derive filtered/sorted/paginated ----------
  const fmtDate = (dt) =>
    dt?.seconds !== undefined ? dayjs(dt.seconds * 1000).format("YYYY-MM-DD") : dayjs(dt).format("YYYY-MM-DD");

  const filtered = list.filter((r) => {
    const repStr = `${r.id || ""} ${r.uid || ""}`.toLowerCase();
    const userStr = (r.username || "").toLowerCase();
    const typeStr = (r.incidenttype || "").toLowerCase();
    const dateStr = (fmtDate(r.datetime) || "").toLowerCase();
    const statusOK = filters.status === "All" || (r.status || "").toLowerCase() === filters.status.toLowerCase();

    return (
      (!filters.report || repStr.includes(filters.report.toLowerCase())) &&
      (!filters.user || userStr.includes(filters.user.toLowerCase())) &&
      (!filters.type || typeStr.includes(filters.type.toLowerCase())) &&
      (!filters.date || dateStr.includes(filters.date.toLowerCase())) &&
      statusOK
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    switch (sortConfig.key) {
      case "report": {
        const av = (a.id || a.uid || "").toString();
        const bv = (b.id || b.uid || "").toString();
        return av.localeCompare(bv) * dir;
      }
      case "user":
        return ((a.username || "").localeCompare(b.username || "")) * dir;
      case "type":
        return ((a.incidenttype || "").localeCompare(b.incidenttype || "")) * dir;
      case "date": {
        const ad = a.datetime?.seconds !== undefined ? a.datetime.seconds * 1000 : Date.parse(a.datetime || 0) || 0;
        const bd = b.datetime?.seconds !== undefined ? b.datetime.seconds * 1000 : Date.parse(b.datetime || 0) || 0;
        return (ad - bd) * dir;
      }
      case "status":
        return ((a.status || "").localeCompare(b.status || "")) * dir;
      default:
        return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginatedData = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Report Incident</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPrintModalOpen(true)}
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          >
            Print
          </button>
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => { setEditing(null); setForm(initialForm); setModalOpen(true); }}
          >
            + Add
          </button>
        </div>
      </div>

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
                  // { key: "report", label: "Report ID" },
                  { key: "user", label: "Submitted by" },
                  { key: "type", label: "Incident Type" },
                  { key: "date", label: "Date Submitted" },
                  { key: "status", label: "Status" },
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

              {/* Row 2: filter controls */}
              <tr className="border-t border-gray-200">
                {/* <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="id / uid"
                    defaultValue={filters.report}
                    onChange={(e) => setFilterDebounced("report", e.target.value)}
                  />
                </th> */}
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="user"
                    defaultValue={filters.user}
                    onChange={(e) => setFilterDebounced("user", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="type"
                    defaultValue={filters.type}
                    onChange={(e) => setFilterDebounced("type", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="YYYY-MM or date"
                    defaultValue={filters.date}
                    onChange={(e) => setFilterDebounced("date", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <select
                    className="w-full border border-gray-300 p-1 rounded text-sm bg-white"
                    value={filters.status}
                    onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option>All</option>
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Resolved</option>
                    <option>Closed</option>
                  </select>
                </th>
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.uid}</td> */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.incidenttype}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {fmtDate(item.datetime)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-white text-xs font-semibold
                            ${item.status === "Pending" ? "bg-yellow-500"
                              : item.status === "In Progress" ? "bg-blue-500"
                                : item.status === "Resolved" ? "bg-green-500"
                                  : item.status === "Closed" ? "bg-gray-500"
                                    : "bg-red-500"
                            }`}
                        >
                          {item.status || "Pending"}
                        </span>
                      </div>

                      {item.status !== "Resolved" && item.status !== "Closed" && (
                        <select
                          value={item.status || "Pending"}
                          onChange={(e) => updateStatus(item.id, e.target.value)}
                          className="w-full border border-gray-300 p-1 rounded text-xs bg-white focus:outline-none"
                        >
                          <option value="">Update Status</option>
                          {item.status !== "Pending" && <option value="Pending">Pending</option>}
                          {item.status !== "In Progress" && <option value="In Progress">In Progress</option>}
                          <option value="Resolved">Resolved</option>
                          <option value="Closed">Closed</option>
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        onClick={() => openView(item)}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        View
                      </button>
                      <p />
                      <button
                        onClick={() => openView(item)}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        Print
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

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Incident Type</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.incidenttype}
                  onChange={(e) => setForm({ ...form, incidenttype: e.target.value })}
                  required
                >
                  <option value="">select</option>
                  <option value="Harassment">Harassment</option>
                  <option value="Discrimination">Discrimination</option>
                  <option value="Bullying">Bullying</option>
                  <option value="Other">Other</option>
                </select>

                {form.incidenttype === "Other" && (
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.other}
                    onChange={(e) => setForm({ ...form, other: e.target.value })}
                    required
                  />
                )}

                <label className="block font-medium mb-1">Describe the incident</label>
                <textarea
                  className="w-full border border-gray-300 p-2 rounded"
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />

                <label className="block font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.datetime}
                  onChange={(e) => setForm({ ...form, datetime: e.target.value })}
                  required
                />

                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .jpg,.png"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files.length > 0) setFileName(e.target.files[0].name);
                        else setFileName("No file chosen");
                        if (e.target.files[0]) setForm({ ...form, image: e.target.files[0] });
                      }}
                    />
                    📁 Choose File
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">
                    {fileName}
                  </span>
                </div>
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
                  Save
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Report</h2>
            <p className="mb-4">
              Are you sure you want to delete this incident report?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }}
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

      {/* View/Print modal */}
      {viewModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Incident Report</h2>

            <div ref={contentRef} className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="font-medium">User:</span>
                <span>{viewData?.username}</span>

                <span className="font-medium">Incident Type:</span>
                <span>{viewData?.incidenttype}</span>

                <span className="font-medium">Description:</span>
                <span className="col-span-1">{viewData?.description}</span>

                <span className="font-medium">Date:</span>
                <span>{fmtDate(viewData?.datetime)}</span>
              </div>

              {viewData?.imageUrl && (
                <img
                  src={viewData.imageUrl}
                  alt="uploaded"
                  className="mt-4 w-[250px] h-[250px] object-cover rounded-lg border"
                />
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
              <button
                onClick={() => handlePrint()}
                className="px-4 py-2 bg-black text-white rounded hover:bg-black"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-all modal */}
      {printModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div ref={contentRef}>
              <h2 className="text-xl font-bold mb-4">Incident Reports</h2>
              <table className="min-w-full text-sm border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2">User</th>
                    <th className="border p-2">Incident Type</th>
                    <th className="border p-2">Description</th>
                    <th className="border p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, idx) => (
                    <tr key={idx} className="odd:bg-white even:bg-gray-50">
                      <td className="border p-2">{item.username}</td>
                      <td className="border p-2">{item.incidenttype}</td>
                      <td className="border p-2">{item.description}</td>
                      <td className="border p-2">{fmtDate(item.datetime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
