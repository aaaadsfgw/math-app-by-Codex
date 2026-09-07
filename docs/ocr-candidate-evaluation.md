# Printed Math OCR Candidate Evaluation

Status: implementation decision, experimental local feature, 2026-09-07

## Decision

Use the browser deployment from `dbcccc/IBEM-im2typst`, pinned to Hugging Face
revision `a7ced2309da108a911fa6880055a165264872a84`, with ONNX Runtime Web
1.22.0. Try the FP16 graphs through WebGPU first and fall back to the
dynamic-INT8 graphs through WASM when WebGPU is unavailable or session creation
or inference fails.

This decision permits one model-based acquisition path; it does not restore an
AI answer path. The model may transcribe one tightly cropped machine-printed
formula into untrusted editable text. It cannot answer, explain, determine
mathematical support, validate a transcription, or create the `verified` label.
The user must see the original crop, review or edit the candidate, and perform a
separate explicit solve action before the existing deterministic solver receives
the text.

## Fixed trust boundary

```text
one printed-formula crop
  -> local OCR recognition
  -> untrusted editable candidate
  -> explicit user confirmation
  -> existing deterministic parser and solver
  -> exact / approximate / conditional / unsupported / invalid
```

Recognition success is not solver success. Recognition alone must not:

- create a pending solve or invoke a solver;
- mark an answer or transcription verified;
- create learning history or alter the clipboard;
- silently correct an ambiguous glyph such as `1`/`l`, `0`/`O`, or `x`/`×`;
- infer notation from a diagram, page layout, labels, prose, or context; or
- expand the problem classes accepted by the deterministic solver.

After explicit confirmation, Study history may record `source: "ocr"` and
`ocrConfirmed: true`. Those fields describe acquisition and user action only;
the deterministic solver's independent evidence remains the sole source of a
verified result.

## Selected artifact identity

The selected model is the experimental
`ibem-semantic-length33-phase10-step002000` browser trial. The packaged metadata
identifies a 14,157,152-parameter `cnn-transformer-v3` recognizer, a 528-token
vocabulary with UTF-8 byte fallback, 256-pixel input height, at most 2,048 input
pixels of width, and a cached autoregressive decoder.

The deployment manifest pins these model variants:

| Provider | Encoder | Decoder | Combined graph bytes | Purpose |
| --- | --- | --- | ---: | --- |
| WebGPU | `encoder.fp16.onnx`, SHA-256 `e0720d76...e8d8477` | `decoder-step.fp16.onnx`, SHA-256 `531b2b82...078ee9` | 28,992,715 | Preferred browser path |
| WASM | `encoder.int8.onnx`, SHA-256 `6c889df9...2bdab1` | `decoder-step.int8.onnx`, SHA-256 `fea2c179...83eecf` | 18,580,885 | CPU fallback |

The public INT8 graph uses dynamic-quantization operators that are not a valid
substitute for the WebGPU graph. WebGPU qualification therefore requires the
separate, hash-matching FP16 pair from the pinned deployment. A release package
must contain every selected graph, configuration, vocabulary, output policy,
license, and runtime file locally, and the static project check must verify the
pinned hashes. Missing or mismatched assets are a hard failure, never a reason
to download replacements.

Sources and local notices:

