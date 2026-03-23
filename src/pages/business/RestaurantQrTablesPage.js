// src/pages/restaurants/RestaurantQrTablesPage.jsx
import React, { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import useRestaurantDoc from "../../hooks/useRestaurantDoc";

const createId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const newTable = () => ({
  id: createId("table"),
  label: "",
  capacity: "",
  qrCodeToken: "",
  isActive: true,
});

const DEFAULT_QR_SETTINGS = {
  enabled: false,
  manualTableEntryEnabled: true,
  sessionTimeoutMins: "90",
  allowRepeatOrders: true,
  openTabSupported: false,
  tables: [],
};

export default function RestaurantQrTablesPage() {
  const { restaurant, loading, updateRestaurant, restaurantId } = useRestaurantDoc();
  const [form, setForm] = useState(DEFAULT_QR_SETTINGS);

  useEffect(() => {
    if (restaurant?.qrSettings) {
      setForm({
        ...DEFAULT_QR_SETTINGS,
        ...restaurant.qrSettings,
        tables: Array.isArray(restaurant.qrSettings.tables)
          ? restaurant.qrSettings.tables
          : [],
      });
    }
  }, [restaurant]);

  const addTable = () => {
    setForm((prev) => ({
      ...prev,
      tables: [...(prev.tables || []), newTable()],
    }));
  };

  const updateTable = (id, patch) => {
    setForm((prev) => ({
      ...prev,
      tables: (prev.tables || []).map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  };

  const removeTable = (id) => {
    setForm((prev) => ({
      ...prev,
      tables: (prev.tables || []).filter((t) => t.id !== id),
    }));
  };

  const handleSave = async (e) => {
    e.preventDefault();

    await updateRestaurant(
      {
        qrSettings: {
          ...form,
          sessionTimeoutMins: Number(form.sessionTimeoutMins || 90),
          tables: (form.tables || []).map((t) => ({
            id: t.id,
            label: (t.label || "").trim(),
            capacity: t.capacity === "" ? null : Number(t.capacity),
            qrCodeToken: (t.qrCodeToken || "").trim(),
            isActive: !!t.isActive,
          })),
        },
      },
      "QR / Tables settings updated ✅"
    );
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!restaurantId) return <div className="p-6">Employee restaurant id not found.</div>;

  return (
    <main className="p-6 bg-gray-100 min-h-screen">
      <div className="max-w-6xl mx-auto bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">QR / Tables</h1>
            <p className="text-sm text-gray-500">
              {restaurant?.branchName || restaurant?.brandName || "Restaurant"}
            </p>
          </div>
          <button
            type="button"
            onClick={addTable}
            className="px-4 py-2 rounded bg-black text-white"
          >
            + Add Table
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex flex-wrap gap-5 text-sm">
            {[
              ["enabled", "QR ordering enabled"],
              ["manualTableEntryEnabled", "Manual table entry"],
              ["allowRepeatOrders", "Allow repeat orders"],
              ["openTabSupported", "Open tab supported"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!form[key]}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, [key]: e.target.checked }))
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <input
            className="border rounded p-2 w-64"
            placeholder="Session timeout mins"
            value={form.sessionTimeoutMins}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, sessionTimeoutMins: e.target.value }))
            }
          />

          <div className="space-y-3">
            {(form.tables || []).length === 0 ? (
              <div className="text-sm text-gray-500">No tables added.</div>
            ) : (
              form.tables.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-12 gap-2 border rounded p-3 bg-gray-50 items-center"
                >
                  <input
                    className="col-span-3 border p-2 rounded"
                    value={t.label}
                    onChange={(e) => updateTable(t.id, { label: e.target.value })}
                    placeholder="Table label"
                  />
                  <input
                    className="col-span-2 border p-2 rounded"
                    value={t.capacity}
                    onChange={(e) => updateTable(t.id, { capacity: e.target.value })}
                    placeholder="Capacity"
                  />
                  <input
                    className="col-span-4 border p-2 rounded"
                    value={t.qrCodeToken}
                    onChange={(e) => updateTable(t.id, { qrCodeToken: e.target.value })}
                    placeholder="QR token"
                  />
                  <label className="col-span-2 text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!t.isActive}
                      onChange={(e) => updateTable(t.id, { isActive: e.target.checked })}
                    />
                    Active
                  </label>
                  <button
                    type="button"
                    className="col-span-1 text-red-600"
                    onClick={() => removeTable(t.id)}
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="flex justify-end">
            <button className="px-5 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
              Save QR / Tables
            </button>
          </div>
        </form>
      </div>

      <ToastContainer />
    </main>
  );
}