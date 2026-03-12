import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast, ToastContainer } from "react-toastify";
import {
  getRestaurantById,
  inventoryRowsFromMenus,
  INVENTORY_BULK_ACTIONS,
  updateRestaurantDoc,
} from "../../components/RestaurantShared";

export default function RestaurantInventoryPage({ navbarHeight }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [menus, setMenus] = useState([]);
  const [inventorySelection, setInventorySelection] = useState([]);
  const [inventoryBulkAction, setInventoryBulkAction] = useState("mark_sold_out");

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    const data = await getRestaurantById(id);
    setRestaurant(data);
    setMenus(data?.menus || []);
  };

  const inventoryRows = useMemo(() => inventoryRowsFromMenus(menus), [menus]);

  const applyInventoryBulkAction = async () => {
    if (!inventorySelection.length) {
      toast.error("Select at least one item");
      return;
    }

    const nextStateMap = {
      mark_sold_out: "sold_out",
      mark_active: "active",
      hide_item: "hidden",
      archive_item: "archived",
    };

    const targetState = nextStateMap[inventoryBulkAction];

    const nextMenus = (menus || []).map((menu) => ({
      ...menu,
      categories: (menu.categories || []).map((category) => ({
        ...category,
        items: (category.items || []).map((item) =>
          inventorySelection.includes(item.id)
            ? { ...item, availabilityState: targetState }
            : item
        ),
      })),
    }));

    try {
      await updateRestaurantDoc(id, { menus: nextMenus });
      setMenus(nextMenus);
      setInventorySelection([]);
      toast.success("Inventory updated");
    } catch (e) {
      console.error(e);
      toast.error("Failed to update inventory");
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory / Sold-Out Bulk Actions</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant ? `${restaurant.brandName || ""} / ${restaurant.branchName || ""}` : "Restaurant Inventory"}
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
        <div className="flex items-center gap-3">
          <select
            className="border p-2 rounded"
            value={inventoryBulkAction}
            onChange={(e) => setInventoryBulkAction(e.target.value)}
          >
            {INVENTORY_BULK_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="px-4 py-2 bg-black text-white rounded"
            onClick={applyInventoryBulkAction}
          >
            Apply to selected
          </button>
        </div>

        <div className="overflow-x-auto border rounded">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Select", "Menu", "Category", "Item", "Price", "Availability"].map((x) => (
                  <th key={x} className="px-4 py-3 text-left text-sm font-medium text-gray-600">
                    {x}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200 bg-white">
              {inventoryRows.map((row) => {
                const checked = inventorySelection.includes(row.id);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setInventorySelection((prev) =>
                            e.target.checked ? [...prev, row.id] : prev.filter((x) => x !== row.id)
                          )
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-sm">{row.menuName}</td>
                    <td className="px-4 py-3 text-sm">{row.categoryName}</td>
                    <td className="px-4 py-3 text-sm">{row.itemName}</td>
                    <td className="px-4 py-3 text-sm">{row.price || "—"}</td>
                    <td className="px-4 py-3 text-sm">{row.availabilityState}</td>
                  </tr>
                );
              })}

              {inventoryRows.length === 0 && (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No inventory items found.
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