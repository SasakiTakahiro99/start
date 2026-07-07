# -*- coding: utf-8 -*-
"""pdf_editor.py の動作確認スクリプト。

1. extract_text_blocks("sample_resume.pdf") を実行し、「山田太郎」を含むブロックを確認
2. そのブロックのbbox/font_sizeを使い replace_text_block() で「鈴木花子」に置換し test_output.pdf を生成
3. test_output.pdf を再度 extract_text_blocks() し、NFKC正規化した上で「鈴木花子」への置換を確認

実行方法:
  "C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\python.exe" test_pdf_editor.py
  (pytestからも実行可能: python -m pytest test_pdf_editor.py -v)
"""

import contextlib
import io
import os
import sys
import unicodedata

import fitz  # PyMuPDF
import pytest

from pdf_editor import edit_pdf, extract_text_blocks, replace_text_block

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_PDF = os.path.join(BASE_DIR, "sample_resume.pdf")
OUTPUT_PDF = os.path.join(BASE_DIR, "test_output.pdf")
RUN_LOG = os.path.join(BASE_DIR, "test_run_log.txt")

OLD_NAME = "山田太郎"
NEW_NAME = "鈴木花子"


def test_replace_text_block_success(tmp_path):
    """extract_text_blocks -> replace_text_block -> 再extractで置換結果を検証する(pytest用)。"""
    if not os.path.exists(SRC_PDF):
        pytest.skip(f"サンプルPDFが見つかりません: {SRC_PDF}")

    blocks = extract_text_blocks(SRC_PDF)
    assert len(blocks) > 0

    target_block = None
    for b in blocks:
        normalized = unicodedata.normalize("NFKC", b["text"])
        if OLD_NAME in normalized:
            target_block = b
    assert target_block is not None, f"'{OLD_NAME}' を含むブロックが見つかりませんでした。"

    output_pdf = os.path.join(tmp_path, "test_output.pdf")
    replace_text_block(
        pdf_path=SRC_PDF,
        page=target_block["page"],
        bbox=target_block["bbox"],
        new_text=NEW_NAME,
        font_size=target_block["font_size"],
        output_path=output_pdf,
    )
    assert os.path.exists(output_pdf)

    new_blocks = extract_text_blocks(output_pdf)
    full_text = "".join(b["text"] for b in new_blocks if b["page"] == target_block["page"])
    normalized_full = unicodedata.normalize("NFKC", full_text)

    has_new = NEW_NAME in normalized_full or ("鈴木" in normalized_full and "花子" in normalized_full)
    has_old = OLD_NAME in normalized_full

    assert has_new, f"編集後テキストに '{NEW_NAME}' が含まれていません: {normalized_full!r}"
    assert not has_old, f"編集後テキストに旧テキスト '{OLD_NAME}' が残っています: {normalized_full!r}"


def test_edit_pdf_preserves_cell_background_color(tmp_path):
    """背景色付きセルを編集しても、redact消去で背景色が白くならず保持されることを確認する。"""
    src_pdf = os.path.join(tmp_path, "bg_source.pdf")
    output_pdf = os.path.join(tmp_path, "bg_output.pdf")

    bg_color = (0.9, 0.9, 0.9)
    cell_rect = fitz.Rect(50, 50, 250, 100)

    doc = fitz.open()
    page = doc.new_page()
    page.draw_rect(cell_rect, color=None, fill=bg_color)
    page.insert_text((cell_rect.x0 + 5, cell_rect.y1 - 10), "old text", fontsize=12)
    doc.save(src_pdf)
    doc.close()

    edit_pdf(
        pdf_path=src_pdf,
        edits=[{"page": 0, "bbox": [cell_rect.x0, cell_rect.y0, cell_rect.x0 + 60, cell_rect.y1], "new_text": "new"}],
        output_path=output_pdf,
    )
    assert os.path.exists(output_pdf)

    out_doc = fitz.open(output_pdf)
    try:
        out_page = out_doc[0]
        pix = out_page.get_pixmap()
        # 編集領域の右端付近(新テキストの外側の余白)をサンプリングし、
        # 白(255,255,255)ではなく元の背景色(グレー)に近いことを確認する。
        sample_x = int(cell_rect.x0 + 55)
        sample_y = int(cell_rect.y0 + 5)
        r, g, b = pix.pixel(sample_x, sample_y)[:3]
        expected = tuple(round(c * 255) for c in bg_color)
        assert (r, g, b) != (255, 255, 255), "背景色が白で上書きされています。"
        for actual, exp in zip((r, g, b), expected):
            assert abs(actual - exp) <= 5, f"背景色が保持されていません: got={r,g,b}, expected={expected}"
    finally:
        out_doc.close()


