# -*- coding: utf-8 -*-
"""写真取り込みパイプライン(基本設計3.0 / 7章)。

1. 原本を storage/originals へ保存
2. サムネイル(表示用リサイズ)を storage/thumbnails へ生成
3. メタ情報を算出しDBへ保存(EXIF/色/ブレ/明るさ)
4. CLIPが使えれば埋め込み・ゼロショットタグを付与、使えなければ簡易タグで代替
"""

import os
import uuid
from datetime import datetime

from PIL import Image, ImageOps

import clip_engine
import config
import db
import metadata


def _save_original(file_bytes: bytes, filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    safe = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(config.ORIGINALS_DIR, safe)
    with open(path, "wb") as f:
        f.write(file_bytes)
    return path


def _make_thumbnail(pil_image, photo_stub: str) -> str:
    thumb = ImageOps.exif_transpose(pil_image).convert("RGB")
    thumb.thumbnail((config.THUMBNAIL_MAX_SIZE, config.THUMBNAIL_MAX_SIZE))
    path = os.path.join(config.THUMBNAILS_DIR, f"{photo_stub}.jpg")
    thumb.save(path, "JPEG", quality=85)
    return path


def import_photo(file_bytes: bytes, filename: str) -> int:
    """1枚を取り込みメタ付与まで完了させ、photo_idを返す。"""
    now = datetime.now().isoformat()
    original_path = _save_original(file_bytes, filename)
    stub = os.path.splitext(os.path.basename(original_path))[0]

    photo_id = db.insert_photo(original_path, "", filename, now)

    try:
        with Image.open(original_path) as im:
            im.load()
            thumb_path = _make_thumbnail(im, stub)
            # サムネイルパスを反映
            db._conn().execute(
                "UPDATE photos SET thumbnail_path=? WHERE id=?", (thumb_path, photo_id)
            )
            db._conn().commit()

            meta = metadata.compute_metadata(im, original_path)

            clip_used = clip_engine.is_available()
            vector = clip_engine.embed_image(im) if clip_used else None
            fallback_used = vector is None

            db.update_photo_metadata(photo_id, meta, fallback_used)
            db.upsert_embedding(photo_id, clip_engine.model_id(), vector)

            # 被写体タグ: CLIPゼロショット、無ければ簡易タグ(色/明るさ由来)
            if vector is not None:
                zs = clip_engine.zero_shot_labels(im, config.SUBJECT_LABELS, top_k=5)
                tags = [(label, score) for label, score in zs if score > 0.15]
                if not tags:
                    tags = meta["simple_tags"]
            else:
                tags = meta["simple_tags"]
            db.replace_tags(photo_id, tags)
    except Exception:
        db.set_photo_failed(photo_id)
        raise

    return photo_id
