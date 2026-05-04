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
  documentId,
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

export default function BusinessEmployeePage(props) {
  const { navbarHeight } = props;

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [restaurantOptions, setRestaurantOptions] = useState([]);
  const [restaurantsLoading, setRestaurantsLoading] = useState(false);

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
    businesstypeid: "",
    businesstype: "",
    restaurantId: "",
    restaurantName: "",
    role: "Admin",
    isActive: true,
    permissions: [],
    image: null,
    imageUrl: "",
    password: "",
  };

  const [form, setForm] = useState(initialForm);

  const MENU_OPTIONS = useMemo(
    () => [
      { key: "dashboard", label: "Dashboard" },
      { key: "product", label: "Product" },
      { key: "productorder", label: "Product Order" },
      { key: "service", label: "Service" },
      { key: "servicebooking", label: "Service Booking" },
      { key: "managerestaurant", label: "Restaurant" },
      { key: "reservations", label: "Reservations" },
      { key: "qr", label: "QR / Tables" },
      { key: "menu", label: "Menus / Modifiers" },
      { key: "deals", label: "Deals" },
      { key: "orders", label: "Orders" },
      { key: "inventory", label: "Inventory" },
    ],
    []
  );

  const pageSize = 10;

  const filteredData = useMemo(() => {
    const t = (searchTerm || "").toLowerCase();
    return (list || []).filter((item) => {
      const n = (item.name || "").toLowerCase();
      const e = (item.email || "").toLowerCase();
      const b = (item.businesstype || "").toLowerCase();
      const r = (item.restaurantName || "").toLowerCase();
      const role = (item.role || "").toLowerCase();

      return (
        n.includes(t) ||
        e.includes(t) ||
        b.includes(t) ||
        r.includes(t) ||
        role.includes(t)
      );
    });
  }, [list, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

  const paginatedData = useMemo(() => {
    return filteredData.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [filteredData, currentPage]);

  const allPermissionsSelected = useMemo(() => {
    if (!MENU_OPTIONS.length) return false;
    return MENU_OPTIONS.every(({ key }) =>
      (form.permissions || []).includes(key)
    );
  }, [form.permissions, MENU_OPTIONS]);

  useEffect(() => {
    if (uid) {
      loadInitialData();
    }
  }, [uid]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

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

  const getRestaurants = async () => {
    setRestaurantsLoading(true);
    try {
      const qy = query(collection(db, "restaurants"), where("createdBy", "==", uid));
      const snap = await getDocs(qy);

      const docs = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          name:
            data.restaurantName ||
            data.name ||
            data.title ||
            data.businessName ||
            "Unnamed Restaurant",
          ...data,
        };
      });

      setRestaurantOptions(docs);
      return docs;
    } catch (e) {
      console.error("getRestaurants error:", e);
      toast.error("Failed to load restaurants");
      setRestaurantOptions([]);
      return [];
    } finally {
      setRestaurantsLoading(false);
    }
  };

  const getEmployeesByRestaurantIds = async (restaurantIds = []) => {
    if (!restaurantIds.length) return [];

    try {
      const chunks = [];
      for (let i = 0; i < restaurantIds.length; i += 10) {
        chunks.push(restaurantIds.slice(i, i + 10));
      }

      let allDocs = [];

      for (const chunk of chunks) {
        const qy = query(
          collection(db, "employees"),
          where("restaurantid", "in", chunk)
        );
        const snap = await getDocs(qy);

        const docs = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
          permissions: normalizePermissions(d.data()?.permissions),
        }));

        allDocs = [...allDocs, ...docs];
      }

      return allDocs;
    } catch (e) {
      console.error("getEmployeesByRestaurantIds error:", e);
      toast.error("Failed to load restaurant employees");
      return [];
    }
  };

  const getDirectEmployees = async () => {
    try {
      const qy = query(collection(db, "employees"), where("uid", "==", uid));
      const snap = await getDocs(qy);

      return snap.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
          permissions: normalizePermissions(d.data()?.permissions),
        }))
        .filter((item) => {
          // current logged in employee/user ko list me mat dikhao
          return item.id !== uid && item.uid === uid;
        });
    } catch (e) {
      console.error("getDirectEmployees error:", e);
      toast.error("Failed to load employees");
      return [];
    }
  };

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const restaurants = await getRestaurants();
      const restaurantIds = restaurants.map((r) => r.id);

      const [directEmployees, restaurantEmployees] = await Promise.all([
        getDirectEmployees(),
        getEmployeesByRestaurantIds(restaurantIds),
      ]);

      const map = new Map();

      [...directEmployees, ...restaurantEmployees].forEach((item) => {
        map.set(item.id, {
          ...item,
          restaurantName:
            item.restaurantName ||
            restaurants.find((r) => r.id === item.restaurantId)?.name ||
            "",
        });
      });

      const finalList = Array.from(map.values());

      setList(finalList);
    } catch (e) {
      console.error("loadInitialData error:", e);
      toast.error("Failed to load employees data");
    } finally {
      setIsLoading(false);
    }
  };

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
      if (checked) {
        return {
          ...prev,
          permissions: MENU_OPTIONS.map((x) => x.key),
        };
      }
      return { ...prev, permissions: [] };
    });
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;

    if (type === "file") {
      const file = files?.[0] || null;
      setForm((p) => ({ ...p, [name]: file }));
      setFileName(file ? file.name : "No file chosen");
      return;
    }

    if (name === "businesstype") {
      const nextType = value || "";

      setForm((p) => ({
        ...p,
        businesstype: nextType,
        businesstypeid: nextType,
        ...(nextType !== "restaurant"
          ? {
            restaurantId: "",
            restaurantName: "",
          }
          : {}),
      }));
      return;
    }

    if (name === "restaurantId") {
      const selectedRestaurant =
        restaurantOptions.find((r) => r.id === value) || null;

      setForm((p) => ({
        ...p,
        restaurantId: value,
        restaurantName: selectedRestaurant?.name || "",
      }));
      return;
    }

    setForm((p) => ({ ...p, [name]: value }));
  };

  const resetFormAndClose = () => {
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

      if (!form.businesstype) {
        toast.error("Please select business type");
        return;
      }

      if (form.businesstype === "restaurant" && !form.restaurantId) {
        toast.error("Please select a restaurant");
        return;
      }

      let imageUrl = form.imageUrl || "";
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) imageUrl = uploadedUrl;

      const selectedRestaurant =
        form.businesstype === "restaurant"
          ? restaurantOptions.find((r) => r.id === form.restaurantId) || null
          : null;

      const baseData = {
        name: (form.name || "").trim(),
        email: emailLower,
        mobileNo: form.mobileNo || "",
        businesstypeid: form.businesstype || "",
        businesstype: form.businesstype || "",
        restaurantId:
          form.businesstype === "restaurant" ? form.restaurantId || "" : "",
        restaurantName:
          form.businesstype === "restaurant"
            ? selectedRestaurant?.name || form.restaurantName || ""
            : "",
        role: "admin",
        isActive: !!form.isActive,
        permissions: normalizePermissions(form.permissions),
        type: "admin",
        uid,
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

        await updateDoc(docRef, {
          ...baseData,
          permissions: mergedPerms,
          password: old.password || "",
        });

        toast.success("Employee updated successfully");
        await loadInitialData();
        resetFormAndClose();
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

        await setDoc(
          doc(db, "employees", existingUid),
          {
            ...oldEmp,
            ...baseData,
            permissions: mergedPerms,
            password: oldEmp.password || password,
            createdby: oldEmp.createdby || uid,
            createddate: oldEmp.createddate || new Date(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        toast.success("Existing email found — employee assigned/updated!");
        await loadInitialData();
        resetFormAndClose();
        return;
      }

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
        if (err?.code === "auth/email-already-in-use") {
          const fallbackEmp = await findEmployeeByEmail(emailLower);

          if (fallbackEmp?.uid) {
            const existingUid = fallbackEmp.uid;
            const oldEmp = fallbackEmp.data || {};
            const mergedPerms = mergePermissions(
              oldEmp.permissions,
              baseData.permissions
            );

            await setDoc(
              doc(db, "employees", existingUid),
              {
                ...oldEmp,
                ...baseData,
                permissions: mergedPerms,
                password: oldEmp.password || password,
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            );

            toast.success(
              "Email already exists — assigned successfully (no new auth created)."
            );

            await loadInitialData();
            resetFormAndClose();
            return;
          }

          toast.warn(
            "Auth email exists but employee record not found. Create employee doc manually or use Admin SDK to map email → uid."
          );
          return;
        }

        throw err;
      }

      await loadInitialData();
      resetFormAndClose();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Failed to save employee.");
    } finally {
      if (tempApp) {
        try {
          await deleteApp(tempApp);
        } catch { }
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

      if (!response.ok) {
        throw new Error(data.error?.message || "Failed to delete user auth");
      }

      if (data.success) {
        await deleteDoc(doc(db, "employees", targetUid));
        toast.success("Successfully deleted!");
        await loadInitialData();
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
          placeholder="Search by name, email, business type, restaurant, role"
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
                  Business Type
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                      {item.businesstype || "-"}
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
                          className="rounded object-cover"
                        />
                      ) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm({
                            ...initialForm,
                            ...item,
                            id: item.id,
                            email: item.email || "",
                            permissions: normalizePermissions(item.permissions),
                            image: null,
                            businesstype: item.businesstype || "",
                            businesstypeid:
                              item.businesstypeid || item.businesstype || "",
                            restaurantId: item.restaurantId || "",
                            restaurantName: item.restaurantName || "",
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

              <select
                name="businesstype"
                value={form.businesstype}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              >
                <option value="">Select Business Type</option>
                <option value="restaurant">Restaurant</option>
                <option value="product">Product</option>
                <option value="service">Service</option>
              </select>

              {form.businesstype === "restaurant" && (
                <div>
                  <select
                    name="restaurantId"
                    value={form.restaurantId}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  >
                    <option value="">
                      {restaurantsLoading
                        ? "Loading restaurants..."
                        : "Select Restaurant"}
                    </option>
                    {restaurantOptions.map((restaurant) => (
                      <option key={restaurant.id} value={restaurant.id}>
                        {restaurant.name}
                      </option>
                    ))}
                  </select>

                  {form.restaurantName ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Selected Restaurant: <strong>{form.restaurantName}</strong>
                    </p>
                  ) : null}
                </div>
              )}

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

              <div className="md:col-span-2">
                <fieldset className="mt-2">
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
                    {MENU_OPTIONS.map(({ key, label }) => (
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
                  className={`text-sm font-semibold ${form.isActive ? "text-green-600" : "text-red-500"
                    }`}
                >
                  {form.isActive ? "Active" : "Inactive"}
                </span>
              </label>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={resetFormAndClose}
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