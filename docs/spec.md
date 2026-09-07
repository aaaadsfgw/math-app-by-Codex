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
   key, or CDN. A pinned browser-local printed-formula OCR model may only
   transcribe input under the confirmation boundary below.
10. For OCR, accept only a user-selected crop containing one machine-printed
    formula, show the crop beside editable candidate text, and require a
    separate explicit confirmation before sending that text to the existing
    deterministic solver.

## Scope

Target: textual/formula questions from junior-high mathematics through Japanese
Mathematics III. Input may be typed, selected as text, or explicitly confirmed
after local printed-formula OCR. OCR output is untrusted acquisition data, not a
solver result or verification signal.

Excluded:

- general image recognition other than the bounded printed-formula acquisition
  path described above;
- handwriting, photographs, full-page OCR, surrounding prose, tables, graphs,
  diagrams, or spatially inferred notation;
- questions whose essential information is only in a diagram;
- construction and diagram editing;
- free-form proof generation;
- deliberate guessing for unsupported input.

Coordinate formulas and vector algebra expressed completely as text may be added
later as algebraic domains. That does not restore diagram geometry.

The OCR implementation is packaged and offline. It prefers WebGPU and falls
back to WASM. Provider failure, timeout, cancellation, invalid output, or an
ambiguous transcription must stop before solving. The user may edit the
candidate or discard it; recognition alone cannot create history or a verified
label.

## Result states

- `exact`: exact symbolic or rational result;
- `approximate`: numeric approximation with stated precision;
- `conditional`: result valid under explicit assumptions or parameter cases;
- `unsupported`: recognized but not implemented or outside scope;
- `invalid`: malformed, ambiguous, or contradictory input.

The present legacy result contract will migrate to these states during the
shared-math-core milestone.
