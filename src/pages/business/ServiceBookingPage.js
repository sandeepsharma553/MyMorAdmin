import React, { useEffect, useMemo, useState } from "react";
import {
  collectionGroup,
  onSnapshot,
  query,
  doc,
  updateDoc,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useSelector } from "react-redux";
import { db } from "../../firebase";
import { serviceCol } from "../../utils/firestorePaths";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const textareaCls =
  "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none resize-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

const statusOptions = [
  "all",
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
];

const paymentOptions = ["all", "pending", "paid", "failed", "refunded"];

function Badge({ value, type = "status" }) {
  const map = {
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    confirmed: "bg-blue-50 text-blue-700 border-blue-200",
    in_progress: "bg-purple-50 text-purple-700 border-purple-200",
    completed: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-gray-100 text-gray-700 border-gray-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    paid: "bg-green-50 text-green-700 border-green-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    refunded: "bg-orange-50 text-orange-700 border-orange-200",
  };

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
        map[value] || "bg-gray-50 text-gray-700 border-gray-200"
      }`}
    >
      {String(value || (type === "status" ? "pending" : "pending")).replaceAll("_", " ")}
    </span>
  );
}

function Label({ children }) {
  return <label className="mb-1 block text-sm font-semibold text-gray-900">{children}</label>;
}

export default function ServiceBookingPage({ navbarHeight }) {
  const uid = useSelector((state) => state.auth.user?.uid);
  const emp = useSelector((state) => state.auth.employee);
 
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [saving, setSaving] = useState(false);

  const [editForm, setEditForm] = useState({
    bookingStatus: "pending",
    paymentStatus: "pending",
    adminNote: "",
    internalNote: "",
    assignedStaffName: "",
  });

  useEffect(() => {
   

    const qy = query(
      collectionGroup(db, "servicebookings"),
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setRows(data);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setLoading(false);
      }
    );

    return () => unsub();
  }, []);

  const stats = useMemo(() => {
    return {
      total: rows.length,
      pending: rows.filter((x) => x.bookingStatus === "pending").length,
      confirmed: rows.filter((x) => x.bookingStatus === "confirmed").length,
      in_progress: rows.filter((x) => x.bookingStatus === "in_progress").length,
      completed: rows.filter((x) => x.bookingStatus === "completed").length,
      cancelled: rows.filter((x) =>
        ["cancelled", "rejected"].includes(x.bookingStatus)
      ).length,
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const t = searchText.trim().toLowerCase();

    return rows.filter((r) => {
      const matchesSearch =
        !t ||
        [
          r.serviceTitle,
          r.customerName,
          r.customerPhone,
          r.customerEmail,
          r.businessName,
          r.category,
          r.bookingDate,
          r.bookingTime,
          r.address,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(t);

      const matchesStatus =
        statusFilter === "all" ? true : r.bookingStatus === statusFilter;

      const matchesPayment =
        paymentFilter === "all" ? true : r.paymentStatus === paymentFilter;

      return matchesSearch && matchesStatus && matchesPayment;
    });
  }, [rows, searchText, statusFilter, paymentFilter]);

  const openDetails = (item) => {
    setSelectedBooking(item);
    setEditForm({
      bookingStatus: item.bookingStatus || "pending",
      paymentStatus: item.paymentStatus || "pending",
      adminNote: item.adminNote || "",
      internalNote: item.internalNote || "",
      assignedStaffName: item.assignedStaffName || "",
    });
  };

  const quickUpdateStatus = async (booking, bookingStatus) => {
    const { id, serviceId } = booking;
    try {
      await updateDoc(doc(serviceCol(serviceId, "servicebookings"), id), {
        bookingStatus,
        updatedAt: serverTimestamp(),
      });
      toast.success(`Booking ${bookingStatus.replaceAll("_", " ")} ✅`);

      if (selectedBooking?.id === id) {
        setSelectedBooking((prev) =>
          prev ? { ...prev, bookingStatus } : prev
        );
        setEditForm((prev) => ({ ...prev, bookingStatus }));
      }
    } catch (e) {
      console.error(e);
      toast.error("Status update failed");
    }
  };

  const saveDetails = async () => {
    if (!selectedBooking?.id) return;
    setSaving(true);

    try {
      await updateDoc(doc(serviceCol(selectedBooking.serviceId, "servicebookings"), selectedBooking.id), {
        bookingStatus: editForm.bookingStatus,
        paymentStatus: editForm.paymentStatus,
        adminNote: editForm.adminNote.trim(),
        internalNote: editForm.internalNote.trim(),
        assignedStaffName: editForm.assignedStaffName.trim(),
        updatedAt: serverTimestamp(),
      });

      toast.success("Booking updated ✅");

      setSelectedBooking((prev) =>
        prev
          ? {
              ...prev,
              bookingStatus: editForm.bookingStatus,
              paymentStatus: editForm.paymentStatus,
              adminNote: editForm.adminNote.trim(),
              internalNote: editForm.internalNote.trim(),
              assignedStaffName: editForm.assignedStaffName.trim(),
            }
          : prev
      );
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className="flex-1 overflow-auto bg-gray-100 p-6"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Service Bookings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage incoming service bookings, status, payment, and customer details
          </p>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Total</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{stats.total}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Pending</div>
          <div className="mt-2 text-2xl font-bold text-yellow-600">{stats.pending}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Confirmed</div>
          <div className="mt-2 text-2xl font-bold text-blue-600">{stats.confirmed}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">In Progress</div>
          <div className="mt-2 text-2xl font-bold text-purple-600">{stats.in_progress}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Completed</div>
          <div className="mt-2 text-2xl font-bold text-green-600">{stats.completed}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500">Cancelled/Rejected</div>
          <div className="mt-2 text-2xl font-bold text-red-600">{stats.cancelled}</div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <input
          className={inputCls}
          placeholder="Search by service, customer, phone, date..."
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />

        <select
          className={inputCls}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {statusOptions.map((x) => (
            <option key={x} value={x}>
              {x.replaceAll("_", " ")}
            </option>
          ))}
        </select>

        <select
          className={inputCls}
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
        >
          {paymentOptions.map((x) => (
            <option key={x} value={x}>
              {x.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="flex h-56 items-center justify-center">
            <FadeLoader color="#111827" loading />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="p-3 font-semibold">Customer</th>
                <th className="p-3 font-semibold">Service</th>
                <th className="p-3 font-semibold">Schedule</th>
                <th className="p-3 font-semibold">Amount</th>
                <th className="p-3 font-semibold">Payment</th>
                <th className="p-3 font-semibold">Booking</th>
                <th className="p-3 font-semibold">Quick Actions</th>
                <th className="p-3 font-semibold">Details</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-gray-100">
                  <td className="p-3 align-top">
                    <div className="font-semibold text-gray-900">
                      {item.customerName || "—"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.customerPhone || "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.customerEmail || "—"}
                    </div>
                  </td>

                  <td className="p-3 align-top">
                    <div className="font-semibold text-gray-900">
                      {item.serviceTitle || "—"}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {item.businessName || "—"}
                    </div>
                    <div className="text-xs text-gray-500">{item.category || "—"}</div>
                  </td>

                  <td className="p-3 align-top text-gray-700">
                    <div>{item.bookingDate || "—"}</div>
                    <div className="text-xs text-gray-500">{item.bookingTime || "—"}</div>
                  </td>

                  <td className="p-3 align-top font-semibold text-gray-900">
                    ₹{item.price ?? 0}
                  </td>

                  <td className="p-3 align-top">
                    <Badge value={item.paymentStatus || "pending"} type="payment" />
                  </td>

                  <td className="p-3 align-top">
                    <Badge value={item.bookingStatus || "pending"} />
                  </td>

                  <td className="p-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => quickUpdateStatus(item, "confirmed")}
                        className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => quickUpdateStatus(item, "in_progress")}
                        className="rounded-lg border border-purple-200 px-3 py-1.5 text-xs font-medium text-purple-700 hover:bg-purple-50"
                      >
                        Start
                      </button>
                      <button
                        onClick={() => quickUpdateStatus(item, "completed")}
                        className="rounded-lg border border-green-200 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() => quickUpdateStatus(item, "rejected")}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        Reject
                      </button>
                    </div>
                  </td>

                  <td className="p-3 align-top">
                    <button
                      onClick={() => openDetails(item)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                    >
                      Open
                    </button>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-gray-500">
                    No bookings found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedBooking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Booking Details</h2>
                <p className="mt-1 text-xs text-gray-500">
                  {selectedBooking.serviceTitle || "Service"} • {selectedBooking.customerName || "Customer"}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={saveDetails}
                  disabled={saving}
                  className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => setSelectedBooking(null)}
                  className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="max-h-[82vh] overflow-auto bg-gray-50 p-5">
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-base font-semibold text-gray-900">
                      Customer Info
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label>Customer Name</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.customerName || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.customerPhone || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Email</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.customerEmail || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Address</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.address || "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-base font-semibold text-gray-900">
                      Service Info
                    </h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <Label>Service</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.serviceTitle || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Business</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.businessName || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Category</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.category || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Price</Label>
                        <div className="text-sm font-semibold text-gray-900">
                          ₹{selectedBooking.price ?? 0}
                        </div>
                      </div>
                      <div>
                        <Label>Booking Date</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.bookingDate || "—"}
                        </div>
                      </div>
                      <div>
                        <Label>Booking Time</Label>
                        <div className="text-sm text-gray-700">
                          {selectedBooking.bookingTime || "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-base font-semibold text-gray-900">Customer Notes</h3>
                    <div className="text-sm text-gray-700">
                      {selectedBooking.notes || "No customer note"}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-base font-semibold text-gray-900">
                      Booking Controls
                    </h3>

                    <div className="space-y-4">
                      <div>
                        <Label>Booking Status</Label>
                        <select
                          className={inputCls}
                          value={editForm.bookingStatus}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, bookingStatus: e.target.value }))
                          }
                        >
                          {statusOptions
                            .filter((x) => x !== "all")
                            .map((x) => (
                              <option key={x} value={x}>
                                {x.replaceAll("_", " ")}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <Label>Payment Status</Label>
                        <select
                          className={inputCls}
                          value={editForm.paymentStatus}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, paymentStatus: e.target.value }))
                          }
                        >
                          {paymentOptions
                            .filter((x) => x !== "all")
                            .map((x) => (
                              <option key={x} value={x}>
                                {x.replaceAll("_", " ")}
                              </option>
                            ))}
                        </select>
                      </div>

                      <div>
                        <Label>Assigned Staff</Label>
                        <input
                          className={inputCls}
                          value={editForm.assignedStaffName}
                          onChange={(e) =>
                            setEditForm((p) => ({
                              ...p,
                              assignedStaffName: e.target.value,
                            }))
                          }
                          placeholder="Technician / Beautician / Trainer"
                        />
                      </div>

                      <div>
                        <Label>Admin Note (customer visible if needed)</Label>
                        <textarea
                          className={`${textareaCls} h-24`}
                          value={editForm.adminNote}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, adminNote: e.target.value }))
                          }
                          placeholder="Confirmed for 2 PM / bring documents / technician assigned..."
                        />
                      </div>

                      <div>
                        <Label>Internal Note</Label>
                        <textarea
                          className={`${textareaCls} h-24`}
                          value={editForm.internalNote}
                          onChange={(e) =>
                            setEditForm((p) => ({ ...p, internalNote: e.target.value }))
                          }
                          placeholder="Internal team note"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <h3 className="mb-4 text-base font-semibold text-gray-900">
                      Quick Workflow
                    </h3>

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          setEditForm((p) => ({ ...p, bookingStatus: "confirmed" }))
                        }
                        className="rounded-lg border border-blue-200 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50"
                      >
                        Mark Confirmed
                      </button>
                      <button
                        onClick={() =>
                          setEditForm((p) => ({ ...p, bookingStatus: "in_progress" }))
                        }
                        className="rounded-lg border border-purple-200 px-3 py-2 text-sm text-purple-700 hover:bg-purple-50"
                      >
                        Mark In Progress
                      </button>
                      <button
                        onClick={() =>
                          setEditForm((p) => ({ ...p, bookingStatus: "completed" }))
                        }
                        className="rounded-lg border border-green-200 px-3 py-2 text-sm text-green-700 hover:bg-green-50"
                      >
                        Mark Completed
                      </button>
                      <button
                        onClick={() =>
                          setEditForm((p) => ({ ...p, bookingStatus: "cancelled" }))
                        }
                        className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Mark Cancelled
                      </button>
                      <button
                        onClick={() =>
                          setEditForm((p) => ({ ...p, bookingStatus: "rejected" }))
                        }
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50"
                      >
                        Mark Rejected
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ToastContainer />
    </main>
  );
}