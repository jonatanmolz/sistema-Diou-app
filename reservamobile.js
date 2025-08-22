/* Firebase v8 */
var firebaseConfig={apiKey:"AIzaSyCSo4NsaIlD9Mdfrlp-5jjxxrhcqnx5XuI",authDomain:"sistemaasadelta.firebaseapp.com",projectId:"sistemaasadelta",storageBucket:"sistemaasadelta.appspot.com",messagingSenderId:"379026766576",appId:"1:379026766576:web:c6d3f2b6a71e42a98f123d"};
firebase.initializeApp(firebaseConfig);
const db=firebase.firestore();

/* Utils */
const PT_DOW=["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const PT_MON=["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
const pad2=n=>String(n).padStart(2,"0");
const trunc=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;}
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return trunc(x);}
const fmtISO=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
const fmtDisplay=d=>`${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`;
function parseISO(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null; const [y,m,dd]=s.split("-").map(Number); const d=new Date(y,m-1,dd); return isNaN(d)?null:trunc(d); }
function daysBetween(a,b){const A=trunc(a),B=trunc(b);return Math.round((B-A)/(24*60*60*1000));}
const isToday=d=>trunc(new Date()).getTime()===trunc(d).getTime();
function addOneHour(hhmm){const [h,m]=hhmm.split(":").map(Number);const d=new Date(2000,0,1,h,m,0);d.setHours(d.getHours()+1);return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;}
function escapeHtml(s){return (s||"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function str(v){ if(v==null) return ""; try{ return String(v);}catch(_){ return ""; } }
const firstName = (nome="") => escapeHtml((nome||"").trim().split(/\s+/)[0]||"Cliente");

/* Elements */
const $cardsWrapper=document.getElementById("date-cards-wrapper");
const $prev=document.getElementById("prev-day");
const $next=document.getElementById("next-day");
const $picker=document.getElementById("date-picker");
const $btnToday=document.getElementById("btn-today");

const $obsTitulo=document.getElementById("observacao-titulo");
const $obsText=document.getElementById("observacao-textarea");
const $obsStatus=document.getElementById("obs-status");

const $grid=document.getElementById("grid-reservas");
const $gridTitle=document.getElementById("grid-title");

/* State */
const startOffsetDays=-15,endOffsetDays=30;
let selectedDate=trunc(new Date());
let rangeStart,rangeEnd;
let obsSaveTimeout=null;
const obsPadrao=`Churrasqueira Baixo:
Churrasqueira Cima:
Churrasqueira Rua:
Observações gerais:`;

let quadras=[], quadrasOrder=[], quadraById=new Map();
let clientesCache=new Map(), clienteLabelToId=new Map();

/* Init */
document.addEventListener("DOMContentLoaded", async()=>{
  await carregarQuadras();
  await carregarClientesParaDatalist();
  initCarousel();
  bindObservationHandlers();
  bindModalHandlers();
});

/* Carousel */
function initCarousel(){
  const today=trunc(new Date());
  rangeStart=addDays(today,startOffsetDays);
  rangeEnd=addDays(today,endOffsetDays);
  renderRange(rangeStart,rangeEnd);
  selectDate(today,{center:true});
  $picker.value=fmtISO(today);

  $prev.addEventListener("click",()=>scrollByHalf(-1));
  $next.addEventListener("click",()=>scrollByHalf(+1));
  $btnToday.addEventListener("click",()=>{const t=trunc(new Date());ensureInRange(t);selectDate(t,{center:true});$picker.value=fmtISO(t);});
  $picker.addEventListener("change",e=>{const d=parseISO(e.target.value);if(!d)return;ensureInRange(d);selectDate(d,{center:true});});
  $cardsWrapper.addEventListener("wheel",e=>{$cardsWrapper.scrollLeft+=(Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX);},{passive:true});
  window.addEventListener("resize",()=>centerCard(fmtISO(selectedDate)));
}
function renderRange(start,end){
  $cardsWrapper.innerHTML="";
  const span=daysBetween(start,end);
  for(let i=0;i<=span;i++){
    const d=addDays(start,i), key=fmtISO(d);
    const el=document.createElement("button");
    el.type="button"; el.className="date-card"; el.dataset.key=key;
    if(isToday(d)) el.classList.add("today");
    el.innerHTML=`<span class="dow">${PT_DOW[d.getDay()]}</span>
                  <span class="day">${pad2(d.getDate())}</span>
                  <span class="mon">${PT_MON[d.getMonth()]}</span>`;
    el.addEventListener("click",()=>selectDate(d,{center:true}));
    $cardsWrapper.appendChild(el);
  }
}
function selectDate(d,{center=false}={}){
  selectedDate=trunc(d);
  const key=fmtISO(d);
  $cardsWrapper.querySelectorAll(".date-card.active").forEach(x=>x.classList.remove("active"));
  const el=$cardsWrapper.querySelector(`.date-card[data-key="${key}"]`);
  if(el) el.classList.add("active");
  if(center) centerCard(key);
  onDateSelected(selectedDate);
}
function centerCard(key){
  const el=$cardsWrapper.querySelector(`.date-card[data-key="${key}"]`); if(!el) return;
  const wrap=$cardsWrapper.getBoundingClientRect(), rect=el.getBoundingClientRect();
  const off=(rect.left-wrap.left)-(wrap.width/2-rect.width/2);
  $cardsWrapper.scrollTo({left:$cardsWrapper.scrollLeft+off,behavior:"smooth"});
}
function scrollByHalf(dir){ $cardsWrapper.scrollBy({left:dir*(($cardsWrapper.clientWidth||600)/2),behavior:"smooth"}); }
function ensureInRange(d){ if(d<rangeStart){rangeStart=d;renderRange(rangeStart,rangeEnd);} else if(d>rangeEnd){rangeEnd=d;renderRange(rangeStart,rangeEnd);} }

/* Observação */
function bindObservationHandlers(){
  $obsText.addEventListener("input",()=>{ $obsStatus.textContent="Digitando…"; clearTimeout(obsSaveTimeout); obsSaveTimeout=setTimeout(saveObs,1100); });
}
async function loadObs(dateObj){
  clearTimeout(obsSaveTimeout); $obsText.disabled=true; $obsText.value="Carregando..."; $obsStatus.textContent="";
  const key=fmtISO(dateObj);
  try{
    const s=await db.collection("observacoes_datas").doc(key).get();
    let txt=obsPadrao; if(s.exists && typeof s.data().observacao==="string" && s.data().observacao.trim()!=="") txt=s.data().observacao;
    $obsText.value=txt; $obsText.disabled=false; $obsStatus.textContent="Pronto para editar";
  }catch(e){ console.error(e); $obsText.value=obsPadrao; $obsText.disabled=false; $obsStatus.textContent="Falha ao carregar (padrão)"; }
}
async function saveObs(){ const key=fmtISO(selectedDate); try{ $obsStatus.textContent="Salvando…"; await db.collection("observacoes_datas").doc(key).set({observacao:$obsText.value}); $obsStatus.textContent="Salvo"; }catch(e){ console.error(e); $obsStatus.textContent="Erro ao salvar"; }}

/* Quadras & Clientes */
async function carregarQuadras(){
  quadras=[]; quadraById.clear();
  const snap=await db.collection("quadras").get();
  snap.forEach(doc=>{ const q={id:doc.id, ...(doc.data()||{})}; quadras.push(q); });
  const pref=["Quadra 01","Quadra 02","Quadra 03","Quadra 04 (externa)"];
  quadras.sort((a,b)=>{const ia=pref.indexOf(a.nome||""), ib=pref.indexOf(b.nome||""); if(ia!==-1&&ib!==-1) return ia-ib; if(ia!==-1) return -1; if(ib!==-1) return 1; return (a.nome||"").localeCompare(b.nome||"");});
  quadras.forEach(q=>quadraById.set(q.id,q));
  quadrasOrder=quadras.map(q=>q.id);
}
async function carregarClientesParaDatalist(){
  clienteLabelToId.clear();
  const list=document.getElementById("cliente-datalist"); list.innerHTML="";
  const snap=await db.collection("clientes").orderBy("nome").get();
  snap.forEach(doc=>{ const c={id:doc.id, ...(doc.data()||{})}; clientesCache.set(c.id,c); const lbl=formatClienteLabel(c); clienteLabelToId.set(lbl,c.id); const opt=document.createElement("option"); opt.value=lbl; list.appendChild(opt); });
}
function formatClienteLabel(c){ const nome=c.nome||"(Sem nome)"; const tel=c.telefone?` ${c.telefone}`:""; return `${nome}${tel?` (${tel})`:""}`; }
async function ensureCliente(id){ if(!id) return null; if(clientesCache.has(id)) return clientesCache.get(id); const s=await db.collection("clientes").doc(id).get(); if(!s.exists) return null; const c={id:s.id, ...(s.data()||{})}; clientesCache.set(c.id,c); return c; }
async function prefetchClientes(ids){ const miss=ids.filter(id=>id&&!clientesCache.has(id)); if(!miss.length) return; const reads=await Promise.all(miss.map(id=>db.collection("clientes").doc(id).get())); reads.forEach(s=>{if(!s.exists)return; const c={id:s.id, ...(s.data()||{})}; clientesCache.set(c.id,c);}); }

/* Horários */
function horariosPadraoPara(d){ const dow=d.getDay(); if(dow>=1&&dow<=5) return ["17:30","18:30","19:30","20:30","21:30"]; if(dow===6){const a=[];for(let h=9;h<=18;h++)a.push(`${pad2(h)}:00`);return a;} const a=[];for(let h=13;h<=18;h++)a.push(`${pad2(h)}:00`);return a; }
async function horariosExtrasPara(key){ try{ const s=await db.collection("horarios_visiveis_personalizados").doc(key).get(); if(s.exists && Array.isArray((s.data()||{}).horariosVisiveis)) return (s.data().horariosVisiveis).slice().sort(); }catch(e){ console.warn(e); } return []; }
function allowedExtrasFor(d){ const dow=d.getDay(), arr=[]; if(dow>=1&&dow<=5){for(let h=7;h<=23;h++)arr.push(`${pad2(h)}:30`);} else {for(let h=7;h<=23;h++)arr.push(`${pad2(h)}:00`);} return arr; }
function sortTimes(a){return a.slice().sort((x,y)=>{const [ah,am]=x.split(":").map(Number),[bh,bm]=y.split(":").map(Number);return ah!==bh?ah-bh:am-bm;});}
const renderVerticalTime = h => `<div class="vtime">${[...h].map(ch=>`<span>${ch}</span>`).join("")}</div>`;

/* Montagem */
async function onDateSelected(d){
  $obsTitulo.textContent=`Observação do Dia (${fmtDisplay(d)}):`;
  $gridTitle.textContent=`Reservas — ${fmtDisplay(d)}`;
  await loadObs(d);
  await montarGrade(d);
}
async function montarGrade(d){
  const key=fmtISO(d);
  const base=horariosPadraoPara(d);
  const extras=await horariosExtrasPara(key);
  const horarios=Array.from(new Set([...base,...extras])).sort((a,b)=>{const [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number);return ah!==bh?ah-bh:am-bm;});

  const resSnap=await db.collection("reservas").where("data_reserva","==",key).get();
  const reservas=[]; resSnap.forEach(doc=>reservas.push({id:doc.id, ...(doc.data()||{})}));

  const ids=[...new Set(reservas.map(r=>r.id_cliente).filter(Boolean))];
  await prefetchClientes(ids);

  const bySlot=new Map();
  for(const r of reservas){
    const slot=`${r.hora_inicio}|${r.id_quadra}`;
    const cancel=r.status_reserva==="cancelada";
    let cell=bySlot.get(slot); if(!cell){cell={ativa:null,canceladas:[]};bySlot.set(slot,cell);}
    if(cancel){cell.canceladas.push(r);}else{ if(!cell.ativa) cell.ativa=r; else{ const a=cell.ativa,ta=a.data_criacao?.seconds||0,tb=r.data_criacao?.seconds||0; if(tb>=ta){cell.ativa=r;cell.canceladas.push(a);} else cell.canceladas.push(r);} }
  }

  $grid.style.setProperty("--qcols", quadrasOrder.length);
  $grid.innerHTML="";

  const header=document.createElement("div"); header.className="grid-header";
  const hcol=document.createElement("div"); hcol.textContent="Horário"; header.appendChild(hcol);
  for(const qid of quadrasOrder){ const q=quadraById.get(qid); const d=document.createElement("div"); d.textContent=q?.nome||"Quadra"; header.appendChild(d); }
  $grid.appendChild(header);

  for(const h of horarios){
    const row=document.createElement("div"); row.className="grid-row";

    const timeCol=document.createElement("div");
    timeCol.className="time-col";
    timeCol.innerHTML=renderVerticalTime(h);
    row.appendChild(timeCol);

    for(const qid of quadrasOrder){
      const cell=document.createElement("div"); cell.className="grid-cell";
      const info=bySlot.get(`${h}|${qid}`);

      if(info && info.ativa){
        const r=info.ativa, pag=r.pagamento_reserva||"aguardando";
        const card=document.createElement("button"); card.type="button"; card.className=`card-mini ${pag}`;
        card.addEventListener("click",()=>abrirModalEditar(r,key,h,qid));

        const cli=clientesCache.get(r.id_cliente) || (await ensureCliente(r.id_cliente));
        const nm=firstName(cli?.nome||"Cliente");
        const tipoClass=(r.tipo_reserva==="Fixo")?"fixo":"normal";
        const tipoLabel=(r.tipo_reserva==="Fixo")?"Fixo":"Normal";
        const valor=`R$ ${Number(r.valor||0)}`;

        const stack=document.createElement("div");
        stack.className="stack";
        stack.innerHTML=`
          <div class="nm">${nm}</div>
          <div class="pr">${valor}</div>
          <div class="type-chip ${tipoClass}">${tipoLabel}</div>
        `;
        card.appendChild(stack);

        cell.appendChild(card);

        if(info.canceladas && info.canceladas.length){
          const chips=document.createElement("div"); chips.className="chips";
          const max=2;
          for(const c of info.canceladas.slice(0,max)){
            const cc=clientesCache.get(c.id_cliente) || await ensureCliente(c.id_cliente);
            const chip=document.createElement("button"); chip.type="button"; chip.className="chip"; chip.textContent=firstName(cc?.nome || "Cancelada");
            chip.addEventListener("click",()=>abrirModalEditar(c,key,h,qid));
            chips.appendChild(chip);
          }
          if(info.canceladas.length>max){
            const more=document.createElement("span"); more.className="chip"; more.textContent=`+${info.canceladas.length-max}`;
            chips.appendChild(more);
          }
          cell.appendChild(chips);
        }
      }else{
        const free=document.createElement("button"); free.type="button"; free.className="cell-free"; free.textContent="Disponível";
        free.addEventListener("click",()=>abrirModalNova(key,h,qid));
        cell.appendChild(free);
      }

      row.appendChild(cell);
    }
    $grid.appendChild(row);
  }
}

/* ===== Modais e ações (iguais aos seus) ===== */
// ... (o restante do arquivo permanece igual ao último que te enviei)
// Dica: mantenha exatamente as mesmas funções de modal/ações:
// bindModalHandlers, abrirModalNova/salvarNovaReserva, temConflito,
// abrirModalEditar/salvarEditarReserva/updateReserva,
// cancelarReservaFlow/cancelarSerieFuturas,
// naoCompareceuReserva, trocarQuadraFlow/moverOuSwap/trocarQuadraSerieFuturas,
// excluirReservaFlow, e o fluxo de horários extras (openExtrasFlow).
