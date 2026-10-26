# ① 土台作成 — 既存GAS部品の移植とローカル検証

## Goal

ゲーム機能を載せる前に、画面・API・設定・外部接続の境界を備えた最小構成を作り、ローカルで検証できるようにする。

## Context

2026-10-26の3段階提案の最初の実行単位。[比較調査](../01_idea/既存GASアプリの比較と写真日記基盤の流用構想.md)に基づき、写真日記を主なコピー元、英語トレーナーを補助とした。同日の実装開始依頼を受けて実装し、ローカル検証を完了。実サービス疎通は②へ引き継ぐ。

全体の進捗は[親タスク](../03_active/mvp-implementation.md)、仕様は[構成・API](../../02_architecture.md)と[エラー方針](../../06_error_policy.md)を参照する。

## Scope

- manifest、doGet/include_、最小HTML/CSS、APIの共通要求・応答、設定読込、ローカル試験基盤を作る。
- 写真日記からAPI・DOM・JSON埋込み処理とモック、英語トレーナーから小さなWeb入口・ファイル列挙方法を選んでコピーする。
- Sheets・Drive・Geminiのアダプター境界を用意する。外部通信の実装・実認可・デプロイは②で行う。
- 投稿・教材・移行機能、元の接続ID・秘密情報・デプロイスクリプトは持ち込まない。ゲーム計算・Actions保存・5画面の完成は対象外。

## Skeleton

`HTML → クライアントAPI → api(request) → サービス → Repository / Assets / 管理用Geminiアダプター`。

内部・管理関数は末尾 `_`。画面からの入口はapiのみ。6操作の契約を先に整理し、実装されていない操作を成功扱いにしない。仮データとモックは試験用に限定し、配布用成果物から除く。最小画面は読込中・失敗・再試行を表示できればよい。

## Plan

- [x] コピーするファイル・関数、コピー元HEAD、依存先、変更点を本タスクに記録する。
- [x] src構成とモジュール方式を決め、必要なpackage・テスト・フォーマット・配置対象の除外設定を整える。
- [x] Web入口、最小画面、API共通処理を移植し、version/replayed等の応答メタデータを保持する。
- [x] Script Propertiesの設定読込と未設定時のエラーを実装する。秘密値を含まない設定項目一覧を作る。
- [x] Repository・Assets・管理用生成処理の境界とモックを用意する。ブラウザから任意のfileIdやURLを渡せる入口を作らない。
- [x] 移植先専用の実行可能なローカル検証コマンドを整備し、不要なコピー元依存がないことを確認する。
- [x] 確定した構成・実コマンドをdocs/02・04へ反映し、現状記載が変わるREADME・AGENTS・CLAUDEも更新する。

## Acceptance Criteria

- [x] クリーンな依存導入から、記録したコマンドでローカル検証を再現できる。TODO表示だけのMakefileを合格根拠にしない。
- [x] モックによるbootstrap応答がクライアントまで届き、成功・業務エラー・通信失敗を区別できる。
- [x] 未知の操作・余分なキー・設定不足で成功を装わず、現行エラー契約に沿って扱う。
- [x] 試験用モック、元アプリの業務データ・接続設定がGASへの配置対象に混入しない。
- [x] コピー元のコードを変更せず、次の②で外部アダプターを接続できる構造と手順が残っている。

## Verification

2026-10-26、Windows / Node.js v24.21.0 / npm 11.19.0で実施。

| 確認 | 実測 |
|---|---|
| npm ci --no-audit --no-fund | lockfileから67パッケージの再導入成功 |
| npm run check | 終了コード0。整形確認・Nodeテスト16件成功（失敗・skip 0）・ビルド・ブラウザ確認 |
| dist | scripts/files.mjsの許可リスト13実行ファイル＋.claspignore。試験・設定・秘密情報は含めない |
| Chromium 156.0.8078.4 | 360×800、動きを減らす設定。初期モック表示・横はみ出しなし・通信失敗・44px以上のボタン・Tab/Enter再試行・ページエラーなし |
| スクリーンショット | artifacts/scaffold-mobile.png・scaffold-retry.png。画像を目視し文字の欠け・はみ出しがないことを確認 |
| ブラウザ実測時刻 | 2026-10-26T00:58:16.654Z。artifacts/scaffold-browser-result.jsonに記録 |
| 未実施 | 実GAS・Sheets・Drive・Gemini、ゲーム処理、AC01〜AC23。②以降で検証 |

### コピー・改修記録

| コピー元 | 元の箇所 | 移植先と変更 |
|---|---|---|
| ai-photo-diary / 0155711 | appsscript.json | src/appsscript.json。同じ本人限定設定 |
| 同上 | client/core/dom.html | src/client/core/dom.html。未使用viewsレジストリを除去 |
| 同上 | client/core/api.html | 同名。api(request)に一本化、全応答保持、業務／通信失敗を分離、自動再試行なし |
| 同上 | controllers/web.jsのserializeForScript_ | web.jsへコピー。設定のブラウザ配信はtitleだけ |
| 同上 | core/errors.js | AppError_を基に定型エラーを返す。内部例外の本文・スタックをログへ出さない |
| 同上 | tests/gas-mock.mjs | VM大域・MapのProperties・JSON通信のパターンを抽出。未使用のSheets/Driveモックは後続へ |
| 同上 | .claspignore | build時に同じ許可方式をdistへ出力。元接続IDは引き継がない |
| ai-english-trainer / 5d96654 | controllers/web.js | doGet/include_を移植。メニュー・初期化を除去しinclude対象を限定 |
| 同上 | tests/gas-mock.mjsのファイル列挙 | scripts/files.mjs。元の.clasp.jsonに依存しない |

新設したものは6操作の入力検証、今回専用設定、アダプター境界、最小記録画面、配布許可リスト、今回用のテスト。元アプリの業務機能や秘密設定はコピーしていない。

## Notes

外部サービスなしで確認できる範囲をこの段階の完了条件とする。GAS実機の確認は[② 連携疎通](../03_active/foundation-02-integration.md)へ引き継ぐ。配置時はリンク元も更新し、実測がない段階で完了へ移動しない。
