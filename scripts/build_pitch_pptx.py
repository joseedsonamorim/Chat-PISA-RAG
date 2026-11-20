# Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
"""Gera a apresentação Pitch (.pptx) do projeto Chat PISA — RAG Híbrido
a partir do template oficial do mestrado (preservando 100% da identidade
visual, fontes, cores, caixas, tabelas e relações OpenXML).
"""
from __future__ import annotations

import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKSPACE_ROOT = ROOT.parent
TEMPLATE_PPTX = Path(
    "/Users/macbookair/.gemini/antigravity/brain/97823d7d-5499-417c-b389-682e2358a04e/"
    ".user_uploaded/media_1795141199802_5ad80d7a.pptx"
)
OUT_PPTX_PROJECT = ROOT / "Apresentacao_Pitch_Chat_PISA_RAG.pptx"
OUT_PPTX_ROOT = WORKSPACE_ROOT / "Apresentacao_Pitch_Chat_PISA_RAG.pptx"

NS = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
}

for prefix, uri in NS.items():
    if prefix not in ("rel", "ct"):
        ET.register_namespace(prefix, uri)

P_NS = f"{{{NS['p']}}}"
A_NS = f"{{{NS['a']}}}"
R_NS = f"{{{NS['r']}}}"


def set_shape_paragraphs(sp: ET.Element, spec: list[str | list[str]]) -> None:
    """Atualiza os parágrafos de um shape preservando <a:rPr> e <a:pPr> originais."""
    tx_body = sp.find(f"{P_NS}txBody")
    if tx_body is None:
        return
    all_ps = tx_body.findall(f"{A_NS}p")
    p_with_runs = [p for p in all_ps if p.findall(f"{A_NS}r")]
    for pi, p_el in enumerate(p_with_runs):
        if pi >= len(spec):
            break
        val = spec[pi]
        runs = p_el.findall(f"{A_NS}r")
        if isinstance(val, list):
            for ri, r_el in enumerate(runs):
                t_el = r_el.find(f"{A_NS}t")
                if t_el is not None:
                    t_el.text = val[ri] if ri < len(val) else ""
        else:
            if runs:
                t_el = runs[0].find(f"{A_NS}t")
                if t_el is not None:
                    t_el.text = val
                for extra_r in runs[1:]:
                    extra_t = extra_r.find(f"{A_NS}t")
                    if extra_t is not None:
                        extra_t.text = ""


def update_slide_xml(xml_bytes: bytes, shape_map: dict[str, list], table_rows: list[list[str]] | None = None) -> bytes:
    root = ET.fromstring(xml_bytes)
    for sp in root.findall(f".//{P_NS}sp"):
        nv = sp.find(f"{P_NS}nvSpPr/{P_NS}cNvPr")
        if nv is None:
            continue
        name = nv.attrib.get("name", "")
        if name in shape_map:
            set_shape_paragraphs(sp, shape_map[name])

    if table_rows is not None:
        tbl = root.find(f".//{A_NS}tbl")
        if tbl is not None:
            trs = tbl.findall(f"{A_NS}tr")
            for ri, tr in enumerate(trs):
                if ri >= len(table_rows):
                    break
                tcs = tr.findall(f"{A_NS}tc")
                for ci, tc in enumerate(tcs):
                    if ci >= len(table_rows[ri]):
                        break
                    ps = [p for p in tc.findall(f".//{A_NS}p") if p.findall(f"{A_NS}r")]
                    if ps:
                        runs = ps[0].findall(f"{A_NS}r")
                        if runs:
                            t_el = runs[0].find(f"{A_NS}t")
                            if t_el is not None:
                                t_el.text = table_rows[ri][ci]
                            for extra_r in runs[1:]:
                                et = extra_r.find(f"{A_NS}t")
                                if et is not None:
                                    et.text = ""
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def update_notes_xml(xml_bytes: bytes, note_text: str) -> bytes:
    root = ET.fromstring(xml_bytes)
    for sp in root.findall(f".//{P_NS}sp"):
        nv = sp.find(f"{P_NS}nvSpPr/{P_NS}cNvPr")
        if nv is not None and "Notes Placeholder" in nv.attrib.get("name", ""):
            set_shape_paragraphs(sp, [note_text])
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


