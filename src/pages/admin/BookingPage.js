import React, { useState, useEffect, useRef } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { DateRange } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { enUS } from 'date-fns/locale';
import { format, parse, isValid } from 'date-fns';
export default function BookingPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [listOpen, setListModelOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [list, setList] = useState([])
  const [bookingTypeList, setBookingTypeList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee)
  const [currentPage, setCurrentPage] = useState(1);
  const [roomFilter, setRoomFilter] = useState("All");
  const [rooms, setRooms] = useState([]);
  const [range, setRange] = useState([
    {
      startDate: new Date(new Date().setMonth(new Date().getMonth() - 2)),
      endDate: new Date(),
      key: 'selection'
    }
  ]);
  const [showPicker, setShowPicker] = useState(false);
  const [formattedRange, setFormattedRange] = useState('');
  const pickerRef = useRef();
  const initialForm = {
    id: 0, roomname: '', description: '', location: ''
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
    getList();
  }, [roomFilter, range]);
  const getList = async () => {
    setIsLoading(true);

    const usersQuery = query(
         collection(db, 'users'),
         where('hostelid', '==', emp.hostelid)
       );
       
   const userSnap = await getDocs(usersQuery);
    const userMap = {};
    userSnap.forEach(doc => {
      const data = doc.data();
      userMap[data.uid] = {
        username: data.username || data.UserName || data.USERNAME || "Unknown",
        email: data.email || "No email"
      };
    });

    const bookingSnap = await getDocs(collection(db, 'bookingroom'));
    const allBookings = bookingSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      username: userMap[doc.data().uid]?.username || "Unknown",
      email: userMap[doc.data().uid]?.email || "N/A"
    }));
    const roomFiltered = roomFilter === "All"
      ? allBookings
      : allBookings.filter(b => b.roomname === roomFilter);

    const startDate = toLocalDateOnly(range[0].startDate);
    const endDate = toLocalDateOnly(range[0].endDate);
    const dateFiltered = roomFiltered.filter(b => {
      if (!b.date) return false;
      let bookingDate;
      if (/\d{4}-\d{2}-\d{2}/.test(b.date)) {
        bookingDate = new Date(b.date);
      } else {
        bookingDate = parse(b.date, 'dd/MM/yyyy', new Date());
      }
      if (!isValid(bookingDate)) {
        console.warn("Invalid booking date:", b.date);
        return false;
      }
      bookingDate.setHours(0, 0, 0, 0);
      return bookingDate >= startDate && bookingDate <= endDate;
    });
    const bookingTypeQuery = query(
      collection(db, 'bookingroomtype'),
      where('hostelid', '==', emp.hostelid)
    );
    
    const bookingTypeSnap = await getDocs(bookingTypeQuery);
    
    const BookingType = bookingTypeSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    const uniqueRooms = Array.from(new Set(BookingType.map(b => b.roomname))).filter(Boolean);
    setRooms(["All", ...uniqueRooms]);
    setBookingTypeList(BookingType)
    setList(dateFiltered);
    setCurrentPage(1);
    setIsLoading(false);
  };
  const toLocalDateOnly = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.roomname) return;
    try {
      if (editingData) {
        const docRef = doc(db, 'bookingroomtype', form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning('BookingRoom does not exist! Cannot update.');
          return;
        }
        await updateDoc(doc(db, 'bookingroomtype', form.id), {
          uid: uid,
          roomname: form.roomname,
          description: form.description,
          location: form.location,
          // date: form.date,
          // time: form.time,
          hostelid:emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success('Successfully updated');
      } else {

        await addDoc(collection(db, "bookingroomtype"), {
          uid: uid,
          roomname: form.roomname,
          description: form.description,
          location: form.location,
          // date: form.date,
          // time: form.time,
          // status: 'Booked'
          hostelid:emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");

      }
    } catch (e) { console.log('errer', e) }
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    getList()
    setListModelOpen(true)
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'bookingroomtype', form.id));
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
    setListModelOpen(true)
  };
  const handleReject = async () => {
    if (!editingData) return;
    try {
      const bookingRef = doc(db, 'bookingroom', editingData.id);
      await updateDoc(bookingRef, {
        status: 'Rejected',
        updatedBy: uid,
        updatedDate: new Date(),
      });
      toast.success("Booking has been rejected.");
      getList();
    } catch (error) {
      console.error('Error rejecting booking: ', error);
      toast.error("Failed to reject booking.");
    }
    setConfirmRejectOpen(false);
    setEditing(null);
  };
  const handleRangeChange = (ranges) => {
    const selected = ranges.selection;
    setRange([selected]);

    if (selected.startDate && selected.endDate) {
      const formatted = `${format(selected.startDate, 'MM/dd/yyyy')} - ${format(selected.endDate, 'MM/dd/yyyy')}`;
      setFormattedRange(formatted);
      setShowPicker(false);
    }
  };

  return (
    <main className="flex-1 p-1 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Booking</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setListModelOpen(true);
          }}>
          Manage Room Types
        </button>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      <h2 className="text-lg font-semibold">Room Type</h2>
      <div className="flex items-center space-x-4">
        <select
          className="border px-3 py-2 rounded text-sm"
          value={roomFilter}
          onChange={(e) => setRoomFilter(e.target.value)}
        >
          {rooms.map(room => (
            <option key={room} value={room}>{room}</option>
          ))}
        </select>


        {/* <input
          type="date"
          className="border rounded-md px-4 py-2 w-full"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        /> */}
        <div>
          <input
            type="text"
            readOnly
            value={formattedRange}
            onClick={() => setShowPicker(!showPicker)}
            className="w-full border border-gray-300 p-2 rounded"
          />
          {showPicker && (
            <div
              ref={pickerRef}
              style={{
                position: 'absolute',
                top: 50,
                zIndex: 1000,
                boxShadow: '0px 2px 10px rgba(0,0,0,0.2)'
              }}
            >
              <DateRange
                editableDateInputs={true}
                onChange={handleRangeChange}
                moveRangeOnFirstSelection={false}
                ranges={range}
                locale={enUS}

              />
            </div>
          )}
        </div>
      </div>
      <div className="p-4 space-y-4  ">
        {/* 
       
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
        </div> */}
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Username</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Time</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                    No matching data found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 text-sm text-gray-800">{item.username}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{item.email}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.date}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{item.time}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${item.status === 'Rejected' ? 'bg-red-200 text-red-800' :
                        item.status === 'Approved' ? 'bg-green-200 text-green-800' :
                          'bg-yellow-200 text-yellow-800'
                        }`}>
                        {item.status}
                      </span></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.status !== 'Rejected' && (
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing(item);
                            setConfirmRejectOpen(true);
                          }}
                        >
                          Reject
                        </button>
                      )}
                      {/* <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                        setEditing(item);
                        setForm(item);
                        setModalOpen(true);
                      }}>Edit</button>
                      <button className="text-red-600 hover:underline" onClick={() => {
                        setDelete(item);
                        setForm(item);
                        setConfirmDeleteOpen(true);
                      }}>Delete</button> */}
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
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Room Name</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.roomname}
                  onChange={(e) => setForm({ ...form, roomname: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Description</label>
                <textarea
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Location</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  required
                />
                {/* <label className="block font-medium mb-1">Date</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Time</label>
                <input
                  type="time"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  required
                /> */}
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Booking Type</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.roomname}</strong>?</p>
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
      {confirmRejectOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Booking Reject</h2>
            <p className="mb-4"> Are you sure you want to reject this booking <strong>{editingData?.roomname}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmRejectOpen(false);
                  setEditing(false);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
      {listOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[90%] max-w-4xl shadow-lg max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Manage Room Types</h2>
              <button
                className="text-gray-600 hover:text-gray-800"
                onClick={() => setListModelOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="overflow-x-auto bg-white rounded shadow">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Room Name</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bookingTypeList.map((roomData, index) => {
                    return (
                      <tr key={index}>
                        <td className="px-6 py-4 text-sm text-gray-800">{roomData.roomname}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{roomData.description}</td>
                        <td className="px-6 py-4 text-sm text-gray-600">{roomData.location}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            className="text-blue-600 hover:underline mr-3"
                            onClick={() => {
                              setEditing(roomData);
                              setForm({ ...roomData, id: roomData.id });
                              setModalOpen(true);
                              setListModelOpen(false)
                            }}
                          >
                            Edit
                          </button>
                          <button
                            className="text-red-600 hover:underline"
                            onClick={() => {
                              setForm(roomData);
                              setDelete(roomData);
                              setConfirmDeleteOpen(true);
                              setListModelOpen(false)
                            }}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      <ToastContainer />
    </main>
  );
}
