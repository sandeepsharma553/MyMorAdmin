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
import UniclubMembersPage from "../pages/uniclub/UniclubMembersPage";
import UniclubEventBookingPage from "../pages/uniclub/UniclubEventBooking";
import UniclubEventPage from "../pages/uniclub/UniclubEvent";
import UniclubAnnouncementPage from "../pages/uniclub/UniclubAnnouncement";
import UniclubCommunity from "../pages/uniclub/UniclubCommunity";
import UniclubSubgroup from "../pages/uniclub/UniclubSubgroup";
import SubgroupEventBooking from "../pages/uniclub/SubgroupEventBooking";
import SubgroupAnnouncement from "../pages/uniclub/SubgroupAnnouncement";
import SubgroupEvent from "../pages/uniclub/SubgroupEvent";
import ContactPage from "../pages/ContactPage";
import UniclubDashboardPage from "../pages/uniclub/UniclubDashboardPage";
import BusinessesPage from "../pages/business/BusinessProfilePage";
import RestaurantPage from "../pages/business/RestaurantPage";
import RestaurantOrdersPage from "../pages/business/RestaurantOrdersPage";
import RestaurantReservationsPage from "../pages/business/RestaurantReservationsPage";
import RestaurantReviewsPage from "../pages/business/RestaurantReviewsPage";
import RestaurantAnalyticsPage from "../pages/business/RestaurantAnalyticsPage";
import RestaurantInventoryPage from "../pages/business/RestaurantInventoryPage";
import BusinessDashboard from "../pages/business/BusinessDashboardPage";
import ProductPage from "../pages/business/ProductPage";
import ServicePage from "../pages/business/ServicePage";
import ManageRestaurantPage from '../pages/business/ManageRestaurantPage'
import RestaurantQrTablesPage from "../pages/business/RestaurantQrTablesPage";
import RestaurantMenuPage from "../pages/business/RestaurantMenuPage";
import RestaurantDealsPage from "../pages/business/RestaurantDealsPage";
import BusinessEmployeePage from "../pages/business/BusinessEmployeePage";
import ProductOrderPage from "../pages/business/ProductOrderPage";
import ServiceBookingPage from "../pages/business/ServiceBookingPage";
import UniversityDashboardPage from "../pages/university/UniversityDashboardPage";
import UniversityAnnouncementPage from "../pages/university/UniversityAnnouncementPage";
import UniversityEventPage from "../pages/university/UniversityEventPage";
import UniversityResourcesPage from "../pages/university/UniversityResourcesPage";
import UniversityRoomBookingPage from "../pages/university/UniversityRoomBookingPage";
import UniversityEmployeeAdminPage from "../pages/university/UniversityEmployeeAdminPage";
import UniversityStudentPage from "../pages/university/UniversityStudentPage";
import UniversityDiningMenuPage from "../pages/university/UniversityDiningMenuPage";
import UniversityCleaningSchedulePage from "../pages/university/UniversityCleaningSchedulePage";
import UniversityTutorialSchedulePage from "../pages/university/UniversityTutorialSchedulePage";
import UniversityAssessmentsPage from "../pages/university/UniversityAssessmentsPage";
import UniversityMaintenancePage from "../pages/university/UniversityMaintenancePage";
import UniversityAcademicGroupPage from "../pages/university/UniversityAcademicGroupPage";
import UniversityReportIncidentPage from "../pages/university/UniversityReportIncidentPage";
import UniversityFeedbackPage from "../pages/university/UniversityFeedbackPage";
import UniversityEventBookingPage from "../pages/university/UniversityEventBookingPage";
import UniversityDealPage from "../pages/university/UniversityDealPage";
import UniversityFaqPage from "../pages/university/UniversityFaqPage";
import UniversityChecklistPage from "../pages/university/UniversityChecklistPage";
import UniversityRoomInfoPage from "../pages/university/UniversityRoomInfoPage";
import UniversityParcelPage from "../pages/university/UniversityParcelPage";
import UniversityWellnessPromptsPage from "../pages/university/UniversityWellnessPromptsPage";
import UniversityMessagesPage from "../pages/university/UniversityMessagesPage";
import ChecklistPage from "../pages/admin/ChecklistPage";
import RoomInfoPage from "../pages/admin/RoomInfoPage";
import ParcelPage from "../pages/admin/ParcelPage";
import WellnessPromptsPage from "../pages/admin/WellnessPromptsPage";
import MessagesPage from "../pages/admin/MessagesPage";
import UniversitySettingPage from "../pages/university/UniversitySettingPage";

