import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { Plus, Trash2, Edit2, X, ChevronDown, ChevronUp, Eye } from "lucide-react";

const CONDITION_COLORS = { good: "bg-green-100 text-green-700", fair: "bg-orange-100 text-orange-700", poor: "bg-red-100 text-red-700" };

const toDateStr = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

const emptyArea = () => ({ areaId: `area_${Date.now()}`, label: "", icon: "🏠", items: [""] });
const emptyTemplate = () => ({ name: "", isDefault: false, areas: [emptyArea()] });

export default function InspectionPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const user = useSelector((s) => s.auth.user);
  const hostelId = String(emp?.hostelid || "");

  const [tab, setTab] = useState("inspections");
  const [inspections, setInspections] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [templateModal, setTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [tForm, setTForm] = useState(emptyTemplate());
  const [expandedAreas, setExpandedAreas] = useState({});

  const [viewModal, setViewModal] = useState(null);
  const [notesModal, setNotesModal] = useState(null);
  const [adminNote, setAdminNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (hostelId) { loadInspections(); loadTemplates(); } }, [hostelId]);

  const loadInspections = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "hostel", hostelId, "inspections"), orderBy("submittedAt", "desc")));
      setInspections(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load inspections"); }
    finally { setLoading(false); }
  };

  const loadTemplates = async () => {
    try {
      const snap = await getDocs(collection(db, "hostel", hostelId, "inspectionTemplates"));
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load templates"); }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return inspections.filter((i) => {
      const matchSearch = !term || i.studentId?.toLowerCase().includes(term) || i.roomNumber?.toLowerCase().includes(term);
      const matchType = typeFilter === "all" || i.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [inspections, search, typeFilter]);

  /* Template handlers */
  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTForm(emptyTemplate());
    setExpandedAreas({ 0: true });
    setTemplateModal(true);
  };

  const openEditTemplate = (t) => {
    setEditingTemplate(t);
    setTForm({ name: t.name || "", isDefault: !!t.isDefault, areas: t.areas?.length ? t.areas : [emptyArea()] });
    setExpandedAreas({});
    setTemplateModal(true);
  };

  const saveTemplate = async (e) => {
    e.preventDefault();
    if (!tForm.name.trim()) return toast.warn("Template name required");
    setSaving(true);
    try {
      const payload = {
        name: tForm.name.trim(),
        isDefault: tForm.isDefault,
        areas: tForm.areas.map((a) => ({ ...a, items: a.items.filter((it) => it.trim()) })),
        updatedAt: serverTimestamp(),
      };
      if (editingTemplate) {
        await updateDoc(doc(db, "hostel", hostelId, "inspectionTemplates", editingTemplate.id), payload);
        toast.success("Template updated");
      } else {
        await addDoc(collection(db, "hostel", hostelId, "inspectionTemplates"), { ...payload, createdAt: serverTimestamp(), createdBy: user?.uid || "" });
        toast.success("Template created");
      }
      setTemplateModal(false);
      loadTemplates();
    } catch (err) { console.error(err); toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try { await deleteDoc(doc(db, "hostel", hostelId, "inspectionTemplates", id)); toast.success("Deleted"); loadTemplates(); }
    catch { toast.error("Delete failed"); }
  };

  /* Area helpers */
  const addArea = () => {
    const newAreas = [...tForm.areas, emptyArea()];
    setTForm((f) => ({ ...f, areas: newAreas }));
    setExpandedAreas((e) => ({ ...e, [newAreas.length - 1]: true }));
  };

  const updateArea = (i, field, value) => {
    setTForm((f) => { const areas = [...f.areas]; areas[i] = { ...areas[i], [field]: value }; return { ...f, areas }; });
  };

  const removeArea = (i) => {
    if (tForm.areas.length <= 1) return toast.warn("At least one area required");
    setTForm((f) => ({ ...f, areas: f.areas.filter((_, idx) => idx !== i) }));
  };

  const updateItem = (ai, ii, value) => {
    setTForm((f) => {
      const areas = [...f.areas];
      const items = [...areas[ai].items];
      items[ii] = value;
      areas[ai] = { ...areas[ai], items };
      return { ...f, areas };
    });
  };

  const addItem = (ai) => {
    setTForm((f) => {
      const areas = [...f.areas];
      areas[ai] = { ...areas[ai], items: [...areas[ai].items, ""] };
      return { ...f, areas };
    });
  };

  const removeItem = (ai, ii) => {
    setTForm((f) => {
      const areas = [...f.areas];
      areas[ai] = { ...areas[ai], items: areas[ai].items.filter((_, idx) => idx !== ii) };
      return { ...f, areas };
    });
  };

  /* Admin notes */
  const saveAdminNote = async () => {
    if (!notesModal) return;
    try {
      await updateDoc(doc(db, "hostel", hostelId, "inspections", notesModal.id), { adminNotes: adminNote.trim(), updatedAt: serverTimestamp() });
      toast.success("Note saved");
      setNotesModal(null);
      loadInspections();
    } catch { toast.error("Save failed"); }
  };

  /* Condition summary for a submitted inspection */
  const conditionSummary = (items = {}) => {
    let good = 0, fair = 0, poor = 0;
    Object.values(items).forEach((v) => {
      if (v?.condition === "good") good++;
      else if (v?.condition === "fair") fair++;
      else if (v?.condition === "poor") poor++;
    });
    return { good, fair, poor };
  };

  if (!hostelId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl p-10 text-center text-gray-500">No hostel assigned.</div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Move In / Move Out Inspection</h1>
        {tab === "templates" && (
          <button onClick={openCreateTemplate} className="px-4 py-2 bg-black text-white rounded flex items-center gap-2">
            <Plus size={16} /> New Template
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {[{ key: "inspections", label: "Inspections" }, { key: "templates", label: "Templates" }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === key ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "inspections" && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap">
            <input className="flex-1 min-w-48 border border-gray-300 rounded px-3 py-2 text-sm bg-white"
              placeholder="Search student ID or room number..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="flex gap-2">
              {["all", "move_in", "move_out"].map((t) => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={`px-3 py-2 rounded text-sm capitalize ${typeFilter === t ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
                  {t === "all" ? "All" : t.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
          ) : (
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["Student ID", "Room", "Type", "Date", "Complete", "Condition Summary", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400">No inspections found.</td></tr>
                  ) : filtered.map((ins) => {
                    const { good, fair, poor } = conditionSummary(ins.items);
                    return (
                      <tr key={ins.id} className={ins.flaggedItems?.length ? "bg-orange-50" : ""}>
                        <td className="px-4 py-3 text-sm text-gray-700">{ins.studentId || "—"}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{ins.roomNumber || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${ins.type === "move_in" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                            {ins.type?.replace("_", " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{toDateStr(ins.submittedAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${ins.isComplete ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-600"}`}>
                            {ins.isComplete ? "Complete" : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="flex gap-2">
                            <span className="text-green-700 font-medium">✓{good}</span>
                            <span className="text-orange-600 font-medium">~{fair}</span>
                            <span className="text-red-600 font-medium">✗{poor}</span>
                            {ins.flaggedItems?.length > 0 && (
                              <span className="text-red-500 text-xs">({ins.flaggedItems.length} flagged)</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm flex items-center gap-2">
                          <button onClick={() => setViewModal(ins)} className="text-blue-600 hover:underline flex items-center gap-1">
                            <Eye size={14} /> View
                          </button>
                          <button onClick={() => { setNotesModal(ins); setAdminNote(ins.adminNotes || ""); }}
                            className="text-gray-600 hover:underline text-xs">Notes</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "templates" && (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Template Name", "Areas", "Default", "Actions"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-sm font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {templates.length === 0 ? (
                <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">No templates. Create one to define inspection checklists.</td></tr>
              ) : templates.map((t) => (
                <tr key={t.id}>
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{t.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{t.areas?.length || 0} areas</td>
                  <td className="px-6 py-4">
                    {t.isDefault && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Default</span>}
                  </td>
                  <td className="px-6 py-4 text-sm flex items-center gap-3">
                    <button onClick={() => openEditTemplate(t)} className="text-blue-600 hover:underline"><Edit2 size={14} /></button>
                    <button onClick={() => deleteTemplate(t.id)} className="text-red-600 hover:underline"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Template modal */}
      {templateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingTemplate ? "Edit Template" : "New Inspection Template"}</h2>
              <button onClick={() => setTemplateModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={saveTemplate} className="space-y-4">
              <div className="flex gap-3 items-center">
                <input className="flex-1 border border-gray-300 p-2 rounded" placeholder="Template name (e.g. Standard Studio)" required
                  value={tForm.name} onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap">
                  <input type="checkbox" checked={tForm.isDefault} onChange={(e) => setTForm((f) => ({ ...f, isDefault: e.target.checked }))} />
                  Set as default
                </label>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-medium">Room Areas</label>
                  <button type="button" onClick={addArea}
                    className="px-3 py-1 bg-gray-100 border border-gray-300 rounded text-sm flex items-center gap-1 hover:bg-gray-200">
                    <Plus size={13} /> Add Area
                  </button>
                </div>
                <div className="space-y-2">
                  {tForm.areas.map((area, ai) => (
                    <div key={ai} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedAreas((e) => ({ ...e, [ai]: !e[ai] }))}>
                        <div className="flex items-center gap-2">
                          <span>{area.icon}</span>
                          <span className="text-sm font-medium">{area.label || `Area ${ai + 1}`}</span>
                          <span className="text-xs text-gray-400">({area.items.filter(Boolean).length} items)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeArea(ai); }} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                          {expandedAreas[ai] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </div>
                      </div>
                      {expandedAreas[ai] && (
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-3">
                              <input className="w-full border border-gray-200 p-2 rounded text-sm" placeholder="Area label (e.g. Bathroom)"
                                value={area.label} onChange={(e) => updateArea(ai, "label", e.target.value)} />
                            </div>
                            <input className="border border-gray-200 p-2 rounded text-sm text-center" placeholder="🚿"
                              value={area.icon} onChange={(e) => updateArea(ai, "icon", e.target.value)} />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-xs text-gray-500">Checklist Items</span>
                              <button type="button" onClick={() => addItem(ai)} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                                <Plus size={12} /> Add Item
                              </button>
                            </div>
                            <div className="space-y-1.5">
                              {area.items.map((item, ii) => (
                                <div key={ii} className="flex items-center gap-2">
                                  <input className="flex-1 border border-gray-200 p-1.5 rounded text-sm" placeholder="e.g. Walls, Carpet condition"
                                    value={item} onChange={(e) => updateItem(ai, ii, e.target.value)} />
                                  <button type="button" onClick={() => removeItem(ai, ii)} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setTemplateModal(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : editingTemplate ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View inspection modal */}
      {viewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold capitalize">{viewModal.type?.replace("_", " ")} — Room {viewModal.roomNumber}</h2>
              <button onClick={() => setViewModal(null)}><X size={20} /></button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Submitted: {toDateStr(viewModal.submittedAt)}</p>
            {viewModal.adminNotes && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 text-sm text-yellow-800">
                <strong>Admin note:</strong> {viewModal.adminNotes}
              </div>
            )}
            <div className="space-y-2">
              {Object.entries(viewModal.items || {}).map(([label, v]) => (
                <div key={label} className="flex items-start justify-between gap-3 border border-gray-100 rounded p-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">{label}</p>
                    {v?.note && <p className="text-xs text-gray-500 mt-0.5">{v.note}</p>}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${CONDITION_COLORS[v?.condition] || "bg-gray-100 text-gray-500"}`}>
                    {v?.condition || "—"}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={() => setViewModal(null)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Admin notes modal */}
      {notesModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-sm p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-bold mb-3">Admin Notes</h2>
            <textarea rows={4} className="w-full border border-gray-300 p-2 rounded text-sm resize-none mb-4"
              placeholder="Internal notes (not visible to student)..."
              value={adminNote} onChange={(e) => setAdminNote(e.target.value)} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setNotesModal(null)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={saveAdminNote} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save Note</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
