# スキルじゃんけんラボ — ドキュメント索引

このディレクトリは、プロジェクトの要件・設計・ワークフロー・テスト・リリース運用の正本。`AGENTS.md` は Codex / 他エージェント向けの repo ガイド、`CLAUDE.md` は Claude Code の司令塔、`docs/tasks/` は毎日の作業計画・実装タスク・調査ログの実行ハブ、`.claude/skills/` は Claude Code で繰り返し使う作業手順。

## 今回の仕様反映と現在地

2026-10-26：ゲーム基本機能と管理画面のAIセリフ事前生成はローカル実装済み。続いてDBを物理スキーマ2（ゲーム6表・型付きActions）へ再設計し、旧形式の読取りと非破壊移行を実装した。最新変更は未検証・実GAS未反映。46件PASSは5b6bb44時点の過去記録であり、最新変更の合格を示さない。 [DB再設計タスク](tasks/03_active/database-redesign.md)と[最終検証](tasks/03_active/mvp-release-verification.md)を参照。

元の企画・仕様・設計3文書は、反映と再監査を終えたため2026年10月26日に `archive/スキルじゃんけんラボ_企画・仕様・設計/` へ退避した（本文は変更なし）。現行仕様の正本は01〜08とし、今後の設計・実装・試験・運用ではこちらを更新する。アーカイブは過去の出典確認用であり、現行仕様より優先しない。文書反映の完了はアプリの実装・試験完了を意味しない。

| 退避済み初期資料 | 現行文書への反映先 |
|---|---|
| [企画書](archive/スキルじゃんけんラボ_企画・仕様・設計/01_企画書.md) | 01の目的・範囲・学習・完成条件、03の抽選演出、04の開発計画、08の試遊運用 |
| [仕様書](archive/スキルじゃんけんラボ_企画・仕様・設計/02_仕様書.md) | 01の画面要件、03の用語・初期値・F01〜F06、06のエラー、07のAC01〜AC23 |
| [設計基礎書](archive/スキルじゃんけんラボ_企画・仕様・設計/03_設計基礎書.md) | 02の構成・API・拡張境界、04の画像制作、05のスキーマ・保存・再送、08の公開・復旧 |

未着手の実装は[MVP実装計画](tasks/03_active/mvp-implementation.md)、試験の判定は[07_test_strategy.md](07_test_strategy.md)で追跡する。既存のAI制御文書・汎用テンプレートの設定を今回の反映で調整済みと扱わない。

## 権威順位

```text
コード / Makefile / config / manifests
> docs（archiveを除く現行文書）
> docs/tasks
> README / CLAUDE / AGENTS
> archive
```

この順位は実装の現状を確認するためのもの。未実装コードやTODOコマンドが製品要件を満たす意味ではない。実装と設計に差があれば差分を記録し、仕様変更か不具合かを判断する。

## 更新規約

- 製品の目的・画面は01、責務・APIは02、用語・ゲームルールは03、開発工程は04、シート・保存・再送は05、エラーは06、受入条件と結果は07、公開・復旧は08で管理する。
- 数値、ID、適性、API、保存方式を変える場合は連動する文書と受入条件を一緒に更新する。AC番号は維持し、未実施と合格を区別する。
- 現行仕様を変更する場合は差分・理由・影響をタスクまたはADRに明記し、連動する製品文書を更新する。アーカイブの初期資料は凍結し、同期更新しない。Golden Path対応表・試験記録欄・復旧の手順案を実行済みと扱わない。
- taskは作業状態と証跡、01〜08は製品設計を扱う。README / CLAUDE / AGENTSの要約・参照先も同じ変更で同期する。初期資料の反映監査は[反映対応表](09_source_traceability.md)、退避先は[アーカイブ案内](archive/README.md)で確認する。


## 毎日使う入口

最新変更：[ADR 0004・DB再設計](adr/0004-rebuild-game-database.md)。ゲームルールは[ADR 0003・合成廃止](adr/0003-remove-synthesis.md)を維持する。新仕様は3体・3スキル・6適性・累計スコア・ゲーム4画面。合成・S04・ポイント消費は廃止。管理画面でのセリフ事前生成は継続する。ローカルコードは実装済み、最新変更の検証と実データの切替は未実施。

