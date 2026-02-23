// src/lib/firebase.js

// Import the functions you need from the Firebase SDKs
import { initializeApp } from "firebase/app";       // Core Firebase app
import { getAuth, GoogleAuthProvider } from "firebase/auth"; // Firebase Authentication
import { getFirestore } from "firebase/firestore"; // Cloud Firestore

// Your web app's Firebase configuration using environment variables.
// These variables are loaded from your .env file during the build process.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
let app;
try {
  app = initializeApp(firebaseConfig);
} catch (error) {
  console.error("Firebase initialization failed:", error);
}

// Initialize Firebase services and export them for use throughout your app
export const auth = app ? getAuth(app) : null;             // Authentications service instance
export const db = app ? getFirestore(app) : null;         // Firestore database service instance
export const googleProvider = new GoogleAuthProvider(); // Google Auth Provider instance
