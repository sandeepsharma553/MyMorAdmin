import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Search } from "lucide-react";
import { FadeLoader } from "react-spinners";

const toTime = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms
    ? new Date(ms).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "—";
};

export default function UniversityMessagesPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (universityId) load();
  }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(
          collection(db, "university", universityId, "messages"),
          orderBy("createdAt", "desc")
        )
      );
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error("Failed to load messages");
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (id) => {
    try {
      await updateDoc(doc(db, "university", universityId, "messages", id), {
        isRead: true,
      });
      setItems((prev) =>
        prev.map((i) => (i.id === id ? { ...i, isRead: true } : i))
      );
    } catch {
      toast.error("Update failed");
    }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter((i) => {
      const matchTab = tab === "all" || (tab === "unread" && !i.isRead);
      const matchSearch =
        !term ||
        i.senderName?.toLowerCase().includes(term) ||
        i.senderEmail?.toLowerCase().includes(term) ||
        i.subject?.toLowerCase().includes(term);
      return matchTab && matchSearch;
    });
  }, [items, tab, search]);

  const unreadCount = useMemo(
    () => items.filter((i) => !i.isRead).length,
    [items]
  );

  if (!universityId) {
    return (
      <main
        className="flex-1 p-6 bg-gray-100 overflow-auto"
        style={{ paddingTop: navbarHeight || 0 }}
      >
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          No university assigned.
        </div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight || 0 }}
    >
      <ToastContainer />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">University Messages</h1>
        {unreadCount > 0 && (
          <span className="bg-red-100 text-red-700 font-semibold text-sm px-3 py-1 rounded-full">
            {unreadCount} unread
          </span>
        )}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded text-sm bg-white focus:outline-none"
            placeholder="Search by sender or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          {["all", "unread"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded text-sm font-medium capitalize ${
                tab === t
                  ? "bg-black text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={loading} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            No messages found.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {["Sender", "Subject", "Message", "Date", "Status", "Actions"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-6 py-3 text-left text-sm font-medium text-gray-500"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {filtered.map((item) => (
                <tr key={item.id} className={!item.isRead ? "bg-blue-50/30" : ""}>
                  <td className="px-6 py-4 text-sm">
                    <div className="font-medium text-gray-700">
                      {item.senderName || "—"}
                    </div>
                    <div className="text-xs text-gray-400">
                      {item.senderEmail || "—"}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-700 font-medium">
                    {item.subject || "—"}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                    <div className="truncate">{item.message || "—"}</div>
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    {toTime(item.createdAt)}
                  </td>

                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        item.isRead
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}
                    >
                      {item.isRead ? "Read" : "Unread"}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {!item.isRead && (
                      <button
                        onClick={() => markRead(item.id)}
                        className="text-blue-600 hover:underline"
                      >
                        Mark Read
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}