import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, setDoc, serverTimestamp
} from "firebase/firestore"; // ✅ includes setDoc, serverTimestamp
import { db, storage } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import dayjs from "dayjs";
import { useReactToPrint } from "react-to-print";

export default function Feedback(props) {
  const { navbarHeight } = props;

  // === UI / Modals ===
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [fileName, setFileName] = useState("No file chosen");
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [viewData, setViewData] = useState(null);

  // === Auth & roles ===
  const authUser = useSelector((state) => state.auth.user);
  const uid = authUser?.uid;
  const myEmail = (authUser?.email || "").toLowerCase();
  const emp = useSelector((state) => state.auth.employee);
  const isAdmin = (emp?.role || "").toLowerCase().includes("admin");

  // === Assign & Notes ===
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  const [assignEmail, setAssignEmail] = useState(""); // free-input field (adder)
  const [assignEmails, setAssignEmails] = useState([]); // chips (normalized)
  const [assignNote, setAssignNote] = useState("");
  const [adminEmails, setAdminEmails] = useState([]);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteText, setNoteText] = useState("");

  // === Filters & sorting ===
  const [filters, setFilters] = useState({
    report: "",
    user: "",
    type: "",
    date: "",
    status: "All",
  });
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => setFilters((p) => ({ ...p, [field]: value })),
      250
    );
  };
  const onSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  };

  // === Pagination ===
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  useEffect(() => { setCurrentPage(1); }, [filters, sortConfig]);

  // === Form ===
  const initialForm = {
    id: 0,
    incidenttype: "",
    other: "",
    description: "",
    datetime: "",
    isreport: false,
    image: null,
    hostelid: "",
    status: "Pending",
  };
  const [form, setForm] = useState(initialForm);

  // === Print ===
  const contentRef = useRef(null);
  const handlePrint = useReactToPrint({ contentRef });

  // === Effects ===
  useEffect(() => {
    getList();
    loadAdmins();
  }, []);

  useEffect(() => {
    const doReset = async () => {
      if (!uid) return;
      const refDoc = doc(db, "adminMenuState", uid, "menus", "feedback");
      await setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
    };
    doReset();
  }, [uid]);

  // === Helpers ===
  const isValidEmail = (s = "") => /\S+@\S+\.\S+/.test(String(s).trim());
  const normalizeEmail = (s = "") => String(s).trim().toLowerCase();

  const addAssignEmail = (em) => {
    const e = normalizeEmail(em);
    if (!isValidEmail(e)) return;
    setAssignEmails((prev) => (prev.includes(e) ? prev : [...prev, e]));
  };
  const removeAssignEmail = (em) => {
    setAssignEmails((prev) => prev.filter((x) => x !== em));
  };

  const canModify = (row) => {
    const singleEmail = (row?.assignedToEmail || "").toLowerCase();
    const manyEmails = Array.isArray(row?.assignedToEmails) ? row.assignedToEmails : [];
    const emailOk = singleEmail === myEmail || manyEmails.includes(myEmail);

    const singleUid = row?.assignedToUid || null;
    const manyUids = Array.isArray(row?.assignedToUids) ? row.assignedToUids : [];
    const uidOk = singleUid === uid || manyUids.includes(uid);

    return !!(isAdmin || emailOk || uidOk);
  };

  const getEmployeeUidByEmail = async (email) => {
    if (!email) return null;
    const qEmp = query(collection(db, "employees"), where("email", "==", email));
    const snap = await getDocs(qEmp);
    let euid = null;
    snap.forEach(d => {
      const u = d.data();
      euid = u.uid || u.userId || null;
    });
    return euid;
  };

  const loadAdmins = async () => {
    try {
      if (!emp?.hostelid) return;
      const qAdmins = query(collection(db, "employees"), where("hostelid", "==", emp.hostelid));
      const snap = await getDocs(qAdmins);
      const emails = [];
      snap.forEach(d => {
        const u = d.data();
        const role = (u.role || u.Role || "").toLowerCase();
        if (u.email && role !== "admin") emails.push(String(u.email).toLowerCase());
      });
      setAdminEmails(Array.from(new Set(emails)).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      console.error(e);
    }
  };

  // === Time utils for unread calc (supports ISO string, number, Date, Firestore Timestamp) ===
  const toMillis = (v) => {
    if (!v) return 0;
    if (typeof v === "number") return v;
    if (typeof v === "string") { const t = Date.parse(v); return isNaN(t) ? 0 : t; }
    if (v instanceof Date) return v.getTime();
    if (v?.seconds) return v.seconds * 1000;
    return 0;
  };

  const getUnreadCount = (row) => {
    const notes = Array.isArray(row?.adminNotes) ? row.adminNotes : [];
    if (notes.length === 0) return 0;
    const seen = row?.notesSeenBy?.[uid] || null;
    const seenMs = toMillis(seen);
    if (!seenMs) return notes.length; // never seen
    return notes.filter((n) => toMillis(n.at) > seenMs).length;
  };

  const markNotesSeen = async (row) => {
    if (!row?.id || !uid) return;
    try {
      const refDoc = doc(db, "feedback", row.id);
      await updateDoc(refDoc, { [`notesSeenBy.${uid}`]: serverTimestamp() });
      // Update local list immediately so badge hides
      setList((prev) =>
        prev.map((it) =>
          it.id === row.id
            ? { ...it, notesSeenBy: { ...(it.notesSeenBy || {}), [uid]: new Date().toISOString() } }
            : it
        )
      );
    } catch (e) {
      console.error("Failed to mark notes seen", e);
    }
  };

  // === Data ===
 // === Data ===
const getList = async () => {
  setIsLoading(true);

  // uid -> username map
  const usersQuery = query(
    collection(db, "users"),
    where("hostelid", "==", emp.hostelid)
  );
  const usersSnap = await getDocs(usersQuery);
  const userMap = {};
  usersSnap.forEach((d) => {
    const data = d.data();
    const username = data.username || data.UserName || data.USERNAME || "Unknown";
    userMap[data.uid] = username;
  });

  // incidents  (collection: feedback)
  const feedbackQuery = query(
    collection(db, "feedback"),
    where("hostelid", "==", emp.hostelid)
  );
  const feedbackSnapshot = await getDocs(feedbackQuery);
  let rows = feedbackSnapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      ...data,
      username: userMap[data.uid] || "",

      // multi-assign (with legacy fallback)
      assignedToEmail: data.assignedToEmail || "",
      assignedToUid: data.assignedToUid || null,
      assignedToEmails: Array.isArray(data.assignedToEmails)
        ? data.assignedToEmails
        : (data.assignedToEmail ? [String(data.assignedToEmail).toLowerCase()] : []),
      assignedToUids: Array.isArray(data.assignedToUids)
        ? data.assignedToUids
        : (data.assignedToUid ? [data.assignedToUid] : []),

      adminNotes: Array.isArray(data.adminNotes) ? data.adminNotes : [],
      notesSeenBy: data.notesSeenBy || {},
    };
  });

  // 🔒 Non-admin: show only incidents assigned to them (by email OR uid)
  if (!isAdmin) {
    const me = (myEmail || "").trim().toLowerCase();
    rows = rows.filter((r) => {
      const emails = Array.isArray(r.assignedToEmails)
        ? r.assignedToEmails.map((e) => String(e || "").toLowerCase())
        : [];
      const uids = Array.isArray(r.assignedToUids) ? r.assignedToUids : [];

      const matchEmail =
        (r.assignedToEmail && String(r.assignedToEmail).toLowerCase() === me) ||
        emails.includes(me);

      const matchUid =
        (r.assignedToUid && r.assignedToUid === uid) ||
        uids.includes(uid);

      return matchEmail || matchUid;
    });
  }

  setList(rows);
  setIsLoading(false);
};

  // === Create / Update ===
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.incidenttype) return;

    setIsLoading(true);
    let imageUrl = "";

    if (form.image) {
      const imageRef = ref(storage, `feedback/${Date.now()}_${form.image.name}`);
      await uploadBytes(imageRef, form.image);
      imageUrl = await getDownloadURL(imageRef);
    }

    try {
      if (editingData) {
        const docRef = doc(db, "feedback", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("Report does not exist! Cannot update.");
          setIsLoading(false);
          return;
        }
        await updateDoc(docRef, {
          uid,
          incidenttype: form.incidenttype === "Other" ? form.other : form.incidenttype,
          description: form.description,
          datetime: form.datetime,
          isreport: form.isreport,
          ...(imageUrl && { imageUrl }), // keep old image if not replaced
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),          // human-readable
          updatedAt: serverTimestamp(),     // machine
          status: form.status || "Pending",
        });
        toast.success("Successfully updated");
      } else {
        await addDoc(collection(db, "feedback"), {
          uid,
          incidenttype: form.incidenttype === "Other" ? form.other : form.incidenttype,
          description: form.description,
          datetime: form.datetime,
          isreport: form.isreport,
          imageUrl,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),          // human-readable
          createdAt: serverTimestamp(),     // machine
          status: "Pending",

          // initialize assign/notes
          assignedToEmail: "",
          assignedToUid: null,
          assignedToEmails: [],
          assignedToUids: [],
          adminNotes: [],
          notesSeenBy: {},                  // NEW
        });
        toast.success("Successfully saved");
      }
      getList();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }

    setIsLoading(false);
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
  };

  // === Delete ===
  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "feedback", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  // === View / Print ===
  const openView = async (row) => {
    // mark seen so badge hides as soon as user opens
    await markNotesSeen(row);
    setViewData(row);
    setViewModalOpen(true);
  };

  // === Status ===
  // const updateStatus = async (id, newStatus) => {
  //   try {
  //     const requestRef = doc(db, "feedback", id);
  //     await updateDoc(requestRef, { status: newStatus });
  //     toast.success("Status updated!");
  //     getList();
  //   } catch (error) {
  //     console.error("Error updating status:", error);
  //     toast.error("Failed to update status.");
  //   }
  // };
  const updateStatus = async (id, newStatus) => {
    try {
      const row = list.find(r => r.id === id);
      if (!row) return;
      if (!canModify(row)) { toast.error("You don't have permission to update this."); return; }
      const requestRef = doc(db, "feedback", id);
      await updateDoc(requestRef, {
        status: newStatus, updatedBy: authUser?.email || uid,
        updatedAt: serverTimestamp(),
      });
      toast.success("Status updated!");
      getList();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status.");
    }
  };


  // === Assign ===
  const openAssign = (row) => {
    setAssignTarget(row);
    setAssignEmail(""); // use as adder
    const draft = Array.isArray(row.assignedToEmails)
      ? row.assignedToEmails
      : (row.assignedToEmail ? [String(row.assignedToEmail).toLowerCase()] : []);
    setAssignEmails(draft);
    setAssignNote("");
    setAssignModalOpen(true);
  };

  const saveAssignment = async () => {
    if (!assignTarget?.id) return;
    try {
      const requestRef = doc(db, "feedback", assignTarget.id);

      // combine tokens + last typed email (if any) safely
      const extra = normalizeEmail(assignEmail);
      const candidate = extra && isValidEmail(extra) ? [...assignEmails, extra] : assignEmails;
      const emails = Array.from(new Set(candidate.map(normalizeEmail))).filter(isValidEmail);
      if (emails.length === 0) { toast.error("Add at least one valid email."); return; }

      // optional note entry
      const noteEntry = assignNote.trim()
        ? { by: authUser?.email || uid, byUid: uid || null, at: new Date().toISOString(), text: assignNote.trim() }
        : null;

      const current = list.find(x => x.id === assignTarget.id);
      const prevNotes = Array.isArray(current?.adminNotes) ? current.adminNotes : [];
      const nextNotes = noteEntry ? [...prevNotes, noteEntry] : prevNotes;

      // look up UIDs for each email (best-effort)
      const uids = await Promise.all(emails.map((e) => getEmployeeUidByEmail(e)));
      const assignedToUids = uids.map((u) => u || null);

      await updateDoc(requestRef, {
        assignedToEmails: emails,
        assignedToUids,
        assignedToEmail: emails[0] || "",
        assignedToUid: assignedToUids[0] || null,

        assignedBy: authUser?.email || uid,
        assignedAt: new Date().toISOString(),
        adminNotes: nextNotes,

        // author has just interacted; mark their notes seen so they don't see a badge for their own note
        [`notesSeenBy.${uid}`]: serverTimestamp(),
      });

      toast.success("Assigned successfully");
      setAssignModalOpen(false);
      setAssignTarget(null);
      setAssignEmails([]);
      setAssignEmail("");
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Failed to assign");
    }
  };

  // === Notes ===
  const openNoteModal = (row) => { setNoteTarget(row); setNoteText(""); setNoteModalOpen(true); };

  const submitNote = async () => {
    const row = noteTarget;
    const msg = (noteText || "").trim();
    if (!row || !msg) { toast.error("Write something before saving."); return; }
    try {
      if (!canModify(row)) { toast.error("You don't have permission to add a note here."); return; }
      const requestRef = doc(db, "feedback", row.id);
      const entry = { by: authUser?.email || uid, byUid: uid || null, at: new Date().toISOString(), text: msg };
      const prevNotes = Array.isArray(row.adminNotes) ? row.adminNotes : [];
      await updateDoc(requestRef, {
        adminNotes: [...prevNotes, entry],
        // author just added a note; mark as seen for themselves
        [`notesSeenBy.${uid}`]: serverTimestamp(),
      });
      toast.success("Note added");
      setNoteModalOpen(false); setNoteTarget(null); setNoteText("");
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Failed to add note");
    }
  };

  // === Derive filtered/sorted/paginated ===
  const fmtDate = (dt) =>
    dt?.seconds !== undefined ? dayjs(dt.seconds * 1000).format("YYYY-MM-DD") : dayjs(dt).format("YYYY-MM-DD");

  const filtered = list.filter((r) => {
    const repStr = `${r.id || ""} ${r.uid || ""}`.toLowerCase();
    const userStr = (r.username || "").toLowerCase();
    const typeStr = (r.incidenttype || "").toLowerCase();
    const dateStr = (fmtDate(r.datetime) || "").toLowerCase();
    const statusOK = filters.status === "All" || (r.status || "").toLowerCase() === filters.status.toLowerCase();

    return (
      (!filters.report || repStr.includes(filters.report.toLowerCase())) &&
      (!filters.user || userStr.includes(filters.user.toLowerCase())) &&
      (!filters.type || typeStr.includes(filters.type.toLowerCase())) &&
      (!filters.date || dateStr.includes(filters.date.toLowerCase())) &&
      statusOK
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    switch (sortConfig.key) {
      case "report": {
        const av = (a.id || a.uid || "").toString();
        const bv = (b.id || b.uid || "").toString();
        return av.localeCompare(bv) * dir;
      }
      case "user":
        return ((a.username || "").localeCompare(b.username || "")) * dir;
      case "type":
        return ((a.incidenttype || "").localeCompare(b.incidenttype || "")) * dir;
      case "date": {
        const ad = a.datetime?.seconds !== undefined ? a.datetime.seconds * 1000 : Date.parse(a.datetime || 0) || 0;
        const bd = b.datetime?.seconds !== undefined ? b.datetime.seconds * 1000 : Date.parse(b.datetime || 0) || 0;
        return (ad - bd) * dir;
      }
      case "status":
        return ((a.status || "").localeCompare(b.status || "")) * dir;
      default:
        return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginatedData = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const viewPrintRef = useRef(null); // single
  const listPrintRef = useRef(null); // all
  const handlePrintSingle = useReactToPrint({
    contentRef: viewPrintRef,
    pageStyle: `
      @page { size: A4; margin: 14mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm; }
      .h1 { text-align:center; font-size:18px; font-weight:700; margin-bottom:6mm; border-bottom:1px solid #000; padding-bottom:2mm; }
      table.kv { width:100%; border-collapse:collapse; margin-bottom:6mm; }
      table.kv th { text-align:left; width:40mm; padding:2mm; vertical-align:top; }
      table.kv td { padding:2mm; }
      .notes .note { border:1px solid #ccc; padding:3mm; margin-bottom:3mm; border-radius:4px; page-break-inside: avoid; }
      img { max-width:70mm; max-height:70mm; margin:5mm 0; border:1px solid #ccc; border-radius:4px; }
      .no-print { display:none !important; }
    `
  });
  const handlePrintAll = useReactToPrint({
    contentRef: listPrintRef,
    pageStyle: `
      @page { size: A4; margin: 10mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { width:210mm; min-height:297mm; margin:0 auto; padding:10mm; }
      .h1 { text-align:center; font-size:18px; font-weight:700; margin-bottom:6mm; }
      table { width:100%; border-collapse:collapse; font-size:12px; }
      th, td { border:1px solid #ccc; padding:3mm; text-align:left; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
      .no-print { display:none !important; }
    `
  });

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Feedback</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPrintModalOpen(true)}
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          >
            Print
          </button>
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => { setEditing(null); setForm(initialForm); setModalOpen(true); }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {/* Row 1: clickable sort headers */}
              <tr>
                {[
                  { key: "user", label: "Submitted by" },
                  { key: "type", label: "Incident Type" },
                  { key: "date", label: "Date Submitted" },
                  { key: "status", label: "Status" },
                  { key: "assigned", label: "Assigned To", sortable: false },
                  { key: "actions", label: "Actions", sortable: false },
                ].map((col) => (
                  <th key={col.key} className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none">
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:underline"
                        onClick={() => onSort(col.key)}
                        title="Sort"
                      >
                        <span>{col.label}</span>
                        {sortConfig.key === col.key && (
                          <span className="text-gray-400">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>

              {/* Row 2: filter controls */}
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="user"
                    defaultValue={filters.user}
                    onChange={(e) => setFilterDebounced("user", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="type"
                    defaultValue={filters.type}
                    onChange={(e) => setFilterDebounced("type", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3">
                  <input
                    type="date"
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    value={filters.date}
                    onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))}
                    max={new Date().toISOString().split("T")[0]}
                  />
                </th>
                <th className="px-6 pb-3">
                  <select
                    className="w-full border border-gray-300 p-1 rounded text-sm bg-white"
                    value={filters.status}
                    onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
                  >
                    <option>All</option>
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Resolved</option>
                    <option>Closed</option>
                  </select>
                </th>
                <th className="px-6 pb-3">{/* Assigned filter (optional) */}</th>
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => {
                  const unread = getUnreadCount(item);
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.username}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.incidenttype}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {fmtDate(item.datetime)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="mb-2">
                          <span
                            className={`px-3 py-1 rounded-full text-white text-xs font-semibold
                              ${item.status === "Pending" ? "bg-yellow-500"
                                : item.status === "In Progress" ? "bg-blue-500"
                                  : item.status === "Resolved" ? "bg-green-500"
                                    : item.status === "Closed" ? "bg-gray-500"
                                      : "bg-red-500"
                              }`}
                          >
                            {item.status || "Pending"}
                          </span>
                        </div>

                        {item.status !== "Resolved" && item.status !== "Closed" && (
                          <select
                            value={item.status || "Pending"}
                            onChange={(e) => updateStatus(item.id, e.target.value)}
                            className="w-full border border-gray-300 p-1 rounded text-xs bg-white focus:outline-none"
                          >
                            <option value="">Update Status</option>
                            {item.status !== "Pending" && <option value="Pending">Pending</option>}
                            {item.status !== "In Progress" && <option value="In Progress">In Progress</option>}
                            <option value="Resolved">Resolved</option>
                            <option value="Closed">Closed</option>
                          </select>
                        )}
                      </td>

                      {/* Assigned To */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {Array.isArray(item.assignedToEmails) && item.assignedToEmails.length > 0 ? (
                          <span className="inline-flex flex-wrap items-center gap-1">
                            {item.assignedToEmails.map((em) => (
                              <span key={em} className="px-2 py-0.5 rounded bg-gray-100 border text-gray-700">{em}</span>
                            ))}
                            {Array.isArray(item.adminNotes) && item.adminNotes.length > 0 && (
                              <span className="text-xs text-gray-500">
                                ({item.adminNotes.length} note{item.adminNotes.length > 1 ? "s" : ""})
                                {unread > 0 && (
                                  <span
                                    className="ml-1 inline-flex items-center justify-center text-[10px] leading-none rounded-full bg-red-600 text-white px-1.5 py-0.5"
                                    aria-label={`${unread} unread notes`}
                                  >
                                    {unread}
                                  </span>
                                )}
                              </span>
                            )}
                          </span>
                        ) : item.assignedToEmail ? (
                          <span className="px-2 py-0.5 rounded bg-gray-100 border text-gray-700">{item.assignedToEmail}</span>
                        ) : (
                          <span className="text-gray-400 text-xs">Unassigned</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                        <button
                          onClick={() => openView(item)}
                          className="text-blue-600 hover:text-blue-800 relative underline"
                          style={{ paddingRight: unread > 0 ? 10 : 0 }}
                          title={unread > 0 ? `${unread} new note${unread > 1 ? "s" : ""}` : "View"}
                        >
                          View

                        </button>

                        <button
                          onClick={() => openView(item)}
                          className="text-blue-600 underline hover:text-blue-800"
                        >
                          Print
                        </button>

                        {/* Assign (admin only & not closed) */}
                        {isAdmin && item.status !== "Closed" && (
                          <button
                            onClick={() => openAssign(item)}
                            className="text-indigo-600 underline hover:text-indigo-800"
                          >
                            Assign
                          </button>
                        )}

                        {/* Add Note (admin or any assignee) */}
                        {canModify(item) && (
                          <button
                            onClick={() => openNoteModal(item)}
                            className="text-emerald-600 underline hover:text-emerald-800"
                          >
                            Add Note
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </p>
        <div className="space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Incident Type</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.incidenttype}
                  onChange={(e) => setForm({ ...form, incidenttype: e.target.value })}
                  required
                >
                  <option value="">select</option>
                  <option value="Harassment">Harassment</option>
                  <option value="Discrimination">Discrimination</option>
                  <option value="Bullying">Bullying</option>
                  <option value="Other">Other</option>
                </select>

                {form.incidenttype === "Other" && (
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded"
                    value={form.other}
                    onChange={(e) => setForm({ ...form, other: e.target.value })}
                    required
                  />
                )}

                <label className="block font-medium mb-1">Describe the incident</label>
                <textarea
                  className="w-full border border-gray-300 p-2 rounded"
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />

                <label className="block font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.datetime}
                  onChange={(e) => setForm({ ...form, datetime: e.target.value })}
                  required
                />

                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .jpg,.png"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files.length > 0) setFileName(e.target.files[0].name);
                        else setFileName("No file chosen");
                        if (e.target.files[0]) setForm({ ...form, image: e.target.files[0] });
                      }}
                    />
                    📁 Choose File
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">
                    {fileName}
                  </span>
                </div>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setModalOpen(false)}
                  type="button"
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Report</h2>
            <p className="mb-4">
              Are you sure you want to delete this incident report?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View/Print modal */}
      {viewModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Incident Report</h2>

            <div ref={viewPrintRef} className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="font-medium">User:</span>
                <span>{viewData?.username}</span>

                <span className="font-medium">Incident Type:</span>
                <span>{viewData?.incidenttype}</span>

                <span className="font-medium">Description:</span>
                <span className="col-span-1">{viewData?.description}</span>

                <span className="font-medium">Date:</span>
                <span>{fmtDate(viewData?.datetime)}</span>

                {/* Assigned To */}
                <span className="font-medium">Assigned To:</span>
                <span>
                  {Array.isArray(viewData?.assignedToEmails) && viewData.assignedToEmails.length > 0
                    ? viewData.assignedToEmails.join(", ")
                    : (viewData?.assignedToEmail || "—")}
                </span>
              </div>

              {/* Notes */}
              {Array.isArray(viewData?.adminNotes) && viewData.adminNotes.length > 0 && (
                <div className="mt-3">
                  <div className="font-medium mb-1">Notes</div>
                  <ul className="space-y-2 text-sm">
                    {viewData.adminNotes.map((n, idx) => (
                      <li key={idx} className="border rounded p-2 bg-gray-50">
                        <div className="text-gray-700">{n.text}</div>
                        <div className="text-[11px] text-gray-500 mt-1">by {n.by} • {new Date(n.at).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {viewData?.imageUrl && (
                <img
                  src={viewData.imageUrl}
                  alt="uploaded"
                  className="mt-4 w-[250px] h-[250px] object-cover rounded-lg border"
                />
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
              <button
                onClick={() => handlePrintSingle()}
                className="px-4 py-2 bg-black text-white rounded hover:bg-black"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print-all modal */}
      {printModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div ref={contentRef}>
              <h2 className="text-xl font-bold mb-4">Incident Reports</h2>
              <table className="min-w-full text-sm border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2">User</th>
                    <th className="border p-2">Incident Type</th>
                    <th className="border p-2">Description</th>
                    <th className="border p-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, idx) => (
                    <tr key={idx} className="odd:bg-white even:bg-gray-50">
                      <td className="border p-2">{item.username}</td>
                      <td className="border p-2">{item.incidenttype}</td>
                      <td className="border p-2">{item.description}</td>
                      <td className="border p-2">{fmtDate(item.datetime)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal (admin only) */}
      {assignModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Assign Incident</h2>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <div><span className="font-medium">Incident:</span> {assignTarget?.id}</div>
                <div><span className="font-medium">User:</span> {assignTarget?.username}</div>
              </div>

              {/* Dropdown picker (adds to chips) */}
              {adminEmails.length > 0 && (
                <select
                  className="w-full border border-gray-300 p-2 rounded bg-white"
                  value=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    addAssignEmail(e.target.value);
                  }}
                >
                  <option value="">Add from staff list…</option>
                  {adminEmails.map((em) => (<option key={em} value={em}>{em}</option>))}
                </select>
              )}

              {/* Chips */}
              <div className="border rounded p-2 min-h-[44px] flex flex-wrap gap-2">
                {assignEmails.map((em) => (
                  <span key={em} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 border rounded">
                    <span className="text-sm">{em}</span>
                    <button
                      type="button"
                      className="text-gray-500 hover:text-gray-700"
                      onClick={() => removeAssignEmail(em)}
                      aria-label={`Remove ${em}`}
                      title="Remove"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {/* free text adder */}
                <input
                  type="email"
                  placeholder="type email and press Enter…"
                  className="flex-1 min-w-[160px] outline-none"
                  value={assignEmail}
                  onChange={(e) => setAssignEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      if (assignEmail.trim()) { addAssignEmail(assignEmail); setAssignEmail(""); }
                    }
                  }}
                />
              </div>

              <label className="block text-sm font-medium mt-2">Note (optional)</label>
              <textarea
                className="w-full border border-gray-300 p-2 rounded"
                rows={3}
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="Add a note for this assignment"
              />
            </div>

            <div className="flex justify-between items-center gap-3 mt-5">
              <div className="text-xs text-gray-500">
                {assignEmails.length > 0 ? `${assignEmails.length} assignee(s)` : "No assignees yet"}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAssignModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
                <button onClick={saveAssignment} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add note modal */}
      {noteModalOpen && noteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-2">Add Note</h2>
            <p className="text-xs text-gray-500 mb-3">
              Incident <span className="font-mono bg-gray-50 border px-1 rounded">{noteTarget.id}</span> • User: {noteTarget.username}
            </p>
            <textarea
              className="w-full border border-gray-300 rounded p-2 min-h-[120px]"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Type your note here…"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => { setNoteModalOpen(false); setNoteTarget(null); setNoteText(""); }}
                className="px-4 py-2 bg-gray-100 border rounded"
              >
                Cancel
              </button>
              <button
                onClick={submitNote}
                className="px-4 py-2 bg-emerald-600 text-white rounded disabled:opacity-60"
                disabled={!noteText.trim()}
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
