# -*- coding: utf-8 -*-
"""履歴書PDFの部分編集用APIサーバー(FastAPI)。

pdf_editor.py のコアロジックをHTTP経由で使えるようにするだけの薄いラッパー。

起動方法:
  uvicorn api_server:app --host 127.0.0.1 --port 8000
"""

import os
import tempfile
from json import loads as json_loads

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

import pdf_editor

# TODO: 認証(APIキー等)を追加する。現状は誰でも呼び出せる。
app = FastAPI(title="Resume PDF Editor API")


@app.post("/extract")
def extract(file: UploadFile = File(...)):
    """アップロードされたPDFからテキストブロック一覧(座標込み)を返す。"""
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        # TODO: content_typeが未設定のクライアントもあるため、拡張子でも緩く判定している。
        if not file.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="PDFファイルをアップロードしてください。")

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(file.file.read())
        tmp_path = tmp.name

    try:
        blocks = pdf_editor.extract_text_blocks(tmp_path)
    finally:
        os.remove(tmp_path)

    return {"blocks": blocks}


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
