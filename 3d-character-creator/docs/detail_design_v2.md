# 3Dキャラクタークリエイター リニューアル版（AI 3Dモデル生成方式） 詳細設計書 v2

本書は `docs/basic_design_v2.md`（承認済み基本設計書v2）を受け、コーディング係がそのまま実装に
着手できるレベルまで仕様を具体化したものである。`docs/detail_design.md`（v1・MVP版詳細設計書）は
本書によって置き換えるものではなく、参考として残す。本書は新規ファイルとして作成する。

基本設計書v2の内容と矛盾・変更が必要と判断した箇所は「14. 基本設計からの変更点・開発リーダーへの
申し送り」に明記する。

---

## 0. 本書のスコープと前提

- 対象は `3d-character-creator/` 配下のみ。リポジトリ直下の既存PDF編集ツール関連ファイルには
  一切手を加えない（基本設計書v2 8章の制約を継続）。
- Meshy AIの実際のAPI仕様は本セッションでは公式ドキュメントを閲覧できないため、**本プロジェクトに
  おける想定仕様**（1章参照）として仮定し、実装・テストを進める。実装時・本番運用時に実APIの
  仕様と差異が判明した場合は、プロキシサーバーのMeshyクライアント層（`server/meshyClient.js`。
  2.3節参照）のみを調整すれば済むよう、影響範囲をこの1ファイルに閉じ込める設計とする。
- 実APIキーは未提供のため、実装・テストはモック/スタブ（APIキー未設定時のフォールバック動作。
  3章参照）を主な確認手段とする。

---

## 1. Meshy AI 想定APIの仕様確定（本プロジェクトにおける想定仕様）

**注記**: 以下は公式ドキュメント未確認のまま、一般的なText-to-3D生成APIの典型パターンから
合理的に仮定した「想定仕様」である。実装時・実際にAPIキーを取得して疎通確認する際は、
Meshy AI公式ドキュメント（https://docs.meshy.ai/ 等）と本節の内容を照合し、差異があれば
`server/meshyClient.js` のみを修正すること。差異が生じてもプロキシの外部インターフェース
（`POST /api/generate` / `GET /api/generate/:jobId/status`）自体は変更しない方針とする。

### 1.1 想定エンドポイント

| 用途 | メソッド・パス | 備考 |
|---|---|---|
| Text-to-3Dジョブ作成 | `POST https://api.meshy.ai/v2/text-to-3d` | プレビューモード（テクスチャ無し高速生成）を第一段階、`mode: "preview"` を想定。将来的にリファインモード(`refine`)を追加する余地はあるが本リニューアルでは非対応（14章に申し送り） |
| ジョブステータス・結果取得 | `GET https://api.meshy.ai/v2/text-to-3d/{task_id}` | ポーリングで進捗（`status`, `progress`）とGLB URL（`model_urls.glb`）を取得する想定 |

### 1.2 認証

- ヘッダ: `Authorization: Bearer ${MESHY_API_KEY}`
- `MESHY_API_KEY` はプロキシサーバーの環境変数からのみ読み込み、レスポンスボディ・ログに
  出力しない。

### 1.3 リクエスト/レスポンス想定スキーマ

**ジョブ作成 `POST /v2/text-to-3d`**

リクエストボディ（想定）:
```jsonc
{
  "mode": "preview",
  "prompt": "組み立てたプロンプト文字列（2章参照）",
  "art_style": "realistic",
  "negative_prompt": "low quality, blurry, deformed"
}
```

レスポンスボディ（想定・201想定）:
```jsonc
{ "result": "01890c8b-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }  // task_id
```

**ステータス取得 `GET /v2/text-to-3d/{task_id}`**

レスポンスボディ（想定）:
```jsonc
{
  "id": "01890c8b-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "status": "PENDING",     // "PENDING" | "IN_PROGRESS" | "SUCCEEDED" | "FAILED"
  "progress": 45,          // 0-100
  "task_error": null,      // 失敗時: { "message": "..." }
  "model_urls": {          // status="SUCCEEDED" 時のみ値が入る想定
    "glb": "https://assets.meshy.ai/xxxxx/model.glb"
  }
}
```

### 1.4 ポーリング方式

- プロキシサーバーはジョブ作成時にMeshy側の`task_id`を保持せず、ブラウザ側にそのまま
  `jobId`（= Meshyの`task_id`）として返す（プロキシはステートレス。3.1節参照）。
- ブラウザ（`main.js`）は`GET /api/generate/:jobId/status`を**2秒間隔**でポーリングする
  （`POLL_INTERVAL_MS = 2000`、`main.js`の定数として定義）。
- タイムアウト: ブラウザ側で**最大180秒**（`GENERATION_TIMEOUT_MS = 180000`）経過してもSUCCEEDED/
  FAILEDに至らない場合、ポーリングを打ち切り「生成がタイムアウトしました」エラーとして扱う
  （7章参照）。
- プロキシサーバー自体はジョブの状態を保持せず、ステータス取得リクエストの都度Meshy側へ
  問い合わせて結果をそのまま整形して返す（基本設計書v2 2.2節の「ステートレス」方針に準拠）。

---

## 2. プロンプト組み立てロジックの置き場所（確定）

基本設計書v2 9章で「詳細設計側で決定すること」とされていた事項。

**確定方針**: プロンプト組み立て関数 `buildPrompt(params)` は **`js/params.js` に含める**。

理由:
- プロンプト文字列は生成パラメータ（`gender`/`mood`/`bodyType`/`appearanceDescription`）のみから
  導出される純粋関数であり、外部依存（DOM操作・HTTP通信）を持たない。
- `params.js` は既にv1でもパラメータの型・デフォルト値・バリデーションを一元管理する役割を
  担っており、「パラメータから何を導出するか」という責務の置き場所として一貫性がある。
- `customization-ui.js`（UI）と `main.js`（通信）の双方から参照されるため、両者に依存しない
  `params.js` に置くことで循環参照を避けられる。

新規モジュール（例: `js/prompt.js`）を切り出す案も検討したが、本アプリの規模（単一機能ミニアプリ）
では過剰な分割と判断し採用しない。

---

## 3. Three.js バージョン・CDN・import map（確定）

v1から**変更なし**（バージョンはGLTFLoaderの動作要件を満たすため据え置きで問題ないと判断）。
GLTFLoaderの読み込み口を追加する。

### 3.1 確定バージョン・CDN

- 採用バージョン: **Three.js r160**（`0.160.0`）。v1と同一バージョンを継続する
  （GLTFLoaderはr160時点で標準的に安定動作するため、バージョン更新は不要と判断）。
- CDN: jsDelivr（v1から継続）。

### 3.2 `index.html` の `importmap`（確定）

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
```

- `three/addons/loaders/GLTFLoader.js` は `three/addons/` プレフィックス経由で
  `import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';` として`character.js`から
  読み込む（import map自体の変更は不要。既存の`three/addons/`エントリでカバーされる）。
- v1で用意されていた`OrbitControls`の読み込み口（未使用）は、本v2でも変更しないためそのまま
  importmapのプレフィックスの範囲内で利用可能（明示的なimport文は引き続き無し）。

---

## 4. ディレクトリ構成・ファイル一覧（確定）

```
3d-character-creator/
├── docs/
│   ├── basic_design.md            # v1（既存）
│   ├── basic_design_v2.md         # v2（既存・承認済み）
│   ├── detail_design.md           # v1（既存・参考。上書きしない）
│   └── detail_design_v2.md        # 本書（新規）
├── index.html                     # 改修
├── js/
│   ├── main.js                    # 改修
│   ├── character.js               # 作り直し
│   ├── field.js                   # そのまま流用（変更なし）
│   ├── controls.js                # そのまま流用＋正面補正の確認（8章）
│   ├── customization-ui.js        # 作り直し
│   ├── params.js                  # 作り直し（プロンプト組み立て関数を含む。2章）
│   └── storage.js                 # 改修
├── css/
│   └── style.css                  # 改修
└── server/                        # 新規（プロキシサーバー）
    ├── package.json                # 新規
    ├── .env.example                 # 新規（MESHY_API_KEY等のサンプル）
    ├── index.js                     # 新規。Expressアプリのエントリポイント
    ├── routes/
    │   └── generate.js              # 新規。/api/generate系のルーティング
    └── meshyClient.js                # 新規。Meshy AI想定APIとの通信を担うクライアント層（1章参照）
```

補足: プロキシサーバーは基本設計書v2 2.2節の通り「薄い中継」に限定するため、
`server/` 配下は上記5ファイルのみに収める（フレームワーク的なlayer分割・DB・認証は導入しない）。

---

## 5. プロキシサーバー（Node.js/Express）詳細設計

### 5.1 起動方法・package.json

- 起動コマンド: `npm start`（`server/`ディレクトリ内で実行）。開発時は`npm run dev`
  （`--watch`オプション付きNode実行、または`nodemon`は追加依存を避けるためNode.js標準の
  `node --watch index.js`を使う）。
- ポート: 環境変数`PORT`（未設定時デフォルト`3001`）。
- フロントエンド（`index.html`等）は引き続きブラウザから静的ファイルとして開く/簡易サーバー
  （v1同様`python -m http.server`等）で配信し、プロキシサーバー（`localhost:3001`）とは別プロセス・
  別オリジンで動作する前提とする。そのためExpress側でCORSを許可する（5.4節）。

