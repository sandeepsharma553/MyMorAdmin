import { Routes, Route } from "react-router-dom";
import Dashboard from "../auth/pages/superadmin/SuperDashboard";
import UniversityPage from "../auth/pages/superadmin/UniversityPage";
import HostelPage from "../auth/pages/superadmin/HostelPage";
import AdminEmployeePage from "../auth/pages/superadmin/AdminEmployeePage";
import ChangePasswordPage from "../auth/pages/admin/ChangePasswordPage";

export default function SuperAdminRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/employee" element={<AdminEmployeePage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      <Route path="/university" element={<UniversityPage />} />
      <Route path="/hostel" element={<HostelPage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      {/* <Route path="colleges" element={<Colleges />} /> */}
    </Routes>
  );
}