import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  Auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  User as FirebaseUser,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
  ConfirmationResult,
} from 'firebase/auth';

// Firebase configuration from environment
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process.env as any || {});
const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

export const isFirebaseConfigured = (): boolean => {
  const key = firebaseConfig.apiKey;
  return Boolean(key && !key.includes('placeholder') && !key.includes('MY_FIREBASE'));
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

if (typeof window !== 'undefined') {
  try {
    if (firebaseConfig.apiKey) {
      app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      auth = getAuth(app);
    }
  } catch (err) {
    console.warn('Firebase initialization error:', err);
  }
}

export {
  app,
  auth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
  onAuthStateChanged,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  PhoneAuthProvider,
  linkWithCredential,
};

export type { FirebaseUser, ConfirmationResult };
