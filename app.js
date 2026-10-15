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
let publicStatus = null;
let archive = null;
let visibleMessageCount = 250;
let activeView = "home";
let activeTab = "messages";
let selectedTask = null;

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
          status:["completed","active","selected","queued","blocked","unknown"].includes(t.status)
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
    tasks.find(t=>t.status==="selected") ||
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
  return {completed:"Terminé",active:"IA active récemment",selected:"Tâche prioritaire",
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
  if (safeProject(activeView)) renderProgressView(activeView);
}
function renderHome() {
  const status=publicStatus;
  const fresh=Boolean(status)&&!isStale(status.generated_at);
  $("snapshot-label").textContent=status
    ? "Dernière synchronisation : "+formatDate(status.generated_at)+(fresh?"":" · données anciennes")
    : "Dernière synchronisation : en attente";
  $("sidebar-status").textContent=status ?
    (fresh?"Dernière copie disponible":"Dernier état possiblement ancien"):
    "En attente des premières données";
  $("sync-dot").className="dot"+(status?(fresh?" ready":" stale"):"");
  $("sync-dot-home").className="dot"+(status?(fresh?" ready":" stale"):"");

  const cards=document.createDocumentFragment();
  for(const id of ["hd","pc"]) {
    const project=status?.projects[id];
    const task=currentTask(project);
    const pending=(project?.tasks||[]).filter(t=>t!==task && t.status==="queued");
    const next=pending[0]||null;
    const progress=progressValue(task);
    const card=el("button","progress-card "+id);
    card.type="button";
    card.setAttribute("aria-label","Détails des tâches de "+PROJECTS[id].title);
    const top=el("div","progress-card-top");
    const identity=el("div","card-project");
    identity.append(el("span","",id.toUpperCase()),el("strong","",PROJECTS[id].title));
    top.append(identity,el("span","task-state",task?statusName(task.status):"En attente"));
    card.append(top,el("div","work-heading","TÂCHE PRIORITAIRE"),
      el("h2","task-name",task?task.title:"Aucune tâche reçue depuis Windows"));
    const caption=el("div","progress-caption");
    caption.append(el("span","",progress===null?"Progression non mesurée":"Avancement de la tâche"),
      el("strong","",progress===null?"—":progress+" %"));
    const track=el("div","progress-track");
    const fill=el("div","progress-fill");
    fill.style.width=progress===null?"0%":progress+"%";
    track.append(fill);
    card.append(caption,track);
    if(task && task.status!=="active")card.append(el("p","agent-activity-hint","Tâche assignée, exécution IA non confirmée au dernier relevé."));


    const upcoming=el("div","next-task-block");
    upcoming.append(el("span","work-heading","PROCHAINE TÂCHE"),
      el("strong","next-task-title",next?.title||"Aucune prochaine tâche confirmée"),
      el("div","queue-count",pending.length>=5 ? pending.length+" prochaines tâches planifiées" : pending.length+" / 5 tâches futures planifiées · réserve à compléter"));
    const list=el("ol","upcoming-list");
    for(const item of pending.slice(0,8))list.append(el("li","",item.title));
    if(pending.length===0)list.append(el("li","queue-empty","Aucune prochaine tâche encore synchronisée"));
    upcoming.append(list);
    card.append(upcoming,el("div","progress-foot","Voir les actions effectuées et les étapes restantes →"));
    card.addEventListener("click",()=>openTaskDrawer(id,task));
    cards.append(card);
  }
  $("progress-grid").replaceChildren(cards);
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
    visibleMessageCount=250;
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
function renderConversation() {
  const p=archive?.projects.find(p=>p.id===activeView);
  $("locked-panel").classList.add("hidden");
  $("conversation-stream").classList.remove("hidden");
  $("conversation-meta").textContent=!archive ?
    "Archive publique indisponible · vérifier la synchronisation GitHub Pages":
    !p ? "Projet introuvable dans les messages publiés":
    !p.configured ? "Journal local non transmis pour ce projet · vérifier son agent Windows":
    "Lecture libre · "+p.events.length+" messages publiés · sauvegarde "+formatDate(archive.generated_at);
  if(!archive||!p){
    $("conversation-stream").replaceChildren(el("p","placeholder",
      "La conversation publique sera visible après la première publication autorisée depuis Windows."));
    return;
  }
  const needle=$("conversation-search").value.trim().toLocaleLowerCase("fr-FR");
  const matches=p.events.filter(x=>x&&ROLES.has(x.role)&&typeof x.message==="string"
    &&typeof x.job==="string"&&(x.message.toLocaleLowerCase("fr-FR").includes(needle)||
      x.job.toLocaleLowerCase("fr-FR").includes(needle)));
  const events=matches.slice(-visibleMessageCount);
  const frag=document.createDocumentFragment();
  if(!events.length)frag.append(el("p","placeholder",p.configured?
    "Aucun message correspondant dans la dernière sauvegarde.":
    "Aucun journal de conversation n'a encore été transmis pour ce projet. Vérifier que son agent Windows est installé et qu'il a réellement exécuté des tâches."));
  if(matches.length>visibleMessageCount){
    const more=el("button","older-messages",
      "Afficher les "+Math.min(250,matches.length-visibleMessageCount)+" messages précédents ("+
      (matches.length-visibleMessageCount)+" plus anciens)");
    more.type="button";
    more.addEventListener("click",()=>{visibleMessageCount+=250;renderConversation();});
    frag.append(more);
  }
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
  }catch(error){
    archive=null;renderConversation();
    console.warn("Burnout3 LAB: public conversations unavailable",error?.message||"unknown");
  }
}
navigate(viewFromHash());
loadPublicStatus();
loadPublicArchive();
setInterval(loadPublicArchive,120_000);
setInterval(loadPublicStatus,60_000);
