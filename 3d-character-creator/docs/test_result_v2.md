# 3Dキャラクタークリエイター リニューアル版（AI 3Dモデル生成方式）v2 テスト結果報告書

## 0. 実施概要

- 対象: `docs/test_spec_v2.md` 全61件のテストケース（観点A〜K）
- 実施日: 2026-07-06
- 実施環境: Windows 11 / Git Bash（POSIX sh） / Node.js v24.18.0
- 実施方法の内訳:
  - プロキシサーバー（`server/`）を実際に起動し、`curl`で直接HTTPリクエストを送信して検証（H章全件）
  - `js/character.js`, `js/params.js`, `js/storage.js` を実際にNode.js上でimportし、Three.js(npm版, GLTFLoader含む)・localStorageモックと組み合わせて、ブラウザを介さずロジックレベルで検証（D章・B章の一部・F章の一部）
  - `main.js`の`pollJobStatus`ロジックをテスト用に忠実に再現したコードで、一時的なスタブHTTPサーバー（ポート3002、実装ファイルは変更せず）を相手に検証（E-3・I-1〜I-4のプロキシ応答パターンとロジック分岐）
  - `git log`/`git diff`によるファイル変更履歴の確認（K章）
  - 上記以外（DOM操作・実際のマウス/キーボード操作・目視でのレンダリング確認・window.confirmダイアログ操作等）は、ブラウザ操作ツールを持たないため「未実施（要手動確認）」として明記
- 実施後、H章・E-3等のテストで使用した一時的なスタブファイル（server/_tmp_stub_status_server.mjs等）・一時ログファイル（server/server_test*.log）はすべて削除済み。server/.envも未設定（削除済み）状態に復元済み。起動したNode.jsプロセス（ポート3001・3002）はすべてテスト終了後に停止済み。
- git diff確認の結果、本テスト実施によるソースコード（js/, server/, index.html, css/）への変更は無い。

## 1. サマリー

| 区分 | 件数 |
|---|---|
| 合格 | 42 |
| 不合格 | 0 |
| 未実施（要ブラウザ手動確認） | 19 |
| 合計 | 61 |

不合格0件。ただし、K-5にて「設計書のファイル一覧に無いserver/server.logが存在する」という軽微な差異を検出（後述、バグではなく開発時の残置ログファイルと判断）。

## 2. テストケース別結果

### A. 初期表示・起動

| No | 結果 | 備考 |
|---|---|---|
| A-1 | 未実施（要ブラウザ手動確認） | DOM描画・目視確認が必須。main.js/customization-ui.jsのコードレビューでは、初期値（createDefaultParams()との一致）・非活性ボタン設定・hidden要素の初期化ロジックはいずれも仕様通りであることを確認済み。 |
| A-2 | 未実施（要ブラウザ手動確認） | getContextの上書き・Consoleエラー確認はDevTools操作が必須。コードレビューではisWebGLAvailable()がfalseの場合にinit()がshowWebGLUnavailableMessage()実行後、即returnする実装（js/main.js 165-169行目）を確認済み。 |

### B. 生成パラメータ入力・クライアントバリデーション

| No | 結果 | 備考 |
|---|---|---|
| B-1 | 合格 | js/params.jsを直接importしNode.js上で検証。ENUM_OPTIONS/createDefaultParams()の値が仕様通り（性別=指定しない、雰囲気=明るい、体型傾向=標準）。 |
| B-2 | 未実施（要ブラウザ手動確認） | textareaへのリアルタイム入力とDOM更新の確認はブラウザ操作が必須。 |
| B-3 | 合格 | validateAppearanceDescription('あ'.repeat(500)) が {ok:true} を返すことを確認。 |
| B-4 | 合格（ロジック部分） | validateAppearanceDescription('あ'.repeat(501)) が {ok:false, message:"容姿の説明は500文字以内で入力してください。"} を返すことを確認。ただしDOM上のエラー表示領域への反映確認はブラウザ操作が必須（該当部分は未実施）。 |
| B-5 | 未実施（要ブラウザ手動確認） | ボタン押下・fetch発行の実挙動確認はブラウザ操作が必須。 |
| B-6 | 合格 | buildPrompt({version:2, gender:'female', mood:'cute', bodyType:'slim', appearanceDescription:'黒髪ロング'}) の出力が仕様書記載の期待文字列と完全一致することを確認。 |

### C. 生成フロー（デモフォールバック正常系）

