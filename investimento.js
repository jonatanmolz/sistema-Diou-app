// investimento.js (versão simplificada: trabalhar só com valores)
// - Sem separador de milhar. Aceita vírgula somente como decimal.
// - Saldos ordenados de forma estável (mesma data -> created_at_ms).
// - Aporte atualiza saldo no card.
// - Retirada/Fechamento geram contas-a-receber "pago" na categoria "Investimentos".
// - Histórico no modal.

import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection, addDoc, serverTimestamp, query, where, getDocs,
  orderBy, doc, updateDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
  let currentUser = null;

  /* ===========================
            ESTADO
  ============================ */
  let investimentos = [];
  let saldosPorInv   = {};
  let aportesPorInv  = {};
  let retiradasPorInv= {};
  let fechamentos    = [];
  let caixas         = [];

  /* ===========================
           ELEMENTOS
  ============================ */
  // Resumo
  const resumoTotalInvestidoEl = document.getElementById('resumoTotalInvestido');
  const resumoValorAtualEl     = document.getElementById('resumoValorAtual');
  const resumoRoiTotalEl       = document.getElementById('resumoRoiTotal');
  const resumoRoiMesPassadoEl  = document.getElementById('resumoRoiMesPassado');
  const resumoRoiMesAtualEl    = document.getElementById('resumoRoiMesAtual');

  // Listas
  const investCards            = document.getElementById('investCards');
  const investCardsFinalizados = document.getElementById('investCardsFinalizados');

  // Modais
  const investModal  = document.getElementById('investModal');
  const acaoModal    = document.getElementById('acaoModal');
  const closeBtns    = document.querySelectorAll('.close-btn');

  // Form novo/editar investimento
  const novoInvestBtn = document.getElementById('novoInvestBtn');
  const investForm    = document.getElementById('investForm');
  const invNome       = document.getElementById('invNome');
  const invValor      = document.getElementById('invValor');
  const invData       = document.getElementById('invData');
  const invVenc       = document.getElementById('invVenc');
  const invTipo       = document.getElementById('invTipo');
  const invCorretora  = document.getElementById('invCorretora');

  // Ações do investimento
  const acaoInvestId       = document.getElementById('acaoInvestId');
  const abrirNovoSaldoBtn  = document.getElementById('abrirNovoSaldoBtn');
  const abrirNovaAplicBtn  = document.getElementById('abrirNovaAplicacaoBtn');
  const abrirRetiradaBtn   = document.getElementById('abrirRetiradaBtn');
  const abrirFechamentoBtn = document.getElementById('abrirFechamentoBtn');
  const abrirHistoricoBtn  = document.getElementById('abrirHistoricoBtn');

  // Forms de ação
  const saldoForm   = document.getElementById('saldoForm');
  const saldoValor  = document.getElementById('saldoValor');
  const saldoData   = document.getElementById('saldoData');

  const aplicacaoForm  = document.getElementById('aplicacaoForm');
  const aplicacaoValor = document.getElementById('aplicacaoValor');
  const aplicacaoData  = document.getElementById('aplicacaoData');

  const retiradaForm   = document.getElementById('retiradaForm');
  const retiradaValor  = document.getElementById('retiradaValor');
  const retiradaData   = document.getElementById('retiradaData');
  const retiradaCaixa  = document.getElementById('retiradaCaixa');

  const fechamentoForm     = document.getElementById('fechamentoForm');
  const fechamentoValor    = document.getElementById('fechamentoValor');
  const fechamentoTaxas    = document.getElementById('fechamentoTaxas');
  const fechamentoImpostos = document.getElementById('fechamentoImpostos');
  const fechamentoData     = document.getElementById('fechamentoData');
  const fechamentoCaixa    = document.getElementById('fechamentoCaixa');

  // Histórico
  const historicoBox  = document.getElementById('historicoBox');
  const historicoBody = document.getElementById('historicoBody');

  /* ===========================
           HELPERS
  ============================ */
  const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = n => `${(Number(n) || 0).toFixed(2)}%`;
  const todayISO = () => new Date().toISOString().slice(0,10);
  const firstDayOfMonthISO = (d=new Date()) => (new Date(d.getFullYear(), d.getMonth(), 1)).toISOString().slice(0,10);
  const firstDayOfPrevMonthISO = () => {
    const d = new Date(); const y = d.getFullYear(); const m = d.getMonth();
    return new Date(y, m-1, 1).toISOString().slice(0,10);
  };

  // Abre/fecha modal
  function openModal(m){ m.classList.remove('hidden'); m.style.display = 'flex'; }
  function closeModal(m){
    m.style.display = 'none';
    m.classList.add('hidden');
    m.querySelectorAll('form').forEach(f => f.reset());
    historicoBody && (historicoBody.innerHTML = '');
    historicoBox && historicoBox.classList.add('hidden');
  }

  // NÚMEROS (agora trabalhamos só com valores)
  // - não permitir separador de milhar;
  // - vírgula aceita apenas como decimal;
  // - se detectar 2 pontos (milhar + decimal), avisa.
  function getNumberFromInput(el, fieldLabel='valor'){
    const raw = String(el.value ?? '').trim();
    if (!raw) return NaN;
    const dotCount   = (raw.match(/\./g) || []).length;
    const commaCount = (raw.match(/,/g) || []).length;

    if (dotCount > 1 || (dotCount === 1 && commaCount === 1)) {
      alert(`Por favor, digite apenas o ${fieldLabel} sem separador de milhar. Ex.: 110 ou 110.5 (opcionalmente 110,5).`);
      return NaN;
    }
    // aceita vírgula como decimal
    const s = raw.replace(',', '.');
    const n = Number(s);
    if (!isFinite(n)) alert(`Informe um ${fieldLabel} válido (ex.: 110 ou 110.5).`);
    return n;
  }

  // Categoria Receita (para retirar/fechar)
  async function ensureCategoriaInvestimentos() {
    const qCat = query(collection(db, "categoria-receita"),
      where("userId", "==", auth.currentUser.uid),
      where("nome", "==", "Investimentos"));
    const catDocs = await getDocs(qCat);
    if (!catDocs.empty) return catDocs.docs[0].id;
    const ref = await addDoc(collection(db, "categoria-receita"), {
      nome: "Investimentos",
      userId: auth.currentUser.uid,
      data_de_criacao: serverTimestamp()
    });
    return ref.id;
  }
  async function criarReceitaPago({ valor, dataISO, descricao, subcategoria }) {
    const categoriaId = await ensureCategoriaInvestimentos();
    await addDoc(collection(db, "contas-a-receber"), {
      categoria_id: categoriaId,
      data_de_criacao: serverTimestamp(),
      data_pagamento: dataISO,
      data_vencimento: dataISO,
      descricao: descricao || "",
      observacoes: "",
      status_pagamento: "pago",
      subcategoria: subcategoria || "N/A",
      tipo: "única",
      userId: auth.currentUser.uid,
      valor: Number(valor) || 0
    });
  }

  /* ===========================
             UI
  ============================ */
  closeBtns.forEach(btn => btn.addEventListener('click', () => closeModal(btn.closest('.modal'))));
  window.addEventListener('click', (e) => {
    if (e.target === investModal) closeModal(investModal);
    if (e.target === acaoModal)   closeModal(acaoModal);
  });

  novoInvestBtn?.addEventListener('click', () => {
    investForm.removeAttribute('data-editing');
    invData.value = todayISO();
    invVenc.value = todayISO();
    openModal(investModal);
  });

  abrirNovoSaldoBtn?.addEventListener('click', () => { showOnly('saldo'); });
  abrirNovaAplicBtn?.addEventListener('click', () => { showOnly('aplic'); });
  abrirRetiradaBtn?.addEventListener('click', () => { showOnly('ret'); });
  abrirFechamentoBtn?.addEventListener('click', () => { showOnly('fech'); setupFechamentoUI(acaoInvestId.value); });
  abrirHistoricoBtn?.addEventListener('click', async () => { showOnly('hist'); await montarHistorico(acaoInvestId.value); });

  function showOnly(kind){
    const map = { saldo: saldoForm, aplic: aplicacaoForm, ret: retiradaForm, fech: fechamentoForm };
    [saldoForm, aplicacaoForm, retiradaForm, fechamentoForm, historicoBox].forEach(el => el && el.classList.add('hidden'));
    if (kind === 'hist') { historicoBox.classList.remove('hidden'); return; }
    map[kind]?.classList.remove('hidden');
  }

  function abrirAcoes(investId){
    acaoInvestId.value = investId;

    // popular caixas
    retiradaCaixa.innerHTML = '<option value="" disabled selected>Selecione...</option>';
    fechamentoCaixa.innerHTML= '<option value="" disabled selected>Selecione...</option>';
    caixas.forEach(c => {
      const opt = document.createElement('option'); opt.value = c.id; opt.textContent = `${c.nome} — Saldo: ${brl(c.saldo)}`;
      const opt2 = opt.cloneNode(true);
      retiradaCaixa.appendChild(opt);
      fechamentoCaixa.appendChild(opt2);
    });

    // datas default
    saldoData.value      = todayISO();
    aplicacaoData.value  = todayISO();
    retiradaData.value   = todayISO();
    fechamentoData.value = todayISO();

    showOnly('saldo'); // abre na primeira aba
    openModal(acaoModal);
  }

  /* ===========================
            AUTENTICAÇÃO
  ============================ */
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = "login.html"; return; }
    currentUser = user;
    await carregarTudo();
  });

  /* ===========================
           CARREGAMENTO
  ============================ */
  async function carregarTudo(){
    // investimentos
    const qInv = query(collection(db, "investimentos"), where("userId", "==", auth.currentUser.uid));
    const invDocs = await getDocs(qInv);
    investimentos = invDocs.docs.map(d => ({ id: d.id, ...d.data() }));

    // saldos
    saldosPorInv = {};
    for (const inv of investimentos) {
      const qS = query(
        collection(db, "investimento-saldos"),
        where("userId", "==", auth.currentUser.uid),
        where("investimento_id", "==", inv.id),
        orderBy("data_saldo", "asc")
      );
      const sDocs = await getDocs(qS);
      saldosPorInv[inv.id] = sDocs.docs.map(d => ({ id: d.id, ...d.data() }));
      saldosPorInv[inv.id].sort((a,b) => {
        const ad = a.data_saldo || '', bd = b.data_saldo || '';
        if (ad < bd) return -1; if (ad > bd) return 1;
        const ats = Number(a.data_saldo_ts)||0, bts = Number(b.data_saldo_ts)||0;
        if (ats !== bts) return ats - bts;
        const ams = Number(a.created_at_ms)||0, bms = Number(b.created_at_ms)||0;
        if (ams !== bms) return ams - bms;
        const acs = a.created_at?.seconds ?? 0, bcs = b.created_at?.seconds ?? 0;
        if (acs !== bcs) return acs - bcs;
        return a.id.localeCompare(b.id);
      });
    }

    // aportes
    aportesPorInv = {};
    for (const inv of investimentos) {
      const qA = query(
        collection(db, "investimento-aportes"),
        where("userId","==", auth.currentUser.uid),
        where("investimento_id","==", inv.id),
        orderBy("data_aporte","asc")
      );
      const aDocs = await getDocs(qA);
      aportesPorInv[inv.id] = aDocs.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // retiradas
    retiradasPorInv = {};
    for (const inv of investimentos) {
      const qR = query(
        collection(db, "investimento-retiradas"),
        where("userId","==", auth.currentUser.uid),
        where("investimento_id","==", inv.id),
        orderBy("data_retirada","asc")
      );
      const rDocs = await getDocs(qR);
      retiradasPorInv[inv.id] = rDocs.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // fechamentos
    const qF = query(collection(db, "investimento-fechamentos"),
      where("userId","==", auth.currentUser.uid),
      orderBy("data_fechamento","desc"));
    const fDocs = await getDocs(qF);
    fechamentos = fDocs.docs.map(d => ({ id: d.id, ...d.data() }));

    // caixas
    const qCx = query(collection(db, "caixas"), where("userId","==", auth.currentUser.uid));
    const cxDocs = await getDocs(qCx);
    caixas = cxDocs.docs.map(d => ({ id: d.id, ...d.data() }));

    render();
  }

  /* ===========================
           CÁLCULOS
  ============================ */
  function ultimoSaldo(inv){
    const s = saldosPorInv[inv.id] || [];
    return s.length ? s[s.length-1] : null;
  }
  function valorAtual(inv){
    const s = ultimoSaldo(inv);
    return s ? Number(s.valor_saldo)||0 : Number(inv.valor_inicial)||0;
  }
  function unitPriceAtual(inv){
    const s = ultimoSaldo(inv);
    if (s && s.unit_price) return Number(s.unit_price);
    const units = Number(inv.units)||0;
    const val   = s ? Number(s.valor_saldo)||0 : Number(inv.valor_inicial)||0;
    return units > 0 ? val/units : 1;
  }
  function unitPriceNaData(inv, dataISO){
    const sList = (saldosPorInv[inv.id]||[]).filter(x => x.data_saldo <= dataISO);
    if (!sList.length) return 1;
    return Number(sList[sList.length-1].unit_price) || 1;
  }
  function roiTotal(inv){
    const p0=1, p=unitPriceAtual(inv);
    return (p/p0 - 1)*100;
  }
  function roiEntreDatas(inv, baseISO){
    const p0 = unitPriceNaData(inv, baseISO);
    const p  = unitPriceAtual(inv);
    return (p/p0 - 1)*100;
  }
  function totalInvestidoAtivo(inv){
    const base = Number(inv.valor_inicial)||0;
    const ap   = (aportesPorInv[inv.id]||[]).reduce((s,a)=>s+(Number(a.valor)||0),0);
    return base + ap;
  }

  /* ===========================
             RENDER
  ============================ */
  function render(){
    // Resumo
    let somaInvestido=0, somaAtual=0, somaRoiTotal=0, somaRoiMesAtual=0, somaRoiMesPassado=0, countActives=0;
    const baseMesAtual   = firstDayOfMonthISO(new Date());
    const baseMesPassado = firstDayOfPrevMonthISO();

    const ativos = investimentos.filter(i => !i.fechado);
    ativos.forEach(inv => {
      somaInvestido += totalInvestidoAtivo(inv);
      somaAtual     += valorAtual(inv);
      const roiT  = roiTotal(inv);
      const roiM  = roiEntreDatas(inv, baseMesAtual);
      const roiMP = roiEntreDatas(inv, baseMesPassado);
      somaRoiTotal      += roiT;
      somaRoiMesAtual   += roiM;
      somaRoiMesPassado += roiMP;
      countActives++;
    });

    resumoTotalInvestidoEl.textContent = brl(somaInvestido);
    resumoValorAtualEl.textContent     = brl(somaAtual);
    resumoRoiTotalEl.textContent       = countActives ? pct(somaRoiTotal/countActives) : pct(0);
    resumoRoiMesPassadoEl.textContent  = countActives ? pct(somaRoiMesPassado/countActives) : pct(0);
    resumoRoiMesAtualEl.textContent    = countActives ? pct(somaRoiMesAtual/countActives) : pct(0);

    // Cards ativos
    investCards.innerHTML = '';
    ativos.sort((a,b)=>a.nome.localeCompare(b.nome)).forEach(inv => {
      const atual = valorAtual(inv);
      const roiM  = roiEntreDatas(inv, baseMesAtual);
      const roiT  = roiTotal(inv);
      const diasVencer = inv.data_vencimento ? (new Date(inv.data_vencimento) - new Date())/86400000 : null;

      const card = document.createElement('div');
      card.className = 'invest-card';
      if (diasVencer !== null){
        if (diasVencer < 0) card.classList.add('vencido');
        else if (diasVencer <= 15) card.classList.add('vence-em-breve');
      }
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <h3>${inv.nome}</h3>
            <small class="muted">${inv.tipo ? inv.tipo : ''}${inv.corretora ? ' • ' + inv.corretora : ''}</small>
          </div>
          <div class="card-icons">
            <button class="icon-btn edit"   data-action="editar"  data-id="${inv.id}" title="Editar"></button>
            <button class="icon-btn delete" data-action="excluir" data-id="${inv.id}" title="Excluir"></button>
          </div>
        </div>

        <div class="invest-meta">
          <p><strong>Data início:</strong> ${new Date(inv.data_inicial).toLocaleDateString('pt-BR')}</p>
          <p><strong>Vencimento:</strong> ${inv.data_vencimento ? new Date(inv.data_vencimento).toLocaleDateString('pt-BR') : '—'}</p>
          <p><strong>Valor investido:</strong> ${brl(totalInvestidoAtivo(inv))}</p>
          <p><strong>Saldo atual:</strong> ${brl(atual)}</p>
        </div>

        <div class="invest-kpis">
          <div class="kpi"><h5>Rend. mês</h5><div class="val">${pct(roiM)}</div></div>
          <div class="kpi"><h5>Rend. total</h5><div class="val">${pct(roiT)}</div></div>
          <div class="kpi"><h5>Unidades</h5><div class="val">${(Number(inv.units)||0).toFixed(4)}</div></div>
        </div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.icon-btn')) return;
        abrirAcoes(inv.id);
      });
      investCards.appendChild(card);
    });

    // Finalizados
    investCardsFinalizados.innerHTML = '';
    fechamentos.forEach(f => {
      const card = document.createElement('div');
      card.className = 'invest-card';
      card.innerHTML = `
        <h3>${f.nome}</h3>
        <small class="muted">${f.tipo ? f.tipo : ''}${f.corretora ? ' • ' + f.corretora : ''}</small>
        <div class="invest-meta" style="grid-template-columns:1fr 1fr;">
          <p><strong>Data início:</strong> ${new Date(f.data_inicial).toLocaleDateString('pt-BR')}</p>
          <p><strong>Vencimento:</strong> ${f.data_vencimento ? new Date(f.data_vencimento).toLocaleDateString('pt-BR') : '—'}</p>
          <p><strong>Fechamento:</strong> ${new Date(f.data_fechamento).toLocaleDateString('pt-BR')}</p>
          <p><strong>Valor investido:</strong> ${brl(f.valor_investido_total || f.valor_inicial)}</p>
          <p><strong>Valor final:</strong> ${brl(f.valor_final)}</p>
          <p><strong>Rendimento:</strong> ${pct(f.roi_total)}</p>
          <p><strong>Valor retirado:</strong> ${brl(f.valor_retirado)}</p>
          <p><strong>Impostos/Taxas:</strong> ${brl(f.taxa_impostos || 0)}</p>
        </div>
      `;
      investCardsFinalizados.appendChild(card);
    });
  }

  /* ===========================
          FORM: NOVO/EDITAR
  ============================ */
  investForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const isEditing = investForm.dataset.editing;
      if (isEditing) {
        await updateDoc(doc(db, "investimentos", isEditing), {
          nome: invNome.value.trim(),
          data_inicial: invData.value,
          data_vencimento: invVenc.value,
          tipo: invTipo.value.trim() || null,
          corretora: invCorretora.value.trim() || null
        });
      } else {
        const valorInicial = getNumberFromInput(invValor, 'valor investido inicial');
        if (!isFinite(valorInicial)) return;

        await addDoc(collection(db, "investimentos"), {
          nome: invNome.value.trim(),
          valor_inicial: valorInicial,
          data_inicial: invData.value,
          data_vencimento: invVenc.value,
          tipo: invTipo.value.trim() || null,
          corretora: invCorretora.value.trim() || null,
          units: valorInicial, // 1 unidade = R$1
          fechado: false,
          userId: currentUser.uid,
          data_de_criacao: serverTimestamp(),
        });
      }
      investForm.removeAttribute('data-editing');
      closeModal(investModal);
      await carregarTudo();
    } catch (err) {
      console.error('Erro ao salvar/editar investimento:', err);
      alert('Erro ao salvar/editar investimento.');
    }
  });

  /* ===========================
            AÇÕES
  ============================ */
  // Novo saldo
  saldoForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const invId = acaoInvestId.value;
      const inv   = investimentos.find(x => x.id === invId);
      if (!inv) { alert('Investimento não encontrado.'); return; }

      const novoValor = getNumberFromInput(saldoValor, 'saldo');
      const dataISO   = saldoData.value;
      if (!isFinite(novoValor)) return;
      if (!dataISO) { alert('Informe a data.'); return; }

      const unitsAtuais = Number(inv.units) || 0;
      const unitsBase   = unitsAtuais > 0 ? unitsAtuais : (Number(inv.valor_inicial) || 1);
      const unitPrice   = novoValor / unitsBase;

      await addDoc(collection(db, "investimento-saldos"), {
        investimento_id: invId,
        valor_saldo: novoValor,
        unit_price: unitPrice,
        units: unitsBase,
        data_saldo: dataISO,
        data_saldo_ts: new Date(dataISO + 'T00:00:00').getTime(),
        created_at_ms: Date.now(),
        userId: currentUser.uid,
        created_at: serverTimestamp(),
      });

      closeModal(acaoModal);
      await carregarTudo();
    } catch (err) {
      console.error('Erro ao lançar saldo:', err);
      alert('Erro ao lançar saldo.');
    }
  });

  // Nova aplicação
  aplicacaoForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const invId = acaoInvestId.value;
      const invSnap = await getDoc(doc(db, "investimentos", invId));
      if (!invSnap.exists()) { alert('Investimento não encontrado.'); return; }
      const inv = { id: invSnap.id, ...invSnap.data() };

      const aporte = getNumberFromInput(aplicacaoValor, 'valor do aporte');
      const data   = aplicacaoData.value;
      if (!isFinite(aporte) || aporte <= 0) return;

      const up = unitPriceAtual(inv);
      const addUnits = up > 0 ? (aporte / up) : 0;
      const novasUnits = (Number(inv.units)||0) + addUnits;

      const s = ultimoSaldo(inv);
      const saldoAnterior = s ? Number(s.valor_saldo) : Number(inv.valor_inicial);
      const novoSaldo     = saldoAnterior + aporte;

      // registro do aporte
      await addDoc(collection(db, "investimento-aportes"), {
        investimento_id: invId,
        valor: aporte,
        unit_price: up,
        units_adicionadas: addUnits,
        data_aporte: data,
        userId: currentUser.uid,
        created_at: serverTimestamp(),
      });

      // atualiza units do investimento
      await updateDoc(doc(db, "investimentos", invId), { units: novasUnits });

      // registra um novo saldo refletindo o aporte
      await addDoc(collection(db, "investimento-saldos"), {
        investimento_id: invId,
        valor_saldo: novoSaldo,
        unit_price: up,
        units: novasUnits,
        data_saldo: data,
        data_saldo_ts: new Date(data + 'T00:00:00').getTime(),
        created_at_ms: Date.now(),
        userId: currentUser.uid,
        created_at: serverTimestamp(),
      });

      closeModal(acaoModal);
      await carregarTudo();
    } catch (err) {
      console.error('Erro no aporte:', err);
      alert('Erro ao registrar a aplicação.');
    }
  });

  // Retirada
  retiradaForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const invId = acaoInvestId.value;
      const inv   = investimentos.find(x => x.id === invId);
      if (!inv) { alert('Investimento não encontrado.'); return; }

      const valor = getNumberFromInput(retiradaValor, 'valor da retirada');
      const data  = retiradaData.value;
      const caixaId = retiradaCaixa.value;
      if (!isFinite(valor) || valor <= 0) return;
      if (!caixaId) { alert('Selecione um caixa'); return; }

      const s = ultimoSaldo(inv);
      const valorAtualInv = s ? Number(s.valor_saldo) : Number(inv.valor_inicial);
      const up = unitPriceAtual(inv);
      const unitsAtuais = Number(inv.units)||0;

      if (valor > valorAtualInv + 1e-6) { alert('Retirada maior que o saldo disponível.'); return; }

      const unitsToRemove = up > 0 ? (valor / up) : 0;
      const novasUnits    = unitsAtuais - unitsToRemove;
      const novoSaldo     = Math.max(0, valorAtualInv - valor);

      // registro retirada
      await addDoc(collection(db, "investimento-retiradas"), {
        investimento_id: invId,
        valor,
        unit_price: up,
        units_removidas: unitsToRemove,
        data_retirada: data,
        userId: currentUser.uid,
        created_at: serverTimestamp(),
      });

      // novo saldo após retirada
      await addDoc(collection(db, "investimento-saldos"), {
        investimento_id: invId,
        valor_saldo: novoSaldo,
        unit_price: up,
        units: novasUnits,
        data_saldo: data,
        data_saldo_ts: new Date(data + 'T00:00:00').getTime(),
        created_at_ms: Date.now(),
        userId: currentUser.uid,
        created_at: serverTimestamp(),
      });

      // atualiza units
      await updateDoc(doc(db, "investimentos", invId), { units: novasUnits });

      // credita no caixa
      const cx = caixas.find(c => c.id === caixaId);
      await updateDoc(doc(db, "caixas", caixaId), { saldo: (Number(cx.saldo)||0) + valor });

      // contas-a-receber (pago)
      await criarReceitaPago({
        valor,
        dataISO: data,
        descricao: `Retirada Investimento ${inv.nome}`,
        subcategoria: inv.corretora || "N/A"
      });

      closeModal(acaoModal);
      await carregarTudo();
    } catch (err) {
      console.error('Erro na retirada:', err);
      alert('Erro ao realizar a retirada.');
    }
  });

  // Fechamento
  fechamentoForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const invId    = acaoInvestId.value;
      const inv      = investimentos.find(x => x.id === invId);
      if (!inv) { alert('Investimento não encontrado.'); return; }

      const valorSaque  = getNumberFromInput(fechamentoValor, 'valor retirado');
      const taxasVal    = getNumberFromInput(fechamentoTaxas, 'taxas/impostos') || 0;
      const impostosVal = getNumberFromInput(fechamentoImpostos, 'impostos adicionais') || 0;
      const data        = fechamentoData.value;
      const caixaId     = fechamentoCaixa.value;

      if (!isFinite(valorSaque) || valorSaque < 0) return;
      if (!caixaId) { alert('Selecione um caixa'); return; }

      const s = ultimoSaldo(inv);
      const valorAtual = s ? Number(s.valor_saldo) : Number(inv.valor_inicial);
      const up = unitPriceAtual(inv);

      // zera saldo
      await addDoc(collection(db, "investimento-saldos"), {
        investimento_id: invId,
        valor_saldo: 0,
        unit_price: up,
        units: 0,
        data_saldo: data,
        data_saldo_ts: new Date(data + 'T00:00:00').getTime(),
        created_at_ms: Date.now(),
        userId: currentUser.uid,
        created_at: serverTimestamp(),
      });

      // marca como fechado
      await updateDoc(doc(db, "investimentos", invId), { units: 0, fechado: true, data_fechamento: data });

      // snapshot de fechamento
      const valorInvestidoTotal = totalInvestidoAtivo(inv);
      const roi = valorInvestidoTotal > 0 ? ((valorAtual - valorInvestidoTotal) / valorInvestidoTotal) * 100 : 0;

      await addDoc(collection(db, "investimento-fechamentos"), {
        investimento_id: invId, userId: currentUser.uid,
        nome: inv.nome, tipo: inv.tipo || null, corretora: inv.corretora || null,
        data_inicial: inv.data_inicial, data_vencimento: inv.data_vencimento || null, data_fechamento: data,
        valor_inicial: inv.valor_inicial, valor_investido_total: valorInvestidoTotal,
        valor_final: valorAtual, valor_retirado: valorSaque,
        taxa_impostos: (taxasVal + impostosVal), roi_total: roi,
        created_at: serverTimestamp(),
      });

      // credita no caixa
      const cx = caixas.find(c => c.id === caixaId);
      await updateDoc(doc(db, "caixas", caixaId), { saldo: (Number(cx.saldo)||0) + valorSaque });

      // contas-a-receber (pago)
      await criarReceitaPago({
        valor: valorSaque,
        dataISO: data,
        descricao: `Fechamento Investimento ${inv.nome}`,
        subcategoria: inv.corretora || "N/A"
      });

      closeModal(acaoModal);
      await carregarTudo();
    } catch (err) {
      console.error('Erro ao fechar investimento:', err);
      alert('Erro ao fechar o investimento.');
    }
  });

  // Ícones editar/excluir
  document.addEventListener('click', async (e) => {
    const icon = e.target.closest('.icon-btn');
    if (!icon) return;
    const id = icon.getAttribute('data-id');
    const action = icon.getAttribute('data-action');

    if (action === 'editar') {
      const inv = investimentos.find(x => x.id === id);
      if (!inv) return;
      invNome.value = inv.nome || '';
      invValor.value = inv.valor_inicial || 0;
      invData.value  = inv.data_inicial || todayISO();
      invVenc.value  = inv.data_vencimento || todayISO();
      invTipo.value  = inv.tipo || '';
      invCorretora.value = inv.corretora || '';
      investForm.dataset.editing = id;
      openModal(investModal);
      return;
    }

    if (action === 'excluir') {
      if (!confirm('Excluir este investimento e TODOS os registros (saldos, aportes, retiradas)?')) return;

      const subDelete = async (col, field) => {
        const q = query(collection(db, col), where("userId", "==", auth.currentUser.uid), where(field, "==", id));
        const docs = await getDocs(q);
        for (const d of docs.docs) await deleteDoc(doc(db, col, d.id));
      };
      await subDelete("investimento-saldos", "investimento_id");
      await subDelete("investimento-aportes", "investimento_id");
      await subDelete("investimento-retiradas", "investimento_id");
      await subDelete("investimento-fechamentos", "investimento_id");
      await deleteDoc(doc(db, "investimentos", id));
      await carregarTudo();
    }
  });

  /* ===========================
           HISTÓRICO
  ============================ */
  async function montarHistorico(invId){
    historicoBody.innerHTML = '';

    const inv = investimentos.find(x => x.id === invId);
    if (!inv) return;

    const itens = [];

    // saldos
    for (const s of (saldosPorInv[invId] || [])) {
      const ts = Number(s.created_at_ms) || Number(s.data_saldo_ts) || new Date(s.data_saldo + 'T00:00:00').getTime();
      itens.push({ ts, data: s.data_saldo, tipo: 'Saldo', valor: s.valor_saldo, desc: `Saldo (preço: ${(Number(s.unit_price)||0).toFixed(4)})` });
    }
    // aportes
    for (const a of (aportesPorInv[invId] || [])) {
      const ts = new Date(a.data_aporte + 'T00:00:00').getTime();
      itens.push({ ts, data: a.data_aporte, tipo: 'Aplicação', valor: a.valor, desc: `Aporte (preço: ${(Number(a.unit_price)||0).toFixed(4)}, +${(Number(a.units_adicionadas)||0).toFixed(4)} un)` });
    }
    // retiradas
    for (const r of (retiradasPorInv[invId] || [])) {
      const ts = new Date(r.data_retirada + 'T00:00:00').getTime();
      itens.push({ ts, data: r.data_retirada, tipo: 'Retirada', valor: r.valor, desc: `Retirada (preço: ${(Number(r.unit_price)||0).toFixed(4)}, -${(Number(r.units_removidas)||0).toFixed(4)} un)` });
    }
    // fechamento (se houver)
    const fin = fechamentos.find(f => f.investimento_id === invId);
    if (fin){
      const ts = new Date(fin.data_fechamento + 'T00:00:00').getTime();
      itens.push({
        ts, data: fin.data_fechamento, tipo: 'Fechamento', valor: fin.valor_retirado,
        desc: `Fechamento: final ${brl(fin.valor_final)} • retirado ${brl(fin.valor_retirado)} • taxas ${brl(fin.taxa_impostos||0)}`
      });
    }

    // ordena desc
    itens.sort((a,b)=> b.ts - a.ts);

    itens.forEach(it => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${new Date(it.data).toLocaleDateString('pt-BR')}</td>
        <td>${it.tipo}</td>
        <td>${it.desc}</td>
        <td style="text-align:right">${brl(it.valor)}</td>
      `;
      historicoBody.appendChild(tr);
    });

    if (!itens.length){
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="4" style="text-align:center;color:#6c757d;">Sem lançamentos ainda.</td>`;
      historicoBody.appendChild(tr);
    }
  }

  /* ===========================
        FECHAMENTO: RESUMO
  ============================ */
  function updateFechamentoResumo(inv){
    // (se você adicionou os elementos de resumo no HTML, mantenha; caso não, ignore)
    const saldo = valorAtual(inv);
    const investido = totalInvestidoAtivo(inv);
    const pl = saldo - investido;
    const roi = investido > 0 ? (pl / investido) * 100 : 0;

    const S = id => document.getElementById(id);
    if (!S('fechSaldoAtual')) return; // resumo opcional

    const vRet = getNumberFromInput(fechamentoValor) || 0;
    const vTax = getNumberFromInput(fechamentoTaxas) || 0;
    const vImp = getNumberFromInput(fechamentoImpostos) || 0;

    S('fechSaldoAtual').textContent = brl(saldo);
    S('fechInvestido').textContent  = brl(investido);
    S('fechRetirado').textContent   = brl(vRet);
    S('fechCustos').textContent     = brl(vTax + vImp);
    S('fechPL').textContent         = brl(pl);
    S('fechROI').textContent        = pct(roi);
  }
  function setupFechamentoUI(invId){
    const inv = investimentos.find(x => x.id === invId);
    if (!inv) return;
    updateFechamentoResumo(inv);
    ['fechamentoValor','fechamentoTaxas','fechamentoImpostos'].forEach(id=>{
      const el = document.getElementById(id); if (!el) return;
      el.removeEventListener('input', el.__fechPrev);
      el.__fechPrev = () => updateFechamentoResumo(inv);
      el.addEventListener('input', el.__fechPrev);
    });
  }
});
