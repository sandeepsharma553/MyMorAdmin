import "./App.css";
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

import LoginPage from "./auth/LoginPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SupportPage from "./pages/SupportPage";
import AccountDeletionPage from "./pages/admin/AccountDeletionPage";

import Layout from "./components/Layout";
import SuperAdminLayout from "./components/SuperAdminLayout";
import SuperAdminRoutes from "./routes/SuperAdminRoutes";
import AdminRoutes from "./routes/AdminRoutes";

import ChooseContextPage from "./pages/admin/ChooseContextPage";

function AppWrapper() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const type = useSelector((state) => state.auth.type);
  const user = useSelector((state) => state.auth.user);
  const employee = useSelector((state) => state.auth.employee);
  const activeOrg = useSelector((state) => state.auth.activeOrg);

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setChecking(false), 100);
    return () => clearTimeout(timer);
  }, []);

  if (checking) return null;

  const hasHostel = !!employee?.hostelid;
  const hasUniclub = !!employee?.uniclubid;

  // ✅ Decide where "/" should go for admin
  const adminDefaultPath =
    isLoggedIn && type === "admin"
      ? hasHostel && hasUniclub
        ? activeOrg === "hostel"
          ? "/dashboard"
          : activeOrg === "uniclub"
            ? "/uniclubdashboard"
            : "/choose"
        : hasUniclub
          ? "/uniclubdashboard"
          : "/dashboard"
      : "/dashboard";

  return (
    <Routes>
      {/* Public */}
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/requestdelete" element={<AccountDeletionPage />} />

      {/* Not logged in */}
      {!isLoggedIn && <Route path="*" element={<LoginPage />} />}

      {/* Superadmin */}
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

      {/* Admin */}
      {isLoggedIn && type === "admin" && (
        <>
          <Route path="/" element={<Navigate to={adminDefaultPath} replace />} />

          {/* ✅ chooser page */}
          <Route path="/choose" element={<ChooseContextPage />} />

          {/* all admin pages */}
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

      {/* fallback */}
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
