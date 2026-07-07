# -*- coding: utf-8 -*-
"""動作確認用のサンプル写真を生成する(EXIF撮影日付き)。

本番機能ではなく、心臓部ループのE2E確認用の補助スクリプト。
  python make_samples.py <出力ディレクトリ>
"""

import os
import sys

from PIL import Image


SAMPLES = [
    # (名前, 色RGB, 日付文字列)
    ("umi_sea", (40, 110, 200), "2024:07:15 10:30:00"),
    ("umi_beach", (60, 140, 210), "2024:07:16 11:00:00"),
    ("yakei_night", (18, 18, 40), "2024:08:02 21:15:00"),
    ("yakei_city", (30, 25, 55), "2024:08:02 22:00:00"),
    ("food_ramen", (200, 90, 40), "2024:08:20 12:30:00"),
    ("food_cake", (220, 140, 90), "2024:08:21 15:00:00"),
    ("sora_sky", (120, 180, 230), "2024:09:05 09:00:00"),
    ("green_forest", (40, 140, 60), "2024:09:10 14:00:00"),
]

# EXIFタグ番号
DATETIME_ORIGINAL = 36867
DATETIME = 306


def make(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    paths = []
    for name, rgb, date in SAMPLES:
        # 単色だとブレ指標が0になるので、軽い市松模様で明暗差を作る
        img = Image.new("RGB", (640, 480), rgb)
        px = img.load()
        for y in range(480):
            for x in range(640):
                shade = (x // 24 + y // 24) % 2
                f = 0.82 if shade else 1.18
                r, g, b = rgb
                px[x, y] = (min(255, int(r * f)), min(255, int(g * f)), min(255, int(b * f)))
        exif = img.getexif()
        exif[DATETIME] = date
        exif[DATETIME_ORIGINAL] = date  # 実際はExifIFDだが簡易確認用にトップにも入れる
        path = os.path.join(out_dir, f"{name}.jpg")
        img.save(path, "JPEG", exif=exif.tobytes())
        paths.append(path)
    return paths


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "samples"
    for p in make(out):
        print(p)
