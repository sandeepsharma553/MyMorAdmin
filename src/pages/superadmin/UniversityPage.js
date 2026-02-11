import React, { useState, useEffect, useMemo } from "react";
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
import { db, storage } from "../../firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import LocationPicker from "./LocationPicker";

const pageSize = 10;
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
  uniclubstudent: false,
  uniclubmember:false,
  uniclubannouncement: false,
  uniclubevent: false,
  uniclubeventbooking: false,
  uniclubsubgroup: false,
  explore:false,
  uniclubcommunity:false,
  marketplace:false,
};

const initialForm = {
  id: "",
  name: "",
  campus: "",
  domain: "",
  studomain: "",
  countryCode: "",
  countryName: "",
  stateCode: "",
  stateName: "",
  cityName: "",
  lat: null,
  lng: null,
  images: [],
  imageFiles: [],
  features: { ...DEFAULT_FEATURES },
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

  // 🔘 are all features checked?
  const allFeaturesSelected = useMemo(
    () => Object.values(form.features || {}).every(Boolean),
    [form.features]
  );

  // 🔘 select/unselect all features
  const handleSelectAllFeatures = (checked) => {
    setForm((prev) => ({
      ...prev,
      features: Object.keys(prev.features || {}).reduce((acc, key) => {
        acc[key] = checked;
        return acc;
      }, {}),
    }));
  };

  useEffect(() => {
    getList();
  }, []);

  const getList = async () => {
    try {
      setIsLoading(true);
      const qs = await getDocs(collection(db, "university"));
      const documents = qs.docs.map((d) => ({
        id: d.id,
        features: { ...DEFAULT_FEATURES, ...(d.features || {}) },
        ...d.data(),
      }));
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

  const uniquePath = (folder, file) => {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const base = file.name.replace(/\.[^/.]+$/, "");
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const prefix = folder ? `${folder}/` : "";
    return `${prefix}${base}_${stamp}.${ext}`;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name) {
      toast.warn("Name is required");
      return;
    }
    const featuresToSave = { ...DEFAULT_FEATURES, ...(form.features || {}) };
    // base (without images)
    const payloadBase = {
      uid,
      name: form.name?.trim(),
      campus: form.campus?.trim() || "",
      domain: form.domain?.trim() || "",
      studomain: form.studomain?.trim() || "",
      countryCode: form.countryCode || "",
      countryName: form.countryName || "",
      stateCode: form.stateCode || "",
      stateName: form.stateName || "",
      cityName: form.cityName || "",
      lat: typeof form.lat === "number" ? form.lat : null,
      lng: typeof form.lng === "number" ? form.lng : null,
      features: featuresToSave,
    };

    try {
      // upload any newly selected files
      let uploaded = [];
      if (form.imageFiles?.length) {
        const uploads = form.imageFiles.map(async (file) => {
          const path = uniquePath(
            `university_images/${(form.name || "university").replace(/\s+/g, "_")}`,
            file
          );
          const sRef = storageRef(storage, path);
          await uploadBytes(sRef, file);
          const url = await getDownloadURL(sRef);
          return { url, name: file.name };
        });
        uploaded = await Promise.all(uploads);
      }

      const finalImages = [...(form.images || []), ...uploaded];

      if (editingData) {
        // update
        const docRef = doc(db, "university", form.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) {
          toast.warning("University does not exist! Cannot update.");
          return;
        }
        await updateDoc(docRef, {
          ...payloadBase,
          images: finalImages,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        // prevent duplicate by name (optional: include campus too if you like)
        const qy = query(
          collection(db, "university"),
          where("name", "==", payloadBase.name)
        );
        const exists = await getDocs(qy);
        if (!exists.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "university"), {
          ...payloadBase,
          images: finalImages,
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
      await deleteDoc(doc(db, "university", deleteData.id));
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
      images: Array.isArray(item.images) ? item.images : [],
      imageFiles: [],
      features: { ...DEFAULT_FEATURES, ...(item.features || {}) },
    });
    setModalOpen(true);
  };

  const formatLocation = (row) => {
    const parts = [row.cityName, row.stateName, row.countryName].filter(Boolean);
    return parts.length ? parts.join(", ") : "—";
  };

  const handleFeatureChange = (e) => {
    const { name, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      features: { ...prev.features, [name]: checked },
    }));
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  University
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Location
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Images
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Campus
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan="5"
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No universities found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span>{formatLocation(item)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.images?.[0]?.url ? (
                        <div className="flex items-center gap-2">
                          <img
                            src={item.images[0].url}
                            alt=""
                            width={56}
                            height={56}
                            className="rounded object-cover"
                            style={{ width: 56, height: 56 }}
                          />
                          {item.images.length > 1 && (
                            <span className="text-xs text-gray-500">
                              +{item.images.length - 1} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.campus || "—"}
                    </td>
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
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit University" : "Add University"}
            </h2>

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
                key={form.id || "new"}
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

                  setForm((prev) => {
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
                    ? `${form.cityName}${form.stateName ? ", " + form.stateName : ""
                    }${form.countryName ? ", " + form.countryName : ""
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

              {/* 🔘 Features with "Select all" */}
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
                    <span>
                      {allFeaturesSelected ? "Unselect all features" : "Select all features"}
                    </span>
                  </label>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", padding: "10px 0" }}>
                  {Object.keys(form.features).map((key) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}
                    className="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded border border-gray-200">
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
                <label className="block font-medium">
                  Images (you can add multiple)
                </label>
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
                        setForm((prev) => ({
                          ...prev,
                          imageFiles: [...prev.imageFiles, ...files],
                        }));
                      }}
                    />
                    📁 Choose Images
                  </label>
                  <span className="text-sm text-gray-600">
                    {form.imageFiles.length
                      ? `${form.imageFiles.length} selected`
                      : "No files selected"}
                  </span>
                </div>

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

                {!!form.images.length && (
                  <>
                    <div className="text-sm text-gray-500 mt-3">
                      Already saved
                    </div>
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
                            title="Remove from university"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

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
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete University
            </h2>
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
