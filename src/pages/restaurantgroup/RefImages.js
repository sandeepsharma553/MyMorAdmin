import React, { useState } from "react";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../../firebase";

/** Upload a reference image to Storage and return { url, path }. */
export async function uploadRefImage(file, folder) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const path = `${folder}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const r = storageRef(storage, path);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, path };
}

/** Read-only viewer: a strip of thumbnails with a click-to-enlarge lightbox. */
export function RefImageViewer({ images, label = "Reference photos" }) {
  const [open, setOpen] = useState(null);
  if (!images || !images.length) return null;
  return (
    <div style={{ marginTop: 12, borderTop: "0.5px solid var(--gray-light)", paddingTop: 10 }}>
      <div style={{ fontSize: 11, color: "var(--gray)", marginBottom: 6 }}>📷 {label}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {images.map((img, i) => (
          <div key={i} style={{ width: 84, cursor: "pointer" }} onClick={() => setOpen(img)} title={img.caption || ""}>
            <img src={img.url} alt={img.caption || "reference"} style={{ width: 84, height: 64, objectFit: "cover", borderRadius: 8, border: "0.5px solid var(--border)" }} />
            {img.caption && <div style={{ fontSize: 9, color: "var(--gray)", marginTop: 2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{img.caption}</div>}
          </div>
        ))}
      </div>
      {open && (
        <div className="rg-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setOpen(null)}>
          <div style={{ maxWidth: "90vw", maxHeight: "90vh", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <img src={open.url} alt={open.caption || ""} style={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 10 }} />
            {open.caption && <div style={{ color: "#fff", marginTop: 8, fontSize: 13 }}>{open.caption}</div>}
            <div style={{ marginTop: 10 }}><button className="btn" onClick={() => setOpen(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Editor: upload, caption and remove reference images. value = [{caption,url,path}]. */
export function RefImageEditor({ value = [], onChange, folder, showToast }) {
  const [busy, setBusy] = useState(false);
  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const { url, path } = await uploadRefImage(file, folder);
      onChange([...(value || []), { caption: "", url, path }]);
      showToast?.("Image uploaded");
    } catch (err) {
      showToast?.("Upload failed (check storage permissions)");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  const setCaption = (i, cap) => onChange(value.map((img, idx) => idx === i ? { ...img, caption: cap } : img));
  const remove = (i) => {
    const img = value[i];
    onChange(value.filter((_, idx) => idx !== i));
    // also delete the Storage object so removed images don't leak (best-effort)
    if (img?.path) deleteObject(storageRef(storage, img.path)).catch(() => {});
  };

  return (
    <div className="form-group">
      <label className="form-label">Reference images (optional)</label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(value || []).map((img, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <img src={img.url} alt="" style={{ width: 52, height: 40, objectFit: "cover", borderRadius: 6, border: "0.5px solid var(--border)" }} />
            <input className="form-input" style={{ flex: 1 }} value={img.caption} onChange={(e) => setCaption(i, e.target.value)} placeholder="Caption (e.g. Grill & Cooking Station)" />
            <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(i)}>✕</button>
          </div>
        ))}
        <label className="btn btn-sm" style={{ alignSelf: "flex-start", cursor: "pointer" }}>
          {busy ? "Uploading..." : "+ Add image"}
          <input type="file" accept="image/*" style={{ display: "none" }} onChange={onPick} disabled={busy} />
        </label>
      </div>
    </div>
  );
}
