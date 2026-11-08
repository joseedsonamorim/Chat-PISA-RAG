/*!
 * Chat PISA — Ask the PISA Manual (Conversational Hybrid RAG & Document Inspector).
 * Copyright (c) 2026 José Edson Sebastião. PPGIA/UFRPE. All rights reserved
 * under the MIT License (see LICENSE). Source documents remain the property
 * of the OECD and are cited, not relicensed.
 *
 * Arquitetura:
 *   1. Conexão sem fricção (Zero-Prompt UX): utiliza automaticamente o Proxy
 *      local (`/api/gemini/`) ou o Proxy Serverless configurado em `PROXY_URL`
 *      (Cloudflare Worker), sem pedir API Key na tela principal.
 *   2. Recuperação Híbrida (Embeddings Gemini 768d + BM25 via RRF k=60).
 *   3. Condensação Conversacional multi-turno + geração em Streaming SSE.
 *   4. Inspetor interativo do Manual (estilo AI Studio "Ask the Manual"):
 *      clicar em qualquer citação [Cxx] abre e destaca o trecho exato ao lado.
 */
"use strict";

const DIRECT_API = "https://generativelanguage.googleapis.com/v1beta/models/";
// Se você publicar o Cloudflare Worker (`proxy/cloudflare_worker.js`), coloque a URL abaixo
// (ex.: "https://chat-pisa-proxy.seu-usuario.workers.dev/") para que o GitHub Pages funcione
// sem pedir chave a nenhum visitante.
const PROXY_URL = "";

const GEN_MODEL = "gemini-flash-latest";
const TOP_K = 6;
const CANDIDATES = 30;
const RRF_K = 60;
const HISTORY_TURNS = 4;

const SYSTEM = `Você é o "Assistente PISA", um especialista caloroso e didático na documentação do PISA (OCDE) que foi indexada para você.

Como conversar:
- Fale de forma natural, como um colega pesquisador que domina o assunto: direto, claro e acolhedor. Sem frases robóticas como "com base nos trechos fornecidos".
- Responda no idioma da pergunta. Adapte a profundidade: perguntas simples recebem respostas curtas; perguntas complexas, explicações organizadas.
- Cumprimentos e conversa social podem ser respondidos normalmente, sem citações.

Rigor (obrigatório):
- Toda informação sobre o PISA deve vir EXCLUSIVAMENTE do CONTEXTO desta mensagem. Cada trecho tem um ID, ex.: [C12].
- Cite o ID logo após a afirmação que ele sustenta, ex.: "... [C12]". Nunca cite um ID que não esteja no contexto.
- Se o contexto não traz a resposta, diga isso com honestidade, explique brevemente o que a documentação cobre sobre o tema (se algo) e não invente números, datas ou definições.
- Lembre que o documento principal indexado é o Third Draft (abril de 2019) do framework de Pensamento Criativo do PISA 2021; avise quando isso for relevante.`;

const REWRITE = `Reescreva a ÚLTIMA pergunta do usuário como uma pergunta autônoma e completa para busca em documentos, resolvendo pronomes e referências ao histórico. Mantenha o idioma original. Responda APENAS com a pergunta reescrita, sem explicações.`;

let INDEX = null;
let IDF = {};
let LOCAL_PROXY = false;
let ACTIVE_DOC = "";
let LAST_RETRIEVED = new Set();
const history = [];
const $ = (id) => document.getElementById(id);

/* ---------- Utilitários ---------- */
const tok = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function errMsg(r) {
  try { return (await r.json()).error.message; } catch { return `HTTP ${r.status}`; }
}

/** Resolve o endpoint (Proxy local -> Proxy Cloudflare -> Chave local no navegador). */
async function detectConnection() {
  try {
    const r = await fetch("/api/status");
    if (r.ok) {
      const j = await r.json();
      if (j.proxy) LOCAL_PROXY = true;
    }
  } catch { /* estático no GitHub Pages */ }
  updateConnectionStatus();
}

