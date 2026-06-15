import { Routes, Route, Navigate } from "react-router-dom";
import StaffDirectoryPage from "../pages/restaurantgroup/StaffDirectoryPage";
import ShiftPlannerPage from "../pages/restaurantgroup/ShiftPlannerPage";
import LeaveRequestsPage from "../pages/restaurantgroup/LeaveRequestsPage";
import TrainingPage from "../pages/restaurantgroup/TrainingPage";
import ChecklistsPage from "../pages/restaurantgroup/ChecklistsPage";
import TemperatureLogPage from "../pages/restaurantgroup/TemperatureLogPage";
import PerformancePage from "../pages/restaurantgroup/PerformancePage";
import UserManagementPage from "../pages/restaurantgroup/UserManagementPage";
import MessagingPage from "../pages/restaurantgroup/MessagingPage";
import CalendarPage from "../pages/restaurantgroup/CalendarPage";
import SettingsPage from "../pages/restaurantgroup/SettingsPage";
import StockPage from "../pages/restaurantgroup/StockPage";
import MenusPage from "../pages/restaurantgroup/MenusPage";
import SupplierPage from "../pages/restaurantgroup/SupplierPage";
import CompliancePage from "../pages/restaurantgroup/CompliancePage";
import ProtectedRoute from "../pages/restaurantgroup/ProtectedRoute";

const P = (moduleKey, El) => <ProtectedRoute moduleKey={moduleKey}>{El}</ProtectedRoute>;

export default function RestaurantGroupRoutes() {
  return (
    <Routes>
      <Route path="/rg/staff" element={P("staff", <StaffDirectoryPage />)} />
      <Route path="/rg/shifts" element={P("shifts", <ShiftPlannerPage />)} />
      <Route path="/rg/leave" element={P("leave", <LeaveRequestsPage />)} />
      <Route path="/rg/training" element={P("training", <TrainingPage />)} />
      <Route path="/rg/checklists" element={P("checklists", <ChecklistsPage />)} />
      <Route path="/rg/temperature" element={P("temperature", <TemperatureLogPage />)} />
      <Route path="/rg/performance" element={P("performance", <PerformancePage />)} />
      <Route path="/rg/stock" element={P("stock", <StockPage />)} />
      <Route path="/rg/menus" element={P("menus", <MenusPage />)} />
      <Route path="/rg/supplier" element={P("supplier", <SupplierPage />)} />
      <Route path="/rg/compliance" element={P("compliance", <CompliancePage />)} />
      <Route path="/rg/messages" element={P("messages", <MessagingPage />)} />
      <Route path="/rg/calendar" element={P("calendar", <CalendarPage />)} />
      <Route path="/rg/users" element={P("usermgmt", <UserManagementPage />)} />
      <Route path="/rg/settings" element={P("settings", <SettingsPage />)} />
      <Route path="*" element={<Navigate to="/rg/staff" replace />} />
    </Routes>
  );
}
