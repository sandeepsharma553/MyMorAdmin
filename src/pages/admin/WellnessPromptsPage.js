import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, Edit2, PlayCircle, PauseCircle, X } from "lucide-react";
import { FadeLoader } from "react-spinners";

export default function WellnessPromptsPage() {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ question: "", options: ["", "", "", ""] });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (hostelId) loadPrompts(); }, [hostelId]);

  const loadPrompts = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "hostel", hostelId, "wellnessPrompts"),
        orderBy("rank", "asc")
      ));
      setPrompts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast.error("Failed to load prompts"); }
    finally { setLoading(false); }
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
    setForm(f => {
      const opts = [...f.options];
      opts[idx] = val;
      return { ...f, options: opts };
    });
  };

  const addOption = () => setForm(f => ({ ...f, options: [...f.options, ""] }));
  const removeOption = (idx) => setForm(f => ({ ...f, options: f.options.filter((_, i) => i !== idx) }));

  const save = async () => {
    const cleanOpts = form.options.map(o => o.trim()).filter(Boolean);
    if (!form.question.trim()) { toast.error("Question is required"); return; }
    if (cleanOpts.length < 2) { toast.error("At least 2 options are required"); return; }

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
          ...data, createdAt: serverTimestamp(), createdBy: user.uid, activatedAt: null,
        });
        toast.success("Created!");
      }
      setModalOpen(false);
      loadPrompts();
    } catch { toast.error("Save failed"); }
    finally { setSubmitting(false); }
  };

  const activate = async (p) => {
    // Deactivate all others, then activate this one
    try {
      const now = new Date();
      const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const batch = prompts.map(pr =>
        updateDoc(doc(db, "hostel", hostelId, "wellnessPrompts", pr.id), {
          isActive: pr.id === p.id,
          activatedAt: pr.id === p.id ? serverTimestamp() : pr.activatedAt,
          expiresAt: pr.id === p.id ? expiry : pr.expiresAt,
        })
      );
      await Promise.all(batch);
      loadPrompts();
      toast.success("Prompt activated for 24 hours!");
    } catch { toast.error("Activation failed"); }
  };

  const deactivate = async (p) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "wellnessPrompts", p.id), { isActive: false });
      loadPrompts();
      toast.success("Deactivated");
    } catch { toast.error("Failed"); }
  };

  const deletePrompt = async (p) => {
    if (!window.confirm("Delete this prompt?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "wellnessPrompts", p.id));
      loadPrompts();
    } catch { toast.error("Delete failed"); }
  };

  const toDate = (v) => {
    if (!v) return "";
    const ms = v?.seconds ? v.seconds * 1000 : Date.parse(v);
    return ms ? new Date(ms).toLocaleString("en-GB") : "";
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Wellness Prompts</h1>
          <p className="text-sm text-gray-500 mt-1">Daily reflection questions shown to students for 24 hours</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          <Plus size={16} /> New Prompt
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
        <p className="text-sm text-blue-800 font-semibold">How it works</p>
        <p className="text-sm text-blue-700 mt-1">
          Only one prompt can be active at a time. When activated, it shows to students for 24 hours.
          After 24 hours it auto-expires. Students can respond anonymously or with their name.
        </p>
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && (
        <div className="space-y-3">
          {prompts.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-semibold">No prompts yet</p>
              <p className="text-sm">Create your first daily reflection question</p>
            </div>
          )}
          {prompts.map(p => (
            <div key={p.id} className={`bg-white rounded-xl border ${p.isActive ? "border-green-400" : "border-gray-100"} shadow-sm p-4`}>
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {p.isActive && (
                      <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                        🟢 Active
                      </span>
                    )}
                    {p.isActive && p.expiresAt && (
                      <span className="text-xs text-gray-400">Expires: {toDate(p.expiresAt)}</span>
                    )}
                  </div>
                  <p className="font-semibold text-gray-800 mb-2">{p.question}</p>
                  <div className="flex flex-wrap gap-2">
                    {(p.options || []).map((opt, i) => (
                      <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">{opt}</span>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {p.isActive ? (
                    <button onClick={() => deactivate(p)} title="Deactivate" className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <PauseCircle size={18} className="text-orange-500" />
                    </button>
                  ) : (
                    <button onClick={() => activate(p)} title="Activate for 24h" className="p-1.5 hover:bg-gray-100 rounded-lg">
                      <PlayCircle size={18} className="text-green-600" />
                    </button>
                  )}
                  <button onClick={() => openEdit(p)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <Edit2 size={16} className="text-blue-500" />
                  </button>
                  <button onClick={() => deletePrompt(p)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <Trash2 size={16} className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Prompt" : "New Prompt"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-1">QUESTION *</label>
              <textarea
                className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
                rows={3}
                placeholder="e.g. How did you manage stress this week?"
                value={form.question}
                onChange={e => setForm(f => ({ ...f, question: e.target.value }))}
              />
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-xs font-semibold text-gray-500">ANSWER OPTIONS (min 2)</label>
                <button onClick={addOption} className="text-xs text-green-700 font-semibold hover:text-green-800 flex items-center gap-0.5">
                  <Plus size={12} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {form.options.map((opt, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-bold flex-shrink-0">{idx + 1}</span>
                    <input
                      className="flex-1 border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none"
                      placeholder={`Option ${idx + 1}`}
                      value={opt}
                      onChange={e => updateOption(idx, e.target.value)}
                    />
                    {form.options.length > 2 && (
                      <button onClick={() => removeOption(idx)}>
                        <X size={14} className="text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={submitting} className="flex-1 py-2.5 bg-green-800 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {submitting ? "Saving…" : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
