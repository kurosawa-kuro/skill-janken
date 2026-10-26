# ② GAS・Sheets・Drive・Gemini連携疎通

## Goal

本人限定GAS環境の初期化・読取と公開制限を確認する。旧スコープのDrive画像配信は実測履歴として保持し、Gemini画像生成経路は廃止する。新しいテキストAIは別タスクで確認する。

## Context

[① 土台作成](../05_done/foundation-01-scaffold.md)のローカル検証完了が前提。[親タスク](mvp-implementation.md)の第2段階。認証・接続先・画像出力形式の問題を、ゲーム機能を作る前に切り分ける。2026-10-26に着手。実アダプターと最小画像表示を実装し、専用GAS配置・Sheets初期化・初期画面表示を実測済み。Driveのテスト用WebP実配信まで確認済み。旧画像生成はHTTP 429。2026-10-26の再設計で画像生成を廃止したため、課金・割当解消を本タスクの完了条件にしない。

## Scope

- スキルじゃんけん専用のGAS、Sheets、非公開Drive、Script Propertiesを準備し、本人限定の試験配置を行う。
- Sheetsも疎通対象に含める。仕様どおりの8表と初期マスターをテスト専用の新規ブックに作り、bootstrapで読む。
- 仕様に適合するWebPを1枚用意し、許可されたAssets経由で画面表示する。
- 廃止した旧スコープ：固定プロンプトの画像生成とDrive保存。今後は実行せず、テキストAIのタスクへ切り替える。
- ゲーム変更操作、Actionsの本格運用、旧画像素材の完成（廃止）、現行ゲーム4画面は対象外。耐障害性・共通化は③で仕上げる。

## Skeleton

| 経路 | 最小の実装 | 観測する結果 |
|---|---|---|
| ブラウザ→GAS | doGet / api(bootstrap) | 実HTML Service上のgoogle.script.runで正常応答する |
| GAS→Sheets | 提供者の明示的初期化、8表の読込 | P001・初期state・マスターが実ブックと一致。Actionsは0件 |
| Drive→画面 | registerWebp_ / api(getAsset) | READYのWebP1枚がbase64で表示される |
| 旧GAS→Gemini→Drive | 廃止した管理関数generateAsset_ | 画像生成は未達のまま廃止。今後の完了条件ではない |

Drive配信試験のWebPは事前に用意したものでもよい。旧設計の生成→WebP→登録→表示の条件は廃止した。疎通用の新しい公開opや子ども向け管理ボタンは追加しない。

## Plan

- [x] 実装日に公式資料でGAS公開設定・必要権限・Gemini画像生成対応モデルと料金を確認し、出典・確認日を記録する。
- [x] 新しい接続先と実行アカウントを設定する。APIキー、画像モデルID、Spreadsheet ID、DriveフォルダーIDはScript Propertiesに置く。
- [x] 初回認可と本人限定配置を実施する。接続先がコピー元ではないことを確認し、再配置手順を記録する。
- [x] 新規テストブックに8表と初期マスターを作る。既存データを自動消去・上書きする初期化は作らない。
- [x] bootstrapで実データを読み、型・ヘッダー・基本参照を検証する。Sheets未接続時にモックへ自動で切り替えない。
- [x] WebP1枚の内容・寸法・容量を確認して登録し、getAssetで表示する。元ファイルの非公開・所有者・親フォルダーも確認する。
- 廃止：generateAsset_で画像を生成する条件。未実施をPASSにせず、旧要件から削除。
- [ ] 未知assetId・取得失敗時の代替表示、未ログイン・別アカウントでのWebアプリ拒否、Driveの非公開を確認する。
- [x] 実コマンド・設定項目・配置手順・疎通結果をdocs/04・08と本タスクへ記録する。

## Acceptance Criteria

- [x] 本人のブラウザでbootstrapが実ブックの初期状態を返し、再読込しても一致する。
- 旧画像配信条件：過去の実測はVerificationに保持する。新仕様の受入条件からは削除する。
- 廃止：Gemini画像の実生成・Drive保存。新しいAI疎通は[テキストAIタスク](ai-battle-dialogue.md)で確認する。
- [ ] APIキー・内部接続IDをブラウザに配信しない。旧画像の生成元／採用の区別は新仕様では対象外。
- [ ] 本人限定アクセスと共有制限を実環境で確認し、実装版・確認日時・使用モデル・観測結果を記録する。

## Verification

2026-10-26の部分実測。キー・トークン・応答base64全文は証跡に含めない。

