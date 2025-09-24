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
  Timestamp,
  orderBy
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { useSelector } from "react-redux";
import EditorPro from "../../components/EditorPro";

// ---- helpers ----
const stripHtml = (html = "") => {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
};

export default function FaqPage(props) {
  const { navbarHeight } = props;

  const uid = useSelector((state) => state.auth?.user?.uid);
  const user = useSelector((state) => state.auth?.user);
  const emp = useSelector((state) => state.auth?.employee);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const initialForm = useMemo(
    () => ({
      id: "",
      title: "",
      question: "",
      answer: "",
    }),
    []
  );
  const [form, setForm] = useState(initialForm);

  // pagination
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = useMemo(
    () => list.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [list, currentPage, pageSize]
  );

  useEffect(() => {
    getList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getList = async () => {
    if (!emp?.hostelid) {
      setList([]);
      return;
    }
    setIsLoading(true);
    try {
      // orderBy is optional; using createdAt desc if present, else by title asc
      const q = query(
        collection(db, "faqquestions"),
        where("hostelid", "==", emp.hostelid)
      );

      const snap = await getDocs(q);
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // sort: newest first if createdAt exists; fallback alpha by title
      docs.sort((a, b) => {
        const aTs = a.createdAt?.seconds || 0;
        const bTs = b.createdAt?.seconds || 0;
        if (aTs !== bTs) return bTs - aTs;
        return (a.title || "").localeCompare(b.title || "");
      });

      setList(docs);
      setCurrentPage(1); // reset to first page when list refreshes
    } catch (err) {
      console.error(err);
      toast.error("Failed to load FAQs");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target || {};
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.title.trim()) return toast.warn("Please add a title.");
    if (!form.question.trim()) return toast.warn("Please add a question.");
    if (!stripHtml(form.answer).trim())
      return toast.warn("Please add an answer.");

    try {
      const faqData = {
        title: form.title.trim(),
        question: form.question.trim(),
        answer: form.answer, // rich HTML from EditorPro
        hostelid: emp?.hostelid || "",
        uid: uid || "",
        updatedAt: Timestamp.now(),
        ...(editingData ? {} : { createdAt: Timestamp.now() }),
      };

      if (editingData?.id) {
        // update
        const ref = doc(db, "faqquestions", editingData.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          toast.warning("FAQ does not exist! Cannot update.");
        } else {
          await updateDoc(ref, faqData);
          toast.success("FAQ updated successfully");
        }
      } else {
        // create
        await addDoc(collection(db, "faqquestions"), faqData);
        toast.success("FAQ created successfully");
      }

      await getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Something went wrong saving the FAQ.");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, "faqquestions", deleteData.id));
      toast.success("Successfully deleted!");
      await getList();
    } catch (error) {
      console.error("Error deleting document: ", error);
      toast.error("Failed to delete.");
    } finally {
      setConfirmDeleteOpen(false);
      setDelete(null);
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">FAQ</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Title
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Question
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Answer (preview)
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="px-6 py-4 text-center text-gray-500"
                  >
                    No FAQs found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => {
                  const preview = stripHtml(item.answer || "").slice(0, 160);
                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {item.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {item.question}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="line-clamp-3">
                          {preview}
                          {preview.length >= 160 ? "…" : ""}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing(item);
                            setForm({
                              id: item.id,
                              title: item.title || "",
                              question: item.question || "",
                              answer: item.answer || "",
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
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
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

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingData ? "Edit FAQ" : "Add FAQ"}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <input
                  name="title"
                  placeholder="Title"
                  value={form.title}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
                <input
                  name="question"
                  placeholder="Question"
                  value={form.question}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
                <EditorPro
                  value={form.answer}
                  onChange={(html) =>
                    setForm((f) => ({ ...f, answer: html }))
                  }
                  placeholder="Answer"
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete FAQ
            </h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.title || deleteData?.question}</strong>?
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

      <ToastContainer />
    </main>
  );
}
