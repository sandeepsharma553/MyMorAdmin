// src/pages/UniversityChecklistPage.jsx
import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { FadeLoader } from "react-spinners";

const EMPTY_CHECKLIST = {
  title: "",
  description: "",
  isPinned: false,
  tasks: [],
};

const EMPTY_TASK = {
  title: "",
  description: "",
};

const toTime = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms
    ? new Date(ms).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
};

export default function UniversityChecklistPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const { universityId, filterByScope, scopePayload } = useUniversityScope();

  const [tab, setTab] = useState("checklists");
  const [items, setItems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CHECKLIST);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (universityId) {
      load();
      loadSubmissions();
    }
  }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "university", universityId, "checklists"),
          orderBy("createdAt", "desc")
        )
      );
      setItems(filterByScope(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
    } catch {
      toast.error("Failed to load checklists");
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async () => {
    try {
      const snap = await getDocs(
        query(
          collection(db, "university", universityId, "checklistSubmissions"),
          orderBy("submittedAt", "desc")
        )
      );
      setSubmissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {}
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_CHECKLIST);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title || "",
      description: item.description || "",
      isPinned: !!item.isPinned,
      tasks: item.tasks || [],
    });
    setModalOpen(true);
  };

  const addTask = () =>
    setForm((f) => ({ ...f, tasks: [...f.tasks, { ...EMPTY_TASK }] }));

  const removeTask = (idx) =>
    setForm((f) => ({
      ...f,
      tasks: f.tasks.filter((_, i) => i !== idx),
    }));

  const updateTask = (idx, field, value) =>
    setForm((f) => ({
      ...f,
      tasks: f.tasks.map((t, i) =>
        i === idx ? { ...t, [field]: value } : t
      ),
    }));

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        ...scopePayload,
        title: form.title,
        description: form.description,
        isPinned: form.isPinned,
        tasks: form.tasks,
        universityId,
        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        await updateDoc(
          doc(db, "university", universityId, "checklists", editing.id),
          data
        );
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "checklists"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success("Created!");
      }

      setModalOpen(false);
      load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm("Delete this checklist?")) return;
    try {
      await deleteDoc(
        doc(db, "university", universityId, "checklists", item.id)
      );
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  if (!universityId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
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
      <ToastContainer />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Checklist</h1>

        {tab === "checklists" && (
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
          >
            <Plus size={16} />
            Add Checklist
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        {["checklists", "submissions"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium capitalize ${
              tab === t
                ? "bg-black text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded shadow min-h-[300px] flex justify-center items-center">
          <FadeLoader color="#36d7b7" loading={loading} />
        </div>
      ) : tab === "checklists" ? (
        <div className="overflow-x-auto bg-white rounded shadow">
          {items.length === 0 ? (
            <div className="px-6 py-16 text-center text-gray-500">
              No checklists found.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {["Title", "Description", "Tasks", "Pinned", "Actions"].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-6 py-3 text-left text-sm font-medium text-gray-500"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                      {item.title}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                      <div className="truncate">{item.description || "—"}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(item.tasks || []).length} tasks
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {item.isPinned ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-700">
                          Pinned
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => openEdit(item)}
                        className="text-blue-600 hover:underline mr-3 inline-flex items-center gap-1"
                      >
                        <Edit2 size={14} />
                        Edit
                      </button>
                      <button
                        onClick={() => remove(item)}
                        className="text-red-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded shadow">
          {submissions.length === 0 ? (
            <div className="px-6 py-16 text-center text-gray-500">
              No submissions found.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    "Checklist",
                    "Submitted By",
                    "Date",
                    "Completed Tasks",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-sm font-medium text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {submissions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                      {s.checklistTitle || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {s.submittedBy || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {toTime(s.submittedAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {(s.completedTasks || []).length} / {s.totalTasks || 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editing ? "Edit Checklist" : "Add Checklist"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Title</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="Checklist title"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Description</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Brief description..."
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isPinned}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isPinned: e.target.checked }))
                  }
                />
                <span className="text-sm text-gray-700">Pin this checklist</span>
              </label>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="block font-medium">Tasks</label>
                  <button
                    onClick={addTask}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    + Add Task
                  </button>
                </div>

                {form.tasks.length === 0 ? (
                  <div className="text-sm text-gray-400 border border-dashed border-gray-300 rounded p-4 text-center">
                    No tasks added yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {form.tasks.map((task, idx) => (
                      <div
                        key={idx}
                        className="border border-gray-200 rounded p-3 bg-gray-50"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium text-gray-700">
                            Task {idx + 1}
                          </span>
                          <button
                            onClick={() => removeTask(idx)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X size={16} />
                          </button>
                        </div>

                        <div className="space-y-2">
                          <input
                            type="text"
                            className="w-full border border-gray-300 p-2 rounded"
                            placeholder="Task title"
                            value={task.title}
                            onChange={(e) =>
                              updateTask(idx, "title", e.target.value)
                            }
                          />

                          <input
                            type="text"
                            className="w-full border border-gray-300 p-2 rounded"
                            placeholder="Task description"
                            value={task.description}
                            onChange={(e) =>
                              updateTask(idx, "description", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={submitting}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {submitting ? "Saving..." : editing ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}