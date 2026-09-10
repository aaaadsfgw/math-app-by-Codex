# Non-AI Math Engine Progress

Last updated: 2026-09-10

## Repository checkpoint

- Physical path: `C:\Users\kukuk\OneDrive\ドキュメント\工藤\math-study-log-ai-Codex`
- Branch: `feat/digicon-learning-workflow`
- Starting commit: `ef80cda Build initial Math Study Log AI prototype`
- Digicon workflow base: `52aa204 Add exact polynomial concavity analysis`
- Working milestone: problem acquisition, staged learning records, and analytics

## Completed

- Confirmed repository identity, branch, remote, clean starting state, and
  original specification.
- Confirmed the revised product boundary:
  - no local or cloud answer-generation AI;
  - junior-high mathematics through Mathematics III;
  - no image-derived answer generation; model-based acquisition is limited to a
    tightly cropped, machine-printed image containing exactly one formula and,
    optionally, one or two short Japanese problem-number/instruction lines
    above it, all transcribed into editable, explicitly confirmed, untrusted
    fields;
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
  test. Module-worker loading has passed in an isolated unpacked-Chrome profile;
  the reproducible browser evidence is recorded below.
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
- Added a strict full-input area parser for `area_[a,b](f;g)`,
  `area_intersections(f;g)`, and complete fixed Japanese forms, including the
  `x軸` alias. It requires both curves and either increasing rational bounds or
  an explicit two-intersection request; diagram-dependent regions, trailing
  answers, destructive LaTeX delimiters, and ambiguous Unicode normalization
  are rejected rather than reinterpreted.
- Added an exact polynomial-area core. Each source curve and every intermediate
  subtree is certified through degree four before subtraction; the difference
  must be quadratic or lower. All rational or quadratic-radical intersections
  are ordered exactly, the interval is partitioned at every one, and each
  nonnegative piece of `∫|f-g|dx` is accumulated in `Q` or `Q+Q√d` without
  floating-point roots, graph sampling, CAS integration, or quadrature.
- Routed recognized area inputs ahead of category solvers in both synchronous
  and asynchronous entry points, while preserving exact/invalid/unsupported
  result contracts and exception containment. Added area-specific hints,
  five-mode presentation, integral history classification, JSON round trips,
  immutable output-mode metadata, and answer-leak regressions.
- Added 29 area parser/core/solver tests plus one shared presenter regression.
  Another 250 independently generated public-path area cases cover rational
  coefficients, fractional bounds, curve swaps, common cubic/quartic terms,
  and intervals with zero through two interior intersections, bringing the
  versioned evaluation corpus to 4,250 unique cases.
- Independent area audits covered 9,600 exact core executions with 215,640
  BigInt/`Q+Q√d` oracle comparisons, 62,536 public-API oracle executions, and
  4,551 false-exact boundary calls without a mathematical mismatch or false
  verification. Adversarial input review exposed and closed Unicode
  superscript, compatibility-character, LaTeX-delimiter, overlong-routing, and
  hostile-thrown-value boundary cases. The final 63-case parser rerun kept
  synchronous/asynchronous parity, and the final read-only reviews found no
  remaining P0-P2 issue.
- Added a strict full-input x-axis volume parser for
  `volume_x_axis_[a,b](R)` and `volume_x_axis_[a,b](R;r)`, documented aliases,
  and complete fixed Japanese forms. It requires explicit increasing rational
  bounds and declared outer/inner radii; other axes, diagram-dependent regions,
  trailing answers, and ambiguous Unicode normalization are rejected.
- Added an exact disk/washer core for degree-two-or-lower rational polynomial
  radii. It certifies `r>=0`, `R-r>=0`, and `R>=0` over the complete interval
  from exact endpoint and relevant vertex values before constructing and
  integrating `R²-r²`. Results remain typed rational multiples of `pi` without
  floating point, graph sampling, CAS, or numerical quadrature.
