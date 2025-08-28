import React, { useState, useEffect, useMemo } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
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
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1 rounded border ${canPrev ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            Prev
          </button>
          <button
            className={`px-3 py-1 rounded border ${canNext ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
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

const MaintenanceCategoryPage = (props) => {
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [itemCatModalOpen, setItemCatModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [problemDeleteModelOpen, setProblemDeleteModelOpen] = useState(false);
  const [itemCatDeletModelOpen, setItemCatDeleteModelOpen] = useState(false);
  const [itemDeletModelOpen, setItemDeleteModelOpen] = useState(false);
  const [typeDeletModelOpen, setTypeDeleteModelOpen] = useState(false);
  const [problemCatlist, setProblemCatList] = useState([]);
  const [itemCatlist, setItemCatList] = useState([]);
  const [itemlist, setItemList] = useState([]);
  const [typelist, setTypeList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination state (independent per table)
  const [problemPage, setProblemPage] = useState(1);
  const [problemPageSize, setProblemPageSize] = useState(5);
  const [itemCatPage, setItemCatPage] = useState(1);
  const [itemCatPageSize, setItemCatPageSize] = useState(5);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(5);
  const [typePage, setTypePage] = useState(1);
  const [typePageSize, settypePageSize] = useState(5);

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);
  const initialForm = { id: 0, name: "" };
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    getProblemCatList();
    getItemCatList();
    getItemList();
    getTypeList();
  }, []);

  // Reset to first page when dataset changes
  useEffect(() => setProblemPage(1), [problemCatlist.length]);
  useEffect(() => setItemCatPage(1), [itemCatlist.length]);
  useEffect(() => setItemPage(1), [itemlist.length]);
  useEffect(() => setTypePage(1), [itemlist.length]);

  // Derived, paginated slices
  const problemSlice = useMemo(() => {
    const start = (problemPage - 1) * problemPageSize;
    return problemCatlist.slice(start, start + problemPageSize);
  }, [problemCatlist, problemPage, problemPageSize]);

  const itemCatSlice = useMemo(() => {
    const start = (itemCatPage - 1) * itemCatPageSize;
    return itemCatlist.slice(start, start + itemCatPageSize);
  }, [itemCatlist, itemCatPage, itemCatPageSize]);

  const itemSlice = useMemo(() => {
    const start = (itemPage - 1) * itemPageSize;
    return itemlist.slice(start, start + itemPageSize);
  }, [itemlist, itemPage, itemPageSize]);

  const typeSlice = useMemo(() => {
    const start = (itemPage - 1) * typePageSize;
    return typelist.slice(start, start + typePageSize);
  }, [typelist, typePage, typePageSize]);

  const getProblemCatList = async () => {
    setIsLoading(true);
    const maintenanceCategoryQuery = query(
      collection(db, "problemcategory"),
      where("hostelid", "==", emp.hostelid)
    );

    const querySnapshot = await getDocs(maintenanceCategoryQuery);
    const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
    setProblemCatList(documents);
    setIsLoading(false);
  };

  const getItemCatList = async () => {
    setIsLoading(true);
    const itemCategoryQuery = query(
      collection(db, "itemcategory"),
      where("hostelid", "==", emp.hostelid)
    );

    const querySnapshot = await getDocs(itemCategoryQuery);
    const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
    setItemCatList(documents);
    setIsLoading(false);
  };

  const getItemList = async () => {
    setIsLoading(true);
    const itemQuery = query(
      collection(db, "maintenanceitems"),
      where("hostelid", "==", emp.hostelid)
    );
    const querySnapshot = await getDocs(itemQuery);
    const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
    setItemList(documents);
    setIsLoading(false);
  };
  const getTypeList = async () => {
    setIsLoading(true);
    const itemQuery = query(
      collection(db, "maintenancetype"),
      where("hostelid", "==", emp.hostelid)
    );
    const querySnapshot = await getDocs(itemQuery);
    const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
    setTypeList(documents);
    setIsLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!form.name) return;
      if (editingData) {
        const docRef = doc(db, "problemcategory", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("data does not exist! Cannot update.");
          return;
        }
        await updateDoc(doc(db, "problemcategory", form.id), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
        getProblemCatList();
      } else {
        const q = query(collection(db, "problemcategory"), where("name", "==", form.name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "problemcategory"), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
        getProblemCatList();
      }
    } catch (error) {
      console.error("Error saving data:", error);
    }
    // Reset
    setProblemModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, "problemcategory", form.id));
      toast.success("Successfully deleted!");
      getProblemCatList();
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
    setProblemDeleteModelOpen(false);
    setDelete(null);
  };

  const handleItemCatSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!form.name) return;
      if (editingData) {
        const docRef = doc(db, "itemcategory", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("data does not exist! Cannot update.");
          return;
        }
        await updateDoc(doc(db, "itemcategory", form.id), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
        getItemCatList();
      } else {
        const q = query(collection(db, "itemcategory"), where("name", "==", form.name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "itemcategory"), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
        getItemCatList();
      }
    } catch (error) {
      console.error("Error saving data:", error);
    }
    setItemCatModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const handleItemCatDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, "itemcategory", form.id));
      toast.success("Successfully deleted!");
      getItemCatList();
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
    setItemCatDeleteModelOpen(false);
    setDelete(null);
  };

  const handleItemSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!form.name) return;
      if (editingData) {
        const docRef = doc(db, "maintenanceitems", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("data does not exist! Cannot update.");
          return;
        }
        await updateDoc(doc(db, "maintenanceitems", form.id), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
        getItemList();
      } else {
        const q = query(collection(db, "maintenanceitems"), where("name", "==", form.name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "maintenanceitems"), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
        getItemList();
      }
    } catch (error) {
      console.error("Error saving data:", error);
    }
    setItemModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const handleItemDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, "maintenanceitems", form.id));
      toast.success("Successfully deleted!");
      getItemList();
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
    setItemDeleteModelOpen(false);
    setDelete(null);
  };

  const handleTypeSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!form.name) return;
      if (editingData) {
        const docRef = doc(db, "maintenancetype", form.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          toast.warning("data does not exist! Cannot update.");
          return;
        }
        await updateDoc(doc(db, "maintenancetype", form.id), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
        getTypeList();
      } else {
        const q = query(collection(db, "maintenancetype"), where("name", "==", form.name));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "maintenancetype"), {
          uid,
          name: form.name,
          hostelid: emp.hostelid,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
        getTypeList();
      }
    } catch (error) {
      console.error("Error saving data:", error);
    }
    setTypeModalOpen(false);
    setEditing(null);
    setForm(initialForm);
  };

  const handleTypeDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteDoc(doc(db, "maintenancetype", form.id));
      toast.success("Successfully deleted!");
      getTypeList();
    } catch (error) {
      console.error("Error deleting document: ", error);
    }
    setTypeDeleteModelOpen(false);
    setDelete(null);
  };
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add buttons */}
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Maintenance Setting</h1>
        <div className="flex gap-2">
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => {
              setEditing(null);
              setForm(initialForm);
              setProblemModalOpen(true);
            }}
          >
            + Add Problem Category
          </button>
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => {
              setEditing(null);
              setForm(initialForm);
              setItemCatModalOpen(true);
            }}
          >
            + Add Item Category
          </button>
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => {
              setEditing(null);
              setForm(initialForm);
              setItemModalOpen(true);
            }}
          >
            + Add Items
          </button>
          <button
            className="px-4 py-2 bg-black text-white rounded hover:bg-black"
            onClick={() => {
              setEditing(null);
              setForm(initialForm);
              setTypeModalOpen(true);
            }}
          >
            + Add Type
          </button>
        </div>
      </div>

      {/* Problem Categories */}
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Problem Category</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {problemSlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
                          setProblemModalOpen(true);
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
                {problemSlice.length === 0 && (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager
              page={problemPage}
              setPage={setProblemPage}
              pageSize={problemPageSize}
              setPageSize={setProblemPageSize}
              total={problemCatlist.length}
            />
          </>
        )}
      </div>

      {/* Problem Category Modal */}
      {problemModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add Problem Category</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Category"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setProblemModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {problemDeleteModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Problem Category</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
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
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <br />

      {/* Item Categories */}
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item Category</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemCatSlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
                          setItemCatModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setForm(item);
                          setItemCatDeleteModelOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {itemCatSlice.length === 0 && (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager
              page={itemCatPage}
              setPage={setItemCatPage}
              pageSize={itemCatPageSize}
              setPageSize={setItemCatPageSize}
              total={itemCatlist.length}
            />
          </>
        )}
      </div>

      {/* Item Category Modal */}
      {itemCatModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add Item Category</h2>
            <form onSubmit={handleItemCatSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Category"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setItemCatModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {itemCatDeletModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Item Category</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setItemCatDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={handleItemCatDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <br />

      {/* Items */}
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemSlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
                          setItemModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setForm(item);
                          setItemDeleteModelOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {itemSlice.length === 0 && (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager
              page={itemPage}
              setPage={setItemPage}
              pageSize={itemPageSize}
              setPageSize={setItemPageSize}
              total={itemlist.length}
            />
          </>
        )}
      </div>

      {/* Item Modal */}
      {itemModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add Items</h2>
            <form onSubmit={handleItemSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Item name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setItemModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {itemDeletModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Item</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setItemDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={handleItemDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {typeSlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm(item);
                          setTypeModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setForm(item);
                          setTypeDeleteModelOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {typeSlice.length === 0 && (
                  <tr>
                    <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager
              page={itemPage}
              setPage={setItemPage}
              pageSize={itemPageSize}
              setPageSize={setItemPageSize}
              total={itemlist.length}
            />
          </>
        )}
      </div>

      {/* Item Modal */}
      {typeModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">Add Type</h2>
            <form onSubmit={handleTypeSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="type"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setTypeModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {typeDeletModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Type</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setTypeDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={handleTypeDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
};

export default MaintenanceCategoryPage;
