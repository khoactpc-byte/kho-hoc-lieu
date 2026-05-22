import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const userFirebaseConfig = {
  apiKey: "AIzaSyBnlGRv9MREiu70QejytCi_zk3L7yDNNJA",
  authDomain: "kho-hoc-lieu-18284.firebaseapp.com",
  projectId: "kho-hoc-lieu-18284",
  storageBucket: "kho-hoc-lieu-18284.firebasestorage.app",
  messagingSenderId: "949323689415",
  appId: "1:949323689415:web:e7b4cbbdd21cbc0b003de2"
};

const rawFirebaseConfig = typeof window !== 'undefined' && typeof window.__firebase_config !== 'undefined' ? JSON.parse(window.__firebase_config) : userFirebaseConfig;
const firebaseConfig = rawFirebaseConfig && rawFirebaseConfig.apiKey !== 'demo-api-key' ? rawFirebaseConfig : userFirebaseConfig;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const appId = typeof window !== 'undefined' && typeof window.__app_id !== 'undefined' ? window.__app_id : 'kho-hoc-lieu-chinh';