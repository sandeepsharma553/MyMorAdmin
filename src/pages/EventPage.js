import React from "react";
export default function EventPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Event</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black">
          + Add Event
        </button>
      </div>
      <h1 className="text-2xl font-semibold">Upcoming Event</h1>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Event</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">Career Fair {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Apr 20,2025</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button className="text-blue-600 hover:underline mr-3">Edit</button>
                  <button className="text-red-600 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
