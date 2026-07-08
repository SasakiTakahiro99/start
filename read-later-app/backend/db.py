# -*- coding: utf-8 -*-
"""SQLite永続化層。

articles: URL登録された記事1件につき1レコード。
要約・優先度・タグはLLM呼び出しが成功して初めて埋まる(失敗時はNULL/pending状態のまま)。
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
        _local.conn = conn
    return conn


def init_db() -> None:
    config.ensure_dirs()
    conn = _conn()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url TEXT NOT NULL,
            title TEXT,
            content TEXT,
            summary TEXT,
            priority TEXT,
            tags TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            llm_status TEXT NOT NULL DEFAULT 'pending',
            error_message TEXT,
            created_at TEXT NOT NULL
        );
        """
    )
    conn.commit()


def insert_article(url, title, content, created_at) -> int:
    conn = _conn()
    cur = conn.execute(
        "INSERT INTO articles (url, title, content, llm_status, created_at)"
        " VALUES (?, ?, ?, 'pending', ?)",
        (url, title, content, created_at),
    )
    conn.commit()
    return cur.lastrowid


def update_llm_result(article_id, summary, priority, tags) -> None:
    conn = _conn()
    conn.execute(
        "UPDATE articles SET summary=?, priority=?, tags=?, llm_status='done', error_message=NULL"
        " WHERE id=?",
        (summary, priority, json.dumps(tags, ensure_ascii=False), article_id),
    )
    conn.commit()


def set_llm_failed(article_id, error_message) -> None:
    conn = _conn()
    conn.execute(
        "UPDATE articles SET llm_status='failed', error_message=? WHERE id=?",
        (error_message, article_id),
    )
    conn.commit()


def set_llm_pending(article_id) -> None:
    conn = _conn()
    conn.execute(
        "UPDATE articles SET llm_status='pending', error_message=NULL WHERE id=?",
        (article_id,),
    )
    conn.commit()


def set_read(article_id, is_read: bool) -> bool:
    conn = _conn()
    cur = conn.execute(
        "UPDATE articles SET is_read=? WHERE id=?", (1 if is_read else 0, article_id)
    )
    conn.commit()
    return cur.rowcount > 0


def get_article(article_id):
    row = _conn().execute("SELECT * FROM articles WHERE id=?", (article_id,)).fetchone()
    return _row_to_dict(row) if row else None


def delete_article(article_id) -> bool:
    conn = _conn()
    cur = conn.execute("DELETE FROM articles WHERE id=?", (article_id,))
    conn.commit()
    return cur.rowcount > 0


def all_articles():
    rows = _conn().execute("SELECT * FROM articles ORDER BY created_at DESC").fetchall()
    return [_row_to_dict(r) for r in rows]


def _row_to_dict(row):
    d = dict(row)
    d["is_read"] = bool(d["is_read"])
    if d.get("tags"):
        try:
            d["tags"] = json.loads(d["tags"])
        except (TypeError, ValueError):
            d["tags"] = []
    else:
        d["tags"] = []
    return d
