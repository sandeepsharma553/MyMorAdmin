import React from "react";
export default function SuperDashboard(props) {
    const { navbarHeight } = props;

    return (

        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
            {/* Top bar with Add button */}
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Dashboard</h1>

            </div>
            <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* GRID */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Events Viewed */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                📅
              </span>
              Events Viewed
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">
              1,248
            </div>
            <p className="mt-1 text-xs text-slate-500">in last 7 days</p>
          </div>

          {/* Tickets Bought */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                🎟
              </span>
              Tickets Bought
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">
              362
            </div>
            <p className="mt-1 text-xs text-slate-500">currently open</p>
          </div>

          {/* Open Incidents */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                🧯
              </span>
              Open Incidents
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">
              54
            </div>
            <p className="mt-1 text-xs text-slate-500">currently open</p>
          </div>

          {/* Avg Rating (overall) */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-500">
                ⭐
              </span>
              Avg Rating
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-3xl font-semibold text-slate-900">
                4.3
              </span>
              <span className="text-xs text-slate-500">out of 5</span>
            </div>
          </div>

          {/* Feedback count */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                💬
              </span>
              Feedback <span className="text-xs text-slate-400">(7 days)</span>
            </div>
            <div className="mt-3 text-3xl font-semibold text-slate-900">
              74
            </div>
            <p className="mt-1 text-xs text-slate-500">submissions</p>
          </div>

          {/* Feedback overview small summary */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">
              Feedback Overview
            </h3>
            <div className="mt-3 space-y-1 text-xs text-slate-700">
              <p>
                <span className="font-medium">Avg rating (Dining)</span> – 4.3
                / 5
              </p>
              <p>
                <span className="font-medium">Positive</span> 82% ·{" "}
                <span className="font-medium">Negative</span> 18%
              </p>
            </div>
          </div>

          {/* Incidents chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">
              Incidents (Last days)
            </h3>
            <div className="mt-3 h-28">
              {/* very simple fake line chart using SVG */}
              <svg
                viewBox="0 0 100 40"
                className="h-full w-full text-indigo-500"
              >
                {/* background grid */}
                <g className="stroke-slate-100">
                  <line x1="0" y1="30" x2="100" y2="30" />
                  <line x1="0" y1="20" x2="100" y2="20" />
                  <line x1="0" y1="10" x2="100" y2="10" />
                </g>
                {/* main line */}
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  points="0,28 15,26 30,24 45,22 60,18 75,16 90,14 100,12"
                />
                {/* dashed comparison line */}
                <polyline
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                  opacity="0.4"
                  points="0,32 15,31 30,29 45,28 60,27 75,26 90,25 100,24"
                />
              </svg>
            </div>
          </div>

          {/* Feedback overview bars */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-800">
              Feedback Overview
            </h3>

            <div className="mt-3 space-y-3 text-xs text-slate-700">
              {/* Average rating bar */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span>Average rate</span>
                  <span className="text-slate-400">4.3 / 5</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div className="h-2 w-[85%] rounded-full bg-indigo-500" />
                </div>
              </div>

              {/* Dining bar */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span>Dining</span>
                  <span className="text-slate-400">82% / 18%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-200">
                  <div className="h-2 w-[82%] rounded-full bg-indigo-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
        </main>


    );
}
