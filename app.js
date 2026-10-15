"use strict";
/* Archive viewer only. Browser WebCrypto keeps AES-256 key in memory for
   decryption, never localStorage, cookies, remote requests, analytics or logs.
   No arbitrary code execution, no direct OpenAI/Ollama integration. */
const $ = id => document.getElementById(id);
const unlockSection = $("unlock");
const archiveSection = $("archive");
const keyInput = $("archive-key");
const unlockButton = $("unlock-btn");
const unlockStatus = $("unlock-status");
const AAD = new TextEncoder().encode("Burnout3-LAB/encrypted-offline-archive/v1");
const allowedRoles = new Set(["chatgpt", "qwen", "agent", "system"]);
const allowedProjects = ["hd", "pc"];
const labels = {
  chatgpt: "Consigne GitHub / ChatGPT",
  qwen: "Qwen · modèle local",
  agent: "Agent Windows",
  system: "Système",
};
let archiveData = null;
let busy = false;

function setStatus(message, error=false) {
  unlockStatus.textContent = message;
  unlockStatus.classList.toggle("error", error);
}
function b64urlToBytes(text) {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new Error("Encodage chiffré invalide.");
  }
  const normalized = text.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}
function validateEnvelope(envelope) {
  if (!envelope || typeof envelope !== "object" ||
      envelope.v !== 1 || envelope.alg !== "AES-256-GCM" ||
      envelope.compression !== "gzip" ||
      typeof envelope.nonce !== "string" ||
      typeof envelope.ciphertext !== "string" ||
      envelope.ciphertext.length > 15_000_000) {
    throw Error("Aucune sauvegarde chiffrée n'est encore disponible sur GitHub.");
  }
  return envelope;
}
async function loadEncrypted() {
  const response = await fetch("./latest.enc.json", {
    method: "GET", cache: "no-store", credentials: "omit"
  });
  if (!response.ok) throw Error("Archive introuvable (HTTP " + response.status + ").");
  const envelope = validateEnvelope(await response.json());
  return envelope;
}
async function decrypt(envelope, privateKey) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(privateKey)) {
    throw Error("Ta clé doit contenir exactement 43 caractères.");
  }
  const keyBytes = b64urlToBytes(privateKey);
  const nonce = b64urlToBytes(envelope.nonce);
  const cipherBytes = b64urlToBytes(envelope.ciphertext);
  if (keyBytes.length !== 32 || nonce.length !== 12) {
    throw Error("Format de clé ou d'archive invalide.");
  }
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes, {name: "AES-GCM"}, false, ["decrypt"]
  );
  // Wrong keys and modified archives cause AES-GCM authentication failure.
  const compressed = await crypto.subtle.decrypt({
    name: "AES-GCM", iv: nonce, additionalData: AAD, tagLength: 128
  }, cryptoKey, cipherBytes);
  if (typeof DecompressionStream !== "function") {
    throw Error("Utilise une version récente de Firefox ou Chrome (gzip natif).");
  }
  const stream = new Blob([compressed]).stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const bytes = await new Response(stream).arrayBuffer();
  if (bytes.byteLength > 7 * 1024 * 1024) {
    throw Error("Le contenu décompressé dépasse la limite prévue.");
  }
  let data;
  try {
    data = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes));
  } catch {
    throw Error("Le contenu déchiffré est invalide.");
  }
  if (!data || data.v !== 1 || data.read_only !== true ||
      !Array.isArray(data.projects) || data.projects.length !== 2 ||
      data.projects[0].id !== "hd" || data.projects[1].id !== "pc" ||
      !data.projects.every(p => Array.isArray(p.events) &&
        p.events.length <= 1200)) {
    throw Error("Archive d'une version non compatible.");
  }
  return data;
}

function elt(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}
function formatTime(text) {
  const date = new Date(text);
  return isNaN(date.getTime()) ? "Date inconnue" :
    date.toLocaleString("fr-FR", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit"
    });
}
function renderEvents(id) {
  const p = archiveData?.projects.find(p => p.id === id);
  if (!p) return;
  const needle = $(id + "-search").value.trim().toLocaleLowerCase("fr-FR");
  const all = p.events.filter(e => allowedRoles.has(e.role) &&
    typeof e.message === "string" && typeof e.job === "string");
  const selected = all.filter(e => !needle ||
    e.message.toLocaleLowerCase("fr-FR").includes(needle) ||
    e.job.toLocaleLowerCase("fr-FR").includes(needle));
  $(id + "-count").textContent = selected.length + " message(s) affiché(s)";
  $(id + "-state").textContent = !p.configured
    ? "Aucun journal lors de la sauvegarde"
    : p.events.length ? "Conversation réelle archivée" : "Journal vide";
  $(id + "-total").textContent = String(p.events.length);
  const fragment = document.createDocumentFragment();
  if (!selected.length) {
    const box = elt("div", "empty");
    box.append(elt("strong", "", p.configured
      ? "Aucun échange correspondant." : "Agent non enregistré dans cette sauvegarde."),
      elt("span", "", "Cette archive n'invente aucun message."));
    fragment.append(box);
  }
  for (const event of selected) {
    const article = elt("article", "message role-" + event.role);
    const avatar = elt("div", "avatar", {
      chatgpt: "GPT", qwen: "Q", agent: "IA", system: "i"
    }[event.role]);
    const body = elt("div", "message-main");
    body.appendChild(elt("strong", "sender", labels[event.role]));
    const meta = elt("div", "meta");
    meta.append(elt("time", "", formatTime(event.time)),
                elt("span", "", event.job),
                elt("span", "event-kind",
                  typeof event.kind === "string" ? event.kind : ""));
    body.append(meta, elt("div", "bubble", event.message));
    article.append(avatar, body);
    fragment.append(article);
  }
  $(id + "-stream").replaceChildren(fragment);
}
async function unlock() {
  if (busy) return;
  busy = true;
  unlockButton.disabled = true;
  setStatus("Récupération de l'archive chiffrée et déchiffrement local…");
  try {
    const key = keyInput.value.trim();
    const envelope = await loadEncrypted();
    const data = await decrypt(envelope, key);
    // Remove key input immediately. Neither key nor plaintext is persisted.
    keyInput.value = "";
    archiveData = data;
    $("snapshot-date").textContent = formatTime(data.generated_at);
    for (const id of allowedProjects) renderEvents(id);
    unlockSection.classList.add("hidden");
    archiveSection.classList.remove("hidden");
  } catch (err) {
    setStatus(
      err instanceof Error ? err.message : "Erreur de déchiffrement. Vérifie ta clé.",
      true
    );
  } finally {
    busy = false;
    unlockButton.disabled = false;
  }
}
function lock() {
  archiveData = null;
  keyInput.value = "";
  for (const id of allowedProjects) {
    $(id + "-search").value = "";
    $(id + "-stream").replaceChildren(elt("p", "empty", "Archive verrouillée."));
  }
  archiveSection.classList.add("hidden");
  unlockSection.classList.remove("hidden");
  setStatus("La clé privée reste uniquement en ta possession.");
  keyInput.focus();
}
unlockButton.addEventListener("click", unlock);
keyInput.addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    unlock();
  }
});
$("lock-btn").addEventListener("click", lock);
for (const id of allowedProjects) {
  $(id + "-search").addEventListener("input", () => {
    if (archiveData) renderEvents(id);
  });
}
