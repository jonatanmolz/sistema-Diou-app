// contas-a-receber.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser;
    let categoriasList = [];
    let contasList = [];
    let caixasList = [];
    let contaEmEdicaoId = null;

    // Elementos do DOM
    const contasModal = document.getElementById('contasModal');
    const pagarFaturaModal = document.getElementById('pagarFaturaModal');
    const adicionarContaBtn = document.getElementById('adicionarContaBtn');
    const contasForm = document.getElementById('contasForm');
    const contasTableBody = document.getElementById('contasTableBody');
    const filtroCategoria = document.getElementById('filtroCategoria');
    const filtroDescricao = document.getElementById('filtroDescricao');
    const filtroDataInicio = document.getElementById('filtroDataInicio');
    const filtroDataFim = document.getElementById('filtroDataFim');
    const filtroStatus = document.getElementById('filtroStatus');
    const contaRecorrenteCheckbox = document.getElementById('contaRecorrente');
    const parcelasField = document.getElementById('parcelasField');
    const gerarParcelasBtn = document.getElementById('gerarParcelasBtn');
    const parcelasTableContainer = document.getElementById('parcelasTableContainer');
    const parcelasTableBody = document.getElementById('parcelasTableBody');
    const contaVencimentoInput = document.getElementById('contaVencimento');
    const contaCategoriaSelect = document.getElementById('contaCategoria');
    const contaSubcategoriaSelect = document.getElementById('contaSubcategoria');
    const subcategoriaField = document.getElementById('subcategoriaField');
    const pagamentoFaturaForm = document.getElementById('pagamentoFaturaForm');
    const faturaCaixaSelect = document.getElementById('faturaCaixaSelect');
    const faturaValorPagoInput = document.getElementById('faturaValorPago');
    
    let contaParaReceber = null;

    // Funções do Modal
    function openModal(modal) {
        modal.style.display = 'flex';
    }

    function closeModal(modal) {
        modal.style.display = 'none';
        contasForm.reset();
        pagamentoFaturaForm.reset();
        parcelasField.classList.remove('hidden');
        parcelasTableContainer.classList.add('hidden');
        contaRecorrenteCheckbox.checked = false;
        contaVencimentoInput.valueAsDate = new Date();
        contaEmEdicaoId = null;
    }

    document.querySelectorAll('.close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            closeModal(btn.closest('.modal'));
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === contasModal) {
            closeModal(contasModal);
        }
        if (e.target === pagarFaturaModal) {
            closeModal(pagarFaturaModal);
        }
    });

    // Lógica para o modal
    adicionarContaBtn.addEventListener('click', () => {
        contaVencimentoInput.valueAsDate = new Date();
        openModal(contasModal);
    });

    contaRecorrenteCheckbox.addEventListener('change', () => {
        if (contaRecorrenteCheckbox.checked) {
            parcelasField.classList.add('hidden');
            parcelasTableContainer.classList.add('hidden');
        } else {
            parcelasField.classList.remove('hidden');
        }
    });

    // Lógica para Subcategorias
    contaCategoriaSelect.addEventListener('change', () => {
        const categoriaId = contaCategoriaSelect.value;
        const categoria = categoriasList.find(c => c.id === categoriaId);
        
        if (categoria && categoria.subcategorias && categoria.subcategorias.length > 0) {
            subcategoriaField.classList.remove('hidden');
            contaSubcategoriaSelect.innerHTML = '<option value="" disabled selected>Selecione...</option>';
            contaSubcategoriaSelect.disabled = false;
            categoria.subcategorias.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub;
                option.textContent = sub;
                contaSubcategoriaSelect.appendChild(option);
            });
        } else {
            subcategoriaField.classList.add('hidden');
            contaSubcategoriaSelect.disabled = true;
            contaSubcategoriaSelect.innerHTML = '<option value="">N/A</option>';
        }
    });

    // Lógica para Parcelamento
    gerarParcelasBtn.addEventListener('click', () => {
        const valor = parseFloat(document.getElementById('contaValor').value);
        const dataVencimento = document.getElementById('contaVencimento').value;
        const numParcelas = parseInt(document.getElementById('numParcelas').value);

        if (isNaN(valor) || isNaN(numParcelas) || numParcelas < 1) {
            alert('Por favor, insira um valor e um número de parcelas válidos.');
            return;
        }

        parcelasTableBody.innerHTML = '';
        parcelasTableContainer.classList.remove('hidden');
        // AQUI ESTÁ A MUDANÇA: o valor da parcela é igual ao valor total, não dividido.
        const valorParcela = valor; 

        for (let i = 0; i < numParcelas; i++) {
            const dataParcela = new Date(dataVencimento + 'T12:00:00');
            dataParcela.setMonth(dataParcela.getMonth() + i);

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${i + 1}/${numParcelas}</td>
                <td contenteditable="true" data-valor="${valorParcela.toFixed(2)}">R$ ${valorParcela.toFixed(2)}</td>
                <td contenteditable="true" data-vencimento="${dataParcela.toISOString().slice(0, 10)}">${dataParcela.toLocaleDateString('pt-BR')}</td>
            `;
            parcelasTableBody.appendChild(row);
        }
    });

    // Submissão do Formulário de nova conta
    contasForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const descricao = document.getElementById('contaDescricao').value;
        const valor = parseFloat(document.getElementById('contaValor').value);
        const dataVencimento = document.getElementById('contaVencimento').value;
        const categoriaId = document.getElementById('contaCategoria').value;
        const subcategoria = document.getElementById('contaSubcategoria').value || null;
        const observacoes = document.getElementById('contaObservacoes').value;
        const isRecorrente = contaRecorrenteCheckbox.checked;

        if (contaEmEdicaoId) {
            // Lógica de Edição
            try {
                const contaRef = doc(db, "contas-a-receber", contaEmEdicaoId);
                await updateDoc(contaRef, {
                    descricao,
                    valor,
                    data_vencimento: dataVencimento,
                    categoria_id: categoriaId,
                    subcategoria,
                    observacoes,
                });
                alert("Conta atualizada com sucesso!");
                closeModal(contasModal);
            } catch (error) {
                console.error("Erro ao atualizar a conta: ", error);
                alert("Ocorreu um erro ao atualizar a conta. Tente novamente.");
            }
        } else {
            // Lógica de Adição
            if (isRecorrente) {
                try {
                    await addDoc(collection(db, "contas-a-receber"), {
                        descricao,
                        valor,
                        data_vencimento: dataVencimento,
                        tipo: 'recorrente',
                        categoria_id: categoriaId,
                        subcategoria,
                        observacoes,
                        status_pagamento: 'pendente',
                        userId: currentUser.uid,
                        data_de_criacao: serverTimestamp()
                    });
                    alert("Conta recorrente lançada com sucesso!");
                    closeModal(contasModal);
                } catch (error) {
                    console.error("Erro ao lançar conta: ", error);
                    alert("Ocorreu um erro ao lançar a conta. Tente novamente.");
                }
            } else {
                const parcelasRows = parcelasTableBody.querySelectorAll('tr');
                if (parcelasRows.length > 0) {
                    try {
                        for (const row of parcelasRows) {
                            const parcelaDesc = row.cells[0].textContent;
                            const valorText = row.cells[1].textContent.replace('R$', '').replace(',', '.').trim();
                            const dataText = row.cells[2].textContent;

                            const valorParcela = parseFloat(valorText);
                            const dataVencimentoParcela = new Date(dataText.split('/').reverse().join('-'));

                            await addDoc(collection(db, "contas-a-receber"), {
                                descricao: `${descricao} - ${parcelaDesc}`,
                                valor: valorParcela,
                                data_vencimento: dataVencimentoParcela.toISOString().slice(0, 10),
                                tipo: 'parcelada',
                                categoria_id: categoriaId,
                                subcategoria,
                                observacoes,
                                status_pagamento: 'pendente',
                                userId: currentUser.uid,
                                data_de_criacao: serverTimestamp()
                            });
                        }
                        alert("Contas parceladas lançadas com sucesso!");
                        closeModal(contasModal);
                    } catch (error) {
                        console.error("Erro ao lançar contas parceladas: ", error);
                        alert("Ocorreu um erro ao lançar as contas. Tente novamente.");
                    }
                } else {
                    try {
                        await addDoc(collection(db, "contas-a-receber"), {
                            descricao,
                            valor,
                            data_vencimento: dataVencimento,
                            tipo: 'única',
                            categoria_id: categoriaId,
                            subcategoria,
                            observacoes,
                            status_pagamento: 'pendente',
                            userId: currentUser.uid,
                            data_de_criacao: serverTimestamp()
                        });
                        alert("Conta lançada com sucesso!");
                        closeModal(contasModal);
                    } catch (error) {
                        console.error("Erro ao lançar conta: ", error);
                        alert("Ocorreu um erro ao lançar a conta. Tente novamente.");
                    }
                }
            }
        }
    });

    // Submissão do Formulário de pagamento de fatura
    pagamentoFaturaForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const dataPagamento = document.getElementById('faturaDataPagamento').value;
        const caixaId = document.getElementById('faturaCaixaSelect').value;
        const valorRecebido = parseFloat(faturaValorPagoInput.value);

        if (!contaParaReceber || !dataPagamento || !caixaId || isNaN(valorRecebido)) {
            alert('Por favor, preencha todos os campos corretamente.');
            return;
        }

        try {
            // 1. Marcar a conta como recebida (usando o ID da conta armazenada)
            const contaRef = doc(db, "contas-a-receber", contaParaReceber.id);
            await updateDoc(contaRef, {
                status_pagamento: "pago",
                data_pagamento: dataPagamento
            });

            // 2. Adicionar o valor ao saldo do caixa
            const caixaRef = doc(db, "caixas", caixaId);
            const caixaDoc = await getDocs(query(collection(db, "caixas"), where("userId", "==", currentUser.uid), where("__name__", "==", caixaId)));
            const caixaData = caixaDoc.docs[0]?.data();
            
            if (caixaData) {
                const novoSaldo = caixaData.saldo + valorRecebido;
                await updateDoc(caixaRef, { saldo: novoSaldo });
            }

            // 3. Se for uma conta recorrente, criar a próxima para o mês seguinte
            if (contaParaReceber.tipo === 'recorrente') {
                const dataVencimentoAtual = new Date(contaParaReceber.data_vencimento + 'T12:00:00');
                const proximaDataVencimento = new Date(dataVencimentoAtual);
                proximaDataVencimento.setMonth(proximaDataVencimento.getMonth() + 1);

                await addDoc(collection(db, "contas-a-receber"), {
                    descricao: contaParaReceber.descricao,
                    valor: contaParaReceber.valor,
                    data_vencimento: proximaDataVencimento.toISOString().slice(0, 10),
                    tipo: 'recorrente',
                    categoria_id: contaParaReceber.categoria_id,
                    subcategoria: contaParaReceber.subcategoria,
                    observacoes: contaParaReceber.observacoes,
                    status_pagamento: 'pendente',
                    userId: currentUser.uid,
                    data_de_criacao: serverTimestamp()
                });
            }

            alert("Conta recebida com sucesso e saldo do caixa atualizado!");
            closeModal(pagarFaturaModal);

        } catch (error) {
            console.error("Erro ao processar o recebimento: ", error);
            alert("Ocorreu um erro ao processar o recebimento. Tente novamente.");
        }
    });

    // --- Funções de Carregamento de Dados ---
    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadData(currentUser.uid);
            setupRealtimeListeners(currentUser.uid);
        } else {
            window.location.href = "login.html";
        }
    });
    
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

    async function loadData(userId) {
        const qCategorias = query(collection(db, "categoria-receita"), where("userId", "==", userId));
        const qContas = query(collection(db, "contas-a-receber"), where("userId", "==", userId));
        const qCaixas = query(collection(db, "caixas"), where("userId", "==", userId));
    
        const [categoriasDocs, contasDocs, caixasDocs] = await Promise.all([
            getDocs(qCategorias),
            getDocs(qContas),
            getDocs(qCaixas)
        ]);

        categoriasList = categoriasDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        contasList = contasDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        caixasList = caixasDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        populateSelect(document.getElementById('contaCategoria'), categoriasList, 'nome');
        populateSelect(filtroCategoria, categoriasList, 'nome');
        populateSelect(faturaCaixaSelect, caixasList, 'nome');

        renderizarContas(contasList);
    }
    
    function setupRealtimeListeners(userId) {
        onSnapshot(query(collection(db, "contas-a-receber"), where("userId", "==", userId)), (querySnapshot) => {
            contasList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderizarContas(contasList);
        });
        
        // NOVO: Ouvinte em tempo real para os caixas
        onSnapshot(query(collection(db, "caixas"), where("userId", "==", userId)), (querySnapshot) => {
            caixasList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateSelect(faturaCaixaSelect, caixasList, 'nome');
        });
    }
    
    function renderizarContas(contas) {
        contasTableBody.innerHTML = '';
        const contasFiltradas = filtrarContas(contas);
        
        contasFiltradas.sort((a, b) => new Date(a.data_vencimento) - new Date(b.data_vencimento));

        const hoje = new Date().toISOString().slice(0, 10);
        
        contasFiltradas.forEach(conta => {
            let statusExibido = conta.status_pagamento;
            if (conta.status_pagamento === 'pendente' && conta.data_vencimento < hoje) {
                statusExibido = 'atrasada';
            }

            const categoriaNome = categoriasList.find(c => c.id === conta.categoria_id)?.nome || 'N/A';
            const row = document.createElement('tr');
            const dataVencimentoFormatada = new Date(conta.data_vencimento + 'T12:00:00').toLocaleDateString('pt-BR');
            const statusBadge = `<span class="status-badge status-${statusExibido}">${statusExibido}</span>`;
            
            row.innerHTML = `
                <td>${dataVencimentoFormatada}</td>
                <td>${conta.descricao}</td>
                <td>R$ ${conta.valor.toFixed(2)}</td>
                <td>${categoriaNome}</td>
                <td>${conta.subcategoria || 'N/A'}</td>
                <td>${statusBadge}</td>
                <td class="acoes">
                    <button class="btn-pagar" data-id="${conta.id}" data-tipo="${conta.tipo}">Receber</button>
                    <button class="btn-editar" data-id="${conta.id}" ${conta.status_pagamento === 'pago' ? 'disabled' : ''}>Editar</button>
                    <button class="btn-excluir" data-id="${conta.id}">Excluir</button>
                </td>
            `;
            contasTableBody.appendChild(row);
        });
    }
    
    // Lógica de Filtro
    [filtroDescricao, filtroDataInicio, filtroDataFim, filtroCategoria, filtroStatus].forEach(filtro => {
        filtro.addEventListener('input', () => {
            renderizarContas(contasList);
        });
    });

    function filtrarContas(contas) {
        const descricao = filtroDescricao.value.toLowerCase();
        const dataInicio = filtroDataInicio.value;
        const dataFim = filtroDataFim.value;
        const categoriaId = filtroCategoria.value;
        const statusFiltro = filtroStatus.value;
        const hoje = new Date().toISOString().slice(0, 10);

        return contas.filter(conta => {
            const dataVencimento = conta.data_vencimento;
            
            const matchDescricao = !descricao || conta.descricao.toLowerCase().includes(descricao);
            const matchDataInicio = !dataInicio || dataVencimento >= dataInicio;
            const matchDataFim = !dataFim || dataVencimento <= dataFim;
            const matchCategoria = !categoriaId || conta.categoria_id === categoriaId;
            
            let matchStatus = true;
            if (statusFiltro !== 'todos') {
                let statusDaConta = conta.status_pagamento;
                if (statusDaConta === 'pendente' && dataVencimento < hoje) {
                    statusDaConta = 'atrasada';
                }
                matchStatus = statusDaConta === statusFiltro;
            }

            return matchDescricao && matchDataInicio && matchDataFim && matchCategoria && matchStatus;
        });
    }

    function openEditModal(conta) {
        document.getElementById('contasModal').querySelector('h2').textContent = 'Editar Conta';
        document.getElementById('contaDescricao').value = conta.descricao;
        document.getElementById('contaValor').value = conta.valor;
        document.getElementById('contaVencimento').value = conta.data_vencimento;
        document.getElementById('contaCategoria').value = conta.categoria_id;
        
        // Habilita as subcategorias
        const categoria = categoriasList.find(c => c.id === conta.categoria_id);
        if (categoria && categoria.subcategorias && categoria.subcategorias.length > 0) {
            subcategoriaField.classList.remove('hidden');
            contaSubcategoriaSelect.innerHTML = '<option value="" disabled selected>Selecione...</option>';
            contaSubcategoriaSelect.disabled = false;
            categoria.subcategorias.forEach(sub => {
                const option = document.createElement('option');
                option.value = sub;
                option.textContent = sub;
                contaSubcategoriaSelect.appendChild(option);
            });
            contaSubcategoriaSelect.value = conta.subcategoria || '';
        } else {
            subcategoriaField.classList.add('hidden');
            contaSubcategoriaSelect.disabled = true;
            contaSubcategoriaSelect.innerHTML = '<option value="">N/A</option>';
        }

        document.getElementById('contaObservacoes').value = conta.observacoes || '';
        document.getElementById('parcelasField').classList.add('hidden');
        document.getElementById('parcelasTableContainer').classList.add('hidden');
        document.getElementById('contaRecorrente').checked = conta.tipo === 'recorrente';

        contaEmEdicaoId = conta.id;
        openModal(contasModal);
    }

    // Lógica de Ações da Tabela
    contasTableBody.addEventListener('click', async (e) => {
        if (e.target.classList.contains('btn-pagar')) {
            const id = e.target.getAttribute('data-id');
            contaParaReceber = contasList.find(c => c.id === id);

            if (!contaParaReceber) {
                alert("Conta não encontrada. Por favor, recarregue a página.");
                return;
            }

            faturaValorPagoInput.value = contaParaReceber.valor.toFixed(2);
            document.getElementById('faturaDataPagamento').valueAsDate = new Date();
            openModal(pagarFaturaModal);
        } else if (e.target.classList.contains('btn-editar')) {
            const id = e.target.getAttribute('data-id');
            const conta = contasList.find(c => c.id === id);
            
            if (conta && conta.status_pagamento !== 'pago') {
                openEditModal(conta);
            } else {
                alert("Não é possível editar uma conta já recebida.");
            }
        } else if (e.target.classList.contains('btn-excluir')) {
            const id = e.target.getAttribute('data-id');
            if (confirm("Tem certeza que deseja excluir esta conta?")) {
                await deleteDoc(doc(db, "contas-a-receber", id));
                alert("Conta excluída com sucesso!");
            }
        }
    });
});