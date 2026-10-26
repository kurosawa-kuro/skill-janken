# 既存GASアプリの比較と写真日記基盤の流用構想

調査日: 2026-10-26。対象はローカルの現行コード。実装前のアイディア文書であり、製品仕様の正本を変更するものではない。

## 結論

**主なコピー元には① `ai-photo-diary` を推奨する。② `ai-english-trainer` からはロック保護・保留要求の保存などを補助的に取り込む。** どちらか一つに絞る場合も①を選ぶ。

①を選ぶ理由は「全体が小さいから」ではなく、今回必要な非公開Driveの画像取得、base64配信、画像表示・失敗時処理の部品があるため。既存の動作実績を活かし、汎用部分はできるだけコピーする。一方、日記アプリ全体を複製すると、投稿・アップロード管理・DB移行など今回不要な仕組みまで引き継ぐ。

ゲームルール、Actionsへの保存、再送契約は両方にそのまま使える実装がない。**①の部品をコピーし、②の有用な保護処理を組み合わせ、ゲーム固有部分を新設する方針**が適切と判断する。共通ライブラリ化や両プロジェクトの大規模な統合は行わない。

## 調査対象と前提

| 対象 | 場所 | 調査時のGit HEAD |
|---|---|---|
| ① 写真日記 | `C:\Users\owner\.ssh\dev\gas\ai-photo-diary` | `0155711` |
| ② 英語トレーナー | `C:\Users\owner\.ssh\dev\gas\ai-english-trainer` | `5d96654` |
| 移植先 | `C:\Users\owner\.ssh\dev\skill-janken` | 設計段階。`src/` は未実装 |

依頼者による「両方とも実装・動作済み」という実績を前提に、手元のコードを比較した。公開中のGASとローカルHEADが同じかは確認していない。[①のREADME](../../../../gas/ai-photo-diary/README.md)には公開版とその後のローカル変更、[②のREADME](../../../../gas/ai-english-trainer/README.md)には実GASでの受入未実施という記録があり、文書の記録だけでは現在の公開版を断定できない。

移植先の判断基準は[構成・API](../../02_architecture.md)、[画像制作](../../04_workflows.md)、[保存・再送](../../05_data_model.md)、[エラー方針](../../06_error_policy.md)、[受入条件](../../07_test_strategy.md)。今回は調査・ローカルテスト・文書化までで、アプリコードのコピーやデプロイは実施していない。

## 「①の方がシンプルか」の比較

| 観点 | ① 写真日記 | ② 英語トレーナー | 今回の判断 |
|---|---|---|---|
| サーバー | 54ファイル・2,725行 | 22ファイル・2,512行 | ファイル数は①が多い |
| クライアント | 16ファイル・1,414行 | 4ファイル・1,108行 | ①は分割、②は大きな画面ファイルに集約 |
| 上記合計 | 70ファイル・4,139行 | 26ファイル・3,620行 | 現行①はコード量でも小さくない |
| 現行テーブル定義 | 10表。別途旧スキーマあり | 15表 | いずれも今回の8表へ置換が必要 |
| 主な業務処理 | 投稿、画像アップロード、下書き生成、移行・回復 | 出題、回答、評価、復習、会話、AI利用記録 | ゲームには持ち込まない |
| Drive画像 | 非公開確認、取得、画像検証、表示あり | 今回求める画像配信部品はない | ①を選ぶ主要な理由 |
| ロック | 取得・解放、flushあり | 入れ子対応と書込み時のロック必須検証あり | ②の部品・試験が有用 |
| 通信途絶への備え | 要求ID、送信内容保持などあり | sessionStorageでの保留情報保持あり | 両方とも今回の契約に合わせる |
| Gemini | 画像を入力できる文章生成 | 文章生成 | 画像生成は両方とも新規対応 |
| WebP | 現行はJPEG/PNG。WebP非対応 | 今回の画像処理なし | ①でも追加実装が必要 |

行数は空行・コメントを含む物理行。サーバーは `src/server/**/*.js` から `generated*` を除外、クライアントは `src/client/**/*.html` からvendorを除外した。テスト・生成データ・外部ライブラリは上記合計に含めない。ファイル数や行数は参考であり、品質や移植工数を直接表す数値ではない。

## コピー候補と変更点

「コピー候補」は無修正で動くという意味ではない。依存先と変更点を確認してから、必要な関数単位で移植する。移植先のファイル名は[構成案](../../02_architecture.md)に合わせて実装時に確定する。

