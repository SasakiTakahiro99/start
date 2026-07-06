# 3Dキャラクタークリエイター MVP 詳細設計書

本書は `docs/basic_design.md`（承認済み基本設計書）を受け、コーディング係がそのまま実装に着手できる
レベルまで仕様を具体化したものである。基本設計書の内容と矛盾・変更が必要と判断した箇所は
「9. 基本設計からの変更点・開発リーダーへの申し送り」に明記する。

---

## 1. Three.js の確定バージョン・読み込み方式

### 1.1 バージョン・CDN
- 採用バージョン: **Three.js r160**（`0.160.0`）。2024年前半リリースの安定版で、ES Modules形式・
  `examples/jsm/controls/OrbitControls.js` 等のアドオン構成が現行の標準的な形に定着しているバージョン系列。
- CDN: **jsDelivr** を採用する（unpkgより静的ファイル配信が安定しているため）。
  - コア: `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`
  - アドオン（本MVPでは軌道カメラ制御は使わず自前の追従カメラのみだが、将来のデバッグ用途に備え
    `OrbitControls` の読み込み口だけ用意する。実運用コードでは未使用）:
    `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js`

### 1.2 import map の要否
- **使用する**。`index.html` の `<head>` 内に以下の `importmap` を記述し、各JSファイル内では
  `import * as THREE from 'three';` のようにパッケージ名で参照できるようにする（バージョン文字列を
  JSファイル側に埋め込まずに済み、バージョン更新時に `index.html` の1箇所のみ変更すればよいため）。

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

- 各JSファイルは `<script type="module" src="js/xxx.js"></script>` として読み込む（`index.html` に
  読み込み順を記述する必要はない。ESMの `import`/`export` で依存関係を解決するため、`main.js` のみを
  エントリとして1つ読み込み、他は `main.js` から `import` する）。
- `index.html` の module 読み込みは以下の1行のみとする。

```html
<script type="module" src="js/main.js"></script>
```

### 1.3 ローカル確認時の注意
- `type="module"` は `file://` 直開きだとブラウザのCORS制約でモジュール読み込みに失敗する場合がある。
  README（別途）に「`python -m http.server` 等の簡易サーバー経由での確認を推奨」の注記を残す
  （基本設計書7章の方針通り、アプリ機能としては実装しない）。

---

## 2. ファイル構成・モジュール責務一覧

```
3d-character-creator/
├── index.html
├── js/
│   ├── main.js                # エントリポイント。初期化・アニメーションループ・全体結線
│   ├── character.js           # キャラクターの生成・パーツ更新ロジック
│   ├── field.js                # 地面フィールドの生成
│   ├── controls.js            # キー入力・キャラクター移動・追従カメラ
│   ├── customization-ui.js    # UIコントロール生成・イベントバインド
│   ├── params.js              # パラメータ定義（デフォルト値・値域・プリセット）※新規
│   └── storage.js             # localStorage保存・読込
└── css/
    └── style.css
```

補足: 基本設計書のファイル一覧に対し、パラメータ定義（値域・デフォルト値・性別プリセット差分・
バリデーション）を集約する `js/params.js` を1ファイル追加する。character.js・customization-ui.js・
storage.js の全てが値域定義を参照するため、単一箇所に集約したほうが実装時の食い違いを防げる
（変更点として9章に記載）。

---

## 3. `js/params.js` — パラメータ定義モジュール

責務: パラメータの型・値域・デフォルト値・性別プリセット差分・バリデーション関数を一元管理する。
他のどのモジュールも「パラメータの妥当な範囲がいくつか」をここ以外にハードコードしない。

### 3.1 データ構造（確定版）

基本設計書5章のイメージを踏襲しつつ、値域チェック用のメタ情報も併せて定義する。実行時に
Character/UI/Storageが共有するのは以下の「パラメータ値オブジェクト」（保存対象そのもの）。

```jsonc
{
  "version": 1,
  "gender": "female",            // "female" | "male"
  "body": {
    "height": 1.0,                // 0.85〜1.15
    "shoulderWidth": 1.0,         // 0.8〜1.2
    "weight": 1.0                 // 0.85〜1.25
  },
  "skinColor": "#f2c9a1",
  "face": {
    "shape": "round",             // "round" | "oval" | "square"
    "eyes": {
      "size": 1.0,                // 0.7〜1.4
      "spacing": 1.0,             // 0.8〜1.3
      "color": "#3b2a1a"
    },
    "nose": {
      "size": 1.0,                // 0.7〜1.4
      "shape": "normal"           // "normal" | "small" | "wide"
    },
    "mouth": {
      "size": 1.0,                // 0.7〜1.4
      "shape": "normal"           // "normal" | "smile" | "flat"
    }
  },
  "hair": {
    "style": "short",             // "short" | "long" | "bald"
    "color": "#222222"
  }
}
```

### 3.2 値域・デフォルト値一覧（PARAM_RANGESとして定義）

| パラメータ | 型 | 最小 | 最大 | ステップ | デフォルト |
|---|---|---|---|---|---|
| `body.height` | number | 0.85 | 1.15 | 0.01 | 1.0 |
| `body.shoulderWidth` | number | 0.8 | 1.2 | 0.01 | 1.0 |
| `body.weight` | number | 0.85 | 1.25 | 0.01 | 1.0 |
| `face.eyes.size` | number | 0.7 | 1.4 | 0.01 | 1.0 |
| `face.eyes.spacing` | number | 0.8 | 1.3 | 0.01 | 1.0 |
| `face.nose.size` | number | 0.7 | 1.4 | 0.01 | 1.0 |
| `face.mouth.size` | number | 0.7 | 1.4 | 0.01 | 1.0 |

列挙型パラメータのデフォルト・選択肢:

| パラメータ | 選択肢 | デフォルト |
|---|---|---|
| `gender` | `female`, `male` | `female` |
| `face.shape` | `round`, `oval`, `square` | `round` |
| `face.nose.shape` | `normal`, `small`, `wide` | `normal` |
| `face.mouth.shape` | `normal`, `smile`, `flat` | `normal` |
| `hair.style` | `short`, `long`, `bald` | `short` |

色パラメータのデフォルト:

| パラメータ | デフォルト値 |
|---|---|
| `skinColor` | `#f2c9a1` |
| `face.eyes.color` | `#3b2a1a` |
| `hair.color` | `#222222` |

### 3.3 性別プリセットごとの差分（GENDER_PRESETS）

`gender` を切り替えた際、他パラメータをユーザーが未変更（＝プリセットデフォルトのまま）であれば
以下の差分を適用する。実装上は「性別セレクトボックス変更時に body 系パラメータのみプリセット値へ
上書きする」仕様とする（顔パーツ・肌色・髪色などユーザーがカスタマイズ済みの値は保持する）。

| パラメータ | female | male |
|---|---|---|
| `body.height` | 0.95 | 1.05 |
| `body.shoulderWidth` | 0.9 | 1.1 |
| `body.weight` | 0.95 | 1.05 |

補足: 上記は「初期値・性別変更時の body 再設定値」であり、ユーザーはこの後さらにスライダーで
0.85〜1.15等の範囲内で自由に微調整できる（体形パラメータは性別を問わず共通の値域を使う）。

### 3.4 主要関数

```js
// js/params.js

/** デフォルトパラメータのディープコピーを返す */
export function createDefaultParams(): ParamsObject

/**
 * 性別プリセットに応じた body 値を返す（gender変更時にcharacter/UIから呼ばれる）
 * @param {"female"|"male"} gender
 * @returns {{height:number, shoulderWidth:number, weight:number}}
 */
export function getGenderBodyPreset(gender): BodyParams

/**
 * 任意のオブジェクトを検証し、不正・欠損値をデフォルトで補完した正規化済みパラメータを返す。
 * storage.jsのロード時、customization-ui.jsのUI初期化時に使用する。
 * 数値は範囲外なら min/max にクランプ、列挙型は選択肢に無ければデフォルトへ、
 * 色は正規表現 /^#[0-9a-fA-F]{6}$/ に一致しなければデフォルトへフォールバックする。
 * @param {any} raw 任意の入力（JSON.parse結果、undefined、壊れたオブジェクト等）
 * @returns {ParamsObject} 正規化済みパラメータ（常に完全な形を返す。例外を投げない）
 */
export function normalizeParams(raw): ParamsObject

/** PARAM_RANGES, GENDER_PRESETS, ENUM_OPTIONS を外部公開（UI構築用） */
export const PARAM_RANGES = { ... }
export const ENUM_OPTIONS = { ... }
```

- `normalizeParams` はどんな入力（`null`、`{}`、型不一致、部分的なオブジェクト等）を渡されても
  例外を投げず、必ず完全な `ParamsObject` を返すことを仕様として保証する（storage.jsのエラー処理の要）。

---

## 4. `js/character.js` — キャラクター生成・更新

### 4.1 責務
- プリミティブジオメトリの組み合わせで頭身の整ったスタイライズドキャラクターの `THREE.Group` を構築する。
- パラメータ変更を受けて、該当パーツの `scale` / `position` / `material.color` 等を更新する
  （ジオメトリの再生成ではなく、可能な限り既存メッシュの変形で対応し、負荷と実装コストを抑える）。

### 4.2 ジオメトリ構成（プリミティブの組み合わせ）

キャラクター全体は `THREE.Group`（`character.root`）を最上位とし、以下の階層で構築する。
全パーツは `MeshStandardMaterial` を使用する（軽量なライティングで陰影が付き、スタイライズド表現に適する）。

