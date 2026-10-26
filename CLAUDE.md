# CLAUDE.md

2026-10-26追補：利用者の指示に従い、検証は最後にまとめる。基本機能・DB再設計に続き、ゲーム4画面・結果・管理画面のUI/UXを再設計した。ソース・設計書・テストコードの更新は実施済み、検証実行・実DB移行・配置は未実施。

このファイルは Claude Code がこのリポジトリで作業する際の最小ガイド。

## 今回のプロジェクト

**スキルじゃんけんラボ**は、仲間集め・スキル選択・CPUじゃんけんから、1対多・多対多のデータのつながりを学ぶWebアプリ。GAS / HTML Service / JavaScript / Sheets / Driveを使い、Geminiは管理画面でのセリフ事前生成にだけ使う。画像生成は廃止し、画像なしのカード表示を標準にする。

2026-10-26：ゲーム基本機能と管理画面のAIセリフ事前生成はローカル実装済み。続いてDBを物理スキーマ2（ゲーム6表・型付きActions）へ再設計し、旧形式の読取りと非破壊移行を実装した。続いてUI/UXを対戦中心の導線・選択と決定の分離・画像不要のラボ風へ再設計した。最新変更は未検証・実GAS未反映。46件PASSは5b6bb44時点の過去記録であり、最新変更の合格を示さない。 [最新記録](docs/tasks/03_active/mvp-release-verification.md)を参照。

## Source of Truth

- Project overview: `README.md`
- 共通作業ガイド・MVPの不変条件: [AGENTS.md](AGENTS.md)（作業前に読む）
- Documentation index: `docs/00_index.md`
- 現行仕様の正本: [要件・画面](docs/01_requirements.md) / [構成・API](docs/02_architecture.md) / [ドメイン](docs/03_domain_model.md) / [開発・AI連携](docs/04_workflows.md) / [データ・保存](docs/05_data_model.md) / [エラー](docs/06_error_policy.md) / [テスト・結果記録](docs/07_test_strategy.md) / [公開・復旧](docs/08_release_runbook.md)。
- 反映確認と実装進捗: [反映対応表](docs/09_source_traceability.md) / [MVP実装バックログ](docs/tasks/03_active/mvp-implementation.md)。
- Harness 全体像: `.claude/README.md`（このリポジトリの AI 制御一式）
- Harness アーキ本体: `docs/specs/kurosawa-thin-harness-architecture.md`（tool-agnostic マスター）＋ repo 固有 instantiation（`docs/specs/{runtime-protocol,capability-boundary,change-boundary,evidence-policy,judgment-memory}.md`）
- 判断日誌 / 蒸留記憶: `docs/decisions/decision-log.md` / `docs/memory/`
- Feature spec（実装前・1 機能ごと）: `SPEC.md`
- Task notes: `docs/tasks/`

**spec の使い分け（混同しない）**: `SPEC.md` = 今から作る 1 機能の使い捨て実装スペック（公式 Explore→Plan→Implement→Commit の入口、新セッションで実行）。`docs/specs/` = 恒久アーキ設計マスター。`docs/tasks/` = タスク台帳。

現行仕様はdocs/01〜08を正本とし、`SPEC.md` やタスクメモで上書きしない。試験結果はdocs/07とタスクへ記録する。元の3文書は[archive](docs/archive/README.md)に退避済みの履歴資料で、現行文書より優先せず、今後の仕様変更でも更新しない。仕様変更時は連動する製品文書とルートの要約を同期し、設計・実装済み・検証済みを区別する。

## コマンド

Node.js 22以上。ルートで `npm ci`、必要なら `npx playwright install chromium`、`npm run check`。checkは整形確認・Nodeテスト・ビルド・Chromium確認を行う。`npm run preview` は127.0.0.1:4173の仮データ表示。Makefileはnpmのラッパー。`npm run build` は許可リストの31実行ファイルと.claspignoreをdistへ出力するだけで、実配置は行わない。

## アーキテクチャ

- GASソースは `src/server/` の通常JS、画面は `src/client/`。controllers・core・application・adaptersに分け、ゲーム固有のRulesはservices/game.js。保存はdb/actions.jsのcommitAction_へ状態遷移を注入する。実配置用のアダプターは未接続時にエラーとなり、仮データへ自動切替しない。Nodeのscripts/testsはES modulesで、配布物に含めない。
- `doGet()` でHTMLを配信し、画面通信は `google.script.run` → `api(request)`。独立RESTサーバーは設けず、内部関数は末尾 `_`、管理画面の公開入口は認可付き `adminApi` とする。
- SheetsはPlayers / Characters / Skills / CharacterSkills / Actions / Settingsのゲーム6表と任意の管理2表。物理スキーマ2、マスター2。初期所有と最大200件の型付きActionsから現在状態を復元し、重複する状態JSONを保存しない。旧物理1は読取り専用で、マスター2だけ別ブックへ明示移行する。
- GAS実行時のAPIキー・テキストモデルID・AI有効化設定・Spreadsheet IDはScript Propertiesで管理する。`env/` / `doppler.yaml` は既存の開発用ひな形であり、GASへの同期を前提にしない。秘密情報をコミット・画面配信・ログ出力しない。
- 設計・運用ドキュメントは `docs/` 配下。権威順位と更新規約は `docs/00_index.md` に従う。
- パス別ルールは `.claude/rules/` 配下に置く。
- 一回性の作業計画は `docs/tasks/`、繰り返し使う作業手順は `.claude/skills/` に置く。

