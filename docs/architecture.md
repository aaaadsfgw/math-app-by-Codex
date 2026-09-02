# Architecture

## Runtime flow

```text
typed / selected / clipboard / confirmed-OCR question
          |
          v
volume -> area -> tangent -> normal -> variation -> rational-limit preflights
          |
          v
category classifier
          |
          v
solver router -> deterministic solver -> mathematical verification
                                      |
                                      v
                         cached verified workflow
                                      |
                                      v
                               solution presenter
                                      |
                     answer / hint / steps / explanation
                                      |
                                      v
                Quick: ephemeral | Study: one local attempt
```

The popup and keyboard shortcut use the same asynchronous solver router. The
popup runs a solver once for the same input metadata and derives later display
stages from the cached verified result. The shortcut prefers selected page text
and falls back to the clipboard only when the selection is empty.
Symbolic requests from a visible extension page run in a fresh module worker.
Shortcut requests travel through a bundled offscreen document, which creates
the same deadline-controlled worker because the service worker does not own a
window context. Unsupported input stops before presentation, clipboard, or
verified-history creation.

## Trust boundary

- Solver results are project-owned structured objects.
- A result is presentable only when `supported`, `solved`, and `verified` are
  true and the final answer is non-empty.
- Imported verification claims are downgraded until the problem is solved
  again on the current device.
- Legacy `demo`, `ai-only`, `geometry`, and obsolete setting fields are read
  only for stored-data compatibility. New runtime paths never create them.
- No input string is executed as JavaScript.

## Acquisition and learning-session boundaries

- Manual popup text, page selection, clipboard fallback, future confirmed OCR,
  and review reruns enter the same deterministic solve workflow with explicit
  source metadata.
- Quick Mode is ephemeral. Its popup and shortcut coordinators do not call
  history APIs, and storage also rejects a non-Study record defensively.
- Study Mode creates one attempt for the first viewed output stage and appends
  later unique stages to that same history record. Changing the question,
  source, or review parent starts a new attempt. A Quick/Study switch pauses or
  resumes that Study attempt for unchanged input; stages viewed while Quick is
  active are not appended. The verified solver result is reused across the
  switch.
- Analytics and review consume Study records only. Legacy records remain
  readable through schema normalization and imported verification claims
  remain downgraded.
- OCR recognition, when enabled, will end at editable candidate text. It is
  never mathematical verification. Only an explicitly confirmed transcription
  may enter the solver, and only the solver can create the verified label.
- The provisional OCR model assets are not bundled. The OCR control remains
  visibly disabled while the redistribution license gate and browser runtime
  adapter are unresolved.

## Polynomial-tangent verification

Tangent requests use a strict full-input preflight after volume and area, and
before normal, variation, rational-function limits, and category routing. It
accepts only the documented canonical forms or complete fixed Japanese forms with an explicit
rational x-coordinate or explicit rational point. This prevents a displayed
curve equation or point from being stolen by a general equation solver while
leaving ordinary differentiation untouched and classifying geometric tangent
requests as unsupported. Diagram or graph inference, attached answers,
malformed coordinates, and false declared points stop within this recognized
path.

The complete curve AST is converted to a canonical dense
rational-coefficient polynomial through degree four. Source-subtree validation
prevents cancellation or a zero multiplier/power from hiding functions,
variable denominators, or degree-five terms. The public core snapshots every
coefficient and coordinate into base `ExactRational` values, rejects sparse or
noncanonical arrays, and deeply freezes the returned values and evidence.

Using only project-owned exact arithmetic, the core evaluates `f(a)`, forms
the coefficient derivative, evaluates `m=f'(a)`, and computes
`c=f(a)-ma`. An explicitly declared `b` must first equal `f(a)`. The returned
line has dense coefficients `[c,m]` and canonical form `y=mx+c`. Separate
evidence re-evaluates the line at `a` and compares its slope with `f'(a)`; both
must be exact zero differences. Numerical differentiation, graph sampling, and
CAS proposals do not participate in verification. Verified results use solver
ID `polynomial-tangent` and history category `微分`.

## Polynomial-normal verification

