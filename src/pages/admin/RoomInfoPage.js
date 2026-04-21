import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, getDocs, doc, setDoc, deleteDoc,
  serverTimestamp, query, orderBy, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Upload, Trash2, Search, RefreshCw, Plus, Download, Edit2 } from "lucide-react";
import { FadeLoader } from "react-spinners";

const FIELDS = [
  { key: "studentId",  label: "Student ID",    required: true },
  { key: "email",      label: "Email",          required: true },
  { key: "roomNumber", label: "Room Number",    required: true },
  { key: "floor",      label: "Floor",          required: false },
  { key: "block",      label: "Block",          required: false },
  { key: "building",   label: "Building",       required: false },
  { key: "roomType",   label: "Room Type",      required: false },
  { key: "keyInfo",    label: "Key / Access",   required: false },
  { key: "wifiNetwork",label: "Wi-Fi Network",  required: false },
  { key: "notes",      label: "Notes",          required: false },
];

// Minimal CSV parser (no external dep)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, ""));
  return lines.slice(1).map(line => {
    const vals = line.split(",");
    const row = {};
    headers.forEach((h, i) => { row[h] = (vals[i] || "").trim(); });
    return row;
  });
}

// Match CSV headers to our field keys (lenient)
function mapRow(row) {
  const keyMap = {
    studentid: "studentId", student_id: "studentId", id: "studentId",
    email: "email", emailaddress: "email",
    roomnumber: "roomNumber", room: "roomNumber", roomno: "roomNumber",
    floor: "floor",
    block: "block",
    building: "building",
    roomtype: "roomType", type: "roomType",
    keyinfo: "keyInfo", key: "keyInfo", access: "keyInfo",
    wifinetwork: "wifiNetwork", wifi: "wifiNetwork", ssid: "wifiNetwork",
    notes: "notes", note: "notes",
  };
  const mapped = {};
  Object.entries(row).forEach(([k, v]) => {
    const normalized = k.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const field = keyMap[normalized];
    if (field) mapped[field] = v;
  });
  return mapped;
}

export default function RoomInfoPage() {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null); // rows to import
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [students, setStudents] = useState([]); // users in hostel
  const fileRef = useRef();

  useEffect(() => { if (hostelId) { loadRecords(); loadStudents(); } }, [hostelId]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "hostel", hostelId, "roomInfo"));
      setRecords(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch (e) { toast.error("Failed to load records"); }
    finally { setLoading(false); }
  };

  const loadStudents = async () => {
    try {
      const snap = await getDocs(query(
        collection(db, "users"),
        where("hostelid", "==", hostelId)
      ));
      setStudents(snap.docs.map(d => ({ uid: d.id, ...d.data() })));
    } catch (e) { console.warn(e); }
  };

  const resolveUid = (row) => {
    // Try match by email or studentId
    const student = students.find(s =>
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
    let success = 0, failed = 0;
    for (const row of preview) {
      const uid = resolveUid(row);
      if (!uid) { failed++; continue; }
      try {
        await setDoc(doc(db, "hostel", hostelId, "roomInfo", uid), {
          userId: uid,
          ...row,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
        });
        success++;
      } catch { failed++; }
    }
    toast.success(`Imported ${success} records${failed > 0 ? `, ${failed} failed (student not found)` : ""}`);
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
    if (!uid) { toast.error("Student not found. Check email or student ID."); return; }
    try {
      await setDoc(doc(db, "hostel", hostelId, "roomInfo", uid), {
        userId: uid,
        ...editForm,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      }, { merge: true });
      toast.success("Saved!");
      setEditModal(false);
      loadRecords();
    } catch (e) { toast.error("Save failed"); }
  };

  const deleteRecord = async (uid) => {
    if (!window.confirm("Remove this room info?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "roomInfo", uid));
      loadRecords();
      toast.success("Deleted");
    } catch { toast.error("Delete failed"); }
  };

  const downloadTemplate = () => {
    const headers = FIELDS.map(f => f.label).join(",");
    const blob = new Blob([headers + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "room_info_template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = records.filter(r =>
    !search || [r.roomNumber, r.email, r.studentId, r.building, r.block]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Room Information</h1>
          <p className="text-sm text-gray-500 mt-1">Upload CSV or add room info manually per student</p>
        </div>
        <div className="flex gap-2">
          <button onClick={downloadTemplate} className="flex items-center gap-1.5 text-sm border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-600">
            <Download size={15} /> Template
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          <button onClick={() => fileRef.current.click()} className="flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-2 rounded-lg hover:bg-blue-700">
            <Upload size={15} /> Import CSV
          </button>
          <button onClick={openCreateManual} className="flex items-center gap-1.5 text-sm bg-green-800 text-white px-3 py-2 rounded-lg hover:bg-green-700">
            <Plus size={15} /> Add Manually
          </button>
        </div>
      </div>

      {/* CSV Preview */}
      {preview && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5">
          <div className="flex justify-between items-center mb-3">
            <p className="font-semibold text-blue-800">{preview.length} rows ready to import</p>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={importRows}
                disabled={uploading}
                className="text-sm bg-blue-600 text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? "Importing…" : "Confirm Import"}
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs text-gray-600 w-full">
              <thead><tr>{Object.keys(preview[0] || {}).map(k => <th key={k} className="text-left p-1 font-semibold">{k}</th>)}</tr></thead>
              <tbody>{preview.slice(0, 5).map((r, i) => (
                <tr key={i}>{Object.values(r).map((v, j) => <td key={j} className="p-1">{v}</td>)}</tr>
              ))}</tbody>
            </table>
            {preview.length > 5 && <p className="text-xs text-gray-400 mt-1">…and {preview.length - 5} more rows</p>}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
          placeholder="Search by room, email, student ID, building…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-lg font-semibold">No room info records</p>
              <p className="text-sm">Import a CSV or add manually</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Student", "Room", "Floor / Block", "Building", "Room Type", ""].map(h => (
                    <th key={h} className="text-left p-3 text-xs font-semibold text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.uid} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="p-3">
                      <p className="font-semibold text-gray-800">{r.email || "—"}</p>
                      <p className="text-xs text-gray-400">{r.studentId || ""}</p>
                    </td>
                    <td className="p-3 font-bold text-green-800">{r.roomNumber || "—"}</td>
                    <td className="p-3 text-gray-600">{[r.floor, r.block].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="p-3 text-gray-600">{r.building || "—"}</td>
                    <td className="p-3 text-gray-600">{r.roomType || "—"}</td>
                    <td className="p-3">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => openEdit(r)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Edit2 size={14} className="text-blue-500" /></button>
                        <button onClick={() => deleteRecord(r.uid)} className="p-1.5 hover:bg-gray-100 rounded-lg"><Trash2 size={14} className="text-red-400" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Edit / Create Modal */}
      {editModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center overflow-y-auto py-6">
          <div className="bg-white rounded-2xl w-full max-w-lg mx-4 p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">
              {editForm.uid ? "Edit Room Info" : "Add Room Info"}
            </h2>
            <div className="space-y-3">
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">{f.label}{f.required ? " *" : ""}</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                    value={editForm[f.key] || ""}
                    onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setEditModal(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={saveRecord} className="flex-1 py-2.5 bg-green-800 text-white rounded-lg text-sm hover:bg-green-700">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

