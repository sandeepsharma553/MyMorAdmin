import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronUp, Download } from "lucide-react";

const UNLOCK_RULES = [
  { value: "always", label: "Always Unlocked" },
  { value: "after_previous", label: "Unlocks After Previous" },
  { value: "on_date", label: "Unlocks on Date" },
];

const emptySlide = () => ({ heading: "", body: "", emoji: "📖" });

const emptyForm = () => ({
  title: "",
  icon: "📚",
  color: "#4A90E2",
  estimatedMinutes: 5,
  unlockRule: "always",
  unlockDate: "",
  isRequired: true,
  order: 1,
  isActive: true,
  slides: [emptySlide()],
});

export default function OrientationPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const user = useSelector((s) => s.auth.user);
  const hostelId = String(emp?.hostelid || "");

  const [tab, setTab] = useState("modules");
  const [modules, setModules] = useState([]);
  const [students, setStudents] = useState([]);
  const [orientations, setOrientations] = useState([]);
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [expandedSlides, setExpandedSlides] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (hostelId) loadModules(); }, [hostelId]);
  useEffect(() => { if (tab === "completion" && hostelId) loadCompletion(); }, [tab, hostelId]);

  const loadModules = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "hostel", hostelId, "orientationModules"), orderBy("order", "asc")));
      setModules(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load modules"); }
    finally { setLoading(false); }
  };

  const loadCompletion = async () => {
    setLoading(true);
    try {
      const [sSnap, oSnap] = await Promise.all([
        getDocs(query(collection(db, "users"), ...[])),
        getDocs(collection(db, "hostel", hostelId, "studentOrientation")),
      ]);
      // Filter users by hostelid
      const studs = sSnap.docs.map((d) => ({ uid: d.id, ...d.data() })).filter((s) => s.hostelid === hostelId);
      const ors = oSnap.docs.reduce((acc, d) => { acc[d.id] = d.data(); return acc; }, {});
      setStudents(studs);
      setOrientations(ors);
    } catch { toast.error("Failed to load completion data"); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null);
    const nextOrder = modules.length > 0 ? Math.max(...modules.map((m) => m.order || 0)) + 1 : 1;
    setForm({ ...emptyForm(), order: nextOrder });
    setExpandedSlides({ 0: true });
    setModalOpen(true);
  };

  const openEdit = (m) => {
    setEditing(m);
    setForm({
      title: m.title || "",
      icon: m.icon || "📚",
      color: m.color || "#4A90E2",
      estimatedMinutes: m.estimatedMinutes || 5,
      unlockRule: m.unlockRule || "always",
      unlockDate: m.unlockDate?.seconds
        ? new Date(m.unlockDate.seconds * 1000).toISOString().split("T")[0]
        : m.unlockDate || "",
      isRequired: m.isRequired !== false,
      order: m.order || 1,
      isActive: m.isActive !== false,
      slides: m.slides?.length ? m.slides : [emptySlide()],
    });
    setExpandedSlides({});
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.warn("Title is required");
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        icon: form.icon,
        color: form.color,
        estimatedMinutes: Number(form.estimatedMinutes) || 5,
        unlockRule: form.unlockRule,
        unlockDate: form.unlockRule === "on_date" && form.unlockDate ? form.unlockDate : null,
        isRequired: form.isRequired,
        order: Number(form.order) || 1,
        isActive: form.isActive,
        slides: form.slides,
        updatedAt: serverTimestamp(),
      };
      if (editing) {
        await updateDoc(doc(db, "hostel", hostelId, "orientationModules", editing.id), payload);
        toast.success("Module updated");
      } else {
        await addDoc(collection(db, "hostel", hostelId, "orientationModules"), {
          ...payload, createdAt: serverTimestamp(), createdBy: user?.uid || "",
        });
        toast.success("Module created");
      }
      setModalOpen(false);
      loadModules();
    } catch (err) { console.error(err); toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this module?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "orientationModules", id));
      toast.success("Deleted");
      loadModules();
    } catch { toast.error("Delete failed"); }
  };

  const toggleActive = async (m) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "orientationModules", m.id), { isActive: !m.isActive });
      loadModules();
    } catch { toast.error("Update failed"); }
  };

  /* Slide helpers */
  const addSlide = () => {
    const newSlides = [...form.slides, emptySlide()];
    setForm((f) => ({ ...f, slides: newSlides }));
    setExpandedSlides((e) => ({ ...e, [newSlides.length - 1]: true }));
  };

  const updateSlide = (i, field, value) => {
    setForm((f) => {
      const slides = [...f.slides];
      slides[i] = { ...slides[i], [field]: value };
      return { ...f, slides };
    });
  };

  const removeSlide = (i) => {
    if (form.slides.length <= 1) return toast.warn("At least one slide required");
    setForm((f) => ({ ...f, slides: f.slides.filter((_, idx) => idx !== i) }));
  };

  /* CSV export */
  const exportCSV = () => {
    const requiredModuleIds = modules.filter((m) => m.isRequired).map((m) => m.id);
    const rows = [["Student Name", "Email", "Required Completed", "All Required Done", "Last Active Module"]];
    students.forEach((s) => {
      const or = orientations[s.uid] || {};
      const completedRequired = requiredModuleIds.filter((id) => (or.completedModules || []).includes(id)).length;
      rows.push([
        `${s.firstname || ""} ${s.lastname || ""}`.trim(),
        s.email || "",
        `${completedRequired}/${requiredModuleIds.length}`,
        or.allRequiredDone ? "Yes" : "No",
        or.lastActiveModule || "—",
      ]);
    });
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "orientation_completion.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  if (!hostelId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl p-10 text-center text-gray-500">No hostel assigned.</div>
        <ToastContainer />
      </main>
    );
  }

  const requiredIds = modules.filter((m) => m.isRequired).map((m) => m.id);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Orientation Modules</h1>
        <div className="flex gap-2">
          {tab === "completion" && (
            <button onClick={exportCSV} className="px-4 py-2 bg-gray-200 rounded flex items-center gap-2 text-sm hover:bg-gray-300">
              <Download size={15} /> Export CSV
            </button>
          )}
          {tab === "modules" && (
            <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded flex items-center gap-2">
              <Plus size={16} /> New Module
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {["modules", "completion"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium capitalize ${tab === t ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {t === "completion" ? "Completion Dashboard" : "Modules"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
      ) : tab === "modules" ? (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Order", "Module", "Slides", "Est. Time", "Unlock Rule", "Required", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-sm font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {modules.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">No modules yet.</td></tr>
              ) : modules.map((m) => (
                <tr key={m.id}>
                  <td className="px-4 py-4 text-sm text-gray-600">{m.order}</td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{m.icon}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{m.title}</p>
                        <div className="w-3 h-3 rounded-full inline-block mt-0.5" style={{ backgroundColor: m.color }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">{m.slides?.length || 0}</td>
                  <td className="px-4 py-4 text-sm text-gray-600">~{m.estimatedMinutes} min</td>
                  <td className="px-4 py-4 text-sm text-gray-600 capitalize">{m.unlockRule?.replace("_", " ")}</td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.isRequired ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"}`}>
                      {m.isRequired ? "Required" : "Optional"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${m.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {m.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm flex items-center gap-2">
                    <button onClick={() => openEdit(m)} className="text-blue-600 hover:underline"><Edit2 size={14} /></button>
                    <button onClick={() => toggleActive(m)} className={`hover:underline text-xs ${m.isActive ? "text-orange-500" : "text-green-600"}`}>
                      {m.isActive ? "Hide" : "Show"}
                    </button>
                    <button onClick={() => handleDelete(m.id)} className="text-red-600 hover:underline"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Completion dashboard */
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Student", "Email", `Required (${requiredIds.length})`, "All Done", "Last Active"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-sm font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {students.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">No students found.</td></tr>
              ) : students.map((s) => {
                const or = orientations[s.uid] || {};
                const completedReq = requiredIds.filter((id) => (or.completedModules || []).includes(id)).length;
                return (
                  <tr key={s.uid}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{`${s.firstname || ""} ${s.lastname || ""}`.trim() || "—"}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{s.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <span>{completedReq}/{requiredIds.length}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full"
                            style={{ width: requiredIds.length ? `${(completedReq / requiredIds.length) * 100}%` : "0%" }} />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${or.allRequiredDone ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-600"}`}>
                        {or.allRequiredDone ? "Complete" : "In Progress"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{or.lastActiveModule ? modules.find((m) => m.id === or.lastActiveModule)?.title || or.lastActiveModule : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editing ? "Edit Module" : "New Module"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <div className="col-span-3">
                  <label className="block text-xs text-gray-500 mb-1">Title</label>
                  <input className="w-full border border-gray-300 p-2 rounded"
                    placeholder="e.g. Safety & Emergency"
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Icon (emoji)</label>
                  <input className="w-full border border-gray-300 p-2 rounded text-center text-xl"
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Colour</label>
                  <input type="color" className="w-full h-10 border border-gray-300 rounded"
                    value={form.color}
                    onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Est. Minutes</label>
                  <input type="number" min={1} className="w-full border border-gray-300 p-2 rounded"
                    value={form.estimatedMinutes}
                    onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Display Order</label>
                  <input type="number" min={1} className="w-full border border-gray-300 p-2 rounded"
                    value={form.order}
                    onChange={(e) => setForm((f) => ({ ...f, order: e.target.value }))} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unlock Rule</label>
                  <select className="w-full border border-gray-300 p-2 rounded"
                    value={form.unlockRule}
                    onChange={(e) => setForm((f) => ({ ...f, unlockRule: e.target.value }))}>
                    {UNLOCK_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                {form.unlockRule === "on_date" && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Unlock Date</label>
                    <input type="date" className="w-full border border-gray-300 p-2 rounded"
                      value={form.unlockDate}
                      onChange={(e) => setForm((f) => ({ ...f, unlockDate: e.target.value }))} />
                  </div>
                )}
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isRequired}
                    onChange={(e) => setForm((f) => ({ ...f, isRequired: e.target.checked }))} />
                  Required
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.isActive}
                    onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  Active (visible to students)
                </label>
              </div>

              {/* Slides */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-medium">Slides ({form.slides.length})</label>
                  <button type="button" onClick={addSlide}
                    className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm flex items-center gap-1 hover:bg-gray-200">
                    <Plus size={13} /> Add Slide
                  </button>
                </div>
                <div className="space-y-2">
                  {form.slides.map((slide, i) => (
                    <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedSlides((e) => ({ ...e, [i]: !e[i] }))}>
                        <span className="text-sm font-medium">Slide {i + 1}{slide.heading ? ` — ${slide.heading}` : ""}</span>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeSlide(i); }}
                            className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                          {expandedSlides[i] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      {expandedSlides[i] && (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-3">
                              <input className="w-full border border-gray-200 p-2 rounded text-sm"
                                placeholder="Slide heading"
                                value={slide.heading}
                                onChange={(e) => updateSlide(i, "heading", e.target.value)} />
                            </div>
                            <div>
                              <input className="w-full border border-gray-200 p-2 rounded text-sm text-center"
                                placeholder="Emoji"
                                value={slide.emoji}
                                onChange={(e) => updateSlide(i, "emoji", e.target.value)} />
                            </div>
                          </div>
                          <textarea className="w-full border border-gray-200 p-2 rounded text-sm resize-none" rows={3}
                            placeholder="Slide body text..."
                            value={slide.body}
                            onChange={(e) => updateSlide(i, "body", e.target.value)} />
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