```
character.root (THREE.Group)                      … フィールド上のワールド座標・向きを管理
└── bodyGroup (THREE.Group)                        … body.height でGroup全体をY方向スケール
    ├── torso: THREE.Mesh (CapsuleGeometry)         … 胴体。radius/lengthをshoulderWidth・weightで調整
    ├── head: THREE.Mesh (SphereGeometry)           … 頭部。大きめの球（頭身デフォルメの要）。
    │   │                                              face.shapeによる非一様scaleはこのheadメッシュ
    │   │                                              自身にのみ適用する（子に伝播させない。4.2.1節参照）
    │   └── hair: THREE.Group（styleごとに中身を差し替え。SphereGeometry/CapsuleGeometryの組合せ）
    │                                                  … headの子。頭部scaleの影響を受けてよい（髪は
    │                                                    頭の輪郭に追従して変形して自然なため許容する）
    ├── faceFeaturesGroup: THREE.Group               … headと**同じ親(bodyGroup)の下、headと兄弟**として配置。
    │   │                                                headのscaleを継承しない（4.2.1節参照）
    │   ├── leftEye / rightEye: THREE.Mesh (SphereGeometry, 小)  … 黒目相当。色=eyes.color
    │   ├── nose: THREE.Mesh (ConeGeometry or SphereGeometry)     … 鼻。shapeにより形状切替
    │   └── mouth: THREE.Mesh (CapsuleGeometry, 極細・横長 or TorusGeometry一部) … 口
    ├── cheekGroup: THREE.Group                      … headと**同じ親(bodyGroup)の下、headと兄弟**として配置。
    │   │                                                headのscaleを継承しない（4.2.2節・レビュー指摘2回目対応）
    │   └── cheekLeft / cheekRight: THREE.Mesh (BoxGeometry) … square輪郭時のみ表示
    ├── leftArm / rightArm: THREE.Mesh (CapsuleGeometry) … 腕。肩位置からtorsoにアタッチ
    ├── leftLeg / rightLeg: THREE.Mesh (CapsuleGeometry) … 脚。移動アニメーションでの微小回転対象
    └── (neck相当は省略。headをtorso上端に直接配置しMii風のデフォルメ比率とする)
```

#### 4.2.1 頭部スケールと顔パーツ座標の整合性（重要・レビュー指摘対応）

**問題**: `face.shape`に応じてheadに非一様`scale`（例: oval時`scale(0.9, 1.15, 0.95)`）を適用すると、
仮に目・鼻・口をheadの子として固定ローカル座標（例: 目`position.z=0.27`）で配置した場合、
親のscaleが子のローカル座標にも乗算されるため（Three.jsの`Object3D`はローカル変換行列に親の
scaleを合成してワールド座標を決定する）、輪郭を変えるとパーツの見た目位置が崩れる
（例: ovalにすると鼻や口が縦に間延びした位置にずれる）。

**対策（確定仕様）**:
- 目・鼻・口は`head`の子には**しない**。`bodyGroup`直下に`faceFeaturesGroup`（`THREE.Group`）を
  headと兄弟として新設し、その子として配置する。
- `faceFeaturesGroup.position`は`head.position`と常に同じ値を維持する（headの位置が変わる場合、
  例えば4.3節のY方向再配置時は`faceFeaturesGroup.position`も同時に更新する。位置は連動、
  scaleは非連動という関係）。
- `faceFeaturesGroup.scale`は常に`(1, 1, 1)`固定とし、`face.shape`によるheadのscale変更の影響を
  一切受けない。
- 目・鼻・口の`position`（4.2節本文記載の`eyes: z=0.27`, `nose: z=0.31`, `mouth: z=0.29`等）は
  そのまま`faceFeaturesGroup`のローカル座標として使用する（`faceFeaturesGroup`自体はscale=1のため、
  headのscaleに関わらず常に同じ絶対位置に描画される）。
- 髪(`hair`)は従来通り`head`の子のままとする。髪は頭部輪郭に追従して一緒に変形したほうが
  自然（oval時に髪だけ真球のままだと不自然）なため、scale継承を許容する（目・鼻・口とは扱いを分ける）。
- 頬（`cheekLeft`/`cheekRight`）についても本節と同じ非一様scale伝播の問題を避けるため、
  `head`の子にはせず`cheekGroup`（`head`と兄弟、scale固定）の子とする。詳細は4.2.2節を参照。
- `createCharacter`実装時は、`head`・`faceFeaturesGroup`・`cheekGroup`をいずれも`bodyGroup.add()`
  する順序とし、`character.parts`辞書には全て登録する（`parts.head`, `parts.faceFeaturesGroup`,
  `parts.cheekGroup`, `parts.leftEye`等）。

#### 4.2.2 square輪郭の頬Box（重要・レビュー指摘対応・2回目修正で親子関係を訂正）

**方針（レビュー指摘2回目対応・確定仕様）**: 頬（`cheekLeft`/`cheekRight`）は`head`の子には
**しない**。4.2.1節で目・鼻・口を`head`の子から`faceFeaturesGroup`（headと兄弟・scale固定）へ
移設したのと同じ理由（headの非一様scaleが子のローカル座標・サイズへ乗算されてしまう問題）が
頬にもそのまま当てはまるため、頬専用の`cheekGroup`（`THREE.Group`、`bodyGroup`直下に`head`と
兄弟として新設、scaleは常に`(1,1,1)`固定）を用意し、その子として配置する（4.2.1節の対策方針との
一貫性を保つため、`faceFeaturesGroup`とは別グループとして分離する。理由: 目・鼻・口は
「顔の造作」、頬Boxは「square輪郭時のみ表示される輪郭演出パーツ」であり役割が異なるため、
将来の拡張・削除のしやすさを考慮して混在させない）。

`face.shape === "square"`のとき、頬部分に角ばった印象を出すため`BoxGeometry`を左右対称に
`cheekGroup`の子として追加する。具体的な仕様は以下の通り確定する。

- ジオメトリ: `THREE.BoxGeometry(width=0.12, height=0.16, depth=0.1)`
- 配置: `cheekGroup`の子として、`cheekGroupのローカル座標系`で以下に配置する
  （`cheekGroup.position`は`head.position`と常に同じ値を維持し、`layoutParts()`で
  `head.position.y`を更新する際は`cheekGroup.position.y`にも同じ値を同期して設定する。
  4.2.1節の`faceFeaturesGroup`と同じ「位置は連動、scaleは非連動」の関係。4.3節・4.4.1節参照）。
  - `cheekLeft.position = (-0.26, -0.05, 0.08)`
  - `cheekRight.position = (0.26, -0.05, 0.08)`
  - `rotation`はいずれも`(0, 0, 0)`（軸並行のまま。回転による見栄え調整は行わない簡易仕様）
  - 上記の座標値は、旧仕様（`head`の子として配置していた場合）でsquare輪郭のhead scale
    `(1.05, 0.95, 1.0)`適用後の見た目位置とほぼ一致するよう、あらかじめscale適用後の見た目座標
    に近い値として設定したものである。`cheekGroup`はscale固定のため、この座標値は`face.shape`が
    どの値であっても常にこの絶対位置を意味する（`square`以外では`visible=false`のため実際には
    描画されない。座標自体はsquare表示時の見た目を基準に決め打ちした固定値であり、
    今後`square`のhead scale値を変更する場合はこの頬座標値も合わせて見直す必要がある）。
- マテリアル: `skinColor`と同一の`MeshStandardMaterial`を使用（肌の続きに見えるように頬の色を
  顔と同化させる。専用マテリアルインスタンスは持たず、headと同じマテリアル参照を共有してよい）。
- **生成・表示切替方式（4.4節ロジックとして確定）**: `replaceGeometry()`はジオメトリの差し替えのみを
  担い、メッシュ自体の追加/削除には対応しないため、`cheekLeft`/`cheekRight`は**`createCharacter()`時に
  常に生成しておき（`cheekGroup`の子として常駐）、`face.shape`に応じて`visible`プロパティのみを
  切り替える**方式を採用する（メッシュの動的追加・削除によるdispose漏れ・GC負荷を避けるため）。
  - `face.shape === "square"`のとき: `cheekLeft.visible = true; cheekRight.visible = true;`
  - `face.shape === "round"`または`"oval"`のとき: `cheekLeft.visible = false; cheekRight.visible = false;`
  - この表示切替は`updateCharacterPart(character, "face.shape", params)`内、headのscale適用と
    同じタイミングで行う（4.4.2節の分岐テーブル参照）。ジオメトリ・マテリアル自体はshape変更時も
    使い回し、再生成・dispose対象にはしない（Boxの寸法・位置は固定のため差し替え不要）。

各パーツの詳細:

- **胴体 (torso)**: `THREE.CapsuleGeometry(radius, length, capSegments=4, radialSegments=12)`。
  `radius = 0.28 * shoulderWidth * weight`、`length = 0.55 * weight`。色は服の代替として単色
  グレー系固定（`#cccccc`。服の色カスタマイズは本MVP対象外＝基本設計書の対応範囲外に準拠）。
- **頭部 (head)**: `THREE.SphereGeometry(radius=0.32, widthSegments=24, heightSegments=16)`。
  `face.shape` により非一様スケールを適用してバリエーションを出す（ジオメトリ自体は共通の球1種類のみ、
  スケールで作り分けることでプリミティブのみという制約を満たしつつ簡潔に実装する）。
  このscaleは`head`メッシュ自身にのみ適用し、`faceFeaturesGroup`（目・鼻・口）には影響させない
  （4.2.1節）。
  - `round`: `scale(1.0, 1.0, 1.0)`（真球に近い）
  - `oval`: `scale(0.9, 1.15, 0.95)`（縦長）
  - `square`: `scale(1.05, 0.95, 1.0)` + `cheekLeft`/`cheekRight`（4.2.2節の`BoxGeometry`）を
    `visible = true`にしてエッジ感を演出
- **頬 (cheekLeft/cheekRight)**: 4.2.2節を参照。`cheekGroup`（`head`と兄弟、scale固定）の子として
  常に生成し、`face.shape`に応じて`visible`のみ切り替える（`square`以外は`visible = false`）。
  `head`のscaleの影響を受けない構造とする点は目・鼻・口（`faceFeaturesGroup`）と同じ考え方。
