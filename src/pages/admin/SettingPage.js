import React, { useState, useEffect, useMemo, lazy, Suspense } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

const MaintenanceCategoryPage = lazy(() =>
  import("./MaintenanceCategoryPage") 
);
const ReportSettingPage = lazy(() =>
  import("./ReportSettingPage") 
);
const FeedbackSettingPage = lazy(() =>
  import("./FeedbackSettingPage") 
);
const EmployeeSettingPage = lazy(() =>
  import("./EmployeeSettingPage") 
);
const EventSettingPage = lazy(() =>
  import("./EventSettingPage") 
);

// ---------- Small UI helpers ----------
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

const ListTable = ({ rows, onEdit, onDelete, emptyText = "No data" }) => (
  <div className="overflow-x-auto bg-white rounded shadow">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
          <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        {rows.length ? rows.map((item) => (
          <tr key={item.id}>
            <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-800">{item.name}</td>
            <td className="px-6 py-3 whitespace-nowrap text-sm">
              <button
                className="text-blue-600 hover:underline mr-4"
                onClick={() => onEdit(item)}
              >
                Edit
              </button>
              <button
                className="text-red-600 hover:underline"
                onClick={() => onDelete(item)}
              >
                Delete
              </button>
            </td>
          </tr>
        )) : (
          <tr><td className="px-6 py-4 text-sm text-gray-500" colSpan={2}>{emptyText}</td></tr>
        )}
      </tbody>
    </table>
  </div>
);

