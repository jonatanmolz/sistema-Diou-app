// dashboard.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
  let currentUser;

  // Listas de categorias para mapear nomes
  let categoriasDespesaList = [];
  let categoriasReceitaList = [];

  // Referências aos elementos do DOM
  const saldoCaixasEl      = document.getElementById('saldoCaixas');
  const totalPagarMesEl    = document.getElementById('totalPagarMes');
  const totalReceberMesEl  = document.getElementById('totalReceberMes');
  const saldoPrevistoEl    = document.getElementById('saldoPrevisto');

  const alertasBody        = document.getElementById('alertasBody');
  const pagarBody          = document.getElementById('pagarBody');
  const receberBody        = document.getElementById('receberBody');

  // Instâncias Chart.js (para destruir ao atualizar)
  let chartCategoria = null;
  let chartSubcategoria = null;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    currentUser = user;

    try {
      await loadCategorias();       // carrega listas de categorias (receita e despesa)
      await gerarDashboardDoMes();  // monta tudo para o mês atual
    } catch (err) {
      console.error('Erro ao montar dashboard:', err);
      alert('Ocorreu um erro ao carregar o dashboard.');
    }
  });

  /* =========================
      Utilidades / Helpers
  ========================== */
  function brl(n) {
    return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function getMesAtualRange() {
    const hoje = new Date();
    const y = hoje.getFullYear();
    const m = hoje.getMonth(); // 0-11
    const inicio = new Date(y, m, 1);
    const fim = new Date(y, m + 1, 0);
    return {
      isoInicio: inicio.toISOString().slice(0, 10),
      isoFim: fim.toISOString().slice(0, 10),
      hojeIso: new Date().toISOString().slice(0, 10)
    };
  }

  function nomeCategoriaById(id, tipo) {
    const lista = (tipo === 'despesa') ? categoriasDespesaList : categoriasReceitaList;
    const c = lista.find(x => x.id === id);
    return c ? c.nome : 'N/A';
  }

  function badge(status) {
    const map = {
      "pendente": "status-badge status-pendente",
      "pago": "status-badge status-pago",
      "atrasada": "status-badge status-atrasada"
    };
    const cls = map[status] || "status-badge status-pendente";
    const texto = status === "pago" ? "Pago/Recebido" : (status === "atrasada" ? "Atrasada" : "Pendente");
    return `<span class="${cls}">${texto}</span>`;
  }

  /* =========================
          Carregamentos
  ========================== */
  async function loadCategorias() {
    const qRec = query(collection(db, "categoria-receita"), where("userId", "==", auth.currentUser.uid));
    const qDesp = query(collection(db, "categoria-despesa"), where("userId", "==", auth.currentUser.uid));
    const [recDocs, despDocs] = await Promise.all([ getDocs(qRec), getDocs(qDesp) ]);
    categoriasReceitaList = recDocs.docs.map(d => ({ id: d.id, ...d.data() }));
    categoriasDespesaList = despDocs.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function getSaldoCaixas() {
    const q = query(collection(db, "caixas"), where("userId", "==", auth.currentUser.uid));
    const docs = await getDocs(q);
    return docs.docs.reduce((s, d) => s + (Number(d.data().saldo) || 0), 0);
  }

  async function getContasMes(collectionName, isoInicio, isoFim) {
    const q = query(
      collection(db, collectionName),
      where("userId", "==", auth.currentUser.uid),
      where("data_vencimento", ">=", isoInicio),
      where("data_vencimento", "<=", isoFim)
    );
    const docs = await getDocs(q);
    return docs.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function getAtrasos(collectionName, hojeIso) {
    const q = query(
      collection(db, collectionName),
      where("userId", "==", auth.currentUser.uid),
      where("status_pagamento", "==", "pendente"),
      where("data_vencimento", "<", hojeIso)
    );
    const docs = await getDocs(q);
    return docs.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function getLancamentosMes(isoInicio, isoFim) {
    const q = query(
      collection(db, "lancamentos"),
      where("userId", "==", auth.currentUser.uid),
      where("data_compra", ">=", isoInicio),
      where("data_compra", "<=", isoFim)
    );
    const docs = await getDocs(q);
    return docs.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  /* =========================
         Montagem do mês
  ========================== */
  async function gerarDashboardDoMes() {
    const { isoInicio, isoFim, hojeIso } = getMesAtualRange();

    // 1) Saldo dos caixas
    const saldoCaixas = await getSaldoCaixas();
    saldoCaixasEl.textContent = brl(saldoCaixas);

    // 2) Contas do mês
    const [contasPagarMes, contasReceberMes] = await Promise.all([
      getContasMes("contas-a-pagar", isoInicio, isoFim),
      getContasMes("contas-a-receber", isoInicio, isoFim)
    ]);

    const totalPagarMes   = contasPagarMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);
    const totalReceberMes = contasReceberMes.reduce((s, c) => s + (Number(c.valor) || 0), 0);

    totalPagarMesEl.textContent   = brl(totalPagarMes);
    totalReceberMesEl.textContent = brl(totalReceberMes);
    saldoPrevistoEl.textContent   = brl(totalReceberMes - totalPagarMes);

    preencherTabela(pagarBody,   contasPagarMes,   'pagar');
    preencherTabela(receberBody, contasReceberMes, 'receber');

    // 3) Alertas de atraso
    const [atrasosPagar, atrasosReceber] = await Promise.all([
      getAtrasos("contas-a-pagar", hojeIso),
      getAtrasos("contas-a-receber", hojeIso)
    ]);
    preencherAlertas(atrasosPagar, atrasosReceber);

    // 4) Gráficos (Despesas por categoria/subcategoria)
    //    Considera despesas vindas de "contas-a-pagar" e "lancamentos"
    const lancamentosMes = await getLancamentosMes(isoInicio, isoFim);
    const despesasMes = [
      ...contasPagarMes.map(c => ({
        categoria_id: c.categoria_id,
        subcategoria: c.subcategoria || 'N/A',
        valor: Number(c.valor) || 0
      })),
      ...lancamentosMes.map(l => ({
        categoria_id: l.categoria_id,
        subcategoria: l.subcategoria || 'N/A',
        valor: Number(l.valor) || 0
      }))
    ];
    const { porCategoria, porSubcategoria } = agregarDespesas(despesasMes);
    renderizarGraficos(porCategoria, porSubcategoria);
  }

  /* =========================
       Tabelas / Alertas
  ========================== */
  function preencherTabela(tbody, itens, tipoTabela) {
    // tipoTabela: 'pagar' => usar categorias de despesa; 'receber' => categorias de receita
    const tipoCat = (tipoTabela === 'pagar') ? 'despesa' : 'receita';
    tbody.innerHTML = '';

    itens
      .sort((a, b) => (a.data_vencimento || '').localeCompare(b.data_vencimento || ''))
      .forEach(item => {
        const catNome = nomeCategoriaById(item.categoria_id, tipoCat);
        const sub = item.subcategoria || 'N/A';
        const venc = item.data_vencimento ? new Date(item.data_vencimento).toLocaleDateString('pt-BR') : 'N/A';
        const st = item.status_pagamento || 'pendente';
        const isAtrasado = (st === 'pendente' && item.data_vencimento && item.data_vencimento < new Date().toISOString().slice(0,10));

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${venc}</td>
          <td>${item.descricao || ''}</td>
          <td>${catNome}</td>
          <td>${sub}</td>
          <td>${brl(item.valor)}</td>
          <td>${isAtrasado ? badge('atrasada') : badge(st)}</td>
          <td>
            ${tipoTabela === 'pagar'
              ? `<a href="contas-a-pagar.html" class="btn-acao btn-pagar">Resolver</a>`
              : `<a href="contas-a-receber.html" class="btn-acao btn-receber">Resolver</a>`}
          </td>
        `;
        tbody.appendChild(tr);
      });
  }

  function preencherAlertas(atrasosPagar, atrasosReceber) {
    alertasBody.innerHTML = '';

    const addLinha = (tipo, i) => {
      const venc = i.data_vencimento ? new Date(i.data_vencimento).toLocaleDateString('pt-BR') : 'N/A';
      const tr = document.createElement('tr');

      // Cor da linha por tipo
      if (tipo === 'pagar') {
        tr.classList.add('linha-pagar');
      } else {
        tr.classList.add('linha-receber');
      }

      tr.innerHTML = `
        <td>${tipo === 'pagar' ? 'A Pagar' : 'A Receber'}</td>
        <td>${i.descricao || ''}</td>
        <td>${brl(i.valor)}</td>
        <td>${venc}</td>
        <td>${badge('atrasada')}</td>
        <td>
          ${tipo === 'pagar'
            ? `<a href="contas-a-pagar.html" class="btn-acao btn-pagar">Resolver</a>`
            : `<a href="contas-a-receber.html" class="btn-acao btn-receber">Resolver</a>`}
        </td>
      `;
      alertasBody.appendChild(tr);
    };

    atrasosPagar.forEach(i => addLinha('pagar', i));
    atrasosReceber.forEach(i => addLinha('receber', i));

    if (alertasBody.children.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6">Sem atrasos 👌</td>`;
      alertasBody.appendChild(tr);
    }
  }

  /* =========================
           Gráficos
  ========================== */
  function agregarDespesas(despesasMes) {
    const mapaCat = new Map();   // Categoria -> soma
    const mapaSub = new Map();   // "Categoria | Sub" -> soma

    despesasMes.forEach(item => {
      const catNome = nomeCategoriaById(item.categoria_id, 'despesa');
      const sub = item.subcategoria || 'N/A';
      const val = Number(item.valor) || 0;

      mapaCat.set(catNome, (mapaCat.get(catNome) || 0) + val);

      const chaveSub = `${catNome} | ${sub}`;
      mapaSub.set(chaveSub, (mapaSub.get(chaveSub) || 0) + val);
    });

    const porCategoria = Array.from(mapaCat.entries()).sort((a,b) => b[1] - a[1]);
    const porSubcategoria = Array.from(mapaSub.entries()).sort((a,b) => b[1] - a[1]);
    return { porCategoria, porSubcategoria };
  }

  function renderizarGraficos(porCategoria, porSubcategoria) {
    if (chartCategoria) chartCategoria.destroy();
    if (chartSubcategoria) chartSubcategoria.destroy();

    const ctx1 = document.getElementById('chartDespesasPorCategoria')?.getContext('2d');
    const ctx2 = document.getElementById('chartDespesasPorSubcategoria')?.getContext('2d');
    if (!ctx1 || !ctx2) return; // Caso a seção de gráficos não exista

    // --- Pizza/Donut: Despesas por Categoria ---
    const labelsCat = porCategoria.map(x => x[0]);
    theConstDataCat(porCategoria);

    chartCategoria = new Chart(ctx1, {
      type: 'doughnut',
      data: {
        labels: labelsCat,
        datasets: [{ label: 'Despesas por Categoria', data: theConstDataCat.array }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed;
                return `${ctx.label}: ${brl(val)}`;
              }
            }
          }
        }
      }
    });

    // --- Barras: Despesas por Subcategoria ---
    const labelsSub = porSubcategoria.map(x => x[0]);  // "Categoria | Sub"
    const dataSub = porSubcategoria.map(x => x[1]);

    chartSubcategoria = new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: labelsSub,
        datasets: [{ label: 'Despesas por Subcategoria', data: dataSub }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { autoSkip: false, maxRotation: 60, minRotation: 0 }
          },
          y: {
            beginAtZero: true,
            ticks: {
              callback: (v) => brl(v)
            }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `${ctx.label}: ${brl(ctx.parsed.y)}`
            }
          }
        }
      }
    });
  }

  // pequena ajuda para preservar legibilidade na criação do chart doughnut
  function theConstDataCat(porCategoria) {
    const dataCat = porCategoria.map(x => x[1]);
    theConstDataCat.array = dataCat;
  }
});
