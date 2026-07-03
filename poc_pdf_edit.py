# -*- coding: utf-8 -*-
"""
PoC: PDF内の既存テキストを「redact(消去) + 再描画」で部分編集できるかを検証するスクリプト。

やること:
  1. サンプル履歴書PDF (sample_resume.pdf) を生成する
     (「氏名: 山田太郎」を含む数行の日本語テキスト)
  2. その中の「山田太郎」を検出し、
     - add_redact_annot() + apply_redactions() で矩形を白塗り消去
     - 同じ位置に TextWriter で「鈴木花子」を日本語フォントで再描画
     という擬似編集を行い sample_resume_edited.pdf として保存する
  3. 編集後PDFからテキストを抽出し、正しく置換されているか確認する

実行方法:
  "C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\python.exe" poc_pdf_edit.py

重要な既知の問題 (詳細は最終報告参照):
  Noto Sans JP (Windows標準搭載の可変フォント、および Google公式配布の静的OTF の
  いずれでも) を fitz.Font(fontfile=...) 経由で insert_text/TextWriter に使うと、
  MuPDFが生成するPDFのToUnicode CMapで「履」「郎」「年」「立」などの一部の漢字が
  正規のUnicodeコードポイントではなくCJK互換漢字ブロックの私用領域寄りのコード
  ポイント (例: 郎 U+90CE -> U+F92C) に変換されてしまうことを確認した。
  表示グリフ自体は正しい字形になるが、抽出テキストの文字コードがずれるため、
  search_for("山田太郎") のようなUnicode文字列一致による検索がヒットしないことがある。
  この挙動はフォントを変えても再現し(VF/fontToolsで切り出した静的インスタンス/
  Google公式静的OTFのいずれでも再現)、MuPDF組み込みのCJKフォント
  (fontname="japan-s") に切り替えた場合のみ発生しなかったことを確認済み。
  つまりフォント側ではなくMuPDF側のToUnicode CMap生成ロジックに起因する問題であり、
  「使うフォントを変える」だけでは解決しない。

  そのため本PoCでは、対象検出を文字列の完全一致(search_for)に依存させず、
  「氏名ラベルの右側にある行」というレイアウト(座標/bbox)ベースで矩形を特定する
  方式にしている。本実装でこのアプローチを採用する場合も、検出ロジックは
  レイアウト/座標ベースにするか、抽出テキストの私用領域コードポイントを
  CJK互換漢字正規化テーブルで正規化してから比較する仕組みが必要になる。
"""

import contextlib
import io
import os
import sys
import unicodedata

import fitz  # PyMuPDF

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_PDF = os.path.join(BASE_DIR, "sample_resume.pdf")
EDITED_PDF = os.path.join(BASE_DIR, "sample_resume_edited.pdf")
RUN_LOG = os.path.join(BASE_DIR, "run_log.txt")

# Google公式配布の Noto Sans JP 静的ウェイト版 (SIL OFL 1.1, 商用利用可)
# https://github.com/googlefonts/noto-cjk
FONT_PATH = os.path.join(BASE_DIR, "NotoSansJP-Regular.otf")

NAME_LABEL = "氏名: "
TARGET_TEXT = "山田太郎"
REPLACEMENT_TEXT = "鈴木花子"

SAMPLE_LINES = [
    ("履歴書", 60, 18),
    (f"{NAME_LABEL}{TARGET_TEXT}", 120, 12),
    ("生年月日: 1999年8月1日", 150, 12),
    ("住所: 東京都千代田区一丁目1番1号", 180, 12),
    ("学歴: 明治大学法学部 卒業", 210, 12),
    ("職歴: 株式会社サンプル 勤務", 240, 12),
]


def step1_create_sample_pdf():
    """サンプル履歴書PDFを生成する"""
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)  # A4

    page.insert_font(fontname="notojp", fontfile=FONT_PATH)
    for text, y, fontsize in SAMPLE_LINES:
        page.insert_text((50, y), text, fontname="notojp", fontsize=fontsize)

    doc.save(SRC_PDF)
    doc.close()
    print(f"[OK] サンプルPDFを生成しました: {SRC_PDF}")


def find_name_value_rect(page, font):
    """
    「氏名: 」の右側にある値(山田太郎)の矩形をレイアウト情報から特定する。

    search_for()によるUnicode文字列一致は、モジュールdocstringに記載の
    ToUnicode CMap問題により「郎」を含む文字列で失敗することを確認済みのため、
    ここでは文字列一致に頼らない。
    実際に確認したところ、insert_textで描画した「氏名:\xa0山田太郎」のような行は
    ラベルと値が別spanには分かれず1つのspanにまとまる(get_text("dict")で確認済み)。
    そのため、spanのtextが"氏名"で始まる場合に限り、
    font.text_length()でラベル部分("氏名: ")の描画幅を計算し、
    span全体のbboxからラベル幅を差し引いた残りを値(山田太郎)の矩形とする。
    """
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span["text"]
                if not text.startswith("氏名"):
                    continue
                bbox = span["bbox"]
                fontsize = span["size"]
                label = NAME_LABEL
                label_width = font.text_length(label, fontsize=fontsize)
                label_rect = fitz.Rect(bbox[0], bbox[1], bbox[0] + label_width, bbox[3])
                value_rect = fitz.Rect(bbox[0] + label_width, bbox[1], bbox[2], bbox[3])
                return value_rect, label_rect

    return None, None


