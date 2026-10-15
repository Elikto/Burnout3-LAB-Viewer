"use strict";
/* Public, READ-ONLY command center; real GitHub authentication happens on
   github.com when the owner submits a private issue. No credentials are
   accepted, stored, or transmitted from this static Pages origin. */
const $ = id => document.getElementById(id);
const PROJECTS = Object.freeze({
  hd: {
    title: "Burnout 3 HD", subtitle: "Textures PS2 · PCSX2 · Real-ESRGAN · Qwen",
    label: "PROJET 01 — AMÉLIORATION TEXTURES", repo: "Elikto/Burnout3-HD",
    projectCode: "HD", icon: "HD"
  },
  pc: {
    title: "Burnout 3 Remastered PC Edition",
    subtitle: "Portage natif Windows · Étude PAL SLES-52585 · Qwen",
    label: "PROJET 02 — PORTAGE WINDOWS", repo: "Elikto/Burnout3-Remastered-PC-Edition",
    projectCode: "PC EDITION", icon: "PC"
  }
});
const ROLES = new Set(["chatgpt", "qwen", "agent", "system"]);
const AAD = new TextEncoder().encode("Burnout3-LAB/encrypted-offline-archive/v1");
let publicStatus = null;
let archive = null;
let activeView = "home";
let activeTab = "messages";
let selectedTask = null;
let unlocking = false;

