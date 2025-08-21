// main.js

import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener('DOMContentLoaded', () => {
    const userEmailSpan = document.getElementById('user-email');
    const logoutBtn = document.getElementById('logout-btn');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            // Agora o elemento userEmailSpan existe, então não haverá erro
            if (userEmailSpan) {
                userEmailSpan.textContent = user.email;
            }
        } else {
            window.location.href = "login.html";
        }
    });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            signOut(auth)
                .then(() => {
                    window.location.href = "login.html";
                })
                .catch((error) => {
                    console.error("Erro ao fazer logout:", error);
                });
        });
    }
});