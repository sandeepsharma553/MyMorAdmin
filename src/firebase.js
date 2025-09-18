// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from 'firebase/database';
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging"
// const firebaseConfig = {
//     apiKey: "AIzaSyA9-R9ud3SsJgdCbutEkspJSWQ5GOuqIxo",
//     authDomain: "mymor-development.firebaseapp.com",
//     databaseURL: "https://mymor-development-default-rtdb.firebaseio.com",
//     projectId: "mymor-development",
//     storageBucket: "mymor-development.firebasestorage.app",
//     messagingSenderId: "383612331144",
//     appId: "1:383612331144:web:1f5840d0afb0e387ea6b3d",
//     measurementId: "G-NR6LCL2CPR"
// };
// const firebaseConfig = {
//     apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
//     authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
//     databaseURL: process.env.REACT_APP_FIREBASE_DATABASE_URL,
//     projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
//     storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
//     messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
//     appId: process.env.REACT_APP_FIREBASE_APP_ID,
//     measurementId:process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
//   };

const devConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_DEV_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_DEV_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_DEV_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_DEV_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_DEV_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_DEV_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_DEV_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_DEV_MEASUREMENT_ID
};

const prodConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_PROD_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_PROD_AUTH_DOMAIN,
  databaseURL: process.env.REACT_APP_FIREBASE_PROD_DATABASE_URL,
  projectId: process.env.REACT_APP_FIREBASE_PROD_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_PROD_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_PROD_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_PROD_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_PROD_MEASUREMENT_ID
  
};

const firebaseConfig = process.env.REACT_APP_ENV === 'production' ? prodConfig : devConfig;
console.log(process.env.REACT_APP_ENV)
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const db = getFirestore(app);
//const db = getDatabase(app);
const firestore = getFirestore(app)
const storage = getStorage(app);
const database = getDatabase(app);
const messaging = getMessaging(app)
const VAPID_KEY = process.env.REACT_APP_ENV === 'production'
  ? process.env.REACT_APP_FIREBASE_PROD_VAPID_KEY
  : process.env.REACT_APP_FIREBASE_DEV_VAPID_KEY;
export { auth,analytics,db,firestore,storage,database,firebaseConfig,messaging,VAPID_KEY };
