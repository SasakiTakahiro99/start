# -*- coding: utf-8 -*-
"""アプリ全体の設定値。パス・スコアリング重み・被写体タグ候補ラベルなど。"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

STORAGE_DIR = os.path.join(PROJECT_DIR, "storage")
ORIGINALS_DIR = os.path.join(STORAGE_DIR, "originals")
THUMBNAILS_DIR = os.path.join(STORAGE_DIR, "thumbnails")
DB_PATH = os.path.join(STORAGE_DIR, "photo_album.db")

FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")

THUMBNAIL_MAX_SIZE = 1024  # 表示用リサイズ画像の最大辺(px)

# 候補件数の既定(要件3.1「オススメ順で3枚程度」)
DEFAULT_CANDIDATE_COUNT = 3

# オススメ順スコアの重み(基本設計8章 total = w1*match + w2*quality)
SCORE_WEIGHT_MATCH = 0.7
SCORE_WEIGHT_QUALITY = 0.3

# ゼロショット被写体タグの候補ラベル群(基本設計7章、要件4.1「被写体タグ中心から」)。
# CLIPが使えない場合でもキーワード検索のフォールバック照合語として利用する。
SUBJECT_LABELS = [
    "海", "山", "空", "夜景", "花", "食べ物", "人物", "動物",
    "建物", "街", "自然", "夕焼け", "雪", "川", "森", "乗り物",
    "室内", "スポーツ", "植物", "子供",
]

# フォールバック検索用: 日本語キーワード -> 照合に使う語群(簡易同義語)。
# CLIP未取得時、被写体タグ・色・簡易タグとの一致でオススメ順を代替する。
FALLBACK_KEYWORD_SYNONYMS = {
    "海": ["海", "青", "寒色", "水"],
    "空": ["空", "青", "寒色"],
    "夜": ["夜景", "暗い", "夜"],
    "夜景": ["夜景", "暗い"],
    "食べ物": ["食べ物", "暖色"],
    "ごはん": ["食べ物", "暖色"],
    "料理": ["食べ物", "暖色"],
    "夕焼け": ["夕焼け", "暖色", "赤", "オレンジ"],
    "花": ["花", "植物", "暖色"],
    "緑": ["緑", "自然", "森", "植物"],
    "自然": ["自然", "緑", "森", "山"],
    "明るい": ["明るい"],
    "暗い": ["暗い", "夜景"],
}

# CLIPモデル設定(open_clipが利用可能な場合のみ使用)。
CLIP_MODEL_NAME = os.environ.get("PHOTO_ALBUM_CLIP_MODEL", "ViT-B-32")
CLIP_PRETRAINED = os.environ.get("PHOTO_ALBUM_CLIP_PRETRAINED", "laion2b_s34b_b79k")

# 環境変数でCLIPを明示的に無効化(フォールバック動作の確認用)。
DISABLE_CLIP = os.environ.get("PHOTO_ALBUM_DISABLE_CLIP", "").lower() in ("1", "true", "yes")


def ensure_dirs() -> None:
    for path in (STORAGE_DIR, ORIGINALS_DIR, THUMBNAILS_DIR):
        os.makedirs(path, exist_ok=True)
