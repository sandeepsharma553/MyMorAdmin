import React from "react";
import contractFill from "./contractFill";

/* ── Document-styled renderer — matches the real BOH/FOH agreement .docx design:
 * Arial ~10.5pt on a white sheet, centred bold TITLE, numbered bold clause
 * headings ("1. Position"), bold numbered sub-headings detected from short
 * body lines ("1.1 Role and duties"), un-numbered SCHEDULE parts with a
 * divider, and tokens shown underlined like the doc's fill-in blanks.
 * DISPLAY ONLY — content still comes line-for-line from contractFill (same
 * lines the PDF assembles; token fill via the shared contractFill.line). */
const isSubhead = (t) =>
  /^[A-Z]/.test(t) && t.length <= 48 && t.split(/\s+/).length <= 6 &&
  !t.includes("‹") && !t.includes(";") && !/[.,:)…]$/.test(t) &&
  !/\b(and|or)$/i.test(t) && !/\d/.test(t);
// schedules carry their own inline numbering ("1. Food Quality") — bold as-is
const isNumberedSub = (t) => /^\d+\.\s+[A-Z]/.test(t) && t.length <= 56 && !t.includes("‹");
const isSchedule = (h) => /^schedule/i.test(String(h || "").trim());

// tokens render like the doc's underlined blanks
const TokenText = ({ text }) => (
  <>
    {String(text).split(/(‹[^›]*›)/g).map((part, i) =>
      part.startsWith("‹")
        ? <span key={i} style={{ borderBottom: "1px solid #9ca3af", color: "#6b7280", padding: "0 2px" }}>{part}</span>
        : <React.Fragment key={i}>{part}</React.Fragment>
    )}
  </>
);

export function DocSheet({ template }) {
  const fill = (s) => contractFill.line(s, {}); // empty values → ‹token› blanks
  const sections = template.sections || [];
  let clauseNo = 0;

  return (
    <div style={{
      background: "#fff", color: "#1a1a1a", maxWidth: 780, margin: "0 auto",
      padding: "52px 62px", boxShadow: "0 1px 8px rgba(0,0,0,0.18)",
      fontFamily: "Arial, Helvetica, sans-serif", fontSize: 13.5, lineHeight: 1.65,
    }}>
      {sections.map((s, si) => {
        const heading = s.heading || "";
        const body = (s.body || []).map(fill);

        // ── cover (first section): centred title + letterhead-style intro ──
        if (si === 0) {
          return (
            <div key={si}>
              <div style={{ textAlign: "center", fontWeight: 700, fontSize: 19, letterSpacing: 1, marginBottom: 26 }}>
                {heading}
              </div>
              {body.map((t, i) => {
                const label = t.match(/^([A-Z][A-Za-z ]{0,24}:)(\s*)(.*)$/);
                if (isSubhead(t)) return <div key={i} style={{ fontWeight: 700, margin: "16px 0 8px" }}>{t}</div>;
                if (label) {
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <strong>{label[1]}</strong> <TokenText text={label[3]} />
                    </div>
                  );
                }
                return <div key={i} style={{ margin: "12px 0" }}><TokenText text={t} /></div>;
              })}
            </div>
          );
        }

        // ── SCHEDULE parts: un-numbered, page-break-style divider ──
        const schedule = isSchedule(heading);
        if (!schedule) clauseNo += 1;
        const n = clauseNo;
        let subNo = 0;

        return (
          <div key={si}>
            <div style={schedule
              ? { fontWeight: 700, fontSize: 14.5, marginTop: 34, paddingTop: 22, borderTop: "1px solid #d1d5db" }
              : { fontWeight: 700, fontSize: 14.5, marginTop: 22 }}>
              {schedule ? heading : `${n}. ${heading}`}
            </div>
            {body.map((t, i) => {
              if (!schedule && isSubhead(t)) {
                subNo += 1;
                return <div key={i} style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{`${n}.${subNo} ${t}`}</div>;
              }
              if (schedule && (isSubhead(t) || isNumberedSub(t))) {
                return <div key={i} style={{ fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{t}</div>;
              }
              return (
                <div key={i} style={{ margin: "6px 0 8px", paddingLeft: 18 }}>
                  <TokenText text={t} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
