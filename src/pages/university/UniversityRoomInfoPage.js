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

const ROOM_TYPES = ["Lecture", "Seminar", "Lab", "Study", "Other"];
const EMPTY = { roomNumber: "", building: "", floor: "", capacity: 30, roomType: "Lecture", facilities: "", isAvailable: true };

export default function UniversityRoomInfoPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (universityId) load(); }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "roominfo"), orderBy("roomNumber")));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load rooms"); }
    finally { setLoading(false); }
  };

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ roomNumber: item.roomNumber || "", building: item.building || "", floor: item.floor || "", capacity: item.capacity || 30, roomType: item.roomType || "Lecture", facilities: item.facilities || "", isAvailable: item.isAvailable !== false });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.roomNumber.trim()) { toast.error("Room number is required"); return; }
    setSubmitting(true);
    try {
      const data = { ...form, capacity: Number(form.capacity) || 0, universityId, updatedAt: serverTimestamp() };
      if (editing?.id) {
        await updateDoc(doc(db, "university", universityId, "roominfo", editing.id), data);
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "roominfo"), { ...data, createdAt: serverTimestamp() });
        toast.success("Created!");
      }
      setModalOpen(false); load();
    } catch { toast.error("Save failed"); }
    finally { setSubmitting(false); }
  };

  const remove = async (item) => {
    if (!window.confirm("Delete this room?")) return;
    try {
      await deleteDoc(doc(db, "university", universityId, "roominfo", item.id));
      toast.success("Deleted"); load();
    } catch { toast.error("Delete failed"); }
  };

  if (!universityId) return <div className="p-8 text-center text-gray-400">No university assigned.</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Room Info</h1>
          <p className="text-sm text-gray-500 mt-1">Manage university room information</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          <Plus size={16} /> Add Room
        </button>
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {items.length === 0
            ? <div className="text-center py-16 text-gray-400"><p className="text-lg font-semibold">No rooms yet</p></div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Room No.", "Building", "Floor", "Capacity", "Type", "Available", "Actions"].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-3 font-semibold text-gray-800">{item.roomNumber}</td>
                      <td className="p-3 text-gray-600">{item.building || "—"}</td>
                      <td className="p-3 text-gray-600">{item.floor || "—"}</td>
                      <td className="p-3 text-gray-600">{item.capacity}</td>
                      <td className="p-3"><span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">{item.roomType}</span></td>
                      <td className="p-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.isAvailable !== false ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                          {item.isAvailable !== false ? "Available" : "Not Available"}
                        </span>
                      </td>
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

      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Room" : "Add Room"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {[["ROOM NUMBER *", "roomNumber", "e.g. A101"], ["BUILDING", "building", "e.g. Block A"]].map(([lbl, key, ph]) => (
                  <div key={key}>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">{lbl}</label>
                    <input type="text" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">FLOOR</label>
                  <input type="text" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" placeholder="e.g. 2" value={form.floor} onChange={e => setForm(f => ({ ...f, floor: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">CAPACITY</label>
                  <input type="number" min="1" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.capacity} onChange={e => setForm(f => ({ ...f, capacity: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">ROOM TYPE</label>
                  <select className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.roomType} onChange={e => setForm(f => ({ ...f, roomType: e.target.value }))}>
                    {ROOM_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">FACILITIES</label>
                <textarea className="w-full border border-gray-200 rounded-lg p-2.5 text-sm resize-none focus:outline-none" rows={3} value={form.facilities} onChange={e => setForm(f => ({ ...f, facilities: e.target.value }))} placeholder="Projector, AC, Whiteboard…" />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.isAvailable} onChange={e => setForm(f => ({ ...f, isAvailable: e.target.checked }))} className="w-4 h-4 accent-green-700" />
                <span className="text-sm font-semibold text-gray-600">Available</span>
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
