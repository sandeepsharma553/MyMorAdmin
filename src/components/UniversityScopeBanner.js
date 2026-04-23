import React from "react";
import { useUniversityScope } from "../hooks/useUniversityScope";

/**
 * Sticky banner shown at the top of every university admin page.
 * Tells the admin exactly which campus + discipline they are scoped to,
 * so it's always obvious what content they're seeing and posting to.
 *
 * Hidden when the university module is off (no campusId on the employee).
 */
export default function UniversityScopeBanner() {
  const { hasCampusScope, campusName, disciplineName } = useUniversityScope();

  if (!hasCampusScope) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 mb-4 rounded-lg bg-purple-50 border border-purple-200 text-sm">
      <span className="text-purple-500 text-base">🏛</span>
      <span className="text-purple-700 font-medium">Scope:</span>
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
        {campusName || "All campuses"}
      </span>
      {disciplineName && (
        <>
          <span className="text-purple-300">›</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800">
            {disciplineName}
          </span>
        </>
      )}
      <span className="ml-auto text-xs text-purple-400">
        You can only view and post content for this scope.
      </span>
    </div>
  );
}
