import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import {
  collection, getDocs, updateDoc, doc, query, orderBy,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Search } from "lucide-react";
import { FadeLoader } from "react-spinners";

const toTime = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
};

export default function UniversityMessagesPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const universityId = String(emp?.universityid || emp?.universityId || "");

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => { if (universityId) load(); }, [universityId]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "university", universityId, "messages"), orderBy("createdAt", "desc")));
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load messages"); }
    finally { setLoading(false); }
  };

  const markRead = async (id) => {
    try {
      await updateDoc(doc(db, "university", universityId, "messages", id), { isRead: true });
      setItems(prev => prev.map(i => i.id === id ? { ...i, isRead: true } : i));
    } catch { toast.error("Update failed"); }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return items.filter(i => {
      const matchTab = tab === "all" || (tab === "unread" && !i.isRead);
      const matchSearch = !term || i.senderName?.toLowerCase().includes(term) || i.senderEmail?.toLowerCase().includes(term) || i.subject?.toLowerCase().includes(term);
      return matchTab && matchSearch;
    });
  }, [items, tab, search]);

  const unreadCount = useMemo(() => items.filter(i => !i.isRead).length, [items]);

  if (!universityId) return <div className="p-8 text-center text-gray-400">No university assigned.</div>;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <ToastContainer position="top-right" autoClose={3000} />
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Messages</h1>
          <p className="text-sm text-gray-500 mt-1">Inbox from students and staff</p>
        </div>
        {unreadCount > 0 && (
          <span className="bg-red-100 text-red-700 font-bold text-sm px-3 py-1.5 rounded-full">{unreadCount} unread</span>
        )}
      </div>

      <div className="flex gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-600 bg-white"
            placeholder="Search by sender or subject…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {["all", "unread"].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-2 text-xs font-semibold rounded-lg capitalize ${tab === t ? "bg-green-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{t}</button>
          ))}
        </div>
      </div>

      {loading && <div className="flex justify-center py-10"><FadeLoader color="#073b15" /></div>}

      {!loading && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          {filtered.length === 0
            ? <div className="text-center py-16 text-gray-400"><p className="text-lg font-semibold">No messages found</p></div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Sender", "Subject", "Message", "Date", "Status", "Actions"].map(h => (
                      <th key={h} className="text-left p-3 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!item.isRead ? "bg-blue-50/30" : ""}`}>
                      <td className="p-3">
                        <p className="font-semibold text-gray-800">{item.senderName || "—"}</p>
                        <p className="text-xs text-gray-400">{item.senderEmail}</p>
                      </td>
                      <td className="p-3 font-semibold text-gray-700">{item.subject || "—"}</td>
                      <td className="p-3 text-gray-500 max-w-xs"><p className="truncate">{item.message || "—"}</p></td>
                      <td className="p-3 text-gray-500 text-xs">{toTime(item.createdAt)}</td>
                      <td className="p-3">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.isRead ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {item.isRead ? "Read" : "Unread"}
                        </span>
                      </td>
                      <td className="p-3">
                        {!item.isRead && (
                          <button onClick={() => markRead(item.id)} className="text-xs bg-green-700 text-white px-2.5 py-1.5 rounded-lg hover:bg-green-800">Mark Read</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  );
}
