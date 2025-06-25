import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db, storage } from "../../src/firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
export default function DealPage(props) {
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
  const initialForm = {
    id: 0,
    name: '',
    description: '',
    shortdescription: '',
    discount: '',
    category: '',
    type: '',
    tags: '',
    businessName: '',
    location: '',
    onlineOnly: false,
    deliveryOptions: '',
    startDateTime: '',
    endDateTime: '',
    recurring: false,
    happyHour: '',
    originalPrice: '',
    bundleOffer: '',
    quantityLimit: '',
    redeemVia: '',
    usageRules: '',
    verification: '',
    footfallGoal: '',
    pushNotification: false,
    reminderNotification: false,
    enableQiPoints: false,
  }
  const [form, setForm] = useState(initialForm);
  const pageSize = 10;
  const mockData = list
  const filteredData = mockData.filter(
    (item) =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase())
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
    const querySnapshot = await getDocs(collection(db, 'deals'));
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setList(documents)
    setIsLoading(false)
  }
  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
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
  const handleSubmit = async (e) => {
    e.preventDefault();
    let posterUrl = '';
    try {
      if (form.id == 0) {
        if (!form.poster) {
          toast.error("Please choose the file")
          return;
        }
      }
      let posterUrl = form.posterUrl || ''; // keep existing if no new image
      const isNewImage = form.poster instanceof File;

      // Upload new image if selected
      if (isNewImage) {
        const storageRef = ref(storage, `deal_posters/${form.poster.name}`);
        await uploadBytes(storageRef, form.poster);
        posterUrl = await getDownloadURL(storageRef);
      }
      const dealData = {
        ...form,
        startDateTime: Timestamp.fromDate(new Date(form.startDateTime)),
        endDateTime: form.endDateTime ? Timestamp.fromDate(new Date(form.endDateTime)) : null,
        ...(posterUrl && { posterUrl }),
      };
      delete dealData.id;
      delete dealData.poster;
      if (editingData) {
        const docRef = doc(db, 'deals', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('Deal does not exist! Cannot update.');
          return;
        }
        const dealRef = doc(db, 'deals', form.id);
        await updateDoc(dealRef, dealData);
        toast.success('Deal updated successfully');
      }
      else {
        await addDoc(collection(db, 'deals'), dealData);
        toast.success('Deal created successfully');
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
      await deleteDoc(doc(db, 'deals', form.id));
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
        <h1 className="text-2xl font-semibold">Deals</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      {/* Filter input */}
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Category</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Discount</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.category}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.discount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.posterUrl != "" ? (<img src={item.posterUrl} width={80} height={80} />) : null}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                        setEditing(item);
                        setForm(prev => ({
                          ...prev,
                          ...item,
                          id: item.id,
                          startDateTime: item.startDateTime?.toDate().toISOString().slice(0, 16) || '',
                          endDateTime: item.endDateTime?.toDate().toISOString().slice(0, 16) || '',
                          poster: null // poster cannot be pre-filled (file inputs are read-only for security)
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
            <h2 className="text-xl font-bold mb-4">Create Deal</h2>
            <form onSubmit={handleSubmit} className="space-y-4" >
              <div className="space-y-4">
                <input name="name" placeholder="Title" value={form.name}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <input name="shortdescription" placeholder="Short Description" value={form.shortdescription}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <textarea name="description" placeholder="Description" value={form.description} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>

                <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required >
                  <option value="">Select Category</option>
                  <option value="Food">Food</option>
                  <option value="Shopping">Shopping</option>
                  <option value="Movies">Movies</option>
                  <option value="Fitness">Fitness</option>
                </select>
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input type="file" name="poster" accept="image/*" className="hidden"
                      onChange={handleChange}
                    />
                    📁 Choose File
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[150px]">
                    {fileName}
                  </span>

                </div>
                {form.posterUrl && (
                  <img src={form.posterUrl} alt="Poster Preview" width="150" />
                )}

                <input name="tag" placeholder="Tags (vegan, student special, happy hour, etc.)" value={form.tag} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="businessname" placeholder="Business Name" value={form.businessname} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />

                <section>
                  <h3 className="text-xl font-semibold mb-2">📍 Location</h3>
                  <input name="location" value={form.location} onChange={handleChange} placeholder="Store Location" className="w-full border border-gray-300 p-2 rounded" required />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="onlineOnly" checked={form.onlineOnly} onChange={handleChange} />
                    Online Only Deal?
                  </label>
                  <input name="deliveryOptions" value={form.deliveryOptions} onChange={handleChange} placeholder="Delivery or Pickup Options" className="w-full border border-gray-300 p-2 rounded" />
                </section>

                {/* 📅 Timing */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">📅 Timing</h3>
                  <label>Start Date Time</label>
                  <input type="datetime-local" name="startDateTime" value={form.startDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                  <label>End Date Time</label>
                  <input type="datetime-local" name="endDateTime" value={form.endDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded"  required/>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="recurring" checked={form.recurring} onChange={handleChange} />
                    Recurring Deal?
                  </label>
                  <input name="happyHour" value={form.happyHour} onChange={handleChange} placeholder="Happy Hour Timing (e.g. 3–6pm)" className="w-full border border-gray-300 p-2 rounded" />
                </section>

                {/* 💸 Pricing */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">💸 Pricing</h3>
                  <input type="number" min={0} name="originalPrice" value={form.originalPrice} onChange={handleChange} placeholder="Original Price" className="w-full border border-gray-300 p-2 rounded" required />
                  <input type="number" min={0} name="discount" value={form.discount} onChange={handleChange} placeholder="Discounted Price / % Off" className="w-full border border-gray-300 p-2 rounded" />
                  <input name="bundleOffer" value={form.bundleOffer} onChange={handleChange} placeholder="Bundle Offer" className="w-full border border-gray-300 p-2 rounded" />
                  <input type="number" min={0} name="quantityLimit" value={form.quantityLimit} onChange={handleChange} placeholder="Quantity Limit" className="w-full border border-gray-300 p-2 rounded" required/>
                </section>

                {/* ⚙ Redemption & Rules */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">⚙ Redemption & Rules</h3>
                  <select name="redeemVia" value={form.redeemVia} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                    <option value="">Select Redemption Method</option>
                    <option value="qr">QR Code</option>
                    <option value="mention">In-store Mention</option>
                    <option value="onlineCode">Online Code</option>
                    <option value="appTap">App Tap-to-Redeem</option>
                  </select>
                  <textarea name="usageRules" value={form.usageRules} onChange={handleChange} placeholder="Usage Rules" className="w-full border border-gray-300 p-2 rounded" />
                  <input name="verification" value={form.verification} onChange={handleChange} placeholder="Verification Needed" className="w-full border border-gray-300 p-2 rounded" />
                </section>

                {/* 🧠 Engagement & Tracking */}
                <section>
                  <h3 className="text-xl font-semibold mb-2">🧠 Engagement & Tracking</h3>
                  <input type="number" min={0} name="footfallGoal" value={form.footfallGoal} onChange={handleChange} placeholder="Estimated Footfall" className="w-full border border-gray-300 p-2 rounded" />
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="pushNotification" checked={form.pushNotification} onChange={handleChange} />
                    Push Notification Opt-in
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="reminderNotification" checked={form.reminderNotification} onChange={handleChange} />
                    Reminder Notification
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="enableQiPoints" checked={form.enableQiPoints} onChange={handleChange} />
                    Enable Qi Points for Engagement
                  </label>
                </section>
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
                  Create Deal
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
