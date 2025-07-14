import React, { useState } from 'react';
import '../index.css';
import Header from './Header';
import SuperAdminSidebar from './SuperAdminSidebar';
import Footer from './Footer';

export default function SuperAdminLayout({ children }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="flex flex-col h-screen overflow-hidden">
            <Header onClick={(sidebarOpen) => {
                setSidebarOpen(sidebarOpen)
            }} />
            <div className="flex flex-1 overflow-hidden">
                <aside
                    className={`bg-gray-100 transition-all duration-300
        ${sidebarOpen ? 'w-64' : 'w-0'} overflow-hidden `}
                >
                    <SuperAdminSidebar />
                </aside>
                <main className="flex-1 p-6 bg-gray-100 overflow-y-auto">
                    {children}
                </main>
            </div>
            <Footer />
        </div>

    );
}