- Routed recognized volume inputs before area/category solvers in synchronous
  and asynchronous paths, with volume-specific teaching traces, hints, history
  classification, storage round trips, exception containment, and non-stealing
  regressions.
- Added 24 volume parser/core/solver tests, including an independent 300-case
  BigInt core oracle and algebraic invariants. Added 250 independently generated
  public-path disk/washer cases with a test-owned convolution/integration
  oracle, bringing the generated evaluation corpus to 4,500 unique problems.
- Independent volume audits compared 8,232 interval-minimum certificates,
  62,500 exact disk/washer calculations and `pi` normal forms, and 15,625 full
  public solver executions against separate BigInt implementations with no
  mathematical mismatch or false verification. Adversarial routing review
  found that a non-string input could change its coercion result between
  solvers; the public entry point now snapshots the problem text exactly once.
  The final 36-case parser/routing audit had zero false verifications or
  synchronous/asynchronous differences, and all read-only reviews found no
  remaining P0-P2 issue.
- Extended the existing full-input limit parser to separately normalized
  positive and negative infinity while preserving every finite-point form.
  Exact `∞`, `+∞`, `-∞`, `infinity`, LaTeX, full-width, and explicitly
  signed Japanese forms are accepted; combined/composite infinity and attached
  finite one-sided directions are rejected without guessing.
- Added an exact infinity branch to the bounded rational-function limit core.
  It compares degrees and leading coefficients for both signed tails, preserves
  all original domain factors, and records a rational Cauchy root bound
  `1+Σ|a_i/a_n|` for each nonzero denominator polynomial. Their maximum
  certifies the function is defined on the requested sufficiently distant tail.
- Kept the existing `finite-limit` solver ID for history compatibility while
  adding infinity-specific teaching traces, hints, five-mode presentation,
  synchronous/asynchronous parity, exception containment, and non-stealing
  regressions.
- Added 14 limit parser/core/router/presenter tests, including an independent
  300-case BigInt infinity oracle. Added 250 public-path infinity problems
  covering all 25 numerator/denominator degree pairs, both tails, fractional
  leading ratios, and every degree difference from -4 through 4, bringing the
  generated evaluation corpus to 4,750 unique problems.
- The read-only infinity parser/routing audit executed 662 adversarial cases
  across hostile Unicode, malformed/composite destinations, direction suffixes,
  invalid-expression precedence, category non-stealing, and synchronous versus
  asynchronous routing without a failure or remaining P0-P2 issue.
- An independent BigInt-rational core audit made 20,022 public API calls and
  compared 103,000 outcomes, 100,000 degree/leading-ratio facts, 112,000 Cauchy
  bounds, and 24,000 exact tail inequalities. It also checked 2,500 known roots,
  common-factor/lower-term invariants, `f(-x)` tail symmetry, zero numerators,
  deep freezing, and hostile boundaries without a mismatch or P0-P2 finding.
- A final integration audit executed 683 scenarios and 1,331 public solver
  calls plus 520 five-mode presentations. It found and closed three P2 issues:
  an explicitly wrong category could intercept a recognized limit, and a hint
  could drop its input line when the destination infinity matched the answer;
  final review also found that valid LaTeX whitespace between a sign and
  `\infty` was rejected. Limit preflight now precedes category solvers, typed
  input rows remain visible without admitting result rows, and signed LaTeX
  infinity accepts separator whitespace without accepting mixed signs.
  Reaudits of 120 category/routing calls, eight signed-infinity hint cases, and
  49 focused limit/presenter cases passed with no answer leakage.
- Added strict canonical and fixed-Japanese parsing for polynomial tangent
  lines at an explicit rational x-coordinate or explicit rational point. A
  declared point must satisfy `f(a)=b` exactly; malformed or false-point input
  is invalid, while figure/graph and geometric tangent requests remain
  unsupported without inference.
- Added a project-owned exact tangent core for canonical dense
  rational-coefficient polynomials through degree four. It snapshots and
  revalidates inputs, computes `f(a)`, the formal coefficient derivative,
  `m=f'(a)`, and `c=f(a)-ma`, then deeply freezes evidence that independently
  rechecks both point passage and slope agreement.