## 実装時の重点

- 初期状態はC01・S01〜S03・0ポイント・version 0。基本3種は初期習得、適性6行固定。スキルは勝敗を変えず条件一致で+1。合成・S04・R01・消費は廃止し、pointsは累計スコア。旧保存データを自動変換しない。
- 変更処理は `ScriptLock` 内で検証し、入力・抽選結果を型付き15列のActionsへ1行追記、flush後に再読込確認する。同じ `requestId` の照合はversion・200件上限の判定より先。再送で乱数・加減算を繰り返さない。
- 保留要求は同じID・入力・`expectedVersion` で手動再送し、解決後にbootstrapで最新化する。不整合時は停止し、自動初期化しない。
- 提供者本人限定の公開とし、任意playerId・Drive fileIdをAPIで受け付けない。所有・習得・適性・勝敗・ポイントはサーバー側で検証・計算する。
- 画像生成・画像登録・getAsset配信は廃止。図形・名前・効果文で3体と3スキルを表す。AIは提供者用管理画面で事前生成・確認・採用する。ゲームはbootstrapで採用集を読み込み、保存結果からローカル選択する。プレイ中の生成・セリフ専用RPCは禁止。詳細は[再設計](docs/specs/ai-battle-dialogue.md)。ローカル実装済み・実環境未反映。
- 学習画面は実データを使う。360px幅で収め、主ボタン44px以上、原則16px以上の本文、代替テキスト・読み上げ・キーボード操作を備える。
- 実装順は①土台作成→②GAS・Sheets・Drive・Gemini疎通→③保存・再送・バックアップ基盤→画像機能撤去・ゲームルール・4画面・AIセリフ・学習画面→AC01〜AC26。勝敗9組・加算9組から、再送・競合・復旧・実機・アクセス制限まで証跡を残す。画像制作は受入条件から外し、AIセリフはAC24〜AC26で検証する。
- 課金・対人戦・複数プレイヤー・一般公開・画像生成・自由チャットなど、初版の対象外機能を追加しない。詳細な範囲は[要件](docs/01_requirements.md)と `AGENTS.md` を参照する。

## 作業ルール

- 推測でコードを書かない。コマンドを書いたら実際に実行して確認する。
- 仕様変更は連動する `docs/` とテストを同一 PR で直す。drift を作らない。
- 既存の関数・ユーティリティ・パターンを優先的に再利用する。
- task note を仕様の正本にしない。確定内容は `docs/specs/`、`docs/adr/`、`docs/runbooks/` に昇格する。
- **Scope invariant（常時）**: 作業中に Goal/Scope 外の変更・前提崩れ・追加副作用・docs と実装の矛盾を見つけたら即実装しない。`control-change` で分類するか follow-up task に残す。「ついで修正/共通化/改名」は scope creep。

## AI Runtime Protocol（薄い・常時）

Thin Harness の常時手順。詳細は `.claude/README.md` と `docs/specs/runtime-protocol.md`、停止条件は同 §「停止して owner に確認する」。

> **このハーネスは重い既定で出荷されている。** 新規生成直後は、まず skill `harness-trim` を1回回し、このプロジェクトの脅威モデルに合わせて hooks / rules / permissions / agents / skills を keep・delete・adjust する（削除は想定手順で scope creep ではない）。以降は下記の常時手順に従う。

1. Goal / Scope / Done を言い直す。
2. Weight Class を判定（Light / Standard / Heavy → `classify-task`）。Light は以降の重い手順をスキップしてよい。
3. owner-only 判断・保護 capability・allowed/forbidden paths を確認（`scan-decisions` / `capability-boundary.md` / `change-boundary.md`）。
4. Standard/Heavy の新機能は **plan モードで探索（編集せず読む）→ `SPEC.md` を自己完結で記述（触るファイル/IF 名指し・Non-scope・末尾 E2E 検証）→ 可能なら新セッションで実行**。その後 skeleton + TDD contract を先に固める（`plan-skeleton`）。
5. scope 内で最小変更を当てる。複数 attempt が要るなら停止条件付きで回す（`reconcile-task`）。
6. 必要 Evidence Level（≥2、本番は4）で検証（`verify-completion` / `evidence-policy.md`）。
7. scope 拡大・保護境界接触・二度違う理由で検証失敗 → 停止して owner へ。
8. 非自明な判断を下した時だけ記録（`log-decision`）。