def step2_redact_and_rewrite():
    """「氏名: 」欄の値(山田太郎)をredactで消去し、「鈴木花子」で再描画する"""
    doc = fitz.open(SRC_PDF)
    page = doc[0]

    before_text = page.get_text()
    print("=== 編集前の抽出テキスト ===")
    print(before_text)

    font_size = 12.0  # SAMPLE_LINESで氏名行に指定したサイズと合わせる
    font = fitz.Font(fontfile=FONT_PATH)

    value_rect, label_rect = find_name_value_rect(page, font)
    if value_rect is None:
        print("[NG] 氏名欄のレイアウトを特定できませんでした。")
        doc.close()
        return False

    print(f"[OK] 氏名ラベル矩形: {label_rect}")
    print(f"[OK] 氏名値(山田太郎)の矩形: {value_rect}")

    page.add_redact_annot(value_rect, fill=(1, 1, 1))
    page.apply_redactions()
    print(f"[OK] apply_redactions() で矩形 {value_rect} を白塗り消去しました。")

    tw = fitz.TextWriter(page.rect)
    baseline_y = value_rect.y1 - font_size * 0.22
    tw.append((value_rect.x0, baseline_y), REPLACEMENT_TEXT, font=font, fontsize=font_size)
    tw.write_text(page)
    print(f"[OK] '{REPLACEMENT_TEXT}' を同じ位置に再描画しました。")

    doc.save(EDITED_PDF)
    doc.close()
    print(f"[OK] 編集後PDFを保存しました: {EDITED_PDF}")
    return True


def step3_verify():
    """編集後PDFからテキストを抽出し、置換結果を確認する。

    注意: search_for/get_text の完全一致はToUnicode私用領域問題の影響を受けるため、
    判定は「氏名欄付近のbboxに含まれるspanテキスト」に対して、
    影響を受けにくい文字(鈴/木/山/田 など)の有無で行う。
    """
    doc = fitz.open(EDITED_PDF)
    page = doc[0]
    text = page.get_text()
    print("=== 編集後の抽出テキスト(プレーン, 読み順) ===")
    print(text)

    print("=== 編集後テキストの文字コード一覧 ===")
    for ch in text:
        if ch == "\n":
            continue
        print(f"  {ch!r} U+{ord(ch):04X}")

    name_field_rect = fitz.Rect(45, 105, 300, 132)  # 氏名欄付近(余裕を持たせた矩形)
    spans_in_field = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                span_rect = fitz.Rect(span["bbox"])
                if name_field_rect.intersects(span_rect):
                    spans_in_field.append(span["text"])
    doc.close()

    field_text = "".join(spans_in_field)
    print(f"=== 氏名欄(bbox一致)の抽出結果: {field_text!r} ===")

    # MuPDFのToUnicode CMap生成がCJK互換漢字の私用領域コードポイントを
    # 出力することがある(モジュールdocstring参照)ため、NFKC正規化してから比較する。
    normalized = unicodedata.normalize("NFKC", field_text)
    has_new = ("鈴" in normalized) and ("木" in normalized)
    has_old = ("山" in normalized) and ("田" in normalized)

    print(f"[確認] 氏名欄に新テキスト('鈴木'相当)が含まれる: {has_new}")
    print(f"[確認] 氏名欄に旧テキスト('山田'相当)が残っていない: {not has_old}")

    if has_new and not has_old:
        print("[PASS] 置換に成功しています。")
        return True
    print("[FAIL] 置換に問題があります。")
    return False


def main():
    if not os.path.exists(FONT_PATH):
        raise FileNotFoundError(f"フォントファイルが見つかりません: {FONT_PATH}")

    print("=== Step1: サンプルPDF生成 ===")
    step1_create_sample_pdf()

    print("\n=== Step2: redact + 再描画 ===")
    ok = step2_redact_and_rewrite()
    if not ok:
        return 1

    print("\n=== Step3: 検証 ===")
    ok = step3_verify()
    return 0 if ok else 1


if __name__ == "__main__":
    # Windows(PowerShell)のコンソールはcp932であり、一部のCJK互換漢字コードポイント
    # (U+F900台)を出力できずUnicodeEncodeErrorになることを確認したため、
    # 標準出力を横取りしてUTF-8のログファイルにも必ず書き出す。
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
