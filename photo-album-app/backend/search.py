# -*- coding: utf-8 -*-
"""検索・オススメ順スコアリング(基本設計8章、要件3.1/3.2/4.2)。

- キーワード検索: CLIPが使えれば意味的類似(コサイン)、使えなければメタ照合フォールバック。
- 期間検索: 期間で母集団を絞り、品質中心で並べる。
- どちらも total = w1*match + w2*quality で上位N枚を返し、オススメ順位を付ける。
"""

import json
import math
from datetime import datetime

import clip_engine
import config
import db


def _cosine(a, b) -> float:
    if not a or not b:
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def _fallback_match(keyword: str, photo: dict) -> float:
    """CLIP未取得時のキーワード一致度(0-1)。被写体タグ・色・簡易タグとの語一致。"""
    kw = keyword.strip()
    terms = set(config.FALLBACK_KEYWORD_SYNONYMS.get(kw, [kw]))
    terms.add(kw)

    haystack = set()
    for t in db.get_tags(photo["id"]):
        haystack.add(t["label"])
    try:
        for name in json.loads(photo.get("color_names") or "[]"):
            haystack.add(name)
    except Exception:
        pass
    if photo.get("filename"):
        haystack.add(photo["filename"])

    if not terms:
        return 0.0
    hits = 0
    for term in terms:
        for h in haystack:
            if term and (term in h or h in term):
                hits += 1
                break
    return min(1.0, hits / max(1, len(terms)))


def _rank(scored, count):
    """(photo, match, quality)のリストをtotalで並べ上位count件に順位を付す。"""
    count = max(1, count)
    for item in scored:
        item["total"] = round(
            config.SCORE_WEIGHT_MATCH * item["match"]
            + config.SCORE_WEIGHT_QUALITY * item["quality"],
            4,
        )
    scored.sort(key=lambda x: x["total"], reverse=True)
    top = scored[:count]
    for i, item in enumerate(top, start=1):
        item["rank"] = i
    return top


def keyword_search(keyword: str, count: int = None):
    count = count or config.DEFAULT_CANDIDATE_COUNT
    photos = db.all_photos_done()
    if not photos:
        return {"mode": "keyword", "clip_used": clip_engine.is_available(), "candidates": []}

    clip_used = clip_engine.is_available()
    text_vec = clip_engine.embed_text(keyword) if clip_used else None
    if text_vec is None:
        clip_used = False

    scored = []
    for p in photos:
        if clip_used:
            vec = db.get_embedding(p["id"])
            match = max(0.0, _cosine(text_vec, vec)) if vec else 0.0
        else:
            match = _fallback_match(keyword, p)
        scored.append(
            {"photo": p, "match": round(match, 4), "quality": p.get("quality_score") or 0.0}
        )
    top = _rank(scored, count)
    return {"mode": "keyword", "clip_used": clip_used, "candidates": top}


def _in_period(photo, granularity, year, month, day):
    taken = photo.get("taken_at")
    if not taken:
        return False
    try:
        dt = datetime.fromisoformat(taken)
    except Exception:
        return False
    if year and dt.year != year:
        return False
    if granularity in ("month", "day") and month and dt.month != month:
        return False
    if granularity == "day" and day and dt.day != day:
        return False
    return True


def period_search(granularity="month", year=None, month=None, day=None, count=None):
    count = count or config.DEFAULT_CANDIDATE_COUNT
    photos = db.all_photos_done()
    if year or month or day:
        photos = [p for p in photos if _in_period(p, granularity, year, month, day)]
    # 期間はキーワードが無いため品質中心(match=品質と同値扱い)
    scored = [
        {"photo": p, "match": p.get("quality_score") or 0.0, "quality": p.get("quality_score") or 0.0}
        for p in photos
    ]
    top = _rank(scored, count)
    return {"mode": "period", "clip_used": False, "candidates": top}


def period_suggest():
    """空欄時の「この月はどう?」提案。写真が最も多い月を返す(要件3.1-2)。"""
    photos = db.all_photos_done()
    buckets = {}
    for p in photos:
        taken = p.get("taken_at")
        if not taken:
            continue
        try:
            dt = datetime.fromisoformat(taken)
        except Exception:
            continue
        key = (dt.year, dt.month)
        buckets.setdefault(key, []).append(p)
    if not buckets:
        return {"suggested": None, "candidates": []}
    (year, month), _ = max(buckets.items(), key=lambda kv: len(kv[1]))
    result = period_search("month", year=year, month=month)
    result["suggested"] = {"year": year, "month": month, "granularity": "month"}
    return result
