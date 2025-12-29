// HostelPage.jsx

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db, storage } from "../../firebase"; // ⬅️ storage added
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage"; // ⬅️ upload utils
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
  discover: false,
  activity: false,
  room: false,
  social: false,
  uniclub: false,
  explore: false,
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

  // ⬇️ Images (like posters)
  images: [], // [{url, name}]
  imageFiles: [], // File[]
};

const HostelPage = () => {
  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth?.employee);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [universities, setUniversities] = useState([]); // for modal country-wise multi-select
  const [isLoading, setIsLoading] = useState(false);

  // ✅ NEW: university-wise list filter (like Uniclub)
  const [filterUniversity, setFilterUniversity] = useState([]); // dropdown options
  const [filterUniversityId, setFilterUniversityId] = useState(""); // selected uniId

  const [currentPage, setCurrentPage] = useState(1);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toggleItem, setToggleItem] = useState(null);
  const [form, setForm] = useState(initialForm);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ✅ NEW: fetch my universities for filter dropdown (same logic as UniclubPage)
  useEffect(() => {
    const fetchMyUniversities = async () => {
      if (!emp?.uid) return;
      try {
        const qy = query(collection(db, "university"), where("uid", "==", emp.uid));
        const qs = await getDocs(qy);
        if (mountedRef.current) {
          setFilterUniversity(qs.docs.map((d) => ({ id: d.id, name: d.data().name })));
        }
      } catch (e) {
        console.error("fetchMyUniversities error:", e);
      }
    };
    fetchMyUniversities();
  }, [emp?.uid]);

  // ✅ NEW: filter list by selected university
  const filteredData = useMemo(() => {
    if (!filterUniversityId) return list;
    return list.filter((h) => (h.uniIds || []).includes(filterUniversityId));
  }, [list, filterUniversityId]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  const paginatedData = useMemo(
    () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredData, currentPage]
  );

  useEffect(() => {
    getList();
  }, []);

  // ✅ reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterUniversityId]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const resetForm = () => {
    setForm(initialForm);
    setEditing(null);
    setUniversities([]);
  };

  // unique path for images
  const uniquePath = (folder, file, nameHint = "") => {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const base = (nameHint || file.name.replace(/\.[^/.]+$/, "")) || "img";
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prefix = folder ? `${folder}/` : "";
    return `${prefix}${base}_${stamp}.${ext}`;
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
          name,
          uniIds = [],
          location,
          features,
          active = true,
          disabledReason,
          disabledAt,
          countryCode = "",
          countryName = "",
          stateCode = "",
          stateName = "",
          cityName = "",
          lat = null,
          lng = null,
          images = [],
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
          disabledReason,
          disabledAt,
          countryCode,
          countryName,
          stateCode,
          stateName,
          cityName,
          lat,
          lng,
          images: Array.isArray(images) ? images : [],
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
      if (mountedRef.current) setUniversities(uniArr);
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
  }, [modalOpen]); // eslint-disable-line

  const handleAdd = async (e) => {
    e.preventDefault();

    const rawName = form.name?.trim();
    if (!rawName) return toast.warn("Please enter a hostel name");
    if (!Array.isArray(form.uniIds) || form.uniIds.length === 0) {
      return toast.warn("Please select at least one university");
    }

    // upload any NEW images
    let uploaded = [];
    try {
      if (form.imageFiles?.length) {
        const uploads = form.imageFiles.map(async (file) => {
          const path = uniquePath(
            `hostel_images/${rawName.replace(/\s+/g, "_")}`,
            file,
            rawName.replace(/\s+/g, "_")
          );
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, file);
          const url = await getDownloadURL(sRef);
          return { url, name: file.name };
        });
        uploaded = await Promise.all(uploads);
      }
    } catch (err) {
      console.error(err);
      toast.error("Image upload failed");
      return;
    }

    const images = [...(form.images || []), ...uploaded];
    const featuresToSave = { ...DEFAULT_FEATURES, ...(form.features || {}) };

    const payload = {
      uid,
      name: rawName,
      uniIds: [...new Set(form.uniIds)],
      location: form.location?.trim() || "",
      features: featuresToSave,
      active: !!form.active,
      disabledReason: null,
      disabledAt: null,

      countryCode: form.countryCode || "",
      countryName: form.countryName || "",
      stateCode: form.stateCode || "",
      stateName: form.stateName || "",
      cityName: form.cityName || "",
      lat: typeof form.lat === "number" ? form.lat : null,
      lng: typeof form.lng === "number" ? form.lng : null,

      images,
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
        // Prevent duplicate links for same name + uniIds
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

  const allFeaturesSelected = useMemo(
    () => Object.values(form.features || {}).every(Boolean),
    [form.features]
  );

  const handleSelectAllFeatures = (checked) => {
    setForm((prev) => ({
      ...prev,
      features: Object.keys(prev.features || {}).reduce((acc, key) => {
        acc[key] = checked;
        return acc;
      }, {}),
    }));
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
      images: Array.isArray(item.images) ? item.images : [],
      imageFiles: [],
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
          onClick={() => {
            resetForm();
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      {/* ✅ NEW: University-wise filter (like Uniclub) */}
      <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
        <select
          className="border border-gray-300 px-3 py-2 rounded-xl bg-white text-sm"
          value={filterUniversityId}
          onChange={(e) => setFilterUniversityId(e.target.value)}
        >
          <option value="">All Universities</option>
          {filterUniversity.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Images</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
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
                      </div>
                    </td>

                    {/* thumbnail */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.images?.[0]?.url ? (
                        <>
                          <img
                            src={item.images[0].url}
                            alt={item.images[0].name || "hostel"}
                            width={80}
                            height={80}
                            className="rounded"
                          />
                          {item.images.length > 1 && (
                            <div className="text-xs text-gray-500 mt-1">
                              +{item.images.length - 1} more
                            </div>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {item.active ? (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-700">
                          Disabled
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => openEdit(item)}
                      >
                        Edit
                      </button>

                      <button
                        className={
                          item.active
                            ? "text-red-600 hover:underline mr-3"
                            : "text-green-600 hover:underline mr-3"
                        }
                        onClick={() => {
                          setToggleItem(item);
                          setConfirmToggleOpen(true);
                        }}
                      >
                        {item.active ? "Disable" : "Enable"}
                      </button>

                      {/* optional delete */}
                      {/* <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setConfirmDeleteOpen(true);
                        }}
                      >
                        Delete
                      </button> */}
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

              {/* Optional display text */}
              <input
                type="text"
                placeholder="Location (optional display text)"
                className="w-full border border-gray-300 p-2 rounded"
                value={
                  form.location ||
                  (form.cityName
                    ? `${form.cityName}${form.stateName ? ", " + form.stateName : ""}${
                        form.countryName ? ", " + form.countryName : ""
                      }`
                    : "")
                }
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />

              {/* University multi-select */}
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

                {/* Select all toggle */}
                <div style={{ marginBottom: "10px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <input
                      type="checkbox"
                      checked={allFeaturesSelected}
                      onChange={(e) => handleSelectAllFeatures(e.target.checked)}
                    />
                    <span>{allFeaturesSelected ? "Unselect all features" : "Select all features"}</span>
                  </label>
                </div>

                {/* Individual feature checkboxes */}
                <div
                  style={{ display: "flex", flexWrap: "wrap", gap: "20px", padding: "10px 0" }}
                >
                  {Object.keys(form.features).map((key) => (
                    <label
                      key={key}
                      style={{ display: "flex", alignItems: "center", gap: "6px" }}
                      className="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded border border-gray-200"
                    >
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

              {/* Images (multiple) */}
              <div className="space-y-2">
                <label className="block font-medium">Images (you can add multiple)</label>

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
                        setForm((prev) => ({ ...prev, imageFiles: [...prev.imageFiles, ...files] }));
                      }}
                    />
                    📁 Choose Images
                  </label>

                  <span className="text-sm text-gray-600">
                    {form.imageFiles.length ? `${form.imageFiles.length} selected` : "No files selected"}
                  </span>
                </div>

                {/* New (unsaved) previews */}
                {!!form.imageFiles.length && (
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2">
                    {form.imageFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="relative">
                        <img
                          src={URL.createObjectURL(f)}
                          alt={f.name}
                          className="w-full h-24 object-cover rounded"
                        />
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                          onClick={() =>
                            setForm((prev) => {
                              const next = [...prev.imageFiles];
                              next.splice(i, 1);
                              return { ...prev, imageFiles: next };
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

                {/* Already saved images */}
                {!!form.images.length && (
                  <>
                    <div className="text-sm text-gray-500 mt-3">Already saved</div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {form.images.map((img, i) => (
                        <div key={`${img.url}-${i}`} className="relative">
                          <img
                            src={img.url}
                            alt={img.name || `image-${i}`}
                            className="w-full h-24 object-cover rounded"
                          />
                          <button
                            type="button"
                            className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                            onClick={() =>
                              setForm((prev) => {
                                const next = [...prev.images];
                                next.splice(i, 1);
                                return { ...prev, images: next };
                              })
                            }
                            title="Remove from hostel"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Hostel</h2>
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

      {/* Enable/Disable confirm */}
      {confirmToggleOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-semibold">
              {toggleItem?.active ? "Disable Hostel" : "Enable Hostel"}
            </h2>
            <p className="my-4">
              Are you sure you want to {toggleItem?.active ? "disable" : "enable"}{" "}
              <strong>{toggleItem?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmToggleOpen(false);
                  setToggleItem(null);
                }}
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
                className={`px-4 py-2 text-white rounded ${
                  toggleItem?.active ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
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
