# -*- coding: utf-8 -*-
"""写真1枚のメタ情報を算出する(基本設計7章)。

- 撮影日時 / GPS: EXIF(Pillow)。無ければファイル更新日時 / null。
- 主要色: Pillow量子化(モデル非依存・常時算出)。
- ブレ / 明るさ: OpenCV(あれば)。無ければ Pillow で代替。
- 品質スコア: ブレ/明るさから合成。
- 簡易タグ: 色/明るさから機械的に付与(CLIP未取得時のフォールバック検索の足場)。

cv2 / numpy が無い環境でも動くようフォールバックを持つ。
"""

import os
from datetime import datetime

from PIL import Image, ImageStat
from PIL.ExifTags import GPSTAGS, TAGS

try:
    import numpy as np
except Exception:
    np = None

try:
    import cv2
except Exception:
    cv2 = None


# ---------- EXIF ----------

def _get_exif(pil_image):
    try:
        raw = pil_image._getexif()
    except Exception:
        raw = None
    if not raw:
        return {}
    return {TAGS.get(k, k): v for k, v in raw.items()}


def _parse_taken_at(exif: dict, fallback_path: str):
    value = exif.get("DateTimeOriginal") or exif.get("DateTime")
    if value:
        for fmt in ("%Y:%m:%d %H:%M:%S", "%Y-%m-%d %H:%M:%S"):
            try:
                return datetime.strptime(str(value), fmt)
            except ValueError:
                continue
    # フォールバック: ファイル更新日時
    try:
        return datetime.fromtimestamp(os.path.getmtime(fallback_path))
    except Exception:
        return datetime.now()


def _dms_to_deg(dms, ref):
    try:
        deg = float(dms[0]) + float(dms[1]) / 60.0 + float(dms[2]) / 3600.0
        if ref in ("S", "W"):
            deg = -deg
        return deg
    except Exception:
        return None


def _parse_gps(exif: dict):
    gps = exif.get("GPSInfo")
    if not gps:
        return (None, None)
    tagged = {GPSTAGS.get(k, k): v for k, v in gps.items()}
    lat = _dms_to_deg(tagged.get("GPSLatitude"), tagged.get("GPSLatitudeRef"))
    lng = _dms_to_deg(tagged.get("GPSLongitude"), tagged.get("GPSLongitudeRef"))
    return (lat, lng)


# ---------- 主要色 ----------

def _dominant_colors(pil_image, count: int = 4):
    """量子化して主要色を抽出。返り値: [{"rgb":[r,g,b], "ratio":0.x}, ...]"""
    small = pil_image.convert("RGB").copy()
    small.thumbnail((128, 128))
    quant = small.quantize(colors=count, method=Image.Quantize.MEDIANCUT)
    palette = quant.getpalette()
    color_counts = quant.getcolors() or []
    total = sum(c for c, _ in color_counts) or 1
    result = []
    for cnt, idx in sorted(color_counts, reverse=True):
        r, g, b = palette[idx * 3: idx * 3 + 3]
        result.append({"rgb": [r, g, b], "ratio": round(cnt / total, 3)})
    return result[:count]


def _color_names(dominant_colors):
    """主要色から簡易な色カテゴリ語を導く(フォールバック検索・色タグ用)。"""
    names = set()
    for c in dominant_colors:
        r, g, b = c["rgb"]
        mx, mn = max(r, g, b), min(r, g, b)
        if mx - mn < 30:
            if mx > 200:
                names.add("白")
            elif mx < 60:
                names.add("黒")
            continue
        if r >= g and r >= b:
            names.add("赤" if r - max(g, b) > 40 else "暖色")
            if g > 120 and b < 120:
                names.add("オレンジ")
        if g >= r and g >= b:
            names.add("緑")
        if b >= r and b >= g:
            names.add("青")
            names.add("寒色")
    # 暖色/寒色の総括
    warm = sum(c["ratio"] for c in dominant_colors if c["rgb"][0] >= c["rgb"][2])
    if warm >= 0.5:
        names.add("暖色")
    else:
        names.add("寒色")
    return list(names)


# ---------- ブレ / 明るさ ----------

def _blur_brightness(pil_image, original_path):
    """ブレ指標(ラプラシアン分散)と明るさ(輝度平均0-255)を返す。"""
    if cv2 is not None and np is not None:
        try:
            img = cv2.imread(original_path)
            if img is None:
                arr = np.array(pil_image.convert("RGB"))
                img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
            brightness = float(gray.mean())
            return blur, brightness
        except Exception:
            pass
    # フォールバック: Pillowのみ
    gray = pil_image.convert("L")
    stat = ImageStat.Stat(gray)
    brightness = float(stat.mean[0])
    # 分散をブレ指標の粗い代替に(鮮明なほどエッジで分散が大きい傾向)
    blur = float(stat.stddev[0]) ** 2
    return blur, brightness


def _quality_score(blur: float, brightness: float) -> float:
    """ブレ/明るさから0-1の総合品質を合成(基本設計8章)。"""
    # ブレ: ラプラシアン分散100以上でほぼ満点、低いほどペナルティ
    sharp = min(1.0, blur / 150.0)
    # 明るさ: 110前後を最良とし、暗すぎ/明るすぎにペナルティ
    bright = max(0.0, 1.0 - abs(brightness - 120.0) / 120.0)
    return round(0.6 * sharp + 0.4 * bright, 4)


def _simple_tags(dominant_colors, brightness):
    """CLIP未取得時のための機械的な簡易タグ(基本設計7章フォールバック)。"""
    tags = []
    if brightness < 70:
        tags.append(("暗い", 0.9))
        tags.append(("夜景", 0.4))
    elif brightness > 180:
        tags.append(("明るい", 0.9))
    for name in _color_names(dominant_colors):
        tags.append((name, 0.5))
    return tags


# ---------- 公開関数 ----------

def compute_metadata(pil_image, original_path: str) -> dict:
    """写真1枚の全メタ情報を算出して返す。"""
    exif = _get_exif(pil_image)
    taken_at = _parse_taken_at(exif, original_path)
    gps_lat, gps_lng = _parse_gps(exif)
    width, height = pil_image.size
    aspect_ratio = round(width / height, 4) if height else 1.0
    dominant = _dominant_colors(pil_image)
    blur, brightness = _blur_brightness(pil_image, original_path)
    quality = _quality_score(blur, brightness)
    simple_tags = _simple_tags(dominant, brightness)
    return {
        "taken_at": taken_at,
        "gps_lat": gps_lat,
        "gps_lng": gps_lng,
        "width": width,
        "height": height,
        "aspect_ratio": aspect_ratio,
        "dominant_colors": dominant,
        "color_names": _color_names(dominant),
        "blur_score": round(blur, 3),
        "brightness_score": round(brightness, 3),
        "quality_score": quality,
        "simple_tags": simple_tags,
    }
