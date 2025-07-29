import React, { useState, useEffect } from "react";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
import { collection, addDoc, getDocs, updateDoc, doc, setDoc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db, storage, auth, firebaseConfig } from "../../firebase";
import { initializeApp, deleteApp, FirebaseApp } from 'firebase/app';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, createUserWithEmailAndPassword, updateProfile, deleteUser } from "firebase/auth";
import { useSelector } from "react-redux";
export default function AdminEmployeePage(props) {
  const { navbarHeight } = props;
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [universities, setUniversities] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [selectedHostel, setSelectedHostel] = useState("");
  const [hostelFeatures, setHostelFeatures] = useState({});
  const [allowedMenuKeys, setAllowedMenuKeys] = useState([]);
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState('No file chosen');
  const uid = useSelector((state) => state.auth.user.uid);
  const user = useSelector((state) => state.auth.user);
  const initialForm = {
    id: 0,
    name: '',
    email: '',
    mobileNo: '',
    address: '',
    hostelid: '',
    hostel: '',
    role: 'admin',
    type: 'admin',
    isActive: true,
    domain: '',
    permissions: [],
  }
  const [form, setForm] = useState(initialForm);
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
  const MENU_OPTIONS = [
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
  ];
  const FEATURE_TO_MENU_KEY = {
    events: "event",
    deals: "deal",
    announcement: "announcement",
    hostelevent: "event",
    diningmenu: "diningmenu",
    cleaningschedule: "cleaningschedule",
    maintenance: "maintenance",
    bookingroom: "bookingroom",
    academicgroup: "academicgroup",
    reportincedent: "reportincident",
    feedback: "feedback",
    wellbeing: "wellbeing",
    faqs: "faq",
    resource: "resources",
  };

  const LABEL_BY_KEY = Object.fromEntries(
    MENU_OPTIONS.map(({ key, label }) => [key, label])
  );
  useEffect(() => {
    getList()
  }, [])
  const getList = async () => {
    setIsLoading(true)
    const q = query(
      collection(db, 'employees'),
      where('type', '==', 'admin'),
      where('uid', '==', uid)
    );

    const querySnapshot = await getDocs(q);

    const superAdmins = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setList(superAdmins)
    console.log(superAdmins)
    const [uniSnap, hostelSnap] = await Promise.all([
      getDocs(collection(db, 'university')),
      getDocs(collection(db, 'hostel')),
    ]);

    const uniArr = uniSnap.docs.map(d => ({ id: d.id, name: d.data().name, domain: d.data().domain }));
    const hostelArr = hostelSnap.docs.map(d => ({
      id: d.id,
      name: d.data().name,
      universityId: d.data().universityId,
      location: d.data().location,
      features:d.data().features
    }));
    setUniversities(uniArr);
    setHostels(hostelArr);
    console.log(hostelArr)
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!isEmailValid(form.email)) {
        toast.error("Please enter a valid email address");
        return;
      }
      // if (form.id == 0) {
      //   if (!form.image) {
      //     toast.error("Please choose the file")
      //     return;
      //   }
      // }
      let imageUrl = form.imageUrl || '';
      const isNewImage = form.image instanceof File;

      // Upload new image if selected
      if (isNewImage) {
        const storageRef = ref(storage, `employee_image/${form.image.name}`);
        await uploadBytes(storageRef, form.image);
        imageUrl = await getDownloadURL(storageRef);
      }
      const password = `${form.name}321`;
      const employeeData = {
        ...form,
        uid,
        password,
        ...(imageUrl && { imageUrl }),
      };
      delete employeeData.id;
      delete employeeData.image;
      const tempApp = initializeApp(firebaseConfig, 'employeeCreator');
      const tempAuth = getAuth(tempApp);

      if (editingData) {
        delete employeeData.password;
        const docRef = doc(db, 'employees', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('Employee does not exist! Cannot update.');
          return;
        }
        const empRef = doc(db, 'employees', form.id);
        await updateDoc(empRef, employeeData);
        await updateDoc(doc(db, "hostel", form.hostelid), {
          adminUID: form.id
        });
        toast.success('Employee updated successfully');
      }
      else {
        const hostelRef = doc(db, "hostel", form.hostelid);
        const hostelSnap = await getDoc(hostelRef);

        if (!hostelSnap.exists()) {
          toast.warn("Hostel not found.");
          return;
        }

        const hostelData = hostelSnap.data();

        if (hostelData.adminUID) {
          toast.warn("This hostel already has an assigned admin.");
          return;
        }
        const userCredential = await createUserWithEmailAndPassword(tempAuth, form.email, password);
        const user = userCredential.user;
        await updateProfile(user, {
          displayName: form.name,
          photoURL: imageUrl,
        })
        const employeeRef = doc(db, "employees", user.uid);
        await setDoc(employeeRef, employeeData);
        await updateDoc(doc(db, "hostel", form.hostelid), {
          adminUID: user.uid
        });
        await addDoc(collection(db, "users", user.uid), {
          uid: user.uid,
          firstname: form.name,
          lastname: '',
          username: form.name,
          email: form.email,
          hostelid: form.hostelid,
          hostel:form.hostel,
          livingtype:'hostel',
          createdby: user.uid,
          createddate: new Date(),
        });
        toast.success('Empoyee created successfully');

      }
      getList()
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName('No file chosen');
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        toast.error('this email already in use')
      }
      console.error("Error saving data:", error);
    }
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const uid = form.id;
      const response = await fetch(
        'https://us-central1-mymor-one.cloudfunctions.net/deleteUserByUid',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ uid }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to send code');
      }
      else if (data.success) {
        if (form.hostelid) {
          await updateDoc(doc(db, 'hostel', form.hostelid), {
            adminUID: null
          });
        }
        await deleteDoc(doc(db, 'employees', form.id));
        toast.success('Successfully deleted!');
        getList()
      }

    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  const handleDisable = async () => {
    if (!deleteData) return;
    try {
      const uid = form.id;
      const response = await fetch(
        'https://us-central1-mymor-one.cloudfunctions.net/disableUserByUid',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to disable user');


      await updateDoc(doc(db, 'employees', form.id), {
        status: 'disabled',
        isActive: false
      });

      if (form.hostelid) {
        await updateDoc(doc(db, 'hostel', form.hostelid), {
          adminUID: null
        });
      }

      toast.success('Account disabled successfully!');
      getList();
    } catch (error) {
      console.error('Error disabling user:', error);
      toast.error('Error disabling account');
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  const handleEnable = async () => {
    if (deleteData) return;
    try {
      alert(form.id)
      const uid = form.id;
      const response = await fetch(
        'https://us-central1-mymor-one.cloudfunctions.net/enableUserByUid',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to enable user');
      await updateDoc(doc(db, 'employees', form.id), {
        status: 'active',
        isActive: true
      });
      if (form.hostelid) {
        await updateDoc(doc(db, 'hostel', form.hostelid), {
          adminUID: form.id
        });
      }
      toast.success('Account enabled successfully!');
      getList();
    } catch (error) {
      console.error('Error enabling user:', error);
      toast.error('Error enabling account');
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

    // const allowedKeys = Object.entries(features)
    //   .filter(([_, enabled]) => enabled === true)
    //   .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
    //   .filter(Boolean);
      const allowedKeys = [
        'dashboard',
        'setting',
        ...Object.entries(features)
          .filter(([_, enabled]) => enabled)
          .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
          .filter(Boolean)
      ];
    setAllowedMenuKeys(allowedKeys);
    setForm((prev) => ({ ...prev, permissions: [] })); 
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Hostel Employee</h1>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hostel</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Mobile No</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Password</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.hostel}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.mobileNo}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.password}</td>
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
                      {item?.imageUrl != "" || item?.imageUrl != undefined ? (<img src={item.imageUrl} width={80} height={80} />) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                    
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          const selectedHostelId = item.hostelid;
                          const selectedHostel = hostels.find(h => h.id === selectedHostelId);
                          const features = selectedHostel?.features || {};
                          const allowedKeys = [
                            'dashboard',
                            'setting',
                            ...Object.entries(features)
                              .filter(([_, enabled]) => enabled)
                              .map(([feature]) => FEATURE_TO_MENU_KEY[feature])
                              .filter(Boolean)
                          ];
                          setSelectedHostel(selectedHostelId);
                          setHostelFeatures(features);
                          setAllowedMenuKeys(allowedKeys);
                          setForm(prev => ({
                            ...prev,
                            ...item,
                            id: item.id,
                            hostelid: selectedHostelId,
                            permissions: item.permissions?.length > 0 ? item.permissions : [],
                            image: null,
                          }));
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      {item.isActive ? (
                        <button
                          className="text-red-600 hover:underline"
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
                          className="text-green-600 hover:underline"
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
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Create Employee</h2>
            <form onSubmit={handleSubmit} className="space-y-4" >
              <div className="space-y-4">
                <input name="name" placeholder="Full Name" value={form.name}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <input name="email" placeholder="Email" value={form.email} disabled={editingData}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                {form.email && !isEmailValid(form.email) && (
                  <p className="text-red-500 text-sm mt-1">Invalid email format</p>
                )}
                <input name="mobileNo" placeholder="Mobile No" type="number" min={0} value={form.mobileNo} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <textarea name="address" placeholder="Address" value={form.address} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>

                <select name="hostelid" value={form.hostelid}
                  onChange={(e) => {
                    const selectedHostelId = e.target.value;
                    const selectedHostel = hostels.find(h => h.id === selectedHostelId);
                    setForm({
                      ...form,
                      hostelid: selectedHostelId,
                      hostel: selectedHostel?.name || "",
                    });
                    handleHostelChange(e)
                  }}
                  className="w-full border border-gray-300 p-2 rounded" required >
                  <option value="">Select Hostel</option>
                  {hostels.map((item, i) => (
                    <option value={item.id}>{item.name} - {item.location}</option>
                  ))}
                </select>
                <input name="domain" placeholder="Domain" value={form.domain}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
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
                    onChange={(e) => setForm({ ...form, permissions: e.target.value })}
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
                onClick={handleDisable}
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
