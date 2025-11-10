// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDaB7YWpY33_xequvA9iNRE5bQXT0X4pnc",
  authDomain: "auto-repair-446a1.firebaseapp.com",
  projectId: "auto-repair-446a1",
  storageBucket: "auto-repair-446a1.firebasestorage.app",
  messagingSenderId: "789502765204",
  appId: "1:789502765204:web:e42775e6f6cdf9ba282c81",
  measurementId: "G-1KK4PT3K8L"
};

export const app = initializeApp(firebaseConfig);
try { getAnalytics(app); } catch (_) {}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);