import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db, storage } from "../../src/firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import dayjs from 'dayjs';
import MapLocationInput from "../components/MapLocationInput";
import { MapPin } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
export default function EventPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState('No file chosen');
  const [category, setCategory] = useState(null)
  const [showMapModal, setShowMapModal] = useState(false);
  const initialFormData = {
    id: 0,
    eventName: '',
    eventDescription: '',
    category: '',
    tags: '',
    startDateTime: '',
    endDateTime: '',
    isRecurring: false,
    frequency: '',
    locationName: '',
    address: '',
    mapLocation: '',
    onlineLink: '',
    poster: null,
    promoVideo: '',
    theme: '',
    rsvp: false,
    capacity: '',
    rsvpDeadline: '',
    priceType: '',
    prices: [],
    paymentLink: '',
    allowChat: false,
    allowReactions: false,
    challenges: '',
    visibility: 'Public',
    cohosts: '',
    website: '',
    instagram: '',
    rules: '',
    boothOption: false,
    vendorInfo: '',
    sponsorship: '',
    interestedCount: 0
  }
  const [form, setForm] = useState(initialFormData);
  const uid = useSelector((state) => state.auth.user.uid);
  useEffect(() => {
    getList()
    getCategory()
  }, [])
  const getDayFromDate = () => {
    const date = new Date;
    return date.toLocaleDateString('en-US', { weekday: 'long' });
  };
  const getList = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'events'));
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setList(documents)
    setIsLoading(false)
  }
  const getCategory = async () => {
    setIsLoading(true)
    const querySnapshot = await getDocs(collection(db, 'eventcategory'));
    const documents = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));
    setCategory(documents)
    setIsLoading(false)
  }
  const handleChange = (e) => {
    const { name, value, type, checked, files, prices } = e.target;
    if (type === 'checkbox') {
      setForm({ ...form, [name]: checked });
    } else if (type === 'file') {
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
      // if (form.poster) {
      //   const storageRef = ref(storage, `event_posters/${form.poster.name}`);
      //   await uploadBytes(storageRef, form.poster);
      //   posterUrl = await getDownloadURL(storageRef);
      // }
      let posterUrl = form.posterUrl || ''; // keep existing if no new image
      const isNewImage = form.poster instanceof File;

      // Upload new image if selected
      if (isNewImage) {
        const storageRef = ref(storage, `event_posters/${form.poster.name}`);
        await uploadBytes(storageRef, form.poster);
        posterUrl = await getDownloadURL(storageRef);
      }
      const eventData = {
        ...form,
        prices: form.priceType === 'Free' ? [] : form.prices,
        startDateTime: Timestamp.fromDate(new Date(form.startDateTime)),
        endDateTime: form.endDateTime ? Timestamp.fromDate(new Date(form.endDateTime)) : null,
        ...(posterUrl && { posterUrl }),
      };
      delete eventData.id;
      delete eventData.poster;
      if (editingData) {
        const docRef = doc(db, 'events', form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning('Event does not exist! Cannot update.');
          return;
        }
        const eventRef = doc(db, 'events', form.id);
        await updateDoc(eventRef, eventData);
        toast.success('Event updated successfully');
      }
      else {
        await addDoc(collection(db, 'events'), eventData);
        toast.success('Event created successfully');
      }

    } catch (error) {
      console.error("Error saving data:", error);
    }
    getList()
    setModalOpen(false);
    setEditing(null);
    setForm(initialFormData);
    setFileName('No file chosen');
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, 'events', form.id));
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  const formatDateTime = (isoString) => {
    const date = dayjs(isoString.seconds * 1000).format('YYYY-MM-DD hh:mm A');

    // const year = date.getFullYear();
    // const month = `${date.getMonth() + 1}`.padStart(2, '0');
    // const day = `${date.getDate()}`.padStart(2, '0');

    // let hours = date.getHours();
    // const minutes = `${date.getMinutes()}`.padStart(2, '0');

    // const ampm = hours >= 12 ? 'PM' : 'AM';
    // hours = hours % 12 || 12; // Convert to 12-hour format, replace 0 with 12

    // return `${year}-${month}-${day} ${hours}:${minutes} ${ampm}`;
    return date;
  };


  const addPriceOption = () => {
    setForm({ ...form, prices: [...form.prices, { type: '', amount: '', validUntil: '' }] });
  };

  const handlePriceChange = (index, field, value) => {
    const updated = [...form.prices];
    updated[index][field] = value;
    setForm({ ...form, prices: updated });
  };



  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Event</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black" onClick={() => {
          setEditing(null);
          setForm(initialFormData);
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Event</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Event Date</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">image</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {list.map((item, i) => (
                  <tr key={i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.eventName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDateTime(item.startDateTime)} - {formatDateTime(item.endDateTime)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.locationName}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
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
                ))}
              </tbody>
            </table>
          )}
        </div>


      </div>
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">Create Event</h2>
            <form onSubmit={handleSubmit} className="space-y-4" >
              <div className="space-y-4">
                <input name="eventName" placeholder="Event Name" value={form.eventName}
                  onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <textarea name="eventDescription" placeholder="Description" value={form.eventDescription} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>

                <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required >
                  <option value="">Select Category</option>

                  {category.map((item, i) => (
                    <option value={item.name}>{item.name}</option>
                  ))}

                </select>

                <input name="tags" placeholder="Tags (comma separated)" value={form.tags} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <label>Start Date Time</label>
                <input type="datetime-local" name="startDateTime" value={form.startDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <label>End Date Time</label>
                <input type="datetime-local" name="endDateTime" value={form.endDateTime} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                <label className="block mb-2"><input type="checkbox" name="isRecurring" checked={form.isRecurring} onChange={handleChange} /> Recurring Event?</label>
                {form.isRecurring && (
                  <select name="frequency" value={form.frequency} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                    <option value="">Select Frequency</option>

                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                    <option value="Custom">Custom</option>
                  </select>
                )}

                <input name="locationName" placeholder="Location Name" value={form.locationName} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                <input name="address" placeholder="Address / Room" value={form.address} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                {/* <input name="mapLocation" placeholder="Map Location (lat,long)" value={form.mapLocation} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" /> */}

                <div className="relative">
                  <input
                    name="mapLocation"
                    readOnly      
                    placeholder="Select on map"
                    value={form.mapLocation}
                    onClick={() => setShowMapModal(true)}
                    className="w-full border border-gray-300 p-2 pl-10 rounded cursor-pointer"
                  />
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                </div>
                <input name="onlineLink" placeholder="Online Event Link" value={form.onlineLink} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
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
                <input name="promoVideo" placeholder="Promo Video Link" value={form.promoVideo} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="theme" placeholder="Theme Color / Emoji" value={form.theme} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <label className="block mb-2"><input type="checkbox" name="rsvp" checked={form.rsvp} onChange={handleChange} /> RSVP Required?</label>
                <input name="capacity" placeholder="Max Capacity" value={form.capacity} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input type="datetime-local" name="rsvpDeadline" value={form.rsvpDeadline} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <select name="priceType" value={form.priceType} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required>
                  <option value="">Select Payment Type</option>
                  <option value="Free">Free</option>
                  <option value="Paid">Paid</option>
                  <option value="MultiPrice">Multi Price</option>
                  <option value="MultiPriceTimer">Multi Price Timer </option>
                </select>
                {form.priceType != 'Free' && form.priceType != '' && (
                  <div>
                    <h2 className="font-semibold">Pricing Options</h2>
                    {form.prices.map((price, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                        {/* <input
                          placeholder="Type (e.g., General,VIP)"
                          value={price.type}
                          onChange={(e) => handlePriceChange(index, 'type', e.target.value)}
                          className="border p-2 w-1/3"
                        /> */}
                        {form.priceType === 'Paid' && (
                          <select name="Type" value={price.type} onChange={(e) => handlePriceChange(index, 'type', e.target.value)} className="w-full border border-gray-300 p-2 rounded" required >
                            <option value="">Select Type</option>
                            <option value="General">General</option>
                            <option value="VIP">VIP</option>
                          </select>
                        )}
                        {form.priceType === 'MultiPriceTimer' && (
                          <select name="Type" value={price.type} onChange={(e) => handlePriceChange(index, 'type', e.target.value)} className="w-full border border-gray-300 p-2 rounded" required >
                            <option value="">Select Type</option>
                            <option value="Fisrt Day">Fisrt Day</option>
                            <option value="Second Day">Second Day</option>
                            <option value="Third Day">Third Day</option>
                          </select>
                        )}
                        <input
                          placeholder="Amount"
                          type="number"
                          value={price.amount}
                          onChange={(e) => handlePriceChange(index, 'amount', e.target.value)}
                          className="border p-2 w-1/3"
                        />
                        <input
                          type="datetime-local"
                          value={price.validUntil || ''}
                          onChange={(e) => handlePriceChange(index, 'validUntil', e.target.value)}
                          className="border p-2 w-1/3"
                        />
                      </div>
                    ))}
                    <button type="button" onClick={addPriceOption} className="bg-gray-300 px-3 py-1 rounded">+ Add Price</button>
                  </div>
                )}
                {/* {form.priceType === 'MultiPriceTimer' && (
                  <div>
                    <h2 className="font-semibold">Pricing Options</h2>
                    {form.prices.map((price, index) => (
                      <div key={index} className="flex gap-2 mb-2">
                
                        <select name="Type" value={price.type} onChange={(e) => handlePriceChange(index, 'type', e.target.value)} className="w-full border border-gray-300 p-2 rounded" required >
                          <option value="">Select Type</option>
                          <option value="Fisrt Day">Fisrt Day</option>
                          <option value="Second Day">Second Day</option>
                          <option value="Third Day">Third Day</option>
                        </select>
                        <input
                          placeholder="Amount"
                          type="number"
                          value={price.amount}
                          onChange={(e) => handlePriceChange(index, 'amount', e.target.value)}
                          className="border p-2 w-1/3"
                        />
                        <input
                          type="datetime-local"
                          value={price.validUntil || ''}
                          onChange={(e) => handlePriceChange(index, 'validUntil', e.target.value)}
                          className="border p-2 w-1/3"
                        />
                      </div>
                    ))}
                    <button type="button" onClick={addPriceOption} className="bg-gray-300 px-3 py-1 rounded">+ Add Price</button>
                  </div>
                )} */}

                {/* <input name="paymentLink" placeholder="Payment Link" value={form.paymentLink} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" /> */}
                <label className="block mb-2"><input type="checkbox" name="allowChat" checked={form.allowChat} onChange={handleChange} /> Allow Chat</label>
                <label className="block mb-2"><input type="checkbox" name="allowReactions" checked={form.allowReactions} onChange={handleChange} /> Allow Reactions</label>
                <input name="challenges" placeholder="Event Challenges / Polls" value={form.challenges} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <select name="visibility" value={form.visibility} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                  <option value="Public">Public</option>
                  <option value="Friends">Friends Only</option>
                  <option value="Invite">Invite Only</option>
                  <option value="Campus">Campus Only</option>
                </select>
                <input name="cohosts" placeholder="Co-hosts" value={form.cohosts} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="website" placeholder="Website" value={form.website} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="instagram" placeholder="Instagram Link" value={form.instagram} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="rules" placeholder="Event Rules" value={form.rules} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <label className="block mb-2"><input type="checkbox" name="boothOption" checked={form.boothOption} onChange={handleChange} /> Booth / Stall Option</label>
                <input name="vendorInfo" placeholder="Vendor Info" value={form.vendorInfo} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />
                <input name="sponsorship" placeholder="Sponsorship Info" value={form.sponsorship} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />

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
                  Create Event
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
      <Dialog
        open={showMapModal}
        onClose={() => setShowMapModal(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Pick a Location</DialogTitle>

        <DialogContent dividers sx={{ overflow: "hidden" }}>
          <MapLocationInput
            value={form.mapLocation}
            onChange={(val) => setForm({ ...form, mapLocation: val })}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setShowMapModal(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => setShowMapModal(false)}
            disabled={!form.mapLocation}
          >
            Save location
          </Button>
        </DialogActions>
      </Dialog>


      <ToastContainer />



    </main>
  );
}
