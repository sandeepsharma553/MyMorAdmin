import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

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

const UniversityAcademicCategoryPage = ({ navbarHeight }) => {
  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);
  const universityId = String(
    emp?.universityid || emp?.universityId || ""
  );

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const [editingData, setEditingData] = useState(null);
  const [deleteData, setDeleteData] = useState(null);

  const initialForm = { id: "", name: "" };
  const [form, setForm] = useState(initialForm);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    fetchAcademicCategories();
  }, [universityId]);

  useEffect(() => {
    setPage(1);
  }, [list.length]);

  const paginatedList = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  const fetchAcademicCategories = async () => {
    if (!universityId) {
      setList([]);
      return;
    }

    setIsLoading(true);
    try {
      const q = query(
        collection(db, "university", universityId, "academiccategory"),
        orderBy("name", "asc")
      );

      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setList(rows);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load academic categories");
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
      const trimmedName = form.name?.trim();
      if (!trimmedName) return;

      const duplicate = list.some(
        (item) =>
          item.name?.trim().toLowerCase() === trimmedName.toLowerCase() &&
          item.id !== form.id
      );

      if (duplicate) {
        toast.warn("Duplicate found! Not adding.");
        return;
      }

      if (editingData) {
        const docRef = doc(
          db,
          "university",
          universityId,
          "academiccategory",
          form.id
        );

        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning("Data does not exist! Cannot update.");
          return;
        }

        await updateDoc(docRef, {
          name: trimmedName,
          universityid: universityId,
          updatedBy: uid || "",
          updatedAt: Timestamp.now(),
        });

        toast.success("Academic category updated successfully");
      } else {
        await addDoc(
          collection(db, "university", universityId, "academiccategory"),
          {
            uid: uid || "",
            name: trimmedName,
            universityid: universityId,
            createdBy: uid || "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }
        );

        toast.success("Academic category saved successfully");
      }

      await fetchAcademicCategories();
      setModalOpen(false);
      setEditingData(null);
      setForm(initialForm);
    } catch (error) {
      console.error(error);
      toast.error("Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;

    try {
      await deleteDoc(
        doc(db, "university", universityId, "academiccategory", deleteData.id)
      );

      toast.success("Academic category deleted successfully");
      await fetchAcademicCategories();
    } catch (error) {
      console.error(error);
      toast.error("Delete failed");
    }

    setDeleteModalOpen(false);
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
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Academic Categories</h1>

        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditingData(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          + Add Academic Category
        </button>
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
                    Academic Category
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {paginatedList.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditingData(item);
                          setForm(item);
                          setModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDeleteData(item);
                          setDeleteModalOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {paginatedList.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-10 text-center text-sm text-gray-500"
                      colSpan={2}
                    >
                      No academic categories found
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
              total={list.length}
            />
          </>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Academic Category" : "Add Academic Category"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Academic Category"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditingData(null);
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

      {deleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Academic Category
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteData(null);
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

export default UniversityAcademicCategoryPage;