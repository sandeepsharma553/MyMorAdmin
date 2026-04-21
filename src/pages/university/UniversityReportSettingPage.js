// src/pages/UniversityReportSettingPage.jsx
import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

// Reusable pager
const Pager = ({ page, setPage, pageSize, setPageSize, total }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Rows per page</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[5, 10, 20, 50, 100].map((n) => (
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
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1 rounded border ${
              canPrev
                ? "bg-white hover:bg-gray-50"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            Prev
          </button>
          <button
            className={`px-3 py-1 rounded border ${
              canNext
                ? "bg-white hover:bg-gray-50"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => canNext && setPage((p) => p + 1)}
            disabled={!canNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const UniversityReportSettingPage = ({ navbarHeight }) => {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [problemDeleteModelOpen, setProblemDeleteModelOpen] = useState(false);
  const [reportList, setReportList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize, setReportPageSize] = useState(5);

  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const initialForm = { id: 0, name: "" };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    getReportList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  useEffect(() => setReportPage(1), [reportList.length]);

  const reportSlice = useMemo(() => {
    const start = (reportPage - 1) * reportPageSize;
    return reportList.slice(start, start + reportPageSize);
  }, [reportList, reportPage, reportPageSize]);

  const getReportList = async () => {
    if (!universityId) {
      setReportList([]);
      return;
    }

    setIsLoading(true);
    try {
      const reportQuery = query(
        collection(db, "reportitems"),
        where("universityid", "==", universityId)
      );

      const querySnapshot = await getDocs(reportQuery);
      const documents = querySnapshot.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));

      setReportList(documents);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load report items");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!form.name?.trim()) return;

      if (editingData) {
        const docRef = doc(db, "reportitems", form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning("Data does not exist! Cannot update.");
          return;
        }

        await updateDoc(docRef, {
          uid,
          name: form.name.trim(),
          universityid: universityId,
          updatedBy: uid,
          updatedDate: new Date(),
        });

        toast.success("Successfully updated");
      } else {
        const dupQuery = query(
          collection(db, "reportitems"),
          where("name", "==", form.name.trim()),
          where("universityid", "==", universityId)
        );

        const querySnapshot = await getDocs(dupQuery);
        if (!querySnapshot.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }

        await addDoc(collection(db, "reportitems"), {
          uid,
          name: form.name.trim(),
          universityid: universityId,
          createdBy: uid,
          createdDate: new Date(),
        });

        toast.success("Successfully saved");
      }

      await getReportList();
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }

    setReportModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;

    try {
      await deleteDoc(doc(db, "reportitems", deleteData.id));
      toast.success("Successfully deleted!");
      await getReportList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Delete failed");
    }

    setProblemDeleteModelOpen(false);
    setDelete(null);
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
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Report Setting</h1>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => {
              setEditing(null);
              setForm(initialForm);
              setReportModalOpen(true);
            }}
          >
            + Add Report Items
          </button>
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {reportSlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
                          setReportModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setForm(item);
                          setProblemDeleteModelOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {reportSlice.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-10 text-center text-sm text-gray-500"
                      colSpan={2}
                    >
                      No records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pager
              page={reportPage}
              setPage={setReportPage}
              pageSize={reportPageSize}
              setPageSize={setReportPageSize}
              total={reportList.length}
            />
          </>
        )}
      </div>

      {reportModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Report Type" : "Add Report Type"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Type"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setReportModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                  }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {problemDeleteModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Report Type
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setProblemDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
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

export default UniversityReportSettingPage;