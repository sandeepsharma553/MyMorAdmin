import React, { useEffect, useRef, useState } from "react";
import { getDoc, setDoc, doc, serverTimestamp } from "firebase/firestore";
import { staffPrivateDoc, auditLogCol } from "../../utils/restaurantGroupPaths";

const MS_DAY = 86400000;
const parseDob = (s) => { if (!s) return null; const d = new Date(s + "T00:00:00"); return isNaN(d.getTime()) ? null : d; };
const nthBirthday = (dob, n) => new Date(dob.getFullYear() + n, dob.getMonth(), dob.getDate());
const fmt = (d) => d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Admin-only (owner/storeAdmin) compliance card: reads private DOBs and flags staff
 * turning 18 within ~30 days (or who just did) so pay rate + alcohol/RSA compliance
 * can be reviewed. Logs an entry to the super-admin Activity feed (once) and fires a
 * browser notification (once per session) when one is detected.
 */
export default function Turning18Alert({ groupId, staff, actorName }) {
  const [flagged, setFlagged] = useState([]);
  const notified = useRef(new Set());

  useEffect(() => {
    if (!groupId || !staff.length) { setFlagged([]); return; }
    let alive = true;
    (async () => {
      const out = [];
      for (const s of staff) {
        try {
          const snap = await getDoc(staffPrivateDoc(groupId, s.id));
          const dob = parseDob(snap.exists() ? snap.data().dob : "");
          if (!dob) continue;
          const t18 = nthBirthday(dob, 18);
          const now = new Date(); now.setHours(0, 0, 0, 0);
          const days = Math.round((t18 - now) / MS_DAY);
          if (days <= 30 && days >= -14) out.push({ id: s.id, name: s.displayName || s.name, dob, t18, days });
        } catch { /* no access / no dob */ }
      }
      if (!alive) return;
      out.sort((a, b) => a.days - b.days);
      setFlagged(out);

      for (const f of out) {
        // browser notification — once per session per person
        if (typeof Notification !== "undefined" && Notification.permission === "granted" && !notified.current.has(f.id)) {
          notified.current.add(f.id);
          try { new Notification("Staff turning 18", { body: `${f.name} ${f.days >= 0 ? `turns 18 on ${fmt(f.t18)}` : "has turned 18"} — review pay & compliance.` }); } catch { /* */ }
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
        } catch { /* */ }
      }
    })();
    return () => { alive = false; };
  }, [groupId, staff, actorName]);

  if (!flagged.length) return null;
  const canAsk = typeof Notification !== "undefined" && Notification.permission === "default";
  return (
    <div className="card" style={{ marginBottom: 16, borderColor: "var(--amber)" }}>
      <div className="card-head">
        <div><span className="card-title">🎂 Turning 18 — pay &amp; compliance review</span><span className="card-sub">Junior→adult pay rate change; check RSA / alcohol-service eligibility</span></div>
        {canAsk && <button className="btn btn-sm" onClick={() => Notification.requestPermission()}>Enable alerts</button>}
      </div>
      {flagged.map((f) => (
        <div key={f.id} className="staff-meta-row" style={{ justifyContent: "space-between", fontSize: 12, padding: "5px 0", borderBottom: "0.5px solid var(--gray-light)" }}>
          <span><strong>{f.name}</strong> <span style={{ color: "var(--gray)" }}>· DOB {fmt(f.dob)}</span></span>
          <span className={`pill ${f.days >= 0 ? "pill-amber" : "pill-red"}`}>{f.days > 0 ? `turns 18 in ${f.days}d (${fmt(f.t18)})` : f.days === 0 ? "turns 18 today" : `turned 18 ${fmt(f.t18)}`}</span>
        </div>
      ))}
    </div>
  );
}
