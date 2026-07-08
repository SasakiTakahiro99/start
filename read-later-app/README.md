# 積読・あとで読む記事整理アプリ(MVP)

「タブだけ残して記事を読まないことが多い」を解消するための、ローカル完結の個人用ミニアプリ。
URLを貼り付けるだけで本文を取得し、AI(Claude)が要約・優先度・ジャンルタグを自動で付けてくれます。

- バックエンド: Python 3.12 + FastAPI
- DB: SQLite(単一ファイル)
- 本文抽出: trafilatura(推奨)/ readability-lxml のフォールバック構成
- AI: Anthropic Claude API(`ANTHROPIC_API_KEY` 環境変数、未設定でも動作)
- フロント: 素のHTML/JS(ビルド不要)

---

## セットアップ・起動手順

### 1. 依存インストール

```bash
cd "C:/Users/me/Desktop/claude start/read-later-app"
python -m pip install -r requirements.txt
```

### 2. Anthropic APIキーの設定(任意だが推奨)

要約・優先度判定・タグ付けを使うには `ANTHROPIC_API_KEY` を環境変数として設定します。

```powershell
# PowerShellの場合(このセッションのみ有効)
$env:ANTHROPIC_API_KEY = "sk-ant-xxxxxxxx"
```

```bash
# bashの場合
export ANTHROPIC_API_KEY="sk-ant-xxxxxxxx"
```

**未設定でもアプリ自体は起動し、URL登録・一覧表示・既読管理は通常通り使えます。**
要約が無い記事はカードに「要約を生成」ボタンが出るので、キー設定後にいつでも後から生成できます。

任意で `READ_LATER_MODEL` 環境変数を設定するとモデルを変更できます(未設定時は `claude-opus-4-8`)。

### 3. サーバ起動

```bash
cd backend
python -m uvicorn app:app --host 127.0.0.1 --port 8020
```

### 4. アクセス

ブラウザで <http://127.0.0.1:8020/> を開きます。

- 画面右上のバッジで「AI要約: 有効/無効」が分かります。
- フォームにURLを貼り付けて「登録」→ 本文取得 → (APIキーがあれば)要約・優先度・タグを自動生成。
- 一覧はカード表示。既読/未読切り替え、タグ・既読状態での絞り込み、登録日/優先度順の並び替えが可能。
- 要約が無い/失敗した記事には「要約を生成」ボタンが出るので、いつでも再試行できます。

---

## 実装した機能

| 機能 | 実装 |
| --- | --- |
| URL登録・本文抽出 | `POST /api/articles` + `extractor.py`(trafilatura → readability-lxml+BeautifulSoup → 簡易BeautifulSoupタグ除去 → 正規表現タグ除去の4段フォールバック) |
| 要約・優先度・タグ付けを1回のLLM呼び出しで生成 | `llm.py`(Claude API、`output_config.format` によるJSON構造化出力) |
| LLM失敗時のフォールバック | 登録自体は失敗させず `llm_status='pending'/'failed'` で保存、「要約を生成」ボタンで再試行可能 |
| 既読/未読管理 | `POST /api/articles/{id}/read`。デフォルトは未読 |
| 一覧・絞り込み・並び替え | `GET /api/articles` + フロント側でタグ/既読状態フィルタ、登録日・優先度順ソート |

---

## 既知の制約(MVPスコープ外)

- ブラウザ拡張などの自動登録は未実装(手動URL貼り付けのみ)。
- 要約生成は登録時に同期実行(記事が長い/APIが遅いと登録リクエストがその分待たされる)。非同期化は将来課題。
- 認証なし(ローカル利用前提)。
- ペイウォール・JS必須サイトは本文抽出に失敗する場合がある(その場合はエラーメッセージを返し、登録自体は失敗する)。

---

## ファイル構成

```
read-later-app/
├─ README.md
├─ requirements.txt
├─ backend/
│  ├─ app.py         … FastAPIアプリ(全API + フロント配信)
│  ├─ config.py       … 設定(パス・モデル名など)
│  ├─ db.py           … SQLite永続化層
│  ├─ extractor.py    … URL取得・本文抽出(フォールバック付き)
│  └─ llm.py          … Claude APIによる要約/優先度/タグ付け
├─ frontend/
│  ├─ index.html
│  ├─ app.js
│  └─ style.css
└─ storage/           … 実行時生成(DB。.gitignore対象)
```
