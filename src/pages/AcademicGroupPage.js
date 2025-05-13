import React from "react";
export default function AcademicGroupPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Academic Group</h1>
        <button className="px-4 py-2 bg-black text-white rounded hover:bg-black">
          + Add Group
        </button>
      </div>
      <div className="overflow-x-auto bg-white rounded shadow">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Group Name</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Course</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Members</th>
              <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">Math 101{i + 1} Group</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">Mat 10{i + 1}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">25</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
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
