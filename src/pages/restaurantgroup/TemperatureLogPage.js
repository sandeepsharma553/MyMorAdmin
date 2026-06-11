import React, { useEffect, useMemo, useState } from "react";
import { addDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useRG } from "./RGContext";
import { venueCol } from "../../utils/restaurantGroupPaths";
import { sendNotification } from "./notify";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtTime = (ts) => { try { const d = ts?.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }); } catch { return ""; } };
const inRange = (t, mn, mx) => (mn == null || t >= mn) && (mx == null || t <= mx);

export default function TemperatureLogPage() {
  const { groupId, venues, equipment, staff, me, myScope, selectedVenue, can, showToast } = useRG();
  const canLog = can("temperature", "edit");

  const myUid = me?.uid || me?.id;
  const myStaff = useMemo(() => staff.find((s) => (s.adminUid && s.adminUid === myUid) || (s.email && me?.email && s.email.toLowerCase() === me.email.toLowerCase())), [staff, myUid, me]);
  // only venues this user belongs to (owner/super → all)
  const scopedVenues = useMemo(() => {
    if (myScope === "owner") return venues;
    const mv = myStaff?.venueIds?.length ? myStaff.venueIds : (myStaff?.venueId ? [myStaff.venueId] : []);
    return venues.filter((v) => mv.includes(v.id));
  }, [venues, myScope, myStaff]);

  const [venueTab, setVenueTab] = useState(selectedVenue === "all" ? "" : selectedVenue);
  useEffect(() => {
    if (selectedVenue !== "all" && scopedVenues.some((v) => v.id === selectedVenue)) setVenueTab(selectedVenue);
    else if (!scopedVenues.some((v) => v.id === venueTab) && scopedVenues[0]) setVenueTab(scopedVenues[0].id);
  }, [selectedVenue, scopedVenues]); // eslint-disable-line
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
      if (!ok) { showToast(`⚠ ${u.name} out of safe range — logged & flagged`); sendNotification(groupId, { to: "managers", type: "temperature", title: "Temperature out of range", body: `${u.name}: ${temp}°C (safe ${u.minTemp ?? "—"}–${u.maxTemp ?? "—"}°C) · ${recorder}`, venueId: venueTab, by: recorder }); }
    } catch { showToast("Could not save reading"); }
  };

  const outToday = logs.filter((l) => l.dateKey === todayKey && l.ok === false).length;

  // ── History calendar (#7): one cell per day — green all-in-range, red any out, gray unlogged ──
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [histMonth, setHistMonth] = useState(0); // month offset
  const [histDay, setHistDay] = useState(null); // selected dateKey
  const histBase = useMemo(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() + histMonth, 1); }, [histMonth]);
  const histCells = useMemo(() => {
    const y = histBase.getFullYear(), m = histBase.getMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7;
    const days = new Date(y, m + 1, 0).getDate();
    const arr = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(`${y}-${pad(m + 1)}-${pad(d)}`);
    while (arr.length % 7) arr.push(null);
    return arr;
  }, [histBase]);
  const byDate = useMemo(() => {
    const map = {};
    logs.forEach((l) => {
      if (!l.dateKey) return;
      map[l.dateKey] = map[l.dateKey] || { count: 0, bad: 0 };
      map[l.dateKey].count++;
      if (l.ok === false) map[l.dateKey].bad++;
    });
    return map;
  }, [logs]);
  const histDayLogs = histDay ? logs.filter((l) => l.dateKey === histDay) : [];

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          {scopedVenues.map((v) => (
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

      {/* History calendar — month at a glance for compliance review (e.g. the council) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-head">
          <div><span className="card-title">Compliance calendar</span><span className="card-sub">Green = all in range · Red = out-of-range reading · Gray = nothing logged</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="btn btn-sm" onClick={() => setHistMonth((o) => o - 1)}>←</button>
            <strong style={{ fontSize: 13, minWidth: 90, textAlign: "center" }}>{MONTHS[histBase.getMonth()]} {histBase.getFullYear()}</strong>
            <button className="btn btn-sm" onClick={() => setHistMonth((o) => o + 1)}>→</button>
            {histMonth !== 0 && <button className="btn btn-sm" onClick={() => setHistMonth(0)}>This month</button>}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: "var(--gray)" }}>{d}</div>)}
          {histCells.map((k, i) => {
            if (!k) return <div key={i} />;
            const st = byDate[k];
            const bg = !st ? "var(--gray-light)" : st.bad > 0 ? "#fee2e2" : "#dcfce7";
            const fg = !st ? "var(--gray)" : st.bad > 0 ? "#991b1b" : "#166534";
            return (
              <div key={k} onClick={() => st && setHistDay(histDay === k ? null : k)}
                style={{ background: bg, color: fg, borderRadius: 6, padding: "7px 2px", textAlign: "center", fontSize: 11, fontWeight: 600, cursor: st ? "pointer" : "default", outline: histDay === k ? "2px solid var(--ink)" : "none" }}
                title={st ? `${st.count} reading(s)${st.bad ? ` · ${st.bad} out of range` : ""}` : "No readings"}>
                {Number(k.slice(8))}
                {st && <div style={{ fontSize: 9, fontWeight: 500 }}>{st.bad > 0 ? `⚠ ${st.bad}` : `✓ ${st.count}`}</div>}
              </div>
            );
          })}
        </div>
        {histDay && (
          <div style={{ marginTop: 10, borderTop: "0.5px solid var(--border)", paddingTop: 8 }}>
            <div className="form-label">Readings on {histDay}</div>
            {histDayLogs.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                <span>{l.unitName}{l.note ? ` · ${l.note}` : ""}</span>
                <span style={{ fontWeight: 600, color: l.ok === false ? "var(--red)" : "var(--ink)" }}>{l.temp}°C {l.ok === false ? "⚠" : "✓"} <span style={{ color: "var(--gray)", fontWeight: 400 }}>· {l.recordedBy}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

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
