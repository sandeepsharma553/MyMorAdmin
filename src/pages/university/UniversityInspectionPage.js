import React from "react";
import { useUniversityScope } from "../../hooks/useUniversityScope";
import InspectionPage from "../admin/InspectionPage";
import UniversityScopeBanner from "../../components/UniversityScopeBanner";

export default function UniversityInspectionPage({ navbarHeight }) {
  const { universityId } = useUniversityScope();
  return (
    <InspectionPage
      navbarHeight={navbarHeight}
      orgPath={universityId ? `university/${universityId}` : ""}
      banner={<UniversityScopeBanner />}
      emptyMessage="No university assigned."
    />
  );
}
