import React, { useEffect, useMemo, useState } from "react";
import { getDocs } from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useRG } from "./RGContext";
import { contractsCol } from "../../utils/restaurantGroupPaths";
import { SIGNED_UPLOAD_ENABLED } from "./rgConfig";

/* ============================================================================
   Sent Contracts board (Phase 1, Step 7) — owner/storeAdmin only.
   Lists this group's contracts (Draft → Sent → Signed) and exposes, per row:
     • Download generated PDF (renderContractPdf — live since Step 6)
     • Upload signed PDF      (uploadSignedContract — behind SIGNED_UPLOAD_ENABLED)
     • Download signed PDF    (getSignedContractUrl — behind SIGNED_UPLOAD_ENABLED)
   All I/O goes through callables; the client never touches Storage directly.
   ========================================================================== */

const fns = () => getFunctions(undefined, "us-central1");
const fmt = (ts) => {
  const s = ts && (ts.seconds || ts._seconds);
  if (!s) return "—";
  try { return new Date(s * 1000).toLocaleDateString(); } catch { return "—"; }
};
const STATUS_PILL = { draft: "pill-gray", sent: "pill-blue", signed: "pill-green" };

function downloadBlob(base64, filename) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
}

export default function SentContractsPage() {
  const { groupId, can, showToast } = useRG();
  const [contracts, setContracts] = useState(null); // null = loading
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState("");             // contractId currently working

  const load = async () => {
    try {
      const snap = await getDocs(contractsCol(groupId));
      setContracts(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch {
      setLoadErr("Could not load contracts. (Owner/Store Admin only — check the contracts rule is live.)");
      setContracts([]);
    }
  };
  useEffect(() => {
    if (groupId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const rows = useMemo(
    // Phase B: soft-deleted contracts (deleted: true) are hidden here too — the doc and
    // the locked signed PDF remain; restore lives on the staff profile's history tab.
    () => [...(contracts || [])].filter((c) => !c.deleted).sort((a, b) => ((b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))),
    [contracts]
  );

  const onDownloadGenerated = async (c) => {
    setBusy(c.id);
    try {
      const res = await httpsCallable(fns(), "renderContractPdf")({ groupId, contractId: c.id });
      downloadBlob(res.data.base64, res.data.filename || `contract_${c.id}.pdf`);
    } catch { showToast("Could not render PDF"); } finally { setBusy(""); }
  };

  const onUploadSigned = async (c, file) => {
    if (!file) return;
    if (file.type !== "application/pdf") return showToast("Please choose a PDF file");
    if (file.size > 15 * 1024 * 1024) return showToast("File too large (max 15MB)");
    setBusy(c.id);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(",")[1]); // strip data: prefix
        r.onerror = reject; r.readAsDataURL(file);
      });
      await httpsCallable(fns(), "uploadSignedContract")({ groupId, contractId: c.id, base64 });
      showToast("Signed contract uploaded");
      await load();
    } catch (e) { showToast("Could not upload signed contract"); } finally { setBusy(""); }
  };

  const onDownloadSigned = async (c) => {
    setBusy(c.id);
    try {
      // getSignedContractUrl returns base64 bytes (no signed URL — runtime SA can't signBlob)
      const res = await httpsCallable(fns(), "getSignedContractUrl")({ groupId, contractId: c.id });
      downloadBlob(res.data.base64, res.data.filename || `signed_${c.id}.pdf`);
    } catch { showToast("Could not open signed contract"); } finally { setBusy(""); }
  };

  if (!can("contracts", "view")) {
    return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>You don’t have access to Sent Contracts.</div>;
  }
  const editable = can("contracts", "edit");

  return (
    <div style={{ margin: 16 }}>
      {loadErr && <div className="card" style={{ marginBottom: 12, color: "var(--red)", fontSize: 12 }}>{loadErr}</div>}
      <div className="card">
        <div className="card-head">
          <div><span className="card-title">Sent Contracts</span><span className="card-sub">Draft → Sent → Signed</span></div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead><tr><th>Staff</th><th>Template</th><th>Status</th><th>Created</th><th>Sent</th><th>Signed</th><th style={{ textAlign: "right" }}>Actions</th></tr></thead>
            <tbody>
              {contracts === null && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>Loading…</td></tr>}
              {contracts !== null && rows.length === 0 && <tr><td colSpan={7} style={{ color: "var(--gray)" }}>No contracts yet — generate one in Contract Generator.</td></tr>}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.staffName || c.staffId}</td>
                  <td style={{ fontSize: 12, color: "var(--gray)" }}>{c.source === "external" ? `external upload${c.fileName ? ` · ${c.fileName}` : ""}` : c.templateId}</td>
                  <td><span className={`pill ${STATUS_PILL[c.status] || "pill-gray"}`}>{c.status || "draft"}</span></td>
                  <td style={{ fontSize: 11 }}>{fmt(c.createdAt)}</td>
                  <td style={{ fontSize: 11 }}>{fmt(c.sentAt)}</td>
                  <td style={{ fontSize: 11 }}>{fmt(c.signedAt)}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {/* renderContractPdf THROWS on a template-less doc ("Contract template
                        missing") — external uploads have no generated PDF to download */}
                    {c.source !== "external" && (
                      <button className="btn btn-sm" disabled={busy === c.id} onClick={() => onDownloadGenerated(c)}>Download PDF</button>
                    )}
                    {editable && SIGNED_UPLOAD_ENABLED && c.status !== "signed" && (
                      <label className="btn btn-sm btn-primary" style={{ marginLeft: 6, cursor: "pointer" }}>
                        Upload signed
                        <input type="file" accept="application/pdf" style={{ display: "none" }}
                          onChange={(e) => onUploadSigned(c, e.target.files?.[0])} />
                      </label>
                    )}
                    {editable && SIGNED_UPLOAD_ENABLED && c.status === "signed" && (
                      <button className="btn btn-sm" style={{ marginLeft: 6 }} disabled={busy === c.id} onClick={() => onDownloadSigned(c)}>Download signed</button>
                    )}
                    {!SIGNED_UPLOAD_ENABLED && (
                      <span className="pill pill-gray" style={{ marginLeft: 6 }} title="Enabled after the Storage rule + callables are live">signed upload locked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