- Routed tangent preflight before normal, variation, rational-function limits,
  and category solvers in both synchronous and asynchronous paths. The current
  application order is
  `volume -> area -> tangent -> normal -> variation -> rational-limit`. Added
  tangent-specific teaching
  traces and answer-safe hints, solver ID `polynomial-tangent`, `微分` history
  classification, storage round trips, exception containment, wrong-category
  priority, and non-stealing regressions.
- Added 31 tangent parser/core/solver/presenter/storage tests, including an
  independent 400-case BigInt fraction core oracle and hostile public-boundary
  coverage. Added 250 generated public-path tangent problems, 50 at each degree
  zero through four and spanning all five canonical/Japanese forms, bringing
  the versioned evaluation corpus to 5,000 unique problems.
- Kept functions, variable denominators and negative powers, degree five or
  above even when hidden by cancellation, non-rational coordinates, other
  variables, geometric tangents, and figure/graph-derived contact information
  unsupported. No numerical differentiation, graph sampling, or CAS proposal
  is accepted as tangent verification.
- Added strict full-input parsing for `monotonicity(f)`, `extrema(f)`, and
  `monotonicity_extrema(f)`, plus four complete Japanese instruction forms
  using either `関数 y=f` or `関数 f(x)=f` and an optional initial `次の`.
  Malformed, relation-valued, ambiguous-Unicode, and answer-attached inputs are
  invalid; well-formed requests outside the bounded profile remain recognized
  but unsupported without stealing ordinary derivative or equation problems.
- Added a project-owned exact polynomial-variation core for
  rational-coefficient polynomials through degree three on all real numbers.
  It snapshots and revalidates canonical dense coefficients, formally
  differentiates, solves the quadratic-or-lower derivative exactly, certifies
  the sign on every open cell, merges maximal monotonic intervals, evaluates
  every critical point exactly, and deeply freezes its evidence. Irrational
  roots and values stay in one exact quadratic field `Q+Q√d`.
- Represented a repeated derivative zero with no sign change as a stationary
  non-extremum, so `x^3` is increasing on all real numbers while `(0,0)` is not
  reported as an extremum. A constant polynomial is constant on all real
  numbers and has no isolated local extrema.
- Added variation preflight after normal and before rational-function limits
  in both synchronous and asynchronous paths. The current order is
  `volume -> area -> tangent -> normal -> variation -> rational-limit`. Verified results
  use solver ID `polynomial-variation` and history category `微分`; the typed
  presentation and both hints omit critical-point coordinates, completed
  intervals, and extrema until the answer-bearing modes.
- Added 33 variation parser/core/solver/public tests (11 parser, 10 core, and 12
  solver/public), including an independent 500-case BigInt fraction and
  quadratic-field core oracle. Added 250 generated public-path cases across
  degrees zero through three, all three canonical modes, all derivative-root
  kinds, Japanese forms, and exact radical values, bringing the versioned
  evaluation corpus to 5,250 unique problems.
- Kept degree four or above even when hidden by cancellation, interval-scoped
  requests, maximum/minimum, functions and variable denominators, concavity,
  inflection points, graph outlines, other variables, and figure/graph/table-
  derived information unsupported. No graph sampling, floating-point root,
  or CAS proposal is accepted as variation verification.
- Added strict full-input parsing for `normal_x_[a](f)`, its
  `normal_[a](f)` alias, `normal_point_(a,b)(f)`, and two complete fixed
  Japanese sentence forms. Every coordinate is a finite exact rational. A
  declared point must satisfy `f(a)=b` exactly; a false point or malformed or
  answer-attached input is invalid, while recognized out-of-profile normal
  requests remain unsupported.