| 部品・用途 | コピー元 | 取り込む内容と必要な変更 |
|---|---|---|
| HTML Serviceの入口 | ② [controllers/web.js](../../../../gas/ai-english-trainer/src/server/controllers/web.js) | 小さなdoGet/include_を土台にする。教材用メニュー・初期化は除く。HTMLパスを移植先に合わせる |
| 初期JSON埋込み | ① [controllers/web.js](../../../../gas/ai-photo-diary/src/server/controllers/web.js) | serializeForScript_のエスケープ処理を利用。日記設定、初回アクセス時のSeeder呼出し、sheetUrlのブラウザ配信は持ち込まない |
| クライアント通信 | ① [core/api.html](../../../../gas/ai-photo-diary/src/client/core/api.html) | Promise化・成功失敗ハンドラを利用。呼出し先をapi(request)に限定し、version/replayed等を捨てない構造へ変更 |
| DOM・画面切替 | ① [core/dom.html](../../../../gas/ai-photo-diary/src/client/core/dom.html)、[core/router.html](../../../../gas/ai-photo-diary/src/client/core/router.html) | DOM操作と画面切替の部品を利用。App名前空間や参照を調整し、日記の画面を今回の5画面へ置換 |
| 非公開Drive取得 | ① [photo/drive-store.js](../../../../gas/ai-photo-diary/src/server/services/photo/drive-store.js) | 所有者・非公開・共有相手・親フォルダー・ゴミ箱判定を利用。IntegrationSettings等を移植先設定へ接続。AssetsのREADY行から内部fileIdを解決する |
| 画像表示 | ① [core/photo-view.html](../../../../gas/ai-photo-diary/src/client/core/photo-view.html) | base64表示、取得中・失敗・再試行、キャッシュを利用。getAssetとWebPに対応させ、assetIdとversionによる識別、名前付き代替表示を実装 |
| Sheetsアクセス | ① [db/sheet-store.js](../../../../gas/ai-photo-diary/src/server/db/sheet-store.js) | Spreadsheet取得、ヘッダー確認、型を考慮した値変換を参考に抽出。TABLES・Settings・TableCacheへの依存を整理し、汎用ストア全体はコピーしない |
| ロックと書込み保護 | ② [core/lock.js](../../../../gas/ai-english-trainer/src/server/core/lock.js) | withLock_/requireWriteLock_とfinally処理を利用。待機時間を今回の3秒へ変更。Actions専用保存処理とflush責務を一か所で定義する |
| 正規化とハッシュ | ① [core/request-hash.js](../../../../gas/ai-photo-diary/src/server/core/request-hash.js)、② [core/errors.js](../../../../gas/ai-english-trainer/src/server/core/errors.js) | SHA-256計算とstableJson_を利用。対象をop・expectedVersion・正規化payloadとし、合成材料の順不同も正規化する |
| 保留要求と操作抑止 | ② [client/app.html](../../../../gas/ai-english-trainer/src/client/app.html) | sessionStorage保存・busy制御を抽出。教材のattempt/session/turn情報は除き、今回の要求全体を送信前に保存する |
| Gemini通信の下地 | ① [draft/gemini-client.js](../../../../gas/ai-photo-diary/src/server/services/draft/gemini-client.js) | キーのヘッダー設定、通信エラー処理などを参考にする。文章抽出部分は画像生成に使えないため置換 |
| ローカル試験基盤 | ① [gas-mock.mjs](../../../../gas/ai-photo-diary/src/tests/gas-mock.mjs)、[drive-mock.mjs](../../../../gas/ai-photo-diary/src/tests/drive-mock.mjs)、② [lock-safety.test.mjs](../../../../gas/ai-english-trainer/src/tests/lock-safety.test.mjs) | Sheets・Properties・Lock・Driveのモックとロック異常系の試験を流用。対象テーブル・ファイル読込・関数名を変更する |

①のGASモックは `.clasp.json` の `filePushOrder` を読むため、モックをコピーしただけでは独立しない。②の[モック](../../../../gas/ai-english-trainer/src/tests/gas-mock.mjs)のserverファイル列挙を参考に、テスト用ローダーを移植先で完結させる。テストを動かす目的で元の `.clasp.json` を持ち込まない。

## 無修正コピーで仕様を壊す箇所

### 保存モデルと不完全行

