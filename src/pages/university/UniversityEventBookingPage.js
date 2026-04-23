import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import dayjs from "dayjs";
import {
  collection,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../firebase";

const STATUSES = ["Booked", "Attended", "Cancelled"];

const STATUS_COLORS = {
  Booked: "bg-blue-100 text-blue-700",
  Attended: "bg-green-100 text-green-700",
  Cancelled: "bg-red-100 text-red-700",
};

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
            className={`px-3 py-1 rounded border ${
              canPrev
                ? "bg-white hover:bg-gray-50"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
            onClick={() => canPrev && setPage((p) => p - 1)}
            disabled={!canPrev}
          >
            Prev
          </button>
          <button
            className={`px-3 py-1 rounded border ${
              canNext
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

export default function UniversityEventBookingPage({ navbarHeight }) {
  const uid = useSelector((s) => s.auth.user?.uid);
  const emp = useSelector((s) => s.auth.employee);

  const { universityId, filterByScope } = useUniversityScope();

  const [isLoading, setIsLoading] = useState(false);
  const [bookings, setBookings] = useState([]);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [sort, setSort] = useState({ key: "timestamp", dir: "desc" });
  const [filters, setFilters] = useState({
    user: "",
    email: "",
    event: "",
    status: "All",
  });

  const debounceRef = useRef(null);

  const debouncedFilter = (k, v) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [k]: v }));
      setPage(1);
    }, 250);
  };

  const adminId = emp?.uid || uid;

  useEffect(() => {
    if (!adminId) return;

    const refDoc = doc(
      db,
      "adminMenuState",
      adminId,
      "menus",
      "universityeventbooking"
    );

    setDoc(refDoc, { lastOpened: serverTimestamp() }, { merge: true });
  }, [adminId]);

  useEffect(() => {
    if (!universityId) return;

    const loadBookings = async () => {
      setIsLoading(true);
      try {
        const qEvents = query(
          collection(db, "university", String(universityId), "eventbookings")
        );

        const snap = await getDocs(qEvents);
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        setBookings(filterByScope ? filterByScope(docs) : docs);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load bookings");
      } finally {
        setIsLoading(false);
      }
    };

    loadBookings();
  }, [universityId, filterByScope]);

  useEffect(() => {
    setPage(1);
  }, [pageSize]);

  const toMillis = (t) => {
    if (!t) return 0;
    if (typeof t === "number") return t;

    if (typeof t === "string") {
      const ms = Date.parse(t);
      return Number.isNaN(ms) ? 0 : ms;
    }

    if (t?.seconds) return t.seconds * 1000;

    return 0;
  };

  const updateStatus = async (id, status) => {
    if (!universityId || !id) return;

    try {
      await updateDoc(
        doc(db, "university", String(universityId), "eventbookings", id),
        {
          status,
          updatedAt: serverTimestamp(),
        }
      );

      setBookings((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status } : item))
      );

      toast.success("Status updated");
    } catch (e) {
      console.error(e);
      toast.error("Update failed");
    }
  };

  const filtered = useMemo(() => {
    const u = filters.user.trim().toLowerCase();
    const e = filters.email.trim().toLowerCase();
    const ev = filters.event.trim().toLowerCase();
    const st = filters.status.trim().toLowerCase();

    return bookings.filter((b) => {
      const userName = b.userName || b.bookedByName || b.bookedBy || "";
      const userEmail = b.userEmail || b.bookedByEmail || "";
      const eventName = b.eventName || b.eventTitle || b.eventId || "";

      const uOK = !u || userName.toLowerCase().includes(u);
      const eOK = !e || userEmail.toLowerCase().includes(e);
      const evOK = !ev || eventName.toLowerCase().includes(ev);
      const stOK =
        st === "all" || !st || (b.status || "Booked").toLowerCase() === st;

      return uOK && eOK && evOK && stOK;
    });
  }, [bookings, filters]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;

    return [...filtered].sort((a, b) => {
      const aUser = a.userName || a.bookedByName || a.bookedBy || "";
      const bUser = b.userName || b.bookedByName || b.bookedBy || "";

      const aEmail = a.userEmail || a.bookedByEmail || "";
      const bEmail = b.userEmail || b.bookedByEmail || "";

      const aEvent = a.eventName || a.eventTitle || a.eventId || "";
      const bEvent = b.eventName || b.eventTitle || b.eventId || "";

      switch (sort.key) {
        case "userName":
          return aUser.localeCompare(bUser) * dir;

        case "userEmail":
          return aEmail.localeCompare(bEmail) * dir;

        case "eventId":
          return aEvent.localeCompare(bEvent) * dir;

        case "seats": {
          const av = Number(a.seats || 0);
          const bv = Number(b.seats || 0);
          return (av - bv) * dir;
        }

        case "totalPrice": {
          const av = Number(a.totalPrice || 0);
          const bv = Number(b.totalPrice || 0);
          return (av - bv) * dir;
        }

        case "status":
          return (a.status || "Booked").localeCompare(b.status || "Booked") * dir;

        case "timestamp":
        default: {
          const av = toMillis(a.bookingDate || a.createdAt || a.timestamp);
          const bv = toMillis(b.bookingDate || b.createdAt || b.timestamp);
          return (av - bv) * dir;
        }
      }
    });
  }, [filtered, sort]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const current = sorted.slice((page - 1) * pageSize, page * pageSize);

  const changeSort = (key) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );

  if (!universityId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto">
        <div className="bg-white rounded-xl shadow p-10 text-center text-gray-500">
          No university assigned.
        </div>
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <UniversityScopeBanner />

      <div className="flex justify-between items-center mb-3">
        <h1 className="text-2xl font-semibold">University Event Bookings</h1>
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
                <tr>
                  {[
                    { key: "userName", label: "User" },
                    { key: "userEmail", label: "Email" },
                    { key: "eventId", label: "Event" },
                    { key: "seats", label: "Seats" },
                    { key: "totalPrice", label: "Total Price" },
                    { key: "timestamp", label: "Booked At" },
                    { key: "status", label: "Status" },
                    { key: "actions", label: "Actions", sortable: false },
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

                  <th className="px-6 pb-3">
                    <select
                      className="w-full border border-gray-300 p-1 rounded text-sm bg-white"
                      value={filters.status}
                      onChange={(e) => {
                        setFilters((prev) => ({
                          ...prev,
                          status: e.target.value,
                        }));
                        setPage(1);
                      }}
                    >
                      <option value="All">All</option>
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </th>

                  <th className="px-6 pb-3" />
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {current.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-10 text-center text-gray-500"
                    >
                      No bookings found.
                    </td>
                  </tr>
                ) : (
                  current.map((b) => {
                    const userName =
                      b.userName || b.bookedByName || b.bookedBy || "—";
                    const userEmail =
                      b.userEmail || b.bookedByEmail || "—";
                    const eventName =
                      b.eventName || b.eventTitle || b.eventId || "—";
                    const bookingTime =
                      b.bookingDate || b.createdAt || b.timestamp;
                    const status = b.status || "Booked";

                    return (
                      <tr key={b.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            {b.userPhotoURL ? (
                              <img
                                src={b.userPhotoURL}
                                alt="user"
                                className="w-8 h-8 rounded-full object-cover"
                              />
                            ) : null}
                            <span>{userName}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {userEmail}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {eventName}
                        </td>

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
                            b.seats || "—"
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {typeof b.totalPrice === "number"
                            ? `$${b.totalPrice}`
                            : b.totalPrice || "—"}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          {bookingTime
                            ? dayjs(
                                typeof bookingTime === "string"
                                  ? bookingTime
                                  : toMillis(bookingTime)
                              ).format("MMM DD, YYYY hh:mm A")
                            : "—"}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <span
                            className={`text-xs font-bold px-2 py-1 rounded-full ${
                              STATUS_COLORS[status] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {status}
                          </span>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <div className="flex gap-1 flex-wrap">
                            {status !== "Attended" && (
                              <button
                                onClick={() => updateStatus(b.id, "Attended")}
                                className="text-xs bg-green-700 text-white px-2.5 py-1 rounded-lg hover:bg-green-800"
                              >
                                Attended
                              </button>
                            )}

                            {status !== "Cancelled" && (
                              <button
                                onClick={() => updateStatus(b.id, "Cancelled")}
                                className="text-xs border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50"
                              >
                                Cancel
                              </button>
                            )}

                            {status !== "Booked" && (
                              <button
                                onClick={() => updateStatus(b.id, "Booked")}
                                className="text-xs border border-gray-200 text-gray-600 px-2.5 py-1 rounded-lg hover:bg-gray-50"
                              >
                                Mark Booked
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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