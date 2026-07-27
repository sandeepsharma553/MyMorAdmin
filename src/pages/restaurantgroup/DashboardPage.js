import React, { useEffect, useMemo, useState } from "react";
import { getDocs, query, updateDoc, where } from "firebase/firestore";
import { useRG } from "./RGContext";
import { groupDoc, venueCol } from "../../utils/restaurantGroupPaths";
import { fullName, trainingPct, checklistPct, weekKeyOf, localDateKey, fmtHours, effectiveBreak, parseShiftTime } from "./rgUtils";
import { contractedWeekStatus } from "./contractedHours";

/* ============================================================================
   Dashboard (Job 8) — one card per sidebar section the person can SEE.
   THE RULE: card visibility is driven by the SAME permission that shows/hides
   the sidebar item (can(module,"view")) — no second permission system. A
   management-only NUMBER inside a permitted section keeps the section's
   stricter gate (labour = shifts:edit, exactly like the planner).
   Every number is REUSED from the page that owns it — no recalculating:
     labour cost/%        → ShiftPlannerPage's formula (paid hours × rate)
     under contracted     → contractedWeekStatus (the ONE calculator)
     training/checklists  → trainingPct / checklistPct (rgUtils)
     sales by venue       → PerformancePage's month orders aggregation
     hours (own)          → weeklyHours (rgUtils)
     temperature          → tempLogs' ok/dateKey fields (TemperatureLogPage)
     stock value          → StockPage's kpis reduce (qtyOnHand × cost)
   NOT built (no source anywhere yet — never faked): revenue over time,
   actual wage cost (needs Job 9), rostered vs actual worked hours. They are
   listed in Dashboard settings as "not yet available".
   Dashboard settings: the owner can switch any card OFF (group.dashboardCards,
   whole-map write). A switched-ON card the viewer lacks permission for still
   never renders — permission is checked FIRST.
   ========================================================================== */

const HOURLY = 32, WEEKLY_REVENUE = 42000; // planner's fallback estimates (labourTargets doc overrides)

