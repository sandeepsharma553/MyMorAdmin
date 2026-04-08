import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";
import useRestaurantDoc from "../../hooks/useRestaurantDoc";
import { ToastContainer, toast } from "react-toastify";
import { FadeLoader } from "react-spinners";
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
  isUploading: false,

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
          isUploading: false,

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

function MenuModal({ open, title, children, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white w-full max-w-7xl max-h-[92vh] overflow-y-auto rounded-lg shadow-lg">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-white p-6">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            type="button"
            className="text-gray-600 hover:text-black"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function RestaurantMenuPage() {
  const { restaurant, loading, updateRestaurant, restaurantId } = useRestaurantDoc();

  const [menus, setMenus] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMenuId, setEditingMenuId] = useState(null);
  const [menuForm, setMenuForm] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleteData, setDeleteData] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [categoryOption, setCategoryOption] = useState([]);
  useEffect(() => {
    if (Array.isArray(restaurant?.menus) && restaurant.menus.length) {
      setMenus(normalizeMenusFromDb(restaurant.menus));
    } else {
      setMenus([]);
      getCategory();
    }
  }, [restaurant]);
  const getCategory = async () => {
    try {
      const qCat = query(
        collection(db, "restaurantcategory"),
      );
      const snap = await getDocs(qCat);
      setCategoryOption(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };

  const editingMenu = useMemo(() => {
    if (isCreating) return menuForm;
    return menus.find((m) => m.id === editingMenuId) || null;
  }, [menus, editingMenuId, isCreating, menuForm]);

  const totalItems = useMemo(() => {
    return menus.reduce((acc, menu) => {
      return (
        acc +
        (menu.categories || []).reduce(
          (catAcc, cat) => catAcc + (cat.items || []).length,
          0
        )
      );
    }, 0);
  }, [menus]);

  const openCreate = () => {
    setIsCreating(true);
    setEditingMenuId(null);
    setMenuForm(newMenu());
    setModalOpen(true);
  };

  const openEdit = (menuId) => {
    setIsCreating(false);
    setEditingMenuId(menuId);
    setMenuForm(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingMenuId(null);
    setMenuForm(null);
    setIsCreating(false);
  };

  const updateMenu = (menuId, patch) => {
    if (isCreating) {
      setMenuForm((prev) => ({ ...prev, ...patch }));
      return;
    }

    setMenus((prev) =>
      prev.map((menu) => (menu.id === menuId ? { ...menu, ...patch } : menu))
    );
  };

  const removeMenu = (menuId) => {
    setMenus((prev) => prev.filter((menu) => menu.id !== menuId));
    if (editingMenuId === menuId) closeModal();
  };

  const addCategory = (menuId) => {
    if (isCreating) {
      setMenuForm((prev) => ({
        ...prev,
        categories: [...(prev.categories || []), newMenuCategory()],
      }));
      return;
    }

    setMenus((prev) =>
      prev.map((menu) =>
        menu.id === menuId
          ? { ...menu, categories: [...(menu.categories || []), newMenuCategory()] }
          : menu
      )
    );
  };

  const updateCategory = (menuId, categoryId, patch) => {
    if (isCreating) {
      setMenuForm((prev) => ({
        ...prev,
        categories: (prev.categories || []).map((cat) =>
          cat.id === categoryId ? { ...cat, ...patch } : cat
        ),
      }));
      return;
    }

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
  };

  const removeCategory = (menuId, categoryId) => {
    if (isCreating) {
      setMenuForm((prev) => ({
        ...prev,
        categories: (prev.categories || []).filter((cat) => cat.id !== categoryId),
      }));
      return;
    }

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
  };

  const addItem = (menuId, categoryId) => {
    if (isCreating) {
      setMenuForm((prev) => ({
        ...prev,
        categories: (prev.categories || []).map((cat) =>
          cat.id === categoryId
            ? { ...cat, items: [...(cat.items || []), newMenuItem()] }
            : cat
        ),
      }));
      return;
    }

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
  };

  const updateItem = (menuId, categoryId, itemId, patch) => {
    if (isCreating) {
      setMenuForm((prev) => ({
        ...prev,
        categories: (prev.categories || []).map((cat) =>
          cat.id === categoryId
            ? {
              ...cat,
              items: (cat.items || []).map((item) =>
                item.id === itemId ? { ...item, ...patch } : item
              ),
            }
            : cat
        ),
      }));
      return;
    }

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
  };

  const removeItem = (menuId, categoryId, itemId) => {
    if (isCreating) {
      setMenuForm((prev) => ({
        ...prev,
        categories: (prev.categories || []).map((cat) =>
          cat.id === categoryId
            ? {
              ...cat,
              items: (cat.items || []).filter((item) => item.id !== itemId),
            }
            : cat
        ),
      }));
      return;
    }

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
  };

  const getSourceMenu = (menuId) => {
    if (isCreating) return menuForm;
    return menus.find((m) => m.id === menuId);
  };

  const updateItemSection = (menuId, categoryId, itemId, sectionKey, patch) => {
    const menu = getSourceMenu(menuId);
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
    const menu = getSourceMenu(menuId);
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
    const menu = getSourceMenu(menuId);
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
    const menu = getSourceMenu(menuId);
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
    const menu = getSourceMenu(menuId);
    const category = menu?.categories?.find((c) => c.id === categoryId);
    const item = category?.items?.find((i) => i.id === itemId);

    const options = (item?.variantGroup?.options || []).map((opt) => ({
      ...opt,
      isDefault: opt.id === optionId,
    }));

    updateItemSection(menuId, categoryId, itemId, "variantGroup", { options });
  };

  const handleImageUpload = async (menuId, categoryId, itemId, file) => {
    if (!file) return;

    try {
      updateItem(menuId, categoryId, itemId, { isUploading: true });

      const cleanFileName = file.name.replace(/\s+/g, "_");
      const path = `restaurant-menu-items/${restaurantId || "common"}/${Date.now()}_${cleanFileName}`;
      const fileRef = storageRef(storage, path);

      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      updateItem(menuId, categoryId, itemId, {
        image: url,
        isUploading: false,
      });

      toast.success("Image uploaded ✅");
    } catch (error) {
      console.error("Image upload failed:", error);
      updateItem(menuId, categoryId, itemId, { isUploading: false });
      toast.error("Image upload failed ❌");
    }
  };

  const removeImage = (menuId, categoryId, itemId) => {
    updateItem(menuId, categoryId, itemId, { image: "" });
  };

  const validateMenus = (menusToValidate) => {
    for (const menu of menusToValidate) {
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

          if (item.variantGroup?.enabled && !item.variantGroup?.title?.trim()) {
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

          if (item.extrasGroup?.enabled && !item.extrasGroup?.title?.trim()) {
            toast.error(`"${item.name}" me extras group title chahiye`);
            return false;
          }
        }
      }
    }

    return true;
  };

  const saveMenusToDb = async (menusToSave) => {
    const cleanedMenus = (menusToSave || []).map((menu) => ({
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
    setMenus(normalizeMenusFromDb(cleanedMenus));
  };

  const handleSaveModal = async (e) => {
    e.preventDefault();

    let menusToSave = menus;
    if (isCreating && menuForm) {
      menusToSave = [...menus, menuForm];
    }

    if (!validateMenus(menusToSave)) return;

    await saveMenusToDb(menusToSave);
    closeModal();
  };

  const handleDeleteMenu = async () => {
    if (!deleteData?.id) return;

    const menusToSave = menus.filter((m) => m.id !== deleteData.id);

    if (!validateMenus(menusToSave)) {
      setConfirmDeleteOpen(false);
      setDeleteData(null);
      return;
    }

    await saveMenusToDb(menusToSave);
    setConfirmDeleteOpen(false);
    setDeleteData(null);
    if (editingMenuId === deleteData.id) closeModal();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <FadeLoader color="#36d7b7" loading />
      </div>
    );
  }

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
                onClick={openCreate}
                className="rounded-lg bg-black px-4 py-2 text-white"
              >
                + Add Menu
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Menu
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Description
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Categories
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {menus.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-gray-500">
                    No menus found.
                  </td>
                </tr>
              ) : (
                menus.map((menu) => {
                  const itemCount = (menu.categories || []).reduce(
                    (acc, cat) => acc + (cat.items || []).length,
                    0
                  );

                  return (
                    <tr key={menu.id}>
                      <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                        {menu.name || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{menu.type || "—"}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {menu.description || "—"}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {menu.categories?.length || 0}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{itemCount}</td>
                      <td className="px-6 py-4 text-sm">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${menu.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                            }`}
                        >
                          {menu.isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => openEdit(menu.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            setDeleteData(menu);
                            setConfirmDeleteOpen(true);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <MenuModal
          open={modalOpen && !!editingMenu}
          title={isCreating ? "Create Menu" : "Edit Menu"}
          onClose={closeModal}
        >
          {editingMenu ? (
            <form onSubmit={handleSaveModal} className="space-y-6">
              <div className="rounded-2xl border bg-white shadow-sm">
                <div className="border-b p-5">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                    <input
                      className="rounded-lg border p-3 md:col-span-2"
                      value={editingMenu.name}
                      onChange={(e) =>
                        updateMenu(editingMenu.id, { name: e.target.value })
                      }
                      placeholder="Menu name"
                    />

                    <select
                      className="rounded-lg border p-3"
                      value={editingMenu.type}
                      onChange={(e) =>
                        updateMenu(editingMenu.id, { type: e.target.value })
                      }
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
                        checked={!!editingMenu.isActive}
                        onChange={(e) =>
                          updateMenu(editingMenu.id, { isActive: e.target.checked })
                        }
                      />
                      Active menu
                    </label>

                    {!isCreating ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDeleteData(editingMenu);
                          setConfirmDeleteOpen(true);
                        }}
                        className="rounded-lg border border-red-200 px-4 py-3 text-red-600"
                      >
                        Delete Menu
                      </button>
                    ) : (
                      <div />
                    )}
                  </div>

                  <textarea
                    className="mt-3 w-full rounded-lg border p-3"
                    rows={2}
                    value={editingMenu.description || ""}
                    onChange={(e) =>
                      updateMenu(editingMenu.id, { description: e.target.value })
                    }
                    placeholder="Menu description"
                  />
                </div>

                <div className="space-y-4 p-5">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => addCategory(editingMenu.id)}
                      className="rounded-lg bg-gray-900 px-4 py-2 text-white"
                    >
                      + Add Category
                    </button>
                  </div>

                  {(editingMenu.categories || []).map((category) => (
                    <div key={category.id} className="rounded-xl border bg-gray-50 p-4">
                      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px_120px]">
                        {/* <input
                          className="rounded-lg border bg-white p-3"
                          value={category.name}
                          onChange={(e) =>
                            updateCategory(editingMenu.id, category.id, {
                              name: e.target.value,
                            })
                          }
                          placeholder="Category name ex: Pizza, Burgers, Drinks"
                        /> */}
                        <select
                          className="rounded-lg border bg-white p-3"
                          value={category.name}
                          onChange={(e) =>
                            updateCategory(editingMenu.id, category.id, {
                              name: e.target.value,
                            })
                          }
                        >
                          <option value="">Select category</option>
                          {categoryOption.map((option) => (
                            <option key={option.name} value={option.name}>
                              {option.name}
                            </option>
                          ))}
                        </select>
                        <input
                          className="rounded-lg border bg-white p-3"
                          value={category.sortOrder}
                          onChange={(e) =>
                            updateCategory(editingMenu.id, category.id, {
                              sortOrder: e.target.value,
                            })
                          }
                          placeholder="Sort"
                        />

                        <button
                          type="button"
                          onClick={() => removeCategory(editingMenu.id, category.id)}
                          className="rounded-lg border border-red-200 bg-white px-4 py-3 text-red-600"
                        >
                          Delete Category
                        </button>
                      </div>

                      <div className="mb-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => addItem(editingMenu.id, category.id)}
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
                                onClick={() =>
                                  removeItem(editingMenu.id, category.id, item.id)
                                }
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
                                    updateItem(editingMenu.id, category.id, item.id, {
                                      name: e.target.value,
                                    })
                                  }
                                  placeholder="Item name"
                                />

                                <input
                                  className="rounded-lg border p-3 md:col-span-2"
                                  value={item.basePrice}
                                  onChange={(e) =>
                                    updateItem(editingMenu.id, category.id, item.id, {
                                      basePrice: e.target.value,
                                    })
                                  }
                                  placeholder="Base price"
                                />

                                <input
                                  className="rounded-lg border p-3 md:col-span-2"
                                  value={item.compareAtPrice}
                                  onChange={(e) =>
                                    updateItem(editingMenu.id, category.id, item.id, {
                                      compareAtPrice: e.target.value,
                                    })
                                  }
                                  placeholder="Compare price"
                                />

                                <select
                                  className="rounded-lg border p-3 md:col-span-2"
                                  value={item.availabilityState}
                                  onChange={(e) =>
                                    updateItem(editingMenu.id, category.id, item.id, {
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

                                <div className="md:col-span-3">
                                  <input
                                    type="file"
                                    accept="image/*"
                                    className="w-full rounded-lg border p-3"
                                    onChange={(e) =>
                                      handleImageUpload(
                                        editingMenu.id,
                                        category.id,
                                        item.id,
                                        e.target.files?.[0]
                                      )
                                    }
                                  />

                                  {item.isUploading ? (
                                    <div className="mt-2 text-sm text-blue-600">
                                      Uploading image...
                                    </div>
                                  ) : null}

                                  {item.image ? (
                                    <div className="mt-3 flex items-center gap-3 rounded-lg border p-2">
                                      <img
                                        src={item.image}
                                        alt={item.name || "item"}
                                        className="h-16 w-16 rounded-lg border object-cover"
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm text-gray-600">
                                          Image uploaded
                                        </p>
                                        <a
                                          href={item.image}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs text-blue-600 underline"
                                        >
                                          View image
                                        </a>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          removeImage(editingMenu.id, category.id, item.id)
                                        }
                                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs text-gray-400">
                                      Upload item image
                                    </p>
                                  )}
                                </div>
                              </div>

                              <textarea
                                className="mt-3 w-full rounded-lg border p-3"
                                rows={2}
                                value={item.description}
                                onChange={(e) =>
                                  updateItem(editingMenu.id, category.id, item.id, {
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
                                      updateItem(editingMenu.id, category.id, item.id, {
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
                                      updateItem(editingMenu.id, category.id, item.id, {
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
                                        editingMenu.id,
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
                                      editingMenu.id,
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
                                        editingMenu.id,
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
                                      editingMenu.id,
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
                                            editingMenu.id,
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
                                          editingMenu.id,
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
                                          editingMenu.id,
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
                                          editingMenu.id,
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
                                        editingMenu.id,
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
                                      editingMenu.id,
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
                                      editingMenu.id,
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
                                      editingMenu.id,
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
                                            editingMenu.id,
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
                                          editingMenu.id,
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
                                          editingMenu.id,
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
                                        editingMenu.id,
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
                                      editingMenu.id,
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
                                      editingMenu.id,
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
                                          editingMenu.id,
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
                                          editingMenu.id,
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
                                          editingMenu.id,
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

              <div className="flex justify-end">
                <button className="rounded-lg bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700">
                  Save Menus
                </button>
              </div>
            </form>
          ) : null}
        </MenuModal>

        {confirmDeleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-lg">
              <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Menu</h2>
              <p className="mb-4">
                Are you sure you want to delete{" "}
                <strong>{deleteData?.name || "this menu"}</strong>?
              </p>
              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setConfirmDeleteOpen(false);
                    setDeleteData(null);
                  }}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteMenu}
                  className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  type="button"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ToastContainer />
    </main>
  );
}