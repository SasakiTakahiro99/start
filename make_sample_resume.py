# -*- coding: utf-8 -*-
"""サンプル履歴書PDFを生成する。PoC用の書き換え対象データを作るだけのスクリプト。

poc_pdf_edit.py の step1_create_sample_pdf() と同一内容(フォント・レイアウト)。
poc_pdf_edit.py は sample_resume.pdf が無ければ自前で生成するため、
このスクリプトは単体でサンプルPDFだけを再生成したい場合に使う。
"""
import fitz  # PyMuPDF

FONT_PATH = "C:/Users/me/Desktop/claude start/NotoSansJP-Regular.otf"
OUT_PATH = "C:/Users/me/Desktop/claude start/sample_resume.pdf"

doc = fitz.open()
page = doc.new_page(width=595, height=842)  # A4

fontname = "notojp"
page.insert_font(fontname=fontname, fontfile=FONT_PATH)

lines = [
    ("履歴書", 60, 18),
    ("氏名: 山田太郎", 120, 12),
    ("生年月日: 1999年8月1日", 150, 12),
    ("住所: 東京都千代田区一丁目1番1号", 180, 12),
    ("学歴: 明治大学法学部 卒業", 210, 12),
    ("職歴: 株式会社サンプル 勤務", 240, 12),
]
for text, y, fontsize in lines:
    page.insert_text((50, y), text, fontname=fontname, fontsize=fontsize)

doc.save(OUT_PATH)
doc.close()
print(f"saved: {OUT_PATH}")