- [Pinned model revision](https://huggingface.co/dbcccc/IBEM-im2typst/tree/a7ced2309da108a911fa6880055a165264872a84)
- [Model source repository](https://github.com/dbccccccc/IBEM-im2typst)
- `vendor/ocr/ibem-im2typst/MODEL_CARD.md`
- `vendor/ocr/ibem-im2typst/MODEL_LICENSE.md`
- `vendor/ocr/ibem-im2typst/LICENSE`
- `vendor/ocr/ibem-im2typst/deployment.json`
- `vendor/ocr/ibem-im2typst/UPSTREAM_SHA256SUMS`
- `vendor/onnxruntime-web/LICENSE`

## License and provenance conclusion

The selected source and identified exported model weights are MIT licensed.
The model notice states that the lineage began from project-seeded parameters,
continued only within the same IBEM lineage, and contains no external
pretrained or teacher model. It was trained from IBEM formula crops and
deterministically derived package-free Typst targets. The IBEM dataset remains
CC BY 4.0 but is not redistributed in the extension.

ONNX Runtime is also MIT licensed. Preserve both upstream licenses, the model
weight notice, exact revision, deployment metadata, and artifact checksums.
This conclusion applies only to the pinned artifacts; replacing a graph,
checkpoint, vocabulary, runtime, or revision requires a new license and
compatibility review.

## Validation evidence and what it does not mean

The bundled model card reports the following FP32 results on 16,899 validation
crops from 60 documents disjoint from the training documents:

| Slice | Exact match |
| --- | ---: |
| Complete validation split | 92.6268% |
| At most 32 tokens | 97.8519% |
| 33–64 tokens | 88.4282% |
| 65–128 tokens | 80.1895% |
| 129–256 tokens | 61.4443% |
| Over 256 tokens | 25.8675% |
| Embedded formulas | 96.8576% |
| Displayed formulas | 70.1197% |

These are experimental validation results for the FP32 checkpoint, not a
guarantee for arbitrary webpages or for the FP16/INT8 browser paths. The
33–64-token slice misses the model project's own 90% production gate, displayed
and long formulas are materially weaker, and the complete quantized-domain
evaluation is unfinished. The displayed token score is uncalibrated and must
not be shown as the probability that a formula is correct. One wrong sign,
bound, exponent, or subscript can change the problem while leaving the output
plausible, so every candidate remains visibly untrusted.

The selection is therefore based on small packaged assets, a documented
browser deployment, cached decoding, pinned provenance, and a usable short-form
validation profile—not on production-level accuracy. The feature must fail
closed and require user review even after all technical smoke tests pass.

## Why this replaces the provisional candidates

The earlier RapidLaTeXOCR choice was provisional and remained blocked because
the exact weight-redistribution terms and browser adapter were unresolved. The
IBEM deployment supplies a model-specific browser runtime, cached decoder,
preprocessing and output policies, exact artifact identities, and an explicit
MIT grant for the identified weights. Its INT8 graph pair is about 18.6 MB and
is substantially smaller than the previously evaluated Rapid, PP-FormulaNet,
and Nougat-style packages.

Tesseract.js remains unsuitable for this path: general word OCR does not define
the structural formula-recognition objective, vocabulary, or decoding required
to preserve fractions, radicals, scripts, matrices, and operator layout. It is
not a safe fallback for failed formula OCR.

## Packaged runtime design

- Load no OCR asset during extension, popup, or solver startup. Lazy-load the
  runtime and graphs only after the user explicitly starts recognition.
- Use packaged ONNX Runtime Web 1.22.0. No CDN, network request, dynamic code
  download, native process, localhost server, API key, or host permission is
  allowed.
- Run preprocessing, session creation, encoder execution, and cached greedy
  decoding in a dedicated Worker owned by the offscreen OCR controller.
- Attempt WebGPU first. On a typed provider/session/inference failure, dispose
  the failed session and try WASM. Never label WASM work as WebGPU.
- Reuse a successful Worker/session for warm requests while the OCR flow
  remains active. Keep requests serialized so image/result pairs cannot mix.
- On cancellation or timeout, terminate the Worker so native inference cannot
  finish late. On invalid output, terminal failure, extension teardown, or
  explicit disposal, release sessions and remove pending callbacks.
- Apply a 120-second deadline to recognition. Keep capture/confirmation metadata
  and the in-memory preview for at most ten minutes, with earlier cleanup on
  discard, replacement, tab closure, or extension teardown.
- Bound input bytes, decoded pixels, width/height, crop size, preprocessing
  buffers, output tokens, output characters, runtime duration, and queued work.
- Verify the deployment metadata and selected asset hashes before constructing
  sessions. Treat mismatch or absence as a local installation error.

The normalizer may perform only syntax-preserving conversions needed by the
existing text parser: selected full-width ASCII, Unicode `−`/`×`/`÷`, safe
superscript digit runs attached to a visible base, and a structurally valid
`frac(a,b)` into an explicitly parenthesized division. It deliberately avoids
unrestricted NFKC so compatibility glyphs cannot silently become another
identifier. Unknown calls, symbols, invisible controls, or unsupported
superscripts must survive as an obvious unsupported token or make recognition
fail; they must never be deleted or reinterpreted to obtain a solvable
expression.

## Required browser qualification

Automated unit and contract tests must cover:

- pinned file integrity and license presence;
- safe image preprocessing and every byte/pixel/dimension limit;
- WebGPU-first provider order and forced WASM fallback;
- output-policy, termination-token, repetition, length, delimiter, and
  conservative-normalization failures;
- timeout, cancel, dispose, warm reuse, request serialization, and late-message
  suppression;
- crop/candidate pairing and editable candidate preservation;
- zero solve/history/clipboard effects from recognition alone; and
- confirmed OCR source metadata followed by ordinary solver
  exact/conditional/unsupported/invalid behavior.

Real unpacked Chrome must additionally demonstrate:

1. correct page-range screenshot pixels and offscreen Blob sharing;
2. successful WebGPU recognition using the FP16 pair;
3. successful forced WASM fallback using the INT8 pair;
4. no external network request during either path;
5. extension CSP compatibility with the packaged Worker and WASM;
6. cancellation, timeout recovery, disposal, and warm-session reuse; and
7. a visible gap between recognition and the separate explicit solve action.

Until both providers and the confirmation boundary pass in the supported Chrome
version, documentation must describe the feature as experimental and the
unpacked-Chrome path remains a release blocker.

## Unsupported OCR scope

The OCR path supports only one tightly cropped, machine-printed formula whose
meaning is fully present in the crop. It does not support:

- handwriting or mixed printed/handwritten notation;
- photographs, perspective distortion, shadows, or arbitrary backgrounds;
- full pages, page segmentation, paragraphs, surrounding problem prose, or
  multiple formulas;
- geometry diagrams, graphs, tables, axes, plotted points, or labels whose
  spatial relationship carries meaning;
- construction tasks or information inferred from an illustration;
- proof statements, proof prose, or mathematical reasoning inferred from an
  image;
- automatic correction based on what the solver happens to accept; or
- any notation or problem form outside the deterministic solver's documented
  text-input scope.

For an uncertain crop or candidate, the correct outcome is discard, edit, or a
clear recognition error. A plausible guess is never an acceptable fallback.
