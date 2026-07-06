# 3Dキャラクタークリエイター リニューアル版（AI 3Dモデル生成方式）v2 テスト仕様書

## 0. 本書の位置づけ・前提

- 対象: `3d-character-creator/` 配下のv2実装一式
  - フロントエンド: `index.html`, `css/style.css`, `js/character.js`, `js/params.js`, `js/customization-ui.js`, `js/storage.js`, `js/main.js`, `js/field.js`（無改修流用）, `js/controls.js`（無改修流用）
  - プロキシサーバー: `server/index.js`, `server/meshyClient.js`, `server/routes/generate.js`, `server/package.json`, `server/.env.example`
- 参照元:
  - `docs/basic_design_v2.md`（承認済み基本設計書v2）
  - `docs/detail_design_v2.md`（承認済み詳細設計書v2、全1313行）
  - 上記実装ファイル一式（実際に読み込み済み）
- 既存の`docs/test_spec.md`（v1・MVP版テスト仕様書）は本書の対象外。v1はプリミティブ組み立て方式向けであり、本書はv2（AI生成方式）専用として新規作成する。両者を混同しないこと。
- 既存の自動テストコード（`test_pdf_editor.py`）は別プロジェクト（PDF編集ツール）向けであり、本アプリとは無関係。本アプリ向けの既存自動テストは無い。

### 0.1 最重要前提: 実APIキー無しでのテスト方針

- **実際のMeshy AI APIキーは提供されていない。** 本書のテストは全て「`MESHY_API_KEYが未設定の場合のフォールバック動作（デモ用ダミーGLBによる疑似生成フロー）」を主軸に据える。
- 実Meshy AI APIとの疎通確認（実キーを使ったジョブ作成・ポーリング・実際の人物モデル生成物の確認）は**本書のテスト対象外**とする。`server/meshyClient.js`の`createTextTo3DJob`/`getTextTo3DJobStatus`が実際のMeshyエンドポイントへ到達した場合の挙動（1章想定仕様との整合性）は、実キー入手後の別途の確認事項として申し送る（詳細設計書v2 15章2項に対応）。
- そのため、フロントエンド〜プロキシ間の疎通・バリデーション・エラーハンドリング・UI状態遷移は、**APIキー未設定状態**（`.env`未作成、または`MESHY_API_KEY=`が空）で一貫して確認する。
- プロキシサーバーのユニット的な確認（バリデーション・フォールバック応答）は`curl`等でのAPI直接呼び出しで検証する（4章参照）。

### 0.2 テスト環境・起動手順

1. **プロキシサーバー**:
   - `3d-character-creator/server/` で `npm install` を実行（初回のみ）。
   - `MESHY_API_KEY`を設定しない状態（`.env`ファイルを作成しない、または`server/.env`に`MESHY_API_KEY=`のみを記載）で `npm start`（内部的に`node index.js`）を実行し、`http://localhost:3001`で起動する。
   - 起動ログに`3d-character-creator proxy server listening on port 3001`が出ること、`http://localhost:3001/health`が`{"ok":true}`を返すことを疎通確認する。
2. **フロントエンド**:
   - `type="module"`のCORS制約のため、`file://`直開きではなく簡易HTTPサーバー経由で開く。`3d-character-creator/`をカレントディレクトリとして`python -m http.server 8000`等を実行し、`http://localhost:8000/index.html`にアクセスする。
   - プロキシサーバー（`localhost:3001`）と静的ファイルサーバー（`localhost:8000`）は別オリジンだが、`server/index.js`が`cors()`で許可済みのため通信できる。
3. **クリーン状態の作り方**: 各テストケース実施前、特記が無い限り以下を実施する。
   - DevTools Console で `localStorage.removeItem('3d-character-creator:v2:generation')` を実行、またはブラウザのサイトデータを削除。
   - v1データが残っている場合の確認をしたいケース（E-4）を除き、v1キー`3d-character-creator:params`が残存していても影響しない（9.4節・E-4で個別確認）。
   - ページをリロードする。
4. ブラウザ: 最新のGoogle Chrome または Microsoft Edge（Windows）。
5. ネットワークタブ（DevTools）を併用し、`fetch`のリクエスト/レスポンスを都度確認できる状態にしておくことを推奨する。

### 0.3 用語

- 「デモフォールバック」= `MESHY_API_KEY`未設定時、`POST /api/generate`が`503`＋`fallback.jobId: "demo-fallback"`を返し、`GET /api/generate/demo-fallback/status`が即座にダミーGLB（Duck.glb）のURLを返す一連の代替生成フロー（基本設計書v2 6.2節・詳細設計書v2 6章）。
- 「ダミーGLB」= 実装では`https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@main/2.0/Duck/glTF-Binary/Duck.glb`（Khronosグループ配布のDuck.glb）。**注意**: 詳細設計書v2 6.2節に記載のURL（`mrdoob/three.js`経由）とは異なり、実装時にjsDelivrのGitHub CDNモードのサイズ上限超過により404となることが判明したため、`server/routes/generate.js`内のコメントに明記の上でKhronosグループ配布元のURLに差し替え済み。テストはこの実装済みURLを正とする。
- `character.root` / `modelContainer` = `js/character.js`が管理する2階層のTHREE.Group構造。`controls.js`は`character.root`のみを操作し、GLB本体・正面補正は`modelContainer`配下に閉じる。
- `_loadToken` = `character.js`内部のレースコンディション対策用カウンタ。ロード開始ごとにインクリメントされ、トークンが不一致の古い結果は無視される。

---

## 1. テスト観点分類

| No | 観点 | 概要 |
|---|---|---|
| A | 初期表示・起動 | WebGL対応環境での起動、初期状態（未生成/復元）の表示確認 |
| B | 生成パラメータ入力・クライアントバリデーション | フォーム入力・500文字バリデーション・プロンプト組み立て |
| C | 生成フロー（デモフォールバック正常系） | 生成ボタン押下→デモ注記表示→ポーリング→ダミーGLB表示までの一連の流れ |
| D | GLBロード処理の重点確認（レビュー指摘反映） | ロード失敗時の表示維持、タイムアウト後の遅延ロード結果の無視（`_loadToken`）、スケール/位置補正、dispose処理 |
| E | `showGenerationNotice`/`clearGenerationNotice`の対称性 | デモ注記の表示・クリアタイミングの正しさ |
| F | データ永続化（localStorage） | 保存・復元、バージョン非互換時の扱い、v1データ残存時の扱い |
| G | 移動操作・カメラ追従（既存流用機能のデグレ確認） | WASD/矢印キー移動、範囲クランプ、三人称追従カメラがGLBキャラクターに対しても機能すること |
| H | プロキシサーバー単体（バリデーション・エラー処理） | `curl`等によるAPI単体テスト。バリデーションエラー、APIキー未設定時応答、想定外リクエストへの耐性 |
| I | UI状態遷移・ボタン活性制御 | 生成中/生成失敗/保存可否に応じたボタン活性・非活性の一貫性 |
| J | 異常系・エラーハンドリング全般 | プロキシ未起動、WebGL非対応、ネットワーク断、リトライ上限 |
| K | 既存機能・他プロジェクトへの影響確認（デグレ観点） | `field.js`/`controls.js`の無改修確認、他プロジェクト（PDF編集ツール）ファイルの無変更確認 |

---

## 2. テストケース一覧

凡例: 重要度 ★★★=重点確認項目（コードレビューで指摘・修正された箇所を含む）、★★=通常、★=軽微

