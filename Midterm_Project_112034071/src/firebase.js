// 🔥 Firebase Configuration
// TODO: Replace with your own Firebase project config
// Get this from: Firebase Console → Project Settings → Your apps → Web app

import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging, isSupported } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyD5LzYyxy418Q5TQcBYyD65MNMG9-8s2vs",
  authDomain: "midtermproject-112034071.firebaseapp.com",
  databaseURL: "https://midtermproject-112034071-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "midtermproject-112034071",
  storageBucket: "midtermproject-112034071.firebasestorage.app",
  messagingSenderId: "255722476802",
  appId: "1:255722476802:web:f0c8d976329cb2897d9e1b",
  measurementId: "G-T11EGQZKFD"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Chrome Push Notifications (optional, only supported in modern browsers)
export const getMessagingInstance = async () => {
  const supported = await isSupported();
  if (supported) {
    return getMessaging(app);
  }
  return null;
};

export default app;
