# Non-AI Math Engine Progress

Last updated: 2026-08-15

## Repository checkpoint

- Physical path: `C:\Users\kukuk\OneDrive\ドキュメント\GitHub\math-study-log-ai`
- Branch: `feat/non-ai-math-engine`
- Starting commit: `ef80cda Build initial Math Study Log AI prototype`
- Working milestone: 6 - Mathematics III

## Completed

- Confirmed repository identity, branch, remote, clean starting state, and
  original specification.
- Confirmed the revised product boundary:
  - no local or cloud AI;
  - junior-high mathematics through Mathematics III;
  - no image recognition;
  - no diagram-based geometry;
  - no proof generation.
- Audited deterministic CAS candidates.
- Selected Algebrite as the provisional adapter backend because it is
  browser-local, MIT licensed, supports symbolic algebra and calculus, and its
  browser bundle does not contain `new Function` or direct JavaScript `eval`.
- Added durable project rules, milestones, design decisions, and a restart
  procedure.
- Committed the durable planning checkpoint as
  `2b6d2ea Document non-AI engine migration plan`.
- Removed all active model runtime paths:
  - model client, prompts, response parser, and fixed demo;
  - model URL, model name, timeout, demo, and unverified-answer settings;
  - local-server host permissions and all network-dependent branches.
- Added deterministic presentation for answer, hint 1, hint 2, working, and
  explanation modes. Hint tests ensure the final answer is not revealed.
- Removed the geometry page, editor, styles, coordinate solver, triangle solver,
  and geometry-draft API.
- Preserved legacy history source and verification values so old records remain
  readable. Obsolete stored settings are ignored and the old geometry storage
  key is still removed by full-data deletion.
- Renamed the visible product from Math Study Log AI to Math Study Log and
  rewrote active documentation for the revised scope.
- Vendored the audited Algebrite 1.4.0 browser bundle and MIT license.
  - Original SHA-256:
    `4C5D57E3263883D6B0F32A406D158695F4F8267E89CA2CDACED160F8C4F3B275`
  - Vendored SHA-256:
    `D51C5DBE412DF49E6EDA0376D81FB4C09DAF7B4D7EFC69AE693ED5876F2FF67E`
  - The static check verifies the vendored hash and continues to reject
    dynamic-code APIs.
- Added a project-owned symbolic adapter with a strict character, identifier,
  function, variable, input-size, output-size, and syntax boundary.
- Added contract tests for simplification, equivalence, polynomial roots,
  differentiation, integration, unsafe input, and malformed syntax.
- Added shared notation normalization for full-width input, Unicode operators,
  superscript exponents, square roots, pi, and common LaTeX operator spellings.
- Added a bounded tokenizer and recursive-descent expression parser with:
  - immutable AST nodes;
  - implicit multiplication;
  - right-associative powers and conventional unary-minus precedence;
  - allow-listed symbols and unary functions;
  - node-count and nesting-depth limits;
  - safe serialization for the symbolic adapter.
- Added the project-owned result contract for exact, approximate, conditional,
  unsupported, and invalid states.
- Migrated all four existing solver result factories through the new contract
  while retaining the current popup/history-compatible shape.
- Added a module Web Worker boundary for all symbolic operations. Each request:
  - uses an allow-listed operation;
  - runs in a fresh worker;
  - has a clamped deadline;
  - terminates the worker on success, failure, or timeout;
  - returns a typed error instead of blocking indefinitely.
- Direct symbolic-adapter imports are limited to the worker and its contract
  test. Unpacked-Chrome verification of module-worker loading remains pending.
- Replaced the older polynomial solver tokenizer/parser with the shared AST.
  Linear and quadratic solvers now consume the same precedence, implicit
  multiplication, symbol allow-list, and complexity limits as future domains.
- Added the first new shared-core domain: verified algebraic expansion,
  factorization, and simplification.
- Rational-expression simplification now preserves nonzero restrictions from
  original denominators and negative powers. Conditional results retain those
  restrictions in both the displayed answer and the history record.
- Added bounded exact-rational arithmetic and a shared two-variable linear
  expression reducer.
- Added two-variable linear-system solving for integer, finite-decimal, and
  fractional coefficients. Unique answers are substituted exactly into both
  original equations; inconsistent, dependent, and identity systems are kept
  distinct.
