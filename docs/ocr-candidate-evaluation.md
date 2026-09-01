# Printed Math OCR Candidate Evaluation

Status: research decision, 2026-09-01

This document evaluates local printed-math OCR backends for the Manifest V3
Chrome extension. OCR is an untrusted acquisition step only:

```text
formula image -> OCR candidate text -> user confirmation/edit -> deterministic solver
```

The OCR model must never generate an answer, validate mathematics, or make an
OCR result `verified`. `verified` continues to mean that the deterministic math
engine verified the user-confirmed input.

## Decision

Use the RapidLaTeXOCR ONNX model family as the **provisional technical MVP**,
behind a replaceable `MathOcrBackend` boundary. It is the smallest candidate in
this comparison that has all of the following:

- a formula-image-to-LaTeX objective;
- published ONNX encoder/decoder assets;
- an upstream printed-formula accuracy report; and
- a plausible ONNX Runtime Web deployment path without a runtime server.

This is not final approval to redistribute the weights. The license gate below
must be closed before model assets are added to a distributable extension. If
that gate cannot be closed, benchmark PP-FormulaNet-S as the replacement.

No browser latency, browser accuracy, or memory claim is made by this decision.

## Candidate comparison

Published metrics use different data sets and test environments. They are
evidence that a candidate is relevant, not a cross-model leaderboard.

| Candidate | Published assets and size | License evidence | Browser and MV3 feasibility | Published printed-math evidence | Cold/warm evidence | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| RapidLaTeXOCR / pix2tex ONNX | `image_resizer.onnx` 37.1 M, `encoder.onnx` 84.8 M, `decoder.onnx` 48.5 M; approximately 170.4 M plus `tokenizer.json` | RapidLaTeXOCR repository and upstream LaTeX-OCR repository say MIT; the RapidLaTeXOCR PyPI 0.0.4 metadata says Apache-2.0. Weight-specific redistribution terms are not stated clearly enough for release approval. | The three graphs were exported to ONNX and tested with native ONNX Runtime. The official runtime is Python, so image preprocessing, tokenization, and autoregressive decoding must be ported to JavaScript. Standard-operator graphs should have a WASM route, but both WASM and WebGPU require model-specific browser tests. No external process is needed after a successful browser port. | Upstream pix2tex reports BLEU `0.88`, normalized edit distance `0.10`, and token accuracy `0.60`. The ONNX conversion repository shows sample parity, not a systematic conversion or browser benchmark. | The Rapid README shows approximately 0.41-0.48 seconds for a native Python call after model construction. It does not publish browser, cold-load, session-build, memory, or percentile results. | Provisional MVP, blocked from redistribution until the license gate closes. |
| PP-FormulaNet-S | 224 MB inference model | PaddleOCR is Apache-2.0; retain the applicable copyright, license, and NOTICE material and pin the exact model artifact. | Paddle2ONNX release notes explicitly add PP-FormulaNet-S/L support. Conversion is a build-time step; preprocessing, vocabulary decoding, and postprocessing still need a JavaScript implementation. Paddle.js advertises WebGPU/WASM backends, but there is no official PP-FormulaNet-S browser compatibility result. ONNX Runtime Web provider compatibility must therefore be tested directly. | PaddleOCR reports En-BLEU `87.00` and describes the S model as suitable for simple and simple multiline printed formulas. Its published native high-performance CPU inference figure is `254.39 ms`; preprocessing and postprocessing are excluded. | No browser cold/warm result is published. The native Paddle/OpenVINO-style test environment cannot be used as a browser estimate. | Fallback candidate if Rapid licensing is unresolved or target-corpus results are materially better. |
| PaddleOCR `LaTeX_OCR_rec` | 99 MB inference model | PaddleOCR distributes its project under Apache-2.0 and identifies LaTeX-OCR as the algorithm source; upstream LaTeX-OCR is MIT. Exact weight provenance and notices still need to be recorded before redistribution. | Paddle2ONNX release notes include a LaTeX-OCR batch-normalization export fix. There is no official browser deployment or provider-compatibility result. It is autoregressive and needs a JavaScript decoding loop. | PaddleOCR reports En-BLEU `74.55` and native GPU inference of `1088.89 ms`; no CPU figure is published. | No browser cold/warm result is published. | Rejected for this product: small, but weaker published accuracy and no evidence of a practical CPU-browser baseline. |
| `onnx-community/nougat-latex-base-ONNX` | q4f16: decoder 235 MB + encoder 44.7 MB = 279.7 MB; int8: decoder 276 MB + encoder 78.9 MB = 354.9 MB; add tokenizer (3.58 MB) and configuration files | Model card says Apache-2.0 and identifies `Norm/nougat-latex-base` as the base model. Preserve attribution for the base model and ONNX conversion. | The model card provides direct Transformers.js `image-to-text` usage, so it has the clearest browser integration path and needs no external process. The q4f16 pair is WebGPU-oriented; the larger int8 pair is the safer CPU/WASM experiment. | The model card reports token accuracy `0.623850` and normalized edit distance `0.06180` on its curated equation set, using beam-search results. | No browser cold/warm or memory result is published. The large autoregressive files make cold session construction and CPU decoding product risks that must not be estimated from file size alone. | Rejected for the initial extension because the selected runtime asset set is substantially larger than Rapid and lacks browser performance evidence. |

