import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

export default function EditorPro({
  value = "",
  onChange = () => {},
  placeholder = "Write something…",
  className = "",
}) {
  const editorRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const fileInputRef = useRef(null);

  // Emoji popover
  const [showEmoji, setShowEmoji] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);

  // Selection memory
  const savedRangeRef = useRef(null);

  /* ---------- Keep DOM in sync with value ---------- */
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== el.innerHTML) el.innerHTML = value || "";
  }, [value]);

  /* ---------- Selection save/restore ---------- */
  const saveSelection = () => {
    const sel = window.getSelection?.();
    if (sel && sel.rangeCount) savedRangeRef.current = sel.getRangeAt(0);
  };
  const restoreSelection = () => {
    const r = savedRangeRef.current;
    const sel = window.getSelection?.();
    if (!r || !sel) return editorRef.current?.focus();
    sel.removeAllRanges();
    sel.addRange(r);
  };
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handler = () => saveSelection();
    el.addEventListener("keyup", handler);
    el.addEventListener("mouseup", handler);
    el.addEventListener("blur", handler);
    return () => {
      el.removeEventListener("keyup", handler);
      el.removeEventListener("mouseup", handler);
      el.removeEventListener("blur", handler);
    };
  }, []);

  /* ---------- Exec helpers (robust) ---------- */
  const safeExec = (cmd, val = null) => {
    try {
      const ok = document.execCommand(
        cmd,
        false,
        typeof val === "number" ? String(val) : val
      );
      return !!ok;
    } catch {
      return false;
    }
  };

  const execWithRestore = (cmd, val = null) => {
    restoreSelection();
    const ok = safeExec(cmd, val);
    if (!ok) editorRef.current?.focus();
    onChange(editorRef.current?.innerHTML || "");
    return ok;
  };

  const wrapSelection = (tag, inlineStyle = "") => {
    restoreSelection();
    const r = savedRangeRef.current;
    if (!r) return false;
    const el = document.createElement(tag);
    if (inlineStyle) el.setAttribute("style", inlineStyle);
    const contents = r.extractContents();
    el.appendChild(contents);
    r.insertNode(el);
    r.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
    onChange(editorRef.current?.innerHTML || "");
    return true;
  };

  // ✅ HEADINGS / PARAGRAPH (modern browsers want "H1"/"P")
  const setBlock = (blockName /* "H1" | "H2" | "H3" | "P" */) => {
    // Try exact token (Chrome/Safari)
    if (execWithRestore("formatBlock", blockName)) return;
    // Try angle form
    if (execWithRestore("formatBlock", `<${blockName}>`)) return;
    // Fallback: manual wrap
    wrapSelection(blockName.toLowerCase());
  };

  const setForeColor = (c) => execWithRestore("foreColor", c);
  const setBackColor = (c) => {
    if (execWithRestore("hiliteColor", c)) return;
    execWithRestore("backColor", c);
  };
  const setFontSize = (key) => {
    const map = { small: 2, normal: 3, large: 5 };
    const v = map[key] ?? 3;
    if (execWithRestore("fontSize", v)) return;
    const px = { 2: "0.875rem", 3: "1rem", 5: "1.5rem" }[v] || "1rem";
    wrapSelection("span", `font-size:${px}`);
  };

  const insertHTML = (html) => {
    restoreSelection();
    const ok = safeExec("insertHTML", html);
    if (!ok) editorRef.current?.insertAdjacentHTML("beforeend", html);
    onChange(editorRef.current?.innerHTML || "");
    editorRef.current?.focus();
  };

  const insertTextAtCaret = (text) => {
    restoreSelection();
    const ok = safeExec("insertText", text);
    if (!ok) {
      const r = savedRangeRef.current;
      if (r) {
        r.deleteContents();
        r.insertNode(document.createTextNode(text));
        r.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(r);
      } else {
        editorRef.current?.appendChild(document.createTextNode(text));
      }
    }
    onChange(editorRef.current?.innerHTML || "");
  };

  /* ---------- Links / Embeds ---------- */
  const addLink = () => {
    const url = prompt("Enter URL (https://…):");
    if (!url) return;
    restoreSelection();
    const sel = window.getSelection();
    const hasSel = sel && !sel.isCollapsed;
    if (hasSel) {
      if (!safeExec("createLink", url)) {
        wrapSelection("a");
        const anchor = window.getSelection()?.anchorNode?.parentElement;
        if (anchor && anchor.tagName === "A") anchor.href = url;
      }
    } else {
      insertHTML(
        `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
      );
    }
    onChange(editorRef.current?.innerHTML || "");
  };
  const removeLink = () => execWithRestore("unlink");

  const addYouTube = () => {
    const url = prompt("YouTube URL:");
    if (!url) return;
    const id = parseYouTubeId(url);
    if (!id) return alert("Could not parse video ID.");
    insertHTML(`
      <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;">
        <iframe
          src="https://www.youtube.com/embed/${id}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
        ></iframe>
      </div>`);
  };

  /* ---------- Images (default 40×40) ---------- */
  const IMG_STYLE = 'width:40px;height:40px;object-fit:cover;border-radius:4px;';

  const addImageByUrl = () => {
    const url = prompt("Image URL (https://…):");
    if (!url) return;
    insertHTML(`<img src="${url}" alt="image" style="${IMG_STYLE}"/>`);
  };

  const openLocalImageDialog = () => fileInputRef.current?.click();

  const onLocalImagePicked = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () =>
        insertHTML(
          `<img src="${reader.result}" alt="${f.name}" style="${IMG_STYLE}"/>`
        );
      reader.readAsDataURL(f);
    });
    e.target.value = "";
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    for (const it of items) {
      if (it.kind === "file") {
        const file = it.getAsFile();
        if (file && file.type.startsWith("image/")) {
          e.preventDefault();
          const reader = new FileReader();
          reader.onload = () =>
            insertHTML(
              `<img src="${reader.result}" alt="pasted" style="${IMG_STYLE}"/>`
            );
          reader.readAsDataURL(file);
          return;
        }
      }
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files || []);
    for (const f of files) {
      if (!f.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () =>
        insertHTML(
          `<img src="${reader.result}" alt="${f.name}" style="${IMG_STYLE}"/>`
        );
      reader.readAsDataURL(f);
    }
  };
  const onDragOver = (e) => e.preventDefault();

  /* ---------- Emoji popover ---------- */
  const openEmoji = () => {
    saveSelection();
    setAnchorRect(emojiBtnRef.current?.getBoundingClientRect());
    setShowEmoji(true);
  };
  const closeEmoji = () => setShowEmoji(false);

  useEffect(() => {
    if (!showEmoji) return;
    const sync = () =>
      setAnchorRect(emojiBtnRef.current?.getBoundingClientRect());
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [showEmoji]);

  const pickerPortal =
    showEmoji && anchorRect
      ? createPortal(
          <EmojiFloating
            anchorRect={anchorRect}
            onPick={(emoji) => {
              insertTextAtCaret(emoji.native);
              closeEmoji();
            }}
            onClose={closeEmoji}
          />,
          document.body
        )
      : null;

  /* ---------- Render ---------- */
  return (
    <div className={`border rounded-lg bg-white overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div className="relative flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50">
        <TB onClick={() => execWithRestore("bold")} label="B" title="Bold" className="font-bold" />
        <TB onClick={() => execWithRestore("italic")} label="/" title="Italic" className="italic font-semibold" />
        <TB onClick={() => execWithRestore("underline")} label="U" title="Underline" className="underline font-semibold" />
        <TB onClick={() => execWithRestore("strikeThrough")} label="Ṣ" title="Strikethrough" className="line-through font-semibold" />
        <Sep />
        {/* ✅ Use "H1"/"P" tokens */}
        {/* <TB onClick={() => setBlock("H1")} label="H1" title="Heading 1" />
        <TB onClick={() => setBlock("H2")} label="H2" title="Heading 2" />
        <TB onClick={() => setBlock("H3")} label="H3" title="Heading 3" />
        <TB onClick={() => setBlock("P")}  label="P"  title="Paragraph" /> */}
        <Sep />
        {/* ✅ Lists with selection-restore */}
        {/* <TB onClick={() => execWithRestore("insertUnorderedList")} label="• List" title="Bullet list" />
        <TB onClick={() => execWithRestore("insertOrderedList")}   label="1. List" title="Numbered list" />
        <TB onClick={() => execWithRestore("outdent")} label="↤" title="Outdent" />
        <TB onClick={() => execWithRestore("indent")}  label="↦" title="Indent" />
        <TB onClick={() => setBlock("BLOCKQUOTE")} label="❝" title="Blockquote" />
        <TB onClick={() => setBlock("PRE")} label="</>" title="Code block" /> */}
        <Sep />
        <label className="flex items-center gap-1 text-xs px-2 py-1 border rounded bg-white">
          Text
          <input type="color" onChange={(e) => setForeColor(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-xs px-2 py-1 border rounded bg-white">
          Highlight
          <input type="color" onChange={(e) => setBackColor(e.target.value)} />
        </label>
        <Sep />
        <select
          className="px-2 py-1 text-sm border rounded bg-white"
          defaultValue="normal"
          onChange={(e) => setFontSize(e.target.value)}
          title="Font size"
        >
          <option value="small">Small</option>
          <option value="normal">Normal</option>
          <option value="large">Large</option>
        </select>
        <Sep />
        <TB onClick={addLink} label="🔗" title="Insert link" />
        <TB onClick={removeLink} label="⛓✕" title="Remove link" />
        <Sep />
        <TB onClick={addImageByUrl} label="🖼️ URL" title="Insert image by URL" />
        <TB onClick={openLocalImageDialog} label="🖼️ Local" title="Insert image from device" />
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onLocalImagePicked} />
        <TB onClick={addYouTube} label="▶︎ YT" title="Embed YouTube" />
        <Sep />
        <TB onClick={() => execWithRestore("insertHorizontalRule")} label="—" title="Horizontal rule" />
        <TB onClick={() => execWithRestore("undo")} label="↶" title="Undo" />
        <TB onClick={() => execWithRestore("redo")} label="↷" title="Redo" />
        <TB onClick={() => execWithRestore("removeFormat")} label="⎚" title="Clear formatting" />
        <Sep />
        <button
          ref={emojiBtnRef}
          type="button"
          title="Insert emoji"
          className="px-2 py-1 text-sm rounded border bg-white hover:bg-gray-100"
          onClick={() => (showEmoji ? setShowEmoji(false) : openEmoji())}
        >
          😊
        </button>
      </div>

      {/* Editor surface */}
      <div
        ref={editorRef}
        className="p-3 min-h-[160px] outline-none prose max-w-none"
        style={{ whiteSpace: "pre-wrap" }}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(editorRef.current?.innerHTML || "")}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onFocus={saveSelection}
        data-placeholder={placeholder}
      />
      {pickerPortal}

      <style>{`
        .prose:empty:before { content: attr(data-placeholder); color: #9ca3af; }
        /* ✅ Default all images to 40×40 */
        .prose img { width:40px; height:40px; object-fit:cover; border-radius:4px; }
        .prose blockquote { border-left: 4px solid #e5e7eb; padding-left: 12px; color: #374151; margin: 8px 0; }
        .prose pre { background:#0f172a; color:#e2e8f0; padding:12px; border-radius:8px; overflow:auto; }
        .prose hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
      `}</style>
    </div>
  );
}

/* ------- Small UI helpers ------- */
function TB({ label, onClick, title, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`px-2 py-1 text-sm rounded border bg-white hover:bg-gray-100 ${className}`}
    >
      {label}
    </button>
  );
}
function Sep() { return <span className="w-px h-6 bg-gray-200 mx-1" />; }

/* ------- Floating emoji picker (portal) ------- */
function EmojiFloating({ anchorRect, onPick, onClose }) {
  const PICKER_W = 360;
  const PICKER_H = 420;
  const GAP = 8;

  // clamp to viewport
  const left = Math.min(Math.max(8, anchorRect.left), window.innerWidth - PICKER_W - 8);
  const top = Math.min(anchorRect.bottom + GAP, window.innerHeight - PICKER_H - 8);

  useEffect(() => {
    const onDown = (e) => {
      if (!document.getElementById("emoji-mart-pop")?.contains(e.target)) onClose();
    };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div id="emoji-mart-pop" style={{ position: "fixed", top, left, zIndex: 2147483647 }}>
      <Picker
        data={data}
        onEmojiSelect={onPick}
        theme="light"
        previewPosition="none"
        navPosition="top"
        searchPosition="top"
        skinTonePosition="search"
        dynamicWidth
      />
    </div>
  );
}

/* ------- utils ------- */
function parseYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
    if (u.hostname.includes("youtube")) {
      const v = u.searchParams.get("v"); if (v) return v;
      const m = u.pathname.match(/\/embed\/([^/?#]+)/); if (m) return m[1];
    }
  } catch {}
  return null;
}
