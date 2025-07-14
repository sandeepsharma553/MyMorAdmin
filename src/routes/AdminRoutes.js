import { Routes, Route, Navigate } from "react-router-dom";
import DashboardPage from "../auth/pages/admin/DashboardPage";
import DiningMenuPage from "../auth/pages/admin/DiningMenuPage";
import CleaningSchedulePage from "../auth/pages/admin/CleaningSchedulePage";
import MaintenancePage from "../auth/pages/admin/MaintenancePage";
import BookingPage from "../auth/pages/admin/BookingPage";
import AcademicGroupPage from "../auth/pages/admin/AcademicGroupPage";
import AnnouncementPage from "../auth/pages/admin/AnnouncementPage";
import ReportIncidentPage from "../auth/pages/admin/ReportIncidentPage";
import EventPage from "../auth/pages/admin/EventPage";
import DealPage from "../auth/pages/admin/DealPage";
import AccountDeletionPage from "../auth/pages/admin/AccountDeletionPage";
import EmployeePage from "../auth/pages/admin/EmployeePage";
import ChangePasswordPage from "../auth/pages/admin/ChangePasswordPage";
import ResourcesPage from "../auth/pages/admin/ResourcesPage";
import SettingPage from "../auth/pages/admin/SettingPage";
import FeedbackPage from "../auth/pages/admin/FeedbackPage";
import StudentPage from "../auth/pages/admin/StudentPage";

export default function AdminRoutes({ route }) {

  return (

    <Routes>
       {/* <Route path="dashboard" element={<HomePage />} /> */}
         <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/diningmenupage" element={<DiningMenuPage />} />
          <Route path="/cleaningpage" element={<CleaningSchedulePage />} />
          <Route path="/maintenancepage" element={<MaintenancePage />} />
          <Route path="/bookingpage" element={<BookingPage />} />
          <Route path="/academicpage" element={<AcademicGroupPage />} />
          <Route path="/announcement" element={<AnnouncementPage />} />
          <Route path="/reportpage" element={<ReportIncidentPage />} />
          <Route path="/eventpage" element={<EventPage />} />
          <Route path="/dealpage" element={<DealPage />} />
          <Route path="/requestdelete" element={<AccountDeletionPage />} />
          <Route path="/employee" element={<EmployeePage />} />
          <Route path="/changepassword" element={<ChangePasswordPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/setting" element={<SettingPage />} />
          <Route path="/feedback" element={<FeedbackPage />} />
          <Route path="/student" element={<StudentPage />} />
    </Routes>
  );
}
