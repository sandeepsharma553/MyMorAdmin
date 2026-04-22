import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, Edit2, X, Search } from "lucide-react";
import { FadeLoader } from "react-spinners";

const STATUS_COLORS = {
  pending: "bg-orange-100 text-orange-700",
  notified: "bg-blue-100 text-blue-700",
  collected: "bg-green-100 text-green-700",
};

const EMPTY = {
  studentName: "",
  studentEmail: "",
  description: "",
  carrier: "",
  trackingNumber: "",
  receivedDate: "",
  status: "pending",
};

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

  useEffect(() => {
    if (universityId) load();
  }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "university", universityId, "parcels"),
          orderBy("receivedDate", "desc")
        )
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load parcels");
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter(
      (i) =>
        !term ||
        i.studentName?.toLowerCase().includes(term) ||
        i.studentEmail?.toLowerCase().includes(term)
    );
  }, [items, search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      studentName: item.studentName || "",
      studentEmail: item.studentEmail || "",
      description: item.description || "",
      carrier: item.carrier || "",
      trackingNumber: item.trackingNumber || "",
      receivedDate: item.receivedDate || "",
      status: item.status || "pending",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.studentName.trim()) {
      toast.error("Student name is required");
      return;
    }

    setSubmitting(true);
    try {
      const data = { ...form, universityId, updatedAt: serverTimestamp() };

      if (editing?.id) {
        await updateDoc(
          doc(db, "university", universityId, "parcels", editing.id),
          data
        );
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "parcels"), {
          ...data,
          createdAt: serverTimestamp(),
        });
        toast.success("Created!");
      }

      setModalOpen(false);
      load();
    } catch {
      toast.error("Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm("Delete this parcel?")) return;
    try {
      await deleteDoc(doc(db, "university", universityId, "parcels", item.id));
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "university", universityId, "parcels", id), {
        status,
        updatedAt: serverTimestamp(),
      });
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      toast.success("Status updated");
    } catch {
      toast.error("Update failed");
    }
  };

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
      <ToastContainer />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Parcels</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
        >
          <Plus size={16} />
          Add Parcel
        </button>
      </div>

      <div className="relative mb-4">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
        />
        <input
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none"
          placeholder="Search by student name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={loading} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            No parcels found.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Student",
                  "Description",
                  "Carrier",
                  "Tracking",
                  "Received",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-6 py-3 text-left text-sm font-medium text-gray-500"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {filtered.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium text-gray-700">
                      {item.studentName}
                    </div>
                    <div className="text-xs text-gray-400">
                      {item.studentEmail || "—"}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                    <div className="truncate">{item.description || "—"}</div>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.carrier || "—"}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.trackingNumber || "—"}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.receivedDate || "—"}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        STATUS_COLORS[item.status] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {item.status === "pending" && (
                      <button
                        onClick={() => updateStatus(item.id, "notified")}
                        className="text-blue-600 hover:underline mr-3"
                      >
                        Mark Notified
                      </button>
                    )}

                    {item.status !== "collected" && (
                      <button
                        onClick={() => updateStatus(item.id, "collected")}
                        className="text-green-600 hover:underline mr-3"
                      >
                        Mark Collected
                      </button>
                    )}

                    <button
                      onClick={() => openEdit(item)}
                      className="text-blue-600 hover:underline mr-3 inline-flex items-center gap-1"
                    >
                      <Edit2 size={14} />
                      Edit
                    </button>

                    <button
                      onClick={() => remove(item)}
                      className="text-red-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editing ? "Edit Parcel" : "Add Parcel"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {[
                ["Student Name", "studentName", "text", "Full name"],
                ["Student Email", "studentEmail", "email", "student@example.com"],
                ["Description", "description", "text", "Package contents"],
                ["Carrier", "carrier", "text", "e.g. FedEx, UPS"],
                ["Tracking Number", "trackingNumber", "text", "Tracking number"],
              ].map(([label, key, type, ph]) => (
                <div key={key}>
                  <label className="block font-medium mb-1">{label}</label>
                  <input
                    type={type}
                    className="w-full border border-gray-300 p-2 rounded"
                    placeholder={ph}
                    value={form[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                  />
                </div>
              ))}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">Received Date</label>
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.receivedDate}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, receivedDate: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Status</label>
                  <select
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.status}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, status: e.target.value }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="notified">Notified</option>
                    <option value="collected">Collected</option>
                  </select>
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
        </div>
      )}
    </main>
  );
}