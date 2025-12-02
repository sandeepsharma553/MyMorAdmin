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
  const [hostels, setHostels] = useState([]); // still kept for delete logic, even if not shown
  const [selectedUniversityId, setSelectedUniversityId] = useState("");
  const [hostelFeatures, setHostelFeatures] = useState({});
  const [allowedMenuKeys, setAllowedMenuKeys] = useState(["dashboard", "setting", "contact"]);
  const [uniclubs, setUniclub] = useState([]);
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
    uniclubannouncement: "uniclubannouncement",
    uniclubevent: "uniclubevent",
    uniclubeventbooking: "uniclubeventbooking",
    uniclubsubgroup: "uniclubsubgroup",
  };

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

  // visible menu options driven by allowed keys
  const visibleMenuOptions = useMemo(
    () => MENU_OPTIONS.filter(({ key }) => allowedMenuKeys.includes(key)),
    [MENU_OPTIONS, allowedMenuKeys]
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
  }, [modalOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // (Safety) When opening modal to edit, ensure uniclubs loaded for that university
  useEffect(() => {
    if (!modalOpen || !editingData) return;
    const uniId = editingData.universityId || selectedUniversityId || form.universityId;
    if (uniId) getClub(uniId);
  }, [modalOpen, editingData, selectedUniversityId, form.universityId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When unis / universityId / permissions change → recompute allowedMenuKeys
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
    const handler = (snap) => {
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

    const uni = universities.find((u) => u.id === selectedId);
    const uniName = uni?.name || "";

    setForm((prev) => ({
      ...prev,
      universityId: selectedId,
      university: uniName,
      uniclubid: "",
      uniclub: "",
      permissions: [], // new uni → clear permissions
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
      if (checked) {
        visibleMenuOptions.forEach(({ key }) => current.add(key));
      } else {
        visibleMenuOptions.forEach(({ key }) => current.delete(key));
      }
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
        // 1) ensure university exists
        const uniRef = doc(db, "university", form.universityId);
        const uniSnap = await getDoc(uniRef);
        if (!uniSnap.exists()) {
          toast.warn("University not found.");
          try {
            await deleteApp(tempApp);
          } catch {}
          return;
        }

        // 2) Check if this UniClub already has an admin
        const dupQ = query(
          collection(db, "employees"),
          where("uniclubid", "==", form.uniclubid || ""),
          where("empType", "==", "uniclub"),
          where("type", "==", "admin")
        );
        const dupSnap = await getDocs(dupQ);

        if (!dupSnap.empty) {
          toast.warn("This UniClub already has an assigned admin.");
          try {
            await deleteApp(tempApp);
          } catch {}
          return;
        }

        // 3) Create auth user & employee doc
        const userCredential = await createUserWithEmailAndPassword(
          tempAuth,
          baseData.email,
          password
        );
        const user = userCredential.user;

        await updateProfile(user, {
          displayName: baseData.name,
          photoURL: imageUrl || undefined,
        });

        const employeeRef = doc(db, "employees", user.uid);
        await setDoc(employeeRef, { ...baseData, password });

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
      setAllowedMenuKeys(["dashboard", "setting", "contact"]);
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
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Uniclub
                </th>
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
                  Password
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Location
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.uniclub || "—"}
                    </td>
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
                      {item.password}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {[item.cityName, item.stateName, item.countryName]
                        .filter(Boolean)
                        .join(", ") || "—"}
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
                          const savedPermissions = Array.isArray(item.permissions)
                            ? item.permissions
                            : [];

                          setEditing(item);

                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            permissions: savedPermissions,
                            image: null,
                          }));

                          setSelectedUniversityId(item.universityId || "");
                          if (item.countryName) {
                            fetchUniversitiesByCountry(item.countryName);
                          }
                          if (item.universityId) {
                            getClub(item.universityId);
                          }

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
              {form.email &&
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((form.email || "").trim()) && (
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
                <option value="">
                  {uniclubs.length ? "Select Uniclub" : "Select Uniclub"}
                </option>
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

              {/* Permissions – Checkbox list with Select All */}
              <fieldset className="mt-3">
                <legend className="font-medium mb-2">Permissions</legend>

                {/* Select All */}
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
                    <p className="text-xs text-gray-500">
                      No permissions available. Enable features first.
                    </p>
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

              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="text-sm font-medium">Status</span>
                <input
                  id="isActive"
                  type="checkbox"
                  name="isActive"
                  className="sr-only peer"
                  checked={form.isActive}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      isActive: e.target.checked,
                    }))
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Account
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
