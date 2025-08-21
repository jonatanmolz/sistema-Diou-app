// despesas.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, getDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser;
    let caixasList = [];
    let cartoesList = [];
    let categoriasDespesaList = [];

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            console.log("Usuário autenticado:", currentUser.uid);
            loadData(currentUser.uid);
        } else {
            window.location.href = "login.html";
        }
    });

    // --- Elementos do DOM e Botões de Ação ---
    const despesaModal = document.getElementById('despesaModal');
    const modalTitle = despesaModal.querySelector('h2');
    const closeBtn = despesaModal.querySelector('.close-btn');
    const despesaForm = document.getElementById('despesaForm');
    
    // Contêineres dos cards
    const caixasContainer = document.getElementById('caixasContainer');
    const cartoesContainer = document.getElementById('cartoesContainer');
    
    // Tabela de despesas
    const despesasTableBody = document.getElementById('despesasTableBody');

    // Campos do formulário
    const formaPagamentoInput = document.getElementById('formaPagamentoInput');
    const itemLancamentoIdInput = document.getElementById('itemLancamentoId');
    const categoriaSelect = document.getElementById('despesaCategoria');
    const subcategoriaField = document.getElementById('subcategoriaField');
    const subcategoriaSelect = document.getElementById('despesaSubcategoria');
    const parcelamentoContainer = document.getElementById('parcelamentoContainer');
    const parcelamentoCheckbox = document.getElementById('despesaParcelamento');
    const parcelasField = document.getElementById('parcelasField');
    const numParcelasInput = document.getElementById('despesaNumParcelas');
    const gerarParcelasBtn = document.getElementById('gerarParcelasBtn');
    const parcelasTableContainer = document.getElementById('parcelasTableContainer');
    const parcelasTableBody = document.querySelector('#parcelasTable tbody');
    const despesaValorInput = document.getElementById('despesaValor');
    const despesaDataInput = document.getElementById('despesaData');
    
    // --- Funções do Modal ---
    function openModal(modal) {
        // Preenche a data de compra com a data atual
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        despesaDataInput.value = `${yyyy}-${mm}-${dd}`;

        modal.style.display = 'flex';
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        despesaForm.reset();
        hideAllDynamicFields();
    }

    function hideAllDynamicFields() {
        subcategoriaField.classList.add('hidden');
        parcelamentoContainer.classList.add('hidden');
        parcelasField.classList.add('hidden');
        parcelasTableContainer.classList.add('hidden');
    }

    closeBtn.addEventListener('click', () => closeModal(despesaModal));
    window.addEventListener('click', (e) => {
        if (e.target === despesaModal) {
            closeModal(despesaModal);
        }
    });

    // --- Funções de Exibição dos Cards ---
    function displayCaixas(caixas) {
        caixasContainer.innerHTML = '';
        caixas.forEach(caixa => {
            const card = document.createElement('div');
            card.className = 'card card-caixa';
            card.setAttribute('data-id', caixa.id);
            card.setAttribute('data-tipo', 'caixa');
            card.innerHTML = `
                <h3>${caixa.nome}</h3>
                <p><strong>Tipo:</strong> ${caixa.tipo}</p>
                <p><strong>Saldo:</strong> R$ ${caixa.saldo.toFixed(2)}</p>
            `;
            caixasContainer.appendChild(card);
        });
    }
    
    function displayCartoes(cartoes) {
        cartoesContainer.innerHTML = '';
        cartoes.forEach(cartao => {
            const card = document.createElement('div');
            card.className = 'card card-cartao';
            card.setAttribute('data-id', cartao.id);
            card.setAttribute('data-tipo', 'cartao');
            card.innerHTML = `
                <h3>${cartao.nome}</h3>
                <p><strong>Fechamento:</strong> Dia ${cartao.data_de_fechamento}</p>
                <p><strong>Vencimento:</strong> Dia ${cartao.data_de_vencimento}</p>
            `;
            cartoesContainer.appendChild(card);
        });
    }

    // --- FUNÇÃO ATUALIZADA PARA EXIBIR LANÇAMENTOS NA TABELA ---
    function displayDespesas(despesas) {
        despesasTableBody.innerHTML = '';
        despesas.forEach(despesa => {
            const row = document.createElement('tr');
            
            // Busca o nome da categoria
            const categoria = categoriasDespesaList.find(c => c.id === despesa.categoria_id);
            const categoriaNome = categoria ? categoria.nome : 'N/A';
            const subcategoria = despesa.subcategoria || 'N/A';

            // Busca o nome do caixa ou cartão
            let itemPagamentoNome = 'N/A';
            if (despesa.forma_pagamento === 'caixa') {
                const caixa = caixasList.find(c => c.id === despesa.caixa_id);
                itemPagamentoNome = caixa ? caixa.nome : 'N/A';
            } else if (despesa.forma_pagamento === 'cartao') {
                const cartao = cartoesList.find(c => c.id === despesa.cartao_id);
                itemPagamentoNome = cartao ? cartao.nome : 'N/A';
            }

            const dataCompraFormatada = new Date(despesa.data_compra).toLocaleDateString('pt-BR');
            const dataVencimentoFormatada = despesa.data_vencimento ? new Date(despesa.data_vencimento).toLocaleDateString('pt-BR') : 'N/A';
            
            row.innerHTML = `
                <td>${dataCompraFormatada}</td>
                <td>${despesa.descricao}</td>
                <td>${categoriaNome}</td>
                <td>${subcategoria}</td>
                <td>R$ ${despesa.valor.toFixed(2)}</td>
                <td>${dataVencimentoFormatada}</td>
                <td>${itemPagamentoNome}</td>
            `;
            despesasTableBody.appendChild(row);
        });
    }

    // --- Lógica para o click nos cards ---
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.card');
        if (card) {
            const id = card.getAttribute('data-id');
            const tipo = card.getAttribute('data-tipo');
            const nome = card.querySelector('h3').textContent; 
            
            // Preenche os campos ocultos
            formaPagamentoInput.value = tipo;
            itemLancamentoIdInput.value = id;
            
            // Atualiza o título do modal com o nome do item
            modalTitle.textContent = `Lançar Despesa em ${nome}`;

            // Exibe/esconde campos de parcelamento
            if (tipo === 'cartao') {
                parcelamentoContainer.classList.remove('hidden');
            } else {
                parcelamentoContainer.classList.add('hidden');
            }
            
            openModal(despesaModal);
        }
    });

    // Lógica do Parcelamento do Cartão
    parcelamentoCheckbox.addEventListener('change', () => {
        if (parcelamentoCheckbox.checked) {
            parcelasField.classList.remove('hidden');
        } else {
            parcelasField.classList.add('hidden');
            parcelasTableContainer.classList.add('hidden');
        }
    });

    gerarParcelasBtn.addEventListener('click', () => {
        const valorTotal = parseFloat(despesaValorInput.value);
        const numParcelas = parseInt(numParcelasInput.value);
        const dataCompra = new Date(despesaDataInput.value + 'T12:00:00');
        const cartaoId = itemLancamentoIdInput.value;
        
        if (isNaN(valorTotal) || isNaN(numParcelas) || !cartaoId || numParcelas <= 0) {
            alert('Por favor, preencha o valor, um número de parcelas válido e selecione um cartão.');
            return;
        }

        const cartaoSelecionado = cartoesList.find(c => c.id === cartaoId);
        if (!cartaoSelecionado) {
            alert('Cartão não encontrado.');
            return;
        }

        const valorParcelaBase = valorTotal / numParcelas;
        parcelasTableBody.innerHTML = '';
        parcelasTableContainer.classList.remove('hidden');

        // Lógica de cálculo do vencimento base
        const diaFechamento = cartaoSelecionado.data_de_fechamento;
        const diaVencimento = cartaoSelecionado.data_de_vencimento;

        let dataPrimeiroVencimento = new Date(dataCompra);
        
        // Se a data da compra for superior ao dia de fechamento,
        // o vencimento da primeira parcela será no próximo mês
        if (dataCompra.getDate() > diaFechamento) {
            dataPrimeiroVencimento.setMonth(dataPrimeiroVencimento.getMonth() + 1);
        }
        
        dataPrimeiroVencimento.setDate(diaVencimento);

        for (let i = 1; i <= numParcelas; i++) {
            const dataVencimento = new Date(dataPrimeiroVencimento);
            dataVencimento.setMonth(dataVencimento.getMonth() + (i - 1));
            
            // Arredonda o valor da última parcela para compensar a diferença
            const valorParcelaArredondado = (i < numParcelas) ? parseFloat(valorParcelaBase.toFixed(2)) : parseFloat((valorTotal - (Math.floor(valorParcelaBase * 100) / 100) * (numParcelas - 1)).toFixed(2));

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${i}/${numParcelas}</td>
                <td><input type="number" class="parcela-valor" step="0.01" value="${valorParcelaArredondado}"></td>
                <td><input type="date" class="parcela-data" value="${dataVencimento.toISOString().slice(0, 10)}"></td>
            `;
            parcelasTableBody.appendChild(row);
        }
    });

    // Lógica para preencher subcategorias
    categoriaSelect.addEventListener('change', (e) => {
        const categoriaId = e.target.value;
        const categoriaSelecionada = categoriasDespesaList.find(c => c.id === categoriaId);
        subcategoriaSelect.innerHTML = '';
        if (categoriaSelecionada && categoriaSelecionada.subcategorias && categoriaSelecionada.subcategorias.length > 0) {
            subcategoriaField.classList.remove('hidden');
            categoriaSelecionada.subcategorias.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub;
                option.textContent = sub;
                subcategoriaSelect.appendChild(option);
            });
        } else {
            subcategoriaField.classList.add('hidden');
        }
    });

    // --- Funções de Carregamento de Dados ---
    function populateSelect(selectElement, items, textKey) {
        selectElement.innerHTML = '';
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Selecione...';
        selectElement.appendChild(defaultOption);
        items.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item[textKey];
            selectElement.appendChild(option);
        });
    }

    function loadData(userId) {
        // Carrega Caixas
        const qCaixas = query(collection(db, "caixas"), where("userId", "==", userId));
        onSnapshot(qCaixas, (querySnapshot) => {
            caixasList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            displayCaixas(caixasList);
            // Recarrega as despesas após a atualização dos dados de caixas
            loadDespesas(userId);
        });

        // Carrega Cartões de Crédito
        const qCartoes = query(collection(db, "cartao-credito"), where("userId", "==", userId));
        onSnapshot(qCartoes, (querySnapshot) => {
            cartoesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            displayCartoes(cartoesList);
            // Recarrega as despesas após a atualização dos dados de cartões
            loadDespesas(userId);
        });

        // Carrega Categorias de Despesa
        const qCategorias = query(collection(db, "categoria-despesa"), where("userId", "==", userId));
        onSnapshot(qCategorias, (querySnapshot) => {
            categoriasDespesaList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateSelect(categoriaSelect, categoriasDespesaList, 'nome');
            // Recarrega as despesas após a atualização dos dados de categorias
            loadDespesas(userId);
        });
        
        // Função para carregar e exibir lançamentos recentes
        function loadDespesas(userId) {
            const qDespesas = query(collection(db, "lancamentos"), where("userId", "==", userId), orderBy("data_de_criacao", "desc"));
            onSnapshot(qDespesas, (querySnapshot) => {
                const despesas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                // Garante que todas as listas de dados estejam carregadas antes de exibir a tabela
                if (caixasList.length > 0 || cartoesList.length > 0 || categoriasDespesaList.length > 0) {
                    displayDespesas(despesas);
                }
            });
        }
    }

    // --- Lógica de Submissão do Formulário ---
    despesaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const descricao = document.getElementById('despesaDescricao').value;
        const valor = parseFloat(document.getElementById('despesaValor').value);
        const dataCompra = document.getElementById('despesaData').value;
        const formaPagamento = formaPagamentoInput.value;
        const itemLancamentoId = itemLancamentoIdInput.value;
        const categoriaId = categoriaSelect.value;
        const subcategoria = subcategoriaSelect.value || null;
        const observacoes = document.getElementById('despesaObservacoes').value;
        
        if (formaPagamento === 'caixa') {
            const caixa = caixasList.find(c => c.id === itemLancamentoId);
            
            if (!caixa) {
                alert('Caixa selecionado não é válido.');
                return;
            }

            try {
                await addDoc(collection(db, "lancamentos"), {
                    descricao,
                    valor,
                    data_compra: dataCompra,
                    tipo: 'despesa',
                    forma_pagamento: 'caixa',
                    caixa_id: itemLancamentoId,
                    categoria_id: categoriaId,
                    subcategoria,
                    observacoes,
                    userId: currentUser.uid,
                    data_de_criacao: serverTimestamp()
                });

                const novoSaldo = caixa.saldo - valor;
                await updateDoc(doc(db, "caixas", itemLancamentoId), {
                    saldo: novoSaldo
                });

                alert("Despesa lançada com sucesso!");
                closeModal(despesaModal);
            } catch (error) {
                console.error("Erro ao lançar despesa no caixa: ", error);
                alert("Ocorreu um erro ao lançar a despesa. Tente novamente.");
            }

        } else if (formaPagamento === 'cartao') {
            const isParcelado = parcelamentoCheckbox.checked;
            const numParcelas = isParcelado ? parseInt(numParcelasInput.value) : 1;
            const cartao = cartoesList.find(c => c.id === itemLancamentoId);

            if (!cartao) {
                alert('Cartão de crédito selecionado não é válido.');
                return;
            }

            try {
                if (isParcelado) {
                    const parcelas = parcelasTableBody.querySelectorAll('tr');
                    for (let i = 0; i < parcelas.length; i++) {
                        const valorInput = parcelas.item(i).querySelector('.parcela-valor');
                        const dataInput = parcelas.item(i).querySelector('.parcela-data');
                        if (valorInput && dataInput) {
                            const valorParcela = parseFloat(valorInput.value);
                            const dataVencimento = dataInput.value;

                            await addDoc(collection(db, "lancamentos"), {
                                descricao: `${descricao} - Parcela ${i + 1}/${numParcelas}`,
                                valor: valorParcela,
                                data_compra: dataCompra,
                                data_vencimento: dataVencimento,
                                tipo: 'despesa',
                                forma_pagamento: 'cartao',
                                cartao_id: itemLancamentoId,
                                categoria_id: categoriaId,
                                subcategoria,
                                observacoes,
                                status_pagamento: 'pendente',
                                userId: currentUser.uid,
                                data_de_criacao: serverTimestamp()
                            });
                        }
                    }
                    alert("Despesa parcelada lançada no cartão com sucesso!");
                } else {
                    await addDoc(collection(db, "lancamentos"), {
                        descricao: descricao,
                        valor: valor,
                        data_compra: dataCompra,
                        data_vencimento: despesaDataInput.value,
                        tipo: 'despesa',
                        forma_pagamento: 'cartao',
                        cartao_id: itemLancamentoId,
                        categoria_id: categoriaId,
                        subcategoria,
                        observacoes,
                        status_pagamento: 'pendente',
                        userId: currentUser.uid,
                        data_de_criacao: serverTimestamp()
                    });
                    alert("Despesa à vista lançada no cartão com sucesso!");
                }
                closeModal(despesaModal);

            } catch (error) {
                console.error("Erro ao lançar despesa no cartão: ", error);
                alert("Ocorreu um erro ao lançar a despesa. Tente novamente.");
            }
        }
    });
});