今回の状態の正本は最新のActions.stateJson。成功した変更を1行だけ追記し、setValues → flush → 再読込確認する。日記の投稿・画像関連表や教材の複数表更新をそのまま当てはめない。

- ①のsheet-store.js L59は主キーが空の行を除外する。不完全なActions行を見落とすため、全空行と不完全行を区別し、後者はDATA_INTEGRITY_ERRORにする。
- ①のwriteValues_は値によってsetValues後にRichTextの追加書込みを行う。汎用関数をそのまま「1行1回の保存」と見なさず、Actions専用の追記処理を作る。
- ②の[sheet-store.js](../../../../gas/ai-english-trainer/src/server/db/sheet-store.js) L218以降は全値を文字列化してRichText保存する。今回必要な数値・真偽値のセル型を保てないため、ストア全体のコピーは不適切。
- ②のappendOnly・ロック必須検証は参考になるが、最新状態の検証、重複判定、200件上限、書込み後の確認まで代替するものではない。

新規テーブルはPlayers / Characters / Skills / CharacterSkills / Recipes / Assets / Actions / Settingsの8表。既存のv2_ / et_接頭辞や移行履歴を引き継がず、初期化は提供者が明示的に実行する。①の日時規約も引き継がず、今回のUTC ISO保存・東京表示に合わせる。

### API・再送・UUID

①は複数の公開関数、②はrpc(name, request)という入口で、両方とも今回のapi(request)と契約が異なる。許可する操作を6種類に限定し、内部・管理関数を末尾アンダースコアに統一する。①のincludeもそのまま公開しない。

両方のクライアントAPIラッパーは成功時に主にdataだけを返す。今回必要な応答メタデータを保持し、エラーも大文字コード・retryable等を含む[現行契約](../../06_error_policy.md)に合わせる。ログへの出力内容も見直す。

①のrequestId生成のフォールバックは日時＋乱数文字列で、UUIDではない。今回のUUID検証に合う生成に変更する。requestId / expectedVersion / op / payloadを含む要求全体をsessionStorageに保持し、同じ要求を手動再送する。

サーバーは同一requestIdの照合をversion・200件上限の判定より先に行う。同じ入力なら保存済み結果を返し、乱数抽選や得点計算をやり直さない。入力が違えばREQUEST_ID_CONFLICT。再送解決後はbootstrapで最新化する。既存アプリに要求IDがあることだけでは、この契約への適合は保証されない。

### 画像は①でもWebP対応が必要

①の[image-validator.js](../../../../gas/ai-photo-diary/src/server/services/photo/image-validator.js) L5はJPEG/PNGだけを許可し、[photo-upload.html](../../../../gas/ai-photo-diary/src/client/core/photo-upload.html) L29はcanvasからJPEGを出力する。現行上限も今回の100KiBとは異なる。MIME文字列だけWebPに変更しても、ファイル内容・寸法の検証は対応しない。

今回必要なのはWebP7枚、各512×512以下・100KiB以下、合計700KiB以下。提供者用の変換・内容確認・登録手順とWebP検証を追加する。日記の写真選択画面、一般アップロード、孤立画像の削除操作を子どもの画面に持ち込む必要はない。

配信はクライアントからassetIdだけを受け取り、サーバーで許可済みREADY行を照合して内部fileIdを取得する。①のDrive権限確認は有用だが、今回のAssets参照制約は別に実装する。

### Geminiの画像生成は新規実装

両方のGeminiクライアントは文章生成結果を取り出す実装。①で画像を入力できることは、画像を生成できることとは別である。

画像生成レスポンスの処理、生成画像の保存、WebP化、内容確認、Assetsへの登録は新たに構成する。生成は提供者の事前作業に限定し、遊び中のAPIには含めない。画像モデル・利用条件・料金は今回調査しておらず、実装時に公式情報で確認する。

## コピー対象から外すもの

| 対象 | 扱い |
|---|---|
| 投稿、下書き、タグ、教材、評価、復習、会話 | 業務機能・画面・マスター・専用テストを持ち込まない |
| 旧DB移行、孤立アップロード回復・削除、複雑なcomposition | 今回の8表・7画像に必要な範囲を超えるため除外する |
| 元の.clasp.json、Script ID、Deployment ID、DB・Drive ID | 移植先専用に新設する。元アプリの接続先を引き継がない |
| .git、node_modules、生成済み業務データ、実データ・ログ | コピーしない。依存関係は必要なものだけ定義する |
| 元のenv/、秘密情報、Script Propertiesの値 | コピーしない。新しい設定項目を定義し、対象環境へ設定する |
| 元のAGENTS・CLAUDE・AI設定・権限設定 | 移植先の現行ガイドを維持する |
| package.jsonのpush/deploy/buildスクリプト | 必要分だけ再構成する。①のdeployには元アプリのDeployment IDが固定されている |
| vendor・CSS | 使用する場合のみ採用し、含まれるライセンス表記を維持する。子ども向けUIの寸法・操作性は別に確認する |

