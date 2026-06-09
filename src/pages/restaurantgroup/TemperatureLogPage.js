import React, { useEffect, useMemo, useState } from "react";
import { addDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (ts) => { try { const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const inRange = (t, mn, mx) => (mn == null || t >= mn) && (mx == null || t <= mx);

export default function TemperatureLogPage() {
  const { groupId, venues, equipment, staff, me, selectedVenue, can, showToast } = useRG();
  const canLog = can("temperature", "edit");
  const [venueTab, setVenueTab] = useState(selectedVenue === "all" ? (venues[0]?.id || "") : selectedVenue);
  useEffect(() => { if (selectedVenue !== "all") setVenueTab(selectedVenue); else if (!venueTab && venues[0]) setVenueTab(venues[0].id); }, [selectedVenue, venues]); // eslint-disable-line

  const myUid = me?.uid || me?.id;
  const myStaff = useMemo(() => staff.find((s) => (s.adminUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())), [staff, myUid, me]);
  const recorder = myStaff ? (myStaff.displayName || myStaff.name) : (me?.displayName || me?.name || me?.email || "Staff");

  const venueUnits = useMemo(() => equipment.filter((e) => e.venueId === venueTab), [equipment, venueTab]);

  const [logs, setLogs] = useState([]);
  useEffect(() => {
    if (!groupId || !venueTab) { setLogs([]); return; }
    return onSnapshot(venueCol(groupId, venueTab, "tempLogs"), (s) => {
      const rows = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
      setLogs(rows);
    }, () => setLogs([]));
  }, [groupId, venueTab]);

  const todayKey = dayKey(new Date());
  const [draft, setDraft] = useState({}); // unitId -> temp string
  const [noteDraft, setNoteDraft] = useState({});
  const lastReading = (unitId) => logs.find((l) => l.unitId === unitId);
  const todayDone = useMemo(() => new Set(logs.filter((l) => l.dateKey === todayKey).map((l) => l.unitId)), [logs, todayKey]);

  const log = async (u) => {
    const raw = draft[u.id];
    if (raw === undefined || raw === "" || isNaN(Number(raw))) return showToast("Enter a temperature");
    const temp = Number(raw);
    const ok = inRange(temp, u.minTemp ?? null, u.maxTemp ?? null);
    try {
      await addDoc(venueCol(groupId, venueTab, "tempLogs"), {
        unitId: u.id, unitName: u.name, type: u.type || "", temp, ok,
        minTemp: u.minTemp ?? null, maxTemp: u.maxTemp ?? null,
        note: (noteDraft[u.id] || "").trim(), recordedBy: recorder, recordedById: myStaff?.id || myUid || "",
        venueId: venueTab, dateKey: todayKey, at: serverTimestamp(),
      });
      setDraft((p) => ({ ...p, [u.id]: "" })); setNoteDraft((p) => ({ ...p, [u.id]: "" }));
      if (!ok) showToast(`⚠ ${u.name} out of safe range — logged & flagged`);
    } catch { showToast("Could not save reading"); }
  };

  const outToday = logs.filter((l) => l.dateKey === todayKey && l.ok === false).length;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          {venues.map((v) => (
            <button key={v.id} className={`tab ${venueTab === v.id ? "active" : ""}`} onClick={() => setVenueTab(v.id)}>{v.type === "CK" ? "Central Kitchen" : v.name}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)" }}>
          {todayDone.size}/{venueUnits.length} logged today{outToday > 0 && <span style={{ color: "var(--red)", fontWeight: 600 }}> · {outToday} out of range ⚠</span>}
        </div>
      </div>

      {venueUnits.length === 0 ? (
        <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No units set up for this venue yet. Add fridges/freezers in <strong>Settings → Temperature units</strong>.</div>
      ) : (
        <div className="grid-2" style={{ marginBottom: 16 }}>
          {venueUnits.map((u) => {
            const last = lastReading(u.id);
            const done = todayDone.has(u.id);
            return (
              <div key={u.id} className="card" style={{ borderColor: last && last.ok === false ? "var(--red)" : undefined }}>
                <div className="card-head">
                  <div>
                    <span className="card-title">{u.name} <span className="pill pill-blue" style={{ marginLeft: 4 }}>{u.type}</span></span>
                    <span className="card-sub">Safe: {u.minTemp ?? "–"}°C to {u.maxTemp ?? "–"}°C</span>
                  </div>
                  {done ? <span className="pill pill-green">✓ Logged today</span> : <span className="pill pill-amber">Not logged</span>}
                </div>
                {last && (
                  <div style={{ fontSize: 12, marginBottom: 8 }}>
                    Last: <strong style={{ color: last.ok === false ? "var(--red)" : "var(--ink)" }}>{last.temp}°C {last.ok === false ? "⚠ out of range" : "✓"}</strong>
                    <span style={{ color: "var(--gray)" }}> · {fmtTime(last.at)} · {last.recordedBy}</span>
                  </div>
                )}
                {canLog && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input className="form-input" style={{ width: 90 }} type="number" step="0.1" value={draft[u.id] ?? ""} onChange={(e) => setDraft((p) => ({ ...p, [u.id]: e.target.value }))} placeholder="°C" onKeyDown={(e) => e.key === "Enter" && log(u)} />
                    <input className="form-input" style={{ flex: 1, minWidth: 120 }} value={noteDraft[u.id] ?? ""} onChange={(e) => setNoteDraft((p) => ({ ...p, [u.id]: e.target.value }))} placeholder="Note (optional)" />
                    <button className="btn btn-primary btn-sm" onClick={() => log(u)}>Log</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* History */}
      <div className="card">
        <div className="card-head"><span className="card-title">Reading history</span><span className="card-sub">Most recent first</span></div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>When</th><th>Unit</th><th>Temp</th><th>Status</th><th>By</th><th>Note</th></tr></thead>
            <tbody>
              {logs.slice(0, 100).map((l) => (
                <tr key={l.id}>
                  <td>{fmtTime(l.at)}</td>
                  <td>{l.unitName}</td>
                  <td style={{ fontWeight: 600, color: l.ok === false ? "var(--red)" : "var(--ink)" }}>{l.temp}°C</td>
                  <td>{l.ok === false ? <span className="pill pill-red">Out of range</span> : <span className="pill pill-green">OK</span>}</td>
                  <td>{l.recordedBy}</td>
                  <td style={{ color: "var(--gray)" }}>{l.note || "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={6} style={{ color: "var(--gray)" }}>No readings logged yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