### A. 初期表示・起動

#### A-1 初期表示（未生成状態） ★★★

- 目的: 保存データが無い状態での初回起動時、正しい未生成状態のUIが表示されることを確認する。
- 前提条件: `localStorage`をクリア済み。プロキシサーバーは未起動でもよい（生成ボタンを押さない限り通信は発生しない）。
- 手順:
  1. `http://localhost:8000/index.html`を開く。
  2. 画面全体を目視確認する。
- 期待結果:
  - ヘッダーにタイトルと保存状態表示（`#save-status`）が表示され、テキストは「デフォルト設定で開始しました」。
  - 3Dキャンバスに空色背景・緑の地面・グリッドが表示され、キャラクターモデルは表示されない（`modelContainer`が空のまま。10.5節の方針通りプレースホルダー形状も表示されない）。
  - カスタマイズパネルに「性別」「雰囲気」「体型傾向」「容姿の説明」の入力欄、「生成」ボタン（活性）、「保存」ボタン（**非活性**）、「リセット」ボタン（活性）が表示される。
  - フォーム初期値: 性別=指定しない、雰囲気=明るい、体型傾向=標準、容姿の説明=空欄（`createDefaultParams()`と一致）。
  - ローディング表示・エラー表示・デモ注記表示はいずれも非表示（`hidden`）。
  - フッターに操作説明文が表示される。
  - DevTools ConsoleにJSエラーが出ていないこと。

#### A-2 WebGL非対応環境での起動 ★

- 目的: WebGL非対応環境で分かりやすいエラーメッセージが表示され、以降の初期化処理が実行されないことを確認する。
- 手順: DevTools Consoleで`HTMLCanvasElement.prototype.getContext`を一時的に上書きし`webgl`/`webgl2`双方が`null`を返すようにしてからページをリロードする（`isWebGLAvailable()`が`false`を返す状況を疑似的に再現）。
- 期待結果:
  - `#canvas-container`内に「お使いのブラウザ/環境では3D表示に対応していません。最新のChromeまたはEdgeでお試しください。」のメッセージが表示される。
  - カスタマイズパネルの構築・`fetch`呼び出し等それ以降の初期化処理が実行されない（`init()`が早期return）。
  - Console に `WebGL is not available in this environment.` のエラーログが出力される。

---

### B. 生成パラメータ入力・クライアントバリデーション

#### B-1 各セレクトのデフォルト値・選択肢確認 ★

- 目的: `ENUM_OPTIONS`/`ENUM_LABELS`（`params.js`）通りの選択肢がUIに反映されていることを確認する。
- 手順: 性別・雰囲気・体型傾向の各セレクトのオプション一覧を確認する。
- 期待結果:
  - 性別: 女性(female) / 男性(male) / 指定しない(unspecified)。デフォルト選択は「指定しない」。
  - 雰囲気: 明るい(bright) / クール(cool) / かわいい(cute) / 大人っぽい(mature)。デフォルト選択は「明るい」。
  - 体型傾向: スリム(slim) / 標準(average) / がっしり(muscular)。デフォルト選択は「標準」。

#### B-2 容姿説明の文字数カウンタ表示 ★

- 目的: `textarea`への入力に応じて文字数カウンタ（`x / 500`）がリアルタイム更新されることを確認する。
- 手順: 「容姿の説明」欄に任意の文字列（例: 10文字）を入力する。
- 期待結果: カウンタ表示が`10 / 500`に更新される。

#### B-3 容姿説明500文字ちょうど（境界値・正常） ★★

- 目的: 500文字ちょうどの入力が許容されることを確認する。
- 手順: `textarea`に500文字の文字列を入力する（`maxLength=500`属性があるため、貼り付け等でも501文字目以降は入力できない前提だが、DevTools Consoleから`value`を直接操作して確認してもよい）。
- 期待結果:
  - カウンタが`500 / 500`と表示される。
  - `validateAppearanceDescription()`は`{ ok: true }`を返し、エラー表示は出ない（`params.js`のロジックは`length > 500`のみをNGとするため、500文字ちょうどはOK）。

#### B-4 容姿説明501文字（境界値・異常、DOM制約回避時） ★★

- 目的: `textarea.maxLength=500`のブラウザ制約を回避して501文字が渡った場合でも、`validateAppearanceDescription`がNGと判定しエラー表示することを確認する。
- 手順: DevTools Consoleで`document.getElementById('appearance-description').value = 'あ'.repeat(501)`を実行後、`input`イベントを発火させる（`el.dispatchEvent(new Event('input'))`）。
- 期待結果:
  - エラー表示領域（`.generation-error`）に「容姿の説明は500文字以内で入力してください。」が表示される。
  - この状態で「生成」ボタンを押しても`validateAppearanceDescription`が再度NGと判定し、`handlers.onGenerate`は呼ばれない（`showError`のみ再表示され、プロキシへのリクエストは発生しない）。

#### B-5 容姿説明が空欄でも生成可能（任意項目の確認） ★

- 目的: `appearanceDescription`が任意項目であり、空欄でも生成リクエストが可能なことを確認する。
- 手順: 容姿説明欄を空欄のまま「生成」ボタンを押す（プロキシサーバーは起動しておく）。
- 期待結果: バリデーションエラーが出ず、`handlers.onGenerate`が呼ばれ、`POST /api/generate`が送信される（C章の生成フローへ進む）。

#### B-6 `buildPrompt`のプロンプト組み立て内容確認 ★

- 目的: フォーム入力から組み立てられるプロンプト文字列が仕様通りであることを確認する。
- 手順: DevTools Consoleで`import('./js/params.js').then(m => console.log(m.buildPrompt({version:2, gender:'female', mood:'cute', bodyType:'slim', appearanceDescription:'黒髪ロング'})))`のようにモジュールを直接呼び出す（もしくはNetworkタブで実際の`POST /api/generate`の`prompt`フィールドを確認する）。
- 期待結果: `"A photorealistic 3D character model of a woman with a cute and friendly expression , slim build . Appearance details: 黒髪ロング . Full body, T-pose, realistic proportions, high quality."`の空白正規化後の文字列（`replace(/\s+/g, ' ').trim()`適用済み）が得られる。

---

### C. 生成フロー（デモフォールバック正常系）

#### C-1 生成ボタン押下からダミーGLB表示までの一連の流れ ★★★

- 目的: APIキー未設定環境で、生成ボタン押下からデモ用ダミーGLB（Duck.glb）が表示されるまでの一連のUX・通信フローが仕様通りに動作することを確認する。
- 前提条件: プロキシサーバー起動済み・`MESHY_API_KEY`未設定。`localStorage`クリア済み。
- 手順:
  1. 任意のパラメータ（例: 性別=女性、雰囲気=明るい、体型傾向=標準、容姿説明=任意）を入力し「生成」ボタンを押す。
  2. Networkタブと画面表示を観察する。