def test_edit_pdf_preserves_background_for_multiple_edits_in_same_box(tmp_path):
    """同じ背景色ボックス内の複数箇所を1回のedit_pdf()呼び出しで編集しても、
    2箇所目以降も背景色が保持されることを確認する(1箇所目のredactionが
    背景矩形を欠損させ、後続editの背景検出に失敗する不具合の再現・回帰テスト)。"""
    src_pdf = os.path.join(tmp_path, "bg_multi_source.pdf")
    output_pdf = os.path.join(tmp_path, "bg_multi_output.pdf")

    bg_color = (0.7, 0.9, 1.0)
    cell_rect = fitz.Rect(50, 50, 350, 100)

    doc = fitz.open()
    page = doc.new_page()
    page.draw_rect(cell_rect, color=None, fill=bg_color)
    page.insert_text((cell_rect.x0 + 5, cell_rect.y1 - 10), "first span", fontsize=12)
    page.insert_text((cell_rect.x0 + 150, cell_rect.y1 - 10), "second span", fontsize=12)
    doc.save(src_pdf)
    doc.close()

    edit_pdf(
        pdf_path=src_pdf,
        edits=[
            {"page": 0, "bbox": [cell_rect.x0, cell_rect.y0, cell_rect.x0 + 60, cell_rect.y1], "new_text": "AAA"},
            {"page": 0, "bbox": [cell_rect.x0 + 150, cell_rect.y0, cell_rect.x0 + 210, cell_rect.y1], "new_text": "BBB"},
        ],
        output_path=output_pdf,
    )
    assert os.path.exists(output_pdf)

    out_doc = fitz.open(output_pdf)
    try:
        out_page = out_doc[0]
        pix = out_page.get_pixmap()
        expected = tuple(round(c * 255) for c in bg_color)

        # 1つ目の編集領域(右端の余白)
        r1, g1, b1 = pix.pixel(int(cell_rect.x0 + 55), int(cell_rect.y0 + 5))[:3]
        # 2つ目の編集領域(右端の余白)
        r2, g2, b2 = pix.pixel(int(cell_rect.x0 + 205), int(cell_rect.y0 + 5))[:3]

        for label, (r, g, b) in (("1つ目", (r1, g1, b1)), ("2つ目", (r2, g2, b2))):
            assert (r, g, b) != (255, 255, 255), f"{label}の編集領域の背景色が白で上書きされています。"
            for actual, exp in zip((r, g, b), expected):
                assert abs(actual - exp) <= 5, (
                    f"{label}の編集領域で背景色が保持されていません: got={(r, g, b)}, expected={expected}"
                )
    finally:
        out_doc.close()


