import React, { useState, useEffect, useRef } from "react";
import { db, database, storage } from "../../firebase";
import {
  ref as dbRef,
  onValue,
  set,
  push,
  update,
  remove,
  get,
  serverTimestamp,
  off,
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

export default function AcademicGroupPage(props) {
  const { navbarHeight } = props;

  // UI state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [viewGroup, setViewGroup] = useState(null);
  const [selectedGroup, setSelected] = useState(null);

  // NEW: Members modal state
  const [membersModal, setMembersModal] = useState({ open: false, group: null });

  // Data
  const [list, setList] = useState([]);
  const [academicCatlist, setAcademicCatList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Sorting + Filters
  const [sortConfig, setSortConfig] = useState({ key: "title", direction: "asc" });
  const [filters, setFilters] = useState({
    title: "",
    category: "All",
    groupType: "All",
    pending: "All", // All | HasPending | NoPending
  });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [field]: value }));
    }, 250);
  };
  const onSort = (key) =>
    setSortConfig((prev) =>
      prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }
    );

  // Auth
  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  // File input label
  const [fileName, setFileName] = useState("No file chosen");

  // Form
  const initialForm = {
    id: 0,
    title: "",
    description: "",
    category: "",
    tags: "",
    type: "Popular",
    groupType: "Public",
    joinQuestions: "",
    restrictions: "",
    maxMembers: "",
    postApproval: false,
    groupChat: true,
    eventsEnabled: true,
    pollsEnabled: false,
    resourcesEnabled: false,
    location: "",
    campusSpecific: false,
    notifications: true,
    autoAlert: true,
    hostelid: "",
    poster: null,
    posterUrl: "",
  };
  const [form, setForm] = useState(initialForm);

  // Load data
  useEffect(() => {
    getList();
    getAcademicCatList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset to page 1 when filters/sort change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig]);

  const getAcademicCatList = async () => {
    if (!emp?.hostelid) return; // guard
    setIsLoading(true);
    try {
      const academicCategoryQuery = query(
        collection(db, "academiccategory"),
        where("hostelid", "==", emp.hostelid)
      );
      const querySnapshot = await getDocs(academicCategoryQuery);
      const documents = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setAcademicCatList(documents);
    } catch (e) {
      console.error(e);
      toast.error("Failed to fetch categories");
    } finally {
      setIsLoading(false);
    }
  };

  const getList = async () => {
    if (!emp?.hostelid) return; // guard
    setIsLoading(true);
    const groupRef = dbRef(database, "groups/");
    const handler = async (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const arr = await Promise.all(
          Object.entries(data)
            // keep by hostel + creator
            .filter(([_, v]) => v.hostelid === emp.hostelid && v.creatorId === emp.id)
            .map(async ([gid, v]) => {
              const membersObj = v.members || {};
              const requests = v.joinRequests || {};

              const membersArr = Object.entries(membersObj).map(([uid, m]) => ({
                uid,
                name: m?.name || "Unknown",
                photoURL: m?.photoURL || "",
                isAdmin: !!m?.isAdmin,
                // Support number or Firestore-like {seconds}
                joinedAt:
                  typeof m?.joinedAt === "number"
                    ? m.joinedAt
                    : m?.joinedAt?.seconds
                      ? m.joinedAt.seconds * 1000
                      : null,
              }));

              const pendingCount = Object.values(requests).filter((r) => r?.status === "pending").length;

              return {
                id: gid,
                ...v,
                members: membersArr,
                memberCount: membersArr.length,
                requests,
                pendingCount,
              };
            })
        );
        setList(arr);
      } else {
        setList([]);
      }
      setIsLoading(false);
    };

    onValue(groupRef, handler, { onlyOnce: false });

    // cleanup on unmount
    return () => off(groupRef, "value", handler);
  };

  // CRUD Handlers
  const handleChange = (e) => {
    const { name, value, type, checked, files } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: checked }));
    } else if (type === "file") {
      setForm((prev) => ({ ...prev, [name]: files?.[0] || null }));
      setFileName(files?.[0]?.name || "No file chosen");
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.title) return;

    try {
      if (form.id === 0 && !form.poster) {
        toast.error("Please choose the file");
        return;
      }

      let posterUrl = form.posterUrl || "";
      const isNewImage = form.poster instanceof File;
      if (isNewImage) {
        const storRef = storageRef(storage, `group_posters/${form.poster.name}`);
        await uploadBytes(storRef, form.poster);
        posterUrl = await getDownloadURL(storRef);
      }

      if (editingData) {
        await update(dbRef(database, `groups/${form.id}`), {
          ...form,
          creatorId: uid,
          hostelid: emp.hostelid,
          ...(posterUrl && { posterUrl }),
        });
        toast.success("Group updated successfully!");
      } else {
        const { id, poster, ...payload } = form;
        const newGroupRef = push(dbRef(database, "groups/"));
        await set(newGroupRef, {
          ...payload,
          creatorId: uid,
          hostelid: emp.hostelid,
          ...(posterUrl && { posterUrl }),
        });
        toast.success("Group created successfully");
      }
    } catch (error) {
      console.error("Error saving group:", error);
      toast.error("Failed to save group.");
    }

    getList();
    setModalOpen(false);
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const groupRef = dbRef(database, `groups/${deleteData.id}`); // FIX: use deleteData.id
      await remove(groupRef);
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting group: ", error);
      toast.error("Failed to delete group.");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const approve = async (gid, uid, item) => {
    await set(dbRef(database, `groups/${gid}/members/${uid}`), {
      uid: item.uid,
      name: item.name || "",
      photoURL: item.photoURL ?? "",
      isAdmin: false,
      joinedAt: serverTimestamp(),
    });
    await update(dbRef(database, `groups/${gid}/joinRequests/${uid}`), { status: "approved" });
    toast.success("User approved");
    setSelected(null);
  };

  const reject = async (gid, uid) => {
    await update(dbRef(database, `groups/${gid}/joinRequests/${uid}`), { status: "rejected" });
    toast.info("User rejected");
    setSelected(null);
  };

  // ---------- Filter + Sort + Paginate ----------
  const filteredData = list.filter((g) => {
    const titleOK =
      !filters.title || (g.title || "").toLowerCase().includes(filters.title.toLowerCase());
    const categoryOK = filters.category === "All" || (g.category || "") === filters.category;
    const typeOK = filters.groupType === "All" || (g.groupType || "") === filters.groupType;
    const pendingOK =
      filters.pending === "All" ||
      (filters.pending === "HasPending" ? g.pendingCount > 0 : g.pendingCount === 0);
    return titleOK && categoryOK && typeOK && pendingOK;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const key = sortConfig.key;

    if (key === "memberCount" || key === "pendingCount") {
      const va = Number(a[key] ?? 0);
      const vb = Number(b[key] ?? 0);
      return (va - vb) * dir;
    }

    const sa = (a[key] ?? "").toString().toLowerCase();
    const sb = (b[key] ?? "").toString().toLowerCase();
    return sa.localeCompare(sb) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // ---------- UI ----------
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto no-scrollbar" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Academic Group</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          + Add Group
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow no-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              {/* Row 1: Sortable headers */}
              <tr>
                {[
                  { key: "title", label: "Group Name" },
                  { key: "description", label: "Group Description" },
                  { key: "memberCount", label: "Members" },
                  { key: "pendingCount", label: "Pending" },
                  { key: "actions", label: "Action", sortable: false },
                ].map((col) => (
                  <th
                    key={col.key}
                    className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none"
                  >
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:underline"
                        onClick={() => onSort(col.key)}
                        title="Sort"
                      >
                        <span>{col.label}</span>
                        {sortConfig.key === col.key && (
                          <span className="text-gray-400">
                            {sortConfig.direction === "asc" ? "▲" : "▼"}
                          </span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>

              {/* Row 2: Inline header filters */}
              <tr className="border-t border-gray-200">
                {/* Title filter */}
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search title"
                    defaultValue={filters.title}
                    onChange={(e) => setFilterDebounced("title", e.target.value)}
                  />
                </th>
                {/* Description: none */}
                <th className="px-6 pb-3">
                  {/* Category + Group Type */}
                  <div className="flex gap-2">
                    <select
                      className="border border-gray-300 p-1 rounded text-sm"
                      value={filters.category}
                      onChange={(e) => setFilters((p) => ({ ...p, category: e.target.value }))}
                      title="Filter by category"
                    >
                      <option value="All">All categories</option>
                      {academicCatlist.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>

                    <select
                      className="border border-gray-300 p-1 rounded text-sm"
                      value={filters.groupType}
                      onChange={(e) => setFilters((p) => ({ ...p, groupType: e.target.value }))}
                      title="Filter by group type"
                    >
                      <option value="All">All types</option>
                      <option value="Public">Public</option>
                      <option value="Private">Private</option>
                      <option value="Hidden">Hidden</option>
                    </select>
                  </div>
                </th>

                {/* Members: no filter */}
                <th className="px-6 pb-3" />

                {/* Pending filter */}
                <th className="px-6 pb-3">
                  <select
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    value={filters.pending}
                    onChange={(e) => setFilters((p) => ({ ...p, pending: e.target.value }))}
                    title="Filter by pending requests"
                  >
                    <option value="All">All</option>
                    <option value="HasPending">Has pending</option>
                    <option value="NoPending">No pending</option>
                  </select>
                </th>

                {/* Actions: none */}
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-center text-gray-500">
                    No matching groups found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.title}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 whitespace-normal break-words max-w-xs">
                      {item.description}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.memberCount}
                      <button
                        className="text-indigo-600 hover:underline"
                        onClick={() => setMembersModal({ open: true, group: item })}
                      >
                        View Members
                      </button>

                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <button
                        disabled={!item.pendingCount}
                        className="text-blue-600 disabled:opacity-40"
                        onClick={() => setSelected(item)}
                      >
                        {item.pendingCount} pending
                      </button>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="flex items-center gap-3">

                        {item.type !== "Your" ? (
                          <>
                            <button
                              className="text-blue-600 hover:underline"
                              onClick={() => {
                                setEditing(item);
                                setForm({
                                  ...initialForm,
                                  ...item,
                                  poster: null, // keep file input empty on edit
                                });
                                setModalOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="text-red-600 hover:underline"
                              onClick={() => {
                                setDelete(item);
                                setForm(item);
                                setConfirmDeleteOpen(true);
                              }}
                            >
                              Delete
                            </button>
                          </>
                        ) : (
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => setViewGroup(item)}
                          >
                            View
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </p>
        <div className="space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Academic Group" : "Add Academic Group"}
            </h2>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Group Name"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />
                <textarea
                  placeholder="Description"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  required
                />
                <select
                  name="category"
                  value={form.category}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                >
                  <option value="">Select Category</option>
                  {academicCatlist.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <input
                  name="tags"
                  value={form.tags}
                  onChange={handleChange}
                  placeholder="Tags / Interests (comma separated)"
                  className="w-full border border-gray-300 p-2 rounded"
                />

                {/* Logo */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">📸 Upload Logo</h2>
                  <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        name="poster"
                        accept="image/*"
                        className="hidden"
                        onChange={handleChange}
                      />
                      📁 Choose File
                    </label>
                    <span className="text-sm text-gray-600 truncate max-w-[150px]">
                      {fileName}
                    </span>
                  </div>
                  {form.posterUrl && (
                    <img src={form.posterUrl} alt="Poster Preview" width="150" />
                  )}
                </section>

                {/* Privacy */}
                <section className="space-y-4">
                  <h2 className="text-xl font-semibold">🔒 Privacy & Access</h2>
                  <select
                    name="groupType"
                    value={form.groupType}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                  >
                    <option value="Public">Public</option>
                    <option value="Private">Private</option>
                    <option value="Hidden">Hidden / Invite-only</option>
                  </select>
                </section>
              </div>

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
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Group</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.title}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
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

      {/* Pending requests modal */}
      {selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-[30rem] max-h-[90vh] overflow-y-auto p-6 rounded shadow-lg">
            <h2 className="text-lg font-semibold mb-4">Join Requests – {selectedGroup.title}</h2>

            {Object.entries(selectedGroup.requests || {})
              .filter(([_, r]) => r.status === "pending")
              .map(([u, r]) => (
                <div key={u} className="border border-gray-200 rounded p-3 mb-3">
                  <div className="text-sm text-gray-700 mb-1">
                    <strong>User ID:</strong> {u}
                  </div>
                  <div className="text-sm text-gray-700 mb-1">
                    <strong>Name:</strong> {r.name || "Unknown"}
                  </div>
                  <div className="text-sm text-gray-700 mb-2">
                    <strong>Email:</strong> {r.email || "N/A"}
                  </div>
                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => approve(selectedGroup.id, u, r)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => reject(selectedGroup.id, u)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}

            {Object.values(selectedGroup.requests || {}).filter((r) => r.status === "pending").length === 0 && (
              <div className="text-center text-gray-500">No pending join requests.</div>
            )}

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View modal */}
      {viewGroup && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-lg p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4">Group Details</h2>
            <div className="space-y-2">
              <p>
                <strong>Name:</strong> {viewGroup?.title}
              </p>
              <p>
                <strong>Description:</strong> {viewGroup?.description}
              </p>
              <p>
                <strong>Category:</strong> {viewGroup?.category || "—"}
              </p>
              <p>
                <strong>Members:</strong> {viewGroup?.memberCount}
              </p>
              <p>
                <strong>Pending requests:</strong> {viewGroup?.pendingCount ?? 0}
              </p>
              <p>
                <strong>Creator ID:</strong> {viewGroup?.creatorId}
              </p>
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setViewGroup(null)}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Members modal */}
      {membersModal.open && membersModal.group && (
        <MembersModal
          group={membersModal.group}
          onClose={() => setMembersModal({ open: false, group: null })}
        />
      )}

      <ToastContainer />
    </main>
  );
}

/* ---------------- Members Modal ---------------- */

function MembersModal({ group, onClose }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const filtered = (group.members || []).filter((m) => {
    if (!q) return true;
    const name = (m.name || "").toLowerCase();
    const uid = (m.uid || "").toLowerCase();
    const query = q.toLowerCase();
    return name.includes(query) || uid.includes(query);
  });

  const sorted = [...filtered].sort((a, b) => {
    // Admins first, then by name
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = sorted.slice((page - 1) * pageSize, page * pageSize);

  const fmtDate = (ms) => {
    if (!ms) return "—";
    try {
      const d = new Date(ms);
      return d.toLocaleString();
    } catch {
      return "—";
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white w-[40rem] max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            Members — {group.title}{" "}
            <span className="text-gray-500">({sorted.length})</span>
          </h2>
          <button onClick={onClose} className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
            Close
          </button>
        </div>

        <div className="mb-3 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Search by name or UID…"
            className="w-full border border-gray-300 p-2 rounded"
          />
        </div>

        <div className="overflow-x-auto border border-gray-200 rounded">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-sm text-gray-600">User</th>
                <th className="px-4 py-2 text-left text-sm text-gray-600">UID</th>
                <th className="px-4 py-2 text-left text-sm text-gray-600">Role</th>
                <th className="px-4 py-2 text-left text-sm text-gray-600">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pageData.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No members found.
                  </td>
                </tr>
              ) : (
                pageData.map((m) => (
                  <tr key={m.uid}>
                    <td className="px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        {m.photoURL ? (
                          <img
                            src={m.photoURL}
                            alt=""
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200" />
                        )}
                        <span className="text-gray-800">{m.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">{m.uid}</td>
                    <td className="px-4 py-2 text-sm">
                      {m.isAdmin ? (
                        <span className="px-2 py-1 text-xs rounded bg-emerald-100 text-emerald-700">
                          Admin
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                          Member
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {fmtDate(m.joinedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-4">
          <p className="text-sm text-gray-600">
            Page {page} of {totalPages}
          </p>
          <div className="space-x-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