- 期待結果:
  1. 押下直後: 「生成」ボタンが非活性化し、ローディング表示（スピナー＋「生成をリクエストしています…」）が表示される。
  2. `POST http://localhost:3001/api/generate`が送信され、レスポンスは`503`＋`{ error: "API_KEY_NOT_CONFIGURED", fallback: { jobId: "demo-fallback", immediate: true } }`。
  3. デモ注記領域（`.generation-notice`）に「デモ用モデルを表示しています（実際のAI生成ではありません）」が表示される。
  4. 続けて`GET http://localhost:3001/api/generate/demo-fallback/status`が呼ばれ、`200`＋`{ status: "succeeded", progress: 100, modelUrl: "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@main/2.0/Duck/glTF-Binary/Duck.glb", errorMessage: null }`が返る。
  5. ローディング表示のテキストが「モデルを読み込んでいます…」に変わる。
  6. GLBロード成功後、3Dキャンバス上にアヒル（Duck）モデルが地面上に表示される。
  7. ローディング表示が消え、「生成」ボタンが再度活性化する。
  8. 「保存」ボタンが活性化する。
  9. デモ注記（`.generation-notice`）は**表示されたまま**である（実生成が成功していないため、E章の通りこの時点ではまだクリアされない。次回生成時にクリアされる。E-2参照）。
  10. エラー表示は出ない。

#### C-2 生成完了後のモデルの見た目の妥当性確認 ★

- 目的: ロードされたダミーGLBが地面にめり込まず、高さがおおむね正規化されていることを確認する。
- 手順: C-1完了後、3Dキャンバス上のモデルの位置・大きさを目視確認する。
- 期待結果: モデルの底面が地面（y=0付近）に接しており、極端に地面にめり込む・宙に浮く状態になっていない（`character.js`の`postScaleBox.min.y`補正が機能している）。モデル高さが`MODEL_TARGET_HEIGHT=1.7`相当に正規化され、極端に巨大/極小で表示されない。

#### C-3 生成中の「生成」ボタン多重クリック防止 ★★

- 目的: 生成中に再度「生成」ボタンを押せない（多重リクエストが発行されない）ことを確認する。
- 手順: C-1の手順1直後（ローディング表示中）に、再度「生成」ボタンをクリックしようと試みる。
- 期待結果: ボタンは`disabled`状態のためクリックイベントが発生せず、`POST /api/generate`が二重に送信されない（Networkタブで1回のみのリクエストであることを確認）。

#### C-4 進捗表示テキストの更新確認（`in_progress`状態） ★

- 目的: ポーリング中の進捗テキスト表示が更新されることを確認する。
- 前提条件: このケースのみ、`server/routes/generate.js`の`/:jobId/status`エンドポイントを一時的に改変（またはモック用のスタブサーバーを別途用意）し、1〜2回目は`{status:"in_progress", progress:45}`、3回目以降に`succeeded`を返すようにして確認する。実装は本番用途では常に即時`succeeded`を返すため、テスト用に一時的な差し替えが必要な旨を明記する。
- 期待結果: ローディング表示のテキストが「生成中…(45%)」のように`progress`値を反映して更新される。

---

### D. GLBロード処理の重点確認（コードレビュー指摘反映・最重要）

#### D-1 GLBロード失敗時に表示中のキャラクターが変更されない ★★★

- 目的: 一度目の生成が成功して表示された後、二度目のロードが失敗した場合に、直前の表示状態が維持されることを確認する（`loadCharacterModel`はロード成功後に初めて`disposeCurrentModel`→差し替えを行う設計）。
- 前提条件: C-1を実施しダミーGLB（Duck）が表示済みの状態。
- 手順:
  1. DevTools Consoleで、次回のロードが失敗するように細工する。具体的には、`character.js`の`loadCharacterModel`を直接呼び出し、存在しない/到達不能なURL（例: `https://example.invalid/notfound.glb`）を渡す:
     `import('./js/character.js').then(m => window.__character && m.loadCharacterModel(window.__character, 'https://example.invalid/notfound.glb').catch(e => console.log('caught:', e.message)))`
     （`main.js`が`character`をモジュール内スコープに保持し外部公開していない場合は、`main.js`側に一時的なデバッグ用`window.__character = character;`を追加する等、テスト実施係が実施可能な代替手段を用いる。もしくは`main.js`の`handleGenerate`を経由させ、`server/routes/generate.js`の`modelUrl`を一時的に不正な値に差し替えて確認する）。
  2. コンソール・画面を確認する。
- 期待結果:
  - Promiseが`reject`され、コンソールに「GLBのロードに失敗しました: ...」のエラーメッセージが出力される。
  - **3Dキャンバス上には直前に表示されていたDuckモデルがそのまま表示され続ける**（消えたり、空になったりしない）。
  - `character.currentModelUrl`は失敗したURLに更新されず、直前の成功時のURLのままである。

#### D-2 初回（未生成状態）でのGLBロード失敗時、未生成状態が維持される ★★★

- 目的: まだ一度もモデルが表示されていない状態でロードが失敗した場合、何も表示されない状態（未生成状態）が維持されることを確認する。
- 前提条件: `localStorage`クリア済み・起動直後（A-1の状態）。
- 手順: D-1と同様の方法で、初回の生成リクエストのGLB URLを不正な値に差し替えてロードさせる。
- 期待結果:
  - Promiseが`reject`され、エラーメッセージ「モデルの読み込みに失敗しました。」相当がパネルに表示される（`main.js`の`init()`内catchの文言、または`handleGenerate`経由のエラー処理文言）。
  - 3Dキャンバスにはモデルが表示されない（未生成状態のまま。何もdisposeされるものが無いため見た目上変化なし）。

#### D-3 タイムアウト後に遅延してロードが成功しても表示に反映されない（`_loadToken`レースコンディション対策） ★★★

- 目的: `GLB_LOAD_TIMEOUT_MS=30000`でタイムアウトpromiseがrejectされた**後**に、元のGLTFLoaderのロードが遅れて成功しても、その結果が`modelContainer`へ反映されないことを確認する。
- 手順:
  1. DevTools Consoleで、ネットワークタブの「スロットリング」機能を使い「Slow 3G」等、非常に遅い回線をシミュレートする。
  2. `loadCharacterModel(character, <サイズのある任意の有効なGLB URL>)`を直接呼び出す（例えば実装で使われているDuck.glb自体でもタイムアウトを起こしたい場合は、DevToolsでのリクエストブロック＋一定時間後の解除など、意図的に30秒より長く遅延させる手段を用いる）。
  3. 30秒経過し「モデルの読み込みがタイムアウトしました」のrejectを確認した後も、そのままロードを継続させておく（キャンセルしない）。
  4. さらに待ち、元のリクエストが（遅れて）成功したタイミングでの画面・`character.currentModelUrl`・`modelContainer.children`を確認する。
- 期待結果:
  - 30秒経過時点で`reject(new Error('モデルの読み込みがタイムアウトしました'))`が発生し、`_loadToken`がタイムアウト処理内でインクリメントされる。
  - その後、元のGLTFLoaderの`onLoad`コールバックが遅れて呼ばれても、`character._loadToken !== myToken`となるため**何も反映されない**（`disposeCurrentModel`も`modelContainer.add`も呼ばれない）。
  - 画面上のキャラクター表示は、タイムアウト発生前の状態（未生成なら未生成のまま、既存モデル表示中ならそのモデルのまま）が維持される。
  - `character.currentModelUrl`もタイムアウトしたURLに更新されない。

#### D-4 同一URLへの再ロード要求はスキップされる ★

- 目的: 既に表示中のモデルと同一の`modelUrl`が再度渡された場合、無駄な再ロード処理（dispose→再GLTFLoad）が行われず即座に`resolve`されることを確認する。
- 前提条件: C-1完了後、`character.currentModelUrl`がDuck.glbのURLになっている状態。
- 手順: DevTools Consoleで同一URLを引数に`loadCharacterModel(character, <同じmodelUrl>)`を呼び出す。
- 期待結果: GLTFLoaderへの新規リクエストが発生せず（Networkタブに新規リクエストが出ない）、即座にPromiseが`resolve`される。

