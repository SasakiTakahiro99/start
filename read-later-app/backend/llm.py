# -*- coding: utf-8 -*-
"""Anthropic Claude APIを使った要約・優先度判定・タグ付け。

失敗(APIキー未設定・ネットワークエラー・レート制限等)しても例外を外に投げず、
呼び出し側が「保留(pending)」のまま扱えるよう (result, error_message) を返す。
"""

import json

import config

try:
    import anthropic
except ImportError:
    anthropic = None

SYSTEM_PROMPT = (
    "あなたは記事整理アシスタントです。与えられた記事の本文を読み、"
    "日本語で簡潔な要約と、今読むべき度(優先度)、ジャンルタグを判定してください。"
)

OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {
            "type": "string",
            "description": "記事内容の3〜5文程度の日本語要約",
        },
        "priority": {
            "type": "string",
            "enum": config.PRIORITY_LEVELS,
            "description": "今すぐ読む価値がどれくらい高いか。high/medium/lowの3段階",
        },
        "tags": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 1,
            "maxItems": 3,
            "description": "記事のジャンルを表す1〜3個の短い日本語タグ",
        },
    },
    "required": ["summary", "priority", "tags"],
    "additionalProperties": False,
}


def is_configured() -> bool:
    return bool(config.ANTHROPIC_API_KEY) and anthropic is not None


def summarize_and_classify(title: str, content: str):
    """(result_dict, error_message) を返す。成功時は error_message は None。"""
    if anthropic is None:
        return None, "anthropicパッケージが未インストールです(pip install anthropic)。"
    if not config.ANTHROPIC_API_KEY:
        return None, "ANTHROPIC_API_KEY が設定されていません。"

    truncated = content[: config.MAX_CONTENT_CHARS_FOR_LLM]
    user_message = (
        f"タイトル: {title}\n\n本文:\n{truncated}"
    )

    try:
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=config.ANTHROPIC_MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            output_config={"format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
            messages=[{"role": "user", "content": user_message}],
        )
    except Exception as exc:  # ネットワークエラー・認証エラー・レート制限等をまとめて扱う
        return None, f"LLM呼び出しに失敗しました: {exc}"

    if response.stop_reason == "refusal":
        return None, "内容の性質上、要約生成がモデルに拒否されました。"

    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        return None, "LLMから要約結果を取得できませんでした。"

    try:
        data = json.loads(text)
    except (TypeError, ValueError) as exc:
        return None, f"LLM出力のJSON解析に失敗しました: {exc}"

    if not all(k in data for k in ("summary", "priority", "tags")):
        return None, "LLM出力の形式が想定と異なりました。"

    return data, None