function labelRole(role) {
  return {qwen:"Qwen · modèle local",chatgpt:"Consigne GitHub",
    agent:"Agent Windows",system:"Système"}[role] || "Événement";
}
function el(tag, cls, value) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (value !== undefined) element.textContent = String(value);
  return element;
}
function formatDate(value, fallback="Non synchronisé") {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  return new Intl.DateTimeFormat("fr-FR",{
    day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"
  }).format(date);
}
function shortDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {day:"2-digit",month:"short",
    hour:"2-digit",minute:"2-digit"}).format(date);
}
function safeProject(id) { return id === "hd" || id === "pc"; }
function normalizeStatus(doc) {
  if (!doc || doc.v !== 1 || !Array.isArray(doc.projects)) return null;
  const projects = {};
  for (const entry of doc.projects) {
    if (!entry || !safeProject(entry.id) || projects[entry.id]) continue;
    const tasks = Array.isArray(entry.tasks) ? entry.tasks.slice(0,45) : [];
    const latest = Array.isArray(entry.latest) ? entry.latest.slice(0,30) : [];
    projects[entry.id] = {
      id:entry.id,
      tasks:tasks.filter(t=>t && typeof t==="object" && typeof t.title==="string")
        .map(t=>({
          id: typeof t.id==="string"?t.id.slice(0,64):"",
          title:t.title.slice(0,150),
          status:["completed","active","queued","blocked","unknown"].includes(t.status)
            ? t.status:"unknown",
          done:Number.isInteger(t.done)&&t.done>=0?t.done:null,
          total:Number.isInteger(t.total)&&t.total>0?t.total:null,
          next:typeof t.next==="string"?t.next.slice(0,180):"",
          updated_at:typeof t.updated_at==="string"?t.updated_at:null,
          actions:normalizeActions(t.actions)
        })),
      latest:latest.filter(x=>x && typeof x==="object" &&
        typeof x.summary==="string" && typeof x.time==="string")
        .map(x=>({
          time:x.time,
          summary:x.summary.slice(0,320),
          role:ROLES.has(x.role)?x.role:"agent",
          kind:typeof x.kind==="string"?x.kind.slice(0,60):"événement"
        }))
    };
  }
  if (!projects.hd || !projects.pc) return null;
  return {generated_at:typeof doc.generated_at==="string"?doc.generated_at:null,
    projects};
}
function normalizeActions(value) {
  const input=value&&typeof value==="object"?value:{};
  const array=v=>Array.isArray(v)?v.filter(x=>typeof x==="string"&&x.length>0)
    .slice(0,15).map(x=>x.slice(0,300)):[];
  return {
    done:array(input.done),
    current:typeof input.current==="string"?input.current.slice(0,300):"",
    remaining:array(input.remaining)
  };
}
function currentTask(project) {
  const tasks=project?.tasks||[];
  return tasks.find(t=>t.status==="active") ||
    tasks.find(t=>t.status==="queued") ||
    tasks.find(t=>t.status==="blocked") ||
    tasks.slice().reverse().find(t=>t.status==="completed") || null;
}
function nextTask(project, selected) {
  const tasks=project?.tasks||[];
  if (!selected) return "";
  if (selected.next) return selected.next;
  return tasks.find(t=>t!==selected && t.status==="queued")?.title || "";
}
function statusName(status) {
  return {completed:"Terminé",active:"Activité récente",
    queued:"En attente",blocked:"Bloqué",unknown:"Non vérifié"}[status]||"Non vérifié";
}
function progressValue(task) {
  return task && task.total!==null && task.done!==null ?
    Math.max(0,Math.min(100,Math.round(100*Math.min(task.done,task.total)/task.total))):null;
}
function isStale(instant) {
  const time=Date.parse(instant||"");
  return !Number.isFinite(time) || Date.now()-time>25*60*1000;
}
async function loadPublicStatus() {
  try {
    const response=await fetch("./public-status.json",{cache:"no-store",credentials:"omit"});
    if(!response.ok) throw Error("no status");
    publicStatus=normalizeStatus(await response.json());
  } catch (_) {
    publicStatus=null;
  }
  renderHome();
  if(archive)renderUnlockedHome();
  if (safeProject(activeView)) renderProgressView(activeView);
}
function renderHome() {
  const status=publicStatus;
  $("metric-sync").textContent=shortDate(status?.generated_at);
  $("snapshot-label").textContent=status ?
    "Sauvegarde du "+formatDate(status.generated_at) :
    "Aucun état public synchronisé";
  $("sidebar-status").textContent=status ?
    (isStale(status.generated_at)?"Dernier état possiblement ancien":"Dernière copie disponible"):
    "En attente des premières données";
  $("sync-dot").className="dot"+(status?(isStale(status.generated_at)?" stale":" ready"):"");
  const projects=["hd","pc"].map(id=>status?.projects[id]);
  $("metric-done").textContent=status ?
    String(projects.reduce((sum,p)=>sum+(p?.tasks.filter(t=>t.status==="completed").length||0),0)):"—";
  $("metric-events").textContent=status ?
    String(projects.reduce((sum,p)=>sum+(p?.latest.length||0),0)):"—";

  const cards=document.createDocumentFragment();
  for(const id of ["hd","pc"]) {
    const project=status?.projects[id];
    const task=currentTask(project);
    const progress=progressValue(task);
    const card=el("button","progress-card "+id);
    card.type="button";
    card.setAttribute("aria-label","Détails des tâches de "+PROJECTS[id].title);
    const top=el("div","progress-card-top");
    const identity=el("div","card-project");
    identity.append(el("span","",id.toUpperCase()),el("strong","",PROJECTS[id].title));
    top.append(identity,el("span","task-state",task?statusName(task.status):"En attente"));
    const title=el("div","task-name",task?task.title:"Aucune tâche vérifiée sur ce projet");
    const caption=el("div","progress-caption");
    caption.append(el("span","",progress===null?"Progression non mesurée":"Progression de cette tâche"),
      el("strong","",progress===null?"—":progress+" %"));
    const track=el("div","progress-track");
    const fill=el("div","progress-fill");
    fill.style.width=progress===null?"0%":progress+"%";
    track.append(fill);
    const next=el("div","progress-next");
    const upcoming=(project?.tasks||[]).filter(t=>t!==task&&t.status==="queued").map(t=>t.title);
    if(task?.next && task.next!==task.title && !upcoming.includes(task.next))upcoming.unshift(task.next);

    next.append(el("strong","","Prochaine tâche : "),
      document.createTextNode(task?(nextTask(project,task)||"Aucune tâche suivante confirmée"):"Non définie"));
    if(upcoming.length){
      const heading=el("strong","upcoming-heading","À VENIR");
      const list=el("ol","upcoming-list");
      for(const name of upcoming.slice(0,6))list.append(el("li","",name));
      next.append(heading,list);
    }
    card.append(top,title,caption,track,next,
      el("div","progress-foot","Voir les actions effectuées, la dernière activité et les étapes restantes →"));
    card.addEventListener("click",()=>openTaskDrawer(id,task));
    cards.append(card);
  }
  $("progress-grid").replaceChildren(cards);

  const rows=[];
  for(const id of ["hd","pc"]) {
    for(const item of status?.projects[id]?.latest||[]) rows.push({...item,id});
  }
  rows.sort((a,b)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0));
  const feed=document.createDocumentFragment();
  if(!rows.length) {
    feed.append(el("p","placeholder","Les conversations et le suivi des tâches seront visibles après la première synchronisation Windows."));
  }
  for(const item of rows.slice(0,12)) {
    const row=el("article","activity-row");
    const avatar=el("div","activity-avatar "+item.id,item.id.toUpperCase());
    const body=el("div","activity-copy");
    body.append(el("strong","",PROJECTS[item.id].title+" · "+labelRole(item.role)),
      el("p","",item.summary),el("div","activity-meta",item.kind));
    row.append(avatar,body,el("time","activity-time",shortDate(item.time)));
    feed.append(row);
  }
  $("recent-feed").replaceChildren(feed);
}
function detailElement(projectId,task) {
  const container=el("div","task-details");
  if (!task) {
    container.append(el("p","placeholder","Aucune tâche locale vérifiée. Le système n'invente ni action en cours ni pourcentage."));
    return container;
  }
  const progress=progressValue(task);
  const stats=el("div","detail-block");
  stats.append(el("h3","","État vérifié : "+statusName(task.status)));
  const caption=el("div","progress-caption");
  caption.append(el("span","",progress===null?"Objectif chiffré inconnu":"Objectif de cette tâche uniquement"),
    el("strong","",progress===null?"Non mesuré":task.done+" / "+task.total+" · "+progress+" %"));
  const track=el("div","progress-track");
  const fill=el("div","progress-fill");fill.style.width=progress===null?"0%":progress+"%";track.append(fill);
  stats.append(caption,track);
  container.append(stats);
  const block=(title,items,kind)=>{
    const part=el("section","detail-block");
    part.append(el("h3","",title));
    const ul=el("ul");
    for(const item of items.length?items:["Aucun événement de cette catégorie confirmé."]) {
      const li=el("li");
      li.append(el("span","step-icon "+kind,kind==="done"?"✓":kind==="next"?"→":"·"),
        el("span","",item));
      ul.append(li);
    }
    part.append(ul);
    container.append(part);
  };
  block("Actions déjà réalisées",task.actions.done,"done");
  block("Dernière action signalée",task.actions.current?[task.actions.current]:[],"current");
  block("Ce qui reste à faire",task.actions.remaining,"next");
  const next=nextTask(publicStatus?.projects[projectId],task);
  if(next) container.append(el("p","drawer-warning","Prochaine tâche : "+next));
  if(task.updated_at) container.append(el("p","drawer-warning","Dernier signal enregistré : "+formatDate(task.updated_at)+". Cela ne prouve pas qu'un traitement est actuellement en cours."));
  return container;
}
function openTaskDrawer(projectId,task) {
  selectedTask={projectId,task};
  $("drawer-title").textContent=task?.title||"Aucune tâche confirmée";
  $("drawer-subtitle").textContent=PROJECTS[projectId].title+" · Dernière sauvegarde "+formatDate(publicStatus?.generated_at);
  $("drawer-progress").replaceChildren();
  $("drawer-actions").replaceChildren(detailElement(projectId,task));
  $("task-overlay").classList.remove("hidden");
  $("close-drawer").focus();
}
function closeTaskDrawer() {
  $("task-overlay").classList.add("hidden");
  selectedTask=null;
}
function navigate(view) {
  if(view!=="home"&&!safeProject(view)) view="home";
  activeView=view;
  $("sidebar").classList.remove("open");
  $("menu-toggle").setAttribute("aria-expanded","false");
  $("home-view").classList.toggle("hidden",view!=="home");
  $("project-view").classList.toggle("hidden",view==="home");
  for(const nav of document.querySelectorAll(".nav-link")) {
    nav.classList.toggle("active",nav.dataset.view===view);
  }
  $("breadcrumb").textContent=view==="home"?"Vue d'ensemble":PROJECTS[view].title;
  if(view!=="home") {
    const conf=PROJECTS[view];
    $("project-title").textContent=conf.title;
    $("project-label").textContent=conf.label;
    $("project-description").textContent=conf.subtitle;
    $("project-icon").textContent=conf.icon;
    $("project-icon").className="project-heading-icon "+view;
    $("conversation-heading").textContent="Conversation complète · "+conf.projectCode;
    $("conversation-search").value="";
    $("prompt-text").value="";
    $("prompt-feedback").textContent="";
    changeTab("messages");
    renderConversation();
  }
  window.scrollTo({top:0,behavior:"instant"});
}
function changeTab(tab) {
  activeTab=tab==="progress"?"progress":"messages";
  $("tab-messages").classList.toggle("active",activeTab==="messages");
  $("tab-progress").classList.toggle("active",activeTab==="progress");
  $("conversation-pane").classList.toggle("hidden",activeTab!=="messages");
  $("project-progress-pane").classList.toggle("hidden",activeTab!=="progress");
  if(activeTab==="progress")renderProgressView(activeView);
}
function renderProgressView(id) {
  if(!safeProject(id)||activeView!==id)return;
  const p=publicStatus?.projects[id];
  const wrapper=document.createDocumentFragment();
  const tasks=p?.tasks||[];
  if(!tasks.length)wrapper.append(el("p","placeholder","Aucun journal de progression reçu. Les agents ne sont peut-être pas encore synchronisés."));
  for(const task of tasks) {
    const section=el("section","progress-card");
    section.style.marginBottom="15px";
    section.style.cursor="default";
    section.append(el("strong","task-name",task.title),detailElement(id,task));
    wrapper.append(section);
  }
  $("project-progress-content").replaceChildren(wrapper);
}
function b64urlToBytes(text) {
  if (typeof text!=="string"||!/^[A-Za-z0-9_-]+$/.test(text)) throw Error("Encodage de l'archive invalide.");
  const s=text.replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(s+"=".repeat((4-s.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
async function decryptArchive(keyText) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(keyText)) throw Error("La clé doit contenir exactement 43 caractères.");
  const response=await fetch("./latest.enc.json",{cache:"no-store",credentials:"omit"});
  if(!response.ok)throw Error("Archive non disponible (HTTP "+response.status+").");
  const envelope=await response.json();
  if(!envelope||envelope.v!==1||envelope.alg!=="AES-256-GCM"||
    envelope.compression!=="gzip"||typeof envelope.nonce!=="string"||
    typeof envelope.ciphertext!=="string"||envelope.ciphertext.length>15_000_000) {
    throw Error("Aucune sauvegarde chiffrée n'est encore disponible sur GitHub.");
  }
  const nonce=b64urlToBytes(envelope.nonce);
  const key=b64urlToBytes(keyText);
  if(nonce.length!==12||key.length!==32)throw Error("Clé ou archive incorrecte.");
  const cryptoKey=await crypto.subtle.importKey("raw",key,{name:"AES-GCM"},false,["decrypt"]);
  let compressed;
  try {
    compressed=await crypto.subtle.decrypt({name:"AES-GCM",iv:nonce,
      additionalData:AAD,tagLength:128},cryptoKey,b64urlToBytes(envelope.ciphertext));
  } catch(_) {
    throw Error("Clé incorrecte ou archive altérée.");
  }
  if(typeof DecompressionStream!=="function")throw Error("Utilise une version récente de Firefox ou Chrome.");
  const decompressed=await new Response(new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  if(decompressed.byteLength>7*1024*1024)throw Error("Archive trop volumineuse.");
  const data=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(decompressed));
  if(!data||data.v!==1||data.read_only!==true||!Array.isArray(data.projects)||
    data.projects.length!==2||data.projects[0].id!=="hd"||data.projects[1].id!=="pc"||
    !data.projects.every(p=>Array.isArray(p.events)&&p.events.length<=1200)) {
    throw Error("Format d'archive invalide.");
  }
  return data;
}
function renderConversation() {
  const p=archive?.projects.find(p=>p.id===activeView);
  $("locked-panel").classList.add("hidden");
  $("conversation-stream").classList.remove("hidden");
  $("conversation-meta").textContent=archive ?
    "Conversation publique · sauvegarde "+formatDate(archive.generated_at):
    "Conversation publique · en attente de synchronisation";
  if(!archive||!p){
    $("conversation-stream").replaceChildren(el("p","placeholder",
      "La conversation publique sera visible après la première publication autorisée depuis Windows."));
    return;
  }
  const needle=$("conversation-search").value.trim().toLocaleLowerCase("fr-FR");
  const events=p.events.filter(x=>x&&ROLES.has(x.role)&&typeof x.message==="string"
    &&typeof x.job==="string"&&(x.message.toLocaleLowerCase("fr-FR").includes(needle)||
      x.job.toLocaleLowerCase("fr-FR").includes(needle))).slice(-1200);
  const frag=document.createDocumentFragment();
  if(!events.length)frag.append(el("p","placeholder",p.configured?
    "Aucun message correspondant dans la dernière sauvegarde.":
    "Ce projet n'a pas encore de journal local sauvegardé."));
  for(const e of events) {
    const article=el("article","message role-"+e.role);
    const avatar=el("div","avatar",e.role==="qwen"?"Q":e.role==="chatgpt"?"GPT":"IA");
    const body=el("div","message-main");
    const meta=el("div","meta");
    meta.append(el("time","",formatDate(e.time)),el("span","",e.job),el("span","",e.kind||""));
    body.append(el("strong","sender",labelRole(e.role)),meta,el("div","bubble",e.message));
    article.append(avatar,body);frag.append(article);
  }
  $("conversation-stream").replaceChildren(frag);
}
async function unlock() {
  if(unlocking)return;
  unlocking=true;
  $("unlock-btn").disabled=true;
  $("unlock-status").textContent="Déchiffrement dans ton navigateur…";
  try {
    archive=await decryptArchive($("archive-key").value.trim());
    $("archive-key").value="";
    $("unlock-status").classList.remove("error");
    renderConversation();
    // Update the HOME overview with authentic last messages only after local unlock.
    renderUnlockedHome();
  } catch(error) {
    $("unlock-status").classList.add("error");
    $("unlock-status").textContent=error instanceof Error?error.message:"Impossible de déchiffrer.";
  } finally {
    unlocking=false;$("unlock-btn").disabled=false;
  }
}
function renderUnlockedHome() {
  if(!archive)return;
  const rows=[];
  for(const p of archive.projects)for(const e of p.events) {
    if(e&&typeof e.message==="string"&&ROLES.has(e.role))
      rows.push({...e,id:p.id});
  }
  rows.sort((a,b)=>(Date.parse(b.time)||0)-(Date.parse(a.time)||0));
  const feed=document.createDocumentFragment();
  for(const item of rows.slice(0,12)) {
    const row=el("article","activity-row");
    const body=el("div","activity-copy");
    body.append(el("strong","",PROJECTS[item.id].title+" · "+labelRole(item.role)),
      el("p","",item.message.slice(0,500)),el("div","activity-meta","Extrait public de la conversation"));
    row.append(el("div","activity-avatar "+item.id,item.id.toUpperCase()),
      body,el("time","activity-time",shortDate(item.time)));
    feed.append(row);
  }
  if(rows.length)$("recent-feed").replaceChildren(feed);
}
function openPrompt() {
  if(!safeProject(activeView)) {
    navigate("hd");
    $("prompt-feedback").textContent="Choisis ton projet et écris ton prompt.";
    return;
  }
  const value=$("prompt-text").value.trim();
  if(value.length<3||value.length>700) {
    $("prompt-feedback").textContent="Écris une consigne de 3 à 700 caractères.";
    return;
  }
  const repo=PROJECTS[activeView].repo;
  const title="[PROMPT WEB] "+(activeView==="hd"?"HD":"PC Edition");
  const body="Projet: "+activeView+"\nPrompt:\n"+value+"\n\nEnvoyé depuis Burnout 3 LAB. Confirmer l'issue sur GitHub ; les agents locaux la traiteront après synchronisation et validation.";
  const url="https://github.com/"+repo+"/issues/new?title="+
    encodeURIComponent(title)+"&body="+encodeURIComponent(body);
  $("prompt-feedback").textContent="GitHub s'ouvre : connecte-toi, puis clique sur « Submit new issue ». Aucun prompt n'a encore été soumis.";
  // Exact GitHub session, permissions and CSRF are enforced by GitHub.
  // This site NEVER claims success, handles a password or stores a GitHub token.
  window.open(url,"_blank","noopener,noreferrer");
}
function viewFromHash() {
  const view=window.location.hash.slice(1).toLowerCase();
  return safeProject(view)?view:"home";
}
for(const link of document.querySelectorAll(".nav-link")) {
  link.addEventListener("click",()=>{
    const view=link.dataset.view||"home";window.location.hash=view==="home"?"accueil":view;
    navigate(view);
  });
}
window.addEventListener("hashchange",()=>navigate(viewFromHash()));
$("back-home").addEventListener("click",()=>{window.location.hash="accueil";navigate("home")});
$("menu-toggle").addEventListener("click",()=>{
  const open=$("sidebar").classList.toggle("open");
  $("menu-toggle").setAttribute("aria-expanded",String(open));
});
$("tab-messages").addEventListener("click",()=>changeTab("messages"));
$("tab-progress").addEventListener("click",()=>changeTab("progress"));
$("close-drawer").addEventListener("click",closeTaskDrawer);
$("overlay-scrim").addEventListener("click",closeTaskDrawer);
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeTaskDrawer()});
$("unlock-btn").addEventListener("click",unlock);
$("archive-key").addEventListener("keydown",e=>{if(e.key==="Enter")unlock()});
$("conversation-search").addEventListener("input",renderConversation);
$("prompt-submit").addEventListener("click",openPrompt);
$("connect-btn").addEventListener("click",()=>window.open("https://github.com/login","_blank","noopener,noreferrer"));
// Reading publicly published messages never requires GitHub authentication.
async function loadPublicArchive(){
  try{
    const response=await fetch("./public-conversations.json",{cache:"no-store",credentials:"omit"});
    if(!response.ok)throw Error("missing");
    const doc=await response.json();
    if(!doc||doc.v!==1||doc.read_only!==true||!Array.isArray(doc.projects)||
       doc.projects.length!==2||doc.projects[0]?.id!=="hd"||doc.projects[1]?.id!=="pc")throw Error("invalid");
    archive=doc;
    renderConversation();
    renderUnlockedHome();
  }catch(_){archive=null;renderConversation();}
}
const privacyNotice=document.querySelector(".privacy-note");
if(privacyNotice)privacyNotice.textContent="Lecture libre : les conversations publiées sont accessibles sans compte ni clé. Seul l'envoi d'un prompt nécessite une connexion GitHub. Ne jamais inclure de secrets dans les messages publics.";
navigate(viewFromHash());
loadPublicStatus();
loadPublicArchive();
setInterval(loadPublicArchive,120_000);
setInterval(loadPublicStatus,60_000);
