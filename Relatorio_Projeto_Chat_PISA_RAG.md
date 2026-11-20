# Caderno de Consulta aos Manuais do PISA via RAG Híbrido: Arquitetura, Avaliação Experimental e Sinergia com a Pesquisa sobre Resiliência Criativa no Brasil

---

**Instituição:** Universidade Federal Rural de Pernambuco (UFRPE)  
**Programa:** Programa de Pós-Graduação em Informática Aplicada (PPGIA) — Mestrado  
**Disciplina:** Mineração de Texto (2026.2) — 2ª Verificação de Aprendizagem (2ª VA)  
**Docente:** Prof. Dr. Rafael Ferreira Leite de Mello  
**Discente:** José Edson Sebastião (`joseedson.sebastiao@ufrpe.br`)  
**Data:** Novembro de 2026  
**Repositório Oficial:** https://github.com/joseedsonamorim/Chat-PISA-RAG  
**Aplicação Web (GitHub Pages):** https://joseedsonamorim.github.io/Chat-PISA-RAG/

---

## Resumo

**Contexto:** A interpretação rigorosa dos resultados do *Programme for International Student Assessment* (PISA), conduzido pela OCDE, exige consulta constante a manuais técnicos extensos publicados majoritariamente em língua inglesa. Modelos de linguagem de uso geral (*Large Language Models* — LLMs) frequentemente produzem alucinações factuais, mesclam definições de diferentes ciclos avaliativos e não oferecem rastreabilidade em nível de página. **Objetivo:** Projetar, implementar e avaliar um sistema conversacional de Recuperação Aumentada por Geração (*Retrieval-Augmented Generation* — RAG) híbrido em domínio estritamente fechado sobre a documentação oficial do PISA, articulado à dissertação de mestrado do autor sobre resiliência criativa entre estudantes brasileiros socioeconomicamente vulneráveis. **Método:** O protótipo (versão 1.0.0) segmenta o *PISA 2021 Creative Thinking Framework (Third Draft)* (56 páginas) em 224 passagens com janela deslizante consciente de parágrafo (`1.000` caracteres, sobreposição de `150`), vetorizadas com o modelo `gemini-embedding-001` truncado via *Matryoshka Representation Learning* em `768` dimensões normalizadas ($\ell_2 = 1$). Todas as 224 passagens foram enriquecidas com sínteses explicativas em português (`c.pt`). No navegador do usuário (arquitetura estática sem servidor dedicado), a recuperação combina busca densa semântica e busca esparsa **BM25** bilíngue ($k_1 = 1{,}2$; $b = 0{,}75$) por meio de *Reciprocal Rank Fusion* ($k_{\text{RRF}} = 60$). A interface adota desenho editorial em duas colunas com citações clicáveis que localizam o parágrafo original. **Resultados:** Em avaliação separada da recuperação sobre seis questões analíticas auditadas ($k = 6$), o recuperador esparso BM25 sobre os textos originais obteve `HitRate@6 = 0,667`, `Precision@6 = 0,194` e `MRR@6 = 0,389`, falhando integralmente em duas consultas devido à barreira linguística português–inglês. Em contrapartida, tanto a busca densa (`HitRate@6 = 1,000`; `Precision@6 = 0,639`; `MRR@6 = 0,917`) quanto a fusão híbrida RRF (`HitRate@6 = 1,000`; `Precision@6 = 0,528`; `MRR@6 = 0,833`) atingiram revocação máxima no topo da lista. A indexação posterior das sínteses em português permitiu ainda respostas em linguagem natural com latência inferior a `500 ms` no modo estático. **Conclusão:** O sistema satisfaz critérios acadêmicos de rastreabilidade documental, reprodutibilidade experimental, busca responsável e acessibilidade pública via GitHub Pages sem requerer exposição de credenciais do usuário visitante, estabelecendo a infraestrutura para a etapa final (3ª VA) de integração de resultados tabulares regionais da pesquisa de mestrado.

**Palavras-chave:** Mineração de Texto; *Retrieval-Augmented Generation*; Busca Híbrida; *Reciprocal Rank Fusion*; PISA; Pensamento Criativo; Resiliência Educacional.

---

## Abstract

