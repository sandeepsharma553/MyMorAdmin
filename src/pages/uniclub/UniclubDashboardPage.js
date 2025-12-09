import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";

const getDateDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
};

export default function UniclubDashboardPage(props) {
  const { navbarHeight } = props;
  const emp = useSelector((state) => state.auth.employee);

  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState({
    totalClubs: 0,
    activeClubs30d: 0,
    totalMembers: 0,
    newMembers7d: 0,
    totalEvents30d: 0,
    eventsThisWeek: 0,
    avgMembersPerClub: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);

      try {
        const since7d = getDateDaysAgo(7);
        const since30d = getDateDaysAgo(30);
        const universityId = emp?.universityId || null;

        let clubsQ;
        const clubsRef = collection(db, "uniclubs"); 

        if (universityId) {
          clubsQ = query(clubsRef, where("universityid", "==", universityId));
        } else {
          clubsQ = query(clubsRef);
        }

        const clubsSnap = await getDocs(clubsQ);
        const totalClubs = clubsSnap.size;

        // collect club IDs for later if you want per-club stats
        const clubIds = [];
        clubsSnap.forEach((doc) => {
          const data = doc.data();
          // TODO: replace 'id' with real field if different
          if (data.clubId) clubIds.push(data.clubId);
          else clubIds.push(doc.id);
        });

        const membersRef = collection(db, "uniclubMembers");

        let membersQ;
        if (universityId) {
          membersQ = query(membersRef, where("universityId", "==", universityId));
        } else {
          membersQ = query(membersRef);
        }

        const membersSnap = await getDocs(membersQ);
        const totalMembers = membersSnap.size;

        // New members 7d
        let newMembers7d = 0;
        membersSnap.forEach((doc) => {
          const data = doc.data();
          if (data.joinedAt?.toDate) {
            const joined = data.joinedAt.toDate();
            if (joined >= since7d) newMembers7d += 1;
          }
        });

        /* --------------------------------
         * 3) Events (last 30d + this week)
         * -------------------------------- */
        const eventsRef = collection(db, "uniclubEvents"); // TODO: collection name check

        let eventsQ30;
        if (universityId) {
          eventsQ30 = query(
            eventsRef,
            where("universityId", "==", universityId),
            where("startAt", ">=", since30d) // Firestore index needed
          );
        } else {
          eventsQ30 = query(eventsRef, where("startAt", ">=", since30d));
        }

        const eventsSnap30 = await getDocs(eventsQ30);
        const totalEvents30d = eventsSnap30.size;

        // Events this week (7d)
        let eventsThisWeek = 0;
        eventsSnap30.forEach((doc) => {
          const data = doc.data();
          if (data.startAt?.toDate) {
            const start = data.startAt.toDate();
            if (start >= since7d) eventsThisWeek += 1;
          }
        });

        /* --------------------------------
         * 4) Active Clubs (last 30d)
         *    - clubs jinke events last 30d mein huye
         * -------------------------------- */
        const activeClubSet = new Set();
        eventsSnap30.forEach((doc) => {
          const data = doc.data();
          if (data.clubId) activeClubSet.add(data.clubId);
        });
        const activeClubs30d = activeClubSet.size;

        /* --------------------------------
         * 5) Avg members per club
         * -------------------------------- */
        const avgMembersPerClub =
          totalClubs > 0 ? Math.round((totalMembers / totalClubs) * 10) / 10 : 0;

        setStats({
          totalClubs,
          activeClubs30d,
          totalMembers,
          newMembers7d,
          totalEvents30d,
          eventsThisWeek,
          avgMembersPerClub,
        });
      } catch (e) {
        console.error("Failed to load uniclub dashboard stats", e);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [emp]);

  // if (loading) return <div className="p-6">Loading…</div>;

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-semibold">UniClubs Dashboard</h1>
          {emp?.university && (
            <p className="text-sm text-slate-500 mt-1">
              {emp?.university} -{emp?.uniclub}
            </p>
          )}
        </div>
      </div>

      <div className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-5xl space-y-4">
          {/* Top row: Clubs + Members */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Total Clubs */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                  🏁
                </span>
                Total Clubs
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.totalClubs.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                clubs registered on MyMor
              </p>
            </div>

            {/* Total Members */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  👥
                </span>
                Total Members
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.totalMembers.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                across all clubs
              </p>
            </div>

            {/* New Members 7d */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  ✨
                </span>
                New Members
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.newMembers7d.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-slate-500">last 7 days</p>
            </div>
          </div>

          {/* Second row: Events */}
          <div className="grid gap-4 sm:grid-cols-3">
            {/* Events last 30d */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                  📅
                </span>
                Events (30 days)
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.totalEvents30d.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                hosted by clubs in last 30 days
              </p>
            </div>

            {/* Events this week */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  🎟
                </span>
                Events This Week
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.eventsThisWeek.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                starting in last 7 days
              </p>
            </div>

            {/* Active clubs 30d */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                  🔥
                </span>
                Active Clubs
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.activeClubs30d.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                ran at least 1 event in last 30 days
              </p>
            </div>
          </div>

          {/* Third row: averages / small chart placeholder */}
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Average members per club */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                    📊
                  </span>
                  Avg members per club
                </div>
                <span className="text-xs text-slate-400">
                  based on total members / clubs
                </span>
              </div>
              <div className="mt-3 text-3xl font-semibold text-slate-900">
                {stats.avgMembersPerClub}
              </div>

              <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                {/* simple bar, clamp max at 100 */}
                <div
                  className="h-2 rounded-full bg-indigo-500"
                  style={{
                    width: `${Math.min(
                      (stats.avgMembersPerClub / 100) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>

            {/* Placeholder mini chart – events trend */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">
                Events Activity (Last 30 days)
              </h3>
              <div className="mt-3 h-28">
                {/* TODO: replace with real chart later */}
                <svg
                  viewBox="0 0 100 40"
                  className="h-full w-full text-indigo-500"
                >
                  <g className="stroke-slate-100">
                    <line x1="0" y1="30" x2="100" y2="30" />
                    <line x1="0" y1="20" x2="100" y2="20" />
                    <line x1="0" y1="10" x2="100" y2="10" />
                  </g>
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    points="0,32 15,30 30,26 45,24 60,22 75,18 90,16 100,14"
                  />
                </svg>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Replace this SVG with real per-day event counts later.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
