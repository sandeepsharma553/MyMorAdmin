import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc, doc,
  query, orderBy, serverTimestamp, setDoc, getDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { Plus, Trash2, Edit2, X, Download, Star } from "lucide-react";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";
const CATEGORIES = [
  { value: "counselling", label: "Counselling" },
  { value: "crisis", label: "Crisis Support" },
  { value: "peer", label: "Peer Support" },
  { value: "health", label: "Physical Health" },
  { value: "study", label: "Study Stress" },
  { value: "financial", label: "Financial Help" },
];

const CAT_COLORS = {
  counselling: "bg-blue-100 text-blue-700",
  crisis: "bg-red-100 text-red-700",
  peer: "bg-purple-100 text-purple-700",
  health: "bg-green-100 text-green-700",
  study: "bg-orange-100 text-orange-700",
  financial: "bg-yellow-100 text-yellow-700",
};

const MOOD_EMOJI = { 1: "😞", 2: "😕", 3: "😐", 4: "🙂", 5: "😊" };

const emptyResource = () => ({
  title: "", description: "", category: "counselling",
  contactNumber: "", link: "", isPinned: false, order: 1, isActive: true,
});

const emptySettings = {
  checkInDayOfWeek: 1,
  checkInHour: 9,
  followUpQuestion: "",
  alertThreshold: 2.5,
  alertEmail: "",
};