**Background:** Rigorous interpretation of OECD PISA frameworks requires frequent consultation of extensive technical manuals written primarily in English. General-purpose Large Language Models (LLMs) suffer from factual hallucinations, conflate assessment cycles, and lack page-level traceability. **Objective:** To design, implement, and evaluate a closed-domain hybrid Retrieval-Augmented Generation (RAG) conversational assistant over official PISA documentation, aligned with the author's Master's research on creative resilience among socioeconomically disadvantaged Brazilian students. **Method:** The 56-page *PISA 2021 Creative Thinking Framework (Third Draft)* was split into 224 paragraph-aware chunks (`1,000` characters, `150`-character overlap), embedded into `768`-dimensional $\ell_2$-normalized vectors via `gemini-embedding-001`, and enriched with Portuguese analytical summaries (`c.pt`). The static web application fuses dense cosine retrieval and bilingual BM25 ($k_1 = 1.2$, $b = 0.75$) via Reciprocal Rank Fusion ($k_{\text{RRF}} = 60$), featuring an editorial two-column interface with clickable inline citations. **Results:** In standalone retrieval evaluation ($k = 6$) with Portuguese queries against the English corpus, sparse BM25 achieved `HitRate@6 = 0.667`, `Precision@6 = 0.194`, and `MRR@6 = 0.389`, whereas dense retrieval (`HitRate@6 = 1.000`, `Precision@6 = 0.639`, `MRR@6 = 0.917`) and Hybrid RRF (`HitRate@6 = 1.000`, `Precision@6 = 0.528`, `MRR@6 = 0.833`) achieved complete top-6 recall. **Conclusion:** The architecture delivers transparent, reproducible, zero-key closed-domain question answering, preparing the integration of aggregated Brazilian regional resilience tables in the final course milestone.

---

## 1. Introdução e Contextualização Científica

A avaliação internacional **PISA** (*Programme for International Student Assessment*), coordenada pela Organização para a Cooperação e Desenvolvimento Econômico (**OCDE**), constitui uma das principais referências empíricas para políticas públicas educacionais em escala global. No ciclo mais recente cujos microdados já se encontram publicados, o exame incorporou o domínio inovador de **Pensamento Criativo** (*Creative Thinking*), originalmente projetado para o ciclo de 2021 e aplicado em 2022 em função do adiamento decorrente da pandemia de COVID-19 — fundamentado em evidências psicométricas sobre autoeficácia criativa e a relação entre criatividade e desempenho escolar (BEGHETTO, 2006; GAJDA; KARWOWSKI; BEGHETTO, 2017; OECD, 2019; INEP, 2023).

No âmbito do Programa de Pós-Graduação em Informática Aplicada (**PPGIA/UFRPE**), a pesquisa de dissertação do autor investiga os fatores preditores de **resiliência criativa** entre estudantes brasileiros em situação de vulnerabilidade socioeconômica nos microdados oficiais do PISA 2022 (`10.798` estudantes distribuídos em `598` escolas, dos quais `2.530` pertencem ao quartil inferior ponderado do índice socioeconômico `ESCS` em `504` escolas, utilizando `10` *plausible values* combinados pelas regras de múltiplas imputações de Rubin (RUBIN, 1987) e `80` pesos replicados BRR). Após revisão metodológica com normalização de pesos amostrais e divisão treino/teste estratificada por escola, verificou-se prevalência ponderada de **11,9%** de estudantes criativamente resilientes (IC 95%: `10,0%` a `13,9%`, erro padrão de `0,98` p.p.), liderando na modelagem preditiva a regressão logística com desenho amostral (`ROC-AUC = 0,761`) e destacando-se como preditores associados a série cursada (`GRADE`, OR = `1,87`; $p_{\text{BH}} = 0{,}006$), confiança no uso de TIC (`ICTEFFIC`, OR = `1,32`; $p_{\text{BH}} = 0{,}006$), curiosidade (`CURIOAGR`, OR = `1,30`; $p_{\text{BH}} = 0{,}060$) e assertividade (`ASSERAGR`, OR = `1,23`; $p_{\text{BH}} = 0{,}108$).

Esse contexto de pesquisa evidencia uma necessidade prática recorrente em ciência de dados educacionais: **a consulta ágil, precisa e verificável aos documentos metodológicos e matrizes teóricas da OCDE**, redigidos originalmente em inglês e com forte densidade terminológica (definições de facetas, domínios de aplicação, rubricas de correção de itens abertos e constructos de questionários contextuais). Embora assistentes comerciais baseados em LLMs possam responder perguntas gerais sobre o PISA, seu uso irrestrito em investigação acadêmica apresenta três fragilidades críticas:

1. **Alucinação paramétrica:** geração de definições plausíveis na forma, porém inexistentes ou distorcidas em relação ao manual específico utilizado na pesquisa;
2. **Contaminação temporal e interciclos:** mistura involuntária de regras do ciclo de 2018, do rascunho de 2021 e de notas nacionais posteriores por meio de memória paramétrica ou busca aberta na web;
3. **Ausência de rastreabilidade auditável:** incapacidade de apontar o identificador da passagem e o número exato da página do PDF oficial para conferência imediata pelo pesquisador ou por membros de banca.

Para endereçar esse problema no escopo da disciplina de **Mineração de Texto (2026.2)**, desenvolveu-se o sistema **PISA 2022 · Caderno de Consulta aos Manuais**, uma aplicação web de **Recuperação Aumentada por Geração (RAG) híbrida** em domínio fechado, acessível publicamente via GitHub Pages e desenhada para operar também como infraestrutura de consulta às futuras tabelas agregadas da dissertação.

