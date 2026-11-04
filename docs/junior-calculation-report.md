# 中学数学入力対応 改修報告

既存の Math Study Log を改修。新規アプリではありません。
対象: aaaadsfgw/math-app-by-Codex / feat/digicon-learning-workflow。
既存の数学エンジン、OCR、UI、履歴、13種類の指示を再利用しています。

## 検証結果

- 既存908件 → 最終915件、全件成功。既存5,500問コーパスを含みます。
- npm run check 成功（299ファイル、報告書追加前）。
- Chrome 157: 新規入力25ケース、貼り付け、ショートカット、選択10ケース成功。
- 実画像「（2）3x+2x」はOCR分離、明示確認、5*x表示、Study/Quick履歴まで成功。
- 実画像「① (-3)+5」は番号分離成功、数式は(3)+Sと誤読。
  この画像の無修正OCRは未達。編集で(-3)+5へ直してから確認する別シナリオは両モード成功。
- 自動の実ブラウザ検証です。人による画面確認・今回のWASM再検証は未実施です。

## 確認した代表問題

| 入力 | 結果 |
|---|---|
| 3+5 | 8 |
| (-3)+(-7) | -10 |
| (-4)*(-5) | 20 |
| 2/3+1/4 | 11/12 |
| 3x+5x | 8*x |
| 2(x+3)-x | x+6 |
| (x+2)(x+3) | x^2+5*x+6 |
| √12 | 2√3 |
| x²-5x+6=0 | x=2,3 |
| x²-5x+6 | x^2-5*x+6（方程式へ変換しない） |
| (2) 2x+3x | 5*x |
| ② 次の式を計算しなさい。(-3)+5 | 2 |
| 次の式を展開しなさい。(x+2)(x+3) | x^2+5*x+6 |
| (1)+3 | 4（番号として削除しない） |
| 1.5+2 | 7/2 |

番号形式・条件・厳密計算の上限は supported-problems.md、再現手順は test-plan.md を参照。
曖昧な番号、複数問題、未対応の関数、文字を含む根号や複合根号、指示なしの多変数式は推測しません。
今後は実問題集の字体・画質でOCRを評価し、マイナスと5/Sの誤読、根号・多変数式の厳密検証を改善します。

## 変更ファイル
- `docs/decision-log.md`
- `docs/junior-calculation-report.md`
- `docs/supported-problems.md`
- `docs/test-plan.md`
- `js/category-classifier.js`
- `js/math-core/elementary-expression.js`
- `js/math-core/expression-parser.js`
- `js/ocr/mixed-ocr-engine.js`
- `js/problem/instruction-normalizer.js`
- `js/problem/problem-input.js`
- `js/problem/question-label.js`
- `js/problem/structured-input.js`
- `js/solver/algebra-transformation.js`
- `PLAN.md`
- `PROGRESS.md`
- `scripts/input-entry-extension-smoke.mjs`
- `scripts/ocr-extension-flow-smoke.mjs`
- `tests/browser/junior-calculation-ocr-harness.html`
- `tests/junior-calculation.test.mjs`
- `tests/mixed-ocr-engine.test.mjs`
- `tests/paste-input.test.mjs`
- `tests/problem-input.test.mjs`
- `tests/shortcut-workflow.test.mjs`