- Added a project-owned exact normal-line core for canonical dense
  rational-coefficient polynomials whose complete source structure has degree
  at most four. It snapshots and revalidates inputs, evaluates `f(a)`, forms
  the exact derivative and `m=f'(a)`, then constructs the division-free
  implicit equation `x-a+m(y-b)=0`. Independent evidence verifies point
  membership, line passage, and that the tangent and normal directions have
  exact dot product zero.
- Represented the `m=0` case as a true vertical tagged-union line `x=a`, with
  no `Infinity`, `NaN`, divided-by-zero slope, or fabricated finite slope. Only
  the `m!=0` branch computes the normal slope `-1/m` and its exact intercept.
- Routed recognized normal requests before variation and rational-function
  limits in both synchronous and asynchronous paths, making the full preflight
  order `volume -> area -> tangent -> normal -> variation -> rational-limit`.
  Verified results use solver ID `polynomial-normal` and history category
  `微分`; typed teaching traces and both hint modes withhold the finished line,
  normal slope, and intercept.
- Added 34 normal parser/core/solver/public tests (8 exact-core, 10 parser,
  and 16 solver/public), including an independent
  500-case BigInt fraction core oracle, vertical and nonvertical cases, hostile
  public boundaries, wrong-category priority, presentation, storage, and
  non-stealing regressions. Added 250 generated public-path normal problems,
  50 at each degree zero through four and spanning all five canonical/Japanese
  forms, bringing the versioned evaluation corpus to 5,500 unique problems.
- Kept functions, variable denominators and negative powers, degree five or
  above even when hidden by cancellation, non-rational coordinates, other
  variables, circles and other implicit curves, parametric and polar curves,
  high-dimensional/geometric normals, and figure/graph-dependent requests
  unsupported. No numerical differentiation, sampled slope, graph inference,
  floating-point approximation, or CAS proposal is accepted as verification.
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
- The earlier browser-surface limitation was closed for this checkpoint: an
  isolated Chrome for Testing profile loaded the unpacked extension and the
  existing module-worker symbolic harness passed. The complete toolbar-driven
  capture/confirmation flow remains a separate interactive check.
- Recorded the clean starting behavior:
  - `npm test`: 44 passed, 0 failed.
  - `npm run check`: passed for 68 files, 9 HTML files, 31 JS/MJS files, and
    12 CSS files.

- Added the shared deterministic solve workflow and backward-compatible history
  schema version 2. Study records now retain learning mode, entry point, input
  source, staged output usage, OCR confirmation metadata, result kind,
  conditions, typed solution traces, and solution sets.
- Added a selection-first keyboard workflow with clipboard fallback through the
  offscreen document. Clipboard contents are replaced only after a verified
  presentation succeeds; unsupported, invalid, and failed requests preserve the
  original clipboard. Quick Mode never writes history.
- Re-evaluated the gated local OCR foundation and selected
  `dbcccc/IBEM-im2typst` revision
  `a7ced2309da108a911fa6880055a165264872a84` with packaged ONNX Runtime Web
  1.22.0. The pinned source and identified weights are MIT licensed. WebGPU uses
  the deployment's FP16 pair first; WASM uses the dynamic-INT8 pair as fallback.
  Model/runtime assets, provenance notices, output policy, configuration, and
  integrity metadata are staged locally with no download or host permission.
- Connected the popup to one learning session: the deterministic solver runs
  once for unchanged input, while Hint 1, Hint 2, Steps, Answer, and explanation
  reuse that result. Study Mode stores one attempt and appends viewed stages;
  Quick Mode remains ephemeral. Manual, selection, review, clipboard, and
  explicitly confirmed OCR sources stay distinct.
- Reworked History and Analytics around the v2 data: source and OCR confirmation
  are visible, staged use is retained, and category metrics show Hint 1/2,
  Steps, direct Answer, recent struggle, understanding, and review priority
  without making claims beyond stored events.
- Updated Settings with Quick/Study and shortcut-action persistence plus OCR
  backend/model and WebGPU-to-WASM status. Added page contract checks for unique
  IDs, labels, selectors, staged controls, and safe text rendering.
