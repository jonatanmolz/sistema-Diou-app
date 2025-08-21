// despesas.js
// App de Despesas — gravação na coleção "lancamentos" com o esquema solicitado
// - forma_pagamento = "caixa": data_vencimento = data_compra, status = "pago"
// - forma_pagamento = "cartao" (à vista): data_vencimento = vencimento do cartão (ou campo manual), status = "pendente"
// - forma_pagamento = "cartao" (parcelado): usuário informa valor+data de cada parcela, status = "pendente"
// Carrega caixas, cartões, categorias e subcategorias (array no doc de categoria ou coleção "subcategoria-despesa")

import { auth, db } from "./firebase-config.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ============================
   Helpers de UI e Data
============================ */

const $ = (sel) => document.querySelector(sel);

function toStr(v, fallback = "") {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// yyyy-mm-dd -> Date (sem timezone shift ao exibir)
function parseYMD(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Formata para yyyy-mm-dd
function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Dado um "dia do vencimento" (1..28/29/30/31), retorna a próxima data de vencimento após (ou no) dataBase
function proximaDataComDia(dia, dataBase) {
  const base = new Date(dataBase.getFullYear(), dataBase.getMonth(), 1);
  // Primeiro tenta no mês atual
  const ultimoDiaMesAtual = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const diaAjustado = Math.min(dia, ultimoDiaMesAtual);
  let candidato = new Date(base.getFullYear(), base.getMonth(), diaAjustado);
  if (candidato < dataBase) {
    // Vai para mês seguinte
    const proxMes = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const ultimoDiaProx = new Date(proxMes.getFullYear(), proxMes.getMonth() + 1, 0).getDate();
    const diaAjustadoProx = Math.min(dia, ultimoDiaProx);
    candidato = new Date(proxMes.getFullYear(), proxMes.getMonth(), diaAjustadoProx);
  }
  return candidato;
}

/* ============================
   Estado global simples
============================ */

let CURRENT_USER = null;
let CARTOES_CACHE = new Map(); // cartao_id -> { ...dados do cartão... }

/* ============================
   Autenticação e Boot
============================ */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Não logado → volta para login
    window.location.href = "Login.html";
    return;
  }
  CURRENT_USER = user;

  // Carregar listas iniciais
  await Promise.all([
    carregarCaixas(),
    carregarCartoes(),
    carregarCategorias()
  ]);

  // Liga eventos do formulário e UI dinâmica
  ligarEventosFormulario();

  // Carregar últimos lançamentos
  await carregarLancamentosRecentes();
});

/* ============================
   Carregamentos (caixas, cartões, categorias, subcategorias)
============================ */