export default function AdminRoutes({ route }) {

  return (

    <Routes>
      {/* <Route path="dashboard" element={<HomePage />} /> */}
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/uniclubdashboard" element={<UniclubDashboardPage />} />
      <Route path="/businessdashboard" element={<BusinessDashboard />} />
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
      <Route path="/uniclubmember" element={<UniclubMembersPage />} />
      <Route path="/uniclubevent" element={<UniclubEventPage />} />
      <Route path="/uniclubeventbooking" element={<UniclubEventBookingPage />} />
      <Route path="/uniclubannouncement" element={<UniclubAnnouncementPage />} />
      <Route path="/uniclubcommunity" element={<UniclubCommunity />} />
      <Route path="/uniclubsubgroup" element={<UniclubSubgroup />} />
      <Route path="/subgroupevent" element={<SubgroupEvent />} />
      <Route path="/subgroupeventbooking" element={<SubgroupEventBooking />} />
      <Route path="/subgroupannouncement" element={<SubgroupAnnouncement />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/business" element={<BusinessesPage />} />
      <Route path="/restaurant" element={<RestaurantPage />} />
      <Route path="/orders" element={<RestaurantOrdersPage />} />
      <Route path="/reservations" element={<RestaurantReservationsPage />} />
      <Route path="/reviews" element={<RestaurantReviewsPage />} />
      <Route path="/analytics" element={<RestaurantAnalyticsPage />} />
      <Route path="/inventory" element={<RestaurantInventoryPage />} />
      <Route path="/product" element={<ProductPage />} />
      <Route path="/service" element={<ServicePage />} />
      <Route path="/managerestaurant" element={<ManageRestaurantPage />} />
      <Route path="/qr" element={<RestaurantQrTablesPage />} />
      <Route path="/menu" element={<RestaurantMenuPage />} />
      <Route path="/deals" element={<RestaurantDealsPage />} />
      <Route path="/businessemp" element={<BusinessEmployeePage />} />
      <Route path="/productorder" element={<ProductOrderPage />} />
      <Route path="/servicebooking" element={<ServiceBookingPage />} />

      {/* ── University routes ── */}
      <Route path="/universitydashboard" element={<UniversityDashboardPage />} />
      <Route path="/universityannouncement" element={<UniversityAnnouncementPage />} />
      <Route path="/universityevent" element={<UniversityEventPage />} />
      <Route path="/universityresources" element={<UniversityResourcesPage />} />
      <Route path="/universityroombooking" element={<UniversityRoomBookingPage />} />
      <Route path="/universityemployee" element={<UniversityEmployeeAdminPage />} />
      <Route path="/universitystudent" element={<UniversityStudentPage />} />
      <Route path="/universitydiningmenu" element={<UniversityDiningMenuPage />} />
      <Route path="/universitycleaningschedule" element={<UniversityCleaningSchedulePage />} />
      <Route path="/universitytutorialschedule" element={<UniversityTutorialSchedulePage />} />
      <Route path="/universityassessments" element={<UniversityAssessmentsPage />} />
      <Route path="/universitymaintenance" element={<UniversityMaintenancePage />} />
      <Route path="/universityacademicgroup" element={<UniversityAcademicGroupPage />} />
      <Route path="/universityreportincident" element={<UniversityReportIncidentPage />} />
      <Route path="/universityfeedback" element={<UniversityFeedbackPage />} />
      <Route path="/universityeventbooking" element={<UniversityEventBookingPage />} />
      <Route path="/universitydeal" element={<UniversityDealPage />} />
      <Route path="/universityfaq" element={<UniversityFaqPage />} />
      <Route path="/universitychecklist" element={<UniversityChecklistPage />} />
      <Route path="/universityroominfo" element={<UniversityRoomInfoPage />} />
      <Route path="/universityparcels" element={<UniversityParcelPage />} />
      <Route path="/universitywellnessprompts" element={<UniversityWellnessPromptsPage />} />
      <Route path="/universitymessages" element={<UniversityMessagesPage />} />
      <Route path="/universitysetting" element={<UniversitySettingPage />} />

      {/* ── Phase 1 new routes ── */}
      <Route path="/checklist" element={<ChecklistPage />} />
      <Route path="/roominfo" element={<RoomInfoPage />} />
      <Route path="/parcels" element={<ParcelPage />} />
      <Route path="/wellnessprompts" element={<WellnessPromptsPage />} />
      <Route path="/messages" element={<MessagesPage />} />
    </Routes>
  );
}
