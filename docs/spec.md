# Product specification

## Objective

Provide an offline Chrome extension that accepts a textual mathematics
question, computes a verifiable result when the format is supported, presents
graduated learning assistance, and records the learner's level of independence.

## Required behavior

1. Accept typed text and user-selected text from ordinary web pages.
2. Classify the question without treating classification as proof of support.
3. Parse only allow-listed mathematical notation.
4. Compute and independently check the answer where practical.
5. Generate answer, hint 1, hint 2, working, and explanation deterministically
   from one verified solution trace.
6. Refuse unsupported, ambiguous, contradictory, or invalid input clearly.
7. Save optional local history, self-assessment, analytics, and review state.
8. Preserve readable legacy learning records during data migration.
9. Operate with no answer-generation AI, network request, external server, API
   key, or CDN. Pinned browser-local OCR models may only transcribe input under
   the confirmation boundary below.
10. For OCR, accept only a user-selected crop containing exactly one
    machine-printed formula, optionally with one or two short horizontal
    Japanese problem-number/instruction lines above it. Show the crop beside
    separate editable fields and require explicit confirmation before sending
    the structured input to the existing deterministic solver.

## Scope

Target: textual/formula questions from junior-high mathematics through Japanese
Mathematics III. Input may be typed, selected as text, or explicitly confirmed
after bounded local printed-math OCR. OCR output is untrusted acquisition data,
not a solver result or verification signal.

Excluded:

- general image recognition other than the bounded printed-math acquisition
  path described above;
- handwriting, photographs, full-page OCR, arbitrary surrounding prose, tables,
  graphs, diagrams, or spatially inferred notation outside the strict stacked
  layout;
- questions whose essential information is only in a diagram;
- construction and diagram editing;
- free-form proof generation;
- deliberate guessing for unsupported input.

Coordinate formulas and vector algebra expressed completely as text may be added
later as algebraic domains. That does not restore diagram geometry.

The OCR implementation is packaged and offline. Formula recognition prefers
WebGPU and falls back to WASM; safely isolated upper Japanese lines use a
separate packaged Tesseract.js WASM recognizer. Segmentation failure, provider
failure, timeout, cancellation, invalid output, or an ambiguous transcription
must stop before solving. The user may edit every field or discard the crop;
recognition alone cannot create history or a verified result.

## Result states

- `exact`: exact symbolic or rational result;
- `approximate`: numeric approximation with stated precision;
- `conditional`: result valid under explicit assumptions or parameter cases;
- `unsupported`: recognized but not implemented or outside scope;
- `invalid`: malformed, ambiguous, or contradictory input.

The present legacy result contract will migrate to these states during the
shared-math-core milestone.
