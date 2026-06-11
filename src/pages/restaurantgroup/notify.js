import { addDoc, updateDoc, doc, arrayUnion, serverTimestamp } from "firebase/firestore";
import { notificationsCol } from "../../utils/restaurantGroupPaths";

/**
 * In-app notification feed (restaurantGroups/{g}/notifications).
 * `to`: a staffId, "managers" (manager/storeAdmin/owner), or "all".
 * Fire-and-forget — a failed notification must never fail the action that caused it.
 */
export const sendNotification = (groupId, { to = "all", type = "info", title, body = "", venueId = "", by = "" }) => {
  if (!groupId || !title) return Promise.resolve();
  return addDoc(notificationsCol(groupId), {
    to, type, title, body, venueId, by, readBy: [], at: serverTimestamp(),
  }).catch(() => {});
};

export const markNotificationRead = (groupId, notifId, readerId) => {
  if (!groupId || !notifId || !readerId) return Promise.resolve();
  return updateDoc(doc(notificationsCol(groupId), notifId), { readBy: arrayUnion(readerId) }).catch(() => {});
};
