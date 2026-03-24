// src/pages/restaurants/RestaurantMenuPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { ToastContainer, toast } from "react-toastify";
import useRestaurantDoc from "../../hooks/useRestaurantDoc";

const createId = (prefix) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const newVariantOption = () => ({
  id: createId("variant"),
  name: "",
  price: "",
  isDefault: false,
});

const newIngredientOption = () => ({
  id: createId("ingredient"),
  name: "",
  selected: true,
});

const newExtraOption = () => ({
  id: createId("extra"),
  name: "",
  price: "",
});

const newMenuItem = () => ({
  id: createId("item"),
  name: "",
  description: "",
  image: "",
  basePrice: "",
  compareAtPrice: "",
  isVeg: false,
  bestseller: false,
  availabilityState: "active",

  variantGroup: {
    enabled: false,
    title: "",
    required: false,
    options: [],
  },

  removableIngredients: {
    enabled: false,
    title: "",
    helperText: "",
    options: [],
  },

  extrasGroup: {
    enabled: false,
    title: "",
    options: [],
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
  name: "",
  type: "all_day",
  description: "",
  isActive: true,
  categories: [newMenuCategory()],
});

const normalizeMenusFromDb = (dbMenus = []) => {
  return dbMenus.map((menu) => ({
    id: menu.id || createId("menu"),
    name: menu.name || "",
    type: menu.type || "all_day",
    description: menu.description || "",
    isActive: menu.isActive !== false,
    categories: (menu.categories || []).map((cat, catIndex) => ({
      id: cat.id || createId("cat"),
      name: cat.name || "",
      sortOrder: cat.sortOrder ?? catIndex,
      items: (cat.items || []).map((it) => {
        const modifierGroups = Array.isArray(it.modifierGroups) ? it.modifierGroups : [];

        const sizeGroup =
          it.variantGroup ||
          modifierGroups.find((g) => g?.id === "sizes" || g?.name === "Sizes") || {
            enabled: false,
            title: "",
            required: false,
            options: [],
          };

        const removeGroup =
          it.removableIngredients ||
          modifierGroups.find(
            (g) =>
              g?.id === "remove_ingredients" || g?.name === "Ingredients (remove)"
          ) || {
            enabled: false,
            title: "",
            helperText: "",
            options: [],
          };

        const extrasGroup =
          it.extrasGroup ||
          modifierGroups.find((g) => g?.id === "extras" || g?.name === "Extras") || {
            enabled: false,
            title: "",
            options: [],
          };

        return {
          id: it.id || createId("item"),
          name: it.name || "",
          description: it.description || "",
          image: it.image || "",
          basePrice:
            it.basePrice !== undefined && it.basePrice !== null
              ? String(it.basePrice)
              : it.price !== undefined && it.price !== null
                ? String(it.price)
                : "",
          compareAtPrice:
            it.compareAtPrice !== undefined && it.compareAtPrice !== null
              ? String(it.compareAtPrice)
              : "",
          isVeg: !!it.isVeg,
          bestseller: !!it.bestseller,
          availabilityState: it.availabilityState || "active",

          variantGroup: {
            enabled: !!sizeGroup?.enabled || (sizeGroup?.options || []).length > 0,
            title: sizeGroup?.title || sizeGroup?.name || "",
            required:
              sizeGroup?.required !== undefined
                ? !!sizeGroup.required
                : !!sizeGroup?.isRequired,
            options: (sizeGroup?.options || []).map((opt, idx) => ({
              id: opt.id || createId("variant"),
              name: opt.name || "",
              price:
                opt.price !== undefined && opt.price !== null
                  ? String(opt.price)
                  : opt.priceDelta !== undefined && opt.priceDelta !== null
                    ? String(opt.priceDelta)
                    : "",
              isDefault: idx === 0 ? !!opt.isDefault || true : !!opt.isDefault,
            })),
          },

          removableIngredients: {
            enabled: !!removeGroup?.enabled || (removeGroup?.options || []).length > 0,
            title: removeGroup?.title || removeGroup?.name || "",
            helperText: removeGroup?.helperText || "",
            options: (removeGroup?.options || []).map((opt) => ({
              id: opt.id || createId("ingredient"),
              name: opt.name || "",
              selected:
                opt.selected !== undefined
                  ? !!opt.selected
                  : opt.isDefault !== undefined
                    ? !!opt.isDefault
                    : true,
            })),
          },

          extrasGroup: {
            enabled: !!extrasGroup?.enabled || (extrasGroup?.options || []).length > 0,
            title: extrasGroup?.title || extrasGroup?.name || "",
            options: (extrasGroup?.options || []).map((opt) => ({
              id: opt.id || createId("extra"),
              name: opt.name || "",
              price:
                opt.price !== undefined && opt.price !== null
                  ? String(opt.price)
                  : opt.priceDelta !== undefined && opt.priceDelta !== null
                    ? String(opt.priceDelta)
                    : "",
            })),
          },
        };
      }),
    })),
  }));
};

const buildModifierGroupsFromSimpleItem = (item) => {
  const groups = [];

  if (
    item.variantGroup?.enabled &&
    item.variantGroup?.title?.trim() &&
    (item.variantGroup?.options || []).length
  ) {
    groups.push({
      id: "sizes",
      name: item.variantGroup.title.trim(),
      title: item.variantGroup.title.trim(),
      description: "",
      selectionType: "single",
      isRequired: item.variantGroup.required !== false,
      minSelect: item.variantGroup.required !== false ? 1 : 0,
      maxSelect: 1,
      freeCount: 0,
      enabled: true,
      required: item.variantGroup.required !== false,
      options: (item.variantGroup.options || [])
        .filter((opt) => opt.name?.trim())
        .map((opt) => ({
          id: opt.id,
          name: opt.name.trim(),
          price: opt.price === "" ? null : Number(opt.price),
          priceDelta: opt.price === "" ? 0 : Number(opt.price),
          isDefault: !!opt.isDefault,
          isAvailable: true,
        })),
    });
  }

  if (
    item.removableIngredients?.enabled &&
    item.removableIngredients?.title?.trim() &&
    (item.removableIngredients?.options || []).length
  ) {
    groups.push({
      id: "remove_ingredients",
      name: item.removableIngredients.title.trim(),
      title: item.removableIngredients.title.trim(),
      description: item.removableIngredients.helperText || "",
      selectionType: "multi",
      isRequired: false,
      minSelect: 0,
      maxSelect: item.removableIngredients.options.length,
      freeCount: item.removableIngredients.options.length,
      enabled: true,
      helperText: item.removableIngredients.helperText || "",
      options: (item.removableIngredients.options || [])
        .filter((opt) => opt.name?.trim())
        .map((opt) => ({
          id: opt.id,
          name: opt.name.trim(),
          price: 0,
          priceDelta: 0,
          isDefault: opt.selected !== false,
          selected: opt.selected !== false,
          isAvailable: true,
        })),
    });
  }

  if (
    item.extrasGroup?.enabled &&
    item.extrasGroup?.title?.trim() &&
    (item.extrasGroup?.options || []).length
  ) {
    groups.push({
      id: "extras",
      name: item.extrasGroup.title.trim(),
      title: item.extrasGroup.title.trim(),
      description: "",
      selectionType: "multi",
      isRequired: false,
      minSelect: 0,
      maxSelect: item.extrasGroup.options.length,
      freeCount: 0,
      enabled: true,
      options: (item.extrasGroup.options || [])
        .filter((opt) => opt.name?.trim())
        .map((opt) => ({
          id: opt.id,
          name: opt.name.trim(),
          price: opt.price === "" ? null : Number(opt.price),
          priceDelta: opt.price === "" ? 0 : Number(opt.price),
          isDefault: false,
          isAvailable: true,
        })),
    });
  }

  return groups.filter((group) => group.options.length > 0);
};

function SectionCard({ title, children, right }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-3">
        <h3 className="font-semibold text-gray-800">{title}</h3>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export default function RestaurantMenuPage() {
  const { restaurant, loading, updateRestaurant, restaurantId } = useRestaurantDoc();
  const [menus, setMenus] = useState([newMenu()]);

  useEffect(() => {
    if (Array.isArray(restaurant?.menus) && restaurant.menus.length) {
      setMenus(normalizeMenusFromDb(restaurant.menus));
    }
  }, [restaurant]);

  const addMenu = () => setMenus((prev) => [...prev, newMenu()]);

  const removeMenu = (menuId) =>
    setMenus((prev) => prev.filter((menu) => menu.id !== menuId));

  const updateMenu = (menuId, patch) =>
    setMenus((prev) =>
      prev.map((menu) => (menu.id === menuId ? { ...menu, ...patch } : menu))
    );

  const addCategory = (menuId) =>
    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? { ...menu, categories: [...(menu.categories || []), newMenuCategory()] }
          : menu
      )
    );

  const updateCategory = (menuId, categoryId, patch) =>
    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? {
            ...menu,
            categories: (menu.categories || []).map((cat) =>
              cat.id === categoryId ? { ...cat, ...patch } : cat
            ),
          }
          : menu
      )
    );

  const removeCategory = (menuId, categoryId) =>
    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? {
            ...menu,
            categories: (menu.categories || []).filter((cat) => cat.id !== categoryId),
          }
          : menu
      )
    );

  const addItem = (menuId, categoryId) =>
    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? {
            ...menu,
            categories: (menu.categories || []).map((cat) =>
              cat.id === categoryId
                ? { ...cat, items: [...(cat.items || []), newMenuItem()] }
                : cat
            ),
          }
          : menu
      )
    );

  const updateItem = (menuId, categoryId, itemId, patch) =>
    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? {
            ...menu,
            categories: (menu.categories || []).map((cat) =>
              cat.id === categoryId
                ? {
                  ...cat,
                  items: (cat.items || []).map((item) =>
                    item.id === itemId ? { ...item, ...patch } : item
                  ),
                }
                : cat
            ),
          }
          : menu
      )
    );

  const removeItem = (menuId, categoryId, itemId) =>
    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? {
            ...menu,
            categories: (menu.categories || []).map((cat) =>
              cat.id === categoryId
                ? {
                  ...cat,
                  items: (cat.items || []).filter((item) => item.id !== itemId),
                }
                : cat
            ),
          }
          : menu
      )
    );

  const updateItemSection = (menuId, categoryId, itemId, sectionKey, patch) => {
    const menu = menus.find((m) => m.id === menuId);
    const category = menu?.categories?.find((c) => c.id === categoryId);
    const item = category?.items?.find((i) => i.id === itemId);

    updateItem(menuId, categoryId, itemId, {
      [sectionKey]: {
        ...(item?.[sectionKey] || {}),
        ...patch,
      },
    });
  };

  const addSectionOption = (menuId, categoryId, itemId, sectionKey) => {
    const menu = menus.find((m) => m.id === menuId);
    const category = menu?.categories?.find((c) => c.id === categoryId);
    const item = category?.items?.find((i) => i.id === itemId);
    const section = item?.[sectionKey];

    let nextOption = {};
    if (sectionKey === "variantGroup") nextOption = newVariantOption();
    if (sectionKey === "removableIngredients") nextOption = newIngredientOption();
    if (sectionKey === "extrasGroup") nextOption = newExtraOption();

    updateItemSection(menuId, categoryId, itemId, sectionKey, {
      options: [...(section?.options || []), nextOption],
    });
  };

  const updateSectionOption = (
    menuId,
    categoryId,
    itemId,
    sectionKey,
    optionId,
    patch
  ) => {
    const menu = menus.find((m) => m.id === menuId);
    const category = menu?.categories?.find((c) => c.id === categoryId);
    const item = category?.items?.find((i) => i.id === itemId);
    const section = item?.[sectionKey];

    const updatedOptions = (section?.options || []).map((opt) =>
      opt.id === optionId ? { ...opt, ...patch } : opt
    );

    updateItemSection(menuId, categoryId, itemId, sectionKey, {
      options: updatedOptions,
    });
  };

  const removeSectionOption = (
    menuId,
    categoryId,
    itemId,
    sectionKey,
    optionId
  ) => {
    const menu = menus.find((m) => m.id === menuId);
    const category = menu?.categories?.find((c) => c.id === categoryId);
    const item = category?.items?.find((i) => i.id === itemId);
    const section = item?.[sectionKey];

    const updatedOptions = (section?.options || []).filter((opt) => opt.id !== optionId);

    let finalOptions = updatedOptions;
    if (
      sectionKey === "variantGroup" &&
      updatedOptions.length > 0 &&
      !updatedOptions.some((opt) => opt.isDefault)
    ) {
      finalOptions = updatedOptions.map((opt, idx) =>
        idx === 0 ? { ...opt, isDefault: true } : opt
      );
    }

    updateItemSection(menuId, categoryId, itemId, sectionKey, {
      options: finalOptions,
    });
  };

  const setDefaultVariant = (menuId, categoryId, itemId, optionId) => {
    const menu = menus.find((m) => m.id === menuId);
    const category = menu?.categories?.find((c) => c.id === categoryId);
    const item = category?.items?.find((i) => i.id === itemId);

    const options = (item?.variantGroup?.options || []).map((opt) => ({
      ...opt,
      isDefault: opt.id === optionId,
    }));

    updateItemSection(menuId, categoryId, itemId, "variantGroup", { options });
  };

  const totalItems = useMemo(() => {
    return menus.reduce((acc, menu) => {
      return (
        acc +
        (menu.categories || []).reduce((catAcc, cat) => catAcc + (cat.items || []).length, 0)
      );
    }, 0);
  }, [menus]);

  const validateMenus = () => {
    for (const menu of menus) {
      if (!menu.name?.trim()) {
        toast.error("Menu name required");
        return false;
      }

      for (const category of menu.categories || []) {
        if (!category.name?.trim()) {
          toast.error("Each category needs a name");
          return false;
        }

        for (const item of category.items || []) {
          if (!item.name?.trim()) {
            toast.error("Each item needs a name");
            return false;
          }

          if (
            item.variantGroup?.enabled &&
            !item.variantGroup?.title?.trim()
          ) {
            toast.error(`"${item.name}" me size group title chahiye`);
            return false;
          }

          if (
            item.variantGroup?.enabled &&
            !(item.variantGroup?.options || []).some((opt) => opt.name?.trim())
          ) {
            toast.error(`"${item.name}" me at least 1 size option chahiye`);
            return false;
          }

          if (
            item.removableIngredients?.enabled &&
            !item.removableIngredients?.title?.trim()
          ) {
            toast.error(`"${item.name}" me ingredients group title chahiye`);
            return false;
          }

          if (
            item.extrasGroup?.enabled &&
            !item.extrasGroup?.title?.trim()
          ) {
            toast.error(`"${item.name}" me extras group title chahiye`);
            return false;
          }
        }
      }
    }

    return true;
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!validateMenus()) return;

    const cleanedMenus = (menus || []).map((menu) => ({
      id: menu.id,
      name: menu.name.trim(),
      type: menu.type || "all_day",
      description: menu.description || "",
      isActive: menu.isActive !== false,
      categories: (menu.categories || []).map((cat, catIndex) => ({
        id: cat.id,
        name: cat.name.trim(),
        sortOrder: cat.sortOrder === "" ? catIndex : Number(cat.sortOrder || catIndex),
        items: (cat.items || []).map((item) => {
          const basePriceNumber =
            item.basePrice === "" || item.basePrice === null
              ? null
              : Number(item.basePrice);

          const compareAtPriceNumber =
            item.compareAtPrice === "" || item.compareAtPrice === null
              ? null
              : Number(item.compareAtPrice);

          const normalizedItem = {
            id: item.id,
            name: item.name.trim(),
            description: item.description || "",
            image: item.image || "",
            price: basePriceNumber,
            basePrice: basePriceNumber,
            compareAtPrice: compareAtPriceNumber,
            isVeg: !!item.isVeg,
            bestseller: !!item.bestseller,
            availabilityState: item.availabilityState || "active",

            variantGroup: {
              enabled: !!item.variantGroup?.enabled,
              title: item.variantGroup?.title || "",
              required: item.variantGroup?.required !== false,
              options: (item.variantGroup?.options || [])
                .filter((opt) => opt.name?.trim())
                .map((opt, idx) => ({
                  id: opt.id,
                  name: opt.name.trim(),
                  price: opt.price === "" ? null : Number(opt.price),
                  isDefault: !!opt.isDefault || idx === 0,
                })),
            },

            removableIngredients: {
              enabled: !!item.removableIngredients?.enabled,
              title: item.removableIngredients?.title || "",
              helperText: item.removableIngredients?.helperText || "",
              options: (item.removableIngredients?.options || [])
                .filter((opt) => opt.name?.trim())
                .map((opt) => ({
                  id: opt.id,
                  name: opt.name.trim(),
                  selected: opt.selected !== false,
                })),
            },

            extrasGroup: {
              enabled: !!item.extrasGroup?.enabled,
              title: item.extrasGroup?.title || "",
              options: (item.extrasGroup?.options || [])
                .filter((opt) => opt.name?.trim())
                .map((opt) => ({
                  id: opt.id,
                  name: opt.name.trim(),
                  price: opt.price === "" ? null : Number(opt.price),
                })),
            },
          };

          return {
            ...normalizedItem,
            modifierGroups: buildModifierGroupsFromSimpleItem(normalizedItem),
          };
        }),
      })),
    }));

    await updateRestaurant({ menus: cleanedMenus }, "Menus updated ✅");
  };

  if (loading) return <div className="p-6">Loading...</div>;
  if (!restaurantId) return <div className="p-6">Employee restaurant id not found.</div>;

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Menus / Modifiers</h1>
              <p className="text-sm text-gray-500">
                {restaurant?.branchName || restaurant?.brandName || "Restaurant"}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Simple flow: Menu → Category → Item → Sizes / Remove Ingredients / Extras
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
                {menus.length} menu • {totalItems} item
              </div>
              <button
                type="button"
                onClick={addMenu}
                className="rounded-lg bg-black px-4 py-2 text-white"
              >
                + Add Menu
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {menus.map((menu) => (
            <div key={menu.id} className="rounded-2xl border bg-white shadow-sm">
              <div className="border-b p-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                  <input
                    className="rounded-lg border p-3 md:col-span-2"
                    value={""}
                    onChange={(e) => updateMenu(menu.id, { name: e.target.value })}
                    placeholder="Menu name"
                  />

                  <select
                    className="rounded-lg border p-3"
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

                  <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={!!menu.isActive}
                      onChange={(e) => updateMenu(menu.id, { isActive: e.target.checked })}
                    />
                    Active menu
                  </label>

                  <button
                    type="button"
                    onClick={() => removeMenu(menu.id)}
                    className="rounded-lg border border-red-200 px-4 py-3 text-red-600"
                  >
                    Delete Menu
                  </button>
                </div>

                <textarea
                  className="mt-3 w-full rounded-lg border p-3"
                  rows={2}
                  value={menu.description || ""}
                  onChange={(e) => updateMenu(menu.id, { description: e.target.value })}
                  placeholder="Menu description"
                />
              </div>

              <div className="space-y-4 p-5">
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => addCategory(menu.id)}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-white"
                  >
                    + Add Category
                  </button>
                </div>

                {(menu.categories || []).map((category) => (
                  <div key={category.id} className="rounded-xl border bg-gray-50 p-4">
                    <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px]">
                      <input
                        className="rounded-lg border bg-white p-3"
                        value={category.name}
                        onChange={(e) =>
                          updateCategory(menu.id, category.id, { name: e.target.value })
                        }
                        placeholder="Category name ex: Pizza, Burgers, Drinks"
                      />

                      <input
                        className="rounded-lg border bg-white p-3"
                        value={category.sortOrder}
                        onChange={(e) =>
                          updateCategory(menu.id, category.id, { sortOrder: e.target.value })
                        }
                        placeholder="Sort"
                      />

                      <button
                        type="button"
                        onClick={() => removeCategory(menu.id, category.id)}
                        className="rounded-lg border border-red-200 bg-white px-4 py-3 text-red-600"
                      >
                        Delete Category
                      </button>
                    </div>

                    <div className="mb-4 flex justify-end">
                      <button
                        type="button"
                        onClick={() => addItem(menu.id, category.id)}
                        className="rounded-lg bg-black px-4 py-2 text-white"
                      >
                        + Add Item
                      </button>
                    </div>

                    <div className="space-y-5">
                      {(category.items || []).map((item) => (
                        <div key={item.id} className="space-y-4 rounded-xl border bg-white p-4">
                          <div className="flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">
                              {item.name?.trim() || "New Item"}
                            </h3>
                            <button
                              type="button"
                              onClick={() => removeItem(menu.id, category.id, item.id)}
                              className="text-sm text-red-600"
                            >
                              Remove Item
                            </button>
                          </div>

                          <SectionCard title="Basic Details">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
                              <input
                                className="rounded-lg border p-3 md:col-span-3"
                                value={item.name}
                                onChange={(e) =>
                                  updateItem(menu.id, category.id, item.id, {
                                    name: e.target.value,
                                  })
                                }
                                placeholder="Item name"
                              />

                              <input
                                className="rounded-lg border p-3 md:col-span-2"
                                value={item.basePrice}
                                onChange={(e) =>
                                  updateItem(menu.id, category.id, item.id, {
                                    basePrice: e.target.value,
                                  })
                                }
                                placeholder="Base price"
                              />

                              <input
                                className="rounded-lg border p-3 md:col-span-2"
                                value={item.compareAtPrice}
                                onChange={(e) =>
                                  updateItem(menu.id, category.id, item.id, {
                                    compareAtPrice: e.target.value,
                                  })
                                }
                                placeholder="Compare price"
                              />

                              <select
                                className="rounded-lg border p-3 md:col-span-2"
                                value={item.availabilityState}
                                onChange={(e) =>
                                  updateItem(menu.id, category.id, item.id, {
                                    availabilityState: e.target.value,
                                  })
                                }
                              >
                                <option value="active">Active</option>
                                <option value="sold_out">Sold Out</option>
                                <option value="hidden">Hidden</option>
                                <option value="scheduled">Scheduled</option>
                                <option value="archived">Archived</option>
                              </select>

                              <input
                                className="rounded-lg border p-3 md:col-span-3"
                                value={item.image}
                                onChange={(e) =>
                                  updateItem(menu.id, category.id, item.id, {
                                    image: e.target.value,
                                  })
                                }
                                placeholder="Image URL"
                              />
                            </div>

                            <textarea
                              className="mt-3 w-full rounded-lg border p-3"
                              rows={2}
                              value={item.description}
                              onChange={(e) =>
                                updateItem(menu.id, category.id, item.id, {
                                  description: e.target.value,
                                })
                              }
                              placeholder="Item description"
                            />

                            <div className="mt-3 flex flex-wrap gap-5 text-sm">
                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!item.isVeg}
                                  onChange={(e) =>
                                    updateItem(menu.id, category.id, item.id, {
                                      isVeg: e.target.checked,
                                    })
                                  }
                                />
                                Veg
                              </label>

                              <label className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!!item.bestseller}
                                  onChange={(e) =>
                                    updateItem(menu.id, category.id, item.id, {
                                      bestseller: e.target.checked,
                                    })
                                  }
                                />
                                Bestseller
                              </label>
                            </div>
                          </SectionCard>

                          <SectionCard
                            title="Sizes / Variants"
                            right={
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!item.variantGroup?.enabled}
                                  onChange={(e) =>
                                    updateItemSection(
                                      menu.id,
                                      category.id,
                                      item.id,
                                      "variantGroup",
                                      { enabled: e.target.checked }
                                    )
                                  }
                                />
                                Enable
                              </label>
                            }
                          >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <input
                                className="rounded-lg border p-3"
                                value={item.variantGroup?.title || ""}
                                onChange={(e) =>
                                  updateItemSection(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "variantGroup",
                                    { title: e.target.value }
                                  )
                                }
                                placeholder="Group title ex: Sizes"
                              />

                              <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                                <input
                                  type="checkbox"
                                  checked={item.variantGroup?.required !== false}
                                  onChange={(e) =>
                                    updateItemSection(
                                      menu.id,
                                      category.id,
                                      item.id,
                                      "variantGroup",
                                      { required: e.target.checked }
                                    )
                                  }
                                />
                                Required selection
                              </label>

                              <button
                                type="button"
                                onClick={() =>
                                  addSectionOption(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "variantGroup"
                                  )
                                }
                                className="rounded-lg border px-4 py-3"
                              >
                                + Add Size
                              </button>
                            </div>

                            <div className="mt-3 space-y-3">
                              {(item.variantGroup?.options || []).map((opt) => (
                                <div
                                  key={opt.id}
                                  className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[40px_1fr_160px_120px]"
                                >
                                  <div className="flex items-center justify-center">
                                    <input
                                      type="radio"
                                      name={`default_variant_${item.id}`}
                                      checked={!!opt.isDefault}
                                      onChange={() =>
                                        setDefaultVariant(
                                          menu.id,
                                          category.id,
                                          item.id,
                                          opt.id
                                        )
                                      }
                                    />
                                  </div>

                                  <input
                                    className="rounded-lg border p-3"
                                    value={opt.name}
                                    onChange={(e) =>
                                      updateSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "variantGroup",
                                        opt.id,
                                        { name: e.target.value }
                                      )
                                    }
                                    placeholder="Size name ex: Small / Large"
                                  />

                                  <input
                                    className="rounded-lg border p-3"
                                    value={opt.price}
                                    onChange={(e) =>
                                      updateSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "variantGroup",
                                        opt.id,
                                        { price: e.target.value }
                                      )
                                    }
                                    placeholder="Price"
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "variantGroup",
                                        opt.id
                                      )
                                    }
                                    className="rounded-lg border border-red-200 px-4 py-3 text-red-600"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          </SectionCard>

                          <SectionCard
                            title="Ingredients (Remove)"
                            right={
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!item.removableIngredients?.enabled}
                                  onChange={(e) =>
                                    updateItemSection(
                                      menu.id,
                                      category.id,
                                      item.id,
                                      "removableIngredients",
                                      { enabled: e.target.checked }
                                    )
                                  }
                                />
                                Enable
                              </label>
                            }
                          >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                              <input
                                className="rounded-lg border p-3"
                                value={item.removableIngredients?.title || ""}
                                onChange={(e) =>
                                  updateItemSection(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "removableIngredients",
                                    { title: e.target.value }
                                  )
                                }
                                placeholder="Title"
                              />

                              <input
                                className="rounded-lg border p-3"
                                value={item.removableIngredients?.helperText || ""}
                                onChange={(e) =>
                                  updateItemSection(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "removableIngredients",
                                    { helperText: e.target.value }
                                  )
                                }
                                placeholder="Helper text"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  addSectionOption(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "removableIngredients"
                                  )
                                }
                                className="rounded-lg border px-4 py-3"
                              >
                                + Add Ingredient
                              </button>
                            </div>

                            <div className="mt-3 space-y-3">
                              {(item.removableIngredients?.options || []).map((opt) => (
                                <div
                                  key={opt.id}
                                  className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[120px_1fr_120px]"
                                >
                                  <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                                    <input
                                      type="checkbox"
                                      checked={opt.selected !== false}
                                      onChange={(e) =>
                                        updateSectionOption(
                                          menu.id,
                                          category.id,
                                          item.id,
                                          "removableIngredients",
                                          opt.id,
                                          { selected: e.target.checked }
                                        )
                                      }
                                    />
                                    Selected
                                  </label>

                                  <input
                                    className="rounded-lg border p-3"
                                    value={opt.name}
                                    onChange={(e) =>
                                      updateSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "removableIngredients",
                                        opt.id,
                                        { name: e.target.value }
                                      )
                                    }
                                    placeholder="Ingredient name"
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "removableIngredients",
                                        opt.id
                                      )
                                    }
                                    className="rounded-lg border border-red-200 px-4 py-3 text-red-600"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          </SectionCard>

                          <SectionCard
                            title="Extras / Add-ons"
                            right={
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!item.extrasGroup?.enabled}
                                  onChange={(e) =>
                                    updateItemSection(
                                      menu.id,
                                      category.id,
                                      item.id,
                                      "extrasGroup",
                                      { enabled: e.target.checked }
                                    )
                                  }
                                />
                                Enable
                              </label>
                            }
                          >
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                              <input
                                className="rounded-lg border p-3"
                                value={item.extrasGroup?.title || ""}
                                onChange={(e) =>
                                  updateItemSection(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "extrasGroup",
                                    { title: e.target.value }
                                  )
                                }
                                placeholder="Title ex: Extras"
                              />

                              <button
                                type="button"
                                onClick={() =>
                                  addSectionOption(
                                    menu.id,
                                    category.id,
                                    item.id,
                                    "extrasGroup"
                                  )
                                }
                                className="rounded-lg border px-4 py-3"
                              >
                                + Add Extra
                              </button>
                            </div>

                            <div className="mt-3 space-y-3">
                              {(item.extrasGroup?.options || []).map((opt) => (
                                <div
                                  key={opt.id}
                                  className="grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[1fr_160px_120px]"
                                >
                                  <input
                                    className="rounded-lg border p-3"
                                    value={opt.name}
                                    onChange={(e) =>
                                      updateSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "extrasGroup",
                                        opt.id,
                                        { name: e.target.value }
                                      )
                                    }
                                    placeholder="Extra name"
                                  />

                                  <input
                                    className="rounded-lg border p-3"
                                    value={opt.price}
                                    onChange={(e) =>
                                      updateSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "extrasGroup",
                                        opt.id,
                                        { price: e.target.value }
                                      )
                                    }
                                    placeholder="Price"
                                  />

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeSectionOption(
                                        menu.id,
                                        category.id,
                                        item.id,
                                        "extrasGroup",
                                        opt.id
                                      )
                                    }
                                    className="rounded-lg border border-red-200 px-4 py-3 text-red-600"
                                  >
                                    Delete
                                  </button>
                                </div>
                              ))}
                            </div>
                          </SectionCard>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex justify-end">
            <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700">
              Save Menus
            </button>
          </div>
        </form>
      </div>

      <ToastContainer />
    </main>
  );
}