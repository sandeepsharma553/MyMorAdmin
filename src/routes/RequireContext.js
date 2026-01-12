import React, { useEffect } from "react";
import { useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";

export default function RequireContext({ org, children }) {
  const navigate = useNavigate();

  const type = useSelector((s) => s.auth.type);
  const employee = useSelector((s) => s.auth.employee);
  const activeOrg = useSelector((s) => s.auth.activeOrg);

  useEffect(() => {
    if (type === "superadmin") return;

    if (type === "admin") {
      const hasHostel = !!employee?.hostelid;
      const hasUniclub = !!employee?.uniclubid;

      // both but not selected => choose
      if (hasHostel && hasUniclub && !activeOrg) {
        navigate("/choose", { replace: true });
        return;
      }

      // enforce org
      if (org === "hostel" && activeOrg !== "hostel") {
        navigate("/choose", { replace: true });
        return;
      }
      if (org === "uniclub" && activeOrg !== "uniclub") {
        navigate("/choose", { replace: true });
        return;
      }
    }
  }, [type, employee, activeOrg, org, navigate]);

  return children;
}
