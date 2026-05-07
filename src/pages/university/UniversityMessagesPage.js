import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { db } from "../../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  orderBy,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";
import {
  MessageSquare,
  Send,
  CheckCircle,
  XCircle,
  Search,
} from "lucide-react";
import { FadeLoader } from "react-spinners";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";

const CATEGORY_LABELS = {
  wellness:    "Wellness",
  support:     "General Support",
  maintenance: "Maintenance",
  general:     "Other",
};

const STATUS_CONFIG = {
  open:     { label: "Open",     bg: "bg-blue-100",  text: "text-blue-700"  },
  resolved: { label: "Resolved", bg: "bg-green-100", text: "text-green-700" },
};

export default function UniversityMessagesPage({ navbarHeight }) {
  const user      = useSelector((s) => s.auth.user);
  const { universityId } = useUniversityScope();

  const [conversations, setConversations] = useState([]);
  const [selected,      setSelected]      = useState(null);
  const [messages,      setMessages]      = useState([]);
  const [text,          setText]          = useState("");
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState("");
  const [statusFilter,  setStatusFilter]  = useState("open");
  const [sending,       setSending]       = useState(false);

  const bottomRef   = useRef();
  const msgUnsubRef = useRef();

  // ── Conversation list ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!universityId) return;
    const q = query(
      collection(db, "dms_conversations"),
      where("universityId", "==", universityId),
      where("scope", "==", "university"),
      orderBy("lastMessageAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setConversations(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, [universityId]);

  // ── Message thread ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (msgUnsubRef.current) msgUnsubRef.current();
    if (!selected?.id) { setMessages([]); return; }

    const q = query(
      collection(db, "dms_conversations", selected.id, "messages"),
      orderBy("timestamp", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
    msgUnsubRef.current = unsub;
    return () => unsub();
  }, [selected?.id]);

  // ── Send reply ─────────────────────────────────────────────────────────────
  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !selected?.id) return;
    setSending(true);
    try {
      await addDoc(collection(db, "dms_conversations", selected.id, "messages"), {
        senderId:   user.uid,
        senderName: user.displayName || "Support",
        senderRole: "admin",
        text:       trimmed,
        timestamp:  serverTimestamp(),
      });
      await updateDoc(doc(db, "dms_conversations", selected.id), {
        lastMessage:     trimmed,
        lastMessageAt:   serverTimestamp(),
        assignedAdminId: user.uid,
      });
      setText("");
    } catch (e) {
      console.warn("Send error:", e);
    } finally {
      setSending(false);
    }
  };

  // ── Resolve / reopen ───────────────────────────────────────────────────────
  const setStatus = async (id, status) => {
    try {
      await updateDoc(doc(db, "dms_conversations", id), { status });
      if (selected?.id === id) setSelected((prev) => ({ ...prev, status }));

      if (status === "resolved") {
        await addDoc(collection(db, "dms_conversations", id, "messages"), {
          senderId:   "system",
          senderName: "System",
          senderRole: "system",
          text:       "This conversation has been resolved by the support team. The chat is now closed.",
          timestamp:  serverTimestamp(),
        });
        await updateDoc(doc(db, "dms_conversations", id), {
          lastMessage:   "Conversation resolved.",
          lastMessageAt: serverTimestamp(),
        });
      }
    } catch {}
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const toTime = (ts) => {
    const ms = ts?.toMillis?.() ?? (typeof ts === "number" ? ts : null);
    if (!ms) return "";
    return new Date(ms).toLocaleString("en-GB", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  };

  const filtered = conversations.filter((c) => {
    const matchSearch =
      !search ||
      [c.studentName, c.studentEmail, c.subject].some((v) =>
        v?.toLowerCase().includes(search.toLowerCase())
      );
    const matchStatus = statusFilter === "all" || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  if (!universityId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          No university assigned.
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 bg-gray-100 overflow-hidden" style={{ paddingTop: navbarHeight || 0 }}>
      <UniversityScopeBanner />

      <div className="flex h-[calc(100vh-80px)] overflow-hidden">
        {/* ── Conversation list ── */}
        <div className="w-80 border-r border-gray-200 bg-white flex flex-col flex-shrink-0">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-3">Student Messages</h2>

            <div className="relative mb-2">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded text-sm focus:outline-none"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              {["open", "resolved", "all"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`flex-1 px-3 py-2 rounded text-xs font-medium capitalize ${
                    statusFilter === s
                      ? "bg-black text-white"
                      : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <FadeLoader color="#36d7b7" height={10} />
            </div>
          ) : (
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No conversations</div>
              ) : (
                filtered.map((c) => {
                  const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.open;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelected(c)}
                      className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 ${
                        selected?.id === c.id ? "bg-gray-50" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {c.studentName || "Student"}
                        </p>
                        <span className={`text-xs px-2 py-1 rounded-full font-semibold ${sc.bg} ${sc.text}`}>
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 truncate mb-0.5">{c.subject}</p>
                      <p className="text-xs text-gray-400 truncate">{c.lastMessage}</p>
                      <p className="text-xs text-gray-300 mt-1">{toTime(c.lastMessageAt)}</p>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* ── Chat panel ── */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 bg-white">
            <div className="text-center">
              <MessageSquare size={48} className="mx-auto mb-3 text-gray-200" />
              <p className="text-lg font-semibold">Select a conversation</p>
              <p className="text-sm">Choose a message from the left to reply</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Header */}
            <div className="border-b border-gray-200 px-6 py-4 flex items-center gap-4">
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{selected.studentName}</p>
                <p className="text-sm text-gray-500">
                  {selected.subject} · {CATEGORY_LABELS[selected.category] || selected.category}
                </p>
                <p className="text-xs text-gray-400">{selected.studentEmail}</p>
              </div>
              <div className="flex gap-2">
                {selected.status === "open" ? (
                  <button
                    onClick={() => setStatus(selected.id, "resolved")}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm inline-flex items-center gap-2"
                  >
                    <CheckCircle size={14} /> Resolve
                  </button>
                ) : (
                  <button
                    onClick={() => setStatus(selected.id, "open")}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-sm inline-flex items-center gap-2"
                  >
                    <XCircle size={14} /> Reopen
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50">
              {messages.map((msg) => {
                if (msg.senderRole === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <div className="bg-green-50 border border-green-200 text-green-700 text-xs px-4 py-2 rounded-full flex items-center gap-1">
                        <CheckCircle size={12} />
                        {msg.text}
                      </div>
                    </div>
                  );
                }
                const isAdmin = msg.senderRole === "admin";
                return (
                  <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-md rounded-2xl px-4 py-3 ${
                        isAdmin ? "bg-blue-600 text-white" : "bg-white border border-gray-200"
                      }`}
                    >
                      {!isAdmin && (
                        <p className="text-xs font-semibold text-gray-500 mb-1">{msg.senderName}</p>
                      )}
                      <p className={`text-sm ${isAdmin ? "text-white" : "text-gray-800"}`}>{msg.text}</p>
                      <p className={`text-xs mt-1 text-right ${isAdmin ? "text-blue-100" : "text-gray-400"}`}>
                        {toTime(msg.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input / resolved footer */}
            {selected.status === "open" ? (
              <div className="border-t border-gray-200 p-4 flex gap-3 bg-white">
                <input
                  className="flex-1 border border-gray-300 rounded px-4 py-3 text-sm focus:outline-none"
                  placeholder="Type a reply..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                />
                <button
                  onClick={send}
                  disabled={!text.trim() || sending}
                  className="bg-blue-600 text-white px-5 py-3 rounded hover:bg-blue-700 disabled:opacity-40 flex items-center gap-2"
                >
                  <Send size={16} />
                </button>
              </div>
            ) : (
              <div className="bg-green-50 border-t border-green-200 p-4 text-center text-sm text-green-700 font-medium">
                This conversation is resolved. Reopen to reply.
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
