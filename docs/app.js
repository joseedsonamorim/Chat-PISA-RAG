/*!
 * Chat PISA — Caderno de Consulta aos Manuais do PISA (OCDE).
 * Copyright (c) 2026 José Edson Sebastião. PPGIA/UFRPE. All rights reserved
 * under the MIT License (see LICENSE). Source documents remain the property
 * of the OECD and are cited, not relicensed.
 *
 * Motor de Resposta Rápida e Humanizada em Português (Zero-Key):
 *   1. Todas as 224 passagens em `index.json` possuem tanto o texto original
 *      da OCDE (`text`) quanto uma síntese explicativa em português (`pt`).
 *   2. A busca BM25 indexa simultaneamente os termos em português (`pt`) e em
 *      inglês (`text`), garantindo recuperação instantânea (< 5ms) para
 *      qualquer pergunta em português sem depender de chamadas lentas de rede.
 *   3. No modo estático (GitHub Pages), combina a base de respostas completas
 *      (`precomputed_qa.json`) com um compositor conversacional em português
 *      que redige respostas fluidas usando as sínteses `c.pt`.
 *   4. No modo com backend ativo (`serve_local.py` ou `PROXY_URL`), usa o
 *      modelo rápido `gemini-2.5-flash` em streaming direto, pulando chamadas
 *      extras de reescrita quando não há pronomes dependentes de contexto.
 */
"use strict";

const PROXY_URL = "";
const GEN_MODEL = "gemini-2.5-flash";
const TOP_K = 6;
const CANDIDATES = 30;
const RRF_K = 60;
const HISTORY_TURNS = 4;

const SYSTEM = `Você é um pesquisador brasileiro especialista na documentação do PISA (OCDE) carregada nesta ferramenta.

Como conversar:
- Responda SEMPRE em português do Brasil, de forma natural, calorosa, fluida e direta — como um colega de pesquisa explicando o assunto em uma conversa.
- Nunca use aberturas robóticas ("Com base nos trechos fornecidos", "De acordo com o contexto"). Vá direto à explicação no primeiro parágrafo.
- Traduza termos técnicos quando aparecerem, mantendo o termo original apenas entre parênteses se ajudar na clareza.

Rigor documental (obrigatório):
- Use EXCLUSIVAMENTE as informações do CONTEXTO desta mensagem. Cada passagem tem um código entre colchetes, como [C12].
- Coloque a referência logo após a frase que ela sustenta, ex.: "... [C12]". Nunca invente códigos ou fatos fora do contexto.
- Se a resposta não estiver nas passagens do contexto, diga de forma simples e honesta que esse ponto específico não aparece nas páginas carregadas e comente o que o manual traz de mais próximo.`;

let INDEX = null;
let PRECOMPUTED = {};
let IDF = {};
let LOCAL_PROXY = false;
let ACTIVE_DOC = "";
let LAST_RETRIEVED = new Set();
const history = [];
const $ = (id) => document.getElementById(id);

/* ---------- Utilitários ---------- */
const STOP_PT = new Set([
  "como", "quais", "qual", "que", "sao", "para", "pelo", "pela", "dos", "das",
  "uma", "uns", "umas", "por", "com", "sem", "sob", "sobre", "entre", "mais",
  "menos", "muito", "muita", "isso", "isto", "esse", "essa", "este", "esta",
  "pisa", "teste", "manual", "documento", "ocde", "avaliacao", "avaliado",
  "fala", "diz", "explica", "funciona", "funcionam", "existe", "existem",
]);

