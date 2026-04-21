import React, { useState, useEffect, useMemo } from "react";
import {
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  getDoc,
  writeBatch,
  Timestamp,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

/* -------------------- Reusable Pager -------------------- */
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

/* --------------- Page: UniversityMaintenanceCategoryPage --------------- */
const UniversityMaintenanceCategoryPage = () => {
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [itemCatModalOpen, setItemCatModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);

  const [problemDeleteModelOpen, setProblemDeleteModelOpen] = useState(false);
  const [itemCatDeleteModelOpen, setItemCatDeleteModelOpen] = useState(false);
  const [itemDeleteModelOpen, setItemDeleteModelOpen] = useState(false);
  const [typeDeleteModelOpen, setTypeDeleteModelOpen] = useState(false);

  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);

  const [problemCatlist, setProblemCatList] = useState([]);
  const [itemCatlist, setItemCatList] = useState([]);
  const [itemlist, setItemList] = useState([]);
  const [typelist, setTypeList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [problemPage, setProblemPage] = useState(1);
  const [problemPageSize, setProblemPageSize] = useState(5);

  const [itemCatPage, setItemCatPage] = useState(1);
  const [itemCatPageSize, setItemCatPageSize] = useState(5);

  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(5);

  const [typePage, setTypePage] = useState(1);
  const [typePageSize, setTypePageSize] = useState(5);

  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee) || {};

  const universityId = String(
    emp?.universityid || emp?.universityId || emp?.university || ""
  );

  const initialProblemForm = { id: "", name: "" };
  const initialItemCatForm = { id: "", name: "", problemId: "" };
  const initialItemForm = { id: "", name: "", problemId: "", itemCategoryId: "" };
  const initialTypeForm = { id: "", name: "" };

  const [problemForm, setProblemForm] = useState(initialProblemForm);
  const [itemCatForm, setItemCatForm] = useState(initialItemCatForm);
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [typeForm, setTypeForm] = useState(initialTypeForm);

  const [itemCatRows, setItemCatRows] = useState([{ id: 1, name: "" }]);
  const [itemRows, setItemRows] = useState([{ id: 1, name: "" }]);

  const addRow = (setter, rows) => {
    const nextId = (rows.at(-1)?.id || 0) + 1;
    setter([...rows, { id: nextId, name: "" }]);
  };

  const removeRow = (setter, rows, id) => {
    const next = rows.filter((r) => r.id !== id);
    setter(next.length ? next : [{ id: 1, name: "" }]);
  };

  const updateRowName = (setter, rows, id, val) => {
    setter(rows.map((r) => (r.id === id ? { ...r, name: val } : r)));
  };

  useEffect(() => {
    if (!universityId) return;
    getProblemCatList();
    getItemCatList();
    getItemList();
    getTypeList();
  }, [universityId]);

  const getProblemCatList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(
        collection(db, "university", universityId, "problemcategory"),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q1);
      setProblemCatList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load problem categories");
    } finally {
      setIsLoading(false);
    }
  };

  const getItemCatList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(
        collection(db, "university", universityId, "itemcategory"),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q1);
      setItemCatList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load item categories");
    } finally {
      setIsLoading(false);
    }
  };

  const getItemList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(
        collection(db, "university", universityId, "maintenanceitems"),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q1);
      setItemList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load items");
    } finally {
      setIsLoading(false);
    }
  };

  const getTypeList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(
        collection(db, "university", universityId, "maintenancetype"),
        orderBy("name", "asc")
      );
      const snap = await getDocs(q1);
      setTypeList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load types");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => setProblemPage(1), [problemCatlist.length]);
  useEffect(() => setItemCatPage(1), [itemCatlist.length]);
  useEffect(() => setItemPage(1), [itemlist.length]);
  useEffect(() => setTypePage(1), [typelist.length]);

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
    const start = (typePage - 1) * typePageSize;
    return typelist.slice(start, start + typePageSize);
  }, [typelist, typePage, typePageSize]);

  const problemMap = useMemo(() => {
    const m = new Map();
    for (const p of problemCatlist) m.set(p.id, p);
    return m;
  }, [problemCatlist]);

  const itemCatMap = useMemo(() => {
    const m = new Map();
    for (const ic of itemCatlist) m.set(ic.id, ic);
    return m;
  }, [itemCatlist]);

  /* -------------------- CRUD: Problem Category -------------------- */
  const submitProblem = async (e) => {
    e.preventDefault();
    try {
      const name = problemForm.name?.trim();
      if (!name) return;

      const duplicate = problemCatlist.some(
        (x) =>
          (x.name || "").trim().toLowerCase() === name.toLowerCase() &&
          x.id !== problemForm.id
      );

      if (duplicate) {
        toast.warn("Duplicate found! Not adding.");
        return;
      }

      if (editingData?.type === "problem") {
        const refDoc = doc(
          db,
          "university",
          universityId,
          "problemcategory",
          problemForm.id
        );
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }

        await updateDoc(refDoc, {
          uid,
          name,
          universityid: universityId,
          updatedBy: uid || "",
          updatedAt: Timestamp.now(),
        });

        toast.success("Updated");
      } else {
        await addDoc(
          collection(db, "university", universityId, "itemcategory"),
          {
            uid: uid || "",
            name,
            universityid: universityId,
            createdBy: uid || "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }
        );

        toast.success("Saved");
      }

      await getProblemCatList();
    } catch (e1) {
      console.error(e1);
      toast.error("Something went wrong");
    }

    setProblemModalOpen(false);
    setEditing(null);
    setProblemForm(initialProblemForm);
  };

  const deleteProblem = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(
        doc(
          db,
          "university",
          universityId,
          "problemcategory",
          deleteData.id
        )
      );
      toast.success("Deleted");
      await getProblemCatList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setProblemDeleteModelOpen(false);
    setDelete(null);
  };

  /* -------------------- CRUD: Item Category -------------------- */
  const submitItemCategory = async (e) => {
    e.preventDefault();
    try {
      if (!itemCatForm.problemId) return;

      if (editingData?.type === "itemcat") {
        const name = itemCatForm.name?.trim();
        if (!name) return;

        const duplicate = itemCatlist.some(
          (x) =>
            (x.name || "").trim().toLowerCase() === name.toLowerCase() &&
            x.problemId === itemCatForm.problemId &&
            x.id !== itemCatForm.id
        );

        if (duplicate) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }

        const refDoc = doc(
          db,
          "university",
          universityId,
          "itemcategory",
          itemCatForm.id
        );
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }

        await updateDoc(refDoc, {
          uid,
          name,
          universityid: universityId,
          problemId: itemCatForm.problemId,
          updatedBy: uid || "",
          updatedAt: Timestamp.now(),
        });

        toast.success("Updated");
      } else {
        const names = Array.from(
          new Set(itemCatRows.map((r) => r.name.trim()).filter(Boolean))
        );

        if (names.length === 0) {
          toast.warn("Add at least one name");
          return;
        }

        const existing = new Set(
          itemCatlist
            .filter((x) => x.problemId === itemCatForm.problemId)
            .map((x) => (x.name || "").trim().toLowerCase())
        );

        const toCreate = names.filter((n) => !existing.has(n.toLowerCase()));

        if (toCreate.length === 0) {
          toast.warn("All provided names already exist");
        } else {
          const batch = writeBatch(db);
          toCreate.forEach((name) => {
            const refDoc = doc(
              collection(db, "university", universityId, "itemcategory")
            );
            batch.set(refDoc, {
              uid: uid || "",
              name,
              universityid: universityId,
              problemId: itemCatForm.problemId,
              createdBy: uid || "",
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          });
          await batch.commit();
          toast.success(
            `Saved ${toCreate.length} item categor${
              toCreate.length > 1 ? "ies" : "y"
            }`
          );
        }
      }

      await getItemCatList();
    } catch (e1) {
      console.error(e1);
      toast.error("Something went wrong");
    }

    setItemCatModalOpen(false);
    setEditing(null);
    setItemCatForm({ id: "", name: "", problemId: "" });
    setItemCatRows([{ id: 1, name: "" }]);
  };

  const deleteItemCategory = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(
        doc(
          db,
          "university",
          universityId,
          "itemcategory",
          deleteData.id
        )
      );
      toast.success("Deleted");
      await getItemCatList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setItemCatDeleteModelOpen(false);
    setDelete(null);
  };

  /* -------------------- CRUD: Items -------------------- */
  const submitItem = async (e) => {
    e.preventDefault();
    try {
      if (!itemForm.problemId || !itemForm.itemCategoryId) return;

      if (editingData?.type === "item") {
        const name = itemForm.name?.trim();
        if (!name) return;

        const duplicate = itemlist.some(
          (x) =>
            (x.name || "").trim().toLowerCase() === name.toLowerCase() &&
            x.problemId === itemForm.problemId &&
            x.itemCategoryId === itemForm.itemCategoryId &&
            x.id !== itemForm.id
        );

        if (duplicate) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }

        const refDoc = doc(
          db,
          "university",
          universityId,
          "maintenanceitems",
          itemForm.id
        );
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }

        await updateDoc(refDoc, {
          uid,
          name,
          universityid: universityId,
          problemId: itemForm.problemId,
          itemCategoryId: itemForm.itemCategoryId,
          updatedBy: uid || "",
          updatedAt: Timestamp.now(),
        });

        toast.success("Updated");
      } else {
        const names = Array.from(
          new Set(itemRows.map((r) => r.name.trim()).filter(Boolean))
        );

        if (names.length === 0) {
          toast.warn("Add at least one item name");
          return;
        }

        const existing = new Set(
          itemlist
            .filter(
              (x) =>
                x.problemId === itemForm.problemId &&
                x.itemCategoryId === itemForm.itemCategoryId
            )
            .map((x) => (x.name || "").trim().toLowerCase())
        );

        const toCreate = names.filter((n) => !existing.has(n.toLowerCase()));

        if (toCreate.length === 0) {
          toast.warn("All provided items already exist");
        } else {
          const batch = writeBatch(db);
          toCreate.forEach((name) => {
            const refDoc = doc(
              collection(db, "university", universityId, "maintenanceitems")
            );
            batch.set(refDoc, {
              uid: uid || "",
              name,
              universityid: universityId,
              problemId: itemForm.problemId,
              itemCategoryId: itemForm.itemCategoryId,
              createdBy: uid || "",
              createdAt: Timestamp.now(),
              updatedAt: Timestamp.now(),
            });
          });
          await batch.commit();
          toast.success(
            `Saved ${toCreate.length} item${toCreate.length > 1 ? "s" : ""}`
          );
        }
      }

      await getItemList();
    } catch (e1) {
      console.error(e1);
      toast.error("Something went wrong");
    }

    setItemModalOpen(false);
    setEditing(null);
    setItemForm({ id: "", name: "", problemId: "", itemCategoryId: "" });
    setItemRows([{ id: 1, name: "" }]);
  };

  const deleteItem = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(
        doc(db, "university", universityId, "maintenanceitems", deleteData.id)
      );
      toast.success("Deleted");
      await getItemList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setItemDeleteModelOpen(false);
    setDelete(null);
  };

  /* -------------------- CRUD: Type -------------------- */
  const submitType = async (e) => {
    e.preventDefault();
    try {
      const name = typeForm.name?.trim();
      if (!name) return;

      const duplicate = typelist.some(
        (x) =>
          (x.name || "").trim().toLowerCase() === name.toLowerCase() &&
          x.id !== typeForm.id
      );

      if (duplicate) {
        toast.warn("Duplicate found! Not adding.");
        return;
      }

      if (editingData?.type === "maintype") {
        const refDoc = doc(
          db,
          "university",
          universityId,
          "maintenancetype",
          typeForm.id
        );
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }

        await updateDoc(refDoc, {
          uid,
          name,
          universityid: universityId,
          updatedBy: uid || "",
          updatedAt: Timestamp.now(),
        });

        toast.success("Updated");
      } else {
        await addDoc(
          collection(db, "university", universityId, "maintenancetype"),
          {
            uid: uid || "",
            name,
            universityid: universityId,
            createdBy: uid || "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }
        );

        toast.success("Saved");
      }

      await getTypeList();
    } catch (e1) {
      console.error(e1);
      toast.error("Something went wrong");
    }

    setTypeModalOpen(false);
    setEditing(null);
    setTypeForm(initialTypeForm);
  };

  const deleteType = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(
        doc(db, "university", universityId, "maintenancetype", deleteData.id)
      );
      toast.success("Deleted");
      await getTypeList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setTypeDeleteModelOpen(false);
    setDelete(null);
  };

  if (!universityId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto">
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
          No university assigned.
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      <h1 className="text-2xl font-semibold mb-4">University Maintenance Setting</h1>

      {/* ---------- Problem Categories ---------- */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">Problem Categories</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setProblemForm(initialProblemForm);
            setProblemModalOpen(true);
          }}
        >
          + Add Problem Category
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-56">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Problem Category
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {problemSlice.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-3 text-sm">{item.name}</td>
                    <td className="px-6 py-3 text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing({ ...item, type: "problem" });
                          setProblemForm({ id: item.id, name: item.name });
                          setProblemModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
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
                    <td className="px-6 py-10 text-center text-gray-500" colSpan={2}>
                      No records
                    </td>
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

      {problemModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData?.type === "problem" ? "Edit" : "Add"} Problem Category
            </h2>
            <form onSubmit={submitProblem} className="space-y-4">
              <input
                name="name"
                placeholder="Category"
                value={problemForm.name}
                onChange={(e) =>
                  setProblemForm((p) => ({ ...p, name: e.target.value }))
                }
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => setProblemModalOpen(false)}
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Problem Category
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
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
                onClick={deleteProblem}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Item Categories ---------- */}
      <div className="flex justify-between items-center mb-2 mt-8">
        <h2 className="text-lg font-semibold">Item Categories</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setItemCatForm({ id: "", name: "", problemId: "" });
            setItemCatRows([{ id: 1, name: "" }]);
            setItemCatModalOpen(true);
          }}
        >
          + Add Item Category
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-56">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Problem
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Item Category
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemCatSlice.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-3 text-sm">
                      {problemMap.get(item.problemId)?.name || "—"}
                    </td>
                    <td className="px-6 py-3 text-sm">{item.name}</td>
                    <td className="px-6 py-3 text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing({ ...item, type: "itemcat" });
                          setItemCatForm({
                            id: item.id,
                            name: item.name,
                            problemId: item.problemId || "",
                          });
                          setItemCatModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
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
                    <td className="px-6 py-10 text-center text-gray-500" colSpan={3}>
                      No records
                    </td>
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

      {itemCatModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[34rem] shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData?.type === "itemcat"
                ? "Edit Item Category"
                : "Add Item Categories"}
            </h2>

            <form onSubmit={submitItemCategory} className="space-y-4">
              <label className="block text-sm font-medium">Problem Category</label>
              <select
                className="w-full border p-2 rounded bg-white"
                value={itemCatForm.problemId}
                onChange={(e) =>
                  setItemCatForm((p) => ({ ...p, problemId: e.target.value }))
                }
                required
              >
                <option value="">Select problem</option>
                {problemCatlist.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              {editingData?.type === "itemcat" ? (
                <input
                  name="name"
                  placeholder="Item Category name"
                  value={itemCatForm.name}
                  onChange={(e) =>
                    setItemCatForm((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
              ) : (
                <div className="space-y-3">
                  {itemCatRows.map((row, idx) => (
                    <div key={row.id} className="flex gap-2">
                      <input
                        className="flex-1 border border-gray-300 p-2 rounded"
                        placeholder={`Category ${idx + 1}`}
                        value={row.name}
                        onChange={(e) =>
                          updateRowName(
                            setItemCatRows,
                            itemCatRows,
                            row.id,
                            e.target.value
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() =>
                          removeRow(setItemCatRows, itemCatRows, row.id)
                        }
                        className="px-3 py-2 border rounded hover:bg-gray-50"
                        title="Remove"
                      >
                        −
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Categories</label>
                    <button
                      type="button"
                      onClick={() => addRow(setItemCatRows, itemCatRows)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      + Add row
                    </button>
                  </div>

                  <p className="text-xs text-gray-500">
                    Duplicates (within the selected problem) are ignored automatically.
                  </p>
                </div>
              )}

              <div className="flex justify-end mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setItemCatModalOpen(false);
                    setEditing(null);
                    setItemCatForm({ id: "", name: "", problemId: "" });
                    setItemCatRows([{ id: 1, name: "" }]);
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

      {itemCatDeleteModelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Item Category
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setItemCatDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={deleteItemCategory}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Items ---------- */}
      <div className="flex justify-between items-center mb-2 mt-8">
        <h2 className="text-lg font-semibold">Items</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setItemForm({ id: "", name: "", problemId: "", itemCategoryId: "" });
            setItemRows([{ id: 1, name: "" }]);
            setItemModalOpen(true);
          }}
        >
          + Add Item
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-56">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Problem
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Item Category
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Item
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemSlice.map((it) => {
                  const ic = itemCatMap.get(it.itemCategoryId);
                  const p = problemMap.get(it.problemId || ic?.problemId);
                  return (
                    <tr key={it.id}>
                      <td className="px-6 py-3 text-sm">{p?.name || "—"}</td>
                      <td className="px-6 py-3 text-sm">{ic?.name || "—"}</td>
                      <td className="px-6 py-3 text-sm">{it.name}</td>
                      <td className="px-6 py-3 text-sm">
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing({ ...it, type: "item" });
                            setItemForm({
                              id: it.id,
                              name: it.name,
                              problemId: it.problemId || ic?.problemId || "",
                              itemCategoryId: it.itemCategoryId || "",
                            });
                            setItemModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            setDelete(it);
                            setItemDeleteModelOpen(true);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {itemSlice.length === 0 && (
                  <tr>
                    <td className="px-6 py-10 text-center text-gray-500" colSpan={4}>
                      No records
                    </td>
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

      {itemModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[36rem] shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData?.type === "item" ? "Edit Item" : "Add Items"}
            </h2>
            <form onSubmit={submitItem} className="space-y-4">
              <label className="block text-sm font-medium">Problem Category</label>
              <select
                className="w-full border p-2 rounded bg-white"
                value={itemForm.problemId}
                onChange={(e) =>
                  setItemForm((p) => ({
                    ...p,
                    problemId: e.target.value,
                    itemCategoryId: "",
                  }))
                }
                required
              >
                <option value="">Select problem</option>
                {problemCatlist.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>

              <label className="block text-sm font-medium">Item Category</label>
              <select
                className="w-full border p-2 rounded bg-white"
                value={itemForm.itemCategoryId}
                onChange={(e) =>
                  setItemForm((p) => ({ ...p, itemCategoryId: e.target.value }))
                }
                required
              >
                <option value="">Select item category</option>
                {itemCatlist
                  .filter((ic) => ic.problemId === itemForm.problemId)
                  .map((ic) => (
                    <option key={ic.id} value={ic.id}>
                      {ic.name}
                    </option>
                  ))}
              </select>

              {editingData?.type === "item" ? (
                <input
                  name="name"
                  placeholder="Item name"
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm((p) => ({ ...p, name: e.target.value }))
                  }
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
              ) : (
                <div className="space-y-3">
                  {itemRows.map((row, idx) => (
                    <div key={row.id} className="flex gap-2">
                      <input
                        className="flex-1 border border-gray-300 p-2 rounded"
                        placeholder={`Item ${idx + 1}`}
                        value={row.name}
                        onChange={(e) =>
                          updateRowName(
                            setItemRows,
                            itemRows,
                            row.id,
                            e.target.value
                          )
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(setItemRows, itemRows, row.id)}
                        className="px-3 py-2 border rounded hover:bg-gray-50"
                        title="Remove"
                      >
                        −
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Items</label>
                    <button
                      type="button"
                      onClick={() => addRow(setItemRows, itemRows)}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      + Add row
                    </button>
                  </div>

                  <p className="text-xs text-gray-500">
                    Duplicates (within the selected problem & category) are ignored automatically.
                  </p>
                </div>
              )}

              <div className="flex justify-end mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setItemModalOpen(false);
                    setEditing(null);
                    setItemForm({ id: "", name: "", problemId: "", itemCategoryId: "" });
                    setItemRows([{ id: 1, name: "" }]);
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

      {itemDeleteModelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Item
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setItemDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={deleteItem}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Types ---------- */}
      <div className="flex justify-between items-center mb-2 mt-8">
        <h2 className="text-lg font-semibold">Types</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setTypeForm(initialTypeForm);
            setTypeModalOpen(true);
          }}
        >
          + Add Type
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-56">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {typeSlice.map((t) => (
                  <tr key={t.id}>
                    <td className="px-6 py-3 text-sm">{t.name}</td>
                    <td className="px-6 py-3 text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing({ ...t, type: "maintype" });
                          setTypeForm({ id: t.id, name: t.name });
                          setTypeModalOpen(true);
                        }}
                      >
                        Edit
                      </button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(t);
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
                    <td className="px-6 py-10 text-center text-gray-500" colSpan={2}>
                      No records
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <Pager
              page={typePage}
              setPage={setTypePage}
              pageSize={typePageSize}
              setPageSize={setTypePageSize}
              total={typelist.length}
            />
          </>
        )}
      </div>

      {typeModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData?.type === "maintype" ? "Edit" : "Add"} Type
            </h2>
            <form onSubmit={submitType} className="space-y-4">
              <input
                name="name"
                placeholder="Type"
                value={typeForm.name}
                onChange={(e) =>
                  setTypeForm((p) => ({ ...p, name: e.target.value }))
                }
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => setTypeModalOpen(false)}
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

      {typeDeleteModelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Type
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.name}</strong>?
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setTypeDeleteModelOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={deleteType}
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

export default UniversityMaintenanceCategoryPage;