- Added provider-independent OCR range-capture infrastructure:
  - protocol-v1 messages and a metadata-only `storage.session` schema that
    rejects screenshots, Data URLs, Blobs, bytes, and pixels;
  - a background-owned metadata session bound to tab, window, main-frame
    `documentId`, source URL, capture ID, phase, and expiry, with a ten-minute
    session/confirmation limit, refreshed ten-minute preview limit, serialized
    transitions, duplicate-submit protection, and lifecycle-wide exclusion of
    a replacement start while screenshot processing is active;
  - an on-demand closed-shadow overlay with trusted-pointer reverse drags,
    24 CSS px minimum size, Esc/resize/background-error cleanup, interaction
    blocking, two-frame screenshot preparation, and strict background target,
    sender, capture ID, document ID, source URL, and expiry validation;
  - active-tab rechecks plus a tab-activation monitor around one PNG
    `captureVisibleTab` operation, followed by an acknowledgement from the
    original `documentId` so switch-away-and-back and same-URL reloads fail
    closed;
  - bounded offscreen PNG decode/crop using actual bitmap X/Y scaling, plus
    explicit bitmap close and Blob-URL revocation paths;
  - at most two in-memory previews with ten-minute expiry and a tracked local
    confirmation tab that can only display and discard the crop; closing the
    tab also revokes its preview and clears the session, while page-side expiry
    removes an already-loaded image before idempotent discard and closure.
- Set the extension minimum to Chrome 109 and added the offscreen `BLOBS`
  reason. Incognito use is disabled for this shared offscreen-preview boundary.
- Implemented the OCR boundary: lazy packaged runtime, dedicated Worker
  ownership, WebGPU-first and WASM fallback sessions, timeout, cancellation,
  disposal, serialized warm reuse, bounded inputs/outputs, and conservative
  candidate normalization. Recognition remains separate from the explicit
  confirmation that alone may create a pending deterministic solve. Recognition
  is capped at 120 seconds; the metadata/preview session expires after ten
  minutes.
- Connected the pinned IBEM/ONNX runtime to the offscreen Worker and editable
  confirmation page. Recognition failures keep the crop and expose a manual
  candidate field; imported pending JSON is downgraded so it cannot restore OCR
  confirmation or automatic solving. Late results after session cleanup are
  rejected.
- Added automated coverage for provider fallback, asset integrity, output
  rejection, timeout/cancel/dispose/warm reuse, source metadata, malformed
  candidate text, invisible-character rejection, and the recognition-versus-
  confirmation trust boundary.
- Real Chrome for Testing 152 smoke results (isolated profile, extension ID
  `llamjohdodaenghphknjjclnmklilfjm`): WebGPU and explicit WASM both returned
  `x + y`; the Worker returned `x + y` twice with the same provider and warm
  state. With `--disable-gpu --disable-webgpu`, WebGPU session creation failed
  with `OCR_SESSION_CREATE_FAILED`, the explicit WASM session returned `x + y`,
  and the Worker selected WASM for both warm requests.
- Added a full action-driven OCR browser smoke using the Chrome DevTools
  `Extensions.triggerAction` command. In isolated Chrome 152 it passed both
  Study and Quick flows through real active-tab capture, a 290 x 121 PNG crop,
  offscreen Blob preview, WebGPU recognition of `x + y`, trusted candidate
  editing, explicit deterministic solving, mode-specific history behavior, and
  final preview revocation. Recognition alone created neither a pending solve
  nor a history item.
- The full browser run exposed and fixed two capture-paint defects that the VM
  harness could not model: Chromium does not permit a shadow root directly on
  a native `dialog`, and a modal backdrop is part of `captureVisibleTab`.
  The dialog now remains the top-layer container, a nested `div` owns the
  closed shadow root, and screenshot preparation demotes the dialog to a
  visible non-modal layer before the existing two-frame paint barrier.
