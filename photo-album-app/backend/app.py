# -*- coding: utf-8 -*-
"""フォトアルバムアプリ バックエンド(FastAPI)。

心臓部ループ: 取り込み → 探す(キーワード/期間) → 提案(オススメ順3枚) →
選ぶ/全部入れる → アルバム自動配置 → 見開きプレビュー → トークンURL共有。

起動:
  cd backend
  uvicorn app:app --host 127.0.0.1 --port 8000

編集系APIはローカル利用前提で認証なし(共有ビューのみトークン検証)。
"""

import secrets
from datetime import datetime

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import album as album_mod
import clip_engine
import config
import db
import ingest
import library
import search

config.ensure_dirs()
db.init_db()

app = FastAPI(title="Photo Album App")


def _candidate_dto(item):
    p = item["photo"]
    return {
        "photo_id": p["id"],
        "rank": item.get("rank"),
        "match_score": item.get("match"),
        "quality_score": item.get("quality"),
        "total_score": item.get("total"),
        "thumbnail_url": f"/photos/{p['id']}/thumbnail",
        "taken_at": p.get("taken_at"),
    }


# ---------- システム ----------

@app.get("/api/status")
def api_status():
    return {"clip": clip_engine.status()}


# ---------- 取り込み(3.0) ----------

@app.post("/photos/import")
async def import_photos(files: list[UploadFile] = File(...)):
    results = []
    for f in files:
        data = await f.read()
        try:
            pid = ingest.import_photo(data, f.filename or "photo.jpg")
            status = db.photo_status(pid)
            results.append({
                "photo_id": pid,
                "filename": f.filename,
                "meta_status": status["meta_status"],
                "fallback_used": bool(status["fallback_used"]),
            })
        except Exception as exc:
            results.append({"filename": f.filename, "error": str(exc), "meta_status": "failed"})
    return {"imported": results, "clip_available": clip_engine.is_available()}


@app.get("/photos/{photo_id}/status")
def photo_status(photo_id: int):
    st = db.photo_status(photo_id)
    if not st:
        raise HTTPException(404, "写真が見つかりません")
    return {"meta_status": st["meta_status"], "fallback_used": bool(st["fallback_used"])}


@app.get("/photos/{photo_id}/thumbnail")
def photo_thumbnail(photo_id: int):
    photo = db.get_photo(photo_id)
    if not photo or not photo.get("thumbnail_path"):
        raise HTTPException(404, "サムネイルが見つかりません")
    return FileResponse(photo["thumbnail_path"], media_type="image/jpeg")


@app.get("/photos")
def list_photos(sort: str = "date_desc"):
    """取り込み済み写真の一覧(ライブラリ)。

    sort: date_desc(既定=新しい順) / date_asc / color(主要色順)。
    """
    if sort == "color":
        photos = library.sorted_by_color(db.all_photos_done("date_desc"))
    elif sort == "date_asc":
        photos = db.all_photos_done("date_asc")
    else:
        photos = db.all_photos_done("date_desc")
    return {
        "sort": sort,
        "count": len(photos),
        "photos": [
            {
                "photo_id": p["id"],
                "thumbnail_url": f"/photos/{p['id']}/thumbnail",
                "taken_at": p.get("taken_at"),
                "imported_at": p.get("imported_at"),
                "quality_score": p.get("quality_score"),
                "tags": [t["label"] for t in db.get_tags(p["id"])],
            }
            for p in photos
        ],
    }


# ---------- 探す(3.1 / 3.2) ----------

@app.post("/search/keyword")
def search_keyword(keyword: str = Form(...), count: int = Form(config.DEFAULT_CANDIDATE_COUNT)):
    if not keyword.strip():
        raise HTTPException(400, "キーワードを入力してください")
    res = search.keyword_search(keyword.strip(), count)
    return {
        "mode": "keyword",
        "keyword": keyword,
        "clip_used": res["clip_used"],
        "candidates": [_candidate_dto(i) for i in res["candidates"]],
    }


