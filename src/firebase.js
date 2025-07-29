// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from 'firebase/database';
import { getStorage } from "firebase/storage";
// const firebaseConfig1 = {
//     apiKey: "AIzaSyAFFDyHvLlcQLErywNMN8z7I7hVf97whYs",
//     authDomain: "mymor-one.firebaseapp.com",
//     databaseURL: "https://mymor-one-default-rtdb.firebaseio.com",
//     projectId: "mymor-one",
//     storageBucket: "mymor-one.firebasestorage.app",
//     messagingSenderId: "368272892719",
//     appId: "1:368272892719:web:5e8c5d8852e9eab8a777da",
//     measurementId: "G-N86QYYE9XZ"
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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const db = getFirestore(app);
//const db = getDatabase(app);
const firestore = getFirestore(app)
const storage = getStorage(app);
const database = getDatabase(app);
export { auth,analytics,db,firestore,storage,database,firebaseConfig };
