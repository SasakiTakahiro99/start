# Pedal Nations — エフェクター擬人化アプリ (MVP)

ギターエフェクターを擬人化した「収集 × 放置育成 × 週次ライブ × 転生」のブラウザゲーム。
メーカーを「国」に見立て、エフェクターをキャラとして集め・育て・ライブで稼ぐ。

- フロントエンド: React + Vite
- バックエンド: Java 21 / Spring Boot 3
- DB: H2（ファイルDB。将来 PostgreSQL 等に差し替え可能な構成）
- 認証: なし（MVPは固定ユーザー `default` 1人でセーブ/ロード）

## ディレクトリ構成

```
effector-gijinka-app/
├── backend/    Spring Boot (REST API + H2)
│   └── src/main/java/com/effector/gijinka/
│       ├── config/GameConfig.java     ← ★仮値(バランス調整パラメーター)はここに集約
│       ├── catalog/Catalog.java       ← 国2・種別10・キャラ20 のマスターデータ
│       ├── service/                   ← GameService / ProgressionCalculator
│       ├── controller/                ← REST エンドポイント
│       └── model/                     ← JPA エンティティ(セーブデータ)
└── frontend/   React + Vite
    └── src/
        ├── App.jsx          画面全体(オンボーディング/練習/編成/ライブ/ガチャ/図鑑/転生)
        ├── tone.js          音色体験(Web Audio によるダミー音源生成)
        ├── PedalAvatar.jsx  ビジュアル(属性から生成するダミーSVG)
        └── progression.js   練習表示の補間(サーバー ProgressionCalculator のミラー)
```

画像・音源は**すべてダミーの自作素材**（実機音源は不使用）。ビジュアルは属性から生成するSVG、
音色は Web Audio API でエフェクター種別ごとに数パターンを合成して切り替える軽量版。

## 起動方法

前提: Java 21+、Node.js 18+。Maven は同梱の wrapper（`mvnw`）が自動取得するので別途インストール不要。

### 1. バックエンド（ポート 8080）

```bash
cd effector-gijinka-app/backend
./mvnw spring-boot:run          # Windows: mvnw.cmd spring-boot:run
```

- API: `http://localhost:8080/api/...`
- H2 コンソール: `http://localhost:8080/h2-console`
  （JDBC URL `jdbc:h2:file:./data/effectordb` / User `sa` / パスワード空）

### 2. フロントエンド（ポート 5173）

