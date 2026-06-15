import React, { useMemo, useState } from "react";
import { Formik, Form, Field, FieldArray } from "formik";
import * as Yup from "yup";
import { writeBatch, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useRG } from "./RGContext";
import { awardRateDoc, complianceManualDoc, acknowledgementDoc, notificationsCol, venueDoc } from "../../utils/restaurantGroupPaths";
import { venueLabourReadiness } from "./rgComplianceUtils";

// Formik+Yup are mandated for this module (handoff hard rule). Other /rg/* pages
// use plain useState forms; the rate + manual editors below intentionally differ.
const nNum = Yup.number().transform((v, o) => (o === "" || o === null ? null : v)).nullable();
const rateSchema = Yup.object({
  verified: Yup.boolean(),
  levels: Yup.array().of(Yup.object({
    level: Yup.string().trim().required("required"),
    weekly: nNum.min(0), baseHourly: nNum.min(0), casualHourly: nNum.min(0),
    sat: nNum.min(0), sun: nNum.min(0), publicHol: nNum.min(0), evening: nNum.min(0),
  })),
  juniorRates: Yup.array().of(Yup.object({ ageBand: Yup.string().trim().required(), pct: nNum.min(0).max(100) })),
});
const manualSchema = Yup.object({
  title: Yup.string().trim().required("Title required"),
  version: Yup.string().trim().required("Version required"),
  sections: Yup.array().of(Yup.object({
    id: Yup.string().trim().required(), title: Yup.string().trim().required("Section title required"),
  })).min(1, "At least one section"),
});
const bumpVersion = (v) => { const m = /^(\d+)\.(\d+)$/.exec(String(v || "")); return m ? `${m[1]}.${Number(m[2]) + 1}` : "1.1"; };
const cleanNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));

// $ formatters (display only — no wage figure is hardcoded; all come from awardRates docs)
const money = (n) => (n == null || n === "" || isNaN(Number(n)))
  ? "—"
  : "$" + Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const hourly = (n) => (n == null ? "—" : money(n));
const fmtDate = (v) => { if (!v) return "—"; try { const d = v?.toDate ? v.toDate() : new Date(v); return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }); } catch { return String(v); } };

const LINK_TAG_PILL = { Primary: "pill-red", "Dine-in": "pill-purple", Occasional: "pill-gray", "Verify here": "pill-green" };

