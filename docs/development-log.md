# Development log

## 2026-07-30: non-AI migration begins

- Confirmed the physical repository and created branch
  `feat/non-ai-math-engine`.
- Recorded the long-term scope, milestones, restart procedure, decisions, and
  completion gate.
- Audited browser-capable symbolic libraries. Algebrite is the provisional
  backend behind a future project-owned adapter; it is not yet part of runtime.
- Removed the model client, prompt builder, response parser, fallback demo,
  model settings, network host permissions, and all model-dependent branches.
- Added deterministic presentation for answer, hint 1, hint 2, working, and
  explanation modes.
- Removed the geometry page, editor, style sheet, coordinate solver, triangle
  solver, and active geometry-draft API.
- Retained normalization for old history source and verification labels so
  existing learning records remain readable.
- Renamed the visible product to Math Study Log.

At this checkpoint, tests and static project checks pass. Math coverage is still
the original small solver subset; the shared expression core and the
junior-high-to-Math-III expansion remain future milestones.

## 2026-07-30: shared core and first new domain

- Added notation normalization, bounded tokenization, immutable expression AST,
  safe symbolic serialization, and typed result states.
- Migrated the original polynomial solvers to the shared parser and result
  contract.
- Vendored and hash-pinned Algebrite 1.4.0 behind an allow-listed adapter.
- Added per-request module workers with enforceable deadlines.
- Added an offscreen `WORKERS` bridge so service-worker shortcut requests use
  the same isolation boundary.
- Added verified algebraic expansion, factorization, and simplification.

Node tests and source validation pass. An unpacked-Chrome test of the module
worker and offscreen bridge is still required before accepting the backend for
release.

## 2026-07-30: exact linear systems

- Added bounded exact-rational arithmetic for integers, finite decimals, and
  fractions.
- Added a shared linear-expression reducer for `x` and `y`.
- Added two-variable linear-system solving with unique, inconsistent,
  dependent, and identity cases.
- Verify unique solutions by exact substitution into both original equations.
- Updated category routing, examples, supported-problem documentation, and
  deterministic hints.

Node tests and source validation pass. Nonlinear systems, three-variable
systems, and word-problem interpretation remain unsupported.

## 2026-07-30: exact linear inequalities

- Added one-variable linear inequalities with strict and inclusive operators.
- Preserve exact fractional boundaries and reverse the operator only when
  dividing by a negative coefficient.
- Distinguish all-real and empty solution sets when the variable term cancels.
- Reject quadratic, chained, simultaneous, malformed, and unsafe input rather
  than solving a partial substring.

Node tests and source validation pass. Quadratic and compound inequalities
remain unsupported.

## 2026-07-30: verified starter calculus

- Added project-owned differentiation rules for arithmetic composition,
  bounded integer powers, common trigonometric functions, exponential,
  logarithm, and square root.
- Preserve derivative-domain conditions for quotients, negative powers,
  tangent, logarithm, and square root.
- Added indefinite integration through the isolated symbolic worker.
- Accept an antiderivative only after parsing it safely, differentiating it
  with project-owned rules, and checking equivalence with the integrand.
- Added a reusable loopback-only browser-harness server.
- Expanded the real-browser worker harness from four to six cases; derivative
  and indefinite-integral cases both passed with no console errors.

Node tests and source validation pass. Definite integrals, piecewise domain
splits, extrema, tangent lines, areas, and volumes remain unsupported.

## 2026-07-30: typed teaching traces

- Preserve structured input, strategy, rule, transformation, result, and
  verification steps through the common result adapter.
- Use the trace in hints, working, and explanations while retaining legacy
  string-step compatibility.
- Exclude result/conclusion steps and answer-bearing text from both hint
  levels.
- Save only locally verified structured traces; imported or unverified claims
  cannot retain trusted trace metadata.

Node tests and source validation pass. Older solvers still receive a compatible
default transformation type until their domain-specific traces are enriched.