- **目 (leftEye/rightEye)**: `THREE.SphereGeometry(radius=0.045, 12, 8)`。`faceFeaturesGroup`の子として
  配置し、`head`のscaleの影響を受けない（4.2.1節）。
  `position.x = ±0.11 * eyes.spacing`、`position.y = 0.03`、`position.z = 0.27`（頭部前面。
  `faceFeaturesGroup`のローカル座標。`faceFeaturesGroup`は`head`と同じワールド位置に配置されるため
  実質的にheadの前面座標として機能する）。
  `scale` を `eyes.size` で一様スケール。マテリアル色 = `face.eyes.color`。
- **鼻 (nose)**: `faceFeaturesGroup`の子として配置。`shape` によりジオメトリ種別を切替。
  - `normal`: `THREE.ConeGeometry(radius=0.035, height=0.07, 8)`（前方に軽く突き出す）
  - `small`: `THREE.SphereGeometry(radius=0.03, 8, 6)`
  - `wide`: `THREE.ConeGeometry(radius=0.05, height=0.05, 8)`
  - 共通で `nose.size` を一様スケールに乗算。`position = (0, 0, 0.31)`（`faceFeaturesGroup`ローカル座標）。
- **口 (mouth)**: `faceFeaturesGroup`の子として配置。`THREE.CapsuleGeometry(radius=0.015, length=0.09, 2, 6)`
  を基本形とし、`rotation.z = Math.PI / 2`（横向きに寝かせる）で横長の口形状にする。
  - `normal`: 回転なしの横一文字
  - `smile`: `rotation.x` に軽い正の角度を加え口角が上がったように見せる簡易表現
  - `flat`: 回転を素の横一文字のまま（**`normal`と現状幾何学的に完全に同一の見た目になる**。
    将来差別化の余地として型・分岐は分けておくが、MVP時点では意図的に未差別化とする。9章に明記）
  - `mouth.size` は `scale.x` に乗算。`position = (0, -0.09, 0.29)`（`faceFeaturesGroup`ローカル座標）。
    マテリアル色は肌より濃い固定色 `#8a4a4a`。
- **髪 (hair)**: `head`の子のGroup。`hair.style` によりGroupの中身（子メッシュ）を差し替える
  （headのscaleを継承し、頭部輪郭に追従して自然に変形させる。4.2.1節参照）。
  - `short`: 頭部球を一回り大きくした半球相当 = `THREE.SphereGeometry(radius=0.34, 24, 16, 0, Math.PI*2, 0, Math.PI*0.55)`
    （`phiStart/phiLength/thetaStart/thetaLength` で上半分のみ生成し帽子状に頭へかぶせる）
  - `long`: `short` と同じ上半分球 + 背面に後ろ髪用の`THREE.CapsuleGeometry(radius=0.16, length=0.4,
    capSegments=4, radialSegments=8)`を1本追加。配置は`hairGroup`（headの子）のローカル座標で
    `position = (0, -0.22, -0.16)`、`rotation.x = Math.PI / 2 - 0.15`（カプセルの長辺をほぼ垂直に
    保ちつつ、頭の丸みに沿わせるためZ軸奥へごくわずかに傾ける）。頭頂の半球下端あたりから
    背面に垂れる位置関係になるよう、`position.y`は半球の下端（半球radius=0.34に対し
    `thetaLength=Math.PI*0.55`の裾野）付近を基準に上記の値とする。
  - `bald`: 非表示（`hairGroup.visible = false`）
  - マテリアル色 = `hair.color`。
- **腕 (leftArm/rightArm)**: `THREE.CapsuleGeometry(radius=0.07, length=0.42, 4, 8)`。
  `torso` 側面上部から垂らす位置に配置。`position.x = ±(0.28*shoulderWidth + 0.09)`。
  マテリアル色は肌色 `skinColor` と同一（半袖・肌出し想定のシンプル表現）。
- **脚 (leftLeg/rightLeg)**: `THREE.CapsuleGeometry(radius=0.09, length=0.5, 4, 8)`。
  `position.x = ±0.13`、`torso` 下端から下に配置。マテリアル色は濃色ズボン固定 `#4a4a5a`。
- **肌色**: `skinColor` を適用するのは `head`・`leftEye`/`rightEye` の白目相当部分は今回省略しシンプルに
  黒目のみ配置する（実装コスト対効果を鑑み、白目球は追加しない。9章に簡略化として記載）・`leftArm`/`rightArm`。
  `torso`（服）・`leftLeg`/`rightLeg`（ズボン）には適用しない。

### 4.3 全体スケール・配置

- `bodyGroup.scale.set(1, body.height, 1)` で身長方向のみスケール（横方向の歪みを避ける）。
- 各パーツのローカル `position` は上記の通り固定値ベースで、`shoulderWidth`/`weight` は該当パーツの
  `radius`/`scale.x,z` にのみ影響させ、Y方向の積み上げ位置（頭・胴・脚の接続点）は
  `weight`/`height` 変化時にズレが出ないよう、torsoの`length`変化に応じて頭・脚の`position.y`を
  再計算する（4.4.1節の`layoutParts()`参照）。
- `head.position.y`を再計算する際は、`faceFeaturesGroup.position.y`・`cheekGroup.position.y`にも
  **必ず同じ値を同期して設定する**（4.2.1節・4.2.2節の通り、`faceFeaturesGroup`・`cheekGroup`は
  いずれもheadと同じワールド位置を維持する必要があるため。`layoutParts()`内でheadのposition算出
  直後に両グループへ同値を代入する実装とする）。

#### 4.3.1 body系パラメータで`layoutParts()`が必要になる理由（レビュー指摘対応・2回目修正）

**注記（重要）**: 本節はあくまで「`body.height`/`body.shoulderWidth`/`body.weight`という
3つの詳細パラメータそれぞれについて、なぜ`layoutParts()`の再計算が必要/不要になるのか」という
**理由の説明**にとどめる。実際に`updateCharacterPart`がどの粒度の`changedPath`で呼ばれるか、
呼び出し時にどの処理を実行するかという**確定仕様そのものは4.4.2節の分岐テーブルを正とする**。
`customization-ui.js`は7.3節の通り最初から`"body.height"`/`"body.shoulderWidth"`/
`"body.weight"`という詳細パスを個別に渡す設計であり、`updateCharacterPart(character, "body",
params)`のように`"body"`という粗いpartName・単一の呼び出しで3パラメータをまとめて処理する
呼び出しは**発生しない**（1回目修正で4.4.2節・7.3節を詳細パス方式に統一した際、本節の記述更新が
漏れていたための訂正）。

`body.height`/`body.shoulderWidth`/`body.weight`はそれぞれ影響範囲が異なり、
`layoutParts()`の要否も異なる。理由は以下の通り。

| 変更パラメータ | 直接更新するプロパティ | `layoutParts()`での再計算が必要か | 理由 |
|---|---|---|---|
| `body.height` | `bodyGroup.scale.y = body.height` | 不要 | `bodyGroup`全体のscaleで表現するため、各子パーツのローカル`position`自体は変化しない。torsoの実寸（length/radius）も変わらないため、頭・腕・脚の接続点の再計算は不要（`cheekGroup`・`faceFeaturesGroup`も`head`と同様に`bodyGroup`配下でscaleの影響を暗黙的に受けて自動追従するため、個別の再計算は不要かつ実害はない） |
| `body.shoulderWidth` | `torso`のジオメトリ（`radius = 0.28*shoulderWidth*weight`で再生成）、`leftArm`/`rightArm.position.x` | 必要 | torsoの`radius`が変わり腕の付け根x座標がずれるため、`leftArm`/`rightArm.position.x`の再計算が必要（4.4.1節） |
| `body.weight` | `torso`のジオメトリ（`radius`/`length`とも再計算）、`leftArm`/`rightArm.position.x` | 必要 | torsoの`length`が変わり頭・脚の接続点y座標がずれ、`radius`変化により腕の付け根x座標もずれるため、`layoutParts()`でまとめて再計算する必要がある |

- `body.shoulderWidth`/`body.weight`変更時の処理順序（4.4.2節の分岐テーブルの`"body.shoulderWidth"`
  / `"body.weight"`行に対応する具体的な実行内容）:
  1. `params.body.shoulderWidth`/`params.body.weight`から`torso`の新しい`radius`/`length`を算出し、
     新規`CapsuleGeometry`を生成して`replaceGeometry(torso, newGeometry)`で差し替える
     （半径・長さのみの変更であり列挙型の変更ではないが、本設計では実装簡潔性を優先し
     scale調整ではなく**都度ジオメトリを新規生成して差し替える**方式に統一する）。
  2. `layoutParts(character)`を呼び、torsoの新しい`length`を基準に`head`/`faceFeaturesGroup`/
     `leftLeg`/`rightLeg`の`position.y`、`shoulderWidth`を基準に`leftArm`/`rightArm`の
     `position.x`を再計算する（4.4.1節）。
- `body.height`変更時は上記1.2.を行わず、`bodyGroup.scale.y`の更新のみで完結する
  （4.4.2節の`"body.height"`行の通り）。

### 4.4 主要関数・シグネチャ

補足（レビュー指摘対応・2回目修正）: `createCharacter()`は各パーツをデフォルトのローカル座標で
一旦生成した後、**内部で`layoutParts(character)`を呼び出して**torsoの初期`length`/`radius`に
基づく`head`/`faceFeaturesGroup`/`cheekGroup`/`leftLeg`/`rightLeg`の`position.y`、`leftArm`/`rightArm`の
`position.x`を最終決定する（詳細は4.4.1節）。初期構築時とパラメータ変更後の再計算とで
同一の`layoutParts()`ロジックを使い回すことで、初期表示とパラメータ変更後の表示に配置ズレが
生じないようにする。

