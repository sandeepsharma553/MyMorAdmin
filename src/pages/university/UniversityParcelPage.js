import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, addDoc, getDocs, updateDoc, deleteDoc,
  doc, serverTimestamp, query, orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, Edit2, X, Search } from "lucide-react";
import { FadeLoader } from "react-spinners";

const STATUS_COLORS = {
  pending: "bg-orange-100 text-orange-700",
  notified: "bg-blue-100 text-blue-700",
  collected: "bg-green-100 text-green-700",
};
const EMPTY = { studentName: "", studentEmail: "", description: "", carrier: "", trackingNumber: "", receivedDate: "", status: "pending" };

export default function UniversityParcelPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (universityId) load(); }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "parcels"), orderBy("receivedDate", "desc")));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load parcels"); }
    finally { setLoading(false); }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter(i => !term || i.studentName?.toLowerCase().includes(term) || i.studentEmail?.toLowerCase().includes(term));
  }, [items, search]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setModalOpen(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ studentName: item.studentName || "", studentEmail: item.studentEmail || "", description: item.description || "", carrier: item.carrier || "", trackingNumber: item.trackingNumber || "", receivedDate: item.receivedDate || "", status: item.status || "pending" });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.studentName.trim()) { toast.error("Student name is required"); return; }
    setSubmitting(true);
    try {
      const data = { ...form, universityId, updatedAt: serverTimestamp() };
      if (editing?.id) {
        await updateDoc(doc(db, "university", universityId, "parcels", editing.id), data);
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "parcels"), { ...data, createdAt: serverTimestamp() });
        toast.success("Created!");
      }
      setModalOpen(false); load();
    } catch { toast.error("Save failed"); }
    finally { setSubmitting(false); }
  };

  const remove = async (item) => {
    if (!window.confirm("Delete this parcel?")) return;
    try {
      await deleteDoc(doc(db, "university", universityId, "parcels", item.id));
      toast.success("Deleted"); load();
    } catch { toast.error("Delete failed"); }
  };

  const updateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "university", universityId, "parcels", id), { status, updatedAt: serverTimestamp() });
      setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
      toast.success("Status updated");
    } catch { toast.error("Update failed"); }
  };

  if (!universityId) return <div className="p-8 text-center text-gray-400">No university assigned.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Parcels</h1>
          <p className="text-sm text-gray-500 mt-1">Track student parcel deliveries</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700">
          <Plus size={16} /> Add Parcel
        </button>
      </div>

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
          placeholder="Search by student name or email…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0
            ? <div className="text-center py-16 text-gray-400"><p className="text-lg font-semibold">No parcels found</p></div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Student", "Description", "Carrier", "Tracking", "Received", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="p-3">
                        <p className="font-semibold text-gray-800">{item.studentName}</p>
                        <p className="text-xs text-gray-400">{item.studentEmail}</p>
                      </td>
                      <td className="p-3 text-gray-600 max-w-xs"><p className="truncate">{item.description || "—"}</p></td>
                      <td className="p-3 text-gray-500">{item.carrier || "—"}</td>
                      <td className="p-3 text-gray-500">{item.trackingNumber || "—"}</td>
                      <td className="p-3 text-gray-500 text-xs">{item.receivedDate || "—"}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${STATUS_COLORS[item.status] || "bg-gray-100 text-gray-600"}`}>{item.status}</span>
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1 flex-wrap">
                          {item.status === "pending" && (
                            <button onClick={() => updateStatus(item.id, "notified")} className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded-lg hover:bg-blue-700">Mark Notified</button>
                          )}
                          {item.status !== "collected" && (
                            <button onClick={() => updateStatus(item.id, "collected")} className="text-xs bg-green-700 text-white px-2.5 py-1 rounded-lg hover:bg-green-800">Mark Collected</button>
                          )}
                          <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 size={13} className="text-blue-500" /></button>
                          <button onClick={() => remove(item)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Trash2 size={13} className="text-red-400" /></button>
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
              <h2 className="text-lg font-bold text-gray-800">{editing ? "Edit Parcel" : "Add Parcel"}</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              {[["STUDENT NAME *", "studentName", "text", "Full name"], ["STUDENT EMAIL", "studentEmail", "email", "student@example.com"], ["DESCRIPTION", "description", "text", "Package contents"], ["CARRIER", "carrier", "text", "e.g. FedEx, UPS"], ["TRACKING NUMBER", "trackingNumber", "text", "Tracking number"]].map(([lbl, key, type, ph]) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{lbl}</label>
                  <input type={type} className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600" placeholder={ph} value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">RECEIVED DATE</label>
                  <input type="date" className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.receivedDate} onChange={e => setForm(f => ({ ...f, receivedDate: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">STATUS</label>
                  <select className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="pending">Pending</option>
                    <option value="notified">Notified</option>
                    <option value="collected">Collected</option>
                  </select>
                </div>
              </div>
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
