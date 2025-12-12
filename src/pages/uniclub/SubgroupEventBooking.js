import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import dayjs from "dayjs";
import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db,database } from "../../firebase";
import { ref as dbRef, query as datquery, onValue, off, } from 'firebase/database';
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
// Small, reusable pager
const Pager = ({ page, setPage, pageSize, setPageSize, total }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Rows per page</span>
        <select
          className="border rounded px-2 py-1 text-sm"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[5, 10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-600">
          Page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            className={`px-3 py-1 rounded border ${canPrev
              ? "bg-white hover:bg-gray-50"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            Prev
          </button>
          <button
            className={`px-3 py-1 rounded border ${canNext
              ? "bg-white hover:bg-gray-50"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            onClick={() => canNext && setPage((p) => p + 1)}
            disabled={!canNext}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

export default function SubgroupEventBooking() {
  const emp = useSelector((s) => s.auth.employee);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [bookings, setBookings] = useState([]);
  const { state } = useLocation();
  const [params] = useSearchParams();
  // const groupId = state?.groupId || params.get("groupId");
  // const groupName = state?.groupName || params.get("groupName") || "Club";
  // table state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sort, setSort] = useState({ key: "timestamp", dir: "desc" }); // keys: userName,userEmail,eventId,totalPrice,timestamp
  const [filters, setFilters] = useState({ user: "", email: "", event: "" });
  const debounceRef = useRef(null);
  const debouncedFilter = (k, v) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [k]: v }));
      setPage(1);
    }, 250);
  };


  const isBlank = (v) => v === null || v === undefined || String(v).trim() === "";

  const stateGroupId = state?.groupId;
  const stateGroupName = state?.groupName;

  const paramGroupId = params.get("groupId");
  const paramGroupName = params.get("groupName");

  // 1) First preference: state → params → employee
  const resolvedGroupId = !isBlank(stateGroupId)
    ? stateGroupId
    : !isBlank(paramGroupId)
      ? paramGroupId
      : (emp?.uniclubid || "");

  const resolvedGroupNameFallback = !isBlank(stateGroupName)
    ? stateGroupName
    : !isBlank(paramGroupName)
      ? paramGroupName
      : (emp?.uniclub || "Club");

  // If groupName still unknown but groupId exists, we will fetch title from RTDB
  const [groupNameResolved, setGroupNameResolved] = useState(resolvedGroupNameFallback);

  const groupId = resolvedGroupId;
  const groupName = groupNameResolved;


  useEffect(() => {
    if (!groupId) return;

    // if we already have a good name, no need to fetch
    if (!isBlank(groupNameResolved) && groupNameResolved !== "Club") return;

    // RTDB: uniclubsubgroup/{groupId}  OR query based on your schema
    const refPath = dbRef(database, `uniclubsubgroup/${groupId}`);

    const cb = (snap) => {
      const val = snap.val();
      const title = val?.title || val?.name || "";
      if (!isBlank(title)) setGroupNameResolved(title);
      else setGroupNameResolved(emp?.uniclub || "Club");
    };

    onValue(refPath, cb, { onlyOnce: true });
    return () => off(refPath, "value", cb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const qEvents = query(
          collection(db, "subgroupeventbookings"),
          where("groupid", "==", groupId),
        );
        const snap = await getDocs(qEvents);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setBookings(docs);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load bookings");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // helpers
  const toMillis = (t) => {
    if (!t) return 0;
    if (typeof t === "number") return t;
    if (typeof t === "string") {
      const ms = Date.parse(t);
      return Number.isNaN(ms) ? 0 : ms;
    }
    if (t.seconds) return t.seconds * 1000;
    return 0;
  };

  // derive -> filter -> sort -> paginate
  const filtered = useMemo(() => {
    const u = filters.user.trim().toLowerCase();
    const e = filters.email.trim().toLowerCase();
    const ev = filters.event.trim().toLowerCase();
    return bookings.filter((b) => {
      const uOK = !u || (b.userName || "").toLowerCase().includes(u);
      const eOK = !e || (b.userEmail || "").toLowerCase().includes(e);
      const evOK = !ev || (b.eventId || "").toLowerCase().includes(ev);
      return uOK && eOK && evOK;
    });
  }, [bookings, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case "userName":
          return (a.userName || "").localeCompare(b.userName || "") * dir;
        case "userEmail":
          return (a.userEmail || "").localeCompare(b.userEmail || "") * dir;
        case "eventId":
          return (a.eventId || "").localeCompare(b.eventId || "") * dir;
        case "totalPrice": {
          const av = Number(a.totalPrice || 0);
          const bv = Number(b.totalPrice || 0);
          return (av - bv) * dir;
        }
        case "timestamp":
        default: {
          const av = toMillis(a.timestamp);
          const bv = toMillis(b.timestamp);
          return (av - bv) * dir;
        }
      }
    });
  }, [filtered, sort]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = sorted.slice((page - 1) * pageSize, page * pageSize);

  const changeSort = (key) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {state?.groupId && (
        <div className="flex justify-between items-center mb-3">
          <button
            onClick={() => navigate("/uniclubsubgroup")}
            className="flex items-center gap-2 text-gray-700 hover:text-black"
          >
            <span className="text-xl">←</span>
            <span className="text-lg font-semibold">Back Sub Group</span>
          </button>
        </div>
      )}
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-2xl font-semibold">Event Bookings</h1>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                {/* sort row */}
                <tr>
                  {[
                    { key: "userName", label: "User" },
                    { key: "userEmail", label: "Email" },
                    { key: "eventId", label: "Event" },
                    { key: "tickets", label: "Tickets", sortable: false },
                    { key: "totalPrice", label: "Total Price" },
                    { key: "timestamp", label: "Booked At" },
                  ].map((c) => (
                    <th
                      key={c.key}
                      className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none"
                    >
                      {c.sortable === false ? (
                        <span>{c.label}</span>
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:underline"
                          onClick={() => changeSort(c.key)}
                          title="Sort"
                        >
                          <span>{c.label}</span>
                          {sort.key === c.key && (
                            <span className="text-gray-400">
                              {sort.dir === "asc" ? "▲" : "▼"}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>

                {/* filter row */}
                <tr className="border-t border-gray-200">
                  <th className="px-6 pb-3">
                    <input
                      className="w-full border border-gray-300 p-1 rounded text-sm"
                      placeholder="Search user"
                      defaultValue={filters.user}
                      onChange={(e) => debouncedFilter("user", e.target.value)}
                    />
                  </th>
                  <th className="px-6 pb-3">
                    <input
                      className="w-full border border-gray-300 p-1 rounded text-sm"
                      placeholder="Search email"
                      defaultValue={filters.email}
                      onChange={(e) => debouncedFilter("email", e.target.value)}
                    />
                  </th>
                  <th className="px-6 pb-3">
                    <input
                      className="w-full border border-gray-300 p-1 rounded text-sm"
                      placeholder="Search event"
                      defaultValue={filters.event}
                      onChange={(e) => debouncedFilter("event", e.target.value)}
                    />
                  </th>
                  <th className="px-6 pb-3" />
                  <th className="px-6 pb-3" />
                  <th className="px-6 pb-3" />
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {current.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                      No bookings found.
                    </td>
                  </tr>
                ) : (
                  current.map((b) => (
                    <tr key={b.id}>
                      {/* User (avatar + name) */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        <div className="flex items-center gap-2">
                          {b.userPhotoURL ? (
                            <img
                              src={b.userPhotoURL}
                              alt="user"
                              className="w-8 h-8 rounded-full"
                            />
                          ) : null}
                          <span>{b.userName || "—"}</span>
                        </div>
                      </td>

                      {/* Email */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {b.userEmail || "—"}
                      </td>

                      {/* Event */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {b.eventId || "—"}
                      </td>

                      {/* Tickets map */}
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {b.tickets && Object.keys(b.tickets).length > 0 ? (
                          <ul className="space-y-0.5">
                            {Object.entries(b.tickets).map(([type, count]) => (
                              <li key={type}>
                                {type}: <strong>{count}</strong>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          "—"
                        )}
                      </td>

                      {/* Total Price */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {typeof b.totalPrice === "number"
                          ? `$${b.totalPrice}`
                          : b.totalPrice || "—"}
                      </td>

                      {/* Booked At */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {b.timestamp
                          ? dayjs(
                            typeof b.timestamp === "string"
                              ? b.timestamp
                              : toMillis(b.timestamp)
                          ).format("MMM DD, YYYY hh:mm A")
                          : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <Pager
              page={page}
              setPage={setPage}
              pageSize={pageSize}
              setPageSize={setPageSize}
              total={total}
            />
          </>
        )}
      </div>

      <ToastContainer />
    </main>
  );
}
