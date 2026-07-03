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
import unicodedata

import fitz  # PyMuPDF

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FONT_PATH = os.path.join(BASE_DIR, "NotoSansJP-Regular.otf")
FONT_NAME = "notojp"


def normalize_text(s: str) -> str:
    """NFKC正規化した文字列を返す。

    MuPDFのToUnicode CMap生成がCJK互換漢字の私用領域寄りコードポイントを
    出力することがあるため、抽出テキストを比較する際は必ずこれを通す。
    """
    return unicodedata.normalize("NFKC", s)


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


def compute_value_bbox(
    full_text: str,
    bbox: list[float],
    label: str,
    font: "fitz.Font",
    font_size: float,
) -> list[float]:
    """spanのbboxから、ラベル部分を除いた値部分だけのbboxを計算する。

    full_textがlabelで始まることを前提に、font.text_length()でラベルの
    描画幅を求め、bboxのx0にその幅を加えたrectを返す(poc_pdf_edit.pyの
    find_name_value_rect()と同じ考え方)。

    PDF内部ではinsert_text等で描画した半角スペースがNBSP(\xa0)として
    抽出されることがあるため、startswith判定と幅計算はNFKC正規化後の
    文字列で行う(labelの文字数さえ合っていれば、実際の描画幅は正規化前の
    full_text先頭のlabelと同じ文字数分をfont.text_length()に渡せば求まる)。
    """
    normalized_full = normalize_text(full_text)
    normalized_label = normalize_text(label)
    if not normalized_full.startswith(normalized_label):
        raise ValueError(f"full_text ({full_text!r}) が label ({label!r}) で始まっていません。")

    label_in_full_text = full_text[: len(normalized_label)]
    label_width = font.text_length(label_in_full_text, fontsize=font_size)
    x0, y0, x1, y1 = bbox
    return [x0 + label_width, y0, x1, y1]


def _subset_fonts(doc: "fitz.Document") -> None:
    """出力前にフォントをサブセット化し、埋め込みファイルサイズを削減する。

    PyMuPDF 1.28.0にはMuPDF組み込みのサブセット機能(doc.subset_fonts())があるが、
    検証の結果、既定実装(fallback=False)は再描画後のToUnicode CMapを壊し
    抽出テキストが文字化けすることを確認したため使わない。
    fontTools実装のfallback=Trueは抽出テキストを壊さないため、常にこちらを使う。
    """
    doc.subset_fonts(fallback=True)


def edit_pdf(
    pdf_path: str,
    edits: list[dict],
    output_path: str,
) -> str:
    """複数の編集(redact消去+再描画)を1回のdocオープンで適用し、最後に1回だけ保存する。

    Args:
        pdf_path: 編集対象の元PDFパス。
        edits: [{"page": int, "bbox": [x0,y0,x1,y1], "new_text": str,
                 "font_size": float(省略可、省略時はbboxの高さから推定),
                 "label": str(省略可。指定時は"text"も必須で、bboxをラベル分
                              差し引いた値部分のbboxに補正してから編集する),
                 "text": str(labelを指定する場合のみ必須。bbox元のフルテキスト)}, ...]
        output_path: 保存先パス。

    Returns:
        保存したPDFファイルのパス。
    """
    doc = fitz.open(pdf_path)
    try:
        font = fitz.Font(fontfile=FONT_PATH)

        for edit in edits:
            page = doc[edit["page"]]
            bbox = edit["bbox"]
            font_size = edit.get("font_size")
            if font_size is None:
                rect = fitz.Rect(bbox)
                font_size = (rect.y1 - rect.y0) * 0.8

            label = edit.get("label")
            if label is not None:
                bbox = compute_value_bbox(edit["text"], bbox, label, font, font_size)

            rect = fitz.Rect(bbox)

            page.add_redact_annot(rect, fill=(1, 1, 1))
            page.apply_redactions()

            tw = fitz.TextWriter(page.rect)
            baseline_y = rect.y1 - font_size * 0.22
            tw.append((rect.x0, baseline_y), edit["new_text"], font=font, fontsize=font_size)
            tw.write_text(page)

        _subset_fonts(doc)
        # garbage=4: サブセット化前の未参照フォントオブジェクト等を回収しないと
        # ファイルサイズが縮小されないため必須。deflateで追加圧縮もかける。
        doc.save(output_path, garbage=4, deflate=True)
    finally:
        doc.close()

    return output_path


def replace_text_block(
    pdf_path: str,
    page: int,
    bbox: list[float],
    new_text: str,
    font_size: float | None,
    output_path: str,
) -> str:
    """単一のテキストブロックを書き換える。edit_pdf()の単一編集版のショートカット。

    対象はbbox(座標)で直接指定する。文字列検索には依存しない。
    """
    edit = {"page": page, "bbox": list(bbox), "new_text": new_text}
    if font_size is not None:
        edit["font_size"] = font_size
    return edit_pdf(pdf_path, [edit], output_path)
