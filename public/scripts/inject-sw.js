// Node script (run before build)
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, '..', 'public', 'firebase-messaging-sw.js');
const cfg = {
  apiKey: process.env.REACT_APP_FIREBASE_PROD_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_PROD_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_PROD_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROD_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_PROD_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_PROD_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_PROD_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_PROD_MEASUREMENT_ID
};

const content = `
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js");
firebase.initializeApp(${JSON.stringify(cfg)});
const messaging = firebase.messaging();
messaging.onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || "Notification";
  const body = payload?.notification?.body || "";
  self.registration.showNotification(title, { body, icon: "/icon.png" });
});
`;

fs.writeFileSync(out, content, 'utf8');
console.log('Wrote', out);
