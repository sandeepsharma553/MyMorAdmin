import React, { useEffect, useState } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { db } from "../../firebase";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";

// MUI charts
import { LineChart, PieChart } from "@mui/x-charts";

dayjs.extend(relativeTime);

export default function DashboardPage(props) {
  const { navbarHeight } = props;
  const navigate = useNavigate();

  const [maintenanceStats, setMaintenanceStats] = useState({
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
  });

  const [tutorialsToday, setTutorialsToday] = useState([]);
  const [diningToday, setDiningToday] = useState({
    breakfast: [],
    lunch: [],
    dinner: [],
  });
  const [recentReports, setRecentReports] = useState([]);

  // For now: static dummy data – you can later load real check-ins from Firestore
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const [checkins] = useState([6, 9, 7, 10, 8, 11, 9]);

  const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  useEffect(() => {
    if (!emp.hostelid) return;

    const fetchMaintenance = async () => {
      try {
        const q = query(
          collection(db, "maintenance"),
          where("hostelid", "==", emp.hostelid)
        );
        const snap = await getDocs(q);

        let open = 0;
        let inProgress = 0;
        let resolved = 0;

        snap.forEach((docRef) => {
          const s = (docRef.data().status || "").toLowerCase();
          if (s === "pending") open++;
          else if (s === "in progress") inProgress++;
          else if (s === "closed" || s === "resolved") resolved++;
        });

        setMaintenanceStats({
          total: snap.size,
          open,
          inProgress,
          resolved,
        });
      } catch (e) {
        console.error("Error loading maintenance:", e);
      }
    };

    const fetchTutorials = async () => {
      try {
        const q = query(
          collection(db, "tutorialschedule"),
          where("hostelid", "==", emp.hostelid),
          where("date", "==", todayStr),
          orderBy("time")
        );
        const snap = await getDocs(q);
        setTutorialsToday(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error loading tutorials:", e);
      }
    };

    const fetchMenus = async () => {
      try {
        const q = query(
          collection(db, "menus"),
          where("hostelid", "==", emp.hostelid),
          where("date", "==", todayStr),
          limit(1)
        );
        const snap = await getDocs(q);

        if (!snap.empty) {
          const data = snap.docs[0].data();
          const meals = data.meals || {};

          const getNames = (key) =>
            (meals[key]?.items || []).map((i) => i.name).slice(0, 3);

          setDiningToday({
            breakfast: getNames("breakfast"),
            lunch: getNames("lunch"),
            dinner: getNames("dinner"),
          });
        } else {
          setDiningToday({ breakfast: [], lunch: [], dinner: [] });
        }
      } catch (e) {
        console.error("Error loading menus:", e);
      }
    };

    const fetchReports = async () => {
      try {
        const q = query(
          collection(db, "reportincident"),
          where("hostelid", "==", emp.hostelid),
          orderBy("createdDate", "desc"),
          limit(3)
        );
        const snap = await getDocs(q);
        setRecentReports(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (e) {
        console.error("Error loading reports:", e);
      }
    };

    fetchMaintenance();
    fetchTutorials();
    fetchMenus();
    fetchReports();
  }, [emp.hostelid, todayStr]);

  const formatAgo = (ts) => {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    return dayjs(date).fromNow();
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      </div>

      <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
        <div className="mx-auto max-w-6xl space-y-6">
          {/* Top stats */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Residents */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <span className="text-lg">👤</span>
                  </span>
                  Residents on Campus
                </div>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-slate-900">
                  324
                </span>
                <span className="text-xs font-medium text-emerald-600">
                  +3½ % vs last week
                </span>
              </div>
            </div>

            {/* Open Maintenance Requests */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-50 text-slate-600">
                    🛠
                  </span>
                  Open Maintenance Requests
                </div>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-slate-900">
                  {maintenanceStats.open}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {maintenanceStats.inProgress} in progress ·{" "}
                {maintenanceStats.resolved} resolved
              </p>
            </div>

            {/* Maintenance Status summary */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <div className="flex items-center gap-2 font-medium">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    ⬇
                  </span>
                  Maintenance Status
                </div>
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  On time
                </span>
              </div>

              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-4xl font-semibold text-slate-900">
                  {maintenanceStats.open}
                </span>
                <span className="text-sm text-slate-500">Open</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {maintenanceStats.inProgress} In Progress ·{" "}
                {maintenanceStats.resolved} Resolved ·{" "}
                {maintenanceStats.total} Total
              </p>
            </div>
          </div>

          {/* Middle row */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Check-ins chart */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">
                  Check-Ins this week
                </h2>
                <button className="flex items-center gap-1 text-xs text-slate-500">
                  All residents ▾
                </button>
              </div>

              <div className="w-full overflow-x-auto">
                <LineChart
                  width={580}
                  height={220}
                  xAxis={[
                    {
                      scaleType: "point",
                      data: weekLabels,
                    },
                  ]}
                  series={[
                    {
                      data: checkins,
                      label: "Check-ins",
                      area: true,
                      showMark: false,
                      curve: "catmullRom",
                      color: "#0f766e",
                    },
                  ]}
                  sx={{
                    ".MuiAreaElement-root": { fillOpacity: 0.15 },
                    ".MuiChartsAxis-line, .MuiChartsAxis-tick": {
                      stroke: "#e5e7eb",
                    },
                    ".MuiChartsAxis-tickLabel": {
                      fill: "#9ca3af",
                      fontSize: 11,
                    },
                  }}
                />

              </div>
            </div>

            {/* Maintenance donut with live totals */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">
                Maintenance Status
              </h2>

              <div className="mt-4 flex items-center gap-4">

                <PieChart
                  width={180}
                  height={180}
                  series={[
                    {
                      innerRadius: 60,
                      outerRadius: 80,
                      paddingAngle: 2,
                      data: [
                        {
                          id: 0,
                          value: maintenanceStats.open,
                          label: `${maintenanceStats.open} Open`,
                          color: "#0f766e",
                        },
                        {
                          id: 1,
                          value: maintenanceStats.inProgress,
                          label: `${maintenanceStats.inProgress} In Progress`,
                          color: "#34d399",
                        },
                        {
                          id: 2,
                          value: maintenanceStats.resolved,
                          label: `${maintenanceStats.resolved} Resolved`,
                          color: "#a7f3d0",
                        },
                      ]

                    },
                  ]}
                  slotProps={{
                    legend: {
                      hidden: true,
                    },
                  }}
                />

                {/* 
                <div className="space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-700" />
                    <span className="font-medium text-slate-700">
                      {maintenanceStats.open} Open
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-400" />
                    <span className="text-slate-700">
                      {maintenanceStats.inProgress} In Progress
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-teal-200" />
                    <span className="text-slate-700">
                      {maintenanceStats.resolved} Resolved
                    </span>
                  </div>
                  <p className="pt-1 text-[11px] text-slate-400">
                    Total: {maintenanceStats.total}
                  </p>
                </div> */}
              </div>

              <button className="mt-4 text-xs font-medium text-emerald-700">
                View maintenance queue
              </button>
            </div>
          </div>

          {/* Bottom row */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Upcoming Tutorials */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700">
                  Upcoming Tutorials
                </h2>
                <span className="text-xs text-emerald-700">(Today)</span>
              </div>

              <div className="mt-3 space-y-3 text-xs text-slate-700">
                {tutorialsToday.length === 0 && (
                  <p className="text-slate-400">
                    No tutorials scheduled for today.
                  </p>
                )}

                {tutorialsToday.map((tut) => (
                  <div key={tut.id}>
                    <p className="font-medium">
                      {tut.time} – {tut.roomtype}
                    </p>
                    <p className="text-slate-500">
                      {tut.hall} · {tut.empname}
                    </p>
                  </div>
                ))}
              </div>

              <button
                onClick={() => navigate("/tutorialschedule")}
                className="mt-3 text-xs font-medium text-emerald-700"
              >
                View full tutorial schedule
              </button>
            </div>

            {/* Dining Highlights */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">
                Today&apos;s Dining Highlights
              </h2>

              <div className="mt-3 space-y-2 text-xs text-slate-700">
                <p>
                  <span className="font-medium">Breakfast – </span>
                  {diningToday.breakfast.length
                    ? diningToday.breakfast.join(", ")
                    : "No menu added"}
                </p>
                <p>
                  <span className="font-medium">Lunch – </span>
                  {diningToday.lunch.length
                    ? diningToday.lunch.join(", ")
                    : "No menu added"}
                </p>
                <p>
                  <span className="font-medium">Dinner – </span>
                  {diningToday.dinner.length
                    ? diningToday.dinner.join(", ")
                    : "No menu added"}
                </p>
              </div>
            </div>

            {/* Recent Reports */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-700">
                Recent Reports &amp; Feedback
              </h2>

              <div className="mt-3 space-y-2 text-xs text-slate-700">
                {recentReports.length === 0 && (
                  <p className="text-slate-400">No recent items.</p>
                )}

                {recentReports.map((report) => (
                  <p key={report.id}>
                    <span className="font-medium">
                      {report.isreport ? "Incident" : "Feedback"} –{" "}
                    </span>
                    {report.description || report.incidenttype}
                    {report.createdDate && (
                      <span className="text-slate-400">
                        {" "}
                        ({formatAgo(report.createdDate)})
                      </span>
                    )}
                  </p>
                ))}
              </div>

              <button
                onClick={() => navigate("/reportincident")}
                className="mt-3 text-xs font-medium text-emerald-700"
              >
                Open all reports
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
