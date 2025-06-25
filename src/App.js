//import logo from './logo.svg';
import './App.css';
import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from "react-redux";
import LoginPage from "./pages/LoginPage";
import HomePage from "./pages/HomePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SupportPage from "./pages/SupportPage";
import AccountDeletionPage from "./pages/AccountDeletionPage";
import Layout from './components/Layout';
import { onAuthStateChanged, } from "firebase/auth";
import { auth } from "./firebase";
function App() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const [user, setUser] = useState(null);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
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
        <Route
          index
          path="/home/*"
          element={isLoggedIn ? <Layout><HomePage /></Layout> : <Navigate to="/" />}
        ></Route>
      </Routes>
    </Router>
  );
}

export default App;
