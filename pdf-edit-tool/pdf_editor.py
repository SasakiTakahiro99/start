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


def _group_spans_into_rows(spans: list[dict]) -> list[list[dict]]:
    """spanをY座標の重なりに基づいて「行」ごとにグルーピングする。

    edit_pdf()で値部分だけをTextWriterで再描画すると、そのbaseline位置が
    元のラベルspanとごくわずか(1pt未満)にずれ、MuPDFのget_text("dict")上は
    ラベルと値が別々のline(=別々のblock)として抽出されてしまう。そのまま
    span単位で返すと、2回目以降の編集でlabelパターン(ラベル+値の結合)が
    再現できず、値部分のbboxを見失って前回描画したテキストの上に新テキストを
    重ね書きしてしまう不具合につながる。そのため、line構造をそのまま信用せず、
    bboxのY範囲が重なるspan同士を同じ行とみなして再グルーピングする。
    """
    remaining = sorted(spans, key=lambda s: (s["bbox"][1], s["bbox"][0]))
    rows: list[list[dict]] = []
    for span in remaining:
        y0, y1 = span["bbox"][1], span["bbox"][3]
        placed = False
        for row in rows:
            row_y0 = min(s["bbox"][1] for s in row)
            row_y1 = max(s["bbox"][3] for s in row)
            overlap = min(y1, row_y1) - max(y0, row_y0)
            min_height = min(y1 - y0, row_y1 - row_y0)
            if min_height > 0 and overlap / min_height >= 0.5:
                row.append(span)
                placed = True
                break
        if not placed:
            rows.append([span])
    for row in rows:
        row.sort(key=lambda s: s["bbox"][0])
    return rows


def extract_text_blocks(pdf_path: str) -> list[dict]:
    """PDF内の各ページのテキストブロックを行単位で抽出する。

    get_text("dict") の block/line/span 構造からspanを取り出した上で、
    同じ行とみなせるspan(Y座標が重なるspan)をX座標順に連結し、
    {"page": ページ番号(0始まり), "text": テキスト, "bbox": [x0, y0, x1, y1],
     "font_size": フォントサイズ} の辞書のリストを返す。

    edit_pdf()で再描画した値spanは元のラベルspanとbaseline位置がわずかに
    ずれるため、MuPDFのline構造だけに頼るとラベルと値が別ブロックとして
    分離されてしまう(_group_spans_into_rows()参照)。それを防ぐため、
    行のグルーピングはline構造ではなくbboxのY方向の重なりで行う。
    """
    blocks: list[dict] = []
    doc = fitz.open(pdf_path)
    try:
        for page_index, page in enumerate(doc):
            spans: list[dict] = []
            for block in page.get_text("dict")["blocks"]:
                for line in block.get("lines", []):
                    for span in line["spans"]:
                        spans.append(span)

            for row in _group_spans_into_rows(spans):
                x0 = min(s["bbox"][0] for s in row)
                y0 = min(s["bbox"][1] for s in row)
                x1 = max(s["bbox"][2] for s in row)
                y1 = max(s["bbox"][3] for s in row)
                blocks.append(
                    {
                        "page": page_index,
                        "text": "".join(s["text"] for s in row),
                        "bbox": [x0, y0, x1, y1],
                        "font_size": row[0]["size"],
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


def _detect_background_fill(page: "fitz.Page", rect: "fitz.Rect") -> tuple[float, float, float] | None:
    """rectを覆う背景塗りつぶし矩形の色を検出する。

    page.get_drawings()から塗りつぶし(fill)ありの矩形描画を探し、rectを
    包含または大きく重なるものの中で最も面積が小さい(=セル単位に近い)ものを
    背景色として採用する。見つからなければNoneを返す(呼び出し側で白にフォールバック)。
    """
    best_fill = None
    best_area = None
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        if not fill:
            continue
        d_rect = drawing.get("rect")
        if d_rect is None:
            continue
        d_rect = fitz.Rect(d_rect)
        intersection = d_rect & rect
        if intersection.is_empty:
            continue
        # rectの大部分(9割以上)を覆っている矩形だけを背景候補とする
        if rect.get_area() <= 0 or intersection.get_area() / rect.get_area() < 0.9:
            continue
        area = d_rect.get_area()
        if best_area is None or area < best_area:
            best_area = area
            best_fill = fill
    return best_fill


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

        # 検出フェーズ: 同一ページ内の複数editがある場合、後続editのredact/apply_redactionsが
        # 先行editの背景塗りつぶし矩形を欠損・分割させてしまい、背景色検出に失敗する
        # (fallbackで白になる)ことがある。そのため、ページの状態を変更する前に
        # 全editのrect確定と背景色検出を先に済ませておく。
        prepared = []
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
            background_fill = _detect_background_fill(page, rect)

            prepared.append(
                {
                    "page": page,
                    "rect": rect,
                    "font_size": font_size,
                    "new_text": edit["new_text"],
                    "fill_color": background_fill if background_fill is not None else (1, 1, 1),
                }
            )

        # 適用フェーズ: 検出済みの背景色を使ってredact + 再描画を順番に適用する。
        for item in prepared:
            page = item["page"]
            rect = item["rect"]
            font_size = item["font_size"]

            page.add_redact_annot(rect, fill=item["fill_color"])
            page.apply_redactions()

            tw = fitz.TextWriter(page.rect)
            baseline_y = rect.y1 - font_size * 0.22
            tw.append((rect.x0, baseline_y), item["new_text"], font=font, fontsize=font_size)
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
