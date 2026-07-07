# -*- coding: utf-8 -*-
"""アルバムへの写真追加と自動ページ配置(基本設計3.3 / S5)。

選ばれた写真を「いい感じに」ページへ自動配置する。MVPでは:
- 縦長写真は1枚ページ、横長写真は2枚まで同ページにまとめる、という単純な規則。
- 既存アルバムに追記していく形(1枚選択・3枚一括どちらも同じ経路)。
"""

from datetime import datetime

import db


def _layout_for(slot_count: int) -> str:
    return {1: "single", 2: "duo"}.get(slot_count, "grid")


def add_photos(album_id: int, photo_ids: list):
    """写真をアルバム末尾に自動配置して追加。追加後の全ページ構成を返す。"""
    now = datetime.now().isoformat()
    page_index = db.next_page_index(album_id)

    # 縦横比で並べ方を決める: 横長(>=1.2)は2枚まとめ、それ以外は1枚。
    queue = []
    for pid in photo_ids:
        photo = db.get_photo(pid)
        if not photo:
            continue
        queue.append(photo)

    i = 0
    while i < len(queue):
        photo = queue[i]
        landscape = (photo.get("aspect_ratio") or 1.0) >= 1.2
        nxt = queue[i + 1] if i + 1 < len(queue) else None
        pair = (
            landscape
            and nxt is not None
            and (nxt.get("aspect_ratio") or 1.0) >= 1.2
        )
        if pair:
            page_id = db.add_page(album_id, page_index, _layout_for(2))
            db.add_page_photo(page_id, photo["id"], 0)
            db.add_page_photo(page_id, nxt["id"], 1)
            i += 2
        else:
            page_id = db.add_page(album_id, page_index, _layout_for(1))
            db.add_page_photo(page_id, photo["id"], 0)
            i += 1
        page_index += 1

    db.touch_album(album_id, now)
    return db.get_pages(album_id)
