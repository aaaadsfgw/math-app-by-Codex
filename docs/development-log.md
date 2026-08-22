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

## 2026-08-11: exact pi-valued slopes over rational bounds

- Added a dedicated rational-bound evaluator for complete finite sums of
  `q*sin(a*pi*x+b*pi)` and `r*cos(c*pi*x+d*pi)`, with every coefficient
  rational and separate 32-term sine/cosine limits.
- Extended the exact flat trigonometric basis with `piPower=-1`. Nonzero
  slopes retain primitive coefficients such as `2/pi`, `√2/(2*pi)`, and
  `5*sin(pi/5)/pi`; zero slopes are evaluated first as constant functions with
  no division by `pi`.
- Reused the BigInt period/quadrant reducer, 15-degree `1`, `√2`, `√3`, `√6`
  table, and nonstandard formal atoms without using `Math.PI`, decimal
  trigonometry, CAS integration, or numerical quadrature.
- Added an affine `Q+Q*pi` phase analyzer with persistent `xBearing` and
  `piBearing` ledgers. Nonlinear `x*x` or `pi*pi` subtrees, forbidden
  denominators, zero scaling, cancellation, and equal bounds cannot hide an
  unsupported expression.
- Kept ordinary rational slopes, polynomial/exp terms, mixed phases, pure-pi
  bounds, products, powers, variable denominators, and unsupported functions
  outside this route instead of partially solving a supported subset.
- Rejected ambiguous `pi2*x`, `pi 2*x`, `pi.5*x`, and slash-plus-implicit-
  multiplication forms before AST evaluation while retaining explicit forms
  such as `(pi/2)*x` and `pi/2*x`.
- Added direct core, solver, parser, async routing, five-mode display, history,
  zero-masking, and 32/33-term regressions plus 250 independent BigInt-oracle
  cases, bringing the generated evaluation corpus to 3,750 unique problems.
- Independently audited 220 inputs across 440 direct/asynchronous executions,
  3,500 mathematical sign/value comparisons, 30,000 phase fuzz cases, and
  1,800 old-formatter compatibility cases. An intermediate audit found the
  spaced forms `pi 2*x` and `pi .5*x`; after expanding the ambiguity guard,
  no P0-P2 issue or false verification remained.

Node tests and source validation pass. Mixed elementary angle families, finite
textual limits, rational-function interval domains, and improper integrals
remain unsupported. The unpacked Chrome extension path still requires the
release smoke test.

## 2026-08-15: exact finite rational-point limits

- Added a full-input parser for finite limits in symbolic, LaTeX/Unicode,
  loose, and explicit Japanese approach forms, including left- and right-hand
  limits. Invalid syntax is checked before unsupported scope so malformed
  equations, conflicting directions, scientific notation, numeric whitespace,
  and ambiguous division never become a partially parsed answer.
- Refactored the exact rational-function converter behind profiles. The
  existing equation and inequality behavior keeps its previous exponent and
  domain-factor limits, while finite limits accept integer exponents from -4
  through 4 and source domain factors through degree four.
- Added an exact limit core that computes powers of `x-a` with BigInt-fraction
  synthetic division. Residual values, pole parity, and sign determine finite
  answers, `+∞`, `-∞`, or an exact verified two-sided mismatch without
  floating-point sampling, CAS limits, or epsilon tolerances.
- Retained every original denominator factor through cancellation, nested
  division, zero multiplication, and zero powers. Removable holes, excluded
  factors, and the certified punctured neighborhood are recorded in the typed
  result and solution trace.
- Hardened the exported low-level evaluator against zero domain factors,
  noncanonical or degree-overflow coefficient arrays, and excessive domain
  ledgers. It creates immutable base-type snapshots of coefficients, the
  approach point, and domain evidence; rejects sparse arrays and invalid flags;
  and does not trust a mutable public direction list. A zero domain factor is
  invalid because no punctured neighborhood exists, even when the simplified
  numerator and denominator are both one.
- Added parser, core, direct/async router, classifier, display-mode, history,
  zero-masking, public-API, and profile-isolation regressions. A production-
  independent BigInt oracle covers 250 zero-order/direction combinations, and
  250 generated public-path cases bring the evaluation corpus to 4,000 unique
  problems.
- Final independent audits covered 8,332 mathematical executions with
  8,000 separate BigInt-rational oracle comparisons, 14 adversarial and 1,140
  normal public-API cases, and 130,276 generated and mutated parser cases. They
  found no
  mismatch, false verification, sync/async routing difference, or remaining
  P0-P2 issue.

`npm test` passes 314 tests, and `npm run check` passes 143 files (10 HTML,
105 JS/MJS, and 11 CSS). Infinite-point, radical, absolute-value, piecewise,
trigonometric/exponential/logarithmic, sequence, and standard special limits
remain unsupported. The unpacked Chrome extension path still requires the
release smoke test.