#### D-5 モデル差し替え時のdispose処理（メモリリーク防止） ★★

- 目的: 二回目以降の生成でモデルが差し替わる際、旧モデルのgeometry/material/textureが`dispose()`されることを確認する。
- 手順:
  1. C-1で1回目の生成を行いDuckモデルを表示する。
  2. 別パラメータで再度「生成」ボタンを押し、2回目の生成（同じくデモフォールバック、同一のDuck.glb URLが返る）を行う。
- 期待結果:
  - D-4の通り、2回目もURLが同一（`demo-fallback`は常に同じ`modelUrl`を返すため）であれば再ロードはスキップされる。**この挙動自体が仕様通りであることを確認する**（バグではない）。
  - 異なるGLB URLでの差し替えを確認したい場合は、D-1のテスト手法（`loadCharacterModel`直接呼び出し）で、1回目に有効なURL A、2回目に有効なURL Bを渡し、2回目のロード成功時に1回目のシーンオブジェクトの`geometry.dispose`/`material.dispose`が呼ばれていることを、Three.jsオブジェクトに一時的にスパイを仕込む（`const origDispose = THREE.BufferGeometry.prototype.dispose; THREE.BufferGeometry.prototype.dispose = function(){ console.log('geometry disposed'); origDispose.call(this); };`）等の方法で確認する。
  - `character.js`の`disposeCurrentModel`はgeometryだけでなくmaterial・テクスチャのdisposeも行う実装（`mat.dispose()`、および`material`の`map`/`normalMap`/`roughnessMap`/`metalnessMap`/`emissiveMap`/`aoMap`各プロパティが存在すればそれぞれ`.dispose()`）であるため、上記のgeometryスパイに加えて、以下のようにmaterial側・代表的なテクスチャ側にもスパイを仕込み、差し替え時にそれぞれ呼ばれることを確認する。
    ```js
    const origMatDispose = THREE.Material.prototype.dispose;
    THREE.Material.prototype.dispose = function () { console.log('material disposed'); origMatDispose.call(this); };
    const origTexDispose = THREE.Texture.prototype.dispose;
    THREE.Texture.prototype.dispose = function () { console.log('texture disposed:', this.name || '(no name)'); origTexDispose.call(this); };
    ```
    2回目のロード成功時（旧モデルが差し替えられるタイミング）に、コンソールへ`material disposed`のログ、および旧モデルのマテリアルが`map`等のテクスチャを保持していた場合は`texture disposed`のログが出力されることを確認する（Duck.glbは`map`テクスチャを持つため、少なくとも`map`のdisposeログが確認できるはずである。`normalMap`等その他のテクスチャはDuck.glbには含まれないため出力されなくてよい）。
  - `modelContainer.children.length`が常に1以下に保たれる（旧モデルが`remove`されずに複数残ることがない）。

#### D-6 スケール0除算防止（極端に平坦なGLBの境界値） ★

- 目的: バウンディングボックスの高さ（`size.y`）が0のGLB（理論上のエッジケース）でも`scaleFactor`計算が`NaN`/`Infinity`にならないことを確認する。
- 手順: コード確認（`character.js`内`scaleFactor = preScaleSize.y > 0 ? MODEL_TARGET_HEIGHT / preScaleSize.y : 1;`）に基づき、`size.y === 0`となるような特殊GLB（用意できない場合はコードレビューでのロジック確認のみで代替可）を用いてロードする。
- 期待結果: `size.y <= 0`の場合`scaleFactor`が`1`にフォールバックし、`NaN`によるモデル消失・エラーが発生しない。

---

### E. `showGenerationNotice`/`clearGenerationNotice`の対称性

#### E-1 デモ注記がリセット時にクリアされる ★★

- 目的: デモ注記表示中に「リセット」ボタンを押した場合、注記が消えることを確認する。
- 前提条件: C-1完了後（デモ注記が表示されたまま残っている状態）。
- 手順: 「リセット」ボタンを押し、確認ダイアログでOKを選択する。
- 期待結果: `handleReset()`内の`uiHandle.clearGenerationNotice()`呼び出しにより、デモ注記領域が非表示に戻る。3Dキャンバスも未生成状態に戻る。

#### E-2 次回生成リクエスト開始時に前回のデモ注記がクリアされる ★★★

- 目的: 前回デモフォールバックで生成した後、続けて次の生成をリクエストした際、`handleGenerate`冒頭の`clearGenerationNotice()`により一旦注記が消えることを確認する。
- 前提条件: C-1完了（デモ注記表示中）。
- 手順: パラメータを変更し再度「生成」ボタンを押す。ボタン押下**直後**（`POST /api/generate`のレスポンスが返る前）の一瞬の画面状態を確認する（低速回線シミュレーションで観察しやすくする）。
- 期待結果: ボタン押下直後、デモ注記が一旦非表示になる。その後、レスポンスが再び`503`＋フォールバックであれば、`showGenerationNotice`が再度呼ばれ注記が再表示される（表示され続けているように見えるが、内部的には一度クリアされて再表示されている）。

#### E-3 本番生成成功相当のケースでデモ注記が残らないことの確認（擬似確認） ★★★

- 目的: 詳細設計書v2 12.3節の重要な指摘「デモ表示後、本番生成が成功しても注記が残り続けるバグ」を防ぐための`pollJobStatus`内`clearGenerationNotice()`呼び出しが機能することを確認する。実キーが無いため実際の「本番生成成功」は再現できないが、`jobId !== "demo-fallback"`の成功パスを疑似的に再現して確認する。
- 手順:
  1. `server/routes/generate.js`の`/:jobId/status`を一時的に改変し、`demo-fallback`以外の任意の`jobId`（例: `test-job-1`）に対しても即座に`{status:"succeeded", modelUrl: <ダミーGLB URL>}`を返すようにする（テスト用の一時的なスタブ化）。
  2. DevTools ConsoleでC-1と同様にデモ注記が出ている状態を作った後、`main.js`内部の`pollJobStatus('test-job-1', currentParamsに相当するオブジェクト)`を直接呼び出す（`main.js`がモジュールスコープ関数を外部公開していない場合、テスト実施係は一時的なデバッグエクスポートを追加してよい）。
- 期待結果: `succeeded`到達時点で`uiHandle.clearGenerationNotice()`が呼ばれ、注記が非表示になる。

#### E-4 エラー表示とデモ注記の独立性 ★

- 目的: `showError`/`clearError`と`showGenerationNotice`/`clearGenerationNotice`が別々のDOM要素・状態であり、一方の表示/非表示がもう一方に影響しないことを確認する。
- 手順: デモ注記表示中に、意図的にエラーを発生させる（例: D-1の手法でロード失敗を誘発）。
- 期待結果: エラー表示領域（`.generation-error`）にエラーメッセージが出る一方、デモ注記領域（`.generation-notice`）の表示状態はそのまま変化しない（お互いに干渉しない）。

---

### F. データ永続化（localStorage）

#### F-1 保存・リロード復元（正常系） ★★★

- 目的: 生成完了後に「保存」ボタンを押し、リロード後に同じキャラクター・パラメータが復元されることを確認する。
- 前提条件: C-1完了（Duckモデル表示・「保存」ボタン活性化済み）。
- 手順:
  1. 「保存」ボタンを押す。
  2. ヘッダーの保存状態表示が「保存しました（HH:MM:SS）」になることを確認する。
  3. DevTools Consoleで`localStorage.getItem('3d-character-creator:v2:generation')`の内容を確認する。
  4. ページをリロードする。