export default function UniversityWellbeingPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const user = useSelector((s) => s.auth.user);
  const { universityId, filterByScope, scopePayload } = useUniversityScope();
  const hostelId = universityId; // university alias

  const [tab, setTab] = useState("checkins");
  const [checkIns, setCheckIns] = useState([]);
  const [resources, setResources] = useState([]);
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(false);

  const [resourceModal, setResourceModal] = useState(false);
  const [editingResource, setEditingResource] = useState(null);
  const [rForm, setRForm] = useState(emptyResource());
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (hostelId) loadCheckIns(); }, [hostelId]);
  useEffect(() => { if (tab === "resources" && hostelId) loadResources(); }, [tab, hostelId]);
  useEffect(() => { if (tab === "settings" && hostelId) loadSettings(); }, [tab, hostelId]);

  const loadCheckIns = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "university", universityId, "wellbeingCheckIns"));
      const sorted = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.id.localeCompare(a.id));
      setCheckIns(sorted);
    } catch { toast.error("Failed to load check-ins"); }
    finally { setLoading(false); }
  };

  const loadResources = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "wellbeingResources"), orderBy("order", "asc")));
      setResources(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load resources"); }
    finally { setLoading(false); }
  };

  const loadSettings = async () => {
    try {
      const snap = await getDoc(doc(db, "university", universityId, "wellbeingSettings", "config"));
      if (snap.exists()) setSettings({ ...emptySettings, ...snap.data() });
    } catch { /* no settings yet */ }
  };

  const openCreateResource = () => {
    setEditingResource(null);
    const maxOrder = resources.length > 0 ? Math.max(...resources.map((r) => r.order || 0)) + 1 : 1;
    setRForm({ ...emptyResource(), order: maxOrder });
    setResourceModal(true);
  };

  const openEditResource = (r) => {
    setEditingResource(r);
    setRForm({ title: r.title || "", description: r.description || "", category: r.category || "counselling", contactNumber: r.contactNumber || "", link: r.link || "", isPinned: !!r.isPinned, order: r.order || 1, isActive: r.isActive !== false });
    setResourceModal(true);
  };

  const saveResource = async (e) => {
    e.preventDefault();
    if (!rForm.title.trim()) return toast.warn("Title required");
    setSaving(true);
    try {
      const payload = { ...rForm, title: rForm.title.trim(), description: rForm.description.trim(), updatedAt: serverTimestamp() };
      if (editingResource) {
        await updateDoc(doc(db, "university", universityId, "wellbeingResources", editingResource.id), payload);
        toast.success("Resource updated");
      } else {
        await addDoc(collection(db, "university", universityId, "wellbeingResources"), { ...payload, createdAt: serverTimestamp(), createdBy: user?.uid || "" });
        toast.success("Resource added");
      }
      setResourceModal(false);
      loadResources();
    } catch (err) { console.error(err); toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const deleteResource = async (id) => {
    if (!window.confirm("Delete this resource?")) return;
    try { await deleteDoc(doc(db, "university", universityId, "wellbeingResources", id)); toast.success("Deleted"); loadResources(); }
    catch { toast.error("Delete failed"); }
  };

  const togglePin = async (r) => {
    const pinned = resources.filter((x) => x.isPinned && x.id !== r.id);
    if (!r.isPinned && pinned.length >= 3) return toast.warn("Maximum 3 pinned resources");
    try { await updateDoc(doc(db, "university", universityId, "wellbeingResources", r.id), { isPinned: !r.isPinned }); loadResources(); }
    catch { toast.error("Update failed"); }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, "university", universityId, "wellbeingSettings", "config"), { ...settings, updatedAt: serverTimestamp() });
      toast.success("Settings saved");
    } catch { toast.error("Save failed"); }
    finally { setSaving(false); }
  };

  const exportCSV = () => {
    const rows = [["Week", "Responses", "Avg Score", "Score 1", "Score 2", "Score 3", "Score 4", "Score 5"]];
    checkIns.forEach((c) => rows.push([
      c.id, c.responseCount || 0, (c.averageScore || 0).toFixed(2),
      c.scoreDistribution?.[1] || 0, c.scoreDistribution?.[2] || 0,
      c.scoreDistribution?.[3] || 0, c.scoreDistribution?.[4] || 0, c.scoreDistribution?.[5] || 0,
    ]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "wellbeing_checkins.csv"; a.click();
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
        <h1 className="text-2xl font-semibold">Wellbeing Check-In</h1>
        <div className="flex gap-2">
          {tab === "checkins" && (
            <button onClick={exportCSV} className="px-4 py-2 bg-gray-200 rounded flex items-center gap-2 text-sm hover:bg-gray-300">
              <Download size={15} /> Export CSV
            </button>
          )}
          {tab === "resources" && (
            <button onClick={openCreateResource} className="px-4 py-2 bg-black text-white rounded flex items-center gap-2">
              <Plus size={16} /> Add Resource
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[{ key: "checkins", label: "Check-in Data" }, { key: "resources", label: "Resources" }, { key: "settings", label: "Settings" }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === key ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
      ) : tab === "checkins" ? (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-sm text-blue-800">
            <strong>Privacy:</strong> Individual responses are never stored. Only anonymous aggregate data is shown here.
          </div>
          <div className="bg-white rounded shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Week</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Responses</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Avg Score</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {checkIns.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">No check-in data yet.</td></tr>
                ) : checkIns.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-800">{c.id}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{c.responseCount || 0}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{MOOD_EMOJI[Math.round(c.averageScore || 0)]}</span>
                        <span className={`text-sm font-semibold ${(c.averageScore || 0) < 2.5 ? "text-red-600" : (c.averageScore || 0) < 3.5 ? "text-orange-500" : "text-green-600"}`}>
                          {(c.averageScore || 0).toFixed(2)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <div key={n} className="flex flex-col items-center">
                            <span className="text-xs text-gray-400">{MOOD_EMOJI[n]}</span>
                            <span className="text-xs font-medium text-gray-700">{c.scoreDistribution?.[n] || 0}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : tab === "resources" ? (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Pin", "Title", "Category", "Contact / Link", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-sm font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {resources.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">No resources yet.</td></tr>
              ) : resources.map((r) => (
                <tr key={r.id} className={r.isPinned ? "bg-yellow-50" : ""}>
                  <td className="px-4 py-4">
                    <button onClick={() => togglePin(r)} title={r.isPinned ? "Unpin" : "Pin"}>
                      <Star size={16} className={r.isPinned ? "text-yellow-500 fill-yellow-400" : "text-gray-300"} />
                    </button>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-sm font-medium text-gray-800">{r.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{r.description}</p>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${CAT_COLORS[r.category] || "bg-gray-100 text-gray-600"}`}>
                      {CATEGORIES.find((c) => c.value === r.category)?.label || r.category}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm text-gray-600">
                    {r.contactNumber && <p>📞 {r.contactNumber}</p>}
                    {r.link && <a href={r.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-xs truncate block max-w-xs">🔗 {r.link}</a>}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                      {r.isActive ? "Active" : "Hidden"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm flex items-center gap-2">
                    <button onClick={() => openEditResource(r)} className="text-blue-600 hover:underline"><Edit2 size={14} /></button>
                    <button onClick={() => deleteResource(r.id)} className="text-red-600 hover:underline"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Settings tab */
        <form onSubmit={saveSettings} className="bg-white rounded shadow p-6 max-w-xl space-y-5">
          <h2 className="font-semibold text-gray-800">Check-in Schedule</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Day of week (0=Sun, 1=Mon…)</label>
              <input type="number" min={0} max={6} className="w-full border border-gray-300 p-2 rounded"
                value={settings.checkInDayOfWeek}
                onChange={(e) => setSettings((s) => ({ ...s, checkInDayOfWeek: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Notification hour (24h)</label>
              <input type="number" min={0} max={23} className="w-full border border-gray-300 p-2 rounded"
                value={settings.checkInHour}
                onChange={(e) => setSettings((s) => ({ ...s, checkInHour: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Optional follow-up question</label>
            <input className="w-full border border-gray-300 p-2 rounded text-sm"
              placeholder="e.g. What's affecting your mood this week?"
              value={settings.followUpQuestion}
              onChange={(e) => setSettings((s) => ({ ...s, followUpQuestion: e.target.value }))} />
            <p className="text-xs text-gray-400 mt-1">Leave blank to skip the follow-up.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Alert Settings</label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Alert threshold (avg score)</label>
                <input type="number" min={1} max={5} step={0.1} className="w-full border border-gray-300 p-2 rounded"
                  value={settings.alertThreshold}
                  onChange={(e) => setSettings((s) => ({ ...s, alertThreshold: Number(e.target.value) }))} />
                <p className="text-xs text-gray-400 mt-1">Alert if avg drops below this for 2+ weeks.</p>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Alert email</label>
                <input type="email" className="w-full border border-gray-300 p-2 rounded text-sm"
                  placeholder="staff@hostel.edu"
                  value={settings.alertEmail}
                  onChange={(e) => setSettings((s) => ({ ...s, alertEmail: e.target.value }))} />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={saving} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      )}

      {/* Resource modal */}
      {resourceModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-lg p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editingResource ? "Edit Resource" : "Add Resource"}</h2>
              <button onClick={() => setResourceModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={saveResource} className="space-y-4">
              <input className="w-full border border-gray-300 p-2 rounded" placeholder="Title" required
                value={rForm.title} onChange={(e) => setRForm((f) => ({ ...f, title: e.target.value }))} />
              <textarea rows={2} className="w-full border border-gray-300 p-2 rounded resize-none text-sm"
                placeholder="Short description shown in app"
                value={rForm.description} onChange={(e) => setRForm((f) => ({ ...f, description: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select className="w-full border border-gray-300 p-2 rounded"
                    value={rForm.category} onChange={(e) => setRForm((f) => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Display Order</label>
                  <input type="number" min={1} className="w-full border border-gray-300 p-2 rounded"
                    value={rForm.order} onChange={(e) => setRForm((f) => ({ ...f, order: Number(e.target.value) }))} />
                </div>
              </div>
              <input className="w-full border border-gray-300 p-2 rounded text-sm" placeholder="Contact number (optional)"
                value={rForm.contactNumber} onChange={(e) => setRForm((f) => ({ ...f, contactNumber: e.target.value }))} />
              <input className="w-full border border-gray-300 p-2 rounded text-sm" placeholder="Link URL (optional)"
                value={rForm.link} onChange={(e) => setRForm((f) => ({ ...f, link: e.target.value }))} />
              <div className="flex gap-6">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={rForm.isPinned} onChange={(e) => setRForm((f) => ({ ...f, isPinned: e.target.checked }))} />
                  Feature (pin to top)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={rForm.isActive} onChange={(e) => setRForm((f) => ({ ...f, isActive: e.target.checked }))} />
                  Active
                </label>
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => setResourceModal(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Saving..." : editingResource ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