---

## 2. Fundamentação Teórica

### 2.1 Limitações de Modelos Paramétricos e Paradigma RAG
Sistemas puramente baseados em conhecimento paramétrico armazenado nos pesos da rede neural apresentam dificuldade de atualização e ausência de proveniência explícita (LEWIS et al., 2020). A arquitetura **RAG** (*Retrieval-Augmented Generation*) desacopla a capacidade de síntese linguística do gerador (LLM) da memória documental não paramétrica (índice externo). Formalmente, dada uma consulta $q$ e um corpus segmentado em passagens $\mathcal{D} = \{c_1, \dots, c_N\}$, um módulo recuperador $\mathcal{R}(q, \mathcal{D})$ seleciona o subconjunto $\mathcal{C}_k \subset \mathcal{D}$ ($|\mathcal{C}_k| = k$) mais pertinente, que é então condicionado no *prompt* do gerador $\mathcal{G}(q, \mathcal{C}_k)$ sob restrição explícita de atribuição de evidência e abstenção controlada.

### 2.2 Recuperação Esparsa (BM25) versus Recuperação Densa (*Cross-Lingual*)
A recuperação lexical clássica via **Okapi BM25** (ROBERTSON; ZARAGOZA, 2009) atribui relevância ponderando a frequência dos termos da consulta no documento, controlada por saturação ($k_1 = 1{,}2$) e normalização pelo comprimento relativo da passagem ($b = 0{,}75$):

$$\text{BM25}(q, c) = \sum_{t \in q} \text{IDF}(t) \cdot \frac{\text{tf}(t, c) \cdot (k_1 + 1)}{\text{tf}(t, c) + k_1 \cdot \left(1 - b + b \cdot \frac{|c|}{\text{avgdl}}\right)}$$

O BM25 destaca-se em correspondências literais de siglas, identificadores e jargão específico (por exemplo, `ESCS`, `ICTRES`, `Field Trial`), mas degrada severamente quando há incompatibilidade vocabular (*vocabulary mismatch*) ou mudança de idioma entre a pergunta (em português) e o documento-fonte (em inglês).

Em contraste, a **recuperação densa** projeta consultas e passagens em um espaço vetorial semântico contínuo $\mathbb{R}^d$ mediante codificadores neurais pré-treinados, avaliando a proximidade pela similaridade de cosseno. Ao utilizar o modelo `gemini-embedding-001` com truncamento dimensional via *Matryoshka Representation Learning* ($d = 768$) (KUSUPATI et al., 2022) e renormalização $\ell_2$ ($\|\mathbf{v}\|_2 = 1$), o produto escalar $\mathbf{e}_q \cdot \mathbf{e}_c$ equivale exatamente ao cosseno e preserva alinhamento semântico *cross-lingue* (consultas em português recuperam passagens conceitualmente equivalentes em inglês).

### 2.3 Fusão Híbrida via *Reciprocal Rank Fusion* (RRF)
Para combinar sinais ortogonais de recuperação semântica (densa) e lexical (esparsa) sem depender de calibração frágil entre escalas heterogêneas de pontuação, adota-se o algoritmo **Reciprocal Rank Fusion (RRF)** (CORMACK; CLARKE; BUETTCHER, 2009):

$$\text{RRF}(c) = \sum_{m \in \{\text{Dense}, \text{BM25}\}} \frac{1}{k_{\text{RRF}} + \text{rank}_m(c)}, \quad \text{com } k_{\text{RRF}} = 60$$

onde $\text{rank}_m(c)$ é a posição (base 1) da passagem $c$ no ranking do recuperador $m$ dentro de um *pool* candidato (`CANDIDATES = 30`). A constante de suavização $k_{\text{RRF}} = 60$ atenua outliers de um único ranqueador e prioriza passagens sustentadas simultaneamente por afinidade semântica e ancoragem lexical.

---

## 3. Arquitetura e Engenharia de Software do Sistema

O projeto foi estruturado sob boas práticas de engenharia de software para sistemas RAG reprodutíveis, separando o **pipeline *offline* de ingestão, indexação e avaliação** (`scripts/`) da **aplicação web estática *zero-backend*** (`docs/`), complementada por automação **CI/CD** (`.github/workflows/`) e opção de proxy serverless (`proxy/`).

