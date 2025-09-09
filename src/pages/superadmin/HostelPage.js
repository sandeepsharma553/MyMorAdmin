import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
const DEFAULT_FEATURES = {
  events: false,
  deals: false,
  announcement: false,
  hostelevent: false,
  diningmenu: false,
  cleaningschedule: false,
  tutorialschedule: false,
  maintenance: false,
  bookingroom: false,
  academicgroup: false,
  reportincedent: false,
  feedback: false,
  wellbeing: false,
  faqs: false,
  resource: false,
  poi: false,
  community: false,
  employee:false,
  student:false
  // chat: false,
  // marketplace: false,
};
const HostelPage = (props) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [universities, setUniversities] = useState([]);
  const [isLoading, setIsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toggleItem, setToggleItem] = useState(null);
  const uid = useSelector((state) => state.auth.user.uid);
  const initialForm = {
    id: 0,
    name: '',
    uniIds: [],
    location: '',
    features: { ...DEFAULT_FEATURES },
    active: true,
    disabledReason: ''
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
        // const { name, uniIds = [], location, features } = d.data();
        const { name, uniIds = [], location, features, active = true, disabledReason, disabledAt } = d.data();
        const universityNames = (uniIds).map(id => uniMap[id] ?? "Unknown");
        return {
          id: d.id,
          name,
          uniIds,
          universityNames,
          location,
          features: { ...DEFAULT_FEATURES, ...(features || {}) },
          active: d.data().active !== false,
          disabledReason, disabledAt
        };
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
    const rawName = form.name?.trim();
    if (!rawName) {
      toast.warn("Please enter a hostel name");
      return;
    }
    if (!Array.isArray(form.uniIds) || form.uniIds.length === 0) {
      toast.warn("Please select at least one university");
      return;
    }

    try {
      const featuresToSave = { ...DEFAULT_FEATURES, ...(form.features || {}) };

      if (editingData) {
        // EDIT: as-is (no duplicate filtering)
        const docRef = doc(db, "hostel", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warn("Hostel does not exist! Cannot update.");
          return;
        }
        await updateDoc(docRef, {
          uid,
          name: rawName,
          uniIds: [...new Set(form.uniIds)], // also de-dupe within selection
          location: form.location,
          features: featuresToSave,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        // ADD: skip any uniIds already linked to this name in any doc
        const selectedUniIds = [...new Set(form.uniIds)]; // remove duplicates in the form itself

        // fetch existing hostels with SAME name
        const q = query(collection(db, "hostel"), where("name", "==", rawName));
        const qs = await getDocs(q);

        // collect all already-linked uniIds for this name (across docs)
        const occupied = new Set();
        qs.docs.forEach((d) => {
          const data = d.data();
          if (Array.isArray(data.uniIds)) {
            data.uniIds.forEach((u) => occupied.add(u));
          }
        });

        // filter out the ones already present
        const toAddUniIds = selectedUniIds.filter((u) => !occupied.has(u));
        const skippedUniIds = selectedUniIds.filter((u) => occupied.has(u));

        if (toAddUniIds.length === 0) {
          toast.warn("All selected universities are already linked to this hostel name.");
          return;
        }

        await addDoc(collection(db, "hostel"), {
          uid,
          name: rawName,
          uniIds: toAddUniIds,
          location: form.location,
          adminUID: null,
          features: featuresToSave,
          createdBy: uid,
          createdDate: new Date(),
          active: true,
          disabledReason: null,
          disabledAt: null,
        });

        // optional: show which ones were skipped
        if (skippedUniIds.length) {
          const idToName = (id) => universities.find((u) => u.id === id)?.name || id;
          toast.info(
            `Skipped (already linked): ${skippedUniIds.map(idToName).join(", ")}`
          );
        }

        toast.success("Successfully saved");
      }
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong.");
    }

    // reset
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    getList();
  };

  // const handleAdd = async (e) => {
  //   e.preventDefault();
  //   if (!form.name) return;
  //   if (!form.uniIds) {
  //     toast.warning("Please select a university");
  //     return;
  //   }
  //   try {
  //     const featuresToSave = { ...DEFAULT_FEATURES, ...(form.features || {}) };
  //     if (editingData) {
  //       const docRef = doc(db, 'hostel', form.id);
  //       const docSnap = await getDoc(docRef);
  //       if (!docSnap.exists()) {
  //         toast.warning('hostel does not exist! Cannot update.');
  //         return;
  //       }

  //       await updateDoc(doc(db, 'hostel', form.id), {
  //         uid: uid,
  //         name: form.name,
  //         uniIds: form.uniIds,
  //         location: form.location,
  //         features: featuresToSave,
  //         updatedBy: uid,
  //         updatedDate: new Date(),
  //       });
  //       toast.success('Successfully updated');
  //     } else {
  //       // const q = query(collection(db, 'hostel'), where('name', '==', form.name));
  //       // const querySnapshot = await getDocs(q);
  //       // if (!querySnapshot.empty) {
  //       //   toast.warn('Duplicate found! Not adding.');
  //       //   return;
  //       // }
  //       const q = query(
  //         collection(db, "hostel"),
  //         where("name", "==", form.name.trim())
  //       );
  //       const querySnapshot = await getDocs(q);

  //       const duplicate = querySnapshot.docs.some((d) => {
  //         const data = d.data();
  //         const existingUniIds = Array.isArray(data.uniIds) ? data.uniIds.sort() : [];
  //         const newUniIds = [...form.uniIds].sort();
  //         return JSON.stringify(existingUniIds) === JSON.stringify(newUniIds);
  //       });

  //       if (duplicate) {
  //         toast.warn("Duplicate found with same name and university IDs. Not adding.");
  //         return;
  //       }
  //       await addDoc(collection(db, "hostel"), {
  //         uid: uid,
  //         name: form.name,
  //         uniIds: form.uniIds,
  //         location: form.location,
  //         adminUID: null,
  //         features: featuresToSave,
  //         createdBy: uid,
  //         createdDate: new Date(),
  //       });
  //       toast.success("Successfully saved");
  //     }
  //   }
  //   catch (e) {
  //     console.log('error', e)
  //   }
  //   // Reset
  //   setModalOpen(false);
  //   setEditing(null);
  //   setForm(initialForm);
  //   getList()
  // };
  const handleFeatureChange = (e) => {
    const { name, checked } = e.target;
    setForm(prev => ({
      ...prev,
      features: {
        ...prev.features,
        [name]: checked
      }
    }));
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
  // const toggleActive = async (item) => {
  //   // if (item.active) {
  //   //   // Disable karne jaa raha hai → alert pehle
  //   //   if (!window.confirm(`Are you sure you want to disable hostel "${item.name}"?`)) {
  //   //     return;
  //   //   }
  //   // } else {
  //   //   // Enable karne ke liye bhi confirm chaho to yahan likh sakte ho
  //   //   if (!window.confirm(`Do you want to re-enable hostel "${item.name}"?`)) {
  //   //     return;
  //   //   }
  //   // }

  //   try {
  //     const docRef = doc(db, "hostel", item.id);
  //     await updateDoc(docRef, {
  //       active: !item.active,
  //       disabledReason: !item.active ? null : "Temporarily disabled by admin",
  //       disabledAt: !item.active ? null : new Date(),
  //       updatedBy: uid,
  //       updatedDate: new Date(),
  //     });
  //     toast.success(`Hostel ${!item.active ? "enabled" : "disabled"}.`);
  //     getList();
  //   } catch (e) {
  //     console.error(e);
  //     toast.error("Failed to toggle status");
  //   }
  // };

  const handleDisableHostel = async (item) => {
    if (!item?.id) return;
    const reason = "Temporarily disabled by admin";
    try {
      setIsLoading(true);
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/disableHostelAndLockEmployees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostelid: item.id, reason, excludeUids: [uid] }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to disable hostel");

      // toast.success(
      //   `Hostel disabled. FS: ${data.firestoreUpdatedEmployees ?? 0}, Auth: ${data.authDisabledUsers ?? 0}`
      // );
      toast.success(`Hostel ${!item.active ? "enabled" : "disabled"}.`);
      await getList();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to disable & lock employees");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnableHostel = async (item) => {
    if (!item?.id) return;
    const reason = "Operations resumed";
    try {
      setIsLoading(true);
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/enableHostelAndEmployees",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hostelid: item.id, reason, excludeUids: [uid] }),
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to enable hostel");

      // toast.success(
      //   `Hostel enabled. FS: ${data.firestoreUpdatedEmployees ?? 0}, Auth: ${data.authEnabledUsers ?? 0}`
      // );
      toast.success(`Hostel ${!item.active ? "enabled" : "disabled"}.`);
      await getList();
    } catch (e) {
      console.error(e);
      toast.error(e.message || "Failed to enable & unlock employees");
    } finally {
      setIsLoading(false);
    }
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
                        {item.active ? (
                          <span className="inline-flex items-center px-2 py-1 rounded bg-green-100 text-green-800">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded bg-red-100 text-red-700">Disabled</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                          setEditing(item);
                          setForm({
                            ...item,
                            features: { ...DEFAULT_FEATURES, ...(item.features || {}) },
                          });
                          setModalOpen(true);
                        }}>Edit</button>
                        <button
                          className={item.active ? "text-red-600 hover:underline mr-3" : "text-green-600 hover:underline mr-3"}
                          onClick={() => { setToggleItem(item); setConfirmToggleOpen(true); }}
                        >
                          {item.active ? "Disable" : "Enable"}
                        </button>
                        {/* {item.active ? (
                          <button
                            className="text-red-600 hover:underline"
                            onClick={() => handleDisableHostel(item)}
                          >
                            Disable & Lock Employees
                          </button>
                        ) : (
                          <button
                            className="text-green-600 hover:underline"
                            onClick={() => handleEnableHostel(item)}
                          >
                            Enable & Unlock Employees
                          </button>
                        )} */}
                        {/* <button className="text-red-600 hover:underline" onClick={() => {
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
                <fieldset style={{ marginTop: '20px' }}>
                  <legend style={{ fontWeight: 'bold', marginBottom: '10px' }}>Features</legend>
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '20px',
                    padding: '10px 0'
                  }}>
                    {Object.keys(form.features).map((key) => (
                      <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input
                          type="checkbox"
                          name={key}
                          checked={form.features[key]}
                          onChange={handleFeatureChange}
                        />
                        {key.charAt(0).toUpperCase() + key.slice(1)}
                      </label>
                    ))}
                  </div>
                </fieldset>
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
      {confirmToggleOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-semibold mb-4">
              {toggleItem?.active ? "Disable Hostel" : "Enable Hostel"}
            </h2>
            <p className="mb-4">
              Are you sure you want to {toggleItem?.active ? "disable" : "enable"}{" "}
              <strong>{toggleItem?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmToggleOpen(false);
                  setToggleItem(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                disabled={isLoading}
                onClick={async () => {
                  try {
                    if (toggleItem?.active) {
                      // currently active → disable
                      await handleDisableHostel(toggleItem);
                    } else {
                      // currently disabled → enable
                      await handleEnableHostel(toggleItem);
                    }
                  } finally {
                    setConfirmToggleOpen(false);
                    setToggleItem(null);
                  }
                }}
                className={`px-4 py-2 text-white rounded ${toggleItem?.active
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                  }`}
              >
                {toggleItem?.active ? "Disable" : "Enable"}
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
