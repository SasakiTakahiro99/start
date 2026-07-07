# -*- coding: utf-8 -*-
"""ライブラリ一覧の並べ替え補助(取り込み済み写真の一覧ビュー用)。

色順並べ替えは、既存メタの主要色 dominant_colors(基本設計4.2)を流用する。
最も占有率の高い主要色を代表色とし、HSVの色相(hue)→彩度→明度の順で並べる。
無彩色(グレー系)は彩度が低いので後方にまとまる。
"""

import colorsys
import json


def _representative_rgb(photo):
    raw = photo.get("dominant_colors")
    if not raw:
        return None
    try:
        colors = json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return None
    if not colors:
        return None
    # ratio(占有率)が最大の色を代表色にする。ratioが無ければ先頭。
    best = max(colors, key=lambda c: c.get("ratio", 0) if isinstance(c, dict) else 0)
    rgb = best.get("rgb") if isinstance(best, dict) else None
    if not rgb or len(rgb) < 3:
        return None
    return tuple(rgb[:3])


def _color_key(photo):
    rgb = _representative_rgb(photo)
    if rgb is None:
        # 色情報が無い写真は末尾へ(彩度1.0扱いだと混ざるので最大キーに寄せる)
        return (2.0, 0.0, 0.0)
    r, g, b = (max(0, min(255, int(v))) / 255.0 for v in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    # 彩度がごく低い(無彩色)ものは色相が不安定なので、色相帯の後ろへまとめる
    if s < 0.12:
        return (1.5, v, s)
    return (h, s, v)


def sorted_by_color(photos):
    """写真dictのリストを主要色(色相)順に並べて返す。元リストは破壊しない。"""
    return sorted(photos, key=_color_key)
