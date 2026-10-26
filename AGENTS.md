# AGENTS.md

2026-10-26追補：利用者の指示に従い、検証は最後にまとめる。基本機能の追加修正に続き、DBを物理スキーマ2へ再設計した。ソース・設計書・テストコードの更新は実施済み、検証実行・実DB移行・配置は未実施。

AI コーディングエージェント（Claude Code / Codex / GitHub Copilot 等）共通の作業ガイド。
Codex は作業前にこのファイルを読むため、ここには repo 共通方針のみ記す。
ツール固有の指示は各ツールのファイル（例: Claude Code は `CLAUDE.md`）に置く。

## プロジェクト概要

- 名称: スキルじゃんけんラボ。仲間集め・スキル選択・CPUじゃんけんを通して、1対多・多対多のデータのつながりを学ぶ小規模Webアプリ。
- 初版: 提供者の管理端末・本人限定公開・P001の1プレイヤー・行動記録200件まで。小学校中〜高学年を仮対象とし、大人が伴走する。
- 技術: GAS（HTML Service / JavaScript）、HTML/CSS/JavaScript、Google Sheets、非公開のGoogle Drive。Geminiは管理画面でのセリフ事前生成にだけ使う。画像生成・画像登録・配信は廃止対象で、標準表示はHTML/CSSと名前・効果文。
- 現状: 2026-10-26：ゲーム基本機能と管理画面のAIセリフ事前生成はローカル実装済み。続いてDBを物理スキーマ2（ゲーム6表・型付きActions）へ再設計し、旧形式の読取りと非破壊移行を実装した。最新変更は未検証・実GAS未反映。46件PASSは5b6bb44時点の過去記録であり、最新変更の合格を示さない。 [最新記録](docs/tasks/03_active/mvp-release-verification.md)を参照。

## 最初に読む仕様

現行仕様の正本は `docs/01_requirements.md`〜`docs/08_release_runbook.md`。日々の作業は[文書索引](docs/00_index.md)から読む。本ファイルは要約であり、詳細仕様の代わりにしない。製品文書は仕様の正本であり、最新実装の検証完了を示さない。

- 製品仕様: [要件・画面](docs/01_requirements.md) / [構成・API](docs/02_architecture.md) / [用語・ゲームルール](docs/03_domain_model.md)。
- 実装と運用: [開発・AI連携](docs/04_workflows.md) / [保存・再送](docs/05_data_model.md) / [エラー](docs/06_error_policy.md) / [試験結果の記録先](docs/07_test_strategy.md) / [公開・復旧](docs/08_release_runbook.md)。
- 追跡: [反映監査の記録](docs/09_source_traceability.md) / [MVP実装バックログ](docs/tasks/03_active/mvp-implementation.md)。試験結果は製品文書とタスクへ記録する。
- 元の企画・仕様・設計3文書は[archive](docs/archive/README.md)へ退避済み。過去の出典確認にのみ使い、現行文書より優先しない。今後の仕様変更でアーカイブを更新しない。

## MVPの不変条件

- 初期状態はP001「たんけんたい」、C01所有、S01〜S03習得、0ポイント、version 0。仲間はC01〜C03の3体で、無料抽選は未所有から等確率、重複なし。
- 1対戦はCPUとの1手勝負。所有仲間1体と「習得済みかつ適性あり」のスキル1つを選ぶ。勝ち2点・あいこ1点・負け1点に、条件を満たすスキルの+1だけを加算する。スキルで勝敗や抽選結果を変えない。
- 合成・S04・R01・ポイント消費は廃止。基本3種を初期習得し、pointsは対戦の累計スコア。新規マスターは版2、旧版1の記録は上書きせず保管・検証する。
- CharacterSkillsはC01→S01/S02、C02→S02/S03、C03→S01/S03の6行固定。学習画面は実データからPlayers→Actionsの1対多とCharacters↔Skillsの多対多を表示する。
- 課金・広告・対人戦・ランキング・チャット・ユーザー登録・複数プレイヤー・一般公開・自由入力プロンプト・画像生成・スキル合成・AIによるゲーム効果決定・リアルタイム同期・教材販売・保護者管理画面は初版の範囲外。

## 保存・通信・公開の原則

- ゲームの公開apiはbootstrap / drawCharacter / playRound / getRelationsの4操作。bootstrapで採用済みセリフ集も取得する。getAssetと旧getBattleLine案は廃止。管理画面は別ルート・adminApiとし、各管理要求をJANKEN_ADMIN_EMAILと実利用者で認可する。内部関数は末尾 _。
- `playerId` はサーバーでP001に固定し、クライアントから任意のplayerId・勝敗・加算値・Drive fileIdを受け付けない。所有・初期習得・適性・手をサーバーで検証する。
- 物理スキーマ2はゲーム6表。成功操作の入力・抽選結果を型付き15列のActionsへ1行追記し、初期所有＋全履歴から状態を復元する。状態JSON・所有・累計スコアを二重保存しない。旧物理1は読取り専用。マスター2の履歴だけ別ブックへ明示移行でき、元データとバックアップを保持する。
- 変更は `ScriptLock` 内で再読込・検証し、1行の `setValues` → `flush` → 再読込確認を行う。SheetsにDB同等のトランザクション保証を仮定しない。
- 変更要求には `requestId` と `expectedVersion` を付ける。同一IDの照合をversion・200件上限の判定より先に行い、同じ内容なら保存済み結果、異なる内容なら `REQUEST_ID_CONFLICT` を返す。乱数や加減算をやり直さない。
- 通信失敗時は同じID・入力・versionで手動再送する。保留要求は `sessionStorage` に保持し、再送解決後は `bootstrap` で最新化する。保存後に演出し、通信中は変更操作を無効にする。
- 不完全行・参照不整合は `DATA_INTEGRITY_ERROR` で停止する。自動初期化・過去行への黙った巻戻し・記録を見ないポイント修正はしない。リセット・復旧はバックアップ後に提供者が行う。
- 初版は実行ユーザー「自分」、アクセス範囲「自分のみ」に相当する設定。Sheets・Driveも非公開とし、提供者の認証情報を子どもに渡さない。
- 画像生成・WebP制作・画像アップロード・配信は廃止。3体と3スキルを図形・名前・効果文で表示する。AIは管理画面で事前生成し、提供者が確認・採用する。プレイ中の生成とセリフ専用通信は禁止。bootstrapで取得済みの文か定型文を結果保存後に表示し、ゲーム状態を変更しない。

