import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db, storage } from "../../src/firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
export default function MaintenancePage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, roomno: "", problemcategory: "", itemcategory: "", item: "", description: "", cause: "", comments: "", image: null, });
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState('No file chosen');
      const uid = useSelector((state) => state.auth.user.uid);
  useEffect(() => {
    getList()
  }, [])
  const getList = async () => {
    setIsLoading(true)

    const querySnapshot = await getDocs(collection(db, 'User'));
    const userMap = {};
    querySnapshot.forEach(doc => {
      const data = doc.data();

      const username =
        data.username || 
        data.UserName || 
        data.USERNAME || 
        "Unknown"; // fallback if none found
      userMap[doc.data().uid] = username
    });
  
    // Step 2: Get all hostels
    const maintenanceSnapshot = await getDocs(collection(db, 'Maintenance'));
    const maintenanceWithuser = maintenanceSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...doc.data(),
        username: userMap[data.uid] || ""
      };
    });

    setList(maintenanceWithuser)
    setIsLoading(false)
   
  }
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.roomno) return;
    setIsLoading(true)
    let imageUrl = "";
    if (form.image) {
      const imageRef = ref(storage, `maintenance/${Date.now()}_${form.image.name}`);
      await uploadBytes(imageRef, form.image);
      imageUrl = await getDownloadURL(imageRef);
    }
    if (editingData) {
      try {
        const docRef = doc(db, 'Maintenance', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('Maintenance does not exist! Cannot update.');
          return;
        }
        await updateDoc(doc(db, 'Maintenance', form.id), {
          uid: uid,
          roomno: form.roomno,
          problemcategory: form.problemcategory,
          itemcategory: form.itemcategory,
          item: form.item,
          description: form.description,
          cause: form.cause,
          comments: form.comments,
          imageUrl,
          updatedBy: uid,
          updatedDate: new Date(),
          status:'Resolved'
        });
        toast.success('Successfully updated');
        getList()
      } catch (error) {
        console.error('Error updating document: ', error);
      }
    } else {
      try {
        await addDoc(collection(db, "Maintenance"), {
          uid: uid,
          roomno: form.roomno,
          problemcategory: form.problemcategory,
          itemcategory: form.itemcategory,
          item: form.item,
          description: form.description,
          cause: form.cause,
          comments: form.comments,
          imageUrl,
          createdBy: uid,
          createdDate: new Date(),
          status:'Pending'
        });
        toast.success("Successfully saved");
        getList()
      } catch (error) {
        console.error("Error saving data:", error);
      }
    }
    setIsLoading(false)
    // Reset
    setModalOpen(false);
    setEditing(null);
    setForm({ id: 0, roomno: "", problemcategory: "", itemcategory: "", item: "", description: "", cause: "", comments: "", image: null, });
    setFileName('No file chosen');
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'Maintenance', form.id));
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
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm({ id: 0, roomno: "", problemcategory: "", itemcategory: "", item: "", description: "", cause: "", comments: "", image: null, });
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      <div className="p-4 space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-5 gap-4 text-center">
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-gray-500 text-sm">Quick Stats</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">125</div>
            <div className="text-gray-500 text-sm">Total</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">29</div>
            <div className="text-gray-500 text-sm">Pending</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">10</div>
            <div className="text-gray-500 text-sm">In Progress</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-gray-500 text-sm">In Progress Submitted On</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-gray-500 text-sm">Completed Status</div>
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <div className="text-2xl font-bold">4</div>
            <div className="text-gray-500 text-sm">Actions</div>
          </div>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-4 gap-4">
          <select className="p-2 rounded border border-gray-300">
            <option>Status</option>
          </select>
          <select className="p-2 rounded border border-gray-300">
            <option>Request Type</option>
          </select>
          <select className="p-2 rounded border border-gray-300">
            <option>Location</option>
          </select>
          <select className="p-2 rounded border border-gray-300">
            <option>Date Range Jan 1, 2024 - Dec 31</option>
          </select>
        </div>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Request ID</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">User</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Issue Type</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Submitted On</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((item, i) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.uid}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.username}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.problemcategory}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">{item.roomno}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.createdDate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">New</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">View</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Room Number</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.roomno}
                  onChange={(e) => setForm({ ...form, roomno: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Problem Category</label>
                <select className="w-full border border-gray-300 p-2 rounded"
                value={form.problemcategory} onChange={(e) => setForm({ ...form, problemcategory: e.target.value })} required>
                  <option value="">select</option>
                  <option value="Shower">Shower</option>
                  <option value="Sink">Sink</option>
                  <option value="HotPlate">Hot Plate</option>
                  <option value="AC">AC</option>
                  <option value="Door">Door</option>
                  <option value="Window">Window</option>
                  <option value="Lighting">Lighting</option>
                </select>
                <label className="block font-medium mb-1">Item Category</label>
                <select className="w-full border border-gray-300 p-2 rounded"
                value={form.itemcategory} onChange={(e) => setForm({ ...form, itemcategory: e.target.value })} required>
                  <option value="">select</option>
                  <option value="Shower">Shower</option>
                  <option value="Sink">Sink</option>
                  <option value="HotPlate">Hot Plate</option>
                  <option value="AC">AC</option>
                  <option value="Door">Door</option>
                  <option value="Window">Window</option>
                  <option value="Lighting">Lighting</option>
                </select>
                <label className="block font-medium mb-1">Item</label>
                <select className="w-full border border-gray-300 p-2 rounded" 
                value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })} required>
                  <option value="">select</option>
                  <option value="Shower">Shower</option>
                  <option value="Sink">Sink</option>
                  <option value="HotPlate">Hot Plate</option>
                  <option value="AC">AC</option>
                  <option value="Door">Door</option>
                  <option value="Window">Window</option>
                  <option value="Lighting">Lighting</option>
                </select>
                <label className="block font-medium mb-1">Description</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, description: e.target.value })}/>
                <label className="block font-medium mb-1">Cause (Optional)</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, cause: e.target.value })} />
                <label className="block font-medium mb-1">Comments</label>
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, comments: e.target.value })} />
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input type="file" accept=".xlsx, .xls, .jpg,.png" className="hidden"
                      onChange={(e) => {
                        if (e.target.files.length > 0) {
                          setFileName(e.target.files[0].name);
                        } else {
                          setFileName('No file chosen');
                        }
                        if (e.target.files[0]) {
                        setForm({ ...form, image: e.target.files[0] })
                        }
                      }}
                    />
                    📁 Choose File
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">
                    {fileName}
                  </span>
                </div>
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
}
