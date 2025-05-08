  import React, { useState, useEffect, useRef } from "react";
  export default function DealPage(props) {
    const { navbarHeight } = props;
    console.log("navh", navbarHeight);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
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
    const pageSize = 10;
    const mockData = Array.from({ length: 50 }, (_, i) => ({
      id: i + 1,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
      role: i % 2 === 0 ? 'Admin' : 'Member',
    }));
    const filteredData = mockData.filter(
      (item) =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredData.length / pageSize);
    const paginatedData = filteredData.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
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
          <h1 className="text-2xl font-semibold">Deal</h1>
          <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            onClick={() => {
              setEditingUser(null);
              setNewUser({ name: '', email: '', role: 'Member' });
              setModalOpen(true);
            }}>
            + Add
          </button>
        </div>
        {/* Filter input */}
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or email"
            className="p-2 border border-gray-300 rounded w-full md:w-1/3"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // reset to page 1 on search
            }}
          />
        </div>
        <div className="overflow-x-auto bg-white rounded shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Role</th>
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
                paginatedData.map((user) => (
                  <tr key={user.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{user.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.role}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditingUser(user);
                          setNewUser(user);
                          setModalOpen(true);
                        }}>Edit</button>
                      <button className="text-red-600 hover:underline"
                        onClick={() => {
                          setUserToDelete(user);
                          setConfirmDeleteOpen(true);
                        }}>Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
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