| No | 結果 | 備考 |
|---|---|---|
| C-1 | 未実施（要ブラウザ手動確認） | 一連のUI状態遷移・Networkタブでのリクエスト確認・画面表示確認はブラウザ操作が必須。ただし、この一連の流れを構成する個別要素（POST /api/generateの503+fallback応答=H-2で合格、GET /demo-fallback/statusの200応答=H-3で合格、pollJobStatusがsucceeded受信時にloadCharacterModelからclearGenerationNotice、setSaveButtonEnabled(true)を呼ぶロジック=Node.js上のポーリングロジック再現テストで合格、実際のDuck.glbロード成功=D章のNode.js実データテストで合格）はそれぞれ個別に検証済みであり、一連の流れとして矛盾なく繋がることをコードレベルで確認している。 |
| C-2 | 合格（ロジック部分） | Node.js上でThree.js(npm版)+GLTFLoaderを用い、実際のDuck.glbをロードしてバウンディングボックス計算・scaleFactor計算を実施。preScaleSize.y約1.54からscaleFactor約1.10が算出され、MODEL_TARGET_HEIGHT=1.7への正規化ロジックが正しく機能することを確認。地面への接地補正（postScaleBox.min.y減算）もコード上確認済み。ただし画面上の実際の見た目の目視確認はブラウザ操作が必須（該当部分は未実施）。 |
| C-3 | 未実施（要ブラウザ手動確認） | ボタンのdisabled状態・Networkタブでのリクエスト回数確認はブラウザ操作が必須。コードレビューではsetGeneratingState(true, ...)がgenerateButton.disabled = trueを設定する実装を確認済み。 |
| C-4 | 未実施（要ブラウザ手動確認） | テスト仕様書自体が「進捗表示テキストの目視確認」を求めており、DOM確認が必須。ロジック面はpollJobStatusロジック再現テストで、progress値が生成中…(n%)としてそのままsetGeneratingStateに渡ることを確認済み（I章のNode.js検証内で確認）。 |

### D. GLBロード処理の重点確認

