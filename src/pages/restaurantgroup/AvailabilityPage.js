import React from "react";
import { useRG } from "./RGContext";
import AvailabilityEditor from "./AvailabilityEditor";

/* Staff-SELF availability (web). The editor itself lives in AvailabilityEditor.js
 * (extracted Jul 2026 so the Shift Planner's amend modal reuses ONE editor — do not
 * re-inline or duplicate it here). Identity on THIS page is ALWAYS the logged-in user's
 * own staff doc (myStaff); the planner passes a target staffer instead. The Friday lock
 * and the availabilityWindow/isDayLocked twins live with the editor. */
export default function AvailabilityPage() {
  const { myStaff } = useRG();

  // unlinked login (no staff doc via adminUid/email) → no poster, no crash
  if (!myStaff) {
    return (
      <div className="card" style={{ margin: 24, color: "var(--gray)", fontSize: 14 }}>
        Your account isn't linked to a staff profile — ask an admin.
      </div>
    );
  }

  return <AvailabilityEditor staff={myStaff} />;
}
