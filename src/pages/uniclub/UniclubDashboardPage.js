import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs, getDoc, doc
} from "firebase/firestore";
import { ref as rtdbRef, get as rtdbGet } from "firebase/database";
import { db, database } from "../../firebase";
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
  const [clubImage, setClubImage] = useState(null);
  const [university, setUniversity] = useState(null);
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

        if (emp?.uniclubid) {
          try {
            const clubRef = rtdbRef(database, `uniclubs/${emp.uniclubid}`);
            const clubSnap = await rtdbGet(clubRef);

            if (clubSnap.exists()) {
              const club = clubSnap.val();
              const img =
                club.image

              setClubImage(img);
            }

          } catch (err) {
            console.error("Failed to load club image from RTDB", err);
          }
        } else {
          setClubImage(null);
        }
        const ref = doc(db, "university", emp.universityId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const uniData = snap.data();
          setUniversity(uniData);
        }
        const clubsRef = collection(db, "uniclubs");
        const clubsQ = universityId
          ? query(clubsRef, where("universityid", "==", universityId))
          : query(clubsRef);

        const clubsSnap = await getDocs(clubsQ);
        const totalClubs = clubsSnap.size;

        const clubIds = [];
        clubsSnap.forEach((doc) => {
          const data = doc.data();
          if (data.clubId) clubIds.push(data.clubId);
          else clubIds.push(doc.id);
        });

        // ---- Members from RTDB: /uniclubs/{clubId}/members ----
        let totalMembers = 0;
        let newMembers7d = 0;

        // since7d JS Date already hai, uska ms nikal lo
        const since7dMs = since7d.getTime();

        for (const clubId of clubIds) {
          // RTDB path: uniclubs/{clubId}/members
          const membersRef = rtdbRef(database, `uniclubs/${clubId}/members`);
          const snap = await rtdbGet(membersRef);

          if (!snap.exists()) continue;

          const membersObj = snap.val() || {};

          Object.values(membersObj).forEach((member) => {
            totalMembers += 1;

            if (member.joinedAt && Number(member.joinedAt) >= since7dMs) {
              newMembers7d += 1;
            }
          });
        }

        // ---- Events from Firestore: discoverevents ----
        const eventsRef = collection(db, "discoverevents");
        let eventsQ30;

        if (emp?.uniclubid) {
          eventsQ30 = query(
            eventsRef,
            where("groupid", "==", emp.uniclubid)
          );
        }

        const eventsSnap30 = await getDocs(eventsQ30);
        const totalEvents30d = eventsSnap30.size;

        // Events this week (last 7 days)
        let eventsThisWeek = 0;
        eventsSnap30.forEach((doc) => {
          const data = doc.data();
          if (data.startAt?.toDate) {
            const start = data.startAt.toDate();
            if (start >= since7d) eventsThisWeek += 1;
          }
        });

        // Active clubs (jin ke events last 30 days me hue)
        const activeClubSet = new Set();
        eventsSnap30.forEach((doc) => {
          const data = doc.data();

          // agar discoverevents me club / group ka field "groupid" hai:
          if (data.groupid) activeClubSet.add(data.groupid);

          // agar "clubId" ho to upar ki line comment karke ye use karo:
          // if (data.clubId) activeClubSet.add(data.clubId);
        });
        const activeClubs30d = activeClubSet.size;


        const avgMembersPerClub =
          totalClubs > 0
            ? Math.round((totalMembers / totalClubs) * 10) / 10
            : 0;

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

  const universityName = emp?.university || "Your University";
  const clubName = emp?.uniclub || "All Clubs";
  const campusName = university?.campus || "Campus";
  const role  = emp?.role
  return (
    <main className="flex-1 bg-slate-100/80 overflow-auto px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* HEADER CARD – like screenshot */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {/* Top bar with logo + names + buttons */}
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {/* Uni logo placeholder */}
              <div className="h-12 w-12 rounded-xl overflow-hidden bg-slate-200 flex items-center justify-center">
                {clubImage ? (
                  <img
                    src={clubImage}
                    alt="Club Logo"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-slate-500 text-xl">🎓</span>
                )}
              </div>


              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">
                    {universityName} 
                  </h1>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  {/* Club pill */}
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {clubName}
                  </span>
                  <span className="text-slate-400">•</span>
                  <span>{campusName}</span>
                  <span className="text-slate-400">•</span>
                  <span>{role}</span>
                </div>

                <p className="mt-2 text-xs sm:text-sm text-slate-500">
                  Central hub for clubs, events &amp; memberships.
                </p>
              </div>
            </div>

            {/* Right side buttons */}
            {/* <div className="flex items-center gap-2 self-start sm:self-auto">
              <button className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Switch club
              </button>
              <button className="rounded-full border border-indigo-500 bg-indigo-500 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-indigo-600">
                + Add new club
              </button>
            </div> */}
          </div>

          {/* STATS GRID INSIDE SAME CARD */}
          <div className="px-6 py-5 space-y-4">
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

            {/* Third row: averages / chart */}
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

              {/* Events trend mini chart */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">
                  Events Activity (Last 30 days)
                </h3>
                <div className="mt-3 h-28">
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

        {/* Optional: loading text */}
        {loading && (
          <p className="text-xs text-slate-400">
            Loading latest club activity…
          </p>
        )}
      </div>
    </main>
  );
}
