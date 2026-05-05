import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import {
  Plus, Trash2, Edit2, X, ChevronDown, ChevronUp, Eye,
  RefreshCw, RotateCcw, Camera, FileText,
} from "lucide-react";

// ─── helpers ──────────────────────────────────────────────────────────────────
const CONDITION_COLORS = {
  good: "bg-green-100 text-green-700 border-green-200",
  fair: "bg-orange-100 text-orange-700 border-orange-200",
  poor: "bg-red-100 text-red-700 border-red-200",
};
const CONDITION_ICONS = { good: "✓", fair: "~", poor: "✗" };

const toDateStr = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

// Handle both old {items: {label: {condition}}} and new {areas: [{items: [{label,condition}]}]}
const conditionSummary = (ins) => {
  let good = 0, fair = 0, poor = 0;
  if (ins.areas?.length) {
    ins.areas.forEach((a) =>
      (a.items || []).forEach((it) => {
        if (it.condition === "good") good++;
        else if (it.condition === "fair") fair++;
        else if (it.condition === "poor") poor++;
      })
    );
  } else if (ins.items && typeof ins.items === "object") {
    Object.values(ins.items).forEach((v) => {
      if (v?.condition === "good") good++;
      else if (v?.condition === "fair") fair++;
      else if (v?.condition === "poor") poor++;
    });
  }
  return { good, fair, poor };
};

const activeRedoCount = (ins) =>
  Object.values(ins.areaRedoRequests || {}).filter((r) => !r.resolved).length;

const emptyArea = () => ({ areaId: `area_${Date.now()}`, label: "", icon: "🏠", items: [""] });
const emptyTemplate = () => ({ name: "", isDefault: false, areas: [emptyArea()] });