```
Chat-PISA-RAG/
├── .github/workflows/
│   └── sync_pisa_docs.yml       # Sincronização semanal automática e rebuild do índice
├── data/
│   └── PISA_2021_Creative_Thinking_Framework.pdf   # Corpus oficial OCDE (56 páginas)
├── docs/                        # Aplicação Web Estática (GitHub Pages)
│   ├── index.html               # Estrutura editorial em duas colunas + modal acadêmico
│   ├── style.css                # Sistema visual Swiss Grid (Newsreader + Rubik)
│   ├── app.js                   # Motor RAG no cliente (BM25 + Dense/RRF + Streaming + Leitor)
│   ├── index.json               # Índice vetorial (224 chunks, 768d L2, sínteses PT, SHA-256)
│   ├── precomputed_qa.json      # Base analítica pré-computada (12 questões em português)
│   ├── evaluation_benchmark.csv # Métricas auditáveis do benchmark de recuperação
│   └── .nojekyll                # Desativa Jekyll no GitHub Pages
├── proxy/
│   └── cloudflare_worker.js     # Proxy serverless opcional (Zero-Key sem expor chave)
├── scripts/
│   ├── rag_utils.py             # Extração por página (PyMuPDF) e chunking com overlap
│   ├── build_index.py           # Indexação offline, normalização L2 e manifesto SHA-256
│   ├── enrich_pt_corpus.py      # Geração de sínteses explicativas em PT para os 224 chunks
│   ├── sync_pisa_docs.py        # Verificador de atualizações em fontes oficiais (OCDE/INEP)
│   ├── evaluate_rag.py          # Benchmark reprodutível (HitRate@6, Precision@6, MRR@6)
│   └── serve_local.py           # Servidor HTTP local com proxy /api/gemini/* transparente
├── CITATION.cff                 # Metadados acadêmicos de citação (Citation File Format 1.2.0)
├── LICENSE                      # Licença MIT + Aviso de Direitos Autorais OCDE
└── README.md
```

### 3.1 Ingestão, Segmentação e Enriquecimento Bilíngue
- **Extração e Segmentação (`scripts/rag_utils.py` e `scripts/build_index.py`):** O documento `PISA_2021_Creative_Thinking_Framework.pdf` (56 páginas; prefixo SHA-256 `2681ff76ebcc1805`) é extraído página a página via PyMuPDF (`iter_pdfs`, `extract_pages`). A função `chunk_text` agrupa parágrafos em janelas fixas máximas de `1.000` caracteres com sobreposição (*overlap*) de `150` caracteres, descartando ruídos de cabeçalho inferiores a `60` caracteres. Esse processo gerou exatamente **`224` passagens** identificadas sequencialmente de `C1` a `C224`.
- **Vetorização e Normalização (`scripts/build_index.py`):** Cada passagem recebe um vetor `gemini-embedding-001` (`task_type="RETRIEVAL_DOCUMENT"`) truncado para `768` dimensões e normalizado pela norma $\ell_2$ antes da serialização em `docs/index.json`.
- **Enriquecimento em Português (`scripts/enrich_pt_corpus.py`):** Para assegurar fluidez linguística em língua portuguesa tanto na leitura do manual quanto em consultas rápidas sem latência de API no ambiente estático, todas as `224` passagens receberam uma síntese explicativa natural em português do Brasil (`c.pt`), gerada em lotes controlados e persistida no índice.

### 3.2 Motor de Recuperação no Cliente e Operação *Zero-Key*
Um desafio crítico de aplicações RAG publicadas em repositórios estáticos (GitHub Pages) é a segurança de credenciais: chaves REST da API Gemini (`AIzaSy...`) inseridas em código-fonte público são detectadas por *Secret Scanning* e revogadas automaticamente, enquanto exigir que avaliadores ou docentes criem e colem uma API Key própria gera fricção de uso.

A arquitetura implementada em `docs/app.js` resolve esse impasse em três camadas transparentes:
1. **Base RAG Analítica Pré-Computada (`docs/precomputed_qa.json`):** `12` consultas centrais sobre o framework (definição de pensamento criativo, facetas, domínios de aplicação, rubricas de expressão visual, práticas docentes, abertura ao intelecto, resolução de problemas sociais/científicos, motivação da OCDE, relação com inteligência geral, *Evidence-Centred Design*, questionários contextuais e níveis de proficiência) foram executadas *offline* pelo pipeline completo (Dense + BM25 + RRF + `gemini-flash-latest`) e armazenadas com as referências exatas de passagens (`hits`). Consultas semanticamente equivalentes são reconhecidas por sobreposição lexical ponderada ($\ge 0{,}60$) e transmitidas ao usuário em efeito *streaming* instantâneo.
2. **Motor Local Bilíngue de Alta Velocidade (`< 500 ms`):** No cliente web, o índice BM25 indexa simultaneamente os tokens originais em inglês (`c.text`, peso 1) e os tokens das sínteses em português (`c.pt`, peso 2). Para perguntas inéditas em ambiente estático sem servidor, o motor recupera as `TOP_K = 6` passagens mais relevantes em menos de `5 ms` e compõe uma resposta humanizada em português articulando as sínteses recuperadas e suas citações clicáveis (`[C101]`, `[C103]`).
3. **Execução com LLM ao Vivo (`scripts/serve_local.py` e `proxy/cloudflare_worker.js`):** Quando executado via servidor local (`python3 scripts/serve_local.py`, que lê `.env` no backend sem expor a chave ao navegador) ou conectado a um Cloudflare Worker via `PROXY_URL`, o sistema aciona a busca híbrida completa (cosseno sobre `768d` + BM25 + RRF `k=60`) e gera respostas conversacionais em tempo real via *Server-Sent Events* (SSE) com `gemini-2.5-flash` ($T = 0{,}35$), mantendo histórico de até `HISTORY_TURNS = 4` turnos.

