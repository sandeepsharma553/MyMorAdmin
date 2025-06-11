import React, { useState, useEffect } from "react";
import { doc, deleteDoc } from "firebase/firestore";
import { db, database } from "../../src/firebase";
import { ref, onValue, set, push, update, remove,get } from 'firebase/database';
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
export default function AcademicGroupPage(props) {
  const { navbarHeight } = props;
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ id: 0, title: '', description: '' });
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const uid = useSelector((state) => state.auth.user);
  useEffect(() => {
    getList()
  }, [])



const getList = async () => {
  setIsLoading(true);
  try {
    const groupRef = ref(database, 'groups/');
    const snapshot = await get(groupRef);
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
      console.log(groupsWithCount);
    } else {
      setList([]);
    }
  } catch (error) {
    console.error('Error fetching groups:', error);
  }
  setIsLoading(false);
};

const getMemberCount = async (groupId) => {
  const membersRef = ref(database, `groups/${groupId}/members`);
  const snapshot = await get(membersRef);
  const members = snapshot.val();
  return members ? Object.keys(members).length : 0;
};

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title) return;
    if (editingData) {
      try {
        update(ref(database, `groups/${form.id}`), {
          title: form.title,
          description: form.description,
          creatorId: uid,
        }).then(() => {
          console.log('Group updated successfully!');
        })
          .catch((error) => {
            console.error('Error updating data:', error);
          });
        toast.success('Successfully updated');
        getList()
      } catch (error) {
        console.error('Error updating document: ', error);
      }
    } else {
      try {
        const newGroupRef = push(ref(database, 'groups/'));
        set(newGroupRef, {
          title: form.title,
          description: form.description,
          creatorId: uid,
          type:'Popular'
        })
          .then(() => {
            console.log('Data saved successfully!');
          })
          .catch((error) => {
            console.error('Error saving data:', error);
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
    setForm({ id: 0, title: '', description: '' });
  };
  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const groupRef = ref(database, `groups/${form.id}`); // adjust your path as needed
      remove(groupRef)
        .then(() => {
          console.log('Group deleted successfully!');
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
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Academic Group</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm({ id: 0, title: '', description: '' });
            setModalOpen(true);
          }}>
          + Add Group
        </button>
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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Group Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Group Description</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Members</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {list.map((item, i) => (
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
                <label className="block font-medium mb-1">Group Name</label>
                <input
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <label className="block font-medium mb-1">Description</label>
                <textarea
                  type="text"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                ></textarea>

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
