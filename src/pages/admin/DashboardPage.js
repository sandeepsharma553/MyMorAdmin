import React from "react";
export default function DashboardPage(props) {
  const { navbarHeight } = props;
  
  return (

    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar with Add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
      
      </div>

      <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Top stats */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Residents on Campus */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between text-sm text-slate-500">
              <div className="flex items-center gap-2 font-medium">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  {/* icon placeholder */}
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
                12
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              <span className="font-medium text-rose-600">5 urgent</span> · 7
              normal
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
                12
              </span>
              <span className="text-sm text-slate-500">Open</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              8 in Progress · 42 Resolved
            </p>
          </div>
        </div>

        {/* Middle row */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Check-ins line chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">
                Check-Ins this week
              </h2>
              <button className="flex items-center gap-1 text-xs text-slate-500">
                All residents ▾
              </button>
            </div>

            {/* Simple SVG line chart placeholder */}
            <div className="h-44">
              <svg
                viewBox="0 0 100 40"
                className="h-full w-full overflow-visible text-emerald-600"
              >
                {/* grid lines */}
                <g className="stroke-slate-100">
                  <line x1="0" y1="35" x2="100" y2="35" />
                  <line x1="0" y1="25" x2="100" y2="25" />
                  <line x1="0" y1="15" x2="100" y2="15" />
                  <line x1="0" y1="5" x2="100" y2="5" />
                </g>
                {/* area */}
                <path
                  d="M0 25 L15 22 L30 18 L45 23 L60 17 L75 21 L90 16 L100 14 L100 40 L0 40 Z"
                  className="fill-emerald-50"
                />
                {/* line */}
                <polyline
                  points="0,25 15,22 30,18 45,23 60,17 75,21 90,16 100,14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>

            {/* X axis labels */}
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
              <span>Sun</span>
            </div>
          </div>

          {/* Maintenance status donut */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">
              Maintenance Status
            </h2>

            <div className="mt-4 flex items-center gap-4">
              {/* simple ring / donut placeholder */}
              <div className="relative flex h-28 w-28 items-center justify-center">
                <div className="absolute h-28 w-28 rounded-full border-8 border-emerald-500/80" />
                <div className="absolute h-20 w-20 rounded-full bg-white" />
                <div className="relative text-center">
                  <p className="text-xs text-slate-500">Total</p>
                  <p className="text-xl font-semibold text-slate-900">62</p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-600" />
                  <span className="font-medium text-slate-700">12 Open</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-300" />
                  <span className="text-slate-700">8 In Progress</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-slate-200" />
                  <span className="text-slate-700">42 Resolved</span>
                </div>
              </div>
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
              <div>
                <p className="font-medium">9:00am – ENG101 Tutorial</p>
                <p className="text-slate-500">Room B204</p>
              </div>
              <div>
                <p className="font-medium">11:00am – ACC201 Workshop</p>
                <p className="text-slate-500">Study Hub</p>
              </div>
            </div>

            <button className="mt-3 text-xs font-medium text-emerald-700">
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
                Veg + Non-veg options
              </p>
              <p>
                <span className="font-medium">Lunch – </span>
                Pasta Bar &amp; Salad Station
              </p>
              <p>
                <span className="font-medium">Dinner – </span>
                Curry Night
              </p>
            </div>
          </div>

          {/* Recent Reports */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-700">
              Recent Reports &amp; Feedback
            </h2>

            <div className="mt-3 space-y-2 text-xs text-slate-700">
              <p>
                <span className="font-medium">New Incident – </span>
                Noise complaint{" "}
                <span className="text-slate-400">(12 min ago)</span>
              </p>
              <p>
                <span className="font-medium">Feedback – </span>
                “Wi-Fi slow in Library”
              </p>
              <p>
                <span className="font-medium">Feedback – </span>
                “More vegan options please”
              </p>
            </div>

            <button className="mt-3 text-xs font-medium text-emerald-700">
              Open all reports
            </button>
          </div>
        </div>
      </div>
    </div>
    </main>


  );
}