Normal-line requests use a strict full-input preflight after tangent and before
variation, rational-function limits, and category routing. The accepted
canonical forms are `normal_x_[a](f)`, its alias `normal_[a](f)`, and
`normal_point_(a,b)(f)`. The two complete fixed Japanese forms are
`曲線 y=f の x=a における法線の方程式を求めよ` and
`曲線 y=f 上の点 (a,b) における法線の方程式を求めよ`, including only
the parser's documented safe terminal variants. This recognized path prevents
the explicit curve equation or contact point from reaching a general equation
solver while leaving ordinary differentiation and unrelated geometry alone.
English recognition is limited to the documented canonical stems and the
explicit unsupported geometry names `normal_vector`, `normal_plane`, and
`surface_normal`; arbitrary identifiers beginning with `normal_` do not enter
this preflight. CR/LF, vertical tab, form feed, NEL, line separator, and
paragraph separator normalize to whitespace, after which numeric-token
separation is still rejected as ambiguous.

Every supplied coordinate must be a finite exact rational. The complete curve
AST and every source subtree must be a rational-coefficient polynomial in `x`
with structural degree at most four, so cancellation, multiplication by zero,
or a zero power cannot hide a degree-five term or an unsupported operation.
The public core snapshots base `ExactRational` values, rejects sparse or
noncanonical coefficient arrays, revalidates the bound, and deeply freezes the
returned line and evidence. If `(a,b)` is declared, `f(a)=b` must hold exactly;
a mismatch is invalid rather than a different normal problem.

The exact core evaluates the contact value, forms the coefficient derivative,
and sets `m=f'(a)`. Its universal construction is the division-free implicit
equation `x-a+m(y-b)=0`, with coefficient triple
`[1,m,-a-mb]`. The tangent direction `[1,m]` and normal direction `[-m,1]`
must have exact dot product zero, and independent substitution must show that
the line passes through `(a,b)`. When `m=0`, the line is a true vertical tagged
union with canonical answer `x=a`; no infinite, `NaN`, divided-by-zero, or
fabricated finite slope exists. Only when `m!=0` does the core compute the
normal slope `-1/m`, its exact intercept, and the equivalent `y=nx+c` form.

Verified results use solver ID `polynomial-normal` and history category `微分`.
Typed traces retain curve membership, differentiation, implicit-line, contact,
and orthogonality evidence. Both hint modes withhold the finished equation,
normal slope, and intercept. Malformed or answer-attached input is invalid;
functions, variable denominators or negative powers, degree five or above,
non-rational coordinates, other variables, circles and other implicit curves,
parametric or polar curves, planes/surfaces, geometric or diagram-dependent
normals, and figure/graph-derived data remain recognized but unsupported. No
numerical derivative, graph sample, floating-point slope, or CAS proposal is
verification evidence.

## Polynomial-variation verification

Polynomial monotonicity and local-extrema requests use a strict full-input
preflight after normal and before rational-function limits. The accepted
canonical forms are `monotonicity(f)`, `extrema(f)`, and
`monotonicity_extrema(f)`. Complete Japanese input may use `関数 y=f` or
`関数 f(x)=f`, optionally preceded by `次の`, followed by exactly one of
`増減を調べよ`, `極値を求めよ`, `増減を調べ、極値を求めよ`, or
`増減と極値を求めよ` (including only the parser's documented safe terminal
variants). This boundary keeps ordinary differentiation and equations outside
the variation path while retaining recognized but unsupported variation forms.

The complete expression AST is converted to a canonical dense
rational-coefficient polynomial in `x` through degree three. Source-subtree
validation prevents cancellation or zero multiplication/powers from hiding a
degree-four term, function, variable denominator, negative power, or another
variable. The public core copies coefficients into base `ExactRational`
snapshots, rejects sparse or noncanonical arrays, revalidates the degree, and
deeply freezes all returned input and evidence.

The core forms the coefficient derivative, whose degree is at most two, and
finds all real derivative zeros exactly as rational values or members of one
quadratic field. It orders and deduplicates those points, partitions the real
line, and certifies `f'` on every open cell with an exact rational sample.
Adjacent cells with the same sign across an even-multiplicity stationary point
are merged into one maximal monotonic interval. Sign changes classify local
maxima and minima; a zero with no sign change remains explicit as a stationary
non-extremum. Thus `x^3` is increasing on all real numbers while `(0,0)` is not
an extremum. A constant polynomial is constant on all real numbers and has no
isolated local extrema.

