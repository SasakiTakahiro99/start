# -*- coding: utf-8 -*-
"""api_server.pyの動作確認スクリプト。

requestsを使い、Windows(Git Bash)のcurl経由だとマルチバイト文字が
シェルのコードページを経由して文字化けする問題を避ける。

実行方法:
  "C:\\Users\\me\\AppData\\Local\\Programs\\Python\\Python312\\python.exe" verify_api.py
"""
import io
import json
import os
import sys

import requests

import pdf_editor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BASE_URL = "http://127.0.0.1:8000"
SRC_PDF = os.path.join(BASE_DIR, "sample_resume.pdf")
EDITED_PDF = os.path.join(BASE_DIR, "sample_resume_api_final.pdf")


def main():
    log = []

    # 1. /extract
    with open(SRC_PDF, "rb") as f:
        resp = requests.post(
            f"{BASE_URL}/extract",
            files={"file": ("sample_resume.pdf", f, "application/pdf")},
        )
    resp.raise_for_status()
    blocks = resp.json()["blocks"]
    log.append(f"[/extract] status={resp.status_code} block_count={len(blocks)}")
    for b in blocks:
        log.append(f"  {b}")

    # 2. 氏名欄のspanを特定し、値部分(山田太郎)のbboxを計算する
    name_span = None
    for b in blocks:
        if b["text"].startswith("氏名"):
            name_span = b
            break
    if name_span is None:
        log.append("[NG] 氏名欄のspanが見つかりませんでした。")
        _write_log(log)
        return 1

    font = pdf_editor.fitz.Font(fontfile=pdf_editor.FONT_PATH)
    label = "氏名: "
    fontsize = name_span["font_size"]
    label_width = font.text_length(label, fontsize=fontsize)
    bbox = name_span["bbox"]
    value_bbox = [bbox[0] + label_width, bbox[1], bbox[2], bbox[3]]
    log.append(f"[OK] 氏名欄span: {name_span}")
    log.append(f"[OK] 値部分(山田太郎)のbbox: {value_bbox}")

    edits = [
        {
            "page": name_span["page"],
            "bbox": value_bbox,
            "new_text": "鈴木花子",
            "font_size": fontsize,
        }
    ]

    # 3. /edit
    with open(SRC_PDF, "rb") as f:
        resp = requests.post(
            f"{BASE_URL}/edit",
            files={"file": ("sample_resume.pdf", f, "application/pdf")},
            data={"edits": json.dumps(edits, ensure_ascii=False)},
        )
    resp.raise_for_status()
    with open(EDITED_PDF, "wb") as f:
        f.write(resp.content)
    log.append(f"[/edit] status={resp.status_code} saved={EDITED_PDF}")

    # 4. 検証: 置換結果とファイルサイズ
    edited_blocks = pdf_editor.extract_text_blocks(EDITED_PDF)
    full_text = "".join(b["text"] for b in edited_blocks if b["page"] == 0)
    normalized = pdf_editor.normalize_text(full_text)
    has_new = "鈴木花子" in normalized
    has_old = "山田太郎" in normalized
    log.append(f"編集後の全文(NFKC正規化): {normalized!r}")
    log.append(f"「鈴木花子」が含まれる: {has_new}")
    log.append(f"「山田太郎」が残っていない: {not has_old}")
    log.append("[PASS] 置換に成功しています。" if (has_new and not has_old) else "[FAIL] 置換に問題があります。")

    size_src = os.path.getsize(SRC_PDF)
    size_poc_edited = os.path.getsize(os.path.join(BASE_DIR, "sample_resume_edited.pdf"))
    size_api_edited = os.path.getsize(EDITED_PDF)
    log.append(f"サイズ: 元PDF(フルフォント埋込)={size_src} bytes")
    log.append(f"サイズ: PoC編集後(フルフォント埋込)={size_poc_edited} bytes")
    log.append(f"サイズ: API編集後(サブセット化)={size_api_edited} bytes")
    log.append(f"削減率(対PoC編集後): {(1 - size_api_edited / size_poc_edited) * 100:.1f}%")

    ok = has_new and not has_old and size_api_edited < size_poc_edited
    _write_log(log)
    return 0 if ok else 1


def _write_log(log_lines):
    text = "\n".join(log_lines)
    with open(os.path.join(BASE_DIR, "verify_api_log.txt"), "w", encoding="utf-8") as f:
        f.write(text + "\n")
    try:
        print(text)
    except UnicodeEncodeError:
        safe = text.encode(sys.stdout.encoding or "cp932", errors="replace").decode(
            sys.stdout.encoding or "cp932"
        )
        print(safe)


if __name__ == "__main__":
    sys.exit(main())
