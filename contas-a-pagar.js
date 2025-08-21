// contas-a-pagar.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, deleteDoc, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser;
    let categoriasList = [];
    let contasList = [];
    let caixasList = [];
    let cartoesList = [];
    let lancamentosList = [];
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
    
    // Novos elementos do modal de detalhes da fatura
    const detalhesFaturaModal = document.getElementById('detalhesFaturaModal');
    const detalhesFaturaTitulo = document.getElementById('detalhesFaturaTitulo');
    const detalhesFaturaTableBody = document.getElementById('detalhesFaturaTableBody');


    let contaParaPagar = null;

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
        if (e.target === detalhesFaturaModal) {
            closeModal(detalhesFaturaModal);
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
        const valorParcela = valor / numParcelas;

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
                const contaRef = doc(db, "contas-a-pagar", contaEmEdicaoId);
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
                    await addDoc(collection(db, "contas-a-pagar"), {
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

                            await addDoc(collection(db, "contas-a-pagar"), {
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
                        await addDoc(collection(db, "contas-a-pagar"), {
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
        const valorPago = parseFloat(faturaValorPagoInput.value);

        if (!contaParaPagar || !dataPagamento || !caixaId || isNaN(valorPago)) {
            alert('Por favor, preencha todos os campos corretamente.');
            return;
        }

        try {
            // Lógica para faturas de cartão de crédito
            if (contaParaPagar.tipo === 'fatura') {
                const [_, cartaoId, ano, mes] = contaParaPagar.id.split('_');

                const qLancamentosFatura = query(collection(db, "lancamentos"),
                    where("userId", "==", currentUser.uid),
                    where("cartao_id", "==", cartaoId),
                    where("data_vencimento", ">=", `${ano}-${mes.padStart(2, '0')}-01`),
                    where("data_vencimento", "<=", `${ano}-${mes.padStart(2, '0')}-31`)
                );
                const lancamentosFaturaDocs = await getDocs(qLancamentosFatura);

                // Atualizar o status de cada lançamento da fatura
                const batch = writeBatch(db); 
                lancamentosFaturaDocs.docs.forEach(docSnap => {
                    const lancamentoRef = doc(db, "lancamentos", docSnap.id);
                    batch.update(lancamentoRef, { status_pagamento: "pago", data_pagamento: dataPagamento });
                });
                await batch.commit();

            } else { // Lógica para contas a pagar normais
                const contaRef = doc(db, "contas-a-pagar", contaParaPagar.id);
                await updateDoc(contaRef, {
                    status_pagamento: "pago",
                    data_pagamento: dataPagamento
                });

                 // Se for uma conta recorrente, criar a próxima para o mês seguinte
                if (contaParaPagar.tipo === 'recorrente') {
                    const dataVencimentoAtual = new Date(contaParaPagar.data_vencimento + 'T12:00:00');
                    const proximaDataVencimento = new Date(dataVencimentoAtual);
                    proximaDataVencimento.setMonth(proximaDataVencimento.getMonth() + 1);

                    await addDoc(collection(db, "contas-a-pagar"), {
                        descricao: contaParaPagar.descricao,
                        valor: contaParaPagar.valor,
                        data_vencimento: proximaDataVencimento.toISOString().slice(0, 10),
                        tipo: 'recorrente',
                        categoria_id: contaParaPagar.categoria_id,
                        subcategoria: contaParaPagar.subcategoria,
                        observacoes: contaParaPagar.observacoes,
                        status_pagamento: 'pendente',
                        userId: currentUser.uid,
                        data_de_criacao: serverTimestamp()
                    });
                }
            }
            
            // Abater o valor do saldo do caixa (lógica comum para ambos os casos)
            const caixaRef = doc(db, "caixas", caixaId);
            const caixaDoc = await getDocs(query(collection(db, "caixas"), where("userId", "==", currentUser.uid), where("__name__", "==", caixaId)));
            const caixaData = caixaDoc.docs[0]?.data();
            
            if (caixaData) {
                const novoSaldo = caixaData.saldo - valorPago;
                await updateDoc(caixaRef, { saldo: novoSaldo });
            }

            alert("Conta paga com sucesso e saldo do caixa atualizado!");
            closeModal(pagarFaturaModal);

        } catch (error) {
            console.error("Erro ao processar o pagamento: ", error);
            alert("Ocorreu um erro ao processar o pagamento. Tente novamente.");
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
        const qCategorias = query(collection(db, "categoria-despesa"), where("userId", "==", userId));
        const qContas = query(collection(db, "contas-a-pagar"), where("userId", "==", userId));
        const qCaixas = query(collection(db, "caixas"), where("userId", "==", userId));
        const qCartoes = query(collection(db, "cartao-credito"), where("userId", "==", userId));
        const qLancamentos = query(collection(db, "lancamentos"), where("userId", "==", userId), where("forma_pagamento", "==", "cartao"));
    
        const [categoriasDocs, contasDocs, caixasDocs, cartoesDocs, lancamentosDocs] = await Promise.all([
            getDocs(qCategorias),
            getDocs(qContas),
            getDocs(qCaixas),
            getDocs(qCartoes),
            getDocs(qLancamentos)
        ]);

        categoriasList = categoriasDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        contasList = contasDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        caixasList = caixasDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        cartoesList = cartoesDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        lancamentosList = lancamentosDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        populateSelect(document.getElementById('contaCategoria'), categoriasList, 'nome');
        populateSelect(filtroCategoria, categoriasList, 'nome');
        populateSelect(faturaCaixaSelect, caixasList, 'nome');

        const faturas = gerarFaturas(cartoesList, lancamentosList);
        contasList = [...contasList, ...faturas];
        renderizarContas(contasList);
    }
    
    function setupRealtimeListeners(userId) {
        onSnapshot(query(collection(db, "contas-a-pagar"), where("userId", "==", userId)), (querySnapshot) => {
            const contasAtualizadas = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const faturas = gerarFaturas(cartoesList, lancamentosList);
            contasList = [...contasAtualizadas, ...faturas];
            renderizarContas(contasList);
        });

        onSnapshot(query(collection(db, "lancamentos"), where("userId", "==", userId), where("forma_pagamento", "==", "cartao")), (querySnapshot) => {
            lancamentosList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const contasAtuais = contasList.filter(c => c.tipo !== 'fatura');
            const faturas = gerarFaturas(cartoesList, lancamentosList);
            contasList = [...contasAtuais, ...faturas];
            renderizarContas(contasList);
        });
        
        // NOVO: Ouvinte em tempo real para os caixas
        onSnapshot(query(collection(db, "caixas"), where("userId", "==", userId)), (querySnapshot) => {
            caixasList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            populateSelect(faturaCaixaSelect, caixasList, 'nome');
        });
    }

    function gerarFaturas(cartoes, lancamentos) {
        const faturas = [];
        const faturasAgrupadas = {};

        // Agrupa os lançamentos de cartão de crédito por mês de vencimento
        lancamentos.forEach(lancamento => {
            const dataVencimento = new Date(lancamento.data_vencimento + 'T12:00:00');
            const mesVencimento = dataVencimento.getMonth();
            const anoVencimento = dataVencimento.getFullYear();
            const cartao = cartoes.find(c => c.id === lancamento.cartao_id);

            if (!cartao) {
                return; // Ignora lançamentos sem cartão associado
            }

            const faturaId = `fatura_${cartao.id}_${anoVencimento}_${mesVencimento + 1}`;
            
            if (!faturasAgrupadas[faturaId]) {
                faturasAgrupadas[faturaId] = {
                    id: faturaId,
                    descricao: `Fatura ${cartao.nome} - ${new Date(anoVencimento, mesVencimento).toLocaleString('default', { month: 'long' })}/${anoVencimento}`,
                    valor: 0,
                    lancamentos: [],
                    data_vencimento: lancamento.data_vencimento,
                    tipo: 'fatura',
                    cartao_id: cartao.id
                };
            }
            if (lancamento.status_pagamento !== 'pago') {
                faturasAgrupadas[faturaId].valor += lancamento.valor;
            }
            faturasAgrupadas[faturaId].lancamentos.push(lancamento);
        });

        for (const key in faturasAgrupadas) {
            const fatura = faturasAgrupadas[key];
            const todosPagos = fatura.lancamentos.every(l => l.status_pagamento === 'pago');
            fatura.status_pagamento = todosPagos ? 'pago' : 'pendente';
            faturas.push(fatura);
        }
        return faturas;
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
                    <button class="btn-pagar" data-id="${conta.id}" data-tipo="${conta.tipo}" ${conta.status_pagamento === 'pago' ? 'disabled' : ''}>Pagar</button>
                    ${conta.tipo === 'fatura' ? `<button class="btn-detalhes" data-id="${conta.id}" data-cartao-id="${conta.cartao_id}">Detalhes</button>` : `<button class="btn-editar" data-id="${conta.id}" ${conta.status_pagamento === 'pago' ? 'disabled' : ''}>Editar</button>
                    <button class="btn-excluir" data-id="${conta.id}">Excluir</button>`}
                </td>
            `;
            contasTableBody.appendChild(row);
        });
    }
    
    // Lógica de Filtro
    [filtroDescricao, filtroDataInicio, filtroDataFim, filtroCategoria].forEach(filtro => {
        filtro.addEventListener('input', () => {
            renderizarContas(contasList);
        });
    });

    function filtrarContas(contas) {
        const descricao = filtroDescricao.value.toLowerCase();
        const dataInicio = filtroDataInicio.value;
        const dataFim = filtroDataFim.value;
        const categoriaId = filtroCategoria.value;

        return contas.filter(conta => {
            const dataVencimento = conta.data_vencimento;
            
            const matchDescricao = !descricao || conta.descricao.toLowerCase().includes(descricao);
            const matchDataInicio = !dataInicio || dataVencimento >= dataInicio;
            const matchDataFim = !dataFim || dataVencimento <= dataFim;
            const matchCategoria = !categoriaId || conta.categoria_id === categoriaId;

            return matchDescricao && matchDataInicio && matchDataFim && matchCategoria;
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
            contaParaPagar = contasList.find(c => c.id === id);

            if (!contaParaPagar) {
                alert("Conta não encontrada. Por favor, recarregue a página.");
                return;
            }
            
            if (contaParaPagar.status_pagamento === 'pago') {
                alert("Esta conta já foi paga.");
                return;
            }

            faturaValorPagoInput.value = contaParaPagar.valor.toFixed(2);
            document.getElementById('faturaDataPagamento').valueAsDate = new Date();
            openModal(pagarFaturaModal);
        } else if (e.target.classList.contains('btn-editar')) {
            const id = e.target.getAttribute('data-id');
            const conta = contasList.find(c => c.id === id);
            
            if (conta && conta.status_pagamento !== 'pago') {
                openEditModal(conta);
            } else {
                alert("Não é possível editar uma conta já paga.");
            }
        } else if (e.target.classList.contains('btn-excluir')) {
            const id = e.target.getAttribute('data-id');
            if (confirm("Tem certeza que deseja excluir esta conta?")) {
                await deleteDoc(doc(db, "contas-a-pagar", id));
                alert("Conta excluída com sucesso!");
            }
        } else if (e.target.classList.contains('btn-detalhes')) {
            const faturaId = e.target.getAttribute('data-id');
            const fatura = contasList.find(f => f.id === faturaId);

            if (!fatura) {
                alert("Fatura não encontrada.");
                return;
            }

            const [_, cartaoId, anoFatura, mesFatura] = faturaId.split('_');
            const lancamentosDaFatura = lancamentosList.filter(l => {
                const dataVencimento = new Date(l.data_vencimento + 'T12:00:00');
                return l.cartao_id === cartaoId && dataVencimento.getFullYear() === parseInt(anoFatura) && (dataVencimento.getMonth() + 1) === parseInt(mesFatura);
            });

            detalhesFaturaTitulo.textContent = `Detalhes da ${fatura.descricao}`;
            detalhesFaturaTableBody.innerHTML = '';
            
            lancamentosDaFatura.forEach(lancamento => {
                const row = document.createElement('tr');
                const dataCompraFormatada = new Date(lancamento.data_compra + 'T12:00:00').toLocaleDateString('pt-BR');
                row.innerHTML = `
                    <td>${dataCompraFormatada}</td>
                    <td>${lancamento.descricao}</td>
                    <td>R$ ${lancamento.valor.toFixed(2)}</td>
                `;
                detalhesFaturaTableBody.appendChild(row);
            });

            openModal(detalhesFaturaModal);
        }
    });
});