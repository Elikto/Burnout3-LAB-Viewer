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
let liveSource = null;
let liveState = "off";
const liveFeed = {hd:[],pc:[]};


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
          actions:normalizeActions(t.actions),
          subtask:normalizeSubtask(t.subtask)
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
function normalizeSubtask(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const done=Number.isInteger(raw.done)&&raw.done>=0?raw.done:null;
  const total=Number.isInteger(raw.total)&&raw.total>0?raw.total:null;
  const label=typeof raw.label==="string"?raw.label.slice(0,100):"Sous-tâche";
  return {label,done,total};
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
function observedRate(projectId, project) {
  if(projectId!=="hd") return null;
  const rates=(project?.tasks||[]).map(measuredTextureInterval)
    .filter(Boolean).map(r=>r.minutes).filter(n=>Number.isFinite(n)&&n>0);
  if(!rates.length) return null;
  rates.sort((a,b)=>a-b);
  return rates[Math.floor(rates.length/2)];
}
function taskMinutes(projectId, t, project) {
  if(!t || t.status==="completed") return 0;
  const rate=observedRate(projectId,project);
  if(rate===null || t.total===null || t.done===null) return null;
  return rate*Math.max(0,t.total-t.done);
}
function taskETA(id,t,p){
  if(!t) return ["Indisponible",""];
  if(t.status==="completed") return ["Terminée",""];
  if(t.status==="blocked") return ["Bloquée",""];
  const estimate=taskMinutes(id,t,p);
  if(estimate===null) return ["Non estimable","Mesures insuffisantes"];
  if(t.status==="queued"){
    const before=(p?.tasks||[]).filter(x=>x!==t && ["active","selected","queued"].includes(x.status));
    const target=(p?.tasks||[]).indexOf(t);
    const predecessors=before.filter(x=>(p?.tasks||[]).indexOf(x)<target);
    const durations=predecessors.map(x=>taskMinutes(id,x,p));
    if(durations.some(x=>x===null)) return ["Durée ≈ "+durationLabel(estimate),"Début indéterminé"];
    return ["Durée ≈ "+durationLabel(estimate),"Début ≈ "+durationLabel(durations.reduce((a,b)=>a+b,0))];
  }
  return ["Reste ≈ "+durationLabel(estimate),"Estimation basée sur traitements mesurés"];
}
function confirmedEvents(task){
  const confirmed=new Set(["texture_started","texture_validated","texture_applied","texture_failed",
    "validation_passed","validation_failed","plan_saved","model_error","selection_fallback",
    "context_loaded","plan_validating"]);
  return (task?.actions?.timeline||[]).filter(e=>confirmed.has(e.kind));
}
function eventSummary(e){
  const labels={
    texture_started:"PNG : traitement démarré",texture_validated:"PNG vérifié",
    texture_applied:"PNG HD installé",texture_failed:"Échec du PNG",
    validation_passed:"Validation réussie",validation_failed:"Échec de validation",
    plan_saved:"Plan sauvegardé",model_error:"Erreur du modèle",
    selection_fallback:"Sélection automatique",context_loaded:"Contexte chargé",
    plan_validating:"Validation en cours"
  };
  const summary=(e?.summary||"").trim();
  if(summary && !/^(?:un traitement de texture a été enregistré|qwen a transmis|une instruction a été envoyée)/i.test(summary))
    return summary.slice(0,135);
  return labels[e?.kind]||"Événement confirmé";
}
function lastConfirmed(task){
  return confirmedEvents(task).at(-1)||null;
}
function compactProgress(label,done,total){
  const row=el("div","mini-progress");
  const valid=Number.isInteger(done)&&done>=0&&Number.isInteger(total)&&total>0;
  const percent=valid?Math.round(Math.min(done,total)*100/total):null;
  const cap=el("div","progress-caption");
  cap.append(el("span","",label),
    el("strong","",valid?Math.min(done,total)+" / "+total+" · "+percent+" %":"Non mesuré"));
  const track=el("div","progress-track");
  const fill=el("div","progress-fill");
  fill.style.width=percent===null?"0%":percent+"%";
  track.append(fill);
  row.append(cap,track);
  return row;
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
function safeLiveURL(raw){
  try {
    const url=new URL(String(raw||"").trim());
    if(url.protocol!=="https:" || !url.hostname.toLowerCase().endsWith(".ts.net") ||
       !/^[a-z0-9.-]+$/.test(url.hostname) ||
       (url.port && !["443","8443","10000"].includes(url.port)) ||
       url.username||url.password||url.search||url.hash||
       (url.pathname!=="/"&&url.pathname!==""))return null;
    return url.origin;
  }catch(_){return null;}
}
function showLiveState(){
  const mode={
    off:"Journal GitHub uniquement · pas de liaison directe",
    opening:"Connexion au relais Windows en cours…",
    connected:"Relais Windows connecté · événements transmis dès leur journalisation",
    reconnecting:"Relais indisponible · affichage du dernier relevé public"
  };
  $("live-connection-state").textContent=mode[liveState]||mode.off;
  $("live-connection-state").dataset.state=liveState;
  $("live-connect").classList.toggle("hidden",liveState==="connected");
  $("live-disconnect").classList.toggle("hidden",liveState==="off");
}
function disconnectLive(){
  if(liveSource)liveSource.close();
  liveSource=null;
  liveState="off";
  liveFeed.hd=[];liveFeed.pc=[];
  showLiveState();renderHome();
}
function connectLive(raw){
  const base=safeLiveURL(raw);
  if(!base){
    $("live-connection-state").textContent="URL refusée : HTTPS *.ts.net uniquement, sans identifiants.";
    return;
  }
  if(liveSource)liveSource.close();
  liveFeed.hd=[];liveFeed.pc=[];
  liveState="opening";
  $("live-endpoint").value=base;
  showLiveState();renderHome();
  const source=new EventSource(base+"/events");
  liveSource=source;
  source.onopen=()=>{
    if(liveSource!==source)return;
    liveState="connected";showLiveState();renderHome();
  };
  source.onerror=()=>{
    if(liveSource!==source)return;
    source.close();liveSource=null;
    liveState="reconnecting";showLiveState();renderHome();
  };
  source.onmessage=event=>{
    if(liveSource!==source||typeof event.data!=="string"||event.data.length>2000)return;
    let data;
    try{data=JSON.parse(event.data);}catch(_){return;}
    if(!data||!safeProject(data.project)||
       typeof data.job!=="string"||!/[a-z0-9][a-z0-9-]{0,49}/.test(data.job)||
       typeof data.time!=="string"||!Number.isFinite(Date.parse(data.time))||
       typeof data.label!=="string"||typeof data.command!=="string"||
       !ROLES.has(data.role))return;
    const events=liveFeed[data.project];
    if(events.some(x=>x.id===data.id))return;
    events.push({
      id:String(data.id||"").slice(0,30),
      job:data.job.slice(0,50),time:data.time.slice(0,50),
      label:data.label.slice(0,180),command:data.command.slice(0,250),
      role:data.role,kind:String(data.kind||"").slice(0,50)
    });
    if(events.length>35)events.splice(0,events.length-35);
    renderHome();
  };
}
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
  const observed=liveFeed[projectId]||[];
  const taskEvents=task?observed.filter(e=>e.job===task.id):[];
  const directlyObserved=(taskEvents.length?taskEvents:observed).slice(-7).reverse();
  const directMode=liveState!=="off"&&directlyObserved.length>0;
  const latestElapsed=directMode?Date.now()-Date.parse(directlyObserved[0].time):Infinity;
  const recentlyActive=latestElapsed>=0&&latestElapsed<180_000;
  const header=el("div","live-preview-head");
  header.append(el("span","work-heading","TERMINAL D'ACTIVITÉ DES AGENTS"),
    el("span","live-preview-mode",liveState==="connected"?
      (recentlyActive?"FLUX CONNECTÉ · ACTIVITÉ RÉCENTE":"FLUX CONNECTÉ · EN ATTENTE"):
      liveState==="reconnecting"?"RECONNEXION AU FLUX":liveState==="opening"?
      "CONNEXION EN COURS":"RELEVÉ PUBLIC · NON INSTANTANÉ"));
  area.append(header);
  const description=el("p","live-preview-description",
    directMode?(taskEvents.length?
      (recentlyActive?"Dernières commandes observées pour la tâche prioritaire (chemins masqués).":
      "Derniers événements de cette tâche. Aucune commande actuellement active n'est confirmée.") :
      "Le dernier événement vient d'une autre tâche du projet ; la tâche prioritaire n'a pas encore de signal direct.") :
    data.otherJob?"Aucun message publié pour la tâche prioritaire. Dernière activité du projet : "+data.otherJob:
    "Dernières opérations publiées pour la tâche prioritaire.");
  area.append(description);
  const stream=el("div","live-preview-console");
  stream.setAttribute("aria-label","Dernières actions publiées par les agents");
  if(directMode){
    for(const event of directlyObserved){
      const line=el("div","live-preview-line live-command");
      const message=el("div","live-preview-message");
      message.append(el("strong","",event.label));
      message.append(el("code","live-command-text","$ "+event.command));
      if(task&&event.job!==task.id)message.append(el("span","live-command-job","Autre tâche : "+event.job));
      line.append(el("time","live-preview-time",shortDate(event.time)),
        el("span","live-preview-role",event.role==="qwen"?"QWEN":"AGENT"),message);
      stream.append(line);
    }
  }else if(data.items.length){
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
  foot.append(el("span","",directMode?
    "Dernière activité relayée : "+formatDate(directlyObserved[0].time)+
    " · Affichage de jalons, jamais un accès terminal distant.":
    data.time?"Conversations synchronisées : "+formatDate(data.time):
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
    ?"Dernière synchronisation : "+formatDate(status.generated_at)+(fresh?"":" · données anciennes")
    :"Dernière synchronisation : en attente";
  $("sidebar-status").textContent=status?(fresh?"Copie disponible":"Données anciennes"):"En attente";
  $("sync-dot").className="dot"+(status?(fresh?" ready":" stale"):"");
  $("sync-dot-home").className="dot"+(status?(fresh?" ready":" stale"):"");
  const cards=document.createDocumentFragment();
  for(const id of ["hd","pc"]){
    const project=status?.projects[id],task=currentTask(project);
    const pending=(project?.tasks||[]).filter(t=>t!==task&&t.status==="queued").slice(0,5);
    const card=el("section","progress-card compact-card "+id);
    card.setAttribute("aria-label","Suivi de "+PROJECTS[id].title);
    const top=el("div","progress-card-top");
    const identity=el("div","card-project");
    identity.append(el("span","",id.toUpperCase()),el("strong","",PROJECTS[id].title));
    top.append(identity,el("span","task-state",task?statusName(task.status):"En attente"));
    card.append(top,el("h2","task-name",task?.title||"Aucune tâche synchronisée"));
    const observed=lastConfirmed(task);
    const action=el("p","compact-action",observed?
      eventSummary(observed)+" · "+shortDate(observed.time):"Aucune action technique confirmée");
    card.append(action);
    card.append(compactProgress("Tâche",task?.done,task?.total));
    const time=taskETA(id,task,project);
    card.append(el("p","compact-eta","Temps restant : "+time[0]));
    const upcoming=el("section","next-task-block compact-upcoming");
    upcoming.append(el("span","work-heading","5 PROCHAINES TÂCHES"));
    const list=el("ol","upcoming-list");
    for(const item of pending){
      const li=el("li","compact-next");
      li.append(el("span","next-task-title",item.title),
        el("span","compact-next-time",taskETA(id,item,project)[0]));
      list.append(li);
    }
    if(!pending.length)list.append(el("li","queue-empty","Aucune tâche planifiée"));
    upcoming.append(list);
    card.append(upcoming);
    const controls=el("div","work-controls");
    const detail=el("button","work-open-details","Détails de la tâche");
    detail.type="button";detail.addEventListener("click",()=>openTaskDrawer(id,task));
    const messages=el("button","work-open-messages","Conversation");
    messages.type="button";messages.addEventListener("click",()=>navigate(id));
    controls.append(detail,messages);
    card.append(controls);
    cards.append(card);
  }
  $("progress-grid").replaceChildren(cards);
}
function detailElement(projectId,task){
  const container=el("div","task-details compact-drawer");
  if(!task){
    container.append(el("p","placeholder","Aucune progression vérifiable."));
    return container;
  }
  container.append(compactProgress("Tâche complète",task.done,task.total));
  const stage=task.subtask;
  container.append(compactProgress("Sous-tâche : "+(stage?.label||"non renseignée"),stage?.done,stage?.total));
  const latest=lastConfirmed(task);
  const summary=el("section","compact-current");
  summary.append(el("span","work-heading","DERNIÈRE ACTION CONFIRMÉE"),
    el("p","",latest?eventSummary(latest):"Aucune action technique confirmée"));
  if(latest)summary.append(el("time","compact-stamp",formatDate(latest.time)));
  container.append(summary);
  const eta=taskETA(projectId,task,publicStatus?.projects[projectId]);
  container.append(el("p","compact-eta","Temps restant : "+eta[0]));
  const events=confirmedEvents(task).slice(-5).reverse();
  const timeline=el("section","compact-timeline");
  timeline.append(el("span","work-heading","DERNIÈRES OPÉRATIONS"));
  if(events.length){
    const list=el("ol","compact-timeline-list");
    for(const event of events){
      const row=el("li","");
      row.append(el("time","",shortDate(event.time)),el("span","",eventSummary(event)));
      list.append(row);
    }
    timeline.append(list);
  }else timeline.append(el("p","compact-muted","Aucune opération technique enregistrée."));
  container.append(timeline);
  if(task.status==="blocked")container.append(el("p","compact-error","Tâche bloquée"));
  if(publicStatus?.generated_at&&isStale(publicStatus.generated_at))
    container.append(el("p","compact-muted","Dernière sauvegarde ancienne · état actuel non vérifié"));
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
function compactConversation(records,projectId) {
  const grouped=new Map();
  for(const event of records){
    const qwenHistory=projectId==="hd"&&
      ["model_request","model_response"].includes(event.kind)&&event.role==="qwen";
    const key=qwenHistory?"qwen:"+event.job:
      "event:"+event.job+"\u0000"+event.role+"\u0000"+event.kind+"\u0000"+event.message;
    if(!grouped.has(key))grouped.set(key,{kind:qwenHistory?"qwen_history":"event",records:[],last:0});
    const group=grouped.get(key);
    group.records.push(event);
    const time=Date.parse(event.time);
    group.last=Math.max(group.last,Number.isFinite(time)?time:0);
  }
  return [...grouped.values()].sort((a,b)=>a.last-b.last);
}
function renderConversation(){
  const p=archive?.projects.find(p=>p.id===activeView);
  $("locked-panel").classList.add("hidden");
  $("conversation-stream").classList.remove("hidden");
  $("conversation-meta").textContent=!archive?
    "Archive publique indisponible":!p?"Projet introuvable":!p.configured?
    "Journal non transmis":"Archive du "+formatDate(archive.generated_at);
  if(!archive||!p){
    $("conversation-stream").replaceChildren(el("p","placeholder","Aucune conversation publiée."));
    return;
  }
  const needle=$("conversation-search").value.trim().toLocaleLowerCase("fr-FR");
  const matches=p.events.filter(x=>x&&ROLES.has(x.role)&&typeof x.message==="string"
    &&typeof x.job==="string"&&(x.message.toLocaleLowerCase("fr-FR").includes(needle)||
      x.job.toLocaleLowerCase("fr-FR").includes(needle)));
  const groups=compactConversation(matches,activeView);
  const visible=groups.slice(-visibleMessageCount);
  const frag=document.createDocumentFragment();
  if(!visible.length)frag.append(el("p","placeholder","Aucun message correspondant."));
  if(groups.length>visibleMessageCount){
    const more=el("button","older-messages","Afficher les événements précédents");
    more.type="button";more.addEventListener("click",()=>{visibleMessageCount+=250;renderConversation()});
    frag.append(more);
  }
  for(const group of visible){
    const last=group.records.at(-1),count=group.records.length;
    const article=el("article","message role-"+last.role);
    const avatar=el("div","avatar",last.role==="qwen"?"Q":last.role==="chatgpt"?"GPT":"IA");
    const body=el("div","message-main");
    const meta=el("div","meta");
    meta.append(el("time","",formatDate(last.time)),el("span","",last.job));
    body.append(el("strong","sender",labelRole(last.role)),meta);
    if(group.kind==="qwen_history"){
      const details=el("details","conversation-archive");
      details.append(el("summary","",
        "Anciens échanges Qwen · "+count+" événements (repliés)"));
      const stack=el("div","conversation-archive-items");
      for(const e of group.records){
        const item=el("div","archive-item");
        item.append(el("time","",shortDate(e.time)+" · "+e.kind),
          el("pre","bubble",e.message));
        stack.append(item);
      }
      details.append(stack);body.append(details);
    }else{
      body.append(el("div","bubble",last.message));
      if(count>1){
        const details=el("details","conversation-archive");
        details.append(el("summary","","× "+count+" événements identiques · voir les dates"));
        const stack=el("div","conversation-archive-items");
        for(const e of group.records)stack.append(el("time","archive-item",formatDate(e.time)));
        details.append(stack);body.append(details);
      }
    }
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
$("live-connect").addEventListener("click",()=>connectLive($("live-endpoint").value));
$("live-disconnect").addEventListener("click",disconnectLive);
$("live-endpoint").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();connectLive($("live-endpoint").value);}
});
showLiveState();
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
// A shareable, public Funnel URL can prefill the connection. No credentials in URLs.
const configuredLive=new URLSearchParams(window.location.search).get("live");
if(configuredLive&&safeLiveURL(configuredLive)){
  $("live-endpoint").value=safeLiveURL(configuredLive);
  connectLive(configuredLive);
}
// Poll public static JSON; the Windows publishing schedule, not polling,
// determines when new messages actually become available.
setInterval(()=>{if(!document.hidden){loadPublicStatus();loadPublicArchive();}},30_000);
document.addEventListener("visibilitychange",()=>{
  if(!document.hidden){loadPublicStatus();loadPublicArchive();}
});
