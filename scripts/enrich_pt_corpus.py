# Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
"""Gera resumos analíticos em português (pt_summary) para todas as 224 passagens
do manual do PISA em `docs/index.json` e expande a base `docs/precomputed_qa.json`
com respostas conversacionais naturais e rápidas em português.
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = ROOT / "docs" / "index.json"


def load_key() -> str:
    env_file = ROOT.parent / "Materiais_e_Cronograma" / "Information Retrieval" / "code" / ".env"
    for line in env_file.read_text().splitlines():
        if line.startswith("GEMINI_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("GEMINI_API_KEY not found")


def translate_chunks(client: genai.Client, chunks: list[dict]) -> None:
    todo = [c for c in chunks if not c.get("pt")]
    print(f"Passagens para sintetizar em português: {len(todo)}/{len(chunks)}")
    batch_size = 20
    for i in range(0, len(todo), batch_size):
        batch = todo[i : i + batch_size]
        payload = [{"id": c["id"], "page": c["page"], "text": c["text"][:900]} for c in batch]
        prompt = (
            "Para cada trecho abaixo do manual do PISA (em inglês), escreva em PORTUGUÊS DO BRASIL "
            "uma explicação clara, natural e fluida (de 2 a 3 frases completas, sem parecer tradução robótica "
            "e sem repetir cabeçalhos como 'Third Draft' ou 'For Official Use') resumindo exatamente o que "
            "esse trecho explica.\n"
            "Retorne APENAS um objeto JSON válido no formato {\"C1\": \"texto em português...\", ...}.\n\n"
            f"TRECHOS:\n{json.dumps(payload, ensure_ascii=False)}"
        )
        for attempt in range(4):
            try:
                res = client.models.generate_content(
                    model="gemini-flash-latest",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=0.2,
                        response_mime_type="application/json",
                    ),
                )
                mapping = json.loads(res.text)
                for c in batch:
                    if c["id"] in mapping and isinstance(mapping[c["id"]], str):
                        c["pt"] = mapping[c["id"]].strip()
                print(f"Sintetizados {min(i + batch_size, len(todo))}/{len(todo)}")
                break
            except Exception as exc:
                print(f"Retry batch {i}: {str(exc)[:100]}")
                time.sleep(6 * (attempt + 1))
        time.sleep(0.5)


def main():
    key = load_key()
    client = genai.Client(api_key=key)
    index = json.loads(INDEX_PATH.read_text())
    translate_chunks(client, index["chunks"])
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False))
    done = sum(1 for c in index["chunks"] if c.get("pt"))
    print(f"Concluído: {done}/{len(index['chunks'])} passagens com síntese em português em docs/index.json")


if __name__ == "__main__":
    main()
