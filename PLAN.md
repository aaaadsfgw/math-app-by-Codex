# Non-AI Math Engine Plan

## Outcome

Replace every Ollama-dependent answer, hint, step, and explanation path with
deterministic local code while preserving the learning log, shortcut, history,
analytics, review, settings, import/export, and accessibility behavior.

The supported curriculum target is routine calculation from junior-high
mathematics through Mathematics III. General image recognition,
diagram-based geometry, and proof generation are explicitly out of scope. A
single acquisition-only exception permits local transcription of a tightly
cropped, machine-printed single formula into editable candidate text. OCR never
solves or verifies mathematics, and the existing deterministic solver receives
the text only after explicit user confirmation.

## Constraints

- No local or cloud answer-generation AI. The pinned, packaged OCR model is an
  acquisition-only exception and cannot create mathematical answers.
- No API key, CDN, or external application server.
- No JavaScript `eval`, `new Function`, or equivalent dynamic code execution.
- The extension must remain usable offline as a Manifest V3 extension.
- Printed-formula OCR must use packaged assets only, prefer WebGPU, fall back to
  WASM, and fail without submitting or solving when neither provider succeeds.
- OCR output must remain visibly untrusted and editable until the user confirms
  it; recognition alone must never invoke a solver or create verified history.
- Unsupported or ambiguous input must return a clear limitation instead of a
  guessed answer.
- Existing history records must continue to load.
- Solver output must distinguish exact, approximate, conditional, unsupported,
  and invalid results.

## Architecture direction

- Keep question classification separate from parsing and solving.
- Normalize selected or typed text into a restricted mathematical input.
- Represent parsed expressions with a common deterministic AST.
- Use a bundled, audited computer-algebra library only behind a project-owned
  adapter.
- Generate answer, hints, steps, explanations, and verification evidence from
  one structured solution trace.
- Keep solver-specific rules for domain checks, case splits, and curriculum
  explanations.

## Milestones

1. **Durable project state**
   - Add this plan, progress log, decision log, and restart procedure.
   - Define the non-AI completion criteria and evaluation policy.
2. **Remove AI runtime paths**
   - Remove Ollama host permissions, settings, client calls, prompts, demo
     fallback, and AI evidence labels.
   - Preserve supported deterministic flows and storage compatibility.
3. **Core expression engine**
   - Add normalized tokens, AST/adaptor boundary, exact rational values,
     domain metadata, and safe serialization.
4. **Algebra expansion**
   - Arithmetic, fractions, radicals, polynomial manipulation, equations,
     inequalities, systems, exponentials, logarithms, and standard
     trigonometry.
5. **Sequences, probability, and vectors**
   - Standard high-school calculation forms with structured steps.
6. **Mathematics III**
   - Limits, derivatives, extrema, tangent/normal lines, definite and
     indefinite integrals, area, volume, and numerical fallback where exact
     elementary forms do not exist.
7. **Deterministic learning assistance**
   - Hint 1, Hint 2, steps, explanation, final answer, and verification from
     solution traces without generated prose.
8. **Evaluation and release**
   - At least 1,000 representative positive, negative, boundary, and
     unsupported cases.
   - Automated checks, unpacked-Chrome smoke testing, documentation update, and
     a final go/no-go report.
9. **Bounded printed-formula OCR acquisition**
   - Bundle a pinned and licensed formula-transcription model plus browser
     runtime; lazy-load it only after the user requests OCR.
   - Recognize one tightly cropped machine-printed formula locally, with
     WebGPU-to-WASM fallback, bounded input, timeout, cancellation, disposal,
     and safe reuse of a warm session.
   - Show the crop and editable candidate together. Require a separate explicit
     confirmation before the existing solver runs, and record `source: "ocr"`
     without treating OCR as verification.
   - Reject handwriting, full-page segmentation, prose, diagrams, graphs,
     tables, proof interpretation, and any attempt to infer missing notation.

## Definition of done

- No Ollama or answer-generation AI code, permission, setting, or documentation
  remains; the pinned local OCR exception only transcribes printed input and
  never generates or verifies an answer.
- All implemented solvers use the common result and solution-trace contracts.
- All existing non-geometry learning workflows remain operational.
- Every supported result is independently verified or explicitly marked as a
  bounded numerical approximation.
- Ambiguous, malformed, unsupported, and non-elementary cases fail safely.
- The automated evaluation suite passes.
- Manual Chrome flows pass with no external process running.
- OCR recognition and its provider fallback pass in unpacked Chrome, while an
  OCR result by itself still cannot solve, write verified history, or change
  the clipboard.
- `PROGRESS.md` contains no unfinished milestone.

