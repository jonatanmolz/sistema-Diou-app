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

/* ===== Utils de data e hora ===== */
const PT_DOW = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
const PT_MON = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];


function formatDateBr(dateKey){
  if(!dateKey) return "";
  const s = String(dateKey);
  // already BR
  if(s.includes("/") && s.split("/").length >= 2) return s;
  // expected YYYY-MM-DD
  const parts = s.split("-");
  if(parts.length !== 3) return s;
  const [y,m,d] = parts;
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`;
}

function pad2(n){ return String(n).padStart(2,"0"); }
function truncateToLocalDate(d){ const x=new Date(d); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return truncateToLocalDate(x); }
function fmtISO(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function fmtDisplay(d){ return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}`; }
function parseISO(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y,m,dd]=s.split("-").map(Number);
  const d = new Date(y, m-1, dd);
  return isNaN(d) ? null : truncateToLocalDate(d);
}
function daysBetween(a, b){
  const A = truncateToLocalDate(a);
  const B = truncateToLocalDate(b);
  const MS = 24*60*60*1000;
  return Math.round((B - A) / MS);
}
function isToday(d){
  const hoje = truncateToLocalDate(new Date());
  return hoje.getTime() === truncateToLocalDate(d).getTime();
}
function addOneHour(hhmm){ // "HH:mm" -> "HH:mm" + 1h
  const [h,m]=hhmm.split(":").map(Number);
  const d = new Date(2000,0,1,h,m,0);
  d.setHours(d.getHours()+1);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function str(v){ if(v==null) return ""; try{ return String(v);}catch(_){ return ""; } }
function escapeHtml(s){ return (s||"").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ===== Seletores globais ===== */
const $cardsWrapper = document.getElementById("date-cards-wrapper");
const $prev = document.getElementById("prev-day");
const $next = document.getElementById("next-day");
const $picker = document.getElementById("date-picker");
const $btnToday = document.getElementById("btn-today");
const $btnOpenExtras = document.getElementById("btn-open-extras");

const $obsTitulo = document.getElementById("observacao-titulo");
const $obsText   = document.getElementById("observacao-textarea");
const $obsStatus = document.getElementById("obs-status");

const $grid = document.getElementById("grid-reservas");
const $gridTitle = document.getElementById("grid-title");
let $backdrop = document.getElementById("modal-backdrop");
function ensureBackdrop(){
  if(!$backdrop){
    const b = document.createElement("div");
    b.id = "modal-backdrop";
    b.className = "modal-backdrop hidden";
    document.body.appendChild(b);
    $backdrop = b;
  }
  return $backdrop;
}

/* ===== Estado ===== */
const startOffsetDays = -30;
const endOffsetDays   =  30;
let selectedDate = truncateToLocalDate(new Date());
let rangeStart, rangeEnd;
let cardsIndexByKey = new Map();

const observacaoPadrao = `Churrasqueira Baixo:
Churrasqueira Cima:
Churrasqueira Rua:
Observações gerais:`;
let obsSaveTimeout = null;
let currentObsDocKey = null;

let quadras = [];                  // [{id, nome}]
let quadrasOrder = [];             // array de ids na ordem de exibição
let quadraById = new Map();        // id -> {id,nome}
let clientesCache = new Map();     // id -> {id, nome, observacoes, telefone, ...}
let clienteLabelToId = new Map();  // "Nome (tel)" -> id

/* ===== Inicialização ===== */
document.addEventListener("DOMContentLoaded", async () => {
  await carregarQuadras();
  await carregarClientesParaDatalist(); // para o datalist do modal

  initCarousel();
  bindObservationHandlers();
  bindModalHandlers();
  wireCloseHandlers(document);

  $btnOpenExtras.addEventListener("click", openExtrasFlow);
});

/* ===== Carrossel ===== */
function initCarousel(){
  const today = truncateToLocalDate(new Date());
  rangeStart = addDays(today, startOffsetDays);
  rangeEnd   = addDays(today, endOffsetDays);
  renderRange(rangeStart, rangeEnd);
  selectDate(today, {scrollIntoView:true});
  $picker.value = fmtISO(today);

  $prev.addEventListener("click", () => scrollByHalf(-1));
  $next.addEventListener("click", () => scrollByHalf(+1));

  $btnToday.addEventListener("click", () => {
    const t = truncateToLocalDate(new Date());
    ensureDateInRange(t);
    selectDate(t, {scrollIntoView:true});
    $picker.value = fmtISO(t);
  });

  $picker.addEventListener("change", (e) => {
    const d = parseISO(e.target.value);
    if(!d) return;
    ensureDateInRange(d);
    selectDate(d, {scrollIntoView:true});
  });

  $cardsWrapper.addEventListener("keydown", (e) => {
    if(e.key==="ArrowLeft"){ moveSelection(-1); e.preventDefault(); }
    if(e.key==="ArrowRight"){ moveSelection(+1); e.preventDefault(); }
    if(e.key==="Home"){ goToToday(); e.preventDefault(); }
  });

  $cardsWrapper.addEventListener("wheel", (e) => {
    if (e.deltaY===0 && e.deltaX===0) return;
    $cardsWrapper.scrollLeft += (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
  }, {passive:true});

  window.addEventListener("resize", () => scrollCardIntoCenter(getKey(selectedDate)));
}
function scrollByHalf(dir){
  const dx = ($cardsWrapper.clientWidth || 600) / 2;
  $cardsWrapper.scrollBy({ left: dir * dx, behavior: "smooth" });
}
function renderRange(startDate, endDate){
  $cardsWrapper.innerHTML = "";
  cardsIndexByKey.clear();
  const days = daysBetween(startDate, endDate);
  for(let i=0;i<=days;i++){
    const d = addDays(startDate, i);
    const key = getKey(d);
    const card = buildCard(d, key);
    cardsIndexByKey.set(key, i);
    $cardsWrapper.appendChild(card);
  }
}
function buildCard(dateObj, key){
  const el = document.createElement("button");
  el.type="button";
  el.className="date-card";
  if(isToday(dateObj)) el.classList.add("today");
  el.dataset.key = key;
  el.setAttribute("aria-label", `Selecionar ${key}`);
  const dow = PT_DOW[dateObj.getDay()];
  const mon = PT_MON[dateObj.getMonth()];
  el.innerHTML = `
    <span class="dow">${dow}</span>
    <span class="day">${pad2(dateObj.getDate())}</span>
    <span class="mon">${mon}.</span>
  `;
  el.addEventListener("click", () => selectDate(dateObj, {scrollIntoView:true}));
  return el;
}
function getKey(d){ return fmtISO(d); }

function selectDate(dateObj, {scrollIntoView=false}={}){
  selectedDate = truncateToLocalDate(dateObj);
  const key = getKey(selectedDate);

  const current = $cardsWrapper.querySelector(".date-card.active");
  if(current) current.classList.remove("active");
  const el = $cardsWrapper.querySelector(`.date-card[data-key="${key}"]`);
  if(el) el.classList.add("active");
  if(scrollIntoView) scrollCardIntoCenter(key);

  onDateSelected(selectedDate);
}
function scrollCardIntoCenter(key){
  const el = $cardsWrapper.querySelector(`.date-card[data-key="${key}"]`);
  if(!el) return;
  const wrap = $cardsWrapper.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  const current = $cardsWrapper.scrollLeft;
  const offset = (rect.left - wrap.left) - (wrap.width/2 - rect.width/2);
  $cardsWrapper.scrollTo({ left: current + offset, behavior:"smooth" });
}
function moveSelection(delta){
  const key = getKey(selectedDate);
  const idx = cardsIndexByKey.get(key);
  if(idx==null) return;

  const nextIdx = idx + delta;
  if(nextIdx < 0){
    rangeStart = addDays(rangeStart, delta);
    renderRange(rangeStart, rangeEnd);
    selectDate(addDays(selectedDate, delta), {scrollIntoView:true});
    return;
  }
  if(nextIdx > cardsIndexByKey.size - 1){
    rangeEnd = addDays(rangeEnd, delta);
    renderRange(rangeStart, rangeEnd);
    selectDate(addDays(selectedDate, delta), {scrollIntoView:true});
    return;
  }
  selectDate(addDays(selectedDate, delta), {scrollIntoView:true});
}
function goToToday(){
  const t = truncateToLocalDate(new Date());
  ensureDateInRange(t);
  selectDate(t, {scrollIntoView:true});
  $picker.value = fmtISO(t);
}
function ensureDateInRange(d){
  if(d < rangeStart){ rangeStart = d; renderRange(rangeStart, rangeEnd); }
  else if(d > rangeEnd){ rangeEnd = d; renderRange(rangeStart, rangeEnd); }
}

/* ===== Observação do Dia ===== */
function bindObservationHandlers(){
  $obsText.addEventListener("input", () => {
    $obsStatus.textContent = "Digitando…";
    clearTimeout(obsSaveTimeout);
    obsSaveTimeout = setTimeout(salvarObservacaoAtual, 1500);
  });
  window.addEventListener("beforeunload", () => clearTimeout(obsSaveTimeout));
}
async function carregarObservacao(dateObj){
  clearTimeout(obsSaveTimeout);
  $obsStatus.textContent = "";
  $obsText.disabled = true;
  $obsText.value = "Carregando...";

  const key = fmtISO(dateObj);
  currentObsDocKey = key;

  try{
    const docRef = db.collection("observacoes_datas").doc(key);
    const snap = await docRef.get();
    let texto = observacaoPadrao;
    if (snap.exists){
      const data = snap.data();
      if (data && typeof data.observacao === "string" && data.observacao.trim() !== ""){
        texto = data.observacao;
      }
    }
    if(currentObsDocKey !== key) return;
    $obsText.value = texto;
    $obsText.disabled = false;
    $obsStatus.textContent = "Pronto para editar";
  }catch(err){
    console.error("Erro ao carregar observação:", err);
    if(currentObsDocKey !== key) return;
    $obsText.value = observacaoPadrao;
    $obsText.disabled = false;
    $obsStatus.textContent = "Falha ao carregar (usando texto padrão)";
  }
}
async function salvarObservacaoAtual(){
  const key = currentObsDocKey;
  if(!key) return;
  try{
    $obsStatus.textContent = "Salvando…";
    await db.collection("observacoes_datas").doc(key).set({
      observacao: $obsText.value
    });
    $obsStatus.textContent = "Salvo";
  }catch(err){
    console.error("Erro ao salvar observação:", err);
    $obsStatus.textContent = "Erro ao salvar";
  }
}

/* ===== Quadras & Clientes ===== */
async function carregarQuadras(){
  quadras = [];
  quadraById.clear();
  const snap = await db.collection("quadras").get();
  snap.forEach(doc=>{
    const q = { id: doc.id, ...(doc.data()||{}) };
    quadras.push(q);
  });
  const prefer = ["Quadra 01","Quadra 02","Quadra 03","Quadra 04 (externa)"];
  quadras.sort((a,b)=>{
    const ia = prefer.indexOf(a.nome||"");
    const ib = prefer.indexOf(b.nome||"");
    if(ia!==-1 && ib!==-1) return ia-ib;
    if(ia!==-1) return -1;
    if(ib!==-1) return 1;
    return (a.nome||"").localeCompare(b.nome||"");
  });
  quadras.forEach(q=> quadraById.set(q.id, q));
  quadrasOrder = quadras.map(q=>q.id);
}
async function carregarClientesParaDatalist(){
  clienteLabelToId.clear();
  const list = document.getElementById("cliente-datalist");
  list.innerHTML = "";
  const snap = await db.collection("clientes").orderBy("nome").get();
  snap.forEach(doc=>{
    const c = { id: doc.id, ...(doc.data()||{}) };
    clientesCache.set(c.id, c);
    const label = formatClienteLabel(c);
    clienteLabelToId.set(label, c.id);
    const opt = document.createElement("option");
    opt.value = label;
    list.appendChild(opt);
  });
}
function formatClienteLabel(c){
  const nome = c.nome || "(Sem nome)";
  const tel  = c.telefone ? ` ${c.telefone}` : "";
  return `${nome}${tel ? " ("+tel+")" : ""}`;
}
async function awaitEnsureCliente(id){
  if(!id) return null;
  if(clientesCache.has(id)) return clientesCache.get(id);
  try{
    const snap = await db.collection("clientes").doc(id).get();
    if(snap.exists){
      const c = { id: snap.id, ...(snap.data()||{}) };
      clientesCache.set(id, c);
      const lbl = formatClienteLabel(c);
      if(!clienteLabelToId.has(lbl)){
        clienteLabelToId.set(lbl, id);
        const list = document.getElementById("cliente-datalist");
        const opt = document.createElement("option");
        opt.value = lbl;
        list.appendChild(opt);
      }
      return c;
    }
  }catch(e){ console.warn("Cliente não encontrado:", e); }
  return null;
}
async function prefetchClientes(ids){
  const missing = ids.filter(id => id && !clientesCache.has(id));
  if (!missing.length) return;
  const reads = await Promise.all(missing.map(id => db.collection("clientes").doc(id).get()));
  reads.forEach(snap => {
    if (!snap.exists) return;
    const c = { id: snap.id, ...(snap.data() || {}) };
    clientesCache.set(c.id, c);
    const lbl = formatClienteLabel(c);
    if (!clienteLabelToId.has(lbl)) {
      clienteLabelToId.set(lbl, c.id);
      const list = document.getElementById("cliente-datalist");
      const opt = document.createElement("option");
      opt.value = lbl;
      list.appendChild(opt);
    }
  });
}

/* ===== Grade: horários padrão ∪ extras ===== */
async function onDateSelected(dateObj){
  $obsTitulo.textContent = `Observação do Dia (${fmtDisplay(dateObj)}):`;
  $gridTitle.textContent = `Reservas — ${fmtDisplay(dateObj)}`;
  await carregarObservacao(dateObj);
  await montarGrade(dateObj);
}
function horariosPadraoPara(d){
  const dow = d.getDay(); // 0=Dom .. 6=Sáb
  if(dow>=1 && dow<=5){
    return ["17:30","18:30","19:30","20:30","21:30"];
  }else if(dow===6){
    const arr=[]; for(let h=9; h<=19; h++) arr.push(`${pad2(h)}:00`);
    return arr;
  }else{ // domingo
    const arr=[]; for(let h=13; h<=18; h++) arr.push(`${pad2(h)}:00`);
    return arr;
  }
}
async function horariosExtrasPara(dateKey){
  try{
    const snap = await db.collection("horarios_visiveis_personalizados").doc(dateKey).get();
    if(snap.exists){
      const data = snap.data() || {};
      if(Array.isArray(data.horariosVisiveis)) return data.horariosVisiveis.slice().sort();
    }
  }catch(e){ console.warn("Extras:", e); }
  return [];
}
function allowedExtrasFor(dateObj){
  const dow = dateObj.getDay();
  const arr = [];
  if(dow>=1 && dow<=5){ // seg-sex: 07:30..23:30
    for(let h=7; h<=23; h++) arr.push(`${pad2(h)}:30`);
  }else{ // fim de semana: 07:00..23:00
    for(let h=7; h<=23; h++) arr.push(`${pad2(h)}:00`);
  }
  return arr;
}
function sortTimes(arr){
  return arr.slice().sort((a,b)=>{
    const [ah,am]=a.split(":").map(Number), [bh,bm]=b.split(":").map(Number);
    return ah!==bh ? ah-bh : am-bm;
  });
}

async function montarGrade(dateObj){
  const dateKey = fmtISO(dateObj);
  const base = horariosPadraoPara(dateObj);
  const extras = await horariosExtrasPara(dateKey);
  const horarios = Array.from(new Set([...base, ...extras])).sort((a,b)=>{
    const [ah,am]=a.split(":").map(Number), [bh,bm]=b.split(":").map(Number);
    return ah!==bh ? ah-bh : am-bm;
  });

  // reservas do dia
  const resSnap = await db.collection("reservas").where("data_reserva","==",dateKey).get();
  const reservas = [];
  resSnap.forEach(doc=>{
    const r = { id: doc.id, ...(doc.data()||{}) };
    reservas.push(r);
  });

  // pré-carregar clientes usados no dia
  const idsClientesDoDia = [...new Set(reservas.map(r => r.id_cliente).filter(Boolean))];
  await prefetchClientes(idsClientesDoDia);

  // Mapa por (hora, quadra) -> { ativa: r?, canceladas: [] }
  const bySlot = new Map(); // key = hora|quadraId
  for(const r of reservas){
    const qid = r.id_quadra;
    const key = `${r.hora_inicio}|${qid}`;
    const isCancelada = (r.status_reserva === "cancelada");
    let cell = bySlot.get(key);
    if(!cell){ cell = { ativa: null, canceladas: [] }; bySlot.set(key, cell); }
    if(isCancelada){
      cell.canceladas.push(r);
    }else{
      if(!cell.ativa) cell.ativa = r;
      else{
        const a = cell.ativa;
        const ta = a.data_criacao?.seconds || 0;
        const tb = r.data_criacao?.seconds || 0;
        if(tb >= ta) cell.ativa = r, cell.canceladas.push(a);
        else cell.canceladas.push(r);
      }
    }
  }

  // grid
  $grid.style.setProperty("--qcols", quadrasOrder.length);
  $grid.innerHTML = "";

  // header
  const header = document.createElement("div");
  header.className = "grid-header";
  header.appendChild(elDiv("Horário"));
  for(const qid of quadrasOrder){
    const q = quadraById.get(qid);
    header.appendChild(elDiv(q?.nome || "Quadra"));
  }
  $grid.appendChild(header);

  // linhas
  for(const h of horarios){
    const row = document.createElement("div");
    row.className = "grid-row";
    const timeCol = document.createElement("div");
    timeCol.className = "time-col";
    timeCol.textContent = h;
    row.appendChild(timeCol);

    for(const qid of quadrasOrder){
      const cell = document.createElement("div");
      cell.className = "grid-cell";
      const slotKey = `${h}|${qid}`;
      const info = bySlot.get(slotKey);

      if(info && info.ativa){
        const r = info.ativa;
        const pag = r.pagamento_reserva || "aguardando";
        const card = document.createElement("div");
        card.className = `card ${pag}`;

        const cl = clientesCache.get(r.id_cliente) || await awaitEnsureCliente(r.id_cliente);
        const cliNome = cl?.nome || "Cliente";
        const cliObs  = str(cl?.observacoes).trim();

        const topline = document.createElement("div");
        topline.className = "topline";
        topline.innerHTML = `<span>${escapeHtml(cliNome)}</span><span>${statusIcon(r.status_reserva)}</span>`;
        card.appendChild(topline);

        const clientNote = document.createElement("div");
        clientNote.className = "client-note";
        clientNote.textContent = cliObs ? cliObs : " ";
        card.appendChild(clientNote);

        const meta = document.createElement("div");
        meta.className = "meta";
        const tipoBadge = (r.tipo_reserva === "Fixo") ? `<span class="badge-fixo">Fixo</span>` : `<span>Normal</span>`;
        const valorTxt = `Valor: R$ ${Number(r.valor||0)}`;
        meta.innerHTML = `${tipoBadge}<span>${valorTxt}</span>`;
        card.appendChild(meta);

        const resObs = document.createElement("div");
        resObs.className = "res-obs";
        const o = str(r.observacao_reserva).trim();
        resObs.textContent = `Obs.: ${o ? o : "N/A"}`;
        card.appendChild(resObs);

        const icons = document.createElement("div");
        icons.className = "icons";
        icons.appendChild(makeMiniBtn("⇄","Trocar", () => trocarQuadraFlow(r)));
        icons.appendChild(makeMiniBtn("✅","Confirmar", () => confirmarReserva(r)));
        icons.appendChild(makeMiniBtn("🚫","Não comp.", () => naoCompareceuReserva(r)));
        icons.appendChild(makeMiniBtn("🛑","Cancelar", () => cancelarReservaFlow(r)));
        card.appendChild(icons);

        // Clique no card abre edição (botões já têm stopPropagation)
        card.addEventListener("click", ()=> abrirModalEditar(r, dateKey, h, qid));

        cell.appendChild(card);

        if(info.canceladas && info.canceladas.length){
          const chips = document.createElement("div");
          chips.className = "chips";
          const max = 2;
          for (const c of info.canceladas.slice(0, max)) {
            const cc = clientesCache.get(c.id_cliente) || await awaitEnsureCliente(c.id_cliente);
            const chip = document.createElement("button");
            chip.className = "chip";
            chip.type = "button";
            chip.title = "Reserva cancelada";
            chip.textContent = (cc?.nome || "Cancelada");
            chip.addEventListener("click", ()=> abrirModalEditar(c, dateKey, h, qid));
            chips.appendChild(chip);
          }
          if(info.canceladas.length>max){
            const more = document.createElement("button");
            more.className = "chip more";
            more.type = "button";
            more.textContent = `+${info.canceladas.length - max}`;
            more.addEventListener("click", ()=>{
              abrirModalEditar(info.canceladas[0], dateKey, h, qid);
            });
            chips.appendChild(more);
          }
          cell.appendChild(chips);
        }
      }else{
        const free = document.createElement("button");
        free.className = "cell-free";
        free.type = "button";
        free.textContent = "Disponível";
        free.addEventListener("click", ()=> abrirModalNova(dateKey, h, qid));
        cell.appendChild(free);

        if(info && info.canceladas && info.canceladas.length){
          const chips = document.createElement("div");
          chips.className = "chips";
          const max = 2;
          for (const c of info.canceladas.slice(0, max)) {
            const cc = clientesCache.get(c.id_cliente) || await awaitEnsureCliente(c.id_cliente);
            const chip = document.createElement("button");
            chip.className = "chip";
            chip.type = "button";
            chip.title = "Reserva cancelada";
            chip.textContent = (cc?.nome || "Cancelada");
            chip.addEventListener("click", ()=> abrirModalEditar(c, dateKey, h, qid));
            chips.appendChild(chip);
          }
          if(info.canceladas.length>max){
            const more = document.createElement("button");
            more.className = "chip more";
            more.type = "button";
            more.textContent = `+${info.canceladas.length - max}`;
            more.addEventListener("click", ()=>{
              abrirModalEditar(info.canceladas[0], dateKey, h, qid);
            });
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
function elDiv(text){ const d=document.createElement("div"); d.textContent=text; return d; }
function makeMiniBtn(label, title, onClick){
  const b = document.createElement("button");
  b.className = "icon-mini";
  b.type="button";
  b.title = title;
  b.textContent = label;
  b.addEventListener("click", (e)=>{ e.stopPropagation(); onClick(); });
  return b;
}
function statusIcon(st){
  switch(st){
    case "confirmada": return "✅";
    case "cancelada": return "🛑";
    case "nao_compareceu": return "🚫";
    case "aguardando":
    default: return "🕒";
  }
}

/* ===== Modais ===== */
// Nova
const $modalNova = document.getElementById("modal-nova");
const $novaData = document.getElementById("nova-data");
const $novaHora = document.getElementById("nova-hora");
const $novaQuadra = document.getElementById("nova-quadra");
const $novaCliente = document.getElementById("nova-cliente");
const $novaClienteId = document.getElementById("nova-cliente-id");
const $novaClienteAviso = document.getElementById("nova-cliente-aviso");
const $novaTipo = document.getElementById("nova-tipo");
const $novaValor = document.getElementById("nova-valor");
const $novaObs = document.getElementById("nova-obs");
const $btnSalvarNova = document.getElementById("btn-salvar-nova");

// Editar
const $modalEditar = document.getElementById("modal-editar");
const $editCliente = document.getElementById("edit-cliente");
const $editData = document.getElementById("edit-data");
const $editHora = document.getElementById("edit-hora");
const $editQuadra = document.getElementById("edit-quadra");
const $editValor = document.getElementById("edit-valor");
const $editStatusReserva = document.getElementById("edit-status-reserva");
const $editStatusPag = document.getElementById("edit-status-pagamento");
const $editObs = document.getElementById("edit-obs");
const $btnSalvarEditar = document.getElementById("btn-salvar-editar");

const $btnConfirmar = document.getElementById("btn-confirmar");
const $btnCancelar  = document.getElementById("btn-cancelar");
const $btnNC        = document.getElementById("btn-nc");
const $btnTrocar    = document.getElementById("btn-trocar");
const $btnExcluir   = document.getElementById("btn-excluir");

/* Modal Troca de quadra */
const $modalTroca = document.getElementById("modal-troca");
const $trocaCliente = document.getElementById("troca-cliente");
const $trocaDataHora = document.getElementById("troca-datahora");
const $trocaOrigem = document.getElementById("troca-origem");
const $trocaDestino = document.getElementById("troca-quadra-destino");
const $trocaPermitirSwap = document.getElementById("troca-permitir-swap");
const $trocaSeriesBox = document.getElementById("troca-series-box");
const $trocaUsarSeries = document.getElementById("troca-usar-series");
const $trocaListContainer = document.getElementById("troca-list-container");
const $trocaList = document.getElementById("troca-list");
const $trocaStatus = document.getElementById("troca-status");
const $btnConfirmarTroca = document.getElementById("btn-confirmar-troca");

let trocaBaseReserva = null;
let trocaPreviewItems = [];


/* Telefone (criado dinamicamente) */
let $editTelefoneInput = null;

let currentEditReserva = null;



function closeModal(id){
  try{
    if(!id) return;
    const m = document.getElementById(id);
    if(!m) return;
    m.classList.add("hidden");

    // Se não tiver nenhum modal aberto, esconde o backdrop
    const anyOpen = Array.from(document.querySelectorAll(".modal"))
      .some(mm => !mm.classList.contains("hidden"));
    if(!anyOpen){
      ensureBackdrop().classList.add("hidden");
    }
  }catch(e){
    console.error("Falha ao fechar modal", id, e);
  }
}

function wireCloseHandlers(scope){
  if(!scope) return;
  scope.querySelectorAll(".modal-close,[data-close]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.getAttribute("data-close") || btn.closest(".modal")?.id;
      closeModal(id);
    });
  });
}
function bindModalHandlers(){
  document.querySelectorAll(".modal-close,[data-close]").forEach(btn=>{
    btn.addEventListener("click", (e)=>{
      const id = btn.getAttribute("data-close");
      closeModal(id || btn.closest(".modal")?.id);
    });
  });
  ensureBackdrop().addEventListener("click", ()=> {
    document.querySelectorAll(".modal").forEach(m=>{
      if(!m.classList.contains("hidden")) closeModal(m.id);
    });
  });

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      document.querySelectorAll(".modal").forEach(m=>{
        if(!m.classList.contains("hidden")) closeModal(m.id);
      });
    }
  });

  // cliente datalist -> mapear id
  $novaCliente.addEventListener("change", ()=>{
    const val = $novaCliente.value.trim();
    const id = clienteLabelToId.get(val);
    $novaClienteId.value = id || "";
    if(id){
      const c = clientesCache.get(id);
      const obs = str(c?.observacoes).toLowerCase();
      if(obs.includes("não compareceu") || obs.includes("nao compareceu")){
        $novaClienteAviso.textContent = "Atenção: este cliente tem registro de 'Não compareceu'.";
      }else{
        $novaClienteAviso.textContent = "";
      }
    }else{
      $novaClienteAviso.textContent = "";
    }
  });

  $btnSalvarNova.addEventListener("click", salvarNovaReserva);
  $btnSalvarEditar.addEventListener("click", salvarEditarReserva);

  $btnConfirmar.addEventListener("click", ()=> {
    if(!currentEditReserva) return;
    updateReserva(currentEditReserva.id, { status_reserva: "confirmada" });
  });

  $btnCancelar.addEventListener("click", ()=> {
    if(!currentEditReserva) return;
    cancelarReservaFlow(currentEditReserva);
  });

  $btnNC.addEventListener("click", ()=> {
    if(!currentEditReserva) return;
    naoCompareceuReserva(currentEditReserva);
  });

  $btnTrocar.addEventListener("click", ()=> {
    if(!currentEditReserva) return;
    trocarQuadraFlow(currentEditReserva);
  });

  $btnExcluir.addEventListener("click", ()=> {
    if(!currentEditReserva) return;
    excluirReservaFlow(currentEditReserva);
  });
}
function openModal(id){
  try{
    const m = document.getElementById(id);
    if(!m){ console.warn("[modal] não encontrado:", id); return; }
    const bd = ensureBackdrop();
    bd.classList.remove("hidden");
    m.classList.remove("hidden");
  }catch(e){
    console.error("Falha ao abrir modal", id, e);
  }
}

/* ===== Nova Reserva ===== */
function abrirModalNova(dateKey, hora, quadraId){
  const q = quadraById.get(quadraId);
  $novaData.value = dateKey;
  $novaHora.value = hora;
  $novaQuadra.value = q?.nome || "Quadra";
  $novaTipo.value = "Normal";
  $novaObs.value = "";
  $novaCliente.value = "";
  $novaClienteId.value = "";
  $novaClienteAviso.textContent = "";
  $novaValor.value = getQuadraValor(quadraId, parseISO(dateKey));
  openModal("modal-nova");
}

function parseValorBR(v){
  if(v === null || v === undefined) return null;
  if(typeof v === "number") return v;
  const s = String(v).trim();
  if(!s) return null;
  // remove currency and spaces
  const cleaned = s.replace(/R\$\s*/g,"").replace(/\./g,"").replace(",",".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
function isFimDeSemana(dateObj){
  const dow = dateObj.getDay(); // 0 dom ... 6 sab
  return dow === 0 || dow === 6;
}
function getQuadraValor(quadraId, dateObj){
  const q = quadraById.get(quadraId);
  if(!q){
    return valorSugerido(dateObj);
  }
  const fim = isFimDeSemana(dateObj);
  const v = fim ? parseValorBR(q.valorFimDeSemana) : parseValorBR(q.valorSemana);
  return (v !== null) ? v : valorSugerido(dateObj);
}

function valorSugerido(dateObj){
  const dow = dateObj.getDay();
  return (dow>=1 && dow<=5) ? 90 : 60; // seg-sex 90; sab/dom 60
}
async function salvarNovaReserva(){
  const dateKey = $novaData.value;
  const hora = $novaHora.value;
  const qNome = $novaQuadra.value;
  const quadraId = quadras.find(q=>q.nome===qNome)?.id || quadrasOrder[0];
  const idCliente = $novaClienteId.value;
  const tipoRaw = ($novaTipo.value || "normal"); // "normal" | "fixo"
  const tipo = String(tipoRaw).trim().toLowerCase();
  const valor = Number($novaValor.value||0);
  const obs = ($novaObs.value||"").trim();

  if(!dateKey || !hora || !quadraId){ alert("Dados de data/hora/quadra inválidos."); return; }
  if(!idCliente){ alert("Selecione um cliente válido."); return; }

  if(tipo === "normal"){

    const conflito = await temConflito(dateKey, hora, quadraId);
    if(conflito){
      alert(`Já existe reserva ativa neste horário: ${conflito.cli} (${conflito.pag})`);
      return;
    }
    const doc = {
      data_criacao: firebase.firestore.FieldValue.serverTimestamp(),
      data_reserva: dateKey,
      hora_inicio: hora,
      hora_fim: addOneHour(hora),
      id_cliente: idCliente,
      id_quadra: quadraId,
      observacao_reserva: obs,
      pagamento_reserva: "aguardando",
      status_reserva: "aguardando",
      tipo_reserva: "Normal",
      valor: valor
    };
    await db.collection("reservas").add(doc);
    closeModal("modal-nova");
    await montarGrade(parseISO(dateKey));
    return;
  }

  // Série Fixa (~12 semanas)
  const serieId = db.collection("_").doc().id; // gera id único
  const datas = gerarSerieSemanal(dateKey, 12);
  const conflitos = [];
  const livres = [];
  for(const d of datas){
    const k = fmtISO(d);
    const conf = await temConflito(k, hora, quadraId);
    if(conf) conflitos.push({data:k, ...conf});
    else livres.push(k);
  }

  if(conflitos.length){
    const lista = conflitos.map(c=>`${c.data} – ${c.cli}`).join("\n");
    const ok = confirm(`Existem conflitos nesta série:\n${lista}\n\nDeseja criar SOMENTE nas datas livres?`);
    if(!ok){ return; }
  }

  const batchSize = livres.length;
  for(const [idx, k] of livres.entries()){
    let obsReserva = obs;
    if(idx >= Math.max(0, batchSize-2)) {
      obsReserva = (obsReserva ? obsReserva + " " : "") + "Ultima reserva da serie, favor cadastrar novamente";
    }
    const doc = {
      data_criacao: firebase.firestore.FieldValue.serverTimestamp(),
      data_reserva: k,
      hora_inicio: hora,
      hora_fim: addOneHour(hora),
      id_cliente: idCliente,
      id_quadra: quadraId,
      observacao_reserva: obsReserva,
      pagamento_reserva: "aguardando",
      status_reserva: "aguardando",
      tipo_reserva: "Fixo",
      valor: valor,
      id_serie: serieId
    };
    await db.collection("reservas").add(doc);
  }

  closeModal("modal-nova");
  await montarGrade(parseISO(dateKey));
}
function gerarSerieSemanal(dateKey, n){
  const d0 = parseISO(dateKey);
  const arr = [];
  for(let i=0;i<n;i++) arr.push(addDays(d0, i*7));
  return arr;
}
async function temConflito(dateKey, hora, quadraId){
  const snap = await db.collection("reservas")
    .where("data_reserva","==",dateKey)
    .where("hora_inicio","==",hora)
    .where("id_quadra","==",quadraId)
    .get();
  let ativo=null;
  snap.forEach(doc=>{
    const r = doc.data();
    if(r.status_reserva !== "cancelada"){ ativo = r; }
  });
  if(!ativo) return null;
  const cli = (clientesCache.get(ativo.id_cliente)?.nome) || "Cliente";
  return { cli, pag: ativo.pagamento_reserva || "aguardando" };
}

/* ===== Editar Reserva ===== */
async function abrirModalEditar(r, dateKey, hora, quadraId){
  currentEditReserva = r;
  const c = await awaitEnsureCliente(r.id_cliente);
  document.getElementById("edit-cliente").value = c?.nome || "";
  document.getElementById("edit-data").value    = dateKey || r.data_reserva || "";
  document.getElementById("edit-hora").value    = hora || r.hora_inicio || "";
  document.getElementById("edit-quadra").value  = quadraById.get(quadraId||r.id_quadra)?.nome || "";
  document.getElementById("edit-valor").value   = Number(r.valor||0);
  document.getElementById("edit-status-reserva").value = r.status_reserva || "aguardando";
  document.getElementById("edit-status-pagamento").value = r.pagamento_reserva || "aguardando";
  document.getElementById("edit-obs").value = r.observacao_reserva || "";

  ensureTelefoneField();
  const tel = c?.telefone || "";
  document.getElementById("edit-telefone").value = tel;

  document.getElementById("btn-excluir").disabled = (r.status_reserva !== "cancelada");
  openModal("modal-editar");
}
function ensureTelefoneField(){
  if(document.getElementById("edit-telefone")) return;
  const grid = document.querySelector("#modal-editar .form-grid");
  const after = document.getElementById("edit-cliente").closest(".form-row");
  const row = document.createElement("div");
  row.className = "form-row";
  row.innerHTML = `<label>Telefone</label><input id="edit-telefone" type="text" readonly>`;
  if(after && after.parentNode===grid){
    grid.insertBefore(row, after.nextSibling);
  }else{
    grid.appendChild(row);
  }
}
async function salvarEditarReserva(){
  if(!currentEditReserva) return;
  const updates = {
    valor: Number(document.getElementById("edit-valor").value||0),
    status_reserva: document.getElementById("edit-status-reserva").value,
    pagamento_reserva: document.getElementById("edit-status-pagamento").value,
    observacao_reserva: document.getElementById("edit-obs").value || ""
  };
  await updateReserva(currentEditReserva.id, updates);
}
async function updateReserva(id, updates){
  await db.collection("reservas").doc(id).update(updates);
  closeModal("modal-editar");
  await montarGrade(selectedDate);
}

/* ===== Ações do modal ===== */
async function confirmarReserva(r){
  await updateReserva(r.id, { status_reserva: "confirmada" });
}

/* ===== NOVO: Gerenciar série fixa com modal e checkboxes ===== */
function ensureSerieModal(){
  let modal = document.getElementById("modal-serie");
  if(modal) return modal;
  modal = document.createElement("div");
  modal.id = "modal-serie";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 760px;">
      <div class="modal-header">
        <h3 id="serie-title">Gerenciar série fixa</h3>
        <button class="modal-close" data-close="modal-serie" aria-label="Fechar">✖</button>
      </div>
      <div class="modal-body">
        <div class="warn" id="serie-help" style="margin-bottom:8px;"></div>
        <div id="serie-list" class="list-group" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
      <div class="modal-footer">
        <div style="display:flex; gap:8px; align-items:center;">
          <label style="display:flex; align-items:center; gap:6px; font-size: .9rem;">
            <input type="checkbox" id="serie-select-all"> Selecionar tudo
          </label>
        </div>
        <div style="display:flex; gap:8px;">
          <button id="btn-serie-cancelar" class="btn btn-primary">Cancelar selecionadas</button>
          <button id="btn-serie-excluir" class="btn btn-secondary">Excluir selecionadas</button>
          <button class="btn btn-secondary" data-close="modal-serie">Fechar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  // Fechar por X já é cuidado por handler global
  return modal;
}
async function fetchSerieDocs(base){
  // Preferir id_serie se existir
  let snaps = [];
  if(base.id_serie){
    const q = await db.collection("reservas").where("id_serie","==", base.id_serie).get();
    q.forEach(d => snaps.push({ id: d.id, ...(d.data()||{}) }));
  }else{
    // fallback: tipo Fixo + mesma quadra + mesmo cliente + mesmo horário, filtra pelo mesmo dia da semana
    const q = await db.collection("reservas")
      .where("tipo_reserva","==","Fixo")
      .where("id_quadra","==", base.id_quadra)
      .where("hora_inicio","==", base.hora_inicio)
      .where("id_cliente","==", base.id_cliente)
      .get();
    const dowBase = (new Date(base.data_reserva+"T00:00:00")).getDay();
    q.forEach(d => {
      const r = { id: d.id, ...(d.data()||{}) };
      const dow = (new Date(r.data_reserva+"T00:00:00")).getDay();
      if(dow === dowBase) snaps.push(r);
    });
  }
  // Ordena por data
  snaps.sort((a,b) => (a.data_reserva||"").localeCompare(b.data_reserva||""));
  return snaps;
}
async function openSerieManageFlow(baseReserva){
  const modal = ensureSerieModal();
  const title = modal.querySelector("#serie-title");
  const help  = modal.querySelector("#serie-help");
  const list  = modal.querySelector("#serie-list");
  const ckAll = modal.querySelector("#serie-select-all");
  const btnCancel = modal.querySelector("#btn-serie-cancelar");
  const btnDelete = modal.querySelector("#btn-serie-excluir");

  const labelQuadra = quadraById.get(baseReserva.id_quadra)?.nome || "Quadra";
  title.textContent = `Série fixa — ${labelQuadra}, ${baseReserva.hora_inicio}`;
  help.textContent = "Marque as reservas que deseja aplicar a ação. Dica: você pode selecionar todas e desmarcar exceções.";

  list.innerHTML = "Carregando…";
  const allDocs = await fetchSerieDocs(baseReserva);
  // Focar a partir da data base (não mostrar passadas)
  const startKey = baseReserva.data_reserva || fmtISO(selectedDate);
  const docs = allDocs.filter(r => (r.data_reserva||"") >= startKey);

  if(!docs.length){
    list.innerHTML = "<em>Nenhuma reserva encontrada nesta série a partir desta data.</em>";
  }else{
    list.innerHTML = "";
    for(const r of docs){
      const c = clientesCache.get(r.id_cliente) || await awaitEnsureCliente(r.id_cliente);
      const item = document.createElement("label");
      item.style.cssText = "display:flex; align-items:center; gap:10px; border:1px solid #e1e5ea; border-radius:8px; padding:8px 10px;";
      item.innerHTML = `
        <input type="checkbox" class="serie-item" value="${r.id}" data-status="${r.status_reserva||'aguardando'}">
        <span style="min-width:86px; font-weight:700;">${r.data_reserva}</span>
        <span style="min-width:64px;">${r.hora_inicio}</span>
        <span style="min-width:140px;">${escapeHtml(c?.nome||'Cliente')}</span>
        <span style="padding:2px 8px; border-radius:999px; font-size:.8rem; ${badgeStyle(r)}">${badgeText(r)}</span>
        <span style="flex:1; color:#555;">${escapeHtml(str(r.observacao_reserva))}</span>
      `;
      list.appendChild(item);
    }
  }

  ckAll.checked = true;
  list.querySelectorAll(".serie-item").forEach(i => i.checked = true);
  ckAll.onchange = () => {
    const v = ckAll.checked;
    list.querySelectorAll(".serie-item").forEach(i => i.checked = v);
  };

  btnCancel.onclick = async () => {
    const ids = Array.from(list.querySelectorAll(".serie-item:checked")).map(i => i.value);
    if(!ids.length){ alert("Selecione pelo menos uma reserva."); return; }
    for(const id of ids){
      await db.collection("reservas").doc(id).update({
        status_reserva: "cancelada",
        pagamento_reserva: "cancelada"
      });
    }
    closeModal("modal-serie");
    await montarGrade(selectedDate);
  };

  btnDelete.onclick = async () => {
    const items = Array.from(list.querySelectorAll(".serie-item:checked"));
    if(!items.length){ alert("Selecione pelo menos uma reserva."); return; }
    // por consistência, só vamos excluir as que já estiverem canceladas
    const notCancelled = items.filter(i => (i.dataset.status||"") !== "cancelada");
    if(notCancelled.length){
      alert("Para excluir, cancele primeiro as reservas selecionadas.");
      return;
    }
    for(const i of items){
      await db.collection("reservas").doc(i.value).delete();
    }
    closeModal("modal-serie");
    await montarGrade(selectedDate);
  };

  openModal("modal-serie");
}
function badgeText(r){
  const s = (r.status_reserva||"aguardando");
  if(s==="confirmada") return "Confirmada";
  if(s==="cancelada") return "Cancelada";
  if(s==="nao_compareceu") return "Não compareceu";
  return "Aguardando";
}
function badgeStyle(r){
  const s = (r.status_reserva||"aguardando");
  if(s==="confirmada") return "background:#d1fae5; color:#065f46;";
  if(s==="cancelada") return "background:#e5e7eb; color:#111827; border:1px dashed #cbd5e1;";
  if(s==="nao_compareceu") return "background:#fee2e2; color:#991b1b;";
  return "background:#fef3c7; color:#92400e;";
}

/* ===== Cancelar (única ou série via modal) ===== */
async function cancelarReservaFlow(r){
  const isFixo = ((String(r.tipo_reserva||'').toLowerCase()==='fixo') || !!r.id_serie);
  if(isFixo){
    try{ closeModal('modal-editar'); }catch(_){ }
    await openSerieManageFlow(r);
  }else{
    if(confirm("Tem certeza que deseja cancelar esta reserva?")){
      await updateReserva(r.id, { status_reserva:"cancelada", pagamento_reserva:"cancelada" });
    }
  }
}

async function naoCompareceuReserva(r){
  const updates = { status_reserva: "nao_compareceu" };
  if((r.pagamento_reserva||"aguardando") === "aguardando"){
    updates.pagamento_reserva = "atrasada";
  }
  await db.collection("reservas").doc(r.id).update(updates);

  try{
    const cliRef = db.collection("clientes").doc(r.id_cliente);
    const snap = await cliRef.get();
    const cli = snap.data()||{};
    const linha = `Não compareceu dia ${r.data_reserva} horário ${r.hora_inicio}`;
    const atual = str(cli.observacoes);
    const novo = atual ? (atual + "\n" + linha) : linha;
    await cliRef.update({ observacoes: novo });
    const local = clientesCache.get(r.id_cliente) || {};
    local.observacoes = novo;
    clientesCache.set(r.id_cliente, local);
  }catch(e){ console.warn("Falha ao atualizar observações do cliente:", e); }

  closeModal("modal-editar");
  await montarGrade(selectedDate);
}

async function trocarQuadraFlow(r){
  // Abre modal e deixa o usuário selecionar destino + datas (se fixo)
  await abrirModalTrocaQuadra(r);
}

async function abrirModalTrocaQuadra(r){
  if(!$modalTroca) { alert("Modal de troca não encontrado."); return; }

  trocaBaseReserva = r;
  trocaPreviewItems = [];
  $trocaList.innerHTML = "";
  $trocaStatus.textContent = "";

  const nomeQuadraOrigem = quadraById.get(r.id_quadra)?.nome || r.id_quadra || "-";
  const nomeCliente = (r.nome_cliente || r.cliente_nome || r.cliente || "").trim();
  $trocaCliente.textContent = nomeCliente || "(cliente)";
  $trocaDataHora.textContent = `${formatDateBr(r.data_reserva)} • ${r.hora_inicio}`;
  $trocaOrigem.textContent = nomeQuadraOrigem;

  // popular destino
  $trocaDestino.innerHTML = "";
  const destinos = quadras.filter(q => q.id !== r.id_quadra);
  if(destinos.length === 0){
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Nenhuma outra quadra cadastrada";
    $trocaDestino.appendChild(opt);
  }else{
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "Selecione...";
    $trocaDestino.appendChild(opt0);
    destinos.forEach(q=>{
      const opt = document.createElement("option");
      opt.value = q.id;
      opt.textContent = q.nome || q.id;
      $trocaDestino.appendChild(opt);
    });
  }

  const isFixo = ((String(r.tipo_reserva||'').toLowerCase()==='fixo') || !!r.id_serie);
  if(isFixo && r.id_serie){
    $trocaSeriesBox.style.display = "";
    $trocaUsarSeries.checked = true;
    $trocaListContainer.style.display = "";
  }else{
    $trocaSeriesBox.style.display = "none";
    $trocaUsarSeries.checked = false;
    $trocaListContainer.style.display = "none";
  }

  // eventos
  const refresh = async ()=> { await montarPreviewTroca(); };
  $trocaDestino.onchange = refresh;
  if($trocaUsarSeries) $trocaUsarSeries.onchange = ()=> {
    $trocaListContainer.style.display = $trocaUsarSeries.checked ? "" : "none";
    refresh();
  };

  closeModal("modal-editar");
    openModal("modal-troca");
}

async function montarPreviewTroca(){
  if(!trocaBaseReserva) return;
  const destinoId = $trocaDestino.value;
  if(!destinoId){
    $trocaList.innerHTML = "";
    $trocaStatus.textContent = "Selecione a quadra destino.";
    trocaPreviewItems = [];
    return;
  }

  $trocaStatus.textContent = "Carregando...";
  $trocaList.innerHTML = "";
  trocaPreviewItems = [];

  const usarSeries = !!($trocaUsarSeries && $trocaUsarSeries.checked && trocaBaseReserva.id_serie);
  let itens = [trocaBaseReserva];

  if(usarSeries){
    const snap = await db.collection("reservas")
      .where("id_serie","==", trocaBaseReserva.id_serie)
      .get();

    itens = [];
    snap.forEach(doc=>{
      const x = { id: doc.id, ...(doc.data()||{}) };
      if(x.data_reserva >= trocaBaseReserva.data_reserva){
        // somente reservas ativas / aguardando / confirmadas (canceladas podem existir off)
        itens.push(x);
      }
    });

    // ordenar por data
    itens.sort((a,b)=> (a.data_reserva||"").localeCompare(b.data_reserva||""));
  }

  // montar preview com conflitos
  const previews = [];
  for(const it of itens){
    const ocupante = await getActiveReservaAt(it.data_reserva, it.hora_inicio, destinoId);
    previews.push({
      reserva: it,
      checked: true,
      ocupante
    });
  }

  trocaPreviewItems = previews;

  // render
  const frag = document.createDocumentFragment();
  previews.forEach((p, idx)=>{
    const div = document.createElement("div");
    div.className = "troca-item";

    const left = document.createElement("div");
    left.className = "troca-left";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = p.checked;
    cb.addEventListener("change", ()=> { trocaPreviewItems[idx].checked = cb.checked; });

    const txt = document.createElement("div");
    const d = document.createElement("div");
    d.className = "troca-date";
    d.textContent = `${formatDateBr(p.reserva.data_reserva)} (${getDowShort(p.reserva.data_reserva)})`;
    const sub = document.createElement("div");
    sub.className = "troca-sub";
    const qOrig = quadraById.get(p.reserva.id_quadra)?.nome || p.reserva.id_quadra;
    sub.textContent = `Hora ${p.reserva.hora_inicio} • Origem: ${qOrig}`;

    txt.appendChild(d);
    txt.appendChild(sub);

    left.appendChild(cb);
    left.appendChild(txt);

    const right = document.createElement("div");
    right.className = "troca-right";
    if(p.ocupante){
      const nome = (p.ocupante.nome_cliente || p.ocupante.cliente_nome || p.ocupante.cliente || "Conflito");
      right.innerHTML = `<span class="troca-conflict">Conflito</span>: ${escapeHtml(nome)}`;
    }else{
      right.innerHTML = `<span class="troca-ok">Livre</span>`;
    }

    div.appendChild(left);
    div.appendChild(right);
    frag.appendChild(div);
  });

  $trocaList.appendChild(frag);

  const conflitos = previews.filter(p=>p.ocupante).length;
  $trocaStatus.textContent = conflitos ? `Encontrado(s) ${conflitos} conflito(s).` : "Sem conflitos.";
}

function getDowShort(dateKey){
  const d = parseDateKey(dateKey);
  const map = ["DOM","SEG","TER","QUA","QUI","SEX","SÁB"];
  return map[d.getDay()];
}
function parseDateKey(key){
  const [y,m,dd] = String(key).split("-").map(Number);
  return new Date(y, (m||1)-1, dd||1);
}
function escapeHtml(str){
  return String(str||"").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}


async function getActiveReservaAt(dateKey, horaInicio, quadraId){
  const snap = await db.collection("reservas")
    .where("data_reserva","==", dateKey)
    .where("hora_inicio","==", horaInicio)
    .where("id_quadra","==", quadraId)
    .get();

  let ocupante = null;
  snap.forEach(doc=>{
    const x = { id: doc.id, ...(doc.data()||{}) };
    const cancel = (String(x.status_reserva||"").toLowerCase()==="cancelada") || (String(x.pagamento_reserva||"").toLowerCase()==="cancelada");
    if(!cancel) ocupante = x;
  });
  return ocupante;
}

async function moverOuSwap(r, destinoQuadraId, opts={allowSwap:true}){
  const ocupante = await getActiveReservaAt(r.data_reserva, r.hora_inicio, destinoQuadraId);

  if(!ocupante){
    await db.collection("reservas").doc(r.id).update({ id_quadra: destinoQuadraId });
    return { moved:true, swapped:false, conflict:false };
  }

  if(!opts.allowSwap){
    return { moved:false, swapped:false, conflict:true, ocupante };
  }

  // swap (inverter clientes) - troca SOMENTE o id_quadra
  await db.collection("reservas").doc(r.id).update({ id_quadra: destinoQuadraId });
  await db.collection("reservas").doc(ocupante.id).update({ id_quadra: r.id_quadra });
  return { moved:true, swapped:true, conflict:true, ocupante };
}

async function trocarQuadraSerieFuturas(baseReserva, destinoQuadraId){
  const snap = await db.collection("reservas")
    .where("id_serie","==", baseReserva.id_serie)
    .get();

  const futuras = [];
  snap.forEach(doc=>{
    const x = { id: doc.id, ...(doc.data()||{}) };
    if(x.data_reserva >= baseReserva.data_reserva) futuras.push(x);
  });

  for(const r of futuras){
    await moverOuSwap(r, destinoQuadraId);
  }
}
/* Excluir (somente cancelada) */
async function excluirReservaFlow(r){
  if(r.status_reserva !== "cancelada"){
    alert("Para excluir, cancele primeiro.");
    return;
  }
  const isFixo = ((String(r.tipo_reserva||'').toLowerCase()==='fixo') || !!r.id_serie);
  if(isFixo){
    // reutilizar o modal de série, mas pré-selecionando somente esta?
    await openSerieManageFlow(r);
  }else{
    await db.collection("reservas").doc(r.id).delete();
    closeModal("modal-editar");
    await montarGrade(selectedDate);
  }
}

/* ======= Abrir horários extras ======= */

async function confirmarTrocaDeQuadra(){
  if(!trocaBaseReserva) return;
  const destinoId = $trocaDestino.value;
  if(!destinoId){ alert("Selecione a quadra destino."); return; }

  const selecionados = (trocaPreviewItems||[]).filter(p=>p.checked).map(p=>p);
  if(selecionados.length===0){ alert("Selecione pelo menos uma data."); return; }

  const permitirSwap = !!($trocaPermitirSwap && $trocaPermitirSwap.checked);
  const conflitos = selecionados.filter(p=>!!p.ocupante);

  if(conflitos.length && permitirSwap){
    const lista = conflitos.slice(0,8).map(p=> `${formatDateBr(p.reserva.data_reserva)} ${p.reserva.hora_inicio}`).join("\n");
    const ok = confirm(`Existem ${conflitos.length} conflito(s) na quadra destino.\n\nSe você confirmar, vou INVERTER os clientes (swap) nesses horários.\n\n${lista}${conflitos.length>8?'\n...':''}\n\nDeseja continuar?`);
    if(!ok) return;
  }

  if(conflitos.length && !permitirSwap){
    const ok = confirm(`Existem ${conflitos.length} conflito(s).\nComo a troca automática está desativada, esses horários serão IGNORADOS.\n\nDeseja continuar com os horários livres?`);
    if(!ok) return;
  }

  const batch = db.batch();
  let applied = 0;
  let skipped = 0;

  for(const p of selecionados){
    const r = p.reserva;
    const ocup = p.ocupante;

    if(ocup){
      if(!permitirSwap){ skipped++; continue; }
      // swap (somente id_quadra)
      batch.update(db.collection("reservas").doc(r.id), { id_quadra: destinoId });
      batch.update(db.collection("reservas").doc(ocup.id), { id_quadra: r.id_quadra });
      applied++;
    }else{
      batch.update(db.collection("reservas").doc(r.id), { id_quadra: destinoId });
      applied++;
    }
  }

  await batch.commit();

  closeModal("modal-troca");
  closeModal("modal-editar");
  await montarGrade(selectedDate);

  if(skipped){
    alert(`Troca concluída. Aplicadas: ${applied}. Ignoradas por conflito: ${skipped}.`);
  }
}

if($btnConfirmarTroca){
  $btnConfirmarTroca.addEventListener("click", confirmarTrocaDeQuadra);
}
function ensureExtrasModal(){
  let modal = document.getElementById("modal-extras");
  if(modal) return modal;
  modal = document.createElement("div");
  modal.id = "modal-extras";
  modal.className = "modal hidden";
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="extras-title">Abrir horários extras</h3>
        <button class="modal-close" data-close="modal-extras" aria-label="Fechar">✖</button>
      </div>
      <div class="modal-body">
        <div id="extras-help" style="margin-bottom:8px;"></div>
        <div id="extras-list" style="display:flex; flex-wrap:wrap; gap:10px;"></div>
      </div>
      <div class="modal-footer">
        <button id="btn-extras-salvar" class="btn btn-primary">Salvar</button>
        <button class="btn btn-secondary" data-close="modal-extras">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  wireCloseHandlers(modal);
  return modal;
}

async function openExtrasFlow(){
  const dateObj = selectedDate;
  const dateKey = fmtISO(dateObj);

  // opções válidas por dia
  const allowed = allowedExtrasFor(dateObj);

  // horários já visíveis (padrão + extras salvos)
  const base = horariosPadraoPara(dateObj);
  const extrasAtuais = await horariosExtrasPara(dateKey);
  const jaVisiveis = new Set([...base, ...extrasAtuais]);

  const candidatos = allowed.filter(h => !jaVisiveis.has(h));
  if(!candidatos.length){
    alert("Nenhum horário extra disponível para este dia.");
    return;
  }

  const modal = ensureExtrasModal();
  wireCloseHandlers(modal);
  const help = modal.querySelector("#extras-help");
  const list = modal.querySelector("#extras-list");
  help.textContent = `Escolha os horários extras para ${fmtDisplay(dateObj)}:`;
  list.innerHTML = "";
  sortTimes(candidatos).forEach(h=>{
    const lab = document.createElement("label");
    lab.style.cssText = "border:1px solid #dfe3e6; padding:6px 10px; border-radius:8px; cursor:pointer; user-select:none;";
    lab.innerHTML = `<input type="checkbox" value="${h}" style="margin-right:6px;"> ${h}`;
    list.appendChild(lab);
  });

  const btnSalvar = modal.querySelector("#btn-extras-salvar");
  btnSalvar.onclick = async ()=>{
    const marcados = Array.from(list.querySelectorAll("input[type=checkbox]:checked")).map(i=>i.value);
    if(!marcados.length){ alert("Selecione pelo menos um horário."); return; }
    const novos = sortTimes(Array.from(new Set([...(extrasAtuais||[]), ...marcados])));
    await db.collection("horarios_visiveis_personalizados").doc(dateKey).set({
      horariosVisiveis: novos
    }, { merge: true });
    closeModal("modal-extras");
    await montarGrade(dateObj);
  };

  openModal("modal-extras");
}