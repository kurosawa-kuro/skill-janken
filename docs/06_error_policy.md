# 06 エラー方針 — スキルじゃんけんラボ

反映日：2026年10月26日。初期資料（退避済み）：[02_仕様書.md](archive/スキルじゃんけんラボ_企画・仕様・設計/02_仕様書.md)・[03_設計基礎書.md](archive/スキルじゃんけんラボ_企画・仕様・設計/03_設計基礎書.md)（v1.0）。

本書は現行仕様を定義する。ローカル実装・検証済み範囲と未完了の実環境確認は[最新記録](tasks/03_active/mvp-release-verification.md)および[テスト戦略](07_test_strategy.md)で区別する。参照元と本書の役割・更新規約は[索引](00_index.md)を参照。

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
| VERSION_CONFLICT | きろくがかわったよ。よみなおそう | 最新状態取得。自動で新規操作しない |
| REQUEST_ID_CONFLICT | つうしんをかくにんしてね | 同じIDで異なる内容。大人に案内 |
| BUSY | ちょっとまって、もういちど | 同じ要求を再送可能 |
| OP_LIMIT | きょうのデモはここまで。大人をよんでね | 200件上限。提供者が保存・初期化 |
| DATASET_MISMATCH | このきろくは大人といっしょにかくにんしてね | 保存先変更。旧要求を新ブックへ送らない |
| LEGACY_DATA_READ_ONLY | このきろくは大人といっしょにかくにんしてね | 旧マスター版の新ゲーム書込を停止。自動移行・初期化なし |
| DATA_INTEGRITY_ERROR | きろくをかくにんしています。大人をよんでね | 変更を停止。自動初期化しない |
| INTERNAL_ERROR / 通信失敗 | つうしんをかくにんして、もういちど | 結果未確定。同じIDで再送 |

内部例外やGoogleのエラー本文、APIキー、DriveのファイルIDは子ども向け画面に表示しない。

①土台作成ではINVALID_ARGUMENT・ASSET_UNAVAILABLE・DATA_INTEGRITY_ERROR・INTERNAL_ERRORの共通応答と、クライアント側の業務／通信失敗の区別を実装した。設定不足・未実装処理はINTERNAL_ERROR（retryable=false）等で停止し、仮データの成功に置き換えない。②では実読取・非公開画像・生成アダプターとBUSYを追加した。設定不足は設定後に手動再試行する。③でActionsの追記・再送とVERSION_CONFLICT・REQUEST_ID_CONFLICT・OP_LIMITを追加した。壊れたActionsではDATA_INTEGRITY_ERRORで停止する。ゲーム操作の業務判定はローカル実装済み。

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

合成関連の業務エラーは現行ゲームから除外する。旧synthesizeはINVALID_ARGUMENT、S04の対戦要求はSKILL_NOT_AVAILABLEで拒否し状態を変更しない。旧ブックや旧保留要求は[データモデル](05_data_model.md)に従って管理者が照合する。

## AIセリフの失敗

プレイ中にAIを呼ばない。管理画面での未設定・429・5xx・拒否・遅延・応答喪失は管理処理だけの失敗とし、採用済み集を維持する。生成失敗で対戦結果やActionsを変更しない。429・認証・モデル利用不可では当日の管理生成を停止し、自動再試行しない。

採用集の未作成・破損・読込失敗は定型文で継続し、追加取得や自動生成はしない。Actionsの破損は従来どおりDATA_INTEGRITY_ERRORで停止する。管理者の未認証・不一致は管理操作を拒否し、下書きや秘密情報を返さない。旧getBattleLine案とASSET_UNAVAILABLEの画像経路は廃止する。[現行設計](specs/ai-battle-dialogue.md)を参照。

## ログと表示

- Apps Scriptの実行失敗、Actions件数、制作時の利用量を提供者が確認する。障害調査ではrequestIdと直前状態を照合する。
- APIキー、OAuthトークン、認証情報、子どもの氏名・顔写真・入力内容をログへ残さない。キーはURLやログに含めない。
- 内部例外・Googleのエラー本文・Drive fileIdを子ども向け画面へ返さない。名前やエラーはtextContent等で表示し、シート文字列をHTMLとして解釈しない。
- 行動記録には仕様どおり入力・結果・次状態を保存するが、getRelationsではpayloadHash・内部入力・トークン・内部パスを返さない。

## 関連タスクと回帰確認

エラー変更時は再現条件と期待する状態をタスクへ記録し、[AC06・AC08〜AC13・AC17・AC20〜AC23](07_test_strategy.md)を確認する。復旧で得た恒久手順はタスクだけに残さず、データモデルまたはリリース手順へ反映する。

### 保留要求の解決（③実装）

送信前のsessionStorage保存に失敗したら送信しない。読込時に破損・容量超過・保存領域アクセス失敗があれば要求を消さず変更を停止する。通信失敗、BUSY、INTERNAL_ERROR、DATA_INTEGRITY_ERROR、REQUEST_ID_CONFLICT、応答IDや版の不一致は保留を維持する。自動再送はしない。

成功応答のID・版・状態を照合して保留を削除する。通常の初回成功は応答stateで更新し、手動再送・replayed=trueはbootstrapで最新化する。削除失敗は変更停止。成功後のbootstrap失敗では再送せず読取りを再試行する。VERSION_CONFLICT、OP_LIMIT、入力や業務条件の確定的な拒否は保留を解除して最新化する。新規操作は同期成功後のみ許可する。

管理専用エラーはFORBIDDEN（実利用者不一致）、AI_DISABLED（明示trueでない）、AI_UNAVAILABLE（モデル不許可）、AI_LIMIT（日次20・停止中・累計予約200）。公開競合はVERSION_CONFLICT。外部本文は返さず、生成試行後の失敗はstatus=failed、予約だけ残った再確認はunknownとして自動再生成しない。

管理画面の一覧・公開・生成処理に失敗したら、一覧の再読込が成功するまで新しい変更を止める。保留中の生成要求は保持する。生成停止理由と当日の使用回数を表示し、無効・未設定・日次上限・停止中では生成ボタンを無効化する。既存候補の採用・解除は生成の有効化とは独立する。