### 3.3 Interface Editorial Suíça e Rastreabilidade Documental
A interface web (`docs/index.html`, `docs/style.css`) foi refinada com direção de arte editorial (*Swiss Grid*), abandonando elementos visuais artificiais em favor de legibilidade acadêmica em qualquer largura de tela (desktop, tablet e smartphone):
- **Coluna Esquerda (Menor, `380px`):** Leitor do documento original em fundo de papel quente (`#F7F6F2`) e tipografia serifada editorial (*Newsreader*). A função `cleanPdfProse` remove cabeçalhos repetitivos (`For Official Use`) e junta quebras de linha artificiais do PDF; cada bloco exibe a explicação em português e mantém o texto original em inglês expansível para auditoria, além de filtro instantâneo por palavra, página (`p. 25`) ou código (`C107`).
- **Coluna Direita (Maior, em destaque):** Área de conversa (*Rubik*, largura ótima de leitura de `680px`). Ao enviar a primeira consulta, a tela inicial de sugestões é ocultada automaticamente (`.has-messages`). Todas as citações (`[C96]`) aparecem como **notas bibliográficas sobrescritas clicáveis**: ao clicar em qualquer nota, a coluna esquerda rola suavemente até a passagem exata e a destaca com faixa âmbar.
- **Página Flutuante "Sobre a pesquisa":** Modal (`<dialog>`) acessível no cabeçalho superior com os metadados do autor, PPGIA/UFRPE, disciplina, método e licença MIT/OCDE.

### 3.4 Atualização Contínua (CI/CD)
Para manter a documentação alinhada a novas publicações oficiais da OCDE e do INEP, o módulo `scripts/sync_pisa_docs.py` verifica catálogos remotos via hash criptográfico **SHA-256** (`data/catalog_manifest.json`). O workflow agendado no GitHub Actions (`.github/workflows/sync_pisa_docs.yml`) executa semanalmente ou a cada *push* de novos PDFs em `data/`, reconstruindo `docs/index.json` automaticamente sempre que há alteração documental.

---

## 4. Metodologia Experimental e Avaliação

Em conformidade com as boas práticas de avaliação de sistemas RAG, o componente de **recuperação (*retrieval*)** foi avaliado separadamente da **geração (*generation*)** mediante o script reprodutível `scripts/evaluate_rag.py`, utilizando um conjunto de referência (*ground truth*) auditado manualmente com seis questões analíticas formuladas em português sobre o documento em inglês ($k = 6$):

- **Q1:** *Como o framework do PISA define pensamento criativo (creative thinking)?* (páginas-alvo: `7, 8, 24, 25`)
- **Q2:** *Quais são as três facetas principais avaliadas no modelo de competência de pensamento criativo?* (páginas-alvo: `22, 23, 24, 25, 26, 27`)
- **Q3:** *Quais são os quatro domínios de conteúdo nos quais o teste de pensamento criativo é aplicado?* (páginas-alvo: `3, 4, 19, 20, 21, 22, 26`)
- **Q4:** *Como são pontuadas as tarefas abertas de expressão visual e escrita?* (páginas-alvo: `28, 29, 30, 32, 33, 34`)
- **Q5:** *Qual o papel de atitudes como abertura ao intelecto (openness) e autoeficácia criativa?* (páginas-alvo: `11, 13, 14, 45`)
- **Q6:** *Como fatores escolares e práticas de professores se relacionam com o pensamento criativo no PISA?* (páginas-alvo: `5, 6, 16, 45, 46`)

Foram computadas três métricas clássicas de Recuperação de Informação no corte $k = 6$:
- **HitRate@6:** proporção de consultas em que ao menos uma passagem de página relevante figura entre as 6 primeiras recuperadas;
- **Precision@6:** fração média de passagens relevantes entre as 6 recuperadas ($\frac{\text{relevantes no top-6}}{6}$);
- **MRR@6 (*Mean Reciprocal Rank*):** média do inverso da posição da primeira passagem relevante ($\frac{1}{\text{rank}_1}$).

### 4.1 Resultados Quantitativos por Método e por Questão

