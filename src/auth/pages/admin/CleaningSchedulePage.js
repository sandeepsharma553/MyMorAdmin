import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, setDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import * as XLSX from "xlsx";
import cleaningscheduleFile from "../../../assets/excel/cleaning_schedule.xlsx";
export default function CleaningSchedulePage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [fileName, setFileName] = useState('No file chosen');
  const [data, setData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false)
  const uid = useSelector((state) => state.auth.user.uid);
  const initialForm = {
    id: 0,
    roomtype: '',
    time: '',
    hall: '',
    day: '',
    date: ''
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
  const getDayFromDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const getList = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'cleaningschedule'));
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
    if (!form.roomtype) return;
    if (editingData) {
      try {
        const docRef = doc(db, 'cleaningschedule', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('CleaningSchedule does not exist! Cannot update.');
          return;
        }
        await updateDoc(doc(db, 'cleaningschedule', form.id), {
          uid: uid,
          roomtype: form.roomtype,
          hall: form.hall,
          day: form.day,
          time: form.time,
          date: form.date,
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
        await addDoc(collection(db, "cleaningschedule"), {
          uid: uid,
          roomtype: form.roomtype,
          hall: form.hall,
          day: form.day,
          time: form.time,
          date: form.date,
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
      await deleteDoc(doc(db, 'cleaningschedule', form.id));
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  const readExcel = (file) => {
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const cleanedData = jsonData.map((row) => {
        const date = typeof row.Date === 'number'
          ? XLSX.SSF.format("yyyy-mm-dd", row.Date)
          : new Date(row.Date).toISOString().split("T")[0];

        return {
          roomtype: row["Room Type"] || '',
          hall: row["Hall"] || '',
          day: row["Day"] || '',
          time: row["Time"] || '',
          date,
        };
      });

      setData(cleanedData);
      setIsLoading(false);
      // toast.success("Excel file read successfully!");
    };
    reader.readAsBinaryString(file);
  };

  const saveToFirebase = async () => {
    try {
      for (const entry of data) {
        const q = query(
          collection(db, "cleaningschedule"),
          where("roomtype", "==", entry.roomtype),
          where("date", "==", entry.date),
          where("hall", "==", entry.hall)
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          toast.warn(`Duplicate found for ${entry.roomtype} on ${entry.date} in ${entry.hall}. Skipping...`);
          continue;
        }

        await addDoc(collection(db, "cleaningschedule"), {
          ...entry,
          createdBy: uid,
          createdDate: new Date(),
        });
      }

      toast.success("Cleaning schedule saved (duplicates skipped)!");
      getList();
      setFileName("No file chosen");
      setData([]);
    } catch (error) {
      console.error("Error saving data: ", error);
    }

  };
  const handleDownload = async () => {
    const response = await fetch(cleaningscheduleFile);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "cleaning_schedule.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">

      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <h1 className="text-2xl font-semibold">Cleaning Schedule</h1>
        <div className="flex items-center gap-4 flex-wrap">
          <button className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition" onClick={handleDownload}>Download Excel File</button>
          <div className="flex items-center gap-4 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
            <label className="cursor-pointer">
              <input type="file" accept=".xlsx, .xls" className="hidden"
                onChange={(e) => {
                  if (e.target.files.length > 0) {
                    setFileName(e.target.files[0].name);
                  } else {
                    setFileName('No file chosen');
                  }
                  const file = e.target.files[0];
                  if (file) readExcel(file);
                }}
              />
              📁 Choose File
            </label>
            <span className="text-sm text-gray-600 truncate max-w-[150px]">
              {fileName}
            </span>
          </div>
          <button className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
            disabled={!data.length}
            onClick={saveToFirebase}>
            Upload Excel
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
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                      No matching users found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.roomtype}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.hall}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.day}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.time}</td>
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
          <div className="bg-white p-6 rounded-lg w-96  shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add Cleaning Schedule</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <label className="block font-medium mb-1">Room Type</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.roomtype}
                  onChange={(e) => setForm({ ...form, roomtype: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Hall</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.hall}
                  onChange={(e) => setForm({ ...form, hall: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Date:</label>
                <input
                  type="date"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.date}
                  onChange={(e) => {
                    const selectedDate = e.target.value;

                    const day = getDayFromDate(selectedDate);
                    setForm(prev => ({ ...prev, date: selectedDate, day }));
                  }}
                  required
                />

                <label className="block font-medium mb-1">Day</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Time</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Cleaning Schedule </h2>
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
