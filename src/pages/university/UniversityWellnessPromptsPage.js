import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
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

const CATEGORIES = [
  "Mental Health",
  "Physical",
  "Social",
  "Academic",
  "General",
];

const EMPTY = {
  title: "",
  message: "",
  category: "General",
  scheduledDate: "",
  isActive: true,
  isPinned: false,
};

export default function UniversityWellnessPromptsPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (universityId) load();
  }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "university", universityId, "wellnessprompts"),
          orderBy("createdAt", "desc")
        )
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load wellness prompts");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title || "",
      message: item.message || "",
      category: item.category || "General",
      scheduledDate: item.scheduledDate || "",
      isActive: item.isActive !== false,
      isPinned: !!item.isPinned,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSubmitting(true);
    try {
      const data = { ...form, universityId, updatedAt: serverTimestamp() };

      if (editing?.id) {
        await updateDoc(
          doc(db, "university", universityId, "wellnessprompts", editing.id),
          data
        );
        toast.success("Updated!");
      } else {
        await addDoc(
          collection(db, "university", universityId, "wellnessprompts"),
          { ...data, createdAt: serverTimestamp() }
        );
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
    if (!window.confirm("Delete this wellness prompt?")) return;
    try {
      await deleteDoc(
        doc(db, "university", universityId, "wellnessprompts", item.id)
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
      <ToastContainer />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Wellness Prompts</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
        >
          <Plus size={16} />
          Add Prompt
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={loading} />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            No wellness prompts found.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Title", "Category", "Scheduled", "Active", "Pinned", "Actions"].map(
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
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium text-gray-700">{item.title}</div>
                    {item.message ? (
                      <div className="text-xs text-gray-400 mt-1 truncate max-w-xs">
                        {item.message}
                      </div>
                    ) : null}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                      {item.category}
                    </span>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.scheduledDate || "—"}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        item.isActive !== false
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.isActive !== false ? "Active" : "Inactive"}
                    </span>
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

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editing ? "Edit Prompt" : "Add Prompt"}
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
                  placeholder="Wellness prompt title"
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Message</label>
                <textarea
                  rows={4}
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.message}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, message: e.target.value }))
                  }
                  placeholder="Wellness message..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">Category</label>
                  <select
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value }))
                    }
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.scheduledDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, scheduledDate: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isActive: e.target.checked }))
                    }
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>

                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={form.isPinned}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isPinned: e.target.checked }))
                    }
                  />
                  <span className="text-sm text-gray-700">Pinned</span>
                </label>
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