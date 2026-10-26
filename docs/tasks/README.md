# タスク

このディレクトリは、毎日の作業計画・調査・実装チェックリスト・完了証跡の実行ハブ。プロダクトの挙動・アーキテクチャ・データモデル・運用 runbook の正本ではないが、「今日何をするか」「次に何をするか」「何を完了したか」はここを正とする。

確定した仕様は `docs/specs/`、判断は `docs/adr/`、繰り返す運用は `docs/runbooks/`、再利用する作業手順は `.claude/skills/` に置く。

現在の追加作業：[UI/UX再設計](03_active/uiux-redesign.md)と[DB再設計](03_active/database-redesign.md)。実装済み、検証・実DB移行は[最終検証](03_active/mvp-release-verification.md)へ集約する。

## 日次運用

1. 作業開始時に `03_active/`（と収束待ちの `04_verifying/`）を見る。
2. 今日やることを 1 つ選び、必要なら task file を作る。
3. 実装前に Scope / Plan / Acceptance Criteria を更新する。
4. 作業中の判断、検証コマンド、未解決事項を task file に残す。
5. 実装・基本検証が済んだら `04_verifying/` へ mv し、terminal signal（監視 probe 緑化など）を待つ。
6. signal を緑と観測できたら証跡を追記し、`05_done/` へ mv する。
7. 仕様として残すべき内容は `docs/specs/` や 01〜08 文書へ昇格する。
7. 判断理由として残すべき内容は `docs/adr/` へ昇格する。

`tasks/` は軽く保つが、軽すぎて運用履歴が消えるのは避ける。日々の作業で迷ったら、まず task に書いてから実装へ進む。

## 構成（番号付き5状態ライフサイクル）

タスクは番号付きの5状態フォルダで管理する。**番号が状態の順序と物理 mv の方向を表す**（task file は必ず番号が**上がる**向きにだけ移動し、状態を file 内の status 行で持たない）。

```text
01_idea → 02_backlog → 03_active → 04_verifying → 05_done
```

| ディレクトリ | 状態 | 用途 |
|---|---|---|
| `01_idea/` | 生アイデア | まだ task 化に値しない未整理の思いつき |
| `02_backlog/` | 未着手 | 形にはなったが未着手。**owner 判断待ち**もここで待つ（着手前に判断が要るもの） |
| `03_active/` | 進行中 | 進行中、または次に実行するもの（手を動かす段） |
| `04_verifying/` | 収束待ち | 実装・基本検証は完了したが、terminal state（監視 probe 緑化など）が未観測で done にできない状態 |
| `05_done/` | 完了 | terminal state を観測して完了。必要なら判断を ADR に昇格する |

### 04_verifying（収束待ち）の入退室ルール

`04_verifying` は「レビュー待ち」でも「判断待ち」でもない。**実装・基本検証は済んだが、反証可能で外部から観測できる terminal signal がまだ緑になっていない**ときだけ使う。

- **入室**: コード＋基本検証が完了し、残りは「タイミングを自分で制御できない terminal signal を観測するだけ」の状態（既存の監視 probe / health check の緑化、定期実行の完走、下流 surface への反映など）。
- **退室（→ `05_done/`）**: その signal を実際に緑と観測できた時だけ（Evidence Level ≥2）。どの probe / コマンド / surface で何を観測したかを task に記録し、file を `05_done/` へ物理 mv する。
- **判断待ちを混ぜない**: 「owner の判断待ち」は verifying ではなく `02_backlog/` へ。verifying が待つのは *evidence* であって *判断* ではない。
- signal が赤・古い場合は `03_active/` へ戻す。happy-state や陳腐化した signal で done にしない。

## タスクの粒度

- 1 task は、1 つの目的と 1 つの完了条件を持つ。
- 1 日で終わらない task は、今日やるチェック項目を `Plan` に切り出す。
- 大きすぎる task は `02_backlog/` に分割案を置き、実行単位だけ `03_active/` に出す。
- 仕様変更、設計判断、運用手順が固まったら、task に閉じ込めず docs 本体へ昇格する。

## 関連スキル

