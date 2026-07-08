# -*- coding: utf-8 -*-
"""URLからページを取得し、タイトル・本文を抽出する。

trafilatura(推奨)が使えればそれを使い、無ければreadability-lxml + BeautifulSoup、
それも無ければ簡易的なHTMLタグ除去にフォールバックする。
"""

import re

import requests

try:
    import trafilatura
except ImportError:
    trafilatura = None

try:
    from readability import Document
except ImportError:
    Document = None

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 ReadLaterApp/0.1"
)

REQUEST_TIMEOUT = 15


class ExtractionError(Exception):
    """本文取得・抽出に失敗した際の例外。ユーザー向けメッセージをそのまま持つ。"""


def fetch_and_extract(url: str) -> dict:
    """{'title': str, 'content': str} を返す。失敗時はExtractionErrorを投げる。"""
    try:
        resp = requests.get(
            url,
            headers={"User-Agent": USER_AGENT},
            timeout=REQUEST_TIMEOUT,
            allow_redirects=True,
        )
    except requests.exceptions.Timeout:
        raise ExtractionError("ページの取得がタイムアウトしました。サイトが重いか、アクセス不可の可能性があります。")
    except requests.exceptions.RequestException as exc:
        raise ExtractionError(f"ページの取得に失敗しました: {exc}")

    if resp.status_code >= 400:
        raise ExtractionError(
            f"ページの取得に失敗しました(HTTP {resp.status_code})。"
            "ログイン必須・削除済み・アクセス制限の可能性があります。"
        )

    html = resp.text
    if not html or not html.strip():
        raise ExtractionError("ページの内容が空でした。JavaScriptで描画されるサイトの可能性があります。")

    title, content = _extract_with_fallbacks(html, url)

    if not content or len(content.strip()) < 50:
        raise ExtractionError(
            "本文をうまく抽出できませんでした。ペイウォールやJavaScript必須のサイトの可能性があります。"
        )

    return {"title": title or url, "content": content.strip()}


def _extract_with_fallbacks(html: str, url: str):
    # 1. trafilatura(最優先: タイトル・本文抽出の精度が高い)
    if trafilatura is not None:
        try:
            extracted = trafilatura.extract(
                html, url=url, include_comments=False, include_tables=False
            )
            meta = trafilatura.extract_metadata(html, default_url=url)
            title = meta.title if meta and meta.title else None
            if extracted:
                return title, extracted
        except Exception:
            pass

    # 2. readability-lxml + BeautifulSoup
    if Document is not None and BeautifulSoup is not None:
        try:
            doc = Document(html)
            title = doc.short_title()
            summary_html = doc.summary()
            soup = BeautifulSoup(summary_html, "html.parser")
            text = soup.get_text("\n", strip=True)
            if text:
                return title, text
        except Exception:
            pass

    # 3. 簡易フォールバック: <script>/<style>除去してタグを剥がすだけ
    if BeautifulSoup is not None:
        try:
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            title_tag = soup.find("title")
            title = title_tag.get_text(strip=True) if title_tag else None
            text = soup.get_text("\n", strip=True)
            return title, text
        except Exception:
            pass

    # 4. 最終フォールバック: 正規表現でタグ除去
    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = title_match.group(1).strip() if title_match else None
    text = re.sub(r"<script.*?</script>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return title, text