- Added one-variable linear inequalities with exact fractional boundaries,
  explicit negative-coefficient reversal, and all-real/empty constant cases.
  Chained and higher-degree input is rejected without partial solving.
- Added project-owned differentiation rules for arithmetic composition,
  bounded integer powers, trigonometric functions, exponential, logarithm,
  and square root. Symbolic work only simplifies and checks the rule-built
  result.
- Added indefinite integration with reverse verification: every candidate is
  safely parsed, differentiated by project-owned rules, and compared with the
  original integrand. Candidates with unresolved domain splits are rejected.
- Preserved typed solution traces (`input`, `strategy`, `rule`,
  `transformation`, `result`, and related states) through presentation and
  history storage. Hint modes structurally exclude conclusion rows and any row
  containing the final answer.
- Added a generated 1,000-case regression corpus: 250 linear equations, 250
  linear inequalities, 250 nonsingular two-variable systems, 150 binary base
  conversions, and 100 malformed/unsupported/safety cases. This establishes
  the quantity baseline; new curriculum domains still need their own balanced
  corpus sections.
- Added a validated real-set/interval-union contract and exact quadratic
  inequalities. All discriminant and leading-sign branches preserve open or
  closed rational/radical endpoints through UI and history.
- Fixed inequality parsing to require the entire normalized input. Inputs such
  as `sin x<2`, `y+x<2`, assignments, trailing text, and ambiguous `x2` can no
  longer be partially solved as a different inequality.
- Replaced the floating-point quadratic-equation path with the same exact
  quadratic core used by inequalities:
  - finite decimals and fractions are reduced to a primitive integer ratio;
  - the discriminant and perfect-square decision use BigInt;
  - rational roots remain reduced fractions and irrational roots remain exact
    radicals;
  - every reported root is substituted symbolically, with both rational and
    radical parts required to be exactly zero;
  - numerical approximations are retained only as separately labeled display
    data.
- Fixed false verified answers caused by tolerance-based zero tests, including
  near-zero discriminants, tiny leading coefficients, catastrophic
  cancellation, and display rounding to a different value.
- Added whole-input quadratic-equation parsing and blocked ambiguous `x2`
  notation across both quadratic and legacy linear equation paths.
- Expanded the generated corpus with 250 quadratic equations and 250 quadratic
  inequalities.
- Migrated the remaining one-variable linear-equation solver from floating
  arithmetic and tolerance checks to exact rational coefficients and exact
  substitution. Tiny nonzero coefficients and constants can no longer be
  erased by an epsilon.
- Added bounded exact rational-function reduction with separate numerator,
  denominator, and original-domain-factor ledgers.
- Added one-variable rational equations whose cleared equation and every
  denominator factor reduce to degree two or below:
  - preserve holes after cancellation, multiplication by zero, nested
    division, and negative powers;
  - filter rational and radical candidates by exact substitution into every
    original denominator;
  - preserve real exclusion values as conditional result data through history;
  - reject ambiguous slash-plus-implicit-multiplication notation.
- Fixed identically-zero bases raised to the zeroth power from being accepted
  as verified identities.
- Added 250 generated rational-equation cases, bringing the generated corpus
  to 1,750 cases total.
- Added `分数方程式` as a first-class category. Existing locally verified
  rational-equation records are normalized into that category when read, while
  imported verification claims remain untrusted and are not promoted.
- Restored exact third- and fourth-degree intermediate cancellation, including
  `x^3-x^3+x=1`, while final cubic/quartic equations remain unsupported.
- Added bounded exact exponential equations:
  - positive rational bases other than one;
  - affine rational exponents;
  - exact prime-exponent-vector comparison and candidate substitution;
  - identities, constant contradictions, fractional bases, and dependent
    integer bases;
  - safe refusal when the exact answer requires a logarithm ratio.
- Added 250 generated exponential-equation cases, bringing the generated
  corpus to 2,000 cases total.
- Added bounded exact logarithmic equations:
  - explicit integer bases through `10^12` with ASCII or Unicode-subscript
    notation, plus natural-logarithm `log`/`ln` aliases;
  - rational linear combinations of same-base logarithms;
  - quadratic-or-lower polynomial arguments and candidate equations;
  - a separate strict-positive ledger for every original argument, retained
    after cancellation and multiplication by zero;
  - exact rational and quadratic-radical candidate substitution, including
    `A+B√r` sign decisions without decimal evidence;
  - exact intersections between one quadratic positive region and any number
    of rational linear bounds for logarithmic identities.