function updateConnectionStatus() {
  const key = localStorage.getItem("gemini_key");
  const el = $("conn-status");
  if (!el) return;
  if (LOCAL_PROXY) {
    el.textContent = "Conectado via Servidor Local (chave carregada automaticamente do ambiente, sem necessidade de digitar chave).";
  } else if (PROXY_URL) {
    el.textContent = "Conectado via Proxy Institucional Serverless (sem necessidade de chave pelo visitante).";
  } else if (key) {
    el.textContent = "Conectado com chave salva localmente neste navegador.";
  } else {
    el.textContent = "Modo GitHub Pages estático: configure PROXY_URL ou informe uma chave AIzaSy... do Google AI Studio.";
  }
}

async function callGeminiEndpoint(action, body) {
  const key = localStorage.getItem("gemini_key");
  let url = "";
  const headers = { "Content-Type": "application/json" };

  if (LOCAL_PROXY && !key) {
    url = `/api/gemini/${action}`;
  } else if (PROXY_URL && !key) {
    url = `${PROXY_URL.replace(/\/+$/, "")}/${action}`;
  } else if (key) {
    url = `${DIRECT_API}${action}`;
    headers["x-goog-api-key"] = key;
  } else {
    $("settings-modal").showModal();
    throw new Error("Configure a conexão da API no botão ⚙️ (ou inicie com scripts/serve_local.py).");
  }

  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(await errMsg(r));
  return r;
}

/* ---------- Índice e Inspetor do Manual ---------- */
async function loadIndex() {
  INDEX = await (await fetch("index.json")).json();
  const df = {};
  INDEX.chunks.forEach((c) => {
    c.tf = {};
    tok(c.text).forEach((t) => (c.tf[t] = (c.tf[t] || 0) + 1));
    c.len = Object.values(c.tf).reduce((a, b) => a + b, 0);
    Object.keys(c.tf).forEach((t) => (df[t] = (df[t] || 0) + 1));
  });
  const N = INDEX.chunks.length;
  INDEX.avg = INDEX.chunks.reduce((a, c) => a + c.len, 0) / N;
  Object.entries(df).forEach(([t, d]) => (IDF[t] = Math.log(1 + (N - d + 0.5) / (d + 0.5))));

  const docs = INDEX.documents?.length
    ? INDEX.documents
    : [{ id: INDEX.chunks[0].doc, title: INDEX.chunks[0].doc.replace(/_/g, " "), pages: 56, chunks: N }];

  const sel = $("doc-select");
  sel.innerHTML = "";
  docs.forEach((d) => {
    const opt = document.createElement("option");
    opt.value = d.id;
    opt.textContent = `${d.title} (${d.pages} p.)`;
    sel.appendChild(opt);
  });
  ACTIVE_DOC = docs[0].id;
  renderManual();

  const updated = INDEX.updated_at ? ` · atualizado em ${INDEX.updated_at.slice(0, 10)}` : "";
  $("stats").textContent = `${N} trechos · ${docs.length} documento(s) oficial(is) · ${INDEX.embed_model}${updated}`;
}

function renderManual(filterText = "") {
  if (!INDEX) return;
  const docs = INDEX.documents || [];
  const docInfo = docs.find((d) => d.id === ACTIVE_DOC) || { title: ACTIVE_DOC, pages: "?", chunks: INDEX.chunks.length };
  $("manual-title").textContent = docInfo.title;
  $("manual-meta").textContent = `${docInfo.pages} págs · ${docInfo.chunks} trechos`;

  const q = filterText.trim().toLowerCase();
  const reader = $("manual-reader");
  reader.innerHTML = "";

  const list = INDEX.chunks.filter((c) => {
    if (ACTIVE_DOC && c.doc !== ACTIVE_DOC) return false;
    if (!q) return true;
    return (
      c.id.toLowerCase() === q ||
      `p. ${c.page}` === q ||
      `p${c.page}` === q ||
      String(c.page) === q ||
      c.text.toLowerCase().includes(q)
    );
  });

  list.forEach((c) => {
    const card = document.createElement("article");
    card.className = `chunk-card${LAST_RETRIEVED.has(c.id) ? " retrieved" : ""}`;
    card.id = `manual-${c.id}`;
    const head = document.createElement("div");
    head.className = "chunk-head";
    head.innerHTML = `<span>Trecho [${c.id}]${LAST_RETRIEVED.has(c.id) ? " · recuperado na última busca" : ""}</span><span class="page-badge">Página ${c.page}</span>`;
    const pre = document.createElement("pre");
    pre.className = "chunk-text";
    pre.textContent = c.text;
    card.append(head, pre);
    reader.appendChild(card);
  });
}

