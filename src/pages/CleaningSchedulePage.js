import React, { useState, useEffect, useRef } from "react";
export default function CleaningSchedulePage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  const [modalOpen, setModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', role: 'Member' });
  const [editingUser, setEditingUser] = useState(null);
  const [userToDelete, setUserToDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
   const [data, setData] = useState(
        Array.from({ length: 20 }, (_, i) => ({
          id: i + 1,
          name: `User ${i + 1}`,
          email: `user${i + 1}@example.com`,
          role: i % 2 === 0 ? 'Admin' : 'Member',
        }))
      );
  const handleAddUser = () => {
    if (!newUser.name || !newUser.email) return;

    if (editingUser) {
      // Update existing user
      setData((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...newUser } : u))
      );
    } else {
      // Add new user
      setData((prev) => [
        { ...newUser, id: prev.length + 1 },
        ...prev,
      ]);
    }

    // Reset
    setModalOpen(false);
    setEditingUser(null);
    setNewUser({ name: '', email: '', role: 'Member' });
  };
  const handleDeleteUser = () => {
    if (!userToDelete) return;
    setData((prev) => prev.filter((u) => u.id !== userToDelete.id));
    setConfirmDeleteOpen(false);
    setUserToDelete(null);
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Cleaning Schedule</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditingUser(null);
            setNewUser({ name: '', email: '', role: 'Member' });
            setModalOpen(true);
          }}>
          + Add
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Room Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Hall</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Day</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">Studio {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">A{i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Monday</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  11:00-1200 PM
                  {/* <button className="text-blue-600 hover:underline mr-3">Edit</button>
                  <button className="text-red-600 hover:underline">Delete</button> */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add New User</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Name"
                className="w-full border border-gray-300 p-2 rounded"
                value={newUser.name}
                onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
              />
              <input
                type="email"
                placeholder="Email"
                className="w-full border border-gray-300 p-2 rounded"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <select
                className="w-full border border-gray-300 p-2 rounded"
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
              >
                <option value="Member">Member</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div className="flex justify-end mt-6 space-x-3">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleAddUser}
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
            <p className="mb-4">Are you sure you want to delete <strong>{userToDelete?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setUserToDelete(null);
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
}
