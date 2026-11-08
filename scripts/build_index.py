# Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
"""Constrói docs/index.json: chunks por página + embeddings Gemini dos PDFs do PISA.

Inclui manifesto de documentos (título, páginas, SHA-256 e contagem de chunks)
para suportar a interface de inspeção documental no estilo 'Ask the Manual'.
"""
import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from google import genai
from google.genai import types

from rag_utils import chunk_text, extract_pages, iter_pdfs

ROOT = Path(__file__).resolve().parent.parent
EMBED_MODEL = "gemini-embedding-001"
DIM = 768
CHUNK_SIZE, OVERLAP = 1000, 150


def build_chunks():
    chunks = []
    documents = []
    for pdf in iter_pdfs(ROOT / "data"):
        pages = extract_pages(pdf)
        sha256 = hashlib.sha256(pdf.read_bytes()).hexdigest()[:16]
        doc_chunks = 0
        for page_no, text in enumerate(pages, start=1):
            for piece in chunk_text(text, CHUNK_SIZE, OVERLAP):
                if len(piece) < 60:
                    continue
                chunks.append(
                    {
                        "id": f"C{len(chunks) + 1}",
                        "doc": pdf.stem,
                        "page": page_no,
                        "text": piece,
                    }
                )
                doc_chunks += 1
        documents.append(
            {
                "id": pdf.stem,
                "filename": pdf.name,
                "title": pdf.stem.replace("_", " "),
                "pages": len(pages),
                "chunks": doc_chunks,
                "sha256": sha256,
            }
        )
    return chunks, documents


def embed(client, texts):
    out = []
    for i in range(0, len(texts), 50):
        batch = texts[i : i + 50]
        for attempt in range(5):
            try:
                res = client.models.embed_content(
                    model=EMBED_MODEL,
                    contents=batch,
                    config=types.EmbedContentConfig(
                        task_type="RETRIEVAL_DOCUMENT", output_dimensionality=DIM
                    ),
                )
                out.extend(e.values for e in res.embeddings)
                break
            except Exception as exc:
                print("retry:", str(exc)[:80])
                time.sleep(10 * (attempt + 1))
        else:
            raise RuntimeError("embedding failed")
        time.sleep(1)
        print(f"{min(i + 50, len(texts))}/{len(texts)}")
    return out


def main():
    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        raise SystemExit("Set GEMINI_API_KEY")
    chunks, documents = build_chunks()
    print(f"{len(chunks)} chunks across {len(documents)} document(s)")
    client = genai.Client(api_key=key)
    mat = np.array(embed(client, [c["text"] for c in chunks]), dtype=np.float32)
    mat /= np.linalg.norm(mat, axis=1, keepdims=True)
    for c, v in zip(chunks, mat):
        c["emb"] = [round(float(x), 4) for x in v]
    meta = {
        "embed_model": EMBED_MODEL,
        "dim": DIM,
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "documents": documents,
        "chunks": chunks,
    }
    (ROOT / "docs" / "index.json").write_text(json.dumps(meta, ensure_ascii=False))
    print("wrote docs/index.json")


if __name__ == "__main__":
    main()
