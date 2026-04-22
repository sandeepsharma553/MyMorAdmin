import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Upload, Trash2, Search, Plus, Download, Edit2, X } from "lucide-react";
import { FadeLoader } from "react-spinners";

const FIELDS = [
  { key: "studentId", label: "Student ID", required: true },
  { key: "email", label: "Email", required: true },
  { key: "roomNumber", label: "Room Number", required: true },
  { key: "floor", label: "Floor", required: false },
  { key: "block", label: "Block", required: false },
  { key: "building", label: "Building", required: false },
  { key: "roomType", label: "Room Type", required: false },
  { key: "keyInfo", label: "Key / Access", required: false },
  { key: "wifiNetwork", label: "Wi-Fi Network", required: false },
  { key: "notes", label: "Notes", required: false },
];

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => {
      row[h] = (vals[i] || "").trim();
    });
    return row;
  });
}

function mapRow(row) {
  const keyMap = {
    studentid: "studentId",
    student_id: "studentId",
    id: "studentId",
    email: "email",
    emailaddress: "email",
    roomnumber: "roomNumber",
    room: "roomNumber",
    roomno: "roomNumber",
    floor: "floor",
    block: "block",
    building: "building",
    roomtype: "roomType",
    type: "roomType",
    keyinfo: "keyInfo",
    key: "keyInfo",
    access: "keyInfo",
    wifinetwork: "wifiNetwork",
    wifi: "wifiNetwork",
    ssid: "wifiNetwork",
    notes: "notes",
    note: "notes",
  };

  const mapped = {};
  Object.entries(row).forEach(([k, v]) => {
    const normalized = k.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const field = keyMap[normalized];
    if (field) mapped[field] = v;
  });
  return mapped;
}

export default function RoomInfoPage({ navbarHeight }) {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [students, setStudents] = useState([]);
  const fileRef = useRef();

  useEffect(() => {
    if (hostelId) {
      loadRecords();
      loadStudents();
    }
  }, [hostelId]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "hostel", hostelId, "roomInfo"));
      setRecords(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (e) {
      toast.error("Failed to load records");
    } finally {
      setLoading(false);
    }
  };

  const loadStudents = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("hostelid", "==", hostelId))
      );
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (e) {
      console.warn(e);
    }
  };

  const resolveUid = (row) => {
    const student = students.find(
      (s) =>
        s.email?.toLowerCase() === row.email?.toLowerCase() ||
        s.studentid === row.studentId
    );
    return student?.uid || null;
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result).map(mapRow);
      setPreview(rows);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const importRows = async () => {
    if (!preview?.length) return;
    setUploading(true);
    let success = 0;
    let failed = 0;

    for (const row of preview) {
      const uid = resolveUid(row);
      if (!uid) {
        failed++;
        continue;
      }
      try {
        await setDoc(doc(db, "hostel", hostelId, "roomInfo", uid), {
          userId: uid,
          ...row,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        success++;
      } catch {
        failed++;
      }
    }

    toast.success(
      `Imported ${success} records${failed > 0 ? `, ${failed} failed (student not found)` : ""}`
    );
    setPreview(null);
    loadRecords();
    setUploading(false);
  };

  const openEdit = (record) => {
    setEditForm({ ...record });
    setEditModal(true);
  };

  const openCreateManual = () => {
    setEditForm({});
    setEditModal(true);
  };

  const saveRecord = async () => {
    if (!editForm.email && !editForm.studentId) {
      toast.error("Email or Student ID is required to identify the student");
      return;
    }
    const uid = resolveUid(editForm) || editForm.uid;
    if (!uid) {
      toast.error("Student not found. Check email or student ID.");
      return;
    }
    try {
      await setDoc(
        doc(db, "hostel", hostelId, "roomInfo", uid),
        {
          userId: uid,
          ...editForm,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        },
        { merge: true }
      );
      toast.success("Saved!");
      setEditModal(false);
      loadRecords();
    } catch (e) {
      toast.error("Save failed");
    }
  };

  const deleteRecord = async (uid) => {
    if (!window.confirm("Remove this room info?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "roomInfo", uid));
      loadRecords();
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const downloadTemplate = () => {
    const headers = FIELDS.map((f) => f.label).join(",");
    const blob = new Blob([headers + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "room_info_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = records.filter(
    (r) =>
      !search ||
      [r.roomNumber, r.email, r.studentId, r.building, r.block].some((v) =>
        v?.toLowerCase().includes(search.toLowerCase())
      )
  );

  if (!hostelId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          No hostel assigned.
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Room Information</h1>
        <div className="flex gap-2">
          <button
            onClick={downloadTemplate}
            className="px-4 py-2 border border-gray-300 bg-white text-gray-700 rounded hover:bg-gray-50 flex items-center gap-2"
          >
            <Download size={15} /> Template
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current.click()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            <Upload size={15} /> Import CSV
          </button>
          <button
            onClick={openCreateManual}
            className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
          >
            <Plus size={15} /> Add Manually
          </button>
        </div>
      </div>

      {preview && (
        <div className="bg-white rounded shadow p-4 mb-4 border border-gray-100">
          <div className="flex justify-between items-center mb-3">
            <p className="font-medium text-gray-700">{preview.length} rows ready to import</p>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="px-3 py-1 text-sm text-gray-600 border border-gray-300 rounded">
                Cancel
              </button>
              <button
                onClick={importRows}
                disabled={uploading}
                className="px-4 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm"
              >
                {uploading ? "Importing..." : "Confirm Import"}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {Object.keys(preview[0] || {}).map((k) => (
                    <th key={k} className="px-3 py-2 text-left text-xs font-medium text-gray-500">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {preview.slice(0, 5).map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).map((v, j) => (
                      <td key={j} className="px-3 py-2 text-gray-600">
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {preview.length > 5 && (
              <p className="text-xs text-gray-400 mt-2">...and {preview.length - 5} more rows</p>
            )}
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none"
          placeholder="Search by room, email, student ID, building..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="bg-white rounded shadow">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={loading} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">No room info records.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Student", "Room", "Floor / Block", "Building", "Room Type", "Actions"].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {filtered.map((r) => (
                <tr key={r.uid}>
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium text-gray-700">{r.email || "—"}</div>
                    <div className="text-xs text-gray-400">{r.studentId || ""}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">{r.roomNumber || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {[r.floor, r.block].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.building || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.roomType || "—"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => openEdit(r)}
                      className="text-blue-600 hover:underline mr-3 inline-flex items-center gap-1"
                    >
                      <Edit2 size={14} /> Edit
                    </button>
                    <button
                      onClick={() => deleteRecord(r.uid)}
                      className="text-red-600 hover:underline inline-flex items-center gap-1"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">{editForm.uid ? "Edit Room Info" : "Add Room Info"}</h2>
              <button onClick={() => setEditModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block font-medium mb-1">
                    {f.label}{f.required ? " *" : ""}
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded p-2 text-sm"
                    value={editForm[f.key] || ""}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => setEditModal(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={saveRecord}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}