"""Avaliação Acadêmica Reprodutível do Sistema Chat PISA (RAG Híbrido).

Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE).
Licenciado sob a Licença MIT (consulte o arquivo LICENSE).

Este script avalia separadamente o componente de recuperação (Retrieval) em três
configurações — Esparsa (BM25), Densa (Embeddings Gemini) e Híbrida (RRF) —
utilizando métricas clássicas de Recuperação de Informação (Recall@k, Precision@k
e MRR@k) sobre um conjunto de perguntas de referência (Ground Truth) com páginas
e trechos relevantes auditados manualmente na documentação do PISA.
"""
from __future__ import annotations

import json
import math
import os
import re
import unicodedata
from pathlib import Path

import numpy as np
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = ROOT / "docs" / "index.json"
OUT_CSV = ROOT / "docs" / "evaluation_benchmark.csv"
RRF_K = 60
CANDIDATES = 30
TOP_K = 6

# Conjunto de avaliação auditado manualmente (pergunta -> páginas de evidência primária no PDF)
BENCHMARK = [
    {
        "id": "Q1",
        "question": "Como o framework do PISA define pensamento criativo (creative thinking)?",
        "relevant_pages": [7, 8, 24, 25],
    },
    {
        "id": "Q2",
        "question": "Quais são as três facetas principais avaliadas no modelo de competência de pensamento criativo?",
        "relevant_pages": [22, 23, 24, 25, 26, 27],
    },
    {
        "id": "Q3",
        "question": "Quais são os quatro domínios de conteúdo nos quais o teste de pensamento criativo é aplicado?",
        "relevant_pages": [3, 4, 19, 20, 21, 22, 26],
    },
    {
        "id": "Q4",
        "question": "Como são pontuadas as tarefas abertas de expressão visual e escrita?",
        "relevant_pages": [28, 29, 30, 32, 33, 34],
    },
    {
        "id": "Q5",
        "question": "Qual o papel de atitudes como abertura ao intelecto (openness) e autoeficácia criativa?",
        "relevant_pages": [11, 13, 14, 45],
    },
    {
        "id": "Q6",
        "question": "Como fatores escolares e práticas de professores se relacionam com o pensamento criativo no PISA?",
        "relevant_pages": [5, 6, 16, 45, 46],
    },
]


def tok(s: str) -> list[str]:
    s = unicodedata.normalize("NFD", s.lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.findall(r"[a-z0-9]+", s)


def prepare_bm25(chunks: list[dict]):
    df: dict[str, int] = {}
    for c in chunks:
        tf: dict[str, int] = {}
        for t in tok(c["text"]):
            tf[t] = tf.get(t, 0) + 1
        c["tf"] = tf
        c["len"] = sum(tf.values())
        for t in tf:
            df[t] = df.get(t, 0) + 1
    n = len(chunks)
    avg = sum(c["len"] for c in chunks) / n
    idf = {t: math.log(1 + (n - d + 0.5) / (d + 0.5)) for t, d in df.items()}
    return idf, avg


def bm25_score(q: str, c: dict, idf: dict[str, float], avg: float) -> float:
    s = 0.0
    for t in set(tok(q)):
        f = c["tf"].get(t, 0)
        if f:
            s += idf[t] * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (c["len"] / avg))))
    return s


def metrics_at_k(ranked_chunks: list[dict], rel_pages: set[int], k: int = TOP_K) -> tuple[float, float, float]:
    top = ranked_chunks[:k]
    hits = [1 if c["page"] in rel_pages else 0 for c in top]
    hit_any = 1.0 if any(hits) else 0.0
    prec = sum(hits) / k
    rr = 0.0
    for idx, h in enumerate(hits, start=1):
        if h:
            rr = 1.0 / idx
            break
    return hit_any, prec, rr


def main():
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("Defina GEMINI_API_KEY para executar o benchmark.")
    index = json.loads(INDEX_PATH.read_text())
    chunks = index["chunks"]
    idf, avg = prepare_bm25(chunks)
    client = genai.Client(api_key=key)

    rows = ["id,method,hit_rate_at_6,precision_at_6,mrr_at_6,top_chunks"]
    summary = {"BM25": [], "Dense": [], "Hybrid_RRF": []}

    for item in BENCHMARK:
        q = item["question"]
        rel = set(item["relevant_pages"])
        res = client.models.embed_content(
            model=index["embed_model"],
            contents=[q],
            config=types.EmbedContentConfig(
                task_type="RETRIEVAL_QUERY", output_dimensionality=index["dim"]
            ),
        )
        qv = np.array(res.embeddings[0].values, dtype=np.float32)
        qv /= np.linalg.norm(qv)

        dense_scores = [(i, float(np.dot(c["emb"], qv))) for i, c in enumerate(chunks)]
        sparse_scores = [(i, bm25_score(q, c, idf, avg)) for i, c in enumerate(chunks)]

        dense_sorted = [chunks[i] for i, _ in sorted(dense_scores, key=lambda x: x[1], reverse=True)]
        sparse_sorted = [chunks[i] for i, _ in sorted(sparse_scores, key=lambda x: x[1], reverse=True)]

        rrf: dict[int, float] = {}
        for lst in (dense_scores, sparse_scores):
            for rank, (i, sc) in enumerate(sorted(lst, key=lambda x: x[1], reverse=True)[:CANDIDATES]):
                if sc > 0:
                    rrf[i] = rrf.get(i, 0.0) + 1.0 / (RRF_K + rank + 1)
        hybrid_sorted = [chunks[i] for i, _ in sorted(rrf.items(), key=lambda x: x[1], reverse=True)]

        for name, ranked in (("BM25", sparse_sorted), ("Dense", dense_sorted), ("Hybrid_RRF", hybrid_sorted)):
            hit, prec, rr = metrics_at_k(ranked, rel, TOP_K)
            summary[name].append((hit, prec, rr))
            top_ids = " ".join(f"{c['id']}(p{c['page']})" for c in ranked[:TOP_K])
            rows.append(f"{item['id']},{name},{hit:.3f},{prec:.3f},{rr:.3f},\"{top_ids}\"")

    OUT_CSV.write_text("\n".join(rows) + "\n")
    print("=== Resultado Agregado do Benchmark (k=6) ===")
    for name, vals in summary.items():
        arr = np.mean(vals, axis=0)
        print(f"{name:12s} | HitRate@6: {arr[0]:.3f} | P@6: {arr[1]:.3f} | MRR@6: {arr[2]:.3f}")


if __name__ == "__main__":
    main()
