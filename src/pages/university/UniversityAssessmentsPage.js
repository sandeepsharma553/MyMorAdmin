import React, { useState, useEffect } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { useSelector } from "react-redux";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function getCountdown(dueDate, dueTime) {
  if (!dueDate) return null;
  const now = new Date();
  const due = dueTime
    ? new Date(`${dueDate}T${dueTime}:00`)
    : new Date(`${dueDate}T23:59:59`);
  const diff = due - now;
  if (diff < 0) return { label: "Overdue", overdue: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return { label: `${days}d ${hours}h`, overdue: false };
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { label: `${hours}h ${mins}m`, overdue: false };
}

export default function UniversityAssessmentsPage({ navbarHeight }) {
  const uid = useSelector((s) => s.auth.user?.uid);
  const { universityId, filterByScope, scopePayload, campusId } = useUniversityScope();

  const [isLoading, setIsLoading] = useState(false);
  const [assessments, setAssessments] = useState([]);
  const [units, setUnits] = useState([]);
  const [disciplines, setDisciplines] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  // force countdown re-renders every minute
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);

  const initForm = {
    name: "",
    disciplineId: "",
    disciplineName: "",
    unitId: "",
    unitCode: "",
    dueDate: "",
    dueTime: "",
    weekNumber: "",
    percentage: "",
    instructions: "",
    imageUrl: "",
    startDate: "",
    endDate: "",
  };
  const [form, setForm] = useState(initForm);

  const assessmentsCol = () => collection(db, "university", universityId, "assessments");
  const assessmentRef = (id) => doc(db, "university", universityId, "assessments", id);
  const unitsCol = () => collection(db, "university", universityId, "units");

  const loadDisciplines = async () => {
    try {
      const snap = await getDoc(doc(db, "university", universityId));
      if (!snap.exists()) return;
      const campuses = snap.data().campuses || [];
      let discs = [];
      if (campusId) {
        discs = campuses.find((c) => c.id === campusId)?.disciplines || [];
      } else {
        campuses.forEach((c) => discs.push(...(c.disciplines || [])));
      }
      setDisciplines(discs);
    } catch (e) {
      console.error(e);
    }
  };

  const loadUnits = async () => {
    try {
      const snap = await getDocs(unitsCol());
      setUnits(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  const loadAssessments = async () => {
    setIsLoading(true);
    try {
      const snap = await getDocs(assessmentsCol());
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""));
      setAssessments(filterByScope(docs));
    } catch (e) {
      toast.error("Failed to load assessments");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (universityId) {
      loadDisciplines();
      loadUnits();
      loadAssessments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async () => {
    if (!imageFile) return form.imageUrl || "";
    setUploading(true);
    try {
      const storageRef = ref(
        storage,
        `university/${universityId}/assessments/${Date.now()}_${imageFile.name}`
      );
      const snap = await uploadBytes(storageRef, imageFile);
      return await getDownloadURL(snap.ref);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.dueDate) {
      toast.warning("Assessment name and due date are required");
      return;
    }
    try {
      const imageUrl = await uploadImage();
      const disc = disciplines.find((d) => d.id === form.disciplineId);
      const unit = units.find((u) => u.id === form.unitId);
      const payload = {
        name: form.name.trim(),
        disciplineId: form.disciplineId,
        disciplineName: disc?.name || form.disciplineName || "",
        unitId: form.unitId,
        unitCode: unit?.unitCode || form.unitCode || "",
        unitName: unit?.unitName || "",
        dueDate: form.dueDate,
        dueTime: form.dueTime,
        weekNumber: form.weekNumber !== "" ? Number(form.weekNumber) : "",
        percentage: form.percentage !== "" ? Number(form.percentage) : "",
        instructions: form.instructions.trim(),
        imageUrl,
        startDate: form.startDate,
        endDate: form.endDate,
        universityId,
        ...scopePayload,
        updatedBy: uid,
        updatedDate: new Date(),
      };
      if (editingItem) {
        await updateDoc(assessmentRef(editingItem.id), payload);
        toast.success("Assessment updated");
      } else {
        await addDoc(assessmentsCol(), {
          ...payload,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Assessment added");
      }
      closeModal();
      loadAssessments();
    } catch (e) {
      console.error(e);
      toast.error("Failed to save assessment");
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await deleteDoc(assessmentRef(deleteItem.id));
      toast.success("Assessment deleted");
      setDeleteItem(null);
      loadAssessments();
    } catch (e) {
      toast.error("Failed to delete");
    }
  };

  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      name: item.name || "",
      disciplineId: item.disciplineId || "",
      disciplineName: item.disciplineName || "",
      unitId: item.unitId || "",
      unitCode: item.unitCode || "",
      dueDate: item.dueDate || "",
      dueTime: item.dueTime || "",
      weekNumber: item.weekNumber ?? "",
      percentage: item.percentage ?? "",
      instructions: item.instructions || "",
      imageUrl: item.imageUrl || "",
      startDate: item.startDate || "",
      endDate: item.endDate || "",
    });
    setImagePreview(item.imageUrl || null);
    setImageFile(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
    setForm(initForm);
    setImageFile(null);
    setImagePreview(null);
  };

  const filteredUnits = form.disciplineId
    ? units.filter((u) => u.disciplineId === form.disciplineId)
    : units;

  if (!universityId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl p-10 text-center text-gray-500 shadow-sm">
          No university assigned.
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <UniversityScopeBanner />

      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Assessments</h1>
        <button
          className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
          onClick={() => {
            setEditingItem(null);
            setForm(initForm);
            setImageFile(null);
            setImagePreview(null);
            setModalOpen(true);
          }}
        >
          + Add Assessment
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <FadeLoader color="#36d7b7" loading={isLoading} />
        </div>
      ) : assessments.length === 0 ? (
        <div className="bg-white rounded-xl p-10 text-center text-gray-500 shadow-sm">
          No assessments yet.
        </div>
      ) : (
        <div className="space-y-3">
          {assessments.map((item) => {
            const countdown = getCountdown(item.dueDate, item.dueTime);
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-start gap-4"
              >
                {item.imageUrl && (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-gray-900">{item.name}</h3>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {item.unitCode && (
                          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {item.unitCode}
                          </span>
                        )}
                        {item.disciplineName && (
                          <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                            {item.disciplineName}
                          </span>
                        )}
                        {item.percentage !== "" && item.percentage !== undefined && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            {item.percentage}%
                          </span>
                        )}
                        {item.weekNumber !== "" && item.weekNumber !== undefined && (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                            Week {item.weekNumber}
                          </span>
                        )}
                      </div>
                      {item.instructions && (
                        <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">
                          {item.instructions}
                        </p>
                      )}
                      {item.startDate && item.endDate && (
                        <p className="text-xs text-gray-400 mt-1">
                          Display: {item.startDate} → {item.endDate}
                        </p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-sm text-gray-500">
                        Due: {item.dueDate}{item.dueTime ? ` at ${item.dueTime}` : ""}
                      </p>
                      {countdown && (
                        <span
                          className={`text-sm font-semibold ${
                            countdown.overdue ? "text-red-600" : "text-orange-500"
                          }`}
                        >
                          {countdown.overdue ? "Overdue" : `⏱ ${countdown.label}`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-1 flex-shrink-0">
                  <button
                    className="text-blue-600 hover:underline text-sm"
                    onClick={() => openEdit(item)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-600 hover:underline text-sm"
                    onClick={() => setDeleteItem(item)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20 p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-xl shadow-xl">
            <h2 className="text-xl font-bold mb-5">
              {editingItem ? "Edit Assessment" : "Add Assessment"}
            </h2>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">Assessment Name</label>
                  <input
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.name}
                    onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Essay 1"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Discipline</label>
                  <select
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.disciplineId}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        disciplineId: e.target.value,
                        unitId: "",
                        unitCode: "",
                      }))
                    }
                  >
                    <option value="">— Select —</option>
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Unit</label>
                  <select
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.unitId}
                    onChange={(e) => setForm((p) => ({ ...p, unitId: e.target.value }))}
                  >
                    <option value="">— Select —</option>
                    {filteredUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitCode} — {u.unitName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Due Date</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.dueDate}
                    onChange={(e) => setForm((p) => ({ ...p, dueDate: e.target.value }))}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Due Time</label>
                  <input
                    type="time"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.dueTime}
                    onChange={(e) => setForm((p) => ({ ...p, dueTime: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Week Number</label>
                  <input
                    type="number"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.weekNumber}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, weekNumber: e.target.value }))
                    }
                    placeholder="e.g. 11"
                    min="1"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Percentage / Weightage (%)
                  </label>
                  <input
                    type="number"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.percentage}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, percentage: e.target.value }))
                    }
                    placeholder="e.g. 30"
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Display Start Date
                  </label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.startDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, startDate: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Display End Date
                  </label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.endDate}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, endDate: e.target.value }))
                    }
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">Instructions</label>
                  <textarea
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.instructions}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, instructions: e.target.value }))
                    }
                    rows={4}
                    placeholder="Assessment instructions, guidelines, submission requirements..."
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium mb-1">
                    Image (Optional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    className="w-full border border-gray-300 p-2 rounded"
                    onChange={handleImageChange}
                  />
                  {imagePreview && (
                    <img
                      src={imagePreview}
                      alt="Preview"
                      className="mt-2 h-32 rounded-lg object-cover"
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
                >
                  {uploading ? "Uploading..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteItem && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-80 shadow-xl">
            <h2 className="text-lg font-semibold mb-3 text-red-600">Delete Assessment</h2>
            <p className="mb-4 text-sm">
              Delete <strong>{deleteItem.name}</strong>? This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteItem(null)}
                className="px-4 py-2 bg-gray-200 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded"
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
