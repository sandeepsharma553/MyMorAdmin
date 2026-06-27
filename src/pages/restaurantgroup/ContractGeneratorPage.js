import React, { useEffect, useMemo, useState } from "react";
import { getDocs, getDoc, addDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useRG } from "./RGContext";
import { contractTemplatesCol, contractDefaultsDoc, contractsCol, staffPrivateDoc, contractClassificationsDoc, legalEntitiesDoc } from "../../utils/restaurantGroupPaths";
import { isManager } from "./rgConfig";
import { isMinorDob } from "./staffMinorUtils";
import contractFill from "./contractFill";
import { awardForVenue, isAwardUsableForLabour, staffIsCasual } from "./rgComplianceUtils";

/* ============================================================================
   Contract Generator (Phase 1, Step 4) — READ + RENDER ONLY.
   Owner/storeAdmin pick a staff member → the correct template auto-selects (§4,
   shared exact isManager + areas[]) → fields prefill from the staff record +
   gated private/details employment-terms + contractDefaults (§5) → live HTML
   preview with {{tokens}} filled (empty tokens flagged amber). NO contract
   write, NO PDF, NO send, NO write-back — those are Steps 5/6. The Generate
   button is intentionally disabled here.
   ========================================================================== */

const todayISO = () => new Date().toISOString().slice(0, 10);

// Which source each token prefills from — drives the grouped review form + labels.
const TOKEN_SOURCE = {
  employee_name: "staff", employee_first_name: "staff", employment_type: "staff", commence_date: "staff", location_basis: "derived",
  employee_address: "private", classification_level: "private", hourly_rate: "private", contracted_min_hours: "private",
  employer_name: "defaults", owner_name: "defaults", discount_during: "defaults", discount_outside: "defaults", family_discount: "defaults",
  probation_shifts: "defaults", probation_months: "defaults", notice_weeks: "defaults", min_days: "defaults",
  offer_date: "typed",
};
const TOKEN_LABEL = {
  employee_name: "Employee name", employee_first_name: "First name", employment_type: "Employment type",
  commence_date: "Commence date", location_basis: "Location basis", employee_address: "Address",
  classification_level: "Classification level", hourly_rate: "Rate", contracted_min_hours: "Contracted min hours",
  employer_name: "Employer name", owner_name: "Owner (counter-sign)", discount_during: "Discount (during shift)",
  discount_outside: "Discount (outside shift)", family_discount: "Family discount", probation_shifts: "Probation (shifts)",
  probation_months: "Probation (months)", notice_weeks: "Resignation notice (weeks)", min_days: "Min days/week",
  offer_date: "Offer date",
};
const SOURCE_GROUPS = [
  ["staff", "From staff record"],
  ["private", "Employment terms (private)"],
  ["defaults", "Contract defaults"],
  ["derived", "Derived"],
  ["typed", "This contract"],
];
// ROLLOUT GATE (Step 6): the employee-facing Send stays locked until the test-send PDF is
// reviewed + approved. Flip to true ONLY after that sign-off. The send function exists and is
// wired (handles EMPTY_FIELDS / ALREADY_SENT / testTo); this flag just gates the employee button.
const EMPLOYEE_SEND_ENABLED = false;

// Private tokens the "also update staff record" toggle may write back → private/details field.
// Anything NOT here (dob/tfn/bank/super, contract-defaults, derived) is never written to the staff record.
const WRITEBACK_MAP = {
  employee_address: "address",
  classification_level: "classificationLevel",
  hourly_rate: "rate",
  contracted_min_hours: "contractedMinHours",
};

