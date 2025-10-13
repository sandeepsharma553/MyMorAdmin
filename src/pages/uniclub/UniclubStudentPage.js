import React, { useState, useEffect } from "react";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, deleteDoc, query, where, getDoc, Timestamp, orderBy } from "firebase/firestore";
import { db, storage, auth, firebaseConfig } from "../../firebase";
import { initializeApp, deleteApp } from 'firebase/app';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useSelector } from "react-redux";

export default function UniclubStudentPage(props) {
  const { navbarHeight } = props;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState('No file chosen');

  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);

  const initialForm = {
    id: '',
    firstname: '',
    email: '',
    mobileNo: '',
    address: '',
    studentid: '',
    image: null,
    imageUrl: '',
    password: '', // for display column (if you really need to store it)
  };

  const [form, setForm] = useState(initialForm);

  const pageSize = 10;
  const filteredData = list.filter(
    (item) =>
      (item.firstname || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  useEffect(() => {
    getList();
  }, []);

  const getList = async () => {
    setIsLoading(true);
    try {
      const constraints = [
        where('createdby', '==', uid),
        where('livingtype', '==', 'university'),
      ];
      const q = query(collection(db, 'users'), ...constraints);
      const snap = await getDocs(q);
      const rows = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.firstname !== emp.name);

      setList(rows);
    } catch (err) {
      console.error('getList error:', err);
      toast.error('Failed to load students');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;
    if (type === 'file') {
      const file = files?.[0] || null;
      setForm({ ...form, [name]: file });
      setFileName(file ? file.name : 'No file chosen');
    } else {
      setForm({ ...form, [name]: value });
    }
  };

  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test((email || '').trim());
  };

  const uploadImageIfNeeded = async (imageFile) => {
    if (!(imageFile instanceof File)) return null;
    const storageRef = ref(storage, `user_image/${Date.now()}_${imageFile.name}`);
    await uploadBytes(storageRef, imageFile);
    return await getDownloadURL(storageRef);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!isEmailValid(form.email)) {
        toast.error("Please enter a valid email address");
        return;
      }

      // Handle image (create or update)
      let finalImageUrl = form.imageUrl || '';
      const uploadedUrl = await uploadImageIfNeeded(form.image);
      if (uploadedUrl) finalImageUrl = uploadedUrl;

      if (editingData) {
        // ---- UPDATE ----
        const docRef = doc(db, 'users', form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning('Student does not exist! Cannot update.');
          return;
        }

        const updated = {
          firstname: form.firstname,
          lastname: form.lastname || "",
          username: form.firstname,
          email: form.email, // disabled in UI when editing
          universityid: emp?.universityId || "",
          university: emp?.university || "",
          livingtype: "university",
          createdby: docSnap.data()?.createdby || uid,
          createddate: docSnap.data()?.createddate || new Date(),
          mobileNo: form.mobileNo || '',
          address: form.address || '',
          studentid: form.studentid || '',
          ...(finalImageUrl ? { imageUrl: finalImageUrl } : { imageUrl: '' }),
          uid: form.id,
          password: docSnap.data()?.password || '',
        };

        await updateDoc(docRef, updated);
        toast.success('Student updated successfully');
      } else {
        // ---- CREATE ----
        // generate password (if you insist on storing it—note: not recommended in plain text)
        const password = `${form.firstname}321`;

        // temp app for user creation
        const tempApp = initializeApp(firebaseConfig, 'userCreator');
        try {
          const tempAuth = getAuth(tempApp);
          const userCredential = await createUserWithEmailAndPassword(tempAuth, form.email, password);
          const user = userCredential.user;

          if (finalImageUrl) {
            await updateProfile(user, {
              displayName: form.firstname,
              photoURL: finalImageUrl,
            });
          } else {
            await updateProfile(user, { displayName: form.firstname });
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
            imageUrl: finalImageUrl || '',
            password, // (again: storing plain text is unsafe)
            uid: user.uid,
            mobileNo: form.mobileNo || '',
            address: form.address || '',
            studentid: form.studentid || '',
          };

          await setDoc(doc(db, "users", user.uid), userData);
          toast.success('Student created successfully');
        } finally {
          // Cleanup the temporary app to avoid duplicate-app errors on hot reloads
          await deleteApp(tempApp);
        }
      }

      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName('No file chosen');
    } catch (error) {
      console.error("Error saving data:", error);
      if (error?.code === 'auth/email-already-in-use') {
        toast.error('This email is already in use');
      } else {
        toast.error('Failed to save user');
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const targetUid = deleteData.id; // our doc id is the user uid
      const response = await fetch(
        'https://us-central1-mymor-one.cloudfunctions.net/deleteUserByUid',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: targetUid }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to delete user auth');
      }

      if (data.success) {
        await deleteDoc(doc(db, 'users', targetUid)); // correct collection
        toast.success('Successfully deleted!');
        await getList();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      toast.error('Failed to delete user');
    } finally {
      setConfirmDeleteOpen(false);
      setDelete(null);
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Student</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Student ID</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Password</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Image</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.firstname}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.studentid}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.password}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item?.imageUrl ? (
                        <img src={item.imageUrl} width={80} height={80} alt="student" />
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
                            image: null,          // clear file
                            imageUrl: item.imageUrl || '',
                            id: item.id,          // ensure id set
                          });
                          setFileName('No file chosen');
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
          Page {currentPage} of {Math.max(totalPages, 1)}
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
            onClick={() => setCurrentPage((p) => Math.min(p + 1, Math.max(totalPages, 1)))}
            disabled={currentPage === totalPages || totalPages === 0}
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
            <h2 className="text-xl font-bold mb-4">{editingData ? 'Update Student' : 'Create Student'}</h2>
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
                    setFileName('No file chosen');
                  }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  {editingData ? 'Update' : 'Create'}
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Student</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.firstname}</strong>?
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
