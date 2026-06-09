import React, { useEffect, useRef } from "react";
import DOMPurify from "dompurify";

// Robust sanitize via DOMPurify — keeps our formatting tags, strips scripts / handlers / vectors.
export const cleanHtml = (html) =>
  DOMPurify.sanitize(html || "", {
    ALLOWED_TAGS: ["b", "i", "u", "strong", "em", "span", "font", "mark", "br", "a"],
    ALLOWED_ATTR: ["style", "color", "href", "target", "rel", "class"],
  });

// Render formatted item text (bold / colour / highlight).
export function RichText({ html, className, style }) {
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: cleanHtml(html) }} />;
}

const TEXT_COLORS = [["#1f1f1f", "Black"], ["#EE0000", "Red"], ["#156082", "Blue"], ["#3A7C22", "Green"], ["#BF4E14", "Orange"], ["#7c3aed", "Purple"]];
const HILITES = [["#FFF59D", "Yellow"], ["#C8E6C9", "Green"], ["#FFCDD2", "Red"], ["transparent", "None"]];

// One contentEditable per item. Re-syncs innerHTML when the prop changes BUT only while
// the box isn't focused — so a reorder/delete updates the content without clobbering the caret.
function ItemEditor({ html, onChange }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== (html || "")) el.innerHTML = html || "";
  }, [html]);
  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      className="rich-item"
      onInput={() => onChange(ref.current.innerHTML)}
    />
  );
}

/**
 * Separated, formattable items: a shared toolbar + one editable box per item,
 * with add / remove. value = array of HTML strings.
 */
export function RichItemList({ value = [], onChange }) {
  const apply = (cmd, arg) => { try { document.execCommand(cmd, false, arg); } catch {} };
  const setItem = (i, html) => onChange(value.map((v, idx) => (idx === i ? html : v)));
  const add = () => onChange([...(value || []), ""]);
  const removeAt = (i) => onChange(value.filter((_, idx) => idx !== i));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= value.length) return; const a = [...value]; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };

  // preventDefault keeps the caret/selection in the focused item while clicking a tool
  const Tool = ({ cmd, arg, title, children, style }) => (
    <button type="button" title={title} className="btn btn-sm" style={{ padding: "2px 7px", ...style }}
      onMouseDown={(e) => { e.preventDefault(); apply(cmd, arg); }}>{children}</button>
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
        <Tool cmd="bold" title="Bold" style={{ fontWeight: 700 }}>B</Tool>
        <Tool cmd="italic" title="Italic" style={{ fontStyle: "italic" }}>i</Tool>
        <Tool cmd="underline" title="Underline" style={{ textDecoration: "underline" }}>U</Tool>
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 3px" }} />
        {TEXT_COLORS.map(([c, n]) => (
          <button key={c} type="button" title={`Text ${n}`} className="btn btn-sm" style={{ padding: "2px 6px", color: c, fontWeight: 700 }}
            onMouseDown={(e) => { e.preventDefault(); apply("foreColor", c); }}>A</button>
        ))}
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 3px" }} />
        {HILITES.map(([c, n]) => (
          <button key={c} type="button" title={`Highlight ${n}`} className="btn btn-sm" style={{ padding: "2px 6px", background: c === "transparent" ? "#fff" : c }}
            onMouseDown={(e) => { e.preventDefault(); apply("hiliteColor", c); }}>{c === "transparent" ? "⌫" : " "}</button>
        ))}
        <Tool cmd="removeFormat" title="Clear formatting">✕fmt</Tool>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(value || []).map((html, i) => (
          <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <span style={{ fontSize: 11, color: "var(--gray)", width: 18, paddingTop: 8, textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
            <div style={{ flex: 1 }}><ItemEditor html={html} onChange={(h) => setItem(i, h)} /></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button type="button" className="btn btn-sm" style={{ padding: "1px 6px" }} title="Move up" onClick={() => move(i, -1)}>▲</button>
              <button type="button" className="btn btn-sm" style={{ padding: "1px 6px" }} title="Move down" onClick={() => move(i, 1)}>▼</button>
            </div>
            <button type="button" className="btn btn-sm btn-danger" style={{ padding: "2px 8px" }} title="Remove item" onClick={() => removeAt(i)}>✕</button>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-sm" style={{ marginTop: 8 }} onClick={add}>+ Add item</button>
    </div>
  );
}
