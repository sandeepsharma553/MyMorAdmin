import React, { useState } from 'react';
import { Menu, X } from 'lucide-react'; // uses lucide-react for icons
import '../index.css';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

export default function Layout({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex flex-col h-screen">
      {/* Toggle button */}
      <button
        className="p-2 lg:hidden bg-gray-200"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <Menu size={24} /> : <Menu size={24} />}
      </button>

      {/* Header */}
      <Header />

      {/* Main layout */}
      <div className="flex flex-1">
        {/* Sidebar / Drawer */}
        <aside
          className={`fixed lg:static z-20 top-0 left-0 w-64 h-full bg-gray-100 p-4 transition-transform duration-300 ease-in-out transform
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        >
          <Sidebar />
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
          {children}
        </main>
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}
