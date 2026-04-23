import { useMemo } from "react";
import { useSelector } from "react-redux";

/**
 * Provides the campus + discipline scope for the currently logged-in
 * university admin. All university content pages use this to:
 *   1. Know which campusId / disciplineId to tag new content with
 *   2. Filter loaded content so admins only see their scope
 *
 * Backward-compat rule: documents without campusId/disciplineId (created
 * before the University Module was enabled) are visible to all admins of
 * that university, so no existing content is accidentally hidden.
 */
export function useUniversityScope() {
  const user = useSelector((s) => s.auth.user);
  const emp  = useSelector((s) => s.auth.employee);

  const universityId = String(
    emp?.universityid || emp?.universityId || emp?.university ||
    user?.universityid || ""
  );

  const campusId     = String(emp?.campusId     || "");
  const campusName   = String(emp?.campusName   || "");
  const disciplineId = String(emp?.disciplineId || "");
  const disciplineName = String(emp?.disciplineName || "");

  // True when this admin is scoped to a campus (university module is active)
  const hasCampusScope = !!campusId;

  /**
   * Pass your loaded list through this before rendering.
   * Items with no campusId are treated as "university-wide" legacy content
   * and shown to every admin — prevents old posts from disappearing.
   */
  const filterByScope = useMemo(() => {
    return (items = []) => {
      if (!hasCampusScope) return items;
      return items.filter((item) => {
        // Legacy item (no campus tag) — visible to all
        if (!item.campusId) return true;
        // Campus mismatch — hide
        if (item.campusId !== campusId) return false;
        // Campus matches; check discipline only when both sides have one
        if (disciplineId && item.disciplineId && item.disciplineId !== disciplineId) return false;
        return true;
      });
    };
  }, [hasCampusScope, campusId, disciplineId]);

  /**
   * Spread this into every write payload so content is properly tagged.
   * { campusId, campusName, disciplineId, disciplineName }
   */
  const scopePayload = useMemo(() => ({
    campusId,
    campusName,
    disciplineId,
    disciplineName,
  }), [campusId, campusName, disciplineId, disciplineName]);

  return {
    universityId,
    campusId,
    campusName,
    disciplineId,
    disciplineName,
    hasCampusScope,
    filterByScope,
    scopePayload,
  };
}
