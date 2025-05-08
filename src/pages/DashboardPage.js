import React, { useState, useEffect, useRef } from "react";
export default function DashboardPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  return (

    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          + Add
        </button>
      </div>

      {/* Grid content */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {/* Example cards */}
        {[...Array(8)].map((_, i) => (
          <div key={i} className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-medium mb-2">Item {i + 1}</h2>
            <p className="text-gray-600 text-sm">This is a card description.</p>
          </div>
        ))}
      </div>
    </main>


  );
}
