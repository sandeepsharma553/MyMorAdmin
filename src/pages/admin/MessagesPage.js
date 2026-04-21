import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { ref as dbRef, query as rtdbQuery, orderByChild, equalTo, onValue, off, push, update, serverTimestamp } from "firebase/database";
import { database } from "../../firebase";
import { MessageSquare, Send, CheckCircle, XCircle, Search } from "lucide-react";
import { FadeLoader } from "react-spinners";

const CATEGORY_LABELS = {
  wellness:    "Wellness",
  support:     "General Support",
  maintenance: "Maintenance",
  general:     "Other",
};

const STATUS_CONFIG = {
  open:     { label: "Open",     bg: "bg-blue-100",  text: "text-blue-700" },
  resolved: { label: "Resolved", bg: "bg-green-100", text: "text-green-700" },
};

export default function MessagesPage() {
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [conversations, setConversations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("open");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef();
  const msgUnsubRef = useRef();

  // Load all conversations scoped to this hostel
  useEffect(() => {
    if (!hostelId) return;
    const convRef = rtdbQuery(
      dbRef(database, "dms/conversations"),
      orderByChild("hostelId"),
      equalTo(hostelId)
    );
    const unsub = onValue(convRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      list.sort((a, b) => (b.lastMessageAt || 0) - (a.lastMessageAt || 0));
      setConversations(list);
      setLoading(false);
    });
    return () => off(convRef, "value", unsub);
  }, [hostelId]);

  // Load messages for selected conversation
  useEffect(() => {
    if (msgUnsubRef.current) {
      off(dbRef(database, `dms/messages/${selected?.id || "_invalid"}`), "value", msgUnsubRef.current);
    }
    if (!selected?.id) { setMessages([]); return; }

    const msgRef = dbRef(database, `dms/messages/${selected.id}`);
    const unsub = onValue(msgRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      setMessages(list);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    msgUnsubRef.current = unsub;
    return () => off(msgRef, "value", unsub);
  }, [selected?.id]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !selected?.id) return;
    setSending(true);
    try {
      await push(dbRef(database, `dms/messages/${selected.id}`), {
        senderId: user.uid,
        senderName: user.displayName || "Support",
        senderRole: "admin",
        text: trimmed,
        timestamp: serverTimestamp(),
      });
      await update(dbRef(database, `dms/conversations/${selected.id}`), {
        lastMessage: trimmed,
        lastMessageAt: serverTimestamp(),
        assignedAdminId: user.uid,
      });
      setText("");
    } catch (e) { console.warn("Send error:", e); }
    finally { setSending(false); }
  };

  const setStatus = async (id, status) => {
    try {
      await update(dbRef(database, `dms/conversations/${id}`), { status });
      if (selected?.id === id) setSelected(prev => ({ ...prev, status }));
    } catch {}
  };

  const toTime = (ts) => {
    if (!ts) return "";
    return new Date(ts).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const filtered = conversations.filter(c => {
    const matchSearch = !search || [c.studentName, c.studentEmail, c.subject]
      .some(v => v?.toLowerCase().includes(search.toLowerCase()));
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="flex h-screen max-h-screen overflow-hidden bg-gray-50">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-100">
          <h2 className="font-bold text-gray-800 mb-3">Student Messages</h2>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1">
            {["open", "resolved", "all"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`flex-1 py-1 text-xs font-semibold rounded-lg capitalize transition ${statusFilter === s ? "bg-green-800 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="flex justify-center py-8"><FadeLoader color="#073b15" height={10} /></div>}

        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 && !loading && (
            <div className="text-center py-10 text-gray-400 text-sm">No conversations</div>
          )}
          {filtered.map(c => {
            const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.open;
            return (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition ${selected?.id === c.id ? "bg-gray-50 border-l-2 border-l-green-700" : ""}`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="font-semibold text-gray-800 text-sm truncate">{c.studentName || "Student"}</p>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold flex-shrink-0 ${sc.bg} ${sc.text}`}>{sc.label}</span>
                </div>
                <p className="text-xs text-gray-500 truncate mb-0.5">{c.subject}</p>
                <p className="text-xs text-gray-400 truncate">{c.lastMessage}</p>
                <p className="text-xs text-gray-300 mt-1">{toTime(c.lastMessageAt)}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chat panel */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <MessageSquare size={48} className="mx-auto mb-3 text-gray-200" />
            <p className="text-lg font-semibold">Select a conversation</p>
            <p className="text-sm">Choose a message from the left to reply</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Convo header */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="font-bold text-gray-800">{selected.studentName}</p>
              <p className="text-sm text-gray-500">{selected.subject} · {CATEGORY_LABELS[selected.category] || selected.category}</p>
              <p className="text-xs text-gray-400">{selected.studentEmail}</p>
            </div>
            <div className="flex gap-2">
              {selected.status === "open" ? (
                <button
                  onClick={() => setStatus(selected.id, "resolved")}
                  className="flex items-center gap-1.5 text-sm bg-green-700 text-white px-3 py-1.5 rounded-lg hover:bg-green-800"
                >
                  <CheckCircle size={14} /> Resolve
                </button>
              ) : (
                <button
                  onClick={() => setStatus(selected.id, "open")}
                  className="flex items-center gap-1.5 text-sm border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  <XCircle size={14} /> Reopen
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map(msg => {
              const isAdmin = msg.senderRole === "admin";
              return (
                <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-md rounded-2xl px-4 py-3 ${isAdmin ? "bg-green-800 text-white" : "bg-white border border-gray-100 shadow-sm"}`}>
                    {!isAdmin && <p className="text-xs font-semibold text-gray-500 mb-1">{msg.senderName}</p>}
                    <p className={`text-sm ${isAdmin ? "text-white" : "text-gray-800"}`}>{msg.text}</p>
                    <p className={`text-xs mt-1 ${isAdmin ? "text-green-200" : "text-gray-400"} text-right`}>
                      {toTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          {selected.status === "open" ? (
            <div className="bg-white border-t border-gray-200 p-4 flex gap-3">
              <input
                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
                placeholder="Type a reply…"
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button
                onClick={send}
                disabled={!text.trim() || sending}
                className="bg-green-800 text-white px-5 py-3 rounded-xl hover:bg-green-700 disabled:opacity-40 flex items-center gap-2"
              >
                <Send size={16} />
              </button>
            </div>
          ) : (
            <div className="bg-gray-50 border-t border-gray-200 p-4 text-center text-sm text-gray-400">
              This conversation is resolved. Reopen to reply.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
