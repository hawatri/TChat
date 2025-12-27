// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// CRITICAL FIX: Use the system provided ID to avoid permission errors
const appId = typeof __app_id !== 'undefined' ? __app_id : 'tchat-terminal';

const firebaseConfig = {
    apiKey: "AIzaSyCc4hgOZCeHnBgcwHk7mWMaQEbjodVLuc4",
    authDomain: "tchat-b75ee.firebaseapp.com",
    projectId: "tchat-b75ee",
    storageBucket: "tchat-b75ee.firebasestorage.app",
    messagingSenderId: "602448689642",
    appId: "1:602448689642:web:435a9f48ea2e80debeda93",
    measurementId: "G-T7P87XTZ15"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Enable persistence immediately
setPersistence(auth, browserLocalPersistence).catch(console.error);

export { app, auth, db, appId };