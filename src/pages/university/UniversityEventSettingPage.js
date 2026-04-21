// src/pages/UniversityEventSettingPage.jsx
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

const UniversityEventSettingPage = ({ navbarHeight }) => {
  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);
  const universityId = String(
    emp?.universityid || emp?.universityId || ""
  );

  const [isLoading, setIsLoading] = useState(false);

  // ---------------- Event Categories ----------------
  const [eventCategoryModalOpen, setEventCategoryModalOpen] = useState(false);
  const [eventCategoryDeleteModalOpen, setEventCategoryDeleteModalOpen] =
    useState(false);
  const [eventCategoryList, setEventCategoryList] = useState([]);
  const [eventCategoryEditingData, setEventCategoryEditingData] = useState(null);
  const [eventCategoryDeleteData, setEventCategoryDeleteData] = useState(null);
  const [eventCategoryForm, setEventCategoryForm] = useState({
    id: "",
    name: "",
  });

  const [eventCategoryPage, setEventCategoryPage] = useState(1);
  const [eventCategoryPageSize, setEventCategoryPageSize] = useState(5);

  // ---------------- Payment Types ----------------
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentDeleteModelOpen, setPaymentDeleteModelOpen] = useState(false);
  const [paymentList, setPaymentList] = useState([]);
  const [paymentEditingData, setPaymentEditing] = useState(null);
  const [paymentDeleteData, setPaymentDelete] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ id: "", name: "" });

  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentPageSize, setPaymentPageSize] = useState(5);

  useEffect(() => {
    getEventCategoryList();
    getPaymentList();
  }, [universityId]);

  useEffect(() => {
    setEventCategoryPage(1);
  }, [eventCategoryList.length]);

  useEffect(() => {
    setPaymentPage(1);
  }, [paymentList.length]);

  const eventCategorySlice = useMemo(() => {
    const start = (eventCategoryPage - 1) * eventCategoryPageSize;
    return eventCategoryList.slice(start, start + eventCategoryPageSize);
  }, [eventCategoryList, eventCategoryPage, eventCategoryPageSize]);

  const paymentSlice = useMemo(() => {
    const start = (paymentPage - 1) * paymentPageSize;
    return paymentList.slice(start, start + paymentPageSize);
  }, [paymentList, paymentPage, paymentPageSize]);

  const getEventCategoryList = async () => {
    if (!universityId) {
      setEventCategoryList([]);
      return;
    }

    setIsLoading(true);
    try {
      const q = query(
        collection(db, "university", universityId, "eventcategory"),
        orderBy("name", "asc")
      );

      const snap = await getDocs(q);

      const documents = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setEventCategoryList(documents);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load event categories");
    } finally {
      setIsLoading(false);
    }
  };

  const getPaymentList = async () => {
    if (!universityId) {
      setPaymentList([]);
      return;
    }

    setIsLoading(true);
    try {
      const q = query(
        collection(db, "university", universityId, "eventpaymenttype"),
        orderBy("name", "asc")
      );

      const snap = await getDocs(q);

      const documents = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setPaymentList(documents);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load payment types");
    } finally {
      setIsLoading(false);
    }
  };

  // ---------------- Event Category CRUD ----------------
  const handleEventCategoryChange = (e) => {
    const { name, value } = e.target;
    setEventCategoryForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleEventCategorySubmit = async (e) => {
    e.preventDefault();

    try {
      const trimmedName = eventCategoryForm.name?.trim();
      if (!trimmedName) return;

      const duplicate = eventCategoryList.some(
        (item) =>
          item.name?.trim().toLowerCase() === trimmedName.toLowerCase() &&
          item.id !== eventCategoryForm.id
      );

      if (duplicate) {
        toast.warn("Duplicate found! Not adding.");
        return;
      }

      if (eventCategoryEditingData) {
        const docRef = doc(
          db,
          "university",
          universityId,
          "eventcategory",
          eventCategoryForm.id
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

        toast.success("Event category updated successfully");
      } else {
        await addDoc(
          collection(db, "university", universityId, "eventcategory"),
          {
            uid: uid || "",
            name: trimmedName,
            universityid: universityId,
            createdBy: uid || "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }
        );

        toast.success("Event category saved successfully");
      }

      await getEventCategoryList();
    } catch (error) {
      console.error("Error saving event category:", error);
      toast.error("Save failed");
    }

    setEventCategoryModalOpen(false);
    setEventCategoryEditingData(null);
    setEventCategoryForm({ id: "", name: "" });
  };

  const handleEventCategoryDelete = async () => {
    if (!eventCategoryDeleteData?.id) return;

    try {
      await deleteDoc(
        doc(
          db,
          "university",
          universityId,
          "eventcategory",
          eventCategoryDeleteData.id
        )
      );
      toast.success("Event category deleted successfully!");
      await getEventCategoryList();
    } catch (error) {
      console.error("Error deleting event category: ", error);
      toast.error("Delete failed");
    }

    setEventCategoryDeleteModalOpen(false);
    setEventCategoryDeleteData(null);
  };

  // ---------------- Payment CRUD ----------------
  const handlePaymentChange = (e) => {
    const { name, value } = e.target;
    setPaymentForm((prev) => ({ ...prev, [name]: value }));
  };

  const handlePaymentSubmit = async (e) => {
    e.preventDefault();

    try {
      const trimmedName = paymentForm.name?.trim();
      if (!trimmedName) return;

      const duplicate = paymentList.some(
        (item) =>
          item.name?.trim().toLowerCase() === trimmedName.toLowerCase() &&
          item.id !== paymentForm.id
      );

      if (duplicate) {
        toast.warn("Duplicate found! Not adding.");
        return;
      }

      if (paymentEditingData) {
        const docRef = doc(
          db,
          "university",
          universityId,
          "eventpaymenttype",
          paymentForm.id
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

        toast.success("Payment type updated successfully");
      } else {
        await addDoc(
          collection(db, "university", universityId, "eventpaymenttype"),
          {
            uid: uid || "",
            name: trimmedName,
            universityid: universityId,
            createdBy: uid || "",
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          }
        );

        toast.success("Payment type saved successfully");
      }

      await getPaymentList();
    } catch (error) {
      console.error("Error saving payment type:", error);
      toast.error("Save failed");
    }

    setPaymentModalOpen(false);
    setPaymentEditing(null);
    setPaymentForm({ id: "", name: "" });
  };

  const handlePaymentDelete = async () => {
    if (!paymentDeleteData?.id) return;

    try {
      await deleteDoc(
        doc(
          db,
          "university",
          universityId,
          "eventpaymenttype",
          paymentDeleteData.id
        )
      );
      toast.success("Payment type deleted successfully!");
      await getPaymentList();
    } catch (error) {
      console.error("Error deleting payment type: ", error);
      toast.error("Delete failed");
    }

    setPaymentDeleteModelOpen(false);
    setPaymentDelete(null);
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
      <h1 className="text-2xl font-semibold mb-6">University Event Setting</h1>

      {/* ---------------- Event Categories ---------------- */}
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Event Categories</h2>

        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setEventCategoryEditingData(null);
            setEventCategoryForm({ id: "", name: "" });
            setEventCategoryModalOpen(true);
          }}
        >
          + Add Event Category
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow mb-8">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Event Category
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {eventCategorySlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setEventCategoryEditingData(item);
                          setEventCategoryForm(item);
                          setEventCategoryModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setEventCategoryDeleteData(item);
                          setEventCategoryDeleteModalOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {eventCategorySlice.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-10 text-center text-sm text-gray-500"
                      colSpan={2}
                    >
                      No event categories
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pager
              page={eventCategoryPage}
              setPage={setEventCategoryPage}
              pageSize={eventCategoryPageSize}
              setPageSize={setEventCategoryPageSize}
              total={eventCategoryList.length}
            />
          </>
        )}
      </div>

      {/* ---------------- Payment Types ---------------- */}
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h2 className="text-xl font-semibold">Payment Types</h2>

        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black"
          onClick={() => {
            setPaymentEditing(null);
            setPaymentForm({ id: "", name: "" });
            setPaymentModalOpen(true);
          }}
        >
          + Add Payment Type
        </button>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Payment Type
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {paymentSlice.map((item, i) => (
                  <tr key={item.id ?? i}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {item.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        className="text-blue-600 hover:underline mr-3"
                        onClick={() => {
                          setPaymentEditing(item);
                          setPaymentForm(item);
                          setPaymentModalOpen(true);
                        }}
                      >
                        Edit
                      </button>

                      <button
                        className="text-red-600 hover:underline"
                        onClick={() => {
                          setPaymentDelete(item);
                          setPaymentDeleteModelOpen(true);
                        }}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}

                {paymentSlice.length === 0 && (
                  <tr>
                    <td
                      className="px-6 py-10 text-center text-sm text-gray-500"
                      colSpan={2}
                    >
                      No payment types
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pager
              page={paymentPage}
              setPage={setPaymentPage}
              pageSize={paymentPageSize}
              setPageSize={setPaymentPageSize}
              total={paymentList.length}
            />
          </>
        )}
      </div>

      {/* Event Category Modal */}
      {eventCategoryModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {eventCategoryEditingData ? "Edit Event Category" : "Add Event Category"}
            </h2>

            <form onSubmit={handleEventCategorySubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Event Category"
                value={eventCategoryForm.name}
                onChange={handleEventCategoryChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setEventCategoryModalOpen(false);
                    setEventCategoryEditingData(null);
                    setEventCategoryForm({ id: "", name: "" });
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

      {/* Event Category Delete Modal */}
      {eventCategoryDeleteModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Event Category
            </h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{eventCategoryDeleteData?.name}</strong>?
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setEventCategoryDeleteModalOpen(false);
                  setEventCategoryDeleteData(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>

              <button
                onClick={handleEventCategoryDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {paymentModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
            <h2 className="text-xl font-bold mb-4">
              {paymentEditingData ? "Edit Payment Type" : "Add Payment Type"}
            </h2>

            <form onSubmit={handlePaymentSubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Payment Type"
                value={paymentForm.name}
                onChange={handlePaymentChange}
                className="w-full border border-gray-300 p-2 rounded"
                required
              />

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentModalOpen(false);
                    setPaymentEditing(null);
                    setPaymentForm({ id: "", name: "" });
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

      {/* Payment Delete Modal */}
      {paymentDeleteModelOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">
              Delete Payment Type
            </h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{paymentDeleteData?.name}</strong>?
            </p>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setPaymentDeleteModelOpen(false);
                  setPaymentDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>

              <button
                onClick={handlePaymentDelete}
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

export default UniversityEventSettingPage;