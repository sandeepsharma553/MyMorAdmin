// src/pages/AcademicGroupPage.jsx
import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "../../firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import {
  doc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,collection
} from "firebase/firestore";
import { hostelCol } from "../../utils/firestorePaths";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

export default function AcademicGroupPage(props) {
  const { navbarHeight } = props;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [viewGroup, setViewGroup] = useState(null);
  const [selectedGroup, setSelected] = useState(null);
  const [membersModal, setMembersModal] = useState({ open: false, group: null });

  const [list, setList] = useState([]);
  const [academicCatlist, setAcademicCatList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const [sortConfig, setSortConfig] = useState({
    key: "title",
    direction: "asc",
  });

  const [filters, setFilters] = useState({
    title: "",
    category: "All",
    groupType: "All",
    pending: "All",
  });

  const debounceRef = useRef(null);

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  const [fileName, setFileName] = useState("No file chosen");

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

  useEffect(() => {
    if (!emp?.hostelid) return;
    getList();
    getAcademicCatList();
  }, [emp?.hostelid]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig]);

  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [field]: value }));
    }, 250);
  };

  const onSort = (key) =>
    setSortConfig((prev) =>
      prev.key === key
        ? {
            key,
            direction: prev.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: "asc" }
    );

  const getAcademicCatList = async () => {
    if (!emp?.hostelid) return;

    setIsLoading(true);
    try {
      const academicCategoryQuery = query(
        hostelCol(emp.hostelid, "academiccategory")
      );

      const querySnapshot = await getDocs(academicCategoryQuery);
      const documents = querySnapshot.docs.map((docu) => ({
        id: docu.id,
        ...docu.data(),
      }));

      setAcademicCatList(documents);
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch categories");
    } finally {
      setIsLoading(false);
    }
  };

  const getList = async () => {
    if (!emp?.hostelid) return;
  
    setIsLoading(true);
  
    try {
      const snapshot = await getDocs(
        query(
          hostelCol(emp.hostelid, "groups"),
          where("creatorId", "==", uid)
        )
      );
  
      const arr = await Promise.all(
        snapshot.docs.map(async (d) => {
          const v = d.data();
  
          const membersSnap = await getDocs(
            collection(hostelCol(emp.hostelid, "groups"), d.id, "members")
          );
  
          const requestsSnap = await getDocs(
            collection(hostelCol(emp.hostelid, "groups"), d.id, "joinRequests")
          );
  
          const membersArr = membersSnap.docs.map((mDoc) => {
            const m = mDoc.data();
  
            return {
              uid: mDoc.id,
              name: m?.name || "Unknown",
              email: m?.email || "",
              photoURL: m?.photoURL || "",
              isAdmin: !!m?.isAdmin,
              joinedAt:
                typeof m?.joinedAt === "number"
                  ? m.joinedAt
                  : m?.joinedAt?.toMillis?.() ?? null,
            };
          });
  
          const requests = {};
          requestsSnap.docs.forEach((rDoc) => {
            requests[rDoc.id] = {
              uid: rDoc.id,
              ...rDoc.data(),
            };
          });
  
          const pendingCount = Object.values(requests).filter(
            (r) => r?.status === "pending"
          ).length;
  
          return {
            id: d.id,
            ...v,
            members: membersArr,
            memberCount: membersArr.length,
            requests,
            pendingCount,
          };
        })
      );
  
      setList(arr);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load groups");
    } finally {
      setIsLoading(false);
    }
  };
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

    if (!emp?.hostelid) {
      toast.error("Hostel not found.");
      return;
    }

    if (!form.title) return;

    try {
      if (form.id === 0 && !form.poster) {
        toast.error("Please choose the file");
        return;
      }

      let posterUrl = form.posterUrl || "";
      const isNewImage = form.poster instanceof File;

      if (isNewImage) {
        const storRef = storageRef(
          storage,
          `hostel/${emp.hostelid}/group_posters/${Date.now()}_${form.poster.name}`
        );
        await uploadBytes(storRef, form.poster);
        posterUrl = await getDownloadURL(storRef);
      }

      const payload = {
        title: form.title,
        description: form.description,
        category: form.category,
        tags: form.tags || "",
        type: form.type || "Popular",
        groupType: form.groupType || "Public",
        joinQuestions: form.joinQuestions || "",
        restrictions: form.restrictions || "",
        maxMembers: form.maxMembers || "",
        postApproval: !!form.postApproval,
        groupChat: form.groupChat !== false,
        eventsEnabled: form.eventsEnabled !== false,
        pollsEnabled: !!form.pollsEnabled,
        resourcesEnabled: !!form.resourcesEnabled,
        location: form.location || "",
        campusSpecific: !!form.campusSpecific,
        notifications: form.notifications !== false,
        autoAlert: form.autoAlert !== false,
        hostelid: emp.hostelid,
        ...(posterUrl ? { posterUrl } : {}),
      };

      if (editingData) {
        await updateDoc(
          doc(hostelCol(emp.hostelid, "groups"), String(form.id)),
          {
            ...payload,
            updatedBy: uid,
            updatedAt: serverTimestamp(),
          }
        );

        toast.success("Group updated successfully!");
      } else {
        const newGroupRef = doc(hostelCol(emp.hostelid, "groups"));

        await setDoc(newGroupRef, {
          id: newGroupRef.id,
          ...payload,
          creatorId: uid,
          createdBy: uid,
          createdAt: serverTimestamp(),
          admins: { [uid]: true },
          members: {
            [uid]: {
              uid,
              name: emp?.name || emp?.username || emp?.email || "Admin",
              photoURL: emp?.photoURL || "",
              isAdmin: true,
              joinedAt: Date.now(),
            },
          },
          joinRequests: {},
        });

        toast.success("Group created successfully");
      }

      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
    } catch (error) {
      console.error("Error saving group:", error);
      toast.error("Failed to save group.");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id || !emp?.hostelid) return;

    try {
      await deleteDoc(
        doc(hostelCol(emp.hostelid, "groups"), String(deleteData.id))
      );

      toast.success("Successfully deleted!");
      await getList();
    } catch (error) {
      console.error("Error deleting group:", error);
      toast.error("Failed to delete group.");
    }

    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const approve = async (gid, requestUid, item) => {
    if (!emp?.hostelid) return;
  
    try {
      await setDoc(
        doc(hostelCol(emp.hostelid, "groups"), gid, "members", requestUid),
        {
          uid: item.uid || requestUid,
          name: item.name || "",
          photoURL: item.photoURL || "",
          email: item.email || "",
          isAdmin: false,
          joinedAt: serverTimestamp(),
        }
      );
  
      await updateDoc(
        doc(hostelCol(emp.hostelid, "groups"), gid, "joinRequests", requestUid),
        {
          status: "approved",
          updatedAt: serverTimestamp(),
        }
      );
  
      toast.success("User approved");
      setSelected(null);
      await getList();
    } catch (error) {
      console.error("Approve error:", error);
      toast.error("Failed to approve user");
    }
  };

  const reject = async (gid, requestUid) => {
    if (!emp?.hostelid) return;
  
    try {
      await updateDoc(
        doc(hostelCol(emp.hostelid, "groups"), gid, "joinRequests", requestUid),
        {
          status: "rejected",
          updatedAt: serverTimestamp(),
        }
      );
  
      toast.info("User rejected");
      setSelected(null);
      await getList();
    } catch (error) {
      console.error("Reject error:", error);
      toast.error("Failed to reject user");
    }
  };

  const filteredData = list.filter((g) => {
    const titleOK =
      !filters.title ||
      (g.title || "").toLowerCase().includes(filters.title.toLowerCase());

    const categoryOK =
      filters.category === "All" || (g.category || "") === filters.category;

    const typeOK =
      filters.groupType === "All" || (g.groupType || "") === filters.groupType;

    const pendingOK =
      filters.pending === "All" ||
      (filters.pending === "HasPending"
        ? g.pendingCount > 0
        : g.pendingCount === 0);

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

  const paginatedData = sortedData.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto no-scrollbar"
      style={{ paddingTop: navbarHeight || 0 }}
    >
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

              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search title"
                    defaultValue={filters.title}
                    onChange={(e) =>
                      setFilterDebounced("title", e.target.value)
                    }
                  />
                </th>

                <th className="px-6 pb-3">
                  <div className="flex gap-2">
                    <select
                      className="border border-gray-300 p-1 rounded text-sm"
                      value={filters.category}
                      onChange={(e) =>
                        setFilters((p) => ({
                          ...p,
                          category: e.target.value,
                        }))
                      }
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
                      onChange={(e) =>
                        setFilters((p) => ({
                          ...p,
                          groupType: e.target.value,
                        }))
                      }
                    >
                      <option value="All">All types</option>
                      <option value="Public">Public</option>
                      <option value="Private">Private</option>
                      <option value="Hidden">Hidden</option>
                    </select>
                  </div>
                </th>

                <th className="px-6 pb-3" />

                <th className="px-6 pb-3">
                  <select
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    value={filters.pending}
                    onChange={(e) =>
                      setFilters((p) => ({
                        ...p,
                        pending: e.target.value,
                      }))
                    }
                  >
                    <option value="All">All</option>
                    <option value="HasPending">Has pending</option>
                    <option value="NoPending">No pending</option>
                  </select>
                </th>

                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-4 text-center text-gray-500"
                  >
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
                      <div className="flex flex-col gap-1">
                        <span>{item.memberCount}</span>
                        <button
                          className="text-indigo-600 hover:underline text-left"
                          onClick={() =>
                            setMembersModal({ open: true, group: item })
                          }
                        >
                          View Members
                        </button>
                      </div>
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
                                  id: item.id,
                                  title: item.title || "",
                                  description: item.description || "",
                                  category: item.category || "",
                                  tags: item.tags || "",
                                  type: item.type || "Popular",
                                  groupType: item.groupType || "Public",
                                  joinQuestions: item.joinQuestions || "",
                                  restrictions: item.restrictions || "",
                                  maxMembers: item.maxMembers || "",
                                  postApproval: !!item.postApproval,
                                  groupChat: item.groupChat !== false,
                                  eventsEnabled: item.eventsEnabled !== false,
                                  pollsEnabled: !!item.pollsEnabled,
                                  resourcesEnabled: !!item.resourcesEnabled,
                                  location: item.location || "",
                                  campusSpecific: !!item.campusSpecific,
                                  notifications: item.notifications !== false,
                                  autoAlert: item.autoAlert !== false,
                                  hostelid: item.hostelid || emp.hostelid,
                                  poster: null,
                                  posterUrl: item.posterUrl || "",
                                });
                                setFileName("No file chosen");
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
                  onChange={(e) =>
                    setForm({ ...form, title: e.target.value })
                  }
                  required
                />

                <textarea
                  placeholder="Description"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
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
                    <img
                      src={form.posterUrl}
                      alt="Poster Preview"
                      width="150"
                    />
                  )}
                </section>

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

      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Group
            </h2>

            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.title}</strong>?
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

      {selectedGroup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white w-[30rem] max-h-[90vh] overflow-y-auto p-6 rounded shadow-lg">
            <h2 className="text-lg font-semibold mb-4">
              Join Requests – {selectedGroup.title}
            </h2>

            {Object.entries(selectedGroup.requests || {})
              .filter(([_, r]) => r.status === "pending")
              .map(([requestUid, r]) => (
                <div
                  key={requestUid}
                  className="border border-gray-200 rounded p-3 mb-3"
                >
                  <div className="text-sm text-gray-700 mb-1">
                    <strong>User ID:</strong> {requestUid}
                  </div>

                  <div className="text-sm text-gray-700 mb-1">
                    <strong>Name:</strong> {r.name || "Unknown"}
                  </div>

                  <div className="text-sm text-gray-700 mb-2">
                    <strong>Email:</strong> {r.email || "N/A"}
                  </div>

                  <div className="flex justify-end space-x-2">
                    <button
                      onClick={() => approve(selectedGroup.id, requestUid, r)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Approve
                    </button>

                    <button
                      onClick={() => reject(selectedGroup.id, requestUid)}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}

            {Object.values(selectedGroup.requests || {}).filter(
              (r) => r.status === "pending"
            ).length === 0 && (
              <div className="text-center text-gray-500">
                No pending join requests.
              </div>
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
                <strong>Pending requests:</strong>{" "}
                {viewGroup?.pendingCount ?? 0}
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
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageData = sorted.slice((page - 1) * pageSize, page * pageSize);

  const fmtDate = (ms) => {
    if (!ms) return "—";

    try {
      return new Date(ms).toLocaleString();
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

          <button
            onClick={onClose}
            className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
          >
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
                <th className="px-4 py-2 text-left text-sm text-gray-600">
                  User
                </th>
                <th className="px-4 py-2 text-left text-sm text-gray-600">
                  UID
                </th>
                <th className="px-4 py-2 text-left text-sm text-gray-600">
                  Role
                </th>
                <th className="px-4 py-2 text-left text-sm text-gray-600">
                  Joined
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {pageData.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-gray-500"
                  >
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

                    <td className="px-4 py-2 text-sm text-gray-600">
                      {m.uid}
                    </td>

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