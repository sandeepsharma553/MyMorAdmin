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
  doc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Pin,
  PinOff,
  Plus,
  Trash2,
  Edit2,
  Eye,
  CheckCircle,
  XCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react";
import { FadeLoader } from "react-spinners";

export default function UniversityChecklistPage({ navbarHeight }) {
  const user = useSelector((state) => state.auth.user);
  const { universityId, filterByScope, scopePayload } = useUniversityScope();

  const [checklists, setChecklists] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("checklists");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    isPinned: false,
    rank: 0,
  });

  const [tasks, setTasks] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [reviewModal, setReviewModal] = useState(false);
  const [reviewSub, setReviewSub] = useState(null);
  const [reviewComment, setReviewComment] = useState("");

  useEffect(() => {
    if (universityId) {
      loadChecklists();
      loadSubmissions();
    }
  }, [universityId]);

  const loadChecklists = async () => {
    setLoading(true);

    try {
      const snap = await getDocs(
        query(
          collection(db, "university", universityId, "checklists"),
          orderBy("rank", "asc")
        )
      );

      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setChecklists(filterByScope(list));
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      console.warn(e);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: "",
      description: "",
      isPinned: false,
      rank: checklists.length,
    });
    setTasks([]);
    setModalOpen(true);
  };

  const openEdit = (cl) => {
    setEditing(cl);

    setForm({
      title: cl.title || "",
      description: cl.description || "",
      isPinned: !!cl.isPinned,
      rank: cl.rank || 0,
    });

    if (Array.isArray(cl.tasks)) {
      setTasks(
        cl.tasks.map((t, idx) => ({
          ...t,
          _key: t.id || t._key || `task_${idx}`,
          rank: t.rank ?? idx,
          acceptedTypes: t.acceptedTypes || ["photo", "file"],
        }))
      );
    } else {
      setTasks(
        Object.entries(cl.tasks || {})
          .map(([id, t]) => ({ ...t, _key: id }))
          .sort((a, b) => (a.rank || 0) - (b.rank || 0))
      );
    }

    setModalOpen(true);
  };

  const addTask = () =>
    setTasks((prev) => [
      ...prev,
      {
        title: "",
        description: "",
        rank: prev.length,
        acceptedTypes: ["photo", "file"],
      },
    ]);

  const removeTask = (idx) =>
    setTasks((prev) => prev.filter((_, i) => i !== idx));

  const updateTask = (idx, field, value) =>
    setTasks((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [field]: value } : t))
    );

  const toggleType = (idx, type) => {
    setTasks((prev) =>
      prev.map((t, i) => {
        if (i !== idx) return t;

        const types = t.acceptedTypes || [];

        return {
          ...t,
          acceptedTypes: types.includes(type)
            ? types.filter((x) => x !== type)
            : [...types, type],
        };
      })
    );
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }

    setSubmitting(true);

    try {
      const tasksMap = {};

      tasks.forEach((t, idx) => {
        const key = t._key || `task_${Date.now()}_${idx}`;

        tasksMap[key] = {
          title: t.title || "",
          description: t.description || "",
          rank: idx,
          acceptedTypes: t.acceptedTypes || ["photo"],
        };
      });

      const data = {
        ...scopePayload,
        universityId,
        title: form.title.trim(),
        description: form.description.trim(),
        isPinned: form.isPinned,
        rank: Number(form.rank) || 0,
        isActive: true,
        tasks: tasksMap,
        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        await updateDoc(
          doc(db, "university", universityId, "checklists", editing.id),
          data
        );
        toast.success("Checklist updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "checklists"), {
          ...data,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "",
        });
        toast.success("Checklist created!");
      }

      setModalOpen(false);
      loadChecklists();
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePin = async (cl) => {
    try {
      await updateDoc(
        doc(db, "university", universityId, "checklists", cl.id),
        {
          isPinned: !cl.isPinned,
        }
      );

      loadChecklists();
    } catch {
      toast.error("Failed");
    }
  };

  const toggleActive = async (cl) => {
    try {
      await updateDoc(
        doc(db, "university", universityId, "checklists", cl.id),
        {
          isActive: !cl.isActive,
        }
      );

      loadChecklists();
    } catch {
      toast.error("Failed");
    }
  };

  const deleteChecklist = async (cl) => {
    if (!window.confirm(`Delete "${cl.title}"? This cannot be undone.`)) return;

    try {
      await deleteDoc(
        doc(db, "university", universityId, "checklists", cl.id)
      );

      loadChecklists();
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const openReview = (sub) => {
    setReviewSub(sub);
    setReviewComment("");
    setReviewModal(true);
  };

  const submitReview = async (status) => {
    try {
      await updateDoc(
        doc(db, "university", universityId, "checklistSubmissions", reviewSub.id),
        {
          status,
          adminComment: reviewComment.trim() || null,
          reviewedAt: serverTimestamp(),
          reviewedBy: user?.uid || "",
        }
      );

      toast.success(status === "approved" ? "Approved!" : "Resubmit requested");
      setReviewModal(false);
      loadSubmissions();
    } catch {
      toast.error("Review failed");
    }
  };

  const pendingCount = submissions.filter((s) => s.status === "submitted").length;

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
        <h1 className="text-2xl font-semibold">University Checklists</h1>

        <button
          onClick={openCreate}
          className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
        >
          <Plus size={16} /> New Checklist
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {[
          { key: "checklists", label: "Checklists" },
          {
            key: "submissions",
            label: `Submissions${pendingCount > 0 ? ` (${pendingCount} pending)` : ""}`,
          },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded text-sm font-medium ${
              tab === t.key
                ? "bg-black text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bg-white rounded shadow min-h-[300px] flex justify-center items-center">
          <FadeLoader color="#36d7b7" loading={loading} />
        </div>
      ) : tab === "checklists" ? (
        <div className="space-y-3">
          {checklists.length === 0 ? (
            <div className="bg-white rounded shadow px-6 py-16 text-center text-gray-500">
              No checklists found.
            </div>
          ) : (
            checklists.map((cl) => (
              <div key={cl.id} className="bg-white rounded shadow overflow-hidden">
                <div className="flex items-center p-4 gap-3">
                  {cl.isPinned && (
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-600">
                      Pinned
                    </span>
                  )}

                  <div className="flex-1">
                    <h3 className="font-medium text-gray-800">{cl.title}</h3>

                    {cl.description && (
                      <p className="text-sm text-gray-500 mt-1">
                        {cl.description}
                      </p>
                    )}

                    <span className="text-xs text-gray-400">
                      {Object.keys(cl.tasks || {}).length} tasks · Rank {cl.rank}
                    </span>
                  </div>

                  <span
                    className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      cl.isActive
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {cl.isActive ? "Active" : "Inactive"}
                  </span>

                  <div className="flex gap-2">
                    <button
                      onClick={() => togglePin(cl)}
                      className="text-gray-600 hover:underline"
                    >
                      {cl.isPinned ? <PinOff size={16} /> : <Pin size={16} />}
                    </button>

                    <button
                      onClick={() => toggleActive(cl)}
                      className="text-gray-600 hover:underline"
                    >
                      {cl.isActive ? <XCircle size={16} /> : <CheckCircle size={16} />}
                    </button>

                    <button
                      onClick={() => openEdit(cl)}
                      className="text-blue-600 hover:underline"
                    >
                      <Edit2 size={16} />
                    </button>

                    <button
                      onClick={() => deleteChecklist(cl)}
                      className="text-red-600 hover:underline"
                    >
                      <Trash2 size={16} />
                    </button>

                    <button
                      onClick={() =>
                        setExpandedId(expandedId === cl.id ? null : cl.id)
                      }
                      className="text-gray-600 hover:underline"
                    >
                      {expandedId === cl.id ? (
                        <ChevronUp size={16} />
                      ) : (
                        <ChevronDown size={16} />
                      )}
                    </button>
                  </div>
                </div>

                {expandedId === cl.id && (
                  <div className="border-t border-gray-200 px-4 py-4 bg-gray-50">
                    <p className="text-xs font-medium text-gray-500 mb-3">
                      Tasks
                    </p>

                    {Object.values(cl.tasks || {}).length === 0 ? (
                      <p className="text-sm text-gray-400">No tasks defined</p>
                    ) : (
                      <div className="space-y-3">
                        {Object.values(cl.tasks || {})
                          .sort((a, b) => (a.rank || 0) - (b.rank || 0))
                          .map((t, i) => (
                            <div key={i} className="flex items-start gap-3">
                              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0 mt-0.5">
                                {i + 1}
                              </span>

                              <div>
                                <p className="text-sm font-medium text-gray-700">
                                  {t.title}
                                </p>

                                {t.description && (
                                  <p className="text-xs text-gray-500">
                                    {t.description}
                                  </p>
                                )}

                                <p className="text-xs text-gray-400">
                                  Accepts: {(t.acceptedTypes || []).join(", ")}
                                </p>
                              </div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {submissions.length === 0 ? (
            <div className="bg-white rounded shadow px-6 py-16 text-center text-gray-500">
              No submissions found.
            </div>
          ) : (
            submissions.map((sub) => {
              const statusConfig =
                {
                  submitted: {
                    bg: "bg-blue-100",
                    text: "text-blue-700",
                    label: "Pending Review",
                  },
                  approved: {
                    bg: "bg-green-100",
                    text: "text-green-700",
                    label: "Approved",
                  },
                  resubmit: {
                    bg: "bg-red-100",
                    text: "text-red-600",
                    label: "Resubmit",
                  },
                }[sub.status] || {
                  bg: "bg-gray-100",
                  text: "text-gray-600",
                  label: sub.status,
                };

              return (
                <div key={sub.id} className="bg-white rounded shadow p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}
                        >
                          {statusConfig.label}
                        </span>

                        <span className="text-xs text-gray-400">
                          {sub.checklistTitle} › {sub.taskTitle}
                        </span>
                      </div>

                      <p className="font-medium text-gray-800">
                        {sub.userName || "Student"}{" "}
                        <span className="text-gray-400 font-normal text-sm">
                          ({sub.userEmail || "—"})
                        </span>
                      </p>

                      {sub.adminComment && (
                        <p className="text-sm text-red-500 mt-1">
                          Comment: {sub.adminComment}
                        </p>
                      )}

                      {sub.fileUrls?.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {sub.fileUrls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1 rounded border border-gray-300 text-sm text-blue-600 hover:bg-gray-50"
                            >
                              File {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {sub.status === "submitted" && (
                      <button
                        onClick={() => openReview(sub)}
                        className="px-4 py-2 bg-black text-white rounded hover:bg-black text-sm inline-flex items-center gap-2"
                      >
                        <Eye size={14} /> Review
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-start justify-center overflow-y-auto py-8 z-50">
          <div className="bg-white w-full max-w-2xl mx-4 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editing ? "Edit Checklist" : "Create Checklist"}
              </h2>

              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <input
                className="w-full border border-gray-300 rounded p-3 text-sm"
                placeholder="Checklist title *"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
              />

              <textarea
                className="w-full border border-gray-300 rounded p-3 text-sm resize-none"
                rows={2}
                placeholder="Description (optional)"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isPinned}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, isPinned: e.target.checked }))
                    }
                  />
                  Pin to top
                </label>

                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Rank:</span>
                  <input
                    type="number"
                    className="border border-gray-300 rounded p-1 w-16 text-sm text-center"
                    value={form.rank}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, rank: e.target.value }))
                    }
                    min={0}
                  />
                </div>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-700">Tasks</h3>

                <button
                  onClick={addTask}
                  className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  <Plus size={14} /> Add Task
                </button>
              </div>

              <div className="space-y-3">
                {tasks.map((t, idx) => (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded p-3 bg-gray-50"
                  >
                    <div className="flex gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold flex items-center justify-center flex-shrink-0">
                        {idx + 1}
                      </span>

                      <input
                        className="flex-1 border border-gray-300 rounded p-2 text-sm"
                        placeholder="Task title *"
                        value={t.title}
                        onChange={(e) => updateTask(idx, "title", e.target.value)}
                      />

                      <button
                        onClick={() => removeTask(idx)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <input
                      className="w-full border border-gray-300 rounded p-2 text-sm mb-2"
                      placeholder="Description (optional)"
                      value={t.description || ""}
                      onChange={(e) =>
                        updateTask(idx, "description", e.target.value)
                      }
                    />

                    <div className="flex gap-4 flex-wrap">
                      <span className="text-xs text-gray-500 self-center">
                        Accepted:
                      </span>

                      {["photo", "video", "file"].map((type) => (
                        <label
                          key={type}
                          className="flex items-center gap-1 text-xs text-gray-700"
                        >
                          <input
                            type="checkbox"
                            checked={(t.acceptedTypes || []).includes(type)}
                            onChange={() => toggleType(idx, type)}
                          />
                          {type}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {tasks.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No tasks yet. Add tasks above.
                  </p>
                )}
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

      {reviewModal && reviewSub && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md mx-4 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-1">Review Submission</h2>

            <p className="text-sm text-gray-500 mb-3">
              {reviewSub.userName || "Student"} · {reviewSub.taskTitle}
            </p>

            {reviewSub.fileUrls?.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {reviewSub.fileUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 rounded border border-gray-300 text-sm text-blue-600 hover:bg-gray-50"
                  >
                    View File {i + 1}
                  </a>
                ))}
              </div>
            )}

            <textarea
              className="w-full border border-gray-300 rounded p-3 text-sm mb-4 resize-none"
              rows={3}
              placeholder="Add comment (required if requesting resubmit)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setReviewModal(false)}
                className="flex-1 py-2 text-sm bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>

              <button
                onClick={() => submitReview("resubmit")}
                disabled={!reviewComment.trim()}
                className="flex-1 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-40 inline-flex items-center justify-center gap-1"
              >
                <RotateCcw size={14} /> Resubmit
              </button>

              <button
                onClick={() => submitReview("approved")}
                className="flex-1 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 inline-flex items-center justify-center gap-1"
              >
                <CheckCircle size={14} /> Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}