```js
// js/character.js
import * as THREE from 'three';

/**
 * キャラクターを新規構築する。
 * 各パーツ（torso/head/faceFeaturesGroup/cheekGroup/leftArm/rightArm/leftLeg/rightLeg等）を生成し
 * bodyGroupへ追加した後、内部でlayoutParts(character)を呼び出してtorsoの初期寸法に基づく
 * 各パーツのposition.y/xを決定してから返す（4.4.1節参照。初回構築時もupdateCharacterPart経由の
 * 再計算時も同じlayoutParts()ロジックを使うため、初期表示とパラメータ変更後の表示にズレが出ない）。
 * @param {ParamsObject} params - js/params.js の正規化済みパラメータ
 * @returns {{
 *   root: THREE.Group,            // シーンに addされる最上位オブジェクト
 *   parts: Record<string, THREE.Object3D>, // パーツ名→Object3Dの辞書（update時に参照）
 *   params: ParamsObject          // 現在適用中のパラメータ（内部状態として保持）
 * }} character オブジェクト（以後 controls.js / main.js が保持・参照する）
 */
export function createCharacter(params)

/**
 * 指定パーツ（または全体）にパラメータを反映する。既存メッシュのプロパティ変更のみで対応し、
 * 形状の列挙型が変わる場合（face.shape, hair.style, nose.shape, mouth.shape）のみジオメトリを
 * 再生成する。partNameの粒度とジオメトリ再生成要否の判定方式は4.4.2節を参照。
 * @param {ReturnType<typeof createCharacter>} character
 * @param {"gender"|"body.height"|"body.shoulderWidth"|"body.weight"|"skinColor"|
 *         "face.shape"|"face.eyes.size"|"face.eyes.spacing"|"face.eyes.color"|
 *         "face.nose.size"|"face.nose.shape"|"face.mouth.size"|"face.mouth.shape"|
 *         "hair.style"|"hair.color"|"all"} partName - 更新対象の粒度（詳細パス方式。4.4.2節参照）
 *        （customization-ui.jsのonChangeが返すchangedPathをそのまま渡す。7.3節参照。
 *          テーブルに無い値が来た場合は4.5節の通り"all"にフォールバックする）
 * @param {ParamsObject} params - 適用する最新の全体パラメータ
 * @returns {void}
 */
export function updateCharacterPart(character, partName, params)

/**
 * torsoの寸法（radius/length）を基準に、頭・faceFeaturesGroup・cheekGroup・腕・脚の接続位置(position.y/x等)を
 * 再計算し直す内部関数。以下の2箇所から呼ばれる（4.3.1節・4.4.2節参照）。
 *   (1) createCharacter()内部（初期構築時の配置決定。4.4節本文参照）
 *   (2) updateCharacterPart(character, "body.shoulderWidth"|"body.weight", params)内部
 *       （torso再生成の直後。4.3.1節・4.4.2節の分岐テーブル参照。"body.height"単独変更時は
 *       呼ばれない）
 * 外部には公開しない。
 * @param {ReturnType<typeof createCharacter>} character
 */
function layoutParts(character)

/**
 * gender/nose.shape/mouth.shape/face.shape/hair.style 変更時、対象パーツのジオメトリのみを
 * 破棄(dispose)して作り直す内部ヘルパー。メモリリーク防止のため旧geometryは必ずdispose()する。
 * square輪郭のcheekLeft/cheekRightのようにジオメトリ自体は不変でvisible切替のみで済むケースは
 * このヘルパーを使わず、4.4.2節の通りvisibleの直接切替で対応する（本関数はジオメトリ形状そのものが
 * 変わるケース専用）。
 * @param {THREE.Mesh|THREE.Group} part
 * @param {THREE.BufferGeometry|THREE.BufferGeometry[]} newGeometry
 */
function replaceGeometry(part, newGeometry)
```

#### 4.4.1 `layoutParts()` の具体的な再計算内容

`layoutParts(character)`は呼ばれるたびに以下を無条件に再計算する（呼び出し元での条件分岐は行わない。
`createCharacter()`内の初回呼び出し、および`updateCharacterPart(character, "body.shoulderWidth"|
"body.weight", params)`内からの呼び出しのいずれであっても同じロジックを実行し、関数内部でも
判定を持たずシンプルに全項目を再計算する。4.3.1節・4.4節本文参照）。

1. `torso.geometry.parameters`（または保持している現在のradius/length算出値）から`torsoHalfLength`を求める。
2. `head.position.y = torsoTopY(torsoHalfLength)`を算出して設定する（torso上端 + head半径分のオフセット）。
3. `faceFeaturesGroup.position.y = head.position.y`、`cheekGroup.position.y = head.position.y`
   （いずれも同値を代入。4.2.1節・4.2.2節・4.3節参照）。
4. `leftLeg.position.y = torsoBottomY(torsoHalfLength)`、`rightLeg.position.y`も同様に設定する。
5. `leftArm.position.x = -(0.28 * shoulderWidth + 0.09)`、`rightArm.position.x = +(同値)`を
   現在の`params.body.shoulderWidth`から再計算する。
6. `hair`グループはheadの子のため、head.position.yの変更は自動的に追従する（再計算不要）。

補足（レビュー指摘対応・2回目修正）: `createCharacter()`内での初回呼び出し時点では、上記1.の
`torso.geometry.parameters`はデフォルトパラメータ（または渡された`params`）から算出済みの初期
`radius`/`length`を参照する（torso生成直後に呼ぶため、既に確定済みの値である）。初期構築・
再計算のどちらの経路でも「torsoの現在の寸法から他パーツ位置を導出する」という処理内容は
完全に同一であり、呼び出し元による分岐は関数内部に持たない。

#### 4.4.2 `updateCharacterPart` の partName 粒度とジオメトリ再生成要否の判定方式（レビュー指摘対応）

**問題**: `customization-ui.js`から渡される`changedPath`（7.3節）が`"face"`のような粗い粒度の場合、
`face.eyes.size`（数値スケール変更のみで済む）と`face.shape`（ジオメトリ再生成が必要）を
区別できず、無駄な再生成または再生成漏れが起きるおそれがある。

**対策（確定仕様）**: 差分検出（前回paramsとの比較）ではなく、**7.3節のonChangeが渡す
`changedPath`をより詳細なドット区切りパスに統一する**方式を採用する（実装・デバッグの両面で
差分検出ロジックより単純で確実なため）。`updateCharacterPart`側は受け取った`changedPath`の
プレフィックスに応じて以下の分岐テーブルで処理を行う。

| `changedPath`の値 | 実施する処理 | ジオメトリ再生成 |
|---|---|---|
| `"gender"` | `body`一式を性別プリセット値で更新（3.3節） → `bodyGroup.scale.y`更新 → torso再生成 → `layoutParts()`実行（4.3.1節の`"body.shoulderWidth"`/`"body.weight"`相当の処理を性別変更時にもまとめて実行する） | torsoのみ再生成 |
| `"body.height"` | `bodyGroup.scale.y`更新のみ（4.3.1節参照） | 不要 |
| `"body.shoulderWidth"` / `"body.weight"` | torso再生成 → `layoutParts()`実行（4.3.1節参照） | torsoのみ再生成 |
| `"skinColor"` | `head`/`cheekLeft`/`cheekRight`/`leftArm`/`rightArm`の`material.color.set()` | 不要 |
| `"face.shape"` | `head.scale`を新shapeの値へ設定 + `cheekLeft`/`cheekRight`の`visible`切替（4.2.2節） | 不要（scale調整とvisible切替のみ。Box自体は常駐のため再生成しない） |
| `"face.eyes.size"` | `leftEye.scale` / `rightEye.scale`を一様スケール設定 | 不要 |
| `"face.eyes.spacing"` | `leftEye.position.x` / `rightEye.position.x`を再計算 | 不要 |
| `"face.eyes.color"` | `leftEye`/`rightEye`の`material.color.set()` | 不要 |
| `"face.nose.size"` | `nose.scale`を一様スケール設定 | 不要 |
| `"face.nose.shape"` | `replaceGeometry(nose, 新ジオメトリ)` | 必要 |
| `"face.mouth.size"` | `mouth.scale.x`設定 | 不要 |
| `"face.mouth.shape"` | `mouth.rotation.x`の切替（`replaceGeometry`は不要。回転角のみの変更のためジオメトリ自体は共通。
  4.2節の通り`normal`/`flat`は結果的に同一の回転角になる） | 不要 |
| `"hair.style"` | `replaceGeometry`相当（hairGroup配下の子を全dispose後、新styleの子メッシュを`hairGroup.add()`） | 必要 |
| `"hair.color"` | hairGroup配下の全メッシュの`material.color.set()` | 不要 |
| `"all"` | 上記の全項目を一括実行（リセット時に使用） | 必要（列挙型を含む全パーツ再生成） |

- `changedPath`が上記テーブルに無い未知の文字列だった場合（想定外の呼び出し）は、
  安全側に倒して`"all"`と同等の全再構築処理にフォールバックする（4.5節のエラー処理方針に追記）。
- この方式により、`customization-ui.js`側の`onChange`は各コントロールごとに自身の担当する
  詳細パスをハードコードして渡すだけでよく（7.3節参照）、`character.js`側は前回値との比較処理
  （差分検出）を一切持たずに済む。

### 4.5 エラー処理
- `createCharacter` に渡す `params` は呼び出し側（main.js）が必ず `normalizeParams()` 済みのものを
  渡す前提とし、character.js内部では改めての値域チェックは行わない（責務の分離。ただし
  `NaN`・`undefined` が来た場合の防御として、各数値使用箇所は `Number.isFinite(v) ? v : デフォルト値`
  の簡易ガードのみ入れる）。
- ジオメトリ生成に失敗する状況は通常想定されない（WebGL未対応はmain.js側で事前に検知しcharacter.jsは
  呼び出されない設計とする。7章参照）。
- `updateCharacterPart`に未知の`changedPath`（4.4.2節のテーブルに存在しない文字列）が渡された場合、
  例外は投げず`"all"`相当の全再構築処理にフォールバックする（無視して何もしないと画面反映漏れに
  気づきにくいため、安全側＝過剰更新のほうを選ぶ）。