- Blocked subscript/digit concatenation, identifier substring matches, suffix
  implicit multiplication, mixed bases, degree overflows, and unrelated solver
  fallthrough from becoming verified logarithm answers.
- Prioritized explicit calculus instructions in the asynchronous router so
  assignment-form derivatives such as `f(x)=log(x)を微分せよ` are not captured
  by the equation path.
- Added 250 generated logarithmic-equation cases, bringing the generated
  corpus to 2,250 cases total.
- Added exact one-variable rational inequalities for all four order relations:
  - keep every original real pole as an open endpoint and conditional history
    value after cancellation, zero multiplication, zero powers, negative
    powers, and nested division;
  - order rational points and quadratic-radical roots from unrelated defining
    polynomials with BigInt algebra rather than decimal approximations;
  - place an exact rational sample in every critical-point interval and check
    the original left-minus-right sign without multiplying by an unknown-sign
    denominator;
  - preserve recognized unsupported reasons for cleared numerators above
    degree two and reject ambiguous slash-plus-implicit-multiplication input.
- Fixed the shared inequality parser so `1/2x<1`, `1/x(x+1)>0`, and spaced
  `x 2<4` cannot become partially verified, and fixed `<=` / `>=` from being
  recognized as standalone equation equalities.
- Added 250 generated rational-inequality cases, bringing the generated corpus
  to 2,500 cases total. Added a separate 240-case exact-substitution audit and
  cross-field quadratic-root ordering tests.
- Added exact finite definite integrals for rational-coefficient polynomials:
  - parse integral notation and both common Japanese bound-order forms by full
    input match;
  - accept signed integer, finite-decimal, and explicit-fraction bounds;
  - integrate polynomials through degree 32 coefficient by coefficient and
    evaluate `F(upper)-F(lower)` entirely with BigInt fractions;
  - preserve reversed-bound signs and require a domain-safe polynomial
    certificate before returning zero for equal bounds;
  - reject variable denominators, negative variable powers, zero-power holes,
    functions, non-rational or infinite bounds, and improper integrals.
- Blocked incomplete or subscript-style bound notation from falling through to
  the indefinite-integral path as a false verified `0+C`; a 1,200-case parser
  mutation audit found the missing-underscore variant and passed after repair.
- Rejected ambiguous integral expressions such as `1/2x`, `x/2x`, `x2`, and
  adjacent numeric literals unless their multiplication and division scope is
  explicit.
- Added 250 generated definite-integral cases with an independent BigInt
  expectation formula, bringing the generated corpus to 2,750 cases total.
  A separate independent audit matched 6,500 randomized valid integrals and
  found zero false verification across 1,800 unsupported/domain mutations.
- Extended exact finite definite integrals to
  `P(x)+Σq*exp(ax+b)` over rational bounds:
  - accept rational `q`, `a`, and `b`, constant exponentials, and the
    `e^(ax+b)` alias;
  - construct every primitive coefficient and endpoint exponent with BigInt
    fractions and combine equal formal `exp(rational)` atoms exactly;
  - keep nonlinear exponents, exponential products, variable denominators,
    non-rational bounds, and improper integrals unsupported;
  - limit the input to 32 syntactic exponential terms before cancellation.
- Required explicit parentheses for `exp`, `sin`, and `cos` in definite
  integrals and blocked suffix digits, missing-bound markers, and ambiguous
  implicit multiplication from reaching a solver.
- Fixed the newly exposed `1e2` / `1e-2` / `2.5E3` false-verification boundary
  by rejecting scientific-notation-like concatenation instead of interpreting
  `e` as Euler's constant.
- Added 250 independently generated affine-exponential definite integrals,
  bringing the generated corpus to 3,000 unique cases. An independent audit
  matched 7,000 randomized valid integrals and found no false verification in
  3,400 unsupported or invalid mutations. A separate adversarial parser review
  found the scientific-notation boundary, whose targeted regressions pass
  after repair.
