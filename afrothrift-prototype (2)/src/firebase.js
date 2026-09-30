// ─────────────────────────────────────────────────────────────
// AfriBay — Firebase configuration
// ─────────────────────────────────────────────────────────────
// ACTION REQUIRED: Replace the three placeholder values below
// with your real Firebase project details from:
// Firebase Console → Project Settings → General → Your apps
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCh8XNHynIuakXv_x-aU-KTQMliqkcKuUA",
  appId:             "1:628778999151:web:58f486ebd2a765a8bfdc9a",
  messagingSenderId: "628778999151",
  // ↓ Fill these three values from your Firebase Console ↓
  authDomain:        "YOUR-PROJECT-ID.firebaseapp.com",
  projectId:         "YOUR-PROJECT-ID",
  storageBucket:     "YOUR-PROJECT-ID.appspot.com",
};

const CONFIGURED = FIREBASE_CONFIG.projectId !== "YOUR-PROJECT-ID";

if (!CONFIGURED) {
  console.warn(
    "[AfriBay] Firebase is not fully configured.\n" +
    "Open src/firebase.js and replace the three placeholder values:\n" +
    "  authDomain, projectId, storageBucket\n" +
    "Find them in: Firebase Console → Project Settings → General → Your apps"
  );
}

let app, auth, db, storage;

try {
  app     = initializeApp(FIREBASE_CONFIG);
  auth    = getAuth(app);
  db      = CONFIGURED ? getFirestore(app) : null;
  storage = CONFIGURED ? getStorage(app)   : null;
} catch (err) {
  console.error("[AfriBay] Firebase initialisation failed:", err.message);
  app = auth = db = storage = null;
}

export const googleProvider = new GoogleAuthProvider();
export { app, auth, db, storage };
export default app;
