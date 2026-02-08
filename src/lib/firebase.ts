import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCbkEpvYeoQJ0O-pjszaNb1Nj5T0wf_T3s",
  authDomain: "smart-broker-usa.firebaseapp.com",
  projectId: "smart-broker-usa",
  storageBucket: "smart-broker-usa.firebasestorage.app",
  messagingSenderId: "349178824168",
  appId: "1:349178824168:web:96a4ebb72e96deb3b8505d",
  measurementId: "G-X4687TJXZV",
};

// Initialize Firebase
// This pattern prevents re-initialization in a Next.js environment.
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