---

## 5. `js/field.js` — 地面フィールド生成

### 5.1 責務
地面（平面）と簡易な区画模様を持つ小さなフィールドを生成し、`THREE.Group` または `THREE.Mesh` を返す。

### 5.2 構成
- 地面本体: `THREE.PlaneGeometry(width=10, height=10, 10, 10)` を `rotation.x = -Math.PI/2` で
  水平に配置。マテリアルは `THREE.MeshStandardMaterial({ color: 0x6fae5c })`（芝生風の緑）。
- 簡易な区画模様: 追加の外部テクスチャは使用禁止のため、`THREE.GridHelper(size=10, divisions=10,
  colorCenterLine=0x3d7a34, colorGrid=0x4f8f45)` を地面のわずかに上（`y=0.01`）に重ねて区画線とする。
- 移動可能範囲は地面の一辺の半分（`FIELD_HALF_SIZE = 4.8`、端に余白を持たせる）とし、この定数を
  `field.js` からexportして `controls.js` の移動範囲クランプに利用する。

### 5.3 主要関数

```js
// js/field.js
import * as THREE from 'three';

export const FIELD_HALF_SIZE = 4.8; // キャラクター移動可能範囲（原点からの正方形半幅）

/**
 * 地面フィールドを生成する。
 * @returns {THREE.Group} - PlaneMesh と GridHelper をまとめたGroup（シーンに1回addする）
 */
export function createField()
```

---

## 6. `js/controls.js` — 入力処理・移動・追従カメラ

### 6.1 責務
- WASD/矢印キーの押下状態管理。
- キー入力に基づくキャラクターの移動・向き変更（フィールド範囲内にクランプ）。
- キャラクターに追従する三人称カメラの位置・注視点の毎フレーム更新。

### 6.2 キー入力仕様
- 対象キー: `KeyW`/`ArrowUp`（前進）, `KeyS`/`ArrowDown`（後退）, `KeyA`/`ArrowLeft`（左移動）,
  `KeyD`/`ArrowRight`（右移動）。`event.code` ベースで判定する（キーボード配列非依存のため）。
- 押下状態は `Set<string>` (`pressedKeys`) で保持し、`keydown`で追加・`keyup`で削除する。
- 移動方式: **カメラ相対ではなくワールド軸基準の平面移動**（MVPとして単純さを優先）。
  - 前進(W/↑): `-Z` 方向、後退(S/↓): `+Z` 方向、左(A/←): `-X` 方向、右(D/→): `+X` 方向。
  - 斜め移動時は合成ベクトルを正規化してから速度を掛ける（斜め移動が速くなる不具合を防止）。
  - 移動速度: `MOVE_SPEED = 2.5`（units/sec）。フレーム時間 `deltaTime` を乗算しフレームレート非依存にする。
- 向き変更: 移動ベクトルが非ゼロの場合、キャラクターの`root.rotation.y`を移動方向へ
  滑らかに補間する（`THREE.MathUtils.lerp`または球面線形補間相当の簡易実装で、
  `ROTATION_LERP_FACTOR = 0.2`程度を目安に毎フレーム現在角度→目標角度へ近づける）。
  移動ベクトルがゼロ（キー入力なし）の間は向きを保持する。
- 範囲制限: 移動後の座標を `field.js` が公開する `FIELD_HALF_SIZE` で `THREE.MathUtils.clamp(x,
  -FIELD_HALF_SIZE, FIELD_HALF_SIZE)`（X, Z共に）してからキャラクターへ反映する。

### 6.3 カメラ追従仕様
- カメラ種別: `THREE.PerspectiveCamera(fov=50, aspect, near=0.1, far=100)`（main.js側で生成し、
  `setupControls`に渡す）。
- 追従方式: キャラクターの背後・やや上方に一定のオフセットを保つ三人称固定角度カメラ
  （プレイヤーによるカメラ操作＝マウスドラッグでの視点回転は本MVP対象外。基本設計書のUI概要にも
  カメラ操作UIの記載はないため非対応とする）。
- オフセット定義: キャラクターのローカル向き（`root.rotation.y`）に対する相対オフセットとして
  `CAMERA_OFFSET = new THREE.Vector3(0, 2.2, 4.5)`（キャラクター後方4.5・上方2.2）を、
  現在の`root.rotation.y`で回転させた上でキャラクター位置に加算し、目標カメラ位置とする
  （キャラクターの向き変化に伴いカメラも追従して回り込む、いわゆる背後追従カメラ）。
- 注視点: キャラクターの頭部付近 `character.root.position + Vector3(0, 1.0, 0)` を注視点とする。
- スムージング: 目標カメラ位置・注視点それぞれに対し、現在値からの線形補間
  (`camera.position.lerp(targetPosition, CAMERA_LERP_FACTOR)`, `CAMERA_LERP_FACTOR = 0.08`)
  を毎フレーム適用する（急激なカメラ移動を避けるため。注視点も同様に内部で保持する
  `Vector3`をlerpしてから`camera.lookAt()`する）。

### 6.4 主要関数・シグネチャ

```js
// js/controls.js
import * as THREE from 'three';

const MOVE_SPEED = 2.5;
const ROTATION_LERP_FACTOR = 0.2;
const CAMERA_LERP_FACTOR = 0.08;
const CAMERA_OFFSET = new THREE.Vector3(0, 2.2, 4.5);

/**
 * キー入力・移動・カメラ追従のセットアップ。イベントリスナーの登録もここで行う。
 * @param {ReturnType<typeof import('./character.js').createCharacter>} character
 * @param {THREE.PerspectiveCamera} camera
 * @returns {{
 *   update: (deltaTime: number) => void,  // 毎フレームmain.jsのアニメーションループから呼ぶ
 *   dispose: () => void                    // イベントリスナー解除（画面遷移等が発生する場合用。MVPでは未使用でも定義しておく）
 * }} controls ハンドル
 */
export function setupControls(character, camera)
```

### 6.5 処理フロー（テキスト）
```
setupControls(character, camera) 呼び出し時:
  1. pressedKeys = new Set() を初期化
  2. window.addEventListener('keydown', ...) / ('keyup', ...) でpressedKeysを更新
  3. cameraの初期位置・lookAtを現在のcharacter位置ベースで即座に1回セット（初回のカクつき防止）
  4. { update, dispose } を返す

毎フレーム update(deltaTime) 呼び出し時:
  1. pressedKeysから移動入力ベクトル(x, z)を算出・正規化
  2. 入力が非ゼロなら:
     a. 移動先候補座標 = 現在座標 + 入力ベクトル * MOVE_SPEED * deltaTime
     b. FIELD_HALF_SIZEでX/Zをクランプ
     c. character.root.positionを更新
     d. 目標向き角度を移動ベクトルからatan2で算出し、現在のrotation.yをROTATION_LERP_FACTORで補間
  3. 目標カメラ位置 = character.root.position + CAMERA_OFFSETをroot.rotation.yで回転
  4. camera.positionを目標カメラ位置へCAMERA_LERP_FACTORで補間
  5. 注視点target = character.root.position + (0,1.0,0) へ内部保持lookAtTargetを補間
  6. camera.lookAt(lookAtTarget)
```

---

## 7. `js/customization-ui.js` — UIコントロール生成・バインド

### 7.1 責務
- カスタマイズパネル内のスライダー・カラーピッカー・セレクトボックスをJSで動的生成し、
  `index.html`側には空のコンテナ（例: `<div id="customization-panel"></div>`）のみ用意する
  （UI構造をJS側に集約し、`params.js`の値域定義と1:1で対応させることで齟齬を防ぐ）。
- 各コントロールの`input`イベント発火時に、現在のパラメータオブジェクトを更新し、
  `character.js`の`updateCharacterPart`と`storage.js`（自動保存は行わないが「未保存」状態表示のため）
  へ橋渡しするコールバックを呼ぶ。

### 7.2 生成するコントロール一覧

| セクション | コントロール種別 | 対象パラメータ |
|---|---|---|
| 性別 | ラジオボタン or セレクト | `gender` |
| 体形 | スライダー×3 | `body.height`, `body.shoulderWidth`, `body.weight` |
| 肌の色 | `<input type="color">` | `skinColor` |
| 目 | スライダー×2 + カラーピッカー | `face.eyes.size`, `face.eyes.spacing`, `face.eyes.color` |
| 鼻 | スライダー + セレクト | `face.nose.size`, `face.nose.shape` |
| 口 | スライダー + セレクト | `face.mouth.size`, `face.mouth.shape` |
| 輪郭 | セレクト | `face.shape` |
| 髪 | セレクト + カラーピッカー | `hair.style`, `hair.color` |
| 操作 | ボタン×2 | 「保存」「リセット」 |

- スライダーの`min`/`max`/`step`は`params.js`の`PARAM_RANGES`から動的に設定する（ハードコード禁止）。
- セレクトの選択肢は`params.js`の`ENUM_OPTIONS`から動的生成する。

### 7.3 主要関数・シグネチャ