`server/package.json`（想定内容）:
```jsonc
{
  "name": "3d-character-creator-proxy",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.19.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  }
}
```

- `type: "module"`とし、フロントエンドと同様にESM（`import`/`export`）で統一する
  （プロジェクト全体のスタイル一貫性のため）。
- 依存は`express`（Webフレームワーク）・`cors`（CORS許可）・`dotenv`（`.env`読込）の3つのみに限定し、
  基本設計書v2 8章「過剰な作り込みを行わない」制約に従う。

### 5.2 環境変数

`server/.env.example`（新規。実際の`.env`はコミットしない前提でREADME等に注記する）:
```
MESHY_API_KEY=
PORT=3001
```

| 変数名 | 必須 | 説明 |
|---|---|---|
| `MESHY_API_KEY` | 任意（未設定時は3.3節フォールバック動作） | Meshy AI想定APIの認証キー |
| `PORT` | 任意（デフォルト3001） | プロキシサーバーのリッスンポート |

### 5.3 ディレクトリ・ファイルの役割

- `server/index.js`: Expressアプリの生成、`cors()`・`express.json()`ミドルウェア登録、
  `routes/generate.js`のマウント（`app.use('/api/generate', generateRouter)`）、
  `app.listen(PORT)`。
- `server/meshyClient.js`: 1章の想定エンドポイントへの実際の`fetch`呼び出しをラップする。
  ジョブ作成・ステータス取得の2関数のみを公開し、HTTPエラー・タイムアウトを正規化した形で
  呼び出し元（`routes/generate.js`）に返す。
- `server/routes/generate.js`: `POST /`（マウントパスと合わせて`/api/generate`）・
  `GET /:jobId/status`（`/api/generate/:jobId/status`）の2エンドポイントを実装する
  Express Router。

### 5.4 `server/index.js` 実装方針（擬似コード）

```js
// server/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import generateRouter from './routes/generate.js';

const app = express();
app.use(cors());              // フロントエンドが別オリジン(file://やlocalhost別ポート)から呼ぶため許可
app.use(express.json());

app.use('/api/generate', generateRouter);

app.get('/health', (req, res) => res.json({ ok: true }));  // 疎通確認用（任意）

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`3d-character-creator proxy server listening on port ${PORT}`);
});
```

### 5.5 `server/meshyClient.js` 実装方針

```js
// server/meshyClient.js
const MESHY_BASE_URL = 'https://api.meshy.ai';

/**
 * Meshy AI想定APIへText-to-3D生成ジョブを発行する。
 * @param {string} prompt - 組み立て済みプロンプト（js/params.jsのbuildPromptと同等ロジックで
 *   ブラウザ側が組み立てた文字列をそのまま受け取る。プロキシ側では再組み立てしない）
 * @returns {Promise<{ taskId: string }>}
 * @throws {MeshyApiError} APIキー未設定・HTTPエラー・レスポンス形式不正の場合
 */
export async function createTextTo3DJob(prompt) { /* ... */ }

/**
 * 指定タスクのステータス・結果を取得する。
 * @param {string} taskId
 * @returns {Promise<{
 *   status: "PENDING"|"IN_PROGRESS"|"SUCCEEDED"|"FAILED",
 *   progress: number,
 *   glbUrl: string|null,       // SUCCEEDED時のみ非null
 *   errorMessage: string|null  // FAILED時のみ非null
 * }>}
 * @throws {MeshyApiError} APIキー未設定・HTTPエラー・レスポンス形式不正の場合
 */
export async function getTextTo3DJobStatus(taskId) { /* ... */ }

/** Meshy API呼び出し失敗を表すエラークラス。routes/generate.js側でHTTPステータスへマッピングする。 */
export class MeshyApiError extends Error {
  constructor(message, { statusCode = 502, cause } = {}) {
    super(message);
    this.name = 'MeshyApiError';
    this.statusCode = statusCode; // クライアントへ返すHTTPステータスの目安
    this.cause = cause;
  }
}
```

- `MESHY_API_KEY`が未設定（`process.env.MESHY_API_KEY`が空文字/undefined）の場合、
  `createTextTo3DJob`・`getTextTo3DJobStatus`はいずれもMeshyへの実際のfetchを行わず、
  即座に`MeshyApiError('MESHY_API_KEY is not configured', { statusCode: 503 })`をthrowする
  （呼び出し元の`routes/generate.js`がこれを検知し6.2節のフォールバック処理を行う）。
- Meshy側からのHTTPレスポンスが2xx以外の場合、レスポンスボディを読み取りエラーメッセージに
  含めた上で`MeshyApiError`を`statusCode: 502`でthrowする。
- fetch自体が失敗（ネットワークエラー・タイムアウト）した場合も`MeshyApiError`（`statusCode: 502`）
  に正規化してthrowする（生のNetworkErrorをそのまま外部に伝播させない）。
- fetchタイムアウト: `AbortController`を用い**10秒**でタイムアウトさせる（Meshy側APIの応答遅延が
  プロキシ全体をハングさせないため）。

### 5.6 `server/routes/generate.js` エンドポイント仕様

#### `POST /api/generate`

リクエストボディ:
```jsonc
{
  "gender": "female",              // "female" | "male"
  "mood": "bright",                 // 雰囲気プリセットキー（6章のENUM_OPTIONSに準拠）
  "bodyType": "slim",                // 体型傾向プリセットキー
  "appearanceDescription": "..."    // 自由記述テキスト（任意、最大500文字。サーバー側でも長さを軽くチェック）
}
```

- サーバー側バリデーション: `gender`/`mood`/`bodyType`が文字列であること、
  `appearanceDescription`が文字列（無い場合は空文字扱い）かつ500文字以内であることを確認する。
  不正な場合は`400 Bad Request`＋`{ error: "INVALID_PARAMS", message: "..." }`を返す
  （プロンプト自体はブラウザ側`buildPrompt()`で組み立て済みのものをリクエストボディに含めて
  送る方式とする。下記「リクエストボディ（確定・prompt同梱方式）」参照）。
- **`prompt`フィールド自体のサーバー側バリデーション（確定・追加）**: `prompt`はMeshy側へ
  そのまま送信される文字列であり、ブラウザ側`buildPrompt()`を経由しない不正なリクエスト
  （直接のAPI叩き等）によって想定外の値がMeshyへ渡ることを防ぐため、以下を確認する。
  - `prompt`フィールドが**存在すること**（`undefined`・キー自体が無い場合はNG）。
  - 型が**文字列であること**（数値・オブジェクト等はNG）。
  - `trim()`後の長さが**1文字以上**であること（空文字・空白のみはNG）。
  - 長さの上限として**2000文字以内**であること（`appearanceDescription`の上限500文字＋
    固定フレーズ部分を考慮した余裕を持たせた上限値。11.3節の`buildPrompt`が生成する
    文字列は通常この範囲に収まるが、直接APIを叩く不正リクエストに対する防御として設ける）。
  - 上記いずれかを満たさない場合、`gender`等と同じく`400 Bad Request`＋
    `{ error: "INVALID_PARAMS", message: "promptが不正です。" }`を返す
    （個別のエラーメッセージはフィールドごとに出し分けてよいが、レスポンス形式は統一する）。

**リクエストボディ（確定・prompt同梱方式）**:

ブラウザ側`main.js`は`js/params.js`の`buildPrompt(params)`で組み立てた文字列を`prompt`フィールドに
含めてPOSTする（プロキシ側でプロンプト再構築ロジックを二重管理しないため。2章の方針に合わせ、
プロンプト組み立てはあくまで`params.js`＝フロントエンド側の責務に一本化する）。

```jsonc
{
  "gender": "female",
  "mood": "bright",
  "bodyType": "slim",
  "appearanceDescription": "...",
  "prompt": "buildPrompt()で組み立てた最終的な英語/日本語プロンプト文字列"
}
```

レスポンス（成功時、`202 Accepted`）:
```jsonc
{ "jobId": "01890c8b-xxxx-xxxx-xxxx-xxxxxxxxxxxx" }
```

レスポンス（APIキー未設定時、`503 Service Unavailable`。6.2節フォールバック参照）:
```jsonc
{
  "error": "API_KEY_NOT_CONFIGURED",
  "message": "AIモデル生成APIキーが設定されていません。デモ用モデルを表示します。",
  "fallback": {
    "jobId": "demo-fallback",
    "immediate": true
  }
}
```

レスポンス（Meshy側エラー、`502 Bad Gateway`）:
```jsonc
{ "error": "MESHY_API_ERROR", "message": "AIモデル生成APIの呼び出しに失敗しました。" }
```

レスポンス（バリデーションエラー、`400 Bad Request`）:
```jsonc
{ "error": "INVALID_PARAMS", "message": "appearanceDescriptionは500文字以内で入力してください。" }
```

#### `GET /api/generate/:jobId/status`

- `jobId === "demo-fallback"`の場合（6.2節のフォールバック経路）、Meshyへ問い合わせず即座に
  `200 OK`でSUCCEEDED相当のダミーGLB情報を返す（6.2節参照）。