- Extended the same exact all-real definite-integral path to finite sums of
  affine `sin(ax+b)` and `cos(ax+b)` terms with rational coefficients and
  rational bounds:
  - construct primitive coefficients with BigInt fractions and branch on zero
    slope before division;
  - merge polynomial, `exp`, `sin`, and `cos` endpoint contributions in one
    typed formal-atom map;
  - normalize only `sin(-r)=-sin(r)`, `cos(-r)=cos(r)`, `sin(0)=0`, and
    `cos(0)=1`, with all angles interpreted as rational radians;
  - validate every subtree before zero multiplication, cancellation, or equal
    bounds may yield an exact zero;
  - reject nonlinear arguments, function products/powers/denominators, `tan`,
    inverse trigonometric functions, `pi`/degree angles, and improper cases.
- Added 250 independently generated mixed polynomial/exp/sin/cos integrals,
  bringing the corpus to 3,250 unique cases, including negative and zero
  slopes, fraction bounds, reversed/equal intervals, and cross-source atom
  cancellation.
- An adversarial review exercised 49 dangerous forms through both direct and
  asynchronous routes, including 32/33-term limits and zero-short-circuit
  attempts, with no false verification.
- An independent formal-atom audit matched 7,200 randomized valid integrals
  and found no false verification across 4,200 unsupported or invalid
  mutations. It exposed an initially over-strict combined sin/cos term limit;
  after changing the policy to 32 `sin` terms and 32 `cos` terms separately,
  five focused boundary cases and another 1,200 randomized integrals all
  matched the independent BigInt oracle. A compact 32-exp + 32-sin + 32-cos
  input also remained exact.
- Added an immutable `Q+Q*pi` exact-angle type and a separately certified
  pure-`q*pi` bound path without converting `pi` to a JavaScript number.
- Added exact definite integrals for finite sums of `q*sin(ax+b*pi)` and
  `r*cos(cx+d*pi)` when both bounds are rational multiples of `pi`, all outer
  coefficients and slopes are rational, and each function family has at most
  32 source terms.
- Reduced period, quadrant, parity, and supplementary-angle identities with
  BigInt fractions. Multiples of 15 degrees use the exact flat basis `1`,
  `√2`, `√3`, and `√6`; nonstandard angles remain typed formal atoms.
- Kept polynomial/exp terms, mixed rational/`pi` bounds, nonzero rational phase
  shifts, and `pi`-valued slopes unsupported on this route, with no partial
  verification after zero scaling, cancellation, or equal bounds.
- Added 250 independently generated `pi`-bound trigonometric integrals with a
  test-side BigInt angle/radical/formal-atom oracle, bringing the generated
  evaluation corpus to 3,500 unique cases.
- An independent adversarial audit exercised 6,212 inputs and 10,724
  direct/asynchronous or separate-oracle comparisons, including every
  15-degree quadrant, nonstandard formal angles, accepted spellings, 32/33-term
  limits, and zero/cancellation masking. It found one classification defect:
  `pi/2x` was initially reported as unsupported instead of invalid. Moving the
  ambiguity check ahead of AST parsing fixed it; the focused 23-case rerun and
  the completed audit found no remaining P0-P2 issue or false verification.
- Added a separate rational-bound exact-angle route for finite sums of
  `q*sin(a*pi*x+b*pi)` and `r*cos(c*pi*x+d*pi)`. Nonzero slopes use an exact
  flat `1/pi` basis; zero slopes are handled first as constant functions.
- Extended the existing period/quadrant, 15-degree radical, and nonstandard
  formal-atom normalization without using `Math.PI`, floating point, CAS, or
  numerical integration. Ordinary-radian slopes, polynomial/exp terms, and
  pure-`pi` bounds are not mixed into this route.
- Added persistent structural `xBearing` and `piBearing` ledgers so `x*x`,
  `pi*pi`, forbidden denominators, zero scaling, cancellation, and equal bounds
  cannot hide unsupported phase subtrees.
- Added 250 independent BigInt-oracle cases, bringing the generated evaluation
  corpus to 3,750 unique problems. Direct core, parser, routing, display,
  history, masking, and 32/33-term regressions cover the public path.
- Independently audited 220 inputs over 440 direct/asynchronous routes, 3,500
  sign/value comparisons, 30,000 phase fuzz cases, and 1,800 old-formatter
  compatibility cases. The audit found spaced `pi 2*x`/`pi .5*x` ambiguity;
  after the source guard was fixed, no P0-P2 issue or false verification
  remained.
