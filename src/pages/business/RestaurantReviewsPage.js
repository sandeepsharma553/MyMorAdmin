import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../../firebase";
import {
  REVIEW_STATUSES,
  getRestaurantById,
} from "../../components/RestaurantShared";
import { toast, ToastContainer } from "react-toastify";

export default function RestaurantReviewsPage({ navbarHeight }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [filters, setFilters] = useState({ status: "", rating: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const restaurantDoc = await getRestaurantById(id);
      setRestaurant(restaurantDoc);

      const q = query(collection(db, "reviews"), where("restaurantId", "==", id));
      const snap = await getDocs(q);
      setReviews(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load reviews");
    } finally {
      setLoading(false);
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((row) => {
      const okStatus = !filters.status || row.status === filters.status;
      const okRating = !filters.rating || String(row.rating) === String(filters.rating);
      return okStatus && okRating;
    });
  }, [reviews, filters]);

  const quickUpdateStatus = async (reviewId, status) => {
    try {
      await updateDoc(doc(db, "reviews", reviewId), {
        status,
        moderatedAt: Timestamp.now(),
      });
      toast.success(`Review marked ${status}`);
      await loadData();
    } catch (e) {
      console.error(e);
      toast.error("Failed to update review");
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Reviews Moderation List</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant ? `${restaurant.brandName || ""} / ${restaurant.branchName || ""}` : "Restaurant Reviews"}
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
            {REVIEW_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>

          <select
            className="border p-2 rounded"
            value={filters.rating}
            onChange={(e) => setFilters((p) => ({ ...p, rating: e.target.value }))}
          >
            <option value="">All ratings</option>
            {[5, 4, 3, 2, 1].map((r) => (
              <option key={r} value={r}>
                {r} stars
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          {filteredReviews.map((row) => (
            <div key={row.id} className="border rounded-xl bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold">
                    {row.customerName || "Anonymous"} • {row.rating || 0}★
                  </div>
                  <div className="text-xs text-gray-500">
                    {row.id} • {row.source || "manual"} • {row.status || "—"}
                  </div>
                  <div className="mt-2 text-sm text-gray-700">{row.text || "—"}</div>
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    className="px-3 py-1.5 border rounded text-sm"
                    onClick={() => quickUpdateStatus(row.id, "published")}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 border rounded text-sm text-red-600"
                    onClick={() => quickUpdateStatus(row.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}

          {!loading && filteredReviews.length === 0 && (
            <div className="text-center text-gray-500 py-8">No reviews found.</div>
          )}
        </div>
      </div>

      <ToastContainer />
    </main>
  );
}