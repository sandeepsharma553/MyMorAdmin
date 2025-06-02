import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db, storage } from "../../src/firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
export default function EventPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, title: "", datetime: "", location:"", description: "",image: null, });
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
    const [fileName, setFileName] = useState('No file chosen');
  const uid = useSelector((state) => state.auth.user);
  useEffect(() => {
    getList()
  }, [])
  const getDayFromDate = () => {
    const date = new Date;
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const getList = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'Event'));
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
    if (!form.title) return;
    let imageUrl = "";
    if (form.image) {
      const imageRef = ref(storage, `maintenance/${Date.now()}_${form.image.name}`);
      await uploadBytes(imageRef, form.image);
      imageUrl = await getDownloadURL(imageRef);
    }
    if (editingData) {
      try {
        const docRef = doc(db, 'Event', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('Event does not exist! Cannot update.');
          return;
        }
        const eventRef = doc(db, 'Event', form.id);
        const updateData = {
          uid: uid,
          title: form.title,
          datetime: form.datetime,
          location: form.location,
          description: form.description,
          updatedBy: uid,
          updatedDate: new Date(),
        };
        
        // Conditionally add or remove imageUrl
        if (imageUrl) {
          updateData.imageUrl = imageUrl;
        }
        await updateDoc(eventRef, updateData);
        toast.success('Successfully updated');
        getList()
      } catch (error) {
        console.error('Error updating document: ', error);
      }
    } else {
      try {
        await addDoc(collection(db, "Event"), {
          uid: uid,
          title: form.title,
          datetime: form.datetime,
          location:form.location,
          description: form.description,
          imageUrl,
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
    setForm({ id: 0, title: "", datetime: "", location:"", description: "",image: null, });
    setFileName('No file chosen');
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'Event', form.id));
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  const formatDateTime = (isoString) => {
    const date = new Date(isoString);
  
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
  
    let hours = date.getHours();
    const minutes = `${date.getMinutes()}`.padStart(2, '0');
  
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12; // Convert to 12-hour format, replace 0 with 12
  
    return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
  };
  
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Event</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black" onClick={() => {
          setEditing(null);
          setForm({ id: 0, title: "", datetime: "", location:"", description: "",image: null, });
          setModalOpen(true);
        }}>
          + Add Event
        </button>
      </div>
      <h1 className="text-2xl font-semibold">Upcoming Event</h1>
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Title</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">image</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDateTime(item.datetime)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.location}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.imageUrl != "" ?(<img src={item.imageUrl} width={100} height={100} />):null} 
                    </td>
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
                <label className="block font-medium mb-1">Title</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Date & Time</label>

                <input
                  type="datetime-local"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.datetime}
                  onChange={(e) => {
                    setForm({ ...form, datetime: e.target.value })
                  }}
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
                  <label className="block font-medium mb-1">Description</label>
                  <textarea value={form.description} className="w-full border border-gray-300 p-2 rounded" onChange={(e) => setForm({ ...form, description: e.target.value })}/>
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
