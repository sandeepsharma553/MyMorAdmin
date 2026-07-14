import React, { useMemo, useState } from "react";
import { useRG } from "./RGContext";
import { sellOrder } from "./sellOrder";
import { money, incGst, resolvedSellPrice, DEFAULT_MENU_CATEGORIES } from "./rgStockUtils";
import "./PosPage.css";

/* POS Terminal — Phase 2 (order-entry grid + modifier modal + service-mode + send).
 * Payment + discounts are NOT here (no discount model exists yet — verified).
 * Route-gated by the `pos` permission (view — staff default); the SALE itself is
 * authorised server-side by rgSellOrder (stock OR pos permission, fail-closed) —
 * a denied sale surfaces the server's error toast here.
 * Rail prices are CLIENT-ESTIMATES: the server re-prices every line + modifier
 * authoritatively (instance.sellPrice → legacy venuePrices → template; modifier
 * deltas from _optionPrices → group priceDelta — labels only are sent, never
 * client deltas). Selection rules (single/required/min/max) are enforced HERE —
 * the server prices whatever labels arrive and does NOT validate selections. */
const MAX_LINES = 50; // rgSellOrder hard limit ("Too many lines (max 50)")
const MAX_QTY = 999; // server rejects qty > 1000 for the WHOLE call — cap below it
const MAX_MODS = 20; // server prices only the first 20 modifiers per line
const SERVICE_MODES = ["dinein", "takeaway", "delivery", "pickup"]; // rgSellOrder whitelist
const MODE_LABEL = { dinein: "Dine-in", takeaway: "Takeaway", delivery: "Delivery", pickup: "Pickup" };

// Display delta for one option — MIRRORS the server lookup (index.js modifier loop):
// instance _optionPrices[gid][label] (numeric) first, else the group option's priceDelta.
const optionDelta = (m, gid, group, label) => {
  const ovp = m?._optionPrices?.[gid];
  if (ovp && ovp[label] != null && !isNaN(Number(ovp[label]))) return Number(ovp[label]);
  const opt = (group?.options || []).find((o) => o && o.label === label);
  return Number(opt?.priceDelta) || 0;
};
// per-group minimum picks: required forces ≥1 even if minSelections is 0
const minFor = (g) => (g.required ? Math.max(1, Number(g.minSelections) || 0) : (Number(g.minSelections) || 0));
// one rail line per item+modifier-combination
const lineKeyOf = (id, mods) => `${id}|${(mods || []).map((x) => x.label).slice().sort().join("+")}`;

// ── tile avatar (DISPLAY ONLY — no behaviour) ─────────────────────────────
// initials: first letter of the first two words of displayName, uppercased.
const initialsOf = (name) => String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();
// fixed tint pairs — pale bg + a DARK shade of the SAME hue (never black/grey).
// The pair is picked by hashing the item id, so the same item always renders
// the same colour on every device and every render.
const TILE_TINTS = [
  { bg: "#F7DCFA", fg: "#7A1486" }, // violet
  { bg: "#FCE7F3", fg: "#9D174D" }, // pink
  { bg: "#FFEDD5", fg: "#9A3412" }, // orange
  { bg: "#FEF3C7", fg: "#92400E" }, // amber
  { bg: "#DCFCE7", fg: "#166534" }, // green
  { bg: "#CCFBF1", fg: "#115E59" }, // teal
  { bg: "#DBEAFE", fg: "#1E40AF" }, // blue
  { bg: "#E0E7FF", fg: "#3730A3" }, // indigo
];
const tintOf = (id) => {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILE_TINTS[h % TILE_TINTS.length];
};

