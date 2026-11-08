# Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
"""Servidor local para desenvolvimento e demonstração do Chat PISA.

Carrega automaticamente a GEMINI_API_KEY do ambiente (ou do arquivo `.env`)
e expõe um proxy local `/api/gemini/<model:action>`, permitindo que a interface
web (`docs/`) funcione imediatamente no navegador SEM que o usuário precise
digitar ou colar nenhuma API Key na tela.
"""
from __future__ import annotations

import os
import urllib.error
import urllib.request
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS_DIR = ROOT / "docs"
UPSTREAM = "https://generativelanguage.googleapis.com/v1beta/models/"


def load_api_key() -> str:
    if os.environ.get("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"].strip()
    for env_path in (
        ROOT / ".env",
        ROOT.parent / ".env",
        ROOT.parent / "Materiais_e_Cronograma" / "Information Retrieval" / "code" / ".env",
    ):
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.strip().startswith("GEMINI_API_KEY="):
                    return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""


API_KEY = load_api_key()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DOCS_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            body = b'{"proxy": true}' if API_KEY else b'{"proxy": false}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def do_POST(self):
        if not self.path.startswith("/api/gemini/"):
            self.send_error(404)
            return
        action = self.path[len("/api/gemini/") :]
        length = int(self.headers.get("Content-Length", "0"))
        payload = self.rfile.read(length)
        req = urllib.request.Request(
            UPSTREAM + action,
            data=payload,
            headers={
                "Content-Type": "application/json",
                "x-goog-api-key": API_KEY,
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.end_headers()
                while True:
                    chunk = resp.read(1024)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as exc:
            err_body = exc.read()
            self.send_response(exc.code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(err_body)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8765"))
    print(f"Serving Chat PISA on http://localhost:{port} (key loaded: {bool(API_KEY)})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
