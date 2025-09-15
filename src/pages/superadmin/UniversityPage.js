import React, { useState, useEffect, useMemo } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import LocationPicker from "./LocationPicker";

const pageSize = 10;

const initialForm = {
  id: "",
  name: "",
  campus: "",
  domain: "",
  studomain: "",
  // new fields from LocationPicker
  countryCode: "",
  countryName: "",
  stateCode: "",
  stateName: "",
  cityName: "",
  lat: null,
  lng: null,
};

export default function UniversityPage(props) {
  const uid = useSelector((state) => state.auth.user.uid);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [form, setForm] = useState(initialForm);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = useMemo(
    () => list.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [list, currentPage]
  );

  useEffect(() => {
    getList();
  }, []);

  const getList = async () => {
    try {
      setIsLoading(true);
      const qs = await getDocs(collection(db, "university"));
      const documents = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      setList(documents);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load universities");
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.warn("Name is required");
      return;
    }

    const payload = {
      uid,
      name: form.name?.trim(),
      campus: form.campus?.trim() || "",
      domain: form.domain?.trim() || "",
      studomain: form.studomain?.trim() || "",
      // new location fields
      countryCode: form.countryCode || "",
      countryName: form.countryName || "",
      stateCode: form.stateCode || "",
      stateName: form.stateName || "",
      cityName: form.cityName || "",
      lat: typeof form.lat === "number" ? form.lat : null,
      lng: typeof form.lng === "number" ? form.lng : null,
    };

    try {
      if (editingData) {
        // update
        const docRef = doc(db, "university", form.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          toast.warning("University does not exist! Cannot update.");
          return;
        }
        await updateDoc(docRef, {
          ...payload,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        // prevent duplicate by name (optional: also include campus)
        const qy = query(collection(db, "university"), where("name", "==", payload.name));
        const exists = await getDocs(qy);
        if (!exists.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "university"), {
          ...payload,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
      }

      await getList();
      setModalOpen(false);
      resetForm();
    } catch (error) {
      console.error("Error saving/updating:", error);
      toast.error("Failed to save");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "university", deleteData.id)); // fixed: use deleteData.id
      toast.success("Successfully deleted!");
      await getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Failed to delete");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const openAdd = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      id: item.id,
      name: item.name || "",
      campus: item.campus || "",
      domain: item.domain || "",
      studomain: item.studomain || "",
      countryCode: item.countryCode || "",
      countryName: item.countryName || "",
      stateCode: item.stateCode || "",
      stateName: item.stateName || "",
      cityName: item.cityName || "",
      lat: typeof item.lat === "number" ? item.lat : null,
      lng: typeof item.lng === "number" ? item.lng : null,
    });
    setModalOpen(true);
  };

  const formatLocation = (row) => {
    const parts = [row.cityName, row.stateName, row.countryName].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={openAdd}
        >
          + Add
        </button>
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
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">University</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Campus</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                    No universities found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span>{formatLocation(item)}</span>
                        {/* {typeof item.lat === "number" && typeof item.lng === "number" ? (
                          <span className="text-gray-500 text-xs">
                            {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                          </span>
                        ) : null} */}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.campus || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => openEdit(item)}
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

      {/* Pager */}
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
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit University" : "Add University"}</h2>

            <form onSubmit={handleAdd} className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              <LocationPicker
                key={form.id || 'new'}
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

                  setForm(prev => {
                    const same =
                      prev.countryCode === next.countryCode &&
                      prev.countryName === next.countryName &&
                      prev.stateCode === next.stateCode &&
                      prev.stateName === next.stateName &&
                      prev.cityName === next.cityName &&
                      prev.lat === next.lat &&
                      prev.lng === next.lng;

                    return same ? prev : { ...prev, ...next };
                  });
                }}
              />

              <input
                type="text"
                placeholder="Location (optional display text)"
                className="w-full border border-gray-300 p-2 rounded"
                value={
                  form.cityName
                    ? `${form.cityName}${form.stateName ? ", " + form.stateName : ""}${form.countryName ? ", " + form.countryName : ""
                    }`
                    : ""
                }
                onChange={() => { }}
                readOnly
              />

              <input
                type="text"
                placeholder="Campus"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.campus}
                onChange={(e) => setForm({ ...form, campus: e.target.value })}
              />

              <input
                type="text"
                placeholder="University Domain"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                required
              />

              <input
                type="text"
                placeholder="Student Domain"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.studomain}
                onChange={(e) => setForm({ ...form, studomain: e.target.value })}
              />

              {/* Lat/Lng preview (read-only) */}
              <div className="text-xs text-gray-600">
                {typeof form.lat === "number" && typeof form.lng === "number"
                  ? `Coordinates: ${form.lat.toFixed(6)}, ${form.lng.toFixed(6)}`
                  : "Coordinates: —"}
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    resetForm();
                  }}
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete University</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
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