| No | 結果 | 備考 |
|---|---|---|
| D-1 | 合格 | js/character.jsを実ファイルのままNode.js上でimportし、Three.js(npm版)+GLTFLoaderと組み合わせて実データ検証。Duck.glbロード成功後、存在しないURL(https://example.invalid/notfound.glb)への2回目のロードを試み、Promiseがrejectされること・modelContainer.childrenが引き続き同一のDuckモデル1件を保持していること（disposeも差し替えも発生しない）・currentModelUrlが変化しないことを実際のオブジェクト同一性比較で確認。 |
| D-2 | 合格 | 未生成状態（createCharacterContainer()直後）から不正URLへのロードを試み、Promiseがreject・modelContainer.children.length === 0のまま・currentModelUrl === nullのままであることを確認。 |
| D-3 | 合格 | character._loadTokenを外部から直接インクリメントし（character.js内timeoutPromiseのreject時と同一操作）疑似タイムアウトを発生させた後、実際のGLTFLoaderのonLoadが遅れて完了しても、character._loadToken !== myTokenにより早期returnされ、modelContainerが空のまま・currentModelUrlがnullのままであることを実データで確認。_loadTokenによるレースコンディション対策が実際に機能していることを実証。 |
| D-4 | 合格 | Duck.glbロード後、同一URLでloadCharacterModelを再度呼び出し、_loadTokenが変化しない（新規ロードが発生しない）こと・modelContainer.children[0]が同一オブジェクト参照のままであることを確認。 |
| D-5 | 合格（geometry/materialのみ）／一部未実施 | THREE.BufferGeometry.prototype.dispose・THREE.Material.prototype.disposeにスパイを仕込み、異なるURL相当としての差し替え時（currentModelUrlを別URLに書き換えてから同一Duck URLで再ロード）に、geometryのdispose・materialのdisposeがそれぞれ実際に呼ばれることを確認。modelContainer.children.lengthは差し替え後も1に維持。ただしテクスチャ(map)のdispose確認は未実施: Node.js環境のGLTFLoaderは内部でblob:URLを生成してテクスチャをロードするが、Node.jsのblob:URL解決が不完全なためTHREE.GLTFLoader: Couldn't load textureという警告が出てmaterial.mapがnullのままとなり、テクスチャのdispose自体が発生しない（Node.js環境固有の制約であり、実装の不具合ではない）。この部分（テクスチャdisposeログの確認）はブラウザでの手動確認が必要。 |
| D-6 | 合格 | character.jsのscaleFactor計算式（preScaleSize.y > 0 ? MODEL_TARGET_HEIGHT / preScaleSize.y : 1）を再現し、size.yが0・負値の場合にscaleFactorが1にフォールバックし、NaN/Infinityにならないことを確認。 |

### E. showGenerationNotice/clearGenerationNoticeの対称性

| No | 結果 | 備考 |
|---|---|---|
| E-1 | 未実施（要ブラウザ手動確認） | window.confirmダイアログ操作・DOM確認が必須。コードレビューではhandleReset()内でuiHandle.clearGenerationNotice()が呼ばれる実装を確認済み。 |
| E-2 | 未実施（要ブラウザ手動確認） | ボタン押下直後の一瞬の画面状態の観察が必須。コードレビューではhandleGenerate冒頭でuiHandle.clearGenerationNotice()が呼ばれる実装を確認済み。 |
| E-3 | 合格（ロジック部分） | 一時的なスタブHTTPサーバー（実装ファイルは変更せず、別ポート3002で独立稼働）を用意し、demo-fallback以外のjobId（test-job-1）に対しても即座にsucceededを返すようにした上で、main.jsのpollJobStatusロジックを忠実に再現したコードで呼び出し。succeeded受信時にclearGenerationNotice()が呼ばれることをログで確認。DOM上の実際の非表示切り替えの目視確認はブラウザ操作が必須（該当部分は未実施）。 |
| E-4 | 未実施（要ブラウザ手動確認） | 2つの独立したDOM要素の表示状態の相互非干渉確認は目視確認が必須。コードレビューではshowError/clearErrorとshowGenerationNotice/clearGenerationNoticeが別々のDOM要素（errorEl/noticeEl）を操作しており、相互に参照し合わないことを確認済み。 |

### F. データ永続化（localStorage）

| No | 結果 | 備考 |
|---|---|---|
| F-1 | 合格（ロジック部分）／一部未実施 | js/storage.jsを実ファイルのままNode.js上でimportし、localStorageをシンプルなMapベースでモックして検証。saveToStorageが{version:2, params, generatedModel}形式で保存すること、loadFromStorageが保存内容を正しく復元しrestored:trueを返すことを実データで確認。DOM上の保存状態表示・実際のリロード後のモデル再表示の目視確認はブラウザ操作が必須（該当部分は未実施）。 |
| F-2 | 未実施（要ブラウザ手動確認） | ボタンのdisabled属性確認・クリックイベント未発火の確認はDOM操作が必須。コードレビューでは初期状態でsaveButton.disabled = true（customization-ui.js 167行目）であることを確認済み。 |
| F-3 | 合格（clearStorageのみ）／大部分未実施 | clearStorage()がlocalStorageから該当キーを削除することをNode.js上で確認。window.confirmダイアログ操作・フォームリセット・3D表示のリセットの目視確認はブラウザ操作が必須。 |
| F-4 | 未実施（要ブラウザ手動確認） | confirm()でキャンセルした場合の「何も変わらないこと」の確認はブラウザ操作が必須。 |
| F-5 | 合格 | localStorageに{version:1, someOldField:'x'}を設定した状態でloadFromStorage()を呼び出し、restored:false・paramsがデフォルト値・generatedModelがnullであることを確認。 |
| F-6 | 合格 | v1専用キー（3d-character-creator:params）を設定してもv2キーが無ければloadFromStorage()がrestored:false・デフォルト値を返すことを確認（v2は該当キーを一切参照しない設計通り）。 |
| F-7 | 合格 | localStorageに不正なJSON文字列（'{不正なJSON'）を設定し、loadFromStorage()が例外を投げずrestored:falseで正常にフォールバックすることを確認。 |
| F-8 | 合格（ロジック部分）／一部未実施 | generatedModel:nullの保存データからloadFromStorage()を呼び出し、params（性別=男性/雰囲気=クール/体型傾向=がっしり/容姿説明=test）が正しく復元され、generatedModelがnullのままであることを確認。フォームDOMへの反映・showPlaceholder呼び出しの目視確認はブラウザ操作が必須。 |
| F-9 | 未実施（要ブラウザ手動確認） | 保存済みmodelUrlを無効な値に書き換えた状態でのリロード後のエラー表示・保存ボタン非活性確認はブラウザ操作が必須。ロジック面はmain.jsのinit()内.catchでcurrentGeneratedModelをnullに戻さない実装（コード168-226行目）を確認済み。 |

### G. 移動操作・カメラ追従（既存流用機能のデグレ確認）

| No | 結果 | 備考 |
|---|---|---|
| G-1 | 未実施（要ブラウザ手動確認） | 実際のキー入力によるモデル移動の目視確認が必須。controls.jsはv1から無改修（K-2で確認済み）であり、移動ロジック自体のコードレビューは実施済み。 |
| G-2 | 未実施（要ブラウザ手動確認） | クランプ動作の目視確認が必須。コードレビューではTHREE.MathUtils.clamp(nextX/nextZ, -FIELD_HALF_SIZE, FIELD_HALF_SIZE)（controls.js 77-78行目）を確認済み。 |
| G-3 | 未実施（要ブラウザ手動確認） | 回転の滑らかさの目視確認が必須。コードレビューではTHREE.MathUtils.lerp(..., ROTATION_LERP_FACTOR=0.2)によるLerp補間実装を確認済み。 |
| G-4 | 未実施（要ブラウザ手動確認） | カメラ追従の目視確認が必須。コードレビューではcomputeCameraOffset・camera.position.lerpによるLerp追従実装を確認済み。 |
| G-5 | 合格（コード確認のみで可、目視部分は不合格としない） | MESHY_MODEL_FRONT_CORRECTION_Y = 0（character.js 7行目）で無補正のまま定義されていることを確認。本ケースは「バグ報告をしないことの明記」が目的であるため、見た目のズレの有無に関わらずコード確認のみで合格と判定。ロジック自体（rotation.y更新・カメラLerp追従）が正しく動作することはG-1〜G-4の対象。 |

### H. プロキシサーバー単体（curl等によるAPI確認）

| No | 結果 | 備考 |
|---|---|---|
| H-1 | 合格 | curl http://localhost:3001/health が 200 {"ok":true} を返すことを確認。 |
| H-2 | 合格 | 正常系POST が 503、{"error":"API_KEY_NOT_CONFIGURED","message":"...","fallback":{"jobId":"demo-fallback","immediate":true}} を返すことを確認。 |
| H-3 | 合格 | GET /api/generate/demo-fallback/status が 200、期待通りのJSONを返すことを確認。さらにcurl -I <modelUrl>で実際にDuck.glb（jsDelivr経由）が200 OKで取得可能であることも確認（Content-Type: model/gltf-binary）。 |
| H-4 | 合格 | gender:"invalid_value" が 400 {"error":"INVALID_PARAMS","message":"genderが不正です。"} を返すことを確認。 |
| H-5 | 合格 | mood:"angry" が 400、"moodが不正です。" を返すことを確認。 |
| H-6 | 合格 | bodyType:"fat" が 400、"bodyTypeが不正です。" を返すことを確認。 |
| H-7 | 合格 | appearanceDescription:123 が 400、"appearanceDescriptionが不正です。" を返すことを確認。 |
| H-8 | 合格 | appearanceDescription 501文字 が 400、"appearanceDescriptionは500文字以内で入力してください。" を返すことを確認。 |
| H-9 | 合格 | appearanceDescription 500文字ちょうど が 503（フォールバック。400にならないことを確認）。 |
| H-10 | 合格 | promptキー欠損 が 400、"promptが不正です。" を返すことを確認。 |
| H-11 | 合格 | prompt:12345 が 400、"promptが不正です。" を返すことを確認。 |
| H-12 | 合格 | prompt:""・prompt:"   " いずれも 400、"promptが不正です。" を返すことを確認。 |
| H-13 | 合格 | prompt 2000文字ちょうど が 503（400にならないことを確認）。 |
| H-14 | 合格 | prompt 2001文字 が 400、"promptが不正です。" を返すことを確認。 |
| H-15 | 合格 | ボディ・Content-Type無しのPOST が 400、"genderが不正です。" を返すことを確認。サーバークラッシュなし。 |
| H-16 | 合格 | 存在しないjobIdでのstatus取得（APIキー未設定時） が 503、{"error":"API_KEY_NOT_CONFIGURED","message":"AIモデル生成APIキーが設定されていません。"} を返すことを確認。 |
| H-17 | 合格 | CORS OPTIONS が 204、Access-Control-Allow-Originヘッダありを確認。 |
| H-18 | 合格 | MESHY_API_KEY=dummy-invalid-key-for-test設定後の再起動でPOST が 502、{"error":"MESHY_API_ERROR","message":"AIモデル生成APIの呼び出しに失敗しました。"} を返すことを確認。テスト後.envを削除し未設定状態に復元済み。 |

### I. UI状態遷移・ボタン活性制御

| No | 結果 | 備考 |
|---|---|---|
| I-1 | 合格（プロキシ応答〜ポーリングロジックのみ）／DOM部分未実施 | 一時的なスタブHTTPサーバー（実装ファイルserver/routes/generate.jsは一切変更せず、別ポート3002で独立稼働させる方式を採用）で{status:"failed", errorMessage:"モデル生成に失敗しました（テスト）"}を返すエンドポイントを用意し、main.jsのpollJobStatusロジックを忠実に再現したコードで呼び出し。showError("モデル生成に失敗しました（テスト）")・setGeneratingState(false)が呼ばれることをログで確認。実際のDOM上のボタン再活性化・エラー表示の目視確認はブラウザ操作が必須。 |
| I-2 | 合格（ロジックのみ、タイムアウト値は短縮して確認）／DOM部分未実施 | 常にin_progressを返すスタブエンドポイントに対し、GENERATION_TIMEOUT_MSをテスト用に300msに短縮した複製ロジックで実行。タイムアウト到達時にshowError("生成がタイムアウトしました。しばらくしてから再度お試しください。")・setGeneratingState(false)が呼ばれることを確認。実際の180秒でのタイムアウト・DOM確認は未実施（ロジックはDate.now() - startTime > GENERATION_TIMEOUT_MSの単純な時間比較であり、値を変えても分岐ロジック自体は同一であることをコードで確認済み）。 |
| I-3 | 合格（ロジックのみ）／DOM部分未実施 | 1〜3回目は500、4回目はsucceededを返すスタブエンドポイントに対し実行。1〜3回目のエラーでerrorRetryCountがMAX_POLL_ERROR_RETRY=3以下のためエラー確定とならず、4回目でsucceededとなり正常終了（setSaveButtonEnabled(true)まで到達）することをログで確認。 |
| I-4 | 合格（ロジックのみ）／DOM部分未実施 | 常に500を返すスタブエンドポイントに対し実行。4回連続失敗後にshowError("生成状況の確認に失敗しました。")・setGeneratingState(false)が呼ばれ、生成失敗が確定することを確認。 |
| I-5 | 未実施（要ブラウザ手動確認） | プロキシサーバー未起動時の実際のfetch例外・DOM上のエラー表示確認はブラウザ操作が必須。コードレビューではhandleGenerateのcatch節でuiHandle.showError(err.message || '...')が呼ばれる実装を確認済み。 |

### J. 異常系・エラーハンドリング全般

| No | 結果 | 備考 |
|---|---|---|
| J-1 | 未実施（要ブラウザ手動確認） | 生成中のリロード・localStorage状態の確認はブラウザ操作が必須。 |
| J-2 | 合格（ロジック部分）／DOM部分未実施 | localStorage.setItemが例外を投げるようモック化した状態でsaveToStorage()を呼び出し、{ok:false}が返ることを確認（storage.jsのtry/catch実装通り）。DOM上の「保存に失敗しました」表示確認はブラウザ操作が必須（setSaveStatus呼び出しはmain.jsのhandleSave内で行われるが、この部分はDOM込みのためNode.js単体テストの対象外とした）。 |
| J-3 | 合格（ロジック部分）／DOM部分未実施 | localStorage.removeItemが例外を投げるようモック化した状態でclearStorage()を呼び出し、例外が外部に伝播しないことを確認（storage.jsのtry/catchで握りつぶす実装通り）。 |

### K. 既存機能・他プロジェクトへの影響確認（デグレ観点）

| No | 結果 | 備考 |
|---|---|---|
| K-1 | 合格 | git log --oneline -- 3d-character-creator/js/field.js およびgit diffにより、v1追加コミット（381139c）以降field.jsへの変更が一切ないことを確認。実装コードもv1相当の内容（PlaneGeometry(10,10,10,10)、色0x6fae5c、GridHelper、FIELD_HALF_SIZE=4.8）であることを確認。実行結果としての目視確認はG章と合わせてブラウザ操作が必須（未実施）。 |
| K-2 | 合格 | 同様にcontrols.jsへの変更が一切ないことをgit log/git diffで確認。atan2(x, -z)ロジック・CAMERA_OFFSET計算式・MOVE_SPEED=2.5等の定数を確認。実行結果としての目視確認はG章と合わせてブラウザ操作が必須（未実施）。 |
| K-3 | 合格 | git log --stat -- poc_pdf_edit.py pdf_editor.py api_server.py test_pdf_editor.py make_sample_resume.py make_sample_resume_multipage.py の結果、直近の関連コミットはいずれも2026-07-04以前（PDF編集ツール開発時のもの）であり、本v2リニューアル作業（2026-07-06）に起因する変更は含まれていないことを確認。git status上も、未コミットの変更は3d-character-creator/配下のみであることを確認。 |
| K-4 | 合格 | git diff（作業ツリー）・git logにより、docs/basic_design.md, docs/detail_design.md, docs/test_spec.mdのv1関連3ファイルが、v1追加コミット以降、内容の変更を受けていないことを確認。 |
| K-5 | 合格（軽微な差異あり） | 3d-character-creator/配下のファイル一覧をdetail_design_v2.md 4章の一覧と突き合わせ、docs/, index.html, js/*, css/style.css, server/*が概ね一覧通りに揃っていることを確認。ただしserver/server.log（内容: "3d-character-creator proxy server listening on port 3001"の1行のみ）が設計書のファイル一覧に無い状態で存在していた。これは開発（実装）フェーズでの動作確認時に生成された残置ログファイルと推測され、本テスト実施によって新規に作られたものではない（テスト実施係が本テスト中に作成した一時ファイル・スタブファイルはすべてテスト完了後に削除済みで、git status上も残っていないことを確認済み）。実装ファイルの変更を伴わない軽微な残置物であるため、バグとしてではなく整理推奨事項として報告する。 |

---

## 3. 発見した問題・注記事項

### 3.1 バグ・実装上の不具合
本テストの実施範囲内では、実装の不具合は発見されなかった（H章18件、D章6件を含む主要ロジック検証はすべて合格）。

### 3.2 軽微な指摘事項（バグではないが報告する事項）
- K-5: server/server.logが詳細設計書v2 4章のファイル一覧に無いファイルとして残存している。開発時の動作確認ログと推測される。実運用上の支障は無いが、リポジトリの整理観点では削除または.gitignoreへの追加（server/.gitignoreには現状node_modules/と.envのみが指定されている）が望ましい。

### 3.3 未実施（ブラウザでの手動確認が必要な項目）
以下19件は、DOM操作・実際のキーボード/マウス操作・window.confirmダイアログ操作・画面の目視確認（3Dモデルの表示・カメラ追従・ボタンの活性状態・文字数カウンタのリアルタイム表示等）を伴うため、ブラウザ操作ツールを持たないテスト実施係では実施できなかった。開発リーダー係または秘書経由で、秘書側でのブラウザ確認が必要である旨を申告する。

- A-1, A-2
- B-2, B-5
- C-1, C-3, C-4
- E-1, E-2, E-4
- F-2, F-4, F-9
- G-1, G-2, G-3, G-4
- I-5
- J-1

上記のうち、C-1・E-1・E-2・E-4・F-2・F-9・G-1〜G-4・I-5については、関連するロジック部分（プロキシ応答・ポーリング処理・localStorage処理・バリデーション処理・既存流用コードの無改修確認等）は本テストで個別に検証済みであり、残るのは主にDOM反映・画面表示・実際の操作感の確認のみである。

### 3.4 一部合格・一部未実施の項目（ロジックは検証済み、DOM/目視は未実施）
C-2, D-5（テクスチャdispose部分のみ未実施）, F-1, F-3, F-8, I-1〜I-4, J-2, J-3, B-4

---

## 4. 環境上の制約に関する補足

- テスト実施係はブラウザ操作ツール（DevTools操作・マウス/キーボード操作・画面目視）を持たないため、フロントエンドのDOM状態・実際のレンダリング結果・ユーザー操作を伴うテストケースは実施できなかった。
- 上記の制約を補うため、本テストでは以下の工夫を行った。
  - js/character.js, js/params.js, js/storage.jsを実ファイルのままNode.js上でimportし、Three.js(npm版)・GLTFLoader・localStorageモックと組み合わせることで、D章・B章・F章の中核ロジックを実データ・実コードで検証した。
  - H章は実際にプロキシサーバーを起動しcurlで全18件を実施した。
  - I章・E-3は、実装ファイル自体は変更せず、別ポートで独立した一時的なスタブHTTPサーバーと、main.jsのpollJobStatusロジックを忠実に再現したテストコードを用意し、プロキシ応答パターンごとの分岐ロジックを検証した。
- これらの検証により、61件中42件（69%）を合格と判定でき、DOM/画面確認を要する残り19件についても、多くはロジック面の裏付けを済ませた上で「未実施（要ブラウザ手動確認）」として明確に切り分けた。