2026-10-26の新方針：[画像生成の廃止とAI対戦セリフ](specs/ai-battle-dialogue.md)を採用した。[画像廃止の判断](adr/0001-ai-battle-dialogue.md)・[事前生成への改訂](adr/0002-pre-generated-dialogue.md)と[実装タスク](tasks/03_active/ai-battle-dialogue.md)を参照する。画像生成は有料オプションとしても残さない。AC16・AC17は画像なし表示／AI停止時継続へ改訂し、管理画面での実生成・プレイ中の生成ゼロ・管理生成の回数制限をAC24〜AC26に追加した。ローカル実装済みだが現行Web v2への反映・実生成確認は未完了。

| 入口 | 用途 |
|---|---|
| [tasks/README.md](./tasks/README.md) | 今日やること、次にやること、完了したことを管理する |
| [tasks/03_active/refactoring-candidates.md](./tasks/03_active/refactoring-candidates.md) | 常時見る cleanup / refactoring 候補 |
| [04_workflows.md](./04_workflows.md) | 作業開始、検証、リリース前確認のコマンド |
| [07_test_strategy.md](./07_test_strategy.md) | タスク完了前に通す品質ゲート |

`docs/tasks/` は仕様の正本ではないが、日々の実行順・証跡・未決事項の正本として扱う。確定した仕様は `docs/specs/` や 01〜08 文書へ、判断理由は `docs/adr/` へ昇格する。

## ドキュメント一覧

| ドキュメント | 役割 |
|---|---|
| [01_requirements.md](./01_requirements.md) | 目的・範囲・ユーザー・ユースケース・Critical User Journey / Golden Path |
| [02_architecture.md](./02_architecture.md) | 構成要素・境界・実行モデル |
| [03_domain_model.md](./03_domain_model.md) | 用語・状態・ビジネス概念 |
| [04_workflows.md](./04_workflows.md) | ローカルコマンドと運用フロー |
| [05_data_model.md](./05_data_model.md) | データ・スキーマ・設定・永続化 |
| [06_error_policy.md](./06_error_policy.md) | エラー処理・リトライ・ログ |
| [07_test_strategy.md](./07_test_strategy.md) | テスト方針と品質ゲート |
| [08_release_runbook.md](./08_release_runbook.md) | リリース・マイグレーション・復旧 |
| [09_source_traceability.md](./09_source_traceability.md) | 元文書31章と反映先、再監査の結果 |
| [tasks/README.md](./tasks/README.md) | 日次運用の実行ハブ、作業計画、実装タスク |

## 公式資料の出典と確認範囲

以下は設計基礎書v1.0の出典記録を引き継いだもの。今回の文書監査では外部サービスの現行仕様・料金を再検証していない。実装時に改めて確認する。

## 元文書に記載された公式資料

2026年10月26日に参照した資料。動作や料金を実測した結果ではない。

- [Apps Script Web Apps](https://developers.google.com/apps-script/guides/web)：配信と実行主体・アクセス設定。
- [HTML Service communication](https://developers.google.com/apps-script/guides/html/communication)：非同期呼出し、データ型、内部関数の扱い。
- [LockService](https://developers.google.com/apps-script/reference/lock/lock-service)：同時実行の排他制御。
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)：実行上限と利用量の制約。
- [Gemini image generation](https://ai.google.dev/gemini-api/docs/image-generation)：旧画像機能の調査出典。廃止後の実装には使用しない。

これらのサービス仕様と、本書で提案したゲームルール・200件制限・カード6種類・1日計画は区別する。後者は本MVPを小さく完成させるための設計判断である。

## ハーネス（AI 制御）

AI エージェント制御の全体像は `.claude/README.md`。アーキ本体とその repo 固有 instantiation は `docs/specs/` に置く。

| ドキュメント | 役割 |
|---|---|
| [specs/kurosawa-thin-harness-architecture.md](./specs/kurosawa-thin-harness-architecture.md) | Thin Harness アーキ本体（tool-agnostic マスター） |
| [specs/runtime-protocol.md](./specs/runtime-protocol.md) | 実行手順と停止条件（repo 固有） |
| [specs/capability-boundary.md](./specs/capability-boundary.md) | 保護 capability と permissions 写像（脅威モデル） |
| [specs/change-boundary.md](./specs/change-boundary.md) | 保護パスと変更境界 |
| [specs/evidence-policy.md](./specs/evidence-policy.md) | Evidence Level と done の下限 |
| [specs/judgment-memory.md](./specs/judgment-memory.md) | 判断記憶のパイプライン |
| [templates/](./templates/) | 各 Layer のテンプレ（contract / weight-class / reality-check 等） |
| [decisions/decision-log.md](./decisions/decision-log.md) | 判断日誌（trade journal、append-only） |
| [memory/](./memory/) | 蒸留済み判断記憶 |