- それ以外の`jobId`は`meshyClient.getTextTo3DJobStatus(jobId)`をそのまま呼び出す。

レスポンス（進行中、`200 OK`）:
```jsonc
{ "status": "in_progress", "progress": 45, "modelUrl": null, "errorMessage": null }
```

レスポンス（完了、`200 OK`）:
```jsonc
{
  "status": "succeeded",
  "progress": 100,
  "modelUrl": "https://assets.meshy.ai/xxxxx/model.glb",
  "errorMessage": null
}
```

レスポンス（失敗、`200 OK`。HTTPレベルではエラーにせず、bodyのstatusで失敗を表現する）:
```jsonc
{ "status": "failed", "progress": 0, "modelUrl": null, "errorMessage": "生成に失敗しました。" }
```

- Meshy側の`status`値（`PENDING`/`IN_PROGRESS`/`SUCCEEDED`/`FAILED`）は、プロキシ側で
  小文字スネーク相当（`pending`/`in_progress`/`succeeded`/`failed`）に正規化してブラウザへ返す
  （ブラウザ側`main.js`が判定しやすい形に統一するため。`pending`と`in_progress`はブラウザ側では
  同じ「生成中」表示として扱ってよい）。
- Meshy呼び出し自体が失敗した場合（`MeshyApiError`）は、`jobId`不明などのケースを除き
  `502 Bad Gateway`＋`{ error: "MESHY_API_ERROR", message: "..." }`を返す
  （ポーリング中の一時的なエラーで即座に生成失敗と確定させないよう、`main.js`側は
  502を「リトライ対象の一時エラー」として扱い、連続3回失敗した場合に生成失敗として確定する。
  7章参照）。

---

## 6. APIキー未設定時のフォールバック仕様（確定）

基本設計書v2 9章で「詳細設計側で確定すること」とされていた事項。

### 6.1 方針: デモ用ダミーGLB表示を採用

- **エラー表示のみ**にする案と**デモ用ダミーGLB表示**にフォールバックする案を比較検討した結果、
  「開発中・APIキー未設定の状態でも生成→表示のフローを一通り確認できる」利点を優先し、
  **デモ用ダミーGLB表示**を採用する。ただし画面上には「デモモデルを表示しています（実際のAI生成
  ではありません）」という注記を必ず表示し、ユーザーに誤解を与えない。

### 6.2 ダミーGLBの具体策

- 実ファイルを本リポジトリに同梱せず、**Three.js公式サンプルが配布している既知の小さなGLBの
  公開URL**を使う。具体的には、Three.js公式サンプルリポジトリ（`mrdoob/three.js`）の
  `examples/models/gltf/`配下で配布されている`Duck/glTF-Binary/Duck.glb`
  （jsDelivr経由のURL: `https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Duck/glTF-Binary/Duck.glb`）
  を「デモ用ダミーGLB」として採用する。
  - 選定理由: Three.js公式サンプルで長年使われている軽量な既知GLB（アヒルのモデル）であり、
    追加のホスティング・ライセンス確認コストなしに疎通確認できるため。「リアルな人物」という
    最終的な生成物のテイストとは異なるが、あくまで**APIキー未設定時の疎通確認用プレースホルダー**
    であり、実際の生成結果ではない旨をUI上に明記する（6.1節）ことで許容する。
  - jsDelivrのCDNタグはThree.jsのバージョンタグ（`@r160`）と紐づくため、3章のThree.jsバージョンを
    変更しない限りURLの継続利用性は安定している。
- サーバー側実装: `server/routes/generate.js`の`POST /api/generate`ハンドラで
  `MESHY_API_KEY`未設定を検知した場合、5.6節の`503`レスポンスを返す（`fallback.jobId: "demo-fallback"`
  を含む）。ブラウザ側`main.js`はこの`fallback`情報を見て、Meshyへのポーリングを行わず
  直接`GET /api/generate/demo-fallback/status`を呼ぶ（プロキシは`jobId`が`"demo-fallback"`固定文字列
  であることを見て、5.6節の通り即座に成功レスポンス（`modelUrl`は上記jsDelivr URL固定）を返す）。
- この方式により、ブラウザ側のポーリングロジック（`main.js`）はAPIキー有無にかかわらず
  「`POST /api/generate` → `jobId`取得 → `GET .../status`をポーリング」という単一のコードパスで
  完結でき、フォールバック専用の特殊分岐を`main.js`側に持たせずに済む。

---

## 7. エラー処理方針（全体まとめ）

| ケース | 検知箇所 | 対応 |
|---|---|---|
| `MESHY_API_KEY`未設定 | `server/meshyClient.js` → `routes/generate.js` | `POST /api/generate`が`503`＋`fallback.jobId: "demo-fallback"`を返す。`main.js`はこれを検知し、6.2節のダミーGLBフローへ切替、UI上に「デモモデルを表示しています」の注記を出す（エラー扱いにはしない） |
| Meshy側ジョブ作成失敗（不正パラメータ・レート制限等） | `routes/generate.js`（`POST /api/generate`が`502`/`400`を返す） | `main.js`はレスポンスの`error`/`message`をそのままパネルのエラー表示領域に出し、「生成」ボタンを再度活性化して再試行可能にする |
| ポーリング中の一時的なMeshy APIエラー（`502`） | `main.js`のポーリングループ | 即座に失敗確定とはせず、**連続3回**まで同じ間隔でリトライする。4回目も失敗した場合に生成失敗として確定しエラー表示する |
| ポーリングタイムアウト（180秒経過してもSUCCEEDED/FAILEDに至らない） | `main.js`のポーリングループ（`GENERATION_TIMEOUT_MS`） | ポーリングを打ち切り、「生成がタイムアウトしました。しばらくしてから再度お試しください。」を表示し、「生成」ボタンを再活性化する |
| Meshy側`status: "FAILED"` | `main.js`のポーリングループ | レスポンスの`errorMessage`（無ければ「モデルの生成に失敗しました。」）を表示し、「生成」ボタンを再活性化する |
| GLBロード失敗（`GLTFLoader`の`onError`、不正なGLB・404等） | `js/character.js`の`loadCharacterModel`（10章） | Promiseをrejectし、`main.js`が「モデルの読み込みに失敗しました。」を表示。表示中のキャラクターは変更しない（直前の状態を維持、初回生成時は未生成状態のまま） |
| 極端に重いモデル（ポリゴン数過多等） | 特に自動検知は行わない（非機能要件、基本設計書v2 8章） | 表示が重い場合の対処は本リニューアルのスコープ外とする。9章に申し送りとして明記のみ行う |
| ネットワーク断・プロキシサーバー未起動 | `main.js`の`fetch`が例外を投げる | `try/catch`で捕捉し、「サーバーに接続できませんでした。プロキシサーバーが起動しているかご確認ください。」を表示 |
| `localStorage`関連（v1から継続） | `storage.js` | v1の8.5節と同じ方針を継続（8章参照） |
| WebGL非対応（v1から継続） | `main.js`の`isWebGLAvailable()` | v1の11章と同じ方針を継続 |

---

## 8. `js/controls.js` の正面向き判定 — 確認・補正方針（確定・重要）

基本設計書v2 9章で「ほぼノータッチではない重要な確認事項」とされていた事項。

### 8.1 問題の所在（再掲）

既存`controls.js`は`computeCameraOffset()`内のコメントに明記の通り、
「キャラクターの正面はローカル+Z方向」という前提で`atan2(x, -z)`により
`character.root.rotation.y`の目標角度を算出している。AI生成GLBの正面方向はモデルごとに
不定（+Z向きとは限らず、+X向き・-Z向き等の可能性がある）ため、この前提が崩れると
「WASD前進キーを押しても、モデルの正面と移動方向がずれて見える」問題が起こりうる。

### 8.2 対策方針（確定仕様）

- `controls.js`自体の`atan2(x, -z)`ロジック・`CAMERA_OFFSET`計算式は**変更しない**
  （移動・カメラ追従のロジックは「`character.root`のローカル+Z＝正面」という契約を
  引き続き前提にしてよい）。
- 代わりに、**GLBロード時に`character.js`側で正面向きのズレを吸収する補正回転を
  `character.root`直下の中間ノードへ適用する**方式を採用する。
- 具体的には、`character.js`の`loadCharacterModel()`が返す`character.root`の構造を
  以下の2階層構成にする（10章の関数シグネチャと対応）:

```
character.root (THREE.Group)          … controls.js/main.jsが位置・回転を操作する対象（不変の契約）
└── modelContainer (THREE.Group)      … GLBシーン本体を格納する中間ノード。
    │                                    ロード時に正面補正の回転をここへ一度だけ適用する
    └── (GLBのgltf.scene本体)
```

