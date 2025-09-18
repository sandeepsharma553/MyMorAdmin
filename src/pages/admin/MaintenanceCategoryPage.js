import React, { useState, useEffect, useMemo } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, deleteDoc,
  query, where, getDoc, writeBatch
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
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">Page {page} of {totalPages}</span>
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

/* --------------- Page: MaintenanceCategoryPage --------------- */
const MaintenanceCategoryPage = () => {
  // Modals
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [itemCatModalOpen, setItemCatModalOpen] = useState(false);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [typeModalOpen, setTypeModalOpen] = useState(false);

  const [problemDeleteModelOpen, setProblemDeleteModelOpen] = useState(false);
  const [itemCatDeleteModelOpen, setItemCatDeleteModelOpen] = useState(false);
  const [itemDeleteModelOpen, setItemDeleteModelOpen] = useState(false);
  const [typeDeleteModelOpen, setTypeDeleteModelOpen] = useState(false);

  // Editing/Deleting targets
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);

  // Data
  const [problemCatlist, setProblemCatList] = useState([]);
  const [itemCatlist, setItemCatList] = useState([]);
  const [itemlist, setItemList] = useState([]);
  const [typelist, setTypeList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination
  const [problemPage, setProblemPage] = useState(1);
  const [problemPageSize, setProblemPageSize] = useState(5);
  const [itemCatPage, setItemCatPage] = useState(1);
  const [itemCatPageSize, setItemCatPageSize] = useState(5);
  const [itemPage, setItemPage] = useState(1);
  const [itemPageSize, setItemPageSize] = useState(5);
  const [typePage, setTypePage] = useState(1);
  const [typePageSize, setTypePageSize] = useState(5);

  // Joined list pagination (optional/kept)
  const [joinedPage, setJoinedPage] = useState(1);
  const [joinedPageSize, setJoinedPageSize] = useState(10);

  // Auth
  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee) || {};

  // Forms
  const initialProblemForm = { id: 0, name: "" };
  const initialItemCatForm = { id: 0, name: "", problemId: "" };
  const initialItemForm = { id: 0, name: "", problemId: "", itemCategoryId: "" };
  const initialTypeForm = { id: 0, name: "" };

  const [problemForm, setProblemForm] = useState(initialProblemForm);
  const [itemCatForm, setItemCatForm] = useState(initialItemCatForm);
  const [itemForm, setItemForm] = useState(initialItemForm);
  const [typeForm, setTypeForm] = useState(initialTypeForm);

  // ---------- Dynamic multi-add rows ----------
  // For Item Category create
  const [itemCatRows, setItemCatRows] = useState([{ id: 1, name: "" }]);
  // For Item create
  const [itemRows, setItemRows] = useState([{ id: 1, name: "" }]);

  const addRow = (setter, rows) => {
    const nextId = (rows.at(-1)?.id || 0) + 1;
    setter([...rows, { id: nextId, name: "" }]);
  };
  const removeRow = (setter, rows, id) => {
    const next = rows.filter((r) => r.id !== id);
    setter(next.length ? next : [{ id: 1, name: "" }]); // keep at least one
  };
  const updateRowName = (setter, rows, id, val) => {
    setter(rows.map((r) => (r.id === id ? { ...r, name: val } : r)));
  };

  /* -------------------- Loaders -------------------- */
  useEffect(() => {
    getProblemCatList();
    getItemCatList();
    getItemList();
    getTypeList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getProblemCatList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(collection(db, "problemcategory"), where("hostelid", "==", emp.hostelid));
      const snap = await getDocs(q1);
      setProblemCatList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setIsLoading(false); }
  };

  const getItemCatList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(collection(db, "itemcategory"), where("hostelid", "==", emp.hostelid));
      const snap = await getDocs(q1);
      setItemCatList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setIsLoading(false); }
  };

  const getItemList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(collection(db, "maintenanceitems"), where("hostelid", "==", emp.hostelid));
      const snap = await getDocs(q1);
      setItemList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setIsLoading(false); }
  };

  const getTypeList = async () => {
    setIsLoading(true);
    try {
      const q1 = query(collection(db, "maintenancetype"), where("hostelid", "==", emp.hostelid));
      const snap = await getDocs(q1);
      setTypeList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } finally { setIsLoading(false); }
  };

  /* -------------------- Derived slices -------------------- */
  useEffect(() => setProblemPage(1), [problemCatlist.length]);
  useEffect(() => setItemCatPage(1), [itemCatlist.length]);
  useEffect(() => setItemPage(1), [itemlist.length]);
  useEffect(() => setTypePage(1), [typelist.length]);
  useEffect(() => setJoinedPage(1), [itemlist.length, itemCatlist.length, problemCatlist.length]);

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

  /* -------------------- Maps + Joined rows -------------------- */
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

  const joinedRowsAll = useMemo(() => {
    return itemlist
      .map((it) => {
        const ic = itemCatMap.get(it.itemCategoryId);
        const problemId = it.problemId || ic?.problemId || "";
        const p = problemMap.get(problemId);
        return {
          id: it.id,
          itemName: it.name,
          itemCategoryName: ic?.name || "—",
          problemName: p?.name || "—",
          problemId,
          itemCategoryId: it.itemCategoryId || "",
        };
      })
      .sort((a, b) =>
        a.problemName.localeCompare(b.problemName) ||
        a.itemCategoryName.localeCompare(b.itemCategoryName) ||
        a.itemName.localeCompare(b.itemName)
      );
  }, [itemlist, itemCatMap, problemMap]);

  const joinedSlice = useMemo(() => {
    const start = (joinedPage - 1) * joinedPageSize;
    return joinedRowsAll.slice(start, start + joinedPageSize);
  }, [joinedRowsAll, joinedPage, joinedPageSize]);

  /* -------------------- CRUD: Problem Category -------------------- */
  const submitProblem = async (e) => {
    e.preventDefault();
    try {
      if (!problemForm.name) return;

      if (editingData?.type === "problem") {
        const ref = doc(db, "problemcategory", problemForm.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }
        await updateDoc(ref, {
          uid, name: problemForm.name, hostelid: emp.hostelid,
          updatedBy: uid, updatedDate: new Date(),
        });
        toast.success("Updated");
      } else {
        const qDup = query(
          collection(db, "problemcategory"),
          where("name", "==", problemForm.name),
          where("hostelid", "==", emp.hostelid)
        );
        const dupSnap = await getDocs(qDup);
        if (!dupSnap.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "problemcategory"), {
          uid, name: problemForm.name, hostelid: emp.hostelid,
          createdBy: uid, createdDate: new Date(),
        });
        toast.success("Saved");
      }
      await getProblemCatList();
    } catch (e1) { console.error(e1); }
    setProblemModalOpen(false);
    setEditing(null);
    setProblemForm(initialProblemForm);
  };

  const deleteProblem = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "problemcategory", deleteData.id));
      toast.success("Deleted");
      await getProblemCatList();
    } catch (e) { console.error(e); }
    setProblemDeleteModelOpen(false);
    setDelete(null);
  };

  /* -------------------- CRUD: Item Category (with problemId) + MULTI-ROW CREATE -------------------- */
  const submitItemCategory = async (e) => {
    e.preventDefault();
    try {
      if (!itemCatForm.problemId) return;

      // EDIT mode = single record update
      if (editingData?.type === "itemcat") {
        if (!itemCatForm.name) return;
        const ref = doc(db, "itemcategory", itemCatForm.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }
        await updateDoc(ref, {
          uid, name: itemCatForm.name, hostelid: emp.hostelid,
          problemId: itemCatForm.problemId,
          updatedBy: uid, updatedDate: new Date(),
        });
        toast.success("Updated");
      } else {
        // CREATE mode = multiple rows
        const names = Array.from(new Set(itemCatRows.map(r => r.name.trim()).filter(Boolean)));

        if (names.length === 0) {
          toast.warn("Add at least one name");
          return;
        }

        // Load existing for dedupe within (hostelid + problemId)
        const existingSnap = await getDocs(
          query(
            collection(db, "itemcategory"),
            where("hostelid", "==", emp.hostelid),
            where("problemId", "==", itemCatForm.problemId)
          )
        );
        const existing = new Set(
          existingSnap.docs.map((d) => (d.data()?.name || "").trim().toLowerCase())
        );
        const toCreate = names.filter((n) => !existing.has(n.toLowerCase()));

        if (toCreate.length === 0) {
          toast.warn("All provided names already exist");
        } else {
          const batch = writeBatch(db);
          toCreate.forEach((name) => {
            const ref = doc(collection(db, "itemcategory"));
            batch.set(ref, {
              uid,
              name,
              hostelid: emp.hostelid,
              problemId: itemCatForm.problemId,
              createdBy: uid,
              createdDate: new Date(),
            });
          });
          await batch.commit();
          toast.success(`Saved ${toCreate.length} item categor${toCreate.length > 1 ? "ies" : "y"}`);
        }
      }
      await getItemCatList();
    } catch (e1) { console.error(e1); }
    setItemCatModalOpen(false);
    setEditing(null);
    setItemCatForm({ id: 0, name: "", problemId: "" });
    setItemCatRows([{ id: 1, name: "" }]);
  };

  const deleteItemCategory = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "itemcategory", deleteData.id));
      toast.success("Deleted");
      await getItemCatList();
    } catch (e) { console.error(e); }
    setItemCatDeleteModelOpen(false);
    setDelete(null);
  };

  /* -------------------- CRUD: Items (with problemId + itemCategoryId) + MULTI-ROW CREATE -------------------- */
  const submitItem = async (e) => {
    e.preventDefault();
    try {
      if (!itemForm.problemId || !itemForm.itemCategoryId) return;

      // EDIT mode = single
      if (editingData?.type === "item") {
        if (!itemForm.name) return;
        const ref = doc(db, "maintenanceitems", itemForm.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }
        await updateDoc(ref, {
          uid, name: itemForm.name, hostelid: emp.hostelid,
          problemId: itemForm.problemId,
          itemCategoryId: itemForm.itemCategoryId,
          updatedBy: uid, updatedDate: new Date(),
        });
        toast.success("Updated");
      } else {
        // CREATE mode = multiple rows
        const names = Array.from(new Set(itemRows.map(r => r.name.trim()).filter(Boolean)));
        if (names.length === 0) {
          toast.warn("Add at least one item name");
          return;
        }

        const existingSnap = await getDocs(
          query(
            collection(db, "maintenanceitems"),
            where("hostelid", "==", emp.hostelid),
            where("problemId", "==", itemForm.problemId),
            where("itemCategoryId", "==", itemForm.itemCategoryId)
          )
        );
        const existing = new Set(
          existingSnap.docs.map((d) => (d.data()?.name || "").trim().toLowerCase())
        );
        const toCreate = names.filter((n) => !existing.has(n.toLowerCase()));

        if (toCreate.length === 0) {
          toast.warn("All provided items already exist");
        } else {
          const batch = writeBatch(db);
          toCreate.forEach((name) => {
            const ref = doc(collection(db, "maintenanceitems"));
            batch.set(ref, {
              uid,
              name,
              hostelid: emp.hostelid,
              problemId: itemForm.problemId,
              itemCategoryId: itemForm.itemCategoryId,
              createdBy: uid,
              createdDate: new Date(),
            });
          });
          await batch.commit();
          toast.success(`Saved ${toCreate.length} item${toCreate.length > 1 ? "s" : ""}`);
        }
      }
      await getItemList();
    } catch (e1) { console.error(e1); }
    setItemModalOpen(false);
    setEditing(null);
    setItemForm({ id: 0, name: "", problemId: "", itemCategoryId: "" });
    setItemRows([{ id: 1, name: "" }]);
  };

  const deleteItem = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "maintenanceitems", deleteData.id));
      toast.success("Deleted");
      await getItemList();
    } catch (e) { console.error(e); }
    setItemDeleteModelOpen(false);
    setDelete(null);
  };

  /* -------------------- CRUD: Type (maintenancetype) -------------------- */
  const submitType = async (e) => {
    e.preventDefault();
    try {
      if (!typeForm.name) return;

      if (editingData?.type === "maintype") {
        const ref = doc(db, "maintenancetype", typeForm.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Record not found");
          return;
        }
        await updateDoc(ref, {
          uid, name: typeForm.name, hostelid: emp.hostelid,
          updatedBy: uid, updatedDate: new Date(),
        });
        toast.success("Updated");
      } else {
        const qDup = query(
          collection(db, "maintenancetype"),
          where("name", "==", typeForm.name),
          where("hostelid", "==", emp.hostelid)
        );
        const dupSnap = await getDocs(qDup);
        if (!dupSnap.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, "maintenancetype"), {
          uid, name: typeForm.name, hostelid: emp.hostelid,
          createdBy: uid, createdDate: new Date(),
        });
        toast.success("Saved");
      }
      await getTypeList();
    } catch (e1) { console.error(e1); }
    setTypeModalOpen(false);
    setEditing(null);
    setTypeForm(initialTypeForm);
  };

  const deleteType = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "maintenancetype", deleteData.id));
      toast.success("Deleted");
      await getTypeList();
    } catch (e) { console.error(e); }
    setTypeDeleteModelOpen(false);
    setDelete(null);
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      <h1 className="text-2xl font-semibold mb-4">Maintenance Settings</h1>

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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Problem Category</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
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
                      >Edit</button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setDelete(item);
                          setProblemDeleteModelOpen(true);
                        }}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
                {problemSlice.length === 0 && (
                  <tr><td className="px-6 py-10 text-center text-gray-500" colSpan={2}>No records</td></tr>
                )}
              </tbody>
            </table>
            <Pager
              page={problemPage} setPage={setProblemPage}
              pageSize={problemPageSize} setPageSize={setProblemPageSize}
              total={problemCatlist.length}
            />
          </>
        )}
      </div>

      {/* Problem Modal */}
      {problemModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData?.type === "problem" ? "Edit" : "Add"} Problem Category</h2>
            <form onSubmit={submitProblem} className="space-y-4">
              <input
                name="name"
                placeholder="Category"
                value={problemForm.name}
                onChange={(e) => setProblemForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 gap-3">
                <button type="button" onClick={() => setProblemModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {problemDeleteModelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Problem Category</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setProblemDeleteModelOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={deleteProblem} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Item Categories (multi-row add) ---------- */}
      <div className="flex justify-between items-center mb-2 mt-8">
        <h2 className="text-lg font-semibold">Item Categories</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setItemCatForm({ id: 0, name: "", problemId: "" });
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Problem</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item Category</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {itemCatSlice.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-3 text-sm">{problemMap.get(item.problemId)?.name || "—"}</td>
                    <td className="px-6 py-3 text-sm">{item.name}</td>
                    <td className="px-6 py-3 text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing({ ...item, type: "itemcat" });
                          setItemCatForm({ id: item.id, name: item.name, problemId: item.problemId || "" });
                          setItemCatModalOpen(true);
                        }}
                      >Edit</button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => { setDelete(item); setItemCatDeleteModelOpen(true); }}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
                {itemCatSlice.length === 0 && (
                  <tr><td className="px-6 py-10 text-center text-gray-500" colSpan={3}>No records</td></tr>
                )}
              </tbody>
            </table>
            <Pager
              page={itemCatPage} setPage={setItemCatPage}
              pageSize={itemCatPageSize} setPageSize={setItemCatPageSize}
              total={itemCatlist.length}
            />
          </>
        )}
      </div>

      {/* Item Category Modal (dynamic rows) */}
      {itemCatModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-[34rem] shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData?.type === "itemcat" ? "Edit Item Category" : "Add Item Categories"}
            </h2>

            <form onSubmit={submitItemCategory} className="space-y-4">
              <label className="block text-sm font-medium">Problem Category</label>
              <select
                className="w-full border p-2 rounded bg-white"
                value={itemCatForm.problemId}
                onChange={(e) => setItemCatForm((p) => ({ ...p, problemId: e.target.value }))}
                required
              >
                <option value="">Select problem</option>
                {problemCatlist.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              {/* Edit = single input; Create = multi rows */}
              {editingData?.type === "itemcat" ? (
                <input
                  name="name"
                  placeholder="Item Category name"
                  value={itemCatForm.name}
                  onChange={(e) => setItemCatForm((p) => ({ ...p, name: e.target.value }))}
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
                        onChange={(e) => updateRowName(setItemCatRows, itemCatRows, row.id, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeRow(setItemCatRows, itemCatRows, row.id)}
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
                  <p className="text-xs text-gray-500">Duplicates (within the selected problem) are ignored automatically.</p>
                </div>
              )}

              <div className="flex justify-end mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setItemCatModalOpen(false);
                    setEditing(null);
                    setItemCatForm({ id: 0, name: "", problemId: "" });
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Item Category</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setItemCatDeleteModelOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={deleteItemCategory} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Items (multi-row add) ---------- */}
      <div className="flex justify-between items-center mb-2 mt-8">
        <h2 className="text-lg font-semibold">Items</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setItemForm({ id: 0, name: "", problemId: "", itemCategoryId: "" });
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Problem</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item Category</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
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
                        >Edit</button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => { setDelete(it); setItemDeleteModelOpen(true); }}
                        >Delete</button>
                      </td>
                    </tr>
                  );
                })}
                {itemSlice.length === 0 && (
                  <tr><td className="px-6 py-10 text-center text-gray-500" colSpan={4}>No records</td></tr>
                )}
              </tbody>
            </table>
            <Pager
              page={itemPage} setPage={setItemPage}
              pageSize={itemPageSize} setPageSize={setItemPageSize}
              total={itemlist.length}
            />
          </>
        )}
      </div>

      {/* Item Modal (dynamic rows) */}
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

              {/* Edit = single input; Create = multi rows */}
              {editingData?.type === "item" ? (
                <input
                  name="name"
                  placeholder="Item name"
                  value={itemForm.name}
                  onChange={(e) => setItemForm((p) => ({ ...p, name: e.target.value }))}
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
                        onChange={(e) => updateRowName(setItemRows, itemRows, row.id, e.target.value)}
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
                      // className="px-3 py-1 border rounded text-sm hover:bg-gray-50"
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      + Add row
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">Duplicates (within the selected problem & category) are ignored automatically.</p>
                </div>
              )}

              <div className="flex justify-end mt-6 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setItemModalOpen(false);
                    setEditing(null);
                    setItemForm({ id: 0, name: "", problemId: "", itemCategoryId: "" });
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Item</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setItemDeleteModelOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={deleteItem} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Types (maintenancetype) ---------- */}
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
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Type</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
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
                      >Edit</button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => { setDelete(t); setTypeDeleteModelOpen(true); }}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
                {typeSlice.length === 0 && (
                  <tr><td className="px-6 py-10 text-center text-gray-500" colSpan={2}>No records</td></tr>
                )}
              </tbody>
            </table>
            <Pager
              page={typePage} setPage={setTypePage}
              pageSize={typePageSize} setPageSize={setTypePageSize}
              total={typelist.length}
            />
          </>
        )}
      </div>

      {/* Type Modal */}
      {typeModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData?.type === "maintype" ? "Edit" : "Add"} Type</h2>
            <form onSubmit={submitType} className="space-y-4">
              <input
                name="name"
                placeholder="Type"
                value={typeForm.name}
                onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 gap-3">
                <button type="button" onClick={() => setTypeModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {typeDeleteModelOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Type</h2>
            <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => { setTypeDeleteModelOpen(false); setDelete(null); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={deleteType} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
};

export default MaintenanceCategoryPage;






// import React, { useState, useEffect, useMemo } from "react";
// import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
// import { db } from "../../firebase";
// import { useSelector } from "react-redux";
// import { FadeLoader } from "react-spinners";
// import { ToastContainer, toast } from "react-toastify";

// // Reusable pager
// const Pager = ({ page, setPage, pageSize, setPageSize, total }) => {
//   const totalPages = Math.max(1, Math.ceil(total / pageSize));
//   const canPrev = page > 1;
//   const canNext = page < totalPages;

//   return (
//     <div className="flex items-center justify-between px-4 py-3">
//       <div className="flex items-center gap-2">
//         <span className="text-sm text-gray-600">Rows per page</span>
//         <select
//           className="border rounded px-2 py-1 text-sm"
//           value={pageSize}
//           onChange={(e) => setPageSize(Number(e.target.value))}
//         >
//           {[5, 10, 20, 50, 100].map((n) => (
//             <option key={n} value={n}>{n}</option>
//           ))}
//         </select>
//       </div>
//       <div className="flex items-center gap-4">
//         <span className="text-sm text-gray-600">
//           Page {page} of {totalPages}
//         </span>
//         <div className="flex items-center gap-2">
//           <button
//             className={`px-3 py-1 rounded border ${canPrev ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
//             onClick={() => canPrev && setPage((p) => p - 1)}
//             disabled={!canPrev}
//           >
//             Prev
//           </button>
//           <button
//             className={`px-3 py-1 rounded border ${canNext ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
//             onClick={() => canNext && setPage((p) => p + 1)}
//             disabled={!canNext}
//           >
//             Next
//           </button>
//         </div>
//       </div>
//     </div>
//   );
// };

// const MaintenanceCategoryPage = (props) => {
//   const [problemModalOpen, setProblemModalOpen] = useState(false);
//   const [itemCatModalOpen, setItemCatModalOpen] = useState(false);
//   const [itemModalOpen, setItemModalOpen] = useState(false);
//   const [typeModalOpen, setTypeModalOpen] = useState(false);
//   const [editingData, setEditing] = useState(null);
//   const [deleteData, setDelete] = useState(null);
//   const [problemDeleteModelOpen, setProblemDeleteModelOpen] = useState(false);
//   const [itemCatDeletModelOpen, setItemCatDeleteModelOpen] = useState(false);
//   const [itemDeletModelOpen, setItemDeleteModelOpen] = useState(false);
//   const [typeDeletModelOpen, setTypeDeleteModelOpen] = useState(false);
//   const [problemCatlist, setProblemCatList] = useState([]);
//   const [itemCatlist, setItemCatList] = useState([]);
//   const [itemlist, setItemList] = useState([]);
//   const [typelist, setTypeList] = useState([]);
//   const [isLoading, setIsLoading] = useState(false);

//   // Pagination state (independent per table)
//   const [problemPage, setProblemPage] = useState(1);
//   const [problemPageSize, setProblemPageSize] = useState(5);
//   const [itemCatPage, setItemCatPage] = useState(1);
//   const [itemCatPageSize, setItemCatPageSize] = useState(5);
//   const [itemPage, setItemPage] = useState(1);
//   const [itemPageSize, setItemPageSize] = useState(5);
//   const [typePage, setTypePage] = useState(1);
//   const [typePageSize, settypePageSize] = useState(5);

//   const uid = useSelector((state) => state.auth.user.uid);
//   const emp = useSelector((state) => state.auth.employee);
//   const initialForm = { id: 0, name: "" };
//   const [form, setForm] = useState(initialForm);

//   useEffect(() => {
//     getProblemCatList();
//     getItemCatList();
//     getItemList();
//     getTypeList();
//   }, []);

//   // Reset to first page when dataset changes
//   useEffect(() => setProblemPage(1), [problemCatlist.length]);
//   useEffect(() => setItemCatPage(1), [itemCatlist.length]);
//   useEffect(() => setItemPage(1), [itemlist.length]);
//   useEffect(() => setTypePage(1), [itemlist.length]);

//   // Derived, paginated slices
//   const problemSlice = useMemo(() => {
//     const start = (problemPage - 1) * problemPageSize;
//     return problemCatlist.slice(start, start + problemPageSize);
//   }, [problemCatlist, problemPage, problemPageSize]);

//   const itemCatSlice = useMemo(() => {
//     const start = (itemCatPage - 1) * itemCatPageSize;
//     return itemCatlist.slice(start, start + itemCatPageSize);
//   }, [itemCatlist, itemCatPage, itemCatPageSize]);

//   const itemSlice = useMemo(() => {
//     const start = (itemPage - 1) * itemPageSize;
//     return itemlist.slice(start, start + itemPageSize);
//   }, [itemlist, itemPage, itemPageSize]);

//   const typeSlice = useMemo(() => {
//     const start = (itemPage - 1) * typePageSize;
//     return typelist.slice(start, start + typePageSize);
//   }, [typelist, typePage, typePageSize]);

//   const getProblemCatList = async () => {
//     setIsLoading(true);
//     const maintenanceCategoryQuery = query(
//       collection(db, "problemcategory"),
//       where("hostelid", "==", emp.hostelid)
//     );

//     const querySnapshot = await getDocs(maintenanceCategoryQuery);
//     const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
//     setProblemCatList(documents);
//     setIsLoading(false);
//   };

//   const getItemCatList = async () => {
//     setIsLoading(true);
//     const itemCategoryQuery = query(
//       collection(db, "itemcategory"),
//       where("hostelid", "==", emp.hostelid)
//     );

//     const querySnapshot = await getDocs(itemCategoryQuery);
//     const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
//     setItemCatList(documents);
//     setIsLoading(false);
//   };

//   const getItemList = async () => {
//     setIsLoading(true);
//     const itemQuery = query(
//       collection(db, "maintenanceitems"),
//       where("hostelid", "==", emp.hostelid)
//     );
//     const querySnapshot = await getDocs(itemQuery);
//     const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
//     setItemList(documents);
//     setIsLoading(false);
//   };
//   const getTypeList = async () => {
//     setIsLoading(true);
//     const itemQuery = query(
//       collection(db, "maintenancetype"),
//       where("hostelid", "==", emp.hostelid)
//     );
//     const querySnapshot = await getDocs(itemQuery);
//     const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
//     setTypeList(documents);
//     setIsLoading(false);
//   };

//   const handleChange = (e) => {
//     const { name, value } = e.target;
//     setForm({ ...form, [name]: value });
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       if (!form.name) return;
//       if (editingData) {
//         const docRef = doc(db, "problemcategory", form.id);
//         const docSnap = await getDoc(docRef);
//         if (!docSnap.exists()) {
//           toast.warning("data does not exist! Cannot update.");
//           return;
//         }
//         await updateDoc(doc(db, "problemcategory", form.id), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           updatedBy: uid,
//           updatedDate: new Date(),
//         });
//         toast.success("Successfully updated");
//         getProblemCatList();
//       } else {
//         const q = query(collection(db, "problemcategory"), where("name", "==", form.name),
//         where("hostelid", "==", emp.hostelid));
//         const querySnapshot = await getDocs(q);
//         if (!querySnapshot.empty) {
//           toast.warn("Duplicate found! Not adding.");
//           return;
//         }
//         await addDoc(collection(db, "problemcategory"), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           createdBy: uid,
//           createdDate: new Date(),
//         });
//         toast.success("Successfully saved");
//         getProblemCatList();
//       }
//     } catch (error) {
//       console.error("Error saving data:", error);
//     }
//     // Reset
//     setProblemModalOpen(false);
//     setEditing(null);
//     setForm(initialForm);
//   };

//   const handleDelete = async () => {
//     if (!deleteData) return;
//     try {
//       await deleteDoc(doc(db, "problemcategory", form.id));
//       toast.success("Successfully deleted!");
//       getProblemCatList();
//     } catch (error) {
//       console.error("Error deleting document: ", error);
//     }
//     setProblemDeleteModelOpen(false);
//     setDelete(null);
//   };

//   const handleItemCatSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       if (!form.name) return;
//       if (editingData) {
//         const docRef = doc(db, "itemcategory", form.id);
//         const docSnap = await getDoc(docRef);
//         if (!docSnap.exists()) {
//           toast.warning("data does not exist! Cannot update.");
//           return;
//         }
//         await updateDoc(doc(db, "itemcategory", form.id), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           updatedBy: uid,
//           updatedDate: new Date(),
//         });
//         toast.success("Successfully updated");
//         getItemCatList();
//       } else {
//         const q = query(collection(db, "itemcategory"), where("name", "==", form.name),
//         where("hostelid", "==", emp.hostelid));
//         const querySnapshot = await getDocs(q);
//         if (!querySnapshot.empty) {
//           toast.warn("Duplicate found! Not adding.");
//           return;
//         }
//         await addDoc(collection(db, "itemcategory"), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           createdBy: uid,
//           createdDate: new Date(),
//         });
//         toast.success("Successfully saved");
//         getItemCatList();
//       }
//     } catch (error) {
//       console.error("Error saving data:", error);
//     }
//     setItemCatModalOpen(false);
//     setEditing(null);
//     setForm(initialForm);
//   };

//   const handleItemCatDelete = async () => {
//     if (!deleteData) return;
//     try {
//       await deleteDoc(doc(db, "itemcategory", form.id));
//       toast.success("Successfully deleted!");
//       getItemCatList();
//     } catch (error) {
//       console.error("Error deleting document: ", error);
//     }
//     setItemCatDeleteModelOpen(false);
//     setDelete(null);
//   };

//   const handleItemSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       if (!form.name) return;
//       if (editingData) {
//         const docRef = doc(db, "maintenanceitems", form.id);
//         const docSnap = await getDoc(docRef);
//         if (!docSnap.exists()) {
//           toast.warning("data does not exist! Cannot update.");
//           return;
//         }
//         await updateDoc(doc(db, "maintenanceitems", form.id), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           updatedBy: uid,
//           updatedDate: new Date(),
//         });
//         toast.success("Successfully updated");
//         getItemList();
//       } else {
//         const q = query(collection(db, "maintenanceitems"), where("name", "==", form.name),
//         where("hostelid", "==", emp.hostelid));
//         const querySnapshot = await getDocs(q);
//         if (!querySnapshot.empty) {
//           toast.warn("Duplicate found! Not adding.");
//           return;
//         }
//         await addDoc(collection(db, "maintenanceitems"), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           createdBy: uid,
//           createdDate: new Date(),
//         });
//         toast.success("Successfully saved");
//         getItemList();
//       }
//     } catch (error) {
//       console.error("Error saving data:", error);
//     }
//     setItemModalOpen(false);
//     setEditing(null);
//     setForm(initialForm);
//   };

//   const handleItemDelete = async () => {
//     if (!deleteData) return;
//     try {
//       await deleteDoc(doc(db, "maintenanceitems", form.id));
//       toast.success("Successfully deleted!");
//       getItemList();
//     } catch (error) {
//       console.error("Error deleting document: ", error);
//     }
//     setItemDeleteModelOpen(false);
//     setDelete(null);
//   };

//   const handleTypeSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       if (!form.name) return;
//       if (editingData) {
//         const docRef = doc(db, "maintenancetype", form.id);
//         const docSnap = await getDoc(docRef);
//         if (!docSnap.exists()) {
//           toast.warning("data does not exist! Cannot update.");
//           return;
//         }
//         await updateDoc(doc(db, "maintenancetype", form.id), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           updatedBy: uid,
//           updatedDate: new Date(),
//         });
//         toast.success("Successfully updated");
//         getTypeList();
//       } else {
//         const q = query(collection(db, "maintenancetype"), where("name", "==", form.name),
//         where("hostelid", "==", emp.hostelid));
//         const querySnapshot = await getDocs(q);
//         if (!querySnapshot.empty) {
//           toast.warn("Duplicate found! Not adding.");
//           return;
//         }
//         await addDoc(collection(db, "maintenancetype"), {
//           uid,
//           name: form.name,
//           hostelid: emp.hostelid,
//           createdBy: uid,
//           createdDate: new Date(),
//         });
//         toast.success("Successfully saved");
//         getTypeList();
//       }
//     } catch (error) {
//       console.error("Error saving data:", error);
//     }
//     setTypeModalOpen(false);
//     setEditing(null);
//     setForm(initialForm);
//   };

//   const handleTypeDelete = async () => {
//     if (!deleteData) return;
//     try {
//       await deleteDoc(doc(db, "maintenancetype", form.id));
//       toast.success("Successfully deleted!");
//       getTypeList();
//     } catch (error) {
//       console.error("Error deleting document: ", error);
//     }
//     setTypeDeleteModelOpen(false);
//     setDelete(null);
//   };
//   return (
//     <main className="flex-1 p-6 bg-gray-100 overflow-auto">
//       {/* Top bar with Add buttons */}
//       <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
//         <h1 className="text-2xl font-semibold">Maintenance Setting</h1>
//         <div className="flex gap-2">
//           <button
//             className="px-4 py-2 bg-black text-white rounded hover:bg-black"
//             onClick={() => {
//               setEditing(null);
//               setForm(initialForm);
//               setProblemModalOpen(true);
//             }}
//           >
//             + Add Problem Category
//           </button>
//           <button
//             className="px-4 py-2 bg-black text-white rounded hover:bg-black"
//             onClick={() => {
//               setEditing(null);
//               setForm(initialForm);
//               setItemCatModalOpen(true);
//             }}
//           >
//             + Add Item Category
//           </button>
//           <button
//             className="px-4 py-2 bg-black text-white rounded hover:bg-black"
//             onClick={() => {
//               setEditing(null);
//               setForm(initialForm);
//               setItemModalOpen(true);
//             }}
//           >
//             + Add Items
//           </button>
//           <button
//             className="px-4 py-2 bg-black text-white rounded hover:bg-black"
//             onClick={() => {
//               setEditing(null);
//               setForm(initialForm);
//               setTypeModalOpen(true);
//             }}
//           >
//             + Add Type
//           </button>
//         </div>
//       </div>

//       {/* Problem Categories */}
//       <div className="overflow-x-auto bg-white rounded shadow">
//         {isLoading ? (
//           <div className="flex justify-center items-center h-64">
//             <FadeLoader color="#36d7b7" loading={isLoading} />
//           </div>
//         ) : (
//           <>
//             <table className="min-w-full divide-y divide-gray-200">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Problem Category</th>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-200">
//                 {problemSlice.map((item, i) => (
//                   <tr key={item.id ?? i}>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm">
//                       <button
//                         className="text-blue-600 hover:underline mr-3"
//                         onClick={() => {
//                           setEditing(item);
//                           setForm(item);
//                           setProblemModalOpen(true);
//                         }}
//                       >
//                         Edit
//                       </button>
//                       <button
//                         className="text-red-600 hover:underline"
//                         onClick={() => {
//                           setDelete(item);
//                           setForm(item);
//                           setProblemDeleteModelOpen(true);
//                         }}
//                       >
//                         Delete
//                       </button>
//                     </td>
//                   </tr>
//                 ))}
//                 {problemSlice.length === 0 && (
//                   <tr>
//                     <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//             <Pager
//               page={problemPage}
//               setPage={setProblemPage}
//               pageSize={problemPageSize}
//               setPageSize={setProblemPageSize}
//               total={problemCatlist.length}
//             />
//           </>
//         )}
//       </div>

//       {/* Problem Category Modal */}
//       {problemModalOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
//             <h2 className="text-xl font-bold mb-4">Add Problem Category</h2>
//             <form onSubmit={handleSubmit} className="space-y-4">
//               <input
//                 name="name"
//                 placeholder="Category"
//                 value={form.name}
//                 onChange={handleChange}
//                 className="w-full border border-gray-300 p-2 rounded"
//                 required
//               />
//               <div className="flex justify-end mt-6 space-x-3">
//                 <button
//                   type="button"
//                   onClick={() => setProblemModalOpen(false)}
//                   className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//                 >
//                   Cancel
//                 </button>
//                 <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//       {problemDeleteModelOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
//             <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Problem Category</h2>
//             <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
//             <div className="flex justify-end space-x-3">
//               <button
//                 onClick={() => {
//                   setProblemDeleteModelOpen(false);
//                   setDelete(null);
//                 }}
//                 className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//               >
//                 Cancel
//               </button>
//               <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
//             </div>
//           </div>
//         </div>
//       )}

//       <br />

//       {/* Item Categories */}
//       <div className="overflow-x-auto bg-white rounded shadow">
//         {isLoading ? (
//           <div className="flex justify-center items-center h-64">
//             <FadeLoader color="#36d7b7" loading={isLoading} />
//           </div>
//         ) : (
//           <>
//             <table className="min-w-full divide-y divide-gray-200">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item Category</th>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-200">
//                 {itemCatSlice.map((item, i) => (
//                   <tr key={item.id ?? i}>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm">
//                       <button
//                         className="text-blue-600 hover:underline mr-3"
//                         onClick={() => {
//                           setEditing(item);
//                           setForm(item);
//                           setItemCatModalOpen(true);
//                         }}
//                       >
//                         Edit
//                       </button>
//                       <button
//                         className="text-red-600 hover:underline"
//                         onClick={() => {
//                           setDelete(item);
//                           setForm(item);
//                           setItemCatDeleteModelOpen(true);
//                         }}
//                       >
//                         Delete
//                       </button>
//                     </td>
//                   </tr>
//                 ))}
//                 {itemCatSlice.length === 0 && (
//                   <tr>
//                     <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//             <Pager
//               page={itemCatPage}
//               setPage={setItemCatPage}
//               pageSize={itemCatPageSize}
//               setPageSize={setItemCatPageSize}
//               total={itemCatlist.length}
//             />
//           </>
//         )}
//       </div>

//       {/* Item Category Modal */}
//       {itemCatModalOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
//             <h2 className="text-xl font-bold mb-4">Add Item Category</h2>
//             <form onSubmit={handleItemCatSubmit} className="space-y-4">
//               <input
//                 name="name"
//                 placeholder="Category"
//                 value={form.name}
//                 onChange={handleChange}
//                 className="w-full border border-gray-300 p-2 rounded"
//                 required
//               />
//               <div className="flex justify-end mt-6 space-x-3">
//                 <button
//                   type="button"
//                   onClick={() => setItemCatModalOpen(false)}
//                   className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//                 >
//                   Cancel
//                 </button>
//                 <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//       {itemCatDeletModelOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
//             <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Item Category</h2>
//             <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
//             <div className="flex justify-end space-x-3">
//               <button
//                 onClick={() => {
//                   setItemCatDeleteModelOpen(false);
//                   setDelete(null);
//                 }}
//                 className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//               >
//                 Cancel
//               </button>
//               <button onClick={handleItemCatDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
//             </div>
//           </div>
//         </div>
//       )}

//       <br />

//       {/* Items */}
//       <div className="overflow-x-auto bg-white rounded shadow">
//         {isLoading ? (
//           <div className="flex justify-center items-center h-64">
//             <FadeLoader color="#36d7b7" loading={isLoading} />
//           </div>
//         ) : (
//           <>
//             <table className="min-w-full divide-y divide-gray-200">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Item</th>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-200">
//                 {itemSlice.map((item, i) => (
//                   <tr key={item.id ?? i}>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm">
//                       <button
//                         className="text-blue-600 hover:underline mr-3"
//                         onClick={() => {
//                           setEditing(item);
//                           setForm(item);
//                           setItemModalOpen(true);
//                         }}
//                       >
//                         Edit
//                       </button>
//                       <button
//                         className="text-red-600 hover:underline"
//                         onClick={() => {
//                           setDelete(item);
//                           setForm(item);
//                           setItemDeleteModelOpen(true);
//                         }}
//                       >
//                         Delete
//                       </button>
//                     </td>
//                   </tr>
//                 ))}
//                 {itemSlice.length === 0 && (
//                   <tr>
//                     <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//             <Pager
//               page={itemPage}
//               setPage={setItemPage}
//               pageSize={itemPageSize}
//               setPageSize={setItemPageSize}
//               total={itemlist.length}
//             />
//           </>
//         )}
//       </div>

//       {/* Item Modal */}
//       {itemModalOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
//             <h2 className="text-xl font-bold mb-4">Add Items</h2>
//             <form onSubmit={handleItemSubmit} className="space-y-4">
//               <input
//                 name="name"
//                 placeholder="Item name"
//                 value={form.name}
//                 onChange={handleChange}
//                 className="w-full border border-gray-300 p-2 rounded"
//                 required
//               />
//               <div className="flex justify-end mt-6 space-x-3">
//                 <button
//                   type="button"
//                   onClick={() => setItemModalOpen(false)}
//                   className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//                 >
//                   Cancel
//                 </button>
//                 <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//       {itemDeletModelOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
//             <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Item</h2>
//             <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
//             <div className="flex justify-end space-x-3">
//               <button
//                 onClick={() => {
//                   setItemDeleteModelOpen(false);
//                   setDelete(null);
//                 }}
//                 className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//               >
//                 Cancel
//               </button>
//               <button onClick={handleItemDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
//             </div>
//           </div>
//         </div>
//       )}
//       <div className="overflow-x-auto bg-white rounded shadow">
//         {isLoading ? (
//           <div className="flex justify-center items-center h-64">
//             <FadeLoader color="#36d7b7" loading={isLoading} />
//           </div>
//         ) : (
//           <>
//             <table className="min-w-full divide-y divide-gray-200">
//               <thead className="bg-gray-50">
//                 <tr>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Type</th>
//                   <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
//                 </tr>
//               </thead>
//               <tbody className="divide-y divide-gray-200">
//                 {typeSlice.map((item, i) => (
//                   <tr key={item.id ?? i}>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
//                     <td className="px-6 py-4 whitespace-nowrap text-sm">
//                       <button
//                         className="text-blue-600 hover:underline mr-3"
//                         onClick={() => {
//                           setEditing(item);
//                           setForm(item);
//                           setTypeModalOpen(true);
//                         }}
//                       >
//                         Edit
//                       </button>
//                       <button
//                         className="text-red-600 hover:underline"
//                         onClick={() => {
//                           setDelete(item);
//                           setForm(item);
//                           setTypeDeleteModelOpen(true);
//                         }}
//                       >
//                         Delete
//                       </button>
//                     </td>
//                   </tr>
//                 ))}
//                 {typeSlice.length === 0 && (
//                   <tr>
//                     <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
//                   </tr>
//                 )}
//               </tbody>
//             </table>
//             <Pager
//               page={itemPage}
//               setPage={setItemPage}
//               pageSize={itemPageSize}
//               setPageSize={setItemPageSize}
//               total={itemlist.length}
//             />
//           </>
//         )}
//       </div>

//       {/* Item Modal */}
//       {typeModalOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
//             <h2 className="text-xl font-bold mb-4">Add Type</h2>
//             <form onSubmit={handleTypeSubmit} className="space-y-4">
//               <input
//                 name="name"
//                 placeholder="type"
//                 value={form.name}
//                 onChange={handleChange}
//                 className="w-full border border-gray-300 p-2 rounded"
//                 required
//               />
//               <div className="flex justify-end mt-6 space-x-3">
//                 <button
//                   type="button"
//                   onClick={() => setTypeModalOpen(false)}
//                   className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//                 >
//                   Cancel
//                 </button>
//                 <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//       {typeDeletModelOpen && (
//         <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
//           <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
//             <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Type</h2>
//             <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
//             <div className="flex justify-end space-x-3">
//               <button
//                 onClick={() => {
//                   setTypeDeleteModelOpen(false);
//                   setDelete(null);
//                 }}
//                 className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
//               >
//                 Cancel
//               </button>
//               <button onClick={handleTypeDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
//             </div>
//           </div>
//         </div>
//       )}

//       <ToastContainer />
//     </main>
//   );
// };

// export default MaintenanceCategoryPage;