```bash
cd effector-gijinka-app/frontend
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。Vite が `/api` を 8080 のバックエンドへプロキシする。

### 本番ビルド

```bash
cd frontend && npm run build     # dist/ を生成
cd backend  && ./mvnw package    # 実行可能 jar を target/ に生成
```

## DB の初期化・リセット

- H2 は `backend/data/effectordb.mv.db` にファイルとして保存され、再起動してもセーブが残る。
- **完全リセット**: バックエンド停止後 `backend/data/` ディレクトリを削除して再起動する。
- **ゲーム内リセット（開発用）**: `POST /api/reset` を叩くと固定ユーザーのセーブを消去する。
  （オンボーディングからやり直せる）
- テーブルは JPA の `ddl-auto=update` で自動生成される。

### PostgreSQL への差し替え（将来）

`backend/src/main/resources/application.properties` の datasource ブロックを差し替え、
`pom.xml` に PostgreSQL ドライバを追加するだけ。JPA エンティティ側は変更不要。

## オフライン進行について（要件からの変更点）

技術パラメーターは**アプリを閉じている間も進行する**。
サーバーは最終セーブ時刻（`lastSaveMillis`）を保持し、次回ロード時に
「経過時間 × 上昇レート」を一括加算する。ソフトキャップでの鈍化・ハードキャップでの頭打ちも
この一括加算に正しく効くため、どれだけ長時間放置してもカンスト値を超えない。
アプリを開いている間もリアルタイムに上昇する（表示はクライアント側で補間、実値はサーバーが権威）。

計算ロジックは `ProgressionCalculator.advance()` に集約し、単体テストとDB込みの結合テストで
「境界またぎ」「長時間放置のハードキャップ」を検証済み。

## 主要な仮値（すべて `config/GameConfig.java` で調整）

| 項目 | 定数 | 現在値 |
|------|------|--------|
| 技術の基本上昇レート | `BASE_RATE_PER_SEC` | 1.0 / 秒 |
| ソフトキャップ（鈍化開始） | `SOFT_CAP` | 300 |
| ハードキャップ（カンスト） | `HARD_CAP` | 500 |
| 鈍化後の速度倍率 | `SOFT_CAP_SLOW_FACTOR` | 0.2 |
| オフライン加算の上限時間 | `OFFLINE_MAX_ELAPSED_SEC` | 86400秒(24h) |
| 編成 最小/最大 | `FORMATION_MIN` / `FORMATION_MAX` | 1 / 8 |
| スコア→集客の換算 | `ATTENDANCE_PER_SCORE` | 0.5 |
| 集客→お金の換算 | `MONEY_PER_ATTENDANCE` | 3.0 |
| 同一メーカー統一ボーナス | `BONUS_SAME_MAKER` | ×1.3 |
| 友好メーカー混成ボーナス | `BONUS_FRIENDLY_MIX` | ×1.15 |
| 有料ガチャ価格 | `GACHA_PAID_COST` | 500 |
| 無料ガチャ/週 | `GACHA_FREE_PER_WEEK` | 1 |
| ガチャ排出ウェイト（キャラ1体あたり・レア度で決定） | `GACHA_WEIGHT_NORMAL/RARE/VINTAGE/LIMITED` | 70 / 22 / 6 / 2 |
| 転生に必要なカンスト数 | `REINCARNATE_REQUIRED_MAXED` | 5 |
| 転生1回のセンス上昇 | `SENSE_GAIN_PER_REINCARNATE` | +0.1 |
| センス初期値 / 上限 | `SENSE_START` / `SENSE_MAX` | 1.0 / 10.0 |
| 開始時の所持金 | `START_MONEY` | 800 |

キャラ固有効果（ライブスコアへの flat 加算）はレア度で決まる（`catalog/Rarity.java`）:
通常 +20 / レア +50 / ヴィンテージ +100 / 限定 +180。

メーカー間の関係性は `catalog/Catalog.java` の `MakerDef.friendlyMakers` で定義（現状 BOSS↔Ibanez は友好）。

### ガチャの排出仕様（誤解しやすいので明記）

排出率は「レア度ティアごとの確率」ではなく、**キャラクター1体ごとに設定されたウェイト**（そのキャラのレア度で決まる `Rarity.gachaWeight`）で抽選する。抽選プール内の全キャラのウェイト合計に対する各キャラの比率が、そのキャラの排出確率になる。上表の 70 / 22 / 6 / 2 は「そのレア度のキャラ1体あたりのウェイト」であり、ティア全体の確率ではない。

さらに**重複排出なし**（既所持キャラはプールから除外）のため、所持が増えるほど各レア度の実効排出率は動的に変化する。たとえば現行カタログのレア度内訳は NORMAL 8 / RARE 7 / VINTAGE 4 / LIMITED 1 体で、未所持ゼロの初回はティア実効率が名目の 70/22/6/2 ではなく概ね **75.7 / 20.8 / 3.2 / 0.27%**（= 560/740, 154/740, 24/740, 2/740）になる。唯一の LIMITED を引くと以降 LIMITED の排出率は 0% になり、コンプに近づくほど高レアは出にくくなる（枯れる）。

これらのウェイト値・レア度の割り当てはすべて仮値であり、`config/GameConfig.java`（ウェイト値）と `catalog/Rarity.java`（レア度→ウェイトの対応）で調整する前提。

## ゲームの流れ（受け入れ基準の対応）

1. メーカー(BOSS/Ibanez)選択 → 最初の1台（A: ODから選ぶ / B: ガチャ）
2. 練習フェーズ: 放置で技術上昇（ソフトキャップで鈍化・ハードキャップでカンスト・オフライン進行あり）
3. 週次ライブ: 編成（1〜8体）の 技術×センス＋固有効果 × 編成ボーナス → 集客 → お金
4. ガチャ: 無料 / お金消費、キャラ単位のウェイト抽選（やや渋め）、重複なし（所持が増えるほど高レアの実効排出率が下がる）
5. 図鑑: 名前・メーカー・レア度・ビジュアル・音色切り替え・歴史解説
6. 転生: 手持ち5体カンストで全キャラ技術0リセット、センス上昇（全キャラ共通・上限あり）

## API 一覧

| メソッド | パス | 説明 |
|---------|------|------|
| GET  | `/api/catalog` | 国・種別・キャラのマスターデータ（図鑑用） |
| GET  | `/api/config` | 仮値（フロントの表示補間用） |
| GET  | `/api/state` | プレイヤー状態（取得時にオフライン/オンライン進行を確定） |
| POST | `/api/init` | 初期化 `{maker, method:"od"|"gacha", characterId?}` |
| POST | `/api/formation` | 編成変更 `{characterIds:[...]}` |
| POST | `/api/live` | 週次ライブ開催 |
| POST | `/api/gacha` | ガチャ `{paid:true|false}` |
| POST | `/api/reincarnate` | 転生 |
| POST | `/api/reset` | セーブ全消去（開発用） |

## セーブ対象（ロードで復元される）

所持キャラ一覧 / 各キャラの技術パラメーター / センス（プレイヤー共通）/ 所持金 /
現在の編成 / 選択した初期メーカー / 週次サイクルの進行（週数・無料ガチャ残数）/ 最終セーブ時刻。

## 既知の制約（MVP）

- 認証なし・固定ユーザー1人。複数プレイヤー・アカウント分離は未実装。
- 音源・画像はダミー生成（実機サンプリング音源・専用イラストではない）。
- ライブ演出は編成キャラが登場する簡易アニメーションのみ。
- 通知機能なし（要件どおり不要）。
- 転生条件は「任意の5体がカンスト」（要件どおりの意図的仕様。序盤は転生しづらい）。
- バランス数値はすべて仮値。`GameConfig.java` で調整する前提。