const tok = (s) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) || [];
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Limpa quebras de linha artificiais do PDF para leitura editorial fluida. */
function cleanPdfProse(raw) {
  return raw
    .replace(/^FRAMEWORK FOR THE ASSESSMENT OF CREATIVE THINKING IN PISA 2021 \(THIRD DRAFT\)\s*/i, "")
    .replace(/^For Official Use\s*/i, "")
    .replace(/\uF0B7|\u2022/g, "• ")
    .replace(/([a-z,;:])\n([a-z])/g, "$1 $2")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function detectConnection() {
  try {
    const r = await fetch("/api/status");
    if (r.ok) {
      const j = await r.json();
      if (j.proxy) LOCAL_PROXY = true;
    }
  } catch { /* modo estático */ }
}

function hasLiveBackend() {
  return Boolean(LOCAL_PROXY || PROXY_URL);
}

async function callGeminiEndpoint(action, body) {
  const url = LOCAL_PROXY
    ? `/api/gemini/${action}`
    : `${PROXY_URL.replace(/\/+$/, "")}/${action}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r;
}

/* ---------- Índice Bilíngue (PT + EN) e Leitor Editorial ---------- */
async function loadIndex() {
  const [idxRes, qaRes] = await Promise.all([
    fetch("index.json"),
    fetch("precomputed_qa.json").catch(() => null),
  ]);
  INDEX = await idxRes.json();
  if (qaRes && qaRes.ok) {
    PRECOMPUTED = await qaRes.json();
  }

  // Indexa tanto o resumo em português (c.pt) quanto o original em inglês (c.text)
  // dando peso dobrado às ocorrências no texto em português para consultas em PT.
  const df = {};
  INDEX.chunks.forEach((c) => {
    c.tf = {};
    tok(c.text).forEach((t) => (c.tf[t] = (c.tf[t] || 0) + 1));
    if (c.pt) {
      tok(c.pt).forEach((t) => (c.tf[t] = (c.tf[t] || 0) + 2));
    }
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
    opt.textContent = d.title;
    sel.appendChild(opt);
  });
  ACTIVE_DOC = docs[0].id;
  renderManual();

  $("stats").textContent = `Fonte: ${docs[0].title} (${docs[0].pages} páginas, ${N} passagens traduzidas e indexadas)`;
}

function renderManual(filterText = "") {
  if (!INDEX) return;
  const docs = INDEX.documents || [];
  const docInfo = docs.find((d) => d.id === ACTIVE_DOC) || { title: ACTIVE_DOC, pages: 56, chunks: INDEX.chunks.length };
  $("manual-meta").textContent = `${docInfo.pages} p. · ${docInfo.chunks} ref.`;

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
      (c.pt && c.pt.toLowerCase().includes(q)) ||
      c.text.toLowerCase().includes(q)
    );
  });

  list.forEach((c) => {
    const card = document.createElement("article");
    card.className = `chunk-card${LAST_RETRIEVED.has(c.id) ? " retrieved" : ""}`;
    card.id = `manual-${c.id}`;
    const head = document.createElement("div");
    head.className = "chunk-head";
    head.innerHTML = `<span><strong>Ref. ${c.id}</strong>${LAST_RETRIEVED.has(c.id) ? " · consultada" : ""}</span><span>p. ${c.page}</span>`;

    // Exibe a síntese em português no topo e o trecho original logo abaixo
    if (c.pt) {
      const ptPara = document.createElement("p");
      ptPara.className = "chunk-pt";
      ptPara.textContent = c.pt;
      card.append(head, ptPara);

      const det = document.createElement("details");
      det.className = "chunk-orig";
      const sum = document.createElement("summary");
      sum.textContent = "Ver texto original (inglês)";
      const origPara = document.createElement("p");
      origPara.className = "chunk-text";
      origPara.textContent = cleanPdfProse(c.text);
      det.append(sum, origPara);
      card.append(det);
    } else {
      const p = document.createElement("p");
      p.className = "chunk-text";
      p.textContent = cleanPdfProse(c.text);
      card.append(head, p);
    }
    reader.appendChild(card);
  });
}

function focusChunkInManual(chunkId) {
  const ws = $("workspace");
  ws.classList.remove("manual-hidden");
  $("toggle-manual").classList.add("active");
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

/* ---------- Recuperação Instantânea e Resposta Humanizada em Português ---------- */
function bm25(q, c) {
  let s = 0;
  for (const t of new Set(tok(q))) {
    if (t.length < 2) continue;
    const f = c.tf[t];
    if (f) s += IDF[t] * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (c.len / INDEX.avg))));
  }
  return s;
}

function retrieveFastPT(q) {
  return INDEX.chunks
    .map((c) => [c, bm25(q, c)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([c]) => c);
}

/** Procura resposta pré-computada na base RAG quando a pergunta aborda o mesmo tema. */
function findPrecomputedMatch(q) {
  if (PRECOMPUTED[q]) return PRECOMPUTED[q];
  const qTokens = new Set(tok(q).filter((w) => w.length > 2 && !STOP_PT.has(w)));
  if (!qTokens.size) return null;

  let best = null;
  let bestScore = 0;
  for (const [cachedQ, entry] of Object.entries(PRECOMPUTED)) {
    const cTokens = new Set(tok(cachedQ).filter((w) => w.length > 2 && !STOP_PT.has(w)));
    let inter = 0;
    qTokens.forEach((t) => { if (cTokens.has(t)) inter++; });
    const score = inter / Math.max(1, Math.min(qTokens.size, cTokens.size));
    if (inter >= 2 && score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 0.6 ? best : null;
}

/**
 * Monta uma resposta conversacional fluida, 100% em português, a partir das
 * sínteses em português (`c.pt`) dos trechos mais relevantes recuperados.
 */
function buildHumanizedPortugueseAnswer(q, hits) {
  const scored = hits.filter((c) => bm25(q, c) > 0);
  if (!scored.length) {
    return (
      "Procurei nas 56 páginas do manual de Pensamento Criativo do PISA, mas não encontrei uma passagem que trate diretamente desse ponto específico.\n\n" +
      "O documento foca na definição de pensamento criativo, nas três facetas do modelo de competências (gerar ideias diversas, gerar ideias criativas e avaliar/melhorar ideias), nos quatro domínios de teste (expressão escrita e visual, resolução de problemas sociais e científicos), nos critérios de pontuação e nos questionários de escola e estudantes. Se quiser explorar algum desses temas, basta perguntar!"
    );
  }

  const primary = scored[0];
  const secondary = scored.slice(1, 4);
  const parts = [];

  // Parágrafo de abertura direto e natural em português
  parts.push(`${primary.pt} [${primary.id}]`);

  if (secondary.length === 1) {
    parts.push(`Além disso, na página ${secondary[0].page}, o manual complementa que ${secondary[0].pt.charAt(0).toLowerCase() + secondary[0].pt.slice(1)} [${secondary[0].id}]`);
  } else if (secondary.length > 1) {
    parts.push("Complementando esse ponto ao longo do documento:");
    secondary.forEach((c) => {
      parts.push(`* **Página ${c.page}:** ${c.pt} [${c.id}]`);
    });
  }

  return parts.join("\n\n");
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

/* ---------- Geração em Streaming ---------- */
const textOf = (j) => j.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";

async function generateStream(q, hits, onText) {
  const ctx = hits
    .map((c) => `[${c.id}] (página ${c.page})\nResumo em português: ${c.pt || ""}\nOriginal: ${c.text}`)
    .join("\n\n");
  const contents = [];
  history.slice(-HISTORY_TURNS).forEach((h) => {
    contents.push({ role: "user", parts: [{ text: h.q }] }, { role: "model", parts: [{ text: h.a }] });
  });
  contents.push({ role: "user", parts: [{ text: `CONTEXTO:\n${ctx}\n\nPERGUNTA (responda sempre em português): ${q}` }] });

  const r = await callGeminiEndpoint(`${GEN_MODEL}:streamGenerateContent?alt=sse`, {
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents,
    generationConfig: { temperature: 0.35 },
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

/** Efeito de streaming rápido (~150ms no total) para respostas instantâneas. */
async function streamTextFast(fullText, onText) {
  const words = fullText.split(" ");
  let acc = "";
  for (let i = 0; i < words.length; i += 8) {
    acc += (i ? " " : "") + words.slice(i, i + 8).join(" ");
    onText(acc);
    await new Promise((r) => setTimeout(r, 12));
  }
  onText(fullText);
}

/* ---------- Renderização ---------- */
function fmt(text) {
  const inline = (t) => esc(t)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/\*([^*]+)\*/g, "<i>$1</i>")
    .replace(/\[(C\d+(?:\s*,\s*C\d+)*)\]/g, (_, group) =>
      group
        .split(/\s*,\s*/)
        .map((id) => `<button type="button" class="cite" data-cid="${id}" title="Ver passagem ${id} na coluna ao lado">[${id}]</button>`)
        .join("")
    );
  const out = []; let list = false;
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[*-]|\d+\.)\s+(.*)/);
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
  document.querySelector(".chat-pane").classList.add("has-messages");
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
  lab.textContent = "Passagens consultadas:";
  box.append(lab);
  hits.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `source-pill${cited.has(c.id) ? " used" : ""}`;
    btn.dataset.cid = c.id;
    btn.textContent = `${c.id} · p. ${c.page}`;
    box.append(btn);
  });
  el.append(box);
}

/* ---------- Fluxo de Consulta Rápida e 100% em Português ---------- */
async function ask(q) {
  add("user", q);
  const out = add("bot thinking", "Consultando o manual…");
  $("send").disabled = true;
  try {
    let hits = [];
    let ans = "";

    // 1. Verifica primeiro se a pergunta bate com a base analítica pré-computada (resposta imediata < 150ms)
    const cached = findPrecomputedMatch(q);
    if (cached) {
      const hitMap = new Map(INDEX.chunks.map((c) => [c.id, c]));
      hits = cached.hits.map((h) => hitMap.get(h.id)).filter(Boolean);
      ans = cached.answer;
      LAST_RETRIEVED = new Set(hits.map((c) => c.id));
      renderManual($("manual-filter").value);
      out.classList.remove("thinking");
      await streamTextFast(ans, (partial) => {
        out.innerHTML = fmt(partial);
      });
    } else if (hasLiveBackend()) {
      // 2. Com servidor/proxy ativo: busca híbrida + geração em streaming direto (sem chamada extra de condense)
      const queryWithContext = history.length
        ? `${history[history.length - 1].q} ${q}`
        : q;
      hits = await retrieve(queryWithContext);
      LAST_RETRIEVED = new Set(hits.map((c) => c.id));
      renderManual($("manual-filter").value);
      ans = await generateStream(q, hits, (t) => {
        out.classList.remove("thinking");
        out.innerHTML = fmt(t);
      });
    } else {
      // 3. No GitHub Pages estático para perguntas inéditas: busca instantânea em PT + resposta fluida em português
      const queryWithContext = history.length && q.split(/\s+/).length <= 5
        ? `${history[history.length - 1].q} ${q}`
        : q;
      hits = retrieveFastPT(queryWithContext);
      ans = buildHumanizedPortugueseAnswer(queryWithContext, hits);
      LAST_RETRIEVED = new Set(hits.map((c) => c.id));
      renderManual($("manual-filter").value);
      out.classList.remove("thinking");
      await streamTextFast(ans, (partial) => {
        out.innerHTML = fmt(partial);
      });
    }

    out.innerHTML = fmt(ans);
    addSources(out, hits, ans);
    history.push({ q, a: ans });

    const firstCited = (ans.match(/C\d+/) || [hits[0]?.id])[0];
    if (firstCited) focusChunkInManual(firstCited);
  } catch (e) {
    out.classList.remove("thinking");
    out.textContent = "Não foi possível concluir a consulta: " + e.message;
  } finally {
    $("send").disabled = false;
  }
}

/* ---------- Eventos ---------- */
const EXAMPLES = [
  "Como o PISA define pensamento criativo e quais são as três facetas avaliadas?",
  "Quais são os quatro domínios de aplicação das tarefas no teste?",
  "Como funcionam os critérios de pontuação para respostas abertas de expressão visual?",
  "Qual a relação entre pensamento criativo, práticas de professores e fatores escolares no PISA?",
  "Qual o papel de atitudes como abertura ao intelecto (openness) e autoeficácia criativa?",
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
$("toggle-manual").onclick = () => {
  const hidden = $("workspace").classList.toggle("manual-hidden");
  $("toggle-manual").classList.toggle("active", !hidden);
};
$("reset").onclick = () => {
  history.length = 0;
  $("log").innerHTML = "";
  document.querySelector(".chat-pane").classList.remove("has-messages");
  LAST_RETRIEVED.clear();
  renderManual("");
};

$("open-about").onclick = () => $("about-modal").showModal();
$("close-about").onclick = () => $("about-modal").close();
$("about-modal").onclick = (e) => { if (e.target === $("about-modal")) $("about-modal").close(); };

$("form").onsubmit = (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (q) { $("q").value = ""; ask(q); }
};
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("form").requestSubmit(); }
});

Promise.all([loadIndex(), detectConnection()]).catch(
  (e) => ($("stats").textContent = "Erro ao carregar índice: " + e.message)
);
