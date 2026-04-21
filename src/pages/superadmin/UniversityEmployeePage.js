import React, { useState, useEffect, useMemo, useRef } from "react";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, getDocs, updateDoc, doc, setDoc, deleteDoc,
  query, where, getDoc, limit, serverTimestamp,
} from "firebase/firestore";
import { db, storage, firebaseConfig } from "../../firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useSelector } from "react-redux";

const pageSize = 10;

/* University admin pages — shown based on university's feature flags */
const ALL_MENU_OPTIONS = [
  { key: "universitydashboard", label: "Dashboard", featureFlag: null },
  { key: "universityemployee", label: "Employee", featureFlag: null },
  { key: "universitystudent", label: "Student", featureFlag: null },
  { key: "universityannouncement", label: "Announcements", featureFlag: "announcement" },
  { key: "universityevent", label: "Events", featureFlag: "events" },
  { key: "universityresources", label: "Resources", featureFlag: "resource" },
  { key: "universityroombooking", label: "Room Bookings", featureFlag: "bookingroom" },
  { key: "universitydiningmenu", label: "Dining Menu", featureFlag: "diningmenu" },
  { key: "universitycleaningschedule", label: "Cleaning Schedule", featureFlag: "cleaningschedule" },
  { key: "universitytutorialschedule", label: "Tutorial Schedule", featureFlag: "tutorialschedule" },
  { key: "universitymaintenance", label: "Maintenance", featureFlag: "maintenance" },
  { key: "universityacademicgroup", label: "Academic Groups", featureFlag: "academicgroup" },
  { key: "universityreportincident", label: "Report Incident", featureFlag: "reportincident" },
  { key: "universityfeedback", label: "Feedback", featureFlag: "feedback" },
  { key: "universityeventbooking", label: "Event Booking", featureFlag: "events" },
  { key: "universitydeal", label: "Deals", featureFlag: "deals" },
  { key: "universityfaq", label: "FAQs", featureFlag: "faq" },
  { key: "universitychecklist", label: "Checklists", featureFlag: "checklist" },
  { key: "universityroominfo", label: "Room Info", featureFlag: "roominfo" },
  { key: "universityparcels", label: "Parcels", featureFlag: "parcels" },
  { key: "universitywellnessprompts", label: "Wellness Prompts", featureFlag: "wellnessprompts" },
  { key: "universitymessages", label: "Messages", featureFlag: "messages" },
  { key: "universitysetting", label: "Setting", featureFlag: "setting" },
];

const ALWAYS_ALLOWED = ["universitydashboard", "universityemployee", "universitystudent", "universitysettingPage"];

const normalizePermissions = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  if (typeof raw === "string") return raw.split(",").map(s => s.trim()).filter(Boolean);
  if (typeof raw === "object") return Object.entries(raw).filter(([, v]) => !!v).map(([k]) => k);
  return [];
};

const mergePermissions = (a = [], b = []) =>
  Array.from(new Set([...normalizePermissions(a), ...normalizePermissions(b)]));

const isEmailValid = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((email || "").trim());

const initialForm = {
  id: "", name: "", email: "", mobileNo: "", address: "",
  universityId: "", university: "",
  role: "admin", type: "admin", isActive: true,
  permissions: [], image: null, imageUrl: "", password: "",
};

