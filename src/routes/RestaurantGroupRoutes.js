import { Routes, Route, Navigate } from "react-router-dom";
import StaffDirectoryPage from "../pages/restaurantgroup/StaffDirectoryPage";
import ShiftPlannerPage from "../pages/restaurantgroup/ShiftPlannerPage";
import LeaveRequestsPage from "../pages/restaurantgroup/LeaveRequestsPage";
import AvailabilityPage from "../pages/restaurantgroup/AvailabilityPage";
import TrainingPage from "../pages/restaurantgroup/TrainingPage";
import ChecklistsPage from "../pages/restaurantgroup/ChecklistsPage";
import TemperatureLogPage from "../pages/restaurantgroup/TemperatureLogPage";
import PerformancePage from "../pages/restaurantgroup/PerformancePage";
import ReportsPage from "../pages/restaurantgroup/ReportsPage";
import UserManagementPage from "../pages/restaurantgroup/UserManagementPage";
import MessagingPage from "../pages/restaurantgroup/MessagingPage";
import CalendarPage from "../pages/restaurantgroup/CalendarPage";
import SettingsPage from "../pages/restaurantgroup/SettingsPage";
import StockPage from "../pages/restaurantgroup/StockPage";
import MenusPage from "../pages/restaurantgroup/MenusPage";
import PosPage from "../pages/restaurantgroup/PosPage";
import SupplierPage from "../pages/restaurantgroup/SupplierPage";
import CompliancePage from "../pages/restaurantgroup/CompliancePage";
import ContractGeneratorPage from "../pages/restaurantgroup/ContractGeneratorPage";
import SentContractsPage from "../pages/restaurantgroup/SentContractsPage";
import ContractTemplatesPage from "../pages/restaurantgroup/ContractTemplatesPage";
import ProtectedRoute from "../pages/restaurantgroup/ProtectedRoute";

const P = (moduleKey, El, level) => <ProtectedRoute moduleKey={moduleKey} level={level}>{El}</ProtectedRoute>;

export default function RestaurantGroupRoutes() {
  return (
    <Routes>
      {/* staff needs only "self" (Phase 5a): a self-tier user reaches the page but sees
          ONLY their own read-only profile — the page itself scopes on can("staff","view"). */}
      <Route path="/rg/staff" element={P("staff", <StaffDirectoryPage />, "self")} />
      <Route path="/rg/shifts" element={P("shifts", <ShiftPlannerPage />)} />
      <Route path="/rg/leave" element={P("leave", <LeaveRequestsPage />)} />
      {/* staff-SELF availability posting + manager-proposal accept/decline (fills the RG_MODULES slot) */}
      <Route path="/rg/availability" element={P("availability", <AvailabilityPage />)} />
      <Route path="/rg/training" element={P("training", <TrainingPage />)} />
      {/* SOPs = the training-module library (same data + `training` permission); a
          distinct nav item from Checklists, opened to the module library. */}
      <Route path="/rg/sops" element={P("training", <TrainingPage initialTab="modules" />)} />
      <Route path="/rg/checklists" element={P("checklists", <ChecklistsPage />)} />
      <Route path="/rg/temperature" element={P("temperature", <TemperatureLogPage />)} />
      <Route path="/rg/performance" element={P("performance", <PerformancePage />)} />
      <Route path="/rg/reports" element={P("reports", <ReportsPage />)} />
      <Route path="/rg/stock" element={P("stock", <StockPage />)} />
      <Route path="/rg/menus" element={P("menus", <MenusPage />)} />
      {/* POS Terminal — its OWN `pos` permission (staff default: view) so
          order-taking staff can open it; the SALE itself is server-gated by
          rgSellOrder (stock OR pos permission, fail-closed). */}
      <Route path="/rg/pos" element={P("pos", <PosPage />)} />
      <Route path="/rg/supplier" element={P("supplier", <SupplierPage />)} />
      <Route path="/rg/compliance" element={P("compliance", <CompliancePage />)} />
      <Route path="/rg/contracts" element={P("contracts", <ContractGeneratorPage />)} />
      <Route path="/rg/contracts/sent" element={P("contracts", <SentContractsPage />)} />
      <Route path="/rg/contracts/templates" element={P("contracts", <ContractTemplatesPage />)} />
      <Route path="/rg/messages" element={P("messages", <MessagingPage />)} />
      <Route path="/rg/calendar" element={P("calendar", <CalendarPage />)} />
      <Route path="/rg/users" element={P("usermgmt", <UserManagementPage />)} />
      <Route path="/rg/settings" element={P("settings", <SettingsPage />)} />
      <Route path="*" element={<Navigate to="/rg/staff" replace />} />
    </Routes>
  );
}
