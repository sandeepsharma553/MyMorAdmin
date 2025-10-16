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
} from "firebase/firestore";
import {
  ref as dbRef,
  onValue,
  set as rtdbSet,
  push,
  update as rtdbUpdate,
  remove,
  off,
  serverTimestamp,
  get as rtdbGet,
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
  const [hostels, setHostels] = useState([]);
  const [selectedUniversityId, setSelectedUniversityId] = useState("");
  const [selectedHostel, setSelectedHostel] = useState("");
  const [hostelFeatures, setHostelFeatures] = useState({});
  const [allowedMenuKeys, setAllowedMenuKeys] = useState([]);
  const [uniclubs, setUniclub] = useState([]);
  const[selectuniclubid,setSelectUniclubid]=useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("No file chosen");

  const uid = useSelector((state) => state.auth.user.uid);
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
  };

  const [form, setForm] = useState(initialForm);

  /* -------------------- Constants -------------------- */
  const pageSize = 10;

  const MENU_OPTIONS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "uniclubannouncement", label: "Announcement" },
    { key: "uniclubevent", label: "Event" },
    { key: "uniclubeventbooking", label: "Event Booking" },
    { key: "setting", label: "Setting" },
    { key: "uniclub", label: "UniClub" },
    { key: "uniclubstudent", label: "UniclubStudent" },
    { key: "uniclubsubgroup", label: "UniclubSubgroup" },
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
    uniclubannouncement: "uniclubannouncement",
    uniclubevent: "uniclubevent",
    uniclubeventbooking: "uniclubeventbooking",
    uniclubsubgroup: "uniclubsubgroup",
  };

  const LABEL_BY_KEY = useMemo(
    () => Object.fromEntries(MENU_OPTIONS.map(({ key, label }) => [key, label])),
    []
  );

  /* -------------------- Derived -------------------- */
  const filteredData = useMemo(
    () =>
      list.filter(
        (item) =>
          item.name?.toLowerCase?.().includes(searchTerm.toLowerCase()) ||
          item.email?.toLowerCase?.().includes(searchTerm.toLowerCase())
      ),
    [list, searchTerm]
  );

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(
    () => filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredData, currentPage]
  );

  const filteredHostels = useMemo(() => {
    if (!selectedUniversityId) return [];
    return hostels.filter((h) => {
      const one = h.universityId === selectedUniversityId;
      const many = Array.isArray(h.uniIds) && h.uniIds.includes(selectedUniversityId);
      return (one || many) && h.active !== false;
    });
  }, [hostels, selectedUniversityId]);

  /* -------------------- Effects -------------------- */
  useEffect(() => {
    getList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (modalOpen && form.countryName) {
      fetchUniversitiesByCountry(form.countryName);
    }
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // (Safety) When opening modal to edit, ensure uniclubs loaded for that university
  useEffect(() => {
    if (!modalOpen || !editingData) return;
    const uniId = editingData.universityId || selectedUniversityId;
    if (uniId) getClub(uniId);
  }, [modalOpen, editingData, selectedUniversityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-bind uniclub selection after uniclubs list arrives
  useEffect(() => {
    if (!modalOpen || !editingData) return;
    if (!uniclubs.length) return;
    setForm((prev) => {
      if (prev.uniclubid && uniclubs.some((u) => u.id === prev.uniclubid)) return prev;
      const found = uniclubs.find((u) => u.id === (editingData.uniclubid || ""));
      if (found) return { ...prev, uniclubid: found.id, uniclub: found.name };
      return prev;
    });
  }, [modalOpen, editingData, uniclubs]);

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
      console.log("Fetched employees:", superAdmins);
      setList(superAdmins);

      const [uniSnap, hostelSnap] = await Promise.all([
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
    const ref = rtdbQuery(dbRef(database, "uniclubs"), orderByChild("universityid"), equalTo(uniId));
    const handler = async (snap) => {
      const val = snap.val();
      const arr = val ? Object.entries(val).map(([id, v]) => ({ id, name: v.title })) : [];
      setUniclub(arr);
      setIsLoading(false);
    };
    onValue(ref, handler, { onlyOnce: false });
    return () => off(ref, "value", handler);
  };

  /* -------------------- Helpers -------------------- */
  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const isHostelInactive = (hid) => hostels.find((h) => h.id === hid)?.active === false;

  const handleUniChange = (e) => {
    const selectedId = e.target.value;
    setSelectedUniversityId(selectedId);

    const uni = universities.find((h) => h.id === selectedId);
    const features = uni?.features || {};
    setHostelFeatures(features);
    const allowedKeys = [
      "dashboard",
      "setting",
      ...Object.entries(features)
        .filter(([, enabled]) => enabled)
        .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
        .filter(Boolean),
    ];
    setAllowedMenuKeys(allowedKeys);
    setForm((prev) => ({ ...prev, permissions: [] }));
    getClub(selectedId);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!isEmailValid(form.email)) {
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

      // Upload image if selected
      let imageUrl = form.imageUrl || "";
      const isNewImage = form.image instanceof File;
      if (isNewImage) {
        const sref = ref(storage, `employee_image/${form.image.name}`);
        await uploadBytes(sref, form.image);
        imageUrl = await getDownloadURL(sref);
      }

      // Build payload
      const password = `${form.name?.trim?.() || "User"}321`;
      const baseData = {
        name: form.name?.trim() || "",
        email: (form.email || "").toLowerCase(),
        mobileNo: form.mobileNo || "",
        address: form.address || "",
        universityId: form.universityId || "",
        university: form.university || "",
        role: "admin",
        type: "admin",
        isActive: !!form.isActive,
        domain: form.domain || "",
        permissions: Array.isArray(form.permissions) ? form.permissions : [],
        empType: "uniclub",
        countryCode: form.countryCode || "",
        countryName: form.countryName || "",
        stateCode: form.stateCode || "",
        stateName: form.stateName || "",
        cityName: form.cityName || "",
        lat: typeof form.lat === "number" ? form.lat : null,
        lng: typeof form.lng === "number" ? form.lng : null,
        uid,
        ...(imageUrl && { imageUrl }),
        // Uniclub binding
        uniclubid: form.uniclubid || "",
        uniclub: form.uniclub || "",
      };

      // temp app for auth user creation
      const tempApp = initializeApp(firebaseConfig, "employeeCreator");
      const tempAuth = getAuth(tempApp);

      if (editingData) {
        // UPDATE
        const docRef = doc(db, "employees", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("Employee does not exist! Cannot update.");
          try {
            await deleteApp(tempApp);
          } catch {}
          return;
        }

        await updateDoc(docRef, baseData);
        toast.success("Employee updated successfully");
      } else {
        const uniRef = doc(db, "university", form.universityId);
        const uniSnap = await getDoc(uniRef);
        if (!uniSnap.exists()) {
          toast.warn("University not found.");
          try {
            await deleteApp(tempApp);
          } catch {}
          return;
        }
        const uniData = uniSnap.data();
        if (uniData.adminUID) {
          toast.warn("This university already has an assigned admin.");
          try {
            await deleteApp(tempApp);
          } catch {}
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          baseData.email,
          password
        );
        const user = userCredential.user;
        await updateProfile(user, { displayName: baseData.name, photoURL: imageUrl || undefined });

        const employeeRef = doc(db, "employees", user.uid);
        await setDoc(employeeRef, { ...baseData, password });

        await updateDoc(doc(db, "university", form.universityId), { adminUID: user.uid });
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          firstname: baseData.name,
          lastname: "",
          username: baseData.name,
          email: baseData.email,
          hostelid: "",
          hostel: "",
          universityid: form.universityId || "",
          university: form.university || "",
          livingtype: "hostel",
          createdby: user.uid,
          createddate: new Date(),
        });

        toast.success("Employee created successfully");
      }

      try {
        await deleteApp(tempApp);
      } catch {}

      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
      setSelectedUniversityId("");
      setSelectUniclubid("");
      setSelectedHostel("");
      setAllowedMenuKeys([]);
      setHostelFeatures({});
      setUniclub([]);
    } catch (error) {
      if (error?.code === "auth/email-already-in-use") {
        toast.error("This email is already in use.");
      } else {
        console.error("Error saving data:", error);
        toast.error("Failed to save employee.");
      }
    }
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

  const handleDisable = async () => {
    if (!deleteData) return;
    try {
      const uidToDisable = form.id;
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/disableUserByUid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: uidToDisable }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to disable user");

      await updateDoc(doc(db, "employees", form.id), { status: "disabled", isActive: false });

      if (form.universityId) {
        await updateDoc(doc(db, "university", form.universityId), { adminUID: null });
      }

      toast.success("Account disabled successfully!");
      await getList();
    } catch (error) {
      console.error("Error disabling user:", error);
      toast.error("Error disabling account");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const handleEnable = async () => {
    try {
      const uidToEnable = form.id;
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/enableUserByUid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid: uidToEnable }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to enable user");

      await updateDoc(doc(db, "employees", form.id), { status: "active", isActive: true });

      if (form.universityId) {
        await updateDoc(doc(db, "university", form.universityId), { adminUID: form.id });
      }

      toast.success("Account enabled successfully!");
      await getList();
    } catch (error) {
      console.error("Error enabling user:", error);
      toast.error("Error enabling account");
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
            setSelectUniclubid("");
            setSelectedHostel("");
            setAllowedMenuKeys([]);
            setHostelFeatures({});
            setUniclub([]);
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      {/* Search */}
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
                        disabled={isHostelInactive(item.hostelid)}
                        className={`text-blue-600 hover:underline mr-3 ${
                          isHostelInactive(item.hostelid) ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                        onClick={() => {
                          setEditing(item);
                          const uniIdForClubs = item.universityId || uniIdFromHostel || "";
                         
                          const selectedHostelId = item.hostelid;
                          const selectedHostelObj = hostels.find((h) => h.id === selectedHostelId);
                          const uniIdFromHostel =
                            item.universityId ||
                            selectedHostelObj?.universityId ||
                            (Array.isArray(selectedHostelObj?.uniIds) ? selectedHostelObj.uniIds[0] : "");
                            setSelectUniclubid(item.uniclubid||"");
                          setSelectedUniversityId(uniIdFromHostel || "");
                          setSelectedHostel(selectedHostelId);

                          const features = selectedHostelObj?.features || {};
                          const allowedKeys = [
                            "dashboard",
                            "setting",
                            ...Object.entries(features)
                              .filter(([, enabled]) => enabled)
                              .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
                              .filter(Boolean),
                          ];
                          setHostelFeatures(features);
                          setAllowedMenuKeys(allowedKeys);

                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            universityId: item.universityId || uniIdFromHostel || "",
                            university: item.university || "",
                            hostelid: selectedHostelId,
                            hostel: selectedHostelObj?.name || item.hostel || "",
                            permissions: item.permissions?.length ? item.permissions : [],
                            image: null,
                            // ensure uniclub fields are set for edit
                            uniclubid: item.uniclubid || "",
                            uniclub: item.uniclub || "",
                          }));

                          // Load uniclubs for whichever university we resolved
                         

                          // make sure universities for this country are loaded,
                          // then bind university name if needed
                          if (item.countryName) {
                            fetchUniversitiesByCountry(item.countryName).then(() => {
                              if (item.university || !uniIdFromHostel) return;
                              const u = universities.find((x) => x.id === uniIdFromHostel);
                              if (u) setForm((p) => ({ ...p, university: u.name }));
                            });
                          }
                          if (uniIdForClubs) getClub(uniIdForClubs);
                          setModalOpen(true);
                        }}
                      >
                        Edit
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
                disabled={!!editingData}
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
                  setForm((prev) => {
                    const same =
                      prev.countryCode === next.countryCode &&
                      prev.countryName === next.countryName &&
                      prev.stateCode === next.stateCode &&
                      prev.stateName === next.stateName &&
                      prev.cityName === next.cityName &&
                      prev.lat === next.lat &&
                      prev.lng === next.lng;
                    return same
                      ? prev
                      : {
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
                        };
                  });
                  setSelectedUniversityId("");
                  setSelectedHostel("");
                  setAllowedMenuKeys([]);
                  setHostelFeatures({});
                  setUniclub([]);
                  fetchUniversitiesByCountry(loc?.country?.name || "");
                  setSelectUniclubid("");
                }}
              />

              {/* University */}
              <select
                value={selectedUniversityId}
                onChange={(e) => {
                  const uniId = e.target.value;
                  const uniName = universities.find((u) => u.id === uniId)?.name || "";
                  setSelectedUniversityId(uniId);
                  setForm((prev) => ({
                    ...prev,
                    universityId: uniId,
                    university: uniName,
                    hostelid: "",
                    hostel: "",
                    uniclubid: "",
                    uniclub: "",
                  }));
                  setSelectedHostel("");
                  setAllowedMenuKeys([]);
                  setHostelFeatures({});
                  setUniclub([]);
                  handleUniChange(e);
                  setSelectUniclubid("");
                }}
                className="w-full border border-gray-300 p-2 rounded"
                required
                disabled={!universities.length}
              >
                <option value="">
                  {universities.length ? "Select University" : "Select University"}
                </option>
                {universities.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>

              {/* Uniclub (bound by university) */}
              <select
                value={selectuniclubid}
                onChange={(e) => {
                  const id = e.target.value;
                  const name = uniclubs.find((u) => u.id === id)?.name || "";
                  setSelectUniclubid(id)
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

              <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                <label className="cursor-pointer">
                  <input type="file" name="image" accept="image/*" className="hidden" onChange={handleChange} />
                  📁 Choose File
                </label>
                <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
              </div>
              {form.imageUrl ? <img src={form.imageUrl} alt="Image Preview" width="150" /> : null}

              <Select
                className="w-full border border-gray-300 p-2 rounded"
                multiple
                displayEmpty
                value={form.permissions}
                onChange={(e) => setForm((prev) => ({ ...prev, permissions: e.target.value }))}
                renderValue={(selected) =>
                  selected.length ? selected.map((k) => LABEL_BY_KEY[k]).join(", ") : "Select Permissions"
                }
              >
                {MENU_OPTIONS.filter(({ key }) => allowedMenuKeys.includes(key)).map(({ key, label }) => (
                  <MenuItem key={key} value={key}>
                    <Checkbox checked={form.permissions.includes(key)} />
                    <ListItemText primary={label} />
                  </MenuItem>
                ))}
              </Select>

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

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                    setFileName("No file chosen");
                    setSelectedUniversityId("");
                    setSelectedHostel("");
                    setAllowedMenuKeys([]);
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

      {/* Disable confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Disable Account</h2>
            <p className="mb-4">
              Are you sure you want to disable <strong>{deleteData?.name}</strong>?
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
              <button onClick={handleDisable} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Disable
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
