import React, { useMemo } from "react";
import { fullName, certStatus, shiftHours, trainingStatusPill } from "./rgUtils";
import { staffAreas } from "./staffStructureUtils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shiftDate = (sh) => {
  if (!sh.weekKey) return DAYS[sh.day] || "";
  const d = new Date(sh.weekKey); d.setDate(d.getDate() + (sh.day || 0));
  return `${DAYS[sh.day] || ""} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
};
const isMistake = (t) => /mistake|coaching|warning|incident/i.test(t || "");
const isPraise = (t) => /recognition|commendation|praise|⭐|kudos/i.test(t || "");

/**
 * Read-only "what can this person do" card for the Shift Planner. Helps a manager
 * decide what role to roster someone into: certifications, trained capabilities,
 * recent shifts, mistakes (from trainer/records), reviews, and POS goals (later).
 */
export default function StaffCapabilityCard({ staff: s, assignments, shifts, perfNotes, onClose, onAssign, canAssign }) {
  const certs = (s.certs && s.certs.length) ? s.certs
    : (s.cert && s.cert !== "Not yet obtained" ? [{ name: s.cert, expiry: "" }] : []);
  const myTraining = useMemo(() => (assignments || []).filter((a) => a.staffId === s.id), [assignments, s.id]);
  const canDo = myTraining.filter((a) => a.verified || a.status === "Complete");
  const learning = myTraining.filter((a) => !a.verified && a.status !== "Complete");
  const myShifts = useMemo(() => (shifts || []).filter((sh) => sh.staffId === s.id)
    .sort((a, b) => (b.weekKey || "").localeCompare(a.weekKey || "") || (b.day || 0) - (a.day || 0))
    .slice(0, 8), [shifts, s.id]);
  const records = (s.records || []).slice().reverse();
  const mistakes = records.filter((r) => isMistake(r.type));
  const praises = records.filter((r) => isPraise(r.type));
  const notes = useMemo(() => (perfNotes || []).filter((n) => n.staffId === s.id), [perfNotes, s.id]);

  const Section = ({ title, sub, children }) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{title} {sub && <span style={{ color: "var(--gray)", fontWeight: 400 }}>· {sub}</span>}</div>
      {children}
    </div>
  );
  const Empty = ({ children }) => <div style={{ fontSize: 12, color: "var(--gray)" }}>{children}</div>;

  return (
    <div className="rg-modal-overlay" style={{ zIndex: 1200 }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rg-modal" style={{ maxWidth: 620 }}>
        <div className="modal-head">
          <span className="modal-title">Capability — {fullName(s)}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--gray)", marginBottom: 4 }}>
          {s.role} · {(s.venueNames || []).join(", ") || s.venue || ""}{staffAreas(s).length ? ` · ${staffAreas(s).join(", ")}` : ""}
        </div>
        <div style={{ fontSize: 11, color: "var(--gray)" }}>Use this to decide what role to roster them into.</div>

        {/* Certifications */}
        <Section title="🎓 Certifications" sub="what they're licensed for">
          {certs.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {certs.map((c, i) => { const st = certStatus(c.expiry); return <span key={i} className={`pill ${st.pill}`}>{c.name}{c.expiry ? ` · ${c.expiry}` : ""}{st.note ? ` (${st.note})` : ""}</span>; })}
            </div>
          ) : <Empty>No certificates recorded.</Empty>}
        </Section>

        {/* Trained capabilities */}
        <Section title="✅ Trained / can do" sub={`${canDo.length} signed off`}>
          {canDo.length ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {canDo.map((a) => <span key={a.id} className="pill pill-green">{a.moduleTitle}{a.verified ? " ✓" : ""}</span>)}
            </div>
          ) : <Empty>No completed training yet.</Empty>}
          {learning.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {learning.map((a) => <span key={a.id} className={`pill ${trainingStatusPill(a.status)}`} title="in progress">{a.moduleTitle} · {a.progress || 0}%</span>)}
            </div>
          )}
        </Section>

        {/* Recent shifts */}
        <Section title="🗓 Recent shifts" sub="where they've worked">
          {myShifts.length ? myShifts.map((sh) => (
            <div key={sh.id} className="staff-meta-row" style={{ justifyContent: "space-between", padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)", fontSize: 12 }}>
              <span>{shiftDate(sh)} · <strong>{sh.start}–{sh.end}</strong></span>
              <span style={{ color: "var(--gray)" }}>{(sh.role || "").replace(/^(FOH|BOH) — /, "")}{sh.station ? ` · ${sh.station}` : ""} · {sh.venue} · {shiftHours(sh).toFixed(1)}h</span>
            </div>
          )) : <Empty>No shift history.</Empty>}
        </Section>

        {/* Mistakes & coaching */}
        <Section title="⚠️ Mistakes & coaching" sub="from trainers/managers">
          {mistakes.length ? mistakes.map((r) => (
            <div key={r.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
              <span className="pill pill-amber">{r.type}</span> {r.note} <span style={{ color: "var(--gray)" }}>— {r.by}{r.at ? `, ${String(r.at).slice(0, 10)}` : ""}</span>
            </div>
          )) : <Empty>No mistakes logged. 👍</Empty>}
        </Section>

        {/* Reviews & recognition */}
        <Section title="⭐ Reviews & recognition" sub="what they're good at">
          {praises.length || notes.length ? (
            <>
              {praises.map((r) => (
                <div key={r.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  <span className="pill pill-green">{r.type}</span> {r.note} <span style={{ color: "var(--gray)" }}>— {r.by}</span>
                </div>
              ))}
              {notes.map((n) => (
                <div key={n.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
                  {n.note || n.text} <span style={{ color: "var(--gray)" }}>{n.by ? `— ${n.by}` : ""}</span>
                </div>
              ))}
            </>
          ) : <Empty>No reviews yet.</Empty>}
        </Section>

        {/* POS goals (future) */}
        <Section title="🎯 POS goals & revenue" sub="per position">
          <div style={{ fontSize: 12, color: "var(--gray)", padding: "8px 10px", border: "0.5px dashed var(--border)", borderRadius: 8 }}>
            No POS data yet — sales, order accuracy and revenue-per-position will appear here once the POS app is connected.
          </div>
        </Section>

        <div className="btn-row" style={{ marginTop: 16 }}>
          {canAssign && <button className="btn btn-primary" onClick={() => onAssign(s.id)}>+ Roster a shift</button>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
