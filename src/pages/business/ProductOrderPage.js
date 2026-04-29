import React, { useEffect, useMemo, useState } from "react";
import {
    collectionGroup,
    query,
    onSnapshot,
    updateDoc,
    doc,
    serverTimestamp,
    getDoc,
    increment,
    where,
} from "firebase/firestore";
import { useSelector } from "react-redux";
import { db } from "../../firebase";
import { productCol } from "../../utils/firestorePaths";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const ORDER_STATUS = [
    "placed",
    "confirmed",
    "packed",
    "shipped",
    "out_for_delivery",
    "delivered",
    "cancelled",
    "returned",
];

const PAYMENT_STATUS = ["pending", "paid", "failed", "refunded"];

const STATUS_LABEL = {
    placed: "Placed",
    confirmed: "Confirmed",
    packed: "Packed",
    shipped: "Shipped",
    out_for_delivery: "Out for delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
    returned: "Returned",
};

const PAYMENT_LABEL = {
    pending: "Pending",
    paid: "Paid",
    failed: "Failed",
    refunded: "Refunded",
};

const STATUS_BADGE = {
    placed: "bg-blue-50 text-blue-700 border-blue-200",
    confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    packed: "bg-purple-50 text-purple-700 border-purple-200",
    shipped: "bg-orange-50 text-orange-700 border-orange-200",
    out_for_delivery: "bg-amber-50 text-amber-700 border-amber-200",
    delivered: "bg-green-50 text-green-700 border-green-200",
    cancelled: "bg-red-50 text-red-700 border-red-200",
    returned: "bg-gray-100 text-gray-700 border-gray-200",
};

const PAYMENT_BADGE = {
    pending: "bg-yellow-50 text-yellow-700 border-yellow-200",
    paid: "bg-green-50 text-green-700 border-green-200",
    failed: "bg-red-50 text-red-700 border-red-200",
    refunded: "bg-gray-100 text-gray-700 border-gray-200",
};

const inputCls =
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const textareaCls =
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none resize-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

function formatCurrency(v) {
    const n = Number(v || 0);
    return `₹${n.toFixed(2)}`;
}

function formatDate(value) {
    try {
        if (!value) return "—";
        if (typeof value?.toDate === "function") {
            return value.toDate().toLocaleString();
        }
        return new Date(value).toLocaleString();
    } catch {
        return "—";
    }
}

function statusCanMove(current, next) {
    if (current === next) return true;
    if (["cancelled", "returned", "delivered"].includes(current)) return false;

    const flow = [
        "placed",
        "confirmed",
        "packed",
        "shipped",
        "out_for_delivery",
        "delivered",
    ];

    if (next === "cancelled") return ["placed", "confirmed", "packed"].includes(current);
    if (next === "returned") return current === "delivered";

    const currentIndex = flow.indexOf(current);
    const nextIndex = flow.indexOf(next);
    return nextIndex >= currentIndex;
}

async function restockOrderItems(order) {
    const items = Array.isArray(order?.items) ? order.items : [];

    for (const item of items) {
        if (!item?.productId || !item?.quantity) continue;

        try {
            const ref = doc(db, "products", item.productId);
            const snap = await getDoc(ref);
            if (!snap.exists()) continue;

            await updateDoc(ref, {
                stock: increment(Number(item.quantity || 0)),
                updatedAt: serverTimestamp(),
            });
        } catch (err) {
            console.error("Restock error", err);
        }
    }
}

