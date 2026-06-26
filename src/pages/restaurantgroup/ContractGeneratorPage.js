import React from "react";
import { useRG } from "./RGContext";

// Phase 1 — Step 1 stub. Real generator UI lands in Step 4.
// Route is already guarded by ProtectedRoute("contracts"); this page also
// re-checks so a direct render can never leak the section.
export default function ContractGeneratorPage() {
  const { can } = useRG();
  if (!can("contracts", "view")) {
    return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>
      You don’t have access to Contract Generator.
    </div>;
  }
  return (
    <div className="card" style={{ margin: 24 }}>
      <div className="card-head">
        <div>
          <span className="card-title">Contract Generator</span>
          <span className="card-sub">Coming soon — staff picker, template auto-select, live preview & send</span>
        </div>
      </div>
      <div style={{ padding: "16px 4px", fontSize: 13, color: "var(--gray)" }}>
        This module is being built. Owner / Store Admin only.
      </div>
    </div>
  );
}
