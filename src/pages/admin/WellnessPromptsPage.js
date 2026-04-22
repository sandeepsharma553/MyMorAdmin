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
import {
  Plus,
  Trash2,
  Edit2,
  PlayCircle,
  PauseCircle,
  X,
} from "lucide-react";
import { FadeLoader } from "react-spinners";

export default function WellnessPromptsPage({ navbarHeight }) {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ question: "", options: ["", "", "", ""] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hostelId) loadPrompts();
  }, [hostelId]);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "hostel", hostelId, "wellnessPrompts"),
          orderBy("rank", "asc")
        )
      );
      setPrompts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error("Failed to load prompts");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ question: "", options: ["", "", "", ""] });
    setModalOpen(true);
  };

  const openEdit = (p) => {
    setEditing(p);
    const opts = Array.isArray(p.options) ? [...p.options] : [];
    while (opts.length < 4) opts.push("");
    setForm({ question: p.question || "", options: opts });
    setModalOpen(true);
  };

  const updateOption = (idx, val) => {
    setForm((f) => {
      const opts = [...f.options];
      opts[idx] = val;
      return { ...f, options: opts };
    });
  };

  const addOption = () => setForm((f) => ({ ...f, options: [...f.options, ""] }));
  const removeOption = (idx) =>
    setForm((f) => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));

  const save = async () => {
    const cleanOpts = form.options.map((o) => o.trim()).filter(Boolean);
    if (!form.question.trim()) {
      toast.error("Question is required");
      return;
    }
    if (cleanOpts.length < 2) {
      toast.error("At least 2 options are required");
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        question: form.question.trim(),
        options: cleanOpts,
        isActive: false,
        rank: editing?.rank ?? prompts.length,
        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        await updateDoc(doc(db, "hostel", hostelId, "wellnessPrompts", editing.id), data);
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "hostel", hostelId, "wellnessPrompts"), {
          ...data,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          activatedAt: null,
        });
        toast.success("Created!");
      }

      setModalOpen(false);
      loadPrompts();
    } catch {
      toast.error("Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const activate = async (p) => {
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const batch = prompts.map((pr) =>
        updateDoc(doc(db, "hostel", hostelId, "wellnessPrompts", pr.id), {
          isActive: pr.id === p.id,
          activatedAt: pr.id === p.id ? serverTimestamp() : pr.activatedAt,
          expiresAt: pr.id === p.id ? expiry : pr.expiresAt,
        })
      );

      await Promise.all(batch);
      loadPrompts();
      toast.success("Prompt activated for 24 hours!");
    } catch {
      toast.error("Activation failed");
    }
  };

  const deactivate = async (p) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "wellnessPrompts", p.id), {
        isActive: false,
      });
      loadPrompts();
      toast.success("Deactivated");
    } catch {
      toast.error("Failed");
    }
  };

  const deletePrompt = async (p) => {
    if (!window.confirm("Delete this prompt?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "wellnessPrompts", p.id));
      loadPrompts();
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const toDate = (v) => {
    if (!v) return "";
    const ms = v?.seconds ? v.seconds * 1000 : Date.parse(v);
    return ms ? new Date(ms).toLocaleString("en-GB") : "";
  };

  if (!hostelId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          No hostel assigned.
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Wellness Prompts</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
        >
          <Plus size={16} /> New Prompt
        </button>
      </div>

      <div className="bg-white rounded shadow p-4 mb-4 border border-gray-100">
        <p className="text-sm font-medium text-gray-700">How it works</p>
        <p className="text-sm text-gray-500 mt-1">
          Only one prompt can be active at a time. When activated, it shows to students for 24 hours.
          After 24 hours it auto-expires.
        </p>
      </div>

      <div className="bg-white rounded shadow">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={loading} />
          </div>
        ) : prompts.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">No prompts found.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {prompts.map((p) => (
              <div key={p.id} className="p-4">
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {p.isActive && (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                          Active
                        </span>
                      )}
                      {p.isActive && p.expiresAt && (
                        <span className="text-xs text-gray-400">
                          Expires: {toDate(p.expiresAt)}
                        </span>
                      )}
                    </div>

                    <p className="font-medium text-gray-800 mb-2">{p.question}</p>

                    <div className="flex flex-wrap gap-2">
                      {(p.options || []).map((opt, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                        >
                          {opt}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-2 flex-shrink-0">
                    {p.isActive ? (
                      <button
                        onClick={() => deactivate(p)}
                        className="text-orange-500 hover:underline inline-flex items-center gap-1"
                      >
                        <PauseCircle size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => activate(p)}
                        className="text-green-600 hover:underline inline-flex items-center gap-1"
                      >
                        <PlayCircle size={16} />
                      </button>
                    )}

                    <button
                      onClick={() => openEdit(p)}
                      className="text-blue-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Edit2 size={16} />
                    </button>

                    <button
                      onClick={() => deletePrompt(p)}
                      className="text-red-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editing ? "Edit Prompt" : "New Prompt"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="mb-4">
              <label className="block font-medium mb-1">Question</label>
              <textarea
                className="w-full border border-gray-300 rounded p-3 text-sm resize-none"
                rows={3}
                placeholder="e.g. How did you manage stress this week?"
                value={form.question}
                onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
              />
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="block font-medium">Answer Options</label>
                <button onClick={addOption} className="text-sm text-blue-600 hover:underline">
                  + Add
                </button>
              </div>

              <div className="space-y-2">
                {form.options.map((opt, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 text-xs flex items-center justify-center font-semibold">
                      {idx + 1}
                    </span>
                    <input
                      className="flex-1 border border-gray-300 rounded p-2 text-sm"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(idx, e.target.value)}
                    />
                    {form.options.length > 2 && (
                      <button onClick={() => removeOption(idx)} className="text-red-500 hover:text-red-700">
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
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
      )}
    </main>
  );
}