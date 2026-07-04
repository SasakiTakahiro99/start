# -*- coding: utf-8 -*-
"""複数ページ(3ページ)の日本語サンプル履歴書PDFを生成する。

/extract のページ画像・bboxが複数ページで正しく取得できるか、
index.html側で各ページのオーバーレイ位置がズレていないかを検証するためのデータ。
make_sample_resume.py(1ページ版)と同じフォント・レイアウト方針を踏襲し、
3ページ分の異なるy座標にテキストを配置する。
"""
import fitz  # PyMuPDF

FONT_PATH = "C:/Users/me/Desktop/claude start/NotoSansJP-Regular.otf"
OUT_PATH = "C:/Users/me/Desktop/claude start/sample_resume_multipage.pdf"

fontname = "notojp"

pages_lines = [
    [
        ("履歴書 (1/3ページ)", 60, 18),
        ("氏名: 山田太郎", 120, 12),
        ("生年月日: 1999年8月1日", 150, 12),
        ("住所: 東京都千代田区一丁目1番1号", 180, 12),
        ("学歴: 明治大学法学部 卒業", 210, 12),
        ("職歴: 株式会社サンプル 勤務", 240, 12),
    ],
    [
        ("職務経歴書 (2/3ページ)", 60, 18),
        ("会社名: 株式会社サンプル", 120, 12),
        ("在籍期間: 2022年4月 - 2024年7月", 150, 12),
        ("担当業務: Webアプリケーション開発", 180, 12),
        ("使用技術: Python, JavaScript, SQL", 210, 12),
        ("実績: 社内基幹システムの刷新プロジェクトに従事", 240, 12),
    ],
    [
        ("自己PR (3/3ページ)", 60, 18),
        ("強み: 課題発見から実装までの一貫対応", 120, 12),
        ("志望動機: 技術力を活かし新しい価値を提供したい", 150, 12),
        ("資格: 基本情報技術者試験 合格", 180, 12),
        ("備考: 面接可能日は随時応相談", 210, 12),
    ],
]

doc = fitz.open()
for lines in pages_lines:
    page = doc.new_page(width=595, height=842)  # A4
    page.insert_font(fontname=fontname, fontfile=FONT_PATH)
    for text, y, fontsize in lines:
        page.insert_text((50, y), text, fontname=fontname, fontsize=fontsize)

doc.save(OUT_PATH)
doc.close()
print(f"saved: {OUT_PATH} ({len(pages_lines)} pages)")
