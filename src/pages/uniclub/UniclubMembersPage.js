// UniclubMembersPage.jsx

import React, { useState, useEffect } from "react";
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
import { db, storage, auth, firebaseConfig, database } from "../../firebase";
import { initializeApp, deleteApp } from "firebase/app";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import {
  ref as dbRef,
  get as rtdbGet,
  set as rtdbSet,
  remove as rtdbRemove,
  serverTimestamp,
} from "firebase/database";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useSelector } from "react-redux";

export default function UniclubMembersPage(props) {
  const { navbarHeight } = props;
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [fileName, setFileName] = useState("No file chosen"); // kept but unused now
  const [clubs, setClubs] = useState([]);
  const [subGroups, setSubGroups] = useState([]);

  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);

  const initialForm = {
    id: "",
    firstname: "",
    email: "",
    mobileNo: "",
    studentid: "",
    degree: "",
    password: "",

    // NEW FIELDS
    paymentMethod: "",
    clubId: "",
    subGroupId: "",

    // image kept for future use (no UI now)
    image: null,
    imageUrl: "",
  };

  const [form, setForm] = useState(initialForm);

  const pageSize = 10;

  // 🔍 Filter only current-club members by name/email (still using emp.uniclubid for listing)
  const filteredData = list.filter(
    (item) =>
      (item.firstname || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (item.email || "").toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    getList();
    getClubs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🔁 Fetch sub-groups whenever selected club changes
  // 🔁 Fetch sub-groups whenever selected club changes
  useEffect(() => {
    const fetchSubGroups = async () => {
      if (!emp.uniclubid) {
        setSubGroups([]);
        return;
      }
      try {
        const ref = dbRef(database, `uniclubsubgroup`);
        const snap = await rtdbGet(ref);
        const val = snap.val() || {};

        const arr = Object.entries(val).map(([id, g]) => ({
          id,
          title: g.title || "Untitled Subgroup",
          parentGroupId: g.parentGroupId || null,
        }));
        const filtered = arr.filter(x => String(x.parentGroupId || "") === String(emp?.uniclubid));
        setSubGroups(filtered);
      } catch (err) {
        console.error("fetchSubGroups error:", err);
        setSubGroups([]);
      }
    };

    fetchSubGroups();
  }, [emp.uniclubid, database]);


  /**
   * 🔄 getList:
   *  1. RTDB: uniclubs/{emp.uniclubid}/members => uids + role/status
   *  2. Firestore: users/{uid} => firstname, email, studentid, imageUrl, password etc.
   *  3. Merge and show only those members.
   */
  const getList = async () => {
    if (!emp?.uniclubid) {
      console.warn("emp.uniclubid missing");
      setList([]);
      return;
    }

    setIsLoading(true);
    try {
      // 1) RTDB members
      const memRef = dbRef(database, `uniclubs/${emp.uniclubid}/members`);
      const memSnap = await rtdbGet(memRef);
      const memVal = memSnap.val() || {};

      const memberUids = Object.keys(memVal);
      if (memberUids.length === 0) {
        setList([]);
        return;
      }

      // 2) Firestore users docs for those uids
      const userDocs = await Promise.all(
        memberUids.map(async (mUid) => {
          const d = await getDoc(doc(db, "users", mUid));
          if (!d.exists()) return null;
          const data = d.data();
          const rtdbMember = memVal[mUid] || {};
          return {
            id: d.id,
            ...data,
            role: rtdbMember.role || "member",
            status: rtdbMember.status || "active",
          };
        })
      );

      const rows = userDocs.filter(Boolean);
      setList(rows);
    } catch (err) {
      console.error("getList error:", err);
      toast.error("Failed to load club members");
    } finally {
      setIsLoading(false);
    }
  };

  // 🔄 getClubs: load all clubs for this university (to pick which club to add member into)
  const getClubs = async () => {
    try {
      if (!emp?.universityId) {
        setClubs([]);
        return;
      }

      const ref = dbRef(database, "uniclubs");
      const snap = await rtdbGet(ref);
      const val = snap.val() || {};

      const filtered = Object.entries(val)
        .filter(([id, c]) => c.universityid === emp.universityId)
        .map(([id, c]) => ({
          id,
          title: c.title || "Unnamed Club",
        }));

      setClubs(filtered);
    } catch (err) {
      console.error("getClubs error:", err);
      setClubs([]);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === "file") {
      const file = files?.[0] || null;
      setForm({ ...form, [name]: file });
      setFileName(file ? file.name : "No file chosen");
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || "").trim());
  };

  const uploadImageIfNeeded = async (imageFile) => {
    if (!imageFile) return null;
    const sRef = storageRef(
      storage,
      `user_image/${Date.now()}_${imageFile.name || "img"}`
    );
    await uploadBytes(sRef, imageFile);
    return await getDownloadURL(sRef);
  };

  /**
   * 🧩 handleSubmit:
   *  - if editing:
   *      update Firestore user
   *      update RTDB member (name/photo/paymentMethod)
   *  - else (create):
   *      create Auth user
   *      create Firestore user doc
   *      add to RTDB: uniclubs/{form.clubId}/members/{uid}
   *      optionally: uniclubs/{form.clubId}/subgroups/{form.subGroupId}/members/{uid}
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!emp?.universityId) {
      toast.error("University not linked to this staff");
      return;
    }

    if (!form.clubId) {
      toast.error("Please select a club");
      return;
    }

    try {
      if (!isEmailValid(form.email)) {
        toast.error("Please enter a valid email address");
        return;
      }

      // handle image upload (currently no UI, but kept for future)
      let finalImageUrl = form.imageUrl || "";
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) finalImageUrl = uploadedUrl;

      if (editingData) {
        // ---------- UPDATE EXISTING STUDENT ----------
        const docRef = doc(db, "users", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("Student does not exist! Cannot update.");
          return;
        }

        const prev = docSnap.data() || {};

        const updated = {
          firstname: form.firstname,
          lastname: form.lastname || "",
          username: form.firstname,
          email: form.email, // (disabled in UI)
          universityid: emp?.universityId || "",
          university: emp?.university || "",
          livingtype: "university",
          createdby: prev.createdby || uid,
          createddate: prev.createddate || new Date(),
          mobileNo: form.mobileNo || "",
          studentid: form.studentid || "",
          degree: form.degree || "",
          paymentMethod: form.paymentMethod || "",
          ...(finalImageUrl ? { imageUrl: finalImageUrl } : { imageUrl: "" }),
          uid: form.id,
          password: prev.password || "",
        };

        await updateDoc(docRef, updated);

        // 🔁 sync RTDB member node for this staff's club
        if (emp?.uniclubid) {
          const memberRef = dbRef(
            database,
            `uniclubs/${emp.uniclubid}/members/${form.id}`
          );
          const memberSnap = await rtdbGet(memberRef);
          if (memberSnap.exists()) {
            const old = memberSnap.val() || {};
            await rtdbSet(memberRef, {
              ...old,
              uid: form.id,
              name: form.firstname,
              photoURL: finalImageUrl || old.photoURL || "",
              paymentMethod: form.paymentMethod || old.paymentMethod || "",
            });
          }
        }

        toast.success("Student updated successfully");
      } else {
        // ---------- CREATE NEW STUDENT ----------
        const password = `${form.firstname}321`; // demo only

        // temp app for creating user without affecting current admin auth
        const tempApp = initializeApp(firebaseConfig, "userCreator");
        try {
          const tempAuth = getAuth(tempApp);
          const userCredential = await createUserWithEmailAndPassword(
            tempAuth,
            form.email,
            password
          );
          const newUser = userCredential.user;

          if (finalImageUrl) {
            await updateProfile(newUser, {
              displayName: form.firstname,
              photoURL: finalImageUrl,
            });
          } else {
            await updateProfile(newUser, { displayName: form.firstname });
          }

          const userData = {
            firstname: form.firstname,
            lastname: "",
            username: form.firstname,
            email: form.email,
            universityid: emp?.universityId || "",
            university: emp?.university || "",
            livingtype: "university",
            createdby: uid,
            createddate: new Date(),
            imageUrl: finalImageUrl || "",
            password, // only for demo
            uid: newUser.uid,
            mobileNo: form.mobileNo || "",
            studentid: form.studentid || "",
            degree: form.degree || "",
            paymentMethod: form.paymentMethod || "",
          };

          // Firestore user
          await setDoc(doc(db, "users", newUser.uid), userData);

          // 🔗 Add as member in the SELECTED club in RTDB
          const memberRef = dbRef(
            database,
            `uniclubs/${form.clubId}/members/${newUser.uid}`
          );
          await rtdbSet(memberRef, {
            uid: newUser.uid,
            name: form.firstname,
            photoURL: finalImageUrl || "",
            role: "member",
            status: "active",
            paymentMethod: form.paymentMethod || "",
            joinedAt: serverTimestamp(),
          });

          // 🔗 Also add to chosen sub-group (optional)
          if (form.subGroupId) {
            await rtdbSet(dbRef(database, `${'uniclubsubgroup'}/${form.subGroupId}/members/${newUser.uid}`), {
              uid: newUser.uid,
              name: form.firstname,
              photoURL: finalImageUrl || "",
              joinedAt: serverTimestamp(),
            });
          }

          toast.success("Student created & added to club");
        } finally {
          await deleteApp(tempApp);
        }
      }

      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
      setSubGroups([]);
    } catch (error) {
      console.error("Error saving data:", error);
      if (error?.code === "auth/email-already-in-use") {
        toast.error("This email is already in use");
      } else {
        toast.error("Failed to save user");
      }
    }
  };

  /**
   * ❌ handleDelete:
   *  - delete Auth (via your cloud function)
   *  - delete Firestore user doc
   *  - remove from RTDB uniclubs/{emp.uniclubid}/members/{uid}
   */
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const targetUid = deleteData.id;

      // 1) delete auth using your cloud function
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
        // 2) delete Firestore user
        await deleteDoc(doc(db, "users", targetUid));

        // 3) remove from RTDB members of this club
        if (emp?.uniclubid) {
          const memberRef = dbRef(
            database,
            `uniclubs/${emp.uniclubid}/members/${targetUid}`
          );
          await rtdbRemove(memberRef);
        }

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
        <h1 className="text-2xl font-semibold">
          Club Members {emp?.uniclubid ? "" : "(no club linked)"}
        </h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm({
              ...initialForm,
              clubId: emp?.uniclubid || "",
            });
            setSubGroups([]);
            setModalOpen(true);
          }}
          disabled={!emp?.uniclubid}
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
                  Mobile Number
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Student ID
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Degree
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Password
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No matching members found.
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
                      {item.mobileNo}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.studentid}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.degree}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.password}
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
          Page {currentPage} of {Math.max(totalPages || 1, 1)}
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
              setCurrentPage((p) => Math.min(p + 1, Math.max(totalPages || 1, 1)))
            }
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Update Student" : "Create Student & Add to Club"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <input
                name="firstname"
                placeholder="Name"
                value={form.firstname}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              {/* Email */}
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

              {/* Mobile */}
              <input
                name="mobileNo"
                placeholder="Mobile No"
                type="number"
                min={0}
                value={form.mobileNo}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
              />

              {/* Student ID */}
              <input
                name="studentid"
                placeholder="Student ID"
                value={form.studentid}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              {/* Degree */}
              <input
                name="degree"
                placeholder="Degree"
                value={form.degree}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
              />

              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  name="paymentMethod"
                  value={form.paymentMethod}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                >
                  <option value="">Select payment method</option>
                  <option value="Cash">Cash</option>
                  <option value="Card">Card</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </div>

              {/* Select Club */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Club
                </label>
                <select
                  name="clubId"
                  value={form.clubId}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                >
                  <option value="">Select club</option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Sub-Group */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select Sub-Group (optional)
                </label>
                <select
                  name="subGroupId"
                  value={form.subGroupId}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                >
                  <option value="">Select Sub-Group</option>
                  {subGroups.map((sg) => (
                    <option key={sg.id} value={sg.id}>
                      {sg.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                    setFileName("No file chosen");
                    setSubGroups([]);
                  }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  {editingData ? "Update" : "Create & Add"}
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
              Delete Student
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