- 正面補正の具体値: **`MESHY_MODEL_FRONT_CORRECTION_Y = 0`（ラジアン。初期値は補正なし）**を
  `character.js`内の定数として定義する。Meshy AIが返す人物モデルの正面向きの傾向は
  実際に生成物を確認しないと確定できないため、本詳細設計時点では「補正の仕組み（フック）を
  用意し、値は0（無補正）から開始する」ことを確定仕様とする。
  - 実装時・実際にAPIキーを使って生成確認ができた段階で、`modelContainer.rotation.y`に
    この定数を設定する形で補正する（例えば「生成物の正面が一貫して-Z向きであった」と
    判明した場合、`MESHY_MODEL_FRONT_CORRECTION_Y = Math.PI`に変更するだけで全体に適用される）。
  - モデルごとに正面向きがバラバラで固定値の一律補正では対応できないと判明した場合は、
    9章の申し送り事項としてコーディング係・テスト実施係から開発リーダー係へ再度の設計判断
    エスカレーションを行うこと（本書のスコープでは「一律固定値による補正」を採用方針として
    確定するに留める）。
- `modelContainer`を`character.root`の直接の子として分離することで、GLBシーン自体の
  スケール・位置調整（10.3節、モデルのサイズがまちまちな場合のスケール正規化）も
  `modelContainer`側で完結させ、`character.root`は常にワールド座標系での位置・向きのみを
  表す薄いコンテナとして保つ（controls.jsとの契約を最小限かつ明確に保つ狙い）。

### 8.3 `controls.js`が無改修で済む理由（因果関係の明記）

`controls.js`側の`computeCameraOffset()`・移動ロジックは、いずれも`character.root.rotation.y`
（＝ワールド座標系での「キャラクターがどの向きを向いているか」という抽象的な状態）だけを
入力・出力として扱っており、その角度が実際に画面上でどのモデル形状としてどちらを向いて
見えるかには関知しない。一方、GLBモデル本体の見た目上の正面ズレは`modelContainer`が
`character.root`の子として独立して吸収する（8.2節の`MESHY_MODEL_FRONT_CORRECTION_Y`を
`modelContainer.rotation.y`にのみ適用し、`character.root.rotation.y`には一切加算しない）。

この2つの回転は次のように独立して合成される。

```
最終的な見た目の向き（ワールド座標系）
  = character.root.rotation.y            … controls.jsが移動方向に応じて更新する“論理的な向き”
  + modelContainer.rotation.y            … character.jsがロード時に一度だけ設定する“見た目補正”
  （Three.jsの階層構造上、子のローカル回転は親のワールド回転に加算される形で合成される）
```

- `controls.js`の`atan2(x, -z)`は常に`character.root.rotation.y`という一貫した「論理的な正面
  ＝ローカル+Z」の契約のみを前提に角度を計算しており、GLBモデルの実際の見た目の向きが
  `modelContainer`側の補正でどうであれ、この契約自体は変化しない。
- 逆に`character.js`側は`character.root.rotation.y`を一切参照・変更せず、`modelContainer`の
  ローカル回転のみを操作するため、`controls.js`の計算結果を上書き・混乱させることがない。
- 以上の「責務が異なる回転値を異なる階層に分離して保持する」構造により、両者は互いの
  実装を意識せずに独立して動作でき、結果として`controls.js`は無改修のまま8.2節の
  補正の仕組みと共存できる。

---

## 9. データ構造定義（確定・詳細版）

### 9.1 生成パラメータ（`GenerationParams`）

| フィールド | 型 | 必須 | デフォルト | 説明 |
|---|---|---|---|---|
| `version` | number | 必須 | `2` | データ構造バージョン |
| `gender` | `"female" \| "male" \| "unspecified"` | 必須 | `"unspecified"` | 性別（v1の`"female"/"male"`の2値から、AI生成では指定しない選択肢も許容するため`"unspecified"`を追加） |
| `mood` | `"bright" \| "cool" \| "cute" \| "mature"` | 必須 | `"bright"` | 雰囲気プリセット（明るい/クール/かわいい/大人っぽい） |
| `bodyType` | `"slim" \| "average" \| "muscular"` | 必須 | `"average"` | 体型傾向プリセット（スリム/標準/がっしり） |
| `appearanceDescription` | string | 任意 | `""` | 容姿の自由記述（最大500文字。フロント・サーバー双方でこの上限をチェック） |

### 9.2 生成結果参照情報（`GeneratedModelInfo`）

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `modelId` | string | 必須 | Meshy側`task_id`（または`"demo-fallback"`。**注記**: `"demo-fallback"`は6.2節のAPIキー未設定時フォールバックを示す固定文字列であり、実際のMeshyジョブとは対応しない。将来的にこの値をキーとしてキャッシュ・重複排除・DB等の一意識別子として扱う実装を行う場合、複数ユーザー・複数回の生成で同一の`"demo-fallback"`が重複して現れうる点に注意すること（一意なジョブIDとしての性質を持たないため、一意性を前提とした処理には使用しないこと）） |
| `modelUrl` | string | 必須 | GLBの取得URL |
| `generatedAt` | string（ISO 8601） | 必須 | 生成完了日時 |
| `sourceParams` | `GenerationParams` | 必須 | 生成時に使用したパラメータのスナップショット |

### 9.3 `localStorage`保存構造（`StoredData`）

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `version` | number | 必須 | `2`固定 |
| `params` | `GenerationParams` | 必須 | 次回フォーム初期値用 |
| `generatedModel` | `GeneratedModelInfo \| null` | 必須 | 未生成時は`null` |

- `localStorage`キー名: **`"3d-character-creator:v2:generation"`**（v1のキー
  `"3d-character-creator:params"`とは別名にすることで、v1データが残っていても値の型が
  混同されることはない。ただし9.4節の通りバージョン判定処理自体は保持する）。

### 9.4 バージョン非互換時の判定・破棄処理（確定）

- `storage.js`の`loadFromStorage()`は、`localStorage.getItem(STORAGE_KEY_V2)`が取得できた場合のみ
  `JSON.parse`を試み、`parsed.version === 2`であることを確認する。
- `version`が2以外、または`parsed`自体がオブジェクトでない、`JSON.parse`が失敗する等の場合は、
  **エラーとして扱わず**「未生成状態」（`params: createDefaultParams()`, `generatedModel: null`）を
  返す（9.5節参照。データ移行ロジックは設けない、という基本設計書v2 6.3節の方針をそのまま踏襲）。
- v1のキー（`"3d-character-creator:params"`）は本v2では一切読みに行かない
  （キー名を変えたことで自然に無視される。明示的な削除も行わない＝残存しても実害がないため
  放置してよい、という判断。14章に申し送り）。

### 9.5 `storage.js` シグネチャ変更点

```js
// js/storage.js（v2）
import { normalizeParams, createDefaultParams } from './params.js';

const STORAGE_KEY = '3d-character-creator:v2:generation';

/**
 * 現在の生成パラメータ・生成結果参照情報をlocalStorageへ保存する。
 * @param {{ params: GenerationParams, generatedModel: GeneratedModelInfo|null }} data
 * @returns {{ ok: boolean, error?: Error }}
 */
export function saveToStorage(data)

/**
 * localStorageから保存データを読み込む。
 * @returns {{
 *   params: GenerationParams,               // 常に正規化済みの完全な値を返す
 *   generatedModel: GeneratedModelInfo|null,
 *   restored: boolean                       // version===2の有効な保存データを復元できた場合のみtrue
 * }}
 */
export function loadFromStorage()

/** localStorageの保存データ（v2キーのみ）を削除する。 @returns {void} */
export function clearStorage()
```

- `saveToStorage`/`loadFromStorage`の関数シグネチャの骨格（引数・戻り値の形）はv1を踏襲するが、
  保存対象が`params`単体から`{params, generatedModel}`のペアに変わる点が変更点である
  （基本設計書v2 3章の指示通り）。

---

## 10. `js/character.js` — GLBロード・シーン配置・破棄処理（作り直し）

### 10.1 責務

- プロキシ経由で取得したGLBの`modelUrl`を`GLTFLoader`でロードし、`character.root`配下
  （`modelContainer`経由。8章参照）に配置する。
- 既存モデルが表示されている状態で新しいモデルに差し替える場合、旧GLBシーンの
  ジオメトリ・マテリアル・テクスチャを`dispose()`してメモリリークを防ぐ。
- 未生成状態（`generatedModel`が無い）の場合の空表示・プレースホルダー表示を提供する。

### 10.2 `character.root`インターフェース契約（重要・必ず維持）

基本設計書v2 9章・3章の指示通り、新`character.js`は以下を必ず満たす。

- 戻り値は`{ root: THREE.Group, ... }`の形を持ち、`root`は`controls.js`・`main.js`が
  位置・回転を操作する対象として扱える`THREE.Group`である。
- `root`は常にシーン中の同一インスタンスとして扱われ、モデルの差し替え（再生成）時も
  `root`オブジェクト自体を作り直さず、`root`の子（`modelContainer`）の中身のみ差し替える
  （`controls.js`が保持する`character`参照が生成のたびに無効化されないようにするため）。

### 10.3 主要関数・シグネチャ

