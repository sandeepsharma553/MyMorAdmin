import React from "react";
export default function DiningMenuPage(props) {
  const { navbarHeight } = props;
  console.log("navh", navbarHeight);
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Dining Menu</h1>
       <button className="px-4 py-2 bg-black text-white rounded hover:bg-black">
          + Add Group
        </button>
      </div>
    </main>
  );
}
