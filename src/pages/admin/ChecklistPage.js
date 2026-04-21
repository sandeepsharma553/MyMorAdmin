import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, orderBy, serverTimestamp, where, getDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { Pin, PinOff, Plus, Trash2, Edit2, Eye, CheckCircle, XCircle, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

export default function ChecklistPage() {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [checklists, setChecklists] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("checklists"); // 'checklists' | 'submissions'
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Form state
  const [form, setForm] = useState({ title: "", description: "", isPinned: false, rank: 0 });
  const [tasks, setTasks] = useState([]); // [{title, description, rank, acceptedTypes}]
  const [submitting, setSubmitting] = useState(false);

  // Review modal
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewSub, setReviewSub] = useState(null);
  const [reviewComment, setReviewComment] = useState("");

  useEffect(() => { if (hostelId) { loadChecklists(); loadSubmissions(); } }, [hostelId]);

  const loadChecklists = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, "hostel", hostelId, "checklists"),
        orderBy("rank", "asc")
      ));
      setChecklists(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { toast.error("Failed to load checklists"); }
    finally { setLoading(false); }
  };

  const loadSubmissions = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, "hostel", hostelId, "checklistSubmissions"),
        orderBy("submittedAt", "desc")
      ));
      setSubmissions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.warn(e); }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ title: "", description: "", isPinned: false, rank: checklists.length });
    setTasks([]);
    setModalOpen(true);
  };

  const openEdit = (cl) => {
    setEditing(cl);
    setForm({ title: cl.title || "", description: cl.description || "", isPinned: !!cl.isPinned, rank: cl.rank || 0 });
    setTasks(Object.entries(cl.tasks || {}).map(([id, t]) => ({ ...t, _key: id })));
    setModalOpen(true);
  };

  const addTask = () => setTasks(prev => [...prev, { title: "", description: "", rank: prev.length, acceptedTypes: ["photo", "file"] }]);
  const removeTask = (idx) => setTasks(prev => prev.filter((_, i) => i !== idx));
  const updateTask = (idx, field, value) => setTasks(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  const toggleType = (idx, type) => {
    setTasks(prev => prev.map((t, i) => {
      if (i !== idx) return t;
      const types = t.acceptedTypes || [];
      return { ...t, acceptedTypes: types.includes(type) ? types.filter(x => x !== type) : [...types, type] };
    }));
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSubmitting(true);
    try {
      const tasksMap = {};
      tasks.forEach((t, idx) => {
        const key = t._key || `task_${Date.now()}_${idx}`;
        tasksMap[key] = { title: t.title, description: t.description || "", rank: idx, acceptedTypes: t.acceptedTypes || ["photo"] };
      });

      const data = {
        title: form.title.trim(),
        description: form.description.trim(),
        isPinned: form.isPinned,
        rank: Number(form.rank) || 0,
        isActive: true,
        tasks: tasksMap,
        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        await updateDoc(doc(db, "hostel", hostelId, "checklists", editing.id), data);
        toast.success("Checklist updated!");
      } else {
        await addDoc(collection(db, "hostel", hostelId, "checklists"), { ...data, createdAt: serverTimestamp(), createdBy: user.uid });
        toast.success("Checklist created!");
      }
      setModalOpen(false);
      loadChecklists();
    } catch (e) { toast.error("Save failed"); }
    finally { setSubmitting(false); }
  };

  const togglePin = async (cl) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "checklists", cl.id), { isPinned: !cl.isPinned });
      loadChecklists();
    } catch (e) { toast.error("Failed"); }
  };

  const toggleActive = async (cl) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "checklists", cl.id), { isActive: !cl.isActive });
      loadChecklists();
    } catch (e) { toast.error("Failed"); }
  };

  const deleteChecklist = async (cl) => {
    if (!window.confirm(`Delete "${cl.title}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "checklists", cl.id));
      loadChecklists();
      toast.success("Deleted");
    } catch (e) { toast.error("Delete failed"); }
  };

  const openReview = (sub) => {
    setReviewSub(sub);
    setReviewComment("");
    setReviewModal(true);
  };

  const submitReview = async (status) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "checklistSubmissions", reviewSub.id), {
        status,
        adminComment: reviewComment.trim() || null,
        reviewedAt: serverTimestamp(),
        reviewedBy: user.uid,
      });
      toast.success(status === "approved" ? "Approved!" : "Resubmit requested");
      setReviewModal(false);
      loadSubmissions();
    } catch (e) { toast.error("Review failed"); }
  };

  const pendingCount = submissions.filter(s => s.status === "submitted").length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Checklists</h1>
          <p className="text-sm text-gray-500 mt-1">Create and manage student checklists with proof uploads</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
        >
          <Plus size={16} /> New Checklist
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-gray-200">
        {[
          { key: "checklists", label: "Checklists" },
          { key: "submissions", label: `Submissions ${pendingCount > 0 ? `(${pendingCount} pending)` : ""}` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 px-1 font-semibold text-sm border-b-2 transition ${tab === t.key ? "border-green-800 text-green-800" : "border-transparent text-gray-500 hover:text-gray-700"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {/* Checklists tab */}
      {!loading && tab === "checklists" && (
        <div className="space-y-3">
          {checklists.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-semibold">No checklists yet</p>
              <p className="text-sm">Create your first checklist above</p>
            </div>
          )}
          {checklists.map(cl => (
            <div key={cl.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center p-4 gap-3">
                {cl.isPinned && <span className="text-xs bg-orange-100 text-orange-600 font-bold px-2 py-1 rounded-full">Pinned</span>}
                <div className="flex-1">
                  <h3 className="font-bold text-gray-800">{cl.title}</h3>
                  {cl.description && <p className="text-sm text-gray-500 mt-0.5">{cl.description}</p>}
                  <span className="text-xs text-gray-400">{Object.keys(cl.tasks || {}).length} tasks · Rank {cl.rank}</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-semibold ${cl.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {cl.isActive ? "Active" : "Inactive"}
                </span>
                <div className="flex gap-2">
                  <button onClick={() => togglePin(cl)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Toggle pin">
                    {cl.isPinned ? <PinOff size={16} className="text-orange-500" /> : <Pin size={16} className="text-gray-400" />}
                  </button>
                  <button onClick={() => toggleActive(cl)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Toggle active">
                    {cl.isActive ? <XCircle size={16} className="text-red-400" /> : <CheckCircle size={16} className="text-green-500" />}
                  </button>
                  <button onClick={() => openEdit(cl)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <Edit2 size={16} className="text-blue-500" />
                  </button>
                  <button onClick={() => deleteChecklist(cl)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    <Trash2 size={16} className="text-red-400" />
                  </button>
                  <button onClick={() => setExpandedId(expandedId === cl.id ? null : cl.id)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                    {expandedId === cl.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                </div>
              </div>
              {expandedId === cl.id && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-3 bg-gray-50">
                  <p className="text-xs font-semibold text-gray-500 mb-2">TASKS</p>
                  {Object.values(cl.tasks || {}).length === 0 && <p className="text-sm text-gray-400">No tasks defined</p>}
                  {Object.values(cl.tasks || {}).sort((a, b) => (a.rank || 0) - (b.rank || 0)).map((t, i) => (
                    <div key={i} className="flex items-start gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{t.title}</p>
                        {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                        <p className="text-xs text-gray-400">Accepts: {(t.acceptedTypes || []).join(", ")}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Submissions tab */}
      {!loading && tab === "submissions" && (
        <div className="space-y-3">
          {submissions.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-semibold">No submissions yet</p>
            </div>
          )}
          {submissions.map(sub => {
            const statusConfig = {
              submitted: { bg: "bg-blue-100", text: "text-blue-700", label: "Pending Review" },
              approved: { bg: "bg-green-100", text: "text-green-700", label: "Approved" },
              resubmit: { bg: "bg-red-100", text: "text-red-600", label: "Resubmit" },
            }[sub.status] || { bg: "bg-gray-100", text: "text-gray-600", label: sub.status };

            return (
              <div key={sub.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${statusConfig.bg} ${statusConfig.text}`}>{statusConfig.label}</span>
                      <span className="text-xs text-gray-400">{sub.checklistTitle} › {sub.taskTitle}</span>
                    </div>
                    <p className="font-semibold text-gray-800">{sub.userName} <span className="text-gray-400 font-normal text-sm">({sub.userEmail})</span></p>
                    {sub.adminComment && (
                      <p className="text-sm text-red-500 mt-1">Comment: {sub.adminComment}</p>
                    )}
                    {sub.fileUrls?.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {sub.fileUrls.map((url, i) => (
                          <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded hover:bg-gray-200 transition">
                            File {i + 1} ↗
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {sub.status === "submitted" && (
                    <button
                      onClick={() => openReview(sub)}
                      className="flex items-center gap-1 bg-green-800 text-white px-3 py-2 rounded-lg text-sm hover:bg-green-700 transition flex-shrink-0"
                    >
                      <Eye size={14} /> Review
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div className="bg-white rounded-2xl w-full max-w-2xl mx-4 p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-4">{editing ? "Edit Checklist" : "Create Checklist"}</h2>

            <div className="space-y-3 mb-5">
              <input
                className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                placeholder="Checklist title *"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
              <textarea
                className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-600"
                rows={2}
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={form.isPinned} onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))} className="accent-green-700" />
                  Pin to top
                </label>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span>Rank:</span>
                  <input
                    type="number"
                    className="border border-gray-200 rounded p-1 w-16 text-sm text-center"
                    value={form.rank}
                    onChange={e => setForm(f => ({ ...f, rank: e.target.value }))}
                    min={0}
                  />
                </div>
              </div>
            </div>

            {/* Tasks */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-700">Tasks</h3>
                <button onClick={addTask} className="text-sm text-green-700 font-semibold flex items-center gap-1 hover:text-green-800">
                  <Plus size={14} /> Add Task
                </button>
              </div>
              <div className="space-y-3">
                {tasks.map((t, idx) => (
                  <div key={idx} className="border border-gray-100 rounded-xl p-3 bg-gray-50">
                    <div className="flex gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{idx + 1}</span>
                      <input
                        className="flex-1 border border-gray-200 rounded-lg p-2 text-sm focus:outline-none"
                        placeholder="Task title *"
                        value={t.title}
                        onChange={e => updateTask(idx, "title", e.target.value)}
                      />
                      <button onClick={() => removeTask(idx)} className="text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <input
                      className="w-full border border-gray-200 rounded-lg p-2 text-sm mb-2 focus:outline-none"
                      placeholder="Description (optional)"
                      value={t.description || ""}
                      onChange={e => updateTask(idx, "description", e.target.value)}
                    />
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-xs text-gray-500 self-center">Accepted:</span>
                      {["photo", "video", "file"].map(type => (
                        <label key={type} className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={(t.acceptedTypes || []).includes(type)}
                            onChange={() => toggleType(idx, type)}
                            className="accent-green-700"
                          />
                          {type}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
                {tasks.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No tasks yet. Add tasks above.</p>}
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
              <button
                onClick={save}
                disabled={submitting}
                className="px-5 py-2 text-sm bg-green-800 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? "Saving…" : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && reviewSub && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl w-full max-w-md mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Review Submission</h2>
            <p className="text-sm text-gray-500 mb-3">{reviewSub.userName} · {reviewSub.taskTitle}</p>

            {reviewSub.fileUrls?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {reviewSub.fileUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                    className="text-sm bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-200">
                    View File {i + 1} ↗
                  </a>
                ))}
              </div>
            )}

            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm mb-4 resize-none"
              rows={3}
              placeholder="Add comment (required if requesting resubmit)"
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button onClick={() => setReviewModal(false)} className="flex-1 py-2 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50">Cancel</button>
              <button
                onClick={() => submitReview("resubmit")}
                disabled={!reviewComment.trim()}
                className="flex-1 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-1"><RotateCcw size={14} /> Resubmit</span>
              </button>
              <button
                onClick={() => submitReview("approved")}
                className="flex-1 py-2 text-sm bg-green-700 text-white rounded-lg hover:bg-green-800"
              >
                <span className="flex items-center justify-center gap-1"><CheckCircle size={14} /> Approve</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
