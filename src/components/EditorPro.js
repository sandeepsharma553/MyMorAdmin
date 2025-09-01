import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

/**
 * EditorPro
 * - contentEditable -> emits HTML via onChange
 * - Bold/Italic/Underline/Strike; H1/H2/H3; lists; indent/outdent; quote/code; HR
 * - Align left/center/right/justify
 * - Text & highlight color; font size
 * - Link add/remove
 * - Image insert (URL + local + paste/drag); YouTube embed
 * - FULL emoji picker (emoji-mart) rendered in a portal (no clipping)
 * - Undo/Redo/Clear
 */
export default function EditorPro({
  value = "",
  onChange = () => {},
  placeholder = "Write something…",
  className = "",
}) {
  const editorRef = useRef(null);
  const toolbarRef = useRef(null);
  const emojiBtnRef = useRef(null);
  const fileInputRef = useRef(null);

  // emoji popup (portal)
  const [showEmoji, setShowEmoji] = useState(false);
  const [anchorRect, setAnchorRect] = useState(null);
  const savedRangeRef = useRef(null);

  // keep DOM in sync
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (value !== el.innerHTML) el.innerHTML = value || "";
  }, [value]);

  // exec helper
  const exec = (cmd, arg = null) => {
    document.execCommand(cmd, false, arg);
    editorRef.current?.focus();
    onChange(editorRef.current?.innerHTML || "");
  };
  const setBlock = (block) => exec("formatBlock", block);
  const setForeColor = (c) => exec("foreColor", c);
  const setBackColor = (c) => exec("hiliteColor", c);
  const setFontSize = (key) => exec("fontSize", { small: 2, normal: 3, large: 5 }[key] || 3);

  // caret save/restore (so emoji inserts at the right spot)
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
  // keep tracking selection changes
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const handle = () => saveSelection();
    el.addEventListener("keyup", handle);
    el.addEventListener("mouseup", handle);
    el.addEventListener("blur", handle);
    return () => {
      el.removeEventListener("keyup", handle);
      el.removeEventListener("mouseup", handle);
      el.removeEventListener("blur", handle);
    };
  }, []);

  // open/close emoji (portal positioning)
  const openEmoji = () => {
    saveSelection();
    const rect = emojiBtnRef.current?.getBoundingClientRect();
    setAnchorRect(rect);
    setShowEmoji(true);
  };
  const closeEmoji = () => setShowEmoji(false);

  // keep picker anchored on resize/scroll
  useEffect(() => {
    if (!showEmoji) return;
    const onWin = () => setAnchorRect(emojiBtnRef.current?.getBoundingClientRect());
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [showEmoji]);

  // insert text at caret (fallback if execCommand fails)
  const insertAtCaret = (text) => {
    restoreSelection();
    const ok = document.execCommand("insertText", false, text);
    if (!ok) {
      const r = savedRangeRef.current;
      if (r) {
        r.deleteContents();
        r.insertNode(document.createTextNode(text));
        r.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
      } else {
        editorRef.current?.appendChild(document.createTextNode(text));
      }
    }
    onChange(editorRef.current?.innerHTML || "");
  };

  // images
  const addImageByUrl = () => {
    const url = prompt("Image URL (https://…):");
    if (url) exec("insertImage", url);
  };
  const openLocalImageDialog = () => fileInputRef.current?.click();
  const onLocalImagePicked = (e) => {
    const files = Array.from(e.target.files || []);
    files.forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => insertHTML(`<img src="${reader.result}" alt="${f.name}" style="max-width:100%;"/>`);
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
          reader.onload = () => insertHTML(`<img src="${reader.result}" alt="pasted" style="max-width:100%;"/>`);
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
      reader.onload = () => insertHTML(`<img src="${reader.result}" alt="${f.name}" style="max-width:100%;"/>`);
      reader.readAsDataURL(f);
    }
  };
  const onDragOver = (e) => e.preventDefault();

  // links / video
  const addLink = () => {
    const url = prompt("Enter URL (https://…):");
    if (url) exec("createLink", url);
  };
  const removeLink = () => exec("unlink");
  const addYouTube = () => {
    const url = prompt("YouTube URL:");
    if (!url) return;
    const id = parseYouTubeId(url);
    if (!id) return alert("Could not parse video ID.");
    insertHTML(`
      <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:12px;">
        <iframe
          src="https://www.youtube.com/embed/${id}"
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
        ></iframe>
      </div>`);
  };

  const insertHTML = (html) => {
    const ok = document.execCommand("insertHTML", false, html);
    if (!ok) editorRef.current?.insertAdjacentHTML("beforeend", html);
    onChange(editorRef.current?.innerHTML || "");
    editorRef.current?.focus();
  };

  const onInput = () => onChange(editorRef.current?.innerHTML || "");

  // PORTAL: full emoji picker (search + categories)
  const pickerPortal =
    showEmoji && anchorRect
      ? createPortal(
          <EmojiFloating
            anchorRect={anchorRect}
            onPick={(emoji) => { insertAtCaret(emoji.native); closeEmoji(); }}
            onClose={closeEmoji}
          />,
          document.body
        )
      : null;

  return (
    <div className={`border rounded-lg bg-white overflow-hidden ${className}`}>
      {/* Toolbar */}
      <div ref={toolbarRef} className="relative flex flex-wrap items-center gap-1 p-2 border-b bg-gray-50">
        <TB onClick={() => exec("bold")} label="B" title="Bold" className="font-bold" />
        <TB onClick={() => exec("italic")} label="I" title="Italic" className="italic" />
        <TB onClick={() => exec("underline")} label="U" title="Underline" className="underline" />
        <TB onClick={() => exec("strikeThrough")} label="S" title="Strikethrough" className="line-through" />
        <Sep />
        <TB onClick={() => setBlock("<h1>")} label="H1" title="Heading 1" />
        <TB onClick={() => setBlock("<h2>")} label="H2" title="Heading 2" />
        <TB onClick={() => setBlock("<h3>")} label="H3" title="Heading 3" />
        <TB onClick={() => setBlock("<p>")} label="P" title="Paragraph" />
        <Sep />
        <TB onClick={() => exec("insertUnorderedList")} label="• List" title="Bullet list" />
        <TB onClick={() => exec("insertOrderedList")} label="1. List" title="Numbered list" />
        <TB onClick={() => exec("outdent")} label="⇤" title="Outdent" />
        <TB onClick={() => exec("indent")} label="⇥" title="Indent" />
        <TB onClick={() => setBlock("<blockquote>")} label="❝" title="Blockquote" />
        <TB onClick={() => setBlock("<pre>")} label="</>" title="Code block" />
        <Sep />
        <TB onClick={() => exec("justifyLeft")} label="⟸" title="Align left" />
        <TB onClick={() => exec("justifyCenter")} label="≡" title="Align center" />
        <TB onClick={() => exec("justifyRight")} label="⟹" title="Align right" />
        <TB onClick={() => exec("justifyFull")} label="☰" title="Justify" />
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
        <TB onClick={() => exec("insertHorizontalRule")} label="—" title="Horizontal rule" />
        <TB onClick={() => exec("undo")} label="↶" title="Undo" />
        <TB onClick={() => exec("redo")} label="↷" title="Redo" />
        <TB onClick={() => exec("removeFormat")} label="⎚" title="Clear formatting" />
        <Sep />

        {/* EMOJI button (portal picker) */}
        <button
          ref={emojiBtnRef}
          type="button"
          title="Insert emoji"
          className="px-2 py-1 text-sm rounded border bg-white hover:bg-gray-100"
          onClick={() => (showEmoji ? closeEmoji() : openEmoji())}
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
        onInput={onInput}
        onPaste={onPaste}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onFocus={saveSelection}
        data-placeholder={placeholder}
      />
      {pickerPortal}

      <style>{`
        .prose:empty:before { content: attr(data-placeholder); color: #9ca3af; }
        .prose img { max-width: 100%; height: auto; border-radius: 8px; }
        .prose blockquote { border-left: 4px solid #e5e7eb; padding-left: 12px; color: #374151; margin: 8px 0; }
        .prose pre { background:#0f172a; color:#e2e8f0; padding:12px; border-radius:8px; overflow:auto; }
        .prose hr { border: none; border-top: 1px solid #e5e7eb; margin: 12px 0; }
      `}</style>
    </div>
  );
}

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

// Floating emoji picker rendered to <body> (prevents clipping)
function EmojiFloating({ anchorRect, onPick, onClose }) {
  const PICKER_W = 360;  // approx width
  const PICKER_H = 420;  // approx height
  const GAP = 8;

  // clamp to viewport
  const left = Math.min(
    Math.max(8, anchorRect.left),
    window.innerWidth - PICKER_W - 8
  );
  const top = Math.min(
    anchorRect.bottom + GAP,
    window.innerHeight - PICKER_H - 8
  );

  // close on outside click / Esc
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
    <div
      id="emoji-mart-pop"
      style={{ position: "fixed", top, left, zIndex: 2147483647 }}
    >
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
