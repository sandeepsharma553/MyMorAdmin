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

// universityModule must be first — it drives signup flow logic
const DEFAULT_FEATURES = {
  universityModule: false,
  events: false,
  eventbooking: false,
  // deals: false,
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
  uniclubmember: false,
  uniclubannouncement: false,
  uniclubevent: false,
  uniclubeventbooking: false,
  uniclubsubgroup: false,
  explore: false,
  uniclubcommunity: false,
  marketplace: false,
  shop: false,
  assessment: false,
};

const REGULAR_FEATURE_KEYS = Object.keys(DEFAULT_FEATURES).filter(
  (k) => k !== "universityModule"
);

const initialForm = {
  id: "",
  name: "",
  campuses: [],       // [{id, name, disciplines:[{id,name}]}]
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

// ── Campus / discipline helpers ───────────────────────────────────────────────

const makeCampus = (name) => ({
  id: `campus-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: name.trim(),
  disciplines: [],
});

const makeDiscipline = (name) => ({
  id: `disc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  name: name.trim(),
});

// Backward-compat: if old record has campus:string, lift it into campuses array
const normaliseCampuses = (item) => {
  if (Array.isArray(item.campuses) && item.campuses.length > 0) {
    return item.campuses;
  }
  if (item.campus && typeof item.campus === "string" && item.campus.trim()) {
    return [{ id: `legacy-${item.id}`, name: item.campus.trim(), disciplines: [] }];
  }
  return [];
};

// For display and backward-compat writes
const formatCampuses = (item) => {
  const campuses = Array.isArray(item.campuses) ? item.campuses : [];
  if (campuses.length > 0) return campuses.map((c) => c.name).join(", ");
  return item.campus || "—";
};

// ─────────────────────────────────────────────────────────────────────────────

export default function UniversityPage() {
  const uid = useSelector((state) => state.auth.user.uid);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [form, setForm] = useState(initialForm);

  // Campus / discipline local input state (not part of form)
  const [campusInput, setCampusInput] = useState("");
  const [disciplineInputs, setDisciplineInputs] = useState({}); // {campusId: string}

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = useMemo(
    () => list.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [list, currentPage]
  );

  const allFeaturesSelected = useMemo(
    () => REGULAR_FEATURE_KEYS.every((k) => !!form.features?.[k]),
    [form.features]
  );

  const handleSelectAllFeatures = (checked) => {
    setForm((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        ...REGULAR_FEATURE_KEYS.reduce((acc, k) => { acc[k] = checked; return acc; }, {}),
      },
    }));
  };

  useEffect(() => { getList(); }, []);

  const getList = async () => {
    try {
      setIsLoading(true);
      const qs = await getDocs(collection(db, "university"));
      const documents = qs.docs.map((d) => ({
        id: d.id,
        features: { ...DEFAULT_FEATURES, ...(d.data().features || {}) },
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
    setCampusInput("");
    setDisciplineInputs({});
  };

  // ── Campus operations ─────────────────────────────────────────────────────

  const addCampus = () => {
    const name = campusInput.trim();
    if (!name) return;
    setForm((prev) => ({
      ...prev,
      campuses: [...(prev.campuses || []), makeCampus(name)],
    }));
    setCampusInput("");
  };

  const removeCampus = (campusId) => {
    setForm((prev) => ({
      ...prev,
      campuses: prev.campuses.filter((c) => c.id !== campusId),
    }));
    setDisciplineInputs((prev) => {
      const next = { ...prev };
      delete next[campusId];
      return next;
    });
  };

  const addDiscipline = (campusId) => {
    const name = (disciplineInputs[campusId] || "").trim();
    if (!name) return;
    setForm((prev) => ({
      ...prev,
      campuses: prev.campuses.map((c) =>
        c.id === campusId
          ? { ...c, disciplines: [...(c.disciplines || []), makeDiscipline(name)] }
          : c
      ),
    }));
    setDisciplineInputs((prev) => ({ ...prev, [campusId]: "" }));
  };

  const removeDiscipline = (campusId, discId) => {
    setForm((prev) => ({
      ...prev,
      campuses: prev.campuses.map((c) =>
        c.id === campusId
          ? { ...c, disciplines: c.disciplines.filter((d) => d.id !== discId) }
          : c
      ),
    }));
  };

  // ── Image helpers ─────────────────────────────────────────────────────────

  const uniquePath = (folder, file) => {
    const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
    const base = file.name.replace(/\.[^/.]+$/, "");
    const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return `${folder ? folder + "/" : ""}${base}_${stamp}.${ext}`;
  };

  // ── Save / update ─────────────────────────────────────────────────────────

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name) { toast.warn("Name is required"); return; }

    const featuresToSave = { ...DEFAULT_FEATURES, ...(form.features || {}) };
    const campuses = form.campuses || [];

    const payloadBase = {
      uid,
      name: form.name.trim(),
      // Keep legacy campus field (first campus name) for backward compat with
      // any other code that still reads university.campus
      campus: campuses[0]?.name || "",
      campuses,
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
        const docRef = doc(db, "university", form.id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) { toast.warning("University does not exist! Cannot update."); return; }
        await updateDoc(docRef, { ...payloadBase, images: finalImages, updatedBy: uid, updatedDate: new Date() });
        toast.success("Successfully updated");
      } else {
        const exists = await getDocs(query(collection(db, "university"), where("name", "==", payloadBase.name)));
        if (!exists.empty) { toast.warn("Duplicate found! Not adding."); return; }
        await addDoc(collection(db, "university"), { ...payloadBase, images: finalImages, createdBy: uid, createdDate: new Date() });
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
      console.error("Error deleting:", error);
      toast.error("Failed to delete");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const openAdd = () => { resetForm(); setModalOpen(true); };

  const openEdit = (item) => {
    setEditing(item);
    setCampusInput("");
    setDisciplineInputs({});
    setForm({
      id: item.id,
      name: item.name || "",
      campuses: normaliseCampuses(item),
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

  const formatLocation = (row) =>
    [row.cityName, row.stateName, row.countryName].filter(Boolean).join(", ") || "—";

  const handleFeatureChange = (e) => {
    const { name, checked } = e.target;
    setForm((prev) => ({ ...prev, features: { ...prev.features, [name]: checked } }));
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800" onClick={openAdd}>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Images</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Campuses</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Uni Module</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">No universities found.</td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">{formatLocation(item)}</td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {item.images?.[0]?.url ? (
                        <div className="flex items-center gap-2">
                          <img src={item.images[0].url} alt="" className="rounded object-cover" style={{ width: 56, height: 56 }} />
                          {item.images.length > 1 && (
                            <span className="text-xs text-gray-500">+{item.images.length - 1} more</span>
                          )}
                        </div>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 max-w-xs">
                      <div className="truncate">{formatCampuses(item)}</div>
                      {Array.isArray(item.campuses) && item.campuses.length > 1 && (
                        <div className="text-xs text-gray-400">{item.campuses.length} campuses</div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {item.features?.universityModule ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">ON</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">OFF</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => openEdit(item)}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => { setDelete(item); setConfirmDeleteOpen(true); }}>Delete</button>
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
          <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Previous</button>
          <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* ── Add / Edit Modal ──────────────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit University" : "Add University"}</h2>

            <form onSubmit={handleAdd} className="space-y-4">
              {/* Name */}
              <input
                type="text"
                placeholder="Name"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />

              {/* Location */}
              <LocationPicker
                key={form.id || "new"}
                value={{ countryCode: form.countryCode || "", stateCode: form.stateCode || "", cityName: form.cityName || "" }}
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
                      prev.countryCode === next.countryCode && prev.countryName === next.countryName &&
                      prev.stateCode === next.stateCode && prev.stateName === next.stateName &&
                      prev.cityName === next.cityName && prev.lat === next.lat && prev.lng === next.lng;
                    return same ? prev : { ...prev, ...next };
                  });
                }}
              />

              <input
                type="text"
                className="w-full border border-gray-300 p-2 rounded bg-gray-50"
                value={form.cityName ? `${form.cityName}${form.stateName ? ", " + form.stateName : ""}${form.countryName ? ", " + form.countryName : ""}` : ""}
                readOnly
                placeholder="Location (auto-filled)"
              />

              {/* Email domains */}
              <input
                type="text"
                placeholder="University Domain (e.g. acap.edu.au)"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                required
              />
              <input
                type="text"
                placeholder="Student Domain (optional alternate)"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.studomain}
                onChange={(e) => setForm({ ...form, studomain: e.target.value })}
              />

              {/* ── University Module toggle ──────────────────────────────────── */}
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name="universityModule"
                    checked={!!form.features.universityModule}
                    onChange={handleFeatureChange}
                    className="mt-0.5 w-4 h-4 accent-purple-600"
                  />
                  <div>
                    <span className="font-semibold text-purple-900">University Module</span>
                    <p className="text-xs text-purple-600 mt-0.5">
                      Students must select campus &amp; discipline during signup. Configure campuses below.
                    </p>
                  </div>
                </label>
              </div>

              {/* ── Campuses ─────────────────────────────────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-semibold text-gray-800">Campuses</label>
                  {!form.features.universityModule && (
                    <span className="text-xs text-gray-400">Enable University Module above to require campus selection</span>
                  )}
                </div>

                {/* Add campus input */}
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    placeholder="Campus name (e.g. Melbourne CBD)"
                    className="flex-1 border border-gray-300 p-2 rounded text-sm"
                    value={campusInput}
                    onChange={(e) => setCampusInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCampus(); } }}
                  />
                  <button
                    type="button"
                    onClick={addCampus}
                    className="px-4 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                  >
                    + Add
                  </button>
                </div>

                {form.campuses.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No campuses added yet.</p>
                )}

                {/* Campus list */}
                <div className="space-y-3">
                  {form.campuses.map((campus) => (
                    <div key={campus.id} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      {/* Campus header */}
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-medium text-sm text-gray-800">🏛 {campus.name}</span>
                        <button
                          type="button"
                          onClick={() => removeCampus(campus.id)}
                          className="text-red-500 text-xs hover:text-red-700"
                        >
                          Remove campus
                        </button>
                      </div>

                      {/* Disciplines for this campus */}
                      <div className="ml-3">
                        <div className="flex gap-2 mb-2">
                          <input
                            type="text"
                            placeholder="Discipline (e.g. Psychology)"
                            className="flex-1 border border-gray-200 p-1.5 rounded text-xs"
                            value={disciplineInputs[campus.id] || ""}
                            onChange={(e) =>
                              setDisciplineInputs((prev) => ({ ...prev, [campus.id]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); addDiscipline(campus.id); }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => addDiscipline(campus.id)}
                            className="px-3 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
                          >
                            + Discipline
                          </button>
                        </div>

                        {campus.disciplines.length === 0 ? (
                          <p className="text-xs text-gray-400 italic">No disciplines — students won't be prompted to select one.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {campus.disciplines.map((d) => (
                              <span
                                key={d.id}
                                className="inline-flex items-center gap-1 bg-white border border-gray-300 rounded-full px-2.5 py-0.5 text-xs text-gray-700"
                              >
                                {d.name}
                                <button
                                  type="button"
                                  onClick={() => removeDiscipline(campus.id, d.id)}
                                  className="text-red-400 hover:text-red-600 font-bold leading-none"
                                >
                                  ×
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Regular features ─────────────────────────────────────────── */}
              <fieldset style={{ marginTop: "20px" }}>
                <legend style={{ fontWeight: "bold", marginBottom: "10px" }}>Features</legend>

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

                <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", padding: "10px 0" }}>
                  {REGULAR_FEATURE_KEYS.map((key) => (
                    <label
                      key={key}
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

              {/* ── Images ───────────────────────────────────────────────────── */}
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

                {!!form.imageFiles.length && (
                  <div className="mt-2 grid grid-cols-3 md:grid-cols-4 gap-2">
                    {form.imageFiles.map((f, i) => (
                      <div key={`${f.name}-${i}`} className="relative">
                        <img src={URL.createObjectURL(f)} alt={f.name} className="w-full h-24 object-cover rounded" />
                        <button
                          type="button"
                          className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                          onClick={() => setForm((prev) => { const next = [...prev.imageFiles]; next.splice(i, 1); return { ...prev, imageFiles: next }; })}
                        >✕</button>
                      </div>
                    ))}
                  </div>
                )}

                {!!form.images.length && (
                  <>
                    <div className="text-sm text-gray-500 mt-3">Already saved</div>
                    <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                      {form.images.map((img, i) => (
                        <div key={`${img.url}-${i}`} className="relative">
                          <img src={img.url} alt={img.name || `image-${i}`} className="w-full h-24 object-cover rounded" />
                          <button
                            type="button"
                            className="absolute -top-2 -right-2 bg-white border rounded-full px-2 text-xs"
                            onClick={() => setForm((prev) => { const next = [...prev.images]; next.splice(i, 1); return { ...prev, images: next }; })}
                            title="Remove"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Coordinates preview */}
              <div className="text-xs text-gray-600">
                {typeof form.lat === "number" && typeof form.lng === "number"
                  ? `Coordinates: ${form.lat.toFixed(6)}, ${form.lng.toFixed(6)}`
                  : "Coordinates: —"}
              </div>

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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete University</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
