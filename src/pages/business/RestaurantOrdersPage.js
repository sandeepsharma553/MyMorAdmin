import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
  getDoc,
} from "firebase/firestore";
import { useSelector } from "react-redux";
import { db } from "../../firebase";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
} from "../../components/RestaurantShared";
import { toast, ToastContainer } from "react-toastify";

function StatusPill({ value }) {
  const map = {
    draft: "bg-gray-100 text-gray-700",
    placed: "bg-blue-100 text-blue-700",
    accepted: "bg-indigo-100 text-indigo-700",
    preparing: "bg-yellow-100 text-yellow-700",
    ready: "bg-green-100 text-green-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${
        map[value] || "bg-gray-100 text-gray-700"
      }`}
    >
      {value || "—"}
    </span>
  );
}

function formatCurrency(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "—";
  return `₹${num.toFixed(2).replace(/\.00$/, "")}`;
}

function normalizeOrder(row) {
  const customerName =
    row?.customer?.name ||
    row?.customerName ||
    row?.guestName ||
    "—";

  const orderType =
    row?.orderType ||
    row?.type ||
    row?.mode ||
    "—";

  const itemsCount = Array.isArray(row?.items)
    ? row.items.reduce((sum, item) => sum + Number(item?.quantity || 1), 0)
    : Number(row?.itemsCount || 0);

  const total =
    row?.pricing?.total ??
    row?.total ??
    row?.grandTotal ??
    null;

  return {
    ...row,
    _customerName: customerName,
    _orderType: orderType,
    _itemsCount: itemsCount,
    _total: total,
  };
}

export default function RestaurantOrdersPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const restaurantId = emp?.restaurantid || null;

  const [restaurant, setRestaurant] = useState(null);
  const [orders, setOrders] = useState([]);
  const [filters, setFilters] = useState({
    status: "",
    type: "",
    paymentStatus: "",
  });
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!restaurantId) {
      setRestaurant(null);
      setOrders([]);
      return;
    }

    setLoading(true);
    try {
      const restaurantRef = doc(db, "restaurants", restaurantId);
      const restaurantSnap = await getDoc(restaurantRef);

      if (!restaurantSnap.exists()) {
        setRestaurant(null);
        setOrders([]);
        toast.error("Restaurant not found");
        return;
      }

      setRestaurant({
        id: restaurantSnap.id,
        ...restaurantSnap.data(),
      });

      let snap;

      try {
        const q = query(
          collection(db, "orders"),
          where("restaurantId", "==", restaurantId),
          orderBy("createdAt", "desc")
        );
        snap = await getDocs(q);
      } catch (error) {
        console.error("Primary restaurantId query failed, trying restaurantid fallback:", error);

        const fallbackQ = query(
          collection(db, "orders"),
          where("restaurantid", "==", restaurantId),
          orderBy("createdAt", "desc")
        );
        snap = await getDocs(fallbackQ);
      }

      const mapped = snap.docs.map((d) => normalizeOrder({ id: d.id, ...d.data() }));
      setOrders(mapped);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredOrders = useMemo(() => {
    return orders.filter((row) => {
      const okStatus = !filters.status || row.status === filters.status;
      const okType = !filters.type || row._orderType === filters.type;
      const okPayment =
        !filters.paymentStatus || row.paymentStatus === filters.paymentStatus;

      return okStatus && okType && okPayment;
    });
  }, [orders, filters]);

  const quickUpdateStatus = async (orderId, status) => {
    try {
      await updateDoc(doc(db, "orders", orderId), {
        status,
        updatedAt: Timestamp.now(),
      });
      toast.success(`Order marked ${status}`);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to update order");
    }
  };

  if (!restaurantId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-semibold mb-2">Live Orders Management</h1>
          <p className="text-sm text-red-600">Employee restaurant id not found.</p>
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Live Orders Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant
              ? `${restaurant.brandName || ""} / ${restaurant.branchName || ""}`
              : "Restaurant Orders"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            className="border p-2 rounded"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            className="border p-2 rounded"
            value={filters.type}
            onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value }))}
          >
            <option value="">All types</option>
            <option value="delivery">delivery</option>
            <option value="pickup">pickup</option>
            <option value="dineIn">dineIn</option>
            <option value="dinein">dinein</option>
          </select>

          <select
            className="border p-2 rounded"
            value={filters.paymentStatus}
            onChange={(e) =>
              setFilters((p) => ({ ...p, paymentStatus: e.target.value }))
            }
          >
            <option value="">All payment statuses</option>
            {PAYMENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Order ID",
                  "Customer",
                  "Type",
                  "Items",
                  "Total",
                  "Status",
                  "Payment",
                  "Created",
                  "Actions",
                ].map((x) => (
                  <th
                    key={x}
                    className="px-4 py-3 text-left text-sm font-medium text-gray-600"
                  >
                    {x}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredOrders.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm">{row.id}</td>
                  <td className="px-4 py-3 text-sm">{row._customerName}</td>
                  <td className="px-4 py-3 text-sm">{row._orderType}</td>
                  <td className="px-4 py-3 text-sm">{row._itemsCount}</td>
                  <td className="px-4 py-3 text-sm">{formatCurrency(row._total)}</td>
                  <td className="px-4 py-3 text-sm">
                    <StatusPill value={row.status} />
                  </td>
                  <td className="px-4 py-3 text-sm">{row.paymentStatus || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {row.createdAt?.toDate
                      ? row.createdAt.toDate().toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => quickUpdateStatus(row.id, "accepted")}
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => quickUpdateStatus(row.id, "preparing")}
                      >
                        Preparing
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => quickUpdateStatus(row.id, "ready")}
                      >
                        Ready
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => quickUpdateStatus(row.id, "completed")}
                      >
                        Complete
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs text-red-600"
                        onClick={() => quickUpdateStatus(row.id, "cancelled")}
                      >
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    No orders found.
                  </td>
                </tr>
              )}

              {loading && (
                <tr>
                  <td colSpan="9" className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ToastContainer />
    </main>
  );
}