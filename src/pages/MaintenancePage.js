import React, { useState, useEffect, useRef } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db, storage } from "../../src/firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useReactToPrint } from "react-to-print";
export default function MaintenancePage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1);
  const [fileName, setFileName] = useState('No file chosen');
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [viewData, setViewData] = useState(null);
  const contentRef = useRef(null);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0
  });
  const [filterOptions, setFilterOptions] = useState({
    statuses: [],
    problemCategories: [],
    locations: []
  });
  const uid = useSelector((state) => state.auth.user.uid);
  const initialForm = {
    id: 0, roomno: "", problemcategory: "", itemcategory: "", item: "", description: "", cause: "", comments: "", image: null,
  }
  const [form, setForm] = useState(initialForm);
  const pageSize = 10;
  const mockData = list
  const totalPages = Math.ceil(mockData.length / pageSize);
  const paginatedData = mockData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
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
    const total = maintenanceWithuser.length;
    const pending = maintenanceWithuser.filter(item => item.status === "Pending").length;
    const inProgress = maintenanceWithuser.filter(item => item.status === "In Progress").length;
    const resolved = maintenanceWithuser.filter(item => item.status === "Resolved").length;
    const closed = maintenanceWithuser.filter(item => item.status === "Closed").length;

    setStats({ total, pending, inProgress, resolved, closed });
    const unique = (arr) => [...new Set(arr.filter(Boolean))];

    const statuses = unique(maintenanceWithuser.map(item => item.status));
    const problemCategories = unique(maintenanceWithuser.map(item => item.problemcategory));
    const locations = unique(maintenanceWithuser.map(item => item.roomno));

    setFilterOptions({ statuses, problemCategories, locations });
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
          status: 'Resolved'
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
          status: 'Pending'
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
    setForm(initialForm);
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
  const openView = (row) => {
    setViewData(row);
    setViewModalOpen(true);
  };

  const handlePrint = useReactToPrint({ contentRef });
  const updateStatus = async (id, newStatus) => {
    try {
      const requestRef = doc(db, 'Maintenance', id);
      await updateDoc(requestRef, { status: newStatus });
      toast.success("Status updated!");
      getList();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status.");
    }
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Maintenance</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}>
          + Add
        </button>

      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-center">

        <div className="bg-white rounded-xl shadow p-2">
          <div className="text-lg font-bold">{stats.total}</div>
          <div className="text-gray-500 text-xs">Total</div>
        </div>
        <div className="bg-white rounded-xl shadow p-2">
          <div className="text-lg font-bold">{stats.pending}</div>
          <div className="text-gray-500 text-xs">Pending</div>
        </div>
        <div className="bg-white rounded-xl shadow p-2">
          <div className="text-lg font-bold">{stats.inProgress}</div>
          <div className="text-gray-500 text-xs">In Progress</div>
        </div>
        <div className="bg-white rounded-xl shadow p-2">
          <div className="text-lg font-bold">{stats.resolved}</div>
          <div className="text-gray-500 text-xs">Resolved</div>
        </div>
        <div className="bg-white rounded-xl shadow p-2">
          <div className="text-lg font-bold">{stats.closed}</div>
          <div className="text-gray-500 text-xs">Closed</div>
        </div>
      </div>

      {/* <div className="grid grid-cols-4 gap-4">
        <select className="p-2 rounded border border-gray-300">
          <option>Status</option>
          {filterOptions.statuses.map((status, idx) => (
            <option key={idx} value={status}>{status}</option>
          ))}
        </select>
        <select className="p-2 rounded border border-gray-300">
          <option>Request Type</option>
          {filterOptions.problemCategories.map((type, idx) => (
            <option key={idx} value={type}>{type}</option>
          ))}
        </select>
        <select className="p-2 rounded border border-gray-300">
          <option>Location</option>
          {filterOptions.locations.map((loc, idx) => (
            <option key={idx} value={loc}>{loc}</option>
          ))}
        </select>
        <select className="p-2 rounded border border-gray-300">
          <option>Date Range Jan 1, 2024 - Dec 31</option>
        
        </select>
      </div> */}
      <br />
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
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.uid}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.username}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.problemcategory}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{item.roomno}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.createdDate}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">

                      <div className="mb-2">
                        <span
                          className={`px-3 py-1 rounded-full text-white text-xs font-semibold
                           ${item.status === 'Pending' ? 'bg-yellow-500' :
                              item.status === 'In Progress' ? 'bg-blue-500' :
                                item.status === 'Resolved' ? 'bg-green-500' :
                                  item.status === 'Closed' ? 'bg-gray-500' : 'bg-red-500'
                            }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      {item.status !== 'Resolved' && item.status !== 'Closed' && (
                        <select
                          value={item.status}
                          onChange={(e) => updateStatus(item.id, e.target.value)}
                          className="w-full border border-gray-300 p-1 rounded text-xs bg-white focus:outline-none"
                        >
                          <option value="">Update Status</option>
                          {item.status !== 'Pending' && <option value="Pending">Pending</option>}
                          {item.status !== 'In Progress' && <option value="In Progress">In Progress</option>}
                          <option value="Resolved">Resolved</option>
                          <option value="Closed">Closed</option>
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => openView(item)}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        View
                      </button>
                      <br />
                      <button
                        onClick={() => openView(item)}
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        Print
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
                <textarea className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, description: e.target.value })} />
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
      {viewModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Maintenance Request</h2>

            {/* printable area */}
            <div ref={contentRef} className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">


                <span className="font-medium">User:</span>
                <span>{viewData?.username}</span>

                <span className="font-medium">Room No.:</span>
                <span>{viewData?.roomno}</span>

                <span className="font-medium">Problem Category:</span>
                <span>{viewData?.problemcategory}</span>

                <span className="font-medium">Item Category:</span>
                <span>{viewData?.itemcategory}</span>

                <span className="font-medium">Item:</span>
                <span>{viewData?.item}</span>

                <span className="font-medium">Description:</span>
                <span className="col-span-1">{viewData?.description}</span>

                <span className="font-medium">Cause:</span>
                <span className="col-span-1">{viewData?.cause || "—"}</span>

                <span className="font-medium">Comments:</span>
                <span className="col-span-1">{viewData?.comments || "—"}</span>


              </div>

              {viewData?.imageUrl && (
                <img
                  src={viewData.imageUrl}
                  alt="uploaded"
                  className="mt-4 w-[250px] h-[250px] object-cover rounded-lg border"
                />
              )}
            </div>

            {/* modal footer */}
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setViewModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
              <button
                onClick={() => handlePrint()}
                className="px-4 py-2 bg-black text-white rounded hover:bg-black"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}
      {printModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-6xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div ref={contentRef}>
              <h2 className="text-xl font-bold mb-4">All Maintenance Requests</h2>
              <table className="min-w-full text-sm border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border p-2">User</th>
                    <th className="border p-2">Room No.</th>
                    <th className="border p-2">Issue Type</th>
                    <th className="border p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item, idx) => (
                    <tr key={idx} className="odd:bg-white even:bg-gray-50">

                      <td className="border p-2">{item.username}</td>
                      <td className="border p-2">{item.roomno}</td>
                      <td className="border p-2">{item.problemcategory}</td>
                      <td className="border p-2">{item.status || "New"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setPrintModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
