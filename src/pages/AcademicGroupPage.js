import React, { useState, useEffect } from "react";
import { db, database, storage } from "../../src/firebase";
import { ref as dbRef, onValue, set, push, update, remove, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
export default function AcademicGroupPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [fileName, setFileName] = useState('No file chosen');
  const [isLoading, setIsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1);
  const uid = useSelector((state) => state.auth.user.uid);
  const initialForm = {
    id: 0,
    title: '',
    description: '',
    category: '',
    tags: '',
    type: 'Popular',
    groupType: 'Public',
    joinQuestions: '',
    restrictions: '',
    maxMembers: '',
    postApproval: false,
    groupChat: true,
    eventsEnabled: true,
    pollsEnabled: false,
    resourcesEnabled: false,
    location: '',
    campusSpecific: false,
    notifications: true,
    autoAlert: true,
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
    setIsLoading(true);
    try {
      const groupRef = dbRef(database, 'groups/');
      onValue(groupRef, async (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const groupEntries = Object.entries(data);

          const groupsWithCount = await Promise.all(
            groupEntries.map(async ([key, val]) => {
              const memberCount = await getMemberCount(key);
              return {
                id: key,
                ...val,
                membercount: memberCount
              };
            })
          );

          setList(groupsWithCount);
        } else {
          setList([]);
        }
      });

    } catch (error) {
      console.error('Error fetching groups:', error);
    }
    setIsLoading(false);
  };
  const getMemberCount = async (groupId) => {
    const membersRef = dbRef(database, `groups/${groupId}/members`);
    const snapshot = await get(membersRef);
    const members = snapshot.val();
    return members ? Object.keys(members).length : 0;
  };
  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    setForm((prev) => ({
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



  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title) return;


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
        const storRef = storageRef(storage, `group_posters/${form.poster.name}`);
        await uploadBytes(storRef, form.poster);
        posterUrl = await getDownloadURL(storRef);
      }
      const groupData = {
        ...form,
        creatorId: uid,
        ...(posterUrl && { posterUrl }),
      };
    
      delete form.poster;

      if (editingData) {
        update(dbRef(database, `groups/${form.id}`), {
          ...form,
          creatorId: uid,
          ...(posterUrl && { posterUrl }),
        }).then(() => {
          
        })
          .catch((error) => {
            console.error('Error updating data:', error);
          });
        toast.success('Group updated successfully!');

      } else {
        delete form.id;
        const newGroupRef = push(dbRef(database, 'groups/'));
        set(newGroupRef, {
          ...form,
          creatorId: uid,
          ...(posterUrl && { posterUrl }),
        })
          .then(() => {
          
          })
          .catch((error) => {
            console.error('Error saving data:', error);
          });
        toast.success("Group created successfully");


      }
    }
    catch (error) {
      console.error('Error updating document: ', error);
    }
    // Reset
    getList()
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName('No file chosen');
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const groupRef = dbRef(database, `groups/${form.id}`); // adjust your path as needed
      remove(groupRef)
        .then(() => {
          
        })
        .catch((error) => {
          console.error('Error deleting group:', error);
        });
      toast.success('Successfully deleted!');
      getList()
    } catch (error) {
      console.error('Error deleting document: ', error);
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto no-scrollbar">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Academic Group</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}>
          + Add Group
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow no-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Group Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Group Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Members</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.description}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.membercount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
            <h2 className="text-xl font-bold mb-4">Add</h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Group Name"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <textarea
                  type="text"
                  placeholder="Description"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                ></textarea>
                <select name="category" value={form.category} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required >
                  <option value="">Select Category</option>
                  <option value="StudyGroup">Study Group</option>
                  <option value="Foodies">Foodies</option>
                  <option value="Gaming">Gaming</option>
                  <option value="Crypto">Crypto</option>
                  <option value="Events">Events</option>
                </select>
                <input name="tags" value={form.tags} onChange={handleChange} placeholder="Tags / Interests (comma separated)" className="w-full border border-gray-300 p-2 rounded" />
                {/* 📸 Media */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">📸 Media & Branding</h2>
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
                  <input name="emoji" value={form.emoji} onChange={handleChange} placeholder="Emoji/Icon (optional)" className="w-full border border-gray-300 p-2 rounded" />
                  <input name="themeColor" value={form.themeColor} onChange={handleChange} placeholder="Theme Color (hex or name)" className="w-full border border-gray-300 p-2 rounded" />
                </section>

                {/* 🔒 Privacy */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">🔒 Privacy & Access</h2>
                  <select name="groupType" value={form.groupType} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded">
                    <option value="Public">Public</option>
                    <option value="Private">Private</option>
                    <option value="Hidden">Hidden / Invite-only</option>
                  </select>
                  <textarea name="joinQuestions" value={form.joinQuestions} onChange={handleChange} placeholder="Join Questions or Entry Form" className="w-full border border-gray-300 p-2 rounded" />
                  <input name="restrictions" value={form.restrictions} onChange={handleChange} placeholder="Age / Gender / Campus Restrictions" className="w-full border border-gray-300 p-2 rounded" />
                </section>

                {/* 👥 Membership */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">👥 Membership Settings</h2>
                  <input name="maxMembers" type="number" min={0} value={form.maxMembers} onChange={handleChange} placeholder="Max Members" className="w-full border border-gray-300 p-2 rounded" />
                  <label className="flex items-center space-x-2">
                    <input name="postApproval" type="checkbox" checked={form.postApproval} onChange={handleChange} />
                    <span>Post Approval Required</span>
                  </label>
                </section>

                {/* 🛠 Engagement */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">🛠 Engagement Tools</h2>
                  {['groupChat', 'eventsEnabled', 'pollsEnabled', 'resourcesEnabled'].map((key) => (
                    <label key={key} className="flex items-center space-x-2">
                      <input type="checkbox" name={key} checked={form[key]} onChange={handleChange} />
                      <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                    </label>
                  ))}
                </section>

                {/* 📍 Location */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">📍 Location-Based</h2>
                  <input name="location" value={form.location} onChange={handleChange} placeholder="Group Location or Radius" className="w-full border border-gray-300 p-2 rounded" />
                  <label className="flex items-center space-x-2">
                    <input name="campusSpecific" type="checkbox" checked={form.campusSpecific} onChange={handleChange} />
                    <span>Campus Specific Group</span>
                  </label>
                </section>

                {/* 🔔 Notifications */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">🔔 Notifications</h2>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" name="notifications" checked={form.notifications} onChange={handleChange} />
                    <span>Allow Notifications to Members</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input type="checkbox" name="autoAlert" checked={form.autoAlert} onChange={handleChange} />
                    <span>Auto-alert for New Posts / Events</span>
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