両方のmanifestはV8・Asia/Tokyo・本人実行／本人限定の設定で今回と方向が合うため、[①のmanifest](../../../../gas/ai-photo-diary/src/appsscript.json)をひな形にできる。ただしmanifestが一致していても、実際のデプロイ設定やDrive共有の確認は別途必要。

開発依存には両方ともclasp・Playwright・jsdom・yamlがあるが、①はCommonJS、②はES modulesでスクリプト構成も異なる。両方のpackage一式を混ぜず、実際に使うコピー対象と試験方法に合わせる。元のMakefileはTODOのひな形なので起動基盤として扱わない。

## 実行タスクへの展開

2026-10-26の追加依頼を受け、ゲーム実装の前に土台を3段階で確かめる計画へ具体化した。以下の番号は作業順であり、比較対象の①写真日記・②英語トレーナーとは別の番号。

| 作業順 | タスク | 完了時に確認すること |
|---|---|---|
| ① | [土台作成](../05_done/foundation-01-scaffold.md) | 最小画面・API・アダプター境界とローカル検証がある |
| ② | [GAS・Sheets・Drive・Gemini連携疎通](../03_active/foundation-02-integration.md) | 実環境のbootstrap、非公開画像表示、Gemini画像1枚の生成・保存が通る |
| ③ | [土台拡張](../02_backlog/foundation-03-hardening.md) | Actions保存・再送・画像管理・復元の共通基盤が使える |

実装開始依頼により、①は2026-10-26に実装・ローカル検証を完了し05_doneへ移動した。次は②の実サービス疎通。本書の比較表・コード量は調査時点の記録として残し、具体的な作業チェックリスト・証跡・現在の進捗は各タスクに記録する。

③の完了後に、[MVP親タスク](../02_backlog/mvp-implementation.md)でゲームルール・3変更API・5画面・関係図・7枚の採用画像・全ACを完成させる。基盤の完了とMVP完成は区別する。サーバーの階層構成をコピー元に寄せる場合は、実装時にdocs/02_architecture.mdのファイル配置案も実物に合わせる。

## 調査時の検証記録

Node.js v24.21.0、既存のローカル依存関係を使用。GAS・Drive等をモック化する関連テストを選択して実行した。

| コピー元 | 実行結果 | 範囲 |
|---|---|---|
| ① | 71件成功、失敗0、skip 0 | GAS安全性、画像アップロード・UI、Geminiクライアント、DBv2、回復、構造 |
| ② | 67件成功、失敗0、skip 0 | ロック、復習、構造、アプリケーション、ポート、Gemini |

①のsrc/で実行:

```powershell
node --test tests/gas-safety.test.mjs tests/uploads.test.mjs tests/upload-ui.test.mjs tests/gemini-client.test.mjs tests/database-v2.test.mjs tests/resilience.test.mjs tests/architecture.test.mjs
```

②のsrc/で実行:

```powershell
node --test tests/lock-safety.test.mjs tests/review.test.mjs tests/architecture.test.mjs tests/application.test.mjs tests/application-ports.test.mjs tests/gemini.test.mjs
```

両方とも終了コード0。調査前後のコピー元git status --shortは変更なし。全テスト一式・実ブラウザの通し試験・実GAS・実Drive・実Geminiへの接続試験は今回実施していない。push・deployや秘密情報の同期も実施していない。

この結果はコピー候補のローカル挙動を確認する材料であり、WebP画像生成、今回のActions契約、移植後の動作を確認した結果ではない。移植量・削減時間の割合は、契約変更を実装する前には算出しない。

## 依頼との対応

「動作済みの①または②を極力コピーして使いたい。比較的シンプルな①が適切か」という相談に対する調査記録。指定のGAS参照コピー作戦.mdに書き出した後、内容が分かるアイディア名「既存GASアプリの比較と写真日記基盤の流用構想.md」へ改名する。