- 期待結果:
  - 手順3: `{"version":2,"params":{...},"generatedModel":{"modelId":"demo-fallback","modelUrl":"https://cdn.jsdelivr.net/.../Duck.glb","generatedAt":"...","sourceParams":{...}}}`の構造で保存されている。
  - 手順4後: 保存状態表示が「保存済みのキャラクターを復元しました」になる。
  - ローディング表示が一瞬「モデルを読み込んでいます…」と出た後、Duckモデルが再表示される（`init()`内の`loadCharacterModel(character, currentGeneratedModel.modelUrl)`経由）。
  - フォームの各項目（性別・雰囲気・体型傾向・容姿説明）が保存時の値で復元される。
  - 「保存」ボタンが復元完了後に活性化される。

#### F-2 未生成状態での「保存」ボタン非活性の確認 ★★

- 目的: 生成完了前は「保存」ボタンが押せないことを確認する（12.5節の確定仕様）。
- 手順: A-1の未生成状態で「保存」ボタンの`disabled`属性を確認する。
- 期待結果: `disabled=true`であり、クリックしても`handleSave()`が呼ばれない。

#### F-3 リセット時のフォーム・3D表示・localStorageの初期化 ★★

- 目的: 「リセット」ボタン押下でフォーム・3D表示・保存データが全て初期状態に戻ることを確認する。
- 前提条件: F-1完了（保存済み・Duckモデル表示中）。
- 手順: 「リセット」ボタンを押し、確認ダイアログでOKを選択する。
- 期待結果:
  - `window.confirm()`ダイアログが表示される。
  - OK後: 3Dキャンバスからモデルが消える（`disposeCurrentModel`→`showPlaceholder`）。
  - フォームがデフォルト値に戻る（`refreshUI(createDefaultParams())`）。
  - 「保存」ボタンが非活性に戻る。
  - `localStorage.getItem('3d-character-creator:v2:generation')`が`null`になる（`clearStorage()`）。
  - 保存状態表示が「未保存の変更があります」になる。

#### F-4 リセット確認ダイアログでキャンセルした場合、何も変わらない ★

- 目的: `confirm()`でキャンセルを選んだ場合、リセット処理が実行されないことを確認する。
- 前提条件: F-1と同じ状態。
- 手順: 「リセット」ボタンを押し、確認ダイアログでキャンセルを選択する。
- 期待結果: 3D表示・フォーム値・localStorageのいずれも変化しない。

#### F-5 バージョン非互換時（v1データが残存）は無視して未生成状態から開始する ★★★

- 目的: `version`フィールドが2以外（v1の`1`を含む）の保存データが存在する場合、それを無視して未生成状態から開始することを確認する（9.4節・基本設計書v2 6.3節）。
- 手順:
  1. DevTools Consoleで`localStorage.setItem('3d-character-creator:v2:generation', JSON.stringify({version:1, someOldField:'x'}))`を実行する。
  2. ページをリロードする。
- 期待結果:
  - `loadFromStorage()`が`version !== 2`を検知し、`{params: createDefaultParams(), generatedModel: null, restored: false}`を返す。
  - A-1と同じ未生成状態の初期表示になる（エラーは発生しない）。
  - 保存状態表示は「デフォルト設定で開始しました」になる。

#### F-6 v1専用キーが残存していてもv2動作に影響しない ★

- 目的: v1のlocalStorageキー（`3d-character-creator:params`）が残存していても、v2は該当キーを一切参照せず無視することを確認する。
- 手順:
  1. DevTools Consoleで`localStorage.setItem('3d-character-creator:params', JSON.stringify({height:1.5}))`のようなv1形式のダミーデータを設定する（v2のキーは削除済みの状態）。
  2. ページをリロードする。
- 期待結果: v2は`3d-character-creator:v2:generation`キーのみを見るため、A-1と同じ未生成状態の初期表示になる。v1データの内容は一切読み込まれない。

#### F-7 破損したJSON（パースエラー）データでの起動 ★★

- 目的: `localStorage`の値が不正なJSON文字列の場合でも例外を投げずに未生成状態にフォールバックすることを確認する。
- 手順:
  1. `localStorage.setItem('3d-character-creator:v2:generation', '{不正なJSON')`を実行する。
  2. ページをリロードする。
- 期待結果: `JSON.parse`の`catch`節で捕捉され、未生成状態（`restored:false`）で起動する。Consoleに未捕捉例外が出ない。

#### F-8 `generatedModel`が`null`の保存データからの復元 ★

- 目的: パラメータのみ保存され`generatedModel:null`のデータからの復元時、フォームのみ復元されモデルはロードされないことを確認する。
- 手順:
  1. `localStorage.setItem('3d-character-creator:v2:generation', JSON.stringify({version:2, params:{version:2, gender:'male', mood:'cool', bodyType:'muscular', appearanceDescription:'test'}, generatedModel:null}))`を実行する。
  2. ページをリロードする。
- 期待結果: フォームが性別=男性/雰囲気=クール/体型傾向=がっしり/容姿説明=testで復元される。3Dキャンバスにはモデルが表示されず（未生成状態）、`showPlaceholder`が呼ばれる。「保存」ボタンは非活性。

#### F-9 保存済みモデルの復元ロードが失敗した場合 ★★

- 目的: `localStorage`復元時の`loadCharacterModel`が失敗した場合、`currentGeneratedModel`を`null`に戻さず、エラー表示のみ行う設計（`main.js`の`init()`内`.catch`）を確認する。
- 手順: F-1保存後、`localStorage`内の`modelUrl`を無効なURLに手動で書き換えてからリロードする。
- 期待結果:
  - エラー表示「保存済みモデルの読み込みに失敗しました。再度生成してください。」が表示される。
  - 3Dキャンバスにはモデルが表示されない（disposeもされず、そもそも一度も追加されていない状態）。
  - 「保存」ボタンは活性化されない（`setSaveButtonEnabled(true)`が呼ばれるのは成功時の`.then`のみ）。
  - **この場合、`showPlaceholder`呼び出し時に表示される「未生成状態」のガイダンス文言（例えばプレースホルダー表示に伴う案内文言）は表示されない。** `main.js`の`init()`は、保存済み`generatedModel`が存在する場合は`loadCharacterModel`の成否に関わらず`showPlaceholder`を呼ばない実装（`showPlaceholder`が呼ばれるのは`currentGeneratedModel`が無い＝`else`分岐の場合のみ）であり、ロード失敗時も`showPlaceholder`は呼ばれず、したがって`disposeCurrentModel`も呼ばれない。これは実装上の意図した挙動であり、バグではない。テスト実施係はガイダンス文言の不在を不具合として報告しないこと。

---

### G. 移動操作・カメラ追従（既存流用機能のデグレ確認）

#### G-1 WASD/矢印キーでの移動 ★★★

- 目的: 生成されたGLBキャラクター（`character.root`配下に`modelContainer`経由でGLBが追加された状態）に対しても、既存の移動操作が機能することを確認する。
- 前提条件: C-1完了（Duckモデル表示中）。
- 手順: `W`/`A`/`S`/`D`および矢印キーそれぞれを押し、モデルの位置変化を確認する。
- 期待結果:
  - `W`/`↑`で奥方向、`S`/`↓`で手前方向、`A`/`←`で左方向、`D`/`→`で右方向にモデルが移動する（`character.root.position`が更新される。GLBモデルは`modelContainer`経由で`root`に追従するため、root移動と共に画面上でも移動する）。
  - 斜め移動（例: `W`+`D`同時押し）でも正規化された速度で移動する（急に速くならない）。

