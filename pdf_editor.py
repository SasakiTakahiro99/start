# -*- coding: utf-8 -*-
"""
PDF内のテキストブロックを抽出し、座標(bbox)ベースで部分編集(消去+再描画)するコアモジュール。

poc_pdf_edit.py で検証した内容を再利用・整理したもの:
  - Noto Sans JP を fitz.Font(fontfile=...) 経由で描画すると、MuPDFが生成する
    ToUnicode CMapの都合で一部の漢字が私用領域寄りのコードポイントに変換される
    ことがあり、search_for() のような文字列完全一致に頼った検出は失敗しうる。
    そのため対象ブロックの特定は文字列検索ではなく座標(bbox)ベースで行うこと。
  - 置換はredact(白塗り消去) + TextWriterでの再描画という擬似編集で行う。
"""

import os

import fitz  # PyMuPDF

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(BASE_DIR, "NotoSansJP-Regular.otf")
FONT_NAME = "notojp"


def extract_text_blocks(pdf_path: str) -> list[dict]:
    """PDF内の各ページのテキストブロック(span単位)を抽出する。

    get_text("dict") の block/line/span 構造からspan単位で情報を取り出し、
    {"page": ページ番号(0始まり), "text": テキスト, "bbox": [x0, y0, x1, y1],
     "font_size": フォントサイズ} の辞書のリストを返す。
    """
    blocks: list[dict] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        blocks.append(
                            {
                                "page": page_index,
                                "text": span["text"],
                                "bbox": list(span["bbox"]),
                                "font_size": span["size"],
                            }
                        )
    finally:
        doc.close()
    return blocks


def replace_text_block(
    pdf_path: str,
    page: int,
    bbox: list[float],
    new_text: str,
    font_size: float,
    output_path: str,
) -> None:
    """指定ページ・bboxのテキストをredactで消去し、new_textを同じ位置に再描画する。

    対象はbbox(座標)で直接指定する。文字列検索には依存しない。
    """
    doc = fitz.open(pdf_path)
    try:
        target_page = doc[page]
        rect = fitz.Rect(bbox)

        target_page.add_redact_annot(rect, fill=(1, 1, 1))
        target_page.apply_redactions()

        target_page.insert_font(fontname=FONT_NAME, fontfile=FONT_PATH)
        font = fitz.Font(fontfile=FONT_PATH)

        tw = fitz.TextWriter(target_page.rect)
        baseline_y = rect.y1 - font_size * 0.22
        tw.append((rect.x0, baseline_y), new_text, font=font, fontsize=font_size)
        tw.write_text(target_page)

        doc.save(output_path)
    finally:
        doc.close()