```js
// js/customization-ui.js

/**
 * カスタマイズパネルのDOMを構築し、イベントをバインドする。
 * @param {HTMLElement} containerEl - パネルのルート要素（index.htmlの空div）
 * @param {ParamsObject} initialParams - 初期表示に使うパラメータ（storage.jsのロード結果 or デフォルト）
 * @param {(newParams: ParamsObject, changedPath: string) => void} onChange
 *        - いずれかのコントロールが変更された際に呼ばれるコールバック。
 *          changedPathは各コントロールが担当するパラメータの**フルドット区切りパス**を渡す
 *          （character.js側4.4.2節の分岐テーブルとキーを完全一致させる。粗い粒度の
 *          "face"/"body"のような文字列は使わない。例外は"gender"と"skinColor"のみで、これらは
 *          元々1階層かつジオメトリ再生成が不要なため単一キーのままとする）。
 *          具体的な対応（コントロール→changedPath）は下表の通り、7.2節の各コントロールに対し
 *          1:1で固定する:
 *          - 性別セレクト → `"gender"`
 *          - 体形スライダー(身長) → `"body.height"`
 *          - 体形スライダー(肩幅) → `"body.shoulderWidth"`
 *          - 体形スライダー(体重感) → `"body.weight"`
 *          - 肌の色ピッカー → `"skinColor"`
 *          - 目の大きさスライダー → `"face.eyes.size"`
 *          - 目の間隔スライダー → `"face.eyes.spacing"`
 *          - 目の色ピッカー → `"face.eyes.color"`
 *          - 鼻の大きさスライダー → `"face.nose.size"`
 *          - 鼻の形セレクト → `"face.nose.shape"`
 *          - 口の大きさスライダー → `"face.mouth.size"`
 *          - 口の形セレクト → `"face.mouth.shape"`
 *          - 輪郭セレクト → `"face.shape"`
 *          - 髪型セレクト → `"hair.style"`
 *          - 髪色ピッカー → `"hair.color"`
 *          いずれのコントロールも自分のDOM要素生成時にこの固定パス文字列をクロージャで
 *          保持しておき、`input`イベントハンドラ内で`onChange(newParams, "対応する固定パス")`を
 *          呼ぶだけでよい（差分検出等の動的な判定ロジックはcustomization-ui.js側にも持たせない）。
 * @param {() => void} onSave - 「保存」ボタン押下時のコールback
 * @param {() => void} onReset - 「リセット」ボタン押下時のコールバック
 * @returns {{
 *   refreshUI: (params: ParamsObject) => void  // リセット等でパラメータが外部から変わった際、
 *                                                // UIコントロールの表示値を再同期するための関数
 * }}
 */
export function setupCustomizationUI(containerEl, initialParams, onChange, onSave, onReset)
```

補足: この「コントロールごとに固定の詳細パスを持つ」方式により、`character.js`側（4.4.2節）は
`changedPath`のプレフィックス一致だけで再生成要否を判定でき、`customization-ui.js`側・
`character.js`側のどちらにも「前回paramsとの差分を検出する」ロジックを持たせずに済む
（両モジュールとも実装がシンプルになり、粒度不一致による無駄な再生成・反映漏れのリスクを排除する）。

### 7.4 保存状態表示
- ヘッダーの「保存状態表示」領域（`index.html`に`<span id="save-status"></span>`を用意）は
  `customization-ui.js`ではなく`main.js`が一元管理する（UI操作全般の起点はcustomization-uiだが、
  保存状態はstorage.jsの結果に依存するため、main.jsが両者を仲介する設計とする。9章参照）。
- 表示文言:
  - パラメータ変更後・未保存: 「未保存の変更があります」
  - 保存ボタン押下・成功: 「保存しました（HH:MM:SS）」
  - 保存失敗（7.5節参照）: 「保存に失敗しました（ブラウザのストレージ設定をご確認ください）」

---

## 8. `js/storage.js` — localStorage 保存・読込

### 8.1 キー名
- `localStorage` キー: **`"3d-character-creator:params"`**（アプリ名prefixで他アプリとの衝突を回避。
  既存PDF編集ツール側はlocalStorageを使用していないため衝突リスクは無いが、命名規則として明示する）。

### 8.2 保存タイミング
- **明示的な「保存」ボタン押下時のみ**保存する（自動保存は行わない）。基本設計書3章の「『保存』
  ボタン押下でlocalStorageへ保存」という記述に準拠。
- パラメータ変更操作自体（スライダー操作等）は保存をトリガーしない。これにより「保存」ボタンの
  意味が明確になり、7.4節の「未保存の変更があります」表示との整合も取れる。

### 8.3 読込タイミング
- ページロード時（`main.js`の初期化処理内で）に1回だけ`loadFromStorage()`を呼ぶ。
- 保存データが存在する場合はそれをキャラクターとUIの初期状態として反映する。
- 保存データが無い場合、または壊れている場合は`createDefaultParams()`の結果を初期状態とする。

### 8.4 主要関数・シグネチャ

```js
// js/storage.js
import { normalizeParams, createDefaultParams } from './params.js';

const STORAGE_KEY = '3d-character-creator:params';

/**
 * 現在のパラメータをlocalStorageへ保存する。
 * @param {ParamsObject} params
 * @returns {{ ok: boolean, error?: Error }}
 *   - 成功時: { ok: true }
 *   - 失敗時（プライベートブラウジングでの容量制限、QuotaExceededError等）:
 *     { ok: false, error } を返す。例外はここで必ずcatchし、呼び出し元(main.js)には投げない。
 */
export function saveToStorage(params)

/**
 * localStorageからパラメータを読み込む。
 * @returns {{ params: ParamsObject, restored: boolean }}
 *   - 保存データが存在し、パースおよびnormalizeParamsに成功した場合:
 *     { params: <正規化済みの復元データ>, restored: true }
 *   - 保存データが存在しない場合、JSON.parseに失敗した場合、normalizeParams内部で
 *     大部分の項目がデフォルト補完になった場合であっても、例外は投げずに
 *     { params: createDefaultParams() または 正規化済みデータ, restored: <bool> } を返す。
 *   - 具体的な判定: localStorage.getItem() が null → restored:false, デフォルト値を返す。
 *     JSON.parseが例外を投げる（壊れた文字列）→ catchしてrestored:false, デフォルト値を返す。
 *     parseは成功したがオブジェクト構造が不正 → normalizeParams()が可能な範囲で補完した上で
 *     restored:true として返す（部分的にでも復元できるものは復元する方針）。
 */
export function loadFromStorage()

/**
 * localStorageの保存データを削除する。「リセット」ボタンの仕様（8.5節）に基づき使用要否が決まる。
 * @returns {void}
 */
export function clearStorage()
```

### 8.5 エラー処理・フォールバック方針
- `localStorage`自体が利用不可（プライベートブラウジング等でAPIアクセス時に例外が飛ぶケース）の場合、
  `saveToStorage`/`loadFromStorage`/`clearStorage`はいずれも内部で`try...catch`し、
  例外を外部に伝播させない。
  - `loadFromStorage`が失敗した場合は必ず`createDefaultParams()`相当を返す（アプリの起動自体は
    継続させる。エラーダイアログ等は出さず、7.4節の保存状態表示エリアに「読込に失敗しました。
    デフォルト設定で開始します」を初期表示する程度に留める）。
  - `saveToStorage`が失敗した場合は`{ ok: false, error }`を返し、`main.js`が7.4節の失敗文言を表示する。

---

## 9. リセットボタンの挙動（確定仕様）

基本設計書レビューでの指摘事項に対する確定仕様:

- 「リセット」ボタン押下時の挙動は以下の**両方**を行う。
  1. 画面上のキャラクター・カスタマイズパネルの表示パラメータを`createDefaultParams()`の値へ戻す
     （3Dキャンバスへ即時反映、UIコントロールの表示値も`refreshUI()`で再同期）。
  2. **`localStorage`の保存データも`clearStorage()`で削除する。**
- 理由: 「リセット」を押した後に何もせずページをリロードした場合、保存データが残っていると
  リロード時に旧パラメータが復元されてしまい、ユーザーの「リセットした」という意図と矛盾する。
  保存データも合わせて削除することで、リセット後の状態がリロード後も一貫して維持される
  （ユーザーが再度「保存」を押すまでは未保存扱いとし、7.4節の表示を「未保存の変更があります」に戻す）。
- 確認ダイアログ: 誤操作防止のため、リセット実行前に`window.confirm('カスタマイズ内容をリセットします。
  よろしいですか？')`相当の確認を挟む（既存PDF編集ツールのUI刷新（モーダルダイアログ化）の流れとは別に、
  本アプリはMVPかつ標準`confirm()`で十分なシンプルさを優先する。9.xの変更点ではなく本節の確定仕様として扱う）。

---

## 10. `js/main.js` — 初期化・結線・レンダリングループ

### 10.1 責務
- Three.jsのScene/Camera/Rendererの生成。
- WebGL対応チェック。
- 各モジュール（field, character, controls, customization-ui, storage）の初期化・結線。
- `requestAnimationFrame`による毎フレーム更新（キャラクター移動・カメラ追従・レンダリング）。
- ウィンドウリサイズ対応。

### 10.2 主要関数

```js
// js/main.js
import * as THREE from 'three';
import { createField } from './field.js';
import { createCharacter, updateCharacterPart } from './character.js';
import { setupControls } from './controls.js';
import { setupCustomizationUI } from './customization-ui.js';
import { saveToStorage, loadFromStorage, clearStorage } from './storage.js';
import { createDefaultParams } from './params.js';

/** WebGLがこの環境で利用可能か判定する。 */
function isWebGLAvailable(): boolean

/** アプリ全体の初期化。DOMContentLoaded後に1回呼ばれる。 */
function init(): void

/** requestAnimationFrameループ本体。deltaTime計算・controls.update()・renderer.render()を行う。 */
function animate(timestampMs: number): void

/** window.resizeイベントでcamera.aspect・renderer.setSizeを更新する。 */
function onWindowResize(): void
```

### 10.3 初期化処理フロー