export default function PosPage() {
  const {
    groupId, group, menuItems, resolvedMenuItems, menuInstanceById, modifierGroups,
    selectedVenue, selectedVenueName, showToast, myStaff, me,
  } = useRG();
  const categories = group?.menuCategories?.length ? group.menuCategories : DEFAULT_MENU_CATEGORIES;

  const [cat, setCat] = useState(""); // "" = all categories
  const [q, setQ] = useState(""); // search — filters WITHIN the selected category
  const [lines, setLines] = useState([]); // [{ key, menuItemId, displayName, qty, unitPrice, modifiers:[{label,priceDelta}], modDelta }]
  const [serviceMode, setServiceMode] = useState("dinein");
  const [sending, setSending] = useState(false);
  const [modModal, setModModal] = useState(null); // { item, sel: { [gid]: [labels] } }

  // WHO is taking the order — on the admin web app everyone signs in with their
  // OWN account, so the login IS the identity: no name+PIN gate here (that gate
  // lives on the shared-device Ops iPad POS). Orders are attributed to the
  // logged-in user's staff profile (myStaff, resolved by adminUid/email); the
  // server validates the id and stamps staffId/staffName on the order doc,
  // feeding the per-staff sales figures on the Performance page. A login with
  // no staff profile (e.g. a pure owner account) can browse but NOT send —
  // every sale must be attributable (mirrors the Ops PosScreen guard).
  const operator = myStaff || null;

  // the ONE shared price resolver (rgStockUtils) — same value the server charges
  const sellAt = (m) => resolvedSellPrice(m, { menuInstanceById, menuItems, selectedVenue });

  // search composes with the category filter; alphabetical order is kept —
  // predictable beats relevance-ranking on a POS grid.
  const tiles = useMemo(() => {
    const query = q.trim().toLowerCase();
    return resolvedMenuItems
      .filter((m) => !cat || m.category === cat)
      .filter((m) => !query
        || (m.displayName || "").toLowerCase().includes(query)
        || (m.kitchenName || "").toLowerCase().includes(query))
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || ""));
  }, [resolvedMenuItems, cat, q]);
  const liveCats = useMemo(
    () => categories.filter((c) => resolvedMenuItems.some((m) => m.category === c)),
    [categories, resolvedMenuItems]
  );

  // inc-GST estimate of what the server will charge: rgSellOrder taxes the WHOLE
  // line (unit + modifier deltas) by the item's gstApplicable, so incGst per line
  // then × qty mirrors its subtotal + gst exactly (to rounding).
  const total = lines.reduce((s, l) => s + l.qty * incGst(l.unitPrice + l.modDelta, l.gstApplicable !== false), 0);
  // DISPLAY-ONLY breakdown rows: ex-GST sum of the same line values, and GST as
  // the difference from the untouched inc-GST total — no new tax math introduced.
  const subtotalEx = lines.reduce((s, l) => s + l.qty * (l.unitPrice + l.modDelta), 0);
  const gstEst = total - subtotalEx;

  const pushLine = (m, mods) => {
    const id = m.templateId || m.id;
    const modDelta = (mods || []).reduce((s, x) => s + x.priceDelta, 0);
    const key = lineKeyOf(id, mods);
    setLines((prev) => {
      const ex = prev.find((l) => l.key === key);
      if (ex) {
        if (ex.qty >= MAX_QTY) { showToast(`Max ${MAX_QTY} per line`); return prev; }
        return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      }
      if (prev.length >= MAX_LINES) { showToast(`Max ${MAX_LINES} lines per order (server limit)`); return prev; }
      // gstApplicable rides on the rail line so chips can show inc-GST deltas like the tiles
      return [...prev, { key, menuItemId: id, displayName: m.displayName || id, qty: 1, unitPrice: sellAt(m), modifiers: mods || [], modDelta, gstApplicable: m.gstApplicable !== false }];
    });
  };
  const tapTile = (m) => {
    if (m.e86 || m.available === false) return;
    // items with RESOLVED modifier groups open the modal; others add straight to the rail
    const gids = (m.modifierGroupIds || []).filter((gid) => modifierGroups.some((g) => g.id === gid));
    if (gids.length) setModModal({ item: m, sel: {}, open: {} }); // open = per-group expand/collapse (display only)
    else pushLine(m, []);
  };
  const bump = (key, d) => setLines((prev) => prev
    .map((l) => (l.key === key ? { ...l, qty: Math.min(MAX_QTY, l.qty + d) } : l))
    .filter((l) => l.qty > 0));
  const removeLine = (key) => setLines((prev) => prev.filter((l) => l.key !== key));

  const send = async () => {
    // !operator: never send an unattributable sale (Ops PosScreen has the same guard)
    if (!lines.length || sending || !operator) return;
    setSending(true);
    try {
      // The ONE entry point — pricing/deduction/order-write run server-side in
      // rgSellOrder's transaction; labels only, the server never trusts client deltas.
      const r = await sellOrder({
        groupId,
        venueId: selectedVenue,
        lines: lines.map((l) => ({
          menuItemId: l.menuItemId, qty: l.qty,
          ...(l.modifiers?.length ? { modifiers: l.modifiers.slice(0, MAX_MODS).map((x) => ({ label: x.label })) } : {}),
        })),
        reference: `POS-${Date.now().toString().slice(-6)}`,
        orderMeta: { serviceMode, staff: { id: operator.id } }, // guard above guarantees operator
      });
      if (r.skipped?.length) {
        showToast(`Skipped: ${[...new Set(r.skipped.map((x) => x.reason))].join("; ")}`);
      }
      if (r.ok) {
        let msg = `Order sent · #${r.orderNumber || "—"} · ${money(r.amounts?.total ?? 0)} inc-GST`;
        if (r.lowStock?.length) msg += ` · LOW STOCK: ${r.lowStock.slice(0, 3).join(", ")}`;
        showToast(msg);
        setLines([]);
      }
    } catch (e) {
      // surface the SERVER's message (permission-denied / not authorized for venue / …)
      showToast(`Order failed: ${e?.message || e?.code || "error"}`);
    }
    setSending(false);
  };

  // VENUE GATE (option B): the POS is meaningless at "all" — resolvedMenuItems
  // would be raw templates and the server would reject/misprice every line.
  if (selectedVenue === "all") {
    return (
      <div className="card" style={{ maxWidth: 520, margin: "40px auto", textAlign: "center", padding: 28 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Select a venue to use the POS</div>
        <div style={{ fontSize: 13, color: "var(--gray)" }}>
          Use the venue selector (top-right). The POS sells one venue's menu at that venue's prices.
        </div>
      </div>
    );
  }

  return (
    <div className="pos-v2" style={{ display: "flex", gap: 12, alignItems: "stretch", minHeight: "70vh" }}>
      {/* LEFT — category chips */}
      <div style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="pos-cat-label">Categories</div>
        <button className={`pos-cat ${cat === "" ? "pos-cat--on" : ""}`} onClick={() => setCat("")}>All</button>
        {liveCats.map((c) => (
          <button key={c} className={`pos-cat ${cat === c ? "pos-cat--on" : ""}`} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      {/* CENTRE — search + item tiles (venue-resolved; e86/unavailable greyed + non-tappable) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* autoFocus is right on the web POS: a keyboard is always attached, so
            landing on the page ready-to-type saves a click. (Ops does NOT autofocus —
            an iPad software keyboard would cover the grid.) */}
        <div style={{ position: "relative" }}>
          <span className="pos-search-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
            </svg>
          </span>
          <input className="pos-search" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder={`Search items${cat ? ` in ${cat}` : ""}…`} />
          {q !== "" && (
            <button className="pos-search-clear" onClick={() => setQ("")} title="Clear search" aria-label="Clear search">×</button>
          )}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, alignContent: "flex-start" }}>
        {tiles.map((m) => {
          const off = m.e86 || m.available === false;
          const hasMods = (m.modifierGroupIds || []).length > 0;
          const tint = tintOf(m.templateId || m.id);
          return (
            <div key={m.templateId || m.id} className={`pos-tile ${off ? "pos-tile--off" : "pos-tile--tap"}`}
              onClick={() => !off && tapTile(m)}>
              <div className="pos-avatar" style={{ background: tint.bg, color: tint.fg }}>{initialsOf(m.displayName)}</div>
              <div className="pos-tile-name" style={{ textDecoration: m.e86 ? "line-through" : "none" }}>{m.displayName}</div>
              <div className="pos-tile-price">{money(incGst(sellAt(m), m.gstApplicable !== false))}</div>
              {hasMods && !off ? <span className="pos-addons">+add-ons</span> : null}
              {(m.e86 || m.available === false) && (
                <div className="pos-tile-flag">{m.e86 ? "86’d" : m.available === false ? "hidden" : ""}</div>
              )}
            </div>
          );
        })}
        {tiles.length === 0 && (
          <div className="pos-tile" style={{ gridColumn: "1 / -1", color: "var(--pos-ink-soft)", fontSize: 13 }}>
            {q.trim()
              ? <>No items match “{q.trim()}”{cat ? ` in ${cat}` : ""}. <button className="pos-mode" style={{ marginLeft: 8 }} onClick={() => setQ("")}>Clear search</button></>
              : <>No items{cat ? ` in ${cat}` : ""} at {selectedVenueName}.</>}
          </div>
        )}
        </div>
      </div>

      {/* RIGHT — order rail */}
      <div className="pos-rail">
        <div style={{ fontSize: 13, fontWeight: 800, color: "var(--pos-ink)" }}>Order — {selectedVenueName}</div>
        <div style={{ fontSize: 11, color: "var(--pos-ink-soft)", marginBottom: 6 }}>
          Served by <strong>{operator ? (operator.displayName || operator.name) : (me?.name || me?.email || "this login")}</strong>
        </div>
        {!operator && (
          <div className="pos-banner">
            This login has no staff profile, so sales can't be attributed. Ask an owner to link your
            account to a staff record. You can browse the menu, but sending orders is disabled.
          </div>
        )}
        {/* service mode (sent as orderMeta.serviceMode) */}
        <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
          {SERVICE_MODES.map((sm) => (
            <button key={sm} className={`pos-mode ${serviceMode === sm ? "pos-mode--on" : ""}`} onClick={() => setServiceMode(sm)}>{MODE_LABEL[sm]}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {lines.map((l) => (
            <div key={l.key} className="pos-line">
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pos-ink)" }}>{l.displayName}</div>
                  <div style={{ fontSize: 11, color: "var(--pos-ink-soft)" }}>{money(incGst(l.unitPrice + l.modDelta, l.gstApplicable !== false))} each</div>
                </div>
                <button className="pos-step" onClick={() => bump(l.key, -1)}>−</button>
                <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center", color: "var(--pos-ink)" }}>{l.qty}</span>
                <button className="pos-step" onClick={() => bump(l.key, 1)}>+</button>
                <button className="pos-step pos-remove" onClick={() => removeLine(l.key)}>✕</button>
              </div>
              {l.modifiers.length > 0 && (
                <div className="pos-line-mods">
                  {l.modifiers.map((x) => (
                    <span key={x.label} style={{ marginRight: 6 }}>
                      {x.label}{x.priceDelta ? ` ${x.priceDelta > 0 ? "+" : "−"}${money(incGst(Math.abs(x.priceDelta), l.gstApplicable !== false))}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {lines.length === 0 && <div style={{ fontSize: 12, color: "var(--pos-ink-soft)", padding: "16px 0" }}>Tap items to add them.</div>}
        </div>
        <div className="pos-foot">
          <div className="pos-sub-row"><span>Subtotal (ex-GST, est.)</span><span>{money(subtotalEx)}</span></div>
          <div className="pos-sub-row"><span>GST (est.)</span><span>{money(gstEst)}</span></div>
          <div className="pos-total-row">
            <span className="pos-total-label">Total (inc-GST, est.)</span><strong>{money(total)}</strong>
          </div>
          <div style={{ fontSize: 11, color: "var(--pos-ink-soft)", marginBottom: 8 }}>{lines.length}/{MAX_LINES} lines · {MODE_LABEL[serviceMode]} · server re-prices authoritatively</div>
          <button className="pos-send" disabled={!lines.length || sending || !operator}
            title={operator ? undefined : "No staff profile linked to this login — sales can't be attributed"} onClick={send}>
            {sending ? "Sending…" : operator ? "Send order" : "No staff profile — can't send"}
          </button>
        </div>
      </div>

      {/* MODIFIER MODAL — selection rules enforced HERE (server prices labels only,
          it does NOT validate single/required/min/max — verified in rgSellOrder) */}
      {modModal && (() => {
        const m = modModal.item;
        const groups = (m.modifierGroupIds || [])
          .map((gid) => ({ gid, g: modifierGroups.find((x) => x.id === gid) }))
          .filter((x) => x.g);
        const toggle = (gid, g, label) => setModModal((p) => {
          const cur = p.sel[gid] || [];
          if (g.type === "single") return { ...p, sel: { ...p.sel, [gid]: cur[0] === label ? [] : [label] } };
          if (cur.includes(label)) return { ...p, sel: { ...p.sel, [gid]: cur.filter((l) => l !== label) } };
          const max = g.maxSelections == null ? Infinity : Number(g.maxSelections) || Infinity;
          if (cur.length >= max) return p; // multi: hard cap at maxSelections
          return { ...p, sel: { ...p.sel, [gid]: [...cur, label] } };
        });
        const chosen = groups.flatMap(({ gid, g }) => (modModal.sel[gid] || []).map((label) => ({ label, priceDelta: optionDelta(m, gid, g, label) })));
        const unmet = groups.filter(({ gid, g }) => (modModal.sel[gid] || []).length < minFor(g));
        const ok = unmet.length === 0 && chosen.length <= MAX_MODS;
        const estUnit = sellAt(m) + chosen.reduce((s, x) => s + x.priceDelta, 0);
        return (
          <div className="rg-modal-overlay" onClick={(e) => e.target === e.currentTarget && setModModal(null)}>
            <div className="rg-modal" style={{ maxWidth: 480 }}>
              <div className="modal-head"><span className="modal-title">{m.displayName}</span><button className="modal-close" onClick={() => setModModal(null)}>✕</button></div>
              {/* DISPLAY ordering/collapse only — selection rules (toggle/minFor/unmet/ok)
                  are untouched. Required groups (minFor > 0) first + always expanded;
                  optional groups collapse by default but auto-expand once they hold
                  selections (never hide the user's own choices). */}
              {[...groups].sort((a, b) => (minFor(a.g) > 0 ? 0 : 1) - (minFor(b.g) > 0 ? 0 : 1)).map(({ gid, g }) => {
                const req = minFor(g) > 0;
                const selCount = (modModal.sel[gid] || []).length;
                const expanded = req || (modModal.open?.[gid] != null ? modModal.open[gid] : selCount > 0);
                return (
                <div key={gid} style={{ marginBottom: 12, ...(req ? { borderLeft: "3px solid var(--red)", paddingLeft: 8 } : {}) }}>
                  <div className="form-label" style={req ? {} : { cursor: "pointer", userSelect: "none" }}
                    onClick={req ? undefined : () => setModModal((p) => ({ ...p, open: { ...p.open, [gid]: !expanded } }))}>
                    {!req && <span style={{ marginRight: 4, fontSize: 10, color: "var(--gray)" }}>{expanded ? "▾" : "▸"}</span>}
                    {g.name}
                    <span style={{ fontWeight: 400, color: "var(--gray)", marginLeft: 6, fontSize: 11 }}>
                      {g.type === "single" ? "pick one" : g.maxSelections != null ? `up to ${g.maxSelections}` : "any"}
                      {minFor(g) > 0 ? ` · min ${minFor(g)}` : ""}{g.required ? " · required" : ""}
                      {!expanded ? ` · ${(g.options || []).length} options${selCount ? ` · ${selCount} selected` : ""}` : ""}
                    </span>
                  </div>
                  {expanded && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {(g.options || []).map((o) => {
                      const on = (modModal.sel[gid] || []).includes(o.label);
                      const delta = optionDelta(m, gid, g, o.label);
                      return (
                        <label key={o.label} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, border: "0.5px solid var(--border)", borderRadius: 8, padding: "4px 8px", cursor: "pointer", background: on ? "#eef2ff" : "transparent" }}>
                          <input type={g.type === "single" ? "radio" : "checkbox"} name={`mod-${gid}`} checked={on} onChange={() => toggle(gid, g, o.label)} />
                          {o.label}{delta ? <span style={{ color: "var(--gray)" }}>{delta > 0 ? "+" : "−"}{money(incGst(Math.abs(delta), m.gstApplicable !== false))}</span> : null}
                        </label>
                      );
                    })}
                  </div>
                  )}
                </div>
                );
              })}
              {chosen.length > MAX_MODS && <div style={{ fontSize: 11, color: "var(--red)", marginBottom: 6 }}>Max {MAX_MODS} add-ons per line (server limit).</div>}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "var(--gray)" }}>{money(incGst(estUnit, m.gstApplicable !== false))} inc-GST / each</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm" onClick={() => setModModal(null)}>Cancel</button>
                  <button className="btn btn-primary btn-sm" disabled={!ok} onClick={() => { pushLine(m, chosen); setModModal(null); }}>
                    {unmet.length ? `Pick ${unmet.map((u) => u.g.name).join(", ")}` : "Add to order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