- Closed three asynchronous cleanup races found in final review: cancel intent
  now invalidates a pending recognition result before awaiting the background,
  a timed-out crop request always schedules preview discard even if its late
  offscreen work eventually succeeds, and offscreen-document creation shares
  the request's single overall deadline.
- Added conservative IBEM candidate cleanup for the observed
  `zws _( 2 x ^( 2 ) + 5 x + 2 = 0 )` output. Only the known standalone
  `zws` artifact and an exact whole-formula `_ (...)`/`zws_(...)` wrapper are
  removed; explicit integer exponent parentheses and unambiguous spaced
  number/single-letter products are normalized for the existing solver. Raw
  OCR text remains separate from the editable normalized candidate. Digit
  suffixes, subscripts, valid underscore forms, and ambiguous adjacency remain
  unchanged.
- Added an on-demand, DOM-read-only structured selection layer for popup and
  `Ctrl+Shift+Y` input. Fully selected presentation MathML preserves supported
  superscripts, subscripts, fractions, square roots, and operators; complete
  HTML `sup`/`sub` and one-to-one KaTeX/MathJax semantic MathML with matching
  visible/presentation text are handled without reconstructing layout spans.
  Only separate MathML number/identifier nodes create an explicit coefficient
  `*`. Partial ranges, textless renderer glyph branches, nth roots,
  unsupported/malformed structures, ambiguous factor adjacency, and renderer
  mappings without exactly one semantic formula fall back to the complete
  unchanged `Selection.toString()` value. Literal controls remain literal,
  passwords remain excluded, and the verified-only clipboard workflow is
  unchanged.
- Added the schema-v1 `ProblemInput` boundary before classification and solver
  routing. It snapshots `questionLabel`, `instructionText`, canonical
  `instructionIntent`, `formulaText`, input conditions, source, and separate
  instruction/formula provenance while retaining legacy string input exactly.
  The 13 closed intents are `simplify`, `expand`, `factor`, `solve_equation`,
  `differentiate`, `integrate`, `definite_integral`, `limit`, `tangent`,
  `normal`, `monotonicity`, `extrema`, and `monotonicity_extrema`. Explicit
  intent dispatch is terminal: a conflict or failure cannot fall through to a
  mathematically different solver.
- Added conservative Japanese instruction normalization and problem-number
  separation. Variant endings and bounded modifiers are data-driven rather
  than one catch-all regular expression. Generic `計算せよ` remains ambiguous;
  only explicit context such as `分数式を計算せよ` selects simplification.
  Strong `問`/`問題` and circled labels are recognized at the first non-empty
  line, while `(1)`, `（1）`, and `1.` additionally require an isolated line or
  a following instruction. `(1+x)` and plain suffixes such as `x2` are never
  repaired or removed.
- Added optional problem-number and instruction fields to the popup and four
  separately editable fields (problem number, instruction, formula, and
  conditions) to OCR confirmation. Raw OCR text is retained separately, and
  editing instruction or formula changes that field's provenance from OCR to
  manual. An OCR candidate remains unconfirmed until the separate solve action;
  unsupported conditions and instruction/formula conflicts stop safely.
- Added a local mixed-OCR path for one or two short horizontal Japanese
  instruction regions above exactly one formula. Strong horizontal whitespace
  creates at most three bounded crops but does not classify pixels semantically.
  The upper crops are checked with Tesseract.js 7.0.0 and horizontal
  `tessdata_fast` 4.1.0 `jpn`; only the final formula crop reaches IBEM. If the
  upper region is not Japanese, Japanese recognition fails, more than three
  independent regions exist, or one formula cannot be isolated, formula OCR is
  not started for the mixed crop.
- Packaged the Japanese OCR runtime, three local WASM feature builds, language
  data, Apache-2.0 license texts, bundle dependency notices, provenance, and
  SHA-256 asset manifest. The
  `jpn.traineddata` file is 2,471,260 bytes with SHA-256
  `1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d`;
  the complete added Japanese OCR asset directory is 14,385,195 bytes (about
  14.4 MB decimal / 13.7 MiB). Runtime URLs must use `chrome-extension:` and
  CDN, cache download, Blob workers, and external communication remain disabled.
