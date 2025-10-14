import { Routes, Route, Navigate } from "react-router-dom";
import DashboardPage from "../pages/admin/DashboardPage";
import DiningMenuPage from "../pages/admin/DiningMenuPage";
import CleaningSchedulePage from "../pages/admin/CleaningSchedulePage";
import TutorialSchedulePage from "../pages/admin/TutorialSchedulePage";
import MaintenancePage from "../pages/admin/MaintenancePage";
import BookingPage from "../pages/admin/BookingPage";
import AcademicGroupPage from "../pages/admin/AcademicGroupPage";
import AnnouncementPage from "../pages/admin/AnnouncementPage";
import ReportIncidentPage from "../pages/admin/ReportIncidentPage";
import EventPage from "../pages/admin/EventPage";
import EventBookingPage from "../pages/admin/EventBookingPage";
import DealPage from "../pages/admin/DealPage";
import AccountDeletionPage from "../pages/admin/AccountDeletionPage";
import EmployeePage from "../pages/admin/EmployeePage";
import ChangePasswordPage from "../pages/admin/ChangePasswordPage";
import ResourcesPage from "../pages/admin/ResourcesPage";
import SettingPage from "../pages/admin/SettingPage";
import FeedbackPage from "../pages/admin/FeedbackPage";
import StudentPage from "../pages/admin/StudentPage";
import FaqPage from "../pages/admin/FaqPage";
import MaintenanceCategoryPage from "../pages/admin/MaintenanceCategoryPage";
import ReportSettingPage from "../pages/admin/ReportSettingPage";
import UniclubPage from "../pages/uniclub/UniclubPage";
import UniclubStudentPage from "../pages/uniclub/UniclubStudentPage";
import UniclubEventBookingPage from "../pages/uniclub/UniclubEventBooking";
import UniclubEventPage from "../pages/uniclub/UniclubEvent";
import UniclubAnnouncementPage from "../pages/uniclub/UniclubAnnouncement";
import UniclubSubgroup from "../pages/uniclub/UniclubSubgroup";
import SubgroupEventBooking from "../pages/uniclub/SubgroupEventBooking";
import SubgroupAnnouncement from "../pages/uniclub/SubgroupAnnouncement";
import SubgroupEvent from "../pages/uniclub/SubgroupEvent";

export default function AdminRoutes({ route }) {

  return (

    <Routes>
      {/* <Route path="dashboard" element={<HomePage />} /> */}
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/diningmenu" element={<DiningMenuPage />} />
      <Route path="/cleaningschedule" element={<CleaningSchedulePage />} />
      <Route path="/tutorialSchedule" element={<TutorialSchedulePage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/bookingroom" element={<BookingPage />} />
      <Route path="/academicgroup" element={<AcademicGroupPage />} />
      <Route path="/announcement" element={<AnnouncementPage />} />
      <Route path="/reportincident" element={<ReportIncidentPage />} />
      <Route path="/event" element={<EventPage />} />
      <Route path="/eventbooking" element={<EventBookingPage />} />
      <Route path="/deal" element={<DealPage />} />
      <Route path="/requestdelete" element={<AccountDeletionPage />} />
      <Route path="/employee" element={<EmployeePage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      <Route path="/resources" element={<ResourcesPage />} />
      <Route path="/setting" element={<SettingPage />} />
      <Route path="/feedback" element={<FeedbackPage />} />
      <Route path="/student" element={<StudentPage />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/maintenancesetting" element={<MaintenanceCategoryPage />} />
      <Route path="/reportsetting" element={<ReportSettingPage />} />
      <Route path="/uniclub" element={<UniclubPage />} />
      <Route path="/uniclubstudent" element={<UniclubStudentPage />} />
      <Route path="/uniclubevent" element={<UniclubEventPage />} />
      <Route path="/uniclubeventbooking" element={<UniclubEventBookingPage />} />
      <Route path="/uniclubannouncement" element={<UniclubAnnouncementPage />} />
      <Route path="/uniclubsubgroup" element={<UniclubSubgroup />} />
      <Route path="/subgroupevent" element={<SubgroupEvent />} />
      <Route path="/subgroupeventbooking" element={<SubgroupEventBooking />} />
      <Route path="/subgroupannouncement" element={<SubgroupAnnouncement />} />
    </Routes>
  );
}
