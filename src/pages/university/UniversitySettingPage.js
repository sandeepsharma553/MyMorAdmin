import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

const UniversityMaintenancePage = lazy(() =>
  import("./UniversityMaintenancePage")
);
const UniversityReportSettingPage = lazy(() =>
  import("./UniversityReportSettingPage")
);
const UniversityFeedbackSettingPage = lazy(() =>
  import("./UniversityFeedbackSettingPage")
);
const UniversityEmployeeSettingPage = lazy(() =>
  import("./UniversityEmployeeSettingPage")
);
const UniversityEventSettingPage = lazy(() =>
  import("./UniversityEventSettingPage")
);

// ---------- helpers ----------
const initialForm = { id: "", name: "" };
const toKey = (s) => (s || "").trim().toLowerCase();

const SectionHeader = ({ title, actionLabel, onAction }) => (
  <div className="flex items-center justify-between mb-4">
    <h2 className="text-xl font-semibold">{title}</h2>
    {actionLabel && (
      <button
        className="px-4 py-2 bg-black text-white rounded"
        onClick={onAction}
      >
        {actionLabel}
      </button>
    )}
  </div>
);

const ListTable = ({ rows, onEdit, onDelete }) => (
  <div className="bg-white rounded shadow">
    <table className="min-w-full">
      <thead>
        <tr>
          <th className="p-3 text-left">Name</th>
          <th className="p-3 text-left">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((item) => (
          <tr key={item.id}>
            <td className="p-3">{item.name}</td>
            <td className="p-3">
              <button onClick={() => onEdit(item)}>Edit</button>
              <button onClick={() => onDelete(item)} className="ml-3 text-red-500">Delete</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------- MAIN ----------
const UniversitySettingPage = () => {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);

  // ✅ CHANGE HERE
  const universityId = emp?.universityid;

  const [activeKey, setActiveKey] = useState("events");

  const [eventAll, setEventAll] = useState([]);
  const [academicAll, setAcademicAll] = useState([]);

  const [form, setForm] = useState(initialForm);
  const [editingData, setEditingData] = useState(null);
  const [editOpen, setEditOpen] = useState(false);

  const isEvents = activeKey === "events";

  // ---------- FETCH ----------
  const fetchAll = async () => {
    if (!universityId) return;

    const evSnap = await getDocs(
      query(collection(db, "eventcategory"), where("universityid", "==", universityId))
    );

    setEventAll(evSnap.docs.map(d => ({ id: d.id, ...d.data() })));

    const acSnap = await getDocs(
      query(collection(db, "academiccategory"), where("universityid", "==", universityId))
    );

    setAcademicAll(acSnap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  useEffect(() => {
    fetchAll();
  }, [universityId]);

  // ---------- SAVE ----------
  const doSave = async () => {
    const name = form.name?.trim();
    if (!name) return;

    if (!editingData) {
      await addDoc(collection(db, isEvents ? "eventcategory" : "academiccategory"), {
        name,
        universityid: universityId,
        uid,
        createdDate: new Date(),
      });
    } else {
      await updateDoc(doc(db, isEvents ? "eventcategory" : "academiccategory", form.id), {
        name,
        universityid: universityId,
        updatedDate: new Date(),
      });
    }

    toast.success("Saved!");
    setEditOpen(false);
    setForm(initialForm);
    setEditingData(null);
    fetchAll();
  };

  // ---------- DELETE ----------
  const doDelete = async (item) => {
    await deleteDoc(doc(db, isEvents ? "eventcategory" : "academiccategory", item.id));
    toast.success("Deleted!");
    fetchAll();
  };

  // ---------- UI ----------
  return (
    <main className="flex bg-gray-100 min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r p-4">
        <h1 className="text-lg font-bold mb-4">University Settings</h1>

        <button onClick={() => setActiveKey("events")} className="block mb-2">
          Event Categories
        </button>
        <button onClick={() => setActiveKey("academics")} className="block mb-2">
          Academic Categories
        </button>
        <button onClick={() => setActiveKey("maintenance")} className="block mb-2">
          Maintenance
        </button>
        <button onClick={() => setActiveKey("reports")} className="block mb-2">
          Reports
        </button>
      </aside>

      {/* Content */}
      <section className="flex-1 p-6">
        {/* EVENTS */}
        {activeKey === "events" && (
          <>
            <SectionHeader title="Event Categories" actionLabel="+ Add" onAction={() => setEditOpen(true)} />

            <ListTable
              rows={eventAll}
              onEdit={(item) => {
                setEditingData(item);
                setForm(item);
                setEditOpen(true);
              }}
              onDelete={doDelete}
            />
          </>
        )}

        {/* ACADEMICS */}
        {activeKey === "academics" && (
          <>
            <SectionHeader title="Academic Categories" actionLabel="+ Add" onAction={() => setEditOpen(true)} />

            <ListTable
              rows={academicAll}
              onEdit={(item) => {
                setEditingData(item);
                setForm(item);
                setEditOpen(true);
              }}
              onDelete={doDelete}
            />
          </>
        )}

        {/* INLINE PAGES */}
        {activeKey === "maintenance" && (
          <UniversityMaintenancePage universityid={universityId} uid={uid} embedded />
        )}
        {activeKey === "reports" && (
          <UniversityReportSettingPage universityid={universityId} uid={uid} embedded />
        )}
      </section>

      {/* MODAL */}
      {editOpen && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white p-5 rounded w-80">
            <h3 className="mb-3 font-bold">
              {editingData ? "Edit" : "Add"} Category
            </h3>

            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border p-2 w-full mb-4"
              placeholder="Enter name"
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setEditOpen(false)}>Cancel</button>
              <button onClick={doSave} className="bg-black text-white px-3 py-1 rounded">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
};

export default UniversitySettingPage;