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
  PAYMENT_STATUSES,
} from "../../components/RestaurantShared";
import { toast, ToastContainer } from "react-toastify";

function StatusPill({ value, className = "" }) {
  const map = {
    draft: "bg-gray-100 text-gray-700 border-gray-200",
    placed: "bg-blue-100 text-blue-700 border-blue-200",
    accepted: "bg-sky-100 text-sky-700 border-sky-200",
    preparing: "bg-amber-100 text-amber-700 border-amber-200",
    ready: "bg-green-100 text-green-700 border-green-200",
    completed: "bg-purple-100 text-purple-700 border-purple-200",
    cancelled: "bg-red-100 text-red-700 border-red-200",
    rejected: "bg-rose-100 text-rose-700 border-rose-200",
    partial: "bg-orange-100 text-orange-700 border-orange-200",
    pending: "bg-orange-100 text-orange-700 border-orange-200",
    paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
    partially_paid: "bg-amber-100 text-amber-700 border-amber-200",
    failed: "bg-red-100 text-red-700 border-red-200",
    refunded: "bg-purple-100 text-purple-700 border-purple-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${
        map[value] || "bg-gray-100 text-gray-700 border-gray-200"
      } ${className}`}
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

function formatDate(value) {
  try {
    if (value?.toDate) return value.toDate().toLocaleString();
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString();
    }
    return "—";
  } catch {
    return "—";
  }
}

function getInitials(name) {
  const str = String(name || "").trim();
  if (!str) return "NA";
  return str
    .split(" ")
    .slice(0, 2)
    .map((x) => x[0]?.toUpperCase())
    .join("");
}

function getItemState(item) {
  return String(
    item?.itemStatus ||
      item?.status ||
      item?.fulfilmentStatus ||
      ""
  ).toLowerCase();
}

function getItemReason(item) {
  return (
    item?.rejectionReason ||
    item?.cancelReason ||
    item?.cancellationReason ||
    item?.reason ||
    ""
  );
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((item, idx) => ({
    id: item?.id || item?.itemId || `item-${idx}`,
    itemId: item?.itemId || item?.id || "",
    name: item?.name || item?.title || "Unnamed item",
    quantity: Number(item?.quantity || 1),
    price:
      item?.price ??
      item?.basePrice ??
      item?.unitPrice ??
      item?.finalPrice ??
      0,
    total:
      item?.total ??
      item?.totalPrice ??
      Number(item?.quantity || 1) *
        Number(
          item?.price ??
            item?.basePrice ??
            item?.unitPrice ??
            item?.finalPrice ??
            0
        ),
    modifiers:
      item?.modifiers ||
      item?.selectedModifiers ||
      item?.addons ||
      item?.options ||
      [],
    note: item?.note || item?.notes || "",
    image: item?.image || item?.photo || "",
    itemStatus:
      item?.itemStatus ||
      item?.status ||
      item?.fulfilmentStatus ||
      "",
    rejectionReason:
      item?.rejectionReason ||
      item?.cancelReason ||
      item?.cancellationReason ||
      item?.reason ||
      "",
    rejectedAt: item?.rejectedAt || null,
  }));
}

function deriveDisplayStatus(row, normalizedItems) {
  const orderStatus = String(row?.status || "").toLowerCase();
  const items = Array.isArray(normalizedItems) ? normalizedItems : [];

  if (!items.length) return orderStatus || "placed";

  const activeItems = items.filter((item) => {
    const s = getItemState(item);
    return !["rejected", "cancelled"].includes(s);
  });

  const rejectedItems = items.filter((item) => {
    const s = getItemState(item);
    return ["rejected", "cancelled"].includes(s);
  });

  if (activeItems.length === 0 && rejectedItems.length > 0) {
    if (rejectedItems.some((i) => getItemState(i) === "cancelled")) {
      return "cancelled";
    }
    return "rejected";
  }

  return orderStatus || "placed";
}

function normalizeOrder(row) {
  const customerName =
    row?.customer?.name || row?.customerName || row?.guestName || "—";

  const customerPhone =
    row?.customer?.phone || row?.phone || row?.customerPhone || "—";

  const customerEmail =
    row?.customer?.email || row?.email || row?.customerEmail || "—";

  const orderType = row?.orderType || row?.type || row?.mode || "—";
  const normalizedItems = normalizeItems(row?.items);

  const itemsCount = normalizedItems.length
    ? normalizedItems.reduce((sum, item) => sum + Number(item?.quantity || 1), 0)
    : Number(row?.itemsCount || 0);

  const subtotal =
    row?.pricing?.subtotal ??
    row?.subtotal ??
    normalizedItems.reduce((sum, item) => sum + Number(item?.total || 0), 0);

  const taxes = row?.pricing?.tax ?? row?.tax ?? row?.taxes ?? 0;
  const deliveryFee =
    row?.pricing?.deliveryFee ?? row?.deliveryFee ?? row?.fees?.delivery ?? 0;
  const serviceFee =
    row?.pricing?.serviceFee ?? row?.serviceFee ?? row?.fees?.service ?? 0;
  const discount =
    row?.pricing?.discount ?? row?.discount ?? row?.couponDiscount ?? 0;

  const total =
    row?.pricing?.total ??
    row?.total ??
    row?.grandTotal ??
    subtotal + taxes + deliveryFee + serviceFee - discount;

  const address =
    row?.deliveryAddress?.fullAddress ||
    row?.deliveryAddress?.addressLine1 ||
    row?.address?.fullAddress ||
    row?.address ||
    row?.location ||
    "—";

  const tableNumber =
    row?.tableNumber ||
    row?.tableNo ||
    row?.dineIn?.tableNumber ||
    row?.qrSession?.tableNumber ||
    "—";

  const notes =
    row?.note || row?.notes || row?.specialInstructions || row?.instructions || "";

  const paymentMethod =
    row?.paymentMethod || row?.payment?.method || row?.paymentType || "—";

  const createdAt = row?.createdAt || row?.created_at || null;
  const updatedAt = row?.updatedAt || row?.updated_at || null;

  const activeItems = normalizedItems.filter((item) => {
    const s = getItemState(item);
    return !["rejected", "cancelled"].includes(s);
  });

  const rejectedItems = normalizedItems.filter((item) => {
    const s = getItemState(item);
    return ["rejected", "cancelled"].includes(s);
  });

  const displayStatus = deriveDisplayStatus(row, normalizedItems);

  return {
    ...row,
    items: normalizedItems,
    status: row?.status || "placed",
    _displayStatus: displayStatus,
    _customerName: customerName,
    _customerPhone: customerPhone,
    _customerEmail: customerEmail,
    _orderType: orderType,
    _itemsCount: itemsCount,
    _subtotal: subtotal,
    _taxes: taxes,
    _deliveryFee: deliveryFee,
    _serviceFee: serviceFee,
    _discount: discount,
    _total: total,
    _address: address,
    _tableNumber: tableNumber,
    _notes: notes,
    _paymentMethod: paymentMethod,
    _createdAt: createdAt,
    _updatedAt: updatedAt,
    _activeItemsCount: activeItems.length,
    _rejectedItemsCount: rejectedItems.length,
    _hasPartialItemIssue:
      activeItems.length > 0 && rejectedItems.length > 0,
  };
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <span className="text-sm text-gray-500 min-w-[110px]">{label}</span>
      <span className="text-sm text-gray-900 text-right break-words">
        {value || "—"}
      </span>
    </div>
  );
}

function getMinutesAgo(value) {
  try {
    let date = null;

    if (value?.toDate) date = value.toDate();
    else if (value instanceof Date) date = value;
    else if (typeof value === "string" || typeof value === "number") {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) date = d;
    }

    if (!date) return "0'";
    const diffMs = Date.now() - date.getTime();
    const mins = Math.max(0, Math.floor(diffMs / 60000));
    return `${mins}'`;
  } catch {
    return "0'";
  }
}

