import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, addDoc, getDocs, updateDoc, doc,
  query, orderBy, serverTimestamp, setDoc, getDoc,
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { FadeLoader } from "react-spinners";
import { Plus, Search, X } from "lucide-react";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";
const CATEGORIES = [
  { value: "keys", label: "Keys" },
  { value: "clothing", label: "Clothing" },
  { value: "electronics", label: "Electronics" },
  { value: "bags", label: "Bags" },
  { value: "id_cards", label: "ID / Cards" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS = {
  active: "bg-blue-100 text-blue-700",
  claimed: "bg-green-100 text-green-700",
  disposed: "bg-gray-100 text-gray-500",
  archived: "bg-gray-100 text-gray-400",
};

const toDateStr = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

const emptyPostForm = () => ({
  title: "", category: "other", locationFound: "", description: "",
  imageFile: null,
});

const emptySettings = { expiryDays: 30 };

export default function UniversityLostAndFoundPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const user = useSelector((s) => s.auth.user);
  const { universityId, filterByScope, scopePayload } = useUniversityScope();
  const hostelId = universityId; // university alias

  const [tab, setTab] = useState("active");
  const [listings, setListings] = useState([]);
  const [settings, setSettings] = useState(emptySettings);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");

  const [postModal, setPostModal] = useState(false);
  const [postForm, setPostForm] = useState(emptyPostForm());
  const [imagePreview, setImagePreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => { if (hostelId) { loadListings(); loadSettings(); } }, [hostelId]);

  const loadListings = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "lostAndFound"), orderBy("createdAt", "desc")));
      setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load listings"); }
    finally { setLoading(false); }
  };

  const loadSettings = async () => {
    try {
      const snap = await getDoc(doc(db, "university", universityId, "lostAndFoundSettings", "config"));
      if (snap.exists()) setSettings({ ...emptySettings, ...snap.data() });
    } catch { /* no settings */ }
  };

  const activeListings = useMemo(() => listings.filter((l) => l.status === "active"), [listings]);
  const resolvedListings = useMemo(() => listings.filter((l) => l.status !== "active"), [listings]);

  const filtered = useMemo(() => {
    const source = tab === "active" ? activeListings : resolvedListings;
    const term = search.toLowerCase();
    return source.filter((l) => {
      const matchSearch = !term || l.title?.toLowerCase().includes(term) || l.locationFound?.toLowerCase().includes(term) || l.posterFirstName?.toLowerCase().includes(term);
      const matchCat = catFilter === "all" || l.category === catFilter;
      return matchSearch && matchCat;
    });
  }, [tab, activeListings, resolvedListings, search, catFilter]);

  const updateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "university", universityId, "lostAndFound", id), {
        status,
        resolvedAt: ["claimed", "disposed", "archived"].includes(status) ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Marked as ${status}`);
      loadListings();
    } catch { toast.error("Update failed"); }
  };

  const handlePost = async (e) => {
    e.preventDefault();
    if (!postForm.title.trim()) return toast.warn("Title required");
    if (!postForm.imageFile) return toast.warn("Photo required");
    setSaving(true);
    try {
      const path = `university/${universityId}/lostAndFound/${Date.now()}_${postForm.imageFile.name}`;
      const sRef = storageRef(storage, path);
      await uploadBytes(sRef, postForm.imageFile);
      const url = await getDownloadURL(sRef);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (settings.expiryDays || 30));

      await addDoc(collection(db, "university", universityId, "lostAndFound"), {
        postedBy: "staff",
        posterFirstName: emp?.name?.split(" ")[0] || "Staff",
        title: postForm.title.trim(),
        category: postForm.category,
        locationFound: postForm.locationFound.trim(),
        description: postForm.description.trim(),
        photoUrls: [url],
        status: "active",
        claimedBy: null,
        createdAt: serverTimestamp(),
        expiresAt: expiresAt.toISOString(),
        resolvedAt: null,
        hostelId,
      });

      toast.success("Listing posted");
      setPostModal(false);
      setPostForm(emptyPostForm());
      setImagePreview(null);
      loadListings();
    } catch (err) { console.error(err); toast.error("Post failed"); }
    finally { setSaving(false); }
  };

  const saveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await setDoc(doc(db, "university", universityId, "lostAndFoundSettings", "config"), { ...settings, updatedAt: serverTimestamp() });
      toast.success("Settings saved");
    } catch { toast.error("Save failed"); }
    finally { setSavingSettings(false); }
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
        <h1 className="text-2xl font-semibold">Lost & Found</h1>
        {tab !== "settings" && (
          <button onClick={() => setPostModal(true)} className="px-4 py-2 bg-black text-white rounded flex items-center gap-2">
            <Plus size={16} /> Post Item (Staff)
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {[{ key: "active", label: `Active (${activeListings.length})` }, { key: "resolved", label: "Resolved" }, { key: "settings", label: "Settings" }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === key ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab !== "settings" && (
        <div className="flex gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm bg-white"
              placeholder="Search title, location, posted by..."
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {[{ value: "all", label: "All" }, ...CATEGORIES].map((c) => (
              <button key={c.value} onClick={() => setCatFilter(c.value)}
                className={`px-3 py-1.5 rounded text-sm ${catFilter === c.value ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
      ) : tab === "settings" ? (
        <form onSubmit={saveSettings} className="bg-white rounded shadow p-6 max-w-sm space-y-4">
          <h2 className="font-semibold text-gray-800">Auto-expiry Settings</h2>
          <div>
            <label className="block text-sm text-gray-600 mb-1">Archive listings after (days)</label>
            <input type="number" min={1} className="w-full border border-gray-300 p-2 rounded"
              value={settings.expiryDays}
              onChange={(e) => setSettings((s) => ({ ...s, expiryDays: Number(e.target.value) }))} />
            <p className="text-xs text-gray-400 mt-1">Listings older than this are auto-archived by Cloud Function.</p>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={savingSettings} className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {savingSettings ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-white rounded shadow overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Photo", "Item", "Category", "Location Found", "Posted By", "Date", "Status", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filtered.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">No listings found.</td></tr>
              ) : filtered.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3">
                    {l.photoUrls?.[0] ? (
                      <img src={l.photoUrls[0]} alt={l.title} className="w-14 h-14 object-cover rounded" />
                    ) : <div className="w-14 h-14 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">No photo</div>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-800">{l.title}</p>
                    {l.description && <p className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{l.description}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 capitalize">
                      {CATEGORIES.find((c) => c.value === l.category)?.label || l.category}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{l.locationFound || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{l.posterFirstName || "—"}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{toDateStr(l.createdAt)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}>
                      {l.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {l.status === "active" && (
                      <div className="flex flex-col gap-1">
                        <button onClick={() => updateStatus(l.id, "claimed")} className="text-green-600 hover:underline text-xs">Mark Claimed</button>
                        <button onClick={() => updateStatus(l.id, "disposed")} className="text-gray-500 hover:underline text-xs">Mark Disposed</button>
                      </div>
                    )}
                    {l.status !== "active" && (
                      <button onClick={() => updateStatus(l.id, "active")} className="text-blue-600 hover:underline text-xs">Reactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Post item modal */}
      {postModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-lg p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Post Found Item (Staff)</h2>
              <button onClick={() => { setPostModal(false); setPostForm(emptyPostForm()); setImagePreview(null); }}><X size={20} /></button>
            </div>
            <form onSubmit={handlePost} className="space-y-4">
              <input className="w-full border border-gray-300 p-2 rounded" placeholder="Item title (e.g. Blue umbrella)" required
                value={postForm.title} onChange={(e) => setPostForm((f) => ({ ...f, title: e.target.value }))} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category</label>
                  <select className="w-full border border-gray-300 p-2 rounded"
                    value={postForm.category} onChange={(e) => setPostForm((f) => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Location Found</label>
                  <input className="w-full border border-gray-300 p-2 rounded text-sm" placeholder="e.g. Level 3 common room"
                    value={postForm.locationFound} onChange={(e) => setPostForm((f) => ({ ...f, locationFound: e.target.value }))} />
                </div>
              </div>
              <textarea rows={2} className="w-full border border-gray-300 p-2 rounded text-sm resize-none"
                placeholder="Additional description (optional)"
                value={postForm.description} onChange={(e) => setPostForm((f) => ({ ...f, description: e.target.value }))} />

              <div>
                <label className="block text-xs text-gray-500 mb-1">Photo (required)</label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer bg-gray-100 border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-200">
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setPostForm((pf) => ({ ...pf, imageFile: f }));
                      setImagePreview(URL.createObjectURL(f));
                    }} />
                    📁 Choose Photo
                  </label>
                  {postForm.imageFile && <span className="text-sm text-gray-600">{postForm.imageFile.name}</span>}
                </div>
                {imagePreview && <img src={imagePreview} alt="preview" className="mt-2 w-32 h-32 object-cover rounded" />}
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button type="button" onClick={() => { setPostModal(false); setPostForm(emptyPostForm()); setImagePreview(null); }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                  {saving ? "Posting..." : "Post Listing"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
