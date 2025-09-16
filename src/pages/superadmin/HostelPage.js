import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { MenuItem, Select, Checkbox, ListItemText } from "@mui/material";
import LocationPicker from "./LocationPicker";

const DEFAULT_FEATURES = {
  events: false,
  eventbooking: false,
  deals: false,
  announcement: false,
  hostelevent: false,
  diningmenu: false,
  cleaningschedule: false,
  tutorialschedule: false,
  maintenance: false,
  bookingroom: false,
  academicgroup: false,
  reportincedent: false,
  feedback: false,
  wellbeing: false,
  faqs: false,
  resource: false,
  poi: false,
  community: false,
  employee: false,
  student: false,
};

const pageSize = 10;

const initialForm = {
  id: "",
  name: "",
  uniIds: [],
  location: "",
  features: { ...DEFAULT_FEATURES },
  active: true,
  disabledReason: "",

  countryCode: "",
  countryName: "",
  stateCode: "",
  stateName: "",
  cityName: "",
  lat: null,
  lng: null,
};

const HostelPage = () => {
  const uid = useSelector((state) => state.auth.user.uid);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toggleItem, setToggleItem] = useState(null);
  const [form, setForm] = useState(initialForm);

  // keep a mounted flag to avoid state updates on unmounted
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = useMemo(
    () => list.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [list, currentPage]
  );

  useEffect(() => {
    getList();
  }, []);

  // If list shrinks, keep currentPage in bounds
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
    setUniversities([]); // clear the dropdown until a country is picked
  };

  const getList = async () => {
    setIsLoading(true);
    try {
      const [uniSnap, hostelSnap] = await Promise.all([
        getDocs(collection(db, "university")),
        getDocs(collection(db, "hostel")),
      ]);

      const uniArr = uniSnap.docs.map((d) => ({ id: d.id, name: d.data().name }));
      const uniMap = uniArr.reduce((acc, cur) => ((acc[cur.id] = cur.name), acc), {});

      const hostelArr = hostelSnap.docs.map((d) => {
        const data = d.data();
        const {
          name, uniIds = [], location, features,
          active = true, disabledReason, disabledAt,
          countryCode = "", countryName = "",
          stateCode = "", stateName = "",
          cityName = "", lat = null, lng = null,
        } = data;

        const universityNames = uniIds.map((id) => uniMap[id] ?? "Unknown");

        return {
          id: d.id,
          name,
          uniIds,
          universityNames,
          location: location || "",
          features: { ...DEFAULT_FEATURES, ...(features || {}) },
          active,
          disabledReason, disabledAt,
          countryCode, countryName, stateCode, stateName, cityName, lat, lng,
        };
      });

      if (mountedRef.current) setList(hostelArr);
    } catch (err) {
      console.error("getList error:", err);
      toast.error("Failed to load hostels");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // Fetch universities by country (and only touch state if mounted)
  const fetchUniversitiesByCountry = async (countryName) => {
    if (!countryName) {
      setUniversities([]);
      return;
    }
    setIsLoading(true);
    try {
      const qy = query(collection(db, "university"), where("countryName", "==", countryName));
      const uniSnap = await getDocs(qy);
      const uniArr = uniSnap.docs.map((d) => ({ id: d.id, name: d.data().name }));
      if (mountedRef.current) setUniversities(uniArr); // [] if none
    } catch (err) {
      console.error("fetchUniversitiesByCountry error:", err);
      toast.error("Failed to load universities");
      if (mountedRef.current) setUniversities([]);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };
  useEffect(() => {
    if (modalOpen && form.countryName) {
      fetchUniversitiesByCountry(form.countryName);
    }
  }, [modalOpen]);

  const handleAdd = async (e) => {
    e.preventDefault();

    const rawName = form.name?.trim();
    if (!rawName) return toast.warn("Please enter a hostel name");
    if (!Array.isArray(form.uniIds) || form.uniIds.length === 0) {
      return toast.warn("Please select at least one university");
    }

    const featuresToSave = { ...DEFAULT_FEATURES, ...(form.features || {}) };

    const payload = {
      uid,
      name: rawName,
      // unique uniIds
      uniIds: [...new Set(form.uniIds)],
      location: form.location?.trim() || "",
      features: featuresToSave,
      active: !!form.active, // respect the current form
      disabledReason: null,
      disabledAt: null,

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
        const docRef = doc(db, "hostel", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warn("Hostel does not exist! Cannot update.");
          return;
        }
        await updateDoc(docRef, {
          ...payload,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        // Avoid creating another doc with the same name linked to overlapping uniIds
        const qy = query(collection(db, "hostel"), where("name", "==", rawName));
        const qs = await getDocs(qy);

        const occupied = new Set();
        qs.docs.forEach((d) => {
          const data = d.data();
          if (Array.isArray(data.uniIds)) data.uniIds.forEach((u) => occupied.add(u));
        });

        const toAddUniIds = payload.uniIds.filter((u) => !occupied.has(u));
        const skippedUniIds = payload.uniIds.filter((u) => occupied.has(u));
        if (toAddUniIds.length === 0) {
          toast.warn("All selected universities are already linked to this hostel name.");
          return;
        }

        await addDoc(collection(db, "hostel"), {
          ...payload,
          uniIds: toAddUniIds,
          createdBy: uid,
          createdDate: new Date(),
        });

        if (skippedUniIds.length) {
          const idToName = (id) => universities.find((u) => u.id === id)?.name || id;
          toast.info(`Skipped (already linked): ${skippedUniIds.map(idToName).join(", ")}`);
        }

        toast.success("Successfully saved");
      }

      await getList();
      setModalOpen(false);
      resetForm();
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong.");
    }
  };

  const handleFeatureChange = (e) => {
    const { name, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      features: { ...prev.features, [name]: checked },
    }));
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      const hostelRef = doc(db, "hostel", deleteData.id);
      const hostelSnap = await getDoc(hostelRef);
      if (!hostelSnap.exists()) {
        toast.warn("Hostel not found!");
        return;
      }
      const hostelData = hostelSnap.data();
      if (hostelData.adminUID) {
        toast.warn("Cannot delete hostel. Admin already assigned.");
        return;
      }
      await deleteDoc(hostelRef);
      toast.success("Successfully deleted!");
      await getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Failed to delete");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const handleDisableHostel = async (item) => {
    if (!item?.id) return;
    const reason = "Temporarily disabled by admin";
    try {
      setIsLoading(true);
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/disableHostelAndLockEmployees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostelid: item.id, reason, excludeUids: [uid] }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to disable hostel");
      toast.success(`Hostel disabled.`);
      await getList();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to disable & lock employees");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableHostel = async (item) => {
    if (!item?.id) return;
    const reason = "Operations resumed";
    try {
      setIsLoading(true);
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/enableHostelAndEmployees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostelid: item.id, reason, excludeUids: [uid] }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to enable hostel");
      toast.success(`Hostel enabled.`);
      await getList();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to enable & unlock employees");
    } finally {
      setIsLoading(false);
    }
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      id: item.id,
      name: item.name || "",
      uniIds: item.uniIds || [],
      location: item.location || "",
      features: { ...DEFAULT_FEATURES, ...(item.features || {}) },
      active: item.active !== false,
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
    return parts.length ? parts.join(", ") : row.location || "—";
  };

  const renderSelectedUniversities = (selected) => {
    if (!selected?.length) return "Select University";
    const names = selected
      .map((id) => universities.find((u) => u.id === id)?.name || "")
      .filter(Boolean);
    return names.length ? names.join(", ") : `${selected.length} selected`;
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Hostel</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => { resetForm(); setModalOpen(true); }}
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hostel</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">University</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                    No matching hostels found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <ul className="list-disc list-inside space-y-1">
                        {item.universityNames.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span>{formatLocation(item)}</span>
                        {/* Show coords if needed:
                        {typeof item.lat === "number" && typeof item.lng === "number" ? (
                          <span className="text-gray-500 text-xs">
                            {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                          </span>
                        ) : null} */}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {item.active ? (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800">Active</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-700">Disabled</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        className={item.active ? "text-red-600 hover:underline mr-3" : "text-green-600 hover:underline mr-3"}
                        onClick={() => { setToggleItem(item); setConfirmToggleOpen(true); }}
                      >
                        {item.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => { setDelete(item); setConfirmDeleteOpen(true); }}
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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit Hostel" : "Add New"}</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              {/* Location Picker drives universities list */}
              <LocationPicker
                key={form.id || "new"}
                value={{
                  countryCode: form.countryCode || "",
                  stateCode: form.stateCode || "",
                  cityName: form.cityName || "",
                }}
                onChange={(loc) => {
                  const next = {
                    countryCode: loc?.country?.code || "",
                    countryName: loc?.country?.name || "",
                    stateCode: loc?.state?.code || "",
                    stateName: loc?.state?.name || "",
                    cityName: loc?.city?.name || "",
                    lat: loc?.coords?.lat ?? null,
                    lng: loc?.coords?.lng ?? null,
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

                    return same ? prev : { ...prev, ...next, uniIds: [] }; 
                  });
                  fetchUniversitiesByCountry(loc?.country?.name || "");
                }}
              />

              {/* Optional display text (kept editable) */}
              <input
                type="text"
                placeholder="Location (optional display text)"
                className="w-full border border-gray-300 p-2 rounded"
                value={
                  form.location ||
                  (form.cityName
                    ? `${form.cityName}${form.stateName ? ", " + form.stateName : ""}${form.countryName ? ", " + form.countryName : ""}`
                    : "")
                }
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />

              {/* University multi-select, depends on picked country */}
              <Select
                className="w-full"
                multiple
                displayEmpty
                required
                value={form.uniIds}
                onChange={(e) => setForm({ ...form, uniIds: e.target.value })}
                renderValue={renderSelectedUniversities}
              >
                {universities.map(({ id, name }) => (
                  <MenuItem key={id} value={id}>
                    <Checkbox checked={form.uniIds.includes(id)} />
                    <ListItemText primary={name} />
                  </MenuItem>
                ))}
                {universities.length === 0 && (
                  <MenuItem disabled>
                    <ListItemText primary="No universities for the selected country" />
                  </MenuItem>
                )}
              </Select>

              {/* Features */}
              <fieldset style={{ marginTop: "20px" }}>
                <legend style={{ fontWeight: "bold", marginBottom: "10px" }}>Features</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", padding: "10px 0" }}>
                  {Object.keys(form.features).map((key) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="checkbox"
                        name={key}
                        checked={!!form.features[key]}
                        onChange={handleFeatureChange}
                      />
                      {key.charAt(0).toUpperCase() + key.slice(1)}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => { setModalOpen(false); resetForm(); }}
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Hostel</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
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

      {/* Enable/Disable confirm */}
      {confirmToggleOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">
              {toggleItem?.active ? "Disable Hostel" : "Enable Hostel"}
            </h2>
            <p className="mb-4">
              Are you sure you want to {toggleItem?.active ? "disable" : "enable"}{" "}
              <strong>{toggleItem?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setConfirmToggleOpen(false); setToggleItem(null); }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                disabled={isLoading}
                onClick={async () => {
                  try {
                    if (toggleItem?.active) {
                      await handleDisableHostel(toggleItem);
                    } else {
                      await handleEnableHostel(toggleItem);
                    }
                  } finally {
                    setConfirmToggleOpen(false);
                    setToggleItem(null);
                  }
                }}
                className={`px-4 py-2 text-white rounded ${toggleItem?.active ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
                  }`}
              >
                {toggleItem?.active ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
};

export default HostelPage;
