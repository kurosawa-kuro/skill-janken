# 画像機能の撤去と、対戦後のAIセリフ実装

## Goal

画像素材を一切必要としないゲームを作り、生成AIを対戦結果への短いセリフとして組み込む。画像生成はオプションとしても残さない。

## Context

2026-10-26の利用者指示を[設計](../../specs/ai-battle-dialogue.md)とdocs/01〜08へ反映した。現行Web v2は土台までで、GameServiceと5画面は未実装。旧画像生成モデルにはAPI無料枠がない。画像生成の429を解消する作業は廃止し、必要な生成AI連携をテキストに置き換える。

このタスクは未着手。設計反映とコードの撤去・AI実装を混同しない。画像機能の廃止は、既存のDrive素材やゲーム記録の削除を意味しない。

## Scope

- 標準カードをHTML/CSSの図形・名前・スキル効果文で描画する。
- 旧getAsset・画像生成・画像登録・変換コマンド・画像設定依存を除去する。
- 保存済みROUNDを参照するgetBattleLineとテキストGeminiアダプターを作る。
- 親タスクのplayRound・結果モーダルと接続し、保存・操作を止めない演出として検証する。
- 非対象：画像生成の代替サービス探し、課金変更、自由チャット、音声、生成AIによる勝敗やスキルの決定、既存データの破棄。

## Skeleton

playRound保存完了 → 結果と定型文を表示 → 別RPC getBattleLine(roundRequestId) → 保存済みROUND検証 → 予約・回数計上 → ロック解除 → テキストAI → 応答検証 → 同じ結果画面だけ更新。

AI停止時は定型文。生成失敗でROUNDを巻き戻さず、同一対戦の生成を再実行しない。上限・予約・セリフの永続化に失敗したらAIを呼ばない。

## Plan

- [ ] src/server/services/gemini.jsの画像プロンプト・画像パート処理とsrc/server/services/assets.jsを撤去する。後者のisPrivateOwned_はsetup/backupが必要とするため、core/access.js等へ必要部分だけ移す。
- [ ] src/server/controllers/admin.jsのimageFolder_必須呼出し、generateFirstAsset_・registerWebp_・updateAssetRow_を除く。setupとバックアップを画像設定なしで試験する。
- [ ] src/server/adapters/external.jsの画像アダプターを撤去。core/settings.jsから画像フォルダー・画像モデルの参照を除き、GEMINI_TEXT_MODELとJANKEN_AI_TEXT_ENABLEDを追加する。
- [ ] scripts/operator.mjsのgenerate/inspect（画像用）/register、scripts/convert-webp.mjsを撤去。setup/backup/restore/verifyは保持する。新しいテキスト疎通は検証済みROUNDを用い、画像コマンドを流用しない。
- [ ] client/core/assets.htmlと画像デコード・img要素処理を撤去。名前・図形カードと9種類の定型セリフを実装し、index/webのinclude許可リスト・scripts/files.mjsを同期する。
- [ ] APIのgetAssetを除去し、getBattleLineのUUID限定入力・共通応答を追加する。bootstrap/対戦/合成は画像設定・画像メタデータやAI設定不足に依存させない。
- [ ] Assets表とassetId列は互換用に保持し、ゲームへの参照を外す。既存8表・Actions・バックアップが読めることを確認する。
- [ ] AiLineServiceとテキストGeminiアダプターを分離。保存済みP001/ROUNDのみ参照し、対戦結果・プロンプトをクライアントから受け取らない。
- [ ] Script Propertiesへ1対戦1予約、日次20試行、429等で当日停止を実装。外部通信中はScriptLockを解放する。200対戦分の保持上限、停止時・保存失敗時の定型文を検証する。
- [ ] GameServiceのplayRoundと結果モーダル完成後に接続。3秒の表示待ち・遅延応答破棄・再読込で再生成なしを確認する。
- [ ] テキストモデルの実疎通、勝ち／負け／あいこの短文の内容、AI停止中の全ゲーム操作を確認する。無料枠で利用できない場合は事実を記録し、課金を自動で有効化しない。
- [ ] 不要な画像用テストを撤去理由付きで置き換え、保存系・権限系の試験を維持する。ビルドに画像コード・画像用管理関数がないことを検証する。
- [ ] GASへ反映する際はリモートだけに残る画像ファイルも除去し、通常distとの一致を確認する。旧Web v2から再配置し、結果をdocs/07へ記録する。

## Acceptance Criteria

- [ ] 画像生成・画像取得・画像登録・WebP変換の製品経路が存在せず、画像フォルダー・画像モデル未設定で起動できる。
- [ ] 3体・4スキルを画像なしで識別し、仲間獲得→対戦→合成→S04→つながり→再開を完走できる（改訂AC16）。
- [ ] APIキーなし／AI無効／429／5xx／拒否／遅延時も結果が保存され、定型文で続行できる（改訂AC17）。
- [ ] 保存済みの結果に対応する短いAIセリフを実環境で確認する（AC24）。
- [ ] 保存成功より前にAIを呼ばず、古い応答が別の対戦に混ざらない（AC25）。
- [ ] 同一対戦の重複生成・日次上限超過・自動再試行がなく、画像用モデルへ接続しない（AC26）。
- [ ] 不正参照、秘密情報の露出、原文HTML描画がなく、既存記録・復元・本人限定の条件を維持する。

## Verification

未実施。今回実施したのは設計・依存調査・文書整合確認。現行40テストや過去のWeb v2疎通を新仕様の合格として流用しない。実装時はnpm run check、ローカル障害注入、実GASのテキスト生成、実機Golden Pathを区別して記録する。

## Notes

[親タスク](mvp-implementation.md)のゲーム実装と接続して進める。③の旧画像生成確認をPASSにせず、この設計により廃止したことを残す。②の別アカウント拒否確認は独立した必須条件として維持する。
