# 数式 OCR 比較の再現

Windows x64、Node.js 24.11.1、Electron 45.2.3、Python 3.12.12 で実行した。結論と評価条件は [比較報告](../../docs/ocr-model-benchmark.md) を参照。

## 入力画像

[`data/manifest.json`](data/manifest.json) の34問と PNG が比較の入力。数式単体の評価では、全モデルが各行の `formulaImage` を使用する。番号や日本語指示のあるケースでは、`image` にそれらを含む画像、`formulaRect` に数式切り出し位置を保存した。正解は LaTeX と比較用記法の両方で収録している。

コミット済み PNG をそのまま使うと、別の端末でも同じ入力で比較できる。描画をやり直す場合は、Windows の Cambria Math、Times New Roman、Segoe UI Symbol、Yu Gothic と Electron を使う。画像は MathML から生成し、フォント・画面倍率相当の寸法・余白・分数線の指定・PNG の SHA-256 はマニフェストに記録される。フォントや Chromium の差で再生成した PNG が変わることがある。その場合は既存計測と分けて全モデルを再計測する。

```powershell
npm.cmd ci
npm.cmd exec --no -- electron bench/ocr/generate.mjs
```

## 比較環境の準備

Python 3.12.12 と uv 0.9.11 を用意する。作業ディレクトリはリポジトリのルート。Paddle の Windows ネイティブ読み込みでは日本語を含むモデルパスでエラーが出たため、`$bench` は英数字の絶対パスにする。以下では Windows のローカル一時フォルダーを使う。

```powershell
$bench = Join-Path ([IO.Path]::GetTempPath()) 'math-study-log-ocr-bench'
uv venv --python 3.12.12 "$bench/paddle"
uv venv --python 3.12.12 "$bench/pix2text"
uv venv --python 3.12.12 "$bench/pix2tex"

$paddle = "$bench/paddle/Scripts/python.exe"
$pix2text = "$bench/pix2text/Scripts/python.exe"
$pix2tex = "$bench/pix2tex/Scripts/python.exe"
uv pip install --python $paddle -r bench/ocr/requirements-paddle.txt
uv pip install --python $pix2text -r bench/ocr/requirements-pix2text.txt
uv pip install --python $pix2tex --index https://download.pytorch.org/whl/cpu 'torch==2.8.0+cpu' 'torchvision==0.23.0+cpu'
uv pip install --python $pix2tex -r bench/ocr/requirements-pix2tex.txt

& $paddle bench/ocr/download-model.py PP-FormulaNet_plus-S "$bench/models/PP-FormulaNet_plus-S"
& $paddle bench/ocr/download-model.py PP-FormulaNet_plus-M "$bench/models/PP-FormulaNet_plus-M"
& $pix2text bench/ocr/download-model.py Pix2Text-MFR-1.5 "$bench/models/pix2text"
& $pix2tex bench/ocr/download-model.py pix2tex "$bench/models/pix2tex"
```

初回だけパッケージと重みの取得にネット接続が必要。ダウンロード元、リビジョン、サイズ、SHA-256 は [models.lock.json](models.lock.json) に固定した。IBEM はアプリに同梱済みの重みを `deployment.json` と照合する。Python の依存は `requirements-*.txt` に固定した。pix2tex の比較では上流 CLI のクリップボード書き込みを無効にする。

## 計測

各コマンドを1本ずつ実行する。Electron の GPU 計測は実際に WebGPU で初期化できた場合に限る。`--context` の IBEM は、番号または日本語を含む画像を Windows 版の混在 OCR に入力する別計測。

```powershell
npm.cmd exec --no -- electron bench/ocr/run-ibem.mjs
& $paddle bench/ocr/run-python.py PP-FormulaNet_plus-S "$bench/models/PP-FormulaNet_plus-S" bench/ocr/results/paddle-s-cpu.json
& $paddle bench/ocr/run-python.py PP-FormulaNet_plus-M "$bench/models/PP-FormulaNet_plus-M" bench/ocr/results/paddle-m-cpu.json
& $pix2text bench/ocr/run-python.py Pix2Text-MFR-1.5 "$bench/models/pix2text" bench/ocr/results/pix2text-cpu.json
& $pix2tex bench/ocr/run-python.py pix2tex "$bench/models/pix2tex" bench/ocr/results/pix2tex-cpu.json
npm.cmd exec --no -- electron bench/ocr/run-ibem.mjs --gpu
npm.cmd exec --no -- electron bench/ocr/run-ibem.mjs --context
node bench/ocr/score.mjs
```

`--full-image`（IBEM）または `--context`（Python）を使うと、番号・日本語を含む6枚を数式モデルに直接渡す別計測を再現できる。Python の出力ファイル名には `-full-cpu.json` を使う。

Pix2Text の DirectML 計測には CPU 版と別の環境を用意する。

```powershell
uv venv --python 3.12.12 "$bench/directml"
$directml = "$bench/directml/Scripts/python.exe"
uv pip install --python $directml -r bench/ocr/requirements-directml.txt
& $directml bench/ocr/run-python.py Pix2Text-MFR-1.5 "$bench/models/pix2text" bench/ocr/results/pix2text-gpu.json --device directml
node bench/ocr/score.mjs
```

`results/*-cpu.json` と `results/*-gpu.json` は全問の出力・時間・エラーを保存する。`results/scored.json` は正解、数式別の判定、分野別の集計を併記する。採点時は全画像のハッシュと各ランの対象ケースを検証する。比較用の構文解析はこのコーパスを対象としたもので、採点のために誤認識を修復することはない。

## Windows版 Phase 3

セットアップ後、実装済みの Windows バックエンドを使って測定する。
最初のコマンドは新規コーパスを再生成する場合のみ実行する。

```powershell
npm.cmd exec --no -- electron bench/ocr/generate.mjs --phase3
npm.cmd exec --no -- electron bench/ocr/run-windows-phase3.mjs phase3-results.json
npm.cmd exec --no -- electron scripts/windows-phase3-ocr-smoke.mjs phase3-live.json
```

数式単体34枚は本番の推論プロセスとLaTeX変換器で評価する。混合6枚と新規12枚は
Electron のレイアウト解析・日本語OCR・確認処理まで通す。実画面の選択とキー登録を含む
検証は最後のコマンドで別に実行する。記録済みの結果は
[Phase 3 検証結果](../../docs/windows-ocr-phase3.md) にある。
