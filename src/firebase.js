// ─────────────────────────────────────────────────────────────
// AfriBay — Firebase Production Configuration
// Connected to Project: afribay (Firebase Auth, Firestore, Storage)
// ─────────────────────────────────────────────────────────────
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCh8XNHynIuakXv_x-aU-KTQMliqkcKuUA",
  appId:             "1:628778999151:web:58f486ebd2a765a8bfdc9a",
  messagingSenderId: "628778999151",
  authDomain:        "afribay.firebaseapp.com",
  projectId:         "afribay",
  storageBucket:     "afribay.firebasestorage.app",
};

const CONFIGURED = true;

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
