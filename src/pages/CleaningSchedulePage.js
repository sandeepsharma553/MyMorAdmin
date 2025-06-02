import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { useSelector } from "react-redux";
import { ref, set } from 'firebase/database';
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
export default function CleaningSchedulePage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  const [modalOpen, setModalOpen] = useState(false);
  const [newData, setNew] = useState({ roomtype: '', id: 0, time: '', hall: '' });
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const uid = useSelector((state) => state.auth.user);
  useEffect(() => {
    getList()
    const day = getDayFromDate()
    setNew({ ...newData, day: day })
  }, [])
  const getDayFromDate = () => {
    const date = new Date;
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const getList = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'CleaningSchedule'));
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setList(documents)
    setIsLoading(false)
  }
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newData.roomtype) return;
    if (editingData) {
      try {
        const docRef = doc(db, 'CleaningSchedule', newData.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('CleaningSchedule does not exist! Cannot update.');
          return;
        }
        await updateDoc(doc(db, 'CleaningSchedule', newData.id), {
          uid: uid,
          roomtype: newData.roomtype,
          hall: newData.hall,
          day: newData.day,
          time: newData.time,
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
        await addDoc(collection(db, "CleaningSchedule"), {
          uid: uid,
          roomtype: newData.roomtype,
          hall: newData.hall,
          day: newData.day,
          time: newData.time,
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
    setNew({ roomtype: '', id: 0, time: '', hall: '' });
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'CleaningSchedule', newData.id));
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
        <h1 className="text-2xl font-semibold">Cleaning Schedule</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setNew({ roomtype: '', id: 0,  time: '', hall: '' });
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Room Type</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hall</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Day</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Time</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.roomtype}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.hall}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.day}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.time}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                        setEditing(item);
                        setNew(item);
                        setModalOpen(true);
                      }}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => {
                        setDelete(item);
                        setNew(item);
                        setConfirmDeleteOpen(true);
                      }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>


      </div>
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-4">
              <label className="block font-medium mb-1">Room Type</label>
              <input
                type="text"
                className="w-full border border-gray-300 p-2 rounded"
                value={newData.roomtype}
                onChange={(e) => setNew({ ...newData, roomtype: e.target.value })}
                required
              />
              <label className="block font-medium mb-1">Hall</label>
              <input
                type="text"
                className="w-full border border-gray-300 p-2 rounded"
                value={newData.hall}
                onChange={(e) => setNew({ ...newData, hall: e.target.value })}
                required
              />
              <label className="block font-medium mb-1">Day</label>
              <input
                type="text"
                className="w-full border border-gray-300 p-2 rounded"
                value={newData.day}
                onChange={(e) => setNew({ ...newData, day: e.target.value })}
                required
              />
              <label className="block font-medium mb-1">Time</label>
              <input
                type="text"
                className="w-full border border-gray-300 p-2 rounded"
                value={newData.time}
                onChange={(e) => setNew({ ...newData, time: e.target.value })}
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
}