function focusChunkInManual(chunkId) {
  const ws = $("workspace");
  ws.classList.remove("manual-hidden");
  $("manual-filter").value = "";
  const targetChunk = INDEX?.chunks.find((c) => c.id === chunkId);
  if (targetChunk && targetChunk.doc !== ACTIVE_DOC) {
    ACTIVE_DOC = targetChunk.doc;
    $("doc-select").value = ACTIVE_DOC;
  }
  renderManual("");
  document.querySelectorAll(".chunk-card.active").forEach((el) => el.classList.remove("active"));
  const el = document.getElementById(`manual-${chunkId}`);
  if (el) {
    el.classList.add("active");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/* ---------- Recuperação Híbrida ---------- */
function bm25(q, c) {
  let s = 0;
  for (const t of new Set(tok(q))) {
    const f = c.tf[t];
    if (f) s += IDF[t] * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (c.len / INDEX.avg))));
  }
  return s;
}

async function embedQuery(text) {
  const r = await callGeminiEndpoint(`${INDEX.embed_model}:embedContent`, {
    content: { parts: [{ text }] },
    taskType: "RETRIEVAL_QUERY",
    outputDimensionality: INDEX.dim,
  });
  const v = (await r.json()).embedding.values;
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
}

async function retrieve(q) {
  const qv = await embedQuery(q);
  const dense = INDEX.chunks.map((c, i) => [i, c.emb.reduce((s, x, j) => s + x * qv[j], 0)]);
  const sparse = INDEX.chunks.map((c, i) => [i, bm25(q, c)]);
  const score = {};
  [dense, sparse].forEach((list) =>
    list.sort((a, b) => b[1] - a[1]).slice(0, CANDIDATES).forEach(([i, s], rank) => {
      if (s > 0) score[i] = (score[i] || 0) + 1 / (RRF_K + rank + 1);
    })
  );
  return Object.entries(score).sort((a, b) => b[1] - a[1]).slice(0, TOP_K).map(([i]) => INDEX.chunks[i]);
}

/* ---------- Geração ---------- */
const textOf = (j) => j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

async function condense(q) {
  if (!history.length) return q;
  const turns = history.slice(-HISTORY_TURNS).map((h) => `Usuário: ${h.q}\nAssistente: ${h.a.slice(0, 400)}`).join("\n");
  try {
    const r = await callGeminiEndpoint(`${GEN_MODEL}:generateContent`, {
      systemInstruction: { parts: [{ text: REWRITE }] },
      contents: [{ role: "user", parts: [{ text: `HISTÓRICO:\n${turns}\n\nÚLTIMA PERGUNTA: ${q}` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 200 },
    });
    return textOf(await r.json()).trim() || q;
  } catch { return q; }
}

async function generateStream(q, hits, onText) {
  const ctx = hits.map((c) => `[${c.id}] (página ${c.page})\n${c.text}`).join("\n\n");
  const contents = [];
  history.slice(-HISTORY_TURNS).forEach((h) => {
    contents.push({ role: "user", parts: [{ text: h.q }] }, { role: "model", parts: [{ text: h.a }] });
  });
  contents.push({ role: "user", parts: [{ text: `CONTEXTO:\n${ctx}\n\nPERGUNTA: ${q}` }] });

  const r = await callGeminiEndpoint(`${GEN_MODEL}:streamGenerateContent?alt=sse`, {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: { temperature: 0.4 },
  });
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      try { full += textOf(JSON.parse(line.slice(5))); onText(full); } catch { /* frame parcial */ }
    }
  }
  return full || "(sem resposta)";
}

/* ---------- Renderização ---------- */
function fmt(text) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[(C\d+(?:\s*,\s*C\d+)*)\]/g, (_, group) =>
      group
        .split(/\s*,\s*/)
        .map((id) => `<button type="button" class="cite" data-cid="${id}" title="Ver ${id} no Inspetor do Manual">${id}</button>`)
        .join(" ")
    );
  const out = []; let list = false;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*[*-]\s+(.*)/);
    if (m) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    if (list) { out.push("</ul>"); list = false; }
    const trimmed = line.trim();
    if (!trimmed || /^---+$/.test(trimmed)) continue;
    const h = trimmed.match(/^#{1,4}\s+(.*)/);
    if (h) { out.push(`<h4>${inline(h[1])}</h4>`); continue; }
    out.push(`<p>${inline(trimmed)}</p>`);
  }
  if (list) out.push("</ul>");
  return out.join("");
}

