import { Routes, Route } from "react-router-dom";
import Dashboard from "../pages/superadmin/SuperDashboard";
import UniversityPage from "../pages/superadmin/UniversityPage";
import HostelPage from "../pages/superadmin/HostelPage";
import AdminEmployeePage from "../pages/superadmin/AdminEmployeePage";
import EventPage from "../pages/superadmin/EventPage";
import EventBookingPage from "../pages/superadmin/EventBookingPage";
import SettingPage from "../pages/superadmin/SettingPage";
import ChangePasswordPage from "../pages/admin/ChangePasswordPage";
import UniclubEmployeePage from "../pages/superadmin/UniclubEmployeePage";

export default function SuperAdminRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/employee" element={<AdminEmployeePage />} />
      <Route path="/uniclub" element={<UniclubEmployeePage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      <Route path="/university" element={<UniversityPage />} />
      <Route path="/hostel" element={<HostelPage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      <Route path="/event" element={<EventPage />} />
      <Route path="/eventbooking" element={<EventBookingPage />} />
      <Route path="/setting" element={<SettingPage />} />
      {/* <Route path="colleges" element={<Colleges />} /> */}
    </Routes>
  );
}