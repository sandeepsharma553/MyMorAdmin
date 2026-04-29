import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  getDocs,
  orderBy,
  query,
  doc,
  updateDoc,
  Timestamp,
  getDoc,
} from "firebase/firestore";
import { useSelector } from "react-redux";
import { db } from "../../firebase";
import { restaurantCol } from "../../utils/firestorePaths";
import { RESERVATION_STATUSES } from "../../components/RestaurantShared";
import { toast, ToastContainer } from "react-toastify";

const RESERVATION_MODES = ["native", "redirect", "waitlist_only", "disabled"];

const DEFAULT_RESERVATION_SETTINGS = {
  mode: "redirect",
  enabled: true,
  externalUrl: "",
  nativeEnabled: false,
  waitlistEnabled: false,
  minPartySize: "1",
  maxPartySize: "12",
  slotIntervalMins: "15",
  leadTimeMins: "60",
  allowSameDay: true,
  requirePhone: true,
  requireNotes: false,
  autoConfirm: false,
};

export default function RestaurantReservationsPage({ navbarHeight }) {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);

  const restaurantId = emp?.restaurantid || null;

  const [restaurant, setRestaurant] = useState(null);
  const [reservations, setReservations] = useState([]);
  const [filters, setFilters] = useState({ status: "", date: "" });
  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsForm, setSettingsForm] = useState(DEFAULT_RESERVATION_SETTINGS);

  const loadData = useCallback(async () => {
    if (!restaurantId) {
      setRestaurant(null);
      setReservations([]);
      return;
    }

    setLoading(true);
    try {
      const restaurantRef = doc(db, "restaurants", restaurantId);
      const restaurantSnap = await getDoc(restaurantRef);

      if (!restaurantSnap.exists()) {
        setRestaurant(null);
        setReservations([]);
        toast.error("Restaurant not found");
        return;
      }

      const restaurantDoc = {
        id: restaurantSnap.id,
        ...restaurantSnap.data(),
      };

      setRestaurant(restaurantDoc);

      setSettingsForm({
        ...DEFAULT_RESERVATION_SETTINGS,
        ...(restaurantDoc.reservationSettings || {}),
        minPartySize:
          restaurantDoc?.reservationSettings?.minPartySize?.toString?.() ||
          DEFAULT_RESERVATION_SETTINGS.minPartySize,
        maxPartySize:
          restaurantDoc?.reservationSettings?.maxPartySize?.toString?.() ||
          DEFAULT_RESERVATION_SETTINGS.maxPartySize,
        slotIntervalMins:
          restaurantDoc?.reservationSettings?.slotIntervalMins?.toString?.() ||
          DEFAULT_RESERVATION_SETTINGS.slotIntervalMins,
        leadTimeMins:
          restaurantDoc?.reservationSettings?.leadTimeMins?.toString?.() ||
          DEFAULT_RESERVATION_SETTINGS.leadTimeMins,
      });

      const q = query(
        restaurantCol(restaurantId, "reservations"),
        orderBy("slotAt", "desc")
      );

      const snap = await getDocs(q);
      setReservations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
     
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      await updateDoc(doc(restaurantCol(restaurantId, "reservations"), reservationId), {
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

  const saveReservationSettings = async (e) => {
    e.preventDefault();

    if (!restaurantId) {
      toast.error("Employee restaurant id not found");
      return;
    }

    setSavingSettings(true);
    try {
      await updateDoc(doc(db, "restaurants", restaurantId), {
        reservationSettings: {
          ...settingsForm,
          minPartySize: Number(settingsForm.minPartySize || 1),
          maxPartySize: Number(settingsForm.maxPartySize || 12),
          slotIntervalMins: Number(settingsForm.slotIntervalMins || 15),
          leadTimeMins: Number(settingsForm.leadTimeMins || 60),
        },
        restaurantid: restaurantId,
        uid: uid || null,
        updatedAt: Timestamp.now(),
      });

      toast.success("Reservation settings updated ✅");
      setSettingsModalOpen(false);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to update reservation settings");
    } finally {
      setSavingSettings(false);
    }
  };

  if (!restaurantId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow p-6">
          <h1 className="text-2xl font-semibold mb-2">Reservations</h1>
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
          <h1 className="text-2xl font-semibold">Reservations Settings / Console</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant
              ? `${restaurant.brandName || ""} / ${restaurant.branchName || ""}`
              : "Restaurant Reservations"}
          </p>
        </div>

        <button
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => setSettingsModalOpen(true)}
        >
          Add
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4 space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Reservations List / Console</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bound by employee restaurant id: {restaurantId}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className="border p-2 rounded"
            value={filters.status}
            onChange={(e) =>
              setFilters((p) => ({ ...p, status: e.target.value }))
            }
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
            onChange={(e) =>
              setFilters((p) => ({ ...p, date: e.target.value }))
            }
          />
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  "Reservation ID",
                  "Guest",
                  "Party Size",
                  "Phone",
                  "Status",
                  "Slot",
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
              {filteredReservations.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-sm">{row.id}</td>
                  <td className="px-4 py-3 text-sm">{row.guestName || "—"}</td>
                  <td className="px-4 py-3 text-sm">{row.partySize || "—"}</td>
                  <td className="px-4 py-3 text-sm">{row.phone || "—"}</td>
                  <td className="px-4 py-3 text-sm">{row.status || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {row.slotAt?.toDate
                      ? row.slotAt.toDate().toLocaleString()
                      : "—"}
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

              {loading && (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                    Loading...
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {settingsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h2 className="text-xl font-semibold">Reservation Settings</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Restaurant reservation module settings
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSettingsModalOpen(false)}
                className="w-9 h-9 rounded-full border text-gray-600 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={saveReservationSettings} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium mb-1">Mode</label>
                <select
                  className="border p-2 rounded w-full"
                  value={settingsForm.mode}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({ ...prev, mode: e.target.value }))
                  }
                >
                  {RESERVATION_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  External Booking URL
                </label>
                <input
                  className="border p-2 rounded w-full"
                  placeholder="https://..."
                  value={settingsForm.externalUrl}
                  onChange={(e) =>
                    setSettingsForm((prev) => ({
                      ...prev,
                      externalUrl: e.target.value,
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Min Party Size</label>
                  <input
                    className="border p-2 rounded w-full"
                    value={settingsForm.minPartySize}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        minPartySize: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Max Party Size</label>
                  <input
                    className="border p-2 rounded w-full"
                    value={settingsForm.maxPartySize}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        maxPartySize: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Slot Interval (mins)
                  </label>
                  <input
                    className="border p-2 rounded w-full"
                    value={settingsForm.slotIntervalMins}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        slotIntervalMins: e.target.value,
                      }))
                    }
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Lead Time (mins)
                  </label>
                  <input
                    className="border p-2 rounded w-full"
                    value={settingsForm.leadTimeMins}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        leadTimeMins: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 text-sm">
                {[
                  ["enabled", "Enabled"],
                  ["nativeEnabled", "Native Reservation Enabled"],
                  ["waitlistEnabled", "Waitlist Enabled"],
                  ["allowSameDay", "Allow Same Day"],
                  ["requirePhone", "Require Phone"],
                  ["requireNotes", "Require Notes"],
                  ["autoConfirm", "Auto Confirm"],
                ].map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!settingsForm[key]}
                      onChange={(e) =>
                        setSettingsForm((prev) => ({
                          ...prev,
                          [key]: e.target.checked,
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setSettingsModalOpen(false)}
                  className="px-4 py-2 rounded border hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingSettings ? "Saving..." : "Save Reservation Settings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}