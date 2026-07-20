import React, { useEffect, useMemo, useRef, useState } from "react";
import { getDoc, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { staffPrivateDoc, auditLogCol, notificationsCol } from "../../utils/restaurantGroupPaths";
import { useRG } from "./RGContext";
import { parseDob, nthBirthday, daysToEighteen, isMinorDob, isJuniorType } from "./staffMinorUtils";

const fmt = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const whenLbl = (days, t18) => (days < 0 ? "has turned 18" : days === 0 ? "turns 18 today" : days === 1 ? "turns 18 tomorrow" : `turns 18 on ${fmt(t18)}`);

/**
 * Admin-only (owner/storeAdmin) compliance card.
 *  - "Turning 18" (UNCHANGED): reads private DOBs, flags staff turning 18 within ~30
 *    days (or who just did), logs a super-admin Activity entry (once) and fires a
 *    browser notification (once per session). All WRITES stay scoped to this case.
 *  - "Currently under 18 / Junior" (read-only, additive): reuses the same DOB math
 *    plus the public Junior employment type to surface minors consistently. NO writes,
 *    no new fields — just visibility of what already exists.
 */
export default function Turning18Alert({ groupId, staff, actorName }) {
  const { noteErr } = useRG(); // failure-banner recorder — everything else stays prop-driven
  const [flagged, setFlagged] = useState([]);
  const [minors, setMinors] = useState([]); // read-only: under-18 (not imminent) or Junior-type
  const notified = useRef(new Set());
  // re-run when the set of staff OR their employment type changes (the Junior surface
  // keys off the public type); still avoids re-reading DOBs on unrelated field edits.
  const staffKey = useMemo(() => staff.map((s) => `${s.id}:${s.type || ""}`).sort().join(","), [staff]);

  useEffect(() => {
    if (!groupId || !staff.length) { setFlagged([]); setMinors([]); return; }
    let alive = true;
    (async () => {
      const out = [];
      const extra = [];
      for (const s of staff) {
        let dob = null;
        try {
          const snap = await getDoc(staffPrivateDoc(groupId, s.id));
          dob = parseDob(snap.exists() ? snap.data().dob : "");
        } catch { /* no access / no dob */ }
        const days = dob ? daysToEighteen(dob) : null;
        if (days !== null && days <= 30 && days >= -14) {
          out.push({ id: s.id, name: s.displayName || s.name, dob, t18: nthBirthday(dob, 18), days });
        } else {
          // not imminent — surface (read-only) if a current minor or marked Junior
          const minor = dob ? isMinorDob(dob) : false;
          const junior = isJuniorType(s.type);
          if (minor || junior) extra.push({ id: s.id, name: s.displayName || s.name, dob, days, minor, junior });
        }
      }
      if (!alive) return;
      out.sort((a, b) => a.days - b.days);
      extra.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
      setFlagged(out);
      setMinors(extra);

      for (const f of out) {
        // browser notification — once per session per person
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !notified.current.has(f.id)) {
          notified.current.add(f.id);
          try { new Notification("Staff turning 18", { body: `${f.name} ${whenLbl(f.days, f.t18)} — review pay & compliance.` }); } catch { /* */ }
        }
        // super-admin activity log — written once (deterministic id)
        try {
          const ref = doc(auditLogCol(groupId), `turn18-${f.id}-${f.t18.getFullYear()}`);
          const ex = await getDoc(ref);
          if (!ex.exists()) await setDoc(ref, {
            action: "compliance.turn18",
            summary: `${f.name} is turning 18 (${fmt(f.t18)}) — pay rate & compliance review`,
            staffId: f.id, notifySuperAdmin: true, seenBySuper: false, by: actorName || "System", at: serverTimestamp(),
          });
        } catch { noteErr("audit log"); } // non-blocking, but RECORDED — a log that silently stops recording looks complete
        // in-app bell notification for managers/owner — written once (deterministic id) so it's
        // visible without needing browser-notification permission or being on this page.
        try {
          const nref = doc(notificationsCol(groupId), `turn18-${f.id}-${f.t18.getFullYear()}`);
          const nex = await getDoc(nref);
          if (!nex.exists()) await setDoc(nref, {
            to: "managers", type: "compliance",
            title: "Staff turning 18",
            body: `${f.name} ${whenLbl(f.days, f.t18)} — review pay & compliance.`,
            venueId: "", by: actorName || "System", readBy: [], at: serverTimestamp(),
          });
        } catch { /* */ }
      }
    })();
    return () => { alive = false; };
  }, [groupId, staffKey, actorName]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!flagged.length && !minors.length) return null;
  const canAsk = typeof Notification !== "undefined" && Notification.permission === "default";
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--amber)" }}>
      <div className="card-head">
        <div><span className="card-title">🎂 Junior staff — pay &amp; compliance review</span><span className="card-sub">Junior→adult pay rate change; check RSA / alcohol-service eligibility</span></div>
        {canAsk && <button className="btn btn-sm" onClick={() => Notification.requestPermission()}>Enable alerts</button>}
      </div>
      {flagged.map((f) => (
        <div key={f.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
          <span><strong>{f.name}</strong> <span style={{ color: "var(--gray)" }}>· DOB {fmt(f.dob)}</span></span>
          <span className={`pill ${f.days >= 0 ? "pill-amber" : "pill-red"}`}>{f.days > 0 ? `turns 18 in ${f.days}d (${fmt(f.t18)})` : f.days === 0 ? "turns 18 today" : `turned 18 ${fmt(f.t18)}`}</span>
        </div>
      ))}
      {minors.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "var(--gray)", margin: "8px 0 2px" }}>Currently under 18 / marked Junior</div>
          {minors.map((m) => (
            <div key={m.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
              <span><strong>{m.name}</strong>{m.dob ? <span style={{ color: "var(--gray)" }}> · DOB {fmt(m.dob)}</span> : null}</span>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {m.minor && <span className="pill pill-amber">under 18{m.days != null ? ` · turns 18 in ${m.days}d` : ""}</span>}
                {m.junior && <span className="pill pill-gray">Junior (employment)</span>}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