```
DOMContentLoaded
  → isWebGLAvailable() チェック
      false の場合:
        3Dキャンバス領域にエラーメッセージ（例:「お使いのブラウザ/環境では3D表示に
        対応していません。最新のChromeまたはEdgeでお試しください。」）をDOM挿入して
        処理を終了する（レンダラー等は一切生成しない。11章参照）。
      true の場合: 以下を続行
  → { params, restored } = loadFromStorage()
  → scene, camera(PerspectiveCamera), renderer(WebGLRenderer) を生成
      - renderer.setSize(canvasコンテナの幅・高さ)
      - canvasコンテナへrenderer.domElementをappend
  → 光源を追加: THREE.AmbientLight + THREE.DirectionalLight（1灯で簡易な陰影を付与）
  → field = createField(); scene.add(field)
  → character = createCharacter(params); scene.add(character.root)
  → controlsHandle = setupControls(character, camera)
  → uiHandle = setupCustomizationUI(
        panelEl, params,
        onChange = (newParams, changedPath) => {
            updateCharacterPart(character, changedPath, newParams);
            現在のparams変数を更新;
            uiHandle.refreshUI(現在のparams);
              // changedPathが'gender'の場合、character.jsのupdateCharacterPart内部で
              // body.height/shoulderWidth/weightが性別プリセット値(3.3節)へ上書きされるため、
              // カスタマイズパネル側の体形スライダー等の表示値もここで再同期する必要がある
              // （コードレビューで発見。14.4節参照）。gender以外の変更では表示値に実質変化は
              // ないため、changedPathによる分岐は行わずシンプルに常時呼び出す。
            保存状態表示を「未保存の変更があります」に更新;
        },
        onSave = () => {
            result = saveToStorage(現在のparams);
            結果に応じ7.4節の表示を更新;
        },
        onReset = () => {
            confirm()でユーザーに確認;
            確認されたら:
              現在のparams = createDefaultParams();
              updateCharacterPart(character, 'all', 現在のparams);
              uiHandle.refreshUI(現在のparams);
              clearStorage();
              保存状態表示を「未保存の変更があります」に更新;
        }
    )
  → 保存状態表示の初期セット（restoredの値に応じ「保存済みのキャラクターを復元しました」/
    「デフォルト設定で開始しました」等）
  → window.addEventListener('resize', onWindowResize)
  → requestAnimationFrame(animate) 開始
```

### 10.4 毎フレーム処理フロー（`animate`）

```
animate(timestampMs):
  1. deltaTime = (timestampMs - lastTimestampMs) / 1000 を算出（初回はdeltaTime=0扱い）
  2. lastTimestampMs = timestampMs
  3. controlsHandle.update(deltaTime)   // キー入力反映・キャラクター移動・カメラ追従
  4. renderer.render(scene, camera)
  5. requestAnimationFrame(animate) で次フレーム予約
```

### 10.5 全体データフロー図（テキスト）

```
[UIコントロール操作]
        │ input event
        ▼
customization-ui.js: onChangeコールバック発火
        │ (newParams, changedPath)
        ▼
main.js: character.updateCharacterPart(character, changedPath, newParams)
        │                                   └→ 3Dキャンバスへ即時反映
        ▼
main.js: 現在paramsを更新 / 保存状態表示を更新
        │
        │  （ユーザーが「保存」ボタン押下）
        ▼
storage.js: saveToStorage(params) → localStorage永続化


[キー入力]
        │ keydown/keyup
        ▼
controls.js: pressedKeys更新
        │  （毎フレーム）
        ▼
controls.js: update(deltaTime) → character.root.position/rotation更新
        │                     → camera.position/lookAt更新
        ▼
main.js: renderer.render(scene, camera)


[ページロード]
        │
        ▼
storage.js: loadFromStorage() → { params, restored }
        │
        ▼
character.js: createCharacter(params) （初期構築時のみ。以降はupdateCharacterPartで差分反映）
customization-ui.js: setupCustomizationUI(..., initialParams=params, ...) （UI初期表示値に反映）
```

---

## 11. エラー処理方針（全体まとめ）

| ケース | 検知箇所 | 対応 |
|---|---|---|
| WebGL非対応ブラウザ/環境 | `main.js`の`isWebGLAvailable()`（`document.createElement('canvas').getContext('webgl2')`または`'webgl'`の取得可否で判定） | 3Dキャンバス領域にメッセージ表示のみ行い、Scene/Renderer等は一切生成しない。カスタマイズパネルも初期化しない（操作対象が無いため）。コンソールにもエラー内容をログ出力する |
| `localStorage`読込失敗（値なし・JSON破損・構造不正） | `storage.js`の`loadFromStorage()` | 例外を投げず、常に有効な`ParamsObject`を返す（8.5節）。UI上は保存状態表示に軽い注記を出す程度に留め、機能停止はしない |
| `localStorage`保存失敗（容量制限・プライベートブラウジング等） | `storage.js`の`saveToStorage()` | `{ok:false, error}`を返し、`main.js`が失敗メッセージを保存状態表示エリアに出す。3D表示・カスタマイズ機能自体は継続利用可能 |
| 不正なパラメータ値（範囲外の数値、未知の列挙値） | `params.js`の`normalizeParams()` | 例外を投げず、範囲外数値はクランプ、未知列挙値・不正な色コードはデフォルト値に置換 |
| ジオメトリ再生成時の旧リソース解放漏れ | `character.js`の`replaceGeometry()` | 差し替え前に旧`geometry.dispose()`を必ず呼ぶ（メモリリーク防止。マテリアルは使い回すためdispose対象外） |
| ウィンドウリサイズ | `main.js`の`onWindowResize()` | `camera.aspect`・`camera.updateProjectionMatrix()`・`renderer.setSize()`を都度再計算。例外発生の想定なし |

---

## 12. 髪型・髪色の対応要否（確定）

基本設計書で「余裕があれば」とされていた髪型・髪色は、**本詳細設計では実装対象に含める**。
理由: 4.2節の通り、頭部球のスケールバリエーション（`SphereGeometry`の`thetaLength`引数で
半球を作る手法）のみで実現でき、外部素材無しでプリミティブの組み合わせという制約内に収まり
実装コストが小さいため（`short`/`long`/`bald`の3種、髪色は`<input type="color">`1つの追加のみ）。
UIパネル・データ構造にも標準搭載する（3.1節・7.2節に反映済み）。

---

## 13. 基本設計からの変更点・開発リーダーへの申し送り

以下は基本設計書には明記されていなかった、または解釈の余地があった点について、詳細設計として
独自に確定させた事項である。仕様の大枠を変更するものではないが、念のため開発リーダー係へ報告する。

1. **ファイル追加**: `js/params.js` を新規追加した。基本設計書のファイル一覧には無いが、
   値域・デフォルト値・性別プリセット・バリデーションを複数モジュール（character/UI/storage）が
   共有する必要があり、単一箇所に集約しないと実装時に値の食い違いが生じるリスクが高いと判断した。
   ディレクトリ構成の変更を伴うため報告する。
2. **リセットボタンの挙動**: レビュー指摘の通り「表示のデフォルト復帰」と「保存データ削除」の
   **両方を行う**仕様として確定した（8章参照）。加えて誤操作防止のため`confirm()`確認を挟む仕様を
   追加した。基本設計書には確認ダイアログの記載が無かったための追加である。
3. **髪型・髪色**: 「余裕があれば」の判断について、実装コストが小さいため**対応する**と判断した
   （12章）。
4. **キャラクターの白目表現省略**: 4.2節記載の通り、目は黒目（単色球）のみとし白目部分の追加メッシュは
   設けない簡略化を行った。Mii風のデフォルメ表現として許容範囲と判断したが、見た目の印象に関わる
   ため申し送りする。
5. **カメラの手動操作（マウス視点回転）非対応**: 基本設計書に明記が無かったため、三人称固定角度の
   自動追従カメラのみとし、`OrbitControls`等によるユーザーのカメラ操作は実装しない方針とした
   （1.1節の通り`OrbitControls`の読み込み口はimport map上に用意するが、本体コードでは未使用）。
6. **保存タイミング**: 「保存ボタン押下時のみ」で確定し、自動保存は行わない方針とした
   （基本設計書3章の記載に沿った解釈であり、大きな変更ではないが明文化のため記載）。
7. **mouthの`flat`と`normal`が見た目上完全に同一（dev-team-reviewerからのレビュー指摘対応）**:
   4.2節記載の通り、`face.mouth.shape`の`normal`と`flat`は現状の仕様上、口の回転角が
   どちらも「回転なしの横一文字」となり幾何学的に区別が付かない。将来の差別化の余地として
   コード上の型・分岐は分けておくが、MVP時点では**意図的に未差別化**とする仕様として確定した。
   テスト仕様書作成時は「`normal`と`flat`の見た目が同一であることは不具合ではなく仕様である」旨を
   前提として扱ってもらうよう、テスト仕様書係（または担当工程）へ申し送りすること。

上記7点について、開発リーダー係の確認・承認を得た上でコーディング係への着手指示を行うこと。

---

## 14. dev-team-reviewerレビュー指摘への対応まとめ（本改訂での修正内容）

### 14.1 1回目レビュー（6件）への対応状況