```js
// js/character.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const MESHY_MODEL_FRONT_CORRECTION_Y = 0; // 8.2節。ラジアン。初期値は無補正
const MODEL_TARGET_HEIGHT = 1.7;          // モデルの高さをこの値(m相当)へ正規化する目標値

/**
 * character.root（常に単一インスタンス）とローディング/未生成表示の管理ハンドルを構築する。
 * ページ初期化時に1回だけ呼ぶ（GLBの実ロードはこの時点では行わない。generatedModelがあれば
 * 呼び出し側がloadCharacterModel()を続けて呼ぶ想定。10.4節参照）。
 * @returns {{
 *   root: THREE.Group,                      // シーンにaddする最上位オブジェクト（不変）
 *   modelContainer: THREE.Group,            // root直下。GLB本体・正面補正を保持する中間ノード
 *   currentModelUrl: string|null            // 現在ロード済みのmodelUrl（差し替え要否の判定用、内部状態）
 * }} character オブジェクト
 */
export function createCharacterContainer()

/**
 * 指定URLのGLBをロードし、character.modelContainer配下に配置する。
 * ロード前に既存の子要素（あれば）をdispose()してから差し替える。
 * @param {ReturnType<typeof createCharacterContainer>} character
 * @param {string} modelUrl - プロキシ経由で取得したGLBのURL
 * @returns {Promise<void>} ロード完了時にresolve。失敗時はrejectする（7章のエラー処理へ委譲）
 * @throws 例外は投げずrejectで返す（呼び出し元main.jsがcatchしてエラー表示を行う）
 */
export function loadCharacterModel(character, modelUrl)

/**
 * character.modelContainer配下の現在のGLBシーンを破棄する（geometry/material/textureのdispose）。
 * 新モデルへの差し替え時、loadCharacterModel内部から呼ばれる。
 * @param {ReturnType<typeof createCharacterContainer>} character
 */
export function disposeCurrentModel(character)

/**
 * 未生成状態のプレースホルダー表示（例: 半透明の簡易カプセル形状、または非表示のまま）を
 * modelContainer配下に設置する。ページ初期化時、generatedModelがnullの場合にmain.jsから呼ぶ。
 * @param {ReturnType<typeof createCharacterContainer>} character
 */
export function showPlaceholder(character)
```

### 10.4 `loadCharacterModel` 処理フロー（詳細）

```
loadCharacterModel(character, modelUrl):
  1. 既にcharacter.currentModelUrl === modelUrl であれば何もせずresolve（同一URLの再ロード防止）
  2. disposeCurrentModel(character) で modelContainer 配下の既存の子を全て除去・dispose
  3. new GLTFLoader().load(modelUrl, onLoad, onProgress, onError) をPromiseでラップ
     - onLoad(gltf):
       // スケール適用対象は常に「gltf.scene本体」（= GLBのルートオブジェクト）であり、
       // modelContainer自体には一切スケールを設定しない（modelContainer.scaleは常に1のまま
       // 維持する）。二重スケーリングを避けるため、スケール操作の対象階層をgltf.scene一本に
       // 限定するのが本設計の確定方針である。
       a. 【スケール適用“前”】new THREE.Box3().setFromObject(gltf.scene) で
          scale.setScalar(1)（ロード直後のデフォルト状態）のままバウンディングボックスを計算し、
          その高さ(size.y)を取得する
       b. scaleFactor = MODEL_TARGET_HEIGHT / size.y を算出し、
          gltf.scene.scale.setScalar(scaleFactor) を適用する
          （AI生成モデルのサイズがまちまちな場合の正規化。9章のパフォーマンス配慮の一環）
       c. 【スケール適用“後”】再度 new THREE.Box3().setFromObject(gltf.scene) で
          スケール適用後のバウンディングボックスを計算し直し、その最小Y座標(box.min.y)を取得する
          （スケール前の値をそのまま流用すると位置補正がスケール分ズレるため、
          スケール適用後に必ず再計算すること。この再計算タイミングの明記が本節の確定事項である）
       d. gltf.scene.position.y -= box.min.y として底面Y座標が0になるよう補正する
          （地面にめり込む/浮くのを防ぐ。手順cで再計算したbox.min.yを使うことで、
          スケール後の実寸に基づいた正しい補正量になる）
       e. modelContainer.add(gltf.scene)
          （この時点でmodelContainer.scaleは1のまま。スケールはgltf.scene側のみに一度だけ
          適用されているため、二重スケーリングは発生しない）
       f. modelContainer.rotation.y = MESHY_MODEL_FRONT_CORRECTION_Y を設定（8.2節。
          回転はmodelContainer側、スケール・位置補正はgltf.scene側、と操作対象階層を
          明確に分離する）
       g. character.currentModelUrl = modelUrl
       h. resolve()
     - onError(error): reject(new Error('GLBのロードに失敗しました: ' + error.message))
  4. ロード自体がタイムアウトする場合（Meshy側URLが無効・ネットワーク遅延等）に備え、
     GLTFLoaderにはタイムアウト機構が無いため、Promise.race()で30秒（
     `GLB_LOAD_TIMEOUT_MS = 30000`）のタイムアウトを別途実装し、超過時は
     reject(new Error('モデルの読み込みがタイムアウトしました'))する
```

**二重スケーリング防止の要点まとめ**:
- スケールを設定するのは`gltf.scene.scale`のみ。`modelContainer.scale`は常にデフォルト値
  （1, 1, 1）のまま変更しない。
- バウンディングボックス計算は**スケール適用前に1回**（目標倍率算出のため）、
  **スケール適用後に1回**（位置補正量算出のため）の計2回行う。2回目を省略して
  1回目の値を使い回すと位置補正がスケール倍率分だけ誤った値になるため、必ず
  スケール適用後に再計算すること。

### 10.5 `showPlaceholder` 仕様

- 未生成状態では、モデル未表示のままとする（過剰な作り込みを避けるため、プリミティブ形状の
  プレースホルダーは**設置しない**方針とする。空の`modelContainer`のまま地面フィールドのみが
  表示される状態を「未生成状態」の見た目として扱う）。
- ただし空のキャンバスだけではユーザーが状態を誤解しうるため、この場合のガイダンス表示は
  3Dシーン内ではなく`customization-ui.js`側のパネル文言（「まだキャラクターが生成されていません。
  パラメータを入力して『生成』を押してください」）で担う（12章参照）。

### 10.6 破棄処理・メモリ管理

```
disposeCurrentModel(character):
  for each child in [...character.modelContainer.children]:
    character.modelContainer.remove(child)
    child.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose()
      if (obj.material) {
        const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
        for (const mat of materials) {
          for (const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap']) {
            if (mat[key]) mat[key].dispose()
          }
          mat.dispose()
        }
      }
    })
```

---

## 11. `js/params.js` — 生成パラメータ定義・プロンプト組み立て（作り直し）

### 11.1 責務

- 9.1節の`GenerationParams`のデフォルト値・選択肢・バリデーション（`normalizeParams`）を定義する。
- プロンプト組み立て関数`buildPrompt(params)`を提供する（2章の方針）。

### 11.2 選択肢定義

```js
export const ENUM_OPTIONS = {
  gender: ['female', 'male', 'unspecified'],
  mood: ['bright', 'cool', 'cute', 'mature'],
  bodyType: ['slim', 'average', 'muscular'],
};

const ENUM_LABELS = {
  gender: { female: '女性', male: '男性', unspecified: '指定しない' },
  mood: { bright: '明るい', cool: 'クール', cute: 'かわいい', mature: '大人っぽい' },
  bodyType: { slim: 'スリム', average: '標準', muscular: 'がっしり' },
};
```

- `ENUM_LABELS`は`customization-ui.js`のセレクト選択肢表示用（v1の`customization-ui.js`内定義を
  `params.js`側に統合。UIラベルもパラメータ定義と一体で管理したほうが一貫性がある、という
  v2独自の判断。14章に軽微な変更点として記載）。

### 11.3 主要関数

```js
// js/params.js

const APPEARANCE_MAX_LENGTH = 500;

/** デフォルトの生成パラメータを返す。 @returns {GenerationParams} */
export function createDefaultParams() {
  return {
    version: 2,
    gender: 'unspecified',
    mood: 'bright',
    bodyType: 'average',
    appearanceDescription: '',
  };
}

/**
 * 任意の入力を検証し、不正・欠損値をデフォルトで補完した正規化済みパラメータを返す。
 * 例外を投げない（v1のnormalizeParamsと同じ設計方針を継続）。
 * @param {any} raw
 * @returns {GenerationParams}
 */
export function normalizeParams(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const appearanceDescription =
    typeof src.appearanceDescription === 'string'
      ? src.appearanceDescription.slice(0, APPEARANCE_MAX_LENGTH)
      : '';
  return {
    version: 2,
    gender: ENUM_OPTIONS.gender.includes(src.gender) ? src.gender : 'unspecified',
    mood: ENUM_OPTIONS.mood.includes(src.mood) ? src.mood : 'bright',
    bodyType: ENUM_OPTIONS.bodyType.includes(src.bodyType) ? src.bodyType : 'average',
    appearanceDescription,
  };
}

/**
 * appearanceDescriptionの長さのみを検証する（フォーム側のリアルタイムバリデーション用）。
 * @param {string} text
 * @returns {{ ok: boolean, message?: string }}
 */
export function validateAppearanceDescription(text) {
  if (typeof text === 'string' && text.length > APPEARANCE_MAX_LENGTH) {
    return { ok: false, message: `容姿の説明は${APPEARANCE_MAX_LENGTH}文字以内で入力してください。` };
  }
  return { ok: true };
}

/**
 * 生成パラメータからMeshy AI想定APIへ送るプロンプト文字列を組み立てる。
 * @param {GenerationParams} params - normalizeParams済みのもの
 * @returns {string} プロンプト文字列
 */
export function buildPrompt(params) {
  const genderPhrase = { female: 'a woman', male: 'a man', unspecified: 'a person' }[params.gender];
  const moodPhrase = {
    bright: 'with a bright and cheerful expression',
    cool: 'with a cool and composed expression',
    cute: 'with a cute and friendly expression',
    mature: 'with a mature and elegant expression',
  }[params.mood];
  const bodyPhrase = {
    slim: 'slim build',
    average: 'average build',
    muscular: 'muscular build',
  }[params.bodyType];

  const parts = [
    `A photorealistic 3D character model of ${genderPhrase}`,
    moodPhrase,
    `, ${bodyPhrase}`,
  ];
  if (params.appearanceDescription && params.appearanceDescription.trim().length > 0) {
    parts.push(`. Appearance details: ${params.appearanceDescription.trim()}`);
  }
  parts.push('. Full body, T-pose, realistic proportions, high quality.');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
```