function add(cls, text) {
  const d = document.createElement("div");
  d.className = `msg ${cls}`;
  d.textContent = text;
  $("log").appendChild(d);
  d.scrollIntoView({ behavior: "smooth", block: "end" });
  return d;
}

function addSources(el, hits, answer) {
  const cited = new Set(answer.match(/C\d+/g) || []);
  const box = document.createElement("div");
  box.className = "sources";
  const lab = document.createElement("span");
  lab.className = "label";
  lab.textContent = "Inspecionar páginas:";
  box.append(lab);
  hits.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `source-pill${cited.has(c.id) ? " used" : ""}`;
    btn.dataset.cid = c.id;
    btn.textContent = `${cited.has(c.id) ? "✔ " : ""}${c.id} · p. ${c.page}`;
    box.append(btn);
  });
  el.append(box);
}

/* ---------- Fluxo de Conversa ---------- */
async function ask(q) {
  add("user", q);
  const out = add("bot thinking", "Consultando o manual do PISA…");
  $("send").disabled = true;
  try {
    const standalone = await condense(q);
    const hits = await retrieve(standalone);
    LAST_RETRIEVED = new Set(hits.map((c) => c.id));
    renderManual($("manual-filter").value);

    const ans = await generateStream(q, hits, (t) => {
      out.classList.remove("thinking");
      out.innerHTML = fmt(t);
    });
    out.innerHTML = fmt(ans);
    addSources(out, hits, ans);
    history.push({ q, a: ans });

    const firstCited = (ans.match(/C\d+/) || [hits[0]?.id])[0];
    if (firstCited) focusChunkInManual(firstCited);
  } catch (e) {
    out.classList.remove("thinking");
    out.textContent = "Aviso: " + e.message;
  } finally {
    $("send").disabled = false;
  }
}

/* ---------- Eventos da Interface ---------- */
const EXAMPLES = [
  "O que é pensamento criativo segundo o PISA e quais são as três facetas?",
  "Quais são os quatro domínios aplicados na avaliação?",
  "Como as tarefas abertas de expressão visual são pontuadas?",
];

EXAMPLES.forEach((t) => {
  const b = document.createElement("button");
  b.className = "chip"; b.type = "button"; b.textContent = t;
  b.onclick = () => ask(t);
  $("chips").appendChild(b);
});

$("log").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-cid]");
  if (btn) focusChunkInManual(btn.dataset.cid);
});

$("doc-select").onchange = (e) => { ACTIVE_DOC = e.target.value; renderManual($("manual-filter").value); };
$("manual-filter").oninput = (e) => renderManual(e.target.value);
$("toggle-manual").onclick = () => $("workspace").classList.toggle("manual-hidden");
$("reset").onclick = () => { history.length = 0; $("log").innerHTML = ""; LAST_RETRIEVED.clear(); renderManual(""); };

$("open-about").onclick = () => $("about-modal").showModal();
$("close-about").onclick = () => $("about-modal").close();
$("about-modal").onclick = (e) => { if (e.target === $("about-modal")) $("about-modal").close(); };
$("open-settings").onclick = () => { updateConnectionStatus(); $("settings-modal").showModal(); };
$("close-settings").onclick = () => $("settings-modal").close();
$("settings-modal").onclick = (e) => { if (e.target === $("settings-modal")) $("settings-modal").close(); };
$("savekey").onclick = () => {
  const v = $("key").value.trim();
  if (v) { localStorage.setItem("gemini_key", v); $("key").value = ""; updateConnectionStatus(); $("settings-modal").close(); }
};
$("forget").onclick = () => {
  localStorage.removeItem("gemini_key");
  $("key").value = "";
  updateConnectionStatus();
};

$("form").onsubmit = (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (q) { $("q").value = ""; ask(q); }
};
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); }
});

Promise.all([loadIndex(), detectConnection()]).catch(
  (e) => ($("stats").textContent = "Falha ao carregar o índice: " + e.message)
);
