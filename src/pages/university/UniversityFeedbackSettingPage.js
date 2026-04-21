import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  query,
  getDoc,
  Timestamp,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

// Pagination Component
const Pager = ({ page, setPage, pageSize, setPageSize, total }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Rows per page</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[5, 10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>

        <div className="flex gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page === totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const UniversityFeedbackSettingPage = ({ navbarHeight }) => {
  const [list, setList] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteData, setDeleteData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const initialForm = { id: "", name: "" };
  const [form, setForm] = useState(initialForm);

  const safeList = Array.isArray(list) ? list : [];

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return safeList.slice(start, start + pageSize);
  }, [safeList, page, pageSize]);

  useEffect(() => {
    fetchData();
  }, [universityId]);

  useEffect(() => {
    setPage(1);
  }, [safeList.length]);

  const fetchData = async () => {
    if (!universityId) {
      setList([]);
      return;
    }

    setIsLoading(true);
    try {
      const q = query(
        collection(db, "university", universityId, "feedbackitems"),
        orderBy("name", "asc")
      );

      const snap = await getDocs(q);

      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setList(data);
    } catch (err) {
      console.log(err);
      toast.error("Failed to load feedback items");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = form.name?.trim();
    if (!trimmedName) return;

    try {
      const duplicate = safeList.some(
        (item) =>
          item.name?.trim().toLowerCase() === trimmedName.toLowerCase() &&
          item.id !== form.id
      );

      if (duplicate) {
        toast.warn("Duplicate found! Not adding.");
        return;
      }

      if (editing) {
        const docRef = doc(
          db,
          "university",
          universityId,
          "feedbackitems",
          form.id
        );
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
          toast.error("Data not found");
          return;
        }

        await updateDoc(docRef, {
          name: trimmedName,
          universityid: universityId,
          updatedBy: uid || "",
          updatedAt: Timestamp.now(),
        });

        toast.success("Updated");
      } else {
        await addDoc(collection(db, "university", universityId, "feedbackitems"), {
          name: trimmedName,
          universityid: universityId,
          createdBy: uid || "",
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });

        toast.success("Added");
      }

      await fetchData();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
    } catch (err) {
      console.log(err);
      toast.error("Save failed");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteDoc(
        doc(db, "university", universityId, "feedbackitems", deleteData.id)
      );
      toast.success("Deleted");
      await fetchData();
    } catch (err) {
      console.log(err);
      toast.error("Delete failed");
    }

    setDeleteModal(false);
    setDeleteData(null);
  };

  if (!universityId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          No university assigned.
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex justify-between mb-4">
        <h1 className="text-2xl font-bold">University Feedback Settings</h1>

        <button
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
          className="px-4 py-2 bg-black text-white rounded"
        >
          + Add Feedback
        </button>
      </div>

      <div className="bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <FadeLoader />
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left">Name</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>

              <tbody>
                {slice.map((item) => (
                  <tr key={item.id}>
                    <td className="p-3">{item.name}</td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
                          setModalOpen(true);
                        }}
                        className="text-blue-600 mr-3"
                      >
                        Edit
                      </button>

                      <button
                        onClick={() => {
                          setDeleteData(item);
                          setDeleteModal(true);
                        }}
                        className="text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {slice.length === 0 && (
                  <tr>
                    <td colSpan={2} className="text-center p-6">
                      No Data
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pager
              page={page}
              setPage={setPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
              total={safeList.length}
            />
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center">
          <div className="bg-white p-6 rounded w-96">
            <h2 className="text-xl mb-4">
              {editing ? "Edit Feedback" : "Add Feedback"}
            </h2>

            <form onSubmit={handleSubmit}>
              <input
                className="w-full border p-2 mb-4"
                placeholder="Enter name"
                value={form.name}
                onChange={(e) =>
                  setForm({ ...form, name: e.target.value })
                }
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                  }}
                >
                  Cancel
                </button>
                <button className="bg-blue-600 text-white px-4 py-2 rounded">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center">
          <div className="bg-white p-6 rounded w-80">
            <h2 className="text-red-600 mb-3">Delete?</h2>
            <p>{deleteData?.name}</p>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDeleteModal(false)}>
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="bg-red-600 text-white px-4 py-2 rounded"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
};

export default UniversityFeedbackSettingPage;