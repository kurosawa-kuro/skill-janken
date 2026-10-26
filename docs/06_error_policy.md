# 06 エラー方針 — スキルじゃんけんラボ

反映日：2026年10月26日。初期資料（退避済み）：[02_仕様書.md](archive/スキルじゃんけんラボ_企画・仕様・設計/02_仕様書.md)・[03_設計基礎書.md](archive/スキルじゃんけんラボ_企画・仕様・設計/03_設計基礎書.md)（v1.0）。

本書は提案仕様をプロジェクト用に整理した設計文書。アプリ実装・受入試験・公開は未完了であり、実績や試験合格を示さない。参照元と本書の役割・更新規約は[索引](00_index.md)を参照。

## 応答と結果未確定の区別

業務エラーは `api(request)` から `{ok:false, requestId, error:{code, message, retryable, details}}` を返し、google.script.runの成功ハンドラーで処理する。GAS・通信の例外は失敗ハンドラーで扱う。変更処理の失敗ハンドラーが呼ばれても、書込みが未実行とは断定しない。

完全な要求・成功応答・エラー応答例は[API契約](02_architecture.md)を参照する。再送解決まで新しい要求を作らず、自動再試行は初版では行わない。

## エラー一覧と表示

| コード | 子ども向け表示 | 状態・再操作 |
|---|---|---|
| INVALID_ARGUMENT | えらびなおしてね | 変更なし。入力を修正 |
| CHARACTER_NOT_OWNED | そのなかまはまだいないよ | 変更なし |
| SKILL_NOT_AVAILABLE | このスキルはまだつかえないよ | 変更なし |
| ALL_OWNED | みんなそろったよ | 変更なし |
| RECIPE_NOT_FOUND | このくみあわせはまだないよ | 変更なし |
| INSUFFICIENT_POINTS | あと○ポイントためよう | 変更なし。不足値を表示 |
| ALREADY_UNLOCKED | もうおぼえているよ | 変更なし |
| VERSION_CONFLICT | きろくがかわったよ。よみなおそう | 最新状態取得。自動で新規操作しない |
| REQUEST_ID_CONFLICT | つうしんをかくにんしてね | 同じIDで異なる内容。大人に案内 |
| BUSY | ちょっとまって、もういちど | 同じ要求を再送可能 |
| OP_LIMIT | きょうのデモはここまで。大人をよんでね | 200件上限。提供者が保存・初期化 |
| ASSET_UNAVAILABLE | えのよみこみにしっぱいしたよ | 代替表示。遊びは継続 |
| DATA_INTEGRITY_ERROR | きろくをかくにんしています。大人をよんでね | 変更を停止。自動初期化しない |
| INTERNAL_ERROR / 通信失敗 | つうしんをかくにんして、もういちど | 結果未確定。同じIDで再送 |

内部例外やGoogleのエラー本文、APIキー、DriveのファイルIDは子ども向け画面に表示しない。

①土台作成ではINVALID_ARGUMENT・ASSET_UNAVAILABLE・DATA_INTEGRITY_ERROR・INTERNAL_ERRORの共通応答と、クライアント側の業務／通信失敗の区別を実装した。設定不足・未実装処理はINTERNAL_ERROR（retryable=false）等で停止し、仮データの成功に置き換えない。②では実読取・非公開画像・生成アダプターとBUSYを追加した。設定不足は設定後に手動再試行する。③でActionsの追記・再送とVERSION_CONFLICT・REQUEST_ID_CONFLICT・OP_LIMITを追加した。壊れたActionsではDATA_INTEGRITY_ERRORで停止する。ゲーム操作の業務判定は後続。

不明な例外は定型のINTERNAL_ERRORへ変換する。元の例外本文・スタックをレスポンスやアプリログへ出さない。クライアント側のNETWORK_ERRORは通信失敗を識別するローカルコードであり、新しいサーバー業務コードではない。

## 再送・競合・不整合の扱い

