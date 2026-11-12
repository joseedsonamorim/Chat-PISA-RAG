/*!
 * Chat PISA — Caderno de Consulta aos Manuais do PISA (OCDE).
 * Copyright (c) 2026 José Edson Sebastião. PPGIA/UFRPE. All rights reserved
 * under the MIT License (see LICENSE). Source documents remain the property
 * of the OECD and are cited, not relicensed.
 *
 * Arquitetura Zero-Key (100% sem pedido de chave ao visitante):
 *   1. Se o servidor local (`scripts/serve_local.py`) ou `PROXY_URL` estiver
 *      ativo, utiliza a API Gemini transparente via proxy.
 *   2. No GitHub Pages estático (sem proxy), responde instantaneamente usando:
 *      (a) Correspondência semântica na base RAG pré-computada (`precomputed_qa.json`,
 *          gerada com `gemini-embedding-001` + `gemini-flash-latest`), ou
 *      (b) Recuperação BM25 bilíngue (PT->EN) sobre os 224 trechos + síntese
 *          documental estruturada com citações [Cxx], sem nunca pedir API Key.
 */
"use strict";

const PROXY_URL = "";
const GEN_MODEL = "gemini-flash-latest";
const TOP_K = 6;
const CANDIDATES = 30;
const RRF_K = 60;
const HISTORY_TURNS = 4;

const SYSTEM = `Você é um pesquisador especialista na documentação técnica do PISA (OCDE) carregada nesta ferramenta.

Como responder:
- Escreva com clareza, naturalidade e precisão acadêmica, sem clichês de IA e sem abrir com frases mecânicas como "Com base nos trechos fornecidos".
- Responda no mesmo idioma da pergunta. Vá direto ao ponto no primeiro parágrafo e depois organize os detalhes em parágrafos curtos ou tópicos quando necessário.
- Cumprimentos breves podem ser respondidos normalmente.

Rigor documental (obrigatório):
- Toda afirmação factual sobre o PISA deve vir EXCLUSIVAMENTE do CONTEXTO desta mensagem. Cada passagem tem um identificador entre colchetes, como [C12].
- Indique a referência logo após a afirmação que ela sustenta, ex.: "... [C12]". Nunca cite um código que não esteja no contexto.
- Se o contexto não trouxer a informação pedida, diga de forma direta que a passagem não consta nas páginas carregadas, mencione o que o documento aborda de mais próximo e não invente dados.
- Lembre, quando relevante, que o documento principal carregado é o Third Draft (abril de 2019) do framework de Pensamento Criativo do PISA 2021.`;

const REWRITE = `Reescreva a ÚLTIMA pergunta do usuário como uma consulta autônoma e completa para busca documental, resolvendo pronomes a partir do histórico. Mantenha o idioma original e responda APENAS com a pergunta reescrita.`;

// Expansão bilíngue PT -> EN para consultas livres em português sobre o manual em inglês
const PT_EN_MAP = {
  criativo: ["creative", "creativity"],
  criatividade: ["creative", "creativity"],
  pensamento: ["thinking", "cognitive"],
  faceta: ["facet", "facets", "competency"],
  facetas: ["facets", "facet", "competency"],
  dominio: ["domain", "domains"],
  dominios: ["domains", "domain"],
  visual: ["visual", "design", "drawing"],
  escrita: ["written", "writing", "story"],
  cientifico: ["scientific", "science"],
  social: ["social", "interpersonal"],
  pontuacao: ["scoring", "score", "coding", "rubric", "criteria"],
  pontuadas: ["scoring", "scored", "coding", "criteria"],
  avaliacao: ["assessment", "test", "evaluating", "evaluate"],
  avaliadas: ["assessed", "assessment", "evaluate"],
  ideias: ["ideas", "idea", "generation"],
  diversas: ["diverse", "divergent", "fluency", "flexibility"],
  original: ["original", "originality", "novel"],
  escola: ["school", "schools", "climate", "environment"],
  professor: ["teacher", "teachers", "pedagogy", "teaching"],
  professores: ["teachers", "teacher", "pedagogy"],
  atitude: ["attitude", "attitudes", "dispositions", "openness"],
  atitudes: ["attitudes", "openness", "self", "efficacy"],
  autoeficacia: ["efficacy", "self", "confidence"],
  inteligencia: ["intelligence", "general", "academic"],
  questionario: ["questionnaire", "questionnaires", "background"],
  proficiencia: ["proficiency", "scale", "levels", "reporting"],
};

let INDEX = null;
let PRECOMPUTED = {};
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

function expandBilingualTokens(q) {
  const base = tok(q);
  const expanded = [...base];
  base.forEach((t) => {
    if (PT_EN_MAP[t]) expanded.push(...PT_EN_MAP[t]);
  });
  return expanded;
}

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
  } catch { /* modo GitHub Pages estático */ }
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

/* ---------- Índice e Leitor Editorial ---------- */
async function loadIndex() {
  const [idxRes, qaRes] = await Promise.all([
    fetch("index.json"),
    fetch("precomputed_qa.json").catch(() => null),
  ]);
  INDEX = await idxRes.json();
  if (qaRes && qaRes.ok) {
    PRECOMPUTED = await qaRes.json();
  }

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
    opt.textContent = d.title;
    sel.appendChild(opt);
  });
  ACTIVE_DOC = docs[0].id;
  renderManual();

  $("stats").textContent = `Fonte: ${docs[0].title} (${docs[0].pages} páginas, ${N} passagens indexadas)`;
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
    const p = document.createElement("p");
    p.className = "chunk-text";
    p.textContent = cleanPdfProse(c.text);
    card.append(head, p);
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

