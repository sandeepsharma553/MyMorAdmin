import React, { useState, useEffect } from "react";
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
import { Plus, Trash2, Edit2, X } from "lucide-react";
import { FadeLoader } from "react-spinners";

const ROOM_TYPES = ["Lecture", "Seminar", "Lab", "Study", "Other"];
const EMPTY = {
  roomNumber: "",
  building: "",
  floor: "",
  capacity: 30,
  roomType: "Lecture",
  facilities: "",
  isAvailable: true,
};

export default function UniversityRoomInfoPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
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
          collection(db, "university", universityId, "roominfo"),
          orderBy("roomNumber")
        )
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      roomNumber: item.roomNumber || "",
      building: item.building || "",
      floor: item.floor || "",
      capacity: item.capacity || 30,
      roomType: item.roomType || "Lecture",
      facilities: item.facilities || "",
      isAvailable: item.isAvailable !== false,
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.roomNumber.trim()) {
      toast.error("Room number is required");
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        ...form,
        capacity: Number(form.capacity) || 0,
        universityId,
        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        await updateDoc(
          doc(db, "university", universityId, "roominfo", editing.id),
          data
        );
        toast.success("Updated!");
      } else {
        await addDoc(collection(db, "university", universityId, "roominfo"), {
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
    if (!window.confirm("Delete this room?")) return;
    try {
      await deleteDoc(doc(db, "university", universityId, "roominfo", item.id));
      toast.success("Deleted");
      load();
    } catch {
      toast.error("Delete failed");
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
        <h1 className="text-2xl font-semibold">University Room Info</h1>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
        >
          <Plus size={16} />
          Add Room
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={loading} />
          </div>
        ) : items.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            No rooms found.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Room No.",
                  "Building",
                  "Floor",
                  "Capacity",
                  "Type",
                  "Available",
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
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-medium">
                    {item.roomNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.building || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.floor || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.capacity}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className="px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                      {item.roomType}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        item.isAvailable !== false
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.isAvailable !== false ? "Available" : "Not Available"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
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
                {editing ? "Edit Room" : "Add Room"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-medium mb-1">Room Number</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded"
                    placeholder="e.g. A101"
                    value={form.roomNumber}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, roomNumber: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Building</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded"
                    placeholder="e.g. Block A"
                    value={form.building}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, building: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block font-medium mb-1">Floor</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded"
                    placeholder="e.g. 2"
                    value={form.floor}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, floor: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Capacity</label>
                  <input
                    type="number"
                    min="1"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.capacity}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, capacity: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="block font-medium mb-1">Room Type</label>
                  <select
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.roomType}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, roomType: e.target.value }))
                    }
                  >
                    {ROOM_TYPES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium mb-1">Facilities</label>
                <textarea
                  rows={3}
                  className="w-full border border-gray-300 p-2 rounded"
                  placeholder="Projector, AC, Whiteboard…"
                  value={form.facilities}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, facilities: e.target.value }))
                  }
                />
              </div>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isAvailable}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, isAvailable: e.target.checked }))
                  }
                />
                <span className="text-sm text-gray-700">Available</span>
              </label>

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