function getBoardStatus(order) {
  const status = String(order?._displayStatus || order?.status || "").toLowerCase();

  if (status === "ready") return "ready";
  if (status === "completed") return "completed";
  if (["accepted", "placed", "preparing"].includes(status)) return "to_pick";
  return "all";
}

function BoardTabButton({ active, label, count, onClick, badgeClass = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-14 px-5 flex items-center gap-2 text-base font-semibold border-r border-gray-200 transition ${
        active ? "bg-white text-gray-900" : "bg-white text-gray-700 hover:bg-gray-50"
      }`}
    >
      <span>{label}</span>
      {typeof count === "number" ? (
        <span
          className={`min-w-[28px] h-8 px-2 rounded-lg text-sm flex items-center justify-center ${badgeClass}`}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function OutOfStockModal({ itemName, affectedOrders, onConfirm, onClose, loading }) {
  const [selected, setSelected] = useState(() =>
    affectedOrders
      .filter((o) => !["completed", "cancelled", "rejected"].includes(String(o._displayStatus || o.status || "").toLowerCase()))
      .map((o) => o.id)
  );
  const [action, setAction] = useState("reject");
  const [reason, setReason] = useState(`Item unavailable: "${itemName}"`);

  const toggle = (id) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleAll = () => {
    const activableIds = affectedOrders
      .filter((o) => !["completed", "cancelled", "rejected"].includes(String(o._displayStatus || o.status || "").toLowerCase()))
      .map((o) => o.id);
    setSelected((prev) =>
      prev.length === activableIds.length ? [] : activableIds
    );
  };

  const activableOrders = affectedOrders.filter(
    (o) => !["completed", "cancelled", "rejected"].includes(String(o._displayStatus || o.status || "").toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="px-6 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">⚠️</span>
                <h2 className="text-xl font-bold text-gray-900">Item Out of Stock</h2>
              </div>
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-800">"{itemName}"</span>{" "}
                — found in {affectedOrders.length} order{affectedOrders.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 shrink-0"
            >
              ✕ Close
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Apply item-level action
          </p>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="oos-action"
                value="cancel"
                checked={action === "cancel"}
                onChange={() => setAction("cancel")}
                className="accent-red-600"
              />
              <span className="text-sm font-medium text-gray-700">Cancel Item</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="oos-action"
                value="reject"
                checked={action === "reject"}
                onChange={() => setAction("reject")}
                className="accent-rose-600"
              />
              <span className="text-sm font-medium text-gray-700">Reject Item</span>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 bg-white">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Reason
          </label>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Item ran out of stock, cannot fulfil item"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-black/10 resize-none"
          />
          <p className="text-xs text-gray-400 mt-1">
            This reason will be saved only on this item.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-2">
          {activableOrders.length > 1 && (
            <div
              className="flex items-center gap-3 pb-3 mb-1 border-b border-gray-100 cursor-pointer"
              onClick={toggleAll}
            >
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
                  selected.length === activableOrders.length
                    ? "bg-black border-black"
                    : "border-gray-300"
                }`}
              >
                {selected.length === activableOrders.length && (
                  <span className="text-white text-xs leading-none">✓</span>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-700">
                Select all ({activableOrders.length})
              </span>
            </div>
          )}

          {affectedOrders.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">
              No active orders found.
            </p>
          )}

          {affectedOrders.map((order) => {
            const isDone = ["completed", "cancelled", "rejected"].includes(String(order._displayStatus || order.status || "").toLowerCase());
            const isChecked = selected.includes(order.id);
            const itemInOrder = order.items?.find(
              (i) => i.name?.toLowerCase() === itemName?.toLowerCase()
            );
            const itemState = getItemState(itemInOrder);

            return (
              <div
                key={order.id}
                onClick={() => !isDone && toggle(order.id)}
                className={`flex items-start gap-3 p-3 rounded-2xl border transition ${
                  isDone
                    ? "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                    : isChecked
                    ? "border-red-200 bg-red-50 cursor-pointer"
                    : "border-gray-200 hover:border-gray-300 cursor-pointer"
                }`}
              >
                <div
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition ${
                    isDone
                      ? "border-gray-200"
                      : isChecked
                      ? "bg-red-600 border-red-600"
                      : "border-gray-300"
                  }`}
                >
                  {isChecked && !isDone && (
                    <span className="text-white text-xs leading-none">✓</span>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-gray-900">
                      #{String(order.id).slice(-6)}
                    </span>
                    <StatusPill value={order._displayStatus || order.status} />
                    {order._hasPartialItemIssue ? <StatusPill value="partial" /> : null}
                    <span className="text-xs text-gray-400">
                      {getMinutesAgo(order._createdAt)} ago
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">
                    {order._customerName} · {order._orderType}
                  </p>
                  {itemInOrder && (
                    <div className="mt-1">
                      <p className="text-xs text-red-600 font-medium">
                        {itemInOrder.quantity}× {itemName}
                        {itemInOrder.price ? ` — ${formatCurrency(itemInOrder.price)} each` : ""}
                      </p>
                      {itemState ? (
                        <p className="text-[11px] text-gray-500 mt-0.5">
                          Item status: {itemState}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {formatCurrency(order._total)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 bg-white flex items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            {selected.length} order{selected.length !== 1 ? "s" : ""} selected
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50"
            >
              Later
            </button>
            <button
              type="button"
              disabled={selected.length === 0 || !reason.trim() || loading}
              onClick={() => onConfirm(selected, action, reason.trim())}
              className={`px-5 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50 ${
                action === "cancel"
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-rose-700 hover:bg-rose-800"
              }`}
            >
              {loading
                ? "Processing..."
                : action === "cancel"
                ? `Cancel Item in ${selected.length} Order${selected.length !== 1 ? "s" : ""}`
                : `Reject Item in ${selected.length} Order${selected.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderBoardCard({
  row,
  onView,
  onAccept,
  onPreparing,
  onReady,
  onComplete,
  onRecall,
  onItemOutOfStock,
  updatingOrderId,
}) {
  const itemPreview = row.items?.slice(0, 4) || [];
  const isUpdating = updatingOrderId === row.id;
  const boardStatus = getBoardStatus(row);

  const topPillText =
    boardStatus === "ready"
      ? "Ready"
      : boardStatus === "completed"
      ? "Completed"
      : "To pick";

  const topPillClass =
    boardStatus === "ready"
      ? "bg-green-100 text-green-700"
      : boardStatus === "completed"
      ? "bg-purple-100 text-purple-700"
      : "bg-sky-100 text-sky-700";

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-gray-900">
            {row._orderType?.toLowerCase() === "dinein" ||
            row._orderType?.toLowerCase() === "dine in"
              ? "IN"
              : row._orderType?.toLowerCase() === "pickup"
              ? "PK"
              : row._orderType?.toLowerCase() === "delivery"
              ? "DL"
              : "IN"}{" "}
            (# {String(row.id).slice(-4)})
          </span>

          <div className="w-6 h-6 rounded-full bg-black text-white text-[10px] font-semibold flex items-center justify-center shrink-0">
            {getInitials(row._customerName)}
          </div>

          <span className="text-sm font-semibold text-gray-900 truncate">
            {row._customerName}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onView(row)}
          className="text-xs text-gray-500 hover:text-black"
        >
          View
        </button>
      </div>

      <div className="px-4 py-3 bg-gray-50/70 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${topPillClass}`}
          >
            {topPillText}
          </span>
          {row._hasPartialItemIssue ? <StatusPill value="partial" /> : null}
        </div>

        <span className="inline-flex items-center gap-1 text-sm text-gray-600 font-medium">
          <span>◔</span>
          <span>{getMinutesAgo(row._createdAt)}</span>
        </span>
      </div>

      <div className="px-4 py-4 space-y-2 min-h-[150px]">
        {itemPreview.length ? (
          itemPreview.map((item, idx) => {
            const itemState = getItemState(item);
            const itemRejected = ["rejected", "cancelled"].includes(itemState);

            return (
              <div
                key={item.id || idx}
                className="flex items-center justify-between gap-2 group"
              >
                <div className="min-w-0">
                  <div className={`text-sm leading-6 truncate ${itemRejected ? "text-red-600 line-through" : "text-gray-800"}`}>
                    <span className="text-gray-500 mr-2">{item.quantity}x</span>
                    <span>{item.name}</span>
                  </div>
                  {itemRejected ? (
                    <div className="text-[11px] text-red-500">
                      {itemState}
                    </div>
                  ) : null}
                </div>

                {!itemRejected ? (
                  <button
                    type="button"
                    title={`"${item.name}" is out of stock`}
                    onClick={() => onItemOutOfStock(item.name)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded-lg bg-red-50 border border-red-200 text-[10px] font-semibold text-red-600 hover:bg-red-100 whitespace-nowrap"
                  >
                    Out of Stock
                  </button>
                ) : null}
              </div>
            );
          })
        ) : (
          <div className="text-sm text-gray-400">No items found</div>
        )}

        {row.items?.length > 4 ? (
          <div className="text-xs text-gray-500">
            +{row.items.length - 4} more items
          </div>
        ) : null}
      </div>

      <div className="px-4 pb-4 flex flex-wrap gap-2">
        {boardStatus !== "to_pick" ? null : (
          <>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onAccept(row.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              Accept
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onPreparing(row.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              Preparing
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onReady(row.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-green-600 text-white hover:opacity-90 disabled:opacity-60"
            >
              Ready
            </button>
          </>
        )}

        {boardStatus === "ready" ? (
          <>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onComplete(row.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 text-white hover:opacity-90 disabled:opacity-60"
            >
              Complete
            </button>
            <button
              type="button"
              disabled={isUpdating}
              onClick={() => onRecall(row.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-gray-200 hover:bg-gray-50 disabled:opacity-60"
            >
              Recall
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
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
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [updatingOrderId, setUpdatingOrderId] = useState("");
  const [activeBoardTab, setActiveBoardTab] = useState("all");

  const [oosItemName, setOosItemName] = useState(null);
  const [showOosModal, setShowOosModal] = useState(false);
  const [oosLoading, setOosLoading] = useState(false);

  const closeModal = () => {
    setShowModal(false);
    setSelectedOrder(null);
  };

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

      setRestaurant({ id: restaurantSnap.id, ...restaurantSnap.data() });

      let snap;
      try {
        const q = query(
          collection(db, "orders"),
          where("restaurantId", "==", restaurantId),
          orderBy("createdAt", "desc")
        );
        snap = await getDocs(q);
      } catch (error) {
        console.error("Primary query failed, trying fallback:", error);
        const fallbackQ = query(
          collection(db, "orders"),
          where("restaurantid", "==", restaurantId),
          orderBy("createdAt", "desc")
        );
        snap = await getDocs(fallbackQ);
      }

      const mapped = snap.docs.map((d) =>
        normalizeOrder({ id: d.id, ...d.data() })
      );
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

  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        if (showOosModal) setShowOosModal(false);
        else closeModal();
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [showOosModal]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();

    return orders.filter((row) => {
      const displayStatus = row._displayStatus || row.status;
      const okStatus = !filters.status || displayStatus === filters.status;
      const okType = !filters.type || row._orderType === filters.type;
      const okPayment =
        !filters.paymentStatus || row.paymentStatus === filters.paymentStatus;

      const searchBlob = [
        row.id,
        row._customerName,
        row._customerPhone,
        row._customerEmail,
        row._orderType,
        row.status,
        row._displayStatus,
        row.paymentStatus,
        row._paymentMethod,
        ...(Array.isArray(row.items) ? row.items.map((i) => i.name) : []),
      ]
        .join(" ")
        .toLowerCase();

      const okSearch = !q || searchBlob.includes(q);

      return okStatus && okType && okPayment && okSearch;
    });
  }, [orders, filters, search]);

  const dashboard = useMemo(() => {
    const totalOrders = filteredOrders.length;
    const liveOrders = filteredOrders.filter((x) =>
      ["placed", "accepted", "preparing", "ready"].includes(x._displayStatus)
    ).length;
    const completedOrders = filteredOrders.filter(
      (x) => x._displayStatus === "completed"
    ).length;
    const revenue = filteredOrders
      .filter((x) => x.paymentStatus === "paid" || x._displayStatus === "completed")
      .reduce((sum, x) => sum + Number(x._total || 0), 0);

    return { totalOrders, liveOrders, completedOrders, revenue };
  }, [filteredOrders]);

  const boardCounts = useMemo(() => {
    const toPick = filteredOrders.filter(
      (x) => getBoardStatus(x) === "to_pick"
    ).length;
    const ready = filteredOrders.filter(
      (x) => getBoardStatus(x) === "ready"
    ).length;
    const completed = filteredOrders.filter(
      (x) => getBoardStatus(x) === "completed"
    ).length;

    return { all: filteredOrders.length, to_pick: toPick, ready, completed };
  }, [filteredOrders]);

  const boardOrders = useMemo(() => {
    if (activeBoardTab === "all") return filteredOrders;
    return filteredOrders.filter(
      (row) => getBoardStatus(row) === activeBoardTab
    );
  }, [filteredOrders, activeBoardTab]);

  const oosAffectedOrders = useMemo(() => {
    if (!oosItemName) return [];
    const needle = oosItemName.toLowerCase();
    return orders.filter((order) =>
      order.items?.some((i) => i.name?.toLowerCase() === needle)
    );
  }, [orders, oosItemName]);

  const quickUpdateStatus = async (orderId, status) => {
    try {
      setUpdatingOrderId(orderId);
      await updateDoc(doc(db, "orders", orderId), {
        status,
        updatedAt: Timestamp.now(),
      });
      toast.success(`Order marked ${status}`);
      await loadData();

      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) =>
          prev ? normalizeOrder({ ...prev, status, _updatedAt: Timestamp.now() }) : prev
        );
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to update order");
    } finally {
      setUpdatingOrderId("");
    }
  };

  const handleItemOutOfStock = (itemName) => {
    setOosItemName(itemName);
    setShowOosModal(true);
  };

  const handleOosConfirm = async (selectedIds, action, reason) => {
    if (!selectedIds.length || !oosItemName) return;

    setOosLoading(true);
    const itemLevelStatus = action === "reject" ? "rejected" : "cancelled";

    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          const foundOrder = orders.find((o) => o.id === id);
          if (!foundOrder) return;

          const updatedItems = (foundOrder.items || []).map((item) => {
            if (item.name?.toLowerCase() !== oosItemName.toLowerCase()) return item;

            return {
              ...item,
              itemStatus: itemLevelStatus,
              rejectionReason: reason,
              rejectedAt: Timestamp.now(),
            };
          });

          const activeItems = updatedItems.filter((item) => {
            const s = getItemState(item);
            return !["rejected", "cancelled"].includes(s);
          });

          let nextOrderStatus = foundOrder.status || "placed";

          if (activeItems.length === 0) {
            nextOrderStatus = action === "reject" ? "rejected" : "cancelled";
          } else {
            nextOrderStatus = foundOrder.status || "placed";
          }

          await updateDoc(doc(db, "orders", id), {
            items: updatedItems,
            status: nextOrderStatus,
            updatedAt: Timestamp.now(),
            hasPartialItemIssue: activeItems.length > 0,
          });
        })
      );

      toast.success(
        `Updated ${selectedIds.length} order${selectedIds.length !== 1 ? "s" : ""} for item "${oosItemName}"`
      );
      setShowOosModal(false);
      setOosItemName(null);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Some orders could not be updated");
    } finally {
      setOosLoading(false);
    }
  };

  const openViewModal = (row) => {
    setSelectedOrder(row);
    setShowModal(true);
  };

  if (!restaurantId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-50 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h1 className="text-2xl font-bold mb-2 text-gray-900">
            Live Orders Management
          </h1>
          <p className="text-sm text-red-600">Employee restaurant id not found.</p>
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-50 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-5">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Orders Board</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant
              ? `${restaurant.brandName || ""}${restaurant.branchName ? ` / ${restaurant.branchName}` : ""}`
              : "Restaurant Orders"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-gray-500">
            Total:{" "}
            <span className="font-semibold text-gray-900">
              {dashboard.totalOrders}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Revenue:{" "}
            <span className="font-semibold text-gray-900">
              {formatCurrency(dashboard.revenue)}
            </span>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="px-4 py-2 rounded-xl bg-black text-white text-sm font-medium hover:opacity-90"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[28px] shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-stretch border-b border-gray-200 bg-white">
          <BoardTabButton
            active={activeBoardTab === "all"}
            label="All"
            count={boardCounts.all}
            onClick={() => setActiveBoardTab("all")}
            badgeClass="bg-gray-100 text-gray-700"
          />
          <BoardTabButton
            active={activeBoardTab === "to_pick"}
            label="To pick"
            count={boardCounts.to_pick}
            onClick={() => setActiveBoardTab("to_pick")}
            badgeClass="bg-sky-100 text-sky-700"
          />
          <BoardTabButton
            active={activeBoardTab === "ready"}
            label="Ready"
            count={boardCounts.ready}
            onClick={() => setActiveBoardTab("ready")}
            badgeClass="bg-green-100 text-green-700"
          />
          <BoardTabButton
            active={activeBoardTab === "completed"}
            label="Completed"
            count={boardCounts.completed}
            onClick={() => setActiveBoardTab("completed")}
            badgeClass="bg-purple-100 text-purple-700"
          />

          <div className="ml-auto flex items-stretch">
            <button
              type="button"
              onClick={() => loadData()}
              className="px-6 h-14 text-base font-semibold border-l border-gray-200 hover:bg-gray-50"
            >
              ↻ Recall
            </button>
            <button
              type="button"
              onClick={closeModal}
              className="px-6 h-14 text-base font-semibold border-l border-gray-200 hover:bg-gray-50"
            >
              Close ↪
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Search by order, customer, item..."
              className="md:col-span-2 border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-black/10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="border border-gray-200 p-2.5 rounded-xl text-sm"
              value={filters.type}
              onChange={(e) =>
                setFilters((p) => ({ ...p, type: e.target.value }))
              }
            >
              <option value="">All types</option>
              <option value="delivery">delivery</option>
              <option value="pickup">pickup</option>
              <option value="dineIn">dineIn</option>
              <option value="dinein">dinein</option>
            </select>
            <select
              className="border border-gray-200 p-2.5 rounded-xl text-sm"
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
        </div>

        <div className="bg-[#8f949d] p-4 min-h-[520px]">
          {loading ? (
            <div className="bg-white rounded-xl p-10 text-center text-gray-500">
              Loading...
            </div>
          ) : boardOrders.length === 0 ? (
            <div className="bg-white rounded-xl p-10 text-center text-gray-500">
              No orders found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
              {boardOrders.map((row) => (
                <OrderBoardCard
                  key={row.id}
                  row={row}
                  onView={openViewModal}
                  onAccept={(id) => quickUpdateStatus(id, "accepted")}
                  onPreparing={(id) => quickUpdateStatus(id, "preparing")}
                  onReady={(id) => quickUpdateStatus(id, "ready")}
                  onComplete={(id) => quickUpdateStatus(id, "completed")}
                  onRecall={(id) => quickUpdateStatus(id, "accepted")}
                  onItemOutOfStock={handleItemOutOfStock}
                  updatingOrderId={updatingOrderId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showModal && selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-6xl rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  Order #{selectedOrder.id}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Created {formatDate(selectedOrder._createdAt)}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <StatusPill value={selectedOrder._displayStatus || selectedOrder.status} />
                {selectedOrder._hasPartialItemIssue ? <StatusPill value="partial" /> : null}
                <StatusPill value={selectedOrder.paymentStatus || "pending"} />
                <button
                  type="button"
                  onClick={closeModal}
                  className="ml-2 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-6 bg-gray-50">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Items Ordered
                      </h3>
                      <span className="text-sm text-gray-500">
                        {selectedOrder._itemsCount} total items
                      </span>
                    </div>

                    <div className="space-y-4">
                      {selectedOrder.items?.length ? (
                        selectedOrder.items.map((item, i) => {
                          const itemState = getItemState(item);
                          const itemReason = getItemReason(item);
                          const itemRejected = ["rejected", "cancelled"].includes(itemState);

                          return (
                            <div
                              key={item.id || i}
                              className={`border rounded-2xl p-4 group ${
                                itemRejected
                                  ? "border-red-200 bg-red-50/40"
                                  : "border-gray-100"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-4">
                                  {item.image ? (
                                    <img
                                      src={item.image}
                                      alt={item.name}
                                      className="w-16 h-16 object-cover rounded-xl border border-gray-100"
                                    />
                                  ) : (
                                    <div className="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center text-xs text-gray-400 border border-gray-100">
                                      No image
                                    </div>
                                  )}

                                  <div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <h4 className={`font-semibold ${itemRejected ? "text-red-700 line-through" : "text-gray-900"}`}>
                                        {item.name}
                                      </h4>
                                      <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs">
                                        Qty {item.quantity}
                                      </span>
                                      {itemState ? <StatusPill value={itemState} /> : null}
                                      {!itemRejected ? (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            closeModal();
                                            handleItemOutOfStock(item.name);
                                          }}
                                          className="px-2 py-0.5 rounded-lg bg-red-50 border border-red-200 text-[10px] font-semibold text-red-600 hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
                                        >
                                          Out of Stock
                                        </button>
                                      ) : null}
                                    </div>

                                    <div className="text-sm text-gray-500 mt-1">
                                      Unit price: {formatCurrency(item.price)}
                                    </div>

                                    {item.note ? (
                                      <div className="mt-2 text-sm text-gray-600">
                                        <span className="font-medium text-gray-800">
                                          Note:
                                        </span>{" "}
                                        {item.note}
                                      </div>
                                    ) : null}

                                    {itemRejected && itemReason ? (
                                      <div className="mt-2 text-sm text-red-600">
                                        <span className="font-semibold">Reason:</span> {itemReason}
                                      </div>
                                    ) : null}

                                    {Array.isArray(item.modifiers) &&
                                    item.modifiers.length > 0 ? (
                                      <div className="mt-3">
                                        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                                          Modifiers
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                          {item.modifiers.map((mod, idx) => {
                                            const modName =
                                              mod?.name ||
                                              mod?.title ||
                                              mod?.label ||
                                              mod?.optionName ||
                                              "Modifier";
                                            const modPrice =
                                              mod?.priceDelta ??
                                              mod?.price ??
                                              mod?.amount ??
                                              0;

                                            return (
                                              <span
                                                key={idx}
                                                className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs border border-gray-200"
                                              >
                                                {modName}
                                                {Number(modPrice)
                                                  ? ` (${formatCurrency(modPrice)})`
                                                  : ""}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="text-right min-w-[90px]">
                                  <div className="text-xs text-gray-500">
                                    Item total
                                  </div>
                                  <div className="text-base font-bold text-gray-900">
                                    {formatCurrency(item.total)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-gray-500">No items found.</div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Quick Actions
                    </h3>

                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          quickUpdateStatus(selectedOrder.id, "accepted")
                        }
                        disabled={updatingOrderId === selectedOrder.id}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        Accept Order
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          quickUpdateStatus(selectedOrder.id, "preparing")
                        }
                        disabled={updatingOrderId === selectedOrder.id}
                        className="px-4 py-2 rounded-xl bg-yellow-500 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        Mark Preparing
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          quickUpdateStatus(selectedOrder.id, "ready")
                        }
                        disabled={updatingOrderId === selectedOrder.id}
                        className="px-4 py-2 rounded-xl bg-green-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        Mark Ready
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          quickUpdateStatus(selectedOrder.id, "completed")
                        }
                        disabled={updatingOrderId === selectedOrder.id}
                        className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        Complete Order
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          quickUpdateStatus(selectedOrder.id, "cancelled")
                        }
                        disabled={updatingOrderId === selectedOrder.id}
                        className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
                      >
                        Cancel Whole Order
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Customer Details
                    </h3>
                    <DetailRow label="Name" value={selectedOrder._customerName} />
                    <DetailRow label="Phone" value={selectedOrder._customerPhone} />
                    <DetailRow label="Email" value={selectedOrder._customerEmail} />
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Order Info
                    </h3>
                    <DetailRow label="Display Status" value={selectedOrder._displayStatus} />
                    <DetailRow label="Stored Status" value={selectedOrder.status} />
                    <DetailRow label="Order Type" value={selectedOrder._orderType} />
                    <DetailRow label="Payment" value={selectedOrder.paymentStatus} />
                    <DetailRow label="Method" value={selectedOrder._paymentMethod} />
                    <DetailRow label="Created" value={formatDate(selectedOrder._createdAt)} />
                    <DetailRow label="Updated" value={formatDate(selectedOrder._updatedAt)} />
                    <DetailRow label="Table" value={selectedOrder._tableNumber} />
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Fulfilment
                    </h3>
                    <DetailRow label="Address" value={selectedOrder._address} />
                    <DetailRow label="Notes" value={selectedOrder._notes || "—"} />
                  </div>

                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">
                      Payment Summary
                    </h3>
                    <DetailRow label="Subtotal" value={formatCurrency(selectedOrder._subtotal)} />
                    <DetailRow label="Taxes" value={formatCurrency(selectedOrder._taxes)} />
                    <DetailRow label="Delivery Fee" value={formatCurrency(selectedOrder._deliveryFee)} />
                    <DetailRow label="Service Fee" value={formatCurrency(selectedOrder._serviceFee)} />
                    <DetailRow label="Discount" value={`- ${formatCurrency(selectedOrder._discount)}`} />
                    <div className="flex items-center justify-between pt-4 mt-2 border-t">
                      <span className="text-base font-semibold text-gray-900">
                        Grand Total
                      </span>
                      <span className="text-xl font-bold text-gray-900">
                        {formatCurrency(selectedOrder._total)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOosModal && oosItemName && (
        <OutOfStockModal
          itemName={oosItemName}
          affectedOrders={oosAffectedOrders}
          onConfirm={handleOosConfirm}
          onClose={() => {
            setShowOosModal(false);
            setOosItemName(null);
          }}
          loading={oosLoading}
        />
      )}

      <ToastContainer />
    </main>
  );
}