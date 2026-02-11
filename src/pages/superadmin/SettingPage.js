import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import DiscoverSettingPage from "./DiscoverSettingPage";
import MarketSettingPage from "./MarketSettingPage";

const EventSettingPage = lazy(() =>
  import("./EventSettingPage")
);

const initialForm = { id: "", name: "" };
const toKey = (s) => (s || "").trim().toLowerCase();

const SectionHeader = ({ title, actionLabel, onAction }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-semibold">{title}</h2>
    {actionLabel && (
      <button
        className="px-4 py-2 bg-black text-white rounded hover:bg-black/80"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    )}
  </div>
);
const SettingPage = () => {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);

  // Sidebar menu — both open inline now
  const MENU = [
    { key: "event", label: "Event Setting" },
    { key: "discover", label: "Discover Setting" },
    { key: "market", label: "Market Setting" },
  ];
  const [activeKey, setActiveKey] = useState("event");
  // Sidebar click
  const onMenuClick = (key) => setActiveKey(key);

  // Quick cards (now both inline → show info)
  const QuickCards = useMemo(() => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
      <div className="bg-white rounded-lg border shadow p-5 flex items-center justify-between opacity-50 pointer-events-none">
        <div>
          <h3 className="font-semibold text-lg">Maintenance Settings</h3>
          <p className="text-sm text-gray-500">Opens inline from the menu.</p>
        </div>
        <div className="px-3 py-2 bg-gray-300 text-white rounded">Inline</div>
      </div>
      <div className="bg-white rounded-lg border shadow p-5 flex items-center justify-between opacity-50 pointer-events-none">
        <div>
          <h3 className="font-semibold text-lg">Report Settings</h3>
          <p className="text-sm text-gray-500">Opens inline from the menu.</p>
        </div>
        <div className="px-3 py-2 bg-gray-300 text-white rounded">Inline</div>
      </div>
    </div>
  ), []);

  return (
    <main className="flex min-h-[calc(100vh-64px)] bg-gray-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r">
        <div className="p-4 border-b">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="text-xs text-gray-500">Hostel scope</p>
        </div>
        <nav className="p-2">
          {MENU.map((m) => {
            const active = activeKey === m.key;
            return (
              <button
                key={m.key}
                className={`w-full text-left px-3 py-2 rounded mb-1 ${active ? "bg-black text-white" : "hover:bg-gray-100"
                  }`}
                onClick={() => onMenuClick(m.key)}
              >
                {m.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Content */}
      <section className="flex-1 p-6 overflow-auto">


        {activeKey === "event" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <EventSettingPage uid={uid} embedded />
            </div>
          </Suspense>
        )}
        {activeKey === "discover" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <DiscoverSettingPage uid={uid} embedded />
            </div>
          </Suspense>
        )}
        {activeKey === "market" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <MarketSettingPage uid={uid} embedded />
            </div>
          </Suspense>
        )}
      </section>
      <ToastContainer />
    </main>
  );
};

export default SettingPage;
