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
const HD_FUTURE_TASKS=[
  "priorité aux PNG carrés","priorité aux PNG horizontaux","priorité aux PNG verticaux",
  "priorité aux PNG compacts","priorité aux PNG de taille moyenne",
  "priorité aux PNG haute résolution","priorité aux formats rectangulaires compacts",
  "traitement des PNG éligibles restants"
];
const PC_FUTURE_TASKS=[
  "écarts techniques PAL et NTSC-U","feuille de route du portage Windows",
  "protocole de tests statiques","risques des ressources PAL",
  "prérequis du pipeline Windows","matrice de validation graphique et audio"
];
function knownTaskTitle(id, rawTitle) {
  const hd=/^hd-texture-run-(\d{4})$/.exec(id||"");
  const pc=/^pc-research-run-(\d{4})$/.exec(id||"");
  if(hd&&Number(hd[1])>0){
    const prefix="Lot HD "+hd[1]+" — ";
    const suffix=rawTitle?.startsWith(prefix)?rawTitle.slice(prefix.length):"";
    return prefix+(HD_FUTURE_TASKS.includes(suffix)?suffix:HD_FUTURE_TASKS[(Number(hd[1])-1)%HD_FUTURE_TASKS.length]);
  }
  if(pc&&Number(pc[1])>0){
    const prefix="Étude PC "+pc[1]+" — ";
    const suffix=rawTitle?.startsWith(prefix)?rawTitle.slice(prefix.length):"";
    return prefix+(PC_FUTURE_TASKS.includes(suffix)?suffix:PC_FUTURE_TASKS[(Number(pc[1])-1)%PC_FUTURE_TASKS.length]);
  }
  return rawTitle;
}
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
          title:knownTaskTitle(t.id,t.title.slice(0,150)),
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
  const timeline=Array.isArray(input.timeline)?input.timeline.filter(e=>e &&
    typeof e==="object" && typeof e.time==="string" &&
    typeof e.summary==="string" && typeof e.kind==="string" && ROLES.has(e.role))
    .slice(-12).map(e=>({
      time:e.time.slice(0,60),summary:e.summary.slice(0,300),
      kind:e.kind.slice(0,60),role:e.role
    })):[];
  return {
    done:array(input.done),
    current:typeof input.current==="string"?input.current.slice(0,300):"",
    remaining:array(input.remaining),
    timeline
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
  const planned=tasks.find(t=>t!==selected && t.status==="queued");
  return planned?.title||selected.next||"";
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
function taskObjective(projectId,task){
  if(!task)return "Aucun objectif de travail reçu.";
  const title=task.title||"";
  if(projectId==="hd"){
    const focus=/^Lot HD [0-9]{4} — (.+)$/.exec(title)?.[1]||"textures PNG éligibles";
    return "Traiter jusqu’à "+task.total+" textures PNG éligibles dans les dumps PCSX2 PAL SLES-52585. "+
      "Critère de priorité : "+focus+" (IHDR : "+technicalFilter(title)+"). Qwen aide à choisir parmi les fichiers réellement détectés, "+
      "Real-ESRGAN les agrandit en ×2, puis l’agent installe uniquement de nouveaux remplacements. "+
      "Aucun dump ni remplacement existant ne doit être écrasé.";
  }
  const subject=/^Étude PC [0-9]{4} — (.+)$/.exec(title)?.[1]||"compatibilité PAL";
  return "Préparer et valider avec Qwen un plan documenté sur « "+subject+
    " » pour l'édition PAL SLES-52585. Comparer les informations techniques disponibles "+
    "Le résultat attendu est un JSON structuré en résumé, étapes, risques et données manquantes. Aucune compilation ni exécution de code généré n’est présumée.";
}
function taskMilestones(projectId,task){
  if(!task)return [];
  const kinds=new Set((task.actions.timeline||[]).map(e=>e.kind));
  if(projectId==="pc")return [
    ["Consigne enregistrée",kinds.has("job_observed")||task.status==="completed"],
    ["Analyse demandée à Qwen",kinds.has("model_request")||task.status==="completed"],
    ["Réponse structurée reçue",kinds.has("model_response")||task.status==="completed"],
    ["Plan validé et sauvegardé",kinds.has("validation_passed")||task.status==="completed"]
  ];
  return [
    ["Consigne du lot enregistrée",kinds.has("job_observed")||task.done>0],
    ["Une réponse de Qwen a été enregistrée (sélection à vérifier)",kinds.has("model_response")],
    ["Au moins une texture a été traitée",kinds.has("texture_applied")||task.done>0],
    ["Toutes les textures du lot ont été traitées",task.status==="completed"]
  ];
}
function durationLabel(m){
  const n=Math.max(1,Math.round(m));
  return n<60?n+" min":Math.floor(n/60)+" h"+(n%60?" "+n%60+" min":"");
}
function workCycles(id,t){
  return id==="hd"?Math.max(0,(t.total||0)-(t.done||0)):1;
}
function measuredTextureInterval(t){
  const times=(t.actions.timeline||[]).filter(e=>e.kind==="texture_applied")
    .map(e=>Date.parse(e.time)).filter(Number.isFinite).sort((a,b)=>a-b);
  if(times.length<2)return null;
  const gaps=[];
  for(let i=1;i<times.length;i++){
    const min=(times[i]-times[i-1])/60000;
    if(min>=0.5&&min<=120)gaps.push(min);
  }
  if(!gaps.length)return null;
  gaps.sort((a,b)=>a-b);
  return {minutes:gaps[Math.floor(gaps.length/2)],samples:times.length};
}
function taskETA(id,t,p){
  if(!t)return ["Indisponible","Aucun statut reçu."];
  if(t.status==="completed")return ["Terminée","Validation enregistrée."];
  if(t.status==="blocked")return ["Non estimable","Tâche bloquée."];
  const old=Date.now()-Date.parse(publicStatus?.generated_at||"")>2100000?" Données anciennes.":"";
  if(t.status==="queued"){
    const ordered=(p?.tasks||[]).filter(x=>["active","selected","queued"].includes(x.status));
    const steps=ordered.slice(0,Math.max(0,ordered.indexOf(t))).reduce((n,x)=>n+workCycles(id,x),0);
    return ["Début théorique ≈ "+durationLabel(Math.max(1,steps)*15),
      steps+" cycles supposés de 15 min avant cette tâche. Simulation de file, pas une échéance."+old];
  }
  if(id==="pc")return ["Planification : 1 à 2 passages (15 à 30 min)",
    "Hypothèse nominale : une tentative Qwen par passage programmé de 15 min. "+
    "La génération, la validation et les reprises peuvent dépasser cette projection."+old];
  const rate=measuredTextureInterval(t);
  if(rate){
    const minutes=Math.max(15,rate.minutes)*workCycles(id,t);
    return ["Reste ≈ "+durationLabel(minutes),
      "Fourchette indicative : "+durationLabel(minutes*0.8)+" à "+
      durationLabel(minutes*1.6)+". Estimé avec "+rate.samples+
      " copies réelles. Le rythme peut changer selon fichiers, GPU, veille."+old];
  }
  return ["Hypothèse ≈ "+durationLabel(workCycles(id,t)*15),
    "Estimation nominale : un traitement par passage de 15 min. Pas de mesure du débit réel."+old];
}

function technicalFilter(title){
  const s=(title||"").toLowerCase();
  if(s.includes("carrés"))return "largeur = hauteur";
  if(s.includes("horizontaux"))return "largeur > hauteur";
  if(s.includes("verticaux"))return "hauteur > largeur";
  if(s.includes("rectangulaires"))return "largeur ≠ hauteur et petit côté ≤ 128 px";
  if(s.includes("compacts"))return "dimension maximale ≤ 128 px";
  if(s.includes("taille moyenne"))return "128 < dimension maximale ≤ 256 px";
  if(s.includes("haute résolution"))return "dimension maximale > 256 px";
  if(s.includes("rectangulaires"))return "largeur ≠ hauteur, petit côté ≤ 128 px";
  return "fichiers PNG non encore remplacés";
}
function technicalProcess(id,t){
  if(id==="hd")return [
    "Inventaire PCSX2 SLES-52585 : lecture IHDR, dimensions PNG, filtre anti-symlink et fichiers déjà traités.",
    "Sélection des candidats : "+(t.title||"lot").split(" — ").slice(1).join(" — ")+
      " ; Qwen via Ollama retourne uniquement des indices JSON.",
    "Upscale NCNN/Vulkan : Real-ESRGAN x4plus en ×2, sans toucher aux dumps originaux.",
    "Contrôle de sortie : vérifier largeur/hauteur ×2 avant copie exclusive vers replacements.",
    "Progression : confirmer chaque PNG installé ; prévoir inspection visuelle dans PCSX2."
  ];
  return [
    "Lecture contrôlée des références PAL SLES-52585 et NTSC-U SLUS-21050.",
    "Construction d'une requête qwen2.5-coder:7b locale via Ollama, sortie JSON structurée.",
    "Analyse de "+(t.title||"l'étude")+" : hypothèses, dépendances et critères vérifiables.",
    "Vérification des champs summary, steps, risks, missing_data et next_focus borné.",
    "Sauvegarde locale du plan de recherche. Aucune compilation ni exécution du jeu affirmée."
  ];
}
function taskWorkDetails(projectId,task){
  const box=el("div","task-work-details");
  if(!task){
    box.append(el("p","placeholder","Aucune tâche vérifiée pour le moment."));
    return box;
  }
  const objective=el("div","work-objective");
  objective.append(el("span","work-heading","OBJECTIF TECHNIQUE PRÉCIS"),
    el("p","work-id","Identifiant : "+task.id),
    el("p","",taskObjective(projectId,task)));
  box.append(objective);
  const forecast=taskETA(projectId,task,publicStatus?.projects[projectId]);
  const eta=el("div","task-eta");
  eta.append(el("span","work-heading","ESTIMATION DU TEMPS RESTANT"),
    el("strong","task-eta-value",forecast[0]),el("p","task-eta-note",forecast[1]));
  box.append(eta);
  const tech=el("div","work-technical");
  tech.append(el("span","work-heading","PROCESSUS TECHNIQUE DÉTAILLÉ"));
  const technicalList=el("ol","technical-steps");
  for(const line of technicalProcess(projectId,task))technicalList.append(el("li","",line));
  tech.append(technicalList);box.append(tech);
  const summary=el("div","work-summary");
  summary.append(el("span","work-heading","DERNIÈRE ACTION ENREGISTRÉE"));
  const recent=task.actions.timeline.at(-1);
  summary.append(el("p","work-current",recent?.summary||
    (task.actions.current||"Aucune action détaillée enregistrée.")));
  summary.append(el("p","work-timestamp",recent?
    formatDate(recent.time)+" · "+labelRole(recent.role):
    "Aucun événement horodaté pour cette tâche"));
  box.append(summary);
  const phases=el("div","work-phases");
  phases.append(el("span","work-heading","ÉTAPES DE L’AGENT"));
  const steps=el("ul","work-step-list");
  for(const [title,done] of taskMilestones(projectId,task)){
    const item=el("li",done?"work-step-done":"work-step-pending");
    item.append(el("span","step-mark",done?"✓":"○"),el("span","",title));
    steps.append(item);
  }
  phases.append(steps);box.append(phases);
  const accomplished=el("div","work-accomplished");
  accomplished.append(el("span","work-heading","DÉJÀ EFFECTUÉ"));
  const accomplishedList=el("ul","work-action-list");
  for(const entry of (task.actions.done||[]).slice(0,6))
    accomplishedList.append(el("li","",entry));
  if(!accomplishedList.children.length)
    accomplishedList.append(el("li","work-muted","Aucun traitement confirmé."));
  accomplished.append(accomplishedList);box.append(accomplished);
  const remaining=el("div","work-remaining");
  remaining.append(el("span","work-heading","RESTANT À FAIRE"));
  const remainingList=el("ul","work-action-list");
  for(const entry of (task.actions.remaining||[]).slice(0,6))
    remainingList.append(el("li","",entry));
  if(!remainingList.children.length)
    remainingList.append(el("li","work-muted","Étapes restantes non précisées."));
  remaining.append(remainingList);box.append(remaining);
  const timeline=el("div","work-activity");
  timeline.append(el("span","work-heading","JOURNAL HORODATÉ DE CETTE TÂCHE"));
  const events=task.actions.timeline||[];
  if(!events.length)timeline.append(el("p","work-muted","Aucune action horodatée reçue."));
  else {
    const list=el("ol","work-event-list");
    for(const entry of events.slice(-8).reverse()){
      const item=el("li","");
      item.append(el("time","",shortDate(entry.time)),
        el("span","",entry.summary));
      list.append(item);
    }
    timeline.append(list);
  }
  box.append(timeline);
  return box;
}
// Show concise excerpts ONLY from conversations already approved for public reading.
function publicPreviewMessage(projectId,event){
  if(!event||typeof event.message!=="string")return "";
  if(event.kind==="model_response" && event.role==="qwen"){
    let data;
    try{data=JSON.parse(event.message);}catch(_){return "Qwen a répondu (détails non structurés).";}
    if(!data||typeof data!=="object")return "Réponse Qwen enregistrée.";
    if(projectId==="hd"){
      const count=Array.isArray(data.indices)?data.indices.filter(Number.isInteger).length:0;
      const focus=Number.isInteger(data.next_focus)&&data.next_focus>=1&&data.next_focus<=8?
        " · prochaine priorité suggérée : "+data.next_focus:"";
      return count?"Qwen propose "+count+" indice"+(count>1?"s":"")+" de texture"+(count>1?"s":"")+focus:
        "Qwen a répondu ; sélection non détaillée.";
    }
    if(typeof data.summary==="string")return "Synthèse Qwen : "+data.summary.slice(0,310);
    return "Qwen a transmis un plan JSON.";
  }
  const allowed=new Set(["texture_started","texture_validated","texture_applied",
    "texture_failed","selection_fallback","validation_passed","validation_failed",
    "model_error","plan_saved","plan_validating","context_loaded"]);
  if(event.role==="agent"&&allowed.has(event.kind))return event.message.slice(0,260);
  return "";
}
function taskPublicPreview(projectId,task){
  const project=archive?.projects?.find(p=>p.id===projectId);
  const valid=project?.configured && Array.isArray(project.events);
  if(!task||!valid)return {items:[],otherJob:"",time:archive?.generated_at||null};
  const events=project.events.filter(e=>e&&typeof e.job==="string"&&
    typeof e.time==="string"&&ROLES.has(e.role)&&typeof e.kind==="string");
  let selected=events.filter(e=>e.job===task.id);
  let otherJob="";
  if(!selected.length && !(task.actions?.timeline||[]).length){
    const last=events.slice().reverse().find(e=>publicPreviewMessage(projectId,e));
    if(last){
      selected=events.filter(e=>e.job===last.job);
      otherJob=last.job;
    }
  }
  const items=selected.map(e=>({time:e.time,role:e.role,
    message:publicPreviewMessage(projectId,e)})).filter(e=>e.message).slice(-5);
  return {items,otherJob,time:archive.generated_at};
}
function createActivityPreview(projectId,task){
  const data=taskPublicPreview(projectId,task);
  const area=el("section","live-preview");
  const header=el("div","live-preview-head");
  header.append(el("span","work-heading","APERÇU DU TRAVAIL DES IA"),
    el("span","live-preview-mode","RELEVÉ PUBLIC · NON INSTANTANÉ"));
  area.append(header);
  const description=el("p","live-preview-description",
    data.otherJob?"Aucun message publié pour la tâche prioritaire. Dernière activité du projet : "+data.otherJob:
    "Dernières opérations associées à la tâche prioritaire.");
  area.append(description);
  const stream=el("div","live-preview-console");
  stream.setAttribute("aria-label","Dernières actions publiées par les agents");
  if(data.items.length){
    for(const event of data.items.slice().reverse()){ 
      const line=el("div","live-preview-line");
      line.append(el("time","live-preview-time",shortDate(event.time)),
        el("span","live-preview-role",event.role==="qwen"?"QWEN":"AGENT"),
        el("span","live-preview-message",event.message));
      stream.append(line);
    }
  }else if(task?.actions?.timeline?.length){
    for(const event of task.actions.timeline.slice(-4).reverse()){ 
      const line=el("div","live-preview-line");
      line.append(el("time","live-preview-time",shortDate(event.time)),
        el("span","live-preview-role",event.role==="qwen"?"QWEN":"AGENT"),
        el("span","live-preview-message",event.summary));
      stream.append(line);
    }
  }else stream.append(el("p","live-preview-empty",
    "Aucun événement publié pour cette tâche. L'agent peut être en attente de son prochain passage."));
  area.append(stream);
  const foot=el("div","live-preview-footer");
  foot.append(el("span","",data.time?"Conversations synchronisées : "+formatDate(data.time):
    "Aucune conversation publique synchronisée"));
  const refresh=el("button","live-preview-refresh","↻ Actualiser");
  refresh.type="button";
  refresh.addEventListener("click",()=>{loadPublicStatus();loadPublicArchive();});
  foot.append(refresh);
  area.append(foot);
  return area;
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

  // Preserve expanded upcoming-task details during automatic refresh.
  const expanded=new Set([...$("progress-grid").querySelectorAll("details.future-task[open]")]
    .map(e=>e.dataset.taskId));
  const cards=document.createDocumentFragment();
  for(const id of ["hd","pc"]) {
    const project=status?.projects[id];
    const task=currentTask(project);
    const pending=(project?.tasks||[]).filter(t=>t!==task && t.status==="queued");
    const next=pending[0]||null;
    const progress=progressValue(task);
    const card=el("section","progress-card "+id);
    card.setAttribute("aria-label","Suivi du projet "+PROJECTS[id].title);
    const top=el("div","progress-card-top");
    const identity=el("div","card-project");
    identity.append(el("span","",id.toUpperCase()),el("strong","",PROJECTS[id].title));
    top.append(identity,el("span","task-state",task?statusName(task.status):"En attente"));
    card.append(top,el("div","work-heading","TÂCHE PRIORITAIRE"),
      el("h2","task-name",task?task.title:"Aucune tâche reçue depuis Windows"));
    const caption=el("div","progress-caption");
    caption.append(el("span","",progress===null?"Progression non mesurée":"Avancement de la tâche"),
      el("strong","",progress===null?"—":task.done+" / "+task.total+" · "+progress+" %"));
    const track=el("div","progress-track");
    const fill=el("div","progress-fill");
    fill.style.width=progress===null?"0%":progress+"%";
    track.append(fill);
    card.append(caption,track);
    card.append(createActivityPreview(id,task));
    if(task && task.status!=="active")card.append(el("p","agent-activity-hint","Tâche assignée, exécution IA non confirmée au dernier relevé."));


    card.append(taskWorkDetails(id,task));
    const upcoming=el("div","next-task-block");
    upcoming.append(el("span","work-heading","PROCHAINE TÂCHE"),
      el("strong","next-task-title",next?.title||"Aucune prochaine tâche confirmée"),
      el("div","queue-count",pending.length>=5 ? pending.length+" prochaines tâches planifiées" : pending.length+" / 5 tâches futures planifiées · réserve à compléter"));
    const list=el("ol","upcoming-list");
    for(const item of pending.slice(0,8)){
      const li=el("li","");
      const details=el("details","future-task");
      details.dataset.taskId=id+":"+item.id;
      details.open=expanded.has(details.dataset.taskId);
      details.append(el("summary","",item.title));
      const timing=taskETA(id,item,project);
      details.append(el("p","future-estimate",timing[0]+" — "+timing[1]));
      const steps=el("ol","technical-steps");
      for(const stage of technicalProcess(id,item))steps.append(el("li","",stage));
      details.append(steps);
      li.append(details);
      list.append(li);
    }
    if(pending.length===0)list.append(el("li","queue-empty","Aucune prochaine tâche encore synchronisée"));
    upcoming.append(list);
    const controls=el("div","work-controls");
    const detailButton=el("button","work-open-details","Détails et prochaines actions →");
    detailButton.type="button";
    detailButton.addEventListener("click",()=>openTaskDrawer(id,task));
    const messagesButton=el("button","work-open-messages","Voir les échanges IA de cette tâche ↗");
    messagesButton.type="button";
    messagesButton.addEventListener("click",()=>{
      navigate(id);
      $("conversation-search").value=task?.id||"";
      renderConversation();
    });
    controls.append(detailButton,messagesButton);
    card.append(upcoming,controls);
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
  container.append(taskWorkDetails(projectId,task));
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
    renderHome();
  }catch(error){
    // Preserve the last valid approved snapshot during transient network errors.
    renderConversation();renderHome();
    console.warn("Burnout3 LAB: public conversations unavailable",error?.message||"unknown");
  }
}
navigate(viewFromHash());
loadPublicStatus();
loadPublicArchive();
// Poll public static JSON; the Windows publishing schedule, not polling,
// determines when new messages actually become available.
setInterval(()=>{if(!document.hidden){loadPublicStatus();loadPublicArchive();}},30_000);
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden){loadPublicStatus();loadPublicArchive();}
});
