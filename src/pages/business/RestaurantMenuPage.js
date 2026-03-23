// src/pages/restaurants/RestaurantMenuPage.jsx
import React, { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import useRestaurantDoc from "../../hooks/useRestaurantDoc";

const SERVICE_MODES = ["delivery", "pickup", "dineIn", "menuOnly"];
const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
];

const createId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const toggleValueInArray = (current = [], value) =>
  current.includes(value) ? current.filter((x) => x !== value) : [...current, value];

const newModifierOption = () => ({
  id: createId("modopt"),
  name: "",
  priceDelta: "",
  isDefault: false,
  isAvailable: true,
  calories: "",
  nestedGroupIds: [],
});

const newModifierGroup = () => ({
  id: createId("modgrp"),
  name: "",
  description: "",
  selectionType: "single",
  isRequired: false,
  minSelect: 0,
  maxSelect: 1,
  freeCount: 0,
  appliesToServiceModes: ["delivery", "pickup", "dineIn"],
  options: [newModifierOption()],
});

const newMenuItem = () => ({
  id: createId("item"),
  name: "",
  price: "",
  compareAtPrice: "",
  description: "",
  isVeg: false,
  bestseller: false,
  spicyLevel: "",
  dietaryTags: [],
  allergenTags: [],
  image: "",
  imageFile: null,
  notesEnabled: true,
  availabilityState: "active",
  appliesToServiceModes: ["delivery", "pickup", "dineIn"],
  modifierGroups: [],
  schedule: {
    enabled: false,
    days: [],
    startTime: "",
    endTime: "",
  },
});

const newMenuCategory = () => ({
  id: createId("cat"),
  name: "",
  sortOrder: 0,
  items: [newMenuItem()],
});

const newMenu = () => ({
  id: createId("menu"),
  name: "Main Menu",
  type: "all_day",
  description: "",
  isActive: true,
  appliesToServiceModes: ["delivery", "pickup", "dineIn"],
  schedule: {
    enabled: false,
    days: [],
    startTime: "",
    endTime: "",
  },
  categories: [newMenuCategory()],
});

