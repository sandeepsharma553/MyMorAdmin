import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getAuth, verifyPasswordResetCode, confirmPasswordReset } from "firebase/auth";

// Branded password-reset handler (public route — no login). The sendBrandedPasswordReset
// Cloud Function emails a link to /reset-password?oobCode=… — this page verifies the code
// up front (expired/used links fail before the user types anything) and applies the new
// password via the Firebase client SDK.
const BRAND = "#C0392B";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const oobCode = params.get("oobCode") || "";
  const [phase, setPhase] = useState("verifying"); // verifying | ready | saving | done | invalid
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!oobCode) { setPhase("invalid"); return; }
    verifyPasswordResetCode(getAuth(), oobCode)
      .then((em) => { setEmail(em); setPhase("ready"); })
      .catch(() => setPhase("invalid"));
  }, [oobCode]);

  const submit = async () => {
    setError("");
    if (pwd.length < 6) return setError("Password must be at least 6 characters.");
    if (pwd !== pwd2) return setError("Passwords don't match.");
    setPhase("saving");
    try {
      await confirmPasswordReset(getAuth(), oobCode, pwd);
      setPhase("done");
    } catch (e) {
      const code = String(e?.code || "");
      if (code.includes("expired") || code.includes("invalid-action-code")) return setPhase("invalid");
      setError(code.includes("weak-password") ? "That password is too weak." : "Could not reset the password. Please try again.");
      setPhase("ready");
    }
  };

  const S = {
    wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6", padding: 16, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" },
    card: { width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,0.06)" },
    brand: { fontSize: 24, fontWeight: 800, color: BRAND, marginBottom: 20 },
    h1: { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 4px" },
    sub: { fontSize: 14, color: "#6b7280", margin: "0 0 20px" },
    lbl: { display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 },
    input: { width: "100%", boxSizing: "border-box", border: "1px solid #d1d5db", borderRadius: 10, padding: "10px 12px", fontSize: 14, marginBottom: 14, outline: "none" },
    err: { fontSize: 13, color: "#dc2626", margin: "0 0 12px" },
    btn: { width: "100%", background: BRAND, color: "#fff", border: 0, borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 700, cursor: "pointer" },
    muted: { fontSize: 14, color: "#6b7280", lineHeight: 1.6 },
    link: { color: BRAND, fontWeight: 600, textDecoration: "underline" },
  };

  return (
    <div style={S.wrap}>
      <div style={S.card}>
        <div style={S.brand}>MyMor</div>

        {phase === "verifying" && <p style={S.muted}>Checking your reset link…</p>}

        {phase === "invalid" && (
          <>
            <h1 style={S.h1}>This link is no longer valid</h1>
            <p style={S.muted}>
              The reset link has expired or was already used. Ask for a new one from the
              login screen, or contact your manager.
            </p>
            <p style={{ marginTop: 20 }}><a href="/" style={S.link}>Go to login</a></p>
          </>
        )}

        {(phase === "ready" || phase === "saving") && (
          <>
            <h1 style={S.h1}>Reset your password</h1>
            <p style={S.sub}>for <strong>{email}</strong></p>
            <label style={S.lbl}>New password</label>
            <input style={S.input} type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="min 6 characters" autoComplete="new-password" />
            <label style={S.lbl}>Confirm new password</label>
            <input style={S.input} type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} autoComplete="new-password" />
            {error ? <p style={S.err}>{error}</p> : null}
            <button style={{ ...S.btn, opacity: phase === "saving" || !pwd || !pwd2 ? 0.6 : 1 }} disabled={phase === "saving" || !pwd || !pwd2} onClick={submit}>
              {phase === "saving" ? "Saving…" : "Save new password"}
            </button>
          </>
        )}

        {phase === "done" && (
          <>
            <h1 style={S.h1}>Password changed ✓</h1>
            <p style={S.muted}>Your password has been updated. Log in with your new password.</p>
            <p style={{ marginTop: 20 }}>
              <a href="/" style={{ ...S.btn, display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}>Go to login</a>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
