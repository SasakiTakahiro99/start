# -*- coding: utf-8 -*-
"""アルバムへの写真追加と自動ページ配置(基本設計3.3 / S5)。

選ばれた写真を「いい感じに」ページへ自動配置する。
- 撮影日(taken_at の日付部分)ごとにまとめ、1見開きページに最大 MAX_PER_PAGE 枚を配置。
- 枚数と写真の向き(縦/横)からレイアウト種別を決め、フロント/CSSが破綻しないグリッドで描く。
- 既存アルバムに追記していく形(1枚選択・3枚一括どちらも同じ経路)。

レイアウト種別(layout_type)はフロントのCSSクラスと1:1で対応する:
  single / duo / grid3 / grid4 / grid6 / grid8 / grid10 / grid12
枚数がこれらの境界に満たない場合は、直近下位のグリッドに寄せて余白なく詰める。
"""

from datetime import datetime

import db

# 1見開きページあたりの最大枚数(要件③: 最大10〜12枚程度)。
MAX_PER_PAGE = 12

# 枚数 -> レイアウト種別。境界に無い枚数は _layout_for が直近下位へ丸める。
_LAYOUTS = {
    1: "single",
    2: "duo",
    3: "grid3",
    4: "grid4",
    6: "grid6",
    8: "grid8",
    10: "grid10",
    12: "grid12",
}
_LAYOUT_STEPS = sorted(_LAYOUTS)  # [1,2,3,4,6,8,10,12]


def _layout_for(slot_count: int) -> str:
    """スロット数に最も合うレイアウト種別を返す(その枚数を丸ごと収める)。"""
    if slot_count <= 1:
        return "single"
    for step in _LAYOUT_STEPS:
        if slot_count <= step:
            return _LAYOUTS[step]
    return _LAYOUTS[_LAYOUT_STEPS[-1]]


def _date_key(photo) -> str:
    """撮影日(無ければ取り込み日)の日付部分。ページ分割のグルーピングキー。"""
    val = photo.get("taken_at") or photo.get("imported_at") or ""
    return str(val)[:10]


def _chunk_photos(photos: list):
    """写真リストを撮影日ごと・最大MAX_PER_PAGE枚ごとのページ単位に分割する。

    同じ日の写真はまとめ、多すぎる場合はMAX_PER_PAGE単位で複数ページに割る。
    端数ページが極端に小さく(1枚)ならないよう、直前ページと均す。
    """
    # 撮影日でグループ化(元の並び順は維持)。
    groups = []
    current_key = None
    for p in photos:
        key = _date_key(p)
        if key != current_key:
            groups.append([])
            current_key = key
        groups[-1].append(p)

    pages = []
    for group in groups:
        n = len(group)
        if n <= MAX_PER_PAGE:
            pages.append(group)
            continue
        # MAX_PER_PAGE ごとに割るが、端数が1枚だけにならないよう枚数を均す。
        import math
        page_count = math.ceil(n / MAX_PER_PAGE)
        base = n // page_count
        rem = n % page_count
        idx = 0
        for i in range(page_count):
            size = base + (1 if i < rem else 0)
            pages.append(group[idx:idx + size])
            idx += size
    return pages


def add_photos(album_id: int, photo_ids: list):
    """写真をアルバム末尾に自動配置して追加。追加後の全ページ構成を返す。"""
    now = datetime.now().isoformat()
    page_index = db.next_page_index(album_id)

    photos = []
    for pid in photo_ids:
        photo = db.get_photo(pid)
        if not photo:
            continue
        photos.append(photo)

    for page_photos in _chunk_photos(photos):
        # 実在写真が0枚のページ(空スロットのみのプレースホルダ)は作らない。
        # 端数ページも必ず実在写真だけで構成し、broken imageの元を残さない。
        if not page_photos:
            continue
        page_id = db.add_page(album_id, page_index, _layout_for(len(page_photos)))
        for slot, photo in enumerate(page_photos):
            db.add_page_photo(page_id, photo["id"], slot)
        page_index += 1

    db.touch_album(album_id, now)
    return db.get_pages(album_id)
