'use client';

import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
let app;
let auth;

// Initialize Firebase for both client and server (SSR) to avoid import errors
// The auth state will only be active on the client
if (!getApps().length) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}
auth = getAuth(app);

export { app, auth };
export default firebaseConfig;
