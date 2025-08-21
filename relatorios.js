// relatorios.js

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    let currentUser;
    let categoriasReceitaList = [];
    let categoriasDespesaList = [];

    // Elementos do DOM
    const gerarRelatorioBtn = document.getElementById('gerarRelatorioBtn');
    const filtroAnoInput = document.getElementById('filtroAno');
    const relatoriosMensaisContainer = document.getElementById('relatoriosMensaisContainer');
    const receitaTotalElement = document.getElementById('receitaTotal');
    const despesaTotalElement = document.getElementById('despesaTotal');
    const saldoLiquidoElement = document.getElementById('saldoLiquido');

    onAuthStateChanged(auth, (user) => {
        if (user) {
            currentUser = user;
            loadCategorias();
            const anoAtual = new Date().getFullYear();
            filtroAnoInput.value = anoAtual;
            gerarRelatorio(anoAtual);
        } else {
            window.location.href = "login.html";
        }
    });

    gerarRelatorioBtn.addEventListener('click', async () => {
        const ano = filtroAnoInput.value;
        if (!ano) {
            alert("Por favor, selecione um ano.");
            return;
        }
        await gerarRelatorio(ano);
    });

    async function loadCategorias() {
        try {
            const qReceita = query(collection(db, "categoria-receita"), where("userId", "==", currentUser.uid));
            const qDespesa = query(collection(db, "categoria-despesa"), where("userId", "==", currentUser.uid));
            
            const [receitaDocs, despesaDocs] = await Promise.all([
                getDocs(qReceita),
                getDocs(qDespesa)
            ]);
            
            categoriasReceitaList = receitaDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            categoriasDespesaList = despesaDocs.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
        } catch (error) {
            console.error("Erro ao carregar categorias: ", error);
        }
    }

    async function gerarRelatorio(ano) {
        try {
            relatoriosMensaisContainer.innerHTML = '';
            
            const dataInicio = `${ano}-01-01`;
            const dataFim = `${ano}-12-31`;

            const qDespesasAPagar = query(collection(db, "contas-a-pagar"), 
                where("userId", "==", currentUser.uid),
                where("status_pagamento", "==", "pago"),
                where("data_pagamento", ">=", dataInicio),
                where("data_pagamento", "<=", dataFim)
            );

            const qReceitasAReceber = query(collection(db, "contas-a-receber"), 
                where("userId", "==", currentUser.uid),
                where("status_pagamento", "==", "pago"),
                where("data_pagamento", ">=", dataInicio),
                where("data_pagamento", "<=", dataFim)
            );

            const qLancamentos = query(collection(db, "lancamentos"), 
                where("userId", "==", currentUser.uid),
                where("data_compra", ">=", dataInicio),
                where("data_compra", "<=", dataFim)
            );
            
            const [despesasAPagarDocs, receitasAReceberDocs, lancamentosDocs] = await Promise.all([
                getDocs(qDespesasAPagar),
                getDocs(qReceitasAReceber),
                getDocs(qLancamentos)
            ]);

            const despesasAPagar = despesasAPagarDocs.docs.map(doc => doc.data());
            const receitasAReceber = receitasAReceberDocs.docs.map(doc => doc.data());
            const lancamentos = lancamentosDocs.docs.map(doc => doc.data());
            
            // Alteração: Inclui todos os lançamentos, sem filtro de cartão
            const todasDespesas = [...despesasAPagar, ...lancamentos];
            const todasReceitas = receitasAReceber;

            const resumo = calcularResumo(todasReceitas, todasDespesas);
            const dadosMensais = agruparPorMes(todasReceitas, todasDespesas, ano);
            
            renderizarResumo(resumo);
            renderizarRelatoriosMensais(dadosMensais);

        } catch (error) {
            console.error("Erro ao gerar o relatório: ", error);
            alert("Ocorreu um erro ao gerar o relatório. Tente novamente.");
        }
    }

    function calcularResumo(receitas, despesas) {
        const receitaTotal = receitas.reduce((acc, curr) => acc + curr.valor, 0);
        const despesaTotal = despesas.reduce((acc, curr) => acc + curr.valor, 0);
        return {
            receitaTotal,
            despesaTotal,
            saldoLiquido: receitaTotal - despesaTotal
        };
    }

    function agruparPorMes(receitas, despesas, ano) {
        const dadosMensais = {};
        for (let i = 1; i <= 12; i++) {
            const mesFormatado = i.toString().padStart(2, '0');
            const chave = `${ano}-${mesFormatado}`;
            dadosMensais[chave] = { receitas: [], despesas: [] };
        }

        receitas.forEach(item => {
            const data = item.data_pagamento || item.data_vencimento;
            if (!data) return;
            const [itemAno, itemMes] = data.split('-');
            const chave = `${itemAno}-${itemMes}`;
            if (dadosMensais[chave]) {
                dadosMensais[chave].receitas.push(item);
            }
        });

        despesas.forEach(item => {
            const data = item.data_pagamento || item.data_compra || item.data_vencimento;
            if (!data) return;
            const [itemAno, itemMes] = data.split('-');
            const chave = `${itemAno}-${itemMes}`;
            if (dadosMensais[chave]) {
                dadosMensais[chave].despesas.push(item);
            }
        });
        
        return dadosMensais;
    }
    
    function renderizarRelatoriosMensais(dadosMensais) {
        const chavesOrdenadas = Object.keys(dadosMensais).sort();
        
        chavesOrdenadas.forEach(chave => {
            const data = dadosMensais[chave];
            const [ano, mes] = chave.split('-');
            const dataTitulo = new Date(ano, parseInt(mes) - 1) .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) .replace(/^\p{L}/u, c => c.toUpperCase());
            
            const despesasAgrupadas = agruparPorCategoriaESubcategoria(data.despesas, categoriasDespesaList);
            const receitasAgrupadas = agruparPorCategoriaESubcategoria(data.receitas, categoriasReceitaList);

            const totalDespesasMes = data.despesas.reduce((acc, curr) => acc + curr.valor, 0).toFixed(2);
            const totalReceitasMes = data.receitas.reduce((acc, curr) => acc + curr.valor, 0).toFixed(2);
            
            const cardHtml = `
                <div class="card relatorio-mensal-card">
                    <h4>${dataTitulo}</h4>
                    <div class="totais-mes">
                        <p>Receitas: <span class="receita-texto">R$ ${totalReceitasMes}</span></p>
                        <p>Despesas: <span class="despesa-texto">R$ ${totalDespesasMes}</span></p>
                    </div>
                    <div class="relatorio-content">
                        <div class="relatorio-coluna">
                            
                          ${renderizarCategorias(receitasAgrupadas, 'receita-texto')}
                        </div>
                        <div class="relatorio-coluna">
                           
                            ${renderizarCategorias(despesasAgrupadas, 'despesa-texto')}
                        </div>
                    </div>
                </div>
            `;
            relatoriosMensaisContainer.innerHTML += cardHtml;
        });
    }
    
    function agruparPorCategoriaESubcategoria(items, categoriasList) {
        const grupos = {};
        
        items.forEach(item => {
            const categoriaId = item.categoria_id;
            const subcategoria = item.subcategoria || 'Não Especificada';
            
            const categoria = categoriasList.find(c => c.id === categoriaId);
            const categoriaNome = categoria?.nome || 'Outros';

            if (!grupos[categoriaNome]) {
                grupos[categoriaNome] = { valor: 0, subcategorias: {} };
            }
            if (!grupos[categoriaNome].subcategorias[subcategoria]) {
                grupos[categoriaNome].subcategorias[subcategoria] = 0;
            }

            grupos[categoriaNome].valor += item.valor;
            grupos[categoriaNome].subcategorias[subcategoria] += item.valor;
        });
        
        return grupos;
    }

    function renderizarCategorias(grupos, classeCor) {
        let html = '<ul class="lista-categorias">';
        for (const categoria in grupos) {
            const totalCategoria = grupos[categoria].valor;
            html += `
                <li>
                    <strong>${categoria}</strong> - <span class="${classeCor}">R$ ${totalCategoria.toFixed(2)}</span>
                    <ul class="lista-subcategorias">
                        ${renderizarSubcategorias(grupos[categoria].subcategorias, classeCor)}
                    </ul>
                </li>
            `;
        }
        html += '</ul>';
        return html;
    }
    
    function renderizarSubcategorias(subcategorias, classeCor) {
        let html = '';
        for (const subcategoria in subcategorias) {
            const valor = subcategorias[subcategoria];
            html += `<li>${subcategoria}: <span class="${classeCor}">R$ ${valor.toFixed(2)}</span></li>`;
        }
        return html;
    }

    function renderizarResumo(resumo) {
        receitaTotalElement.textContent = `R$ ${resumo.receitaTotal.toFixed(2)}`;
        despesaTotalElement.textContent = `R$ ${resumo.despesaTotal.toFixed(2)}`;
        saldoLiquidoElement.textContent = `R$ ${resumo.saldoLiquido.toFixed(2)}`;
        
        if (resumo.saldoLiquido < 0) {
            saldoLiquidoElement.classList.add('despesa-texto');
            saldoLiquidoElement.classList.remove('receita-texto');
        } else {
            saldoLiquidoElement.classList.add('receita-texto');
            saldoLiquidoElement.classList.remove('despesa-texto');
        }
    }
});