Os resultados brutos salvos em `docs/evaluation_benchmark.csv` são detalhados na Tabela 1 e consolidados na Tabela 2.

**Tabela 1 — Desempenho detalhado por questão ($k = 6$, consultas em PT sobre texto original em EN).**

| Questão | Método | HitRate@6 | Precision@6 | MRR@6 | Top-6 Chunks Recuperados |
|---|---|---:|---:|---:|---|
| **Q1** | BM25 | 1,000 | 0,333 | 1,000 | `C21(p7) C161(p40) C74(p18) C214(p53) C23(p7) C2(p3)` |
| **Q1** | Dense | 1,000 | 0,167 | 1,000 | `C27(p8) C96(p22) C11(p5) C74(p18) C45(p12) C77(p18)` |
| **Q1** | Hybrid_RRF | 1,000 | 0,333 | 0,500 | `C74(p18) C21(p7) C11(p5) C2(p3) C27(p8) C98(p23)` |
| **Q2** | BM25 | **0,000** | **0,000** | **0,000** | `C204(p51) C222(p56) C168(p41) C159(p40) C80(p19) C167(p41)` |
| **Q2** | Dense | 1,000 | **1,000** | 1,000 | `C97(p22) C96(p22) C98(p23) C116(p27) C108(p25) C109(p25)` |
| **Q2** | Hybrid_RRF | 1,000 | 0,333 | 1,000 | `C107(p25) C40(p10) C125(p29) C30(p8) C97(p22) C204(p51)` |
| **Q3** | BM25 | 1,000 | 0,167 | 0,167 | `C214(p53) C222(p56) C167(p41) C168(p41) C56(p14) C112(p26)` |
| **Q3** | Dense | 1,000 | 0,500 | 1,000 | `C97(p22) C82(p19) C100(p23) C90(p21) C117(p27) C35(p9)` |
| **Q3** | Hybrid_RRF | 1,000 | **0,667** | 1,000 | `C112(p26) C111(p26) C117(p27) C97(p22) C214(p53) C82(p19)` |
| **Q4** | BM25 | 1,000 | 0,167 | 0,167 | `C222(p56) C88(p21) C89(p21) C111(p26) C167(p41) C141(p33)` |
| **Q4** | Dense | 1,000 | 0,667 | 0,500 | `C87(p20) C141(p33) C123(p28) C143(p34) C113(p26) C128(p29)` |
| **Q4** | Hybrid_RRF | 1,000 | 0,500 | **1,000** | `C141(p33) C87(p20) C123(p28) C111(p26) C143(p34) C88(p21)` |
| **Q5** | BM25 | 1,000 | 0,500 | 1,000 | `C53(p13) C52(p13) C214(p53) C222(p56) C51(p13) C167(p41)` |
| **Q5** | Dense | 1,000 | 0,833 | 1,000 | `C50(p13) C51(p13) C53(p13) C56(p14) C194(p48) C52(p13)` |
| **Q5** | Hybrid_RRF | 1,000 | 0,833 | 1,000 | `C53(p13) C51(p13) C52(p13) C50(p13) C56(p14) C192(p47)` |
| **Q6** | BM25 | **0,000** | **0,000** | **0,000** | `C204(p51) C214(p53) C222(p56) C82(p19) C167(p41) C159(p40)` |
| **Q6** | Dense | 1,000 | 0,667 | 1,000 | `C65(p16) C14(p5) C7(p3) C188(p46) C185(p45) C39(p10)` |
| **Q6** | Hybrid_RRF | 1,000 | 0,500 | 0,500 | `C208(p52) C67(p16) C65(p16) C204(p51) C14(p5) C214(p53)` |

**Tabela 2 — Médias agregadas do benchmark de recuperação ($N = 6$ questões, $k = 6$).**

| Método | HitRate@6 | Precision@6 | MRR@6 | Diagnóstico Técnico |
|---|---:|---:|---:|---|
| **BM25 (Esparso)** | 0,667 | 0,194 | 0,389 | Falha completa em Q2 e Q6 quando não há cognatos lexicais entre PT e EN. |
| **Dense (`gemini-embedding-001`)** | **1,000** | **0,639** | **0,917** | Máxima densidade de evidência (`1,000` em Q2) e forte alinhamento *cross-lingue*. |
| **Hybrid (`Dense + BM25 via RRF`)** | **1,000** | 0,528 | 0,833 | Mantém **100% de revocação**; supera Dense isolado em **Q3** (`P@6`: `0,667` vs. `0,500`) e **Q4** (`MRR@6`: `1,000` vs. `0,500`). |

