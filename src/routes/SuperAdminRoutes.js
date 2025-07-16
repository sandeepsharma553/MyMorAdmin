import { Routes, Route } from "react-router-dom";
import Dashboard from "../pages/superadmin/SuperDashboard";
import UniversityPage from "../pages/superadmin/UniversityPage";
import HostelPage from "../pages/superadmin/HostelPage";
import AdminEmployeePage from "../pages/superadmin/AdminEmployeePage";
import ChangePasswordPage from "../pages/admin/ChangePasswordPage";

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