
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let caixasList = [];
let cartoesList = [];
let categoriasDespesaList = [];

// --- Helpers ---
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function openModal() {
  // Preenche data atual
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  $('#despesaData').value = `${yyyy}-${mm}-${dd}`;
  $('.modal').style.display = 'flex';
  $('.modal').setAttribute('aria-hidden','false');
}
function closeModal() {
  $('#despesaForm').reset();
  $('#subcategoriaField').classList.add('hidden');
  $('#parcelamentoContainer').classList.add('hidden');
  $('#parcelasField').classList.add('hidden');
  $('#parcelasTableContainer').classList.add('hidden');
  $('#parcelasTable tbody').innerHTML = '';
  $('.modal').style.display = 'none';
  $('.modal').setAttribute('aria-hidden','true');
}

// --- Auth e carregamento ---
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = user;
  loadData(user.uid);
});

// --- Eventos do Modal ---
$('#closeModal').addEventListener('click', closeModal);
window.addEventListener('click', (e)=>{
  if (e.target.classList.contains('modal')) closeModal();
});

// --- Renderização dos cards ---
function displayCaixas(caixas){
  const cont = $('#caixasContainer'); cont.innerHTML = '';
  caixas.forEach(caixa => {
    const div = document.createElement('button');
    div.className = 'card';
    div.setAttribute('data-id', caixa.id);
    div.setAttribute('data-tipo', 'caixa');
    div.innerHTML = `
      <h3>${caixa.nome}</h3>
      <p>Tipo: ${caixa.tipo}</p>
      <p class="saldo">Saldo: R$ ${Number(caixa.saldo||0).toFixed(2)}</p>
    `;
    cont.appendChild(div);
  });
}
function displayCartoes(cartoes){
  const cont = $('#cartoesContainer'); cont.innerHTML = '';
  cartoes.forEach(cartao => {
    const div = document.createElement('button');
    div.className = 'card blue';
    div.setAttribute('data-id', cartao.id);
    div.setAttribute('data-tipo', 'cartao');
    div.innerHTML = `
      <h3>${cartao.nome}</h3>
      <p>Fechamento: Dia ${cartao.data_de_fechamento}</p>
      <p>Vencimento: Dia ${cartao.data_de_vencimento}</p>
    `;
    cont.appendChild(div);
  });
}

// --- Click nos cards abre modal ---
document.addEventListener('click', (e)=>{
  const card = e.target.closest('.card');
  if (!card) return;

  const id = card.getAttribute('data-id');
  const tipo = card.getAttribute('data-tipo');
  const nome = card.querySelector('h3')?.textContent || '';

  $('#formaPagamentoInput').value = tipo;
  $('#itemLancamentoId').value = id;
  $('#modalTitle').textContent = `Lançar Despesa em ${nome}`;

  if (tipo === 'cartao') {
    $('#parcelamentoContainer').classList.remove('hidden');
  } else {
    $('#parcelamentoContainer').classList.add('hidden');
  }
  openModal();
});

// Parcelamento UI
$('#despesaParcelamento').addEventListener('change', (e)=>{
  if (e.target.checked) {
    $('#parcelasField').classList.remove('hidden');
  } else {
    $('#parcelasField').classList.add('hidden');
    $('#parcelasTableContainer').classList.add('hidden');
    $('#parcelasTable tbody').innerHTML = '';
  }
});

