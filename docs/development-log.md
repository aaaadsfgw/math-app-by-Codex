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

## 2026-08-05: bounded exact logarithmic equations

- Added explicit integer-base syntax `log_2(x)` and Unicode-subscript syntax
  `log₂(x)` while protecting subscripts before NFKC normalization.
- Treat bare `log` and `ln` consistently as natural logarithms.
- Reduce rational linear combinations of same-base logarithms to bounded exact
  polynomial products, with quadratic-or-lower arguments and final equations.
- Preserve every original positive-argument condition independently through
  cancellation and zero multiplication.
- Check rational and quadratic-radical candidates with exact polynomial
  substitution and exact `A+B√r` sign comparison.
- Reject ambiguous suffix multiplication, nested logarithms, mixed bases,
  rational-function arguments, unsafe text, and degree-limit overflows without
  falling through to an unrelated equation solver.
- Fixed Unicode base concatenation such as `log₂8(x)` from changing into a
  different verified base, and kept ordinary identifiers such as `catalog` and
  `login` outside logarithm recognition.
- Prioritize explicit differentiation and integration instructions before
  synchronous equation solvers, so `f(x)=log(x)を微分せよ` reaches the verified
  calculus path.
- Added 250 generated logarithmic-equation cases, bringing the generated
  baseline to 2,250.

Node tests and source validation pass. Logarithmic inequalities, variable or
fractional bases, nested logarithms, mixed-base transformations, cubic-root
answers, and higher-degree product equations remain unsupported.

## 2026-08-11: exact rational inequalities

- Added one-variable rational inequalities for `<`, `<=`, `>`, and `>=` when
  the cleared numerator and every original denominator factor have degree at
  most two.
- Preserved all real poles as conditional history data and open solution-set
  endpoints after cancellation, multiplication by zero, zero powers, negative
  powers, and nested division.
- Added a shared exact-real-point layer that orders rational endpoints and
  roots from different quadratic equations without using `Number` as proof.
- Constructed exact rational samples between adjacent algebraic critical
  points and verified the sign of the original left-minus-right rational
  expression on every interval with BigInt arithmetic.
- Rejected chained inequalities, ambiguous division followed by implicit
  multiplication, unsafe text, functions, extra variables, and cleared
  numerators above degree two without solver fallthrough.
- Fixed `<=` and `>=` from being mistaken for standalone equation equality,
  and added `分数不等式` / `有理不等式` instruction wrappers.
- Added 250 generated rational-inequality cases, bringing the generated
  evaluation corpus to 2,500, plus 240 independently substituted sign-chart
  cases and cross-field radical-ordering audits.

Node tests and source validation pass. Cubic-or-higher cleared numerators,
parameterized coefficients, functions, and chained or simultaneous
inequalities remain unsupported.

## 2026-08-11: exact polynomial definite integrals

- Added full-input parsing for `∫_a^b f(x) dx` and the two common Japanese
  bound-order forms, with signed integer, finite-decimal, and explicit-fraction
  bounds.
- Added a project-owned degree-32 polynomial integrator that constructs every
  antiderivative coefficient and evaluates both bounds using exact BigInt
  fractions, including reversed and equal bounds.
- Reject variable denominators, negative variable powers, zero powers that can
  erase holes, functions, mathematical constants, variable or non-rational
  bounds, infinite bounds, and improper integrals without CAS fallback.
- Block incomplete lower/upper notation and Unicode subscript variants from
  falling through to the indefinite-integral path as a false verified `0+C`.
- Reused the shared ambiguity guards so `1/2x`, `x/2x`, `x2`, and numbers
  separated only by whitespace cannot acquire one guessed multiplication or
  division scope inside an integral.
- Integrated the exact result into asynchronous routing, five output modes,
  verified history classification, and the examples page.
- Added 250 generated definite-integral cases with an independent BigInt
  expectation formula, bringing the evaluation corpus to 2,750 cases.
- Independently cross-checked 6,500 valid randomized integrals and 1,800
  domain/unsupported mutations; no answer mismatch or false verification was
  found after the parser regression fix.

Node tests and source validation pass. Transcendental integrands, variable
denominators, algebraic or variable bounds, and improper integrals remain the
next continuity-aware extension rather than being inferred from endpoint
substitution alone.

## 2026-08-11: exact affine-exponential definite integrals

- Extended the exact finite definite-integral path from polynomials to
  `P(x)+Σq*exp(ax+b)` with rational coefficients, affine rational exponents,
  rational bounds, and at most 32 syntactic exponential terms.
- Constructed primitive coefficients and endpoint exponents using exact BigInt
  fractions, then combined equal `exp(rational)` atoms without CAS integration,
  numerical quadrature, or floating-point verification.
