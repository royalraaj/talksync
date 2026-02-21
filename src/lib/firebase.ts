import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBTnxaG1YyWgrONDvSumqkHzQ073f6xLSk",
    authDomain: "talksync-ab64f.firebaseapp.com",
    projectId: "talksync-ab64f",
    storageBucket: "talksync-ab64f.firebasestorage.app",
    messagingSenderId: "410059244343",
    appId: "1:410059244343:web:b5637eb84d2c2ef9c310b2",
    measurementId: "G-2SNLF64ZZ2"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Only initialize Analytics if we are in a browser environment (Tauri handles this fine, but good practice)
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
