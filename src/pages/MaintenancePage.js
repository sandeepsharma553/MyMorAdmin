import React from "react";

export default function MaintenancePage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
 
 
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Maintenance</h1>
       <button className="px-4 py-2 bg-black text-white rounded hover:bg-black">
          + Add 
        </button>
      </div>
      <div className="p-4 space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-5 gap-4 text-center">
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-gray-500 text-sm">Quick Stats</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-2xl font-bold">125</div>
          <div className="text-gray-500 text-sm">Total</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-2xl font-bold">29</div>
          <div className="text-gray-500 text-sm">Pending</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-2xl font-bold">10</div>
          <div className="text-gray-500 text-sm">In Progress</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-gray-500 text-sm">In Progress Submitted On</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-gray-500 text-sm">Completed Status</div>
        </div>
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-2xl font-bold">4</div>
          <div className="text-gray-500 text-sm">Actions</div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-4 gap-4">
        <select className="p-2 rounded border border-gray-300">
          <option>Status</option>
        </select>
        <select className="p-2 rounded border border-gray-300">
          <option>Request Type</option>
        </select>
        <select className="p-2 rounded border border-gray-300">
          <option>Location</option>
        </select>
        <select className="p-2 rounded border border-gray-300">
          <option>Date Range Jan 1, 2024 - Dec 31</option>
        </select>
      </div>
    </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Request ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">User</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Issue Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Location</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Submitted On</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">#2025-01 {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">John {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Plumbing</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  Room A12
                  {/* <button className="text-blue-600 hover:underline mr-3">Edit</button>
                  <button className="text-red-600 hover:underline">Delete</button> */}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Apr 10,2025</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">New</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">View</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      
    </main>
  );
}
