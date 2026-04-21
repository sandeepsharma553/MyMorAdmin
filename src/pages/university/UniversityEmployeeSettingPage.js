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

const UniversityEmployeeSettingPage = (props) => {
  const { navbarHeight } = props;

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [roleDeleteModelOpen, setRoleDeleteModelOpen] = useState(false);
  const [rolelist, setRoletList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [rolePage, setRolePage] = useState(1);
  const [rolePageSize, setRolePageSize] = useState(5);

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  const universityId = String(
    emp?.universityid || emp?.universityId || emp?.university || ""
  );

  const initialForm = { id: 0, name: "" };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    if (universityId) {
      getRoleList();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [universityId]);

  useEffect(() => setRolePage(1), [rolelist.length]);

  const problemSlice = useMemo(() => {
    const start = (rolePage - 1) * rolePageSize;
    return rolelist.slice(start, start + rolePageSize);
  }, [rolelist, rolePage, rolePageSize]);

  const getRoleList = async () => {
    if (!universityId) return;

    setIsLoading(true);
    try {
      const maintenanceCategoryQuery = query(
        collection(db, "universityrole"),
        where("universityid", "==", universityId)
      );

      const querySnapshot = await getDocs(maintenanceCategoryQuery);
      const documents = querySnapshot.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));

      setRoletList(documents);
    } catch (error) {
      console.error("Error fetching roles:", error);
      toast.error("Failed to load roles");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (!form.name?.trim()) return;

      if (editingData) {
        const docRef = doc(db, "universityrole", form.id);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
          toast.warning("Data does not exist! Cannot update.");
          return;
        }

        await updateDoc(doc(db, "universityrole", form.id), {
          uid,
          name: form.name.trim(),
          universityid: universityId,
          updatedBy: uid,
          updatedDate: new Date(),
        });

        toast.success("Successfully updated");
        getRoleList();
      } else {
        const q = query(
          collection(db, "universityrole"),
          where("name", "==", form.name.trim()),
          where("universityid", "==", universityId)
        );

        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }

        await addDoc(collection(db, "universityrole"), {
          uid,
          name: form.name.trim(),
          universityid: universityId,
          createdBy: uid,
          createdDate: new Date(),
        });

        toast.success("Successfully saved");
        getRoleList();
      }
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Something went wrong while saving");
    }

    setRoleModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const handleDelete = async () => {
    if (!deleteData) return;

    try {
      await deleteDoc(doc(db, "universityrole", form.id));
      toast.success("Successfully deleted!");
      getRoleList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Something went wrong while deleting");
    }

    setRoleDeleteModelOpen(false);
    setDelete(null);
  };

  if (!universityId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
          No university assigned.
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Employee Setting</h1>

        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => {
              setEditing(null);
              setForm(initialForm);
              setRoleModalOpen(true);
            }}
          >
            + Add Role
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
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {problemSlice.map((item, i) => (
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
                          setRoleModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setForm(item);
                          setRoleDeleteModelOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {problemSlice.length === 0 && (
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
              page={rolePage}
              setPage={setRolePage}
              pageSize={rolePageSize}
              setPageSize={setRolePageSize}
              total={rolelist.length}
            />
          </>
        )}
      </div>

      {roleModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Role" : "Add Role"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Role"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setRoleModalOpen(false);
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

      {roleDeleteModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Role
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setRoleDeleteModelOpen(false);
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

export default UniversityEmployeeSettingPage;