// §4 — resolve the template id from the staff record; never guess silently.
function resolveTemplate(staff, templatesById, forcedArea) {
  if (!staff) return { status: "EMPTY" };
  if (staff.type === "Junior")
    return { status: "BLOCK", reason: "No Junior template yet — generation is blocked for this person." };
  if (isManager(staff) || (staff.areas || []).includes("Mgmt"))
    return { status: "BLOCK", reason: "No Manager template yet — the manager contract isn’t loaded." };

  let area = forcedArea || null;
  if (!area) {
    const hasFOH = (staff.areas || []).includes("FOH");
    const hasBOH = (staff.areas || []).includes("BOH");
    if (hasFOH && hasBOH)
      return { status: "NEEDS_CHOICE", reason: "This person is assigned to both FOH and BOH — choose which contract to generate.", choices: ["FOH", "BOH"] };
    area = hasFOH ? "FOH" : hasBOH ? "BOH" : null;
  }
  if (!area) return { status: "BLOCK", reason: "Could not resolve an area (no FOH / BOH / Mgmt) — not guessing." };
  if (!["Full-time", "Part-time", "Casual"].includes(staff.type))
    return { status: "BLOCK", reason: `Unrecognised employment type “${staff.type || "—"}”.` };

  const basis = staff.type === "Casual" ? "casual" : "hourly"; // Full-time/Part-time → hourly
  const id = `${area.toLowerCase()}_${basis}`;
  return templatesById[id] ? { status: "OK", templateId: id } : { status: "BLOCK", reason: `Template “${id}” not found.` };
}

// Pick the legal entity that covers the staff member's venue: first entity whose venueIds
// intersect the staff's venueIds. Two matches → first (still overridable). No match → null.
function pickEntityForStaff(staff, entities) {
  const sv = staff?.venueIds || [];
  if (!sv.length || !entities?.length) return null;
  return entities.find((e) => (e.venueIds || []).some((vid) => sv.includes(vid))) || null;
}

// Look up the hourly rate for a classification level in a VERIFIED award (caller passes null
// for `award` when unverified). casualHourly for casuals, else baseHourly. null if no match.
function awardRateForLevel(award, levelLabel, isCasual) {
  if (!award || !levelLabel) return null;
  const row = (award.levels || []).find((l) => String(l.level).trim().toLowerCase() === String(levelLabel).trim().toLowerCase());
  if (!row) return null;
  const r = isCasual ? row.casualHourly : row.baseHourly;
  return (r == null || isNaN(Number(r))) ? null : String(r);
}

// §5 — prefill every token; per-contract overrides win. Missing values stay empty (filled at gen time).
function buildValues(staff, priv, defaults, overrides, entities, venues, awardRates) {
  const multi = (staff?.venueIds || []).length > 1;
  // employer_name prefill: the venue-mapped legal entity's FULL name; else contractDefaults.employerName.
  const entity = pickEntityForStaff(staff, entities);
  // Award rate is gated on verified===true (mirror isAwardUsableForLabour) — unverified contributes nothing.
  const staffVenue = (venues || []).find((v) => v.id === (staff?.venueIds || [])[0]);
  const rateAward = isAwardUsableForLabour(awardForVenue(staffVenue, awardRates)) ? awardForVenue(staffVenue, awardRates) : null;
  const base = {
    employee_name: staff?.displayName || staff?.name || "",
    employment_type: staff?.type || "",
    commence_date: staff?.start || "",
    location_basis: multi ? "Multiple Locations" : "Single Location",
    employee_address: priv?.address || "",
    classification_level: priv?.classificationLevel || "",
    hourly_rate: priv?.rate || "",
    contracted_min_hours: priv?.contractedMinHours || "",
    employer_name: entity ? entity.name : (defaults?.employerName || ""),
    owner_name: defaults?.ownerName || "",
    discount_during: defaults?.discount_during || "",
    discount_outside: defaults?.discount_outside || "",
    family_discount: defaults?.family_discount || "",
    probation_shifts: defaults?.probation_shifts || "",
    probation_months: defaults?.probation_months || "",
    notice_weeks: defaults?.notice_weeks || "",
    min_days: defaults?.min_days || "",
    offer_date: todayISO(),
  };
  const merged = { ...base, ...overrides };
  // First name is always DERIVED from the (overridable) full name — never an editable field of its own.
  merged.employee_first_name = String(merged.employee_name || "").trim().split(/\s+/)[0] || "";
  // hourly_rate precedence: per-contract override > staff-record rate > verified-award rate > empty.
  // Reactive to the SELECTED (possibly overridden) classification level.
  if (overrides.hourly_rate == null || overrides.hourly_rate === "") {
    const awardRate = awardRateForLevel(rateAward, merged.classification_level, staffIsCasual(staff));
    merged.hourly_rate = (priv?.rate || "") || awardRate || "";
  }
  return merged;
}

