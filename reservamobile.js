/* ========= Firebase v8 ========= */
var firebaseConfig = {
  apiKey: "AIzaSyCSo4NsaIlD9Mdfrlp-5jjxxrhcqnx5XuI",
  authDomain: "sistemaasadelta.firebaseapp.com",
  projectId: "sistemaasadelta",
  storageBucket: "sistemaasadelta.appspot.com",
  messagingSenderId: "379026766576",
  appId: "1:379026766576:web:c6d3f2b6a71e42a98f123d"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ===== Utils ===== */
const PT_DOW=["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const PT_MON=["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
const pad2=n=>String(n).padStart(2,"0");
function truncateToLocalDate(d){const x=new Date(d);x.setHours(0,0,0,0);return x;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return truncateToLocalDate(x);}
function fmtISO(d){return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;}
function fmtDisplay(d){return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;}
function parseISO(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y,m,dd]=s.split("-").map(Number); const d=new Date(y,m-1,dd); return isNaN(d)?null:truncateToLocalDate(d); }
function daysBetween(a,b){const A=truncateToLocalDate(a),B=truncateToLocalDate(b);return Math.round((B-A)/(24*60*60*1000));}
function isToday(d){const t=truncateToLocalDate(new Date());return t.getTime()===truncateToLocalDate(d).getTime();}
function addOneHour(hhmm){const [h,m]=hhmm.split(":").map(Number);const d=new Date(2000,0,1,h,m,0);d.setHours(d.getHours()+1);return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function str(v){ if(v==null) return ""; try{ return String(v);}catch(_){ return ""; } }
function escapeHtml(s){return (s||"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

/* ===== Elements ===== */
const $cardsWrapper=document.getElementById("date-cards-wrapper");
const $prev=document.getElementById("prev-day");
const $next=document.getElementById("next-day");
const $picker=document.getElementById("date-picker");
const $btnToday=document.getElementById("btn-today");
const $btnOpenExtras=document.getElementById("btn-open-extras");

const $obsTitulo=document.getElementById("observacao-titulo");
const $obsText=document.getElementById("observacao-textarea");
const $obsStatus=document.getElementById("obs-status");

const $grid=document.getElementById("grid-reservas");
const $gridTitle=document.getElementById("grid-title");

/* ===== Estado ===== */
const startOffsetDays=-15,endOffsetDays=30;
let selectedDate=truncateToLocalDate(new Date());
let rangeStart,rangeEnd;
let cardsIndexByKey=new Map();
let obsSaveTimeout=null;
const observacaoPadrao=`Churrasqueira Baixo:
Churrasqueira Cima:
Churrasqueira Rua:
Observações gerais:`;

let quadras=[], quadrasOrder=[], quadraById=new Map();
let clientesCache=new Map(), clienteLabelToId=new Map();

/* ====== Init ====== */
document.addEventListener("DOMContentLoaded", async()=>{
  await carregarQuadras();
  await carregarClientesParaDatalist();
  initCarousel();
  bindObservationHandlers();
  bindModalHandlers();

  $btnOpenExtras.addEventListener("click", openExtrasFlow);
});

/* ====== Carousel ====== */
function initCarousel(){
  const today=truncateToLocalDate(new Date());
  rangeStart=addDays(today,startOffsetDays);
  rangeEnd=addDays(today,endOffsetDays);
  renderRange(rangeStart,rangeEnd);
  selectDate(today,{scrollIntoView:true});
  $picker.value=fmtISO(today);

  $prev.addEventListener("click",()=>scrollByHalf(-1));
  $next.addEventListener("click",()=>scrollByHalf(+1));
  $btnToday.addEventListener("click",()=>{const t=truncateToLocalDate(new Date());ensureDateInRange(t);selectDate(t,{scrollIntoView:true});$picker.value=fmtISO(t);});
  $picker.addEventListener("change",e=>{const d=parseISO(e.target.value);if(!d)return;ensureDateInRange(d);selectDate(d,{scrollIntoView:true});});
  $cardsWrapper.addEventListener("wheel",e=>{$cardsWrapper.scrollLeft+=(Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX);},{passive:true});
  window.addEventListener("resize",()=>scrollCardIntoCenter(fmtISO(selectedDate)));
}
function renderRange(start,end){
  $cardsWrapper.innerHTML=""; cardsIndexByKey.clear();
  const span=daysBetween(start,end);
  for(let i=0;i<=span;i++){
    const d=addDays(start,i); const key=fmtISO(d);
    const el=document.createElement("button");
    el.type="button"; el.className="date-card"; el.dataset.key=key;
    if(isToday(d)) el.classList.add("today");
    el.innerHTML=`<span class="dow">${PT_DOW[d.getDay()]}</span>
                  <span class="day">${pad2(d.getDate())}</span>
                  <span class="mon">${PT_MON[d.getMonth()]}</span>`;
    el.addEventListener("click",()=>selectDate(d,{scrollIntoView:true}));
    $cardsWrapper.appendChild(el);
    cardsIndexByKey.set(key,i);
  }
}
function selectDate(d,{scrollIntoView=false}={}){
  selectedDate=truncateToLocalDate(d);
  const key=fmtISO(selectedDate);
  $cardsWrapper.querySelectorAll(".date-card.active").forEach(x=>x.classList.remove("active"));
  const el=$cardsWrapper.querySelector(`.date-card[data-key="${key}"]`);
  if(el) el.classList.add("active");
  if(scrollIntoView) scrollCardIntoCenter(key);
  onDateSelected(selectedDate);
}
function scrollCardIntoCenter(key){
  const el=$cardsWrapper.querySelector(`.date-card[data-key="${key}"]`);
  if(!el) return;
  const wrap=$cardsWrapper.getBoundingClientRect();
  const rect=el.getBoundingClientRect();
  const off=(rect.left-wrap.left)-(wrap.width/2-rect.width/2);
  $cardsWrapper.scrollTo({left:$cardsWrapper.scrollLeft+off,behavior:"smooth"});
}
function scrollByHalf(dir){ $cardsWrapper.scrollBy({left:dir*(($cardsWrapper.clientWidth||600)/2),behavior:"smooth"}); }
function ensureDateInRange(d){
  if(d<rangeStart){ rangeStart=d; renderRange(rangeStart,rangeEnd); }
  else if(d>rangeEnd){ rangeEnd=d; renderRange(rangeStart,rangeEnd); }
}

/* ===== Observação do dia ===== */
function bindObservationHandlers(){
  $obsText.addEventListener("input",()=>{
    $obsStatus.textContent="Digitando…";
    clearTimeout(obsSaveTimeout);
    obsSaveTimeout=setTimeout(salvarObservacaoAtual,1200);
  });
}
async function carregarObservacao(dateObj){
  clearTimeout(obsSaveTimeout);
  $obsStatus.textContent=""; $obsText.disabled=true; $obsText.value="Carregando...";
  const key=fmtISO(dateObj);
  try{
    const s=await db.collection("observacoes_datas").doc(key).get();
    let txt=observacaoPadrao;
    if(s.exists && typeof s.data().observacao==="string" && s.data().observacao.trim()!==""){ txt=s.data().observacao; }
    $obsText.value=txt; $obsText.disabled=false; $obsStatus.textContent="Pronto para editar";
  }catch(e){
    console.error(e); $obsText.value=observacaoPadrao; $obsText.disabled=false; $obsStatus.textContent="Falha ao carregar (padrão)";
  }
}
async function salvarObservacaoAtual(){
  const key=fmtISO(selectedDate);
  try{
    $obsStatus.textContent="Salvando…";
    await db.collection("observacoes_datas").doc(key).set({observacao:$obsText.value});
    $obsStatus.textContent="Salvo";
  }catch(e){ console.error(e); $obsStatus.textContent="Erro ao salvar"; }
}

/* ===== Quadras & Clientes ===== */
async function carregarQuadras(){
  quadras=[]; quadraById.clear();
  const snap=await db.collection("quadras").get();
  snap.forEach(doc=>{ const q={id:doc.id, ...(doc.data()||{})}; quadras.push(q); });
  const prefer=["Quadra 01","Quadra 02","Quadra 03","Quadra 04 (externa)"];
  quadras.sort((a,b)=>{
    const ia=prefer.indexOf(a.nome||""), ib=prefer.indexOf(b.nome||"");
    if(ia!==-1 && ib!==-1) return ia-ib;
    if(ia!==-1) return -1; if(ib!==-1) return 1;
    return (a.nome||"").localeCompare(b.nome||"");
  });
  quadras.forEach(q=>quadraById.set(q.id,q));
  quadrasOrder=quadras.map(q=>q.id);
}
async function carregarClientesParaDatalist(){
  clienteLabelToId.clear();
  const list=document.getElementById("cliente-datalist");
  list.innerHTML="";
  const snap=await db.collection("clientes").orderBy("nome").get();
  snap.forEach(doc=>{
    const c={id:doc.id, ...(doc.data()||{})};
    clientesCache.set(c.id,c);
    const label=formatClienteLabel(c);
    clienteLabelToId.set(label,c.id);
    const opt=document.createElement("option"); opt.value=label; list.appendChild(opt);
  });
}
function formatClienteLabel(c){
  const nome=c.nome||"(Sem nome)";
  const tel=c.telefone?` ${c.telefone}`:"";
  return `${nome}${tel?` (${tel})`:""}`;
}
async function awaitEnsureCliente(id){
  if(!id) return null;
  if(clientesCache.has(id)) return clientesCache.get(id);
  const s=await db.collection("clientes").doc(id).get();
  if(!s.exists) return null;
  const c={id:s.id, ...(s.data()||{})};
  clientesCache.set(id,c);
  const lbl=formatClienteLabel(c);
  if(!clienteLabelToId.has(lbl)){
    clienteLabelToId.set(lbl,id);
    const list=document.getElementById("cliente-datalist");
    const opt=document.createElement("option"); opt.value=lbl; list.appendChild(opt);
  }
  return c;
}
async function prefetchClientes(ids){
  const miss=ids.filter(id=>id && !clientesCache.has(id));
  if(!miss.length) return;
  const reads=await Promise.all(miss.map(id=>db.collection("clientes").doc(id).get()));
  reads.forEach(s=>{
    if(!s.exists) return; const c={id:s.id, ...(s.data()||{})};
    clientesCache.set(c.id,c);
    const lbl=formatClienteLabel(c);
    if(!clienteLabelToId.has(lbl)){
      clienteLabelToId.set(lbl,c.id);
      const list=document.getElementById("cliente-datalist");
      const opt=document.createElement("option"); opt.value=lbl; list.appendChild(opt);
    }
  });
}

/* ===== Horários padrão/extras ===== */
function horariosPadraoPara(d){
  const dow=d.getDay();
  if(dow>=1 && dow<=5) return ["17:30","18:30","19:30","20:30","21:30"];
  if(dow===6){ const a=[]; for(let h=9;h<=18;h++) a.push(`${pad2(h)}:00`); return a; }
  const a=[]; for(let h=13;h<=18;h++) a.push(`${pad2(h)}:00`); return a;
}
async function horariosExtrasPara(key){
  try{
    const s=await db.collection("horarios_visiveis_personalizados").doc(key).get();
    if(s.exists && Array.isArray((s.data()||{}).horariosVisiveis)) return (s.data().horariosVisiveis).slice().sort();
  }catch(e){ console.warn(e); }
  return [];
}
function allowedExtrasFor(d){
  const dow=d.getDay(); const arr=[];
  if(dow>=1 && dow<=5){ for(let h=7;h<=23;h++) arr.push(`${pad2(h)}:30`); }
  else{ for(let h=7;h<=23;h++) arr.push(`${pad2(h)}:00`); }
  return arr;
}
function sortTimes(arr){
  return arr.slice().sort((a,b)=>{const [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number);return ah!==bh?ah-bh:am-bm;});
}

/* ===== Montagem de Grade ===== */
async function onDateSelected(d){
  $obsTitulo.textContent=`Observação do Dia (${fmtDisplay(d)}):`;
  $gridTitle.textContent=`Reservas — ${fmtDisplay(d)}`;
  await carregarObservacao(d);
  await montarGrade(d);
}
async function montarGrade(d){
  const dateKey=fmtISO(d);
  const base=horariosPadraoPara(d);
  const extras=await horariosExtrasPara(dateKey);
  const horarios=Array.from(new Set([...base,...extras])).sort((a,b)=>{
    const [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number);
    return ah!==bh?ah-bh:am-bm;
  });

  const resSnap=await db.collection("reservas").where("data_reserva","==",dateKey).get();
  const reservas=[]; resSnap.forEach(doc=>reservas.push({id:doc.id, ...(doc.data()||{})}));

  const idsClientes=[...new Set(reservas.map(r=>r.id_cliente).filter(Boolean))];
  await prefetchClientes(idsClientes);

  const bySlot=new Map();
  for(const r of reservas){
    const key=`${r.hora_inicio}|${r.id_quadra}`;
    const isCancel=r.status_reserva==="cancelada";
    let cell=bySlot.get(key);
    if(!cell){ cell={ativa:null,canceladas:[]}; bySlot.set(key,cell); }
    if(isCancel){ cell.canceladas.push(r); }
    else{
      if(!cell.ativa) cell.ativa=r;
      else{
        const a=cell.ativa, ta=a.data_criacao?.seconds||0, tb=r.data_criacao?.seconds||0;
        if(tb>=ta){ cell.ativa=r; cell.canceladas.push(a); } else { cell.canceladas.push(r); }
      }
    }
  }

  $grid.style.setProperty("--qcols", quadrasOrder.length);
  $grid.innerHTML="";

  // header
  const header=document.createElement("div");
  header.className="grid-header";
  header.appendChild(elDiv("Horário"));
  for(const qid of quadrasOrder){
    const q=quadraById.get(qid);
    header.appendChild(elDiv(q?.nome||"Quadra"));
  }
  $grid.appendChild(header);

  // rows
  for(const h of horarios){
    const row=document.createElement("div");
    row.className="grid-row";
    const timeCol=document.createElement("div");
    timeCol.className="time-col";
    timeCol.textContent=h;
    row.appendChild(timeCol);

    for(const qid of quadrasOrder){
      const cell=document.createElement("div");
      cell.className="grid-cell";
      const info=bySlot.get(`${h}|${qid}`);

      if(info && info.ativa){
        const r=info.ativa;
        const pag=r.pagamento_reserva||"aguardando";
        const card=document.createElement("div");
        card.className=`card-mini ${pag}`;

        const cl=clientesCache.get(r.id_cliente) || await awaitEnsureCliente(r.id_cliente);
        const cliNome=cl?.nome || "Cliente";

        const topline=document.createElement("div");
        topline.className="topline";
        topline.innerHTML=`<span>${escapeHtml(cliNome)}</span><span>${statusIcon(r.status_reserva)}</span>`;
        card.appendChild(topline);

        const meta=document.createElement("div");
        meta.className="meta";
        const tipo=(r.tipo_reserva==="Fixo")?`<span class="badge-fixo">Fixo</span>`:`<span class="badge-fixo" style="background:#6b7280">Normal</span>`;
        meta.innerHTML=`${tipo}<span>Valor: R$ ${Number(r.valor||0)}</span>`;
        card.appendChild(meta);

        const icons=document.createElement("div");
        icons.className="icons";
        icons.appendChild(makeMiniBtn("✎","Editar",()=>abrirModalEditar(r,dateKey,h,qid)));
        icons.appendChild(makeMiniBtn("⇄","Trocar",()=>trocarQuadraFlow(r)));
        icons.appendChild(makeMiniBtn("✅","Confirmar",()=>confirmarReserva(r)));
        icons.appendChild(makeMiniBtn("🚫","Não comp.",()=>naoCompareceuReserva(r)));
        icons.appendChild(makeMiniBtn("🛑","Cancelar",()=>cancelarReservaFlow(r)));
        icons.appendChild(makeMiniBtn("🗑","Excluir",()=>excluirReservaFlow(r)));
        card.appendChild(icons);

        cell.appendChild(card);

        if(info.canceladas && info.canceladas.length){
          const chips=document.createElement("div"); chips.className="chips";
          const max=2;
          for(const c of info.canceladas.slice(0,max)){
            const cc=clientesCache.get(c.id_cliente) || await awaitEnsureCliente(c.id_cliente);
            const chip=document.createElement("button");
            chip.className="chip"; chip.type="button"; chip.textContent=cc?.nome || "Cancelada";
            chip.addEventListener("click",()=>abrirModalEditar(c,dateKey,h,qid));
            chips.appendChild(chip);
          }
          if(info.canceladas.length>max){
            const more=document.createElement("span"); more.className="chip"; more.textContent=`+${info.canceladas.length-max}`;
            chips.appendChild(more);
          }
          cell.appendChild(chips);
        }
      }else{
        const free=document.createElement("button");
        free.className="cell-free"; free.type="button"; free.textContent="Disponível";
        free.addEventListener("click",()=>abrirModalNova(dateKey,h,qid));
        cell.appendChild(free);

        if(info && info.canceladas && info.canceladas.length){
          const chips=document.createElement("div"); chips.className="chips";
          const max=2;
          for(const c of info.canceladas.slice(0,max)){
            const cc=clientesCache.get(c.id_cliente) || await awaitEnsureCliente(c.id_cliente);
            const chip=document.createElement("button");
            chip.className="chip"; chip.type="button"; chip.textContent=cc?.nome || "Cancelada";
            chip.addEventListener("click",()=>abrirModalEditar(c,dateKey,h,qid));
            chips.appendChild(chip);
          }
          if(info.canceladas.length>max){
            const more=document.createElement("span"); more.className="chip"; more.textContent=`+${info.canceladas.length-max}`;
            chips.appendChild(more);
          }
          cell.appendChild(chips);
        }
      }

      row.appendChild(cell);
    }
    $grid.appendChild(row);
  }
}
function elDiv(t){const d=document.createElement("div");d.textContent=t;return d;}
function makeMiniBtn(txt,title,fn){const b=document.createElement("button");b.className="icon-mini";b.type="button";b.title=title;b.textContent=txt;b.addEventListener("click",(e)=>{e.stopPropagation();fn();});return b;}
function statusIcon(st){switch(st){case"confirmada":return"✅";case"cancelada":return"🛑";case"nao_compareceu":return"🚫";default:return"🕒";}}

/* ===== Modais (Nova/Editar/Extras) ===== */
const $backdrop=document.getElementById("modal-backdrop");

// Nova
const $modalNova=document.getElementById("modal-nova");
const $novaData=document.getElementById("nova-data");
const $novaHora=document.getElementById("nova-hora");
const $novaQuadra=document.getElementById("nova-quadra");
const $novaCliente=document.getElementById("nova-cliente");
const $novaClienteId=document.getElementById("nova-cliente-id");
const $novaClienteAviso=document.getElementById("nova-cliente-aviso");
const $novaTipo=document.getElementById("nova-tipo");
const $novaValor=document.getElementById("nova-valor");
const $novaObs=document.getElementById("nova-obs");
const $btnSalvarNova=document.getElementById("btn-salvar-nova");

// Editar
const $modalEditar=document.getElementById("modal-editar");
const $editCliente=document.getElementById("edit-cliente");
const $editData=document.getElementById("edit-data");
const $editHora=document.getElementById("edit-hora");
const $editQuadra=document.getElementById("edit-quadra");
const $editValor=document.getElementById("edit-valor");
const $editStatusReserva=document.getElementById("edit-status-reserva");
const $editStatusPag=document.getElementById("edit-status-pagamento");
const $editObs=document.getElementById("edit-obs");
const $btnSalvarEditar=document.getElementById("btn-salvar-editar");
const $btnConfirmar=document.getElementById("btn-confirmar");
const $btnCancelar=document.getElementById("btn-cancelar");
const $btnNC=document.getElementById("btn-nc");
const $btnTrocar=document.getElementById("btn-trocar");
const $btnExcluir=document.getElementById("btn-excluir");

let $editTelefoneInput=null;
let currentEditReserva=null;

function bindModalHandlers(){
  document.querySelectorAll(".modal-close,[data-close]").forEach(btn=>{
    btn.addEventListener("click",()=>closeModal(btn.getAttribute("data-close")||btn.closest(".modal").id));
  });
  $backdrop.addEventListener("click",()=>document.querySelectorAll(".modal").forEach(m=>{if(!m.classList.contains("hidden")) closeModal(m.id);}))

  $novaCliente.addEventListener("change",()=>{
    const val=$novaCliente.value.trim();
    const id=clienteLabelToId.get(val);
    $novaClienteId.value=id||"";
    if(id){
      const c=clientesCache.get(id);
      const obs=str(c?.observacoes).toLowerCase();
      $novaClienteAviso.textContent = (obs.includes("não compareceu")||obs.includes("nao compareceu")) ?
        "Atenção: este cliente tem registro de 'Não compareceu'." : "";
    }else{$novaClienteAviso.textContent="";}
  });

  $btnSalvarNova.addEventListener("click",salvarNovaReserva);
  $btnSalvarEditar.addEventListener("click",salvarEditarReserva);
  $btnConfirmar.addEventListener("click",()=>{ if(!currentEditReserva)return; updateReserva(currentEditReserva.id,{status_reserva:"confirmada"}); });
  $btnCancelar.addEventListener("click",()=>{ if(!currentEditReserva)return; cancelarReservaFlow(currentEditReserva); });
  $btnNC.addEventListener("click",()=>{ if(!currentEditReserva)return; naoCompareceuReserva(currentEditReserva); });
  $btnTrocar.addEventListener("click",()=>{ if(!currentEditReserva)return; trocarQuadraFlow(currentEditReserva); });
  $btnExcluir.addEventListener("click",()=>{ if(!currentEditReserva)return; excluirReservaFlow(currentEditReserva); });
}
function openModal(id){$backdrop.classList.remove("hidden");document.getElementById(id).classList.remove("hidden");}
function closeModal(id){document.getElementById(id).classList.add("hidden");if([...document.querySelectorAll(".modal")].every(m=>m.classList.contains("hidden")))$backdrop.classList.add("hidden");}

/* Nova reserva */
function abrirModalNova(dateKey,hora,qid){
  const q=quadraById.get(qid);
  $novaData.value=dateKey; $novaHora.value=hora; $novaQuadra.value=q?.nome||"Quadra";
  $novaTipo.value="Normal"; $novaObs.value=""; $novaCliente.value=""; $novaClienteId.value=""; $novaClienteAviso.textContent="";
  $novaValor.value=valorSugerido(parseISO(dateKey));
  openModal("modal-nova");
}
function valorSugerido(dateObj){ const dow=dateObj.getDay(); return (dow>=1 && dow<=5)?90:60; }
async function salvarNovaReserva(){
  const dateKey=$novaData.value, hora=$novaHora.value, quadraId=quadras.find(q=>q.nome===$novaQuadra.value)?.id||quadrasOrder[0];
  const idCliente=$novaClienteId.value, tipo=$novaTipo.value, valor=Number($novaValor.value||0), obs=($novaObs.value||"").trim();
  if(!dateKey||!hora||!quadraId){alert("Dados inválidos.");return;}
  if(!idCliente){alert("Selecione um cliente válido.");return;}

  if(tipo==="Normal"){
    const conf=await temConflito(dateKey,hora,quadraId);
    if(conf){alert(`Já existe reserva ativa neste horário: ${conf.cli} (${conf.pag})`);return;}
    await db.collection("reservas").add({
      data_criacao: firebase.firestore.FieldValue.serverTimestamp(),
      data_reserva: dateKey, hora_inicio: hora, hora_fim: addOneHour(hora),
      id_cliente: idCliente, id_quadra: quadraId,
      observacao_reserva: obs, pagamento_reserva:"aguardando", status_reserva:"aguardando",
      tipo_reserva:"Normal", valor
    });
    closeModal("modal-nova"); await montarGrade(parseISO(dateKey)); return;
  }

  // série fixa (12 semanas)
  const serieId=db.collection("_").doc().id;
  const datas=(()=>{const d0=parseISO(dateKey), arr=[]; for(let i=0;i<12;i++)arr.push(addDays(d0,i*7)); return arr;})();
  const conflitos=[], livres=[];
  for(const d of datas){ const k=fmtISO(d); const conf=await temConflito(k,hora,quadraId); if(conf) conflitos.push({data:k,...conf}); else livres.push(k); }
  if(conflitos.length){
    const lista=conflitos.map(c=>`${c.data} – ${c.cli}`).join("\n");
    const ok=confirm(`Existem conflitos nesta série:\n${lista}\n\nCriar SOMENTE nas datas livres?`);
    if(!ok) return;
  }
  const total=livres.length;
  for(const [i,k] of livres.entries()){
    let obsReserva=obs;
    if(i>=Math.max(0,total-2)) obsReserva=(obsReserva?obsReserva+" ":"")+"Ultima reserva da serie, favor cadastrar novamente";
    await db.collection("reservas").add({
      data_criacao: firebase.firestore.FieldValue.serverTimestamp(),
      data_reserva: k, hora_inicio: hora, hora_fim: addOneHour(hora),
      id_cliente: idCliente, id_quadra: quadraId,
      observacao_reserva: obsReserva, pagamento_reserva:"aguardando", status_reserva:"aguardando",
      tipo_reserva:"Fixo", valor, id_serie: serieId
    });
  }
  closeModal("modal-nova"); await montarGrade(parseISO(dateKey));
}
async function temConflito(dateKey,hora,quadraId){
  const s=await db.collection("reservas").where("data_reserva","==",dateKey).where("hora_inicio","==",hora).where("id_quadra","==",quadraId).get();
  let ativo=null; s.forEach(d=>{const r=d.data(); if(r.status_reserva!=="cancelada") ativo=r;});
  if(!ativo) return null; const cli=(clientesCache.get(ativo.id_cliente)?.nome)||"Cliente"; return {cli,pag:ativo.pagamento_reserva||"aguardando"};
}

/* Editar reserva */
async function abrirModalEditar(r,dateKey,hora,qid){
  currentEditReserva=r;
  const c=await awaitEnsureCliente(r.id_cliente);
  $editCliente.value=c?.nome||""; $editData.value=dateKey||r.data_reserva||""; $editHora.value=hora||r.hora_inicio||"";
  $editQuadra.value=quadraById.get(qid||r.id_quadra)?.nome||""; $editValor.value=Number(r.valor||0);
  $editStatusReserva.value=r.status_reserva||"aguardando"; $editStatusPag.value=r.pagamento_reserva||"aguardando"; $editObs.value=r.observacao_reserva||"";
  ensureTelefoneField(); $editTelefoneInput.value=c?.telefone||"";
  $btnExcluir.disabled=(r.status_reserva!=="cancelada");
  openModal("modal-editar");
}
function ensureTelefoneField(){
  if($editTelefoneInput) return;
  const grid=document.querySelector("#modal-editar .form-grid");
  const after=$editQuadra.closest(".form-row");
  const row=document.createElement("div");
  row.className="form-row";
  row.innerHTML=`<label>Telefone</label><input id="edit-telefone" type="text" readonly>`;
  grid.insertBefore(row, after.nextSibling);
  $editTelefoneInput=row.querySelector("#edit-telefone");
}
async function salvarEditarReserva(){
  if(!currentEditReserva) return;
  await updateReserva(currentEditReserva.id,{
    valor:Number($editValor.value||0),
    status_reserva:$editStatusReserva.value,
    pagamento_reserva:$editStatusPag.value,
    observacao_reserva:$editObs.value
  });
}
async function updateReserva(id,updates){ await db.collection("reservas").doc(id).update(updates); closeModal("modal-editar"); await montarGrade(selectedDate); }

/* Ações */
async function confirmarReserva(r){ await updateReserva(r.id,{status_reserva:"confirmada"}); }
async function cancelarReservaFlow(r){
  const isFixo=(r.tipo_reserva==="Fixo"||r.id_serie);
  if(isFixo){
    const opt=prompt('Cancelar: "1" somente esta, "2" todas FUTURAS da série',"1"); if(opt===null) return;
    if(opt==="2" && r.id_serie){ await cancelarSerieFuturas(r.id_serie,r.data_reserva); }
    else{ await updateReserva(r.id,{status_reserva:"cancelada",pagamento_reserva:"cancelada"}); }
  }else{
    await updateReserva(r.id,{status_reserva:"cancelada",pagamento_reserva:"cancelada"});
  }
}
async function cancelarSerieFuturas(serieId,apartir){
  const s=await db.collection("reservas").where("id_serie","==",serieId).get(); const fut=[];
  s.forEach(d=>{const r={id:d.id, ...(d.data()||{})}; if(!apartir||r.data_reserva>=apartir) fut.push(r);});
  for(const r of fut){ await db.collection("reservas").doc(r.id).update({status_reserva:"cancelada",pagamento_reserva:"cancelada"}); }
  await montarGrade(selectedDate);
}
async function naoCompareceuReserva(r){
  const updates={status_reserva:"nao_compareceu"}; if((r.pagamento_reserva||"aguardando")==="aguardando") updates.pagamento_reserva="atrasada";
  await db.collection("reservas").doc(r.id).update(updates);
  try{
    const cliRef=db.collection("clientes").doc(r.id_cliente); const s=await cliRef.get(); const cli=s.data()||{};
    const linha=`Não compareceu dia ${r.data_reserva} horário ${r.hora_inicio}`;
    const atual=str(cli.observacoes); const novo=atual? (atual+"\n"+linha):linha;
    await cliRef.update({observacoes:novo}); const local=clientesCache.get(r.id_cliente)||{}; local.observacoes=novo; clientesCache.set(r.id_cliente,local);
  }catch(e){console.warn("Obs cliente:",e);}
  closeModal("modal-editar"); await montarGrade(selectedDate);
}
async function trocarQuadraFlow(r){
  const nomes=quadras.map(q=>q.nome).join(", ");
  const nomeEscolhido=prompt(`Trocar para qual quadra?\nOpções: ${nomes}`, quadraById.get(r.id_quadra)?.nome||"");
  if(nomeEscolhido===null) return; const alvo=quadras.find(q=>q.nome===nomeEscolhido); if(!alvo){alert("Quadra inválida.");return;}
  if(alvo.id===r.id_quadra){alert("Já está nessa quadra.");return;}
  const isFixo=(r.tipo_reserva==="Fixo"||r.id_serie);
  if(isFixo){
    const opt=prompt('Trocar quadra: "1" somente esta, "2" todas FUTURAS da série',"1"); if(opt===null) return;
    if(opt==="2" && r.id_serie){ await trocarQuadraSerieFuturas(r,alvo.id); }
    else{ await moverOuSwap(r,alvo.id); }
  }else{ await moverOuSwap(r,alvo.id); }
  closeModal("modal-editar"); await montarGrade(selectedDate);
}
async function moverOuSwap(r,destQuadraId){
  const s=await db.collection("reservas").where("data_reserva","==",r.data_reserva).where("hora_inicio","==",r.hora_inicio).where("id_quadra","==",destQuadraId).get();
  let ocup=null; s.forEach(d=>{const x={id:d.id, ...(d.data()||{})}; if(x.status_reserva!=="cancelada") ocup=x;});
  if(!ocup){ await db.collection("reservas").doc(r.id).update({id_quadra:destQuadraId}); return; }
  await db.collection("reservas").doc(r.id).update({id_quadra:destQuadraId});
  await db.collection("reservas").doc(ocup.id).update({id_quadra:r.id_quadra});
}
async function trocarQuadraSerieFuturas(base,destQuadraId){
  const s=await db.collection("reservas").where("id_serie","==",base.id_serie).get();
  const fut=[]; s.forEach(d=>{const x={id:d.id, ...(d.data()||{})}; if(x.data_reserva>=base.data_reserva) fut.push(x);});
  for(const r of fut){ await moverOuSwap(r,destQuadraId); }
}
async function excluirReservaFlow(r){
  if(r.status_reserva!=="cancelada"){ alert("Para excluir, cancele primeiro."); return; }
  const isFixo=(r.tipo_reserva==="Fixo"||r.id_serie);
  if(isFixo){
    const opt=prompt('Excluir: "1" somente esta, "2" todas FUTURAS da série',"1"); if(opt===null) return;
    if(opt==="2" && r.id_serie){
      const s=await db.collection("reservas").where("id_serie","==",r.id_serie).get();
      const fut=[]; s.forEach(d=>{const x={id:d.id, ...(d.data()||{})}; if(x.status_reserva==="cancelada" && x.data_reserva>=r.data_reserva) fut.push(x);});
      for(const x of fut){ await db.collection("reservas").doc(x.id).delete(); }
    }else{ await db.collection("reservas").doc(r.id).delete(); }
  }else{ await db.collection("reservas").doc(r.id).delete(); }
  closeModal("modal-editar"); await montarGrade(selectedDate);
}

/* ===== Abrir horários extras ===== */
function ensureExtrasModal(){
  let modal=document.getElementById("modal-extras");
  if(modal) return modal;
  modal=document.createElement("div");
  modal.id="modal-extras"; modal.className="modal hidden";
  modal.innerHTML=`<div class="modal-content">
    <div class="modal-header"><h3 id="extras-title">Abrir horários extras</h3><button class="modal-close" data-close="modal-extras">✖</button></div>
    <div class="modal-body"><div id="extras-help" class="muted" style="margin-bottom:8px;"></div><div id="extras-list" style="display:flex;flex-wrap:wrap;gap:8px;"></div></div>
    <div class="modal-footer"><button id="btn-extras-salvar" class="btn">Salvar</button><button class="btn ghost" data-close="modal-extras">Cancelar</button></div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector(".modal-close").addEventListener("click",()=>closeModal("modal-extras"));
  return modal;
}
async function openExtrasFlow(){
  const d=selectedDate, key=fmtISO(d);
  const allowed=allowedExtrasFor(d);
  const base=horariosPadraoPara(d);
  const extrasAtuais=await horariosExtrasPara(key);
  const jaVis=new Set([...base,...extrasAtuais]);
  const candidatos=allowed.filter(h=>!jaVis.has(h));
  if(!candidatos.length){ alert("Nenhum horário extra disponível para este dia."); return; }

  const modal=ensureExtrasModal();
  modal.querySelector("#extras-help").textContent=`Escolha os horários extras para ${fmtDisplay(d)}:`;
  const list=modal.querySelector("#extras-list"); list.innerHTML="";
  sortTimes(candidatos).forEach(h=>{
    const lab=document.createElement("label");
    lab.style.cssText="border:1px solid var(--border);padding:6px 10px;border-radius:8px;cursor:pointer;";
    lab.innerHTML=`<input type="checkbox" value="${h}" style="margin-right:6px;"> ${h}`;
    list.appendChild(lab);
  });
  modal.querySelector("#btn-extras-salvar").onclick=async()=>{
    const marcados=[...list.querySelectorAll("input[type=checkbox]:checked")].map(i=>i.value);
    if(!marcados.length){alert("Selecione pelo menos um horário.");return;}
    const novos=sortTimes(Array.from(new Set([...(extrasAtuais||[]),...marcados])));
    await db.collection("horarios_visiveis_personalizados").doc(key).set({horariosVisiveis:novos},{merge:true});
    closeModal("modal-extras"); await montarGrade(d);
  };
  openModal("modal-extras");
}
