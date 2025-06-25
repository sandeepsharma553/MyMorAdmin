import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db, storage, auth } from "../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { useSelector } from "react-redux";
import { MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
export default function EmployeePage(props) {
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
  const [selected, setSelected] = useState([]);
  const uid = useSelector((state) => state.auth.user.uid);
  const user = useSelector((state) => state.auth.user);
   
    console.log(user)
  const initialForm = {
    id: 0,
    name: '',
    email: '',
    mobileNo: '',
    address: '',
    designation: '',
    department: '',
    role: '',
    isActive: true,
    permissions: [],
  }
  const [form, setForm] = useState(initialForm);
  const MENU_OPTIONS = ["Dashboard", "Employee", "Settings", "Reports"];
  const pageSize = 10;
  const mockData = list
  const filteredData = mockData.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / pageSize);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  useEffect(() => {
    getList()
  }, [])
  const getList = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'employee'));
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setList(documents)
    setIsLoading(false)

  }
  const handleChange = (e) => {
    const { name, value, type, files } = e.target;

    if (type === 'file') {
      setForm({ ...form, [name]: files[0] });
      if (files.length > 0) {
        setFileName(files[0].name);
      } else {
        setFileName('No file chosen');
      }
    }
    else {
      setForm({ ...form, [name]: value });
    }
  };
  const isEmailValid = (email) => {
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return EMAIL_REGEX.test(email.trim());
  };
  const handlePermissionChange = (e) => {
    const element = e?.target;
    if (!element || !element.options) {
      console.warn("Multi-select element is not valid");
      return;
    }

    const selected = [];
    for (let i = 0; i < element.options.length; i++) {
      const opt = element.options[i];
      if (opt.selected) selected.push(opt.value);
    }

    setForm((prev) => ({ ...prev, permissions: selected }));
    console.log(form)
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!isEmailValid(form.email)) {
        toast.error("Please enter a valid email address");
        return;
      }
      if (form.id == 0) {
        if (!form.image) {
          toast.error("Please choose the file")
          return;
        }
      }
      let imageUrl = form.imageUrl || '';
      const isNewImage = form.image instanceof File;

      // Upload new image if selected
      if (isNewImage) {
        const storageRef = ref(storage, `employee_image/${form.image.name}`);
        await uploadBytes(storageRef, form.image);
        imageUrl = await getDownloadURL(storageRef);
      }
      const employeeData = {
        ...form,
        uid,
        ...(imageUrl && { imageUrl }),
      };
      delete employeeData.id;
      delete employeeData.image;
      if (editingData) {
        const docRef = doc(db, 'employee', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('Deal does not exist! Cannot update.');
          return;
        }
        const empRef = doc(db, 'employee', form.id);
        await updateDoc(empRef, employeeData);
        toast.success('Employee updated successfully');
      }
      else {
        const password = `${form.name}321`;
        const userCredential = await createUserWithEmailAndPassword(auth, form.email, password);
        const user = userCredential.user;
        await updateProfile(user, {
          displayName: form.name,
        })
        await addDoc(collection(db, 'employee'), employeeData);
        toast.success('Empoyee created successfully');
      }

    } catch (error) {
      console.error("Error saving data:", error);
    }
    getList()
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName('No file chosen');
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'employee', form.id));
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Employee</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by name or category"
          className="p-2 border border-gray-300 rounded w-full md:w-1/3"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1); // reset to page 1 on search
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Mobile No</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Designation</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Department</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Role</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Image</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.mobileNo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.designation}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.department}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.role}</td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '12px',
                          color: '#fff',
                          backgroundColor: item.isActive ? 'green' : 'red',
                          fontSize: 12,
                        }}
                      >
                        {item.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.imageUrl != "" ? (<img src={item.imageUrl} width={80} height={80} />) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                        setEditing(item);
                        setForm(prev => ({
                          ...prev,
                          ...item,
                          id: item.id,
                          permissions: item.permissions?.length > 0 ? item.permissions: [],
                          image: null
                        }));
                        setModalOpen(true);
                      }}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => {
                        setDelete(item);
                        setForm(item);
                        setConfirmDeleteOpen(true);
                      }}>Delete</button>
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
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Create Employee</h2>
            <form onSubmit={handleSubmit} className="space-y-4" >
              <div className="space-y-4">
                <input name="name" placeholder="Name" value={form.name}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <input name="email" placeholder="Email" value={form.email}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                {form.email && !isEmailValid(form.email) && (
                  <p className="text-red-500 text-sm mt-1">Invalid email format</p>
                )}
                <input name="mobileNo" placeholder="Mobile No" type="number" min={0} value={form.mobileNo} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <textarea name="address" placeholder="Address" value={form.address} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>

                <input name="designation" placeholder="Designation" value={form.designation} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <input name="department" placeholder="Department" value={form.department} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <select name="role" value={form.role} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required >
                  <option value="">Select Role</option>
                  <option value="HR">HR</option>
                  <option value="Manager">Manager</option>

                </select>
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input type="file" name="image" accept="image/*" className="hidden"
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
                <div>

                  <Select
                    className="w-full border border-gray-300 p-2 rounded"
                    multiple
                    displayEmpty
                    value={form.permissions}
                    onChange={e => setForm({ ...form, permissions: e.target.value })}
                    renderValue={selected =>
                      selected.length ? selected.join(', ') : 'Select Permission'
                    }
                    sx={{ minWidth: 260 }}
                  >
                    {MENU_OPTIONS.map(skill => (
                      <MenuItem key={skill} value={skill}>
                        <Checkbox checked={form.permissions.indexOf(skill) > -1} />
                        <ListItemText primary={skill} />
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
                      setForm({ ...form, isActive: e.target.checked })
                    }}
                  />
                  <div className="w-11 h-6 rounded-full bg-gray-300 peer-checked:bg-green-500 transition-colors relative">
                    <span className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full shadow
                           transition-transform peer-checked:translate-x-5" />
                  </div>
                  <span
                    className={`text-sm font-semibold ${form.isActive ? 'text-green-600' : 'text-red-500'
                      }`}
                  >
                    {form.isActive ? 'Active' : 'Inactive'}
                  </span>
                </label>

              </div>
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Create Employee
                </button>
              </div>
            </form>
            <form onSubmit={handleSubmit} className="p-4 max-w-2xl mx-auto">
            </form>
          </div>
        </div>
      )}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete User</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
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