export default function UniversityEmployeePage({ navbarHeight }) {
  const uid = useSelector((state) => state.auth.user.uid);

  const [list, setList] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [fileName, setFileName] = useState("No file chosen");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterUniId, setFilterUniId] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [allowedMenuKeys, setAllowedMenuKeys] = useState(ALWAYS_ALLOWED);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* ─── derived ─── */
  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return list.filter(item => {
      const matchSearch = item.name?.toLowerCase().includes(term) || item.email?.toLowerCase().includes(term);
      const matchUni = filterUniId === "all" || (item.universityId === filterUniId || item.universityid === filterUniId);
      return matchSearch && matchUni;
    });
  }, [list, searchTerm, filterUniId]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(
    () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredData, currentPage]
  );

  const visibleMenuOptions = useMemo(() => {
    if (editingData) return ALL_MENU_OPTIONS;
    return ALL_MENU_OPTIONS.filter(({ key }) => allowedMenuKeys.includes(key));
  }, [editingData, allowedMenuKeys]);

  const allPermissionsSelected = useMemo(
    () => visibleMenuOptions.length > 0 && visibleMenuOptions.every(({ key }) => (form.permissions || []).includes(key)),
    [visibleMenuOptions, form.permissions]
  );

  const handlePermissionToggle = (key, checked) => {
    setForm(prev => {
      const cur = new Set(prev.permissions || []);
      checked ? cur.add(key) : cur.delete(key);
      return { ...prev, permissions: Array.from(cur) };
    });
  };

  const handleSelectAllPermissions = (checked) => {
    setForm(prev => {
      const cur = new Set(prev.permissions || []);
      visibleMenuOptions.forEach(({ key }) => checked ? cur.add(key) : cur.delete(key));
      return { ...prev, permissions: Array.from(cur) };
    });
  };

  /* ─── data fetch ─── */
  useEffect(() => { getList(); }, []);
  useEffect(() => { if (currentPage > totalPages) setCurrentPage(totalPages); }, [totalPages, currentPage]);

  const getList = async () => {
    setIsLoading(true);
    try {
      const empSnap = await getDocs(query(
        collection(db, "employees"),
        where("type", "==", "admin"),
        where("empType", "==", "university")
      ));
      setList(empSnap.docs.map(d => ({ id: d.id, ...d.data(), permissions: normalizePermissions(d.data().permissions) })));

      const uniSnap = await getDocs(collection(db, "university"));
      setUniversities(uniSnap.docs.map(d => ({ id: d.id, name: d.data().name, features: d.data().features || {} })));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load data");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUniversityChange = (e) => {
    const uniId = e.target.value;
    const uni = universities.find(u => u.id === uniId);
    const features = uni?.features || {};

    const allowed = Array.from(new Set([
      ...ALWAYS_ALLOWED,
      ...ALL_MENU_OPTIONS
        .filter(opt => opt.featureFlag && features[opt.featureFlag])
        .map(opt => opt.key),
    ]));

    setAllowedMenuKeys(allowed);
    setForm(prev => ({
      ...prev,
      universityId: uniId,
      university: uni?.name || "",
      permissions: editingData ? prev.permissions : [],
    }));
  };

  /* ─── helpers ─── */
  const findUserByEmail = async (email) => {
    const snap = await getDocs(query(collection(db, "users"), where("email", "==", email), limit(1)));
    if (snap.empty) return null;
    return { uid: snap.docs[0].id, data: snap.docs[0].data() };
  };

  const findEmployeeByEmail = async (email) => {
    const snap = await getDocs(query(collection(db, "employees"), where("email", "==", email), limit(1)));
    if (snap.empty) return null;
    return { uid: snap.docs[0].id, data: snap.docs[0].data() };
  };

  const assignUniversityAdmin = async ({ targetUid, baseData, passwordFallback }) => {
    const empRef = doc(db, "employees", targetUid);
    const empSnap = await getDoc(empRef);
    const existing = empSnap.exists() ? empSnap.data() : {};
    const mergedPerms = mergePermissions(existing.permissions, baseData.permissions);

    await setDoc(empRef, {
      ...existing,
      ...baseData,
      uid: existing.uid || baseData.uid,
      email: baseData.email,
      name: baseData.name,
      type: "admin",
      role: "admin",
      empType: "university",
      isActive: true,
      permissions: mergedPerms,
      password: existing.password || passwordFallback || "",
      updatedAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, "users", targetUid), {
      uid: targetUid,
      firstname: baseData.name,
      email: baseData.email,
      universityId: baseData.universityId || "",
      universityid: baseData.universityId || "",
      university: baseData.university || "",
      updateddate: new Date(),
      roles: { student: true, universityAdmin: true },
    }, { merge: true });
  };

  /* ─── submit ─── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailLower = (form.email || "").toLowerCase().trim();
    const password = `${form.name?.trim() || "User"}321`;
    let tempApp = null;

    try {
      if (!isEmailValid(emailLower)) { toast.error("Invalid email address"); return; }
      if (!form.universityId) { toast.error("Please select a university"); return; }

      let imageUrl = form.imageUrl || "";
      if (form.image instanceof File) {
        const sref = ref(storage, `employee_image/${Date.now()}_${form.image.name}`);
        await uploadBytes(sref, form.image);
        imageUrl = await getDownloadURL(sref);
      }

      const baseData = {
        name: form.name?.trim() || "",
        email: emailLower,
        mobileNo: form.mobileNo || "",
        address: form.address || "",
        universityId: form.universityId || "",
        universityid: form.universityId || "",
        university: form.university || "",
        hostelid: "",
        role: "admin",
        type: "admin",
        empType: "university",
        isActive: !!form.isActive,
        permissions: Array.isArray(form.permissions) ? form.permissions : [],
        uid,
        ...(imageUrl ? { imageUrl } : {}),
      };

      /* ── EDIT ── */
      if (editingData) {
        const docRef = doc(db, "employees", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) { toast.warn("Employee not found"); return; }
        const old = docSnap.data() || {};
        await updateDoc(docRef, {
          ...baseData,
          permissions: mergePermissions(old.permissions, form.permissions),
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, "users", form.id), {
          uid: form.id,
          firstname: baseData.name,
          email: emailLower,
          universityId: form.universityId,
          universityid: form.universityId,
          university: form.university,
          updateddate: new Date(),
          roles: { student: true, universityAdmin: true },
        }, { merge: true });
        toast.success("Employee updated!");
        resetAndClose();
        await getList();
        return;
      }

      /* ── CREATE: check duplicate ── */
      const dupSnap = await getDocs(query(
        collection(db, "employees"),
        where("email", "==", emailLower),
        where("universityId", "==", form.universityId),
        where("empType", "==", "university"),
        limit(1)
      ));
      if (!dupSnap.empty) { toast.warn("This email is already assigned to this university."); return; }

      /* ── Existing user? → promote ── */
      const existingUser = await findUserByEmail(emailLower);
      if (existingUser?.uid) {
        await assignUniversityAdmin({ targetUid: existingUser.uid, baseData, passwordFallback: existingUser.data?.password || password });
        toast.success("Existing user promoted to University Admin!");
        resetAndClose();
        await getList();
        return;
      }

      const existingEmp = await findEmployeeByEmail(emailLower);
      if (existingEmp?.uid) {
        await assignUniversityAdmin({ targetUid: existingEmp.uid, baseData, passwordFallback: existingEmp.data?.password || password });
        toast.success("Existing employee assigned as University Admin!");
        resetAndClose();
        await getList();
        return;
      }

      /* ── Brand new user → create Auth ── */
      tempApp = initializeApp(firebaseConfig, `uniEmpCreator_${Date.now()}`);
      const tempAuth = getAuth(tempApp);
      try {
        const cred = await createUserWithEmailAndPassword(tempAuth, emailLower, password);
        const newUid = cred.user.uid;
        await updateProfile(cred.user, { displayName: baseData.name, photoURL: imageUrl || undefined });

        await setDoc(doc(db, "employees", newUid), {
          ...baseData,
          password,
          createdAt: serverTimestamp(),
        });
        await setDoc(doc(db, "users", newUid), {
          uid: newUid,
          firstname: baseData.name,
          lastname: "",
          username: baseData.name,
          email: emailLower,
          universityId: form.universityId,
          universityid: form.universityId,
          university: form.university,
          createdby: uid,
          createddate: new Date(),
          password,
          roles: { student: true, universityAdmin: true },
        });
        toast.success("University employee created!");
      } catch (err) {
        if (err?.code === "auth/email-already-in-use") {
          toast.warn("Auth account exists but no user doc found. Please check Firebase.");
          return;
        }
        throw err;
      }

      resetAndClose();
      await getList();
    } catch (err) {
      console.error(err);
      toast.error("Failed to save employee.");
    } finally {
      if (tempApp) try { await deleteApp(tempApp); } catch { }
    }
  };

  const handleDisable = async () => {
    if (!deleteData) return;
    try {
      const res = await fetch("https://us-central1-mymor-one.cloudfunctions.net/disableUserByUid", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: form.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await updateDoc(doc(db, "employees", form.id), { status: "disabled", isActive: false, updatedAt: serverTimestamp() });
      toast.success("Account disabled!");
      await getList();
    } catch { toast.error("Failed to disable account"); }
    setConfirmDeleteOpen(false); setDelete(null);
  };

  const handleEnable = async () => {
    try {
      const res = await fetch("https://us-central1-mymor-one.cloudfunctions.net/enableUserByUid", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: form.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await updateDoc(doc(db, "employees", form.id), { status: "active", isActive: true, updatedAt: serverTimestamp() });
      toast.success("Account enabled!");
      await getList();
    } catch { toast.error("Failed to enable account"); }
    setConfirmDeleteOpen(false); setDelete(null);
  };

  const resetAndClose = () => {
    setModalOpen(false); setEditing(null);
    setForm(initialForm); setFileName("No file chosen");
    setAllowedMenuKeys(ALWAYS_ALLOWED);
  };

  const openEdit = (item) => {
    setEditing(item);
    const uniId = item.universityId || item.universityid || "";
    const uni = universities.find(u => u.id === uniId);
    const features = uni?.features || {};
    const savedPerms = normalizePermissions(item.permissions);

    const allowed = Array.from(new Set([
      ...ALWAYS_ALLOWED,
      ...ALL_MENU_OPTIONS.filter(opt => opt.featureFlag && features[opt.featureFlag]).map(opt => opt.key),
      ...savedPerms,
    ]));
    setAllowedMenuKeys(allowed);

    setForm({ ...initialForm, ...item, id: item.id, universityId: uniId, university: item.university || uni?.name || "", permissions: savedPerms, image: null });
    setModalOpen(true);
  };

  const universityOptions = useMemo(
    () => [...universities].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [universities]
  );

  /* ─── render ─── */
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer />

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Employee</h1>
        <button
          className="px-4 py-2 bg-green-800 text-white rounded hover:bg-green-900"
          onClick={() => { setEditing(null); setForm(initialForm); setFileName("No file chosen"); setAllowedMenuKeys(ALWAYS_ALLOWED); setModalOpen(true); }}
        >
          + Add
        </button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
        <select
          className="p-2 border border-gray-300 rounded w-full md:w-1/3"
          value={filterUniId}
          onChange={e => { setFilterUniId(e.target.value); setCurrentPage(1); }}
        >
          <option value="all">All Universities</option>
          {universityOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search by name or email"
          className="p-2 border border-gray-300 rounded w-full md:w-1/3"
          value={searchTerm}
          onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
        />
        {(filterUniId !== "all" || searchTerm) && (
          <button className="px-3 py-2 bg-gray-200 rounded" onClick={() => { setSearchTerm(""); setFilterUniId("all"); setCurrentPage(1); }}>Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["University", "Name", "Email", "Mobile", "Password", "Status", "Image", "Actions"].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-sm font-medium text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr><td colSpan="8" className="px-6 py-4 text-center text-gray-500">No university employees found.</td></tr>
              ) : paginatedData.map(item => (
                <tr key={item.id}>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.university || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 font-semibold">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.email}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.mobileNo || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{item.password || "—"}</td>
                  <td className="px-6 py-4 text-sm">
                    <span className="px-2 py-1 rounded-full text-xs font-bold text-white" style={{ backgroundColor: item.isActive ? "green" : "red" }}>
                      {item.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {item.imageUrl && <img src={item.imageUrl} width={56} height={56} alt="emp" className="rounded" />}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <button className="text-blue-600 hover:underline mr-3" onClick={() => openEdit(item)}>Edit</button>
                    {item.isActive ? (
                      <button className="text-red-600 hover:underline" onClick={() => { setDelete(item); setForm(f => ({ ...f, id: item.id, hostelid: item.hostelid || "" })); setConfirmDeleteOpen(true); }}>Disable</button>
                    ) : (
                      <button className="text-green-700 hover:underline" onClick={() => { setDelete(item); setForm(f => ({ ...f, id: item.id, hostelid: item.hostelid || "" })); setConfirmDeleteOpen(true); }}>Enable</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p>
        <div className="space-x-2">
          <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Previous</button>
          <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages} className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* ── Modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit University Employee" : "Add University Employee"}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">

              <input type="text" name="name" placeholder="Full Name *" required className="w-full border border-gray-300 p-2 rounded" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <input type="email" name="email" placeholder="Email *" required className="w-full border border-gray-300 p-2 rounded" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} disabled={!!editingData} />
              <input type="text" name="mobileNo" placeholder="Mobile No" className="w-full border border-gray-300 p-2 rounded" value={form.mobileNo} onChange={e => setForm(f => ({ ...f, mobileNo: e.target.value }))} />
              <input type="text" name="address" placeholder="Address" className="w-full border border-gray-300 p-2 rounded" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />

              {/* University Selector */}
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">University *</label>
                <select
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.universityId}
                  onChange={handleUniversityChange}
                  required
                >
                  <option value="">Select University</option>
                  {universityOptions.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Selecting a university will show the permissions available for that university's active features.</p>
              </div>

              {/* Image */}
              <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                <label className="cursor-pointer">
                  <input type="file" name="image" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; setForm(prev => ({ ...prev, image: f || null })); setFileName(f?.name || "No file chosen"); }} />
                  📁 Choose File
                </label>
                <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
              </div>
              {form.imageUrl && <img src={form.imageUrl} alt="" width={100} className="rounded" />}

              {/* Permissions */}
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">Permissions</label>

                {!form.universityId && !editingData ? (
                  <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded border border-gray-200">Select a university above to see available permissions.</p>
                ) : (
                  <>
                    <div className="mb-2">
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input type="checkbox" checked={allPermissionsSelected} onChange={e => handleSelectAllPermissions(e.target.checked)} />
                        <span>{allPermissionsSelected ? "Unselect all permissions" : "Select all permissions"}</span>
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {visibleMenuOptions.map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded border border-gray-200 cursor-pointer hover:bg-gray-100">
                          <input type="checkbox" checked={(form.permissions || []).includes(key)} onChange={e => handlePermissionToggle(key, e.target.checked)} />
                          {label}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Status */}
              <label className="flex items-center gap-3 cursor-pointer">
                <span className="text-sm font-medium">Status</span>
                <input type="checkbox" id="isActive" name="isActive" className="sr-only peer" checked={!!form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />
                <div className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-green-500 transition-colors relative">
                  <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span className={`text-sm font-semibold ${form.isActive ? "text-green-600" : "text-red-500"}`}>{form.isActive ? "Active" : "Inactive"}</span>
              </label>

              <div className="flex justify-end mt-6 space-x-3">
                <button type="button" onClick={resetAndClose} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-green-800 text-white rounded hover:bg-green-900">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Disable / Enable confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">{deleteData?.isActive ? "Disable Account" : "Enable Account"}</h2>
            <p className="mb-4">
              {deleteData?.isActive ? "Disable" : "Enable"} account for <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button
                onClick={deleteData?.isActive ? handleDisable : handleEnable}
                className={`px-4 py-2 text-white rounded ${deleteData?.isActive ? "bg-red-600 hover:bg-red-700" : "bg-green-700 hover:bg-green-800"}`}
              >
                {deleteData?.isActive ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
