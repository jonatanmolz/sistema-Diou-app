// auth.js

import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
    doc, 
    setDoc 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Função para monitorar o estado da autenticação
onAuthStateChanged(auth, (user) => {
    if (user) {
        // Usuário logado
        console.log("Usuário logado:", user.email);
        // Podemos adicionar lógica para redirecionar o usuário
        // para a página inicial aqui.
    } else {
        // Usuário não está logado
        console.log("Nenhum usuário logado.");
    }
});

// Lógica para a página de Cadastro
const cadastroForm = document.getElementById('cadastroForm');
if (cadastroForm) {
    cadastroForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = cadastroForm.email.value;
        const senha = cadastroForm.senha.value;
        const confirmarSenha = cadastroForm.confirmarSenha.value;
        const erroCadastro = document.getElementById('erroCadastro');

        if (senha !== confirmarSenha) {
            erroCadastro.textContent = "As senhas não coincidem.";
            return;
        }

        createUserWithEmailAndPassword(auth, email, senha)
            .then((cred) => {
                console.log("Usuário cadastrado:", cred.user);
                
                // Cria um documento na coleção 'Usuario' com o UID do usuário como ID do documento
                const userDocRef = doc(db, "Usuario", cred.user.uid);
                return setDoc(userDocRef, {
                    email: cred.user.email,
                    // Aqui você pode adicionar outros campos, como 'role', 'nome', etc.
                });
            })
            .then(() => {
                console.log("Documento do usuário criado no Firestore.");
                window.location.href = "index.html"; // Redireciona para a página principal após o cadastro
            })
            .catch((err) => {
                erroCadastro.textContent = err.message;
            });
    });
}

// Lógica para a página de Login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const senha = loginForm.senha.value;
        const erroLogin = document.getElementById('erroLogin');

        signInWithEmailAndPassword(auth, email, senha)
            .then((cred) => {
                console.log("Usuário logado:", cred.user);
                window.location.href = "index.html"; // Redireciona para a página principal após o login
            })
            .catch((err) => {
                erroLogin.textContent = "E-mail ou senha incorretos.";
            });
    });
}