@app.get("/search/period")
def search_period(granularity: str = "month", year: int = None, month: int = None,
                  day: int = None, count: int = config.DEFAULT_CANDIDATE_COUNT):
    res = search.period_search(granularity, year, month, day, count)
    return {
        "mode": "period",
        "granularity": granularity,
        "candidates": [_candidate_dto(i) for i in res["candidates"]],
    }


@app.get("/search/period/suggest")
def search_period_suggest():
    res = search.period_suggest()
    return {
        "mode": "period",
        "suggested": res.get("suggested"),
        "candidates": [_candidate_dto(i) for i in res.get("candidates", [])],
    }


# ---------- アルバム(3.3) ----------

@app.post("/albums")
def create_album(title: str = Form("マイアルバム")):
    now = datetime.now().isoformat()
    album_id = db.create_album(title or "マイアルバム", now)
    return {"album_id": album_id, "title": title}


@app.get("/albums/{album_id}")
def get_album(album_id: int):
    a = db.get_album(album_id)
    if not a:
        raise HTTPException(404, "アルバムが見つかりません")
    return a


@app.post("/albums/{album_id}/photos")
def add_album_photos(album_id: int, photo_ids: str = Form(...)):
    """photo_ids はカンマ区切り(1枚 or 3枚一括の逃げ道)。"""
    if not db.get_album(album_id):
        raise HTTPException(404, "アルバムが見つかりません")
    try:
        ids = [int(x) for x in photo_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "写真IDは数値で指定してください")
    if not ids:
        raise HTTPException(400, "写真IDが指定されていません")
    pages = album_mod.add_photos(album_id, ids)
    return {"album_id": album_id, "pages": _pages_dto(pages)}


def _pages_dto(pages):
    out = []
    for pg in pages:
        photos = []
        for pp in pg["photos"]:
            photos.append({
                "photo_id": pp["photo_id"],
                "slot_index": pp["slot_index"],
                "aspect_ratio": pp.get("aspect_ratio"),
                "thumbnail_url": f"/photos/{pp['photo_id']}/thumbnail",
            })
        out.append({
            "page_index": pg["page_index"],
            "layout_type": pg["layout_type"],
            "photos": photos,
        })
    return out


@app.get("/albums/{album_id}/pages")
def album_pages(album_id: int):
    a = db.get_album(album_id)
    if not a:
        raise HTTPException(404, "アルバムが見つかりません")
    return {"album_id": album_id, "title": a["title"], "pages": _pages_dto(db.get_pages(album_id))}


# ---------- 共有(3.4) ----------

@app.post("/albums/{album_id}/share")
def create_share(album_id: int):
    if not db.get_album(album_id):
        raise HTTPException(404, "アルバムが見つかりません")
    token = secrets.token_urlsafe(24)
    db.create_share(album_id, token, datetime.now().isoformat())
    return {"token": token, "share_url": f"/share/{token}", "view_url": f"/share.html?token={token}"}


@app.delete("/albums/{album_id}/share/{token}")
def revoke_share(album_id: int, token: str):
    n = db.revoke_share(album_id, token)
    if not n:
        raise HTTPException(404, "共有リンクが見つかりません")
    return {"revoked": True}


@app.get("/share/{token}")
def share_view(token: str):
    link = db.get_share(token)
    if not link or link["revoked"]:
        raise HTTPException(404, "共有リンクが無効です")
    album = db.get_album(link["album_id"])
    if not album:
        raise HTTPException(404, "アルバムが見つかりません")
    return {
        "album_id": album["id"],
        "title": album["title"],
        "read_only": True,
        "pages": _pages_dto(db.get_pages(album["id"])),
    }


# ---------- フロント配信 ----------
# APIルート定義の後にマウントし、ルート("/")でindex.htmlを返す。
app.mount("/", StaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
