# Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
"""Sincronizador automático de documentação oficial do PISA (OCDE / INEP).

Verifica o catálogo de documentos oficiais do PISA configurados em CATALOG,
baixa novos PDFs ou versões alteradas (comparando SHA-256) para `data/` e
sinaliza se o índice vetorial (`docs/index.json`) precisa ser reconstruído.
"""
from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MANIFEST_PATH = DATA_DIR / "catalog_manifest.json"

# Catálogo extensível de documentos públicos oficiais (OCDE / INEP)
CATALOG = [
    {
        "filename": "PISA_2022_Nota_Brasil_INEP.pdf",
        "title": "Nota sobre o Brasil no PISA 2022 (INEP/MEC)",
        "url": "https://download.inep.gov.br/acoes_internacionais/pisa/resultados/2022/nota_sobre_o_brasil_no_pisa_2022.pdf",
    },
]


def sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def sync() -> bool:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, str] = {}
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text())

    changed = False
    for entry in CATALOG:
        dest = DATA_DIR / entry["filename"]
        try:
            req = urllib.request.Request(entry["url"], headers={"User-Agent": "ChatPISA-AcademicSync/1.0"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = resp.read()
            if not data.startswith(b"%PDF"):
                print(f"[skip] {entry['filename']}: resposta não é um PDF válido.")
                continue
            digest = sha256_bytes(data)
            if not dest.exists() or manifest.get(entry["filename"]) != digest:
                dest.write_bytes(data)
                manifest[entry["filename"]] = digest
                changed = True
                print(f"[updated] {entry['filename']} ({len(data) // 1024} KB, sha256={digest[:12]})")
            else:
                print(f"[up-to-date] {entry['filename']}")
        except Exception as exc:
            print(f"[warn] falha ao verificar {entry['filename']}: {exc}")

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    return changed


if __name__ == "__main__":
    updated = sync()
    print("CHANGED=1" if updated else "CHANGED=0")
