
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, query, where, onSnapshot, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let caixasList = [];
let categoriasReceitaList = [];

const $ = (sel, root=document) => root.querySelector(sel);

function openModal(){
  // data default = hoje
  const t = new Date();
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth()+1).padStart(2,'0');
  const dd = String(t.getDate()).padStart(2,'0');
  $('#receitaDataPagamento').value = `${yyyy}-${mm}-${dd}`;

  $('.modal').style.display='flex';
  $('.modal').setAttribute('aria-hidden','false');
}
function closeModal(){
  $('#receitaForm').reset();
  $('#subcategoriaField').classList.add('hidden');
  $('.modal').style.display='none';
  $('.modal').setAttribute('aria-hidden','true');
}

onAuthStateChanged(auth,(user)=>{
  if(!user){ window.location.href='login.html'; return; }
  currentUser = user;
  loadData(user.uid);
});

$('#closeModal').addEventListener('click', closeModal);
window.addEventListener('click', (e)=>{
  if (e.target.classList.contains('modal')) closeModal();
});

function displayCaixas(caixas){
  const cont = $('#caixasContainer'); cont.innerHTML='';
  caixas.forEach(caixa=>{
    const btn = document.createElement('button');
    btn.className='card';
    btn.setAttribute('data-id', caixa.id);
    btn.innerHTML = `
      <h3>${caixa.nome}</h3>
      <p>Tipo: ${caixa.tipo}</p>
      <p class="saldo">Saldo: R$ ${Number(caixa.saldo||0).toFixed(2)}</p>
    `;
    btn.addEventListener('click', ()=>{
      $('#caixaSelecionadoId').value = caixa.id;
      $('#modalTitle').textContent = `Lançar Receita em ${caixa.nome}`;
      openModal();
    });
    cont.appendChild(btn);
  });
}

document.addEventListener('change', (e)=>{
  if (e.target.id === 'receitaCategoria'){
    const cat = categoriasReceitaList.find(c=>c.id===e.target.value);
    const field = $('#subcategoriaField');
    const select = $('#receitaSubcategoria');
    select.innerHTML='';
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
  }
});

function populateSelect(select, items, textKey){
  select.innerHTML='';
  const def = document.createElement('option');
  def.value=''; def.textContent='Selecione...';
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

  const qCategorias = query(collection(db,'categoria-receita'), where('userId','==',userId));
  onSnapshot(qCategorias, snap=>{
    categoriasReceitaList = snap.docs.map(d=>({id:d.id, ...d.data()}));
    populateSelect($('#receitaCategoria'), categoriasReceitaList, 'nome');
  });
}

// Submit
$('#receitaForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const caixaId = $('#caixaSelecionadoId').value;
  const descricao = $('#receitaDescricao').value.trim();
  const valor = parseFloat($('#receitaValor').value);
  const dataPagamento = $('#receitaDataPagamento').value;
  const categoriaId = $('#receitaCategoria').value;
  const subcategoria = $('#receitaSubcategoria')?.value || null;
  const observacoes = $('#receitaObservacoes').value || '';

  if (!caixaId || !descricao || !valor || !dataPagamento || !categoriaId){
    alert('Preencha todos os campos obrigatórios.');
    return;
  }

  try {
    // Gravar na coleção "contas-a-receber" incluindo caixa_id
    await addDoc(collection(db,'contas-a-receber'), {
      caixa_id: caixaId,
      categoria_id: categoriaId,
      data_de_criacao: serverTimestamp(),
      data_pagamento: dataPagamento,
      data_vencimento: dataPagamento,
      descricao: descricao,
      observacoes: observacoes,
      status_pagamento: 'pago',
      subcategoria: subcategoria,
      tipo: 'única',
      userId: currentUser.uid,
      valor: valor
    });

    // Atualiza o saldo do caixa (+)
    const caixa = caixasList.find(c=>c.id===caixaId);
    if (caixa){
      const novoSaldo = Number(caixa.saldo || 0) + valor;
      await updateDoc(doc(db,'caixas', caixaId), { saldo: novoSaldo });
    }

    alert('Receita lançada com sucesso!');
    closeModal();
  } catch (err){
    console.error(err);
    alert('Erro ao lançar receita. Tente novamente.');
  }
});
