import React, { useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { useRG } from "./RGContext";
import { contractTemplatesCol } from "../../utils/restaurantGroupPaths";
import contractFill from "./contractFill";

/* ============================================================================
   Contract Templates — READ-ONLY viewer (Phase 1, Step 8).
   Owner/storeAdmin (anyone who can("contracts","view")) can browse the seeded
   templates and see their exact stored content. Rendered via the SHARED
   contractFill.assemble with empty values, so every token shows as ‹token› and
   the structure (incl. the now-patched employer lines) is exactly what the PDF
   would use. No add/edit/delete in this batch.
   ========================================================================== */

export default function ContractTemplatesPage() {
  const { groupId, can } = useRG();
  const [templates, setTemplates] = useState(null); // null = loading
  const [loadErr, setLoadErr] = useState("");
  const [selId, setSelId] = useState(null);

  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(contractTemplatesCol(groupId));
        if (!alive) return;
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
        setTemplates(list);
        setSelId((cur) => cur || list[0]?.id || null);
      } catch {
        if (alive) { setLoadErr("Could not load templates. (Owner/Store Admin only — check the contracts rule is live.)"); setTemplates([]); }
      }
    })();
    return () => { alive = false; };
  }, [groupId]);

  const selected = useMemo(() => (templates || []).find((t) => t.id === selId) || null, [templates, selId]);
  // Empty values → every token renders as ‹token›; same assembly the PDF uses.
  const blocks = useMemo(
    () => (selected ? contractFill.assemble(selected, { values: {}, isMinor: false, extraClauses: "" }) : []),
    [selected]
  );

  if (!can("contracts", "view")) {
    return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>You don’t have access to Contract Templates.</div>;
  }

  return (
    <div style={{ margin: 16 }}>
      {loadErr && <div className="card" style={{ marginBottom: 12, color: "var(--red)", fontSize: 12 }}>{loadErr}</div>}
      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 12, alignItems: "start" }}>
        {/* ── Template list ── */}
        <div className="card">
          <div className="card-head"><div><span className="card-title">Templates</span><span className="card-sub">Read-only</span></div></div>
          {templates === null && <div style={{ fontSize: 12, color: "var(--gray)" }}>Loading…</div>}
          {templates !== null && templates.length === 0 && !loadErr && <div style={{ fontSize: 12, color: "var(--gray)" }}>No templates.</div>}
          {(templates || []).map((t) => (
            <button key={t.id} className={`rg-pick-row ${selId === t.id ? "active" : ""}`} onClick={() => setSelId(t.id)}>
              <span>{t.label || t.id}</span>
              <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--gray)" }}>{t.area} · {t.basis}</span>
            </button>
          ))}
        </div>

        {/* ── Read-only render ── */}
        <div className="card">
          {!selected && <div style={{ fontSize: 13, color: "var(--gray)" }}>Select a template to view its content.</div>}
          {selected && (
            <>
              <div className="card-head">
                <div>
                  <span className="card-title">{selected.label || selected.id}</span>
                  <span className="card-sub">{selected.id} · {selected.area} · {selected.basis} · award {selected.award || "—"} · v{selected.version || 1} · tokens shown as ‹token›</span>
                </div>
              </div>
              <div style={{ maxHeight: "72vh", overflowY: "auto", fontSize: 12, lineHeight: 1.55, padding: "4px 2px" }}>
                {blocks.map((b, i) => (
                  b.t === "h"
                    ? <div key={i} style={{ fontWeight: 700, marginTop: 8 }}>{b.text}</div>
                    : <div key={i} style={{ marginBottom: 2 }}>{b.text}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