- Added a finite rational-point limit parser for `lim_(x->a) f(x)`, LaTeX and
  Unicode variants, loose `lim x->a f(x)`, and explicit Japanese approach
  forms. Signed integers, finite decimals, fractions, left/right markers, and
  matching Japanese direction suffixes are normalized without guessing
  scientific notation, numeric whitespace, or ambiguous division scope.
- Added a dedicated rational-function profile with integer exponents from -4
  through 4 and degree-four intermediate polynomials for limits, without
  widening the existing equation or inequality profiles. Exact synthetic
  division computes numerator and denominator zero orders, then the residual
  sign and pole parity determine finite values, signed infinity, or a verified
  left/right mismatch.
- Preserved every original denominator factor through cancellation, nested
  division, zero multiplication, and zero powers. The typed core records
  excluded factors, target definition, removable holes, and the certified
  punctured neighborhood; the solution trace exposes that ledger without
  turning a hole into a final-answer condition.
- Hardened the public core boundary to reject noncanonical or degree-overflow
  polynomials, more than ten source domain factors, and a zero domain factor
  for which no punctured neighborhood exists. Coefficients, approach points,
  and domain ledgers are copied into immutable base-type snapshots; sparse
  arrays, invalid flags, and mutable direction-list injection are rejected.
  Unsupported subtrees such as `0*sin(x)` or `(x^5)^0` are fully validated
  before any zero shortcut.
- Added direct core, parser, classifier, synchronous/asynchronous routing,
  five-mode display, history, masking, profile-isolation, and malformed-input
  regressions. A separate BigInt oracle covers 250 zero-order cases, and 250
  more independently generated limit problems bring the versioned evaluation
  corpus to 4,000 unique cases.
- Independently audited 8,332 mathematical executions, including 8,000
  comparisons against a separate BigInt-rational oracle; 14 adversarial and
  1,140 normal public-API cases; and 130,276 generated and mutated parser
  cases. The final audits
  found zero mismatches, false verifications, or synchronous/asynchronous
  routing differences, with no remaining P0-P2 issue.
- Added the `offscreen`/`WORKERS` bridge so keyboard-shortcut requests from the
  extension service worker retain the same fresh-worker deadline.
- Switched popup and shortcut routing to the shared asynchronous solver entry
  point while keeping the original synchronous solver export for compatibility.
- Added and ran a real-browser worker harness on 2026-07-30:
  - `2x+3=11`;
  - expansion of `(x+1)(x-1)`;
  - factorization of `x^2-1`;
  - simplification of `(x+1)^2-(x^2+2x)`.
  - differentiation of `x^3-2x`;
  - indefinite integration of `x^2`.
  All six passed through the real module-worker and symbolic bundle, with no
  browser console warnings or errors.
- The available browser surface cannot load unpacked Chrome extensions, so the
  manifest, popup-as-extension, service-worker shortcut, and offscreen-document
  integration remain explicitly unverified in real Chrome.
- Recorded the clean starting behavior:
  - `npm test`: 44 passed, 0 failed.
  - `npm run check`: passed for 68 files, 9 HTML files, 31 JS/MJS files, and
    12 CSS files.

## In progress

- Continue Mathematics III coverage while keeping unpacked-Chrome verification
  as a release blocker.

## Next

1. Add exact polynomial area applications with explicit intersection and sign
   partitions; do not infer regions from a missing diagram.
2. Add exact volumes of revolution only after the interval/domain and
   nonnegative-radius rules are explicit.
3. Verify module-worker and offscreen loading in unpacked Chrome before
   changing D-004 from provisional to accepted.

## Last verified commands

- `npm test` - 314 passed, 0 failed on 2026-08-15, including 4,000 generated
  evaluation cases.
- `npm run check` - passed for 143 files, 10 HTML, 105 JS/MJS, and 11 CSS files
  on 2026-08-15.

## Restart procedure

1. Run `git rev-parse --show-toplevel` and confirm the physical path above.
2. Run `git branch --show-current`, `git log -1 --oneline`, and
   `git status --short`.
3. Read `PLAN.md`, `PROGRESS.md`, and `docs/decision-log.md`.
4. Run `npm test` and `npm run check`.
5. Inspect any uncommitted diff before editing.
6. Continue with the first item under **Next**.
7. After a verified checkpoint, update this file before committing.
