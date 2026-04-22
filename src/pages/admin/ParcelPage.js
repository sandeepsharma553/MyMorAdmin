import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import {
  Package,
  Plus,
  Trash2,
  Edit2,
  Search,
  CheckCircle,
  Bell,
  FileText,
  X,
} from "lucide-react";
import { FadeLoader } from "react-spinners";

const STATUS_CONFIG = {
  pending: { label: "Incoming", bg: "bg-orange-100", text: "text-orange-700" },
  notified: { label: "Ready", bg: "bg-blue-100", text: "text-blue-700" },
  collected: { label: "Collected", bg: "bg-green-100", text: "text-green-700" },
};

export default function ParcelPage({ navbarHeight }) {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [parcels, setParcels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState("parcels");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [parcelModal, setParcelModal] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [customMessage, setCustomMessage] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sending, setSending] = useState(false);

  const [templateModal, setTemplateModal] = useState(false);
  const [templateForm, setTemplateForm] = useState({ title: "", message: "" });
  const [editingTemplate, setEditingTemplate] = useState(null);

  useEffect(() => {
    if (hostelId) {
      loadParcels();
      loadTemplates();
      loadStudents();
    }
  }, [hostelId]);

  const loadParcels = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, "hostel", hostelId, "parcels"), orderBy("createdAt", "desc"))
      );
      setParcels(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      toast.error("Failed to load parcels");
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "hostel", hostelId, "parcelTemplates"), orderBy("createdAt", "desc"))
      );
      setTemplates(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {}
  };

  const loadStudents = async () => {
    try {
      const snap = await getDocs(
        query(collection(db, "users"), where("hostelid", "==", hostelId))
      );
      setStudents(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (e) {}
  };

  const matchedStudents =
    studentQuery.trim().length > 1
      ? students
          .filter(
            (s) =>
              s.email?.toLowerCase().includes(studentQuery.toLowerCase()) ||
              `${s.firstname || ""} ${s.lastname || ""}`
                .toLowerCase()
                .includes(studentQuery.toLowerCase()) ||
              s.studentid?.toLowerCase().includes(studentQuery.toLowerCase())
          )
          .slice(0, 5)
      : [];

  const pickTemplate = (t) => {
    setSelectedTemplate(t);
    setCustomMessage(t.message);
  };

  const sendParcel = async () => {
    if (!selectedStudent) {
      toast.error("Select a student");
      return;
    }
    if (!customMessage.trim()) {
      toast.error("Message is required");
      return;
    }

    setSending(true);
    try {
      await addDoc(collection(db, "hostel", hostelId, "parcels"), {
        userId: selectedStudent.uid,
        userName: `${selectedStudent.firstname || ""} ${selectedStudent.lastname || ""}`.trim(),
        userEmail: selectedStudent.email || "",
        studentId: selectedStudent.studentid || "",
        status: "notified",
        customMessage: customMessage.trim(),
        templateId: selectedTemplate?.id || null,
        notifiedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        collectedAt: null,
      });

      toast.success("Parcel notification sent!");
      setParcelModal(false);
      setSelectedStudent(null);
      setCustomMessage("");
      setSelectedTemplate(null);
      setStudentQuery("");
      loadParcels();
    } catch (e) {
      toast.error("Failed to send");
    } finally {
      setSending(false);
    }
  };

  const markCollected = async (parcel) => {
    try {
      await updateDoc(doc(db, "hostel", hostelId, "parcels", parcel.id), {
        status: "collected",
        collectedAt: serverTimestamp(),
      });
      loadParcels();
      toast.success("Marked as collected");
    } catch {
      toast.error("Failed");
    }
  };

  const deleteParcel = async (id) => {
    if (!window.confirm("Delete this parcel record?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "parcels", id));
      loadParcels();
    } catch {
      toast.error("Delete failed");
    }
  };

  const saveTemplate = async () => {
    if (!templateForm.title.trim() || !templateForm.message.trim()) {
      toast.error("Title and message are required");
      return;
    }

    try {
      if (editingTemplate?.id) {
        await updateDoc(doc(db, "hostel", hostelId, "parcelTemplates", editingTemplate.id), {
          ...templateForm,
          updatedAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "hostel", hostelId, "parcelTemplates"), {
          ...templateForm,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }

      toast.success("Template saved!");
      setTemplateModal(false);
      setEditingTemplate(null);
      setTemplateForm({ title: "", message: "" });
      loadTemplates();
    } catch {
      toast.error("Save failed");
    }
  };

  const deleteTemplate = async (id) => {
    if (!window.confirm("Delete template?")) return;
    try {
      await deleteDoc(doc(db, "hostel", hostelId, "parcelTemplates", id));
      loadTemplates();
    } catch {
      toast.error("Delete failed");
    }
  };

  const filtered = parcels.filter((p) => {
    const matchSearch =
      !search ||
      [p.userName, p.userEmail, p.studentId].some((v) =>
        v?.toLowerCase().includes(search.toLowerCase())
      );
    const matchStatus = statusFilter === "all" || p.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const toDate = (v) => {
    if (!v) return "";
    const ms = v?.seconds ? v.seconds * 1000 : Date.parse(v);
    return ms
      ? new Date(ms).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "";
  };

  if (!hostelId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          No hostel assigned.
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
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Parcel Management</h1>
        <button
          onClick={() => {
            setParcelModal(true);
            setSelectedStudent(null);
            setCustomMessage("");
            setStudentQuery("");
            setSelectedTemplate(null);
          }}
          className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2"
        >
          <Bell size={16} />
          Notify Student
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {["parcels", "templates"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded text-sm font-medium capitalize ${
              tab === t
                ? "bg-black text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "parcels" && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none"
                placeholder="Search student name, email, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              {["all", "notified", "collected"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded text-sm font-medium capitalize ${
                    statusFilter === s
                      ? "bg-black text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {s === "all" ? "All" : STATUS_CONFIG[s]?.label || s}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded shadow">
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" loading={loading} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-6 py-16 text-center text-gray-500">
                <Package size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No parcels found</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filtered.map((p) => {
                  const sc = STATUS_CONFIG[p.status] || {
                    label: p.status,
                    bg: "bg-gray-100",
                    text: "text-gray-600",
                  };

                  return (
                    <div key={p.id} className="p-4 flex items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}
                          >
                            {sc.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {toDate(p.notifiedAt)}
                          </span>
                        </div>

                        <p className="font-medium text-gray-800">
                          {p.userName}{" "}
                          <span className="text-gray-400 font-normal text-sm">
                            ({p.userEmail})
                          </span>
                        </p>

                        {p.customMessage && (
                          <p className="text-sm text-gray-600 mt-1">
                            {p.customMessage}
                          </p>
                        )}

                        {p.status === "collected" && (
                          <p className="text-xs text-green-600 mt-1">
                            Collected: {toDate(p.collectedAt)}
                          </p>
                        )}
                      </div>

                      <div className="flex gap-2">
                        {p.status === "notified" && (
                          <button
                            onClick={() => markCollected(p)}
                            className="text-green-600 hover:underline inline-flex items-center gap-1"
                            title="Mark collected"
                          >
                            <CheckCircle size={16} />
                          </button>
                        )}

                        <button
                          onClick={() => deleteParcel(p.id)}
                          className="text-red-600 hover:underline inline-flex items-center gap-1"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {tab === "templates" && (
        <div>
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                setEditingTemplate(null);
                setTemplateForm({ title: "", message: "" });
                setTemplateModal(true);
              }}
              className="px-4 py-2 bg-black text-white rounded hover:bg-black flex items-center gap-2 text-sm"
            >
              <Plus size={15} />
              New Template
            </button>
          </div>

          <div className="bg-white rounded shadow">
            {templates.length === 0 ? (
              <div className="px-6 py-16 text-center text-gray-500">
                No templates yet. Create one to use when notifying students.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {templates.map((t) => (
                  <div key={t.id} className="p-4 flex items-start gap-4">
                    <FileText size={20} className="text-gray-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{t.title}</p>
                      <p className="text-sm text-gray-500 mt-1">{t.message}</p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingTemplate(t);
                          setTemplateForm({ title: t.title, message: t.message });
                          setTemplateModal(true);
                        }}
                        className="text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Edit2 size={14} />
                      </button>

                      <button
                        onClick={() => deleteTemplate(t.id)}
                        className="text-red-600 hover:underline inline-flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {parcelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-md mx-4 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Notify Student — Parcel Arrived</h2>
              <button onClick={() => setParcelModal(false)} className="text-gray-500 hover:text-gray-700">
                <X size={20} />
              </button>
            </div>

            <label className="block font-medium mb-1">Search Student</label>
            <div className="relative mb-3">
              <input
                className="w-full border border-gray-300 rounded p-3 text-sm"
                placeholder="Name, email, or student ID..."
                value={
                  selectedStudent
                    ? `${selectedStudent.firstname || ""} ${selectedStudent.lastname || ""} (${selectedStudent.email})`
                    : studentQuery
                }
                onChange={(e) => {
                  setStudentQuery(e.target.value);
                  setSelectedStudent(null);
                }}
              />

              {matchedStudents.length > 0 && !selectedStudent && (
                <div className="absolute left-0 right-0 top-full z-10 bg-white border border-gray-200 rounded shadow mt-1 overflow-hidden">
                  {matchedStudents.map((s) => (
                    <button
                      key={s.uid}
                      onClick={() => {
                        setSelectedStudent(s);
                        setStudentQuery("");
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0"
                    >
                      <p className="font-medium text-gray-800">
                        {s.firstname} {s.lastname}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.email} · {s.studentid || "no ID"}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {templates.length > 0 && (
              <div className="mb-3">
                <label className="block font-medium mb-1">Use Template (Optional)</label>
                <div className="flex flex-wrap gap-2">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => pickTemplate(t)}
                      className={`px-3 py-2 rounded text-xs font-medium border ${
                        selectedTemplate?.id === t.id
                          ? "bg-black text-white border-black"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {t.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="block font-medium mb-1">Message</label>
            <textarea
              className="w-full border border-gray-300 rounded p-3 text-sm mb-4 resize-none"
              rows={3}
              placeholder="e.g. Your parcel is ready for collection at reception. Please bring your student ID."
              value={customMessage}
              onChange={(e) => {
                setCustomMessage(e.target.value);
                setSelectedTemplate(null);
              }}
            />

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => setParcelModal(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={sendParcel}
                disabled={!selectedStudent || !customMessage.trim() || sending}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? "Sending..." : "Send Notification"}
              </button>
            </div>
          </div>
        </div>
      )}

      {templateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-md mx-4 p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                {editingTemplate ? "Edit Template" : "New Template"}
              </h2>
              <button
                onClick={() => {
                  setTemplateModal(false);
                  setEditingTemplate(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <input
              className="w-full border border-gray-300 rounded p-3 text-sm mb-3"
              placeholder="Template title (e.g. Standard Pickup)"
              value={templateForm.title}
              onChange={(e) =>
                setTemplateForm((f) => ({ ...f, title: e.target.value }))
              }
            />

            <textarea
              className="w-full border border-gray-300 rounded p-3 text-sm mb-4 resize-none"
              rows={4}
              placeholder="Message text..."
              value={templateForm.message}
              onChange={(e) =>
                setTemplateForm((f) => ({ ...f, message: e.target.value }))
              }
            />

            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => {
                  setTemplateModal(false);
                  setEditingTemplate(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={saveTemplate}
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