### 4.2 Análise Comparativa e Evolução em Relação à 1ª VA
Os números das Tabelas 1 e 2 revelam fenômenos importantes para a engenharia de RAG em corpus educacionais:
1. **Superação da falha crítica nas rubricas de expressão visual (Q4):** Na atividade exploratória da 1ª VA (*RAG in Practice*), consultas sobre pontuação de expressão visual falharam na etapa de recuperação porque definições genéricas superaram as páginas específicas de rubrica (`p. 28–34`). Com o aumento da janela para `TOP_K = 6` e a fusão RRF combinando vocabulário específico de pontuação com o embedding da consulta, **Q4 saltou para `MRR@6 = 1,000` na busca híbrida** (`C141` na página `33` logo na primeira posição, seguido por `C123` p. `28` e `C143` p. `34`).
2. **Impacto da barreira linguística no BM25 puro e sua correção via `c.pt`:** No benchmark *cross-lingue* puro (consulta em PT contra texto original em EN), o BM25 zerou em Q2 e Q6 (`HitRate@6 = 0,000`), funcionando apenas em Q5 graças ao termo em inglês inserido entre parênteses (`openness`). Ao pré-computar sínteses em português (`c.pt`) para todas as 224 passagens em `docs/index.json` e indexá-las com peso 2 no BM25 do navegador, o sistema passou a responder perguntas livres em português em menos de `500 ms` (como validado nos testes com perguntas sobre *"fluência, flexibilidade e originalidade"* em `451 ms` recuperando `C101`, `C103`, `C146` e `C100`, e sobre *"Field Trial"* em `507 ms` recuperando `C181`, `C119`, `C183` e `C133`).
3. **Efeito de diluição no RRF em consultas sem cognatos:** Em Q2 e Q6, a Precision@6 do `Hybrid_RRF` caiu em relação ao `Dense` puro (`0,528` vs. `0,639`) porque candidatos ruidosos de referências bibliográficas (`p. 51–56`, `C204`, `C214`, `C222`) receberam votos do BM25 apenas por conterem palavras funcionais ou nomes de autores comuns. Esse achado motiva, como refinamento futuro, a exclusão ou penalização das páginas de referências bibliográficas (`p. 50–56`) no índice de recuperação.

---

## 5. Busca Responsável, Governança e Conformidade Legal (LGPD)

Em alinhamento aos princípios de **Busca Responsável** (*Responsible Search*) estudados na disciplina, o sistema incorpora mitigações explícitas para quatro vetores de risco:

1. **Atualidade (*Freshness*):** O PDF atualmente indexado corresponde ao *Third Draft* de abril de 2019 do *PISA 2021 Creative Thinking Framework*, anterior ao adiamento do ciclo para 2022 e à versão definitiva pós-campo. **Mitigação:** o sistema instrui o gerador e informa explicitamente na interface e nas respostas a edição exata indexada (`Third Draft`), mantendo manifesto de hash (`SHA-256`) e pipeline automatizado em GitHub Actions (`sync_pisa_docs.py`) para incorporar novos documentos oficiais da OCDE/INEP.
2. **Viés Institucional e Escopo:** A base documental atual reflete exclusivamente a perspectiva normativa da OCDE. **Mitigação:** transparência total de fonte em barra fixa e inspeção lado a lado do texto original em inglês junto às sínteses em português.
3. **Privacidade e Proteção de Dados (LGPD):** Embora o sistema atual indexe apenas documentação pública normativa, sua extensão na 3ª VA integrará resultados da pesquisa com microdados de `2.530` estudantes brasileiros. Em estrita observância à Lei Geral de Proteção de Dados Pessoais (LGPD, Lei nº 13.709/2018) (BRASIL, 2018), **nenhum registro individual de estudante ou código identificável de escola será indexado** — apenas estatísticas populacionais agregadas ponderadas (por região, quartis e razões de chances).
4. **Segurança de Credenciais e Licenciamento:** Nenhuma chave de API é embutida no código público do cliente web. O código-fonte é distribuído sob licença **MIT** (`LICENSE`) com metadados formais de citação (`CITATION.cff`), ressalvando expressamente que os textos do PISA pertencem à OCDE e são utilizados apenas para pesquisa e ensino.

---

## 6. Trabalhos Futuros: Integração com a Pesquisa de Mestrado (3ª VA)

Para a entrega final da **3ª VA (04/12/2026)**, o sistema evoluirá diretamente do manual normativo para integrar os achados empíricos da dissertação sobre **resiliência criativa no PISA 2022 Brasil**. Como demonstrado na literatura de RAG sobre bases tabulares, consultas numéricas agregadas (*"No Nordeste, quantos alunos em vulnerabilidade foram resilientes?"*) tendem a falhar quando tabelas numéricas cruas são quebradas arbitrariamente por tamanho fixo de caracteres.

