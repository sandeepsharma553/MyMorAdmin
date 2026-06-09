import React from "react";
import { Navigate } from "react-router-dom";
import { useRG } from "./RGContext";
import { RG_MODULES } from "./rgConfig";

/**
 * Route-level permission guard. Renders children only if the user has the required
 * level on `moduleKey`. Otherwise redirects to the first section they CAN view
 * (prevents redirect loops when they lack `staff` access), or shows a no-access card.
 */
export default function ProtectedRoute({ moduleKey, level = "view", children }) {
  const { can } = useRG();
  if (can(moduleKey, level)) return children;
  const fallback = RG_MODULES.find((m) => can(m.key, "view"));
  if (fallback && fallback.key !== moduleKey) return <Navigate to={fallback.path} replace />;
  return <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>You don’t have access to this section. Ask an admin if you need it.</div>;
}