- `buildPrompt`は英語プロンプトを組み立てる（Meshy AI想定APIが英語プロンプトでの学習・生成精度が
  高いという一般的傾向を踏まえた仮定。`appearanceDescription`のみユーザーの日本語自由記述を
  そのまま埋め込む混在方式とする。実装時、日本語プロンプトのみで生成精度に問題ないと判明すれば
  固定フレーズ部分も日本語に変更してよい旨を9章に申し送る）。

---

## 12. `js/customization-ui.js` — フォームUI・生成ボタン・ローディング/エラー表示（作り直し）

### 12.1 責務

- 性別・雰囲気・体型傾向・容姿説明の入力フォームを生成する。
- 「生成」ボタン押下時のハンドラ呼び出し、生成中のローディング表示、エラー表示、
  「保存」「リセット」ボタンを管理する。

### 12.2 生成するコントロール一覧

| セクション | コントロール種別 | 対象パラメータ |
|---|---|---|
| 性別 | セレクト | `gender` |
| 雰囲気 | セレクト | `mood` |
| 体型傾向 | セレクト | `bodyType` |
| 容姿の説明 | `<textarea>`（500文字カウンタ付き） | `appearanceDescription` |
| 生成 | ボタン（1つ） | - |
| ローディング表示 | 進捗メッセージ＋スピナー要素（`div.loading-indicator`） | - |
| エラー表示 | メッセージ領域（`div.generation-error`） | - |
| 操作 | ボタン×2 | 「保存」「リセット」 |

### 12.3 主要関数・シグネチャ

```js
// js/customization-ui.js
import { ENUM_OPTIONS, ENUM_LABELS, validateAppearanceDescription } from './params.js';

/**
 * カスタマイズパネルのDOMを構築し、イベントをバインドする。
 * @param {HTMLElement} containerEl
 * @param {GenerationParams} initialParams
 * @param {{
 *   onGenerate: (params: GenerationParams) => void,   // 「生成」ボタン押下時
 *   onSave: () => void,
 *   onReset: () => void,
 * }} handlers
 * @returns {{
 *   refreshUI: (params: GenerationParams) => void,
 *   setGeneratingState: (isGenerating: boolean, progressText?: string) => void,
 *     // true: 生成ボタンを無効化しローディング表示を出す。progressTextで進捗メッセージを更新可能
 *     // false: 生成ボタンを再度有効化しローディング表示を消す
 *   showError: (message: string) => void,     // エラー表示領域にメッセージを表示
 *   clearError: () => void,                   // エラー表示をクリア
 *   showGenerationNotice: (message: string) => void,
 *     // 6.2節「デモモデルを表示しています」等の注記表示用
 *   clearGenerationNotice: () => void,
 *     // showGenerationNoticeで表示した注記領域（div.generation-notice）を非表示に戻す。
 *     // showError/clearErrorと対称的な役割を持つペア関数として提供する。
 * }}
 */
export function setupCustomizationUI(containerEl, initialParams, handlers)
```

- `showGenerationNotice`/`clearGenerationNotice`は`showError`/`clearError`と同じ実装パターン
  （対象の`div`要素の`hidden`属性・テキスト内容を切り替えるのみ）で統一する。
  `clearGenerationNotice`を呼ぶべき箇所は`main.js`側で以下の2箇所とする（13.4節・13.5節）。
  - 新しい生成リクエストを開始する直前（`handleGenerate`の冒頭。前回のデモ注記が
    残っていた場合に、今回の結果が確定するまで一旦クリアしておくため）。
  - 本番生成（`jobId !== "demo-fallback"`のケースを含む、`pollJobStatus`が`succeeded`に
    到達したケース全般）が成功した時点（`pollJobStatus`内、`currentGeneratedModel`更新の
    直後）。これにより「デモ表示後、実APIキー設定下で本番生成が成功しても注記が残り続ける」
    バグを防ぐ。

- v1の`onChange`（値変更のたびに即時反映）方式は廃止する。フォーム入力はローカルの
  一時状態として保持するのみで、`main.js`側へは「生成」ボタン押下時にのみ
  `onGenerate(currentFormParams)`として通知する（基本設計書v2 4章UIの通り、リアルタイム反映を
  廃止したことに対応）。
- `handlers`はv1の位置引数方式（`onChange, onSave, onReset`）から**オブジェクト方式**に変更する
  （引数が増え、位置引数では可読性が落ちるため。14章に軽微な変更点として記載）。

### 12.4 生成ボタン押下時のフロー（`customization-ui.js`内部）

```
「生成」ボタン click:
  1. 各入力欄の現在値からGenerationParamsオブジェクトを組み立てる
  2. validateAppearanceDescription()でクライアント側バリデーション。NGならshowError()して終了
  3. handlers.onGenerate(組み立てたparams) を呼ぶ（実際のfetch・ポーリングはmain.js側の責務）
  4. ボタン自体の無効化はsetGeneratingState(true)がmain.js側から呼ばれるのを待つ
     （customization-ui.js側では即座に無効化せず、main.js経由でのsetGeneratingState呼び出しに
     一本化する。理由: 生成失敗時の再有効化タイミングをmain.js側の状態管理に一元化するため）
```

### 12.5 「保存」「リセット」ボタンの挙動（確定）

- 「保存」ボタンは**生成完了後（`generatedModel`が存在する場合）のみ有効化**する
  （基本設計書v2 4章「詳細設計で確定する」を受けての確定仕様。未生成の状態で保存しても
  `generatedModel: null`のペアが保存されるだけで実用上意味が薄いため）。
  - `refreshUI(params)`は`generatedModel`の状態を直接見ないため、保存ボタンの活性/非活性切替は
    別途`setSaveButtonEnabled(enabled: boolean)`相当の内部処理を`main.js`から呼べるようにする
    （`setupCustomizationUI`の戻り値に`setSaveButtonEnabled(enabled)`を追加する）。
- 「リセット」ボタンはv1同様の`window.confirm()`確認を継続し、確認後に
  フォーム入力・`generatedModel`（3Dシーン上の表示）・`localStorage`（`clearStorage()`）を
  すべて初期状態へ戻す（v1の9章の方針を踏襲）。

---

## 13. `js/main.js` — 初期化フロー・プロキシ通信・ポーリング（改修）

### 13.1 責務

- Scene/Camera/Renderer生成、フィールド・キャラクターコンテナ追加、アニメーションループ
  （v1から骨格を継続）。
- ページロード時、保存済み`generatedModel`があれば`loadCharacterModel()`で再ロード。
- 「生成」ボタン押下時、プロキシサーバーへの`fetch`（`POST /api/generate`）とポーリング
  （`GET /api/generate/:jobId/status`）を実行する。

### 13.2 定数

```js
const PROXY_BASE_URL = 'http://localhost:3001'; // 環境に応じ変更可能な定数として1箇所に集約
const POLL_INTERVAL_MS = 2000;
const GENERATION_TIMEOUT_MS = 180000;
const MAX_POLL_ERROR_RETRY = 3;
```

### 13.2.1 `main.js`トップレベルで管理する状態変数（確定・一覧）

本節は指摘事項（レビュー差し戻し）を受け、13章全体で参照する変数のスコープ・ライフサイクル
を最初に一元的に定義するものである。以下の変数は**すべて`main.js`モジュールのトップレベル
スコープ（`DOMContentLoaded`ハンドラの外、モジュール内の`let`宣言）**として保持し、
`handleGenerate`/`pollJobStatus`/`handleSave`/`handleReset`から共通に参照・更新する
クロージャ変数とする。

