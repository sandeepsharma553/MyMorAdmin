// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from 'firebase/database';
import { getStorage } from "firebase/storage";
const firebaseConfig = {
    apiKey: "AIzaSyAFFDyHvLlcQLErywNMN8z7I7hVf97whYs",
    authDomain: "mymor-one.firebaseapp.com",
    databaseURL: "https://mymor-one-default-rtdb.firebaseio.com",
    projectId: "mymor-one",
    storageBucket: "mymor-one.firebasestorage.app",
    messagingSenderId: "368272892719",
    appId: "1:368272892719:web:5e8c5d8852e9eab8a777da",
    measurementId: "G-N86QYYE9XZ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const analytics = getAnalytics(app);
const db = getFirestore(app);
//const db = getDatabase(app);
const firestore = getFirestore(app)
const storage = getStorage(app);
export { auth,analytics,db,firestore,storage };
