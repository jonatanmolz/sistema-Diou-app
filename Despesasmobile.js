// despesas.js
// Página de Despesas — inicialização segura (DOM pronto), sem usar variáveis antes de criar
// Regras de vencimento:
// - CAIXA: data_vencimento = data_compra | status = "pago"
// - CARTÃO à vista: data_vencimento = data do cartão (ou input manual) | status = "pendente"
// - CARTÃO parcelado: usuário informa valor+data para cada parcela | status = "pendente"

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.3/firebase-auth.js";
import {
  collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js";

/* ---------------------- Utilidades ---------------------- */
const $ = (s) => document.querySelector(s);
const toStr = (v, f = "") => (v === undefined || v === null ? f : String(v));
const toNum = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);

function parseYMD(ymd) {
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function proximaDataComDia(dia, baseDate) {
  const base = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const last = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const diaMes = Math.min(Number(dia), last);
  let cand = new Date(base.getFullYear(), base.getMonth(), diaMes);
  if (cand < baseDate) {
    const prox = new Date(base.getFullYear(), base.getMonth() + 1, 1);
    const lastProx = new Date(prox.getFullYear(), prox.getMonth() + 1, 0).getDate();
    cand = new Date(prox.getFullYear(), prox.getMonth(), Math.min(Number(dia), lastProx));
  }
  return cand;
}

/* ---------------------- Estado ---------------------- */
let CURRENT_USER = null;
const CARTOES_CACHE = new Map(); // id -> dados

/* ---------------------- Boot DOM + Auth ---------------------- */
document.addEventListener("DOMContentLoaded", () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "Login.html";
      return;
    }
    CURRENT_USER = user;

    // Liga eventos de UI
    ligarEventosFormulario();

    // Carrega listas
    await Promise.all([
      carregarCaixas(),
      carregarCartoes(),
      carregarCategorias()
    ]);

    // Preenche subcategorias (se houver categoria pré-selecionada)
    await atualizarSubcategorias();

    // Lançamentos recentes
    await carregarLancamentosRecentes();
  });
});

