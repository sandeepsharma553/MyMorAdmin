import './App.css';
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from "react-redux";
import LoginPage from "./auth/LoginPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SupportPage from "./pages/SupportPage";
import AccountDeletionPage from "./pages/admin/AccountDeletionPage";
import Layout from './components/Layout';
import SuperAdminLayout from './components/SuperAdminLayout';
import SuperAdminRoutes from "./routes/SuperAdminRoutes";
import AdminRoutes from "./routes/AdminRoutes";


function AppWrapper() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const type = useSelector((state) => state.auth.type);
  const user = useSelector((state) => state.auth.user)
  const [checking, setChecking] = useState(true);

  useEffect(() => {

    const timer = setTimeout(() => setChecking(false), 100);
    return () => clearTimeout(timer);
  }, []);

  if (checking) return null;

  console.log("LoggedIn:", isLoggedIn, "Role:", type,"user",user);

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPolicyPage />} />
      <Route path="/support" element={<SupportPage />} />
      <Route path="/requestdelete" element={<AccountDeletionPage />} />

      {!isLoggedIn && (
        <Route path="*" element={<LoginPage />} />
      )}

      {isLoggedIn && type === "superadmin" && (
        <>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/*" element={<SuperAdminLayout><SuperAdminRoutes /></SuperAdminLayout>} />
        </>

      )}

      {isLoggedIn && type === "admin" && (
        <>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/*" element={<Layout><AdminRoutes /></Layout>} />
        </>
      )}

      <Route path="*" element={<Navigate to="/" />} />
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