/* ---------- Recuperação Híbrida e Motor Zero-Key ---------- */
function bm25(q, c) {
  let s = 0;
  for (const t of new Set(expandBilingualTokens(q))) {
    const f = c.tf[t];
    if (f) s += IDF[t] * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (c.len / INDEX.avg))));
  }
  return s;
}

function retrieveSparseBilingual(q) {
  return INDEX.chunks
    .map((c) => [c, bm25(q, c)])
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_K)
    .map(([c]) => c);
}

/** Procura resposta pré-computada na base RAG com alta sobreposição de termos. */
function findPrecomputedMatch(q) {
  if (PRECOMPUTED[q]) return PRECOMPUTED[q];
  const STOP = new Set(["como", "quais", "qual", "que", "sao", "para", "pelo", "pela", "dos", "das", "uma", "por", "pisa", "teste", "manual"]);
  const qTokens = new Set(tok(q).filter((w) => w.length > 2 && !STOP.has(w)));
  if (!qTokens.size) return null;

  let best = null;
  let bestScore = 0;
  for (const [cachedQ, entry] of Object.entries(PRECOMPUTED)) {
    const cTokens = new Set(tok(cachedQ).filter((w) => w.length > 2 && !STOP.has(w)));
    let inter = 0;
    qTokens.forEach((t) => { if (cTokens.has(t)) inter++; });
    const score = inter / Math.max(1, Math.min(qTokens.size, cTokens.size));
    if (inter >= 2 && score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  return bestScore >= 0.55 ? best : null;
}

/** Síntese documental local caso o usuário digite uma pergunta inédita no modo estático. */
function buildStaticSynthesis(q, hits) {
  const top = hits.slice(0, 3);
  if (!top.length || bm25(q, top[0]) === 0) {
    return `Não foram localizadas passagens específicas sobre esse termo nas páginas indexadas do manual. Consulte os tópicos principais ou utilize o campo de busca na coluna ao lado para filtrar termos diretamente no texto.`;
  }
  const lines = [
    `Nas páginas do *PISA 2021 Creative Thinking Framework (Third Draft)*, as passagens mais diretamente relacionadas à sua consulta encontram-se nas referências [${top.map((c) => c.id).join(", ")}]:`,
  ];
  top.forEach((c) => {
    const snippet = cleanPdfProse(c.text).split(/(?<=[.?!])\s+/).slice(0, 2).join(" ");
    lines.push(`* **Página ${c.page}** [${c.id}]: "${snippet}"`);
  });
  lines.push(
    `Clique em qualquer uma das referências acima (${top.map((c) => `[${c.id}]`).join(" ")}) para ler o parágrafo integral na coluna ao lado.`
  );
  return lines.join("\n");
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

/** Efeito de streaming suave para respostas da base pré-computada. */
async function streamTextLocally(fullText, onText) {
  const words = fullText.split(" ");
  let acc = "";
  for (let i = 0; i < words.length; i += 4) {
    acc += (i ? " " : "") + words.slice(i, i + 4).join(" ");
    onText(acc);
    await new Promise((r) => setTimeout(r, 18));
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
        .map((id) => `<button type="button" class="cite" data-cid="${id}" title="Ler passagem ${id} no original">[${id}]</button>`)
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

/* ---------- Fluxo de Consulta (Zero-Key) ---------- */
async function ask(q) {
  add("user", q);
  const out = add("bot thinking", "Localizando passagens no manual…");
  $("send").disabled = true;
  try {
    let hits = [];
    let ans = "";

    // 1. Verifica primeiro se há correspondência exata/semântica na base pré-computada
    const cached = findPrecomputedMatch(q);
    if (cached && !hasLiveBackend()) {
      const hitMap = new Map(INDEX.chunks.map((c) => [c.id, c]));
      hits = cached.hits.map((h) => hitMap.get(h.id)).filter(Boolean);
      ans = cached.answer;
      LAST_RETRIEVED = new Set(hits.map((c) => c.id));
      renderManual($("manual-filter").value);
      out.classList.remove("thinking");
      await streamTextLocally(ans, (partial) => {
        out.innerHTML = fmt(partial);
      });
    } else if (hasLiveBackend()) {
      // 2. Servidor local ou Proxy Serverless ativo
      const standalone = await condense(q);
      hits = await retrieve(standalone);
      LAST_RETRIEVED = new Set(hits.map((c) => c.id));
      renderManual($("manual-filter").value);
      ans = await generateStream(q, hits, (t) => {
        out.classList.remove("thinking");
        out.innerHTML = fmt(t);
      });
    } else {
      // 3. Consulta livre no GitHub Pages estático: busca BM25 bilíngue + síntese documental
      hits = retrieveSparseBilingual(q);
      ans = buildStaticSynthesis(q, hits);
      LAST_RETRIEVED = new Set(hits.map((c) => c.id));
      renderManual($("manual-filter").value);
      out.classList.remove("thinking");
      await streamTextLocally(ans, (partial) => {
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