def test_edit_pdf_white_background_still_erases_to_white(tmp_path):
    """背景塗りつぶしがない(白背景)セルを編集した場合、従来通り白で消去・再描画されることを確認する。"""
    src_pdf = os.path.join(tmp_path, "white_source.pdf")
    output_pdf = os.path.join(tmp_path, "white_output.pdf")

    cell_rect = fitz.Rect(50, 50, 250, 100)

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((cell_rect.x0 + 5, cell_rect.y1 - 10), "old text", fontsize=12)
    doc.save(src_pdf)
    doc.close()

    edit_pdf(
        pdf_path=src_pdf,
        edits=[{"page": 0, "bbox": [cell_rect.x0, cell_rect.y0, cell_rect.x0 + 60, cell_rect.y1], "new_text": "new"}],
        output_path=output_pdf,
    )

    out_doc = fitz.open(output_pdf)
    try:
        out_page = out_doc[0]
        pix = out_page.get_pixmap()
        sample_x = int(cell_rect.x0 + 55)
        sample_y = int(cell_rect.y0 + 5)
        r, g, b = pix.pixel(sample_x, sample_y)[:3]
        assert (r, g, b) == (255, 255, 255), f"白背景セルが白以外で消去されています: {(r, g, b)}"
    finally:
        out_doc.close()


def test_edit_pdf_repeated_label_edits_do_not_overlap_text(tmp_path):
    """edit_pdf()を複数回(別々の保存を挟んで)呼び出し、labelパターンで同じ
    フィールドを繰り返し再編集しても、前回描画した値の上に新しい値が
    重ね書きされず正しく置き換わることを確認する回帰テスト。

    再描画したvalue spanは元のlabel spanとbaseline位置がわずかにずれるため、
    extract_text_blocks()がline構造だけに頼るとlabelとvalueが別ブロックに
    分離され、2回目以降のlabel指定編集でvalue部分のbboxを見失って前回の
    テキストの上に新テキストが重なって描画される(判読不能になる)不具合の
    再現・回帰テスト。3回連続で編集を重ねても問題ないことも確認する。
    """
    src_pdf = os.path.join(tmp_path, "label_source.pdf")

    doc = fitz.open()
    page = doc.new_page()
    fontname = "notojp"
    from pdf_editor import FONT_PATH

    page.insert_font(fontname=fontname, fontfile=FONT_PATH)
    # 氏名欄の後に他のフィールド行を続ける(sample_resume.pdfと同様の複数行構成)。
    # 単一行だけのPDFだとMuPDFのline結合判定にたまたま吸収され、再描画後の
    # label/valueの分離(不具合の再現条件)が安定して起きないため。
    page.insert_text((50, 106), "氏名: 山田太郎", fontname=fontname, fontsize=12)
    page.insert_text((50, 136), "生年月日: 1999年8月1日", fontname=fontname, fontsize=12)
    page.insert_text((50, 166), "住所: 東京都千代田区一丁目1番1号", fontname=fontname, fontsize=12)
    doc.save(src_pdf)
    doc.close()

    names = ["鈴木花子", "田中次郎", "佐藤三郎"]
    cur_path = src_pdf
    for i, new_name in enumerate(names, start=1):
        blocks = extract_text_blocks(cur_path)
        target = None
        for b in blocks:
            normalized = unicodedata.normalize("NFKC", b["text"])
            if "氏名" in normalized:
                target = b
        assert target is not None, f"{i}回目: '氏名'を含むブロックが見つかりませんでした。"

        out_path = os.path.join(tmp_path, f"label_round{i}.pdf")
        edit_pdf(
            pdf_path=cur_path,
            edits=[
                {
                    "page": target["page"],
                    "bbox": target["bbox"],
                    "text": target["text"],
                    "label": "氏名: ",
                    "new_text": new_name,
                    "font_size": target["font_size"],
                }
            ],
            output_path=out_path,
        )
        cur_path = out_path

    final_blocks = extract_text_blocks(cur_path)
    name_blocks = [b for b in final_blocks if "氏名" in unicodedata.normalize("NFKC", b["text"])]
    assert len(name_blocks) == 1, f"氏名ブロックが1つに統合されていません: {name_blocks!r}"

    final_normalized = unicodedata.normalize("NFKC", name_blocks[0]["text"])
    assert "佐藤三郎" in final_normalized, f"最終的な氏名が更新されていません: {final_normalized!r}"
    for old_name in ("山田太郎", "鈴木花子", "田中次郎"):
        assert old_name not in final_normalized, (
            f"旧テキスト '{old_name}' が氏名ブロックに残っています: {final_normalized!r}"
        )

    out_doc = fitz.open(cur_path)
    try:
        out_page = out_doc[0]
        pix = out_page.get_pixmap(matrix=fitz.Matrix(4, 4))
        # 最終テキストが描画されている領域に、非白ピクセルが存在すること
        # (=描画自体が消えていないこと)を確認する。
        found_non_white = False
        for x in range(int(50 * 4), int(150 * 4)):
            for y in range(int(105 * 4), int(126 * 4)):
                if pix.pixel(x, y)[:3] != (255, 255, 255):
                    found_non_white = True
                    break
            if found_non_white:
                break
        assert found_non_white, "最終編集後のテキストが描画されていません(空白になっています)。"
    finally:
        out_doc.close()


