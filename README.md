# PISA 2022 · Caderno de Consulta aos Manuais (RAG Híbrido)

[![License: MIT](https://img.shields.io/badge/License-MIT-1E2A78.svg)](LICENSE)
[![Corpus: PISA/OCDE](https://img.shields.io/badge/Corpus-PISA%20%2F%20OCDE-D9820B.svg)](data/)
[![RAG: Hybrid RRF](https://img.shields.io/badge/RAG-Hybrid%20RRF%20%2B%20SSE-0F8A77.svg)](docs/app.js)

**Autor:** José Edson Sebastião — Mestrando no Programa de Pós-Graduação em Informática Aplicada (PPGIA / UFRPE)  
**Disciplina:** Mineração de Texto (2026.2) — Prof. Dr. Rafael Ferreira Leite de Mello  
**Repositório:** [`https://github.com/joseedsonamorim/Chat-PISA-RAG`](https://github.com/joseedsonamorim/Chat-PISA-RAG)  
**Aplicação Web (GitHub Pages):** [`https://joseedsonamorim.github.io/Chat-PISA-RAG/`](https://joseedsonamorim.github.io/Chat-PISA-RAG/)  
**Licença do Código:** MIT License ([`LICENSE`](LICENSE) · [`CITATION.cff`](CITATION.cff))  
**Direitos Autorais do Corpus:** Os documentos indexados pertencem exclusivamente à **OCDE (OECD / PISA)** e ao **INEP/MEC**, sendo utilizados neste projeto estritamente para fins de pesquisa acadêmica, com atribuição explícita de página e passagem.

---

## 1. Sobre o Projeto

Este repositório contém um ambiente web de leitura e consulta conversacional baseado em **Recuperação Aumentada por Geração (*Retrieval-Augmented Generation* — RAG)** sobre a documentação técnica do **PISA (*Programme for International Student Assessment*)**, desenvolvido como parte da pesquisa de mestrado do autor no **PPGIA/UFRPE** sobre pensamento criativo e resiliência educacional no Brasil.

### Principais Características
- **Domínio Estritamente Fechado (Sem Busca na Web):** As respostas são geradas unicamente a partir das páginas dos documentos oficiais carregados na pasta [`data/`](data/). Quando uma informação não consta nos trechos recuperados, o modelo informa explicitamente essa limitação.
- **Interface Editorial de Duas Colunas (*Swiss Grid*):**
  - **Coluna Esquerda (Texto do Manual):** Leitor documental em papel editorial (`Newsreader` + `Rubik`) que limpa quebras de linha artificiais do PDF, permite filtrar por termo, página (`p. 25`) ou referência (`C107`) e pode ser recolhido a qualquer momento.
  - **Coluna Direita (Consulta Conversacional em Destaque):** Chat multi-turno com respostas transmitidas em tempo real via *Server-Sent Events* (SSE) e citações em notas bibliográficas sobrescritas clicáveis (`[C96]`). Ao clicar em qualquer nota, o leitor lateral rola automaticamente e destaca o parágrafo original.
- **Atualização Automática (CI/CD):** O workflow [`.github/workflows/sync_pisa_docs.yml`](.github/workflows/sync_pisa_docs.yml) verifica periodicamente novos PDFs oficiais por hash `SHA-256` e reconstrói o índice vetorial (`docs/index.json`).

---

## 2. Arquitetura e Estrutura de Arquivos

```
Chat-PISA-RAG/
├── .github/workflows/
│   └── sync_pisa_docs.yml       # GitHub Actions: sincronização de PDFs e rebuild do índice
├── docs/                        # Aplicação Web Estática (servida pelo GitHub Pages)
│   ├── index.html               # Estrutura editorial (Leitor à esquerda + Chat à direita + Modais)
│   ├── style.css                # Sistema visual Swiss Grid (Newsreader + Rubik, responsivo)
│   ├── app.js                   # Motor RAG no navegador: Condense + Hybrid RRF + SSE + Leitor
│   ├── index.json               # Índice vetorial (224 passagens, 768 dims L2-norm, manifesto SHA-256)
│   ├── evaluation_benchmark.csv # Resultados auditáveis do benchmark de recuperação
│   └── .nojekyll                # Desativa processamento Jekyll no GitHub Pages
├── proxy/
│   └── cloudflare_worker.js     # Proxy Serverless opcional (uso público sem pedir chave na UI)
├── scripts/
│   ├── rag_utils.py             # Extração por página (PyMuPDF) e chunking (1000 chars, overlap 150)
│   ├── build_index.py           # Geração offline de embeddings (gemini-embedding-001)
│   ├── sync_pisa_docs.py        # Verificador de novos documentos oficiais por SHA-256
│   ├── evaluate_rag.py          # Benchmark reprodutível (HitRate@6, Precision@6, MRR@6)
│   └── serve_local.py           # Servidor local com proxy transparente (/api/gemini/*)
├── data/                        # Documentos-fonte oficiais em PDF
├── LICENSE                      # Licença MIT + Aviso de Direitos Autorais OCDE
├── CITATION.cff                 # Metadados de citação acadêmica
└── README.md
```

---

## 3. Pipeline RAG e Avaliação Experimental

### 3.1 Recuperação Híbrida (*Dense + BM25 via Reciprocal Rank Fusion*)
1. **Segmentação (*Chunking*):** Janelas conscientes de parágrafo de até `1.000` caracteres com sobreposição (*overlap*) de `150` caracteres por página (`scripts/rag_utils.py`).
2. **Reescrita Conversacional (*Query Condensation*):** Perguntas de acompanhamento têm pronomes e referências resolvidos a partir dos últimos 4 turnos ($T = 0.0$) antes da etapa de busca.
3. **Busca Densa Cross-Lingue:** Embeddings `gemini-embedding-001` truncados em `768` dimensões (*Matryoshka Representation Learning*) e normalizados ($\ell_2 = 1$), permitindo perguntas em português sobre documentos em inglês.
4. **Busca Esparsa (BM25):** Calculada no navegador ($k_1 = 1.2, b = 0.75$) para capturar termos exatos, siglas e códigos de variáveis.
5. **Fusão RRF:** Os 30 melhores candidatos de cada recuperador são fundidos por *Reciprocal Rank Fusion* (Cormack et al., 2009) com $k_{\text{RRF}} = 60$, enviando os `TOP_K = 6` trechos ao prompt do modelo `gemini-flash-latest`.

### 3.2 Benchmark de Recuperação (`scripts/evaluate_rag.py`)
Resultados medidos sobre o conjunto de referência com $k = 6$ passagens por consulta (detalhes por questão em [`docs/evaluation_benchmark.csv`](docs/evaluation_benchmark.csv)):

| Método | HitRate@6 | Precision@6 | MRR@6 | Comportamento Observado |
|---|---:|---:|---:|---|
| **BM25 (Esparso)** | 0,667 | 0,194 | 0,389 | Sensível à diferença de idioma (consulta PT $\to$ manual EN), atuando bem quando há termos técnicos ou cognatos. |
| **Dense (`gemini-embedding-001`)** | **1,000** | **0,639** | **0,917** | Forte alinhamento semântico cross-lingue, posicionando a página relevante no topo na maioria das consultas. |
| **Hybrid (`Dense + BM25 via RRF`)** | **1,000** | 0,528 | 0,833 | Preserva **100% de revocação no top-6** enquanto garante cobertura para siglas e termos literais do manual. |

---

## 4. Como Executar e Configurar

### 4.1 Uso pelo GitHub Pages
1. Acesse **`https://joseedsonamorim.github.io/Chat-PISA-RAG/`**.
2. Caso nenhum proxy institucional esteja configurado em `PROXY_URL`, clique no ícone de engrenagem no canto superior direito e insira uma chave gratuita do [Google AI Studio](https://aistudio.google.com/apikey) (`AIzaSy...`). A chave fica salva apenas no `localStorage` do seu navegador.

### 4.2 Execução Local (Sem digitar chave no navegador)
O servidor [`scripts/serve_local.py`](scripts/serve_local.py) carrega automaticamente a variável `GEMINI_API_KEY` do ambiente ou do arquivo `.env` local:
```bash
python3 scripts/serve_local.py
# Abra http://localhost:8765
```

### 4.3 Adicionar Novos Documentos e Recriar o Índice
```bash
# 1. Adicione novos PDFs em data/ (ou execute scripts/sync_pisa_docs.py)
# 2. Gere novamente o arquivo docs/index.json:
GEMINI_API_KEY="AIzaSy..." PYTHONPATH=scripts python3 scripts/build_index.py

# 3. Reexecute o benchmark de avaliação:
GEMINI_API_KEY="AIzaSy..." PYTHONPATH=scripts python3 scripts/evaluate_rag.py
```

---

## 5. Como Citar

> SEBASTIÃO, José Edson. **PISA 2022 · Caderno de Consulta aos Manuais: Sistema Conversacional de Recuperação Aumentada por Geração (RAG) Híbrido**. Programa de Pós-Graduação em Informática Aplicada (PPGIA), Universidade Federal Rural de Pernambuco (UFRPE), Recife, 2026. Licença MIT. Disponível em: https://github.com/joseedsonamorim/Chat-PISA-RAG.
