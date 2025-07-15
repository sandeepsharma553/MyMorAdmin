import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
const HostelPage = (props) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [universities, setUniversities] = useState([]);
  const [isLoading, setIsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1);
  const uid = useSelector((state) => state.auth.user.uid);
  const initialForm = {
    id: 0,
    name: '',
    uniIds: [],
    location: ''
  }
  const [form, setForm] = useState(initialForm);
  const pageSize = 10;
  const mockData = list
  const filteredData = mockData

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

    try {
      const [uniSnap, hostelSnap] = await Promise.all([
        getDocs(collection(db, 'university')),
        getDocs(collection(db, 'hostel')),
      ]);

      const uniArr = uniSnap.docs.map(d => ({ id: d.id, name: d.data().name }));
      const uniMap = uniArr.reduce((acc, cur) => {
        acc[cur.id] = cur.name;
        return acc;
      }, {});

      const hostelArr = hostelSnap.docs.map(d => {
        const { name, uniIds = [],location } = d.data();
        const universityNames = (uniIds)
          .map(id => uniMap[id] ?? "Unknown");   
        return { id: d.id, name, uniIds, universityNames,location };
      });

      setList(hostelArr);
      setUniversities(uniArr);
    } catch (err) {
      console.error('getList error:', err);
    } finally {
      setIsLoading(false);
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    if (!form.uniIds) {

      toast.warning("Please select a university");
      return;
    }
    if (editingData) {
      try {
        const docRef = doc(db, 'hostel', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('hostel does not exist! Cannot update.');
          return;
        }
        await updateDoc(doc(db, 'hostel', form.id), {
          uid: uid,
          name: form.name,
          uniIds: form.uniIds,
          location: form.location,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success('Successfully updated');
        getList()
      } catch (error) {
        console.error('Error updating document: ', error);
      }
    } else {

      try {
        const q = query(collection(db, 'hostel'), where('name', '==', form.name));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          toast.warn('Duplicate found! Not adding.');
          return;
        }
        await addDoc(collection(db, "hostel"), {
          uid: uid,
          name: form.name,
          uniIds: form.uniIds,
          location: form.location,
          adminUID: null,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
        getList()
      } catch (error) {
        console.error("Error saving data:", error);
      }
    }

    // Reset
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const hostelRef = doc(db, "hostel", form.id);
      const hostelSnap = await getDoc(hostelRef);
    
      if (!hostelSnap.exists()) {
        toast.warn("Hostel not found!");
        return;
      }
      const hostelData = hostelSnap.data();

      if (hostelData.adminUID) {
        toast.warn("Cannot delete hostel. Admin already assigned.");
        return;
      }
      await deleteDoc(hostelRef);
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
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Hostel</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <div>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" loading={isLoading} />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hostel</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">University</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
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
                  paginatedData.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      <ul className="list-disc list-inside space-y-1">
                        {item.universityNames.map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                        setEditing(item);
                        setForm(item);
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
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add New</h2>
            <form onSubmit={handleAdd} className="space-y-4" >
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                className="w-full border border-gray-300 p-2 rounded"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <Select
                className="w-full border border-gray-300 p-2 rounded"
                multiple
                displayEmpty
                required
                value={form.uniIds}
                onChange={(e) => setForm({ ...form, uniIds: e.target.value })}
                renderValue={(selected) =>
                  selected.length
                    ? selected.map((id) => {
                      const uni = universities.find((u) => u.id === id);
                      return uni?.name || '';
                    }).join(", ")
                    : "Select University"
                }
              >
                {universities.map(({ id, name }) => (
                  <MenuItem key={id} value={id}>
                    <Checkbox checked={form.uniIds.includes(id)} />
                    <ListItemText primary={name} />
                  </MenuItem>
                ))}
              </Select>
              <input
                  type="text"
                  placeholder="Location"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                />
               
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
                Save
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
};

export default HostelPage;
