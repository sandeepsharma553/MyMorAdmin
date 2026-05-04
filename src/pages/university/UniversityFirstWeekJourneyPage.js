import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp, getDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronUp } from "lucide-react";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";
const COLORS = ["#4A90E2", "#7ED321", "#F5A623", "#D0021B", "#9B59B6", "#1ABC9C", "#E74C3C"];

const emptyDay = (n) => ({
  dayNumber: n,
  title: "",
  emoji: "📅",
  color: COLORS[n - 1] || "#4A90E2",
  tip: "",
  tasks: [],
});

const emptyTask = () => ({ id: `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: "", type: "actionable" });

const emptyForm = () => ({
  name: "",
  isActive: true,
  cohortStart: "",
  cohortEnd: "",
  days: [emptyDay(1)],
});

const toDateStr = (ts) => {
  if (!ts) return "";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
};

export default function UniversityFirstWeekJourneyPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const user = useSelector((s) => s.auth.user);
  const { universityId, filterByScope, scopePayload } = useUniversityScope();
  const hostelId = universityId; // university alias

  const [tab, setTab] = useState("templates");
  const [templates, setTemplates] = useState([]);
  const [analytics, setAnalytics] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [expandedDays, setExpandedDays] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (hostelId) loadTemplates(); }, [hostelId]);
  useEffect(() => { if (tab === "analytics" && hostelId) loadAnalytics(); }, [tab, hostelId]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "university", universityId, "journeyTemplates"), orderBy("createdAt", "desc"))
      );
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load templates"); }
    finally { setLoading(false); }
  };

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [tSnap, jSnap] = await Promise.all([
        getDocs(collection(db, "university", universityId, "journeyTemplates")),
        getDocs(collection(db, "university", universityId, "studentJourneys")),
      ]);
      const journeys = jSnap.docs.map((d) => d.data());
      const stats = tSnap.docs.map((d) => {
        const t = { id: d.id, ...d.data() };
        const assigned = journeys.filter((j) => j.templateId === d.id);
        const completed = assigned.filter((j) => !!j.completedAt).length;
        const dayStats = (t.days || []).map((day) => {
          const taskIds = (day.tasks || []).map((tk) => tk.id);
          const completedDay = assigned.filter((j) =>
            taskIds.every((tid) => (j.completedTasks || []).includes(tid))
          ).length;
          return { dayNumber: day.dayNumber, pct: assigned.length ? Math.round((completedDay / assigned.length) * 100) : 0 };
        });
        return { ...t, assignedCount: assigned.length, completedCount: completed, dayStats };
      });
      setAnalytics(stats);
    } catch { toast.error("Failed to load analytics"); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setExpandedDays({ 0: true });
    setModalOpen(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({
      name: t.name || "",
      isActive: t.isActive !== false,
      cohortStart: t.activeCohort?.startDate?.seconds
        ? new Date(t.activeCohort.startDate.seconds * 1000).toISOString().split("T")[0]
        : t.activeCohort?.startDate || "",
      cohortEnd: t.activeCohort?.endDate?.seconds
        ? new Date(t.activeCohort.endDate.seconds * 1000).toISOString().split("T")[0]
        : t.activeCohort?.endDate || "",
      days: t.days?.length ? t.days : [emptyDay(1)],
    });
    setExpandedDays({});
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.warn("Template name is required");
    if (!form.days.length) return toast.warn("Add at least one day");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        isActive: form.isActive,
        activeCohort: {
          startDate: form.cohortStart || null,
          endDate: form.cohortEnd || null,
        },
        days: form.days,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, "university", universityId, "journeyTemplates", editing.id), payload);
        toast.success("Template updated");
      } else {
        await addDoc(collection(db, "university", universityId, "journeyTemplates"), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user?.uid || "",
        });
        toast.success("Template created");
      }
      setModalOpen(false);
      loadTemplates();
    } catch (err) { console.error(err); toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this journey template?")) return;
    try {
      await deleteDoc(doc(db, "university", universityId, "journeyTemplates", id));
      toast.success("Deleted");
      loadTemplates();
    } catch { toast.error("Delete failed"); }
  };

  const toggleActive = async (t) => {
    try {
      await updateDoc(doc(db, "university", universityId, "journeyTemplates", t.id), { isActive: !t.isActive });
      loadTemplates();
    } catch { toast.error("Update failed"); }
  };

  /* ---- Day helpers ---- */
  const addDay = () => {
    if (form.days.length >= 7) return toast.warn("Maximum 7 days");
    const n = form.days.length + 1;
    const newDays = [...form.days, emptyDay(n)];
    setForm((f) => ({ ...f, days: newDays }));
    setExpandedDays((e) => ({ ...e, [newDays.length - 1]: true }));
  };

  const removeDay = (i) => {
    const newDays = form.days.filter((_, idx) => idx !== i).map((d, idx) => ({ ...d, dayNumber: idx + 1 }));
    setForm((f) => ({ ...f, days: newDays }));
  };

  const updateDay = (i, field, value) => {
    setForm((f) => {
      const days = [...f.days];
      days[i] = { ...days[i], [field]: value };
      return { ...f, days };
    });
  };

  const addTask = (di) => {
    setForm((f) => {
      const days = [...f.days];
      days[di] = { ...days[di], tasks: [...(days[di].tasks || []), emptyTask()] };
      return { ...f, days };
    });
  };

  const updateTask = (di, ti, field, value) => {
    setForm((f) => {
      const days = [...f.days];
      const tasks = [...(days[di].tasks || [])];
      tasks[ti] = { ...tasks[ti], [field]: value };
      days[di] = { ...days[di], tasks };
      return { ...f, days };
    });
  };

  const removeTask = (di, ti) => {
    setForm((f) => {
      const days = [...f.days];
      const tasks = days[di].tasks.filter((_, idx) => idx !== ti);
      days[di] = { ...days[di], tasks };
      return { ...f, days };
    });
  };

  if (!hostelId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl p-10 text-center text-gray-500">No university assigned.</div>
        <UniversityScopeBanner />
      <ToastContainer />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer position="top-right" autoClose={3000} />
      <UniversityScopeBanner />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">First Week Journey</h1>
        {tab === "templates" && (
          <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded flex items-center gap-2">
            <Plus size={16} /> New Template
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {["templates", "analytics"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium capitalize ${tab === t ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
      ) : tab === "templates" ? (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Template Name", "Cohort Dates", "Days", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-sm font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">No templates yet. Create one to get started.</td></tr>
              ) : templates.map((t) => (
                <tr key={t.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{t.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {t.activeCohort?.startDate && t.activeCohort?.endDate
                      ? `${toDateStr(t.activeCohort.startDate)} – ${toDateStr(t.activeCohort.endDate)}`
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{t.days?.length || 0} days</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${t.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm flex items-center gap-3">
                    <button onClick={() => openEdit(t)} className="text-blue-600 hover:underline flex items-center gap-1"><Edit2 size={14} /> Edit</button>
                    <button onClick={() => toggleActive(t)} className={`hover:underline flex items-center gap-1 ${t.isActive ? "text-orange-500" : "text-green-600"}`}>
                      {t.isActive ? "Deactivate" : "Activate"}
                    </button>
                    <button onClick={() => handleDelete(t.id)} className="text-red-600 hover:underline flex items-center gap-1"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Analytics tab */
        <div className="space-y-4">
          {analytics.length === 0 ? (
            <div className="bg-white rounded shadow p-10 text-center text-gray-400">No data yet.</div>
          ) : analytics.map((t) => (
            <div key={t.id} className="bg-white rounded shadow p-5">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-gray-800">{t.name}</h3>
                <span className="text-sm text-gray-500">{t.assignedCount} students assigned · {t.completedCount} completed</span>
              </div>
              <div className="flex flex-wrap gap-3">
                {t.dayStats?.map((ds) => (
                  <div key={ds.dayNumber} className="flex flex-col items-center bg-gray-50 border border-gray-200 rounded-lg p-3 w-24">
                    <span className="text-xs text-gray-500 mb-1">Day {ds.dayNumber}</span>
                    <span className="text-2xl font-bold text-blue-600">{ds.pct}%</span>
                    <div className="w-full bg-gray-200 rounded-full h-1.5 mt-2">
                      <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${ds.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editing ? "Edit Template" : "New Journey Template"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <input
                className="w-full border border-gray-300 p-2 rounded"
                placeholder="Template name (e.g. Semester 1 2026)"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Cohort Move-in From</label>
                  <input type="date" className="w-full border border-gray-300 p-2 rounded text-sm"
                    value={form.cohortStart}
                    onChange={(e) => setForm((f) => ({ ...f, cohortStart: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Cohort Move-in To</label>
                  <input type="date" className="w-full border border-gray-300 p-2 rounded text-sm"
                    value={form.cohortEnd}
                    onChange={(e) => setForm((f) => ({ ...f, cohortEnd: e.target.value }))} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                <span className="font-medium">Active (visible to students in cohort)</span>
              </label>

              {/* Day builder */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-medium">Days ({form.days.length}/7)</label>
                  <button type="button" onClick={addDay}
                    className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm flex items-center gap-1 hover:bg-gray-200">
                    <Plus size={13} /> Add Day
                  </button>
                </div>

                <div className="space-y-2">
                  {form.days.map((day, di) => (
                    <div key={di} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div
                        className="flex items-center justify-between px-4 py-2 bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedDays((e) => ({ ...e, [di]: !e[di] }))}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-700">Day {day.dayNumber}</span>
                          {day.emoji && <span>{day.emoji}</span>}
                          {day.title && <span className="text-sm text-gray-500">{day.title}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeDay(di); }}
                            className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                          {expandedDays[di] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>

                      {expandedDays[di] && (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">Day Title</label>
                              <input className="w-full border border-gray-300 p-2 rounded text-sm"
                                placeholder="e.g. Move-in Day"
                                value={day.title}
                                onChange={(e) => updateDay(di, "title", e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Emoji</label>
                              <input className="w-full border border-gray-300 p-2 rounded text-sm"
                                placeholder="🏠"
                                value={day.emoji}
                                onChange={(e) => updateDay(di, "emoji", e.target.value)} />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div className="col-span-2">
                              <label className="block text-xs text-gray-500 mb-1">Tip Message</label>
                              <input className="w-full border border-gray-300 p-2 rounded text-sm"
                                placeholder="Helpful tip for students on this day"
                                value={day.tip}
                                onChange={(e) => updateDay(di, "tip", e.target.value)} />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Colour</label>
                              <input type="color" className="w-full h-10 border border-gray-300 rounded cursor-pointer"
                                value={day.color}
                                onChange={(e) => updateDay(di, "color", e.target.value)} />
                            </div>
                          </div>

                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <label className="text-xs text-gray-500 font-medium">Tasks ({day.tasks?.length || 0})</label>
                              <button type="button" onClick={() => addTask(di)}
                                className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                <Plus size={12} /> Add Task
                              </button>
                            </div>
                            <div className="space-y-2">
                              {(day.tasks || []).map((task, ti) => (
                                <div key={task.id} className="flex items-center gap-2">
                                  <input className="flex-1 border border-gray-200 p-1.5 rounded text-sm"
                                    placeholder="Task description"
                                    value={task.text}
                                    onChange={(e) => updateTask(di, ti, "text", e.target.value)} />
                                  <select
                                    className="border border-gray-200 p-1.5 rounded text-xs"
                                    value={task.type}
                                    onChange={(e) => updateTask(di, ti, "type", e.target.value)}>
                                    <option value="actionable">Actionable</option>
                                    <option value="informational">Informational</option>
                                  </select>
                                  <button type="button" onClick={() => removeTask(di, ti)} className="text-red-400 hover:text-red-600">
                                    <X size={14} />
                                  </button>
                                </div>
                              ))}
                              {!day.tasks?.length && (
                                <p className="text-xs text-gray-400">No tasks yet. Add tasks for students to complete on this day.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