export default function CompliancePage() {
  const {
    groupId, awardRates, complianceManual, group, venues, scopedStaff, acksByStaff,
    venueName, can, myStaff, me, showToast,
  } = useRG();
  const canEdit = can("compliance", "edit");
  const actor = myStaff?.name || `${myStaff?.first || ""} ${myStaff?.last || ""}`.trim() || me?.name || me?.email || "Admin";

  const [tab, setTab] = useState("wages"); // wages | manual | links | ack
  const [rateEditor, setRateEditor] = useState(null); // award object being edited
  const [manualEditor, setManualEditor] = useState(false);
  const [busy, setBusy] = useState(false);
  const awards = useMemo(() => [...awardRates].sort((a, b) => (a.code || "").localeCompare(b.code || "")), [awardRates]);
  const [awardCode, setAwardCode] = useState("");
  const award = useMemo(() => awards.find((a) => a.code === awardCode) || awards[0] || null, [awards, awardCode]);

  const anyUnverified = awards.some((a) => a.verified !== true);
  const awardLinks = group?.awardLinks || [];
  const manual = complianceManual;

  // venues that explicitly select this award (venue.awardCode — NOT venue.type)
  const venuesForAward = (code) => venues.filter((v) => v.awardCode === code);

  // ── manual accordion ──
  const [openSec, setOpenSec] = useState({});
  const toggleSec = (id) => setOpenSec((p) => ({ ...p, [id]: !p[id] }));

  // ── acknowledgements (current manual version) ──
  const currentVersion = manual?.version || null;
  const ackFor = (staffId) => (acksByStaff?.[staffId] || []).find((a) => a.version === currentVersion) || null;
  const ackRows = useMemo(() => (scopedStaff || []).map((s) => ({ s, ack: ackFor(s.id) })), [scopedStaff, acksByStaff, currentVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const ackDone = ackRows.filter((r) => r.ack).length;
  const ackTotal = ackRows.length;
  const ackPct = ackTotal ? Math.round((ackDone / ackTotal) * 100) : 0;

  // ── writes ──

  // Save award rates. An award is ONE doc (levels/junior/penalties are array
  // fields), so this is a single atomic setDoc — not a batch (the handoff's
  // "writeBatch for saving all levels" assumed per-level docs; our schema keeps
  // them in one doc, which is atomic by construction). Sets verified + reviewer.
  const saveRates = async (values) => {
    if (!can("compliance", "edit")) return showToast("You don't have permission to edit rates");
    const verified = !!values.verified;
    try {
      await setDoc(awardRateDoc(groupId, rateEditor.code), {
        levels: (values.levels || []).map((l) => ({
          level: l.level, weekly: cleanNum(l.weekly), baseHourly: cleanNum(l.baseHourly), casualHourly: cleanNum(l.casualHourly),
          sat: cleanNum(l.sat), sun: cleanNum(l.sun), publicHol: cleanNum(l.publicHol), evening: cleanNum(l.evening),
        })),
        juniorRates: (values.juniorRates || []).map((j) => ({ ageBand: j.ageBand, pct: cleanNum(j.pct) })),
        notes: values.notes || "",
        verified,
        reviewedBy: verified ? actor : null,
        reviewedAt: verified ? serverTimestamp() : null,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(verified ? `${rateEditor.name} verified & saved` : `${rateEditor.name} saved (still unverified)`);
      setRateEditor(null);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };

  // Save the manual; bumps version so prior acknowledgements no longer count as current.
  const saveManual = async (values) => {
    if (!can("compliance", "edit")) return showToast("You don't have permission to edit the manual");
    try {
      await setDoc(complianceManualDoc(groupId), {
        title: values.title.trim(), version: values.version.trim(),
        sections: (values.sections || []).map((s) => ({ id: s.id, icon: s.icon || "📄", title: s.title, meta: s.meta || "", body: s.body || "" })),
        updatedBy: actor, updatedAt: serverTimestamp(),
      }, { merge: true });
      showToast(`Manual saved as v${values.version.trim()}`);
      setManualEditor(false);
    } catch (e) { showToast(`Could not save: ${e?.code || e?.message || "error"}`); }
  };

  // Staff self-acknowledge. NOT gated by canEdit — a staff member with
  // compliance:"view" may write ONLY their own ack (the documented exception).
  // We re-verify the writer is that staff member; firestore.rules enforce it too.
  const selfAcknowledge = async (staffId) => {
    if (busy) return;
    if (!myStaff || myStaff.id !== staffId) return showToast("You can only acknowledge for yourself");
    if (!currentVersion) return showToast("No current manual to acknowledge");
    setBusy(true);
    try {
      const venueCode = venues.find((v) => (myStaff.venueIds || []).includes(v.id))?.awardCode || null;
      await setDoc(acknowledgementDoc(groupId, staffId, currentVersion), {
        version: currentVersion, ackedAt: serverTimestamp(), ackedBy: actor, awardCode: venueCode,
      });
      showToast("Manual acknowledged — thank you");
    } catch (e) { showToast(`Could not record: ${e?.code || e?.message || "error"}`); }
    setBusy(false);
  };

  // Assign an award to a venue (the explicit venue.awardCode selector — the
  // prerequisite for the labour-cost gate). Manager+ only.
  const assignVenueAward = async (venueId, code) => {
    if (!can("compliance", "edit")) return showToast("Managers only");
    try {
      await setDoc(venueDoc(groupId, venueId), { awardCode: code || null }, { merge: true });
      showToast(code ? `Award ${code} assigned to venue` : "Award unassigned from venue");
    } catch (e) { showToast(`Could not assign: ${e?.code || e?.message || "error"}`); }
  };

  // Manager remind: notify pending staff. Bulk → ONE writeBatch of notification docs.
  const remind = async (rows) => {
    if (!can("compliance", "edit")) return showToast("Managers only");
    const pending = rows.filter((r) => !r.ack && r.s.id);
    if (!pending.length) return showToast("Nobody pending");
    try {
      const batch = writeBatch(db);
      pending.forEach((r) => {
        batch.set(doc(notificationsCol(groupId)), {
          to: r.s.id, type: "compliance", title: "Please acknowledge the staff manual",
          body: `Manual v${currentVersion || ""} needs your acknowledgement in Awards & Compliance.`,
          venueId: (r.s.venueIds || [])[0] || "", by: actor, readBy: [], at: serverTimestamp(),
        });
      });
      await batch.commit();
      showToast(`Reminder sent to ${pending.length} staff`);
    } catch (e) { showToast(`Could not send: ${e?.code || e?.message || "error"}`); }
  };

  const Metric = ({ label, value, sub, color }) => (
    <div className="card" style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.2 }}>{value}</div>
      {sub != null && <div style={{ fontSize: 11, marginTop: 3, color: color || "var(--gray)" }}>{sub}</div>}
    </div>
  );

  const hasPenaltyCols = !!award && (award.levels || []).some((l) => l.sat != null || l.sun != null || l.publicHol != null || l.evening != null);

  return (
    <>
      {/* Unverified banner — driven by the verified flag, not hardcoded */}
      {anyUnverified && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: "var(--amber-light)", border: "0.5px solid #fcd34d", borderRadius: 10, padding: "11px 14px", marginBottom: 16, fontSize: 12, color: "#92500a" }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div>
            <strong style={{ color: "#7c3d04" }}>Wage rates not yet verified.</strong> These figures were supplied as a draft (penalty/casual/junior multipliers are internally consistent, but base rates are unconfirmed). A manager must verify each award against the official Fair Work pay guides before it can feed payroll or labour-cost calculations. Award rates change on the first full pay period on or after <strong>1 July</strong> each year.
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="tabs">
          <button className={`tab ${tab === "wages" ? "active" : ""}`} onClick={() => setTab("wages")}>Wage Awards</button>
          <button className={`tab ${tab === "manual" ? "active" : ""}`} onClick={() => setTab("manual")}>Compliance Manual</button>
          <button className={`tab ${tab === "links" ? "active" : ""}`} onClick={() => setTab("links")}>Award Links</button>
          <button className={`tab ${tab === "ack" ? "active" : ""}`} onClick={() => setTab("ack")}>Acknowledgements{ackTotal ? ` (${ackDone}/${ackTotal})` : ""}</button>
        </div>
        {award?.effectiveFrom && <span className="pill pill-gray">Effective from {fmtDate(award.effectiveFrom)}{award.verified !== true ? " (draft)" : ""}</span>}
      </div>

      {/* ── TAB 1: WAGE AWARDS ── */}
      {tab === "wages" && (
        !award ? <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No award rates loaded yet.</div> : (
          <>
            <div className="grid-4" style={{ marginBottom: 16 }}>
              <Metric label="Selected award" value={<span style={{ fontSize: 16 }}>{award.name}</span>} sub={award.code} />
              <Metric label={`Base adult — ${award.levels?.[0]?.level || "L1"}`} value={<>{hourly(award.levels?.[0]?.baseHourly)}<span style={{ fontSize: 12, color: "var(--gray)", fontWeight: 400 }}>/hr</span></>} sub={award.verified === true ? "verified" : "draft · unverified"} color={award.verified === true ? "var(--green)" : "var(--gray)"} />
              <Metric label="Casual loading" value={`+${award.penalties?.casualLoadingPct ?? 25}%`} sub="on base rate" />
              <Metric label="Verification" value={<span style={{ fontSize: 16 }}>{award.verified === true ? "Verified ✓" : "Unverified"}</span>} sub={award.verified === true ? `by ${award.reviewedBy || "—"} · ${fmtDate(award.reviewedAt)}` : "manager action required"} color={award.verified === true ? "var(--green)" : "var(--amber)"} />
            </div>

            {/* award switcher */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div className="tabs">
                {awards.map((a) => (
                  <button key={a.code} className={`tab ${award.code === a.code ? "active" : ""}`} onClick={() => setAwardCode(a.code)}>
                    {a.name} <span className="award-code" style={{ marginLeft: 4, fontSize: 10, color: "var(--gray)" }}>{a.code}</span>
                  </button>
                ))}
              </div>
              {award.verified !== true && <span className="pill pill-amber">Draft — not for payroll</span>}
              {canEdit && <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => setRateEditor(award)}>Edit / verify rates</button>}
            </div>

            {/* rates table */}
            <div className="card">
              <div className="card-head">
                <div><span className="card-title">{award.name} — adult rates</span><span className="card-sub">per hour unless noted</span></div>
                <span className="pill pill-gray">
                  {venuesForAward(award.code).length
                    ? venuesForAward(award.code).map((v) => v.name).join(" · ")
                    : "No venues assigned (set venue.awardCode)"}
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Level</th><th>Weekly</th><th>Base hr</th><th>Casual (+{award.penalties?.casualLoadingPct ?? 25}%)</th>
                      {hasPenaltyCols && <><th>Sat</th><th>Sun</th><th>Pub Hol</th><th>Evening</th></>}
                    </tr>
                  </thead>
                  <tbody>
                    {(award.levels || []).map((l, i) => (
                      <tr key={i}>
                        <td>{l.level}</td>
                        <td className="num">{money(l.weekly)}</td>
                        <td className="num">{hourly(l.baseHourly)}</td>
                        <td className="num">{hourly(l.casualHourly)}</td>
                        {hasPenaltyCols && <><td className="num">{hourly(l.sat)}</td><td className="num">{hourly(l.sun)}</td><td className="num">{hourly(l.publicHol)}</td><td className="num">{hourly(l.evening)}</td></>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {award.penalties && (
                <div style={{ marginTop: 10, fontSize: 11, color: "var(--gray)" }}>
                  Penalties: Sat {award.penalties.saturdayPct}% · Sun {award.penalties.sundayPct}% · Pub Hol {award.penalties.publicHolidayPct}%
                  {award.penalties.eveningPct ? ` · Evening ${award.penalties.eveningPct}% (${award.penalties.eveningNote || ""})` : ""}
                  {award.penalties.overtimeFirst2hPct ? ` · OT first 2h ${award.penalties.overtimeFirst2hPct}%, after ${award.penalties.overtimeAfterPct}%` : ""}
                  {award.penalties.lateNightPerHour != null ? ` · Late night +${money(award.penalties.lateNightPerHour)}/hr (${award.penalties.lateNightNote || ""})` : ""}
                  {award.penalties.earlyMorningPerHour != null ? ` · Early morning +${money(award.penalties.earlyMorningPerHour)}/hr (${award.penalties.earlyMorningNote || ""})` : ""}
                </div>
              )}
            </div>

            <div className="grid-2">
              {/* junior rates */}
              <div className="card">
                <div className="card-head"><span className="card-title">Junior rates</span><span className="card-sub">% of adult rate</span></div>
                <table className="data-table">
                  <thead><tr><th>Age</th><th>% of adult</th><th>Example ({award.levels?.[0]?.level || "L1"} base)</th></tr></thead>
                  <tbody>
                    {(award.juniorRates || []).map((j, i) => (
                      <tr key={i}>
                        <td>{j.ageBand}</td>
                        <td className="num">{j.pct}%</td>
                        <td className="num">{award.levels?.[0]?.baseHourly != null ? hourly(Math.round(award.levels[0].baseHourly * j.pct) / 100) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* super + linkage */}
              <div>
                <div className="card">
                  <div className="card-head"><span className="card-title">Superannuation &amp; allowances</span></div>
                  <ul style={{ margin: "0 0 4px 16px", fontSize: 12 }}>
                    <li>{award.super?.note || "Super Guarantee paid on top of wages to the nominated fund at the current federal rate — verify."}</li>
                    <li>Uniform &amp; meal allowances may apply per award.</li>
                    <li>Payslips must show hours, rate, super and deductions.</li>
                  </ul>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--blue-light)", border: "0.5px solid #bfdbfe", borderRadius: 10, padding: "11px 14px", fontSize: 12, color: "#1e40af" }}>
                  <span style={{ fontSize: 16 }}>⚡</span>
                  <div>Once <strong>verified</strong>, these rates can drive the Shift Planner’s <em>Est. labour cost</em> / <em>Labour %</em> per staff classification instead of a flat estimate. Unverified rates are blocked from that calculation.</div>
                </div>
              </div>
            </div>

            {/* Labour-cost integration — the verification gate, per venue */}
            <div className="card">
              <div className="card-head">
                <div><span className="card-title">Labour-cost integration</span><span className="card-sub">Each venue must select an award; only a <strong>verified</strong> award feeds labour cost</span></div>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="data-table">
                  <thead><tr><th>Venue</th><th>Award</th><th>Status</th><th>Rate fed to labour cost</th></tr></thead>
                  <tbody>
                    {venues.map((v) => {
                      const r = venueLabourReadiness(v, awardRates);
                      return (
                        <tr key={v.id}>
                          <td><strong>{v.name}</strong> <span style={{ fontSize: 11, color: "var(--gray)" }}>({v.type || "—"})</span></td>
                          <td>
                            {canEdit ? (
                              <select className="form-input" style={{ width: 200 }} value={v.awardCode || ""} onChange={(e) => assignVenueAward(v.id, e.target.value)}>
                                <option value="">— none —</option>
                                {awards.map((a) => <option key={a.code} value={a.code}>{a.name} ({a.code})</option>)}
                              </select>
                            ) : (r.award ? `${r.award.name} (${r.award.code})` : "—")}
                          </td>
                          <td>
                            {!r.assigned ? <span className="pill pill-gray">Unassigned</span>
                              : r.verified ? <span className="pill pill-green">Verified</span>
                                : <span className="pill pill-amber">Unverified</span>}
                          </td>
                          <td style={{ fontWeight: 600 }}>
                            {r.usable
                              ? <span style={{ color: "var(--green)" }}>{hourly(r.baseRate)}/hr base ✓</span>
                              : <span style={{ color: "var(--gray)", fontWeight: 400 }}>flat estimate (award {r.assigned ? "unverified" : "unassigned"}) — not from this award</span>}
                          </td>
                        </tr>
                      );
                    })}
                    {venues.length === 0 && <tr><td colSpan={4} style={{ color: "var(--gray)" }}>No venues.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--gray)" }}>
                The gate is enforced in <code>rgComplianceUtils.labourHourlyForStaff</code> — any labour calculation calls it and receives <code>null</code> (→ flat estimate) whenever the award is unassigned, unverified, or missing a rate. No unverified figure can reach payroll.
              </div>
            </div>
          </>
        )
      )}

      {/* ── TAB 2: COMPLIANCE MANUAL ── */}
      {tab === "manual" && (
        !manual ? <div className="card" style={{ color: "var(--gray)", fontSize: 13 }}>No compliance manual has been created yet.</div> : (
          <div className="card" style={{ padding: 14 }}>
            <div className="card-head" style={{ marginBottom: 8 }}>
              <div><span className="card-title">{manual.title || "Staff Manual"}</span><span className="card-sub">v{manual.version} · tap a section to expand · acknowledge in the Acknowledgements tab</span></div>
              {canEdit && <button className="btn btn-primary btn-sm" onClick={() => setManualEditor(true)}>Edit manual</button>}
            </div>
            {(manual.sections || []).map((sec) => {
              const open = !!openSec[sec.id];
              return (
                <div key={sec.id} style={{ border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 8, overflow: "hidden", background: "var(--white)" }}>
                  <div onClick={() => toggleSec(sec.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "12px 14px", cursor: "pointer" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: "var(--gray-light)" }}>{sec.icon || "📄"}</div>
                    <div><div style={{ fontSize: 12, fontWeight: 600 }}>{sec.title}</div>{sec.meta && <div style={{ fontSize: 10, color: "var(--gray)" }}>{sec.meta}</div>}</div>
                    <span style={{ marginLeft: "auto", color: "var(--gray)", fontSize: 14, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s" }}>›</span>
                  </div>
                  {open && <div style={{ padding: "0 14px 14px 55px", fontSize: 12, color: "var(--ink)", whiteSpace: "pre-wrap" }}>{sec.body}</div>}
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── TAB 3: AWARD LINKS ── */}
      {tab === "links" && (
        <>
          <div className="card">
            <div className="card-head"><span className="card-title">Official Fair Work resources</span><span className="card-sub">Verify against fairwork.gov.au</span></div>
            {awardLinks.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No links configured.</div>}
            {awardLinks.map((lnk, i) => (
              <a key={i} href={lnk.url} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: "0.5px solid var(--border)", borderRadius: 10, marginBottom: 8, textDecoration: "none", color: "inherit" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{lnk.label} {lnk.code && <span className="award-code" style={{ fontSize: 10, color: "var(--gray)" }}>{lnk.code}</span>}</div>
                  <div style={{ fontSize: 11, color: "var(--gray)" }}>{lnk.desc}</div>
                </div>
                {lnk.tag && <span className={`pill ${LINK_TAG_PILL[lnk.tag] || "pill-gray"}`}>{lnk.tag}</span>}
              </a>
            ))}
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Which award applies?</span></div>
            <div style={{ fontSize: 11, color: "var(--gray)" }}>Coverage depends on the business model and staff duties, not the business name. Each venue selects its award explicitly via its <strong>awardCode</strong> setting — it is not inferred from the venue’s FOH/BOH/CK type. Confirm classification per venue before applying rates.</div>
          </div>
        </>
      )}

      {/* ── TAB 4: ACKNOWLEDGEMENTS ── */}
      {tab === "ack" && (
        <>
          <div className="grid-4" style={{ marginBottom: 16 }}>
            <Metric label="Acknowledged" value={`${ackDone}/${ackTotal}`} sub={`${ackPct}%`} color="var(--green)" />
            <Metric label="Pending" value={ackTotal - ackDone} sub={ackTotal - ackDone ? "Reminder due" : "All done"} color={ackTotal - ackDone ? "var(--amber)" : "var(--green)"} />
            <Metric label="Manual version" value={<span style={{ fontSize: 16 }}>v{currentVersion || "—"}</span>} sub={manual ? `updated ${fmtDate(manual.updatedAt)}` : "no manual"} />
            <Metric label="Re-ack required" value={ackTotal} sub="on each new version" />
          </div>
          <div className="card">
            <div className="card-head">
              <div><span className="card-title">Manual acknowledgement</span><span className="card-sub">Staff confirm they have read &amp; agree to comply (current version)</span></div>
              {canEdit && currentVersion && (ackTotal - ackDone > 0) && <button className="btn btn-sm btn-primary" onClick={() => remind(ackRows)}>Remind all pending</button>}
            </div>
            {!currentVersion && <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 8 }}>No manual exists yet — create one in the Compliance Manual tab before staff can acknowledge.</div>}
            <div style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Staff</th><th>Venue</th><th>Type</th><th>Acknowledged</th><th>Action</th></tr></thead>
                <tbody>
                  {ackRows.map(({ s, ack }) => {
                    const isMe = myStaff && myStaff.id === s.id;
                    return (
                      <tr key={s.id}>
                        <td>{s.name || `${s.first || ""} ${s.last || ""}`.trim() || s.id}{isMe && <span className="pill pill-blue" style={{ marginLeft: 6 }}>You</span>}</td>
                        <td style={{ fontSize: 12 }}>{(s.venueIds || []).map((v) => venueName(v) || v).join(", ") || "—"}</td>
                        <td><span className="pill pill-gray">{s.empType || s.employmentType || "—"}</span></td>
                        <td>{ack ? <span className="pill pill-green">✓ {fmtDate(ack.ackedAt)}</span> : <span className="pill pill-amber">Pending</span>}</td>
                        <td>
                          {ack
                            ? <span style={{ fontSize: 11, color: "var(--gray)" }}>by {ack.ackedBy || "—"}</span>
                            : isMe && currentVersion
                              ? <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => selfAcknowledge(s.id)}>I acknowledge</button>
                              : canEdit && currentVersion
                                ? <button className="btn btn-sm" onClick={() => remind([{ s, ack }])}>Remind</button>
                                : <span style={{ fontSize: 11, color: "var(--gray)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {ackRows.length === 0 && <tr><td colSpan={5} style={{ color: "var(--gray)" }}>No staff in scope.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Rate editor (Formik + Yup) ── */}
      {rateEditor && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setRateEditor(null)}>
          <div className="rg-modal" style={{ maxWidth: 820 }}>
            <div className="modal-head"><span className="modal-title">Edit rates — {rateEditor.name} ({rateEditor.code})</span><button className="modal-close" onClick={() => setRateEditor(null)}>✕</button></div>
            <Formik
              initialValues={{
                verified: rateEditor.verified === true,
                notes: rateEditor.notes || "",
                levels: (rateEditor.levels || []).map((l) => ({
                  level: l.level || "", weekly: l.weekly ?? "", baseHourly: l.baseHourly ?? "", casualHourly: l.casualHourly ?? "",
                  sat: l.sat ?? "", sun: l.sun ?? "", publicHol: l.publicHol ?? "", evening: l.evening ?? "",
                })),
                juniorRates: (rateEditor.juniorRates || []).map((j) => ({ ageBand: j.ageBand || "", pct: j.pct ?? "" })),
              }}
              validationSchema={rateSchema}
              onSubmit={saveRates}
            >
              {({ values, isSubmitting }) => (
                <Form>
                  <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                    <div className="form-label">Adult rates (per hour unless noted; blank = not set)</div>
                    <div style={{ overflowX: "auto" }}>
                      <table className="data-table">
                        <thead><tr><th>Level</th><th>Weekly</th><th>Base</th><th>Casual</th><th>Sat</th><th>Sun</th><th>Pub Hol</th><th>Evening</th></tr></thead>
                        <tbody>
                          <FieldArray name="levels">{() => values.levels.map((l, i) => (
                            <tr key={i}>
                              <td><Field name={`levels.${i}.level`} className="form-input" style={{ width: 110 }} /></td>
                              {["weekly", "baseHourly", "casualHourly", "sat", "sun", "publicHol", "evening"].map((f) => (
                                <td key={f}><Field name={`levels.${i}.${f}`} type="number" step="0.01" className="form-input" style={{ width: 78 }} /></td>
                              ))}
                            </tr>
                          ))}</FieldArray>
                        </tbody>
                      </table>
                    </div>

                    <div className="form-label" style={{ marginTop: 12 }}>Junior rates (% of adult)</div>
                    <FieldArray name="juniorRates">{() => values.juniorRates.map((j, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                        <Field name={`juniorRates.${i}.ageBand`} className="form-input" style={{ width: 140 }} />
                        <Field name={`juniorRates.${i}.pct`} type="number" step="1" className="form-input" style={{ width: 90 }} />
                        <span style={{ fontSize: 12, color: "var(--gray)" }}>% of adult</span>
                      </div>
                    ))}</FieldArray>

                    <div className="form-label" style={{ marginTop: 12 }}>Notes</div>
                    <Field as="textarea" name="notes" rows={2} className="form-input" />

                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, padding: "10px 12px", background: values.verified ? "var(--green-light)" : "var(--amber-light)", border: `0.5px solid ${values.verified ? "#86efac" : "#fcd34d"}`, borderRadius: 10, fontSize: 12 }}>
                      <Field type="checkbox" name="verified" style={{ marginTop: 2 }} />
                      <span><strong>I have verified these rates against the official Fair Work pay guides.</strong> Ticking marks the award <em>verified</em> (records you + timestamp) and allows it to feed labour-cost calculations. Leave unticked to save as an unverified draft.</span>
                    </label>
                    <div style={{ fontSize: 11, color: "var(--gray)", marginTop: 6 }}>Penalty multipliers and super are preserved as-is (edit those via the importer for now).</div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setRateEditor(null)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>{values.verified ? "Verify & save" : "Save draft"}</button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* ── Manual editor (Formik + Yup) ── */}
      {manualEditor && manual && (
        <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setManualEditor(false)}>
          <div className="rg-modal" style={{ maxWidth: 720 }}>
            <div className="modal-head"><span className="modal-title">Edit manual</span><button className="modal-close" onClick={() => setManualEditor(false)}>✕</button></div>
            <Formik
              initialValues={{
                title: manual.title || "", version: bumpVersion(manual.version),
                sections: (manual.sections || []).map((s) => ({ id: s.id, icon: s.icon || "📄", title: s.title || "", meta: s.meta || "", body: s.body || "" })),
              }}
              validationSchema={manualSchema}
              onSubmit={saveManual}
            >
              {({ values, isSubmitting }) => (
                <Form>
                  <div style={{ maxHeight: "55vh", overflowY: "auto" }}>
                    <div className="grid-2" style={{ gap: 10 }}>
                      <div><div className="form-label">Title</div><Field name="title" className="form-input" /></div>
                      <div><div className="form-label">Version (bumped — staff must re-acknowledge)</div><Field name="version" className="form-input" /></div>
                    </div>
                    <FieldArray name="sections">{(arr) => (
                      <>
                        {values.sections.map((s, i) => (
                          <div key={i} style={{ border: "0.5px solid var(--border)", borderRadius: 10, padding: 10, marginTop: 10 }}>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Field name={`sections.${i}.icon`} className="form-input" style={{ width: 56 }} />
                              <Field name={`sections.${i}.title`} placeholder="Section title" className="form-input" style={{ flex: 1 }} />
                              <button type="button" className="btn btn-sm" onClick={() => arr.remove(i)}>✕</button>
                            </div>
                            <Field name={`sections.${i}.meta`} placeholder="Meta (subtitle)" className="form-input" style={{ marginTop: 6 }} />
                            <Field as="textarea" name={`sections.${i}.body`} rows={3} placeholder="Body" className="form-input" style={{ marginTop: 6 }} />
                          </div>
                        ))}
                        <button type="button" className="btn btn-sm" style={{ marginTop: 10 }}
                          onClick={() => arr.push({ id: `sec-${values.sections.length + 1}-${(values.title || "x").length}`, icon: "📄", title: "", meta: "", body: "" })}>
                          + Add section
                        </button>
                      </>
                    )}</FieldArray>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                    <button type="button" className="btn btn-sm" onClick={() => setManualEditor(false)}>Cancel</button>
                    <button type="submit" className="btn btn-primary btn-sm" disabled={isSubmitting}>Save manual</button>
                  </div>
                </Form>
              )}
            </Formik>
          </div>
        </div>
      )}
    </>
  );
}