/* ---------------------- Carregamentos ---------------------- */
async function carregarCaixas() {
  const select = $("#selectCaixa");
  if (!select) return;
  select.innerHTML = `<option value="">Selecione um caixa</option>`;

  const qCaixas = query(
    collection(db, "caixas"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("nome")
  );
  const snap = await getDocs(qCaixas);
  snap.forEach((docu) => {
    const data = docu.data();
    const opt = document.createElement("option");
    opt.value = docu.id;
    opt.textContent = data?.nome || `Caixa ${docu.id}`;
    select.appendChild(opt);
  });
}

async function carregarCartoes() {
  const select = $("#selectCartao");
  if (!select) return;
  select.innerHTML = `<option value="">Selecione um cartão</option>`;

  const qCartao = query(
    collection(db, "cartao-credito"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("nome")
  );
  const snap = await getDocs(qCartao);
  CARTOES_CACHE.clear();
  snap.forEach((docu) => {
    const data = docu.data();
    CARTOES_CACHE.set(docu.id, { id: docu.id, ...data });
    const opt = document.createElement("option");
    opt.value = docu.id;
    opt.textContent = data?.nome || `Cartão ${docu.id}`;
    select.appendChild(opt);
  });

  // Se já temos data de compra, tenta sugerir vencimento
  tentarPreencherDataVencimentoCartao();
}

async function carregarCategorias() {
  const select = $("#categoria");
  if (!select) return;
  select.innerHTML = `<option value="">Selecione uma categoria</option>`;

  const qCat = query(
    collection(db, "categoria-despesa"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("nome")
  );
  const snap = await getDocs(qCat);
  snap.forEach((docu) => {
    const data = docu.data();
    const opt = document.createElement("option");
    opt.value = docu.id;
    opt.textContent = data?.nome || `Categoria ${docu.id}`;
    select.appendChild(opt);
  });
}

/* ---------------------- Subcategorias ---------------------- */
async function atualizarSubcategorias() {
  const categoria_id = $("#categoria")?.value;
  const selSub = $("#subcategoria");
  if (!selSub) return;

  selSub.innerHTML = `<option value="">(Opcional) Selecione</option>`;
  if (!categoria_id) return;

  // 1) tenta array no doc de categoria
  const cRef = doc(db, "categoria-despesa", categoria_id);
  const cSnap = await getDoc(cRef);
  const cData = cSnap.data();
  if (cData && Array.isArray(cData.subcategorias) && cData.subcategorias.length > 0) {
    cData.subcategorias.forEach((nome) => {
      const opt = document.createElement("option");
      opt.value = nome;
      opt.textContent = nome;
      selSub.appendChild(opt);
    });
    return;
  }

  // 2) fallback: coleção subcategoria-despesa
  const qSub = query(
    collection(db, "subcategoria-despesa"),
    where("userId", "==", CURRENT_USER.uid),
    where("categoria_id", "==", categoria_id),
    orderBy("nome")
  );
  const snap = await getDocs(qSub);
  snap.forEach((docu) => {
    const s = docu.data();
    const opt = document.createElement("option");
    opt.value = s?.nome || "";
    opt.textContent = s?.nome || "(sem nome)";
    selSub.appendChild(opt);
  });
}

/* ---------------------- UI Dinâmica ---------------------- */
function ligarEventosFormulario() {
  $("#formaPagamento")?.addEventListener("change", atualizarVisibilidadePorForma);
  $("#isParcelado")?.addEventListener("change", atualizarVisibilidadePorForma);
  $("#categoria")?.addEventListener("change", atualizarSubcategorias);

  // recomputar vencimento sugerido quando muda cartão/compra
  $("#selectCartao")?.addEventListener("change", tentarPreencherDataVencimentoCartao);
  $("#dataCompra")?.addEventListener("change", tentarPreencherDataVencimentoCartao);

  $("#btnAddParcela")?.addEventListener("click", (e) => {
    e.preventDefault();
    adicionarLinhaParcela();
  });

  $("#formDespesa")?.addEventListener("submit", onSubmitDespesa);

  atualizarVisibilidadePorForma();
}

function atualizarVisibilidadePorForma() {
  const forma = $("#formaPagamento")?.value;
  const parcelado = $("#isParcelado")?.checked;

  const blocoCaixa = $("#blocoCaixa");
  const blocoCartao = $("#blocoCartao");
  const blocoVenc = $("#blocoVencCartao");
  const blocoParc = $("#blocoParcelas");

  if (!forma) return;

  if (forma === "caixa") {
    if (blocoCaixa) blocoCaixa.style.display = "block";
    if (blocoCartao) blocoCartao.style.display = "none";
    if (blocoVenc) blocoVenc.style.display = "none";
    if (blocoParc) blocoParc.style.display = "none";
  } else {
    if (blocoCaixa) blocoCaixa.style.display = "none";
    if (blocoCartao) blocoCartao.style.display = "block";
    if (parcelado) {
      if (blocoVenc) blocoVenc.style.display = "none";
      if (blocoParc) blocoParc.style.display = "block";
    } else {
      if (blocoVenc) blocoVenc.style.display = "block";
      if (blocoParc) blocoParc.style.display = "none";
    }
  }
}

function tentarPreencherDataVencimentoCartao() {
  const cartaoId = $("#selectCartao")?.value;
  const dataCompra = $("#dataCompra")?.value;
  const dest = $("#dataVencimentoCartao");
  if (!dest || !cartaoId || !dataCompra) return;

  const info = CARTOES_CACHE.get(cartaoId);
  const dia = info?.vencimento || info?.dia_vencimento;
  if (!dia) return; // sem metadado — usuário digita

  const base = parseYMD(dataCompra);
  if (!base) return;
  const prox = proximaDataComDia(Number(dia), base);
  dest.value = formatYMD(prox);
}

/* ---------------------- Parcelas ---------------------- */
function adicionarLinhaParcela() {
  const cont = $("#parcelasContainer");
  if (!cont) return;

  const idx = cont.querySelectorAll(".linha-parcela").length + 1;
  const row = document.createElement("div");
  row.className = "linha-parcela";
  row.innerHTML = `
    <input type="number" step="0.01" min="0" class="valor-parcela" placeholder="Valor da parcela ${idx}">
    <input type="date" class="data-parcela" placeholder="Data vencimento">
    <button class="btn-remover-parcela" title="Remover" type="button">&times;</button>
  `;
  row.querySelector(".btn-remover-parcela").addEventListener("click", () => row.remove());
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

/* ---------------------- Submit ---------------------- */
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
      if (!data_vencimento_cartao) throw new Error("Informe a data de vencimento do cartão.");
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

    alert(`Lançamento(s) criado(s): ${criados}.`);
    $("#formDespesa")?.reset();
    atualizarVisibilidadePorForma();
    await carregarLancamentosRecentes();

  } catch (err) {
    console.error(err);
    alert(err?.message || "Erro ao salvar despesa.");
  }
}

/* ---------------------- Lista recentes ---------------------- */
async function carregarLancamentosRecentes() {
  const lista = $("#listaLancamentos");
  if (!lista) return;

  lista.innerHTML = `<li class="muted">Carregando...</li>`;

  const qLanc = query(
    collection(db, "lancamentos"),
    where("userId", "==", CURRENT_USER.uid),
    orderBy("data_de_criacao", "desc"),
    limit(20)
  );
  const snap = await getDocs(qLanc);

  if (snap.empty) {
    lista.innerHTML = `<li class="muted">Nenhum lançamento ainda.</li>`;
    return;
  }

  const frag = document.createDocumentFragment();
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
    frag.appendChild(li);
  });
  lista.innerHTML = "";
  lista.appendChild(frag);
}