export default function DashboardPage() {
  const { groupId, group, staff, venues, shifts, leave, assignments, checklistAssignments, availability,
    inventoryItems, stock, labourTargets, stations, can, me, myStaff, myScope, showToast, noteErr } = useRG();
  const managerTier = myScope !== "staff";
  const canSettings = can("settings", "edit");

  // ── week window (planner conventions: local Monday, weekKeyOf) ──
  const monday = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }, []);
  const wk = weekKeyOf(monday);
  const weekDates = useMemo(() => Array.from({ length: 7 }, (_, i) => { const x = new Date(monday); x.setDate(x.getDate() + i); return localDateKey(x); }), [monday]);
  const weekShifts = useMemo(() => shifts.filter((sh) => (sh.weekKey || wk) === wk), [shifts, wk]);
  const eff = (sh) => effectiveBreak(sh, stations, group);

  const leaveFor = (staffId, dateKey) =>
    (leave || []).some((l) => l.status === "Approved" && l.staffId === staffId
      && (l.startDate || "") <= dateKey && (l.endDate || l.startDate || "") >= dateKey);

  // ── labour (shifts:edit — the planner's exact formula, paid-hours based) ──
  const totalPaidHours = useMemo(() => weekShifts.reduce((a, sh) => a + eff(sh).paidHours, 0), [weekShifts, stations, group]); // eslint-disable-line react-hooks/exhaustive-deps
  const hourly = Number(labourTargets?.hourlyRate) || HOURLY;
  const weeklyRev = Number(labourTargets?.weeklyRevenue) || WEEKLY_REVENUE;
  const labourCost = totalPaidHours * hourly;
  const labourPct = weeklyRev ? ((labourCost / weeklyRev) * 100).toFixed(1) : "—";

  // ── under contracted hours (the planner's memo, verbatim logic) ──
  const underContract = useMemo(() =>
    staff.filter((s) => s.status !== "Inactive" && s.status !== "Left")
      .map((s) => ({ s, cw: contractedWeekStatus(s, weekShifts.filter((sh) => sh.staffId === s.id), (sh) => eff(sh).paidHours, weekDates.some((d) => leaveFor(s.id, d))) }))
      .filter((x) => x.cw.status === "short"),
    [staff, weekShifts, weekDates, leave, stations, group]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── training / checklists ──
  const activeStaff = useMemo(() => staff.filter((s) => s.status !== "Inactive" && s.status !== "Left" && !s.isKiosk), [staff]);
  const teamPct = (list, pctFn) => {
    const withWork = activeStaff.filter((s) => (list || []).some((a) => a.staffId === s.id));
    if (!withWork.length) return null;
    return Math.round(withWork.reduce((a, s) => a + pctFn(s.id, list), 0) / withWork.length);
  };

  // ── temperature: today's readings across venues (one-shot; tempLogs' own fields) ──
  const todayKey = localDateKey(new Date());
  const [temp, setTemp] = useState(null); // null = loading · {count,bad}
  useEffect(() => {
    if (!groupId || !venues.length || !can("temperature", "view")) return;
    let dead = false;
    (async () => {
      try {
        const snaps = await Promise.all(venues.map((v) => getDocs(query(venueCol(groupId, v.id, "tempLogs"), where("dateKey", "==", todayKey)))));
        if (dead) return;
        let count = 0, bad = 0;
        snaps.forEach((s) => s.forEach((d) => { count++; if (d.data().ok === false) bad++; }));
        setTemp({ count, bad });
      } catch { if (!dead) { setTemp({ count: 0, bad: 0 }); noteErr("temperature (dashboard)"); } }
    })();
    return () => { dead = true; };
  }, [groupId, venues, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── sales by venue this month (PerformancePage's aggregation; orders are manager-read) ──
  const [sales, setSales] = useState(null); // null = loading · [{venueId, name, orders, total}]
  useEffect(() => {
    if (!groupId || !venues.length || !managerTier || !can("pos", "view")) return;
    let dead = false;
    (async () => {
      try {
        const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
        const snaps = await Promise.all(venues.map((v) => getDocs(query(venueCol(groupId, v.id, "orders"), where("createdAt", ">=", monthStart)))));
        if (dead) return;
        setSales(venues.map((v, i) => {
          let orders = 0, total = 0;
          snaps[i].forEach((d) => { orders++; total += Number(d.data().amounts?.total) || 0; });
          return { venueId: v.id, name: v.name, orders, total };
        }));
      } catch { if (!dead) { setSales([]); noteErr("POS sales (dashboard)"); } }
    })();
    return () => { dead = true; };
  }, [groupId, venues, managerTier]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── stock value (StockPage's stockFor + kpis reduces, all-venues aggregate:
  // per-item quantities summed, WORST per-venue status surfaces, value = qty × cost) ──
  const stockKpis = useMemo(() => {
    const sev = { critical: 2, low: 1, ok: 0 };
    const agg = {}; // itemId -> { qty, status }
    (stock || []).forEach((s) => {
      const cur = agg[s.id] || { qty: 0, status: "ok" };
      cur.qty += Number(s.qtyOnHand) || 0;
      if ((sev[s.status] ?? 0) > (sev[cur.status] ?? 0)) cur.status = s.status;
      agg[s.id] = cur;
    });
    let value = 0, critical = 0, low = 0;
    (inventoryItems || []).filter((i) => !i.archived).forEach((i) => {
      const a = agg[i.id]; if (!a) return;
      value += a.qty * (Number(i.cost) || 0);
      if (a.status === "critical") critical++; else if (a.status === "low") low++;
    });
    return { value, critical, low };
  }, [inventoryItems, stock]);

  // ── own-week cards (staff) ──
  const myWeekShifts = useMemo(() => (myStaff ? weekShifts.filter((sh) => sh.staffId === myStaff.id).sort((a, b) => (a.day - b.day) || (parseShiftTime(a.start) - parseShiftTime(b.start))) : []), [weekShifts, myStaff]);
  const myAvail = useMemo(() => (myStaff ? (availability || []).filter((a) => a.staffId === myStaff.id) : []), [availability, myStaff]);

  // ── Dashboard settings (owner toggles; group.dashboardCards — whole-map write) ──
  const cardsCfg = group?.dashboardCards || {};
  const cardOn = (key) => cardsCfg[key] !== false;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggleCard = async (key) => {
    const next = { ...cardsCfg, [key]: cardsCfg[key] === false };
    try { await updateDoc(groupDoc(groupId), { dashboardCards: next }); }
    catch { showToast("Could not save dashboard settings"); }
  };

  const money = (n) => `$${Math.round(n).toLocaleString()}`;
  const DAY_LBL = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // ── THE CARDS — key + module (the sidebar permission that drives visibility) ──
  const CARDS = [
    { key: "myShifts", module: "shifts", title: "My shifts this week", show: () => !!myStaff, render: () => (
      <>
        <div className="dash-big">{myWeekShifts.length}</div>
        {myWeekShifts.slice(0, 5).map((sh) => <div key={sh.id} style={{ fontSize: 11, color: "var(--gray)" }}>{DAY_LBL[sh.day]} {sh.start}–{sh.end} · {sh.venue}</div>)}
        {!myWeekShifts.length && <div style={{ fontSize: 11, color: "var(--gray)" }}>No shifts rostered.</div>}
      </>
    ) },
    { key: "labour", module: "shifts", level: "edit", title: "Labour this week", render: () => (
      <>
        <div className="dash-big">{fmtHours(totalPaidHours)}h paid</div>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>Est. cost {money(labourCost)} · {labourPct}% labour (target 20–25%)</div>
      </>
    ) },
    { key: "underContract", module: "shifts", level: "edit", title: "Under contracted hours", render: () => (
      underContract.length
        ? <>
            <div className="dash-big" style={{ color: "#b45309" }}>{underContract.length}</div>
            <div style={{ fontSize: 11, color: "var(--gray)" }}>{underContract.slice(0, 4).map(({ s, cw }) => `${fullName(s)} ${fmtHours(cw.shortBy)}h`).join(" · ")}{underContract.length > 4 ? " …" : ""}</div>
          </>
        : <><div className="dash-big" style={{ color: "#16a34a" }}>0</div><div style={{ fontSize: 11, color: "var(--gray)" }}>Everyone meets contracted hours.</div></>
    ) },
    { key: "training", module: "training", title: managerTier ? "Training completion" : "My training", render: () => {
      const pct = managerTier ? teamPct(assignments, trainingPct) : (myStaff ? trainingPct(myStaff.id, assignments) : null);
      return pct === null ? <div style={{ fontSize: 11, color: "var(--gray)" }}>No training assigned.</div>
        : <><div className="dash-big">{pct}%</div><div style={{ fontSize: 11, color: "var(--gray)" }}>{managerTier ? "average across assigned staff" : "your assigned modules"}</div></>;
    } },
    { key: "checklists", module: "checklists", title: managerTier ? "Checklist completion" : "My checklists", render: () => {
      const pct = managerTier ? teamPct(checklistAssignments, checklistPct) : (myStaff ? checklistPct(myStaff.id, checklistAssignments) : null);
      return pct === null ? <div style={{ fontSize: 11, color: "var(--gray)" }}>No checklists assigned.</div>
        : <><div className="dash-big">{pct}%</div><div style={{ fontSize: 11, color: "var(--gray)" }}>{managerTier ? "average across assigned staff" : "your assigned checklists"}</div></>;
    } },
    { key: "availability", module: "availability", title: "My availability", show: () => !!myStaff, render: () => (
      <>
        <div className="dash-big">{myAvail.length}</div>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>availability posting{myAvail.length === 1 ? "" : "s"} on record</div>
      </>
    ) },
    { key: "temperature", module: "temperature", title: "Temperature today", render: () => (
      temp === null ? <div style={{ fontSize: 11, color: "var(--gray)" }}>Loading…</div>
        : <>
            <div className="dash-big" style={{ color: temp.bad ? "var(--red)" : "#16a34a" }}>{temp.count - temp.bad}/{temp.count}</div>
            <div style={{ fontSize: 11, color: "var(--gray)" }}>readings in range today{temp.bad ? ` · ${temp.bad} flagged` : ""}</div>
          </>
    ) },
    { key: "sales", module: "pos", title: "Sales by venue (this month)", show: () => managerTier, render: () => (
      sales === null ? <div style={{ fontSize: 11, color: "var(--gray)" }}>Loading…</div>
        : !sales.length ? <div style={{ fontSize: 11, color: "var(--gray)" }}>No POS orders this month.</div>
        : <>
            <div className="dash-big">{money(sales.reduce((a, v) => a + v.total, 0))}</div>
            {sales.map((v) => <div key={v.venueId} style={{ fontSize: 11, color: "var(--gray)" }}>{v.name}: {money(v.total)} · {v.orders} orders</div>)}
          </>
    ) },
    { key: "stock", module: "stock", title: "Stock value", show: () => managerTier, render: () => (
      <>
        <div className="dash-big">{money(stockKpis.value)}</div>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>at cost (ex-GST){stockKpis.critical ? ` · ${stockKpis.critical} critical` : ""}{stockKpis.low ? ` · ${stockKpis.low} low` : ""}</div>
      </>
    ) },
  ];

  // NOT YET AVAILABLE — no source calculation exists anywhere; never faked.
  const UNAVAILABLE = [
    ["revenueOverTime", "Revenue over time"],
    ["actualWageCost", "Actual wage cost (needs Job 9 — pay from clock in/out)"],
    ["rosteredVsActual", "Rostered hours vs actual worked hours"],
  ];

  // permission FIRST, then owner's card toggle, then the card's own show() guard
  const visibleCards = CARDS.filter((c) => can(c.module, c.level || "view") && cardOn(c.key) && (!c.show || c.show()));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>
          A card for each section you can see — same permissions as the sidebar.
        </div>
        {canSettings && <button className="btn btn-sm" onClick={() => setSettingsOpen((v) => !v)}>{settingsOpen ? "Close settings" : "⚙ Dashboard settings"}</button>}
      </div>

      {canSettings && settingsOpen && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><span className="card-title">Dashboard settings</span><span className="card-sub">choose which cards appear — a switched-on card still needs its section's permission</span></div>
          {CARDS.map((c) => (
            <label key={c.key} className="staff-meta-row" style={{ gap: 8, padding: "6px 0", borderBottom: "0.5px solid var(--gray-light)", cursor: "pointer" }}>
              <input type="checkbox" checked={cardOn(c.key)} onChange={() => toggleCard(c.key)} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>{c.title}</span>
              <span style={{ fontSize: 10, color: "var(--gray)" }}>· {c.module}{c.level ? `:${c.level}` : ""}</span>
            </label>
          ))}
          <div className="form-label" style={{ marginTop: 10 }}>Not yet available</div>
          {UNAVAILABLE.map(([k, l]) => (
            <div key={k} className="staff-meta-row" style={{ gap: 8, padding: "6px 0", borderBottom: "0.5px solid var(--gray-light)", opacity: 0.55 }}>
              <input type="checkbox" disabled />
              <span style={{ fontSize: 12 }}>{l}</span>
              <span className="pill pill-gray">not yet available</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {visibleCards.map((c) => (
          <div key={c.key} className="card">
            <div className="card-head" style={{ marginBottom: 6 }}><span className="card-title" style={{ fontSize: 13 }}>{c.title}</span></div>
            {c.render()}
          </div>
        ))}
        {visibleCards.length === 0 && (
          <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>Nothing to show — your permissions don&apos;t include any dashboard sections.</div>
        )}
      </div>
      {/* .dash-big lives inline — one page, no stylesheet change */}
      <style>{`.dash-big { font-size: 26px; font-weight: 700; line-height: 1.2; margin-bottom: 2px; }`}</style>
    </>
  );
}