const ConfirmModal = ({ open, title = "Confirm", message, onCancel, onConfirm, confirmLabel = "Delete" }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={onCancel}>
            Cancel
          </button>
          <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

const EditModal = ({ open, title, form, setForm, onCancel, onSave }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="space-y-4"
        >
          <input
            name="name"
            placeholder="Category name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-300 p-2 rounded"
            required
          />
          <div className="flex justify-end gap-3">
            <button type="button" className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300" onClick={onCancel}>
              Cancel
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const FooterPager = ({ page, totalPages, onPrev, onNext }) => (
  <div className="flex justify-between items-center mt-4">
    <p className="text-sm text-gray-600">
      Page {page} of {totalPages}
    </p>
    <div className="space-x-2">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
      >
        Previous
      </button>
      <button
        onClick={onNext}
        disabled={page >= totalPages}
        className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
      >
        Next
      </button>
    </div>
  </div>
);

// ---------- Main ----------
const SettingPage = () => {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);
  const hostelId = emp?.hostelid;

  // Sidebar menu — both open inline now
  const MENU = [
    { key: "events", label: "Event Categories" },
    { key: "academics", label: "Academic Categories" },
    { key: "maintenance", label: "Maintenance Settings" },
    { key: "reports", label: "Report Settings" },
    { key: "feedback", label: "Feebback Setting" },
    { key: "employee", label: "Employee Setting" },
    { key: "event", label: "Event Setting" },
  ];
  const [activeKey, setActiveKey] = useState("events");

  // Full lists (client-side pagination)
  const [eventAll, setEventAll] = useState([]);
  const [academicAll, setAcademicAll] = useState([]);

  // Loading
  const [loadingKey, setLoadingKey] = useState("");

  // Simple pagination
  const PAGE_SIZE = 10;
  const [eventPage, setEventPage] = useState(1);
  const [acadPage, setAcadPage] = useState(1);

  // Modals
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("Add");
  const [currentCollection, setCurrentCollection] = useState("eventcategory");
  const [editingData, setEditingData] = useState(null);
  const [form, setForm] = useState(initialForm);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const isEvents = activeKey === "events";
  const sectionTitle =
    activeKey === "events" ? "Event Categories" :
    activeKey === "academics" ? "Academic Categories" : "";

  // Fetch all docs once per refresh
  const fetchAll = async () => {
    if (!hostelId) return;
    try {
      setLoadingKey("events");
      const evSnap = await getDocs(
        query(collection(db, "eventcategory"), where("hostelid", "==", hostelId))
      );
      const evRows = evSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      evRows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setEventAll(evRows);
      setEventPage((p) => Math.min(p, Math.max(1, Math.ceil(evRows.length / PAGE_SIZE))));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load event categories");
    } finally {
      setLoadingKey("");
    }

    try {
      setLoadingKey("academics");
      const acSnap = await getDocs(
        query(collection(db, "academiccategory"), where("hostelid", "==", hostelId))
      );
      const acRows = acSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      acRows.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setAcademicAll(acRows);
      setAcadPage((p) => Math.min(p, Math.max(1, Math.ceil(acRows.length / PAGE_SIZE))));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load academic categories");
    } finally {
      setLoadingKey("");
    }
  };

  useEffect(() => {
    if (!hostelId) return;
    fetchAll();
  }, [hostelId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived pages
  const eventTotalPages = Math.max(1, Math.ceil(eventAll.length / PAGE_SIZE));
  const acadTotalPages = Math.max(1, Math.ceil(academicAll.length / PAGE_SIZE));

  const eventPageRows = useMemo(() => {
    const start = (eventPage - 1) * PAGE_SIZE;
    return eventAll.slice(start, start + PAGE_SIZE);
  }, [eventAll, eventPage]);

  const acadPageRows = useMemo(() => {
    const start = (acadPage - 1) * PAGE_SIZE;
    return academicAll.slice(start, start + PAGE_SIZE);
  }, [academicAll, acadPage]);

  // Pagination actions
  const nextEvents = () => setEventPage((p) => Math.min(p + 1, eventTotalPages));
  const prevEvents = () => setEventPage((p) => Math.max(p - 1, 1));
  const nextAcad = () => setAcadPage((p) => Math.min(p + 1, acadTotalPages));
  const prevAcad = () => setAcadPage((p) => Math.max(p - 1, 1));

  // CRUD handlers (then refetch all)
  const openAdd = () => {
    setEditingData(null);
    setForm(initialForm);
    setCurrentCollection(isEvents ? "eventcategory" : "academiccategory");
    setEditTitle(isEvents ? "Add Event Category" : "Add Academic Category");
    setEditOpen(true);
  };

  const openEdit = (item) => {
    setEditingData(item);
    setForm({ id: item.id, name: item.name || "" });
    setCurrentCollection(isEvents ? "eventcategory" : "academiccategory");
    setEditTitle(isEvents ? "Edit Event Category" : "Edit Academic Category");
    setEditOpen(true);
  };

  const doSave = async () => {
    try {
      const name = form.name?.trim();
      if (!name) return;

      const list = isEvents ? eventAll : academicAll;
      const dupInList = list.some((x) => toKey(x.name) === toKey(name) && x.id !== form.id);
      if (dupInList) {
        toast.warn("Duplicate found!");
        return;
      }

      if (!editingData) {
        await addDoc(collection(db, currentCollection), {
          uid: uid || "",
          name,
          hostelid: hostelId || "",
          createdBy: uid || "",
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
      } else {
        const ref = doc(db, currentCollection, form.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Data does not exist! Cannot update.");
          return;
        }
        await updateDoc(ref, {
          uid: uid || "",
          name,
          hostelid: hostelId || "",
          updatedBy: uid || "",
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      }

      await fetchAll();
    } catch (e) {
      console.error("Error saving data:", e);
      toast.error("Error saving data");
    } finally {
      setEditOpen(false);
      setEditingData(null);
      setForm(initialForm);
    }
  };

  const openDelete = (item) => {
    setToDelete(item);
    setConfirmOpen(true);
  };

  const doDelete = async () => {
    try {
      if (!toDelete?.id) return;
      await deleteDoc(doc(db, currentCollection, toDelete.id));
      toast.success("Successfully deleted!");

      await fetchAll();
      if (activeKey === "events") {
        setEventPage((p) => Math.min(p, Math.max(1, Math.ceil((eventAll.length - 1) / PAGE_SIZE))));
      } else if (activeKey === "academics") {
        setAcadPage((p) => Math.min(p, Math.max(1, Math.ceil((academicAll.length - 1) / PAGE_SIZE))));
      }
    } catch (e) {
      console.error("Error deleting document:", e);
      toast.error("Error deleting document");
    } finally {
      setConfirmOpen(false);
      setToDelete(null);
    }
  };

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
                className={`w-full text-left px-3 py-2 rounded mb-1 ${
                  active ? "bg-black text-white" : "hover:bg-gray-100"
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
        {/* Inline Maintenance */}
        {activeKey === "maintenance" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <MaintenanceCategoryPage hostelid={hostelId} uid={uid} embedded />
            </div>
          </Suspense>
        )}

        {/* Inline Reports */}
        {activeKey === "reports" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <ReportSettingPage hostelid={hostelId} uid={uid} embedded />
            </div>
          </Suspense>
        )}
        {activeKey === "feedback" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <FeedbackSettingPage hostelid={hostelId} uid={uid} embedded />
            </div>
          </Suspense>
        )}
        {activeKey === "employee" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <EmployeeSettingPage hostelid={hostelId} uid={uid} embedded />
            </div>
          </Suspense>
        )}
        {activeKey === "event" && (
          <Suspense fallback={
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" />
            </div>
          }>
            <div className="bg-white rounded shadow p-4">
              <EventSettingPage hostelid={hostelId} uid={uid} embedded />
            </div>
          </Suspense>
        )}

        {/* Events */}
        {activeKey === "events" && (
          <>
            <SectionHeader title={sectionTitle} actionLabel="+ Add Event Category" onAction={openAdd} />
            {loadingKey === "events" ? (
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            ) : (
              <>
                <ListTable
                  rows={eventPageRows}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  emptyText="No event categories yet."
                />
                <FooterPager
                  page={eventPage}
                  totalPages={eventTotalPages}
                  onPrev={prevEvents}
                  onNext={nextEvents}
                />
              </>
            )}
            {/* {QuickCards} */}
          </>
        )}

        {/* Academics */}
        {activeKey === "academics" && (
          <>
            <SectionHeader title={sectionTitle} actionLabel="+ Add Academic Category" onAction={openAdd} />
            {loadingKey === "academics" ? (
              <div className="flex justify-center items-center h-64">
                <FadeLoader color="#36d7b7" />
              </div>
            ) : (
              <>
                <ListTable
                  rows={acadPageRows}
                  onEdit={openEdit}
                  onDelete={openDelete}
                  emptyText="No academic categories yet."
                />
                <FooterPager
                  page={acadPage}
                  totalPages={acadTotalPages}
                  onPrev={prevAcad}
                  onNext={nextAcad}
                />
              </>
            )}
            {/* {QuickCards} */}
          </>
        )}
      </section>

      {/* Modals */}
      <EditModal
        open={editOpen}
        title={editTitle}
        form={form}
        setForm={setForm}
        onCancel={() => {
          setEditOpen(false);
          setEditingData(null);
          setForm(initialForm);
        }}
        onSave={doSave}
      />

      <ConfirmModal
        open={confirmOpen}
        title="Delete Category"
        message={`Are you sure you want to delete "${toDelete?.name || ""}"?`}
        onCancel={() => {
          setConfirmOpen(false);
          setToDelete(null);
        }}
        onConfirm={doDelete}
      />

      <ToastContainer />
    </main>
  );
};

export default SettingPage;