## 2026-08-15: exact polynomial areas between curves

- Added full-input parsing for `area_[a,b](f;g)`,
  `area_intersections(f;g)`, and complete fixed Japanese forms. Explicit
  intervals require increasing finite rational bounds; the intersection form
  requires exactly two distinct real intersections. `x軸` is normalized to
  `y=0`, while diagrams, inferred regions, missing components, trailing
  answers, and ambiguous notation fail closed.
- Added an exact area core for two rational-coefficient source curves through
  degree four when their difference is quadratic or lower. Both complete
  source ASTs are certified before cancellation. Rational and quadratic-
  radical intersections are ordered without decimals, inserted into the
  partition, and checked with exact rational sample signs.
- Compute every piece as the nonnegative exact value of its own antiderivative
  difference and add the pieces in `Q` or one field `Q+Q√d`. This prevents the
  cancellation error from using `|∫(f-g)dx|` for a region where the upper curve
  changes. No floating-point roots, graph samples, CAS integrals, numerical
  quadrature, or tolerance comparisons participate in verification.
- Hardened the low-level boundary against sparse, noncanonical, aliased,
  subclassed, proxy-backed, and degree-overflow coefficient arrays. Returned
  curves, intersections, partition points, and piece evidence are copied to
  base-type snapshots and deeply frozen.
- Routed recognized area input before equation/category solvers in synchronous
  and asynchronous entry points. The router now preserves a complete invalid
  result even when input conversion throws `null`, a hostile accessor, or
  another nonstandard value. Presentation, hint answer-leak prevention,
  integral history classification, storage JSON, and exported output-mode
  immutability are covered by regressions.
- Adversarial parser review found cases where NFKC, superscript sequences, and
  `\\left`/`\\right` removal could turn one source string into another formula.
  The area boundary now preserves supported superscript meaning, rejects
  ambiguous sequence and token boundaries, rejects unsupported compatibility
  folds and destructive delimiters before normalization, and retains area
  recognition for overlong head/tail input without passing it to another
  solver.
- Added 29 area parser/core/solver tests and one shared presenter regression.
  The generated evaluation corpus gained 250 public-path area problems with an
  independent BigInt rational integral oracle, increasing the total from 4,000
  to 4,250 unique problems.
- Independent mathematical review executed 9,600 core cases with 215,640
  BigInt/`Q+Q√d` comparisons; public-API review executed another 62,536 oracle
  cases; and 4,551 false-exact boundary calls produced no mismatch or false
  verification. The audits cover rational/irrational and endpoint roots,
  zero/one/two interior intersections, curve swaps, common quartic terms,
  partition completeness, piece signs, exact formatting, mutation isolation,
  exception containment, and synchronous/asynchronous parity. A final
  63-case parser rerun and an additional 30,000 integer-intersection oracle
  corpus had no anomaly or mismatch; the final read-only reviews found no
  remaining P0-P2 issue.

`npm test` passes 344 tests including the 4,250-case generated corpus, and
`npm run check` passes 149 files (10 HTML, 111 JS/MJS, and 11 CSS). Volumes of
revolution and other remaining Mathematics III applications are still pending.
The unpacked Chrome extension path still requires the release smoke test.

## 2026-08-15: exact polynomial volumes of revolution

- Added a full-input parser for `volume_x_axis_[a,b](R)` and
  `volume_x_axis_[a,b](R;r)`, the documented aliases, and complete fixed
  Japanese x-axis-rotation forms. The disk form uses inner radius zero; the
  washer form declares outer radius first and inner radius second. Bounds are
  explicit increasing rational numbers. Other axes, diagrams, trailing
  answers, ambiguous notation, and unsafe Unicode normalization are rejected.
- Added a dedicated exact volume core for rational-coefficient radii of degree
  at most two. Endpoint values and any relevant upward-quadratic vertex certify
  `r>=0`, `R-r>=0`, and `R>=0` on the entire closed interval before the core
  constructs `R²-r²`. Direct coefficient convolution and BigInt-fraction
  integration produce a typed exact rational multiple of `pi`; no signed curve
  is silently converted to a geometric radius.
- Routed recognized volume inputs before the area and category solvers in both
  synchronous and asynchronous paths. Added volume-specific hints, teaching
  trace, integral history classification, JSON round-trip coverage, and
  non-stealing regressions for equations, ordinary integrals, area problems,
  and general solid-geometry questions.
- Added 24 parser/core/solver tests. The core suite includes a separate 300-case
  BigInt fraction oracle plus interval-additivity and radius-scale invariants.
  Another 250 independently generated public-path disk and washer problems use
  test-owned polynomial convolution and integration, increasing the versioned
  evaluation corpus from 4,250 to 4,500 unique problems.
