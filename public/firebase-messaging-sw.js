
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");

// === Use your PROD config here (static in SW; envs don't exist at runtime) ===
firebase.initializeApp({
  apiKey: "AIzaSyAFFDyHvLlcQLErywNMN8z7I7hVf97whYs",
  authDomain: "mymor-one.firebaseapp.com",
  databaseURL: "https://mymor-one-default-rtdb.firebaseio.com",
  projectId: "mymor-one",
  storageBucket: "mymor-one.firebasestorage.app",
  messagingSenderId: "368272892719",
  appId: "1:368272892719:web:5e8c5d8852e9eab8a777da",
  measurementId: "G-N86QYYE9XZ"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("📩 Background message:", payload);
  const title = payload?.notification?.title || "Notification";
  const body = payload?.notification?.body || "";
  self.registration.showNotification(title, { body, icon: "/icon.png" });
});