#### G-2 移動範囲のクランプ確認 ★★

- 目的: `FIELD_HALF_SIZE=4.8`の範囲外へ移動できないことを確認する。
- 手順: 一方向（例: `W`）を十分長く押し続け、地面の端まで移動させる。
- 期待結果: `character.root.position.x`/`z`が`-4.8`〜`4.8`の範囲でクランプされ、地面の外に出ない。

#### G-3 キャラクターの向き変更（回転の滑らかさ） ★

- 目的: 移動方向転換時、`character.root.rotation.y`が`ROTATION_LERP_FACTOR`で滑らかに追従することを確認する。
- 手順: `A`（左移動）を押した後、素早く`D`（右移動）に切り替える。
- 期待結果: 瞬時に反転せず、Lerp（線形補間）により滑らかに向きが変わる（急なスナップが起きない）。

#### G-4 三人称追従カメラの動作確認 ★★

- 目的: GLBキャラクターに対してもカメラが背後から追従することを確認する。
- 手順: キャラクターを移動・回転させながらカメラの挙動を目視確認する。
- 期待結果: カメラが常にキャラクターの背後（`computeCameraOffset`計算通りの位置）に滑らかに追従し、キャラクターを画面内に収め続ける。カメラがモデルにめり込む、大きくブレる等の異常が無い。

#### G-5 正面向き補正値（`MESHY_MODEL_FRONT_CORRECTION_Y=0`）の妥当性確認（既知の制約の確認） ★

- 目的: 現状の実装が初期値0（無補正）のままであることを確認し、Duckモデルの正面と移動方向の見た目上の整合性に明らかな破綻が無いか目視確認する。
- 手順: G-1の移動操作中、モデルの向きと移動方向の見た目の整合性を確認する。
- 期待結果: `MESHY_MODEL_FRONT_CORRECTION_Y`が`character.js`内で`0`のまま定義されていることをコードで確認する（詳細設計書v2 8.2節・15章3項の通り、実際の正面ズレは実APIキー入手後に実測・調整する申し送り事項であり、Duckモデルでの見た目上のズレが多少あってもテスト不合格とはしない。ただし移動・回転・カメラ追従の**ロジック自体**（`character.root.rotation.y`の更新、カメラのLerp追従）が正しく動作していることは確認する）。
  **注記**: 本ケースは「バグ報告をしない」ことの明記が目的（v1 test_spec.mdのH観点相当）。正面ズレの見た目自体は既知の未確定事項として扱う。

---

### H. プロキシサーバー単体（`curl`等によるAPI確認）

前提: `server/`ディレクトリで`MESHY_API_KEY`未設定のまま`npm start`しておく。

**実行環境に関する重要な注意**: 本章のテストは**Windows上のGit Bash（POSIX sh）環境での実行を前提とする**（`cmd.exe`や素のPowerShellではない）。以下のcurlコマンド例は全て、バックスラッシュ`\`による行継続・シングルクォート`'`によるJSON文字列全体の囲みというGit Bash（POSIX sh）の構文で記載している。`^`（cmd.exeの行継続文字）や`\"`（cmd.exe向けのダブルクォートエスケープ）は使用しないこと。

#### H-1 `GET /health` 疎通確認 ★

- 手順: `curl http://localhost:3001/health`
- 期待結果: `200`、`{"ok":true}`

#### H-2 `POST /api/generate` 正常系（APIキー未設定時のフォールバック応答） ★★★

- 手順:
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":"","prompt":"A photorealistic 3D character model of a person."}'
```
- 期待結果: HTTPステータス`503`。ボディ:
```json
{
  "error": "API_KEY_NOT_CONFIGURED",
  "message": "AIモデル生成APIキーが設定されていません。デモ用モデルを表示します。",
  "fallback": { "jobId": "demo-fallback", "immediate": true }
}
```

#### H-3 `GET /api/generate/demo-fallback/status` ★★★

- 手順: `curl http://localhost:3001/api/generate/demo-fallback/status`
- 期待結果: `200`。
```json
{
  "status": "succeeded",
  "progress": 100,
  "modelUrl": "https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@main/2.0/Duck/glTF-Binary/Duck.glb",
  "errorMessage": null
}
```
- 補足: このURLに対し追加で`curl -I <modelUrl>`を実行し、`200 OK`が返り実際にGLBファイルが取得可能であることも併せて確認する（詳細設計書v2 6.2節記載のURLは実装時点で404だったため差し替え済み。差し替え後URLが現在も有効であることの確認は本ケースの重要な観点）。

#### H-4 `POST /api/generate` バリデーションエラー: `gender`不正 ★★

- 手順: `gender`を`"invalid_value"`にし、他はH-2と同じサンプル値でPOST。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"invalid_value","mood":"bright","bodyType":"average","appearanceDescription":"","prompt":"A photorealistic 3D character model of a person."}'
```
- 期待結果: `400`、`{"error":"INVALID_PARAMS","message":"genderが不正です。"}`

#### H-5 `POST /api/generate` バリデーションエラー: `mood`不正 ★

- 手順: `mood`を`"angry"`（未定義の値）にし、他はH-2と同じサンプル値でPOST。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"angry","bodyType":"average","appearanceDescription":"","prompt":"A photorealistic 3D character model of a person."}'
```
- 期待結果: `400`、`{"error":"INVALID_PARAMS","message":"moodが不正です。"}`

#### H-6 `POST /api/generate` バリデーションエラー: `bodyType`不正 ★

- 手順: `bodyType`を`"fat"`（未定義の値）にし、他はH-2と同じサンプル値でPOST。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"fat","appearanceDescription":"","prompt":"A photorealistic 3D character model of a person."}'
```
- 期待結果: `400`、`{"error":"INVALID_PARAMS","message":"bodyTypeが不正です。"}`

#### H-7 `POST /api/generate` バリデーションエラー: `appearanceDescription`が文字列でない ★

- 手順: `appearanceDescription`を数値（`123`）にし、他はH-2と同じサンプル値でPOST。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":123,"prompt":"A photorealistic 3D character model of a person."}'
```
- 期待結果: `400`、`{"error":"INVALID_PARAMS","message":"appearanceDescriptionが不正です。"}`

#### H-8 `POST /api/generate` バリデーションエラー: `appearanceDescription`が501文字 ★★

- 手順: `appearanceDescription`に501文字の文字列を指定し、他はH-2と同じサンプル値でPOST（501文字の文字列はGit Bashのコマンド置換で生成してよい。例: `-d "{\"gender\":\"female\",\"mood\":\"bright\",\"bodyType\":\"average\",\"appearanceDescription\":\"$(printf 'a%.0s' {1..501})\",\"prompt\":\"A photorealistic 3D character model of a person.\"}"`。この場合のみJSON全体を`'`ではなく`"`で囲みコマンド置換`$(...)`を有効にする必要がある点に注意）。
- 期待結果: `400`、`{"error":"INVALID_PARAMS","message":"appearanceDescriptionは500文字以内で入力してください。"}`

#### H-9 `appearanceDescription`が500文字ちょうど（境界値・正常） ★

