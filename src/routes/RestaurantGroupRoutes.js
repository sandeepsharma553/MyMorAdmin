import { Routes, Route, Navigate } from "react-router-dom";
import StaffDirectoryPage from "../pages/restaurantgroup/StaffDirectoryPage";
import ShiftPlannerPage from "../pages/restaurantgroup/ShiftPlannerPage";
import LeaveRequestsPage from "../pages/restaurantgroup/LeaveRequestsPage";
import TrainingPage from "../pages/restaurantgroup/TrainingPage";
import ChecklistsPage from "../pages/restaurantgroup/ChecklistsPage";
import PerformancePage from "../pages/restaurantgroup/PerformancePage";
import UserManagementPage from "../pages/restaurantgroup/UserManagementPage";

export default function RestaurantGroupRoutes() {
  return (
    <Routes>
      <Route path="/rg/staff" element={<StaffDirectoryPage />} />
      <Route path="/rg/shifts" element={<ShiftPlannerPage />} />
      <Route path="/rg/leave" element={<LeaveRequestsPage />} />
      <Route path="/rg/training" element={<TrainingPage />} />
      <Route path="/rg/checklists" element={<ChecklistsPage />} />
      <Route path="/rg/performance" element={<PerformancePage />} />
      <Route path="/rg/users" element={<UserManagementPage />} />
      <Route path="*" element={<Navigate to="/rg/staff" replace />} />
    </Routes>
  );
}
