# Ask the PISA Manual — Sistema Conversacional em RAG Híbrido sobre o PISA (OCDE)

[![License: MIT](https://img.shields.io/badge/License-MIT-1E2A78.svg)](LICENSE)
[![PISA 2022](https://img.shields.io/badge/Corpus-PISA%20%2F%20OCDE-F59A0B.svg)](data/)
[![RAG Architecture](https://img.shields.io/badge/RAG-Hybrid%20RRF%20%2B%20Streaming-10A590.svg)](docs/app.js)

**Autor:** José Edson Sebastião — Mestrando no Programa de Pós-Graduação em Informática Aplicada (PPGIA / UFRPE)  
**Repositório Oficial:** [`https://github.com/joseedsonamorim/Chat-PISA-RAG`](https://github.com/joseedsonamorim/Chat-PISA-RAG)  
**Página Interativa (GitHub Pages):** [`https://joseedsonamorim.github.io/Chat-PISA-RAG/`](https://joseedsonamorim.github.io/Chat-PISA-RAG/)  
**Licença do Software:** MIT License (consulte [`LICENSE`](LICENSE) e [`CITATION.cff`](CITATION.cff))  
**Direitos Autorais do Corpus:** Os manuais e relatórios indexados são de propriedade intelectual exclusiva da **OCDE (OECD / PISA)** e do **INEP/MEC**, utilizados estritamente para fins de pesquisa científica e educacional com atribuição explícita de página e trecho.

---

## 1. Visão Geral

O **Ask the PISA Manual** é uma aplicação web de *Retrieval-Augmented Generation* (RAG) conversacional inspirada no paradigma *Ask the Manual* (Google AI Studio) e projetada como parte de pesquisa de Mestrado no **PPGIA/UFRPE**.

O sistema permite que pesquisadores, educadores e gestores públicos conversem em linguagem natural (português ou inglês) com a documentação oficial do **PISA (Programme for International Student Assessment)**, garantindo:

1. **Domínio Estritamente Fechado (*Zero Open-Web Hallucination*):** Nenhuma consulta à internet aberta é realizada. Toda afirmação factual é ancorada nos trechos oficiais recuperados e acompanhada de pílulas interativas de citação (`[C107]`, `[C120]`).
2. **Inspetor Interativo do Manual (Duas Colunas):** Ao clicar em qualquer citação `[Cxx]` dentro da resposta do assistente, o painel lateral direito rola automaticamente até o trecho exato do documento original, exibindo a página correspondente e permitindo filtragem instantânea por termo ou número de página.
3. **Diálogo Multi-Turno Humanizado em Tempo Real:** Perguntas de acompanhamento (*follow-ups*) passam por uma etapa de **Condensação Conversacional** ($T = 0.0$) antes da busca vetorial, e a resposta final é transmitida em *streaming* via *Server-Sent Events* ($T = 0.4$).
4. **Atualização Automática Contínua (CI/CD):** Um pipeline agendado no **GitHub Actions** ([`.github/workflows/sync_pisa_docs.yml`](.github/workflows/sync_pisa_docs.yml)) verifica periodicamente novos documentos oficiais, valida integridade por hash `SHA-256` e reconstrói o índice vetorial (`docs/index.json`).

---

## 2. Arquitetura do Sistema e Estrutura de Diretórios

```
Chat-PISA-RAG/
├── .github/workflows/
│   └── sync_pisa_docs.yml       # CI/CD: sincronização semanal e rebuild automático do índice
├── docs/                        # Aplicação Web Estática (publicada pelo GitHub Pages)
│   ├── index.html               # Interface duas colunas (Chat + Inspetor do Manual)
│   ├── style.css                # Design system PISA 2022 (Rubik, Navy #1E2A78, Teal #10A590, Amber #F59A0B)
│   ├── app.js                   # Motor RAG no cliente: Condense + Hybrid RRF + SSE + Document Inspector
│   ├── index.json               # Índice vetorial + Manifesto documental (SHA-256, páginas, embeddings 768d)
│   ├── evaluation_benchmark.csv # Auditoria experimental reprodutível (BM25 vs. Dense vs. Hybrid RRF)
│   └── .nojekyll                # Desativa processamento Jekyll no GitHub Pages
├── proxy/
│   └── cloudflare_worker.js     # Proxy Serverless gratuito (Zero-Key UX no GitHub Pages sem expor a chave)
├── scripts/
│   ├── rag_utils.py             # Extração por página (PyMuPDF) e chunking consciente de parágrafo
│   ├── build_index.py           # Indexador offline (gemini-embedding-001, 768 dims, normalização L2)
│   ├── sync_pisa_docs.py        # Verificador de atualizações de PDFs oficiais (OCDE / INEP) por SHA-256
│   ├── evaluate_rag.py          # Benchmark científico (HitRate@6, Precision@6, MRR@6)
│   └── serve_local.py           # Servidor local com proxy embutido (/api/gemini/*) sem pedir chave na UI
├── data/                        # Documentos-fonte oficiais em PDF
├── LICENSE                      # Licença MIT + Aviso de Direitos Autorais OCDE
├── CITATION.cff                 # Metadados oficiais de citação científica (GitHub Citation)
└── README.md
```

---

## 3. Metodologia de Recuperação e Avaliação Científica

### 3.1 Pipeline de Indexação e Busca Híbrida (*Reciprocal Rank Fusion*)
1. **Segmentação (*Chunking*):** Cada página dos PDFs oficiais é segmentada em janelas de até `1.000` caracteres com sobreposição (*overlap*) de `150` caracteres, preservando limites de parágrafo e metadados de origem (`doc`, `page`, `id`).
2. **Recuperação Densa (*Cross-Lingual Embeddings*):** Utiliza o modelo `gemini-embedding-001` reduzido para `768` dimensões via *Matryoshka Representation Learning* e renormalizado na norma $\ell_2$, permitindo consultas em português sobre documentos originais em inglês.
3. **Recuperação Esparsa (*BM25*):** Calculada diretamente no navegador ($k_1 = 1.2, b = 0.75$) para assegurar precisão lexical em siglas, códigos de variáveis (ex.: `ESCS`, `ICTRES`) e termos técnicos.
4. **Fusão Híbrida (RRF):** Os 30 melhores candidatos de cada recuperador são combinados por *Reciprocal Rank Fusion* (Cormack et al., 2009) com constante $k_{\text{RRF}} = 60$:
   $$\text{RRF}(d) = \sum_{m \in \{\text{Dense}, \text{BM25}\}} \frac{1}{60 + \text{rank}_m(d)}$$

### 3.2 Resultados do Benchmark Experimental (`scripts/evaluate_rag.py`)
Avaliação auditável executada sobre o conjunto de referência com $k = 6$ trechos recuperados por consulta (dados completos em [`docs/evaluation_benchmark.csv`](docs/evaluation_benchmark.csv)):

| Método de Recuperação | HitRate@6 | Precision@6 | MRR@6 | Análise Técnica |
|---|---:|---:|---:|---|
| **BM25 (Esparso)** | 0,667 | 0,194 | 0,389 | Sensível à barreira de idioma (consulta PT $\to$ documento EN), atuando como âncora para siglas e termos cognatos. |
| **Dense (`gemini-embedding-001`)** | **1,000** | **0,639** | **0,917** | Alinhamento semântico cross-lingue superior, encontrando a página correta no top-1 na maioria das questões. |
| **Hybrid (`Dense + BM25 via RRF`)** | **1,000** | 0,528 | 0,833 | Mantém **100% de revocação (HitRate@6)** enquanto injeta diversidade lexical para termos exatos do manual. |

---

## 4. Como Executar Localmente e Atualizar o Corpus

### 4.1 Executar na sua máquina (Sem digitar API Key na tela)
O script [`scripts/serve_local.py`](scripts/serve_local.py) lê automaticamente sua `GEMINI_API_KEY` do ambiente ou do arquivo `.env` e habilita um proxy local transparente em `/api/gemini/*`:
```bash
python3 scripts/serve_local.py
# Acesse http://localhost:8765 no navegador
```

### 4.2 Adicionar novos PDFs do PISA (ou resultados da pesquisa)
```bash
# 1. Coloque novos PDFs na pasta data/ ou rode o sincronizador automático:
python3 scripts/sync_pisa_docs.py

# 2. Reconstrua o índice vetorial (docs/index.json):
GEMINI_API_KEY="AIzaSy..." PYTHONPATH=scripts python3 scripts/build_index.py

# 3. (Opcional) Reexecute o benchmark acadêmico:
GEMINI_API_KEY="AIzaSy..." PYTHONPATH=scripts python3 scripts/evaluate_rag.py
```

---

## 5. Como Publicar no GitHub Pages (Passo a Passo)

1. **Envie os arquivos para o GitHub** (pelo **GitHub Desktop** ou via terminal):
   ```bash
   git add -A
   git commit -m "feat: release Ask the PISA Manual hybrid RAG v1.0.0"
   git push -u origin main
   ```
2. **Ative o GitHub Pages no repositório:**
   - Acesse `https://github.com/joseedsonamorim/Chat-PISA-RAG/settings/pages`.
   - Em **Build and deployment → Source**, selecione **Deploy from a branch**.
   - Em **Branch**, selecione **`main`** e a pasta **`/docs`**, e clique em **Save**.
   - Aguarde ~1 minuto e acesse: **`https://joseedsonamorim.github.io/Chat-PISA-RAG/`**.
3. **Ative a atualização automática de documentos (GitHub Actions):**
   - Em `Settings → Secrets and variables → Actions`, clique em **New repository secret**.
   - Nome: `GEMINI_API_KEY` | Valor: sua chave `AIzaSy...` do Google AI Studio.
4. **(Opcional) Habilitar uso público sem pedir chave aos visitantes (`Zero-Key Proxy`):**
   - Crie um Worker gratuito em `https://dash.cloudflare.com/` colando o conteúdo de [`proxy/cloudflare_worker.js`](proxy/cloudflare_worker.js).
   - Adicione o Secret `GEMINI_API_KEY` nas configurações do Worker e cole a URL gerada na constante `PROXY_URL` no topo de [`docs/app.js`](docs/app.js).

---

## 6. Como Citar este Trabalho

> SEBASTIÃO, José Edson. **Ask the PISA Manual — Sistema Conversacional de Recuperação Aumentada por Geração (RAG) Híbrido sobre a Documentação do PISA**. Programa de Pós-Graduação em Informática Aplicada (PPGIA), Universidade Federal Rural de Pernambuco (UFRPE), Recife, 2026. Licença MIT. Disponível em: https://github.com/joseedsonamorim/Chat-PISA-RAG.
