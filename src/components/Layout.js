import React, { useState } from 'react';
import '../index.css';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* <button
        className="p-2  bg-gray-200"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        {sidebarOpen ? <Menu size={24} /> : <Menu size={24} />}
      </button> */}
      <Header onClick={(sidebarOpen) => {
        setSidebarOpen(sidebarOpen)
      }} />
      <div className="flex flex-1 overflow-hidden">
        {/* <aside
          className={`fixed lg:static z-20 top-0 left-0 w-64 h-full bg-gray-100 p-4 transition-transform duration-300 ease-in-out transform
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
        > */}
        <aside
          className={`bg-gray-100 transition-all duration-300
        ${sidebarOpen ? 'w-64' : 'w-0'} overflow-hidden `}
        >
          <Sidebar />
        </aside>
        {/* Main content */}
        <main className="flex-1 p-6 bg-gray-100 overflow-y-auto">
          {children}
        </main>
      </div>
      {/* Footer */}
      <Footer />
    </div>

  );
}
