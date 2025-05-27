import React, { useState } from "react";
import { collection, addDoc,getDocs } from "firebase/firestore";
import { db } from "../../src/firebase";
import { useSelector } from "react-redux";
const UniversityPage = (props) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [newData, setNew] = useState({ name: '' });
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const uid = useSelector((state) => state.auth.user);

  const handleAdd = async () => {
    if (newData.name) {
      try {
       
        const citiesCol = collection(db, 'University');
        const citySnapshot = await getDocs(citiesCol);
        const cityList = citySnapshot.docs.map(doc => doc.data());
        console.log(cityList)
        // await addDoc(collection(db, "University"), {
        //   name: newData.name,
        //   createdBy:uid,
        //   createdDate: new Date(),
        // });
        alert("User data saved to Firestore");
      } catch (error) {
        console.error("Error saving data:", error);
      }
      return;
    }

    // if (editingData) {
    //   // Update existing user
    //   // setData((prev) =>
    //   //   prev.map((u) => (u.id === editingUser.id ? { ...newData } : u))
    //   // );
    // } else {
    //   // Add new user
    //   // setData((prev) => [
    //   //   { ...newData, id: prev.length + 1 },
    //   //   ...prev,
    //   // ]);
    // }

    // // Reset
    // setModalOpen(false);
    // setEditing(null);
    // setNew({ name: '', email: '', role: 'Member' });
  };
  const handleDeleteUser = () => {
    if (!deleteData) return;
    // setData((prev) => prev.filter((u) => u.id !== userToDelete.id));
    setConfirmDeleteOpen(false);
    setDelete(null);
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setNew({ name: '', email: '', role: 'Member' });
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">University</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">Career Fair {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button className="text-blue-600 hover:underline mr-3">Edit</button>
                  <button className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add New User</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                className="w-full border border-gray-300 p-2 rounded"
                value={newData.name}
                onChange={(e) => setNew({ ...newData, name: e.target.value })}
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
                onClick={handleAdd}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
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
                onClick={handleDeleteUser}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default UniversityPage;
