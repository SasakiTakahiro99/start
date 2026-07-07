# -*- coding: utf-8 -*-
"""SQLite永続化層(基本設計4章)。

Photo / PhotoEmbedding / PhotoTag / Album / AlbumPage / AlbumPagePhoto / ShareLink。
埋め込みベクトル・主要色などはJSON文字列で保持(件数規模的に全件計算で十分)。
"""

import json
import sqlite3
import threading

import config

_local = threading.local()


def _conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = sqlite3.connect(config.DB_PATH, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        _local.conn = conn
    return conn


def init_db() -> None:
    config.ensure_dirs()
    conn = _conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            original_path TEXT NOT NULL,
            thumbnail_path TEXT NOT NULL,
            filename TEXT,
            taken_at TEXT,
            gps_lat REAL,
            gps_lng REAL,
            dominant_colors TEXT,
            color_names TEXT,
            width INTEGER,
            height INTEGER,
            aspect_ratio REAL,
            blur_score REAL,
            brightness_score REAL,
            quality_score REAL,
            imported_at TEXT,
            meta_status TEXT DEFAULT 'pending',
            fallback_used INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS photo_embeddings (
            photo_id INTEGER PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
            model_id TEXT,
            vector TEXT
        );

        CREATE TABLE IF NOT EXISTS photo_tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE,
            label TEXT,
            score REAL
        );

        CREATE TABLE IF NOT EXISTS albums (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            created_at TEXT,
            updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS album_pages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
            page_index INTEGER,
            layout_type TEXT
        );

        CREATE TABLE IF NOT EXISTS album_page_photos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            album_page_id INTEGER REFERENCES album_pages(id) ON DELETE CASCADE,
            photo_id INTEGER REFERENCES photos(id) ON DELETE CASCADE,
            slot_index INTEGER
        );

        CREATE TABLE IF NOT EXISTS share_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            album_id INTEGER REFERENCES albums(id) ON DELETE CASCADE,
            token TEXT UNIQUE,
            created_at TEXT,
            revoked INTEGER DEFAULT 0,
            expires_at TEXT
        );
        """
    )
    conn.commit()


# ---------- Photo ----------

def insert_photo(original_path, thumbnail_path, filename, imported_at) -> int:
    conn = _conn()
    cur = conn.execute(
        "INSERT INTO photos (original_path, thumbnail_path, filename, imported_at, meta_status)"
        " VALUES (?, ?, ?, ?, 'pending')",
        (original_path, thumbnail_path, filename, imported_at),
    )
    conn.commit()
    return cur.lastrowid


def update_photo_metadata(photo_id, meta, fallback_used) -> None:
    conn = _conn()
    conn.execute(
        """
        UPDATE photos SET
            taken_at=?, gps_lat=?, gps_lng=?, dominant_colors=?, color_names=?,
            width=?, height=?, aspect_ratio=?, blur_score=?, brightness_score=?,
            quality_score=?, meta_status='done', fallback_used=?
        WHERE id=?
        """,
        (
            meta["taken_at"].isoformat() if meta.get("taken_at") else None,
            meta.get("gps_lat"),
            meta.get("gps_lng"),
            json.dumps(meta.get("dominant_colors"), ensure_ascii=False),
            json.dumps(meta.get("color_names"), ensure_ascii=False),
            meta.get("width"),
            meta.get("height"),
            meta.get("aspect_ratio"),
            meta.get("blur_score"),
            meta.get("brightness_score"),
            meta.get("quality_score"),
            1 if fallback_used else 0,
            photo_id,
        ),
    )
    conn.commit()


def set_photo_failed(photo_id) -> None:
    conn = _conn()
    conn.execute("UPDATE photos SET meta_status='failed' WHERE id=?", (photo_id,))
    conn.commit()


def get_photo(photo_id):
    row = _conn().execute("SELECT * FROM photos WHERE id=?", (photo_id,)).fetchone()
    return dict(row) if row else None


def all_photos_done(order: str = "date_desc"):
    """メタ付与済みの全写真を返す。

    order:
      - "date_desc"(既定): 撮影日(無ければ取り込み日)の新しい順
      - "date_asc": 同・古い順
      - それ以外(色順など): 取得後に呼び出し側で並べ替える前提で、まず日付順で返す
    """
    if order == "date_asc":
        sql = ("SELECT * FROM photos WHERE meta_status='done' "
               "ORDER BY COALESCE(taken_at, imported_at) ASC, id ASC")
    else:
        sql = ("SELECT * FROM photos WHERE meta_status='done' "
               "ORDER BY COALESCE(taken_at, imported_at) DESC, id DESC")
    rows = _conn().execute(sql).fetchall()
    return [dict(r) for r in rows]


def photo_status(photo_id):
    row = _conn().execute(
        "SELECT meta_status, fallback_used FROM photos WHERE id=?", (photo_id,)
    ).fetchone()
    return dict(row) if row else None


# ---------- Embedding / Tags ----------

def upsert_embedding(photo_id, model_id, vector) -> None:
    conn = _conn()
    conn.execute(
        "INSERT OR REPLACE INTO photo_embeddings (photo_id, model_id, vector) VALUES (?, ?, ?)",
        (photo_id, model_id, json.dumps(vector) if vector is not None else None),
    )
    conn.commit()


def get_embedding(photo_id):
    row = _conn().execute(
        "SELECT model_id, vector FROM photo_embeddings WHERE photo_id=?", (photo_id,)
    ).fetchone()
    if not row or not row["vector"]:
        return None
    return json.loads(row["vector"])


def replace_tags(photo_id, tags) -> None:
    conn = _conn()
    conn.execute("DELETE FROM photo_tags WHERE photo_id=?", (photo_id,))
    conn.executemany(
        "INSERT INTO photo_tags (photo_id, label, score) VALUES (?, ?, ?)",
        [(photo_id, label, float(score)) for label, score in tags],
    )
    conn.commit()


def get_tags(photo_id):
    rows = _conn().execute(
        "SELECT label, score FROM photo_tags WHERE photo_id=? ORDER BY score DESC",
        (photo_id,),
    ).fetchall()
    return [dict(r) for r in rows]


# ---------- Album ----------

def create_album(title, now) -> int:
    conn = _conn()
    cur = conn.execute(
        "INSERT INTO albums (title, created_at, updated_at) VALUES (?, ?, ?)",
        (title, now, now),
    )
    conn.commit()
    return cur.lastrowid


def get_album(album_id):
    row = _conn().execute("SELECT * FROM albums WHERE id=?", (album_id,)).fetchone()
    return dict(row) if row else None


def touch_album(album_id, now) -> None:
    conn = _conn()
    conn.execute("UPDATE albums SET updated_at=? WHERE id=?", (now, album_id))
    conn.commit()


def album_photo_ids(album_id):
    """アルバムに含まれる写真idを配置順で返す。"""
    rows = _conn().execute(
        """
        SELECT app.photo_id FROM album_page_photos app
        JOIN album_pages ap ON app.album_page_id = ap.id
        WHERE ap.album_id=?
        ORDER BY ap.page_index, app.slot_index
        """,
        (album_id,),
    ).fetchall()
    return [r["photo_id"] for r in rows]


def next_page_index(album_id) -> int:
    row = _conn().execute(
        "SELECT COALESCE(MAX(page_index), -1) AS m FROM album_pages WHERE album_id=?",
        (album_id,),
    ).fetchone()
    return int(row["m"]) + 1


def add_page(album_id, page_index, layout_type) -> int:
    conn = _conn()
    cur = conn.execute(
        "INSERT INTO album_pages (album_id, page_index, layout_type) VALUES (?, ?, ?)",
        (album_id, page_index, layout_type),
    )
    conn.commit()
    return cur.lastrowid


def add_page_photo(album_page_id, photo_id, slot_index) -> None:
    conn = _conn()
    conn.execute(
        "INSERT INTO album_page_photos (album_page_id, photo_id, slot_index) VALUES (?, ?, ?)",
        (album_page_id, photo_id, slot_index),
    )
    conn.commit()


def get_pages(album_id):
    pages = _conn().execute(
        "SELECT * FROM album_pages WHERE album_id=? ORDER BY page_index",
        (album_id,),
    ).fetchall()
    result = []
    for page in pages:
        photos = _conn().execute(
            """
            SELECT app.photo_id, app.slot_index, p.aspect_ratio
            FROM album_page_photos app
            JOIN photos p ON p.id = app.photo_id
            WHERE app.album_page_id=?
            ORDER BY app.slot_index
            """,
            (page["id"],),
        ).fetchall()
        result.append(
            {
                "page_index": page["page_index"],
                "layout_type": page["layout_type"],
                "photos": [dict(p) for p in photos],
            }
        )
    return result


# ---------- ShareLink ----------

def create_share(album_id, token, now) -> None:
    conn = _conn()
    conn.execute(
        "INSERT INTO share_links (album_id, token, created_at, revoked) VALUES (?, ?, ?, 0)",
        (album_id, token, now),
    )
    conn.commit()


def get_share(token):
    row = _conn().execute(
        "SELECT * FROM share_links WHERE token=?", (token,)
    ).fetchone()
    return dict(row) if row else None


def revoke_share(album_id, token) -> int:
    conn = _conn()
    cur = conn.execute(
        "UPDATE share_links SET revoked=1 WHERE album_id=? AND token=?",
        (album_id, token),
    )
    conn.commit()
    return cur.rowcount