- Added `e^(ax+b)` as an alias, including constant exponentials and `a=0`,
  while rejecting nonlinear arguments, exponential products, variable
  denominators, and all improper or non-rational-bound cases.
- Required parentheses for `exp`, `sin`, and `cos` in definite-integral input,
  rejected suffix digits and ambiguous division/multiplication, and quarantined
  scientific notation such as `1e2` after an adversarial review found it could
  otherwise be misread as multiplication by Euler's constant.
- Added direct core tests, solver/router/presentation/history tests, and 250
  independently generated exponential-integral cases, bringing the evaluation
  corpus to 3,000 unique cases.
- Independently audited 7,000 valid randomized integrals and 3,400 unsupported
  or invalid mutations, with no exact-answer mismatch or false verification
  inside that corpus. A separate adversarial parser review found the
  scientific-notation case; targeted regressions pass after its repair.

Node tests and source validation pass. Affine sine/cosine terms, exact special
angles, rational-function interval domains, non-rational bounds, and improper
integrals remain unsupported.

## 2026-08-11: exact affine sine/cosine definite integrals

- Extended the all-real exact path to rational-coefficient affine `sin` and
  `cos` terms alongside the existing polynomial and exponential families.
- Represented polynomial constants and `exp`, `sin`, and `cos` endpoint values
  in one typed BigInt-rational coefficient map, allowing endpoint-generated
  terms to cancel exact constant-function terms across source families.
- Normalized only the exact zero and odd/even identities. No periodic,
  special-angle, decimal, CAS, or numerical integration evidence is used.
- Handled zero slopes before division and preserved reversed/equal-bound
  behavior only after complete subtree validation.
- Rejected nonlinear arguments, function products and powers, variable or
  function denominators, `tan`, inverse trigonometric integrals, `pi`/degree
  angles, non-rational bounds, and improper integrals.
- Added direct core, routing, display, history, parser, zero-short-circuit, and
  32/33-term boundary regressions. An adversarial 49-form review found no false
  verification across direct and asynchronous routes.
- Added 250 independent formal-atom corpus cases, bringing the generated
  evaluation corpus to 3,250 unique problems.
- Independently cross-checked 7,200 randomized valid integrals and 4,200
  unsupported or invalid mutations. The audit exposed an over-strict combined
  sin/cos term limit; after applying separate 32-term limits, all five focused
  family-boundary cases, another 1,200 randomized integrals, and a compact
  32-exp + 32-sin + 32-cos case matched the independent BigInt oracle.

Node tests and source validation pass. Rational multiples of `pi`, special
angles, trigonometric products/powers, rational-function interval domains,
and improper integrals remain unsupported.

## 2026-08-11: exact rational-multiple-pi trigonometric bounds

- Added an immutable `Q+Q*pi` type with exact BigInt-rational operations and a
  pure-`q*pi` bound certificate. Nonlinear products, `pi` denominators, and
  higher `pi` powers are rejected before zero or cancellation can hide them.
- Added a dedicated definite-integral route whose two bounds are rational
  multiples of `pi` and whose complete integrand is an affine sin/cos finite
  sum with rational coefficients, rational slopes, and `b*pi` phase shifts.
- Reduced periods, quadrants, parity, and supplementary angles with exact
  rational arithmetic. The 15-degree table expands into `1`, `√2`, `√3`, and
  `√6`; nonstandard values such as `sin(pi/5)` remain formal exact atoms.
- Added a flat basis for rational, radical, `pi`, `pi*radical`, and formal
  trigonometric terms, keeping every stored coefficient rational and the
  positive-before-negative formatter deterministic.
- Kept polynomial/exp terms, mixed rational/`pi` bounds, nonzero rational phase
  shifts, `pi` slopes, products, powers, variable denominators, and unsupported
  functions outside this slice instead of partially solving them.
- Added parser, direct core, solver, router, display-mode, history, standard and
  nonstandard angle, reversed/equal-bound, zero-slope, cancellation, and
  malformed-input regressions.
- Added 250 independently generated `pi`-bound trigonometric cases with a
  separate BigInt rational, special-angle, radical-basis, and formal-atom
  oracle, bringing the generated evaluation corpus to 3,500 unique problems.
- Independently audited 6,212 inputs across 10,724 direct/asynchronous or
  separate-oracle comparisons. Coverage included all supported 15-degree
  quadrants and periods, nonstandard formal atoms, parser spellings, family
  limits, and masking attempts. The audit exposed one invalid/unsupported
  classification error for `pi/2x`; after checking ambiguity before AST
  parsing, all 23 focused regressions passed and no P0-P2 issue remained.

Node tests and source validation pass. `pi`-valued slopes (and the resulting
`1/pi` coefficient basis), mixed-bound elementary sums, finite textual limits,
rational-function interval domains, and improper integrals remain unsupported.