// ─── component ────────────────────────────────────────────────────────────────
export default function InspectionPage({ navbarHeight, orgPath = null, banner = null, emptyMessage = "No hostel assigned." }) {
  const emp  = useSelector((s) => s.auth.employee);
  const user = useSelector((s) => s.auth.user);

  // orgPath lets the university version pass "university/{id}" instead of "hostel/{id}"
  const defaultPath = `hostel/${String(emp?.hostelid || "")}`;
  const basePath = orgPath || defaultPath;
  const entityId = basePath.split("/")[1] || "";

  const [tab, setTab]               = useState("inspections");
  const [inspections, setInspections] = useState([]);
  const [templates, setTemplates]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch]         = useState("");

  // template modal
  const [templateModal, setTemplateModal]     = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [tForm, setTForm]                     = useState(emptyTemplate());
  const [expandedAreas, setExpandedAreas]     = useState({});
  const [saving, setSaving]                   = useState(false);

  // view modal
  const [viewModal, setViewModal]   = useState(null);
  const [viewInspection, setViewInspection] = useState(null); // live copy for redo state

  // redo modal
  const [redoModal, setRedoModal]   = useState(null); // { areaIdx, areaLabel }
  const [redoType, setRedoType]     = useState("both");
  const [redoMessage, setRedoMessage] = useState("");
  const [redoSaving, setRedoSaving] = useState(false);

  useEffect(() => { if (entityId) { loadInspections(); loadTemplates(); } }, [entityId]);

  // ─── loaders ────────────────────────────────────────────────────────────────
  const loadInspections = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, ...basePath.split("/"), "inspections"), orderBy("createdAt", "desc"))
      );
      setInspections(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load inspections");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const snap = await getDocs(collection(db, ...basePath.split("/"), "inspectionTemplates"));
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load templates"); }
  };

  // ─── filtered list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return inspections.filter((i) => {
      const matchSearch =
        !term ||
        i.studentId?.toLowerCase().includes(term) ||
        i.studentName?.toLowerCase().includes(term) ||
        i.roomNumber?.toLowerCase().includes(term);
      const matchType = typeFilter === "all" || i.type === typeFilter;
      return matchSearch && matchType;
    });
  }, [inspections, search, typeFilter]);

  // ─── template CRUD ──────────────────────────────────────────────────────────
  const openCreateTemplate = () => {
    setEditingTemplate(null);
    setTForm(emptyTemplate());
    setExpandedAreas({ 0: true });
    setTemplateModal(true);
  };
  const openEditTemplate = (t) => {
    setEditingTemplate(t);
    setTForm({ name: t.name || "", isDefault: !!t.isDefault, areas: t.areas?.length ? t.areas.map((a) => ({ ...a, items: (a.items || []).map((it) => (typeof it === "string" ? it : it.label || "")) })) : [emptyArea()] });
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
        await updateDoc(doc(db, ...basePath.split("/"), "inspectionTemplates", editingTemplate.id), payload);
        toast.success("Template updated");
      } else {
        await addDoc(collection(db, ...basePath.split("/"), "inspectionTemplates"), {
          ...payload, createdAt: serverTimestamp(), createdBy: user?.uid || "",
        });
        toast.success("Template created");
      }
      setTemplateModal(false);
      loadTemplates();
    } catch (err) { console.error(err); toast.error("Save failed"); }
    finally { setSaving(false); }
  };
  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete this template?")) return;
    try {
      await deleteDoc(doc(db, ...basePath.split("/"), "inspectionTemplates", id));
      toast.success("Deleted"); loadTemplates();
    } catch { toast.error("Delete failed"); }
  };

  // area / item helpers (template form)
  const addArea = () => {
    const newAreas = [...tForm.areas, emptyArea()];
    setTForm((f) => ({ ...f, areas: newAreas }));
    setExpandedAreas((e) => ({ ...e, [newAreas.length - 1]: true }));
  };
  const updateArea = (i, field, value) =>
    setTForm((f) => { const a = [...f.areas]; a[i] = { ...a[i], [field]: value }; return { ...f, areas: a }; });
  const removeArea = (i) => {
    if (tForm.areas.length <= 1) return toast.warn("At least one area required");
    setTForm((f) => ({ ...f, areas: f.areas.filter((_, idx) => idx !== i) }));
  };
  const updateItem = (ai, ii, value) =>
    setTForm((f) => { const a = [...f.areas]; const it = [...a[ai].items]; it[ii] = value; a[ai] = { ...a[ai], items: it }; return { ...f, areas: a }; });
  const addItem = (ai) =>
    setTForm((f) => { const a = [...f.areas]; a[ai] = { ...a[ai], items: [...a[ai].items, ""] }; return { ...f, areas: a }; });
  const removeItem = (ai, ii) =>
    setTForm((f) => { const a = [...f.areas]; a[ai] = { ...a[ai], items: a[ai].items.filter((_, idx) => idx !== ii) }; return { ...f, areas: a }; });

  // ─── open view modal ────────────────────────────────────────────────────────
  const openView = (ins) => {
    setViewModal(ins);
    setViewInspection(ins);
  };

  // ─── request redo ────────────────────────────────────────────────────────────
  const openRedoModal = (areaIdx, areaLabel) => {
    setRedoModal({ areaIdx, areaLabel });
    setRedoType("both");
    setRedoMessage("");
  };

  const submitRedoRequest = async () => {
    if (!viewInspection) return;
    setRedoSaving(true);
    try {
      const fieldPath = `areaRedoRequests.${redoModal.areaIdx}`;
      const redoData = {
        type: redoType,
        message: redoMessage.trim(),
        requestedAt: serverTimestamp(),
        requestedBy: user?.uid || "",
        resolved: false,
        areaLabel: redoModal.areaLabel,
      };
      await updateDoc(doc(db, ...basePath.split("/"), "inspections", viewInspection.id), {
        [fieldPath]: redoData,
        status: "redo_requested",
        updatedAt: serverTimestamp(),
      });
      toast.success(`Redo requested for "${redoModal.areaLabel}"`);
      // update local state
      const updated = {
        ...viewInspection,
        status: "redo_requested",
        areaRedoRequests: {
          ...(viewInspection.areaRedoRequests || {}),
          [redoModal.areaIdx]: { ...redoData, requestedAt: new Date() },
        },
      };
      setViewInspection(updated);
      setViewModal(updated);
      setInspections((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      setRedoModal(null);
    } catch (e) { console.error(e); toast.error("Failed to send redo request"); }
    finally { setRedoSaving(false); }
  };

  const cancelRedoRequest = async (areaIdx) => {
    if (!viewInspection) return;
    try {
      await updateDoc(doc(db, ...basePath.split("/"), "inspections", viewInspection.id), {
        [`areaRedoRequests.${areaIdx}`]: { resolved: true, cancelledAt: serverTimestamp() },
        updatedAt: serverTimestamp(),
      });
      toast.success("Redo request cancelled");
      const updated = {
        ...viewInspection,
        areaRedoRequests: {
          ...(viewInspection.areaRedoRequests || {}),
          [areaIdx]: { ...(viewInspection.areaRedoRequests?.[areaIdx] || {}), resolved: true },
        },
      };
      setViewInspection(updated);
      setViewModal(updated);
      setInspections((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch { toast.error("Failed to cancel"); }
  };

  // ─── guard ───────────────────────────────────────────────────────────────────
  if (!entityId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        {banner}
        <div className="bg-white rounded-xl p-10 text-center text-gray-500">{emptyMessage}</div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer position="top-right" autoClose={3000} />
      {banner}

      {/* header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Move In / Move Out Inspection</h1>
        <div className="flex items-center gap-2">
          <button onClick={loadInspections} className="p-2 bg-white border border-gray-200 rounded hover:bg-gray-50" title="Refresh">
            <RefreshCw size={16} className="text-gray-500" />
          </button>
          {tab === "templates" && (
            <button onClick={openCreateTemplate} className="px-4 py-2 bg-black text-white rounded flex items-center gap-2">
              <Plus size={16} /> New Template
            </button>
          )}
        </div>
      </div>

      {/* tabs */}
      <div className="flex gap-2 mb-5">
        {[{ key: "inspections", label: "Inspections" }, { key: "templates", label: "Templates" }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${tab === key ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── INSPECTIONS TAB ── */}
      {tab === "inspections" && (
        <>
          {/* filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <input
              className="flex-1 min-w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
              placeholder="Search by student name, ID or room number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex gap-2">
              {[
                { key: "all", label: "All" },
                { key: "movein", label: "Move In" },
                { key: "moveout", label: "Move Out" },
              ].map((t) => (
                <button key={t.key} onClick={() => setTypeFilter(t.key)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${typeFilter === t.key ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64"><FadeLoader color="#6d28d9" /></div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50">
                  <tr>
                    {["Student", "Room", "Template", "Type", "Date", "Status", "Condition", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No inspections found.</td></tr>
                  ) : filtered.map((ins) => {
                    const { good, fair, poor } = conditionSummary(ins);
                    const redoCount = activeRedoCount(ins);
                    const statusLabel = ins.status === "redo_requested" ? "Redo Requested"
                      : ins.status === "submitted" ? "Submitted"
                      : "Submitted";
                    const statusCls = ins.status === "redo_requested"
                      ? "bg-orange-100 text-orange-700 border border-orange-200"
                      : "bg-green-100 text-green-700 border border-green-200";

                    return (
                      <tr key={ins.id} className={`hover:bg-gray-50 transition-colors ${redoCount > 0 ? "bg-orange-50 hover:bg-orange-50" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-800">{ins.studentName || "—"}</p>
                          <p className="text-xs text-gray-400">{ins.studentId || ins.userId || ""}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{ins.roomNumber || "—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{ins.templateName || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize border ${ins.type === "movein" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-purple-50 text-purple-700 border-purple-200"}`}>
                            {ins.type === "movein" ? "Move In" : ins.type === "moveout" ? "Move Out" : ins.type || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">{toDateStr(ins.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusCls}`}>
                            {statusLabel}
                          </span>
                          {redoCount > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 bg-orange-500 text-white text-xs rounded-full font-bold">{redoCount}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 text-xs font-semibold">
                            <span className="text-green-600">✓{good}</span>
                            <span className="text-orange-500">~{fair}</span>
                            <span className="text-red-500">✗{poor}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => openView(ins)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-colors"
                          >
                            <Eye size={13} /> View
                          </button>
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

      {/* ── TEMPLATES TAB ── */}
      {tab === "templates" && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                {["Template Name", "Areas", "Items", "Default", "Actions"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {templates.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-gray-400">No templates yet. Create one to define your inspection checklist.</td></tr>
              ) : templates.map((t) => {
                const totalItems = (t.areas || []).reduce((s, a) => s + (a.items?.length || 0), 0);
                return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">{t.name}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{t.areas?.length || 0}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{totalItems}</td>
                    <td className="px-6 py-4">
                      {t.isDefault && <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">Default</span>}
                    </td>
                    <td className="px-6 py-4 flex items-center gap-3">
                      <button onClick={() => openEditTemplate(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={15} /></button>
                      <button onClick={() => deleteTemplate(t.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          TEMPLATE EDITOR MODAL
      ════════════════════════════════════════════════════════════════ */}
      {templateModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-bold">{editingTemplate ? "Edit Template" : "New Inspection Template"}</h2>
              <button onClick={() => setTemplateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={saveTemplate} className="p-6 space-y-5">
              <div className="flex gap-3 items-center">
                <input className="flex-1 border border-gray-300 p-2.5 rounded-lg text-sm" placeholder="Template name (e.g. Standard Studio Room)" required
                  value={tForm.name} onChange={(e) => setTForm((f) => ({ ...f, name: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm cursor-pointer whitespace-nowrap text-gray-600">
                  <input type="checkbox" checked={tForm.isDefault} onChange={(e) => setTForm((f) => ({ ...f, isDefault: e.target.checked }))} />
                  Set as default
                </label>
              </div>

              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="font-semibold text-gray-800">Room Areas</label>
                  <button type="button" onClick={addArea}
                    className="px-3 py-1.5 bg-gray-100 border border-gray-200 rounded-lg text-sm flex items-center gap-1 hover:bg-gray-200 font-medium">
                    <Plus size={13} /> Add Area
                  </button>
                </div>
                <div className="space-y-2">
                  {tForm.areas.map((area, ai) => (
                    <div key={ai} className="border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
                        onClick={() => setExpandedAreas((e) => ({ ...e, [ai]: !e[ai] }))}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{area.icon || "🏠"}</span>
                          <span className="text-sm font-semibold text-gray-700">{area.label || `Area ${ai + 1}`}</span>
                          <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                            {area.items.filter(Boolean).length} items
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={(e) => { e.stopPropagation(); removeArea(ai); }}
                            className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                            <Trash2 size={14} />
                          </button>
                          {expandedAreas[ai] ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                        </div>
                      </div>
                      {expandedAreas[ai] && (
                        <div className="p-4 space-y-4">
                          <div className="grid grid-cols-4 gap-2">
                            <div className="col-span-3">
                              <input className="w-full border border-gray-200 p-2 rounded-lg text-sm" placeholder="Area label (e.g. Bathroom)"
                                value={area.label} onChange={(e) => updateArea(ai, "label", e.target.value)} />
                            </div>
                            <input className="border border-gray-200 p-2 rounded-lg text-sm text-center text-xl" placeholder="🚿"
                              value={area.icon} onChange={(e) => updateArea(ai, "icon", e.target.value)} />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Checklist Items</span>
                              <button type="button" onClick={() => addItem(ai)}
                                className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium">
                                <Plus size={12} /> Add Item
                              </button>
                            </div>
                            <div className="space-y-2">
                              {area.items.map((item, ii) => (
                                <div key={ii} className="flex items-center gap-2">
                                  <input className="flex-1 border border-gray-200 p-2 rounded-lg text-sm"
                                    placeholder="e.g. Walls condition, Carpet, Door locks…"
                                    value={item} onChange={(e) => updateItem(ai, ii, e.target.value)} />
                                  <button type="button" onClick={() => removeItem(ai, ii)}
                                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded">
                                    <X size={14} />
                                  </button>
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

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setTemplateModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50">
                  {saving ? "Saving…" : editingTemplate ? "Update Template" : "Create Template"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          VIEW INSPECTION MODAL
      ════════════════════════════════════════════════════════════════ */}
      {viewModal && viewInspection && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl flex flex-col">
            {/* header */}
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex justify-between items-start z-10">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {viewInspection.type === "movein" ? "Move In" : viewInspection.type === "moveout" ? "Move Out" : viewInspection.type} Inspection
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {viewInspection.studentName || viewInspection.studentId || "—"}
                  {viewInspection.roomNumber ? ` · Room ${viewInspection.roomNumber}` : ""}
                  {" · "}{toDateStr(viewInspection.createdAt)}
                </p>
                {viewInspection.templateName && (
                  <p className="text-xs text-indigo-600 font-medium mt-0.5">{viewInspection.templateName}</p>
                )}
              </div>
              <button onClick={() => setViewModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg mt-0.5"><X size={20} /></button>
            </div>

            {/* redo banner */}
            {activeRedoCount(viewInspection) > 0 && (
              <div className="mx-6 mt-4 p-3 bg-orange-50 border border-orange-200 rounded-xl flex items-center gap-2 text-sm text-orange-800">
                <RotateCcw size={16} className="text-orange-500 shrink-0" />
                <span><strong>{activeRedoCount(viewInspection)} redo request{activeRedoCount(viewInspection) !== 1 ? "s" : ""}</strong> pending — student has been notified.</span>
              </div>
            )}

            {/* areas */}
            <div className="p-6 space-y-5 flex-1">
              {/* new areas[] format */}
              {(viewInspection.areas || []).length > 0 ? (
                viewInspection.areas.map((area, aIdx) => {
                  const redo = viewInspection.areaRedoRequests?.[aIdx];
                  const hasActiveRedo = redo && !redo.resolved;
                  return (
                    <div key={aIdx} className={`border rounded-xl overflow-hidden ${hasActiveRedo ? "border-orange-300" : "border-gray-200"}`}>
                      {/* area header */}
                      <div className={`flex items-center justify-between px-4 py-3 ${hasActiveRedo ? "bg-orange-50" : "bg-gray-50"}`}>
                        <div className="flex items-center gap-2">
                          {area.icon && <span className="text-xl">{area.icon}</span>}
                          <span className="font-semibold text-gray-800">{area.label}</span>
                          <span className="text-xs text-gray-400">{area.items?.length || 0} items</span>
                          {area.photoUrls?.length > 0 && (
                            <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-medium">
                              {area.photoUrls.length} photo{area.photoUrls.length !== 1 ? "s" : ""}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {hasActiveRedo ? (
                            <button
                              onClick={() => cancelRedoRequest(aIdx)}
                              className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 border border-orange-300 rounded-lg text-xs font-semibold hover:bg-orange-200"
                            >
                              <X size={12} /> Cancel Redo
                            </button>
                          ) : (
                            <button
                              onClick={() => openRedoModal(aIdx, area.label)}
                              className="flex items-center gap-1 px-3 py-1 bg-white text-gray-600 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-orange-50 hover:text-orange-700 hover:border-orange-200 transition-colors"
                            >
                              <RotateCcw size={12} /> Request Redo
                            </button>
                          )}
                        </div>
                      </div>

                      {/* active redo badge */}
                      {hasActiveRedo && (
                        <div className="mx-4 my-2 px-3 py-2 bg-orange-100 border border-orange-200 rounded-lg text-xs text-orange-800">
                          <strong>Redo requested:</strong>{" "}
                          {redo.type === "items" ? "Re-rate items" : redo.type === "photos" ? "Re-upload photos" : "Re-rate items & re-upload photos"}
                          {redo.message && ` — "${redo.message}"`}
                        </div>
                      )}

                      {/* items */}
                      <div className="divide-y divide-gray-50">
                        {(area.items || []).map((item, iIdx) => {
                          const label = typeof item === "string" ? item : item.label;
                          const condition = typeof item === "string" ? null : item.condition;
                          const note = typeof item === "string" ? null : item.note;
                          return (
                            <div key={iIdx} className="flex items-start gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800">{label}</p>
                                {note && <p className="text-xs text-gray-500 mt-0.5 italic">{note}</p>}
                              </div>
                              {condition && (
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize shrink-0 ${CONDITION_COLORS[condition] || "bg-gray-100 text-gray-500"}`}>
                                  {CONDITION_ICONS[condition]} {condition}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* area photos */}
                      {area.photoUrls?.length > 0 && (
                        <div className="px-4 pb-4 pt-2 border-t border-gray-100">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Photos</p>
                          <div className="flex flex-wrap gap-2">
                            {area.photoUrls.map((url, pi) => (
                              <a key={pi} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="" className="w-20 h-20 object-cover rounded-xl border border-gray-200 hover:opacity-80 transition-opacity" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                /* legacy items{} map format fallback */
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 font-semibold text-gray-700 text-sm">Inspection Items</div>
                  <div className="divide-y divide-gray-50">
                    {Object.entries(viewInspection.items || {}).map(([label, v]) => (
                      <div key={label} className="flex items-start gap-3 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{label}</p>
                          {v?.note && <p className="text-xs text-gray-500 mt-0.5">{v.note}</p>}
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize ${CONDITION_COLORS[v?.condition] || "bg-gray-100 text-gray-500"}`}>
                          {v?.condition || "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-3 flex justify-end">
              <button onClick={() => setViewModal(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          REQUEST REDO MODAL
      ════════════════════════════════════════════════════════════════ */}
      {redoModal && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Request Redo</h3>
                <p className="text-sm text-gray-500 mt-0.5">Area: <strong>{redoModal.areaLabel}</strong></p>
              </div>
              <button onClick={() => setRedoModal(null)} className="p-1.5 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              The student will see a notification in the app and will be asked to redo this area.
            </p>

            {/* redo type */}
            <div className="mb-4">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 block">What needs to be redone?</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "items", label: "Re-rate Items", Icon: FileText },
                  { key: "photos", label: "Re-upload Photos", Icon: Camera },
                  { key: "both", label: "Both", Icon: RotateCcw },
                ].map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRedoType(key)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-semibold transition-colors ${
                      redoType === key
                        ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <Icon size={18} />
                    <span className="text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* message */}
            <div className="mb-5">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 block">
                Message to student <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
                placeholder="e.g. Photos are blurry, please retake in better lighting…"
                value={redoMessage}
                onChange={(e) => setRedoMessage(e.target.value)}
              />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => setRedoModal(null)}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium text-sm">
                Cancel
              </button>
              <button
                onClick={submitRedoRequest}
                disabled={redoSaving}
                className="px-5 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium text-sm disabled:opacity-50 flex items-center gap-2"
              >
                <RotateCcw size={14} />
                {redoSaving ? "Sending…" : "Send Redo Request"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
