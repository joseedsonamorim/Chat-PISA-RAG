# Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
"""Converte Relatorio_Projeto_Chat_PISA_RAG.md em PDF acadêmico diagramado (A4)
utilizando Google Chrome Headless com estilização tipográfica de pós-graduação.
"""
from __future__ import annotations

import html
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = ROOT.parent
MD_PATH = ROOT / "Relatorio_Projeto_Chat_PISA_RAG.md"
MD_ROOT = WORKSPACE_ROOT / "Relatorio_Projeto_Chat_PISA_RAG.md"
PDF_PATH = ROOT / "Relatorio_Projeto_Chat_PISA_RAG.pdf"
PDF_ROOT = WORKSPACE_ROOT / "Relatorio_Projeto_Chat_PISA_RAG.pdf"
TMP_HTML = Path("/tmp/relatorio_pisa_rag.html")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def fmt_inline(text: str) -> str:
    # 1. Protege trechos em `code` antes de converter negrito/itálico/LaTeX
    code_spans: list[str] = []

    def _save_code(m: re.Match) -> str:
        code_spans.append(f"<code>{html.escape(m.group(1))}</code>")
        return f"\x00CODE{len(code_spans) - 1}\x00"

    s = re.sub(r"`([^`]+)`", _save_code, text)
    s = html.escape(s)

    # 2. Converte expressões LaTeX inline para HTML tipográfico limpo
    s = re.sub(r"\\text\{([^}]+)\}", r"\1", s)
    s = re.sub(r"\\frac\{([^}]+)\}\{([^}]+)\}", r"(\1) / (\2)", s)
    s = s.replace(r"\ell_2", "&#x2113;<sub>2</sub>")
    s = s.replace(r"p_{\text{BH}}", "<i>p</i><sub>BH</sub>").replace("p_{BH}", "<i>p</i><sub>BH</sub>")
    s = s.replace(r"k_{\text{RRF}}", "<i>k</i><sub>RRF</sub>").replace("k_{RRF}", "<i>k</i><sub>RRF</sub>")
    s = re.sub(r"\bk_1\b", "<i>k</i><sub>1</sub>", s)
    s = re.sub(r"\brank_1\b", "rank<sub>1</sub>", s)
    s = s.replace(r"\ge", "&ge;").replace(r"\subset", "&sub;").replace(r"\in", "&isin;")
    s = s.replace(r"\mathcal{D}", "<i>D</i>").replace(r"\mathcal{C}_k", "<i>C</i><sub>k</sub>")
    s = s.replace(r"\mathcal{R}", "<i>R</i>").replace(r"\mathcal{G}", "<i>G</i>")
    s = s.replace(r"\mathbb{R}^d", "&#x211D;<sup><i>d</i></sup>")
    s = s.replace(r"\|\mathbf{v}\|_2", "||<b>v</b>||<sub>2</sub>")
    s = s.replace(r"\mathbf{e}_q \cdot \mathbf{e}_c", "<b>e</b><sub>q</sub> &middot; <b>e</b><sub>c</sub>")
    s = s.replace("$", "").replace("{,}", ",")

    # 3. Markdown inline: **negrito** (aceitando * interno) e *itálico*
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<!\*)\*([^*]+?)\*(?!\*)", r"<em>\1</em>", s)
    s = re.sub(r"(https?://[^\s<]*[^\s<.,;:)])", r'<a href="\1">\1</a>', s)

    # 4. Restaura blocos `code`
    for idx, val in enumerate(code_spans):
        s = s.replace(f"\x00CODE{idx}\x00", val)
    return s


