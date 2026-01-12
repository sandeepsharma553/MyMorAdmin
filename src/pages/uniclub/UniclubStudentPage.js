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
import { db, storage, firebaseConfig, database } from "../../firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { ref as dbRef, onValue, off } from "firebase/database";
import { useSelector } from "react-redux";

export default function UniclubStudentPage(props) {
  const { navbarHeight } = props;

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [fileName, setFileName] = useState("No file chosen");

  // ✅ subgroups list for dropdown
  const [subgroups, setSubgroups] = useState([]);

  // auth/employee
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
    firstname: "",
    lastname: "",
    email: "",
    mobileNo: "",
    address: "",
    studentid: "",
    image: null,
    imageUrl: "",
    password: "",
    permissions: [],

    committeeScope: "uniclub", // "uniclub" | "subgroup"
    subgroupId: "",
    subgroupName: "",
  };

  const [form, setForm] = useState(initialForm);

  const pageSize = 10;

  /* ------------------------ ✅ Permission options (scope-based) ------------------------ */
  const UNICLUB_MENU_OPTIONS = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "uniclub", label: "UniClub" },
      { key: "uniclubannouncement", label: "Announcement" },
      { key: "uniclubcommunity", label: "Community" },
      { key: "uniclubevent", label: "Event" },
      { key: "uniclubeventbooking", label: "Event Booking" },
      { key: "uniclubsubgroup", label: "Sub Group" },
      { key: "contact", label: "Contact" },
    ],
    []
  );

  const SUBGROUP_MENU_OPTIONS = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "subgroupannouncement", label: "Subgroup Announcement" },
      { key: "subgroupevent", label: "Subgroup Event" },
      { key: "subgroupeventbooking", label: "Subgroup Event Booking" },
      { key: "contact", label: "Contact" },
    ],
    []
  );

  const visibleMenuOptions = useMemo(() => {
    return form.committeeScope === "subgroup"
      ? SUBGROUP_MENU_OPTIONS
      : UNICLUB_MENU_OPTIONS;
  }, [form.committeeScope, SUBGROUP_MENU_OPTIONS, UNICLUB_MENU_OPTIONS]);

  // ✅ when switching scope, drop invalid permissions automatically
  useEffect(() => {
    const allowed = new Set(visibleMenuOptions.map((o) => o.key));
    setForm((prev) => {
      const cleaned = (prev.permissions || []).filter((p) => allowed.has(p));
      const prevArr = prev.permissions || [];
      const sameLen = cleaned.length === prevArr.length;
      const sameVals = sameLen && cleaned.every((x, i) => x === prevArr[i]);
      return sameVals ? prev : { ...prev, permissions: cleaned };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.committeeScope]);

  const allPermissionsSelected = useMemo(() => {
    if (!visibleMenuOptions.length) return false;
    return visibleMenuOptions.every(({ key }) =>
      (form.permissions || []).includes(key)
    );
  }, [visibleMenuOptions, form.permissions]);

  const handlePermissionToggle = (key, checked) => {
    setForm((prev) => {
      const current = new Set(prev.permissions || []);
      if (checked) current.add(key);
      else current.delete(key);
      return { ...prev, permissions: Array.from(current) };
    });
  };

  const handleSelectAllPermissions = (checked) => {
    setForm((prev) => {
      const current = new Set(prev.permissions || []);
      if (checked) visibleMenuOptions.forEach(({ key }) => current.add(key));
      else visibleMenuOptions.forEach(({ key }) => current.delete(key));
      return { ...prev, permissions: Array.from(current) };
    });
  };

  /* ------------------------ table filter + pagination ------------------------ */
  const filteredData = list.filter(
    (item) =>
      (item.firstname || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (item.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    getList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ fetch subgroups for this uniclub (RTDB: uniclubsubgroup)
  useEffect(() => {
    fetchSubgroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emp?.uniclubid]);

  const fetchSubgroups = () => {
    if (!emp?.uniclubid) {
      setSubgroups([]);
      return;
    }
    const r = dbRef(database, `uniclubsubgroup`);
    const handler = (snap) => {
      const val = snap.val() || {};
      const rows = Object.entries(val)
        .map(([id, v]) => ({
          id,
          ...v,
          name: v.title || v.name || "Subgroup",
        }))
        .filter((sg) => sg.parentGroupId === emp.uniclubid);
      setSubgroups(rows);
    };

    onValue(r, handler);
    return () => off(r, "value", handler);
  };

  const getList = async () => {
    setIsLoading(true);
    try {
      const constraints = [
        where("createdby", "==", uid),
      ];
      const qy = query(collection(db, "users"), ...constraints);
      const snap = await getDocs(qy);
      const rows = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.firstname !== emp?.name);
      setList(rows);
    } catch (err) {
      console.error("getList error:", err);
      toast.error("Failed to load students");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === "file") {
      const file = files?.[0] || null;
      setForm((p) => ({ ...p, [name]: file }));
      setFileName(file ? file.name : "No file chosen");
    } else {
      setForm((p) => ({ ...p, [name]: value }));
    }
  };

  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const uploadImageIfNeeded = async (imageFile) => {
    if (!(imageFile instanceof File)) return null;
    const storageRefObj = ref(
      storage,
      `user_image/${Date.now()}_${imageFile.name}`
    );
    await uploadBytes(storageRefObj, imageFile);
    return await getDownloadURL(storageRefObj);
  };

  // Normalize old permissions formats (array/string/object/null) → clean array
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

  // ✅ Find existing USER doc by email => { uid, data } or null
  const findUserByEmail = async (emailLower) => {
    const qy = query(
      collection(db, "users"),
      where("email", "==", emailLower),
      limit(1)
    );
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, data: d.data() || {} };
  };

  // ✅ Find existing EMPLOYEE doc by email => { uid, data } or null
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

  // ✅ Create/assign committee role to existing UID (merge-safe)
  const assignCommitteeToUid = async ({
    targetUid,
    emailLower,
    finalImageUrl,
    passwordFallback,
  }) => {
    // current docs
    const userRef = doc(db, "users", targetUid);
    const userSnap = await getDoc(userRef);
    const oldUser = userSnap.exists() ? userSnap.data() || {} : {};

    const empRef = doc(db, "employees", targetUid);
    const empSnap = await getDoc(empRef);
    const oldEmp = empSnap.exists() ? empSnap.data() || {} : {};

    const mergedPerms = mergePermissions(oldEmp.permissions, form.permissions);

    // computed subgroup fields
    const scope = form.committeeScope || "uniclub";
    const sgId = scope === "subgroup" ? form.subgroupId || "" : "";
    const sgName = scope === "subgroup" ? form.subgroupName || "" : "";

    // ✅ users merge (do not overwrite other profile)
    await setDoc(
      userRef,
      {
        uid: targetUid,
        firstname: form.firstname,
        lastname: form.lastname || "",
        username: form.firstname,
        email: emailLower,
        livingtype: "university",

        universityid: emp?.universityId || oldUser.universityid || "",
        university: emp?.university || oldUser.university || "",

        mobileNo: form.mobileNo || oldUser.mobileNo || "",
        address: form.address || oldUser.address || "",
        studentid: form.studentid || oldUser.studentid || "",

        imageUrl: finalImageUrl || oldUser.imageUrl || "",
        password: oldUser.password || passwordFallback || "",

        uniclub: emp?.uniclub || oldUser.uniclub || "",
        uniclubid: emp?.uniclubid || oldUser.uniclubid || "",

        committeeScope: scope,
        subgroupId: sgId,
        subgroupName: sgName,

        // keep old created fields if exist
        createdby: oldUser.createdby || uid,
        createddate: oldUser.createddate || new Date(),

        updateddate: new Date(),

        roles: {
          ...(oldUser.roles || {}),
          student: true,
          committee: true,
        },
      },
      { merge: true }
    );

    // ✅ employees merge (do not delete other roles)
    await setDoc(
      empRef,
      {
        ...oldEmp,

        name: form.firstname,
        email: emailLower,
        mobileNo: form.mobileNo || "",
        address: form.address || "",

        role: "student", // your schema uses role=student but type=admin for panel access
        type: "admin",
        isActive: true,

        universityid: emp?.universityId || oldEmp.universityid || "",
        university: emp?.university || oldEmp.university || "",

        uniclub: emp?.uniclub || oldEmp.uniclub || "",
        uniclubid: emp?.uniclubid || oldEmp.uniclubid || "",

        createdby: oldEmp.createdby || uid,
        createddate: oldEmp.createddate || new Date(),

        imageUrl: finalImageUrl || oldEmp.imageUrl || "",
        password: oldEmp.password || passwordFallback || "",

        permissions: mergedPerms,

        committeeScope: scope,
        subgroupId: sgId,
        subgroupName: sgName,

        // ✅ optional map for multiple committee assignments in future
        committeeRoles: {
          ...(oldEmp.committeeRoles || {}),
          [`${emp?.uniclubid || ""}:${scope}:${sgId || "all"}`]: {
            uniclubid: emp?.uniclubid || "",
            uniclub: emp?.uniclub || "",
            committeeScope: scope,
            subgroupId: sgId,
            subgroupName: sgName,
            permissions: mergedPerms,
            updatedAt: serverTimestamp(),
          },
        },

        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  };

  /* ------------------------ ✅ UPDATED handleSubmit (same pattern as hostel) ------------------------ */
  const handleSubmit = async (e) => {
    e.preventDefault();

    const emailLower = (form.email || "").toLowerCase().trim();
    const password = `${(form.firstname || "User").trim()}321`;

    let tempApp = null;

    try {
      // validations
      if (!isEmailValid(emailLower)) {
        toast.error("Please enter a valid email address");
        return;
      }

      if (!emp?.uniclubid) {
        toast.error("Uniclub not found for this admin.");
        return;
      }

      if (form.committeeScope === "subgroup" && !form.subgroupId) {
        toast.error("Please select a subgroup");
        return;
      }

      // upload image if new
      let finalImageUrl = form.imageUrl || "";
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) finalImageUrl = uploadedUrl;

      const scope = form.committeeScope || "uniclub";
      const sgId = scope === "subgroup" ? form.subgroupId || "" : "";
      const sgName = scope === "subgroup" ? form.subgroupName || "" : "";

      // ---------------- EDIT MODE ----------------
      if (editingData) {
        const userRef = doc(db, "users", form.id);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          toast.warning("Student does not exist! Cannot update.");
          return;
        }

        const empRef = doc(db, "employees", form.id);
        const empSnap = await getDoc(empRef);
        const oldEmp = empSnap.exists() ? empSnap.data() || {} : {};
        const mergedPerms = mergePermissions(oldEmp.permissions, form.permissions);

        // users update (merge)
        await setDoc(
          userRef,
          {
            uid: form.id,
            firstname: form.firstname,
            lastname: form.lastname || "",
            username: form.firstname,
            email: emailLower,
            universityid: emp?.universityId || userSnap.data()?.universityid || "",
            university: emp?.university || userSnap.data()?.university || "",
            livingtype: "university",
            mobileNo: form.mobileNo || "",
            address: form.address || "",
            studentid: form.studentid || "",
            imageUrl: finalImageUrl || userSnap.data()?.imageUrl || "",
            uniclub: emp?.uniclub || userSnap.data()?.uniclub || "",
            uniclubid: emp?.uniclubid || userSnap.data()?.uniclubid || "",
            committeeScope: scope,
            subgroupId: sgId,
            subgroupName: sgName,
            updateddate: new Date(),
            roles: {
              ...(userSnap.data()?.roles || {}),
              student: true,
              committee: true,
            },
          },
          { merge: true }
        );

        // employees update (merge)
        await setDoc(
          empRef,
          {
            name: form.firstname,
            email: emailLower,
            mobileNo: form.mobileNo || "",
            address: form.address || "",
            role: "student",
            type: "admin",
            isActive: true,
            universityid: emp?.universityId || oldEmp.universityid || "",
            university: emp?.university || oldEmp.university || "",
            uniclub: emp?.uniclub || oldEmp.uniclub || "",
            uniclubid: emp?.uniclubid || oldEmp.uniclubid || "",
            imageUrl: finalImageUrl || oldEmp.imageUrl || "",
            permissions: mergedPerms,
            committeeScope: scope,
            subgroupId: sgId,
            subgroupName: sgName,
            password: oldEmp.password || userSnap.data()?.password || "",
            committeeRoles: {
              ...(oldEmp.committeeRoles || {}),
              [`${emp?.uniclubid || ""}:${scope}:${sgId || "all"}`]: {
                uniclubid: emp?.uniclubid || "",
                uniclub: emp?.uniclub || "",
                committeeScope: scope,
                subgroupId: sgId,
                subgroupName: sgName,
                permissions: mergedPerms,
                updatedAt: serverTimestamp(),
              },
            },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        toast.success("Committee updated successfully");

        await getList();
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        return;
      }

      // ---------------- CREATE MODE ----------------

      // ✅ Rule 1: block SAME email + SAME scope (+ subgroupId if subgroup) for SAME uniclub
      let qSame = null;
      if (scope === "subgroup") {
        qSame = query(
          collection(db, "employees"),
          where("email", "==", emailLower),
          where("role", "==", "student"),
          where("uniclubid", "==", emp?.uniclubid || ""),
          where("committeeScope", "==", "subgroup"),
          where("subgroupId", "==", sgId),
          limit(1)
        );
      } else {
        qSame = query(
          collection(db, "employees"),
          where("email", "==", emailLower),
          where("role", "==", "student"),
          where("uniclubid", "==", emp?.uniclubid || ""),
          where("committeeScope", "==", "uniclub"),
          limit(1)
        );
      }
      const sameSnap = await getDocs(qSame);
      if (!sameSnap.empty) {
        toast.warn("This email is already assigned to this committee/subgroup.");
        return;
      }

      // ✅ Rule 2A: if email already exists in USERS => reuse UID (NO auth create)
      const existingUser = await findUserByEmail(emailLower);
      if (existingUser?.uid) {
        await assignCommitteeToUid({
          targetUid: existingUser.uid,
          emailLower,
          finalImageUrl,
          passwordFallback: existingUser.data?.password || password,
        });

        toast.success("Existing user found — committee assigned/updated!");

        await getList();
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        return;
      }

      // ✅ Rule 2B: if no user doc, but employee exists by email => reuse employee UID
      const existingEmp = await findEmployeeByEmail(emailLower);
      if (existingEmp?.uid) {
        await assignCommitteeToUid({
          targetUid: existingEmp.uid,
          emailLower,
          finalImageUrl,
          passwordFallback: existingEmp.data?.password || password,
        });

        toast.success("Existing employee found — committee assigned/updated!");

        await getList();
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        return;
      }

      // ✅ Rule 3: Create Auth + users + employees
      tempApp = initializeApp(firebaseConfig, "userCreator");
      const tempAuth = getAuth(tempApp);

      try {
        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          emailLower,
          password
        );
        const createdUser = userCredential.user;

        await updateProfile(createdUser, {
          displayName: form.firstname,
          ...(finalImageUrl ? { photoURL: finalImageUrl } : {}),
        });

        // users
        await setDoc(doc(db, "users", createdUser.uid), {
          firstname: form.firstname,
          lastname: form.lastname || "",
          username: form.firstname,
          email: emailLower,
          universityid: emp?.universityId || "",
          university: emp?.university || "",
          livingtype: "university",
          createdby: uid,
          createddate: new Date(),
          imageUrl: finalImageUrl || "",
          password,
          uid: createdUser.uid,
          mobileNo: form.mobileNo || "",
          address: form.address || "",
          studentid: form.studentid || "",

          uniclub: emp?.uniclub || "",
          uniclubid: emp?.uniclubid || "",

          committeeScope: scope,
          subgroupId: sgId,
          subgroupName: sgName,

          roles: { student: true, committee: true },
        });

        // employees
        await setDoc(doc(db, "employees", createdUser.uid), {
          name: form.firstname,
          email: emailLower,
          mobileNo: form.mobileNo || "",
          address: form.address || "",
          designation: "",
          department: "",
          role: "student",
          isActive: true,
          hostelid: "",
          uid, // creator
          password,
          type: "admin",
          universityid: emp?.universityId || "",
          university: emp?.university || "",
          uniclub: emp?.uniclub || "",
          uniclubid: emp?.uniclubid || "",
          createdby: uid,
          createddate: new Date(),
          imageUrl: finalImageUrl || "",
          permissions: Array.isArray(form.permissions) ? form.permissions : [],
          committeeScope: scope,
          subgroupId: sgId,
          subgroupName: sgName,
          committeeRoles: {
            [`${emp?.uniclubid || ""}:${scope}:${sgId || "all"}`]: {
              uniclubid: emp?.uniclubid || "",
              uniclub: emp?.uniclub || "",
              committeeScope: scope,
              subgroupId: sgId,
              subgroupName: sgName,
              permissions: Array.isArray(form.permissions) ? form.permissions : [],
              createdAt: serverTimestamp(),
            },
          },
          createdAt: serverTimestamp(),
        });

        toast.success("Committee created successfully");
      } catch (err) {
        // ✅ IMPORTANT: if auth already exists, attempt fallback assignment via users/employees
        if (err?.code === "auth/email-already-in-use") {
          const fallbackUser = await findUserByEmail(emailLower);
          if (fallbackUser?.uid) {
            await assignCommitteeToUid({
              targetUid: fallbackUser.uid,
              emailLower,
              finalImageUrl,
              passwordFallback: fallbackUser.data?.password || password,
            });

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

          const fallbackEmp = await findEmployeeByEmail(emailLower);
          if (fallbackEmp?.uid) {
            await assignCommitteeToUid({
              targetUid: fallbackEmp.uid,
              emailLower,
              finalImageUrl,
              passwordFallback: fallbackEmp.data?.password || password,
            });

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
            "Auth email exists but user record not found. Create users doc manually or use Admin SDK to map email → uid."
          );
          return;
        }

        throw err;
      }

      // reset after successful create
      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Failed to save user");
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
      const targetUid = deleteData.id;
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/deleteUserByUid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: targetUid }),
        }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error?.message || "Failed to delete user auth");

      if (data.success) {
        await deleteDoc(doc(db, "users", targetUid));
        await deleteDoc(doc(db, "employees", targetUid));
        toast.success("Successfully deleted!");
        await getList();
      }
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Failed to delete user");
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
        <h1 className="text-2xl font-semibold">Committee</h1>
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
                  Student ID
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Password
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
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.firstname}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.email}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.studentid}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.password}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item?.imageUrl ? (
                        <img src={item.imageUrl} width={80} height={80} alt="student" />
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={async () => {
                          setEditing(item);

                          let empPerms = [];
                          let scope = "uniclub";
                          let subgroupId = "";
                          let subgroupName = "";

                          try {
                            const empSnap = await getDoc(doc(db, "employees", item.id));
                            if (empSnap.exists()) {
                              const ed = empSnap.data() || {};
                              empPerms = normalizePermissions(ed.permissions);
                              scope = ed.committeeScope || "uniclub";
                              subgroupId = ed.subgroupId || "";
                              subgroupName = ed.subgroupName || "";
                            }
                          } catch (e) {
                            console.error("load employee permissions error:", e);
                          }

                          setForm({
                            ...initialForm,
                            ...item,
                            image: null,
                            imageUrl: item.imageUrl || "",
                            id: item.id,
                            permissions: empPerms.length
                              ? empPerms
                              : normalizePermissions(item.permissions),
                            committeeScope: scope,
                            subgroupId,
                            subgroupName,
                          });

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

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Update Committee" : "Create Committee"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="firstname"
                placeholder="Name"
                value={form.firstname}
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
              />

              <textarea
                name="address"
                placeholder="Address"
                value={form.address}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
              />

              <input
                name="studentid"
                placeholder="Student ID"
                value={form.studentid}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              {/* Committee scope */}
              <div className="border rounded-lg p-3 bg-gray-50">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Committee for
                </p>

                <div className="flex gap-6">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="committeeScope"
                      checked={form.committeeScope === "uniclub"}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          committeeScope: "uniclub",
                          subgroupId: "",
                          subgroupName: "",
                        }))
                      }
                    />
                    Uniclub
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="committeeScope"
                      checked={form.committeeScope === "subgroup"}
                      onChange={() =>
                        setForm((p) => ({
                          ...p,
                          committeeScope: "subgroup",
                        }))
                      }
                    />
                    Subgroup
                  </label>
                </div>

                {form.committeeScope === "subgroup" && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Select Subgroup
                    </label>
                    <select
                      className="w-full border border-gray-300 p-2 rounded"
                      value={form.subgroupId}
                      onChange={(e) => {
                        const id = e.target.value;
                        const sg = subgroups.find((x) => x.id === id);
                        setForm((p) => ({
                          ...p,
                          subgroupId: id,
                          subgroupName: sg?.name || "",
                        }));
                      }}
                      required
                    >
                      <option value="">Select</option>
                      {subgroups.map((sg) => (
                        <option key={sg.id} value={sg.id}>
                          {sg.name}
                        </option>
                      ))}
                    </select>

                    {!subgroups.length && (
                      <p className="text-xs text-gray-500 mt-1">
                        No subgroups found for this uniclub.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Permissions */}
              <fieldset className="mt-3">
                <legend className="font-medium mb-2">Permissions</legend>

                <div className="mb-2">
                  <label className="flex items-center gap-2 text-sm">
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

                <div className="flex flex-wrap gap-3">
                  {visibleMenuOptions.length === 0 && (
                    <p className="text-xs text-gray-500">No permissions available.</p>
                  )}

                  {visibleMenuOptions.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded border border-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={(form.permissions || []).includes(key)}
                        onChange={(e) =>
                          handlePermissionToggle(key, e.target.checked)
                        }
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Image */}
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

              {form.imageUrl && (
                <img src={form.imageUrl} alt="Image Preview" width="150" />
              )}

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
                  {editingData ? "Update" : "Create"}
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
              Delete Committee
            </h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.firstname}</strong>?
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