| 確認 | 期待結果 | 実測・証跡 |
|---|---|---|
| GAS / Sheets | 初期状態と8表が一致 | 10:18:26 JST 初期化ログ「8 tables, 0 actions」。Web版v1で初期表示・再読込成功。提供者の画面確認あり |
| Drive / getAsset | WebP1枚の表示と失敗時代替 | 10:39 JST、テストWebPをA_C01へ一時登録。実Web版v1でdata URL・naturalWidth/Height 256・loaded=true・hidden=falseを確認。1,570 bytes、非公開。DRAFT時は「ひのこ」代替表示 |
| Gemini / Drive保存 | 画像1枚を取得し保存後に開ける | 10:34:28 モデル一覧HTTP 200・設定モデルあり。10:35:27 画像生成HTTP 429。元画像未作成、提供者は無料プラン／未確認。当時は課金・割当確認待ち。その後、画像生成を廃止 |
| アクセス制限 | 本人は成功、他者・未ログインは拒否 | 本人表示成功。未ログインHTTPは302でaccounts.google.com。Sheets・フォルダーは所有者1名・shared=false。別アカウントは未実施 |

### 接続先・実行記録

- 実行アカウント：kurosawa8122@gmail.com（提供者が指定）。既存ai-photo-diaryの接続先は使用していない。
- [専用GAS](https://script.google.com/home/projects/16HQpi-WPKc65N4_SZG_uOaEDmAIBQfeXN4Ec53YLhb6Wfqw5aLzoL612/edit)
- [専用Sheets](https://docs.google.com/spreadsheets/d/1_pt5DNBZYFfPzK69MOK6uxRE65KPPnLv8TWU3htpRgA/edit)
- [非公開画像フォルダー](https://drive.google.com/drive/folders/1et-kIZ-8TBKR-UmeW9N3ovHHuktzUSdJ)
- [本人限定Web版v1](https://script.google.com/macros/s/AKfycbzIuW2SN4fHspqgsTt_xthwnAKhRjutum3RWYky6LesQjaPIWPpvQIAxBmVt8rR65dh/exec)：通常19ファイルから配置。ゲーム変更操作は未実装。
- ローカル：2026-10-26 10:43 JST、npm run checkで26テスト・19ファイルbuild・Chromium 156.0.8078.4 / 360×800成功。キー・実サービスを使わない単体試験と、上記の実測は区別する。
- 初回認可と管理関数実行の手順は[docs/08](../../08_release_runbook.md#管理関数の一時実行)。モデル・料金の確認は[docs/04](../../04_workflows.md)。生成候補モデルはgemini-3.1-flash-lite-image、キー値は記録しない。

## Notes

以下は旧画像経路の履歴であり再実行手順ではない。10:28:37の初回画像実行はGEMINI_IMAGE_MODEL未設定のため通信前に停止。キーは設定済みで、モデル設定を補った。次にscript.external_request不足を確認し、提供者が追加認可。モデル一覧取得は成功したが、画像生成HTTP 429で停止した。APIの自動再試行はない。後の再設計で画像生成を廃止した。

2026-10-26、利用者の「次進んで」により[③ 土台拡張](foundation-03-hardening.md)の独立部分を先行した。その後の再設計で画像生成待ちは解除した。②は別アカウント拒否等の未確認を残すため、完了扱いにしない。

### 残る確認

- 画像生成の再試行・課金確認は廃止。テキストAIの実疎通と画像コード撤去は新タスクへ移す。
- 別アカウントでの拒否を確認する（未ログイン302だけで代替しない）。
- Gemini生成画像のWebP化・正式採用は未実施。配信試験画像は幾何学的なテストデータで、ゲーム用素材ではない。証跡artifacts/integration-drive-webp.png。

### 試験後の復帰

2026-10-26 10:41:22 JST、A_C01が今回のテストファイルを参照し生成元が空であることを確認したうえで、ロック内で登録解除。webpFileId／mimeTypeを空、byteSizeを0、statusをDRAFT、versionを2へ更新し再読込確認した。テストファイルは非公開の試験資料として残し、正式素材には数えない。一時server/operator-run.gsをGASエディタで削除し、通常18コード／HTML＋manifestの19ファイルへ復帰した。Web版v1を一時管理コードで更新していない。

## 2026-10-26 後続実装の更新

画像・合成を撤去したゲームと管理AIのローカル実装・46テスト・Chromium E2Eは完了。旧画像試験の結果は履歴として保持する。新コードの実配置・最終受入は[配置タスク](mvp-release-verification.md)で追跡し、この基盤の過去実測を新仕様の実測に読み替えない。