async function carregarCaixas() {
  const sel = $("#selectCaixa");
  if (!sel) return;
  sel.innerHTML = `<option value="">Selecione um caixa</option>`;

  const qCaixas = query(
    collection(db, "caixas"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("nome") // se não existir "nome", remova esta linha
  );
  const snap = await getDocs(qCaixas);
  snap.forEach((docu) => {
    const data = docu.data();
    const opt = document.createElement("option");
    opt.value = docu.id;
    opt.textContent = data?.nome || `Caixa ${docu.id}`;
    sel.appendChild(opt);
  });
}

async function carregarCartoes() {
  const sel = $("#selectCartao");
  if (!sel) return;
  sel.innerHTML = `<option value="">Selecione um cartão</option>`;

  const qCartao = query(
    collection(db, "cartao-credito"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("nome") // se não existir "nome", remova esta linha
  );
  const snap = await getDocs(qCartao);
  CARTOES_CACHE.clear();
  snap.forEach((docu) => {
    const data = docu.data();
    CARTOES_CACHE.set(docu.id, { id: docu.id, ...data });
    const opt = document.createElement("option");
    opt.value = docu.id;
    opt.textContent = data?.nome || `Cartão ${docu.id}`;
    sel.appendChild(opt);
  });
}

async function carregarCategorias() {
  const sel = $("#categoria");
  if (!sel) return;
  sel.innerHTML = `<option value="">Selecione uma categoria</option>`;

  const qCat = query(
    collection(db, "categoria-despesa"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("nome") // se não existir "nome", remova
  );
  const snap = await getDocs(qCat);
  snap.forEach((docu) => {
    const data = docu.data();
    const opt = document.createElement("option");
    opt.value = docu.id;
    opt.textContent = data?.nome || `Categoria ${docu.id}`;
    opt.dataset.hasSubArray = Array.isArray(data?.subcategorias) ? "1" : "0";
    sel.appendChild(opt);
  });

  // Preenche subcategorias com base na categoria atual (se houver)
  await atualizarSubcategorias();
}

async function atualizarSubcategorias() {
  const selCat = $("#categoria");
  const selSub = $("#subcategoria");
  if (!selCat || !selSub) return;

  const categoria_id = selCat.value;
  selSub.innerHTML = `<option value="">(Opcional) Selecione</option>`;
  if (!categoria_id) return;

  // 1) Tenta array no doc de categoria: subcategorias: [ "Mercado", "Padaria", ... ]
  const docRef = doc(db, "categoria-despesa", categoria_id);
  const docSnap = await getDoc(docRef);
  const data = docSnap.data();

  if (data && Array.isArray(data.subcategorias) && data.subcategorias.length > 0) {
    data.subcategorias.forEach((nome) => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      selSub.appendChild(opt);
    });
    return;
  }

  // 2) Fallback: coleção "subcategoria-despesa" filtrando por categoria_id + userId
  const qSub = query(
    collection(db, "subcategoria-despesa"),
    where("userId", "==", CURRENT_USER.uid),
    where("categoria_id", "==", categoria_id),
    orderBy("nome") // se não existir "nome", remova
  );
  const snap = await getDocs(qSub);
  snap.forEach((docu) => {
    const sdata = docu.data();
    const opt = document.createElement("option");
    opt.value = sdata?.nome || "";
    opt.textContent = sdata?.nome || "(sem nome)";
    selSub.appendChild(opt);
  });
}

/* ============================
   UI dinâmica do formulário
============================ */

function ligarEventosFormulario() {
  const formaPagamento = $("#formaPagamento");
  const isParcelado = $("#isParcelado");
  const selectCartao = $("#selectCartao");
  const dataCompraInput = $("#dataCompra");
  const dataVencInput = $("#dataVencimentoCartao");
  const categoriaSel = $("#categoria");
  const addParcelaBtn = $("#btnAddParcela");

  if (formaPagamento) {
    formaPagamento.addEventListener("change", atualizarVisibilidadePorForma);
  }
  if (isParcelado) {
    isParcelado.addEventListener("change", atualizarVisibilidadePorForma);
  }
  if (categoriaSel) {
    categoriaSel.addEventListener("change", atualizarSubcategorias);
  }
  if (selectCartao && dataCompraInput) {
    // Quando mudar cartão ou data de compra, tenta preencher data de vencimento automaticamente
    const recomputa = () => {
      tentarPreencherDataVencimentoCartao();
    };
    selectCartao.addEventListener("change", recomputa);
    dataCompraInput.addEventListener("change", recomputa);
  }
  if (addParcelaBtn) {
    addParcelaBtn.addEventListener("click", adicionarLinhaParcela);
  }

  // Submit
  const form = $("#formDespesa");
  if (form) {
    form.addEventListener("submit", onSubmitDespesa);
  }

  // Inicial
  atualizarVisibilidadePorForma();
}

// Mostra/esconde campos conforme forma de pagamento + parcelado
function atualizarVisibilidadePorForma() {
  const formaPagamento = $("#formaPagamento")?.value;
  const isParcelado = $("#isParcelado")?.checked;
  const blocoCaixa = $("#blocoCaixa");           // container do select de caixa
  const blocoCartao = $("#blocoCartao");         // container do select de cartão
  const blocoVencCartao = $("#blocoVencCartao"); // container do input dataVencimentoCartao
  const blocoParcelas = $("#blocoParcelas");     // container da tabela/lista de parcelas

  if (!formaPagamento) return;

  if (formaPagamento === "caixa") {
    if (blocoCaixa) blocoCaixa.style.display = "block";
    if (blocoCartao) blocoCartao.style.display = "none";
    if (blocoVencCartao) blocoVencCartao.style.display = "none";
    if (blocoParcelas) blocoParcelas.style.display = "none";
  } else {
    // cartao
    if (blocoCaixa) blocoCaixa.style.display = "none";
    if (blocoCartao) blocoCartao.style.display = "block";
    if (isParcelado) {
      if (blocoVencCartao) blocoVencCartao.style.display = "none";
      if (blocoParcelas) blocoParcelas.style.display = "block";
    } else {
      if (blocoVencCartao) blocoVencCartao.style.display = "block";
      if (blocoParcelas) blocoParcelas.style.display = "none";
    }
  }
}

// Se o cartão tiver "vencimento" (dia), calcula a próxima data e preenche o input.
// Campos esperados no doc do cartão (qualquer um funciona): "vencimento" ou "dia_vencimento".
function tentarPreencherDataVencimentoCartao() {
  const cartaoId = $("#selectCartao")?.value;
  const dataCompraStr = $("#dataCompra")?.value;
  const dest = $("#dataVencimentoCartao");
  if (!dest || !cartaoId || !dataCompraStr) return;

  const info = CARTOES_CACHE.get(cartaoId);
  const dia = info?.vencimento || info?.dia_vencimento;
  if (!dia) return; // sem metadado — deixa o usuário digitar

  const base = parseYMD(dataCompraStr);
  const prox = proximaDataComDia(Number(dia), base);
  dest.value = formatYMD(prox);
}

/* ============================
   Parcelas (UI)
============================ */

function adicionarLinhaParcela(e) {
  if (e) e.preventDefault();
  const cont = $("#parcelasContainer");
  if (!cont) return;

  const idx = cont.querySelectorAll(".linha-parcela").length + 1;
  const row = document.createElement("div");
  row.className = "linha-parcela";
  row.style.display = "grid";
  row.style.gridTemplateColumns = "1fr 1fr auto";
  row.style.gap = "8px";
  row.style.marginBottom = "6px";

  row.innerHTML = `
    <input type="number" step="0.01" min="0" class="valor-parcela" placeholder="Valor da parcela ${idx}">
    <input type="date" class="data-parcela" placeholder="Data vencimento">
    <button class="btn-remover-parcela" title="Remover" type="button">&times;</button>
  `;
  row.querySelector(".btn-remover-parcela").addEventListener("click", () => {
    row.remove();
  });
  cont.appendChild(row);
}

function coletarParcelasDaUI() {
  const linhas = Array.from(document.querySelectorAll(".linha-parcela"));
  return linhas.map((ln) => {
    const valor = toNum(ln.querySelector(".valor-parcela")?.value, 0);
    const data_venc = toStr(ln.querySelector(".data-parcela")?.value, "");
    return { valorParcela: valor, data_vencimento: data_venc };
  }).filter(p => p.valorParcela > 0 && p.data_vencimento);
}

/* ============================
   Submit: salvar despesa(s)
============================ */

async function onSubmitDespesa(e) {
  e.preventDefault();

  try {
    if (!CURRENT_USER) throw new Error("Usuário não autenticado.");

    const descricao = toStr($("#descricao")?.value).trim();
    const valor = toNum($("#valor")?.value, 0);
    const data_compra = toStr($("#dataCompra")?.value);
    const categoria_id = toStr($("#categoria")?.value);
    const subcategoria = toStr($("#subcategoria")?.value, "");
    const observacoes = toStr($("#observacoes")?.value, "");

    const forma_pagamento = toStr($("#formaPagamento")?.value);
    const caixa_id = toStr($("#selectCaixa")?.value);
    const cartao_id = toStr($("#selectCartao")?.value);
    const ehParcelado = $("#isParcelado")?.checked === true;

    if (!descricao) throw new Error("Informe a descrição.");
    if (valor <= 0 && !ehParcelado) throw new Error("Informe um valor maior que zero.");
    if (!data_compra) throw new Error("Informe a data da compra.");
    if (!categoria_id) throw new Error("Selecione a categoria.");
    if (!forma_pagamento) throw new Error("Selecione a forma de pagamento.");

    // Monta lançamentos conforme regra
    const colLanc = collection(db, "lancamentos");
    const userId = CURRENT_USER.uid;

    const baseDoc = {
      categoria_id: String(categoria_id),
      data_compra: String(data_compra),
      data_de_criacao: serverTimestamp(),
      descricao: String(descricao),
      forma_pagamento: String(forma_pagamento),
      observacoes: observacoes ? String(observacoes) : "",
      status_pagamento: "", // define abaixo
      subcategoria: subcategoria ? String(subcategoria) : "",
      tipo: "despesa",
      userId
    };

    let criados = 0;

    if (forma_pagamento === "caixa") {
      if (!caixa_id) throw new Error("Selecione o caixa.");
      const docData = {
        ...baseDoc,
        caixa_id: String(caixa_id),
        data_vencimento: String(data_compra), // igual à compra
        status_pagamento: "pago",
        valor: Number(valor)
      };
      await addDoc(colLanc, docData);
      criados++;

    } else if (forma_pagamento === "cartao" && !ehParcelado) {
      if (!cartao_id) throw new Error("Selecione o cartão.");
      const data_vencimento_cartao = toStr($("#dataVencimentoCartao")?.value);
      if (!data_vencimento_cartao) {
        throw new Error("Informe a data de vencimento do cartão.");
      }
      const docData = {
        ...baseDoc,
        cartao_id: String(cartao_id),
        data_vencimento: String(data_vencimento_cartao),
        status_pagamento: "pendente",
        valor: Number(valor)
      };
      await addDoc(colLanc, docData);
      criados++;

    } else if (forma_pagamento === "cartao" && ehParcelado) {
      if (!cartao_id) throw new Error("Selecione o cartão.");
      const parcelas = coletarParcelasDaUI();
      if (!parcelas.length) throw new Error("Adicione pelo menos 1 parcela (valor e data).");

      for (let i = 0; i < parcelas.length; i++) {
        const p = parcelas[i];
        if (!p.valorParcela || !p.data_vencimento) {
          throw new Error(`Preencha valor e data da parcela ${i + 1}.`);
        }
        const docData = {
          ...baseDoc,
          cartao_id: String(cartao_id),
          data_vencimento: String(p.data_vencimento),
          status_pagamento: "pendente",
          valor: Number(p.valorParcela),
          descricao: `${String(descricao)} - Parcela ${i + 1}/${parcelas.length}`
        };
        await addDoc(colLanc, docData);
        criados++;
      }

    } else {
      throw new Error("Forma de pagamento inválida.");
    }

    // Sucesso
    alert(`Lançamento(s) criado(s): ${criados}.`);
    $("#formDespesa")?.reset();
    atualizarVisibilidadePorForma();
    await carregarLancamentosRecentes();

  } catch (err) {
    console.error(err);
    alert(err?.message || "Erro ao salvar despesa.");
  }
}

/* ============================
   Lista: lançamentos recentes
============================ */

async function carregarLancamentosRecentes() {
  const lista = $("#listaLancamentos");
  if (!lista) return;

  lista.innerHTML = `<li>Carregando...</li>`;

  const qLanc = query(
    collection(db, "lancamentos"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("data_de_criacao", "desc"),
    limit(20)
  );
  const snap = await getDocs(qLanc);

  if (snap.empty) {
    lista.innerHTML = `<li>Nenhum lançamento ainda.</li>`;
    return;
  }

  const items = [];
  snap.forEach((docu) => {
    const d = docu.data();
    const li = document.createElement("li");
    li.className = "item-lancamento";
    li.innerHTML = `
      <div class="linha-1">
        <strong>${d.descricao || "(sem descrição)"}</strong>
        <span>R$ ${Number(d.valor || 0).toFixed(2)}</span>
      </div>
      <div class="linha-2">
        <span>${d.forma_pagamento || ""}${d.caixa_id ? " • Caixa" : d.cartao_id ? " • Cartão" : ""}</span>
        <span>Compra: ${d.data_compra || ""}</span>
        <span>Venc.: ${d.data_vencimento || ""}</span>
        <span>Status: ${d.status_pagamento || ""}</span>
      </div>
    `;
    items.push(li);
  });

  lista.innerHTML = "";
  items.forEach((li) => lista.appendChild(li));
}
