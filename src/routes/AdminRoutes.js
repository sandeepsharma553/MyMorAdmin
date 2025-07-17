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
          <Route path="/faq" element={<FaqPage />} />
    </Routes>
  );
}
