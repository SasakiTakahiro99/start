# -*- coding: utf-8 -*-
"""アルバムへの写真追加と自動ページ配置(基本設計3.3 / S5)。

選ばれた写真を「いい感じに」ページへ自動配置する。
- 1枚選択・3枚一括どちらも同じ経路: アルバム末尾のページに、上限(MAX_PER_PAGE)に
  達するまで追記し続け、達したら新規ページを作って続きを詰める。
- 追記のたびに、そのページの枚数に応じてレイアウト種別を再計算する。

レイアウト種別(layout_type)はフロントのCSSクラスと1:1で対応する:
  single / duo / grid3 / grid4 / grid6
枚数がこれらの境界に満たない場合は、直近下位のグリッドに寄せて余白なく詰める。
"""

from datetime import datetime

import db

# 1見開きページあたりの最大枚数。
MAX_PER_PAGE = 6

# 枚数 -> レイアウト種別。境界に無い枚数は _layout_for が直近下位へ丸める。
_LAYOUTS = {
    1: "single",
    2: "duo",
    3: "grid3",
    4: "grid4",
    6: "grid6",
}
_LAYOUT_STEPS = sorted(_LAYOUTS)  # [1,2,3,4,6]


def _layout_for(slot_count: int) -> str:
    """スロット数に最も合うレイアウト種別を返す(その枚数を丸ごと収める)。"""
    if slot_count <= 1:
        return "single"
    for step in _LAYOUT_STEPS:
        if slot_count <= step:
            return _LAYOUTS[step]
    return _LAYOUTS[_LAYOUT_STEPS[-1]]


def add_photos(album_id: int, photo_ids: list):
    """写真をアルバム末尾のページへ追記して追加。追加後の全ページ構成を返す。

    末尾ページが存在しない、またはMAX_PER_PAGEに達している場合は新規ページを作る。
    そうでなければ末尾ページに追記し、その都度layout_typeを枚数に応じて更新する。
    """
    now = datetime.now().isoformat()

    photos = []
    for pid in photo_ids:
        photo = db.get_photo(pid)
        if not photo:
            continue
        photos.append(photo)

    # 実在写真が0枚なら何もしない(空スロットのみのプレースホルダを作らない)。
    if not photos:
        return db.get_pages(album_id)

    last_page = db.get_last_page(album_id)
    if last_page is None or last_page["photo_count"] >= MAX_PER_PAGE:
        page_id = db.add_page(album_id, db.next_page_index(album_id), _layout_for(0))
        page_count = 0
        next_slot = 0
    else:
        page_id = last_page["id"]
        page_count = last_page["photo_count"]
        next_slot = last_page["max_slot_index"] + 1

    for photo in photos:
        if page_count >= MAX_PER_PAGE:
            page_id = db.add_page(album_id, db.next_page_index(album_id), _layout_for(0))
            page_count = 0
            next_slot = 0
        db.add_page_photo(page_id, photo["id"], next_slot)
        page_count += 1
        next_slot += 1
        db.update_page_layout(page_id, _layout_for(page_count))

    db.touch_album(album_id, now)
    return db.get_pages(album_id)
