import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { db } from "../../firebase";
import { collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";
import { Megaphone, Calendar, BookOpen, BedDouble } from "lucide-react";
import { FadeLoader } from "react-spinners";

export default function UniversityDashboardPage() {
  const emp = useSelector((state) => state.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [loading, setLoading] = useState(true);
  const [universityName, setUniversityName] = useState("");
  const [stats, setStats] = useState({ announcements: 0, events: 0, resources: 0, pendingBookings: 0 });

  useEffect(() => {
    if (!universityId) return;
    load();
  }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const [uniDoc, annSnap, evSnap, resSnap, bookSnap] = await Promise.all([
        getDoc(doc(db, "university", universityId)),
        getDocs(collection(db, "university", universityId, "announcements")),
        getDocs(collection(db, "university", universityId, "events")),
        getDocs(collection(db, "university", universityId, "resources")),
        getDocs(query(collection(db, "university", universityId, "roombookings"), where("status", "==", "pending"))),
      ]);
      setUniversityName(uniDoc.data()?.name || "University");
      setStats({
        announcements: annSnap.size,
        events: evSnap.size,
        resources: resSnap.size,
        pendingBookings: bookSnap.size,
      });
    } catch (e) { console.warn(e); }
    finally { setLoading(false); }
  };

  if (!universityId) return (
    <div className="p-8 text-center text-gray-400">No university assigned to your account.</div>
  );

  const cards = [
    { label: "Announcements", value: stats.announcements, Icon: Megaphone, color: "bg-green-100 text-green-700" },
    { label: "Events", value: stats.events, Icon: Calendar, color: "bg-blue-100 text-blue-700" },
    { label: "Resources", value: stats.resources, Icon: BookOpen, color: "bg-orange-100 text-orange-700" },
    { label: "Pending Bookings", value: stats.pendingBookings, Icon: BedDouble, color: "bg-yellow-100 text-yellow-700" },
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">{universityName}</h1>
        <p className="text-sm text-gray-500 mt-1">University Admin Dashboard</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><FadeLoader color="#073b15" /></div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {cards.map(({ label, value, Icon, color }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 flex items-center gap-5">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={26} />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-800">{value}</p>
                <p className="text-sm text-gray-500 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
