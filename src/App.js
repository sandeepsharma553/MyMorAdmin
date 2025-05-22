//import logo from './logo.svg';
import './App.css';
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from "react-redux";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import PrivacyPolicyScreen from "./pages/PrivacyPolicyScreen";
import Layout from './components/Layout';
function App() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const auth = useSelector((state) => state.auth.user?.data?.userRole);
  useEffect(() => {
     console.log(auth);
    console.log(isLoggedIn);
  });
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
        <Route exact path="/registerpage" element={<RegisterPage />}></Route>
        <Route exact path="/privacy" element={<PrivacyPolicyScreen />}></Route>
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