## セットアップ / 主要コマンド

Node.js 22以上。ルートで `npm ci`、必要なら `npx playwright install chromium`、`npm run check`。checkは整形確認→Nodeテスト→ビルド→Chromium確認。`npm run preview` は127.0.0.1:4173の仮データ表示で、実GASではない。Makefileはnpmのラッパー。`npm run build` は31実行ファイルと.claspignoreのみをdistへ出力し、アップロードしない。scripts/testsや接続設定を配置物へ混ぜない。

GASコードはsrc/serverの通常JS、画面はsrc/client、Nodeの開発ツールはscripts/testsのES modules。実アダプターが未接続の間はエラーで停止し、実行時に仮データへ切り替えない。接続設定のキー名はdocs/04・05に記載する。

## 検証・完成条件

- 実装時は現行の受入条件AC01〜AC26を基準に、[テスト戦略](docs/07_test_strategy.md)と関連タスクに実施日・端末・結果を記録する。勝敗9組、スキル加算9組、再送・応答喪失・競合、200件上限、不完全行、権限、AI停止時の継続、バックアップ復元を確認する。
- スマホで仲間獲得→装備選択→じゃんけん→つながり確認を通し、再読込後の状態保持を確認する。360px幅、主ボタン44px以上、原則16px以上の本文、読み上げ・キーボード・動きを減らす設定に対応する。
- 画像制作を完成条件にしない。画像なし表示（AC16）、AI停止時継続（AC17）、管理画面での実生成・プレイ中の生成ゼロ・管理生成の回数制限（AC24〜AC26）、本人限定アクセスを検証する。新仕様の詳細は[AIセリフ設計](docs/specs/ai-battle-dialogue.md)。
- 文書のみの変更では参照元との整合・リンク・差分を確認する。未実装のアプリ試験を実施済みと報告しない。

## コーディング規約

- 既存のコード・命名・パターンに合わせる。新規導入より既存の再利用を優先する。
- コード変更後は実装済みのテストとフォーマッタを実行する。検証手段が未整備なら、その制約と未検証範囲を報告する。
- GAS実行時のAPIキー・テキストモデルID・管理AI有効化設定・管理者メール・Spreadsheet IDはScript Propertiesに置く。キーをHTML・Sheets・ブラウザ保存領域・ログに出さない。`env/` と `doppler.yaml` は既存の開発用ひな形であり、GASへの同期は未実装。ローカル秘密情報をコミットしない。
- Geminiモデル・料金・Googleの公開設定やクォータは実装時に公式資料で確認する。提案書の数値とサービス側の保証を混同しない。

## ドキュメント

設計・仕様・運用は `docs/` 配下を参照。更新規約と権威順位は `docs/00_index.md` に従う。
仕様レベルの変更は連動するドキュメントを同一 PR でまとめて直す。

## Codex / Claude Code

- `AGENTS.md` は Codex / 他エージェント共通ガイド。
- `CLAUDE.md` は Claude Code の司令塔。
- `.claude/rules/` と `.claude/skills/` は Claude Code 用。Codex が読む前提にしない。
- Codex 向けに永続させたい recurring な指摘やミス防止は、この `AGENTS.md` または nested `AGENTS.md` に小さく追加する。

## Harness（AI 制御一式）

- このリポジトリの AI 制御の全体像は `.claude/README.md`（Kurosawa Thin Harness Architecture の実装）。
- アーキ本体（tool-agnostic マスター）は `docs/specs/kurosawa-thin-harness-architecture.md`、repo 固有の脅威モデルは `docs/specs/{capability-boundary,change-boundary,runtime-protocol,evidence-policy,judgment-memory}.md`。
- permissions の ask/deny と保護パスは脅威モデルで決める。**他プロジェクトの設定をそのまま移植しない**。

## Task / Skill

- 一回性の作業計画・調査メモ・実装タスクは `docs/tasks/` に置く。
- Claude Code で繰り返し使う作業手順は `.claude/skills/` に置く（classify-task → create-task → scan-decisions → plan-skeleton → execute-task → verify-completion → review-task のライフサイクル）。
- Codex repo skills を本格運用する場合は `.agents/skills/` を任意追加する。標準生成物には含めない。
- task note を仕様の正本にしない。確定した仕様は `docs/specs/`、判断理由は `docs/adr/`、運用手順は `docs/runbooks/` に昇格する。