Tesseract.js is also rejected. It is a mature Apache-2.0 browser/WASM text OCR
library, but its official scope is extracting words from images. It provides no
official formula-structure-to-LaTeX accuracy evidence, so ordinary character
recognition cannot safely substitute for mathematical layout recognition.

## Official sources

### RapidLaTeXOCR and pix2tex

- [RapidLaTeXOCR repository and MIT license statement](https://github.com/RapidAI/RapidLatexOCR)
- [RapidLaTeXOCR PyPI 0.0.4 asset-size table and conflicting Apache-2.0 metadata](https://pypi.org/project/rapid-latex-ocr/0.0.4/)
- [Official ONNX conversion procedure and three-model graph](https://github.com/SWHL/ConvertLaTeXOCRToONNX)
- [Upstream LaTeX-OCR architecture, metrics, and MIT license](https://github.com/lukas-blecher/LaTeX-OCR)
- [Official RapidLaTeXOCR model release asset history](https://github.com/RapidAI/RapidLaTeXOCR/releases)

### Paddle candidates

- [PaddleOCR formula model sizes, intended scope, metrics, and native test environment](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/formula_recognition.en.md)
- [Paddle2ONNX releases, including PP-FormulaNet support and the LaTeX-OCR export fix](https://github.com/PaddlePaddle/Paddle2ONNX/releases)
- [Paddle.js browser backends and Apache-2.0 license](https://github.com/PaddlePaddle/Paddle.js)

### Nougat ONNX

- [Nougat-LaTeX ONNX model card, evaluation, and Transformers.js usage](https://huggingface.co/onnx-community/nougat-latex-base-ONNX)
- [Official ONNX asset list and sizes](https://huggingface.co/onnx-community/nougat-latex-base-ONNX/tree/main/onnx)

### Browser runtime and extension constraints

- [ONNX Runtime Web execution-provider support](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- [WASM operator coverage and WebGPU subset warning](https://onnxruntime.ai/docs/tutorials/web/)
- [ONNX Runtime Web deployment, local workers, WASM assets, and CSP guidance](https://onnxruntime.ai/docs/tutorials/web/deploy.html)
- [ONNX Runtime Web thread and proxy-worker restrictions](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- [ONNX Runtime MIT license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)
- [Manifest V3 extension-page CSP and `wasm-unsafe-eval`](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Manifest V3 remote-hosted-code requirements](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
- [Chrome extension cross-origin isolation](https://developer.chrome.com/docs/extensions/develop/concepts/cross-origin-isolation)
- [Chrome Web Store 2 GB package limit](https://developer.chrome.com/docs/webstore/publish)
- [Tesseract.js browser scope and Apache-2.0 license](https://github.com/naptha/tesseract.js)

The Chrome Web Store's 2 GB ZIP limit means the shortlisted assets are not
automatically disqualified by the store limit. It does not make a 170-355 MB
model set a good install, update, startup, or memory experience. Those remain
product measurements.

## Redistribution license gate

The following is a hard release gate for RapidLaTeXOCR:

1. Identify the exact model archive and immutable upstream revision.
2. Obtain an unambiguous statement covering redistribution of the ONNX weights,
   not only the Python source.
3. Resolve the repository MIT versus PyPI Apache-2.0 inconsistency in favor of
   a documented, artifact-specific conclusion.
4. Record the upstream source URL, release/tag, download date, every asset's
   byte length and SHA-256 hash, model purpose, and governing license.
5. Preserve the RapidLaTeXOCR and upstream LaTeX-OCR copyright/license text and
   any required third-party notices.
6. Add the pinned ONNX Runtime Web version, MIT license, and its third-party
   notices to `THIRD_PARTY_NOTICES.md` or `THIRD_PARTY_LICENSES.md`.
7. Have the redistribution conclusion reviewed before a distributable ZIP or
   Chrome Web Store package is produced.

Until all seven items are complete, development may use locally obtained model
assets for a non-redistributed compatibility benchmark, but model weights must
not be committed to a release artifact or described as cleared for
redistribution. Fetching the model on first use does not resolve the license
question and would weaken the install-once, offline product requirement.

## Proposed browser architecture

```text
capture-visible-tab result
        |
        v
crop validation and deterministic Canvas preprocessing
        |
        v
OCR controller in the bundled offscreen document
        |
        v
packaged dedicated Worker, created only on OCR use
        |
        +--> packaged ONNX Runtime Web JavaScript and WASM
        +--> packaged image resizer, encoder, decoder, tokenizer
        |
        v
untrusted raw LaTeX + backend diagnostics
        |
        v
mandatory image/result confirmation and user editing
        |
        v
existing deterministic parser, solver, verifier, and presenter
```

### Runtime rules

- Do not load an OCR model during extension, popup, or solver startup.
- Keep inference out of the Manifest V3 service worker. The existing bundled
  offscreen document owns a manually authored, packaged OCR Worker while an OCR
  request is active.
- Do not use ONNX Runtime's proxy-worker option. Its documented restrictions
  include WebGPU incompatibility and CSP-sensitive Blob workers. A local Worker
  has an auditable URL and works for both provider attempts.
- Bundle all JavaScript and WASM. Set `ort.env.wasm.wasmPaths` to packaged
  `chrome-extension://` resources and use the extension-page CSP
  `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'`.
- Attempt complete WebGPU session creation and a qualification inference first.
  If creation or execution fails, release those sessions and create fresh WASM
  sessions. Do not claim transparent per-operator WebGPU fallback.
- Treat WASM as the compatibility baseline only after all graphs load and pass
  parity fixtures. ONNX Runtime documents full standard ONNX operator support
  for WASM, but a converted model can still contain an unsupported custom op,
  invalid dynamic shape, excessive allocation, or conversion defect.
- Enable WASM multithreading only when the offscreen context is confirmed
  `crossOriginIsolated`. COOP/COEP can enable it for extension pages, but Chrome
  documents incomplete isolation for some worker contexts. Single-thread WASM
  must remain a valid fallback.
- Reuse qualified sessions for warm requests while the OCR flow remains active.
  Release them after a bounded idle period or an explicit model-cache reset.
- Serialize inference initially. Every request carries an ID and deadline.
  Cancelled, superseded, or timed-out results are discarded. If an inference
  cannot be interrupted safely, terminate and recreate the Worker.
- Return backend metadata such as model revision, requested/actual provider,
  load phase, and elapsed phases for local diagnostics. Do not convert logits
  into a fabricated confidence percentage unless calibration is separately
  demonstrated.

### Trust and failure rules

- Preserve the crop and raw OCR output until confirmation so the user can
  compare them directly.
- Apply only documented lexical cleanup before confirmation. Do not silently
  repair operators, bounds, signs, variables, or grouping based on mathematical
  expectations.
- Reject empty output, control characters, excessive token length, decoder
  non-termination, malformed Unicode, timeout, model-load failure, and provider
  failure without invoking the solver.
- Never replace a user's clipboard or create verified history from an OCR
  failure, cancellation, or unconfirmed result.
- Record `source: "ocr"` only after confirmation. Separately record that OCR
  was used; this does not certify recognition accuracy.
- A confirmed OCR transcription may still produce `unsupported` or `invalid`
  from the existing solver. Do not retry it through another answer generator.

## Benchmark and qualification plan

The provisional choice becomes final only after a reproducible Rapid versus
PP-FormulaNet-S comparison on target material.

### Corpus

Create a versioned, redistribution-safe corpus with independently checked
ground-truth LaTeX. Include:

- clean browser-rendered and PDF-rendered single printed formulas;
- common Japanese high-school typography, without surrounding prose;
- fractions, nested exponents, roots, absolute values, logarithms,
  trigonometric notation, derivatives, limits, definite integrals, Greek
  symbols, and rational coefficients that intersect the existing solver scope;
- different antialiasing, zoom levels, light/dark backgrounds, and modest
  screenshot scaling;
- narrow, wide, short, and multiline printed formulas within documented model
  limits;
- adversarial sign, decimal-point, exponent, subscript, bound, bracket, `1/l`,
  `0/O`, multiplication, and minus/dash confusions; and
- negative controls for every explicitly unsupported OCR class.

Ground truth must not be produced by either candidate under test. Keep separate
development and held-out qualification sets.

### Correctness measurements

Report at least:

- normalized whole-formula exact match;
- token edit distance and token-level accuracy;
- wrong-but-syntactically-valid transcription rate;
- existing-solver parse and route success rate for in-scope ground truth;
- number of user edits or correction keystrokes before confirmation;
- timeout, empty-output, malformed-output, and provider-failure rates; and
- ONNX/native parity on shared fixtures where a trusted native reference can
  be run during development.

The wrong-but-parseable rate is a primary safety measure: a plausible changed
sign or bound is more dangerous than an explicit OCR failure.

### Runtime measurements

Measure, do not estimate:

- packaged asset bytes and final extension ZIP bytes;
- Worker creation, asset read, session creation, first inference, preprocessing,
  decoding, and total cold-request time separately;
- warm P50, P95, and maximum request time by token-length bucket;
- peak and retained memory before load, after session creation, after inference,
  and after disposal;
- WebGPU qualification success and WASM fallback rate; and
- UI responsiveness, cancellation latency, and recovery after Worker
  termination.

Run the matrix on current Chrome stable for Windows with WebGPU available and
disabled, on at least one common integrated GPU and one CPU-only/fallback
configuration. Record exact Chrome, ONNX Runtime, model, OS, CPU, GPU, and
driver versions.

The upstream native figures in the comparison table must never be copied into
README or UI as extension performance. Product timing may be documented only
from this browser matrix.

### Size-reduction experiments

After the baseline is correct, evaluate these independently:

1. Replace the 37.1 M learned image resizer with deterministic Canvas
   preprocessing, reducing the Rapid asset set to approximately 133.3 M plus
   tokenizer. Adopt only if the held-out safety and accuracy results do not
   regress beyond the agreed gate.
2. Test supported quantization per graph. Decoder quantization must receive
   special attention because small token changes can alter an entire formula.
3. Build a reduced-operator ONNX Runtime Web artifact only after the final
   graphs are pinned. Preserve a standard runtime build for parity diagnosis.

None of these reductions is part of the provisional accuracy claim.

## Unsupported OCR scope

The initial OCR feature supports a user-selected crop containing one printed
formula. It does not support:

- handwritten mathematics;
- Japanese or other natural-language problem statements;
- mixed prose and formulas where the prose is required to solve the problem;
- multiple problems or automatic formula segmentation;
- geometry diagrams, labels whose spatial relation carries meaning, or
  geometric construction;
- graphs, plotted curves, axes, tables, charts, or values inferred visually;
- proof problems or mathematical meaning inferred from an image;
- photographs requiring perspective correction, dewarping, shadow removal, or
  page-layout reconstruction;
- chemical, physical, or domain-specific notation outside the OCR vocabulary;
- any formula that the user has not reviewed and explicitly confirmed; or
- using OCR output to expand the deterministic solver's supported domain.

Unsupported crops must produce a clear retry/edit/cancel path, not a guessed
transcription. The UI must continue to state that image recognition can be
wrong and that the recognized expression must be checked before analysis.

## Claims that remain prohibited without benchmarking

Do not state that:

- the selected model is accurate for Japanese Math III screenshots;
- an OCR result is correct, verified, deterministic, or hallucination-free;
- WebGPU runs every model graph or is faster than WASM for this model;
- CPU/WASM inference is fast enough for an ordinary PC;
- cold load, warm inference, memory, or installation overhead has a particular
  value;
- ONNX conversion is numerically or token-for-token identical to its source;
- published BLEU values rank these candidates on the product corpus; or
- token accuracy is equivalent to whole-formula correctness.

Those claims may be replaced only with dated, reproducible measurements from
the qualification plan and must name the exact model and browser environment.
