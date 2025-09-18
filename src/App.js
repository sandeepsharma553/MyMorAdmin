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

import { messaging, database, VAPID_KEY } from "./firebase";
import { getToken, onMessage } from "firebase/messaging";
import { ref, update } from "firebase/database";
function AppWrapper() {
  const isLoggedIn = useSelector((state) => state.auth.isLoggedIn);
  const type = useSelector((state) => state.auth.type);
  const user = useSelector((state) => state.auth.user)
  const employee = useSelector((state) => state.auth.employee);;
  const [checking, setChecking] = useState(true);

  useEffect(() => {

    const timer = setTimeout(() => setChecking(false), 100);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!isLoggedIn || !user) return;

    const hostelid = employee?.hostelid || user?.hostelid; // pick whichever holds hostel id
    const uid = user?.uid;
    if (!hostelid || !uid) {
      console.warn("Missing hostelid/uid; skip FCM setup");
      return;
    }

    async function setupWebPush() {
      try {
        // 1) Register the service worker (must be at public root)
         const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
       // const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { type: 'module' })
        // .then((registration) => {
         
        //     console.log('ServiceWorker registration successful with scope: ', registration.scope);
        // })
        // .catch((error) => {
        //   alert(1)
        //     console.error('ServiceWorker registration failed: ', error);
        // });
        // 2) Ask browser permission
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          console.warn("Notification permission not granted");
          return;
        }

        // 3) Get token
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg,
        });

        if (token) {
          console.log("✅ Web FCM token:", token);

          // 4) Save token to RTDB at /hostelTokens/{hostelid}/{uid}
          //    Use a unique key so multiple sessions/devices can coexist
          const key = `web_${Date.now()}`;
          await update(ref(database, `/hostelTokens/${hostelid}/${uid}`), {
            [key]: token
          });
        } else {
          console.warn("No registration token available.");
        }

        // 5) Foreground messages
        const unsubscribe = onMessage(messaging, (payload) => {
          console.log("📩 Foreground message:", payload);
          const title = payload?.notification?.title || "Notification";
          const body = payload?.notification?.body || "";
          // Native browser notification (tab must be focused & permission granted)
          try {
            new Notification(title, { body, icon: "/icon.png" });
          } catch {
            // fallback: alert or custom toast UI
            alert(`${title}\n\n${body}`);
          }
        });

        return () => unsubscribe();
      } catch (err) {
        console.error("FCM setup error:", err);
      }
    }

    setupWebPush();
  }, [isLoggedIn, user, employee]);

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
