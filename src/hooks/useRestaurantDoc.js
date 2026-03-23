// src/pages/restaurants/useRestaurantDoc.js
import { useEffect, useState, useCallback } from "react";
import { doc, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { useSelector } from "react-redux";
import { toast } from "react-toastify";
import { db } from "../firebase";

export default function useRestaurantDoc() {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);

  const restaurantId = emp?.restaurantid || null;

  const [restaurant, setRestaurant] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadRestaurant = useCallback(async () => {
    if (!restaurantId) {
      setRestaurant(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const ref = doc(db, "restaurants", restaurantId);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        setRestaurant(null);
        toast.error("Restaurant not found");
        return;
      }

      setRestaurant({
        id: snap.id,
        ...snap.data(),
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to load restaurant");
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => {
    loadRestaurant();
  }, [loadRestaurant]);

  const updateRestaurant = async (patch, successMessage = "Updated successfully ✅") => {
    if (!restaurantId) {
      toast.error("Employee restaurant id not found");
      return false;
    }

    try {
      const ref = doc(db, "restaurants", restaurantId);
      await updateDoc(ref, {
        ...patch,
        updatedAt: Timestamp.now(),
        uid: uid || null,
        restaurantid: restaurantId,
      });

      await loadRestaurant();
      toast.success(successMessage);
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Update failed");
      return false;
    }
  };

  return {
    uid,
    emp,
    restaurantId,
    restaurant,
    loading,
    loadRestaurant,
    updateRestaurant,
  };
}