import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc, setDoc,
  query, where, getDoc, writeBatch, serverTimestamp
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useReactToPrint } from "react-to-print";
import { DateRange } from "react-date-range";
import { enUS } from "date-fns/locale";
import { format } from "date-fns";
import "react-date-range/dist/styles.css";
import "react-date-range/dist/theme/default.css";

export default function MaintenancePage(props) {
  const { navbarHeight } = props;

  // Modals & UI
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printAllModalOpen, setPrintAllModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [viewData, setViewData] = useState(null);
  const [fileName, setFileName] = useState("No file chosen");
  const [problemCatlist, setProblemCatList] = useState([]);
  const [itemCatlist, setItemCatList] = useState([]);
  const [itemlist, setItemList] = useState([]);
  const [previewSrc, setPreviewSrc] = useState(null);

  // Assign / Notes
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState(null);
  // NEW: multi-assignee UI state
  const [assignEmails, setAssignEmails] = useState([]);     // string[]
  const [assignFreeText, setAssignFreeText] = useState(""); // free text to parse
  const [assignNote, setAssignNote] = useState("");

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null);
  const [noteText, setNoteText] = useState("");

  // Data
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState(new Set());

  // Auth
  const emp = useSelector((state) => state.auth.employee);
  const authUser = useSelector((state) => state.auth.user);
  const uid = authUser?.uid;
  const myEmail = (authUser?.email || "").toLowerCase();
  const isAdmin = (emp?.role || "").toLowerCase().includes("admin");

  // Stats
  const [stats, setStats] = useState({
    total: 0, pending: 0, inProgress: 0, resolved: 0, closed: 0,
  });

  // Filters & sorting
  const [filters, setFilters] = useState({
    request: "",
    user: "",
    issue: "All",
    location: "",
    maintenancetype: "All",
    date: "",
    status: "All",
    mineOnly: false, // admin UI only; non-admin implicit
  });
  const [sortConfig, setSortConfig] = useState({ key: "date", direction: "desc" });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((p) => ({ ...p, [field]: value }));
    }, 250);
  };
  const onSort = (key) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );
  };

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const initialForm = {
    id: 0,
    roomno: "",
    problemcategory: "",
    itemcategory: "",
    item: "",
    description: "",
    cause: "",
    comments: "",
    image: null,
    isagree: false,
  };
  const [form, setForm] = useState(initialForm);

  // Print
  const viewPrintRef = useRef(null); // single
  const listPrintRef = useRef(null); // all
  const handlePrintSingle = useReactToPrint({
    contentRef: viewPrintRef,
    onBeforeGetContent: () => {
      return new Promise((resolve) => {
        const images = viewPrintRef.current?.querySelectorAll("img") || [];
        let loaded = 0;
        if (images.length === 0) resolve();
        images.forEach((img) => {
          if (img.complete) {
            loaded++;
            if (loaded === images.length) resolve();
          } else {
            img.onload = () => {
              loaded++;
              if (loaded === images.length) resolve();
            };
            img.onerror = () => {
              loaded++;
              if (loaded === images.length) resolve();
            };
          }
        });
      });
    },
    pageStyle: `
      @page { size: A4; margin: 14mm; }
      img { max-width: 100% !important; max-height: 200px !important; }
    `
  });

  const handlePrintSingle1 = useReactToPrint({
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

  // Admin directory (for assign)
  const [adminEmails, setAdminEmails] = useState([]);

  // === Header date filter (for list) ===
  const [listDateRange, setListDateRange] = useState(null); // { startDate: Date, endDate: Date }
  const [showListPicker, setShowListPicker] = useState(false);
  const listPickerRef = useRef(null);

  // ---------- Effects ----------
  useEffect(() => {
    getList();
    getProblemCatList();
    getItemCatList();
    getItemList();
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setCurrentPage(1); }, [filters, sortConfig, listDateRange]);

  useEffect(() => {
    if (!emp?.hostelid || !authUser?.uid) return;
    const doReset = async () => {
      const refd = doc(db, "adminMenuState", authUser.uid, "menus", "maintenance");
      await setDoc(refd, { lastOpened: serverTimestamp() }, { merge: true });
    };
    doReset();
  }, [emp?.hostelid, authUser?.uid]);

  // Close header calendar on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!showListPicker) return;
      if (listPickerRef.current && !listPickerRef.current.contains(e.target)) {
        setShowListPicker(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showListPicker]);

  // On mount, reflect implicit mine-only for non-admins in UI state (optional)
  useEffect(() => {
    if (!isAdmin) {
      setFilters(p => ({ ...p, mineOnly: true }));
    }
  }, [isAdmin]);

  // ---------- Multi-assignee helpers ----------
  const normEmail = (e) => (e || "").trim().toLowerCase();

  const uniqByEmail = (arr) => {
    // accepts [{email, uid?, by?, at?}] or string[]
    const out = [];
    const seen = new Set();
    for (const a of arr) {
      const email = typeof a === "string" ? normEmail(a) : normEmail(a.email);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      if (typeof a === "string") out.push({ email });
      else out.push({ ...a, email });
    }
    return out;
  };

  const resolveEmployeesByEmails = async (emails /* string[] */) => {
    const results = [];
    for (const raw of emails) {
      const email = normEmail(raw);
      if (!email) continue;
      const qEmp = query(collection(db, "employees"), where("email", "==", email));
      const snap = await getDocs(qEmp);
      let uidFound = null;
      snap.forEach(d => {
        const u = d.data();
        uidFound = u.uid || u.userId || null;
      });
      results.push({ email, uid: uidFound });
    }
    return results;
  };

  const getAssigneesFromRow = (row) => {
    const fromArray = Array.isArray(row?.assignedTo) ? row.assignedTo : [];
    const fromLegacy = row?.assignedToEmail
      ? [{ email: normEmail(row.assignedToEmail), uid: row.assignedToUid || null }]
      : [];
    return uniqByEmail([...fromArray, ...fromLegacy]);
  };

  // ---------- Helpers ----------
  const canModify = (row) => {
    if (isAdmin) return true;
    const myE = normEmail(myEmail);
    const assignees = getAssigneesFromRow(row);
    return assignees.some(a => a.email === myE || (a.uid && a.uid === uid));
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
        if (u.email && role !== "admin") emails.push(u.email);
      });
      setAdminEmails(Array.from(new Set(emails)).sort((a, b) => a.localeCompare(b)));
    } catch (e) {
      console.error(e);
    }
  };

  const getList = async () => {
    if (!emp?.hostelid) return;
    setIsLoading(true);

    // Users
    const usersQuery = query(collection(db, "users"), where("hostelid", "==", emp.hostelid));
    const usersSnap = await getDocs(usersQuery);
    const userMap = {};
    usersSnap.forEach((d) => {
      const data = d.data();
      userMap[data.uid] = data.username || data.UserName || data.USERNAME || "Unknown";
    });

    // Maintenance
    const maintenanceQuery = query(collection(db, "maintenance"), where("hostelid", "==", emp.hostelid));
    const maintenanceSnapshot = await getDocs(maintenanceQuery);
    let rows = maintenanceSnapshot.docs.map((d) => {
      const data = d.data();
      const base = {
        id: d.id,
        ...data,
        username: userMap[data.uid] || "",
        adminNotes: Array.isArray(data.adminNotes) ? data.adminNotes : [],
        noteSeenBy: d.data().noteSeenBy || {},
      };
      const assignees = getAssigneesFromRow(base);
      return {
        ...base,
        assignedTo: assignees,
        assignedToEmail: base.assignedToEmail || "",
        assignedToUid: base.assignedToUid || null,
      };
    });

    // 🔒 Visibility: non-admins see only their assigned items (email or uid)
    if (!isAdmin) {
      const me = normEmail(myEmail);
      rows = rows.filter(r =>
        getAssigneesFromRow(r).some(a => a.email === me || (a.uid && a.uid === uid))
      );
    }

    setList(rows);
    setSelectedIds(new Set());

    // Stats computed on the visible set
    const total = rows.length;
    const pending = rows.filter((i) => i.status === "Pending").length;
    const inProgress = rows.filter((i) => i.status === "In Progress").length;
    const resolved = rows.filter((i) => i.status === "Resolved").length;
    const closed = rows.filter((i) => i.status === "Closed").length;
    setStats({ total, pending, inProgress, resolved, closed });

    setIsLoading(false);
  };

  const getProblemCatList = async () => {
    if (!emp?.hostelid) return;
    setIsLoading(true);
    const q1 = query(collection(db, "problemcategory"), where("hostelid", "==", emp.hostelid));
    const s1 = await getDocs(q1);
    setProblemCatList(s1.docs.map((docu) => ({ id: docu.id, ...docu.data() })));
    setIsLoading(false);
  };

  const getItemCatList = async () => {
    if (!emp?.hostelid) return;
    setIsLoading(true);
    const q2 = query(collection(db, "itemcategory"), where("hostelid", "==", emp.hostelid));
    const s2 = await getDocs(q2);
    setItemCatList(s2.docs.map((docu) => ({ id: docu.id, ...docu.data() })));
    setIsLoading(false);
  };

  const getItemList = async () => {
    if (!emp?.hostelid) return;
    setIsLoading(true);
    const q3 = query(collection(db, "maintenanceitems"), where("hostelid", "==", emp.hostelid));
    const s3 = await getDocs(q3);
    setItemList(s3.docs.map((docu) => ({ id: docu.id, ...docu.data() })));
    setIsLoading(false);
  };

  // Safe date parse
  const parseDateSafe = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    }
    if (v?.seconds) return new Date(v.seconds * 1000);
    return null;
  };

  const inRangeInclusive = (date, start, end) => {
    if (!date || !start || !end) return true;
    const t = new Date(date); t.setHours(12, 0, 0, 0); // avoid TZ edge
    const s = new Date(start); s.setHours(0, 0, 0, 0);
    const e = new Date(end); e.setHours(23, 59, 59, 999);
    return t >= s && t <= e;
  };

  // ---------- Create / Update ----------
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.roomno) return;
    setIsLoading(true);

    let imageUrl = "";
    if (form.image) {
      const imageRef = ref(storage, `maintenance/${Date.now()}_${form.image.name}`);
      await uploadBytes(imageRef, form.image);
      imageUrl = await getDownloadURL(imageRef);
    }

    if (editingData) {
      try {
        const docRefm = doc(db, "maintenance", form.id);
        const docSnap = await getDoc(docRefm);
        if (!docSnap.exists()) {
          toast.warning("Maintenance does not exist! Cannot update.");
          setIsLoading(false);
          return;
        }
        await updateDoc(docRefm, {
          uid,
          roomno: form.roomno,
          problemcategory: form.problemcategory,
          itemcategory: form.itemcategory,
          item: form.item,
          description: form.description,
          cause: form.cause,
          comments: form.comments,
          imageUrl,
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date().toISOString().split("T")[0],
          updatedAt: serverTimestamp(),
          status: "Pending",
        });
        toast.success("Successfully updated");
        getList();
      } catch (error) {
        console.error("Error updating document: ", error);
      }
    } else {
      try {
        await addDoc(collection(db, "maintenance"), {
          uid,
          roomno: form.roomno,
          problemcategory: form.problemcategory,
          itemcategory: form.itemcategory,
          item: form.item,
          description: form.description,
          cause: form.cause,
          comments: form.comments,
          imageUrl,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date().toISOString().split("T")[0],
          createdAt: serverTimestamp(),
          status: "Pending",
          // legacy fields default
          assignedToEmail: "",
          assignedToUid: null,
          // new field
          assignedTo: [],
          adminNotes: [],
        });
        toast.success("Successfully saved");
        getList();
      } catch (error) {
        console.error("Error saving data:", error);
      }
    }

    setIsLoading(false);
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
  };

  // ---------- Delete ----------
  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "maintenance", deleteData.id));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} maintenance request(s)? This cannot be undone.`)) return;
    setIsLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const CHUNK = 400;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = writeBatch(db);
        ids.slice(i, i + CHUNK).forEach((id) => batch.delete(doc(db, "maintenance", id)));
        await batch.commit();
      }
      toast.success("Selected requests deleted");
      setSelectedIds(new Set());
      getList();
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete selected");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------- View / Print ----------
  const openView = (row) => { setViewData(row); setViewModalOpen(true); markNotesSeen(row); };
  const openPrint = () => { setPrintAllModalOpen(true); };

  // ---------- Status & Notes ----------
  const updateStatus = async (id, newStatus) => {
    try {
      const row = list.find(r => r.id === id);
      if (!row) return;
      if (!canModify(row)) { toast.error("You don't have permission to update this."); return; }
      const requestRef = doc(db, "maintenance", id);
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

  const addNote = async (row, text) => {
    const msg = (text ?? "").trim() || prompt("Add note:");
    if (!msg) return;
    try {
      if (!canModify(row)) { toast.error("You don't have permission to add a note here."); return; }
      const requestRef = doc(db, "maintenance", row.id);
      const entry = { by: authUser?.email || uid, byUid: uid || null, at: new Date().toISOString(), text: msg };
      const prevNotes = Array.isArray(row.adminNotes) ? row.adminNotes : [];
      await updateDoc(requestRef, { adminNotes: [...prevNotes, entry] });
      toast.success("Note added");
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Failed to add note");
    }
  };

  // ---------- Assign (Multi) ----------
  const openAssign = (row) => {
    setAssignTarget(row);
    const current = getAssigneesFromRow(row).map(a => a.email);
    setAssignEmails(current);
    setAssignFreeText("");
    setAssignNote("");
    setAssignModalOpen(true);
  };

  const saveAssignment = async () => {
    if (!assignTarget?.id) return;

    // Merge typed emails if user didn't blur the input
    let emails = [...assignEmails];
    if (assignFreeText.trim()) {
      emails = emails.concat(assignFreeText.split(/[,\s]+/).map(normEmail).filter(Boolean));
    }
    emails = Array.from(new Set(emails.map(normEmail)));

    if (emails.length === 0) {
      toast.error("Please add at least one email.");
      return;
    }

    try {
      const requestRef = doc(db, "maintenance", assignTarget.id);

      // Resolve UIDs
      const resolved = await resolveEmployeesByEmails(emails);

      // Build new assignee entries
      const now = new Date().toISOString();
      const byWho = authUser?.email || uid || null;
      const newEntries = resolved.map(r => ({ ...r, by: byWho, at: now }));

      // Merge with existing
      const current = list.find(x => x.id === assignTarget.id);
      const prevAssignees = getAssigneesFromRow(current);
      const merged = uniqByEmail([...prevAssignees, ...newEntries]);

      // Optional note handling
      const noteEntry = assignNote.trim()
        ? { by: byWho, at: now, text: assignNote.trim() }
        : null;
      const prevNotes = Array.isArray(current?.adminNotes) ? current.adminNotes : [];
      const nextNotes = noteEntry ? [...prevNotes, noteEntry] : prevNotes;

      // For legacy compatibility, keep first assignee in old fields too
      const first = merged[0] || null;

      await updateDoc(requestRef, {
        assignedTo: merged,
        assignedToEmail: first ? first.email : "",
        assignedToUid: first ? (first.uid || null) : null,
        assignedBy: byWho,
        assignedAt: now,
        adminNotes: nextNotes,
      });

      toast.success("Assigned successfully");
      setAssignModalOpen(false);
      setAssignTarget(null);
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Failed to assign");
    }
  };

  // ===== Dropdown data =====
  const maintenanceTypes = useMemo(
    () =>
      Array.from(new Set((list || []).map(r => (r.maintenancetype || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b)),
    [list]
  );
  const issueTypes = useMemo(
    () =>
      Array.from(new Set((list || []).map(r => (r.problemcategory || "").trim()).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b)),
    [list]
  );

  // ---------- Derive filtered/sorted/paginated ----------
  const filteredList = list.filter((r) => {
    const reqStr = `${r.id || ""} ${r.uid || ""}`.toLowerCase();
    const userStr = (r.username || "").toLowerCase();
    const issueStr = (r.problemcategory || "").toLowerCase();
    const locStr = (r.roomno || "").toLowerCase();
    const maintenancetypeStr = (r.maintenancetype || "").toLowerCase();
    const dateStr = (r.createdDate || "").toLowerCase();

    const statusOK = filters.status === "All" || (r.status || "").toLowerCase() === filters.status.toLowerCase();
    const mtOK = filters.maintenancetype === "All" || maintenancetypeStr === filters.maintenancetype.toLowerCase();
    const issueOK = filters.issue === "All" || issueStr === filters.issue.toLowerCase();

    // Admin can toggle "mine only"; non-admin is already pre-filtered in getList()
    const mineFlag = isAdmin ? filters.mineOnly : true;
    const mineOK = !mineFlag || getAssigneesFromRow(r).some(a =>
      a.email === normEmail(myEmail) || (a.uid && a.uid === uid)
    );

    // Header calendar range filter using createdDate/createdAt
    let rangeOK = true;
    if (listDateRange?.startDate && listDateRange?.endDate) {
      const itemDate = parseDateSafe(r.createdDate) || parseDateSafe(r.createdAt) || null;
      rangeOK = inRangeInclusive(itemDate, listDateRange.startDate, listDateRange.endDate);
    }

    return (
      (!filters.request || reqStr.includes(filters.request.toLowerCase())) &&
      (!filters.user || userStr.includes(filters.user.toLowerCase())) &&
      issueOK &&
      (!filters.location || locStr.includes(filters.location.toLowerCase())) &&
      mtOK &&
      (!filters.date || dateStr.includes(filters.date.toLowerCase())) &&
      statusOK &&
      mineOK &&
      rangeOK
    );
  });

  const sortedList = [...filteredList].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    switch (sortConfig.key) {
      case "request": {
        const av = (a.id || a.uid || "").toString();
        const bv = (b.id || b.uid || "").toString();
        return av.localeCompare(bv) * dir;
      }
      case "user":
        return ((a.username || "").localeCompare(b.username || "")) * dir;
      case "issue":
        return ((a.problemcategory || "").localeCompare(b.problemcategory || "")) * dir;
      case "location":
        return ((a.roomno || "").localeCompare(b.roomno || "")) * dir;
      case "maintenancetype":
        return ((a.maintenancetype || "").localeCompare(b.maintenancetype || "")) * dir;
      case "status":
        return ((a.status || "").localeCompare(b.status || "")) * dir;
      case "date": {
        const ad = (parseDateSafe(a.createdDate) || parseDateSafe(a.createdAt) || new Date(0)).getTime();
        const bd = (parseDateSafe(b.createdDate) || parseDateSafe(b.createdAt) || new Date(0)).getTime();
        return (ad - bd) * dir;
      }
      case "assigned":
        return ((getAssigneesFromRow(a)[0]?.email || "").localeCompare(getAssigneesFromRow(b)[0]?.email || "")) * dir;
      default:
        return 0;
    }
  });

  const totalPages = Math.max(1, Math.ceil(sortedList.length / pageSize));
  const paginatedData = sortedList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Selection helpers (page only)
  const pageIds = paginatedData.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id)) && !allPageSelected;

  const openNoteModal = (row) => { setNoteTarget(row); setNoteText(""); setNoteModalOpen(true); };
  const submitNote = async () => {
    const row = noteTarget;
    const msg = (noteText || "").trim();
    if (!row || !msg) { toast.error("Write something before saving."); return; }
    try {
      if (!canModify(row)) { toast.error("You don't have permission to add a note here."); return; }
      const requestRef = doc(db, "maintenance", row.id);
      const entry = { by: authUser?.email || uid, byUid: uid || null, at: new Date().toISOString(), text: msg };
      const prevNotes = Array.isArray(row.adminNotes) ? row.adminNotes : [];
      await updateDoc(requestRef, { adminNotes: [...prevNotes, entry] });
      toast.success("Note added");
      setNoteModalOpen(false); setNoteTarget(null); setNoteText("");
      await getList();
    } catch (e) {
      console.error(e);
      toast.error("Failed to add note");
    }
  };
  const getUnseenNotesCount = (row) => {
    const total = Array.isArray(row?.adminNotes) ? row.adminNotes.length : 0;
    const seen = row?.noteSeenBy?.[uid]?.count || 0;
    return Math.max(0, total - seen);
  };

  // Mark all current notes as seen for this user
  const markNotesSeen = async (row) => {
    if (!uid || !row?.id) return;
    try {
      const total = Array.isArray(row?.adminNotes) ? row.adminNotes.length : 0;
      const requestRef = doc(db, "maintenance", row.id);
      const payload = { count: total, at: new Date().toISOString() };

      // write to Firestore: noteSeenBy.<uid> = { count, at }
      await updateDoc(requestRef, { [`noteSeenBy.${uid}`]: payload });

      // Optimistic UI update so badge disappears immediately
      setList((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, noteSeenBy: { ...(r.noteSeenBy || {}), [uid]: payload } }
            : r
        )
      );
    } catch (e) {
      console.error("markNotesSeen error", e);
    }
  };
  const images = Array.isArray(viewData?.imageUrls)
    ? viewData.imageUrls.filter(Boolean)
    : (viewData?.imageUrl ? [viewData.imageUrl] : []);
  const printRow = (row) => {
    setViewData(row);
    setPrintModalOpen(true)
    // setTimeout(() => {
    //   try { handlePrintSingle(); } catch { }
    // }, 100);
  };

  return (
    <main className="flex-1 p-2 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Page header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-black"
            onClick={() => openPrint()}
          >
            Print All
          </button>
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => { setEditing(null); setForm(initialForm); setModalOpen(true); }}
          >
            + Add
          </button>
        </div>
      </div>
      <div>
      (When notification appears, refresh page)
      </div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 text-center mb-2">
        <div className="bg-white rounded-xl shadow p-2"><div className="text-lg font-bold">{stats.total}</div><div className="text-gray-500 text-xs">Total</div></div>
        <div className="bg-white rounded-xl shadow p-2"><div className="text-lg font-bold">{stats.pending}</div><div className="text-gray-500 text-xs">Pending</div></div>
        <div className="bg-white rounded-xl shadow p-2"><div className="text-lg font-bold">{stats.inProgress}</div><div className="text-gray-500 text-xs">In Progress</div></div>
        <div className="bg-white rounded-xl shadow p-2"><div className="text-lg font-bold">{stats.resolved}</div><div className="text-gray-500 text-xs">Resolved</div></div>
        <div className="bg-white rounded-xl shadow p-2"><div className="text-lg font-bold">{stats.closed}</div><div className="text-gray-500 text-xs">Closed</div></div>
        <div className="bg-white rounded-xl shadow p-2"><div className="text-lg font-bold">
          {list.filter(x => getAssigneesFromRow(x).length > 0).length}
        </div><div className="text-gray-500 text-xs">Assigned</div></div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          {isAdmin && (
            <button onClick={deleteSelected} className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm">
              Delete selected
            </button>
          )}
          <button
            onClick={() => setSelectedIds(new Set(filteredList.map((r) => r.id)))}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Select all ({filteredList.length})
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1.5 bg-gray-200 rounded text-sm">Clear selection</button>
        </div>
      )}

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
                  { key: "user", label: "User" },
                  { key: "issue", label: "Issue Type" },
                  { key: "location", label: "Location" },
                  { key: "maintenancetype", label: "Maintenance" },
                  { key: "date", label: "Submitted On" },
                  { key: "status", label: "Status" },
                  { key: "assigned", label: "Assigned To" },
                  { key: "actions", label: "Actions", sortable: false },
                  { key: "select", label: "", sortable: false },
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

              {/* Row 2: filter inputs */}
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="user" defaultValue={filters.user} onChange={(e) => setFilterDebounced("user", e.target.value)} />
                </th>
                <th className="px-6 pb-3">
                  <select className="w-full border border-gray-300 p-1 rounded text-sm bg-white" value={filters.issue} onChange={(e) => setFilters(p => ({ ...p, issue: e.target.value }))}>
                    <option value="All">All</option>
                    {issueTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </th>
                <th className="px-6 pb-3">
                  <input className="w-full border border-gray-300 p-1 rounded text-sm" placeholder="room / location" defaultValue={filters.location} onChange={(e) => setFilterDebounced("location", e.target.value)} />
                </th>
                <th className="px-6 pb-3">
                  <select className="w-full border border-gray-300 p-1 rounded text-sm bg-white" value={filters.maintenancetype} onChange={(e) => setFilters(p => ({ ...p, maintenancetype: e.target.value }))}>
                    <option value="All">All</option>
                    {maintenanceTypes.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </th>

                {/* Submitted On: header DateRange */}
                <th className="px-6 pb-3 relative">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowListPicker(v => !v)}
                      className="mt-2 w-full border border-gray-300 p-1 rounded text-sm"
                      title="Filter by submitted date range"
                    >
                      {listDateRange?.startDate && listDateRange?.endDate
                        ? `${format(listDateRange.startDate, "MMM dd, yyyy")} – ${format(listDateRange.endDate, "MMM dd, yyyy")}`
                        : "Filter by date…"}
                    </button>

                    {listDateRange?.startDate && listDateRange?.endDate && (
                      <button
                        type="button"
                        onClick={() => setListDateRange(null)}
                        className="text-xs text-gray-600 underline"
                        title="Clear date filter"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {showListPicker && (
                    <div
                      ref={listPickerRef}
                      style={{ position: "absolute", top: "100%", zIndex: 1000, boxShadow: "0px 2px 10px rgba(0,0,0,0.2)" }}
                      className="mt-2 bg-white"
                    >
                      <DateRange
                        onChange={(item) => {
                          const sel = item.selection;
                          setListDateRange({
                            startDate: sel.startDate,
                            endDate: sel.endDate || sel.startDate,
                          });
                        }}
                        moveRangeOnFirstSelection={false}
                        ranges={[{
                          startDate: listDateRange?.startDate || new Date(),
                          endDate: listDateRange?.endDate || new Date(),
                          key: "selection"
                        }]}
                        locale={enUS}
                      />
                      <div className="flex justify-end bg-white p-2 border border-t-0">
                        <button
                          type="button"
                          onClick={() => setShowListPicker(false)}
                          className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </th>

                <th className="px-6 pb-3">
                  <select className="w-full border border-gray-300 p-1 rounded text-sm bg-white" value={filters.status} onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}>
                    <option>All</option>
                    <option>Pending</option>
                    <option>In Progress</option>
                    <option>Resolved</option>
                    <option>Closed</option>
                  </select>
                </th>

                <th className="px-6 pb-3">
                  {/* Mine-only toggle area (optional UI) */}
                </th>

                <th className="px-6 pb-3" />
                <th className="px-6 pb-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allPageSelected}
                    ref={(el) => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) pageIds.forEach((id) => next.add(id));
                        else pageIds.forEach((id) => next.delete(id));
                        return next;
                      });
                    }}
                  />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-6 py-10 text-center text-gray-500">
                    No matching records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.problemcategory}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.roomno}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.maintenancetype}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.createdDate || (item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10) : "—")}
                    </td>

                    {/* Status */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-white text-xs font-semibold
                            ${item.status === "Pending"
                              ? "bg-yellow-500"
                              : item.status === "In Progress"
                                ? "bg-blue-500"
                                : item.status === "Resolved"
                                  ? "bg-green-500"
                                  : item.status === "Closed"
                                    ? "bg-gray-500"
                                    : "bg-red-500"
                            }`}
                        >
                          {item.status}
                        </span>
                      </div>
                      {item.status !== "Resolved" && item.status !== "Closed" && canModify(item) && (
                        <select
                          value={item.status}
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

                    {/* Assigned to (multi) */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getAssigneesFromRow(item).length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {getAssigneesFromRow(item).slice(0, 3).map((a, i) => (
                            <span key={i} className="px-2 py-0.5 rounded bg-gray-100 border text-gray-700">
                              {a.email}
                            </span>
                          ))}
                          {getAssigneesFromRow(item).length > 3 && (
                            <span className="text-xs text-gray-500">
                              +{getAssigneesFromRow(item).length - 3} more
                            </span>
                          )}
                          {Array.isArray(item.adminNotes) && item.adminNotes.length > 0 && (
                            <span className="text-xs text-gray-500 ml-1">
                              ({item.adminNotes.length} note{item.adminNotes.length > 1 ? "s" : ""})
                              {getUnseenNotesCount(item) > 0 && (
                                <span
                                  title={`${getUnseenNotesCount(item)} new note(s)`}
                                  className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold"
                                >
                                  {getUnseenNotesCount(item)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Unassigned</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-3">
                      <button
                        onClick={() => openView(item)}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        View
                      </button>
                      <button
                        onClick={() => printRow(item)}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        Print
                      </button>
                      {isAdmin && item.status !== "Closed" && (
                        <button onClick={() => openAssign(item)} className="text-indigo-600 underline hover:text-indigo-800">Assign</button>
                      )}
                      {!isAdmin && canModify(item) && (
                        <button
                          onClick={() => openNoteModal(item)}
                          className="text-emerald-600 underline hover:text-emerald-800"
                        >
                          Add Note
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => { setDelete(item); setConfirmDeleteOpen(true); }}
                          className="text-red-600 underline hover:text-red-800"
                        >
                          Delete
                        </button>
                      )}
                    </td>

                    {/* Row select */}
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) =>
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          })
                        }
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
        {/* print helpers */}
        <style>{`
          @media print {
            .print-img-grid img { height: 160px !important; }
            .print-img-cell img { height: 60px !important; margin-right: 6px; }
            button, select, input[type="checkbox"] { display: none !important; }
          }
        `}</style>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p>
        <div className="space-x-2">
          <button onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">
            Previous
          </button>
          <button onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">
            Next
          </button>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit" : "Add"}</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Room Number</label>
                <input type="text" className="w-full border border-gray-300 p-2 rounded" value={form.roomno} onChange={(e) => setForm({ ...form, roomno: e.target.value })} required />

                <label className="block font-medium mb-1">Problem Category</label>
                <select className="w-full border border-gray-300 p-2 rounded" value={form.problemcategory} onChange={(e) => setForm({ ...form, problemcategory: e.target.value })} required>
                  <option value="">select</option>
                  {problemCatlist.map((item) => (<option key={item.name} value={item.name}>{item.name}</option>))}
                </select>

                <label className="block font-medium mb-1">Item Category</label>
                <select className="w-full border border-gray-300 p-2 rounded" value={form.itemcategory} onChange={(e) => setForm({ ...form, itemcategory: e.target.value })} required>
                  <option value="">select</option>
                  {itemCatlist.map((item) => (<option key={item.name} value={item.name}>{item.name}</option>))}
                </select>

                <label className="block font-medium mb-1">Item</label>
                <select className="w-full border border-gray-300 p-2 rounded" value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
                  <option value="">select</option>
                  {itemlist.map((item) => (<option key={item.name} value={item.name}>{item.name}</option>))}
                </select>

                <label className="block font-medium mb-1">Description</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, description: e.target.value })} />

                <label className="block font-medium mb-1">Cause (Optional)</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, cause: e.target.value })} />

                <label className="block font-medium mb-1">Comments</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, comments: e.target.value })} />

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
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
                </div>
                <div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.isagree}
                      onChange={(e) => setForm({ ...form, isagree: e.target.checked })}
                    />
                    <span> I agree to allow a staff member to enter my room to complete the requested
                      maintenance work, even if I am not present at the time.</span>
                  </label>
                </div>
              </div>
              <div className="flex justify-end mt-6 space-x-3">
                <button onClick={() => setModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400" type="button">Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Request</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.username}</strong>'s maintenance request?
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}


      {viewModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Maintenance Request</h2>
            <div ref={viewPrintRef} className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="font-medium">User:</span><span>{viewData?.username}</span>
                <span className="font-medium">Room No.:</span><span>{viewData?.roomno}</span>
                <span className="font-medium">Issue Type:</span><span>{viewData?.problemcategory}</span>
                <span className="font-medium">Item Category:</span><span>{viewData?.itemcategory}</span>
                <span className="font-medium">Item:</span><span>{viewData?.item}</span>
                <span className="font-medium">Description:</span><span className="col-span-1">{viewData?.description}</span>
                <span className="font-medium">Cause:</span><span className="col-span-1">{viewData?.cause || "—"}</span>
                <span className="font-medium">Comments:</span><span className="col-span-1">{viewData?.comments || "—"}</span>
                <span className="font-medium">Assigned To:</span>
                <span>
                  {getAssigneesFromRow(viewData).length
                    ? getAssigneesFromRow(viewData).map(a => a.email).join(", ")
                    : "—"}
                </span>
                <span className="font-medium">Submitted On:</span>
                <span>{viewData?.createdDate || (viewData?.createdAt?.seconds ? new Date(viewData.createdAt.seconds * 1000).toISOString().slice(0, 10) : "—")}</span>
              </div>

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

              {images.length > 0 && (
                <div className="mt-3">
                  <div className="font-medium mb-1">Images</div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 print-img-grid">

                    {images.map((src, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setPreviewSrc(src)}
                        className="relative group rounded-lg overflow-hidden border"
                        title="Click to view"
                      >
                        <img
                          src={src}
                          alt={`uploaded ${idx + 1}`}
                          crossOrigin={`anonymous ${idx + 1}`}
                          className="w-full h-32 object-cover"
                        />

                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Lightbox Preview (not printed) */}
            {previewSrc && (
              <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
                <button
                  type="button"
                  onClick={() => setPreviewSrc(null)}
                  className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black px-3 py-1 rounded"
                >
                  Close
                </button>
                <img
                  src={previewSrc}
                  alt="preview"
                  className="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-2xl"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setViewModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Close</button>
              <button onClick={() => handlePrintSingle()} className="px-4 py-2 bg-black text-white rounded hover:bg-black">Print</button>
            </div>
          </div>
        </div>
      )}
      {printModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Maintenance Request</h2>
            <div ref={viewPrintRef} className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <span className="font-medium">User:</span><span>{viewData?.username}</span>
                <span className="font-medium">Room No.:</span><span>{viewData?.roomno}</span>
                <span className="font-medium">Issue Type:</span><span>{viewData?.problemcategory}</span>
                <span className="font-medium">Item Category:</span><span>{viewData?.itemcategory}</span>
                <span className="font-medium">Item:</span><span>{viewData?.item}</span>
                <span className="font-medium">Description:</span><span className="col-span-1">{viewData?.description}</span>
                <span className="font-medium">Cause:</span><span className="col-span-1">{viewData?.cause || "—"}</span>
                <span className="font-medium">Comments:</span><span className="col-span-1">{viewData?.comments || "—"}</span>
                <span className="font-medium">Assigned To:</span>
                <span>
                  {getAssigneesFromRow(viewData).length
                    ? getAssigneesFromRow(viewData).map(a => a.email).join(", ")
                    : "—"}
                </span>
                <span className="font-medium">Submitted On:</span>
                <span>{viewData?.createdDate || (viewData?.createdAt?.seconds ? new Date(viewData.createdAt.seconds * 1000).toISOString().slice(0, 10) : "—")}</span>
              </div>

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

              {images?.length > 0 && (
                <section className="mt-3">
                  <h3 className="font-medium mb-1">Images</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 print-img-grid">
                    {images.map((src, idx) => (
                      <div
                        key={src || idx}
                        role="button"
                        tabIndex={0}
                        aria-label={`View image ${idx + 1}`}
                        onClick={() => setPreviewSrc(src)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setPreviewSrc(src);
                        }}
                        className="relative group rounded-lg overflow-hidden border cursor-zoom-in focus:outline-none focus:ring-2 focus:ring-black/40"
                        title="Click to view"
                      >
                        <img
                          src={src}
                          alt={`uploaded ${idx + 1}`}

                          loading="lazy"
                          className="w-full h-32 object-cover block"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition" />
                      </div>
                    ))}
                  </div>
                </section>
              )}

            </div>

            {/* Lightbox Preview (not printed) */}
            {previewSrc && (
              <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
                <button
                  type="button"
                  onClick={() => setPreviewSrc(null)}
                  className="absolute top-4 right-4 bg-white/90 hover:bg-white text-black px-3 py-1 rounded"
                >
                  Close
                </button>
                <img
                  src={previewSrc}
                  alt="preview"
                  className="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-2xl"
                />
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setViewModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Close</button>
              <button onClick={() => handlePrintSingle()} className="px-4 py-2 bg-black text-white rounded hover:bg-black">Print</button>
            </div>
          </div>
        </div>
      )}

      {printAllModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div ref={listPrintRef} className="sheet">
              <div className="h1 text-xl font-bold mb-4 text-center">All Maintenance Requests</div>
              <table className="min-w-full text-sm border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2">User</th>
                    <th className="border p-2">Room No.</th>
                    <th className="border p-2">Issue Type</th>
                    <th className="border p-2">Images</th> {/* NEW */}
                    <th className="border p-2">Assigned (first)</th>
                    <th className="border p-2">Status</th>
                    <th className="border p-2">Submitted On</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, idx) => {
                    const imgs = Array.isArray(item?.imageUrls)
                      ? item.imageUrls.filter(Boolean)
                      : (item?.imageUrl ? [item.imageUrl] : []);
                    return (
                      <tr key={idx} className="odd:bg-white even:bg-gray-50">
                        <td className="border p-2">{item.username}</td>
                        <td className="border p-2">{item.roomno}</td>
                        <td className="border p-2">{item.problemcategory}</td>

                        {/* Images column (prints nicely) */}
                        <td className="border p-2">
                          {imgs.length === 0 ? "—" : (
                            <div className="flex flex-row flex-wrap gap-1 print-img-cell">
                              {imgs.slice(0, 3).map((src, i) => (
                                <img
                                  key={i}
                                  src={src}
                                  alt={`img-${i + 1}`}
                                  style={{ width: 60, height: 40, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd" }}
                                />
                              ))}
                              {imgs.length > 3 && <span className="text-[10px] text-gray-500">+{imgs.length - 3}</span>}
                            </div>
                          )}
                        </td>

                        <td className="border p-2">{getAssigneesFromRow(item)[0]?.email || "—"}</td>
                        <td className="border p-2">{item.status || "New"}</td>
                        <td className="border p-2">
                          {item.createdDate || (item.createdAt?.seconds ? new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 10) : "—")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setPrintAllModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Close</button>
              <button onClick={handlePrintAll} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Print</button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal (ADMIN ONLY) */}
      {assignModalOpen && isAdmin && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-md p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Assign Request</h2>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <div><span className="font-medium">Request:</span> {assignTarget?.id}</div>
                <div><span className="font-medium">User:</span> {assignTarget?.username}</div>
              </div>

              {/* Multi-select from known employees */}
              {adminEmails.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1">Select employees</label>
                  <select
                    multiple
                    className="w-full border border-gray-300 p-2 rounded bg-white h-28"
                    value={assignEmails}
                    onChange={(e) => {
                      const opts = Array.from(e.target.selectedOptions).map(o => normEmail(o.value));
                      setAssignEmails(uniqByEmail(opts).map(a => a.email));
                    }}
                  >
                    {adminEmails.map(em => (
                      <option key={em} value={normEmail(em)}>{em}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple.</p>
                </div>
              )}

              {/* Free text add */}
              <div>
                <label className="block text-sm font-medium mb-1">Add emails (comma or space separated)</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  placeholder="e.g. a@x.com, b@y.com"
                  value={assignFreeText}
                  onChange={(e) => setAssignFreeText(e.target.value)}
                  onBlur={() => {
                    if (!assignFreeText.trim()) return;
                    const parsed = assignFreeText
                      .split(/[,\s]+/)
                      .map(normEmail)
                      .filter(Boolean);
                    const merged = uniqByEmail([
                      ...assignEmails,
                      ...parsed
                    ]).map(a => a.email);
                    setAssignEmails(merged);
                    setAssignFreeText("");
                  }}
                />
              </div>

              {/* Chips */}
              <div className="flex flex-wrap gap-1">
                {assignEmails.map((em) => (
                  <span key={em} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-gray-100 border text-gray-700">
                    {em}
                    <button
                      type="button"
                      className="text-xs text-red-600"
                      onClick={() => setAssignEmails(assignEmails.filter(x => x !== em))}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </span>
                ))}
                {assignEmails.length === 0 && <span className="text-xs text-gray-500">No assignees selected</span>}
              </div>

              {/* Optional note */}
              <label className="block text-sm font-medium mt-2">Note (optional)</label>
              <textarea
                className="w-full border border-gray-300 p-2 rounded"
                rows={3}
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                placeholder="Add an admin note for this assignment"
              />
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setAssignModalOpen(false)} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
              <button onClick={saveAssignment} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
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
              Request <span className="font-mono bg-gray-50 border px-1 rounded">{noteTarget.id}</span> • User: {noteTarget.username}
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