// Preview-only: highlight ‹token› placeholders amber. The TEXT comes from the shared
// contractFill.assemble() (the same source the PDF uses) — this only styles it, so the
// preview and the PDF can't diverge in content.
function renderBlockText(text) {
  const out = []; const re = /‹(\w+)›/g; let last = 0, m, k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={k++} style={{ background: "#fef3c7", color: "#b45309", padding: "0 4px", borderRadius: 3, fontWeight: 600 }}>‹{m[1]}›</span>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function ContractGeneratorPage() {
  const { groupId, scopedStaff, can, me, showToast, venues, roles, areas, awardRates } = useRG();
  const uid = me?.uid || me?.id || null;

  const [templatesById, setTemplatesById] = useState(null); // null = loading
  const [saving, setSaving] = useState(false);
  const [lastDraft, setLastDraft] = useState(null); // { id } of the just-saved draft (enables Send)
  const [defaults, setDefaults] = useState(null);
  const [classLevels, setClassLevels] = useState([]); // settings/contractClassifications.levels (optional)
  const [entities, setEntities] = useState([]);       // settings/legalEntities.entities (optional)
  const [loadErr, setLoadErr] = useState("");
  const [search, setSearch] = useState("");
  const [venueF, setVenueF] = useState("all");
  const [areaF, setAreaF] = useState("all");
  const [roleF, setRoleF] = useState("all");
  const [selStaff, setSelStaff] = useState(null);
  const [priv, setPriv] = useState(null);     // gated private/details for the selected staff
  const [areaChoice, setAreaChoice] = useState(null); // FOH | BOH when NEEDS_CHOICE
  const [overrides, setOverrides] = useState({});
  const [writeBack, setWriteBack] = useState({}); // per-private-field "also update staff record" — captured, not written here
  const [extraClauses, setExtraClauses] = useState("");

  // Fetch the seeded templates + defaults once (gated reads — owner/storeAdmin).
  useEffect(() => {
    if (!groupId) return;
    let alive = true;
    (async () => {
      try {
        const [tsnap, dsnap, csnap, esnap] = await Promise.all([
          getDocs(contractTemplatesCol(groupId)),
          getDoc(contractDefaultsDoc(groupId)),
          // classification + entities are OPTIONAL — a missing/denied read must not break generation
          getDoc(contractClassificationsDoc(groupId)).catch(() => null),
          getDoc(legalEntitiesDoc(groupId)).catch(() => null),
        ]);
        if (!alive) return;
        const byId = {};
        tsnap.forEach((d) => { byId[d.id] = { id: d.id, ...d.data() }; });
        setTemplatesById(byId);
        setDefaults(dsnap.exists() ? dsnap.data() : {});
        setClassLevels(csnap && csnap.exists() ? (csnap.data().levels || []) : []);
        setEntities(esnap && esnap.exists() ? (esnap.data().entities || []) : []);
      } catch (e) {
        if (alive) { setLoadErr("Could not load contract templates/defaults. (If you’re owner/storeAdmin, the contract Firestore rules may not be live yet.)"); setTemplatesById({}); setDefaults({}); }
      }
    })();
    return () => { alive = false; };
  }, [groupId]);

  const selectStaff = async (s) => {
    setSelStaff(s); setAreaChoice(null); setOverrides({}); setWriteBack({}); setExtraClauses(""); setPriv(null); setLastDraft(null);
    try {
      const d = await getDoc(staffPrivateDoc(groupId, s.id));
      setPriv(d.exists() ? d.data() : {});
    } catch { setPriv({}); }
  };

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (scopedStaff || []).filter((s) => s.status !== "Left")
      .filter((s) => venueF === "all" || (s.venueIds || []).includes(venueF))
      .filter((s) => areaF === "all" || (s.areas || []).includes(areaF))
      .filter((s) => roleF === "all" || s.role === roleF)
      .filter((s) => !q || `${s.displayName || s.name || ""} ${s.role || ""}`.toLowerCase().includes(q));
  }, [scopedStaff, search, venueF, areaF, roleF]);

  const resolved = useMemo(
    () => (templatesById ? resolveTemplate(selStaff, templatesById, areaChoice) : { status: "EMPTY" }),
    [selStaff, templatesById, areaChoice]
  );
  const template = resolved.status === "OK" ? templatesById[resolved.templateId] : null;
  const values = useMemo(
    () => buildValues(selStaff, priv || {}, defaults || {}, overrides, entities, venues, awardRates),
    [selStaff, priv, defaults, overrides, entities, venues, awardRates]
  );
  // The award mapped to the selected staff's venue (may be unverified) — its level labels feed
  // the classification dropdown; the RATE auto-fill (in buildValues) separately requires verified.
  const staffAward = useMemo(
    () => awardForVenue((venues || []).find((v) => v.id === (selStaff?.venueIds || [])[0]), awardRates),
    [selStaff, venues, awardRates]
  );
  const isMinor = !!(priv && priv.dob && isMinorDob(priv.dob));
  const sendTarget = (priv && priv.contactEmail) || selStaff?.email || "";

  // Count of empty (‹token›) fields for the resolved template — surfaced, never hard-blocks.
  // TODO Step 6: a "send anyway?" confirm should use emptyCount before emailing.
  const emptyCount = template ? (template.tokenKeys || []).filter((t) => !(values[t] && String(values[t]).trim())).length : 0;
  const canGenerate = resolved.status === "OK" && can("contracts", "edit");

  const buildContractDoc = (templateId, tmpl) => ({
    staffId: selStaff.id,
    staffName: selStaff.displayName || selStaff.name || "",
    templateId,
    area: tmpl.area, basis: tmpl.basis, templateVersion: tmpl.version || 1,
    values: { ...values },                 // ALL filled token values — the render source of truth (preview ≡ PDF)
    extraClauses: extraClauses.trim(),
    employeeContactEmail: sendTarget,
    isMinor,
    status: "draft",                       // draft → sent → signed
    createdBy: uid,                        // soft-warned in the UI if null — never silently relied on
    createdAt: serverTimestamp(),
  });

  // Write-back: ONLY toggled-on private fields → private/details (merge). Never dob/tfn/bank.
  const applyWriteBack = async () => {
    const patch = {};
    for (const [token, field] of Object.entries(WRITEBACK_MAP)) {
      if (writeBack[token]) patch[field] = values[token] ?? "";
    }
    if (!Object.keys(patch).length) return;
    patch.updatedAt = serverTimestamp();
    await setDoc(staffPrivateDoc(groupId, selStaff.id), patch, { merge: true });
  };

  const onGenerate = async () => {
    // Re-resolve §4 at click — never trust the last render.
    const r = resolveTemplate(selStaff, templatesById, areaChoice);
    if (r.status !== "OK") {
      return showToast(r.status === "NEEDS_CHOICE" ? "Choose FOH or BOH before generating."
        : r.status === "BLOCK" ? r.reason : "Select a staff member first.");
    }
    setSaving(true);
    try {
      const ref = await addDoc(contractsCol(groupId), buildContractDoc(r.templateId, templatesById[r.templateId]));
      await applyWriteBack();              // isolated; only ticked private fields
      setLastDraft({ id: ref.id });        // enables the (flag-gated) Send button
      showToast("Draft contract saved");
    } catch (e) {
      showToast("Could not save contract");
    } finally { setSaving(false); }
  };

  // Email the saved draft via the sendContract callable. Handles all three server signals:
  // EMPTY_FIELDS:n (confirm gaps), ALREADY_SENT (confirm resend), and testTo (dry rollout send).
  const onSend = async ({ resend = false, confirmEmpty = false, testTo } = {}) => {
    if (!lastDraft) return;
    const fn = httpsCallable(getFunctions(undefined, "us-central1"), "sendContract");
    try {
      await fn({ groupId, contractId: lastDraft.id, resend, confirmEmpty, testTo });
      showToast(testTo ? "Test email sent" : "Contract sent");
    } catch (e) {
      const msg = String(e?.message || "");
      if (msg.includes("EMPTY_FIELDS:")) {
        const n = (msg.split("EMPTY_FIELDS:")[1] || "").replace(/\D.*$/, "");
        if (window.confirm(`${n} field(s) still empty (‹…› will show in the PDF). Send anyway?`))
          return onSend({ resend, confirmEmpty: true, testTo });
      } else if (msg.includes("ALREADY_SENT")) {
        if (window.confirm("This contract was already sent. Resend anyway?"))
          return onSend({ resend: true, confirmEmpty, testTo });
      } else showToast("Could not send contract");
    }
  };

  if (!can("contracts", "view")) {
    return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>You don’t have access to Contract Generator.</div>;
  }

  const setOverride = (k) => (e) => setOverrides((p) => ({ ...p, [k]: e.target.value }));
  // employee_first_name is DERIVED from employee_name (see buildValues) — never its own editable field.
  const HIDDEN_FIELDS = new Set(["employee_first_name"]);
  const fieldsByGroup = (src) => (template?.tokenKeys || []).filter((t) => (TOKEN_SOURCE[t] || "typed") === src && !HIDDEN_FIELDS.has(t));
  // classification_level + employer_name become dropdowns when the Settings lists exist;
  // otherwise they fall back to the free-text input so generation never breaks on an empty list.
  // classification options: the venue award's levels → chunk-3 list → null (free text).
  const awardLevelOptions = (staffAward?.levels || []).map((l) => l.level).filter(Boolean);
  const classOptions = awardLevelOptions.length ? awardLevelOptions : (classLevels.length ? classLevels : null);
  const renderField = (t) => {
    if (t === "classification_level" && classOptions) {
      const known = classOptions.includes(values[t]);
      return (
        <select className="form-input" value={values[t] || ""} onChange={setOverride(t)}>
          <option value="">—</option>
          {classOptions.map((l) => <option key={l} value={l}>{l}</option>)}
          {/* keep a prefilled-but-unlisted value selectable (e.g. legacy staff-record level) */}
          {values[t] && !known && <option value={values[t]}>{values[t]}</option>}
        </select>
      );
    }
    if (t === "employer_name" && entities.length) {
      const known = entities.some((e) => e.name === values[t]);
      return (
        <select className="form-input" value={values[t] || ""} onChange={setOverride(t)}>
          <option value="">—</option>
          {entities.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          {/* keep a prefilled-but-unlisted value (e.g. legacy default) selectable */}
          {values[t] && !known && <option value={values[t]}>{values[t]}</option>}
        </select>
      );
    }
    return <input className="form-input" value={values[t] || ""} onChange={setOverride(t)} placeholder={`‹${t}›`} />;
  };

  return (
    <div style={{ margin: 16 }}>
      {loadErr && <div className="card" style={{ marginBottom: 12, color: "var(--red)", fontSize: 12 }}>{loadErr}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr 1fr", gap: 12, alignItems: "start" }}>
        {/* ── Staff picker ── */}
        <div className="card">
          <div className="card-head"><span className="card-title">Staff</span><span className="card-sub">Pick who the contract is for</span></div>
          <input className="form-input" placeholder="Search name or role…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 6 }} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
            <select className="form-input" value={venueF} onChange={(e) => setVenueF(e.target.value)} title="Venue">
              <option value="all">All venues</option>
              {(venues || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <select className="form-input" value={areaF} onChange={(e) => setAreaF(e.target.value)} title="Area">
              <option value="all">All areas</option>
              {(areas || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="form-input" value={roleF} onChange={(e) => setRoleF(e.target.value)} title="Role" style={{ gridColumn: "1 / -1" }}>
              <option value="all">All roles</option>
              {(roles || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div style={{ maxHeight: "62vh", overflowY: "auto" }}>
            {templatesById === null && <div style={{ fontSize: 12, color: "var(--gray)" }}>Loading…</div>}
            {filteredStaff.map((s) => (
              <button key={s.id} className={`rg-pick-row ${selStaff?.id === s.id ? "active" : ""}`} onClick={() => selectStaff(s)}>
                <span>{s.displayName || s.name}</span>
                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--gray)" }}>{s.role} · {s.type}</span>
              </button>
            ))}
            {templatesById !== null && filteredStaff.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)" }}>No staff.</div>}
          </div>
        </div>

        {/* ── Selection + field review ── */}
        <div className="card">
          {!selStaff && <div style={{ fontSize: 13, color: "var(--gray)" }}>Select a staff member to begin.</div>}

          {selStaff && resolved.status === "BLOCK" && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(192,57,43,0.06)", color: "var(--red)", fontSize: 13 }}>
              <strong>Can’t generate.</strong> {resolved.reason}
            </div>
          )}

          {selStaff && resolved.status === "NEEDS_CHOICE" && (
            <div style={{ padding: 12, borderRadius: 8, background: "rgba(217,119,6,0.08)", fontSize: 13 }}>
              <div style={{ marginBottom: 8 }}><strong>Choose contract.</strong> {resolved.reason}</div>
              <div className="btn-row">
                {resolved.choices.map((a) => <button key={a} className="btn btn-sm" onClick={() => setAreaChoice(a)}>{a}</button>)}
              </div>
            </div>
          )}

          {selStaff && resolved.status === "OK" && template && (
            <>
              <div className="card-head">
                <div><span className="card-title">{template.label}</span><span className="card-sub">{template.id} · prefilled — review & override</span></div>
              </div>
              <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>
                Send target: {sendTarget || <em>— none on file —</em>} {isMinor && <span style={{ color: "var(--red)", fontWeight: 600 }}> · under 18 (guardian block shown)</span>}
              </div>

              {SOURCE_GROUPS.map(([src, label]) => {
                const keys = fieldsByGroup(src);
                if (!keys.length) return null;
                return (
                  <div key={src} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--gray)", margin: "4px 0" }}>{label}</div>
                    {keys.map((t) => (
                      <div key={t} className="form-group" style={{ margin: "0 0 6px" }}>
                        <label className="form-label" style={{ fontSize: 11 }}>{TOKEN_LABEL[t] || t}</label>
                        {renderField(t)}
                        {src === "private" && (
                          <label style={{ fontSize: 10, color: "var(--gray)", display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                            <input type="checkbox" checked={!!writeBack[t]} onChange={(e) => setWriteBack((p) => ({ ...p, [t]: e.target.checked }))} />
                            also update staff record (applies on generate — Step 5)
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}

              <div className="form-group" style={{ marginBottom: 8 }}>
                <label className="form-label" style={{ fontSize: 11 }}>Extra clauses (optional — appended to the contract)</label>
                <textarea className="form-input" rows={3} value={extraClauses} onChange={(e) => setExtraClauses(e.target.value)} placeholder="One-off clauses for this contract only…" />
              </div>

              <div className="btn-row" style={{ alignItems: "center", gap: 10 }}>
                <button className="btn btn-primary" disabled={!canGenerate || saving} onClick={onGenerate}>
                  {saving ? "Saving…" : "Generate draft contract"}
                </button>
                {emptyCount > 0 && (
                  <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>{emptyCount} field{emptyCount > 1 ? "s" : ""} still empty</span>
                )}
                {!uid && <span style={{ fontSize: 11, color: "var(--red)" }}>No login id — author won’t be recorded</span>}
              </div>
              {lastDraft && (
                <div className="btn-row" style={{ alignItems: "center", gap: 10, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 600 }}>Draft saved.</span>
                  <button
                    className="btn btn-sm"
                    disabled={!EMPLOYEE_SEND_ENABLED}
                    title={EMPLOYEE_SEND_ENABLED ? "Email the contract (PDF) to the employee" : "Locked until the test-send PDF is approved (Step 6 rollout gate)"}
                    onClick={() => onSend()}
                  >
                    {EMPLOYEE_SEND_ENABLED ? "Send to employee" : "Send to employee (locked)"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Live preview ── */}
        <div className="card">
          <div className="card-head"><span className="card-title">Preview</span><span className="card-sub">Amber ‹token› = empty field</span></div>
          {!template && <div style={{ fontSize: 13, color: "var(--gray)" }}>The filled contract appears here once a template resolves.</div>}
          {template && (
            <div style={{ maxHeight: "68vh", overflowY: "auto", fontSize: 12, lineHeight: 1.55, padding: "4px 2px" }}>
              {/* Ordering + inclusion (sections, guardian-iff-minor, extraClauses) come from the
                  SHARED contractFill.assemble — the exact same call the server PDF uses. */}
              {contractFill.assemble(template, { values, isMinor, extraClauses }).map((b, i) => (
                b.t === "h"
                  ? <div key={i} style={{ fontWeight: 700, marginTop: 8 }}>{b.text}</div>
                  : <div key={i} style={{ marginBottom: 2 }}>{renderBlockText(b.text)}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
