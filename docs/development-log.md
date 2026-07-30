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

## 2026-07-30: generated evaluation baseline

- Added 250 parameterized linear-equation cases.
- Added 250 parameterized exact linear-inequality cases covering positive and
  negative coefficient directions.
- Added 250 nonsingular exact two-variable systems.
- Added 150 binary-to-decimal conversions.
- Added 100 malformed, unsupported, geometry, proof, nonlinear, chained, and
  unsafe cases that must never become verified answers.

All 1,000 generated cases pass. The corpus is intentionally algebra-heavy and
does not yet close the release evaluation milestone for calculus and the
remaining curriculum.

## 2026-07-30: exact quadratic inequalities

- Added a bounded exact quadratic-polynomial reducer over the shared AST.
- Added a validated real-set contract for empty, all-real, singleton, bounded,
  half-infinite, and disjoint interval unions.
- Added all 24 combinations of discriminant sign, leading-coefficient sign,
  and strict/inclusive inequality direction.
- Preserve rational and simplified radical roots as exact endpoints.
- Replaced partial inequality substring extraction with whole-input parsing;
  function, other-variable, assignment, trailing-text, and ambiguous `x2`
  inputs can no longer be reduced to a misleading linear tail.
- Persist verified solution sets and remove them when imported verification is
  downgraded.
- Added 250 generated quadratic-inequality cases, bringing the generated
  baseline to 1,250.

Node tests and source validation pass. Rational, chained, simultaneous, and
higher-degree inequalities remain unsupported.

## 2026-07-30: exact quadratic equations

- Extracted the quadratic discriminant, integer-ratio normalization, BigInt
  square-root test, radical formatting, root ordering, and algebraic
  substitution into a shared exact quadratic-root module.
- Migrated quadratic equations away from `Number`, epsilon-based degree and
  discriminant tests, floating residuals, and rounded final answers.
- Keep exact fractions or radicals in `exactAnswer`; optional decimal values
  are stored in `approximateAnswer` and shown as a labeled supplement.
- Added whole-input equation parsing and reject ambiguous `x2` notation before
  it can fall through to the linear solver.
- Added adversarial coverage for near-zero discriminants, tiny leading
  coefficients, large cancellation, unsimplified-input fractions, full-width
  Japanese notation, malformed input, and coefficient limits.
- Added 250 generated quadratic-equation cases, bringing the generated
  baseline to 1,500.

Node tests and source validation pass. Complex roots, parameterized
coefficients, and higher-degree equations remain unsupported.

## 2026-07-30: exact linear and rational equations

- Migrated one-variable linear equations to exact rational coefficients and
  exact substitution, removing the remaining epsilon-based equation path.
- Added a bounded rational-function reducer that keeps numerator, denominator,
  and every original domain factor separate.
- Added rational equations that clear to degree two or below and whose domain
  factors also have degree at most two.
- Preserve holes after cancellation, zero multiplication, nested division, and
  exponents -1 or -2. Rational and radical candidates are rejected whenever an
  original denominator evaluates to exactly zero.
- Reject ambiguous forms such as `1/x(x+1)` and `1/2x`; users must write
  `(1/x)*(x+1)`, `1/(x(x+1))`, `(1/2)*x`, or `1/(2x)`.
- Reject identically-zero bases raised to the zeroth power.
- Added 250 generated rational-equation cases, bringing the generated baseline
  to 1,750.

Node tests and source validation pass. Higher-degree rational equations,
rational inequalities, parameterized denominators, and function-valued
denominators remain unsupported.

## 2026-07-30: bounded exact exponential equations

- Added a separate `分数方程式` classification and normalized existing locally
  verified `rational-equation` history records at read time without changing
  the storage schema.
- Restored exact cancellation of third- and fourth-degree intermediate terms
  while keeping every final linear/quadratic degree gate unchanged.
- Added positive-rational-base exponential equations with affine exponents.
- Factor numerator and denominator into a bounded prime-exponent vector, solve
  only when one exact rational value makes every exponent difference zero, and
  verify that certificate again before returning an answer.
- Keep negative or zero variable bases, nonlinear exponents, exponential sums,
  and answers requiring a logarithm ratio safely unsupported.
- Added 250 generated exponential-equation cases, bringing the generated
  baseline to 2,000.

Node tests and source validation pass. Typed logarithm expressions, logarithmic
equations, and exponential substitutions remain unsupported.
