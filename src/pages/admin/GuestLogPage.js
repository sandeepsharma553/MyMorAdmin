import React, { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { toast, ToastContainer } from "react-toastify";
import {
  collection, getDocs, updateDoc, doc, query, orderBy,
  serverTimestamp, setDoc, getDoc,
} from "firebase/firestore";
import { db } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { Flag, Search, Download, X } from "lucide-react";

const STATUS_COLORS = {
  upcoming: "bg-blue-100 text-blue-700",
  active: "bg-green-100 text-green-700",
  checked_out: "bg-gray-100 text-gray-500",
};

const toDateStr = (ts) => {
  if (!ts) return "—";
  const ms = ts?.seconds ? ts.seconds * 1000 : Date.parse(ts);
  return ms ? new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
};

const emptyPolicy = {
  maxOvernightPerWeek: 3,
  registrationCutoffHour: 21,
  maxConsecutiveNights: 3,
  blackoutDates: [],
  policyText: "Guests must be registered before arrival. Overnight guests require prior approval.",
};

export default function GuestLogPage({ navbarHeight }) {
  const emp = useSelector((s) => s.auth.employee);
  const hostelId = String(emp?.hostelid || "");

  const [tab, setTab] = useState("log");
  const [logs, setLogs] = useState([]);
  const [policy, setPolicy] = useState(emptyPolicy);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [flagModal, setFlagModal] = useState(null);
  const [flagNote, setFlagNote] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [blackoutForm, setBlackoutForm] = useState({ startDate: "", endDate: "", reason: "" });

  useEffect(() => { if (hostelId) { loadLogs(); loadPolicy(); } }, [hostelId]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, "hostel", hostelId, "guestLogs"), orderBy("createdAt", "desc")));
      setLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { toast.error("Failed to load guest log"); }
    finally { setLoading(false); }
  };

  const loadPolicy = async () => {
    try {
      const snap = await getDoc(doc(db, "hostel", hostelId, "guestPolicy", "config"));
      if (snap.exists()) setPolicy({ ...emptyPolicy, ...snap.data() });
    } catch { /* no policy yet */ }
  };

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return logs.filter((l) => {
      const matchSearch = !term ||
        l.guestName?.toLowerCase().includes(term) ||
        l.studentName?.toLowerCase().includes(term) ||
        l.studentRoom?.toLowerCase().includes(term);
      const matchStatus = statusFilter === "all" || l.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [logs, search, statusFilter]);

  const handleFlag = async () => {
    if (!flagModal) return;
    try {
      await updateDoc(doc(db, "hostel", hostelId, "guestLogs", flagModal.id), {
        flagged: !flagModal.flagged,
        flagNote: !flagModal.flagged ? flagNote.trim() : "",
        updatedAt: serverTimestamp(),
      });
      toast.success(flagModal.flagged ? "Flag removed" : "Guest registration flagged");
      setFlagModal(null);
      setFlagNote("");
      loadLogs();
    } catch { toast.error("Update failed"); }
  };

  const savePolicy = async (e) => {
    e.preventDefault();
    setSavingPolicy(true);
    try {
      await setDoc(doc(db, "hostel", hostelId, "guestPolicy", "config"), {
        ...policy,
        updatedAt: serverTimestamp(),
      });
      toast.success("Guest policy saved");
    } catch { toast.error("Save failed"); }
    finally { setSavingPolicy(false); }
  };

  const addBlackout = () => {
    if (!blackoutForm.startDate || !blackoutForm.endDate) return toast.warn("Start and end date required");
    setPolicy((p) => ({
      ...p,
      blackoutDates: [...(p.blackoutDates || []), { ...blackoutForm }],
    }));
    setBlackoutForm({ startDate: "", endDate: "", reason: "" });
  };

  const removeBlackout = (i) => {
    setPolicy((p) => ({ ...p, blackoutDates: p.blackoutDates.filter((_, idx) => idx !== i) }));
  };

  const exportCSV = () => {
    const rows = [["Student", "Room", "Guest Name", "Relation", "Arrival", "Departure", "Overnight", "Status", "Flagged"]];
    filtered.forEach((l) => rows.push([
      l.studentName || "", l.studentRoom || "", l.guestName || "", l.relation || "",
      toDateStr(l.arrivalDate), toDateStr(l.departureDate),
      l.isOvernight ? "Yes" : "No", l.status || "", l.flagged ? "Yes" : "No",
    ]));
    const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "guest_log.csv"; a.click();
  };

  if (!hostelId) {
    return (
      <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
        <div className="bg-white rounded-xl p-10 text-center text-gray-500">No hostel assigned.</div>
        <ToastContainer />
      </main>
    );
  }

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Guest Log</h1>
        {tab === "log" && (
          <button onClick={exportCSV} className="px-4 py-2 bg-gray-200 rounded flex items-center gap-2 text-sm hover:bg-gray-300">
            <Download size={15} /> Export CSV
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-4">
        {[{ key: "log", label: "Guest Log" }, { key: "policy", label: "Guest Policy" }].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium ${tab === key ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "log" && (
        <>
          <div className="flex gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm bg-white"
                placeholder="Search guest name, student, room..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2">
              {["all", "upcoming", "active", "checked_out"].map((s) => (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={`px-3 py-2 rounded text-sm capitalize ${statusFilter === s ? "bg-black text-white" : "bg-white border border-gray-200 text-gray-600"}`}>
                  {s === "all" ? "All" : s.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64"><FadeLoader color="#36d7b7" /></div>
          ) : (
            <div className="bg-white rounded shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {["Student", "Room", "Guest", "Relation", "Arrival", "Departure", "Overnight", "Status", "Actions"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={9} className="px-6 py-10 text-center text-gray-400">No guest registrations found.</td></tr>
                  ) : filtered.map((l) => (
                    <tr key={l.id} className={l.flagged ? "bg-red-50" : ""}>
                      <td className="px-4 py-3 text-sm font-medium text-gray-800">{l.studentName || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{l.studentRoom || "—"}</td>
                      <td className="px-4 py-3 text-sm text-gray-800">
                        <div className="flex items-center gap-1">
                          {l.flagged && <Flag size={14} className="text-red-500 flex-shrink-0" />}
                          {l.guestName}
                        </div>
                        {l.flagged && l.flagNote && <p className="text-xs text-red-500 mt-0.5">{l.flagNote}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{l.relation || "—"}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{toDateStr(l.arrivalDate)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">{toDateStr(l.departureDate)}</td>
                      <td className="px-4 py-3 text-sm text-center">{l.isOvernight ? "Yes" : "No"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_COLORS[l.status] || "bg-gray-100 text-gray-600"}`}>
                          {l.status?.replace("_", " ") || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setFlagModal(l); setFlagNote(l.flagNote || ""); }}
                          className={`text-xs font-medium hover:underline ${l.flagged ? "text-green-600" : "text-red-600"}`}>
                          {l.flagged ? "Unflag" : "Flag"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === "policy" && (
        <form onSubmit={savePolicy} className="bg-white rounded shadow p-6 max-w-2xl space-y-5">
          <h2 className="font-semibold text-gray-800">Guest Policy Settings</h2>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Max overnight guests / week</label>
              <input type="number" min={0} className="w-full border border-gray-300 p-2 rounded"
                value={policy.maxOvernightPerWeek}
                onChange={(e) => setPolicy((p) => ({ ...p, maxOvernightPerWeek: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Registration cutoff hour (24h)</label>
              <input type="number" min={0} max={23} className="w-full border border-gray-300 p-2 rounded"
                value={policy.registrationCutoffHour}
                onChange={(e) => setPolicy((p) => ({ ...p, registrationCutoffHour: Number(e.target.value) }))} />
              <p className="text-xs text-gray-400 mt-1">e.g. 21 = warn after 9pm</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Max consecutive nights</label>
              <input type="number" min={1} className="w-full border border-gray-300 p-2 rounded"
                value={policy.maxConsecutiveNights}
                onChange={(e) => setPolicy((p) => ({ ...p, maxConsecutiveNights: Number(e.target.value) }))} />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Policy text (shown in student app)</label>
            <textarea rows={3} className="w-full border border-gray-300 p-2 rounded resize-none text-sm"
              value={policy.policyText}
              onChange={(e) => setPolicy((p) => ({ ...p, policyText: e.target.value }))} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Blackout Dates (no overnight guests)</label>
            <div className="space-y-2 mb-3">
              {(policy.blackoutDates || []).map((bd, i) => (
                <div key={i} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded p-2 text-sm">
                  <span className="text-gray-700">{bd.startDate} – {bd.endDate}</span>
                  {bd.reason && <span className="text-gray-500">({bd.reason})</span>}
                  <button type="button" onClick={() => removeBlackout(i)} className="ml-auto text-red-500 hover:text-red-700"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="date" className="border border-gray-300 p-2 rounded text-sm"
                value={blackoutForm.startDate}
                onChange={(e) => setBlackoutForm((f) => ({ ...f, startDate: e.target.value }))} />
              <input type="date" className="border border-gray-300 p-2 rounded text-sm"
                value={blackoutForm.endDate}
                onChange={(e) => setBlackoutForm((f) => ({ ...f, endDate: e.target.value }))} />
              <div className="flex gap-2">
                <input className="flex-1 border border-gray-300 p-2 rounded text-sm"
                  placeholder="Reason (e.g. Exams)"
                  value={blackoutForm.reason}
                  onChange={(e) => setBlackoutForm((f) => ({ ...f, reason: e.target.value }))} />
                <button type="button" onClick={addBlackout}
                  className="px-3 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-900">Add</button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={savingPolicy}
              className="px-5 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {savingPolicy ? "Saving..." : "Save Policy"}
            </button>
          </div>
        </form>
      )}

      {/* Flag modal */}
      {flagModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center">
          <div className="bg-white w-full max-w-sm p-6 rounded-lg shadow-lg">
            <h2 className="text-lg font-bold mb-3">{flagModal.flagged ? "Remove Flag" : "Flag Registration"}</h2>
            {!flagModal.flagged && (
              <>
                <p className="text-sm text-gray-600 mb-3">Add a note for why this registration is flagged:</p>
                <textarea rows={3} className="w-full border border-gray-300 p-2 rounded text-sm resize-none mb-4"
                  placeholder="e.g. Guest over limit, policy violation..."
                  value={flagNote} onChange={(e) => setFlagNote(e.target.value)} />
              </>
            )}
            {flagModal.flagged && <p className="text-sm text-gray-600 mb-4">Remove the flag from this guest registration?</p>}
            <div className="flex justify-end gap-3">
              <button onClick={() => { setFlagModal(null); setFlagNote(""); }} className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">Cancel</button>
              <button onClick={handleFlag} className={`px-4 py-2 text-white rounded ${flagModal.flagged ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}`}>
                {flagModal.flagged ? "Remove Flag" : "Flag"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