function DayToggleRow({ value = [], onToggle }) {
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS.map((day) => {
        const active = value.includes(day.key);
        return (
          <button
            key={day.key}
            type="button"
            onClick={() => onToggle(day.key)}
            className={`px-3 py-1 rounded-full text-xs border ${
              active
                ? "bg-black text-white border-black"
                : "bg-white text-gray-700 border-gray-300"
            }`}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  );
}

export default function RestaurantMenuPage() {
  const { restaurant, loading, updateRestaurant, restaurantId } = useRestaurantDoc();
  const [menus, setMenus] = useState([newMenu()]);

  useEffect(() => {
    if (Array.isArray(restaurant?.menus) && restaurant.menus.length) {
      setMenus(restaurant.menus);
    }
  }, [restaurant]);

  const addMenu = () => setMenus((prev) => [...prev, newMenu()]);
  const removeMenu = (menuId) => setMenus((prev) => prev.filter((m) => m.id !== menuId));
  const updateMenu = (menuId, patch) =>
    setMenus((prev) => prev.map((m) => (m.id === menuId ? { ...m, ...patch } : m)));

  const addCategory = (menuId) =>
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menuId
          ? { ...m, categories: [...(m.categories || []), newMenuCategory()] }
          : m
      )
    );

  const updateCategory = (menuId, catId, patch) =>
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menuId
          ? {
              ...m,
              categories: (m.categories || []).map((c) =>
                c.id === catId ? { ...c, ...patch } : c
              ),
            }
          : m
      )
    );

  const removeCategory = (menuId, catId) =>
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menuId
          ? { ...m, categories: (m.categories || []).filter((c) => c.id !== catId) }
          : m
      )
    );

  const addItem = (menuId, catId) =>
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menuId
          ? {
              ...m,
              categories: (m.categories || []).map((c) =>
                c.id === catId ? { ...c, items: [...(c.items || []), newMenuItem()] } : c
              ),
            }
          : m
      )
    );

  const updateItem = (menuId, catId, itemId, patch) =>
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menuId
          ? {
              ...m,
              categories: (m.categories || []).map((c) =>
                c.id === catId
                  ? {
                      ...c,
                      items: (c.items || []).map((it) =>
                        it.id === itemId ? { ...it, ...patch } : it
                      ),
                    }
                  : c
              ),
            }
          : m
      )
    );

  const removeItem = (menuId, catId, itemId) =>
    setMenus((prev) =>
      prev.map((m) =>
        m.id === menuId
          ? {
              ...m,
              categories: (m.categories || []).map((c) =>
                c.id === catId
                  ? { ...c, items: (c.items || []).filter((it) => it.id !== itemId) }
                  : c
              ),
            }
          : m
      )
    );

  const addModifierGroup = (menuId, catId, itemId) => {
    const item = menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);

    updateItem(menuId, catId, itemId, {
      modifierGroups: [...(item?.modifierGroups || []), newModifierGroup()],
    });
  };

  const updateModifierGroup = (menuId, catId, itemId, groupId, patch) => {
    const item = menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);

    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId ? { ...g, ...patch } : g
    );

    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const removeModifierGroup = (menuId, catId, itemId, groupId) => {
    const item = menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);

    const modifierGroups = (item?.modifierGroups || []).filter((g) => g.id !== groupId);
    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const addModifierOption = (menuId, catId, itemId, groupId) => {
    const item = menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);

    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId ? { ...g, options: [...(g.options || []), newModifierOption()] } : g
    );

    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const updateModifierOption = (menuId, catId, itemId, groupId, optionId, patch) => {
    const item = menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);

    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId
        ? {
            ...g,
            options: (g.options || []).map((o) =>
              o.id === optionId ? { ...o, ...patch } : o
            ),
          }
        : g
    );

    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const removeModifierOption = (menuId, catId, itemId, groupId, optionId) => {
    const item = menus
      .find((m) => m.id === menuId)
      ?.categories.find((c) => c.id === catId)
      ?.items.find((it) => it.id === itemId);

    const modifierGroups = (item?.modifierGroups || []).map((g) =>
      g.id === groupId
        ? { ...g, options: (g.options || []).filter((o) => o.id !== optionId) }
        : g
    );

    updateItem(menuId, catId, itemId, { modifierGroups });
  };

  const handleSave = async (e) => {
    e.preventDefault();

    const cleanedMenus = (menus || []).map((menu) => ({
      ...menu,
      categories: (menu.categories || []).map((cat, catIndex) => ({
        ...cat,
        sortOrder: cat.sortOrder === "" ? catIndex : Number(cat.sortOrder || catIndex),
        items: (cat.items || []).map((it) => ({
          ...it,
          price: it.price === "" ? null : Number(it.price),
          compareAtPrice: it.compareAtPrice === "" ? null : Number(it.compareAtPrice),
          modifierGroups: (it.modifierGroups || []).map((group) => ({
            ...group,
            minSelect: Number(group.minSelect || 0),
            maxSelect: Number(group.maxSelect || 0),
            freeCount: Number(group.freeCount || 0),
            options: (group.options || []).map((opt) => ({
              ...opt,
              priceDelta: opt.priceDelta === "" ? 0 : Number(opt.priceDelta || 0),
              calories: opt.calories === "" ? null : Number(opt.calories),
            })),
          })),
        })),
      })),
    }));

    await updateRestaurant({ menus: cleanedMenus }, "Menus updated ✅");
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!restaurantId) return <div className="p-6">Employee restaurant id not found.</div>;

  return (
    <main className="p-6 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Menus / Modifiers</h1>
            <p className="text-sm text-gray-500">
              {restaurant?.branchName || restaurant?.brandName || "Restaurant"}
            </p>
          </div>
          <button type="button" onClick={addMenu} className="px-4 py-2 bg-black text-white rounded">
            + Add Menu
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {menus.map((menu) => (
            <div key={menu.id} className="border rounded-xl p-4 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                <input
                  className="border rounded p-2"
                  value={menu.name}
                  onChange={(e) => updateMenu(menu.id, { name: e.target.value })}
                  placeholder="Menu name"
                />
                <select
                  className="border rounded p-2"
                  value={menu.type}
                  onChange={(e) => updateMenu(menu.id, { type: e.target.value })}
                >
                  <option value="all_day">All Day</option>
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="late_night">Late Night</option>
                  <option value="specials">Specials</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!menu.isActive}
                    onChange={(e) => updateMenu(menu.id, { isActive: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  type="button"
                  onClick={() => removeMenu(menu.id)}
                  className="border rounded px-3 py-2"
                >
                  Delete Menu
                </button>
              </div>

              <textarea
                className="border rounded p-2 w-full"
                rows={2}
                value={menu.description || ""}
                onChange={(e) => updateMenu(menu.id, { description: e.target.value })}
                placeholder="Menu description"
              />

              <div>
                <div className="text-sm font-medium mb-2">Service modes</div>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_MODES.filter((x) => x !== "menuOnly").map((mode) => {
                    const active = (menu.appliesToServiceModes || []).includes(mode);
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() =>
                          updateMenu(menu.id, {
                            appliesToServiceModes: toggleValueInArray(
                              menu.appliesToServiceModes || [],
                              mode
                            ),
                          })
                        }
                        className={`px-3 py-1 rounded-full text-xs border ${
                          active
                            ? "bg-black text-white border-black"
                            : "bg-white text-gray-700 border-gray-300"
                        }`}
                      >
                        {mode}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!menu.schedule?.enabled}
                    onChange={(e) =>
                      updateMenu(menu.id, {
                        schedule: { ...(menu.schedule || {}), enabled: e.target.checked },
                      })
                    }
                  />
                  Time-based menu
                </label>
              </div>

              {!!menu.schedule?.enabled && (
                <div className="border rounded p-3 bg-gray-50 space-y-3">
                  <DayToggleRow
                    value={menu.schedule?.days || []}
                    onToggle={(dayKey) =>
                      updateMenu(menu.id, {
                        schedule: {
                          ...(menu.schedule || {}),
                          days: toggleValueInArray(menu.schedule?.days || [], dayKey),
                        },
                      })
                    }
                  />
                  <div className="flex gap-2">
                    <input
                      type="time"
                      className="border rounded p-2"
                      value={menu.schedule?.startTime || ""}
                      onChange={(e) =>
                        updateMenu(menu.id, {
                          schedule: { ...(menu.schedule || {}), startTime: e.target.value },
                        })
                      }
                    />
                    <input
                      type="time"
                      className="border rounded p-2"
                      value={menu.schedule?.endTime || ""}
                      onChange={(e) =>
                        updateMenu(menu.id, {
                          schedule: { ...(menu.schedule || {}), endTime: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => addCategory(menu.id)}
                  className="px-4 py-2 bg-gray-900 text-white rounded"
                >
                  + Add Category
                </button>
              </div>

              {(menu.categories || []).map((cat) => (
                <div key={cat.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 border rounded p-2"
                      value={cat.name}
                      onChange={(e) => updateCategory(menu.id, cat.id, { name: e.target.value })}
                      placeholder="Category name"
                    />
                    <input
                      className="w-24 border rounded p-2"
                      value={cat.sortOrder}
                      onChange={(e) =>
                        updateCategory(menu.id, cat.id, { sortOrder: e.target.value })
                      }
                      placeholder="Sort"
                    />
                    <button
                      type="button"
                      onClick={() => removeCategory(menu.id, cat.id)}
                      className="border rounded px-3"
                    >
                      Delete
                    </button>
                  </div>

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => addItem(menu.id, cat.id)}
                      className="px-4 py-2 bg-black text-white rounded"
                    >
                      + Add Item
                    </button>
                  </div>

                  {(cat.items || []).map((it) => (
                    <div key={it.id} className="border rounded p-3 bg-gray-50 space-y-3">
                      <div className="grid grid-cols-12 gap-2">
                        <input
                          className="col-span-3 border rounded p-2"
                          value={it.name}
                          onChange={(e) => updateItem(menu.id, cat.id, it.id, { name: e.target.value })}
                          placeholder="Item name"
                        />
                        <input
                          className="col-span-2 border rounded p-2"
                          value={it.price}
                          onChange={(e) => updateItem(menu.id, cat.id, it.id, { price: e.target.value })}
                          placeholder="Price"
                        />
                        <input
                          className="col-span-2 border rounded p-2"
                          value={it.compareAtPrice}
                          onChange={(e) =>
                            updateItem(menu.id, cat.id, it.id, { compareAtPrice: e.target.value })
                          }
                          placeholder="Compare price"
                        />
                        <input
                          className="col-span-2 border rounded p-2"
                          value={it.spicyLevel || ""}
                          onChange={(e) =>
                            updateItem(menu.id, cat.id, it.id, { spicyLevel: e.target.value })
                          }
                          placeholder="Spicy level"
                        />
                        <select
                          className="col-span-2 border rounded p-2"
                          value={it.availabilityState}
                          onChange={(e) =>
                            updateItem(menu.id, cat.id, it.id, { availabilityState: e.target.value })
                          }
                        >
                          <option value="active">Active</option>
                          <option value="sold_out">Sold Out</option>
                          <option value="hidden">Hidden</option>
                          <option value="scheduled">Scheduled</option>
                          <option value="archived">Archived</option>
                        </select>
                        <button
                          type="button"
                          onClick={() => removeItem(menu.id, cat.id, it.id)}
                          className="col-span-1 text-red-600"
                        >
                          Remove
                        </button>
                      </div>

                      <textarea
                        className="w-full border rounded p-2"
                        rows={2}
                        placeholder="Item description"
                        value={it.description || ""}
                        onChange={(e) =>
                          updateItem(menu.id, cat.id, it.id, { description: e.target.value })
                        }
                      />

                      <div className="flex flex-wrap gap-4 text-sm">
                        {[
                          ["isVeg", "Veg"],
                          ["bestseller", "Bestseller"],
                          ["notesEnabled", "Notes enabled"],
                        ].map(([key, label]) => (
                          <label key={key} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={!!it[key]}
                              onChange={(e) =>
                                updateItem(menu.id, cat.id, it.id, { [key]: e.target.checked })
                              }
                            />
                            {label}
                          </label>
                        ))}
                      </div>

                      <div>
                        <div className="text-sm font-medium mb-2">Item service modes</div>
                        <div className="flex flex-wrap gap-2">
                          {SERVICE_MODES.filter((x) => x !== "menuOnly").map((mode) => {
                            const active = (it.appliesToServiceModes || []).includes(mode);
                            return (
                              <button
                                key={mode}
                                type="button"
                                onClick={() =>
                                  updateItem(menu.id, cat.id, it.id, {
                                    appliesToServiceModes: toggleValueInArray(
                                      it.appliesToServiceModes || [],
                                      mode
                                    ),
                                  })
                                }
                                className={`px-3 py-1 rounded-full text-xs border ${
                                  active
                                    ? "bg-black text-white border-black"
                                    : "bg-white text-gray-700 border-gray-300"
                                }`}
                              >
                                {mode}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border rounded p-3 bg-white space-y-3">
                        <div className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={!!it.schedule?.enabled}
                            onChange={(e) =>
                              updateItem(menu.id, cat.id, it.id, {
                                schedule: { ...(it.schedule || {}), enabled: e.target.checked },
                              })
                            }
                          />
                          Scheduled availability
                        </div>

                        {!!it.schedule?.enabled && (
                          <>
                            <DayToggleRow
                              value={it.schedule?.days || []}
                              onToggle={(dayKey) =>
                                updateItem(menu.id, cat.id, it.id, {
                                  schedule: {
                                    ...(it.schedule || {}),
                                    days: toggleValueInArray(it.schedule?.days || [], dayKey),
                                  },
                                })
                              }
                            />
                            <div className="flex gap-2">
                              <input
                                type="time"
                                className="border rounded p-2"
                                value={it.schedule?.startTime || ""}
                                onChange={(e) =>
                                  updateItem(menu.id, cat.id, it.id, {
                                    schedule: {
                                      ...(it.schedule || {}),
                                      startTime: e.target.value,
                                    },
                                  })
                                }
                              />
                              <input
                                type="time"
                                className="border rounded p-2"
                                value={it.schedule?.endTime || ""}
                                onChange={(e) =>
                                  updateItem(menu.id, cat.id, it.id, {
                                    schedule: {
                                      ...(it.schedule || {}),
                                      endTime: e.target.value,
                                    },
                                  })
                                }
                              />
                            </div>
                          </>
                        )}
                      </div>

                      <div className="border rounded p-3 bg-white space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">Modifier Groups</div>
                          <button
                            type="button"
                            onClick={() => addModifierGroup(menu.id, cat.id, it.id)}
                            className="px-3 py-1.5 bg-gray-900 text-white rounded text-sm"
                          >
                            + Add Modifier Group
                          </button>
                        </div>

                        {(it.modifierGroups || []).map((group) => (
                          <div key={group.id} className="border rounded p-3 bg-gray-50 space-y-3">
                            <div className="grid grid-cols-12 gap-2 items-center">
                              <input
                                className="col-span-3 border rounded p-2"
                                value={group.name}
                                onChange={(e) =>
                                  updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Group name"
                              />
                              <select
                                className="col-span-2 border rounded p-2"
                                value={group.selectionType}
                                onChange={(e) =>
                                  updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                    selectionType: e.target.value,
                                    maxSelect: e.target.value === "single" ? 1 : group.maxSelect,
                                  })
                                }
                              >
                                <option value="single">Single</option>
                                <option value="multi">Multi</option>
                              </select>
                              <label className="col-span-2 text-sm flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!group.isRequired}
                                  onChange={(e) =>
                                    updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                      isRequired: e.target.checked,
                                    })
                                  }
                                />
                                Required
                              </label>
                              <input
                                className="col-span-1 border rounded p-2"
                                value={group.minSelect}
                                onChange={(e) =>
                                  updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                    minSelect: e.target.value,
                                  })
                                }
                                placeholder="Min"
                              />
                              <input
                                className="col-span-1 border rounded p-2"
                                value={group.maxSelect}
                                onChange={(e) =>
                                  updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                    maxSelect: e.target.value,
                                  })
                                }
                                placeholder="Max"
                              />
                              <input
                                className="col-span-2 border rounded p-2"
                                value={group.freeCount}
                                onChange={(e) =>
                                  updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                    freeCount: e.target.value,
                                  })
                                }
                                placeholder="Free count"
                              />
                              <button
                                type="button"
                                className="col-span-1 text-red-600"
                                onClick={() =>
                                  removeModifierGroup(menu.id, cat.id, it.id, group.id)
                                }
                              >
                                Remove
                              </button>
                            </div>

                            <textarea
                              className="w-full border rounded p-2"
                              rows={2}
                              value={group.description || ""}
                              onChange={(e) =>
                                updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                  description: e.target.value,
                                })
                              }
                              placeholder="Description"
                            />

                            <div>
                              <div className="text-sm font-medium mb-2">
                                Applies to service modes
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {SERVICE_MODES.filter((x) => x !== "menuOnly").map((mode) => {
                                  const active = (group.appliesToServiceModes || []).includes(mode);
                                  return (
                                    <button
                                      key={mode}
                                      type="button"
                                      onClick={() =>
                                        updateModifierGroup(menu.id, cat.id, it.id, group.id, {
                                          appliesToServiceModes: toggleValueInArray(
                                            group.appliesToServiceModes || [],
                                            mode
                                          ),
                                        })
                                      }
                                      className={`px-3 py-1 rounded-full text-xs border ${
                                        active
                                          ? "bg-black text-white border-black"
                                          : "bg-white text-gray-700 border-gray-300"
                                      }`}
                                    >
                                      {mode}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="text-sm font-medium">Options</div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    addModifierOption(menu.id, cat.id, it.id, group.id)
                                  }
                                  className="px-3 py-1 bg-black text-white rounded text-xs"
                                >
                                  + Add Option
                                </button>
                              </div>

                              {(group.options || []).map((opt) => (
                                <div
                                  key={opt.id}
                                  className="grid grid-cols-12 gap-2 border rounded p-2 bg-white items-center"
                                >
                                  <input
                                    className="col-span-3 border rounded p-2"
                                    value={opt.name}
                                    onChange={(e) =>
                                      updateModifierOption(
                                        menu.id,
                                        cat.id,
                                        it.id,
                                        group.id,
                                        opt.id,
                                        { name: e.target.value }
                                      )
                                    }
                                    placeholder="Option name"
                                  />
                                  <input
                                    className="col-span-2 border rounded p-2"
                                    value={opt.priceDelta}
                                    onChange={(e) =>
                                      updateModifierOption(
                                        menu.id,
                                        cat.id,
                                        it.id,
                                        group.id,
                                        opt.id,
                                        { priceDelta: e.target.value }
                                      )
                                    }
                                    placeholder="Price delta"
                                  />
                                  <input
                                    className="col-span-2 border rounded p-2"
                                    value={opt.calories}
                                    onChange={(e) =>
                                      updateModifierOption(
                                        menu.id,
                                        cat.id,
                                        it.id,
                                        group.id,
                                        opt.id,
                                        { calories: e.target.value }
                                      )
                                    }
                                    placeholder="Calories"
                                  />
                                  <label className="col-span-2 text-sm flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!!opt.isDefault}
                                      onChange={(e) =>
                                        updateModifierOption(
                                          menu.id,
                                          cat.id,
                                          it.id,
                                          group.id,
                                          opt.id,
                                          { isDefault: e.target.checked }
                                        )
                                      }
                                    />
                                    Default
                                  </label>
                                  <label className="col-span-2 text-sm flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={!!opt.isAvailable}
                                      onChange={(e) =>
                                        updateModifierOption(
                                          menu.id,
                                          cat.id,
                                          it.id,
                                          group.id,
                                          opt.id,
                                          { isAvailable: e.target.checked }
                                        )
                                      }
                                    />
                                    Available
                                  </label>
                                  <button
                                    type="button"
                                    className="col-span-1 text-red-600"
                                    onClick={() =>
                                      removeModifierOption(
                                        menu.id,
                                        cat.id,
                                        it.id,
                                        group.id,
                                        opt.id
                                      )
                                    }
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}

          <div className="flex justify-end">
            <button className="px-5 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
              Save Menus
            </button>
          </div>
        </form>
      </div>

      <ToastContainer />
    </main>
  );
}