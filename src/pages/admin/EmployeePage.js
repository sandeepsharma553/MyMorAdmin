import React, { useState, useEffect, useMemo, useRef } from "react";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { MenuItem, Select, Checkbox, ListItemText } from "@mui/material";
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

export default function EmployeePage(props) {
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

  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);

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
    hostelid: "",
    image: null,
    imageUrl: "",
    password: "",
  };

  const [form, setForm] = useState(initialForm);

  const MENU_OPTIONS = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "announcement", label: "Announcement" },
      { key: "student", label: "Student" },
      { key: "diningmenu", label: "Dining Menu" },
      { key: "cleaningschedule", label: "Cleaning Schedule" },
      { key: "maintenance", label: "Maintenance" },
      { key: "bookingroom", label: "Book a Room" },
      { key: "academicgroup", label: "Academic Groups" },
      { key: "reportincident", label: "Report Incident" },
      { key: "feedback", label: "Feedback" },
      { key: "resources", label: "Resources" },
      { key: "event", label: "Event" },
      { key: "deal", label: "Deals" },
      { key: "faq", label: "FAQs" },
      { key: "setting", label: "Setting" },
    ],
    []
  );

  const LABEL_BY_KEY = useMemo(
    () => Object.fromEntries(MENU_OPTIONS.map(({ key, label }) => [key, label])),
    [MENU_OPTIONS]
  );

  const pageSize = 10;

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
    getList();
    getRoleList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  /* -------------------- Helpers -------------------- */

  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const normalizePermissions = (raw) => {
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (typeof raw === "object") {
      return Object.entries(raw)
        .filter(([, v]) => !!v)
        .map(([k]) => k);
    }
    return [];
  };

  const mergePermissions = (oldPerms = [], newPerms = []) => {
    const a = normalizePermissions(oldPerms);
    const b = normalizePermissions(newPerms);
    return Array.from(new Set([...a, ...b]));
  };

  const uploadImageIfNeeded = async (imageFile) => {
    if (!(imageFile instanceof File)) return null;
    const sref = ref(
      storage,
      `employee_image/${Date.now()}_${imageFile.name}`
    );
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

  /* -------------------- Data Fetch -------------------- */

  const getList = async () => {
    setIsLoading(true);
    try {
      const q = query(collection(db, "employees"), where("uid", "==", uid));
      const querySnapshot = await getDocs(q);
      const documents = querySnapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        permissions: normalizePermissions(d.data()?.permissions),
      }));
      setList(documents);
    } catch (e) {
      console.error("getList error:", e);
      toast.error("Failed to load employees");
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleList = async () => {
    setIsLoading(true);
    try {
      const qy = query(
        collection(db, "role"),
        where("hostelid", "==", emp?.hostelid || "")
      );
      const snap = await getDocs(qy);
      const documents = snap.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));
      setRoletList(documents);
    } catch (e) {
      console.error("getRoleList error:", e);
      toast.error("Failed to load roles");
    } finally {
      setIsLoading(false);
    }
  };

  /* -------------------- Handlers -------------------- */

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

  /* -------------------- ✅ UPDATED handleSubmit (same smart flow) -------------------- */

  const handleSubmit = async (e) => {
    e.preventDefault();

    const emailLower = (form.email || "").toLowerCase().trim();
    const password = `${(form.name || "User").trim()}321`;

    let tempApp = null;

    try {
      if (!isEmailValid(emailLower)) {
        toast.error("Please enter a valid email address");
        return;
      }

      if (!emp?.hostelid) {
        toast.error("Hostel not found for this admin.");
        return;
      }

      // ✅ upload image if new
      let imageUrl = form.imageUrl || "";
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) imageUrl = uploadedUrl;

      // ✅ base payload (hostel employee)
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
        type: "admin", // panel access
        hostelid: emp.hostelid,
        uid, // creator uid (current logged in admin)
        ...(imageUrl ? { imageUrl } : {}),
        updatedAt: serverTimestamp(),
      };

      // ---------------- EDIT MODE ----------------
      if (editingData) {
        const docRef = doc(db, "employees", form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning("Employee does not exist! Cannot update.");
          return;
        }

        const old = docSnap.data() || {};
        const mergedPerms = mergePermissions(old.permissions, baseData.permissions);

        // ✅ keep password as-is (do not overwrite)
        await updateDoc(docRef, {
          ...baseData,
          permissions: mergedPerms,
          password: old.password || "",
        });

        toast.success("Employee updated successfully");
        await getList();

        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        return;
      }

      // ---------------- CREATE MODE ----------------

      // ✅ Rule 1: block SAME email + SAME hostel (already assigned)
      const qSame = query(
        collection(db, "employees"),
        where("email", "==", emailLower),
        where("hostelid", "==", emp.hostelid),
        limit(1)
      );
      const sameSnap = await getDocs(qSame);
      if (!sameSnap.empty) {
        toast.warn("This email is already assigned to an employee in this hostel.");
        return;
      }

      // ✅ Rule 2: if employee exists by email (any hostel) => reuse UID, merge permissions, update hostelid
      const existingEmp = await findEmployeeByEmail(emailLower);
      if (existingEmp?.uid) {
        const existingUid = existingEmp.uid;
        const oldEmp = existingEmp.data || {};

        const mergedPerms = mergePermissions(oldEmp.permissions, baseData.permissions);

        await setDoc(
          doc(db, "employees", existingUid),
          {
            ...oldEmp,
            ...baseData,
            hostelid: emp.hostelid,
            permissions: mergedPerms,
            password: oldEmp.password || password,
            createdby: oldEmp.createdby || uid,
            createddate: oldEmp.createddate || new Date(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        toast.success("Existing email found — employee assigned/updated!");

        await getList();
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        return;
      }

      // ✅ Rule 3: create auth + employee doc
      tempApp = initializeApp(firebaseConfig, "employeeCreator");
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
          password,
          createdby: uid,
          createddate: new Date(),
          createdAt: serverTimestamp(),
        });

        toast.success("Employee created successfully");
      } catch (err) {
        // ✅ IMPORTANT: if auth already exists, try to assign by employee doc
        if (err?.code === "auth/email-already-in-use") {
          const fallbackEmp = await findEmployeeByEmail(emailLower);

          if (fallbackEmp?.uid) {
            const existingUid = fallbackEmp.uid;
            const oldEmp = fallbackEmp.data || {};
            const mergedPerms = mergePermissions(oldEmp.permissions, baseData.permissions);

            await setDoc(
              doc(db, "employees", existingUid),
              {
                ...oldEmp,
                ...baseData,
                hostelid: emp.hostelid,
                permissions: mergedPerms,
                password: oldEmp.password || password,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            toast.success(
              "Email already exists — assigned successfully (no new auth created)."
            );

            await getList();
            setModalOpen(false);
            setEditing(null);
            setForm(initialForm);
            setFileName("No file chosen");
            return;
          }

          toast.warn(
            "Auth email exists but employee record not found. Create employee doc manually or use Admin SDK to map email → uid."
          );
          return;
        }

        throw err;
      }

      // ✅ final reset
      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
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
      const targetUid = form.id;

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

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Employee</h1>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Mobile No
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Designation
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Password
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Image
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Actions
                </th>
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
                        <img src={item.imageUrl} width={80} height={80} alt="employee" />
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
                            hostelid: item.hostelid || emp?.hostelid || "",
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

      {/* Pagination controls */}
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

      {/* Modal */}
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
                <p className="text-red-500 text-sm mt-1">Invalid email format</p>
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

              {/* File */}
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

              {/* Permissions */}
              <Select
                className="w-full border border-gray-300 p-2 rounded"
                multiple
                displayEmpty
                value={form.permissions || []}
                onChange={(e) =>
                  setForm((p) => ({ ...p, permissions: e.target.value }))
                }
                renderValue={(selected) =>
                  selected?.length
                    ? selected.map((k) => LABEL_BY_KEY[k]).join(", ")
                    : "Select Permission"
                }
              >
                {MENU_OPTIONS.map(({ key, label }) => (
                  <MenuItem key={key} value={key}>
                    <Checkbox checked={(form.permissions || []).includes(key)} />
                    <ListItemText primary={label} />
                  </MenuItem>
                ))}
              </Select>

              {/* Status */}
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
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                    setFileName("No file chosen");
                  }}
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

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Employee
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
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
