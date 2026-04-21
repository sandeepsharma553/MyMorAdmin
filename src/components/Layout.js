import React, { useState } from "react";
import "../index.css";
import Header from "./Header";
import Sidebar from "./Sidebar";
import Footer from "./Footer";

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <Header
        onClick={(open) => {
          setSidebarOpen(open);
        }}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside
          className={`
            bg-gray-100 transition-all duration-300 shrink-0
            ${sidebarOpen ? "w-64" : "w-0"}
            h-full overflow-hidden
          `}
        >
          <div className="h-full overflow-y-auto overflow-x-hidden">
            <Sidebar />
          </div>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-gray-100 p-3">
          {children}
        </main>
      </div>

      <Footer />
    </div>
  );
}