既存の詳細設計書に対し、dev-team-reviewerから受けた1回目レビュー6件の指摘への対応状況を
以下にまとめる（表中の記述のうち、2回目レビューで矛盾が指摘され訂正した箇所は
14.2節の記載を最新とする。特に#2「`head`子関係を確定」、#3「`updateCharacterPart(...,
"body", ...)`は常に一括で3処理」という記述は、1回目修正後にcustomization-ui.js側を
詳細ドットパス方式へ統一した結果、実態と合わなくなっていたため2回目レビューで訂正対象となった）。

| # | 指摘内容 | 重要度 | 対応箇所 | 対応概要 |
|---|---|---|---|---|
| 1 | 頭部スケールと目・鼻・口のローカル座標の不整合 | 重要 | 4.2節（階層図）・4.2.1節（新設） | 目・鼻・口を`head`の子から`faceFeaturesGroup`（`head`と兄弟・`bodyGroup`直下、scale常に(1,1,1)固定）の子へ変更。位置はheadと同期、scaleは非連動とする構造に修正 |
| 2 | square輪郭の頬Boxの座標・サイズ・親子関係が未定義 | 重要 | 4.2節・4.2.2節・4.4.2節 | `cheekLeft`/`cheekRight`を`BoxGeometry(0.12, 0.16, 0.1)`として寸法・positionを確定。表示制御は`createCharacter()`時に常駐生成し`visible`切替のみで行う方式を確定（`replaceGeometry()`の対象外と明記）。**親子関係（`head`の子とするか）は1回目修正時点では`head`の子のままだったが、2回目レビュー指摘2により`cheekGroup`（headと兄弟）へ変更。詳細は14.2節#2参照** |
| 3 | `layoutParts()`の再計算対象が曖昧 | 通常 | 4.3節・4.3.1節・4.4.1節 | `body.height`/`shoulderWidth`/`weight`それぞれの直接更新プロパティと`layoutParts()`要否を表で整理。**呼び出し粒度（`updateCharacterPart`に渡す`changedPath`が"body"一括か詳細パス個別か）については1回目修正時点の記述が古く、2回目レビュー指摘1により4.4.2節の詳細パス方式に整合する形へ訂正。詳細は14.2節#1参照** |
| 4 | mouthの`flat`/`normal`が見た目上完全に同一 | 軽微 | 4.2節・13章 | 意図的な仕様である旨を明記し、テスト仕様書作成時の申し送り事項として13章に追記 |
| 5 | `updateCharacterPart`のpartNameと`changedPath`の粒度不一致 | 重要 | 4.4.2節（新設）・7.3節 | 差分検出方式ではなく、`customization-ui.js`の各コントロールが固定の詳細ドットパス（例: `"face.eyes.size"`, `"face.shape"`）を直接渡す方式に統一。`character.js`側は詳細パス→処理内容の分岐テーブルを4.4.2節に明記し、未知パスは`"all"`にフォールバック |
| 6 | long髪の背面Capsuleの座標・回転が未定義 | 軽微 | 4.2節（髪の項） | `position = (0, -0.22, -0.16)`, `rotation.x = Math.PI/2 - 0.15`として具体値を確定 |

1回目対応時点ではいずれも基本設計書の内容と矛盾する変更は発生していなかった（既存の
「9.1〜9.6」の申し送り事項に追加する形で対応し、基本設計書自体の仕様変更は伴わない）。
ただし1回目修正の過程で、4.4.2節・7.3節を「詳細ドット区切りパス方式」に統一した一方、
関連する4.3.1節・4.2.2節の記述更新が漏れ、新たな矛盾（2回目レビュー指摘1・2）が生じていた。
2回目レビュー指摘3（`createCharacter()`初回配置ロジック未定義）は1回目レビューの指摘3
（`layoutParts()`の再計算対象が曖昧）と関連するが独立した論点であり、今回新たに追記対応した。

### 14.2 2回目レビュー（3件）への対応状況

1回目修正後、dev-team-reviewerから受けた2回目レビュー3件の指摘への対応状況を以下にまとめる。

| # | 指摘内容 | 重要度 | 対応箇所 | 対応概要 |
|---|---|---|---|---|
| 1 | 4.3.1節が古い粒度（`"body"`という粗いpartName）を前提にした記述のまま残っており、4.4.2節・7.3節の確定仕様（詳細ドット区切りパス方式）と矛盾している | 重要 | 4.3.1節（見出し・本文を訂正）・4.4節本文・4.4.1節・4.4.2節分岐テーブル（`"gender"`行） | 4.3.1節を「`body.height`/`body.shoulderWidth`/`body.weight`それぞれについて、なぜ`layoutParts()`が必要/不要になるかの理由説明」に純化する形へ書き直し。`updateCharacterPart(character, "body", params)`という一括呼び出しは実際には発生しない旨を明記し、実際の呼び出し粒度・処理内容は4.4.2節の分岐テーブルを正とする位置づけに整理した。4.4.2節`"gender"`行の「4.3.1節の3処理を実行」という古い表現、`layoutParts()`のJSDocコメント中の`updateCharacterPart(character, "body", params)`という古い呼び出し例も合わせて訂正した |
| 2 | 頬Box(cheekLeft/cheekRight)がheadの子のままで、指摘1(1回目)で対策したはずの「headの非一様scaleが子のローカル座標・サイズに伝播する」問題を再び抱えている | 中 | 4.2節（階層図）・4.2.1節・4.2.2節・4.3節・4.4.1節 | 方針(a)を採用。頬Box(cheekLeft/cheekRight)を`head`の子から、専用の`cheekGroup`（`head`と兄弟・`bodyGroup`直下、scale常に(1,1,1)固定）の子へ移設した。`faceFeaturesGroup`と統合せず専用グループとしたのは、目・鼻・口（顔の造作）と頬Box（square輪郭時のみの輪郭演出パーツ）とで役割が異なり、将来の拡張・削除のしやすさを考慮したため。`cheekGroup.position`は`faceFeaturesGroup`と同様にheadと同期し、`layoutParts()`内でhead.position.y算出直後に代入する。あわせて、square輪郭時のheadスケール値`(1.05, 0.95, 1.0)`と頬座標`(±0.26, -0.05, 0.08)`が密結合した値であり、将来squareのscale値を変更する場合は頬座標も合わせて見直しが必要である旨を4.2.2節に明記した |
| 3 | `createCharacter()`の初回構築時、head.position.y / faceFeaturesGroup.position.yの初期値をどう設定するかが未定義 | 軽微 | 4.4節本文・4.4.1節 | `createCharacter()`内部で各パーツをデフォルトのローカル座標で生成した後、`layoutParts(character)`を呼び出してtorsoの初期寸法に基づく`head`/`faceFeaturesGroup`/`cheekGroup`/`leftLeg`/`rightLeg`の`position.y`、`leftArm`/`rightArm`の`position.x`を決定する方針を明記。初回構築時・パラメータ変更後の再計算時のいずれも同一の`layoutParts()`ロジックを使い回すことで、初期表示とパラメータ変更後の表示にズレが出ないようにする |

いずれも基本設計書の内容と矛盾する変更は発生していない。今回の3件はいずれも詳細設計書内部の
記述整合性の訂正・明確化であり、既存の13章「基本設計からの変更点・開発リーダーへの申し送り」
1〜7点の内容を変更するものでもない。

### 14.3 3回目レビューへの対応状況

2回目修正後、dev-team-reviewerから受けた3回目レビュー指摘への対応状況を以下にまとめる。
今回は設計判断のやり直しは発生しておらず、2回目修正で導入した`cheekGroup`（頬Box専用の、
`head`と兄弟・scale固定のグループ）に関する表記の一貫性の穴埋め（記述漏れの追記）のみである。

| # | 指摘内容 | 重要度 | 対応箇所 | 対応概要 |
|---|---|---|---|---|
| 1 | 4.4節本文の補足段落で、`layoutParts()`が決定するposition.y対象パーツの列挙に`cheekGroup`が抜けており`faceFeaturesGroup`のみの記述になっていた | 軽微 | 4.4節本文（補足段落） | `head`/`faceFeaturesGroup`/`cheekGroup`/`leftLeg`/`rightLeg`のposition.y、という形に`cheekGroup`を追記した |
| 2 | `createCharacter`関数のJSDocコメントのパーツ列挙（torso/head/faceFeaturesGroup/leftArm/...）に`cheekGroup`が抜けていた | 軽微 | 4.4節`createCharacter`のJSDoc | `torso/head/faceFeaturesGroup/cheekGroup/leftArm/rightArm/leftLeg/rightLeg等`という形に`cheekGroup`を追記した |
| 3 | `layoutParts`関数のJSDocコメント冒頭の説明（頭・faceFeaturesGroup・腕・脚の接続位置を再計算、という記述）に`cheekGroup`が抜けていた | 軽微 | 4.4.1節冒頭`layoutParts`のJSDoc | `頭・faceFeaturesGroup・cheekGroup・腕・脚の接続位置`という形に`cheekGroup`を追記した |

あわせて【軽微】指摘として、4.3.1節の`body.height`変更時に`layoutParts()`が不要な理由を
示す表について、`cheekGroup`・`faceFeaturesGroup`も`head`と同様に`bodyGroup`配下でscaleの
影響を暗黙的に受けて自動追従するため、個別の再計算不要かつ実害はない旨を一言明記した。

いずれも4.2節（階層図）・4.2.1節・4.2.2節・4.3節・4.4.1節の具体的手順3など、2回目修正時点で
既に`cheekGroup`が正しく反映済みの箇所との整合を取るための表記漏れ修正であり、設計判断・
階層構造・座標値の変更は一切伴わない。基本設計書の内容と矛盾する変更も発生していない。

### 14.4 実装後コードレビューでの指摘への対応状況

3回目修正後、実装済みコードのレビューにより見つかった記述漏れへの対応を以下にまとめる。
今回は設計判断のやり直しは発生しておらず、既存の確定仕様（3.3節の性別プリセットによる
body系パラメータ上書き）を前提に、UI側の再同期処理が疑似コードに欠落していた点の追記のみである。

| # | 指摘内容 | 重要度 | 対応箇所 | 対応概要 |
|---|---|---|---|---|
| 1 | `character.js`の`updateCharacterPart`の`case 'gender':`では3.3節の仕様通り`body.height`/`shoulderWidth`/`weight`が性別プリセット値へ上書きされるが、10.3節の`onChange`疑似コードにはUI側（体形スライダー等）の表示を再同期する処理が記載されておらず、実装（`main.js`）もそれに従った結果、性別変更後に体形スライダーの表示値が古いまま残り、その後の操作で古い表示値によるパラメータ上書きが発生する不整合が生じていた | 軽微 | 10.3節`onChange`疑似コード | `updateCharacterPart`呼び出し・params更新の直後に`uiHandle.refreshUI(現在のparams)`を常時呼び出す処理を追記した。`changedPath === 'gender'`時のみ分岐させる案もあったが、実装の単純さを優先し常時呼び出す方式とした（gender以外では表示値に実質的な変化がなく、呼び出しコストの懸念もないため） |

基本設計書の内容と矛盾する変更は発生していない。
