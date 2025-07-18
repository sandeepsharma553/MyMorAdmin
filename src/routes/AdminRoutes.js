import { Routes, Route, Navigate } from "react-router-dom";
import DashboardPage from "../pages/admin/DashboardPage";
import DiningMenuPage from "../pages/admin/DiningMenuPage";
import CleaningSchedulePage from "../pages/admin/CleaningSchedulePage";
import MaintenancePage from "../pages/admin/MaintenancePage";
import BookingPage from "../pages/admin/BookingPage";
import AcademicGroupPage from "../pages/admin/AcademicGroupPage";
import AnnouncementPage from "../pages/admin/AnnouncementPage";
import ReportIncidentPage from "../pages/admin/ReportIncidentPage";
import EventPage from "../pages/admin/EventPage";
import DealPage from "../pages/admin/DealPage";
import AccountDeletionPage from "../pages/admin/AccountDeletionPage";
import EmployeePage from "../pages/admin/EmployeePage";
import ChangePasswordPage from "../pages/admin/ChangePasswordPage";
import ResourcesPage from "../pages/admin/ResourcesPage";
import SettingPage from "../pages/admin/SettingPage";
import FeedbackPage from "../pages/admin/FeedbackPage";
import StudentPage from "../pages/admin/StudentPage";
import FaqPage from "../pages/admin/FaqPage";

export default function AdminRoutes({ route }) {

  return (

    <Routes>
       {/* <Route path="dashboard" element={<HomePage />} /> */}
         <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/diningmenu" element={<DiningMenuPage />} />
          <Route path="/cleaningschedule" element={<CleaningSchedulePage />} />
          <Route path="/maintenance" element={<MaintenancePage />} />
          <Route path="/bookingroom" element={<BookingPage />} />
          <Route path="/academicgroup" element={<AcademicGroupPage />} />
          <Route path="/announcement" element={<AnnouncementPage />} />
          <Route path="/reportincident" element={<ReportIncidentPage />} />
          <Route path="/event" element={<EventPage />} />
          <Route path="/deal" element={<DealPage />} />
          <Route path="/requestdelete" element={<AccountDeletionPage />} />
          <Route path="/employee" element={<EmployeePage />} />
          <Route path="/changepassword" element={<ChangePasswordPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/setting" element={<SettingPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/student" element={<StudentPage />} />
          <Route path="/faq" element={<FaqPage />} />
    </Routes>
  );
}
