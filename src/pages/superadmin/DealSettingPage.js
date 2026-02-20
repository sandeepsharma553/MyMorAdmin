import React, { useEffect, useMemo, useState } from "react";
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
            className={`px-3 py-1 rounded border ${canPrev
              ? "bg-white hover:bg-gray-50"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            Prev
          </button>
          <button
            className={`px-3 py-1 rounded border ${canNext
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

/**
 * Simple CRUD section for a one-field {name} collection.
 * Keeps your existing pattern: collection filtered by (optionally) uid on duplicate check.
 */
function SimpleCrudSection({
  title,
  collectionName,
  addButtonLabel,
  // If you want to guard duplicates across a whole org, pass extraWhere=[] or with hostelid, etc.
  duplicateWhere = (uid) => [where("uid", "==", uid)],
}) {
  const uid = useSelector((s) => s.auth.user.uid);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const initialForm = { id: 0, name: "" };
  const [form, setForm] = useState(initialForm);

  const fetchList = async () => {
    setIsLoading(true);
    try {
      // No base filter (to match your original payment code). Change if needed.
      const qBase = query(collection(db, collectionName));
      const snap = await getDocs(qBase);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setList(rows);
    } catch (e) {
      console.error(e);
      toast.error(`Failed to load ${title.toLowerCase()} list`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  useEffect(() => setPage(1), [list.length]);

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) return;

    try {
      if (editing) {
        // Ensure doc exists
        const ref = doc(db, collectionName, form.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Record no longer exists. Cannot update.");
          return;
        }
        await updateDoc(ref, {
          uid,
          name: form.name.trim(),
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Successfully updated");
      } else {
        // Duplicate check: same name for same uid
        const dupQ = query(
          collection(db, collectionName),
          where("name", "==", form.name.trim()),
          ...duplicateWhere(uid)
        );
        const dupSnap = await getDocs(dupQ);
        if (!dupSnap.empty) {
          toast.warn("Duplicate found! Not adding.");
          return;
        }
        await addDoc(collection(db, collectionName), {
          uid,
          name: form.name.trim(),
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Successfully saved");
      }
      await fetchList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    }
  };

  const onDelete = async () => {
    if (!deleteRow?.id) return;
    try {
      await deleteDoc(doc(db, collectionName, deleteRow.id));
      toast.success("Successfully deleted!");
      await fetchList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setDeleteOpen(false);
    setDeleteRow(null);
  };

  return (
    <div className="overflow-x-auto bg-white rounded shadow">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          {addButtonLabel}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <FadeLoader color="#36d7b7" loading={isLoading} />
        </div>
      ) : (
        <>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slice.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {item.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      className="text-blue-600 hover:underline mr-3"
                      onClick={() => {
                        setEditing(item);
                        setForm(item);
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        setDeleteRow(item);
                        setDeleteOpen(true);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
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
            page={page}
            setPage={setPage}
            pageSize={pageSize}
            setPageSize={setPageSize}
            total={list.length}
          />
        </>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h3 className="text-xl font-bold mb-4">
              {editing ? `Edit ${title.slice(0, -1)}` : `Add ${title.slice(0, -1)}`}
            </h3>
            <form onSubmit={onSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Name"
                value={form.name}
                onChange={onChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />
              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
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

      {/* Delete confirm */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-red-600">
              Delete {title.slice(0, -1)}
            </h3>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteRow?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteRow(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={onDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function SlotCrudSection({ title = "Deal Slots" }) {
  const uid = useSelector((s) => s.auth.user?.uid);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [categories, setCategories] = useState([]);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const initialForm = { id: "", name: "", categoryId: "" };
  const [form, setForm] = useState(initialForm);

  const fetchCategories = async () => {
    if (!uid) return;
    try {
      const qCat = query(collection(db, "dealcategory"), where("uid", "==", uid));
      const snap = await getDocs(qCat);
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setCategories(rows);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };

  const fetchSlots = async () => {
    setIsLoading(true);
    try {
      const qBase = query(collection(db, "dealslot"), where("uid", "==", uid));
      const snap = await getDocs(qBase);
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setList(rows);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load slots");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchSlots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => setPage(1), [list.length]);

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  const categoryMap = useMemo(() => {
    const m = {};
    categories.forEach((c) => (m[c.id] = c.name));
    return m;
  }, [categories]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.name?.trim()) return toast.warn("Slot name required");
    if (!form.categoryId) return toast.warn("Category required");

    const categoryName = categoryMap[form.categoryId] || "";

    try {
      if (editing) {
        const ref = doc(db, "dealslot", form.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("Record no longer exists. Cannot update.");
          return;
        }

        // Duplicate check (excluding this doc)
        const dupQ = query(
          collection(db, "dealslot"),
          where("uid", "==", uid),
          where("categoryId", "==", form.categoryId),
          where("name", "==", form.name.trim())
        );
        const dupSnap = await getDocs(dupQ);
        const dup = dupSnap.docs.find((d) => d.id !== form.id);
        if (dup) return toast.warn("Duplicate slot in same category");

        await updateDoc(ref, {
          uid,
          name: form.name.trim(),
          categoryId: form.categoryId,
          categoryName,
          updatedBy: uid,
          updatedDate: new Date(),
        });

        toast.success("Slot updated");
      } else {
        // Duplicate check
        const dupQ = query(
          collection(db, "dealslot"),
          where("uid", "==", uid),
          where("categoryId", "==", form.categoryId),
          where("name", "==", form.name.trim())
        );
        const dupSnap = await getDocs(dupQ);
        if (!dupSnap.empty) return toast.warn("Duplicate slot in same category");

        await addDoc(collection(db, "dealslot"), {
          uid,
          name: form.name.trim(),
          categoryId: form.categoryId,
          categoryName,
          createdBy: uid,
          createdDate: new Date(),
        });

        toast.success("Slot saved");
      }

      await fetchSlots();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    }
  };

  const onDelete = async () => {
    if (!deleteRow?.id) return;
    try {
      await deleteDoc(doc(db, "dealslot", deleteRow.id));
      toast.success("Slot deleted!");
      await fetchSlots();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setDeleteOpen(false);
    setDeleteRow(null);
  };

  return (
    <div className="overflow-x-auto bg-white rounded shadow">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm({ ...initialForm, categoryId: categories?.[0]?.id || "" });
            setModalOpen(true);
          }}
        >
          + Add Slot
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <FadeLoader color="#36d7b7" loading={isLoading} />
        </div>
      ) : (
        <>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Category</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Slot</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {slice.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                    {item.categoryName || categoryMap[item.categoryId] || "—"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      className="text-blue-600 hover:underline mr-3"
                      onClick={() => {
                        setEditing(item);
                        setForm({
                          id: item.id,
                          name: item.name || "",
                          categoryId: item.categoryId || "",
                        });
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </button>

                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        setDeleteRow(item);
                        setDeleteOpen(true);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {slice.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={3}>
                    No slots
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={list.length} />
        </>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h3 className="text-xl font-bold mb-4">{editing ? "Edit Slot" : "Add Slot"}</h3>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Category</label>
                <select
                  name="categoryId"
                  value={form.categoryId}
                  onChange={onChange}
                  className="w-full border border-gray-300 p-2 rounded mt-1"
                  required
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Slot Name</label>
                <input
                  name="name"
                  placeholder="e.g. Breakfast, Happy Hour"
                  value={form.name}
                  onChange={onChange}
                  className="w-full border border-gray-300 p-2 rounded mt-1"
                  required
                />
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                  }}
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

      {/* Delete confirm */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-red-600">Delete Slot</h3>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteRow?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteRow(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={onDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function RedemptionMethodCrudSection() {
  const uid = useSelector((s) => s.auth.user?.uid);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteRow, setDeleteRow] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const initialForm = { id: "", name: "", key: "" };
  const [form, setForm] = useState(initialForm);

  const fetchList = async () => {
    if (!uid) return;
    setIsLoading(true);
    try {
      const qBase = query(collection(db, "dealredemptionmethod"), where("uid", "==", uid));
      const snap = await getDocs(qBase);
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      setList(rows);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load redemption methods");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => setPage(1), [list.length]);

  const slice = useMemo(() => {
    const start = (page - 1) * pageSize;
    return list.slice(start, start + pageSize);
  }, [list, page, pageSize]);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const normalizeKey = (k) =>
    String(k || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");

  const onSubmit = async (e) => {
    e.preventDefault();

    const name = String(form.name || "").trim();
    const key = normalizeKey(form.key);

    if (!name) return toast.warn("Name required");
    if (!key) return toast.warn("Key required (student_id / qr / promo)");

    if (!["student_id", "qr", "promo"].includes(key)) {
      return toast.warn("Key must be: student_id, qr, promo");
    }

    try {
      // duplicate check (uid + key)
      const dupQ = query(
        collection(db, "dealredemptionmethod"),
        where("uid", "==", uid),
        where("key", "==", key)
      );
      const dupSnap = await getDocs(dupQ);
      const dup = dupSnap.docs.find((d) => d.id !== form.id);
      if (dup) return toast.warn("Duplicate key found");

      if (editing) {
        const ref = doc(db, "dealredemptionmethod", form.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) return toast.warning("Record no longer exists.");

        await updateDoc(ref, {
          uid,
          name,
          key,
          updatedBy: uid,
          updatedDate: new Date(),
        });
        toast.success("Updated");
      } else {
        await addDoc(collection(db, "dealredemptionmethod"), {
          uid,
          name,
          key,
          createdBy: uid,
          createdDate: new Date(),
        });
        toast.success("Saved");
      }

      await fetchList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    }
  };

  const onDelete = async () => {
    if (!deleteRow?.id) return;
    try {
      await deleteDoc(doc(db, "dealredemptionmethod", deleteRow.id));
      toast.success("Deleted!");
      await fetchList();
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
    setDeleteOpen(false);
    setDeleteRow(null);
  };

  return (
    <div className="overflow-x-auto bg-white rounded shadow">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">Deal Redemption Methods</h2>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          + Add Method
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <FadeLoader color="#36d7b7" loading={isLoading} />
        </div>
      ) : (
        <>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Key</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slice.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 text-sm text-gray-700">{item.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-700">{item.key}</td>
                  <td className="px-6 py-4 text-sm">
                    <button
                      className="text-blue-600 hover:underline mr-3"
                      onClick={() => {
                        setEditing(item);
                        setForm({ id: item.id, name: item.name || "", key: item.key || "" });
                        setModalOpen(true);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => {
                        setDeleteRow(item);
                        setDeleteOpen(true);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={3}>
                    No records
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pager page={page} setPage={setPage} pageSize={pageSize} setPageSize={setPageSize} total={list.length} />
        </>
      )}

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h3 className="text-xl font-bold mb-4">{editing ? "Edit Method" : "Add Method"}</h3>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Name</label>
                <input
                  name="name"
                  placeholder="Show Student ID"
                  value={form.name}
                  onChange={onChange}
                  className="w-full border border-gray-300 p-2 rounded mt-1"
                  required
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">Key</label>
                <input
                  name="key"
                  placeholder="student_id / qr / promo"
                  value={form.key}
                  onChange={onChange}
                  className="w-full border border-gray-300 p-2 rounded mt-1"
                  required
                />
                <div className="text-xs text-gray-500 mt-1">
                  Must be exactly: <b>student_id</b>, <b>qr</b>, <b>promo</b>
                </div>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                  }}
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

      {/* Delete confirm */}
      {deleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h3 className="text-xl font-semibold mb-4 text-red-600">Delete Method</h3>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteRow?.name}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setDeleteOpen(false);
                  setDeleteRow(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={onDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const DealSettingPage = () => {
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      <h1 className="text-2xl font-semibold mb-4">Deal Setting</h1>


      {/* Public Event Categories (NEW) */}
      <SimpleCrudSection
        title="Deal Categories"
        collectionName="dealcategory"
        addButtonLabel="+ Add Category"
        duplicateWhere={(uid) => [where("uid", "==", uid)]}
      />
      <br />
      <SlotCrudSection title="Deal Slots (by Category)" />
      <br />
      <SimpleCrudSection
        title="Deal Mode"
        collectionName="dealmode"
        addButtonLabel="+ Add Mode"
        duplicateWhere={(uid) => [where("uid", "==", uid)]}
      />
      <br />
      <SimpleCrudSection
        title="Deal Status"
        collectionName="dealstatus"
        addButtonLabel="+ Add Status"
        duplicateWhere={(uid) => [where("uid", "==", uid)]}
      />
      <br />
      <RedemptionMethodCrudSection />
      <br />
      <SimpleCrudSection
        title="Deal Discovery Tag"
        collectionName="dealdiscoverytag"
        addButtonLabel="+ Add Discovery Tag"
        duplicateWhere={(uid) => [where("uid", "==", uid)]}
      />
      <br />
      <SimpleCrudSection
        title="Deal Feed Section"
        collectionName="dealmfeedsection"
        addButtonLabel="+ Add Feed Section"
        duplicateWhere={(uid) => [where("uid", "==", uid)]}
      />


      <ToastContainer />
    </main>
  );
};

export default DealSettingPage;