def main() -> int:
    if not os.path.exists(SRC_PDF):
        raise FileNotFoundError(f"サンプルPDFが見つかりません: {SRC_PDF}")

    print("=== Step1: extract_text_blocks(sample_resume.pdf) ===")
    blocks = extract_text_blocks(SRC_PDF)
    print(f"抽出されたブロック数: {len(blocks)}")

    target_block = None
    for b in blocks:
        normalized = unicodedata.normalize("NFKC", b["text"])
        if OLD_NAME in normalized or ("氏名" in normalized):
            print(f"  候補ブロック: {b}")
        if OLD_NAME in normalized:
            target_block = b

    if target_block is None:
        print(f"[FAIL] '{OLD_NAME}' を含むブロックが見つかりませんでした。")
        return 1

    print(f"[OK] 対象ブロックを特定しました: {target_block}")

    print("\n=== Step2: replace_text_block() で山田太郎 -> 鈴木花子 ===")
    replace_text_block(
        pdf_path=SRC_PDF,
        page=target_block["page"],
        bbox=target_block["bbox"],
        new_text=NEW_NAME,
        font_size=target_block["font_size"],
        output_path=OUTPUT_PDF,
    )
    print(f"[OK] {OUTPUT_PDF} を生成しました。")

    print("\n=== Step3: test_output.pdf を再抽出して置換結果を確認 ===")
    new_blocks = extract_text_blocks(OUTPUT_PDF)

    full_text = "".join(b["text"] for b in new_blocks if b["page"] == target_block["page"])
    normalized_full = unicodedata.normalize("NFKC", full_text)

    print(f"編集後ページ全体の抽出テキスト(生): {full_text!r}")
    print(f"編集後ページ全体の抽出テキスト(NFKC正規化後): {normalized_full!r}")

    has_new = NEW_NAME in normalized_full or ("鈴木" in normalized_full and "花子" in normalized_full)
    has_old = OLD_NAME in normalized_full

    print(f"[確認] 新テキスト('{NEW_NAME}')が含まれる: {has_new}")
    print(f"[確認] 旧テキスト('{OLD_NAME}')が残っていない: {not has_old}")

    if has_new and not has_old:
        print("\n[PASS] 置換に成功しています。")
        return 0

    print("\n[FAIL] 置換結果が期待通りではありません。")
    return 1


if __name__ == "__main__":
    buf = io.StringIO()
    exit_code = 1
    try:
        with contextlib.redirect_stdout(buf):
            exit_code = main()
    except Exception:
        import traceback

        buf.write("\n[EXCEPTION]\n")
        buf.write(traceback.format_exc())
        exit_code = 1
    finally:
        output = buf.getvalue()
        with open(RUN_LOG, "w", encoding="utf-8") as f:
            f.write(output)
        try:
            print(output)
        except UnicodeEncodeError:
            safe = output.encode(sys.stdout.encoding or "cp932", errors="replace").decode(
                sys.stdout.encoding or "cp932"
            )
            print(safe)
    sys.exit(exit_code)