- Independent mathematical audits compared 8,232 exact interval-minimum
  certificates, 62,500 disk/washer calculations and `pi` strings, and 15,625
  public solver executions against separate BigInt implementations without a
  mismatch, false acceptance, or false rejection. Public-boundary review also
  confirmed immutable snapshots, sparse/noncanonical rejection, and exception
  containment.
- Adversarial routing review found one changing-coercion defect: a non-string
  object could return a different problem each time a solver converted it to
  text. The public synchronous and asynchronous entry points now convert once
  and route only the fixed snapshot. The focused regression and final 36-case
  Unicode/length/axis/non-stealing audit found no false verification or
  remaining P0-P2 issue.
- The initial path deliberately leaves signed/cross-axis curves, changing
  inner/outer order, intersection-derived bounds, y-axis or arbitrary-axis
  rotation, shells, functions, and higher-degree radii unsupported. General
  signed two-curve rotation would require exact partitions over several
  unrelated quadratic fields and is not approximated.

`npm test` passes 369 tests including the 4,500-case generated corpus, and
`npm run check` passes 155 files (10 HTML, 117 JS/MJS, and 11 CSS). The
unpacked Chrome extension path still requires the release smoke test.

## 2026-08-15: exact rational-function limits at signed infinity

- Extended the existing full-input limit grammar from finite rational points
  to separately typed positive and negative infinity. Unicode, ASCII, LaTeX,
  full-width, and explicit Japanese forms normalize to one of two approach
  kinds. Combined `±∞`, composite infinity expressions, and finite one-sided
  suffixes attached to infinity are invalid rather than interpreted loosely;
  invalid expression syntax still takes precedence over approach support.
- Reused the finite-limit rational-function profile instead of creating a
  competing parser or widening other algebra solvers. The new core branch
  computes both signed tails from exact numerator/denominator degrees, leading
  coefficients, and degree-difference parity. A zero numerator is used only
  after the complete AST and original domain ledger have been certified.
- Added exact tail-domain evidence for the reduced denominator and every
  retained original denominator factor. Each nonzero polynomial stores the
  rational Cauchy root bound `1+Σ|a_i/a_n|`; the maximum proves all factors are
  nonzero sufficiently far along either signed tail. Finite holes therefore do
  not change the infinity result, but remain visible in the trace.
- Preserved the `finite-limit` solver ID for existing history records and added
  infinity-specific metadata, five display modes, answer-safe hints, history
  round trips, synchronous/asynchronous parity, exception containment, and
  category non-stealing regressions.
- Added 14 focused parser/core/router/presenter tests. A separate BigInt oracle
  checks 300 core cases. Another 250 test-owned public-path cases cover every numerator
  and denominator degree pair from zero through four, both signed infinities,
  both leading-ratio signs, fractional ratios, and all degree differences,
  increasing the generated evaluation corpus from 4,500 to 4,750 unique
  problems.
- A read-only adversarial parser/routing audit executed 662 cases: 32 hostile
  Unicode cases, 68 malformed composites, 168 direction combinations, 80
  invalid-precedence cases, 18 category non-stealing cases, 132 public routing
  parity cases, and 164 additional control/whitespace placements. It found no
  false verification, synchronous/asynchronous mismatch, or P0-P2 issue.
- A separate BigInt-rational mathematical audit made 20,022 public core calls,
  with 103,000 outcome comparisons, 100,000 degree/leading-ratio comparisons,
  112,000 Cauchy-bound comparisons, 24,000 exact tail inequalities, and 2,500
  known-root checks. Common-factor addition, lower-term replacement, `f(-x)`
  symmetry, zero numerators, deep freezing, and 21 hostile boundary classes all
  matched their independent expectations with no P0-P2 finding.
- A final public-path audit executed 683 scenarios and 1,331 solver calls, plus
  520 five-mode presentations over 52 problems. It exposed three P2 integration
  defects: a caller-supplied wrong category could let the inequality fallback
  intercept a recognized limit, and answer-string filtering could remove an
  infinity input row from hint 2 when the requested destination matched the
  answer. Final review also found that valid LaTeX whitespace between `+`/`-`
  and `\infty` was rejected. The router now preflights recognized limits before
  category solvers, the presenter always retains typed input rows while
  continuing to remove conclusion/result rows, and signed LaTeX infinity
  accepts separator whitespace without accepting mixed signs. Reaudits covered
  120 wrong-category sync/async calls, eight signed-infinity hint variants, and
  49 focused limit/presenter cases without a failure or answer leak.

`npm test` passes 383 tests including the 4,750-case generated corpus, and
`npm run check` passes 155 files (10 HTML, 117 JS/MJS, and 11 CSS). The
unpacked Chrome extension path still requires the release smoke test.