A estratégia técnica planejada compreende:
1. **Textualização Estruturada por Unidade Analítica:** Converter as tabelas de prevalência (`11,9%` nacional, IC 95%: `10,0%–13,9%`), recortes por macrorregião brasileira, desempenhos de modelos (`ROC-AUC = 0,761`, `PR-AUC = 0,286`, `F1 = 0,307`, `Brier = 0,085`) e razões de chances da regressão logística com desenho amostral (`GRADE`, `ICTEFFIC`, `CURIOAGR`, `ASSERAGR`, `ICTFEED`, `ICTRES`) em **fichas textuais autocontidas** (um chunk por região/tabela), impedindo que o *chunking* separe rótulos regionais de seus respectivos percentuais e intervalos de confiança.
2. **Filtragem de Referências Bibliográficas:** Marcar páginas puramente de referências (`p. 50–56`) para evitar ruído no ranking esparso e ampliar o benchmark em `scripts/evaluate_rag.py` para incluir questões quantitativas sobre o recorte brasileiro.

---

## 7. Conclusão

O desenvolvimento do **Caderno de Consulta aos Manuais do PISA** consolidou uma aplicação completa de Mineração de Texto e Recuperação de Informação alinhada aos requisitos de rigor científico de pós-graduação. A combinação de recuperação densa *cross-lingue* (`gemini-embedding-001` em 768 dimensões), busca lexical BM25 bilíngue via *Reciprocal Rank Fusion*, pré-computação analítica de consultas centrais e sínteses explicativas em português para todas as 224 passagens viabilizou uma interface editorial rápida, transparente e acessível sem barreiras técnicas via GitHub Pages. Os experimentos quantitativos confirmaram a superioridade da busca semântica e híbrida (`HitRate@6 = 1,000`) frente à busca lexical isolada (`HitRate@6 = 0,667`), pavimentando uma base sólida para a incorporação dos dados agregados de resiliência criativa da dissertação na etapa final da disciplina.

---

## Referências Bibliográficas

- BEGHETTO, R. A. Creative Self-Efficacy: Correlates in Middle and Secondary Students. **Creativity Research Journal**, v. 18, n. 4, p. 447–457, 2006. DOI: https://doi.org/10.1207/s15326934crj1804_4.
- BRASIL. **Lei nº 13.709, de 14 de agosto de 2018**. Lei Geral de Proteção de Dados Pessoais (LGPD). Brasília, DF: Presidência da República, 2018.
- CORMACK, G. V.; CLARKE, C. L. A.; BÜTTCHER, S. Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods. In: **Proceedings of the 32nd International ACM SIGIR Conference on Research and Development in Information Retrieval (SIGIR '09)**. Boston, MA, USA: ACM, 2009. p. 758–759. DOI: https://doi.org/10.1145/1571941.1572114.
- GAJDA, A.; KARWOWSKI, M.; BEGHETTO, R. A. Creativity and academic achievement: A meta-analysis. **Journal of Educational Psychology**, v. 109, n. 2, p. 269–299, 2017. DOI: https://doi.org/10.1037/edu0000133.
- INEP — Instituto Nacional de Estudos e Pesquisas Educacionais Anísio Teixeira. **Nota sobre o Brasil no PISA 2022**. Brasília, DF: MEC/INEP, 2023. Disponível em: https://download.inep.gov.br/acoes_internacionais/pisa/resultados/2022/nota_sobre_o_brasil_no_pisa_2022.pdf.
- KUSUPATI, A.; BHATT, G.; REGE, A.; WALLINGFORD, M.; SINHA, A.; RAMANUJAN, V.; HOWARD-SNYDER, W.; CHEN, K.; KAKADE, S.; JAIN, P.; FARHADI, A. Matryoshka Representation Learning. In: **Advances in Neural Information Processing Systems 35 (NeurIPS 2022)**. New Orleans, LA: Curran Associates, Inc., 2022. v. 35, p. 30233–30249.
- LEWIS, P.; PEREZ, E.; PIKTUS, A.; PETRONI, F.; KARPUKHIN, V.; GOYAL, N.; KÜTTLER, H.; LEWIS, M.; YIH, W.; ROCKTÄSCHEL, T.; RIEDEL, S.; KIELA, D. Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. In: **Advances in Neural Information Processing Systems 33 (NeurIPS 2020)**. Vancouver: Curran Associates, Inc., 2020. v. 33, p. 9459–9474.
- OECD — Organisation for Economic Co-operation and Development. **PISA 2021 Creative Thinking Framework (Third Draft)**. Paris: OECD, abr. 2019. 56 p.
- ROBERTSON, S.; ZARAGOZA, H. The Probabilistic Relevance Framework: BM25 and Beyond. **Foundations and Trends in Information Retrieval**, v. 3, n. 4, p. 333–389, 2009. DOI: https://doi.org/10.1561/1500000019.
- RUBIN, D. B. **Multiple Imputation for Nonresponse in Surveys**. New York: John Wiley & Sons, 1987. ISBN 978-0-471-08705-2. DOI: https://doi.org/10.1002/9780470316696.
