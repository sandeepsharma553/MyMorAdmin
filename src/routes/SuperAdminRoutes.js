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
import UniclubPage from "../pages/superadmin/UniclubPage";
import PoiPage from "../pages/superadmin/PoiPage";
import ContactPage from "../pages/ContactPage";
import BusinessesPage from "../pages/superadmin/BusinessesPage";
import DealPage from "../pages/business/DealPage";
import RestaurantPage from "../pages/business/RestaurantPage";
import RestaurantOrdersPage from "../pages/business/RestaurantOrdersPage";
import RestaurantReservationsPage from "../pages/business/RestaurantReservationsPage";
import RestaurantReviewsPage from "../pages/business/RestaurantReviewsPage";
import RestaurantAnalyticsPage from "../pages/business/RestaurantAnalyticsPage";
import RestaurantInventoryPage from "../pages/business/RestaurantInventoryPage";
export default function SuperAdminRoutes() {
  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/employee" element={<AdminEmployeePage />} />
      <Route path="/uniclubemp" element={<UniclubEmployeePage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      <Route path="/university" element={<UniversityPage />} />
      <Route path="/hostel" element={<HostelPage />} />
      <Route path="/changepassword" element={<ChangePasswordPage />} />
      <Route path="/event" element={<EventPage />} />
      <Route path="/eventbooking" element={<EventBookingPage />} />
      <Route path="/deal" element={<DealPage />} />
      <Route path="/business" element={<BusinessesPage />} />
      <Route path="/setting" element={<SettingPage />} />
      <Route path="/uniclub" element={<UniclubPage />} />
      <Route path="/poi" element={<PoiPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/restaurant" element={<RestaurantPage />} />
      <Route path="/restaurants/:id/orders" element={<RestaurantOrdersPage />} />
      <Route path="/restaurants/:id/reservations" element={<RestaurantReservationsPage />} />
      <Route path="/restaurants/:id/reviews" element={<RestaurantReviewsPage />} />
      <Route path="/restaurants/:id/analytics" element={<RestaurantAnalyticsPage />} />
      <Route path="/restaurants/:id/inventory" element={<RestaurantInventoryPage />} />
      {/* <Route path="colleges" element={<Colleges />} /> */}
    </Routes>
  );
}