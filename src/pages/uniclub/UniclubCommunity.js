import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

import { db, database, storage } from "../../firebase";
import {
  ref as dbRef,
  query as rtdbQuery,
  onValue,
  off,
  set,
  push,
  update,
  remove,
  get,
  orderByChild,
  equalTo,
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs } from "firebase/firestore";

export default function UniclubCommunity(props) {
  const { navbarHeight } = props;

  const uid = useSelector((s) => s.auth.user?.uid);
  const user = useSelector((s) => s.auth.user);
  const emp = useSelector((s) => s.auth.employee);

  const groupId = emp?.uniclubid;
  const groupName = emp?.uniclub || "";

  // ===== state =====
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);

  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [filters, setFilters] = useState({ content: "" });
  const debounceRef = useRef(null);

  const [selectedIds, setSelectedIds] = useState(new Set());

  const [fileName, setFileName] = useState("No file chosen");

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const initialForm = useMemo(
    () => ({
      id: "",
      content: "",
      postersFiles: [], // File[]
      // ✅ same as RN:
      mediaUrl: null,
      mediaType: null,
      // optional (for edit UI):
      existingMediaUrl: null,
      existingMediaType: null,
    }),
    []
  );
  const [form, setForm] = useState(initialForm);

  // ===== helpers =====
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [field]: value }));
      setCurrentPage(1);
    }, 250);
  };

  const fetchEmployeeUsername = async (targetUid) => {
    try {
      const snap = await getDocs(collection(db, "employees"));
      let found = "";
      snap.forEach((d) => {
        const data = d.data();
        const username = data.username || data.UserName || data.USERNAME || "";
        if (data.uid === targetUid) found = username;
      });
      return found || "";
    } catch {
      return "";
    }
  };

  // ✅ Upload ONE media like RN (image/video)
  const uploadSingleMedia = async (file) => {
    if (!file) return { url: null, type: null };

    const isImage = (file.type || "").startsWith("image/");
    const isVideo = (file.type || "").startsWith("video/");
    const mediaType = isImage ? "image" : isVideo ? "video" : null;

    const path = `posts/${Date.now()}_${file.name || "media"}`;
    const storRef = storageRef(storage, path);

    await uploadBytes(storRef, file);
    const url = await getDownloadURL(storRef);

    return { url, type: mediaType };
  };

  // ===== realtime load (scoped to group) =====
  useEffect(() => {
    if (!groupId) {
      setList([]);
      return;
    }

    setIsLoading(true);
    const q = rtdbQuery(
      dbRef(database, "community"),
      orderByChild("groupId"),
      equalTo(groupId)
    );

    const cb = (snapshot) => {
      const data = snapshot.val() || {};
      const docs = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
        createdAt: value.createdAt || 0,
      }));

      docs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setList(docs);
      setSelectedIds(new Set());
      setIsLoading(false);
    };

    onValue(q, cb, () => setIsLoading(false));
    return () => off(q);
  }, [groupId]);

  // ===== derived list =====
  const filteredList = useMemo(() => {
    const needle = (filters.content || "").trim().toLowerCase();
    if (!needle) return list;
    return list.filter((x) => (x.content || "").toLowerCase().includes(needle));
  }, [list, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredList.length / pageSize));
  const paginatedData = filteredList.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const pageIds = paginatedData.map((r) => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const somePageSelected = pageIds.some((id) => selectedIds.has(id));

  // ===== handlers =====
  const openAdd = () => {
    setEditing(null);
    setForm(initialForm);
    setFileName("No file chosen");
    setModalOpen(true);
  };

  const handleChange = (e) => {
    const { name, value, type, files } = e.target;

    if (type === "file" && name === "postersFiles") {
      const arr = Array.from(files || []);
      // ✅ RN supports single media. We'll take first file.
      const first = arr[0] || null;

      setForm((prev) => ({
        ...prev,
        postersFiles: arr,
        // local preview:
        mediaUrl: first ? URL.createObjectURL(first) : null,
        mediaType: first
          ? first.type?.startsWith("image/")
            ? "image"
            : first.type?.startsWith("video/")
              ? "video"
              : null
          : null,
      }));

      setFileName(first ? first.name : "No file chosen");
      return;
    }

    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // ✅ Save same fields like RN popup
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!groupId) {
      toast.error("Missing groupId — open this page from a Uniclub row.");
      return;
    }

    const isTextValid = (form.content || "").trim().length > 0;
    const hasNewFile = (form.postersFiles || []).length > 0;
    const hasExistingMedia = !!form.existingMediaUrl;

    if (!isTextValid && !hasNewFile && !hasExistingMedia) {
      toast.error("Please enter text or select media to post.");
      return;
    }

    try {
      setIsLoading(true);

      // If user selected a new file, upload it. Otherwise keep existing media.
      let mediaUrl = form.existingMediaUrl || null;
      let mediaType = form.existingMediaType || null;

      if (hasNewFile) {
        const { url, type } = await uploadSingleMedia(form.postersFiles[0]);
        mediaUrl = url;
        mediaType = type;
      }

      const userName = await fetchEmployeeUsername(uid);

      if (editingData) {
        const refPath = `community/${form.id}`;
        const itemRef = dbRef(database, refPath);

        const snap = await get(itemRef);
        if (!snap.exists()) {
          toast.error("Post does not exist anymore.");
          return;
        }

        // ✅ keep likes/comments from DB (do NOT wipe)
        const existing = snap.val() || {};

        await update(itemRef, {
          senderId: user?.uid || uid || null,
          sender: userName || user?.displayName || emp?.name || "Member",
          content: (form.content || "").trim(),
          photoURL: user?.photoURL || "",
          createdAt: existing.createdAt || Date.now(),
          likes: existing.likes || [],
          comments: existing.comments || [],
          mediaUrl: mediaUrl || null,
          mediaType: mediaType || null,
          groupId: groupId || null,
          id: form.id, // ✅ same as RN
          role: emp?.role || "member",
        });

        toast.success("Community updated successfully");
      } else {
        const postRef = push(dbRef(database, "community"));
        const id = postRef.key;

        await set(postRef, {
          senderId: user?.uid || uid || null,
          sender: userName || user?.displayName || emp?.name || "Member",
          content: (form.content || "").trim(),
          id, // ✅ same as RN
          photoURL: user?.photoURL || "",
          createdAt: Date.now(),
          likes: [],
          comments: [],
          mediaUrl: mediaUrl || null,
          mediaType: mediaType || null,
          groupId: groupId || null,
          role: emp?.role || "member",
        });

        toast.success("Community created successfully");
      }

      // reset
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save community");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;

    try {
      setIsLoading(true);
      await remove(dbRef(database, `community/${deleteData.id}`));
      toast.success("Successfully deleted!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete");
    } finally {
      setIsLoading(false);
      setConfirmDeleteOpen(false);
      setDelete(null);
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} post(s)?`)) return;

    try {
      setIsLoading(true);
      const updatesObj = {};
      selectedIds.forEach((id) => {
        updatesObj[`community/${id}`] = null;
      });
      await update(dbRef(database), updatesObj);
      toast.success("Selected posts deleted");
      setSelectedIds(new Set());
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete selected posts");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-2xl font-semibold">Community — {groupName}</h1>

        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black disabled:opacity-50"
          disabled={!groupId}
          onClick={openAdd}
        >
          + Add
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>

          <button
            onClick={deleteSelected}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Delete selected
          </button>

          <button
            onClick={() => setSelectedIds(new Set(filteredList.map((r) => r.id)))}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Select all ({filteredList.length})
          </button>

          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Content
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  By
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Media
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Actions
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600"></th>
              </tr>

              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search content"
                    defaultValue={filters.content}
                    onChange={(e) => setFilterDebounced("content", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3">
                  <input
                    type="checkbox"
                    aria-label="Select all on page"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = !allPageSelected && somePageSelected;
                    }}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) pageIds.forEach((id) => next.add(id));
                        else pageIds.forEach((id) => next.delete(id));
                        return next;
                      });
                    }}
                  />
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-4 text-center text-gray-500">
                    No community found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.content}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.role || "Member"}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.mediaType === "image" && item.mediaUrl ? (
                        <img
                          src={item.mediaUrl}
                          alt=""
                          width={80}
                          height={80}
                          className="rounded object-cover"
                        />
                      ) : item.mediaType === "video" && item.mediaUrl ? (
                        <video src={item.mediaUrl} width={220} height={80} controls />
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEditing(item);
                          setForm({
                            id: item.id,
                            content: item.content || "",
                            postersFiles: [],
                            mediaUrl: item.mediaUrl || null,
                            mediaType: item.mediaType || null,
                            existingMediaUrl: item.mediaUrl || null,
                            existingMediaType: item.mediaType || null,
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
                          setConfirmDeleteOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(item.id);
                            else next.delete(item.id);
                            return next;
                          });
                        }}
                      />
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

      {/* ===== modal ===== */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit Community" : "Add Community"}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <textarea
                name="content"
                placeholder="What's on your mind?"
                value={form.content}
                onChange={handleChange}
                className="w-full border border-gray-300 p-2 rounded"
              />

              <label className="block font-medium">Media (image/video)</label>
              <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    name="postersFiles"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={handleChange}
                  />
                  📁 Choose File
                </label>
                <span className="text-sm text-gray-600 truncate max-w-[260px]">
                  {fileName}
                </span>
              </div>

              {/* existing/new preview */}
              {(form.existingMediaUrl || form.mediaUrl) && (
                <div className="mt-2">
                  {((form.mediaType || form.existingMediaType) === "image") ? (
                    <div className="relative inline-block">
                      <img
                        src={form.mediaUrl || form.existingMediaUrl}
                        alt=""
                        className="w-40 h-40 object-cover rounded border"
                      />
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 text-sm"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            postersFiles: [],
                            mediaUrl: null,
                            mediaType: null,
                            existingMediaUrl: null,
                            existingMediaType: null,
                          }));
                          setFileName("No file chosen");
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="relative inline-block">
                      <video
                        src={form.mediaUrl || form.existingMediaUrl}
                        className="w-[360px] h-[200px] rounded border"
                        controls
                      />
                      <button
                        type="button"
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-7 h-7 text-sm"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            postersFiles: [],
                            mediaUrl: null,
                            mediaType: null,
                            existingMediaUrl: null,
                            existingMediaType: null,
                          }));
                          setFileName("No file chosen");
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setEditing(null);
                    setForm(initialForm);
                    setFileName("No file chosen");
                  }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>

                <button
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  disabled={isLoading}
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===== delete confirm ===== */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Post</h2>
            <p className="mb-4">Are you sure you want to delete this post?</p>

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
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                disabled={isLoading}
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
}
