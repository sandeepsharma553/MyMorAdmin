import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../src/firebase";
import { useSelector } from "react-redux";
import { ref, set } from 'firebase/database';
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
export default function BookingPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  const [roomType, setRoomType] = useState('Study Room');
  const [date, setDate] = useState('2025-05-14');
  const [selectedTime, setSelectedTime] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [newData, setNew] = useState({ roomname: '', id: 0, time: '', date: '',status:'' });
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const uid = useSelector((state) => state.auth.user);
  const times = ['9:00 AM', '10:00 AM', '11:00 AM', '2:00 AM'];
  useEffect(() => {
    getList()
  }, [])
  const getList = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'BookingRoom'));
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setList(documents)
    setIsLoading(false)
    console.log(documents)
  }
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newData.roomname) return;
    if (editingData) {
      try {
        const docRef = doc(db, 'BookingRoom', newData.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('BookingRoom does not exist! Cannot update.');
          return;
        }
        await updateDoc(doc(db, 'BookingRoom', newData.id), {
          uid: uid,
          roomname: newData.roomname,
          date: newData.date,
          time: newData.time,
          status:'Active',
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
        await addDoc(collection(db, "BookingRoom"), {
          uid: uid,
          roomname: newData.roomname,
          date: newData.date,
          time: newData.time,
          status:'Booked'
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
    setNew({ roomname: '', id: 0, time: '', date: '',status:'' });
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'BookingRoom', newData.id));
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
        <h1 className="text-2xl font-semibold">Booking</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setNew({ roomtype: '', id: 0, time: '', date: '',status:'' });
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      <h2 className="text-lg font-semibold">Room Type</h2>
      <div className="flex items-center space-x-4">


        {/* Room Type Dropdown */}
        <select
          className="border rounded-md px-4 py-2 w-full"
          value={roomType}
          onChange={(e) => setRoomType(e.target.value)}
        >
          <option>Study Room</option>
          <option>Meeting Room</option>
          <option>Conference Room</option>
        </select>

        {/* Date Picker */}
        <input
          type="date"
          className="border rounded-md px-4 py-2 w-full"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>
      <div className="p-4 space-y-4  ">

        {/* Time Buttons */}
        <div className="flex flex-wrap gap-2">
          {times.map((time) => (
            <button
              key={time}
              onClick={() => setSelectedTime(time)}
              className={`px-4 py-2 border rounded-md ${selectedTime === time ? 'bg-blue-500 text-white' : 'bg-white'
                }`}
            >
              {time}
            </button>
          ))}
          <button className="px-4 py-2 border rounded-md bg-white">Add Room</button>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Room Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Time</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Bookimg Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((item, i) => (
                <tr key={i}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.roomname}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.date}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.time}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    Booked

                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Room Name</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={newData.roomname}
                  onChange={(e) => setNew({ ...newData, roomname: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={newData.date}
                  onChange={(e) => setNew({ ...newData, date: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Time</label>
                <input
                  type="time"
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
