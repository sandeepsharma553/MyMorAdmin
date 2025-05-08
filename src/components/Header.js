import React, { useState } from 'react';
import { Menu, X } from 'lucide-react'; // uses lucide-react for icons
import '../index.css';
export default function Header({ onClick }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <header className="bg-blue-600 text-white p-2">
      <div className="flex items-center space-x-4">
        <button
          className="p-2"
          onClick={() => {
            setSidebarOpen(!sidebarOpen)
            onClick(!sidebarOpen)
          }}
        >
          {sidebarOpen ? <Menu size={24} /> : <Menu size={24} />}
        </button>
        <h1 className="text-xl font-bold">My Mor</h1>
      </div>
    </header>
  );
}
