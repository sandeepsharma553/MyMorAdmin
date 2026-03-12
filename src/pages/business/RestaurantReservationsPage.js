import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../../firebase";
import {
  RESERVATION_STATUSES,
  getRestaurantById,
} from "../../components/RestaurantShared";
import { toast, ToastContainer } from "react-toastify";

export default function RestaurantReservationsPage({ navbarHeight }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [filters, setFilters] = useState({ status: "", date: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const restaurantDoc = await getRestaurantById(id);
      setRestaurant(restaurantDoc);

      const q = query(
        collection(db, "reservations"),
        where("restaurantId", "==", id),
        orderBy("slotAt", "desc")
      );

      const snap = await getDocs(q);
      setReservations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load reservations");
    } finally {
      setLoading(false);
    }
  };

  const filteredReservations = useMemo(() => {
    return reservations.filter((row) => {
      const okStatus = !filters.status || row.status === filters.status;
      const okDate =
        !filters.date ||
        (row.slotAt?.toDate &&
          row.slotAt.toDate().toISOString().slice(0, 10) === filters.date);

      return okStatus && okDate;
    });
  }, [reservations, filters]);

  const quickUpdateStatus = async (reservationId, status) => {
    try {
      await updateDoc(doc(db, "reservations", reservationId), {
        status,
        updatedAt: Timestamp.now(),
      });
      toast.success(`Reservation marked ${status}`);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to update reservation");
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Reservations List / Console</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant ? `${restaurant.brandName || ""} / ${restaurant.branchName || ""}` : "Restaurant Reservations"}
          </p>
        </div>
        <button
          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          onClick={() => navigate("/restaurant")}
        >
          Back
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <select
            className="border p-2 rounded"
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="">All statuses</option>
            {RESERVATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="border p-2 rounded"
            value={filters.date}
            onChange={(e) => setFilters((p) => ({ ...p, date: e.target.value }))}
          />
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Reservation ID", "Guest", "Party Size", "Phone", "Status", "Slot", "Actions"].map((x) => (
                  <th key={x} className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredReservations.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm">{row.id}</td>
                  <td className="px-4 py-3 text-sm">{row.guestName || "—"}</td>
                  <td className="px-4 py-3 text-sm">{row.partySize || "—"}</td>
                  <td className="px-4 py-3 text-sm">{row.phone || "—"}</td>
                  <td className="px-4 py-3 text-sm">{row.status || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {row.slotAt?.toDate ? row.slotAt.toDate().toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2 flex-wrap">
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => quickUpdateStatus(row.id, "confirmed")}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 border rounded text-xs"
                        onClick={() => quickUpdateStatus(row.id, "seated")}
                      >
                        Seat
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

              {!loading && filteredReservations.length === 0 && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    No reservations found.
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