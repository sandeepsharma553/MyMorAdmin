import React, { useState, useEffect, useMemo, useRef } from "react";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  getDoc,
  limit,
  serverTimestamp,
} from "firebase/firestore";
import { db, storage, firebaseConfig } from "../../firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { useSelector } from "react-redux";

export default function UniversityEmployeeAdminPage(props) {
  const { navbarHeight } = props;

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rolelist, setRoletList] = useState([]);
  const [fileName, setFileName] = useState("No file chosen");

  const currentUserUid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);

  const universityId = String(emp?.universityid || emp?.universityId || "").trim();
  const universityName = emp?.university || emp?.universityName || "";

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initialForm = {
    id: "",
    name: "",
    email: "",
    mobileNo: "",
    address: "",
    designation: "",
    department: "",
    role: "",
    isActive: true,
    permissions: [],
    image: null,
    imageUrl: "",
    password: "",
    empType: "universityemployee",
  };

  const [form, setForm] = useState(initialForm);

  const MENU_OPTIONS = useMemo(
    () => [
      { key: "universitydashboard", label: "Dashboard" },
      { key: "universityannouncement", label: "Announcements" },
      { key: "universityevent", label: "Events" },
      { key: "universityresources", label: "Resources" },
      { key: "universityroombooking", label: "Room Bookings" },
      { key: "universitydiningmenu", label: "Dining Menu" },
      { key: "universitycleaningschedule", label: "Cleaning Schedule" },
      { key: "universitytutorialschedule", label: "Tutorial Schedule" },
      { key: "universityassessments", label: "Assessment Schedule" },
      { key: "universitymaintenance", label: "Maintenance" },
      { key: "universityacademicgroup", label: "Academic Groups" },
      { key: "universityreportincident", label: "Report Incident" },
      { key: "universityfeedback", label: "Feedback" },
      { key: "universityeventbooking", label: "Event Booking" },
      { key: "universityfaq", label: "FAQs" },
      { key: "universitychecklist", label: "Checklists" },
      { key: "universityroominfo", label: "Room Info" },
      { key: "universityparcels", label: "Parcels" },
      { key: "universitywellnessprompts", label: "Wellness Prompts" },
      { key: "universitymessages", label: "Messages" },
      { key: "universitysetting", label: "Setting" },
    ],
    []
  );

  const pageSize = 10;

  const normalizePermissions = (raw) => {
    if (Array.isArray(raw)) return raw.filter(Boolean);
    if (!raw) return [];
    if (typeof raw === "string") {
      return raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    if (typeof raw === "object") {
      return Object.entries(raw)
        .filter(([, v]) => !!v)
        .map(([k]) => k);
    }
    return [];
  };

  const normalizeEmpTypes = (val) =>
    Array.isArray(val) ? val : val ? [val] : [];

  const mergePermissions = (oldPerms = [], newPerms = []) => {
    const a = normalizePermissions(oldPerms);
    const b = normalizePermissions(newPerms);
    return Array.from(new Set([...a, ...b]));
  };

  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const uploadImageIfNeeded = async (imageFile) => {
    if (!(imageFile instanceof File)) return null;
    const sref = ref(storage, `employee_image/${Date.now()}_${imageFile.name}`);
    await uploadBytes(sref, imageFile);
    return await getDownloadURL(sref);
  };

  const findEmployeeByEmail = async (emailLower) => {
    const qy = query(
      collection(db, "employees"),
      where("email", "==", emailLower),
      limit(1)
    );
    const snap = await getDocs(qy);
    if (snap.empty) return null;

    const d = snap.docs[0];
    return { uid: d.id, data: d.data() || {} };
  };

  const filteredData = useMemo(() => {
    const t = (searchTerm || "").toLowerCase();

    return (list || []).filter((item) => {
      const n = (item.name || "").toLowerCase();
      const e = (item.email || "").toLowerCase();
      return n.includes(t) || e.includes(t);
    });
  }, [list, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  const paginatedData = useMemo(() => {
    return filteredData.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredData, currentPage]);

  useEffect(() => {
    if (!universityId) return;
    getList();
    getRoleList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const getList = async () => {
    setIsLoading(true);

    try {
      const [newSnap, legacySnap] = await Promise.all([
        getDocs(
          query(
            collection(db, "employees"),
            where("universityid", "==", universityId),
            where("empTypes", "array-contains", "universityemployee")
          )
        ),
        getDocs(
          query(
            collection(db, "employees"),
            where("universityid", "==", universityId),
            where("createdBy", "==", currentUserUid || ""),
            where("empType", "==", "university")
          )
        ),
      ]);

      const byId = new Map();

      [...newSnap.docs, ...legacySnap.docs].forEach((d) => {
        byId.set(d.id, d);
      });

      const documents = Array.from(byId.values()).map((d) => ({
        id: d.id,
        ...d.data(),
        permissions: normalizePermissions(d.data()?.permissions),
      }));

      if (mountedRef.current) setList(documents);
    } catch (e) {
      console.error("getList error:", e);
      toast.error("Failed to load employees");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const getRoleList = async () => {
    if (!universityId) return;

    setIsLoading(true);

    try {
      const qy = query(collection(db, "university", universityId, "roles"));
      const snap = await getDocs(qy);

      const documents = snap.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));

      if (mountedRef.current) setRoletList(documents);
    } catch (e) {
      console.error("getRoleList error:", e);
      toast.error("Failed to load roles");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;

    if (type === "file") {
      const file = files?.[0] || null;
      setForm((p) => ({ ...p, [name]: file }));
      setFileName(file ? file.name : "No file chosen");
      return;
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  const allPermissionsSelected = useMemo(() => {
    return (
      MENU_OPTIONS.length > 0 &&
      MENU_OPTIONS.every(({ key }) => (form.permissions || []).includes(key))
    );
  }, [MENU_OPTIONS, form.permissions]);

  const handlePermissionToggle = (key, checked) => {
    setForm((prev) => {
      const current = new Set(normalizePermissions(prev.permissions));
      if (checked) current.add(key);
      else current.delete(key);

      return { ...prev, permissions: Array.from(current) };
    });
  };

  const handleSelectAllPermissions = (checked) => {
    setForm((prev) => {
      const current = new Set(normalizePermissions(prev.permissions));

      MENU_OPTIONS.forEach(({ key }) => {
        if (checked) current.add(key);
        else current.delete(key);
      });

      return { ...prev, permissions: Array.from(current) };
    });
  };

  const resetFormState = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const emailLower = (form.email || "").toLowerCase().trim();
    const password = `${(form.name || "User").trim()}654321`;

    let tempApp = null;

    try {
      if (!isEmailValid(emailLower)) {
        toast.error("Please enter a valid email address");
        return;
      }

      if (!universityId) {
        toast.error("University not found for this admin.");
        return;
      }

      let imageUrl = form.imageUrl || "";
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) imageUrl = uploadedUrl;

      const baseData = {
        name: (form.name || "").trim(),
        email: emailLower,
        mobileNo: form.mobileNo || "",
        address: form.address || "",
        designation: form.designation || "",
        department: form.department || "",
        role: form.role || "",
        isActive: !!form.isActive,
        permissions: normalizePermissions(form.permissions),
        type: "admin",

        empType: "universityemployee",
        empTypes: ["universityemployee"],

        universityid: universityId,
        universityId: universityId,
        university: universityName,

        campusId: "",
        campusName: "",
        disciplineId: "",
        disciplineName: "",

        createdBy: currentUserUid || "",
        createdby: currentUserUid || "",

        ...(imageUrl ? { imageUrl } : {}),
        updatedAt: serverTimestamp(),
      };

      if (editingData) {
        const docRef = doc(db, "employees", form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning("Employee does not exist! Cannot update.");
          return;
        }

        const old = docSnap.data() || {};

        const mergedPerms = mergePermissions(
          old.permissions,
          baseData.permissions
        );

        const mergedEmpTypes = Array.from(
          new Set([
            ...normalizeEmpTypes(old.empTypes || old.empType),
            "universityemployee",
          ])
        );

        await updateDoc(docRef, {
          ...baseData,

          uid: form.id,

          createdBy: old.createdBy || currentUserUid || "",
          createdby: old.createdby || currentUserUid || "",

          empTypes: mergedEmpTypes,
          permissions: mergedPerms,
          password: old.password || "",
          updatedAt: serverTimestamp(),
        });

        toast.success("Employee updated successfully");
        await getList();
        resetFormState();
        return;
      }

      const qSame = query(
        collection(db, "employees"),
        where("email", "==", emailLower),
        where("universityid", "==", universityId),
        where("empTypes", "array-contains", "universityemployee"),
        limit(1)
      );

      const sameSnap = await getDocs(qSame);

      if (!sameSnap.empty) {
        toast.warn(
          "This email is already assigned to an employee in this university."
        );
        return;
      }

      const existingEmp = await findEmployeeByEmail(emailLower);

      if (existingEmp?.uid) {
        const existingUid = existingEmp.uid;
        const oldEmp = existingEmp.data || {};

        const mergedPerms = mergePermissions(
          oldEmp.permissions,
          baseData.permissions
        );

        const mergedEmpTypes = Array.from(
          new Set([
            ...normalizeEmpTypes(oldEmp.empTypes || oldEmp.empType),
            "universityemployee",
          ])
        );

        await setDoc(
          doc(db, "employees", existingUid),
          {
            ...oldEmp,
            ...baseData,

            uid: existingUid,

            empTypes: mergedEmpTypes,
            permissions: mergedPerms,
            password: oldEmp.password || password,

            createdBy: oldEmp.createdBy || currentUserUid || "",
            createdby: oldEmp.createdby || currentUserUid || "",
            createddate: oldEmp.createddate || new Date(),

            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        toast.success("Existing email found — employee assigned/updated!");
        await getList();
        resetFormState();
        return;
      }

      tempApp = initializeApp(firebaseConfig, `employeeCreator_${Date.now()}`);
      const tempAuth = getAuth(tempApp);

      try {
        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          emailLower,
          password
        );

        const user = userCredential.user;

        await updateProfile(user, {
          displayName: baseData.name,
          ...(imageUrl ? { photoURL: imageUrl } : {}),
        });

        await setDoc(doc(db, "employees", user.uid), {
          ...baseData,

          uid: user.uid,

          empTypes: ["universityemployee"],
          password,

          createdBy: currentUserUid || "",
          createdby: currentUserUid || "",
          createddate: new Date(),
          createdAt: serverTimestamp(),
        });

        toast.success("Employee created successfully");
      } catch (err) {
        if (err?.code === "auth/email-already-in-use") {
          const fallbackEmp = await findEmployeeByEmail(emailLower);

          if (fallbackEmp?.uid) {
            const existingUid = fallbackEmp.uid;
            const oldEmp = fallbackEmp.data || {};

            const mergedPerms = mergePermissions(
              oldEmp.permissions,
              baseData.permissions
            );

            const mergedEmpTypes = Array.from(
              new Set([
                ...normalizeEmpTypes(oldEmp.empTypes || oldEmp.empType),
                "universityemployee",
              ])
            );

            await setDoc(
              doc(db, "employees", existingUid),
              {
                ...oldEmp,
                ...baseData,

                uid: existingUid,

                empTypes: mergedEmpTypes,
                permissions: mergedPerms,
                password: oldEmp.password || password,

                createdBy: oldEmp.createdBy || currentUserUid || "",
                createdby: oldEmp.createdby || currentUserUid || "",

                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            toast.success(
              "Email already exists — assigned successfully (no new auth created)."
            );

            await getList();
            resetFormState();
            return;
          }

          toast.warn(
            "Auth email exists but employee record not found. Create employee doc manually or use Admin SDK to map email to UID."
          );
          return;
        }

        throw err;
      }

      await getList();
      resetFormState();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Failed to save employee.");
    } finally {
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch {}
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;

    try {
      const targetUid = deleteData.id || form.id;

      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/deleteUserByUid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: targetUid }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to delete user auth");
      }

      if (data.success) {
        await deleteDoc(doc(db, "employees", targetUid));
        toast.success("Successfully deleted!");
        await getList();
      }
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Failed to delete employee");
    } finally {
      setConfirmDeleteOpen(false);
      setDelete(null);
    }
  };

  if (!universityId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
          No university assigned.
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Employee Admin</h1>

        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setFileName("No file chosen");
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or email"
          className="p-2 border border-gray-300 rounded w-full md:w-1/3"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
        />
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Name",
                  "Email",
                  "Mobile No",
                  "Designation",
                  "Department",
                  "Role",
                  "Password",
                  "Status",
                  "Image",
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
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan="10"
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.mobileNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.designation}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.department}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.role}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.password}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        style={{
                          padding: "4px 8px",
                          borderRadius: "12px",
                          color: "#fff",
                          backgroundColor: item.isActive ? "green" : "red",
                          fontSize: 12,
                        }}
                      >
                        {item.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item?.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          width={80}
                          height={80}
                          alt="employee"
                        />
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            email: item.email || "",
                            permissions: normalizePermissions(item.permissions),
                            image: null,
                          }));
                          setFileName("No file chosen");
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setForm(item);
                          setConfirmDeleteOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

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
            onClick={() =>
              setCurrentPage((p) => Math.min(p + 1, totalPages))
            }
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Employee" : "Create Employee"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <input
                name="email"
                placeholder="Email"
                value={form.email}
                disabled={!!editingData}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              {form.email && !isEmailValid(form.email) && (
                <p className="text-red-500 text-sm mt-1">
                  Invalid email format
                </p>
              )}

              <input
                name="mobileNo"
                placeholder="Mobile No"
                type="number"
                min={0}
                value={form.mobileNo}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <textarea
                name="address"
                placeholder="Address"
                value={form.address}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <input
                name="designation"
                placeholder="Designation"
                value={form.designation}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <input
                name="department"
                placeholder="Department"
                value={form.department}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <select
                name="role"
                value={form.role}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              >
                <option value="">Select Role</option>
                {rolelist.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    name="image"
                    accept="image/*"
                    className="hidden"
                    onChange={handleChange}
                  />
                  📁 Choose File
                </label>

                <span className="text-sm text-gray-600 truncate max-w-[150px]">
                  {fileName}
                </span>
              </div>

              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Image Preview" width="150" />
              ) : null}

              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-2">
                  Permissions
                </label>

                <div className="mb-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={allPermissionsSelected}
                      onChange={(e) =>
                        handleSelectAllPermissions(e.target.checked)
                      }
                    />
                    <span>
                      {allPermissionsSelected
                        ? "Unselect all permissions"
                        : "Select all permissions"}
                    </span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {MENU_OPTIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm bg-gray-50 px-3 py-1.5 rounded border border-gray-200 cursor-pointer hover:bg-gray-100"
                    >
                      <input
                        type="checkbox"
                        checked={(form.permissions || []).includes(key)}
                        onChange={(e) =>
                          handlePermissionToggle(key, e.target.checked)
                        }
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="text-sm font-medium">Status</span>
                <input
                  id="isActive"
                  type="checkbox"
                  name="isActive"
                  className="sr-only peer"
                  checked={!!form.isActive}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, isActive: e.target.checked }))
                  }
                />
                <div className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-green-500 transition-colors relative">
                  <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span
                  className={`text-sm font-semibold ${
                    form.isActive ? "text-green-600" : "text-red-500"
                  }`}
                >
                  {form.isActive ? "Active" : "Inactive"}
                </span>
              </label>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={resetFormState}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>

                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editingData ? "Update Employee" : "Create Employee"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Employee
            </h2>

            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.name}</strong>?
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDelete(null);
                }}
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

      <ToastContainer />
    </main>
  );
}