- Improved rational-expression domain display without weakening verification.
  `1/x+2/(x+1)` now simplifies exactly to
  `(3*x+1)/(x*(x+1))` under `x≠0`, `x≠-1`; and
  `1/(x^2-1)-1/(x-1)` simplifies to `-x/(x^2-1)` while retaining
  the original holes `x≠-1`, `x≠1`.

## Remaining validation

- The primary toolbar-driven capture/confirmation/solve release blocker is
  closed by the reproducible browser smoke. Final release checking still needs
  the manual adversarial UI cases in `docs/test-plan.md`, including tiny and
  reverse drags, Esc/tab-switch/expiry cancellation, and a full capture flow in
  a forced-WASM profile. Their individual protocol, cleanup, and provider paths
  are already covered automatically.
- Exact peak Worker/WASM memory remains unmeasured, and an actual
  rendered fraction has not yet been transcribed exactly in the browser; both
  remain release evidence gaps rather than reasons to relax confirmation.

## Last verified commands

- `npm.cmd run check` - passed for 282 files, 14 HTML, 212 JS/MJS, and 12 CSS
  files on 2026-09-10.
- `npm.cmd test` - 801 passed, 0 failed on 2026-09-10, including 5,500
  generated evaluation cases and the structured-input/OCR safety regressions.
- `npm.cmd run check` - passed for 253 files, 13 HTML, 191 JS/MJS, and 12 CSS
  files on 2026-09-08.
- `tests/browser/selection-structure-harness.html` - installed Chrome passed
  9/9 native DOM/Range cases on 2026-09-08, including leaf-boundary
  selections, renderer correspondence, and intentional textless fallback.
- `node scripts/ocr-browser-smoke.mjs 9333` - Chrome for Testing 152 passed
  WebGPU, explicit WASM, Worker warm reuse, and forced-WASM fallback as
  recorded above.
- `npm.cmd run test:browser:ocr-flow -- 9335 --allow-storage-reset` - isolated Chrome 152 passed
  action-triggered Study and Quick capture, preview, WebGPU recognition, edit,
  solve, history, and cleanup on 2026-09-08.
- `npm.cmd run test:browser:selection -- 9338` - isolated headless Chrome 152
  passed 10/10 plain-text, HTML `sup`/`sub`, MathML, KaTeX/MathJax,
  structured Japanese-instruction/MathML, and conservative fallback cases on
  2026-09-10. The corresponding integration test reaches the verified
  quadratic solver through `ProblemInput` and the shortcut workflow.
- `node scripts/ocr-browser-smoke.mjs 9338 <extensionId> either` - isolated
  headless Chrome 152 passed explicit WebGPU and WASM formula OCR, Worker warm
  reuse, exact Japanese instruction recognition, mixed-region separation, and
  the single-region formula regression on 2026-09-10. A fresh Japanese fixture
  took about 283 ms and a warm rerun about 30--35 ms; the recorded page-heap
  delta excludes Worker/WASM peak memory.
- `npm.cmd run test:browser:ocr-mixed-flow -- 9338 --allow-storage-reset` -
  isolated headless Chrome 152 passed Study and Quick capture, separation of
  `(1)` / `次の方程式を解け` / `x+y`, the four-field confirmation UI,
  instruction/formula manual edits and provenance, explicit solve,
  mode-specific history, and preview cleanup on 2026-09-10.

## Restart procedure

1. Run `git rev-parse --show-toplevel` and confirm the physical path above.
2. Run `git branch --show-current`, `git log -1 --oneline`, and
   `git status --short`.
3. Read `PLAN.md`, `PROGRESS.md`, and `docs/decision-log.md`.
4. Run `npm test` and `npm run check`.
5. Inspect any uncommitted diff before editing.
6. Continue with the first item under **Next**.
7. After a verified checkpoint, update this file before committing.