| スキル | 用途 |
|---|---|
| `.claude/skills/create-task` | ユーザー依頼からタスクノートを作る |
| `.claude/skills/execute-task` | 挙動とテストを保ったままタスクを実行する |
| `.claude/skills/review-task` | 範囲・根拠・クローズ可否の観点でタスクをレビューする |
| `.claude/skills/project-review` | プロジェクト構成と責務境界をレビューする |
| `.claude/skills/refactor-plan` | 早すぎる共通化を避けてリファクタを計画する |
| `.claude/skills/hallucination-check` | 結論前に主張をファイルとコマンドで検証する |
| `.claude/skills/skeleton-first` | テスト・実装の前にビジネスロジックレスのスケルトンで構造を固定する |

## スキルじゃんけんラボの実装バックログ

企画・仕様・設計の現行版は[製品文書の索引](../00_index.md)を参照。①完了、保存基盤はWeb v2へ配置済み。画像生成は廃止し、画像なしカードと管理画面で事前生成・採用するセリフへ再設計した。プレイ中の生成は禁止。画像コード撤去・AI実装は未着手。②の別アカウント確認とゲーム全体の受入は継続する。

| ファイル | 用途 |
|---|---|
| [02_backlog/mvp-implementation.md](03_active/mvp-implementation.md) | MVP全体の親タスク。基盤3段階の進行と、後続のゲーム実装・最終受入 |
| [画像機能の撤去とAIセリフ](03_active/ai-battle-dialogue.md) | 次の実装。画像生成を廃止し、画像なしカード、管理画面での事前生成・採用、ゲームでの読込済み文の表示を実装する |
| [③ 土台拡張](03_active/foundation-03-hardening.md) | 保存・再送・復元の証跡。旧画像生成条件は廃止、新機能は別タスク |

## アイディア

| ファイル | 用途 |
|---|---|
| [既存GASアプリの比較と写真日記基盤の流用構想](01_idea/既存GASアプリの比較と写真日記基盤の流用構想.md) | 写真日記・英語トレーナーの比較、コピー候補、改修点、移植順序案 |

## Active

| ファイル | 用途 |
|---|---|
| [② GAS・Sheets・Drive・Gemini連携疎通](03_active/foundation-02-integration.md) | 過去の画像疎通記録を保持。別アカウント確認を残し、画像生成再試行はしない |
| [③ 土台拡張](03_active/foundation-03-hardening.md) | 保存・再送・復元の証跡。旧画像生成条件は廃止、新機能は別タスク |
| [03_active/refactoring-candidates.md](03_active/refactoring-candidates.md) | 残りのクリーンアップ候補 |

合成廃止も[ADR 0003](../adr/0003-remove-synthesis.md)へ反映済み。基本3スキル・適性6行・ゲーム4画面・累計スコアに変更し、旧データは保管する。

次の実装は[画像機能撤去・AIセリフ](03_active/ai-battle-dialogue.md)をゲームルール・結果画面と接続する。画像生成の成功を待たない。既存②③の未確認は消さず、仕様変更と試験合格を区別する。

## 完了

| ファイル | 確認結果 |
|---|---|
| [① 土台作成](05_done/foundation-01-scaffold.md) | ローカル16テスト・13実行ファイルのビルド・360px幅Chromium確認に成功 |

## ルール

ここにタスク詳細を重複させない。各タスクファイルは軽く保つ:

```markdown
# タスクタイトル

## Goal

## Context

## Scope

## Skeleton

## Plan

## Acceptance Criteria

## Verification

## Notes
```

進行中の実装作業は[③ 土台拡張](03_active/foundation-03-hardening.md)。外部確認待ちは[② 連携疎通](03_active/foundation-02-integration.md)、全体計画は[MVP親タスク](03_active/mvp-implementation.md)、既存のクリーンアップ候補は[03_active/refactoring-candidates.md](03_active/refactoring-candidates.md)で管理する。

## 2026-10-26 現行実装

ゲーム・管理画面のローカル実装と46テスト・Chromium確認は完了。[配置・最終受入](03_active/mvp-release-verification.md)が残る。実環境を未確認のままdoneへ移動しない。

2026-10-26追補：現行MVPのコード実装残件は0。検証を最後にまとめる指示により、追補のテストは未実行。配置と最終受入を[集約先](03_active/mvp-release-verification.md)で管理する。
