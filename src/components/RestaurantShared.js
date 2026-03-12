import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase";
export const ORDER_STATUSES = [
  "draft",
  "placed",
  "accepted",
  "preparing",
  "ready",
  "completed",
  "cancelled",
  "rejected",
];

export const PAYMENT_STATUSES = [
  "pending",
  "paid",
  "partially_paid",
  "failed",
  "refunded",
];

export const RESERVATION_STATUSES = [
  "pending",
  "confirmed",
  "seated",
  "completed",
  "cancelled",
  "no_show",
];

export const REVIEW_STATUSES = ["pending", "published", "rejected"];

export const INVENTORY_BULK_ACTIONS = [
  "mark_sold_out",
  "mark_active",
  "hide_item",
  "archive_item",
];

export async function getRestaurantById(id) {
  const snap = await getDoc(doc(db, "restaurants", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function updateRestaurantDoc(id, payload) {
  await updateDoc(doc(db, "restaurants", id), {
    ...payload,
    updatedAt: Timestamp.now(),
  });
}

export function inventoryRowsFromMenus(menus = []) {
  const rows = [];
  for (const menu of menus) {
    for (const category of menu.categories || []) {
      for (const item of category.items || []) {
        rows.push({
          id: item.id,
          menuId: menu.id,
          categoryId: category.id,
          menuName: menu.name || "",
          categoryName: category.name || "",
          itemName: item.name || "",
          price: item.price ?? "",
          availabilityState: item.availabilityState || "active",
        });
      }
    }
  }
  return rows;
}