- 手順: `gender="female"`, `mood="bright"`, `bodyType="average"`（H-2と同じサンプル値）、`prompt="A photorealistic 3D character model of a person."`（H-2と同じサンプル値）を指定した上で、`appearanceDescription`のみを500文字ちょうどの文字列に差し替えてPOSTする。他のフィールドはH-2の値から変更しないこと（`gender`/`mood`/`bodyType`が先に検証されるため、これらを正常値にしておかないと`appearanceDescription`の境界値検証まで到達せず`400`になってしまう点に注意）。
- 期待結果: `400`にならず、`503`（フォールバック）または`202`が返る（`length > 500`のみNGのため500ちょうどはOK）。

#### H-10 `prompt`欠損（キー自体が無い） ★★

- 手順: リクエストボディから`prompt`キー自体を除き、他はH-2と同じサンプル値でPOST。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":""}'
```
- 期待結果: `400`、`{"error":"INVALID_PARAMS","message":"promptが不正です。"}`（`typeof body.prompt !== 'string'`により`undefined`が弾かれる）。

#### H-11 `prompt`が数値型 ★

- 手順: `prompt: 12345`（文字列でない）にし、他はH-2と同じサンプル値でPOST。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":"","prompt":12345}'
```
- 期待結果: `400`、`message: "promptが不正です。"`

#### H-12 `prompt`が空文字・空白のみ ★★

- 手順: `prompt: ""`および`prompt: "   "`のそれぞれで、他はH-2と同じサンプル値でPOSTする。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":"","prompt":""}'

curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":"","prompt":"   "}'
```
- 期待結果: いずれも`400`、`message: "promptが不正です。"`（`trim()`後の長さ0でNG）。

#### H-13 `prompt`が2000文字ちょうど（境界値・正常） ★

- 手順: `prompt`に2000文字ちょうどの文字列を指定し、他はH-2と同じサンプル値でPOST。文字列生成にはコマンド置換を使い、この場合のみJSON全体を`"`で囲む。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d "{\"gender\":\"female\",\"mood\":\"bright\",\"bodyType\":\"average\",\"appearanceDescription\":\"\",\"prompt\":\"$(printf 'a%.0s' {1..2000})\"}"
```
- 期待結果: `400`にならない（`length > 2000`のみNGのため2000ちょうどはOK）。

#### H-14 `prompt`が2001文字（境界値・異常） ★★

- 手順: `prompt`に2001文字の文字列を指定し、他はH-2と同じサンプル値でPOST（H-13同様、コマンド置換を使う場合はJSON全体を`"`で囲む）。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d "{\"gender\":\"female\",\"mood\":\"bright\",\"bodyType\":\"average\",\"appearanceDescription\":\"\",\"prompt\":\"$(printf 'a%.0s' {1..2001})\"}"
```
- 期待結果: `400`、`message: "promptが不正です。"`

#### H-15 リクエストボディ自体が空（Content-Typeヘッダ無し等） ★

- 手順:
```
curl -i -X POST http://localhost:3001/api/generate
```
（ボディ・Content-Type無し）
- 期待結果: `express.json()`によりボディは`{}`扱いとなり、`gender`等が`undefined`のため`400`、`"genderが不正です。"`（先頭のバリデーションで弾かれる）。サーバーがクラッシュしない。

#### H-16 存在しない`jobId`でのステータス取得（APIキー未設定時） ★★

- 目的: `demo-fallback`以外の任意の`jobId`を指定した場合、APIキー未設定であれば`getTextTo3DJobStatus`が`503`を投げ、ルート側が適切にハンドリングすることを確認する。
- 手順:
```
curl -i http://localhost:3001/api/generate/some-random-job-id/status
```
- 期待結果: `503`、`{"error":"API_KEY_NOT_CONFIGURED","message":"AIモデル生成APIキーが設定されていません。"}`（実際のMeshy APIへのfetchは行われず、`getApiKey()`の時点で即座にthrowされる）。

#### H-17 CORS許可の確認 ★

- 手順:
```
curl -i -X OPTIONS http://localhost:3001/api/generate \
  -H "Origin: http://localhost:8000" \
  -H "Access-Control-Request-Method: POST"
```
- 期待結果: レスポンスヘッダに`Access-Control-Allow-Origin`が含まれ、別オリジンからのリクエストが許可されることを確認する。

#### H-18 APIキー設定時のジョブ作成リクエストが実際にMeshy AIへ到達しようとすること（実疎通は対象外） ★

- 目的: `MESHY_API_KEY`にダミーの値（例: `dummy-invalid-key-for-test`）を設定した場合、`getApiKey()`が非nullを返し、実際に`https://api.meshy.ai/v2/text-to-3d`へfetchを試みることを確認する（実キーではないため認証エラー`502`が返る想定。実際のMeshy AIとの疎通確認自体は対象外だが、「キー有無で分岐が正しく切り替わること」の確認として実施する）。
- 手順: `server/.env`に`MESHY_API_KEY=dummy-invalid-key-for-test`を設定し再起動後、H-2と同じサンプル値でPOSTする。
```
curl -i -X POST http://localhost:3001/api/generate \
  -H "Content-Type: application/json" \
  -d '{"gender":"female","mood":"bright","bodyType":"average","appearanceDescription":"","prompt":"A photorealistic 3D character model of a person."}'
```
- 期待結果: `503`のフォールバック応答ではなく、`502`（`MESHY_API_ERROR`。実際のMeshy側から認証エラー等が返るか、ネットワーク到達自体はするがAPI側が拒否する）が返ることを確認する。テスト後は`.env`を元（未設定）に戻す。

---

### I. UI状態遷移・ボタン活性制御

#### I-1 生成失敗時（`failed`ステータス）にボタンが再活性化される ★★

- 目的: ポーリング結果が`failed`の場合、「生成」ボタンが再度押せる状態に戻ることを確認する。
- 手順: H章同様に`/:jobId/status`を一時的に`{status:"failed", errorMessage:"モデル生成に失敗しました（テスト）"}`を返すよう差し替え、生成を実行する。
- 期待結果: エラー表示に「モデル生成に失敗しました（テスト）」が出て、ローディング表示が消え、「生成」ボタンが活性に戻る。

#### I-2 ポーリングタイムアウト時のUI状態 ★★

- 目的: `GENERATION_TIMEOUT_MS=180000`超過時にタイムアウトエラーが表示され、ボタンが再活性化されることを確認する。
- 手順: `/:jobId/status`が常に`in_progress`を返すよう一時的に差し替え、生成を実行して180秒待つ（または`main.js`内`GENERATION_TIMEOUT_MS`をテスト用に短い値に一時変更して確認する）。
- 期待結果: 180秒経過時点で「生成がタイムアウトしました。しばらくしてから再度お試しください。」が表示され、「生成」ボタンが再活性化する。

#### I-3 ポーリング中の一時的なエラーからのリトライ（3回まで） ★★

- 目的: ポーリング中に一時的にステータス取得が失敗しても、`MAX_POLL_ERROR_RETRY=3`回までは自動リトライし、失敗確定としないことを確認する。
- 手順: `/:jobId/status`エンドポイントを一時的に「1〜3回目は500エラー、4回目はsucceeded」を返すよう差し替えて生成を実行する。
- 期待結果: 1〜3回目のエラーではエラー表示・失敗確定にならず、そのままポーリングが継続し、4回目で成功して通常通りモデルが表示される。

#### I-4 連続4回失敗時に生成失敗が確定する ★★

- 目的: リトライが`MAX_POLL_ERROR_RETRY=3`を超えた場合（4回連続失敗）、生成失敗が確定しエラー表示されることを確認する。
- 手順: `/:jobId/status`が常に500エラーを返すよう差し替えて生成を実行する。
- 期待結果: 4回目のエラー後、「生成状況の確認に失敗しました。」が表示され、「生成」ボタンが再活性化する。

#### I-5 プロキシサーバー未起動時のエラー表示 ★★

- 目的: プロキシサーバーが起動していない状態で生成ボタンを押した場合、分かりやすいエラーが表示されることを確認する。
- 手順: プロキシサーバーを停止した状態でフロントエンドの「生成」ボタンを押す。
- 期待結果: `fetch`が例外を投げ、`handleGenerate`の`catch`節でエラー表示（「サーバーに接続できませんでした。」相当。実際には`TypeError: Failed to fetch`の`err.message`がそのまま出るか、`err.message`が空の場合のフォールバック文言が出ることをコードと合わせて確認する）。「生成」ボタンが再活性化する。

---

### J. 異常系・エラーハンドリング全般

#### J-1 生成中にページをリロードした場合 ★

- 目的: 生成中（ポーリング中）にリロードした場合、次回起動時に不整合が起きないことを確認する。
- 手順: 生成ボタンを押しポーリング中にページをリロードする。
- 期待結果: リロード後は`localStorage`の直近保存済み状態（保存していなければ未生成状態）から起動し、リロード前の生成リクエストの残骸（進行中フラグ等）は残らない。エラーやフリーズが起きない。

#### J-2 `saveToStorage`が例外を投げるケース（容量超過等）のフォールバック表示 ★

- 目的: `localStorage.setItem`が失敗した場合、保存状態表示に失敗メッセージが出ることを確認する。
- 手順: DevTools Consoleで`localStorage`の書き込みを一時的に例外を投げるようモック化する（例: `const orig = Storage.prototype.setItem; Storage.prototype.setItem = function(){ throw new Error('quota'); };`）、その状態で「保存」ボタンを押す。
- 期待結果: 保存状態表示が「保存に失敗しました（ブラウザのストレージ設定をご確認ください）」になる。モック解除を忘れないこと。

#### J-3 `clearStorage`が例外を投げても外部に伝播しない ★

- 目的: `localStorage.removeItem`が例外を投げても、`clearStorage()`内で握りつぶされ、リセット処理全体が失敗しないことを確認する。
- 手順: J-2同様に`removeItem`をモック化して例外を投げさせ、「リセット」ボタンを押す。
- 期待結果: コンソールに未捕捉例外が出ず、フォーム・3D表示のリセット自体は正常に完了する。

---

### K. 既存機能・他プロジェクトへの影響確認（デグレ観点）

#### K-1 `field.js`が無改修であることの確認 ★★

- 目的: 基本設計書v23章の方針通り`js/field.js`が無改修であることを確認する。
- 手順: `field.js`のコード内容を確認し、地面フィールド（`PlaneGeometry(10,10,10,10)`、緑色`0x6fae5c`、`GridHelper`、`FIELD_HALF_SIZE=4.8`）の実装がv1のものと相違ないことを確認する（差分比較。git上でv1版とdiffを取れるならそれで確認する）。
- 期待結果: 変更が無いこと。実行結果としても地面フィールドの見た目・移動可能範囲がv1と同じであることを目視確認する。

#### K-2 `controls.js`が無改修であることの確認 ★★

- 目的: 基本設計書v23章・詳細設計書v2 8章の方針通り、`controls.js`自体は無改修（正面補正は`character.js`側で吸収）であることを確認する。
- 手順: `controls.js`のコード内容を確認し、`atan2(x, -z)`ロジック・`CAMERA_OFFSET`計算式・`MOVE_SPEED`等の定数がv1と相違ないことを確認する。
- 期待結果: 変更が無いこと。G章の移動・カメラ追従テストが正常に動作することと合わせて総合的に確認する。

#### K-3 他プロジェクト（PDF編集ツール等）のファイルが無変更であることの確認 ★★★

- 目的: 基本設計書v2 8章・詳細設計書v2 0章の制約「リポジトリ直下の既存PDF編集ツール関連ファイルには一切手を加えない」が守られていることを確認する。
- 手順:
  1. リポジトリルート直下の`poc_pdf_edit.py`, `make_sample_resume.py`, `pdf_editor.py`, `api_server.py`, `test_pdf_editor.py`, `make_sample_resume_multipage.py`等のPDF編集ツール関連ファイルの更新日時・内容を確認する。
  2. 可能であれば`git log`または`git diff`で、本リニューアル作業のコミット群がこれらのファイルに触れていないことを確認する（例: `git log --stat -- poc_pdf_edit.py pdf_editor.py api_server.py test_pdf_editor.py make_sample_resume.py make_sample_resume_multipage.py` で本リニューアル関連コミットが含まれていないこと）。
- 期待結果: 上記ファイル群に本リニューアル作業による変更が一切無いこと。

#### K-4 v1関連ファイル（`docs/basic_design.md`, `docs/detail_design.md`, `docs/test_spec.md`）が本作業で書き換えられていないことの確認 ★

- 目的: v1のドキュメント一式が「置き換えではなく残す」方針（基本設計書v2冒頭・詳細設計書v2冒頭）通り、無変更で残っていることを確認する。
- 手順: 上記3ファイルの内容が本v2作業によって上書きされていないか確認する（`git log`でv2関連コミット後もv1ファイルの内容が変わっていないか）。
- 期待結果: v1の3ファイルはいずれも既存のまま維持されている。

#### K-5 `3d-character-creator/`配下のディレクトリ構成が詳細設計書v2 4章の一覧と一致することの確認 ★

- 目的: 想定外の余分なファイル・不足ファイルが無いことを確認する。
- 手順: `3d-character-creator/`配下（`server/`含む）のファイル一覧を取得し、詳細設計書v2 4章の一覧と突き合わせる。
- 期待結果: `docs/`, `index.html`, `js/*`, `css/style.css`, `server/*`が一覧通りに揃っている（余分なテスト用一時ファイル等が残っていないこと。特にH章・I章のテストで一時的に改変した`server/routes/generate.js`等は、テスト後に元の実装内容へ復元されていることを必ず確認する）。

---

## 3. テスト実施上の注意事項（テスト実施係向け補足）

- H章・E-3・I章の一部ケースは、`server/routes/generate.js`のステータス応答を一時的に書き換える手順を含む。**テスト完了後は必ず元の実装内容に復元し、`git diff`で差分が残っていないことを確認してから完了報告すること**（K-5と対応）。
- D-1・D-3・E-3等、`main.js`内部の関数（`pollJobStatus`等）や`character`変数を直接コンソールから呼び出す手順は、現状の実装がモジュールスコープ変数を外部公開していないため、テスト実施時に一時的なデバッグ用エクスポート（例: `window.__character = character;`を`main.js`の`init()`内に追記）を追加する必要がある。**この追記も本番コードには残さず、テスト完了後に必ず削除すること。**
- 本書のテストケースは実APIキー無し環境を前提に設計されている。実際にMeshy AI APIキーが入手できた場合、以下は別途の追加テスト計画（本書の対象外）として扱うこと。
  - 実際のText-to-3Dジョブ作成・ポーリング・完了までの疎通確認
  - 実際に生成される人物モデルの品質・正面向きの傾向確認（`MESHY_MODEL_FRONT_CORRECTION_Y`の実測・調整の要否判断）
  - レート制限・料金体系等、実運用を見据えた非機能確認