def md_to_html(md_text: str) -> str:
    lines = md_text.splitlines()
    out: list[str] = []
    i = 0
    in_code = False
    code_buf: list[str] = []

    while i < len(lines):
        line = lines[i]

        if line.strip().startswith("```"):
            if in_code:
                out.append(f"<pre><code>{html.escape(chr(10).join(code_buf))}</code></pre>")
                code_buf.clear()
                in_code = False
            else:
                in_code = True
            i += 1
            continue

        if in_code:
            code_buf.append(line)
            i += 1
            continue

        if line.strip().startswith("$$") and line.strip().endswith("$$"):
            eq = line.strip()[2:-2].strip()
            if "BM25" in eq:
                eq_html = (
                    "BM25(<i>q</i>, <i>c</i>) = &Sigma;<sub><i>t</i> &isin; <i>q</i></sub> "
                    "IDF(<i>t</i>) &middot; [ tf(<i>t</i>, <i>c</i>) &middot; (<i>k</i><sub>1</sub> + 1) ] / "
                    "[ tf(<i>t</i>, <i>c</i>) + <i>k</i><sub>1</sub> &middot; (1 &minus; <i>b</i> + <i>b</i> &middot; |<i>c</i>| / avgdl) ]"
                )
            elif "RRF" in eq:
                eq_html = (
                    "RRF(<i>c</i>) = &Sigma;<sub><i>m</i> &isin; {Dense, BM25}</sub> "
                    "1 / (<i>k</i><sub>RRF</sub> + rank<sub><i>m</i></sub>(<i>c</i>)), "
                    "&nbsp;&nbsp;com <i>k</i><sub>RRF</sub> = 60"
                )
            else:
                eq_html = html.escape(eq)
            out.append(f'<div class="equation">{eq_html}</div>')
            i += 1
            continue

        if line.strip().startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*[-:]+", lines[i + 1].strip()):
            headers = [c.strip() for c in line.strip().strip("|").split("|")]
            i += 2
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            ths = "".join(f"<th>{fmt_inline(h)}</th>" for h in headers)
            trs = "".join(
                "<tr>" + "".join(f"<td>{fmt_inline(c)}</td>" for c in r) + "</tr>"
                for r in rows
            )
            cls = "compact-table" if len(rows) <= 6 else "wide-table"
            out.append(f'<table class="{cls}"><thead><tr>{ths}</tr></thead><tbody>{trs}</tbody></table>')
            continue

        stripped = line.strip()
        if not stripped:
            i += 1
            continue
        if stripped == "---":
            out.append("<hr>")
            i += 1
            continue
        if stripped.startswith("# "):
            out.append(f"<h1>{fmt_inline(stripped[2:])}</h1>")
            i += 1
            continue
        if stripped.startswith("## "):
            out.append(f"<h2>{fmt_inline(stripped[3:])}</h2>")
            i += 1
            continue
        if stripped.startswith("### "):
            out.append(f"<h3>{fmt_inline(stripped[4:])}</h3>")
            i += 1
            continue

        if re.match(r"^[-*]\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\s*[-*]\s+", lines[i]):
                items.append(fmt_inline(re.sub(r"^\s*[-*]\s+", "", lines[i])))
                i += 1
            out.append("<ul>" + "".join(f"<li>{it}</li>" for it in items) + "</ul>")
            continue

        if re.match(r"^\d+\.\s+", stripped):
            items = []
            while i < len(lines) and re.match(r"^\s*\d+\.\s+", lines[i]):
                items.append(fmt_inline(re.sub(r"^\s*\d+\.\s+", "", lines[i])))
                i += 1
            out.append("<ol>" + "".join(f"<li>{it}</li>" for it in items) + "</ol>")
            continue

        if stripped.startswith("**Instituição:**"):
            meta_lines = []
            while i < len(lines) and lines[i].strip() and lines[i].strip() != "---":
                meta_lines.append(fmt_inline(lines[i].strip()))
                i += 1
            out.append('<div class="meta-box">' + "<br>".join(meta_lines) + "</div>")
            continue

        para = [stripped]
        i += 1
        while (
            i < len(lines)
            and lines[i].strip()
            and not lines[i].strip().startswith(("#", "|", "-", "*", "```", "$$"))
            and not re.match(r"^\d+\.\s+", lines[i].strip())
        ):
            para.append(lines[i].strip())
            i += 1
        joined = " ".join(para)
        cls_attr = ' class="table-caption"' if joined.startswith("**Tabela ") else ""
        out.append(f"<p{cls_attr}>{fmt_inline(joined)}</p>")

    return "\n".join(out)


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Relatório Técnico-Científico — Chat PISA RAG</title>
<style>
  @page {
    size: A4;
    margin: 20mm 19mm 20mm 19mm;
    @top-left {
      content: "PPGIA/UFRPE · Mineração de Texto (2026.2)";
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 8.5pt;
      color: #6B7186;
    }
    @top-right {
      content: "Caderno de Consulta PISA (RAG Híbrido)";
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 8.5pt;
      color: #6B7186;
    }
    @bottom-left {
      content: "José Edson Sebastião · Mestrando PPGIA/UFRPE";
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 8.5pt;
      color: #6B7186;
    }
    @bottom-right {
      content: "Página " counter(page) " de " counter(pages);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 8.5pt;
      color: #1E2A78;
      font-weight: 600;
    }
  }
  @page :first {
    @top-left { content: ""; }
    @top-right { content: ""; }
  }
  body {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 10.2pt;
    line-height: 1.52;
    color: #1E2233;
    margin: 0;
  }
  .inst-banner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2.5px solid #1E2A78;
    padding-bottom: 8px;
    margin-bottom: 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  .inst-banner .left { font-size: 9pt; font-weight: 700; color: #1E2A78; letter-spacing: .04em; text-transform: uppercase; }
  .inst-banner .badge { background: #F59A0B; color: #fff; font-size: 8.5pt; font-weight: 700; padding: 3px 8px; border-radius: 4px; }
  h1 {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 16.5pt;
    line-height: 1.24;
    color: #1E2A78;
    margin: 0 0 11px;
  }
  h2 {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 12pt;
    color: #1E2A78;
    border-bottom: 1px solid #D8DCE8;
    padding-bottom: 3px;
    margin: 16px 0 7px;
    break-after: avoid;
    page-break-after: avoid;
  }
  h3 {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 10.5pt;
    color: #2B3AC9;
    margin: 12px 0 5px;
    break-after: avoid;
    page-break-after: avoid;
  }
  p { margin: 0 0 7.5px; text-align: justify; hyphens: auto; }
  p.table-caption {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9.2pt;
    color: #1E2A78;
    margin: 12px 0 4px;
    text-align: left;
    break-after: avoid;
    page-break-after: avoid;
  }
  ul, ol { margin: 4px 0 9px; padding-left: 18px; }
  li { margin-bottom: 3.5px; text-align: justify; }
  hr { border: 0; border-top: 1px solid #E4E7F2; margin: 10px 0; }
  a { color: #2B3AC9; text-decoration: none; }
  code {
    font-family: ui-monospace, Menlo, monospace;
    font-size: 8.6pt;
    background: #F4F5FA;
    padding: 1px 4px;
    border-radius: 3px;
    color: #1E2A78;
  }
  pre {
    background: #F7F8FC;
    border: 1px solid #E2E6F2;
    border-left: 3px solid #1E2A78;
    padding: 8px 10px;
    border-radius: 4px;
    font-size: 7.8pt;
    line-height: 1.38;
    overflow-x: hidden;
    white-space: pre-wrap;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  pre code { background: transparent; padding: 0; color: #1E2233; }
  .meta-box {
    background: #F5F6FA;
    border-left: 4px solid #10A590;
    padding: 9px 13px;
    border-radius: 4px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 9pt;
    line-height: 1.5;
    margin-bottom: 12px;
  }
  .equation {
    background: #FAFBFD;
    border: 1px solid #E4E7F2;
    border-radius: 4px;
    padding: 7px 11px;
    margin: 8px 0;
    text-align: center;
    font-family: Georgia, serif;
    font-size: 9.8pt;
    color: #161922;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 4px 0 12px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 8.2pt;
  }
  table.compact-table { break-inside: avoid; page-break-inside: avoid; }
  table.wide-table { break-inside: auto; page-break-inside: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th {
    background: #1E2A78;
    color: #fff;
    text-align: left;
    padding: 5px 6px;
    font-weight: 600;
  }
  td {
    border-bottom: 1px solid #E4E7F2;
    padding: 4.5px 6px;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: #F9FAFD; }
</style>
</head>
<body>
  <div class="inst-banner">
    <div class="left">Universidade Federal Rural de Pernambuco (UFRPE) · PPGIA</div>
    <div class="badge">PISA 2022 · 2ª VA</div>
  </div>
  {BODY}
</body>
</html>
"""


def main() -> None:
    md_text = MD_PATH.read_text(encoding="utf-8")
    shutil.copy2(MD_PATH, MD_ROOT)

    body_html = md_to_html(md_text)
    full_html = HTML_TEMPLATE.replace("{BODY}", body_html)
    TMP_HTML.write_text(full_html, encoding="utf-8")

    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--no-pdf-header-footer",
            f"--print-to-pdf={PDF_PATH}",
            TMP_HTML.as_uri(),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    shutil.copy2(PDF_PATH, PDF_ROOT)
    print(f"Generated {PDF_PATH} ({PDF_PATH.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