| 変数名 | 型 | 役割・スコープ |
|---|---|---|
| `character` | `ReturnType<typeof createCharacterContainer>`（10.3節の`{ root, modelContainer, currentModelUrl }`） | **`js/character.js`の`createCharacterContainer()`の戻り値そのもの**を指す。初期化時に1回だけ生成し、以後はこのオブジェクト自体を作り直さない（10.2節の契約）。3Dシーン上のキャラクター表示に関わる状態は全てこのオブジェクト（および内部の`modelContainer`の子要素）に閉じる。`main.js`の他の状態（`currentParams`等）とは明確に別物であり、`character`はあくまで「3Dシーン側のキャラクター表示ハンドル」だけを表す。 |
| `currentParams` | `GenerationParams`（9.1節） | 「現在フォームに反映されている、かつ直近に保存/生成の基準として扱う生成パラメータ」。初期化時は`loadFromStorage()`の`params`で初期化し、生成成功時・リセット時に更新する。`character`オブジェクトの中には含まれない、`main.js`側で独立管理する状態。 |
| `currentGeneratedModel` | `GeneratedModelInfo \| null`（9.2節） | 「直近に生成が成功した（またはロード済みの）モデルの参照情報」。`character.modelContainer`に実際に表示されているGLBに対応するメタ情報（`modelId`/`modelUrl`/`generatedAt`/`sourceParams`）を保持する。`null`の場合は未生成状態。`character`オブジェクトとは別変数であり、`character`は「表示ハンドル」、`currentGeneratedModel`は「表示中モデルの永続化対象メタ情報」という役割分担で一貫させる。 |
| `uiHandle` | `setupCustomizationUI()`の戻り値（12.3節） | フォームUIの操作ハンドル。状態そのものではないが、他の状態変数の変化をUIへ反映する際に常にこの変数経由で呼び出す。 |
| `controlsHandle` | `setupControls()`の戻り値 | v1から継続。`character.root`を内部的に参照するが、`controlsHandle`自体は`character`とは別変数。 |

**一貫性の原則（本節で確定する契約）**:
- 「3Dシーンに何が表示されているか」は常に`character`（特に`character.modelContainer`の中身、
  および内部プロパティ`character.currentModelUrl`）が真実を保持する。
- 「保存・復元の対象となるメタ情報」は常に`currentParams`・`currentGeneratedModel`が真実を
  保持する。この2変数の組が`storage.js`の`saveToStorage({ params, generatedModel })`へ
  そのまま渡される対応関係を、初期化・生成・保存・リセットの全フローで崩さない。
- `pollJobStatus`内で生成成功時に行う代入は`currentGeneratedModel = generatedModel;` /
  `currentParams = sourceParams;` の2つのみであり、`character`変数自体への再代入は行わない
  （`character`は`await loadCharacterModel(character, ...)`の呼び出しを通じて内部の
  `modelContainer`・`currentModelUrl`のみが更新される。13.5節参照）。

### 13.3 初期化処理フロー

```
DOMContentLoaded
  → isWebGLAvailable() チェック（v1同様。falseなら終了）
  → { params, generatedModel, restored } = loadFromStorage()
  → currentParams = params                 // 状態変数の初期化（13.2.1節）
  → currentGeneratedModel = generatedModel  // 状態変数の初期化（13.2.1節。ここが従来欠落していた箇所）
  → scene, camera, renderer 生成、光源追加（v1同様）
  → field = createField(); scene.add(field)
  → character = createCharacterContainer(); scene.add(character.root)
                                             // ここでcharacter変数を初期化（13.2.1節の通り
                                             // createCharacterContainer()の戻り値そのもの）
  → controlsHandle = setupControls(character, camera)   // character.rootのインターフェースは
                                                            // v1と同一のため、controls.js呼び出し
                                                            // 自体はほぼ変更なし
  → uiHandle = setupCustomizationUI(panelEl, currentParams, {
        onGenerate: (formParams) => handleGenerate(formParams),
        onSave: () => handleSave(),
        onReset: () => handleReset(),
    })
  → if (currentGeneratedModel) {
        uiHandle.setGeneratingState(true, 'モデルを読み込んでいます…');
        loadCharacterModel(character, currentGeneratedModel.modelUrl)
          // ↑ character・currentGeneratedModelとも13.2.1節で初期化済みの変数をそのまま使う
          .then(() => { uiHandle.setGeneratingState(false); uiHandle.setSaveButtonEnabled(true); })
          .catch((err) => {
            uiHandle.setGeneratingState(false);
            uiHandle.showError('保存済みモデルの読み込みに失敗しました。再度生成してください。');
            // 読み込み失敗時、currentGeneratedModelはあえてnullに戻さない
            // （7章の方針「表示中のキャラクターは変更しない」に準拠。次回保存操作時に
            // 誤って古い情報を上書きしないよう、保存ボタンはsetSaveButtonEnabled(true)を
            // 呼ばずfalseのまま維持する）
          });
     } else {
        showPlaceholder(character);
        uiHandle.setSaveButtonEnabled(false);
     }
  → 以降はv1同様: resize対応・requestAnimationFrameループ開始
```

### 13.4 `handleGenerate(formParams)` 処理フロー（新規・本v2の中核）

```
handleGenerate(formParams):
  1. uiHandle.clearError()
  2. uiHandle.clearGenerationNotice()   // 12.3節。前回のデモフォールバック注記が残っていれば消す
  3. uiHandle.setGeneratingState(true, '生成をリクエストしています…')
  4. const prompt = buildPrompt(formParams)   // js/params.jsから import
  5. try {
       const res = await fetch(`${PROXY_BASE_URL}/api/generate`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ ...formParams, prompt }),
       })
       const body = await res.json()
       if (res.status === 503 && body.fallback) {
         // APIキー未設定フォールバック（6.2節）
         uiHandle.showGenerationNotice('デモ用モデルを表示しています（実際のAI生成ではありません）')
         await pollJobStatus(body.fallback.jobId, formParams)
         return
       }
       if (!res.ok) {
         throw new Error(body.message || '生成リクエストに失敗しました。')
       }
       await pollJobStatus(body.jobId, formParams)
       // ↑ 本番生成が正常にsucceededした場合、pollJobStatus内部（13.5節）で
       //   uiHandle.clearGenerationNotice()を呼ぶため、直前にデモ表示だった場合でも
       //   注記は自動的にクリアされる
     } catch (err) {
       uiHandle.setGeneratingState(false)
       uiHandle.showError(err.message || 'サーバーに接続できませんでした。')
     }
```

- 上記の通り`await pollJobStatus(...)`は`try`ブロックの内側に位置し、`pollJobStatus`が
  reject（timeout/failed/リトライ上限超過）した場合も同じ`catch`節で捕捉される
  （`pollJobStatus`内で既に`showError`済みのケースが多いが、`catch`節の
  `uiHandle.showError(...)`は`err.message`が空でも安全にフォールバック文言を出すだけで
  二重表示にはならない設計とする。呼び出し元は`catch`されること自体を前提にreject理由を
  問わない）。

### 13.5 `pollJobStatus(jobId, sourceParams)` 処理フロー（新規）

```
pollJobStatus(jobId, sourceParams):
  const startTime = Date.now()
  let errorRetryCount = 0

  return new Promise((resolve, reject) => {
    async function poll() {
      if (Date.now() - startTime > GENERATION_TIMEOUT_MS) {
        uiHandle.setGeneratingState(false)
        uiHandle.showError('生成がタイムアウトしました。しばらくしてから再度お試しください。')
        return reject(new Error('timeout'))
      }
      try {
        const res = await fetch(`${PROXY_BASE_URL}/api/generate/${jobId}/status`)
        if (!res.ok) throw new Error('status fetch failed')
        const body = await res.json()
        errorRetryCount = 0  // 成功したのでリトライカウントをリセット

        if (body.status === 'succeeded') {
          uiHandle.setGeneratingState(true, 'モデルを読み込んでいます…')
          const generatedModel = {
            modelId: jobId,
            modelUrl: body.modelUrl,
            generatedAt: new Date().toISOString(),
            sourceParams,
          }
          await loadCharacterModel(character, generatedModel.modelUrl)
          // ↑ character変数（13.2.1節）自体は再代入しない。character.modelContainer/
          //   character.currentModelUrlのみがloadCharacterModel内部で更新される
          currentGeneratedModel = generatedModel   // main.js状態変数の更新（13.2.1節）
          currentParams = sourceParams              // 同上
          uiHandle.clearGenerationNotice()          // 本番生成成功時、残っていたデモ注記を消す
          uiHandle.setGeneratingState(false)
          uiHandle.setSaveButtonEnabled(true)
          return resolve()
        }
        if (body.status === 'failed') {
          uiHandle.setGeneratingState(false)
          uiHandle.showError(body.errorMessage || 'モデルの生成に失敗しました。')
          return reject(new Error('failed'))
        }
        // pending / in_progress
        uiHandle.setGeneratingState(true, `生成中…(${body.progress ?? 0}%)`)
        setTimeout(poll, POLL_INTERVAL_MS)
      } catch (err) {
        errorRetryCount += 1
        if (errorRetryCount > MAX_POLL_ERROR_RETRY) {
          uiHandle.setGeneratingState(false)
          uiHandle.showError('生成状況の確認に失敗しました。')
          return reject(err)
        }
        setTimeout(poll, POLL_INTERVAL_MS)  // リトライ
      }
    }
    poll()
  })
```

- 本関数が参照・更新する`character`・`currentGeneratedModel`・`currentParams`は、いずれも
  13.2.1節で定義した`main.js`トップレベルの状態変数であり、本関数内でこれら以外の
  新しい状態変数を作らない（一貫性の維持）。

### 13.6 `handleSave` / `handleReset`

