import React, { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate, useParams } from "react-router-dom";
import { db } from "../../firebase";
import { getRestaurantById } from "../../components/RestaurantShared";

function StatCard({ title, value, subtext }) {
  return (
    <div className="border rounded-xl bg-white p-4">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      {subtext ? <div className="text-xs text-gray-500 mt-1">{subtext}</div> : null}
    </div>
  );
}

export default function RestaurantAnalyticsPage({ navbarHeight }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [restaurant, setRestaurant] = useState(null);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const restaurantDoc = await getRestaurantById(id);
      setRestaurant(restaurantDoc);

      const snap = await getDoc(doc(db, "restaurantAnalytics", id));
      setAnalytics(snap.exists() ? snap.data() : {});
    } catch (e) {
      console.error("Failed to load analytics:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Analytics Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            {restaurant
              ? `${restaurant.brandName || ""} / ${restaurant.branchName || ""}`
              : "Restaurant Analytics"}
          </p>
        </div>

        <button
          className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          onClick={() => navigate("/restaurant")}
        >
          Back
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading analytics...</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <StatCard title="Impressions" value={analytics?.impressions ?? 0} subtext="Last 30 days" />
            <StatCard title="Restaurant Views" value={analytics?.restaurantViews ?? 0} />
            <StatCard title="Menu Views" value={analytics?.menuViews ?? 0} />
            <StatCard title="Add To Cart" value={analytics?.addToCart ?? 0} />
            <StatCard title="Checkout Starts" value={analytics?.checkoutStarts ?? 0} />
            <StatCard title="Paid Orders" value={analytics?.paidOrders ?? 0} />
            <StatCard title="AOV" value={analytics?.aov ?? 0} />
            <StatCard title="Repeat Rate" value={analytics?.repeatRate ?? 0} />
          </div>

          <div className="border rounded-xl bg-white p-4">
            <div className="font-semibold mb-3">Dashboard sections</div>
            <div className="grid grid-cols-3 gap-3 text-sm text-gray-600">
              <div className="border rounded p-3">Discovery funnel</div>
              <div className="border rounded p-3">Menu performance</div>
              <div className="border rounded p-3">Order conversion</div>
              <div className="border rounded p-3">Reservation conversion</div>
              <div className="border rounded p-3">Peak ordering times</div>
              <div className="border rounded p-3">Top categories / items</div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}