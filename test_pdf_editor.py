# -*- coding: utf-8 -*-
"""pdf_editor.py の動作確認スクリプト。

1. extract_text_blocks("sample_resume.pdf") を実行し、「山田太郎」を含むブロックを確認
2. そのブロックのbbox/font_sizeを使い replace_text_block() で「鈴木花子」に置換し test_output.pdf を生成
3. test_output.pdf を再度 extract_text_blocks() し、NFKC正規化した上で「鈴木花子」への置換を確認

実行方法:
  "C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\python.exe" test_pdf_editor.py
"""

import contextlib
import io
import os
import sys
import unicodedata

from pdf_editor import extract_text_blocks, replace_text_block

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SRC_PDF = os.path.join(BASE_DIR, "sample_resume.pdf")
OUTPUT_PDF = os.path.join(BASE_DIR, "test_output.pdf")
RUN_LOG = os.path.join(BASE_DIR, "test_run_log.txt")

OLD_NAME = "山田太郎"
NEW_NAME = "鈴木花子"


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
