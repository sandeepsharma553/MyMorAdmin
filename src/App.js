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

const isValidId = (v) =>
  v !== undefined &&
  v !== null &&
  String(v).trim() !== "" &&
  String(v).trim().toLowerCase() !== "null" &&
  String(v).trim().toLowerCase() !== "undefined";

function AppWrapper() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const type = useSelector((state) => state.auth.type);
  const employee = useSelector((state) => state.auth.employee);
  const activeOrg = useSelector((state) => state.auth.activeOrg);

  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setChecking(false), 100);
    return () => clearTimeout(timer);
  }, []);

  if (checking) return null;

  const hasHostel = isValidId(employee?.hostelid);
  const hasUniclub = isValidId(employee?.uniclubid);
  const hasUniversity = isValidId(employee?.universityid);
  const hasBusiness = !hasHostel && !hasUniclub && !hasUniversity;
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
    else if (hasUniclub) {
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

      {isLoggedIn && type === "admin" && (
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