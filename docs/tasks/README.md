# タスク

このディレクトリは、毎日の作業計画・調査・実装チェックリスト・完了証跡の実行ハブ。プロダクトの挙動・アーキテクチャ・データモデル・運用 runbook の正本ではないが、「今日何をするか」「次に何をするか」「何を完了したか」はここを正とする。

確定した仕様は `docs/specs/`、判断は `docs/adr/`、繰り返す運用は `docs/runbooks/`、再利用する作業手順は `.claude/skills/` に置く。

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

企画・仕様・設計v1.0は[製品文書の索引](../00_index.md)から参照する。①完了。②はGemini画像生成と別アカウント確認待ち。利用者の「次進んで」により、③の外部課金に依存しない保存・再送・復元を先行した。実装作業の対象は③、②は残条件の追跡として保持する。ゲーム実装・最終受入は未完了。

| ファイル | 用途 |
|---|---|
| [02_backlog/mvp-implementation.md](02_backlog/mvp-implementation.md) | MVP全体の親タスク。基盤3段階の進行と、後続のゲーム実装・最終受入 |
| [③ 土台拡張](03_active/foundation-03-hardening.md) | Actions保存・再送・画像管理・復元の基盤を実装・検証。生成画像の一連確認は継続待ち |

## アイディア

| ファイル | 用途 |
|---|---|
| [既存GASアプリの比較と写真日記基盤の流用構想](01_idea/既存GASアプリの比較と写真日記基盤の流用構想.md) | 写真日記・英語トレーナーの比較、コピー候補、改修点、移植順序案 |

## Active

| ファイル | 用途 |
|---|---|
| [② GAS・Sheets・Drive・Gemini連携疎通](03_active/foundation-02-integration.md) | 外部確認待ち。Drive配信済み、Gemini画像生成HTTP 429と別アカウント確認を残す |
| [③ 土台拡張](03_active/foundation-03-hardening.md) | 保存・再送・復元基盤を実装・検証しWeb v2へ配置。生成画像の一連確認は未完了 |
| [03_active/refactoring-candidates.md](03_active/refactoring-candidates.md) | 残りのクリーンアップ候補 |

基盤は①→②→③を基本順とし、同時に進める実装タスクは1件とする。今回は利用者の指示により、②の外部確認待ちを記録したまま③の独立部分を先行した。①は完了、②③は未達の画像確認を残して保持する。

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

進行中の実装作業は[③ 土台拡張](03_active/foundation-03-hardening.md)。外部確認待ちは[② 連携疎通](03_active/foundation-02-integration.md)、全体計画は[MVP親タスク](02_backlog/mvp-implementation.md)、既存のクリーンアップ候補は[03_active/refactoring-candidates.md](03_active/refactoring-candidates.md)で管理する。