1. 変更要求を送信する前にUUID形式のrequestIdを採番し、op・payload・expectedVersionを含む要求全体をsessionStorageに保持する。通信中はすべての変更操作を無効にする。
2. BUSY・INTERNAL_ERROR・通信失敗では、同じID・入力・expectedVersionを再試行ボタンで送る。新しいIDで操作をやり直さない。
3. サーバーは整合性検証後、既存requestIdとpayloadHashの照合をversion・200件上限より先に行う。保存済みなら乱数や加減算をやり直さず返す。
4. 成功確認後に保留要求を消す。再送結果のstateは当該操作直後の状態なので、bootstrapで最新状態を取得する。再読込で保留要求がある場合も先に解決する。
5. VERSION_CONFLICTでは最新状態を読み直し、新しい変更を自動実行しない。REQUEST_ID_CONFLICTでは大人に案内する。
6. 不完全行・参照不整合はDATA_INTEGRITY_ERRORで停止する。初期化、過去行への巻戻し、記録を見ずにポイントを手修正する処理を入れない。

タブを閉じて保留要求を失った場合は、次回bootstrapで最新状態を表示し、元の画面操作を自動再実行しない。結果表示中の再タップも新規要求にせず、「もういちど」の次の対戦だけ新しいIDを発行する。

保存処理の厳密な順序と不完全行検出は[データモデル](05_data_model.md)、調査・復元・200件到達時の初期化は[リリース手順](08_release_runbook.md)を参照する。

## AIセリフの失敗

AIの未設定・無効・無料枠超過・429・5xx・拒否・形式不正・表示待ち3秒超過は定型文へ切り替える。既に保存した対戦結果を失敗に変えず、ポイントを二重適用しない。子ども向け画面に課金やAPIエラーの解消を要求しない。

getBattleLineは未知ROUNDや改ざん入力をINVALID_ARGUMENTで拒否し、ゲーム記録破損はDATA_INTEGRITY_ERRORとする。AIサービスの失敗はsource=presetの応答とし、内部診断はキーや生の応答を出さない。429・認証・モデル利用不可では当日停止し、自動再試行しない。詳細は[再設計](specs/ai-battle-dialogue.md)。画像用ASSET_UNAVAILABLEと画像管理経路は撤去対象。
## ログと表示

- Apps Scriptの実行失敗、Actions件数、制作時の利用量を提供者が確認する。障害調査ではrequestIdと直前状態を照合する。
- APIキー、OAuthトークン、認証情報、子どもの氏名・顔写真・入力内容をログへ残さない。キーはURLやログに含めない。
- 内部例外・Googleのエラー本文・Drive fileIdを子ども向け画面へ返さない。名前やエラーはtextContent等で表示し、シート文字列をHTMLとして解釈しない。
- 行動記録には仕様どおり入力・結果・次状態を保存するが、getRelationsではpayloadHash・内部入力・トークン・内部パスを返さない。

## 関連タスクと回帰確認

エラー変更時は再現条件と期待する状態をタスクへ記録し、[AC06・AC08〜AC13・AC17・AC20〜AC23](07_test_strategy.md)を確認する。復旧で得た恒久手順はタスクだけに残さず、データモデルまたはリリース手順へ反映する。

### 保留要求の解決（③実装）

送信前のsessionStorage保存に失敗したら送信しない。読込時に破損・容量超過・保存領域アクセス失敗があれば要求を消さず変更を停止する。通信失敗、BUSY、INTERNAL_ERROR、DATA_INTEGRITY_ERROR、REQUEST_ID_CONFLICT、応答IDや版の不一致は保留を維持する。自動再送はしない。

成功応答のID・版・状態を照合して保留を削除し、bootstrapで最新化する。削除失敗は変更停止。成功後のbootstrap失敗では再送せず読取りを再試行する。VERSION_CONFLICT、OP_LIMIT、入力や業務条件の確定的な拒否は保留を解除して最新化する。新規操作は同期成功後のみ許可する。