```
handleSave():
  const result = saveToStorage({ params: currentParams, generatedModel: currentGeneratedModel })
  // 13.2.1節の対応関係の通り、currentParams/currentGeneratedModelの組をそのまま渡す
  結果に応じ保存状態表示を更新（v1の7.4節相当の文言表示。本v2でも継続）

handleReset():
  confirm()で確認
  確認されたら:
    disposeCurrentModel(character)  // 3Dシーンからモデルを除去（characterは再代入しない）
    showPlaceholder(character)
    currentParams = createDefaultParams()   // main.js状態変数の更新（13.2.1節）
    currentGeneratedModel = null             // 同上
    uiHandle.clearGenerationNotice()         // リセット時も注記が残らないようにクリア
    uiHandle.refreshUI(currentParams)
    uiHandle.setSaveButtonEnabled(false)
    clearStorage()
    保存状態表示を更新
```

### 13.7 毎フレーム処理（`animate`）

v1から変更なし（`controlsHandle.update(deltaTime)` → `renderer.render(scene, camera)`）。

---

## 14. `index.html` / `css/style.css` の具体的変更点

### 14.1 `index.html` 変更点

- `importmap`は3.2節の通り変更なし（既存のGLTFLoaderがカバーされるため追記不要）。
- カスタマイズパネル用コンテナ（`<aside id="customization-panel"></aside>`）自体は維持しつつ、
  `customization-ui.js`が動的に構築するDOM構造の中に以下の要素が新たに含まれる想定
  （静的HTMLとしては追記不要。JSが`innerHTML`で構築するため）:
  - `<div class="loading-indicator" hidden>...スピナー・進捗メッセージ...</div>`
  - `<div class="generation-error" hidden>...</div>`
  - `<div class="generation-notice" hidden>...</div>`（6.2節のデモモデル注記用）
- ヘッダーの`<span id="save-status"></span>`はv1のまま維持（保存状態表示は継続利用）。

### 14.2 `css/style.css` 変更点

- 追加するクラス（既存の`.panel-section`, `.control-row`等はそのまま流用）:
  - `.loading-indicator`: 生成中に表示。スピナー用の単純なCSSアニメーション
    （`@keyframes spin`で回転する円）＋進捗テキストを横並びで表示。
  - `.generation-error`: 赤系の背景色・文字色でエラーメッセージを目立たせる
    （例: `background: #fdecea; color: #b71c1c; padding: 8px; border-radius: 4px;`）。
  - `.generation-notice`: 6.2節のデモモデル注記用。エラーより控えめな配色
    （例: `background: #fff8e1; color: #8a6d00;`）。
  - `textarea#appearance-description`（容姿説明欄）と文字数カウンタ`.char-counter`のスタイル追加。
  - 「生成」ボタンが無効化中であることが視覚的に分かるよう、`button:disabled`のスタイル
    （`opacity: 0.6; cursor: not-allowed;`）を追加。

---

## 15. 後工程（実装・テスト）への申し送り事項

1. **Meshy AI実APIとの差異調整**: 1章の想定仕様は公式ドキュメント未確認のまま仮定したものである。
   実装時・実際にAPIキーを入手した段階で、`server/meshyClient.js`のエンドポイントURL・
   リクエスト/レスポンス構造・認証ヘッダ形式を公式ドキュメントと照合し、差異があれば
   同ファイルのみを修正すること（プロキシの外部インターフェースは変更しない）。
2. **モック/スタブ前提のテスト方針**: 実APIキーが無い前提のため、テスト仕様書作成時は
   `server/meshyClient.js`をモック化する（例: テスト用に`createTextTo3DJob`/
   `getTextTo3DJobStatus`をスタブ実装に差し替えられるよう、依存注入または環境変数
   `MESHY_MOCK_MODE=true`的なテスト用フラグの導入を検討してよい）。6.2節の
   「APIキー未設定時のデモフォールバック」経路は、実APIキー無しでも一気通貫の動作確認が
   可能な経路として積極的に活用すること。
3. **正面向き補正値の実測**: 8.2節の`MESHY_MODEL_FRONT_CORRECTION_Y`は初期値0（無補正）としている。
   実際にAPIキーを使ってMeshy生成物を確認できるタイミングで、正面向きの傾向を実測し、
   必要なら定数値を更新すること。モデルごとに向きがバラバラで固定値による一律補正が
   通用しないと判明した場合は、設計判断の再エスカレーションが必要な旨、8.2節に明記済み。
4. **ダミーGLB URLの継続性確認**: 6.2節で採用したjsDelivr経由のThree.js公式サンプルGLB URLは、
   Three.jsのバージョンタグ（`@r160`）に依存する。将来Three.jsバージョンを更新する場合、
   このURLも合わせて動作確認すること。
5. **重量モデルへの対処は本リニューアルのスコープ外**: 7章の通り、極端に重いモデルへの
   自動検知・軽量化処理は実装しない。テスト仕様書作成時も、通常サイズのGLB（数MB程度）での
   動作確認に留めてよい。
6. **プロンプトの言語**: 11.3節の`buildPrompt`は英語の固定フレーズ＋日本語自由記述という
   混在プロンプトを採用している。実際の生成品質次第では全て日本語、または全て英語への
   統一が望ましい可能性があり、実装後の生成確認結果を踏まえて調整の余地がある旨を申し送る。
7. **プロキシサーバーのローカル起動手順の周知**: `server/`配下は`npm install && npm start`で
   起動する新規プロセスであり、フロントエンド（ブラウザ）とは別途起動が必要である。
   README等（本書の範囲外だが実装時に追記が望ましい）にその旨を明記すること。
8. **`.env`ファイルの扱い**: `server/.env`（実際のAPIキーを含む）は`.gitignore`に追加し、
   コミットしないこと。`server/.env.example`のみをリポジトリに含める。

---

## 16. 基本設計からの変更点・開発リーダーへの申し送り

以下は基本設計書v2には明記されていなかった、または解釈の余地があった点について、
詳細設計として独自に確定させた事項である。仕様の大枠を変更するものではないが、
念のため開発リーダー係へ報告する。

1. **Meshy AI想定APIの具体仕様（1章）**: 公式ドキュメントを閲覧できない制約下で、
   一般的なText-to-3D APIパターンからの「想定仕様」として具体的なエンドポイント・
   JSON構造を確定させた。基本設計書v2 9章の指示通りの対応であり、矛盾ではないが、
   実装時に実APIとの差異調整が必要になる可能性がある点を改めて強調して報告する。
2. **プロンプト組み立てロジックの置き場所（2章）**: `params.js`に含める方針とした
   （基本設計書v2 9章で「詳細設計側で決定すること」とされていた事項への回答）。
3. **APIキー未設定時のフォールバック方式（6章）**: 「エラー表示」ではなく
   「デモ用ダミーGLB表示」を採用し、Three.js公式サンプルの既知GLB（Duck.glb）の
   公開URLを流用する方式とした。基本設計書v2 9章で「どちらにするか確定すること」と
   されていた事項への回答であり、選定した具体策（既存の公開アセットの流用）は
   基本設計書には明記されていなかった追加判断のため報告する。
4. **`localStorage`キー名の変更（9.3節）**: v1の`"3d-character-creator:params"`から
   `"3d-character-creator:v2:generation"`に変更した。基本設計書v2 6.3節の「バージョン
   非互換時は無視して未生成状態から開始する」という方針とは矛盾しないが、キー名自体を
   変えることで自然にv1データを無視する設計としたため、キー名の具体値として報告する。
5. **`character.root`直下に`modelContainer`を新設（8章・10章）**: 基本設計書v2では
   `character.root`の維持のみが明記されていたが、正面向き補正・モデルサイズ正規化の
   実装場所として`character.root`の直接の子に`modelContainer`という中間ノードを追加した。
   `controls.js`が操作する`character.root`自体のインターフェース契約は変更していないため
   矛盾ではないが、`character.js`内部構造の追加判断として報告する。
6. **`customization-ui.js`のハンドラ引数をオブジェクト化（12.3節）**: v1の位置引数方式
   （`onChange, onSave, onReset`）から、本v2では`onGenerate`が加わり引数が増えるため
   オブジェクト方式（`{ onGenerate, onSave, onReset }`）に変更した。基本設計書には
   引数形式の指定は無く、実装上の可読性向上のための判断である。
7. **「保存」ボタンの活性化条件（12.5節）**: 生成完了後（`generatedModel`が存在する場合）
   のみ有効化する方針とした。基本設計書v2 4章で「詳細設計で確定する」とされていた事項への
   回答である。
8. **ENUM_LABELS（選択肢の日本語表示ラベル）をUIファイルではなくparams.jsに集約（11.2節）**:
   v1では`customization-ui.js`内にラベル定義があったが、本v2ではパラメータ定義と
   UIラベルの一貫性を重視し`params.js`に統合した。軽微な構成判断のため報告する。
9. **`gender`の選択肢に`"unspecified"`（指定しない）を追加（9.1節）**: 基本設計書v2の
   データ構造イメージ（6.1節）では`"female"|"male"`のみが例示されていたが、
   「指定しない」という選択肢もAI生成の性質上自然と判断し追加した。基本設計の例示を
   拡張する変更のため報告する。

上記9点について、開発リーダー係の確認・承認を得た上でコーディング係への着手指示を行うこと。