Every critical-point value is evaluated exactly. When a derivative root is
irrational, both its coordinate and function value remain in the same typed
quadratic field `Q+Q√d`; decimals, floating-point roots, graph samples, and CAS
proposals never become verification evidence. Independent checks cover the
derivative equation, interval signs, maximal interval construction,
critical-point evaluation, and extremum classification.

Verified requests use solver ID `polynomial-variation` and history category
`微分`. Typed traces feed monotonicity, extrema, and combined presentations,
while both hint modes omit critical-point coordinates, completed intervals,
and extremum conclusions. Interval-scoped variation, maximum/minimum,
degree-four-or-higher polynomials, concavity, inflection points, graph outlines,
diagram/graph/table-derived information, and other out-of-profile forms remain
unsupported instead of being inferred or approximated.

## Rational-function limit verification

Rational-function limits use a dedicated profile of the shared exact
rational-function converter. The default equation and inequality profiles
retain their existing exponent and domain-factor bounds, while the limit
profile permits integer exponents from -4 through 4 and degree-four
numerators, denominators, and domain factors, with at most ten distinct
nonconstant original-domain factors. Every division and zero power contributes
to an immutable original-domain ledger before algebraic cancellation.

At the approach point, the limit core uses exact BigInt-fraction Horner
evaluation and synthetic division to determine the numerator and denominator
zero multiplicities. The residual ratio and the parity of any remaining pole
determine the left and right outcomes. A finite value, signed infinity, and a
left/right mismatch are all typed exact outcomes; no nearby decimal samples or
CAS limit call participate in verification. The public core API independently
validates canonical degree-bounded polynomials, a nonempty punctured domain,
and the domain-factor count rather than trusting only parser-created values.
It copies coefficients, the approach point, and the domain ledger into
base-type snapshots, rejects sparse arrays and invalid flags, keeps its
direction allowlist private, and deeply freezes the returned evidence.

At separately requested `+∞` or `-∞`, the same certified rational function
is classified by its exact numerator/denominator degrees, leading-coefficient
ratio, and the parity of their degree difference. For the reduced denominator
and every retained original domain factor `p=a_n x^n+...+a_0`, the core records
the rational Cauchy root bound `1+Σ|a_i/a_n|`; their maximum certifies that the
function is defined on both sufficiently distant tails. The core returns both
signed-tail outcomes and the requested one as frozen typed evidence. Combined
or composite infinity destinations are invalid, while non-rational function
limits and profile overflows remain unsupported.

## Polynomial-area verification

Area requests pass through a strict shape preflight before category routing so
multiple displayed `y=` relations cannot be stolen by an equation solver. The
preflight accepts only the two documented symbolic forms or complete fixed
Japanese forms. It requires both curve expressions and either ordered rational
bounds or an explicit request for the interval between two intersections.
Diagram cues and malformed trailing or leading content stop at this boundary.

Each full curve AST is converted independently to an exact polynomial through
degree four before subtraction, so cancellation cannot hide a degree overflow
or unsupported subtree. The exact area core then accepts only a quadratic-or-
lower difference. It enumerates rational or quadratic-radical real roots,
orders and deduplicates typed real points, partitions the requested interval,
and certifies the sign on every open piece with an exact rational sample. Each
piece compares that sign with the exact antiderivative difference and stores a
nonnegative area. The final value is the exact sum in either `Q` or one
quadratic field `Q+Q√d`; floating-point roots, numerical integration, graph
sampling, CAS proposals, and one final absolute value are not verification
evidence. Public inputs and returned coefficient/point evidence are copied to
canonical dense base-type snapshots and deeply frozen.

## Math core direction

The project-owned parser and expression tree normalize Japanese notation,
create a restricted AST, and dispatch to domain-specific solvers. An audited
symbolic backend is used only through a small adapter for the operations that
need it; exact project-owned solvers do not treat a CAS proposal as proof.
Exact values remain exact where possible, while approximations and conditional
answers are labeled explicitly.

See `PLAN.md` and `docs/decision-log.md`.
