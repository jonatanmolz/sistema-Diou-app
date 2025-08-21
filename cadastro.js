// cadastro.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser;

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadData(currentUser.uid);
        } else {
            window.location.href = "login.html";
        }
    });

    // --- Elementos do DOM e Botões de Ação ---
    const modals = document.querySelectorAll('.modal');
    const closeBtns = document.querySelectorAll('.close-btn');

    const openCaixaModalBtn = document.getElementById('openCaixaModalBtn');
    const openCartaoModalBtn = document.getElementById('openCartaoModalBtn');
    const openDespesaModalBtn = document.getElementById('openDespesaModalBtn');
    const openReceitaModalBtn = document.getElementById('openReceitaModalBtn');

    const caixaModal = document.getElementById('caixaModal');
    const cartaoModal = document.getElementById('cartaoModal');
    const despesaModal = document.getElementById('despesaModal');
    const receitaModal = document.getElementById('receitaModal');
    const editCaixaModal = document.getElementById('editCaixaModal');
    const editCartaoModal = document.getElementById('editCartaoModal');
    const editDespesaSubcategoriasModal = document.getElementById('editDespesaSubcategoriasModal');
    const editReceitaModal = document.getElementById('editReceitaModal');
    const editReceitaSubcategoriasModal = document.getElementById('editReceitaSubcategoriasModal');

    const caixaForm = document.getElementById('caixaForm');
    const cartaoForm = document.getElementById('cartaoForm');
    const categoriaDespesaForm = document.getElementById('categoriaDespesaForm');
    const categoriaReceitaForm = document.getElementById('categoriaReceitaForm');
    const editCaixaForm = document.getElementById('editCaixaForm');
    const editCartaoForm = document.getElementById('editCartaoForm');
    const editDespesaSubcategoriasForm = document.getElementById('editDespesaSubcategoriasForm');
    const editReceitaForm = document.getElementById('editReceitaForm');
    const editReceitaSubcategoriasForm = document.getElementById('editReceitaSubcategoriasForm');

    // Elementos de Subcategorias Despesa
    const addSubcategoriaBtn = document.getElementById('addSubcategoriaBtn');
    const newSubcategoriaInput = document.getElementById('newSubcategoria');
    const subcategoriasTableBody = document.querySelector('#subcategoriasTable tbody');

    // Elementos de Subcategorias Receita
    const addSubcategoriaReceitaBtn = document.getElementById('addSubcategoriaReceitaBtn');
    const newSubcategoriaReceitaInput = document.getElementById('newSubcategoriaReceita');
    const subcategoriasReceitaTableBody = document.querySelector('#subcategoriasReceitaTable tbody');

    // --- Funções do Modal ---
    function openModal(modal) {
        modal.style.display = 'flex';
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        modal.querySelector('form').reset();
    }

    modals.forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal);
            }
        });
    });

    closeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const modal = e.target.closest('.modal');
            closeModal(modal);
        });
    });

    openCaixaModalBtn.addEventListener('click', () => openModal(caixaModal));
    openCartaoModalBtn.addEventListener('click', () => openModal(cartaoModal));
    openDespesaModalBtn.addEventListener('click', () => openModal(despesaModal));
    openReceitaModalBtn.addEventListener('click', () => openModal(receitaModal));

    // --- Funções de Exibição dos Cards ---
    function displayCaixas(caixas) {
        const container = document.getElementById('caixasContainer');
        container.innerHTML = '';
        caixas.forEach(caixa => {
            const card = document.createElement('div');
            card.className = 'card card-caixa';
            card.setAttribute('data-id', caixa.id);
            card.innerHTML = `
                <h3>${caixa.nome}</h3>
                <p><strong>Tipo:</strong> ${caixa.tipo}</p>
                <p><strong>Saldo:</strong> R$ ${caixa.saldo.toFixed(2)}</p>
                ${caixa.agencia ? `<p><strong>Agência:</strong> ${caixa.agencia}</p>` : ''}
                ${caixa.conta ? `<p><strong>Conta:</strong> ${caixa.conta}</p>` : ''}
                <div class="card-actions">
                    <button class="action-btn-small edit-btn" data-modal="editCaixaModal"><img src="https://api.iconify.design/solar:pen-linear.svg?color=%232196F3" alt="Editar"></button>
                    <button class="action-btn-small delete-btn"><img src="https://api.iconify.design/solar:trash-bin-trash-linear.svg?color=%23F44336" alt="Excluir"></button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function displayCartoes(cartoes) {
        const container = document.getElementById('cartoesContainer');
        container.innerHTML = '';
        cartoes.forEach(cartao => {
            const card = document.createElement('div');
            card.className = 'card card-cartao';
            card.setAttribute('data-id', cartao.id);
            card.innerHTML = `
                <h3>${cartao.nome}</h3>
                <p><strong>Limite:</strong> R$ ${cartao.limite.toFixed(2)}</p>
                <p><strong>Fechamento:</strong> Dia ${cartao.data_de_fechamento}</p>
                <p><strong>Vencimento:</strong> Dia ${cartao.data_de_vencimento}</p>
                ${cartao.agencia ? `<p><strong>Agência:</strong> ${cartao.agencia}</p>` : ''}
                ${cartao.conta ? `<p><strong>Conta:</strong> ${cartao.conta}</p>` : ''}
                <div class="card-actions">
                    <button class="action-btn-small edit-btn" data-modal="editCartaoModal"><img src="https://api.iconify.design/solar:pen-linear.svg?color=%23FF5722" alt="Editar"></button>
                    <button class="action-btn-small delete-btn"><img src="https://api.iconify.design/solar:trash-bin-trash-linear.svg?color=%23F44336" alt="Excluir"></button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function displayCategoriasDespesa(categorias) {
        const container = document.getElementById('categoriasDespesaContainer');
        container.innerHTML = '';
        const grouped = {};
        
        categorias.forEach(cat => {
            if (!grouped[cat.nome]) {
                grouped[cat.nome] = { id: cat.id, subcategorias: [] };
            }
            if (cat.subcategorias) {
                grouped[cat.nome].subcategorias.push(...cat.subcategorias);
            }
        });

        for (const nome in grouped) {
            const card = document.createElement('div');
            card.className = 'card card-despesa';
            card.setAttribute('data-id', grouped[nome].id);
            card.setAttribute('data-nome', nome);
            card.innerHTML = `
                <h3>${nome}</h3>
                <p><strong>Subcategorias:</strong></p>
                <ul>
                    ${grouped[nome].subcategorias.map(sub => `<li>${sub}</li>`).join('')}
                </ul>
                <div class="card-actions">
                    <button class="action-btn-small edit-btn" data-modal="editDespesaSubcategoriasModal"><img src="https://api.iconify.design/solar:pen-linear.svg?color=%23E91E63" alt="Editar"></button>
                    <button class="action-btn-small delete-btn"><img src="https://api.iconify.design/solar:trash-bin-trash-linear.svg?color=%23F44336" alt="Excluir"></button>
                </div>
            `;
            container.appendChild(card);
        }
    }

    function displayCategoriasReceita(categorias) {
        const container = document.getElementById('categoriasReceitaContainer');
        container.innerHTML = '';
        const grouped = {};
        
        categorias.forEach(cat => {
            if (!grouped[cat.nome]) {
                grouped[cat.nome] = { id: cat.id, subcategorias: [] };
            }
            if (cat.subcategorias) {
                grouped[cat.nome].subcategorias.push(...cat.subcategorias);
            }
        });

        for (const nome in grouped) {
            const card = document.createElement('div');
            card.className = 'card card-receita';
            card.setAttribute('data-id', grouped[nome].id);
            card.setAttribute('data-nome', nome);
            card.innerHTML = `
                <h3>${nome}</h3>
                <p><strong>Subcategorias:</strong></p>
                <ul>
                    ${grouped[nome].subcategorias.map(sub => `<li>${sub}</li>`).join('')}
                </ul>
                <div class="card-actions">
                    <button class="action-btn-small edit-btn" data-modal="editReceitaSubcategoriasModal"><img src="https://api.iconify.design/solar:pen-linear.svg?color=%234CAF50" alt="Editar"></button>
                    <button class="action-btn-small delete-btn"><img src="https://api.iconify.design/solar:trash-bin-trash-linear.svg?color=%23F44336" alt="Excluir"></button>
                </div>
            `;
            container.appendChild(card);
        }
    }

    // --- Funções de Carregamento de Dados do Firestore ---
    function loadData(userId) {
        const qCaixas = query(collection(db, "caixas"), where("userId", "==", userId));
        onSnapshot(qCaixas, (querySnapshot) => {
            const caixas = [];
            querySnapshot.forEach((doc) => {
                caixas.push({ id: doc.id, ...doc.data() });
            });
            displayCaixas(caixas);
        });

        const qCartoes = query(collection(db, "cartao-credito"), where("userId", "==", userId));
        onSnapshot(qCartoes, (querySnapshot) => {
            const cartoes = [];
            querySnapshot.forEach((doc) => {
                cartoes.push({ id: doc.id, ...doc.data() });
            });
            displayCartoes(cartoes);
        });

        const qCategoriasDespesa = query(collection(db, "categoria-despesa"), where("userId", "==", userId));
        onSnapshot(qCategoriasDespesa, (querySnapshot) => {
            const categorias = [];
            querySnapshot.forEach((doc) => {
                categorias.push({ id: doc.id, ...doc.data() });
            });
            displayCategoriasDespesa(categorias);
        });
        
        const qCategoriasReceita = query(collection(db, "categoria-receita"), where("userId", "==", userId));
        onSnapshot(qCategoriasReceita, (querySnapshot) => {
            const categorias = [];
            querySnapshot.forEach((doc) => {
                categorias.push({ id: doc.id, ...doc.data() });
            });
            displayCategoriasReceita(categorias);
        });
    }

    // --- Lógica de Edição de Subcategorias de Despesa ---
    let currentDespesaSubcategorias = [];

    function renderDespesaSubcategoriasTable() {
        subcategoriasTableBody.innerHTML = '';
        currentDespesaSubcategorias.forEach((sub, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sub}</td>
                <td>
                    <button type="button" class="action-btn-small delete-subcategoria" data-index="${index}">
                        <img src="https://api.iconify.design/solar:trash-bin-trash-linear.svg?color=%23F44336" alt="Excluir">
                    </button>
                </td>
            `;
            subcategoriasTableBody.appendChild(row);
        });
    }

    addSubcategoriaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newSubcategoria = newSubcategoriaInput.value.trim();
        if (newSubcategoria && !currentDespesaSubcategorias.includes(newSubcategoria)) {
            currentDespesaSubcategorias.push(newSubcategoria);
            newSubcategoriaInput.value = '';
            renderDespesaSubcategoriasTable();
        }
    });

    subcategoriasTableBody.addEventListener('click', (e) => {
        const target = e.target.closest('.delete-subcategoria');
        if (target) {
            const index = target.getAttribute('data-index');
            currentDespesaSubcategorias.splice(index, 1);
            renderDespesaSubcategoriasTable();
        }
    });

    editDespesaSubcategoriasForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = editDespesaSubcategoriasForm['editDespesaSubcategoriasId'].value;
        const newCategoriaNome = editDespesaSubcategoriasForm['editDespesaSubcategoriasNome'].value;
        const docRef = doc(db, 'categoria-despesa', docId);

        try {
            await updateDoc(docRef, {
                nome: newCategoriaNome,
                subcategorias: currentDespesaSubcategorias
            });
            alert("Categoria de despesa atualizada com sucesso!");
            closeModal(editDespesaSubcategoriasModal);
        } catch (e) {
            console.error("Erro ao atualizar o documento: ", e);
            alert("Ocorreu um erro ao atualizar a categoria. Tente novamente.");
        }
    });

    // --- Lógica de Edição de Subcategorias de Receita ---
    let currentReceitaSubcategorias = [];

    function renderReceitaSubcategoriasTable() {
        subcategoriasReceitaTableBody.innerHTML = '';
        currentReceitaSubcategorias.forEach((sub, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${sub}</td>
                <td>
                    <button type="button" class="action-btn-small delete-subcategoria" data-index="${index}">
                        <img src="https://api.iconify.design/solar:trash-bin-trash-linear.svg?color=%23F44336" alt="Excluir">
                    </button>
                </td>
            `;
            subcategoriasReceitaTableBody.appendChild(row);
        });
    }

    addSubcategoriaReceitaBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const newSubcategoria = newSubcategoriaReceitaInput.value.trim();
        if (newSubcategoria && !currentReceitaSubcategorias.includes(newSubcategoria)) {
            currentReceitaSubcategorias.push(newSubcategoria);
            newSubcategoriaReceitaInput.value = '';
            renderReceitaSubcategoriasTable();
        }
    });

    subcategoriasReceitaTableBody.addEventListener('click', (e) => {
        const target = e.target.closest('.delete-subcategoria');
        if (target) {
            const index = target.getAttribute('data-index');
            currentReceitaSubcategorias.splice(index, 1);
            renderReceitaSubcategoriasTable();
        }
    });

    editReceitaSubcategoriasForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = editReceitaSubcategoriasForm['editReceitaSubcategoriasId'].value;
        const newCategoriaNome = editReceitaSubcategoriasForm['editReceitaSubcategoriasNome'].value;
        const docRef = doc(db, 'categoria-receita', docId);

        try {
            await updateDoc(docRef, {
                nome: newCategoriaNome,
                subcategorias: currentReceitaSubcategorias
            });
            alert("Categoria de receita atualizada com sucesso!");
            closeModal(editReceitaSubcategoriasModal);
        } catch (e) {
            console.error("Erro ao atualizar o documento: ", e);
            alert("Ocorreu um erro ao atualizar a categoria. Tente novamente.");
        }
    });

    // --- Event Listener para Edição e Exclusão (delegação) ---
    document.querySelector('.cards-container').addEventListener('click', async (e) => {
        const target = e.target.closest('.action-btn-small');
        if (!target) return;
        
        const card = e.target.closest('.card');
        const docId = card.getAttribute('data-id');
        let collectionName;

        if (card.classList.contains('card-caixa')) {
            collectionName = 'caixas';
        } else if (card.classList.contains('card-cartao')) {
            collectionName = 'cartao-credito';
        } else if (card.classList.contains('card-despesa')) {
            collectionName = 'categoria-despesa';
        } else if (card.classList.contains('card-receita')) {
            collectionName = 'categoria-receita';
        }

        if (target.classList.contains('edit-btn')) {
            const modalId = target.getAttribute('data-modal');
            const modal = document.getElementById(modalId);
            const form = modal.querySelector('form');
            
            try {
                const docRef = doc(db, collectionName, docId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (collectionName === 'caixas') {
                        form['editCaixaId'].value = docId;
                        form['editCaixaNome'].value = data.nome;
                        form['editCaixaTipo'].value = data.tipo;
                        form['editCaixaSaldo'].value = data.saldo;
                        form['editCaixaAgencia'].value = data.agencia;
                        form['editCaixaConta'].value = data.conta;
                    } else if (collectionName === 'cartao-credito') {
                        form['editCartaoId'].value = docId;
                        form['editCartaoNome'].value = data.nome;
                        form['editCartaoLimite'].value = data.limite;
                        form['editCartaoAgencia'].value = data.agencia;
                        form['editCartaoConta'].value = data.conta;
                        form['editCartaoFechamento'].value = data.data_de_fechamento;
                        form['editCartaoVencimento'].value = data.data_de_vencimento;
                    } else if (collectionName === 'categoria-despesa') {
                        form['editDespesaSubcategoriasId'].value = docId;
                        form['editDespesaSubcategoriasNome'].value = data.nome;
                        currentDespesaSubcategorias = data.subcategorias ? [...data.subcategorias] : [];
                        renderDespesaSubcategoriasTable();
                    } else if (collectionName === 'categoria-receita') {
                        form['editReceitaSubcategoriasId'].value = docId;
                        form['editReceitaSubcategoriasNome'].value = data.nome;
                        currentReceitaSubcategorias = data.subcategorias ? [...data.subcategorias] : [];
                        renderReceitaSubcategoriasTable();
                    }
                    openModal(modal);
                } else {
                    alert("Documento não encontrado para edição.");
                }
            } catch (error) {
                console.error("Erro ao carregar documento para edição: ", error);
            }
        } else if (target.classList.contains('delete-btn')) {
            if (confirm("Tem certeza que deseja excluir este item? Esta ação não pode ser desfeita.")) {
                try {
                    await deleteDoc(doc(db, collectionName, docId));
                    alert("Item excluído com sucesso!");
                } catch (error) {
                    console.error("Erro ao excluir documento: ", error);
                    alert("Ocorreu um erro ao excluir o item. Tente novamente.");
                }
            }
        }
    });

    // --- Lógica para os formulários de Edição ---
    editCaixaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = editCaixaForm['editCaixaId'].value;
        const docRef = doc(db, 'caixas', docId);

        try {
            await updateDoc(docRef, {
                nome: editCaixaForm['editCaixaNome'].value,
                tipo: editCaixaForm['editCaixaTipo'].value,
                saldo: parseFloat(editCaixaForm['editCaixaSaldo'].value),
                agencia: editCaixaForm['editCaixaAgencia'].value,
                conta: editCaixaForm['editCaixaConta'].value
            });
            alert("Caixa atualizado com sucesso!");
            closeModal(editCaixaModal);
        } catch (e) {
            console.error("Erro ao atualizar o documento: ", e);
            alert("Ocorreu um erro ao atualizar o caixa. Tente novamente.");
        }
    });

    editCartaoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const docId = editCartaoForm['editCartaoId'].value;
        const docRef = doc(db, 'cartao-credito', docId);

        try {
            await updateDoc(docRef, {
                nome: editCartaoForm['editCartaoNome'].value,
                limite: parseFloat(editCartaoForm['editCartaoLimite'].value),
                agencia: editCartaoForm['editCartaoAgencia'].value,
                conta: editCartaoForm['editCartaoConta'].value,
                data_de_fechamento: parseInt(editCartaoForm['editCartaoFechamento'].value),
                data_de_vencimento: parseInt(editCartaoForm['editCartaoVencimento'].value)
            });
            alert("Cartão atualizado com sucesso!");
            closeModal(editCartaoModal);
        } catch (e) {
            console.error("Erro ao atualizar o documento: ", e);
            alert("Ocorreu um erro ao atualizar o cartão. Tente novamente.");
        }
    });
    
    // Antiga função de editar categoria de receita, removida para usar o novo modal de subcategorias
    // editReceitaForm.addEventListener('submit', async (e) => {
    //     e.preventDefault();
    //     const docId = editReceitaForm['editReceitaId'].value;
    //     const docRef = doc(db, 'categoria-receita', docId);

    //     try {
    //         await updateDoc(docRef, {
    //             nome: editReceitaForm['editCategoriaReceitaNome'].value,
    //         });
    //         alert("Categoria de receita atualizada com sucesso!");
    //         closeModal(editReceitaModal);
    //     } catch (e) {
    //         console.error("Erro ao atualizar o documento: ", e);
    //         alert("Ocorreu um erro ao atualizar a categoria. Tente novamente.");
    //     }
    // });

    // --- Lógica de Submissão dos formulários de cadastro ---
    caixaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const caixaNome = caixaForm['caixaNome'].value;
        const caixaTipo = caixaForm['caixaTipo'].value;
        const caixaSaldo = parseFloat(caixaForm['caixaSaldo'].value);
        const caixaAgencia = caixaForm['caixaAgencia'].value;
        const caixaConta = caixaForm['caixaConta'].value;
        try {
            await addDoc(collection(db, "caixas"), {
                nome: caixaNome,
                tipo: caixaTipo,
                saldo: caixaSaldo,
                agencia: caixaAgencia,
                conta: caixaConta,
                userId: currentUser.uid,
                data_de_criacao: serverTimestamp()
            });
            alert("Caixa cadastrado com sucesso!");
            closeModal(caixaModal);
        } catch (e) {
            console.error("Erro ao adicionar o documento: ", e);
            alert("Ocorreu um erro ao cadastrar o caixa. Tente novamente.");
        }
    });

    cartaoForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const cartaoNome = cartaoForm['cartaoNome'].value;
        const cartaoLimite = parseFloat(cartaoForm['cartaoLimite'].value);
        const cartaoAgencia = cartaoForm['cartaoAgencia'].value;
        const cartaoConta = cartaoForm['cartaoConta'].value;
        const cartaoFechamento = parseInt(cartaoForm['cartaoFechamento'].value);
        const cartaoVencimento = parseInt(cartaoForm['cartaoVencimento'].value);
        try {
            await addDoc(collection(db, "cartao-credito"), {
                nome: cartaoNome,
                tipo: "Cartão de Crédito",
                limite: cartaoLimite,
                agencia: cartaoAgencia,
                conta: cartaoConta,
                data_de_fechamento: cartaoFechamento,
                data_de_vencimento: cartaoVencimento,
                userId: currentUser.uid,
                data_de_criacao: serverTimestamp()
            });
            alert("Cartão de crédito cadastrado com sucesso!");
            closeModal(cartaoModal);
        } catch (e) {
            console.error("Erro ao adicionar o documento: ", e);
            alert("Ocorreu um erro ao cadastrar o cartão. Tente novamente.");
        }
    });

    categoriaDespesaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const categoriaNome = categoriaDespesaForm['categoriaDespesaNome'].value;
        try {
            await addDoc(collection(db, "categoria-despesa"), {
                nome: categoriaNome,
                subcategorias: [],
                userId: currentUser.uid,
                data_de_criacao: serverTimestamp()
            });
            alert("Categoria de despesa cadastrada com sucesso!");
            closeModal(despesaModal);
        } catch (e) {
            console.error("Erro ao adicionar o documento: ", e);
            alert("Ocorreu um erro ao cadastrar a categoria. Tente novamente.");
        }
    });

    categoriaReceitaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const categoriaNome = categoriaReceitaForm['categoriaReceitaNome'].value;
        try {
            await addDoc(collection(db, "categoria-receita"), {
                nome: categoriaNome,
                subcategorias: [],
                userId: currentUser.uid,
                data_de_criacao: serverTimestamp()
            });
            alert("Categoria de receita cadastrada com sucesso!");
            closeModal(receitaModal);
        } catch (e) {
            console.error("Erro ao adicionar o documento: ", e);
            alert("Ocorreu um erro ao cadastrar a categoria. Tente novamente.");
        }
    });
});