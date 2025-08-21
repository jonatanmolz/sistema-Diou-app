// firebase-config.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA4Pe8hCdhxpkrwVWwLZiho0dTeiccpRVY",
  authDomain: "sistema-factorshoes-1b0b9.firebaseapp.com",
  projectId: "sistema-factorshoes-1b0b9",
  storageBucket: "sistema-factorshoes-1b0b9.appspot.com",
  messagingSenderId: "664310919966",
  appId: "1:664310919966:web:d2b5f6e8c7b8a7b9e0f1e0"
};

// Inicializa o Firebase
const app = initializeApp(firebaseConfig);

// Exporta os serviços que vamos usar
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };