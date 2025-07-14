
import './App.css';
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from "react-redux";
import LoginPage from "./pages/LoginPage";
// import HomePage from "./pages/HomePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SupportPage from "./pages/SupportPage";
import AccountDeletionPage from "./pages/AccountDeletionPage";
import Layout from './components/Layout';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from "./firebase";
import SuperAdminRoutes from "./routes/SuperAdminRoutes";
import CollegeAdminRoutes from "./routes/CollegeAdminRoutes";
import { AuthProvider, useAuth } from "./auth/AuthContext";
function App() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const [users, setUser] = useState(null);
  const uid = useSelector((state) => state?.auth?.user?.uid);
  const sessionDuration = 24 * 60 * 60 * 1000;
  const sessionDuration1 = 60 * 1000;
  const { user, role, loading } = useAuth();
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const loginTime = localStorage.getItem('loginTime');
    if (loginTime) {
      const expirationTime = Number(loginTime) + sessionDuration;
      const timeLeft = expirationTime - Date.now();

      if (timeLeft <= 0) {
        signOut(auth);
        localStorage.removeItem('loginTime');
        localStorage.removeItem("userData");
        localStorage.removeItem("employee");
      } else {
        const timer = setTimeout(() => {
          signOut(auth);
          localStorage.removeItem('loginTime');
          localStorage.removeItem("userData");
          localStorage.removeItem("employee");
        }, timeLeft);

        return () => clearTimeout(timer);
      }
    }
  }, []);
  return (
    <Router>
      {/* <nav>
      <Link to="/">Home</Link> | <Link to="/about">About</Link>
    </nav>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="*" element={<NotFound />} />
    </Routes> */}
      <Routes>
        <Route
          exact
          path="/"
          element={isLoggedIn ? <Layout><Navigate to="/home/dashboard" /></Layout> : <LoginPage />}
        ></Route>
        <Route exact path="/privacy" element={<PrivacyPolicyPage />}></Route>
        <Route exact path="/support" element={<SupportPage />}></Route>
        <Route path="/requestdelete" element={<AccountDeletionPage />} />
        {/* <Route
          index
          path="/home/*"
          element={isLoggedIn ? <Layout><HomePage /></Layout> : <Navigate to="/" />}

        ></Route> */}
      </Routes>
    </Router>
  );
}

export default App;
