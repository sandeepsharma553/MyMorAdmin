import React from "react";
export default function ReportIncidentPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Report Incident</h1>
       <button className="px-4 py-2 bg-black text-white rounded hover:bg-black">
          + Add Group
        </button>
      </div>
      <div className="p-4 space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <select className="p-2 rounded border border-gray-300">
            <option>Status</option>
          </select>
          <select className="p-2 rounded border border-gray-300">
            <option>Type Urgency</option>
          </select>
          <select className="p-2 rounded border border-gray-300">
            <option>Date Range Jan 1, 2024 - Dec 31</option>
          </select>
          <select className="p-2 rounded border border-gray-300">
            <option>Submitted by</option>
          </select>
        </div>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Report ID</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Submitted by</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Incident Type</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">#2025-10{i + 1} Group</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">John {i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Safety</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Open</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  Apr 10, 2025
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
