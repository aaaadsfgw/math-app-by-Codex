# Diff summary

## 対象

- 基準: `origin/feat/non-ai-math-engine`
- 現在のブランチ: `feat/digicon-learning-workflow`
- 現在のHEAD: `2ae3eb5489468138be006cf40ab52d9774c79de4`
- 比較対象はGit差分に現れる実ファイルのみ。元ファイルは移動・削除していない。

## 件数

- 変更ファイル数: 36
- 新規ファイル数: 43
- 削除ファイル数: 0
- `codex-review/` 内のファイル数: 81（差分コピー79 + MANIFEST.md + DIFF_SUMMARY.md）

## 主な変更内容

- 決定論的solverへ多項式凹凸解析を追加。2階導関数、符号区間、臨界点、厳密な検証情報を返す。
- 多項式法線系入力の曖昧さ・危険な表現を拒否する境界を強化。
- Quick Modeは履歴を作らず、Study ModeはAnswer / Hint 1 / Hint 2 / Steps / Explanationの利用を1試行へ集約。
- history schema v2、入力元、段階利用、analytics / review連携を追加。
- 選択テキスト優先ショートカットと、検証成功時だけクリップボードを置換する安全な経路を追加。
- OCRは画像→候補の基盤のみ。ページ範囲選択、offscreen crop、短期確認previewまでを追加し、solverへは送らない。
- MV3 manifest、background、offscreen、静的検査、UI契約を新しい境界へ更新。
- `codex-review/` は確認用コピーのため、静的検査がアプリ本体として二重走査しないよう除外。

## 現在実装済みの機能

- ローカルAI・外部API・APIキー・外部サーバーなしの決定論的数式処理。
- 一次・二次・不等式・連立・指数・対数・微分・積分・極限・接線/法線・多項式の増減/凹凸など、README記載の厳密solver群。
- Quick / Studyのモード切替と段階的な解答表示・学習記録。
- popup手入力、選択テキスト入力、clipboard fallback、履歴、analytics、review。
- OCR候補のcapture preview（認識前）と明示的な確認境界。
- 不明・未対応・不正入力を推測で解かず、明示的な結果状態で返す設計。

## 未完成の機能

- OCR文字認識そのもの、およびOCR結果からsolverへ自動送信する経路。
- OCRモデルの配布・ブラウザadapter・再配布条件の確定。
- 画像認識による図形理解、図形依存問題、手書き認識。
- 証明問題の自動生成・証明文の解答。
- unpacked Chromeでの実ブラウザOCR preview手動確認。

## TODO

- OCR providerを採用する場合も、画像→編集可能なuntrusted数式候補だけに限定する。
- candidate確認後の明示的な編集・再分類・solver入力契約を定義する。
- Chrome実機でcommand、offscreen module worker、capture overlay、preview期限を確認する。
- 既存履歴の移行・エクスポートを実データで確認する。

## 既知の問題

- ポップアップ上のOCR操作は認識機能未接続のため、現時点で解答ボタンとしては有効化していない。
- OCR previewは一時データであり、ページ更新・期限切れ・キャンセルで破棄される。
- 数式の対応範囲外、曖昧な分母境界、複雑すぎる式、証明・図形依存入力はunsupported/invalidになる。
- 実ブラウザでの手動playthroughは自動テストの代替ではなく、別途確認が必要。

## テスト状況

- `npm.cmd test`: 678/678 passed（直近の実装検証結果）。
- `npm.cmd run check`: 216 files checked（11 HTML / 175 JS・MJS / 12 CSS）。
- 凹凸、入力境界、Quick/Study、storage、clipboard、shortcut、offscreen、OCR capture/preview、UI契約のテストを含む。
- 実ブラウザでの完全な手動確認は未完了。特にOCRは認識未接続のためpreview境界までの確認となる。
