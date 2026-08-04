import "./App.css";
import React, { useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { bootstrapAuth } from "./app/features/AuthSlice";

import LoginPage from "./auth/LoginPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SupportPage from "./pages/SupportPage";
import AccountDeletionPage from "./pages/admin/AccountDeletionPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

import Layout from "./components/Layout";
import SuperAdminLayout from "./components/SuperAdminLayout";
import SuperAdminRoutes from "./routes/SuperAdminRoutes";
import AdminRoutes from "./routes/AdminRoutes";
import RestaurantGroupLayout from "./components/RestaurantGroupLayout";
import RestaurantGroupRoutes from "./routes/RestaurantGroupRoutes";

import ChooseContextPage from "./pages/admin/ChooseContextPage";

const isValidId = (v) =>
  v !== undefined &&
  v !== null &&
  String(v).trim() !== "" &&
  String(v).trim().toLowerCase() !== "null" &&
  String(v).trim().toLowerCase() !== "undefined";

function AppWrapper() {
  const dispatch = useDispatch();
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const type = useSelector((state) => state.auth.type);
  const employee = useSelector((state) => state.auth.employee);
  const activeOrg = useSelector((state) => state.auth.activeOrg);
  const booting = useSelector((state) => state.auth.booting);

  // Real bootstrap (replaces the retired localStorage hydration AND the old fixed
  // 100ms `checking` timer): Firebase restores its persisted Auth session, the live
  // employee listener attaches, and `booting` clears on the first snapshot/answer.
  // Until then we render nothing — so a reload no longer flashes or bounces a
  // signed-in user to LoginPage, and an EXPIRED session correctly lands on login.
  useEffect(() => {
    dispatch(bootstrapAuth());
  }, [dispatch]);

  if (booting) return null;

  const hasHostel = isValidId(employee?.hostelid);
  const hasUniclub = isValidId(employee?.uniclubid);
  const hasUniversity = isValidId(employee?.universityid);
  const hasGroup = isValidId(employee?.groupId || employee?.groupid);
  const hasBusiness = !hasHostel && !hasUniclub && !hasUniversity && !hasGroup;
  let adminDefaultPath = "/dashboard";
  if (isLoggedIn && type === "admin") {
    if (hasHostel && hasUniclub && hasUniversity) {
      if (activeOrg === "hostel") {
        adminDefaultPath = "/dashboard";
      } else if (activeOrg === "uniclub") {
        adminDefaultPath = "/uniclubdashboard";
      } else if (activeOrg === "business") {
        adminDefaultPath = "/businessdashboard";
      } else if (activeOrg === "university") {
        adminDefaultPath = "/universitydashboard";
      }
      else {
        adminDefaultPath = "/choose";
      }
    }
    else if (hasGroup) {
      adminDefaultPath = "/rg/staff";
    } else if (hasUniclub) {
      adminDefaultPath = "/uniclubdashboard";
    } else if (hasHostel) {
      adminDefaultPath = "/dashboard";
    } else if (hasBusiness) {
      adminDefaultPath = "/businessdashboard";
    } else if (hasUniversity) {
      adminDefaultPath = "/universitydashboard";
    }
    else {
      adminDefaultPath = "/dashboard";
    }
  }
  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/requestdelete" element={<AccountDeletionPage />} />
      {/* public — the branded password-reset emails land here (?oobCode=…) */}
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {!isLoggedIn && <Route path="*" element={<LoginPage />} />}

      {isLoggedIn && type === "superadmin" && (
        <>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/*"
            element={
              <SuperAdminLayout>
                <SuperAdminRoutes />
              </SuperAdminLayout>
            }
          />
        </>
      )}

      {isLoggedIn && type === "admin" && hasGroup && (
        <>
          <Route path="/" element={<Navigate to="/rg/staff" replace />} />
          <Route
            path="/*"
            element={
              <RestaurantGroupLayout>
                <RestaurantGroupRoutes />
              </RestaurantGroupLayout>
            }
          />
        </>
      )}

      {isLoggedIn && type === "admin" && !hasGroup && (
        <>
          <Route path="/" element={<Navigate to={adminDefaultPath} replace />} />
          <Route path="/choose" element={<ChooseContextPage />} />
          <Route
            path="/*"
            element={
              <Layout>
                <AdminRoutes />
              </Layout>
            }
          />
        </>
      )}

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <Router>
      <AppWrapper />
    </Router>
  );
}

export default App;