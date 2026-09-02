# Codex implementation review manifest

## 今回実装した内容

- 多項式の通常線（法線・接線系）入力境界を強化し、曖昧・危険な入力を安全に拒否。
- 3次以下の多項式の凹凸（concavity）を、厳密な導関数・区間・検証情報付きで判定。
- Quick Mode / Study Mode、段階的な出力利用記録、履歴スキーマ v2、analytics / review 連携を実装。
- 選択テキスト優先のショートカット入力と、検証成功時だけクリップボードを置換する安全なクイック操作を実装。
- ローカルAIや外部通信を使わない、決定論的な数式処理方針を維持。
- OCRは解答生成に接続せず、候補入力・設定・出力境界だけを用意。
- 表示中ページの範囲選択、offscreen crop、短時間の確認プレビューまでを段階的に実装。OCR認識とsolver送信は未接続。
- 各境界・ワークフロー・UI契約・ストレージ・OCRプレビューの回帰テストを追加。

## コピー一覧

区分は、基準コミット `origin/feat/non-ai-math-engine` との差分における `A`（新規作成）と `M`（変更）です。

| 元のパス | ファイル名 | 区分 | 目的 | 実装・変更内容 | 関連ファイル |
|---|---|---|---|---|---|
| `PROGRESS.md` | PROGRESS.md | 変更 | 進捗と実装境界の記録 | 現在の数式対応範囲、Quick/Study、OCR段階、未完了項目を更新 | `README.md`, `docs/*.md` |
| `README.md` | README.md | 変更 | 利用者向け概要 | AIなしの決定論的構成、対応問題、モード、ショートカット、OCRの範囲を反映 | `manifest.json`, `popup.html`, `PROGRESS.md` |
| `analytics.html` | analytics.html | 変更 | 学習分析画面 | Study記録を表示する画面契約を更新 | `js/analytics.js`, `css/analytics.css` |
| `css/analytics.css` | analytics.css | 変更 | 分析画面のスタイル | 分析・証拠表示のレイアウトを調整 | `analytics.html`, `js/analytics.js` |
| `css/history.css` | history.css | 変更 | 履歴画面のスタイル | 履歴のモード・入力元・段階表示に対応 | `history.html`, `js/history.js` |
| `css/ocr-confirm.css` | ocr-confirm.css | 新規作成 | OCR確認画面のスタイル | 画像候補の短期プレビューと確認UIを定義 | `ocr-confirm.html`, `js/ocr/ocr-confirm.js` |
| `css/popup.css` | popup.css | 変更 | ポップアップのスタイル | Quick/Study切替、段階出力、入力元表示を追加 | `popup.html`, `js/popup.js` |
| `css/settings.css` | settings.css | 変更 | 設定画面のスタイル | AI設定を除き、ローカル動作と履歴設定を整理 | `settings.html`, `js/settings.js` |
| `docs/architecture.md` | architecture.md | 変更 | アーキテクチャ説明 | 決定論的solver、ワーカー、学習ワークフロー、OCR境界を更新 | `js/solve-workflow.js`, `js/ocr/*` |
| `docs/decision-log.md` | decision-log.md | 変更 | 設計判断の記録 | AI不使用、OCR非接続、入力安全境界、モード設計を追記 | `PROGRESS.md`, `docs/ocr-candidate-evaluation.md` |
| `docs/development-log.md` | development-log.md | 変更 | 開発履歴 | 今回のコミット単位の実装経緯を記録 | `PROGRESS.md`, Git履歴 |
| `docs/ocr-candidate-evaluation.md` | ocr-candidate-evaluation.md | 新規作成 | OCR候補の評価 | ローカルOCR候補を解答AIから分離し、未接続・再配布条件を明記 | `js/ocr/ocr-config.js`, `js/ocr/ocr-engine.js` |
| `docs/supported-problems.md` | supported-problems.md | 変更 | 対応問題仕様 | 現在の厳密solver範囲と未対応形式を更新 | `js/solver/*`, `README.md` |
| `docs/test-plan.md` | test-plan.md | 変更 | テスト計画 | Quick/Study、clipboard、OCR capture/preview、手動確認項目を更新 | `tests/*.test.mjs`, `scripts/check-project.mjs` |
| `docs/user-manual.md` | user-manual.md | 変更 | 利用手順 | モード、段階出力、ショートカット、OCR確認の使い方を更新 | `popup.html`, `history.html`, `ocr-confirm.html` |
| `history.html` | history.html | 変更 | 履歴画面 | 入力元・モード・利用段階を確認できる契約へ更新 | `js/history.js`, `css/history.css` |
| `js/analytics.js` | analytics.js | 変更 | 学習分析ロジック | Studyのみを分析し、段階利用・入力元を集計 | `analytics.html`, `js/storage.js`, `js/learning-session.js` |
| `js/background.js` | background.js | 変更 | 拡張の背景処理 | ショートカット、選択テキスト、OCR preview message を安全に仲介 | `manifest.json`, `js/shortcut-workflow.js`, `js/ocr/capture-controller.js` |
| `js/category-classifier.js` | category-classifier.js | 変更 | 問題分類 | 多項式凹凸・法線系の入力分類を追加・境界を明確化 | `js/solver/index.js`, `js/solver/polynomial-*` |
| `js/clipboard.js` | clipboard.js | 変更 | クリップボード入出力 | 読み込み・検証成功後の置換・失敗時保持を実装 | `js/shortcut-workflow.js`, `tests/clipboard.test.mjs` |
| `js/history.js` | history.js | 変更 | 履歴表示・操作 | v2履歴、入力元、モード、段階利用を表示・出力 | `js/storage.js`, `history.html`, `analytics.html` |
| `js/learning-session.js` | learning-session.js | 新規作成 | Studyセッション | 1問の段階出力利用をまとめて記録 | `js/solve-workflow.js`, `js/storage.js`, `js/analytics.js` |
| `js/math-core/exact-polynomial-concavity.js` | exact-polynomial-concavity.js | 新規作成 | 凹凸の厳密計算 | 2階導関数、符号区間、臨界点、検証結果を厳密に生成 | `js/solver/polynomial-concavity.js`, `js/math-core/symbolic-adapter.js` |
| `js/math-core/offscreen-symbolic-client.js` | offscreen-symbolic-client.js | 変更 | symbolic worker client | 凹凸・既存演算をoffscreen worker境界経由で呼び出し | `js/offscreen.js`, `js/offscreen-client.js` |
| `js/ocr/capture-contract.js` | capture-contract.js | 新規作成 | OCR capture通信契約 | background/offscreen間の型付きmessageとversionを定義 | `js/background.js`, `js/ocr/capture-controller.js`, `js/offscreen.js` |
| `js/ocr/capture-controller.js` | capture-controller.js | 新規作成 | capture orchestration | ページ範囲選択からcrop・previewまでを段階実行 | `js/ocr/capture-overlay.js`, `js/ocr/capture-image.js` |
| `js/ocr/capture-geometry.js` | capture-geometry.js | 新規作成 | 選択矩形計算 | viewport/device scaleを考慮した安全なcapture geometryを生成 | `js/ocr/capture-controller.js`, `tests/ocr-capture-geometry.test.mjs` |
| `js/ocr/capture-image.js` | capture-image.js | 新規作成 | 画像crop | screenshot領域をoffscreen canvasでcropし、サイズを制限 | `js/ocr/capture-controller.js`, `js/offscreen.js` |
| `js/ocr/capture-overlay.js` | capture-overlay.js | 新規作成 | ページ選択overlay | 表示ページ上で範囲選択し、キャンセル・確定を返す | `js/background.js`, `js/ocr/capture-controller.js` |
| `js/ocr/capture-preview-operations.js` | capture-preview-operations.js | 新規作成 | preview操作定義 | 確認・破棄・期限切れの操作を小さな契約として定義 | `js/ocr/capture-preview-store.js`, `js/ocr/ocr-confirm.js` |
| `js/ocr/capture-preview-store.js` | capture-preview-store.js | 新規作成 | preview保管 | 一時的な画像候補を保存し、期限と消費を管理 | `js/ocr/capture-session-store.js`, `ocr-confirm.html` |
| `js/ocr/capture-session-store.js` | capture-session-store.js | 新規作成 | capture session保管 | capture状態とpreview参照を一時管理 | `js/ocr/capture-controller.js`, `js/ocr/capture-preview-store.js` |
| `js/ocr/ocr-config.js` | ocr-config.js | 新規作成 | OCR設定境界 | 未接続OCR候補の設定を検証し、解答solverと分離 | `docs/ocr-candidate-evaluation.md`, `js/ocr/ocr-engine.js` |
| `js/ocr/ocr-confirm.js` | ocr-confirm.js | 新規作成 | OCR確認ページ | 認識前の画像候補を表示し、編集可能な確認境界を提供 | `ocr-confirm.html`, `css/ocr-confirm.css`, `js/ocr/capture-preview-store.js` |
| `js/ocr/ocr-engine.js` | ocr-engine.js | 新規作成 | OCR adapter境界 | OCR providerを差し替え可能な未接続インターフェースとして定義 | `js/ocr/ocr-config.js`, `js/ocr/ocr-output.js` |
| `js/ocr/ocr-output.js` | ocr-output.js | 新規作成 | OCR候補出力 | untrusted text候補の形式・信頼境界を定義 | `js/ocr/ocr-engine.js`, `js/solve-workflow.js` |
| `js/offscreen-client.js` | offscreen-client.js | 新規作成 | offscreen API client | backgroundからoffscreen documentへ画像・symbolic処理を要求 | `js/offscreen.js`, `manifest.json` |
| `js/offscreen.js` | offscreen.js | 変更 | offscreen runtime | symbolic処理にcapture crop/preview処理を追加 | `js/offscreen-client.js`, `js/ocr/capture-image.js` |
| `js/popup.js` | popup.js | 変更 | ポップアップ制御 | Quick/Study、段階出力、solver結果、履歴記録を統合 | `popup.html`, `js/solve-workflow.js`, `js/learning-session.js` |
| `js/settings.js` | settings.js | 変更 | 設定制御 | AI依存設定を除き、表示・履歴・モード設定を管理 | `settings.html`, `js/storage.js` |
| `js/shortcut-workflow.js` | shortcut-workflow.js | 新規作成 | ショートカット処理 | 選択テキスト優先、clipboard fallback、検証後のみ出力をコピー | `js/background.js`, `js/clipboard.js`, `manifest.json` |
| `js/solve-workflow.js` | solve-workflow.js | 新規作成 | 解答ワークフロー | 正規化・分類・solver・段階出力を共通化し、再計算を抑制 | `js/popup.js`, `js/learning-session.js`, `js/solver/index.js` |
| `js/solver/index.js` | index.js | 変更 | solver routing | 多項式凹凸solverを分類・ルーティングに追加 | `js/category-classifier.js`, `js/solver/polynomial-concavity.js` |
| `js/solver/polynomial-concavity-input.js` | polynomial-concavity-input.js | 新規作成 | 凹凸入力解析 | 関数、変数、範囲、評価点を安全に抽出・検証 | `js/solver/polynomial-concavity.js`, `tests/polynomial-concavity-input.test.mjs` |
| `js/solver/polynomial-concavity.js` | polynomial-concavity.js | 新規作成 | 凹凸solver | 入力を厳密計算へ渡し、UI互換の結果契約へ変換 | `js/math-core/exact-polynomial-concavity.js`, `js/solver/index.js` |
| `js/solver/polynomial-normal-input.js` | polynomial-normal-input.js | 変更 | 法線入力解析 | 曖昧な点・x座標・関数表現の境界を強化 | `js/solver/polynomial-normal.js`, `js/category-classifier.js` |
| `js/solver/polynomial-normal.js` | polynomial-normal.js | 変更 | 法線solver | 強化された入力契約を利用し、厳密な検証結果を維持 | `js/solver/polynomial-normal-input.js`, `js/solve-workflow.js` |
| `js/storage.js` | storage.js | 変更 | 永続化・履歴契約 | history schema v2、Study記録、旧データ互換を実装 | `js/history.js`, `js/learning-session.js`, `js/analytics.js` |
| `manifest.json` | manifest.json | 変更 | MV3設定 | command、offscreen、captureに必要な宣言を追加・整理 | `js/background.js`, `js/offscreen.js`, `js/shortcut-workflow.js` |
| `ocr-confirm.html` | ocr-confirm.html | 新規作成 | OCR確認画面 | 画像候補を確認・破棄する独立ページを追加 | `js/ocr/ocr-confirm.js`, `css/ocr-confirm.css` |
| `popup.html` | popup.html | 変更 | ポップアップ構造 | モード切替、段階出力、入力元表示を追加 | `js/popup.js`, `css/popup.css` |
| `scripts/check-project.mjs` | check-project.mjs | 変更 | 静的プロジェクト検査 | 新しいMV3/OCR/offscreen契約と危険API禁止を検査し、確認用スナップショットを検査対象外にする | `manifest.json`, `js/ocr/*`, `tests/*`, `codex-review/*` |
| `settings.html` | settings.html | 変更 | 設定画面構造 | AI依存を除き、ローカル実行・履歴設定の画面を更新 | `js/settings.js`, `css/settings.css` |
| `tests/classifier.test.mjs` | classifier.test.mjs | 変更 | 分類テスト | 凹凸・法線入力の分類と拒否境界を追加 | `js/category-classifier.js` |
| `tests/clipboard.test.mjs` | clipboard.test.mjs | 新規作成 | clipboardテスト | 成功時置換、失敗時保持、権限エラーを検証 | `js/clipboard.js`, `js/shortcut-workflow.js` |
| `tests/exact-polynomial-concavity.test.mjs` | exact-polynomial-concavity.test.mjs | 新規作成 | 凹凸核心テスト | 2階導関数、符号区間、臨界点、検証情報を検証 | `js/math-core/exact-polynomial-concavity.js` |
| `tests/learning-session.test.mjs` | learning-session.test.mjs | 新規作成 | Study sessionテスト | 段階利用の集約、再利用、記録条件を検証 | `js/learning-session.js` |
| `tests/ocr-capture-contract.test.mjs` | ocr-capture-contract.test.mjs | 新規作成 | capture契約テスト | message型、version、必須フィールドを検証 | `js/ocr/capture-contract.js` |
| `tests/ocr-capture-controller.test.mjs` | ocr-capture-controller.test.mjs | 新規作成 | capture controllerテスト | capture lifecycle、cancel、preview遷移を検証 | `js/ocr/capture-controller.js` |
| `tests/ocr-capture-geometry.test.mjs` | ocr-capture-geometry.test.mjs | 新規作成 | geometryテスト | scale・viewport・境界矩形を検証 | `js/ocr/capture-geometry.js` |
| `tests/ocr-capture-image.test.mjs` | ocr-capture-image.test.mjs | 新規作成 | cropテスト | crop寸法、スケール、異常入力を検証 | `js/ocr/capture-image.js` |
| `tests/ocr-capture-overlay-contract.test.mjs` | ocr-capture-overlay-contract.test.mjs | 新規作成 | overlay契約テスト | overlay messageとDOM契約を検証 | `js/ocr/capture-overlay.js` |
| `tests/ocr-capture-overlay-runtime.test.mjs` | ocr-capture-overlay-runtime.test.mjs | 新規作成 | overlay runtimeテスト | 選択・確定・取消・再入場を疑似DOMで検証 | `js/ocr/capture-overlay.js` |
| `tests/ocr-capture-preview-store.test.mjs` | ocr-capture-preview-store.test.mjs | 新規作成 | preview storeテスト | TTL、consume、破棄を検証 | `js/ocr/capture-preview-store.js` |
| `tests/ocr-capture-session-store.test.mjs` | ocr-capture-session-store.test.mjs | 新規作成 | session storeテスト | 一時capture状態の保存・復元・期限を検証 | `js/ocr/capture-session-store.js` |
| `tests/ocr-confirm-page-contract.test.mjs` | ocr-confirm-page-contract.test.mjs | 新規作成 | 確認ページ契約テスト | HTML要素、script、style、操作契約を検証 | `ocr-confirm.html`, `js/ocr/ocr-confirm.js` |
| `tests/ocr-engine.test.mjs` | ocr-engine.test.mjs | 新規作成 | OCR adapterテスト | 未接続・untrusted候補の境界を検証 | `js/ocr/ocr-engine.js`, `js/ocr/ocr-output.js` |
| `tests/offscreen-client.test.mjs` | offscreen-client.test.mjs | 新規作成 | offscreen clientテスト | message送受信、timeout、失敗を検証 | `js/offscreen-client.js` |
| `tests/offscreen-ocr-preview.test.mjs` | offscreen-ocr-preview.test.mjs | 新規作成 | offscreen previewテスト | cropとpreview結果のmessage連携を検証 | `js/offscreen.js`, `js/ocr/capture-image.js` |
| `tests/offscreen-symbolic-client.test.mjs` | offscreen-symbolic-client.test.mjs | 変更 | symbolic clientテスト | worker境界と新しいoffscreen routingを反映 | `js/math-core/offscreen-symbolic-client.js`, `js/offscreen.js` |
| `tests/polynomial-concavity-input.test.mjs` | polynomial-concavity-input.test.mjs | 新規作成 | 凹凸入力テスト | 正常・曖昧・過大・未対応入力を検証 | `js/solver/polynomial-concavity-input.js` |
| `tests/polynomial-concavity-integration.test.mjs` | polynomial-concavity-integration.test.mjs | 新規作成 | 凹凸統合テスト | classifierからsolver・結果契約までを検証 | `js/category-classifier.js`, `js/solver/index.js` |
| `tests/polynomial-concavity.test.mjs` | polynomial-concavity.test.mjs | 新規作成 | 凹凸solverテスト | UI向け結果、unsupported/invalid、条件を検証 | `js/solver/polynomial-concavity.js` |
| `tests/polynomial-normal-input.test.mjs` | polynomial-normal-input.test.mjs | 変更 | 法線入力テスト | 入力境界・曖昧表現・安全拒否を追加 | `js/solver/polynomial-normal-input.js` |
| `tests/polynomial-normal.test.mjs` | polynomial-normal.test.mjs | 変更 | 法線solverテスト | 強化入力契約と厳密な法線結果を検証 | `js/solver/polynomial-normal.js` |
| `tests/shortcut-workflow.test.mjs` | shortcut-workflow.test.mjs | 新規作成 | shortcutテスト | 選択→clipboard fallback→検証後コピーを検証 | `js/shortcut-workflow.js`, `js/clipboard.js` |
| `tests/solve-workflow.test.mjs` | solve-workflow.test.mjs | 新規作成 | 解答workflowテスト | solver結果の再利用、出力段階、エラー境界を検証 | `js/solve-workflow.js`, `js/solver/index.js` |
| `tests/storage.test.mjs` | storage.test.mjs | 変更 | storageテスト | schema v2、旧履歴互換、Study記録を検証 | `js/storage.js`, `js/learning-session.js` |
| `tests/ui-page-contract.test.mjs` | ui-page-contract.test.mjs | 変更 | UI契約テスト | popup/settings/history/OCR確認ページの契約を検証 | `*.html`, `css/*`, `js/*` |
