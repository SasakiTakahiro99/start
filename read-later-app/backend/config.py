# -*- coding: utf-8 -*-
"""アプリ全体の設定値。パス・LLMモデル・要約プロンプトなど。"""

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BASE_DIR)

STORAGE_DIR = os.path.join(PROJECT_DIR, "storage")
DB_PATH = os.path.join(STORAGE_DIR, "read_later.db")

FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")

# 本文抽出のうちLLMに渡す最大文字数(コスト・トークン制限対策)
MAX_CONTENT_CHARS_FOR_LLM = 12000

# 保存する本文の最大文字数(あまりに長い記事はDB肥大化を避けるため切り詰める)
MAX_CONTENT_CHARS_TO_STORE = 40000

# Anthropic API設定。未設定でも起動・記事登録はでき、要約なしの状態になる。
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("READ_LATER_MODEL", "claude-opus-4-8")

PRIORITY_LEVELS = ["high", "medium", "low"]


def ensure_dirs() -> None:
    os.makedirs(STORAGE_DIR, exist_ok=True)
