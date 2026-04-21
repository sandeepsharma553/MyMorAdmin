import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { FadeLoader } from "react-spinners";

const EMPTY_CHECKLIST = { title: "", description: "", isPinned: false, tasks: [] };
const EMPTY_TASK = { title: "", description: "" };

const toTime = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

export default function UniversityChecklistPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [tab, setTab] = useState("checklists");
  const [items, setItems] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CHECKLIST);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (universityId) { load(); loadSubmissions(); } }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "checklists"), orderBy("createdAt", "desc")));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load checklists"); }
    finally { setLoading(false); }
  };

  const loadSubmissions = async () => {
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "checklistSubmissions"), orderBy("submittedAt", "desc")));
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {}
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY_CHECKLIST); setModalOpen(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ title: item.title || "", description: item.description || "", isPinned: !!item.isPinned, tasks: item.tasks || [] });
    setModalOpen(true);
  };

  const addTask = () => setForm(f => ({ ...f, tasks: [...f.tasks, { ...EMPTY_TASK }] }));
  const removeTask = (idx) => setForm(f => ({ ...f, tasks: f.tasks.filter((_, i) => i !== idx) }));
  const updateTask = (idx, field, value) => setForm(f => ({ ...f, tasks: f.tasks.map((t, i) => i === idx ? { ...t, [field]: value } : t) }));

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const data = { title: form.title, description: form.description, isPinned: form.isPinned, tasks: form.tasks, universityId, updatedAt: serverTimestamp() };
      if (editing?.id) {
        await updateDoc(doc(db, "university", universityId, "checklists", editing.id), data);
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "checklists"), { ...data, createdAt: serverTimestamp() });
        toast.success("Created!");
      }
      setModalOpen(false); load();
    } catch { toast.error("Save failed"); }
    finally { setSubmitting(false); }
  };

  const remove = async (item) => {
    if (!window.confirm("Delete this checklist?")) return;
    try {
      await deleteDoc(doc(db, "university", universityId, "checklists", item.id));
      toast.success("Deleted"); load();
    } catch { toast.error("Delete failed"); }
  };

  if (!universityId) return <div className="p-8 text-center text-gray-400">No university assigned.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Checklists</h1>
          <p className="text-sm text-gray-500 mt-1">Manage student checklists</p>
        </div>
        {tab === "checklists" && (
          <button onClick={openCreate} className="flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700">
            <Plus size={16} /> Add Checklist
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {["checklists", "submissions"].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-semibold rounded-lg capitalize ${tab === t ? "bg-green-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{t}</button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && tab === "checklists" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {items.length === 0
            ? <div className="text-center py-16 text-gray-400"><p className="text-lg font-semibold">No checklists yet</p></div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Title", "Description", "Tasks", "Pinned", "Actions"].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-800">{item.title}</td>
                      <td className="p-3 text-gray-500 max-w-xs"><p className="truncate">{item.description || "—"}</p></td>
                      <td className="p-3 text-gray-500">{(item.tasks || []).length} tasks</td>
                      <td className="p-3">{item.isPinned ? <span className="text-xs bg-yellow-100 text-yellow-700 font-bold px-2 py-1 rounded-full">Pinned</span> : "—"}</td>
                      <td className="p-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 size={15} className="text-blue-500" /></button>
                          <button onClick={() => remove(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Trash2 size={15} className="text-red-400" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {!loading && tab === "submissions" && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {submissions.length === 0
            ? <div className="text-center py-16 text-gray-400"><p className="text-lg font-semibold">No submissions yet</p></div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Checklist", "Submitted By", "Date", "Completed Tasks"].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {submissions.map(s => (
                    <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-800">{s.checklistTitle || "—"}</td>
                      <td className="p-3 text-gray-500">{s.submittedBy || "—"}</td>
                      <td className="p-3 text-gray-500 text-xs">{toTime(s.submittedAt)}</td>
                      <td className="p-3 text-gray-500">{(s.completedTasks || []).length} / {(s.totalTasks || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Checklist" : "Add Checklist"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">TITLE *</label>
                <input type="text" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Checklist title" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">DESCRIPTION</label>
                <textarea className="w-full border border-gray-200 rounded-lg p-2.5 text-sm resize-none focus:outline-none" rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description…" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isPinned} onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))} className="w-4 h-4 accent-green-700" />
                <span className="text-sm font-semibold text-gray-600">Pin this checklist</span>
              </label>
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs font-semibold text-gray-500">TASKS</label>
                  <button onClick={addTask} className="text-xs text-green-700 font-semibold hover:underline">+ Add Task</button>
                </div>
                {form.tasks.map((task, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-500 font-semibold">Task {idx + 1}</span>
                      <button onClick={() => removeTask(idx)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                    <input type="text" className="w-full border border-gray-100 rounded-lg p-2 text-sm focus:outline-none" placeholder="Task title" value={task.title} onChange={e => updateTask(idx, "title", e.target.value)} />
                    <input type="text" className="w-full border border-gray-100 rounded-lg p-2 text-sm focus:outline-none" placeholder="Task description" value={task.description} onChange={e => updateTask(idx, "description", e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={save} disabled={submitting} className="flex-1 py-2.5 bg-green-800 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">{submitting ? "Saving…" : editing ? "Update" : "Create"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
