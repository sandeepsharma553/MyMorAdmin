import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import { Plus, Trash2, Edit2, X, Image as ImageIcon, Search, MapPin, Users } from "lucide-react";
import { FadeLoader } from "react-spinners";

const STATUS = (start, end) => {
  const now = Date.now();
  const s = start ? new Date(start).getTime() : 0;
  const e = end ? new Date(end).getTime() : Infinity;
  if (now < s) return { label: "Upcoming", cls: "bg-blue-100 text-blue-700" };
  if (now > e) return { label: "Past", cls: "bg-gray-100 text-gray-500" };
  return { label: "Ongoing", cls: "bg-green-100 text-green-700" };
};

const EMPTY = { eventName: "", shortDesc: "", description: "", startDateTime: "", endDateTime: "", locationName: "", capacity: "", priceType: "Free", price: "", posterUrl: "", isPinned: false };

export default function UniversityEventPage() {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Upcoming");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const fileRef = useRef();

  useEffect(() => { if (universityId) load(); }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "events"), orderBy("startDateTime", "asc")));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load events"); }
    finally { setLoading(false); }
  };

  const openCreate = () => {
    setEditing(null); setForm(EMPTY);
    setImageFile(null); setImagePreview(null);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ eventName: item.eventName || "", shortDesc: item.shortDesc || "", description: item.description || "", startDateTime: item.startDateTime || "", endDateTime: item.endDateTime || "", locationName: item.locationName || "", capacity: item.capacity || "", priceType: item.priceType || "Free", price: item.price || "", posterUrl: item.posterUrl || "", isPinned: !!item.isPinned });
    setImageFile(null); setImagePreview(item.posterUrl || null);
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.eventName.trim()) { toast.error("Event name is required"); return; }
    setSubmitting(true);
    try {
      let posterUrl = form.posterUrl;
      if (imageFile) {
        const path = `university/${universityId}/events/${Date.now()}_${imageFile.name}`;
        const snap = await uploadBytes(storageRef(storage, path), imageFile);
        posterUrl = await getDownloadURL(snap.ref);
      }
      const data = {
        eventName: form.eventName.trim(),
        shortDesc: form.shortDesc.trim(),
        description: form.description.trim(),
        startDateTime: form.startDateTime,
        endDateTime: form.endDateTime,
        locationName: form.locationName.trim(),
        capacity: form.capacity ? Number(form.capacity) : null,
        priceType: form.priceType,
        price: form.priceType === "Paid" ? Number(form.price) : 0,
        posterUrl,
        isPinned: form.isPinned,
        universityId,
        updatedAt: serverTimestamp(),
      };
      if (editing?.id) {
        await updateDoc(doc(db, "university", universityId, "events", editing.id), data);
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "events"), { ...data, createdAt: serverTimestamp(), createdBy: user.uid });
        toast.success("Created!");
      }
      setModalOpen(false); load();
    } catch { toast.error("Save failed"); }
    finally { setSubmitting(false); }
  };

  const remove = async (item) => {
    if (!window.confirm("Delete this event?")) return;
    try { await deleteDoc(doc(db, "university", universityId, "events", item.id)); load(); toast.success("Deleted"); }
    catch { toast.error("Delete failed"); }
  };

  const filtered = items.filter(item => {
    const st = STATUS(item.startDateTime, item.endDateTime);
    const matchFilter = filter === "All" || st.label === filter;
    const matchSearch = !search || item.eventName?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  if (!universityId) return <div className="p-8 text-center text-gray-400">No university assigned.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Events</h1>
          <p className="text-sm text-gray-500 mt-1">University events and activities</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          <Plus size={16} /> New Event
        </button>
      </div>

      <div className="flex gap-4 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600" placeholder="Search events…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {["Upcoming", "Ongoing", "Past", "All"].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-2 text-xs font-semibold rounded-lg transition ${filter === f ? "bg-green-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{f}</button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && (
        <div className="grid gap-4">
          {filtered.length === 0 && <div className="text-center py-16 text-gray-400"><p className="text-lg font-semibold">No events</p></div>}
          {filtered.map(item => {
            const st = STATUS(item.startDateTime, item.endDateTime);
            return (
              <div key={item.id} className="bg-white rounded-xl border border-gray-100 shadow-sm flex gap-4 p-4">
                {item.posterUrl
                  ? <img src={item.posterUrl} alt="" className="w-24 h-20 object-cover rounded-lg flex-shrink-0" />
                  : <div className="w-24 h-20 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0"><ImageIcon size={24} className="text-gray-300" /></div>
                }
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    {item.isPinned && <span className="text-xs bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">📌 Pinned</span>}
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.priceType}{item.priceType === "Paid" ? ` · $${item.price}` : ""}</span>
                  </div>
                  <p className="font-semibold text-gray-800">{item.eventName}</p>
                  {item.shortDesc && <p className="text-sm text-gray-500 truncate">{item.shortDesc}</p>}
                  <div className="flex gap-4 mt-1.5 flex-wrap">
                    {item.startDateTime && <p className="text-xs text-gray-400">{new Date(item.startDateTime).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</p>}
                    {item.locationName && <p className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={11} />{item.locationName}</p>}
                    {item.capacity && <p className="text-xs text-gray-400 flex items-center gap-1"><Users size={11} />{item.capacity} capacity</p>}
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 size={15} className="text-blue-500" /></button>
                  <button onClick={() => remove(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Trash2 size={15} className="text-red-400" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Event" : "New Event"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">EVENT NAME *</label>
                <input className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" value={form.eventName} onChange={e => setForm(f => ({ ...f, eventName: e.target.value }))} placeholder="Event name" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">SHORT DESCRIPTION</label>
                <input className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.shortDesc} onChange={e => setForm(f => ({ ...f, shortDesc: e.target.value }))} placeholder="Brief summary" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">DESCRIPTION</label>
                <textarea className="w-full border border-gray-200 rounded-lg p-2.5 text-sm resize-none focus:outline-none" rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">START DATE & TIME</label>
                  <input type="datetime-local" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.startDateTime} onChange={e => setForm(f => ({ ...f, startDateTime: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">END DATE & TIME</label>
                  <input type="datetime-local" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.endDateTime} onChange={e => setForm(f => ({ ...f, endDateTime: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">LOCATION</label>
                <input className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.locationName} onChange={e => setForm(f => ({ ...f, locationName: e.target.value }))} placeholder="Venue or room name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">CAPACITY</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} placeholder="Max attendees" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">PRICE TYPE</label>
                  <select className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.priceType} onChange={e => setForm(f => ({ ...f, priceType: e.target.value }))}>
                    <option>Free</option>
                    <option>Paid</option>
                  </select>
                </div>
              </div>
              {form.priceType === "Paid" && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">PRICE</label>
                  <input type="number" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0.00" />
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">POSTER IMAGE</label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const file = e.target.files[0]; if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)); } }} />
                <button onClick={() => fileRef.current.click()} className="flex items-center gap-2 text-sm border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-600">
                  <ImageIcon size={15} /> {imageFile ? imageFile.name : "Choose Image"}
                </button>
                {imagePreview && <img src={imagePreview} alt="" className="mt-2 w-full h-36 object-cover rounded-lg" />}
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isPinned} onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))} className="w-4 h-4 accent-green-700" />
                <span className="text-sm font-semibold text-gray-600">📌 Pin this event</span>
              </label>
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
