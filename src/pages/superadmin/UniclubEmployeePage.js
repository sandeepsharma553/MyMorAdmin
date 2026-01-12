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
} from "firebase/firestore";
import {
  ref as dbRef,
  onValue,
  off,
  orderByChild,
  equalTo,
  query as rtdbQuery,
} from "firebase/database";
import { db, storage, firebaseConfig, database } from "../../firebase";
import { initializeApp, deleteApp } from "firebase/app";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useSelector } from "react-redux";
import LocationPicker from "./LocationPicker";

export default function UniclubEmployeePage(props) {
  const { navbarHeight } = props;

  /* -------------------- State -------------------- */
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [filterUniversity, setFilterUniversity] = useState([]);
  const [filterUniversityId, setFiletrUniversityId] = useState("");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [hostels, setHostels] = useState([]); // kept for delete logic, even if not shown
  const [selectedUniversityId, setSelectedUniversityId] = useState("");
  const [hostelFeatures, setHostelFeatures] = useState({});
  const [allowedMenuKeys, setAllowedMenuKeys] = useState(["dashboard", "setting", "contact"]);
  const [uniclubs, setUniclub] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("No file chosen");

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const initialForm = {
    id: 0,
    name: "",
    email: "",
    mobileNo: "",
    address: "",
    universityId: "",
    university: "",
    hostelid: "",
    hostel: "",
    role: "admin",
    type: "admin",
    isActive: true,
    domain: "",
    permissions: [],
    countryCode: "",
    countryName: "",
    stateCode: "",
    stateName: "",
    cityName: "",
    lat: null,
    lng: null,
    image: null,
    imageUrl: "",
    password: "",
    uniclubid: "",
    uniclub: "",
    empType: "uniclub",
    originalEmail: "",
  };

  const [form, setForm] = useState(initialForm);

  /* -------------------- Constants -------------------- */
  const pageSize = 10;

  const MENU_OPTIONS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "uniclubannouncement", label: "Announcement" },
    { key: "uniclubevent", label: "Event" },
    { key: "uniclubeventbooking", label: "Event Booking" },
    { key: "uniclubcommunity", label: "Community" },
    { key: "setting", label: "Setting" },
    { key: "uniclub", label: "UniClub" },
    { key: "uniclubstudent", label: "UniclubStudent" },
    { key: "uniclubmember", label: "UniclubMember" },
    { key: "uniclubsubgroup", label: "UniclubSubgroup" },
    { key: "contact", label: "Contact" },
  ];

  const FEATURE_TO_MENU_KEY = {
    events: "event",
    eventbooking: "eventbooking",
    deals: "deal",
    announcement: "announcement",
    hostelevent: "event",
    diningmenu: "diningmenu",
    cleaningschedule: "cleaningschedule",
    tutorialschedule: "tutorialschedule",
    maintenance: "maintenance",
    bookingroom: "bookingroom",
    academicgroup: "academicgroup",
    reportincedent: "reportincident",
    feedback: "feedback",
    wellbeing: "wellbeing",
    faqs: "faq",
    resource: "resources",
    employee: "employee",
    student: "student",
    uniclub: "uniclub",
    uniclubstudent: "uniclubstudent",
    uniclubmember: "uniclubmember",
    uniclubannouncement: "uniclubannouncement",
    uniclubcommunity: "uniclubcommunity",
    uniclubevent: "uniclubevent",
    uniclubeventbooking: "uniclubeventbooking",
    uniclubsubgroup: "uniclubsubgroup",
  };

  /* -------------------- ✅ Helpers (same logic) -------------------- */
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
    const sref = ref(storage, `employee_image/${Date.now()}_${imageFile.name}`);
    await uploadBytes(sref, imageFile);
    return await getDownloadURL(sref);
  };

  const findUserByEmail = async (emailLower) => {
    const qy = query(collection(db, "users"), where("email", "==", emailLower), limit(1));
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, data: d.data() || {} };
  };

  const findEmployeeByEmail = async (emailLower) => {
    const qy = query(collection(db, "employees"), where("email", "==", emailLower), limit(1));
    const snap = await getDocs(qy);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, data: d.data() || {} };
  };

  /* -------------------- Derived -------------------- */
  const filteredData = useMemo(() => {
    const term = (searchTerm || "").toLowerCase().trim();
    return list.filter((item) => {
      const uniOk = !filterUniversityId ? true : item.universityId === filterUniversityId;
      const searchOk = !term
        ? true
        : item.name?.toLowerCase?.().includes(term) || item.email?.toLowerCase?.().includes(term);
      return uniOk && searchOk;
    });
  }, [list, searchTerm, filterUniversityId]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(
    () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredData, currentPage]
  );

  const visibleMenuOptions = useMemo(
    () => MENU_OPTIONS.filter(({ key }) => allowedMenuKeys.includes(key)),
    [allowedMenuKeys]
  );

  const allPermissionsSelected = useMemo(() => {
    if (!visibleMenuOptions.length) return false;
    return visibleMenuOptions.every(({ key }) => (form.permissions || []).includes(key));
  }, [visibleMenuOptions, form.permissions]);

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    getList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (modalOpen && form.countryName) {
      fetchUniversitiesByCountry(form.countryName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  useEffect(() => {
    if (!modalOpen || !editingData) return;
    const uniId = editingData.universityId || selectedUniversityId || form.universityId;
    if (uniId) getClub(uniId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, editingData, selectedUniversityId, form.universityId]);

  useEffect(() => {
    const uni = universities.find((u) => u.id === form.universityId);
    const features = uni?.features || {};
    setHostelFeatures(features);

    const featureKeys = Object.entries(features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
      .filter(Boolean);

    const all = new Set([
      "dashboard",
      "setting",
      "contact",
      ...featureKeys,
      ...(form.permissions || []),
    ]);

    setAllowedMenuKeys(Array.from(all));
  }, [universities, form.universityId, form.permissions]);

  useEffect(() => {
    const fetchUniversities = async () => {
      if (!emp?.uid) return;
      setIsLoading(true);
      try {
        const qy = query(collection(db, "university"), where("uid", "==", emp.uid));
        const qs = await getDocs(qy);
        const uniArr = qs.docs.map((d) => ({
          id: d.id,
          name: d.data().name,
          countryName: d.data().countryName || "",
        }));
        if (mountedRef.current) setFilterUniversity(uniArr);
      } catch (err) {
        console.error("fetchUniversities error:", err);
        toast.error("Failed to load universities");
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };
    fetchUniversities();
  }, [emp?.uid]);

  /* -------------------- Data Fetch -------------------- */
  const getList = async () => {
    setIsLoading(true);
    try {
      const qEmp = query(
        collection(db, "employees"),
        where("type", "==", "admin"),
        where("uid", "==", uid),
        where("empType", "==", "uniclub")
      );
      const empSnap = await getDocs(qEmp);
      const superAdmins = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setList(superAdmins);

      const [, hostelSnap] = await Promise.all([
        getDocs(collection(db, "university")),
        getDocs(collection(db, "hostel")),
      ]);

      const hostelArr = hostelSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name,
          universityId: data.universityId || null,
          uniIds: Array.isArray(data.uniIds) ? data.uniIds : [],
          location: data.location,
          features: data.features || {},
          active: data.active !== false,
        };
      });

      setHostels(hostelArr);
    } catch (err) {
      console.error("getList error:", err);
      toast.error("Failed to load employees/hostels");
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUniversitiesByCountry = async (countryName) => {
    if (!countryName) {
      setUniversities([]);
      return;
    }
    setIsLoading(true);
    try {
      const qy = query(collection(db, "university"), where("countryName", "==", countryName));
      const uniSnap = await getDocs(qy);
      const uniArr = uniSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        features: d.data().features || {},
      }));
      if (mountedRef.current) setUniversities(uniArr);
    } catch (err) {
      console.error("fetchUniversitiesByCountry error:", err);
      toast.error("Failed to load universities");
      if (mountedRef.current) setUniversities([]);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const getClub = (uniId) => {
    setIsLoading(true);
    const refQ = rtdbQuery(dbRef(database, "uniclubs"), orderByChild("universityid"), equalTo(uniId));
    const handler = (snap) => {
      const val = snap.val();
      const arr = val ? Object.entries(val).map(([id, v]) => ({ id, name: v.title })) : [];
      setUniclub(arr);
      setIsLoading(false);
    };
    onValue(refQ, handler, { onlyOnce: false });
    return () => off(refQ, "value", handler);
  };

  /* -------------------- Helpers -------------------- */
  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const handleUniChange = (e) => {
    const selectedId = e.target.value;
    setSelectedUniversityId(selectedId);

    const uni = universities.find((u) => u.id === selectedId);
    const uniName = uni?.name || "";

    setForm((prev) => ({
      ...prev,
      universityId: selectedId,
      university: uniName,
      uniclubid: "",
      uniclub: "",
      permissions: [],
    }));

    setUniclub([]);
    if (selectedId) getClub(selectedId);
  };

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

  /* -------------------- Handlers -------------------- */
  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === "file") {
      setForm((prev) => ({ ...prev, [name]: files?.[0] || null }));
      setFileName(files?.[0]?.name || "No file chosen");
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  /* -------------------- ✅ Updated handleSubmit (same smart logic) -------------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    const emailLower = (form.email || "").toLowerCase().trim();
    const password = `${(form.name?.trim?.() || "User")}321`;

    let tempApp = null;

    try {
      // ✅ validations
      if (!isEmailValid(emailLower)) {
        toast.error("Please enter a valid email address");
        return;
      }
      if (!form.universityId) {
        toast.error("Please select university");
        return;
      }
      if (!form.uniclubid) {
        toast.error("Please select uniclub");
        return;
      }

      // ✅ upload image if new
      let finalImageUrl = form.imageUrl || "";
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) finalImageUrl = uploadedUrl;

      // ✅ base payload
      const baseData = {
        name: form.name?.trim() || "",
        email: emailLower,
        mobileNo: form.mobileNo || "",
        address: form.address || "",
        universityId: form.universityId || "",
        university: form.university || "",
        role: "admin",
        type: "admin",
        isActive: !!form.isActive,
        domain: form.domain || "",
        permissions: normalizePermissions(form.permissions),
        empType: "uniclub",

        countryCode: form.countryCode || "",
        countryName: form.countryName || "",
        stateCode: form.stateCode || "",
        stateName: form.stateName || "",
        cityName: form.cityName || "",
        lat: typeof form.lat === "number" ? form.lat : null,
        lng: typeof form.lng === "number" ? form.lng : null,

        uid, // creator
        ...(finalImageUrl ? { imageUrl: finalImageUrl } : {}),

        uniclubid: form.uniclubid || "",
        uniclub: form.uniclub || "",
      };

      // ---------------- EDIT MODE ----------------
      if (editingData) {
        const empRef = doc(db, "employees", form.id);
        const empSnap = await getDoc(empRef);

        if (!empSnap.exists()) {
          toast.warning("Employee does not exist! Cannot update.");
          return;
        }

        const oldEmp = empSnap.data() || {};
        const mergedPerms = mergePermissions(oldEmp.permissions, baseData.permissions);

        const newEmail = baseData.email;
        const oldEmail = (form.originalEmail || editingData.email || "").toLowerCase().trim();

        // ✅ auth email update if changed
        if (newEmail && oldEmail && newEmail !== oldEmail) {
          try {
            const resp = await fetch(
              "https://us-central1-mymor-one.cloudfunctions.net/updateUserEmailByUid",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: form.id, newEmail }),
              }
            );
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || "Failed to update auth email");
          } catch (err) {
            console.error("updateUserEmailByUid error:", err);
            toast.error("Could not update login email. Please try again.");
            return;
          }

          // ✅ update users email (best-effort)
          try {
            await updateDoc(doc(db, "users", form.id), { email: newEmail });
          } catch (err) {
            console.error("Update users email error:", err);
          }
        }

        await updateDoc(empRef, {
          ...baseData,
          permissions: mergedPerms,
          password: oldEmp.password || "", // keep old password
          updateddate: new Date(),
        });

        toast.success("Employee updated successfully");

        await getList();
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        setSelectedUniversityId("");
        setAllowedMenuKeys(["dashboard", "setting", "contact"]);
        setHostelFeatures({});
        setUniclub([]);
        return;
      }

      // ---------------- CREATE MODE ----------------

      // ✅ Rule 0: this uniclub already has an admin
      const dupClubQ = query(
        collection(db, "employees"),
        where("uniclubid", "==", form.uniclubid || ""),
        where("empType", "==", "uniclub"),
        where("type", "==", "admin"),
        limit(1)
      );
      const dupClubSnap = await getDocs(dupClubQ);
      if (!dupClubSnap.empty) {
        toast.warn("This UniClub already has an assigned admin.");
        return;
      }

      // ✅ Rule 1: block SAME email + SAME uniclub
      const qSame = query(
        collection(db, "employees"),
        where("email", "==", emailLower),
        where("empType", "==", "uniclub"),
        where("uniclubid", "==", form.uniclubid || ""),
        limit(1)
      );
      const sameSnap = await getDocs(qSame);
      if (!sameSnap.empty) {
        toast.warn("This email is already assigned to this UniClub.");
        return;
      }

      // ✅ Rule 2: if email exists in USERS => use that UID (NO auth create)
      const existingUser = await findUserByEmail(emailLower);
      if (existingUser?.uid) {
        const existingUid = existingUser.uid;
        const u = existingUser.data || {};

        let existingEmpPerms = [];
        let existingEmpPassword = u.password || password;

        try {
          const empSnap = await getDoc(doc(db, "employees", existingUid));
          if (empSnap.exists()) {
            const ed = empSnap.data() || {};
            existingEmpPerms = normalizePermissions(ed.permissions);
            existingEmpPassword = ed.password || existingEmpPassword;
          }
        } catch {}

        const mergedPerms = mergePermissions(existingEmpPerms, baseData.permissions);

        // users upsert
        await setDoc(
          doc(db, "users", existingUid),
          {
            uid: existingUid,
            firstname: baseData.name,
            lastname: u.lastname || "",
            username: baseData.name,
            email: emailLower,
            universityid: baseData.universityId,
            university: baseData.university,
            livingtype: "university",
            imageUrl: finalImageUrl || u.imageUrl || "",
            password: u.password || password,
            createdby: u.createdby || uid,
            createddate: u.createddate || new Date(),
            updateddate: new Date(),
          },
          { merge: true }
        );

        // employees upsert
        await setDoc(
          doc(db, "employees", existingUid),
          {
            ...baseData,
            permissions: mergedPerms,
            password: existingEmpPassword,
            createdby: uid,
            createddate: u.createddate || new Date(),
            updateddate: new Date(),
          },
          { merge: true }
        );

        toast.success("Existing email found — UniClub admin assigned/updated!");

        await getList();
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName("No file chosen");
        setSelectedUniversityId("");
        setAllowedMenuKeys(["dashboard", "setting", "contact"]);
        setHostelFeatures({});
        setUniclub([]);
        return;
      }

      // ✅ Rule 3: Create Auth + employees + users
      tempApp = initializeApp(firebaseConfig, "employeeCreator");
      const tempAuth = getAuth(tempApp);

      try {
        const userCredential = await createUserWithEmailAndPassword(tempAuth, emailLower, password);
        const createdUser = userCredential.user;

        await updateProfile(createdUser, {
          displayName: baseData.name,
          ...(finalImageUrl ? { photoURL: finalImageUrl } : {}),
        });

        // employees
        await setDoc(doc(db, "employees", createdUser.uid), {
          ...baseData,
          password,
          createddate: new Date(),
        });

        // users
        await setDoc(doc(db, "users", createdUser.uid), {
          uid: createdUser.uid,
          firstname: baseData.name,
          lastname: "",
          username: baseData.name,
          email: emailLower,
          hostelid: "",
          hostel: "",
          universityid: baseData.universityId,
          university: baseData.university,
          livingtype: "university",
          createdby: uid,
          createddate: new Date(),
          imageUrl: finalImageUrl || "",
          password,
        });

        toast.success("Employee created successfully");
      } catch (err) {
        // ✅ auth email exists => fallback to assigning by Firestore docs
        if (err?.code === "auth/email-already-in-use") {
          const empByEmail = await findEmployeeByEmail(emailLower);

          if (empByEmail?.uid) {
            const existingUid = empByEmail.uid;
            const oldEmp = empByEmail.data || {};
            const mergedPerms = mergePermissions(oldEmp.permissions, baseData.permissions);

            await setDoc(
              doc(db, "employees", existingUid),
              {
                ...oldEmp,
                ...baseData,
                permissions: mergedPerms,
                password: oldEmp.password || password,
                updateddate: new Date(),
              },
              { merge: true }
            );

            await setDoc(
              doc(db, "users", existingUid),
              {
                uid: existingUid,
                firstname: baseData.name,
                username: baseData.name,
                email: emailLower,
                universityid: baseData.universityId,
                university: baseData.university,
                livingtype: "university",
                updateddate: new Date(),
              },
              { merge: true }
            );

            toast.success("Email already exists — assigned successfully (no new auth created).");

            await getList();
            setModalOpen(false);
            setEditing(null);
            setForm(initialForm);
            setFileName("No file chosen");
            setSelectedUniversityId("");
            setAllowedMenuKeys(["dashboard", "setting", "contact"]);
            setHostelFeatures({});
            setUniclub([]);
            return;
          }

          toast.warn("Auth email exists but Firestore record not found. Please create user/employee doc manually.");
          return;
        }

        throw err;
      }
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

    // ✅ reset after successful create
    await getList();
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
    setSelectedUniversityId("");
    setAllowedMenuKeys(["dashboard", "setting", "contact"]);
    setHostelFeatures({});
    setUniclub([]);
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const uidToDelete = form.id;
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/deleteUserByUid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: uidToDelete }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "Failed to delete user");

      if (data.success) {
        if (form.hostelid) {
          await updateDoc(doc(db, "hostel", form.hostelid), { adminUID: null });
        }
        await deleteDoc(doc(db, "employees", form.id));
        toast.success("Successfully deleted!");
        await getList();
      }
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Failed to delete");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  /* -------------------- Render -------------------- */
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Uni Club Employee</h1>

        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setFileName("No file chosen");
            setSelectedUniversityId("");
            setAllowedMenuKeys(["dashboard", "setting", "contact"]);
            setHostelFeatures({});
            setUniclub([]);
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      {/* Search */}
      <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
        <select
          className="border border-gray-300 px-3 py-2 rounded-xl bg-white text-sm"
          value={filterUniversityId}
          onChange={(e) => {
            setFiletrUniversityId(e.target.value);
            setSelectedIds(new Set());
            setCurrentPage(1);
          }}
        >
          <option value="">
            {filterUniversity.length ? "Select University" : "Loading universities..."}
          </option>
          {filterUniversity.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

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

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Uniclub</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Mobile No</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Password</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Image</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="10" className="px-6 py-4 text-center text-gray-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.uniclub || "—"}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.mobileNo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.password}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {[item.cityName, item.stateName, item.countryName].filter(Boolean).join(", ") || "—"}
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
                      {item?.imageUrl ? <img src={item.imageUrl} width={80} height={80} alt="employee" /> : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          const savedPermissions = Array.isArray(item.permissions) ? item.permissions : [];
                          setEditing(item);

                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            permissions: savedPermissions,
                            image: null,
                            originalEmail: item.email || "", // ✅ IMPORTANT
                          }));

                          setSelectedUniversityId(item.universityId || "");
                          if (item.countryName) fetchUniversitiesByCountry(item.countryName);
                          if (item.universityId) getClub(item.universityId);

                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setForm(item);
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

      {/* Pager */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p>
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
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit Employee" : "Create Employee"}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Full Name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <input
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              {form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email || "").trim()) && (
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

              {/* Country → University */}
              <LocationPicker
                key={form.id || "new"}
                value={{
                  countryCode: form.countryCode || "",
                  stateCode: form.stateCode || "",
                  cityName: form.cityName || "",
                }}
                onChange={(loc) => {
                  const next = {
                    countryCode: loc.country?.code || "",
                    countryName: loc.country?.name || "",
                    stateCode: loc.state?.code || "",
                    stateName: loc.state?.name || "",
                    cityName: loc.city?.name || "",
                    lat: loc.coords?.lat ?? null,
                    lng: loc.coords?.lng ?? null,
                  };

                  setForm((prev) => ({
                    ...prev,
                    ...next,
                    universityId: "",
                    university: "",
                    hostelid: "",
                    hostel: "",
                    uniclubid: "",
                    uniclub: "",
                    domain: "",
                    permissions: [],
                  }));

                  setSelectedUniversityId("");
                  setAllowedMenuKeys(["dashboard", "setting", "contact"]);
                  setHostelFeatures({});
                  setUniclub([]);
                  fetchUniversitiesByCountry(loc?.country?.name || "");
                }}
              />

              {/* University */}
              <select
                value={form.universityId}
                onChange={handleUniChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
                disabled={!universities.length}
              >
                <option value="">{universities.length ? "Select University" : "Select University"}</option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              {/* Uniclub */}
              <select
                value={form.uniclubid}
                onChange={(e) => {
                  const id = e.target.value;
                  const name = uniclubs.find((u) => u.id === id)?.name || "";
                  setForm((prev) => ({ ...prev, uniclubid: id, uniclub: name }));
                }}
                className="w-full border border-gray-300 p-2 rounded"
                required
                disabled={!uniclubs.length}
              >
                <option value="">{uniclubs.length ? "Select Uniclub" : "Select Uniclub"}</option>
                {uniclubs.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              <textarea
                name="address"
                placeholder="Address"
                value={form.address}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <input
                name="domain"
                placeholder="Domain"
                value={form.domain}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              {/* Image */}
              <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                <label className="cursor-pointer">
                  <input type="file" name="image" accept="image/*" className="hidden" onChange={handleChange} />
                  📁 Choose File
                </label>
                <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
              </div>
              {form.imageUrl ? <img src={form.imageUrl} alt="Image Preview" width="150" /> : null}

              {/* Permissions */}
              <fieldset className="mt-3">
                <legend className="font-medium mb-2">Permissions</legend>

                <div className="mb-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={allPermissionsSelected}
                      onChange={(e) => handleSelectAllPermissions(e.target.checked)}
                    />
                    <span>{allPermissionsSelected ? "Unselect all permissions" : "Select all permissions"}</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-3">
                  {visibleMenuOptions.length === 0 && (
                    <p className="text-xs text-gray-500">No permissions available. Enable features first.</p>
                  )}

                  {visibleMenuOptions.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm bg-gray-50 px-2 py-1 rounded border border-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={(form.permissions || []).includes(key)}
                        onChange={(e) => handlePermissionToggle(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Status */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="text-sm font-medium">Status</span>
                <input
                  id="isActive"
                  type="checkbox"
                  name="isActive"
                  className="sr-only peer"
                  checked={form.isActive}
                  onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                />
                <div className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-green-500 transition-colors relative">
                  <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow transition-transform peer-checked:translate-x-5" />
                </div>
                <span className={`text-sm font-semibold ${form.isActive ? "text-green-600" : "text-red-500"}`}>
                  {form.isActive ? "Active" : "Inactive"}
                </span>
              </label>

              {/* Buttons */}
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                    setFileName("No file chosen");
                    setSelectedUniversityId("");
                    setAllowedMenuKeys(["dashboard", "setting", "contact"]);
                    setHostelFeatures({});
                    setUniclub([]);
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Account</h2>
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
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
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
