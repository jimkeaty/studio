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

// A simple check to see if the config is loaded.
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.error("Firebase configuration is missing or incomplete.");
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
