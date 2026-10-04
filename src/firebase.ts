import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

const env = import.meta.env;
const useEmulators = env.VITE_USE_EMULATORS === 'true';

/**
 * Firebase web config for the investment-planner-40f1d project. These values are public by design: they are
 * shipped to every browser that loads the app. Data is protected by firestore.rules and Auth's authorized domains.
 * Any VITE_FIREBASE_* environment variable overrides the matching value (e.g. to point at another project).
 */
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || 'AIzaSyAUVjXqAzK5tsDxhuidK-gKcSa4yQqnljs',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'investment-planner-40f1d.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'investment-planner-40f1d',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || 'investment-planner-40f1d.firebasestorage.app',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '828269174232',
  appId: env.VITE_FIREBASE_APP_ID || '1:828269174232:web:2d1f3f08be883e3c5be6ad',
};

// The local emulators run under a "demo-" project so they can never touch real data.
const app = initializeApp(useEmulators ? { ...config, projectId: 'demo-investment-planner' } : config);

export const auth = getAuth(app);
// Offline cache so portfolios open instantly (and work on a phone with a spotty connection).
export const db = initializeFirestore(app, { localCache: persistentLocalCache() });
export const functions = getFunctions(app, env.VITE_FUNCTIONS_REGION || 'us-central1');

if (useEmulators) {
  const host = env.VITE_EMULATOR_HOST || '127.0.0.1';
  connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
}
