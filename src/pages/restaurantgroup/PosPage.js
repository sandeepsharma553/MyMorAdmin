import React, { useMemo, useState } from "react";
import { useRG } from "./RGContext";
import { sellOrder } from "./sellOrder";
import { money, incGst, venueSellPrice, DEFAULT_MENU_CATEGORIES } from "./rgStockUtils";

/* POS Terminal — Phase 1 (order-entry grid + order rail + venue-scoped send).
 * Modifiers/variants selection + payment are Phase 2. Route-gated by the `menus`
 * permission (view); the SALE itself is authorised server-side by rgSellOrder's
 * `stock` permission gate — a denied sale surfaces the server's error toast here.
 * Rail prices are DISPLAY-ONLY: the server re-prices every line authoritatively
 * (instance.sellPrice → legacy venuePrices → template) inside rgSellOrder. */
const MAX_LINES = 50; // rgSellOrder hard limit (index.js: "Too many lines (max 50)")
const MAX_QTY = 999; // server rejects qty > 1000 for the WHOLE call — cap below it

export default function PosPage() {
  const {
    groupId, group, menuItems, resolvedMenuItems, menuInstanceById,
    selectedVenue, selectedVenueName, showToast,
  } = useRG();
  const categories = group?.menuCategories?.length ? group.menuCategories : DEFAULT_MENU_CATEGORIES;

  const [cat, setCat] = useState(""); // "" = all categories
  const [lines, setLines] = useState([]); // [{ menuItemId, displayName, qty, unitPrice }]
  const [sending, setSending] = useState(false);

  // Price at the selected venue — MIRRORS MenusPage.sellAt / the server priority:
  // instance.sellPrice → legacy template.venuePrices[venueId] → template sellPrice.
  const sellAt = (m) => {
    const inst = menuInstanceById[m.templateId || m.id];
    if (inst && inst.sellPrice != null && !isNaN(Number(inst.sellPrice))) return Number(inst.sellPrice);
    const t = menuItems.find((x) => x.id === (m.templateId || m.id)) || m;
    return venueSellPrice(t, selectedVenue);
  };

  const tiles = useMemo(
    () => resolvedMenuItems
      .filter((m) => !cat || m.category === cat)
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "")),
    [resolvedMenuItems, cat]
  );
  // categories that actually have items at this venue (chips stay useful)
  const liveCats = useMemo(
    () => categories.filter((c) => resolvedMenuItems.some((m) => m.category === c)),
    [categories, resolvedMenuItems]
  );

  const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);

  const addLine = (m) => {
    if (m.e86 || m.available === false) return; // greyed tiles are non-tappable anyway
    const id = m.templateId || m.id;
    setLines((prev) => {
      const ex = prev.find((l) => l.menuItemId === id);
      if (ex) {
        if (ex.qty >= MAX_QTY) { showToast(`Max ${MAX_QTY} per line`); return prev; }
        return prev.map((l) => (l.menuItemId === id ? { ...l, qty: l.qty + 1 } : l));
      }
      if (prev.length >= MAX_LINES) { showToast(`Max ${MAX_LINES} lines per order (server limit)`); return prev; }
      return [...prev, { menuItemId: id, displayName: m.displayName || id, qty: 1, unitPrice: sellAt(m) }];
    });
  };
  const bump = (id, d) => setLines((prev) => prev
    .map((l) => (l.menuItemId === id ? { ...l, qty: Math.min(MAX_QTY, l.qty + d) } : l))
    .filter((l) => l.qty > 0));
  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.menuItemId !== id));

  const send = async () => {
    if (!lines.length || sending) return;
    setSending(true);
    try {
      // The ONE entry point — deduction/pricing/order-write run server-side in
      // rgSellOrder's transaction; never reimplement client-side.
      const r = await sellOrder({
        groupId,
        venueId: selectedVenue,
        lines: lines.map((l) => ({ menuItemId: l.menuItemId, qty: l.qty })), // server shape: { menuItemId, qty } only
        reference: `POS-${Date.now().toString().slice(-6)}`,
        orderMeta: { serviceMode: "dinein" }, // Phase 1: dine-in only; toggle is Phase 2
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
    <div style={{ display: "flex", gap: 12, alignItems: "stretch", minHeight: "70vh" }}>
      {/* LEFT — category chips */}
      <div style={{ width: 150, flexShrink: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        <button className={`btn btn-sm ${cat === "" ? "btn-primary" : ""}`} style={{ justifyContent: "flex-start" }} onClick={() => setCat("")}>All</button>
        {liveCats.map((c) => (
          <button key={c} className={`btn btn-sm ${cat === c ? "btn-primary" : ""}`} style={{ justifyContent: "flex-start" }} onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>

      {/* CENTRE — item tiles (venue-resolved; e86/unavailable greyed + non-tappable) */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, alignContent: "flex-start" }}>
        {tiles.map((m) => {
          const off = m.e86 || m.available === false;
          return (
            <div key={m.templateId || m.id} className="card"
              onClick={() => !off && addLine(m)}
              style={{ cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.4 : 1, padding: 12, userSelect: "none" }}>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25, textDecoration: m.e86 ? "line-through" : "none" }}>{m.displayName}</div>
              <div style={{ fontSize: 12, color: "var(--gray)", marginTop: 4 }}>
                {money(incGst(sellAt(m), m.gstApplicable !== false))}
                {m.e86 ? " · 86’d" : m.available === false ? " · hidden" : ""}
              </div>
            </div>
          );
        })}
        {tiles.length === 0 && <div className="card" style={{ gridColumn: "1 / -1", color: "var(--gray)", fontSize: 13 }}>No items{cat ? ` in ${cat}` : ""} at {selectedVenueName}.</div>}
      </div>

      {/* RIGHT — order rail */}
      <div className="card" style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Order — {selectedVenueName} <span style={{ color: "var(--gray)", fontWeight: 500 }}>· dine-in</span></div>
        <div style={{ flex: 1, overflowY: "auto" }}>
          {lines.map((l) => (
            <div key={l.menuItemId} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 0", borderBottom: "0.5px solid var(--border)" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{l.displayName}</div>
                <div style={{ fontSize: 11, color: "var(--gray)" }}>{money(l.unitPrice)} ex</div>
              </div>
              <button className="btn btn-sm" onClick={() => bump(l.menuItemId, -1)}>−</button>
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 20, textAlign: "center" }}>{l.qty}</span>
              <button className="btn btn-sm" onClick={() => bump(l.menuItemId, 1)}>+</button>
              <button className="btn btn-sm" style={{ color: "var(--red)" }} onClick={() => removeLine(l.menuItemId)}>✕</button>
            </div>
          ))}
          {lines.length === 0 && <div style={{ fontSize: 12, color: "var(--gray)", padding: "16px 0" }}>Tap items to add them.</div>}
        </div>
        <div style={{ borderTop: "0.5px solid var(--border)", paddingTop: 8, marginTop: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 8 }}>
            <span>Subtotal (ex-GST)</span><strong>{money(subtotal)}</strong>
          </div>
          <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 8 }}>{lines.length}/{MAX_LINES} lines · server re-prices &amp; adds GST</div>
          <button className="btn btn-primary" style={{ width: "100%" }} disabled={!lines.length || sending} onClick={send}>
            {sending ? "Sending…" : "Send order"}
          </button>
        </div>
      </div>
    </div>
  );
}