# Mapeamento dos 7 slides do pitch baseados nos moldes oficiais (1, 2, 4, 11, 12, 5, 14)
PITCH_SLIDES = [
    {
        "src_slide": 1,
        "shapes": {
            "TextBox 1": ["Página 1    |    Apresentação de Projeto (2ª VA)"],
            "TextBox 6": ["PISA", "2022"],
            "Rounded Rectangle 7": ["MINERAÇÃO DE TEXTO · PPGIA/UFRPE"],
            "TextBox 8": ["Caderno de Consulta", "aos Manuais do PISA", "via RAG Híbrido"],
            "TextBox 9": ["Recuperação Aumentada por Geração em domínio fechado sobre pensamento criativo e resiliência educacional."],
            "TextBox 10": [
                "José Edson Sebastião   ·   Mestrando PPGIA/UFRPE",
                "Prof. Dr. Rafael Ferreira Leite de Mello   ·   Novembro de 2026",
            ],
        },
        "note": (
            "Abertura (1 min): Apresentar o Caderno de Consulta aos Manuais do PISA — um sistema RAG híbrido em domínio "
            "fechado desenvolvido na disciplina de Mineração de Texto em sinergia direta com a dissertação de mestrado "
            "no PPGIA/UFRPE sobre pensamento criativo e resiliência educacional no PISA 2022."
        ),
    },
    {
        "src_slide": 2,
        "shapes": {
            "TextBox 1": ["Página 2    |    Problema e Motivação"],
            "TextBox 2": [["Contexto ", "e problema de pesquisa"]],
            "TextBox 3": ["Como consultar manuais extensos da OCDE em inglês com precisão, rapidez e rastreabilidade de fonte?"],
            "TextBox 6": [
                "Complexidade documental",
                "Manuais técnicos do PISA trazem dezenas de páginas em inglês com rubricas e facetas cognitivas.",
                "Busca manual por palavra-chave falha em consultas conceituais.",
            ],
            "TextBox 9": [
                "Limitação de LLMs abertos",
                "Modelos genéricos alucinam, misturam edições (2018 vs. 2022) e omitem a página de origem.",
                "Na pesquisa de mestrado, toda afirmação exige evidência auditável.",
            ],
            "TextBox 12": [
                "Solução: RAG fechado",
                "Aplicação web que responde em português apenas com os documentos indexados, sem busca na web.",
                "Cita o trecho [Cxx] e abre a passagem original ao lado.",
            ],
            "TextBox 14": [
                "ELO COM A DISSERTAÇÃO DE MESTRADO",
                "Apoia o referencial teórico de pensamento criativo e prepara a integração dos dados de resiliência no Brasil (11,9%).",
            ],
        },
        "note": (
            "Slide 2 (1,5 min): Explicar por que um ChatGPT genérico não resolve o problema da pesquisa: precisamos de "
            "fidelidade ao documento da OCDE, ausência de alucinações, resposta em português e citação exata da página."
        ),
    },
    {
        "src_slide": 4,
        "shapes": {
            "TextBox 1": ["Página 3    |    Corpus e Indexação"],
            "TextBox 2": [["Corpus ", "e indexação bilíngue"]],
            "TextBox 3": ["PISA 2021 Creative Thinking Framework (OCDE) segmentado, vetorizado e traduzido."],
            "TextBox 6": ["56"],
            "TextBox 7": ["páginas oficiais"],
            "TextBox 10": ["224"],
            "TextBox 11": ["passagens (chunks)"],
            "TextBox 14": ["1.000"],
            "TextBox 15": ["caracteres por janela"],
            "TextBox 18": ["150"],
            "TextBox 19": ["caracteres de overlap"],
            "TextBox 22": ["768"],
            "TextBox 23": ["dimensões (L2)"],
            "TextBox 26": ["< 0,5s"],
            "TextBox 27": ["resposta em português"],
            "TextBox 29": ["Engenharia de dados"],
            "TextBox 31": ["Extração por página via PyMuPDF e manifesto SHA-256"],
            "TextBox 33": ["Chunking consciente de parágrafo (1000 chars / 150 overlap)"],
            "TextBox 35": ["Embeddings gemini-embedding-001 truncados em 768d (L2)"],
            "TextBox 37": ["Síntese explicativa em português (c.pt) nas 224 passagens"],
            "TextBox 39": ["GitHub Actions para atualização automática semanal de PDFs"],
            "Rounded Rectangle 40": ["Rastreabilidade por página"],
            "Rounded Rectangle 41": ["Busca cross-lingue PT → EN"],
            "Rounded Rectangle 42": ["Hospedagem 100% estática"],
            "Rounded Rectangle 43": ["Licença MIT + Direitos OCDE"],
        },
        "note": (
            "Slide 3 (2 min): Detalhar o preparo do corpus: 56 páginas convertidas em 224 chunks com overlap de 150 caracteres. "
            "Destacar o enriquecimento bilíngue (c.pt em todas as 224 passagens) e o workflow CI/CD no GitHub Actions com SHA-256."
        ),
    },
    {
        "src_slide": 11,
        "shapes": {
            "TextBox 1": ["Página 4    |    Arquitetura RAG"],
            "TextBox 2": [["Pipeline RAG ", "híbrido (Dense + BM25)"]],
            "TextBox 3": ["Combinação de recuperação semântica e lexical via Reciprocal Rank Fusion (RRF) com geração ancorada."],
            "TextBox 5": ["Consulta e contexto", "Histórico multi-turno e vocabulário indexado em PT e EN."],
            "TextBox 7": ["Recuperação híbrida", "Cosseno em embeddings (768d) + BM25 esparso (k1=1,2; b=0,75)."],
            "TextBox 9": ["Fusão RRF (k = 60)", "Combina top-30 de cada método (Cormack et al., 2009) em top-6."],
            "TextBox 11": ["Geração e citação", "Resposta em português com notas [Cxx] e abstenção controlada."],
            "TextBox 13": [
                "Complementaridade Denso vs. Esparso",
                "Enquanto embeddings alinham perguntas em português ao texto em inglês, o BM25 garante precisão exata para siglas, códigos de variáveis (ESCS, ICTRES) e termos técnicos.",
            ],
            "TextBox 15": [
                "Busca responsável: atualidade e privacidade",
                "O corpus usa o Third Draft (abril/2019); o sistema declara essa versão nas respostas, exibe o original e adota operação Zero-Key no GitHub Pages.",
            ],
            "Rounded Rectangle 16": ["Site no ar: https://joseedsonamorim.github.io/Chat-PISA-RAG/"],
        },
        "note": (
            "Slide 4 (2 min): Explicar a arquitetura RAG híbrida (Dense + BM25 + RRF k=60) e mostrar como superamos as falhas "
            "da 1ª VA e tratamos busca responsável (freshness do Third Draft 2019 e privacidade)."
        ),
    },
    {
        "src_slide": 12,
        "shapes": {
            "TextBox 1": ["Página 5    |    Demonstração e UX"],
            "TextBox 2": [["Caderno de consulta ", "e leitor documental"]],
            "TextBox 3": ["Design editorial suíço (Swiss Grid) em duas colunas: leitor à esquerda e chat em destaque à direita."],
            "TextBox 4": ["Consultas validadas na demonstração"],
            "TextBox 6": ["Como o PISA define pensamento criativo e suas facetas?"],
            "TextBox 8": ["Quais são os quatro domínios aplicados no teste?"],
            "TextBox 10": ["Como são pontuadas respostas de expressão visual?"],
            "TextBox 12": [
                "VERIFICAÇÃO IMEDIATA",
                "Clicar em qualquer nota [C96] rola o leitor lateral até a página exata e destaca a passagem.",
            ],
            "TextBox 14": [
                "Leitura editorial limpa",
                "Combina Rubik com Newsreader, remove quebras artificiais do PDF e mostra síntese em PT junto ao original.",
            ],
            "TextBox 16": [
                "Operação Zero-Key e LGPD",
                "Visitantes consultam sem digitar API Key (base pré-computada + BM25 bilíngue) ou via proxy local.",
                "Na fase de resiliência, apenas dados agregados (LGPD).",
            ],
        },
        "note": (
            "Slide 5 (3 min — Live Demo): Abrir https://joseedsonamorim.github.io/Chat-PISA-RAG/ no navegador, fazer 2 perguntas "
            "e clicar em uma citação [Cxx] para demonstrar o destaque automático no leitor editorial da coluna esquerda."
        ),
    },
    {
        "src_slide": 5,
        "shapes": {
            "TextBox 1": ["Página 6    |    Avaliação Experimental"],
            "TextBox 2": [["Avaliação separada ", "da recuperação"]],
            "TextBox 3": ["Benchmark auditável (scripts/evaluate_rag.py) com perguntas em português sobre o manual em inglês (k = 6)."],
            "TextBox 6": [
                [
                    "Conclusão: ",
                    "Dense e Hybrid RRF atingem 100% de revocação (HitRate@6 = 1,000), eliminando as lacunas lexicais do BM25 puro em consultas cross-lingues.",
                ]
            ],
        },
        "table": [
            ["Métrica / Comportamento", "BM25 (Esparso)", "Dense / Hybrid RRF"],
            ["HitRate@6 (revocação no top-6)", "0,667", "1,000 (Dense e RRF)"],
            ["Precision@6 (densidade útil)", "0,194", "0,639 (Dense) / 0,528 (RRF)"],
            ["MRR@6 (Mean Reciprocal Rank)", "0,389", "0,917 (Dense) / 0,833 (RRF)"],
            ["Busca cross-lingue (PT → EN)", "Limitada a cognatos", "Alinhamento semântico alto"],
            ["Siglas e códigos exatos (ESCS)", "Forte (match literal)", "Preservada via fusão RRF"],
            ["Consulta fora do escopo", "Score zero / abstenção", "Abstenção sem alucinação"],
            ["Latência na aplicação web", "< 0,5s (BM25 local)", "< 0,5s (cache) / ~1,5s (SSE)"],
        ],
        "note": (
            "Slide 6 (2 min): Apresentar os resultados medidos em docs/evaluation_benchmark.csv. Destacar que no BM25 puro Q2 e Q6 "
            "tiveram HitRate 0,000 pela barreira de idioma, enquanto Dense e Hybrid RRF alcançaram HitRate@6 = 1,000 (MRR 0,917 e 0,833)."
        ),
    },
    {
        "src_slide": 14,
        "shapes": {
            "TextBox 1": ["Página 7    |    Entrega e Próximos Passos"],
            "TextBox 5": [["Entregáveis ", "e integração no mestrado"]],
            "TextBox 9": ["30/11", "Deadline 2ª VA"],
            "TextBox 12": ["04/12", "Entrega 3ª VA"],
            "TextBox 15": ["v1.0.0", "GitHub Pages"],
            "TextBox 16": ["ENTREGAS CONCLUÍDAS E PRÓXIMOS PASSOS (3ª VA)"],
            "TextBox 18": ["Aplicação publicada no GitHub Pages (joseedsonamorim.github.io/Chat-PISA-RAG) com UX Zero-Key."],
            "TextBox 20": ["Repositório documentado com código modular, benchmark (evaluate_rag.py), licença MIT e CITATION.cff."],
            "TextBox 22": ["Workflow CI/CD (GitHub Actions) para sincronização semanal automática de novos PDFs da OCDE/INEP."],
            "TextBox 24": ["Integrar resultados da pesquisa de resiliência criativa (prevalência 11,9%; ROC-AUC 0,761 da logística)."],
            "TextBox 26": ["Textualizar tabelas regionais e preditores (GRADE, ICTEFFIC, CURIOAGR, ASSERAGR) em trechos RAG."],
            "TextBox 28": ["Expandir benchmark com perguntas numéricas agregadas por região para a entrega da 3ª VA em 04/12."],
        },
        "note": (
            "Fechamento (1 min): Recapitular que a 2ª VA está pronta e publicada antes do deadline de 30/11, e apresentar o "
            "roadmap até 04/12 (3ª VA): integrar as tabelas agregadas de resiliência criativa no Brasil ao mesmo motor RAG."
        ),
    },
]