export default function ProductOrderPage({ navbarHeight }) {
    const uid = useSelector((state) => state.auth.user?.uid);
    const emp = useSelector((state) => state.auth.employee);
    const restaurantId = emp?.restaurantid || null;

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [paymentFilter, setPaymentFilter] = useState("all");
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [saving, setSaving] = useState(false);

    const [adminNote, setAdminNote] = useState("");
    const [trackingNumber, setTrackingNumber] = useState("");
    const [courierName, setCourierName] = useState("");
    const [nextStatus, setNextStatus] = useState("");
    const [nextPaymentStatus, setNextPaymentStatus] = useState("");

    useEffect(() => {
        if (!restaurantId) return;

        const qy = query(
            collectionGroup(db, "productOrders"),
            where("restaurantId", "==", restaurantId)
        );

        const unsub = onSnapshot(
            qy,
            (snap) => {
                const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
                setRows(list);
                setLoading(false);
            },
            (err) => {
                console.error(err);
                setLoading(false);
            }
        );

        return () => unsub();
    }, [restaurantId]);

    useEffect(() => {
        if (!selectedOrder) return;
        setAdminNote(selectedOrder?.adminNote || "");
        setTrackingNumber(selectedOrder?.shipping?.trackingNumber || "");
        setCourierName(selectedOrder?.shipping?.courierName || "");
        setNextStatus(selectedOrder?.orderStatus || "placed");
        setNextPaymentStatus(selectedOrder?.paymentStatus || "pending");
    }, [selectedOrder]);

    const filtered = useMemo(() => {
        const text = search.trim().toLowerCase();

        return rows.filter((row) => {
            const statusOk = statusFilter === "all" ? true : row?.orderStatus === statusFilter;
            const paymentOk = paymentFilter === "all" ? true : row?.paymentStatus === paymentFilter;

            const hay = [
                row?.orderNumber,
                row?.customerName,
                row?.customerPhone,
                row?.customerEmail,
                row?.shippingAddress?.name,
                row?.shippingAddress?.phone,
                row?.shippingAddress?.city,
                row?.shippingAddress?.state,
                row?.shippingAddress?.pincode,
                ...(Array.isArray(row?.items) ? row.items.map((x) => x?.title || "") : []),
            ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();

            const textOk = !text ? true : hay.includes(text);
            return statusOk && paymentOk && textOk;
        });
    }, [rows, search, statusFilter, paymentFilter]);

    const summary = useMemo(() => {
        return {
            total: rows.length,
            placed: rows.filter((x) => x.orderStatus === "placed").length,
            processing: rows.filter((x) => ["confirmed", "packed", "shipped", "out_for_delivery"].includes(x.orderStatus)).length,
            delivered: rows.filter((x) => x.orderStatus === "delivered").length,
            cancelled: rows.filter((x) => x.orderStatus === "cancelled").length,
        };
    }, [rows]);

    const handleOpen = (order) => {
        setSelectedOrder(order);
    };

    const handleUpdateOrder = async () => {
        if (!selectedOrder?.id) return;

        const current = selectedOrder?.orderStatus || "placed";
        if (!statusCanMove(current, nextStatus)) {
            toast.error(`Cannot move order from ${STATUS_LABEL[current]} to ${STATUS_LABEL[nextStatus]}`);
            return;
        }

        setSaving(true);
        try {
            const payload = {
                orderStatus: nextStatus,
                paymentStatus: nextPaymentStatus,
                adminNote: adminNote.trim(),
                shipping: {
                    ...(selectedOrder?.shipping || {}),
                    courierName: courierName.trim(),
                    trackingNumber: trackingNumber.trim(),
                },
                updatedAt: serverTimestamp(),
            };

            if (nextStatus === "confirmed" && !selectedOrder?.confirmedAt) {
                payload.confirmedAt = serverTimestamp();
            }
            if (nextStatus === "packed" && !selectedOrder?.packedAt) {
                payload.packedAt = serverTimestamp();
            }
            if (nextStatus === "shipped" && !selectedOrder?.shippedAt) {
                payload.shippedAt = serverTimestamp();
            }
            if (nextStatus === "out_for_delivery" && !selectedOrder?.outForDeliveryAt) {
                payload.outForDeliveryAt = serverTimestamp();
            }
            if (nextStatus === "delivered" && !selectedOrder?.deliveredAt) {
                payload.deliveredAt = serverTimestamp();
            }
            if (nextStatus === "cancelled" && !selectedOrder?.cancelledAt) {
                payload.cancelledAt = serverTimestamp();
                payload.cancelledBy = "admin";
                await restockOrderItems(selectedOrder);
            }
            if (nextStatus === "returned" && !selectedOrder?.returnedAt) {
                payload.returnedAt = serverTimestamp();
                payload.returnedBy = "admin";
            }

            await updateDoc(doc(productCol(selectedOrder.productId, "productOrders"), selectedOrder.id), payload);
            toast.success("Order updated successfully ✅");
            setSelectedOrder((prev) => (prev ? { ...prev, ...payload } : prev));
        } catch (err) {
            console.error(err);
            toast.error(err?.message || "Failed to update order");
        } finally {
            setSaving(false);
        }
    };

    return (
        <main
            className="flex-1 bg-gray-100 p-6 overflow-auto"
            style={{ paddingTop: navbarHeight || 0 }}
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between mb-5">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">Product Orders</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        Manage placed orders, shipping progress, delivery and cancellations.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-5 gap-4 mb-5">
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-sm text-gray-500">Total Orders</div>
                    <div className="mt-2 text-2xl font-bold text-gray-900">{summary.total}</div>
                </div>
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-sm text-gray-500">New</div>
                    <div className="mt-2 text-2xl font-bold text-blue-700">{summary.placed}</div>
                </div>
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-sm text-gray-500">Processing</div>
                    <div className="mt-2 text-2xl font-bold text-indigo-700">{summary.processing}</div>
                </div>
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-sm text-gray-500">Delivered</div>
                    <div className="mt-2 text-2xl font-bold text-green-700">{summary.delivered}</div>
                </div>
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-sm text-gray-500">Cancelled</div>
                    <div className="mt-2 text-2xl font-bold text-red-700">{summary.cancelled}</div>
                </div>
            </div>

            <div className="rounded-2xl bg-white border border-gray-200 p-4 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                        className={inputCls}
                        placeholder="Search by order no, customer, phone, item..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />

                    <select
                        className={inputCls}
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">All order status</option>
                        {ORDER_STATUS.map((s) => (
                            <option key={s} value={s}>
                                {STATUS_LABEL[s]}
                            </option>
                        ))}
                    </select>

                    <select
                        className={inputCls}
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value)}
                    >
                        <option value="all">All payment status</option>
                        {PAYMENT_STATUS.map((s) => (
                            <option key={s} value={s}>
                                {PAYMENT_LABEL[s]}
                            </option>
                        ))}
                    </select>

                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600 flex items-center">
                        Showing {filtered.length} of {rows.length} orders
                    </div>
                </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                {loading ? (
                    <div className="flex items-center justify-center h-60">
                        <FadeLoader color="#111827" loading />
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                            <tr>
                                <th className="p-3 font-semibold">Order</th>
                                <th className="p-3 font-semibold">Customer</th>
                                <th className="p-3 font-semibold">Items</th>
                                <th className="p-3 font-semibold">Amount</th>
                                <th className="p-3 font-semibold">Order Status</th>
                                <th className="p-3 font-semibold">Payment</th>
                                <th className="p-3 font-semibold">Date</th>
                                <th className="p-3 font-semibold w-32">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((row) => {
                                const itemCount = Array.isArray(row?.items)
                                    ? row.items.reduce((sum, x) => sum + Number(x?.quantity || 0), 0)
                                    : 0;

                                return (
                                    <tr key={row.id} className="border-t border-gray-100 align-top">
                                        <td className="p-3">
                                            <div className="font-semibold text-gray-900">
                                                {row?.orderNumber || row?.id?.slice(0, 8) || "—"}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">
                                                {row?.shippingAddress?.city || ""}
                                                {row?.shippingAddress?.state ? `, ${row.shippingAddress.state}` : ""}
                                            </div>
                                        </td>

                                        <td className="p-3">
                                            <div className="font-medium text-gray-900">{row?.customerName || row?.shippingAddress?.name || "—"}</div>
                                            <div className="text-xs text-gray-500 mt-1">{row?.customerPhone || row?.shippingAddress?.phone || "—"}</div>
                                        </td>

                                        <td className="p-3 text-gray-700">{itemCount} item(s)</td>
                                        <td className="p-3 text-gray-900 font-semibold">{formatCurrency(row?.grandTotal || row?.total || 0)}</td>
                                        <td className="p-3">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[row?.orderStatus] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                                {STATUS_LABEL[row?.orderStatus] || row?.orderStatus || "—"}
                                            </span>
                                        </td>
                                        <td className="p-3">
                                            <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${PAYMENT_BADGE[row?.paymentStatus] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                                                {PAYMENT_LABEL[row?.paymentStatus] || row?.paymentStatus || "—"}
                                            </span>
                                        </td>
                                        <td className="p-3 text-gray-500">{formatDate(row?.createdAt)}</td>
                                        <td className="p-3">
                                            <button
                                                onClick={() => handleOpen(row)}
                                                className="rounded-lg border border-gray-200 px-3 py-1.5 hover:bg-gray-50"
                                            >
                                                Open
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}

                            {!loading && filtered.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-10 text-center text-gray-500">
                                        No orders found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            {selectedOrder && (
                <div className="fixed inset-0 z-50 bg-black/40 p-4 flex items-center justify-center">
                    <div className="w-full max-w-7xl rounded-2xl bg-white shadow-xl overflow-hidden">
                        <div className="flex items-center justify-between border-b border-gray-100 p-5">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">
                                    Order Details • {selectedOrder?.orderNumber || selectedOrder?.id?.slice(0, 8)}
                                </h2>
                                <p className="text-xs text-gray-500 mt-1">
                                    Created on {formatDate(selectedOrder?.createdAt)}
                                </p>
                            </div>

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={handleUpdateOrder}
                                    disabled={saving}
                                    className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                                >
                                    {saving ? "Saving..." : "Save Changes"}
                                </button>
                                <button
                                    onClick={() => setSelectedOrder(null)}
                                    className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                                >
                                    Close
                                </button>
                            </div>
                        </div>

                        <div className="max-h-[85vh] overflow-auto bg-gray-50 p-5">
                            <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-5">
                                <div className="space-y-5">
                                    <div className="rounded-2xl bg-white border border-gray-200 p-5">
                                        <h3 className="text-base font-semibold text-gray-900 mb-4">Ordered Items</h3>
                                        <div className="space-y-3">
                                            {(selectedOrder?.items || []).map((item, idx) => (
                                                <div key={idx} className="flex gap-4 rounded-xl border border-gray-100 p-3">
                                                    <img
                                                        src={item?.image || item?.imageUrl || "https://via.placeholder.com/100"}
                                                        alt=""
                                                        className="h-20 w-20 rounded-xl object-cover border border-gray-100"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-semibold text-gray-900">{item?.title || "Product"}</div>
                                                        <div className="text-sm text-gray-500 mt-1">
                                                            Qty: {item?.quantity || 1}
                                                        </div>
                                                        {item?.variantText ? (
                                                            <div className="text-sm text-gray-500 mt-1">Variant: {item.variantText}</div>
                                                        ) : null}
                                                        {item?.sku ? (
                                                            <div className="text-xs text-gray-400 mt-1">SKU: {item.sku}</div>
                                                        ) : null}
                                                    </div>
                                                    <div className="text-right">
                                                        <div className="font-semibold text-gray-900">{formatCurrency(item?.finalPrice || item?.price || 0)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white border border-gray-200 p-5">
                                        <h3 className="text-base font-semibold text-gray-900 mb-4">Price Summary</h3>
                                        <div className="space-y-3 text-sm">
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-500">Subtotal</span>
                                                <span className="font-medium text-gray-900">{formatCurrency(selectedOrder?.subtotal || 0)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-500">Shipping</span>
                                                <span className="font-medium text-gray-900">{formatCurrency(selectedOrder?.shippingCharge || 0)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-500">Tax</span>
                                                <span className="font-medium text-gray-900">{formatCurrency(selectedOrder?.taxAmount || 0)}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-gray-500">Discount</span>
                                                <span className="font-medium text-green-700">- {formatCurrency(selectedOrder?.discountAmount || 0)}</span>
                                            </div>
                                            <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                                                <span className="font-semibold text-gray-900">Grand Total</span>
                                                <span className="text-lg font-bold text-gray-900">{formatCurrency(selectedOrder?.grandTotal || selectedOrder?.total || 0)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-5">
                                    <div className="rounded-2xl bg-white border border-gray-200 p-5">
                                        <h3 className="text-base font-semibold text-gray-900 mb-4">Customer</h3>
                                        <div className="space-y-2 text-sm">
                                            <div><span className="text-gray-500">Name:</span> <span className="font-medium text-gray-900">{selectedOrder?.customerName || selectedOrder?.shippingAddress?.name || "—"}</span></div>
                                            <div><span className="text-gray-500">Phone:</span> <span className="font-medium text-gray-900">{selectedOrder?.customerPhone || selectedOrder?.shippingAddress?.phone || "—"}</span></div>
                                            <div><span className="text-gray-500">Email:</span> <span className="font-medium text-gray-900">{selectedOrder?.customerEmail || "—"}</span></div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white border border-gray-200 p-5">
                                        <h3 className="text-base font-semibold text-gray-900 mb-4">Shipping Address</h3>
                                        <div className="text-sm text-gray-700 leading-7 whitespace-pre-line">
                                            {[
                                                selectedOrder?.shippingAddress?.name,
                                                selectedOrder?.shippingAddress?.line1,
                                                selectedOrder?.shippingAddress?.line2,
                                                [selectedOrder?.shippingAddress?.city, selectedOrder?.shippingAddress?.state].filter(Boolean).join(", "),
                                                selectedOrder?.shippingAddress?.pincode,
                                                selectedOrder?.shippingAddress?.country,
                                                selectedOrder?.shippingAddress?.phone,
                                            ]
                                                .filter(Boolean)
                                                .join("\n") || "—"}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white border border-gray-200 p-5">
                                        <h3 className="text-base font-semibold text-gray-900 mb-4">Manage Order</h3>
                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Order Status</label>
                                                <select
                                                    className={inputCls}
                                                    value={nextStatus}
                                                    onChange={(e) => setNextStatus(e.target.value)}
                                                >
                                                    {ORDER_STATUS.map((s) => (
                                                        <option key={s} value={s}>
                                                            {STATUS_LABEL[s]}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Payment Status</label>
                                                <select
                                                    className={inputCls}
                                                    value={nextPaymentStatus}
                                                    onChange={(e) => setNextPaymentStatus(e.target.value)}
                                                >
                                                    {PAYMENT_STATUS.map((s) => (
                                                        <option key={s} value={s}>
                                                            {PAYMENT_LABEL[s]}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Courier Name</label>
                                                <input
                                                    className={inputCls}
                                                    value={courierName}
                                                    onChange={(e) => setCourierName(e.target.value)}
                                                    placeholder="e.g. Delhivery"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Tracking Number</label>
                                                <input
                                                    className={inputCls}
                                                    value={trackingNumber}
                                                    onChange={(e) => setTrackingNumber(e.target.value)}
                                                    placeholder="Tracking ID"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold text-gray-900 mb-2">Admin Note</label>
                                                <textarea
                                                    className={textareaCls}
                                                    rows={5}
                                                    value={adminNote}
                                                    onChange={(e) => setAdminNote(e.target.value)}
                                                    placeholder="Internal note for this order"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-white border border-gray-200 p-5">
                                        <h3 className="text-base font-semibold text-gray-900 mb-4">Order Timeline</h3>
                                        <div className="space-y-3 text-sm">
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Placed</span><span className="text-gray-900">{formatDate(selectedOrder?.createdAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Confirmed</span><span className="text-gray-900">{formatDate(selectedOrder?.confirmedAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Packed</span><span className="text-gray-900">{formatDate(selectedOrder?.packedAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Shipped</span><span className="text-gray-900">{formatDate(selectedOrder?.shippedAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Out for delivery</span><span className="text-gray-900">{formatDate(selectedOrder?.outForDeliveryAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Delivered</span><span className="text-gray-900">{formatDate(selectedOrder?.deliveredAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Cancelled</span><span className="text-gray-900">{formatDate(selectedOrder?.cancelledAt)}</span></div>
                                            <div className="flex items-center justify-between"><span className="text-gray-500">Returned</span><span className="text-gray-900">{formatDate(selectedOrder?.returnedAt)}</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ToastContainer />
        </main>
    );
}