$('#gerarParcelasBtn').addEventListener('click', ()=>{
  const valorTotal = parseFloat($('#despesaValor').value);
  const n = parseInt($('#despesaNumParcelas').value || '1', 10);
  const dataCompraStr = $('#despesaData').value;
  const cartaoId = $('#itemLancamentoId').value;

  if (!valorTotal || !n || !dataCompraStr || !cartaoId) {
    alert('Preencha valor, número de parcelas e a data de compra.');
    return;
  }
  const cartao = cartoesList.find(c => c.id === cartaoId);
  if (!cartao) {
    alert('Cartão não encontrado.');
    return;
  }

  // Primeira data de vencimento baseada em fechamento/vencimento
  const dataCompra = new Date(dataCompraStr + 'T12:00:00');
  let primeiroVenc = new Date(dataCompra);
  if (dataCompra.getDate() > Number(cartao.data_de_fechamento)) {
    primeiroVenc.setMonth(primeiroVenc.getMonth() + 1);
  }
  primeiroVenc.setDate(Number(cartao.data_de_vencimento));

  const tbody = $('#parcelasTable tbody');
  tbody.innerHTML = '';
  const base = Math.floor((valorTotal / n) * 100) / 100;
  let soma = 0;

  for (let i=1;i<=n;i++){
    let valor = (i < n) ? base : parseFloat((valorTotal - soma).toFixed(2));
    soma = parseFloat((soma + valor).toFixed(2));
    const venc = new Date(primeiroVenc);
    venc.setMonth(venc.getMonth() + (i-1));
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i}/${n}</td>
      <td><input type="number" class="parcela-valor" step="0.01" value="${valor}"></td>
      <td><input type="date" class="parcela-data" value="${venc.toISOString().slice(0,10)}"></td>
    `;
    tbody.appendChild(tr);
  }
  $('#parcelasTableContainer').classList.remove('hidden');
});

// Subcategorias dinâmicas
$('#despesaCategoria').addEventListener('change', (e)=>{
  const id = e.target.value;
  const cat = categoriasDespesaList.find(c => c.id === id);
  const field = $('#subcategoriaField');
  const select = $('#despesaSubcategoria');
  select.innerHTML = '';
  if (cat && Array.isArray(cat.subcategorias) && cat.subcategorias.length){
    field.classList.remove('hidden');
    cat.subcategorias.forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      select.appendChild(opt);
    });
  } else {
    field.classList.add('hidden');
  }
});

// Carregar dados
function populateSelect(select, items, textKey){
  select.innerHTML = '';
  const def = document.createElement('option');
  def.value = ''; def.textContent = 'Selecione...';
  select.appendChild(def);
  items.forEach(it=>{
    const opt = document.createElement('option');
    opt.value = it.id; opt.textContent = it[textKey];
    select.appendChild(opt);
  });
}

function loadData(userId){
  const qCaixas = query(collection(db,'caixas'), where('userId','==',userId));
  onSnapshot(qCaixas, snap=>{
    caixasList = snap.docs.map(d=>({id:d.id, ...d.data()}));
    displayCaixas(caixasList);
  });

  const qCartoes = query(collection(db,'cartao-credito'), where('userId','==',userId));
  onSnapshot(qCartoes, snap=>{
    cartoesList = snap.docs.map(d=>({id:d.id, ...d.data()}));
    displayCartoes(cartoesList);
  });

  const qCategorias = query(collection(db,'categoria-despesa'), where('userId','==',userId));
  onSnapshot(qCategorias, snap=>{
    categoriasDespesaList = snap.docs.map(d=>({id:d.id, ...d.data()}));
    populateSelect($('#despesaCategoria'), categoriasDespesaList, 'nome');
  });
}

// --- Submit do Formulário ---
$('#despesaForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const descricao = $('#despesaDescricao').value.trim();
  const valor = parseFloat($('#despesaValor').value);
  const dataCompra = $('#despesaData').value;
  const formaPagamento = $('#formaPagamentoInput').value;
  const itemLancamentoId = $('#itemLancamentoId').value;
  const categoriaId = $('#despesaCategoria').value;
  const subcategoria = $('#despesaSubcategoria')?.value || null;
  const observacoes = $('#despesaObservacoes').value || '';

  if (!descricao || !valor || !dataCompra || !categoriaId){
    alert('Preencha descrição, valor, data e categoria.');
    return;
  }

  try {
    if (formaPagamento === 'caixa'){
      const caixa = caixasList.find(c=>c.id===itemLancamentoId);
      if (!caixa){ alert('Caixa inválido.'); return; }

      await addDoc(collection(db,'lancamentos'), {
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

      const novoSaldo = Number(caixa.saldo||0) - valor;
      await updateDoc(doc(db,'caixas', itemLancamentoId), { saldo: novoSaldo });
      alert('Despesa lançada no caixa!');
      closeModal();

    } else if (formaPagamento === 'cartao'){
      const cartao = cartoesList.find(c=>c.id===itemLancamentoId);
      if (!cartao){ alert('Cartão inválido.'); return; }

      const parcelado = $('#despesaParcelamento').checked;
      if (!parcelado){
        // calcular vencimento avista
        const compra = new Date(dataCompra + 'T12:00:00');
        let venc = new Date(compra);
        if (compra.getDate() > Number(cartao.data_de_fechamento)){
          venc.setMonth(venc.getMonth()+1);
        }
        venc.setDate(Number(cartao.data_de_vencimento));
        const dataVencStr = venc.toISOString().slice(0,10);

        await addDoc(collection(db,'lancamentos'), {
          descricao,
          valor,
          data_compra: dataCompra,
          data_vencimento: dataVencStr,
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
        alert('Despesa no cartão (à vista) lançada!');
        closeModal();
      } else {
        // Parcelado
        const linhas = $$('#parcelasTable tbody tr');
        if (!linhas.length){
          alert('Clique em "Gerar Parcelas" primeiro.');
          return;
        }
        const n = linhas.length;
        for (let i=0;i<n;i++){
          const valorParcela = parseFloat(linhas[i].querySelector('.parcela-valor').value);
          const venc = linhas[i].querySelector('.parcela-data').value;
          await addDoc(collection(db,'lancamentos'), {
            descricao: `${descricao} - Parcela ${i+1}/${n}`,
            valor: valorParcela,
            data_compra: dataCompra,
            data_vencimento: venc,
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
        alert('Parcelas lançadas no cartão!');
        closeModal();
      }
    }
  } catch (err){
    console.error(err);
    alert('Erro ao lançar despesa. Tente novamente.');
  }
});
