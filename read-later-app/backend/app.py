# -*- coding: utf-8 -*-
"""積読・あとで読む記事整理アプリ バックエンド(FastAPI)。

流れ: URL登録 → 本文抽出(extractor) → LLM要約/優先度/タグ付け(llm、失敗しても登録は成立) →
一覧表示(絞り込み・並び替え) → 既読/未読切り替え → 要約の再試行。

起動:
  cd backend
  uvicorn app:app --host 127.0.0.1 --port 8000

ローカル利用前提で認証なし。
"""

from datetime import datetime

from fastapi import FastAPI, Form, HTTPException
from fastapi.staticfiles import StaticFiles

import config
import db
import extractor
import llm

config.ensure_dirs()
db.init_db()

app = FastAPI(title="Read Later App")


def _article_dto(a: dict) -> dict:
    return {
        "id": a["id"],
        "url": a["url"],
        "title": a["title"],
        "summary": a["summary"],
        "priority": a["priority"],
        "tags": a["tags"],
        "is_read": a["is_read"],
        "llm_status": a["llm_status"],
        "error_message": a["error_message"],
        "created_at": a["created_at"],
    }


def _run_llm(article_id: int, title: str, content: str) -> None:
    """LLM呼び出しを実行しDBに反映する。失敗してもここで完結させ、例外を外に漏らさない。"""
    result, error = llm.summarize_and_classify(title, content)
    if result:
        db.update_llm_result(article_id, result["summary"], result["priority"], result["tags"])
    else:
        db.set_llm_failed(article_id, error)


@app.get("/api/status")
def api_status():
    return {"llm_configured": llm.is_configured()}


@app.post("/api/articles")
def create_article(url: str = Form(...)):
    url = url.strip()
    if not url:
        raise HTTPException(400, "URLを入力してください")
    if not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(400, "http(s)から始まるURLを入力してください")

    try:
        extracted = extractor.fetch_and_extract(url)
    except extractor.ExtractionError as exc:
        raise HTTPException(422, str(exc))
    except Exception as exc:
        raise HTTPException(500, f"予期しないエラーが発生しました: {exc}")

    stored_content = extracted["content"][: config.MAX_CONTENT_CHARS_TO_STORE]
    now = datetime.now().isoformat()
    article_id = db.insert_article(url, extracted["title"], stored_content, now)

    # 要約生成はここで同期実行(MVPのため)。失敗してもDB上はpending/failedで登録自体は成功させる。
    _run_llm(article_id, extracted["title"], stored_content)

    return _article_dto(db.get_article(article_id))


@app.get("/api/articles")
def list_articles():
    return {"articles": [_article_dto(a) for a in db.all_articles()]}


@app.get("/api/articles/{article_id}")
def get_article(article_id: int):
    a = db.get_article(article_id)
    if not a:
        raise HTTPException(404, "記事が見つかりません")
    return _article_dto(a)


@app.post("/api/articles/{article_id}/retry-summary")
def retry_summary(article_id: int):
    a = db.get_article(article_id)
    if not a:
        raise HTTPException(404, "記事が見つかりません")
    if not a["content"]:
        raise HTTPException(400, "本文が保存されていないため要約できません")

    db.set_llm_pending(article_id)
    _run_llm(article_id, a["title"], a["content"])
    return _article_dto(db.get_article(article_id))


@app.post("/api/articles/{article_id}/read")
def set_read(article_id: int, is_read: bool = Form(...)):
    if not db.set_read(article_id, is_read):
        raise HTTPException(404, "記事が見つかりません")
    return _article_dto(db.get_article(article_id))


@app.delete("/api/articles/{article_id}")
def delete_article(article_id: int):
    if not db.delete_article(article_id):
        raise HTTPException(404, "記事が見つかりません")
    return {"deleted": True}


# APIルート定義の後にマウントし、ルート("/")でindex.htmlを返す。
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