def build() -> None:
    if not TEMPLATE_PPTX.exists():
        raise FileNotFoundError(f"Template not found: {TEMPLATE_PPTX}")

    n_slides = len(PITCH_SLIDES)
    with zipfile.ZipFile(TEMPLATE_PPTX, "r") as zin:
        entries = {name: zin.read(name) for name in zin.namelist()}

    new_entries: dict[str, bytes] = {}
    # Copia base estrutural (temas, masters, layouts, props) excluindo slides/notes/charts antigos
    for name, data in entries.items():
        if name.startswith(
            (
                "ppt/slides/",
                "ppt/notesSlides/",
                "ppt/charts/",
                "ppt/embeddings/",
            )
        ):
            continue
        new_entries[name] = data

    # Gera os 7 slides + notesSlides atualizados
    slide_rids = []
    for idx, cfg in enumerate(PITCH_SLIDES, start=1):
        src = cfg["src_slide"]
        s_xml = update_slide_xml(
            entries[f"ppt/slides/slide{src}.xml"],
            cfg["shapes"],
            cfg.get("table"),
        )
        new_entries[f"ppt/slides/slide{idx}.xml"] = s_xml

        # Relacionamento do slide -> layout original + notesSlide{idx}.xml
        s_rels = ET.fromstring(entries[f"ppt/slides/_rels/slide{src}.xml.rels"])
        for rel in s_rels.findall(f"{{{NS['rel']}}}Relationship"):
            if rel.attrib.get("Target", "").startswith("../notesSlides/"):
                rel.attrib["Target"] = f"../notesSlides/notesSlide{idx}.xml"
        new_entries[f"ppt/slides/_rels/slide{idx}.xml.rels"] = ET.tostring(
            s_rels, encoding="utf-8", xml_declaration=True
        )

        # Notes slide + rels
        n_xml = update_notes_xml(entries[f"ppt/notesSlides/notesSlide{src}.xml"], cfg["note"])
        new_entries[f"ppt/notesSlides/notesSlide{idx}.xml"] = n_xml

        n_rels = ET.fromstring(entries[f"ppt/notesSlides/_rels/notesSlide{src}.xml.rels"])
        for rel in n_rels.findall(f"{{{NS['rel']}}}Relationship"):
            if rel.attrib.get("Target", "").startswith("../slides/"):
                rel.attrib["Target"] = f"../slides/slide{idx}.xml"
        new_entries[f"ppt/notesSlides/_rels/notesSlide{idx}.xml.rels"] = ET.tostring(
            n_rels, encoding="utf-8", xml_declaration=True
        )
        slide_rids.append((idx, f"rId{10 + idx}", str(255 + idx)))

    # Atualiza ppt/presentation.xml.rels mantendo rIds estruturais não-slide
    pres_rels = ET.fromstring(entries["ppt/_rels/presentation.xml.rels"])
    for rel in list(pres_rels):
        if rel.attrib.get("Type", "").endswith("/slide"):
            pres_rels.remove(rel)
    for idx, rid, _ in slide_rids:
        ET.SubElement(
            pres_rels,
            f"{{{NS['rel']}}}Relationship",
            {
                "Id": rid,
                "Type": "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide",
                "Target": f"slides/slide{idx}.xml",
            },
        )
    ET.register_namespace("", NS["rel"])
    new_entries["ppt/_rels/presentation.xml.rels"] = ET.tostring(
        pres_rels, encoding="utf-8", xml_declaration=True
    )

    # Atualiza ppt/presentation.xml <p:sldIdLst>
    pres_xml = ET.fromstring(entries["ppt/presentation.xml"])
    sld_lst = pres_xml.find(f"{P_NS}sldIdLst")
    for child in list(sld_lst):
        sld_lst.remove(child)
    for _, rid, sid in slide_rids:
        ET.SubElement(sld_lst, f"{P_NS}sldId", {"id": sid, f"{R_NS}id": rid})
    new_entries["ppt/presentation.xml"] = ET.tostring(
        pres_xml, encoding="utf-8", xml_declaration=True
    )

    # Atualiza [Content_Types].xml removendo overrides antigos e adicionando os 7 novos
    ET.register_namespace("", NS["ct"])
    ct_root = ET.fromstring(entries["[Content_Types].xml"])
    for el in list(ct_root):
        pname = el.attrib.get("PartName", "")
        if pname.startswith(("/ppt/slides/", "/ppt/notesSlides/", "/ppt/charts/")):
            ct_root.remove(el)
    for idx in range(1, n_slides + 1):
        ET.SubElement(
            ct_root,
            f"{{{NS['ct']}}}Override",
            {
                "PartName": f"/ppt/slides/slide{idx}.xml",
                "ContentType": "application/vnd.openxmlformats-officedocument.presentationml.slide+xml",
            },
        )
        ET.SubElement(
            ct_root,
            f"{{{NS['ct']}}}Override",
            {
                "PartName": f"/ppt/notesSlides/notesSlide{idx}.xml",
                "ContentType": "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml",
            },
        )
    new_entries["[Content_Types].xml"] = ET.tostring(
        ct_root, encoding="utf-8", xml_declaration=True
    )

    with zipfile.ZipFile(OUT_PPTX_PROJECT, "w", zipfile.ZIP_DEFLATED) as zout:
        for name, data in new_entries.items():
            zout.writestr(name, data)

    shutil.copy2(OUT_PPTX_PROJECT, OUT_PPTX_ROOT)
    print(f"Generated {OUT_PPTX_PROJECT} ({OUT_PPTX_PROJECT.stat().st_size} bytes) with {n_slides} slides.")


if __name__ == "__main__":
    build()
