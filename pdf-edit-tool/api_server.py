# -*- coding: utf-8 -*-
"""履歴書PDFの部分編集用APIサーバー(FastAPI)。

pdf_editor.py のコアロジックをHTTP経由で使えるようにするだけの薄いラッパー。

起動方法:
  uvicorn api_server:app --host 127.0.0.1 --port 8000
"""

import base64
import os
import tempfile
from json import loads as json_loads

import fitz  # PyMuPDF
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

import pdf_editor

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ページ画像化の解像度倍率(1.0 = 72dpi相当)。フロントでのオーバーレイ表示用。
PREVIEW_ZOOM = 2.0

# TODO: 認証(APIキー等)を追加する。現状は誰でも呼び出せる。
app = FastAPI(title="Resume PDF Editor API")


def _render_page_images(pdf_path: str) -> list[dict]:
    """各ページをPNG画像化し、base64文字列とページサイズ(pt単位)を返す。"""
    pages: list[dict] = []
    doc = fitz.open(pdf_path)
    try:
        matrix = fitz.Matrix(PREVIEW_ZOOM, PREVIEW_ZOOM)
        for page in doc:
            pixmap = page.get_pixmap(matrix=matrix)
            png_bytes = pixmap.tobytes("png")
            pages.append(
                {
                    "width": page.rect.width,
                    "height": page.rect.height,
                    "image_base64": base64.b64encode(png_bytes).decode("ascii"),
                }
            )
    finally:
        doc.close()
    return pages


@app.post("/extract")
def extract(file: UploadFile = File(...)):
    """アップロードされたPDFからテキストブロック一覧(座標込み)とページ画像を返す。"""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        # TODO: content_typeが未設定のクライアントもあるため、拡張子でも緩く判定している。
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="PDFファイルをアップロードしてください。")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    try:
        blocks = pdf_editor.extract_text_blocks(tmp_path)
        pages = _render_page_images(tmp_path)
    finally:
        os.remove(tmp_path)

    return {"blocks": blocks, "pages": pages}


@app.post("/edit")
def edit(background_tasks: BackgroundTasks, file: UploadFile = File(...), edits: str = Form(...)):
    """アップロードされたPDFに対して複数の編集を適用し、編集後PDFを返す。

    Args:
        file: 元PDF(multipart)。
        edits: JSON文字列。例:
            '[{"page": 0, "bbox": [x0,y0,x1,y1], "new_text": "鈴木花子", "font_size": 12}]'
            "label"を指定すると、bbox全体ではなくラベル部分を除いた値部分だけを
            書き換える(その場合"text"にbbox元のフルテキストも必須)。例:
            '[{"page": 0, "bbox": [...], "text": "氏名: 山田太郎",
               "label": "氏名: ", "new_text": "鈴木花子"}]'
    """
    try:
        edit_list = json_loads(edits)
    except ValueError:
        raise HTTPException(status_code=400, detail="editsは有効なJSON文字列である必要があります。")

    if not isinstance(edit_list, list) or not edit_list:
        raise HTTPException(status_code=400, detail="editsは空でないリストである必要があります。")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp_in:
        tmp_in.write(file.file.read())
        input_path = tmp_in.name

    output_path = input_path.replace(".pdf", "_edited.pdf")

    try:
        pdf_editor.edit_pdf(input_path, edit_list, output_path)
    except Exception as exc:
        os.remove(input_path)
        # TODO: エラー種別ごとに詳細なステータスコード/メッセージを設計する。
        raise HTTPException(status_code=500, detail=f"編集処理に失敗しました: {exc}")

    os.remove(input_path)

    background_tasks.add_task(os.remove, output_path)

    return FileResponse(
        output_path,
        media_type="application/pdf",
        filename="edited.pdf",
        background=background_tasks,
    )


@app.get("/")
def index():
    """簡易フロントエンド(index.html)を配信する。"""
    return FileResponse(os.path.join(BASE_DIR, "index.html"))
