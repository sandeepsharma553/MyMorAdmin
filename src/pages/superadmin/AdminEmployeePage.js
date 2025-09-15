import React, { useState, useEffect, useMemo } from "react";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { MenuItem, Select, Checkbox, ListItemText } from "@mui/material";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  setDoc,
  deleteDoc,
  query,
  where,
  getDoc,
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
import LocationPicker from "./LocationPicker";

export default function AdminEmployeePage(props) {
  const { navbarHeight } = props;
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [selectedHostel, setSelectedHostel] = useState("");
  const [hostelFeatures, setHostelFeatures] = useState({});
  const [allowedMenuKeys, setAllowedMenuKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fileName, setFileName] = useState("No file chosen");

  const uid = useSelector((state) => state.auth.user.uid);

  const initialForm = {
    id: 0,
    name: "",
    email: "",
    mobileNo: "",
    address: "",
    hostelid: "",
    hostel: "",
    role: "admin",
    type: "admin",
    isActive: true,
    domain: "",
    permissions: [],

    // structured location fields
    countryCode: "",
    countryName: "",
    stateCode: "",
    stateName: "",
    cityName: "",
    lat: null,
    lng: null,

    // local-only
    image: null,
    imageUrl: "",
    password: "", // used only at creation time
  };

  const [form, setForm] = useState(initialForm);

  const pageSize = 10;
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

  const MENU_OPTIONS = [
    { key: "dashboard", label: "Dashboard" },
    { key: "announcement", label: "Announcement" },
    { key: "student", label: "Student" },
    { key: "diningmenu", label: "Dining Menu" },
    { key: "cleaningschedule", label: "Cleaning Schedule" },
    { key: "tutorialschedule", label: "Tutorial Schedule" },
    { key: "maintenance", label: "Maintenance" },
    { key: "bookingroom", label: "Book a Room" },
    { key: "academicgroup", label: "Academic Groups" },
    { key: "reportincident", label: "Report Incident" },
    { key: "feedback", label: "Feedback" },
    { key: "resources", label: "Resources" },
    { key: "event", label: "Event" },
    { key: "eventbooking", label: "Event Booking" },
    { key: "deal", label: "Deals" },
    { key: "faq", label: "FAQs" },
    { key: "setting", label: "Setting" },
    { key: "employee", label: "Employee" },
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
  };

  const LABEL_BY_KEY = useMemo(
    () => Object.fromEntries(MENU_OPTIONS.map(({ key, label }) => [key, label])),
    []
  );

  useEffect(() => {
    getList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getList = async () => {
    setIsLoading(true);
    try {
      // employees list
      const qEmp = query(
        collection(db, "employees"),
        where("type", "==", "admin"),
        where("uid", "==", uid)
      );
      const empSnap = await getDocs(qEmp);
      const superAdmins = empSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setList(superAdmins);

      // unis + hostels (for dropdowns & permissions)
      const [uniSnap, hostelSnap] = await Promise.all([
        getDocs(collection(db, "university")),
        getDocs(collection(db, "hostel")),
      ]);

      const uniArr = uniSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        domain: d.data().domain,
      }));

      const hostelArr = hostelSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name,
        universityId: d.data().universityId,
        location: d.data().location,
        features: d.data().features,
        active: d.data().active !== false,
      }));

      setUniversities(uniArr);
      setHostels(hostelArr);
    } catch (err) {
      console.error("getList error:", err);
      toast.error("Failed to load employees/hostels");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === "file") {
      setForm((prev) => ({ ...prev, [name]: files?.[0] || null }));
      setFileName(files?.[0]?.name || "No file chosen");
      return;
    }
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!isEmailValid(form.email)) {
        toast.error("Please enter a valid email address");
        return;
      }

      // Upload image if selected
      let imageUrl = form.imageUrl || "";
      const isNewImage = form.image instanceof File;
      if (isNewImage) {
        const storageRef = ref(storage, `employee_image/${form.image.name}`);
        await uploadBytes(storageRef, form.image);
        imageUrl = await getDownloadURL(storageRef);
      }

      // Build payload
      const password = `${form.name?.trim?.() || "User"}321`;
      const baseData = {
        // only data that should be in Firestore:
        name: form.name?.trim() || "",
        email: (form.email || "").toLowerCase(),
        mobileNo: form.mobileNo || "",
        address: form.address || "",
        hostelid: form.hostelid || "",
        hostel: form.hostel || "",
        role: "admin",
        type: "admin",
        isActive: !!form.isActive,
        domain: form.domain || "",
        permissions: Array.isArray(form.permissions) ? form.permissions : [],

        // structured location
        countryCode: form.countryCode || "",
        countryName: form.countryName || "",
        stateCode: form.stateCode || "",
        stateName: form.stateName || "",
        cityName: form.cityName || "",
        lat: typeof form.lat === "number" ? form.lat : null,
        lng: typeof form.lng === "number" ? form.lng : null,

        uid, // owner uid (super admin who creates)
        ...(imageUrl && { imageUrl }),
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

        if (form.hostelid) {
          await updateDoc(doc(db, "hostel", form.hostelid), { adminUID: form.id });
        }

        toast.success("Employee updated successfully");
      } else {
        // CREATE (only if hostel has no admin)
        const hostelRef = doc(db, "hostel", form.hostelid);
        const hostelSnap = await getDoc(hostelRef);
        if (!hostelSnap.exists()) {
          toast.warn("Hostel not found.");
          try {
            await deleteApp(tempApp);
          } catch {}
          return;
        }
        const hostelData = hostelSnap.data();
        if (hostelData.adminUID) {
          toast.warn("This hostel already has an assigned admin.");
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
        await setDoc(employeeRef, {
          ...baseData,
          password, // if you don't want to store it, remove this line
        });

        await updateDoc(doc(db, "hostel", form.hostelid), { adminUID: user.uid });

        // also create minimal "users" doc (if your app expects it)
        await setDoc(doc(db, "users", user.uid), {
          uid: user.uid,
          firstname: baseData.name,
          lastname: "",
          username: baseData.name,
          email: baseData.email,
          hostelid: form.hostelid,
          hostel: form.hostel,
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
    } catch (error) {
      // common auth error
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
      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to delete user");
      }

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

      await updateDoc(doc(db, "employees", form.id), {
        status: "disabled",
        isActive: false,
      });

      if (form.hostelid) {
        await updateDoc(doc(db, "hostel", form.hostelid), { adminUID: null });
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

      await updateDoc(doc(db, "employees", form.id), {
        status: "active",
        isActive: true,
      });

      if (form.hostelid) {
        await updateDoc(doc(db, "hostel", form.hostelid), { adminUID: form.id });
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

  const handleHostelChange = (e) => {
    const selectedId = e.target.value;
    setSelectedHostel(selectedId);

    const hostel = hostels.find((h) => h.id === selectedId);
    const features = hostel?.features || {};
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
  };

  const isHostelInactive = (hid) => hostels.find((h) => h.id === hid)?.active === false;

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Hostel Employee</h1>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hostel</th>
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
                  <td colSpan="9" className="px-6 py-4 text-center text-gray-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.hostel}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.mobileNo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.password}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <div className="flex flex-col">
                        <span>
                          {[item.cityName, item.stateName, item.countryName]
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </span>
                        {/* {typeof item.lat === "number" && typeof item.lng === "number" ? (
                          <span className="text-xs text-gray-500">
                            {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                          </span>
                        ) : null} */}
                      </div>
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
                      {item?.imageUrl !== "" && item?.imageUrl !== undefined ? (
                        <img src={item.imageUrl} width={80} height={80} alt="employee" />
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        disabled={isHostelInactive(item.hostelid)}
                        className={`text-blue-600 hover:underline mr-3 ${
                          isHostelInactive(item.hostelid) ? "opacity-40 cursor-not-allowed" : ""
                        }`}
                        onClick={() => {
                          setEditing(item);
                          const selectedHostelId = item.hostelid;
                          const selectedHostel = hostels.find((h) => h.id === selectedHostelId);
                          const features = selectedHostel?.features || {};
                          const allowedKeys = [
                            "dashboard",
                            "setting",
                            ...Object.entries(features)
                              .filter(([, enabled]) => enabled)
                              .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
                              .filter(Boolean),
                          ];
                          setSelectedHostel(selectedHostelId);
                          setHostelFeatures(features);
                          setAllowedMenuKeys(allowedKeys);
                          setForm((prev) => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            hostelid: selectedHostelId,
                            permissions: item.permissions?.length ? item.permissions : [],
                            image: null,
                          }));
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      {item.isActive ? (
                        <button
                          disabled={isHostelInactive(item.hostelid)}
                          className={`text-red-600 hover:underline ${
                            isHostelInactive(item.hostelid) ? "opacity-40 cursor-not-allowed" : ""
                          }`}
                          onClick={() => {
                            setDelete(item);
                            setForm(item);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          Disable
                        </button>
                      ) : (
                        <button
                          disabled={isHostelInactive(item.hostelid)}
                          className={`text-green-600 hover:underline ${
                            isHostelInactive(item.hostelid) ? "opacity-40 cursor-not-allowed" : ""
                          }`}
                          onClick={() => {
                            setDelete(item);
                            setForm(item);
                            handleEnable();
                          }}
                        >
                          Activate
                        </button>
                      )}
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
              <div className="space-y-4">
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

                {/* LocationPicker with hydration guard (from your upgraded component) */}
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
                      return same ? prev : { ...prev, ...next };
                    });
                  }}
                />

                <textarea
                  name="address"
                  placeholder="Address"
                  value={form.address}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />

                <select
                  name="hostelid"
                  value={form.hostelid}
                  onChange={(e) => {
                    const selectedHostelId = e.target.value;
                    const selectedHostel = hostels.find((h) => h.id === selectedHostelId);
                    setForm((prev) => ({
                      ...prev,
                      hostelid: selectedHostelId,
                      hostel: selectedHostel?.name || "",
                    }));
                    handleHostelChange(e);
                  }}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                >
                  <option value="">Select Hostel</option>
                  {hostels.map((h) => (
                    <option key={h.id} value={h.id} disabled={!h.active}>
                      {h.name} - {h.location}
                      {!h.active ? " (Disabled)" : ""}
                    </option>
                  ))}
                </select>

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

                <div>
                  <Select
                    className="w-full border border-gray-300 p-2 rounded"
                    multiple
                    displayEmpty
                    value={form.permissions}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, permissions: e.target.value }))
                    }
                    renderValue={(selected) =>
                      selected.length
                        ? selected.map((k) => LABEL_BY_KEY[k]).join(", ")
                        : "Select Permissions"
                    }
                  >
                    {MENU_OPTIONS.filter(({ key }) =>
                      allowedMenuKeys.includes(key)
                    ).map(({ key, label }) => (
                      <MenuItem key={key} value={key}>
                        <Checkbox checked={form.permissions.includes(key)} />
                        <ListItemText primary={label} />
                      </MenuItem>
                    ))}
                  </Select>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <span className="text-sm font-medium">Status</span>
                  <input
                    id="isActive"
                    type="checkbox"
                    name="isActive"
                    className="sr-only peer"
                    checked={form.isActive}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, isActive: e.target.checked }));
                    }}
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
              </div>

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

      {/* Disable/Enable/Deletion confirm */}
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
              <button
                onClick={handleDisable}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
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
