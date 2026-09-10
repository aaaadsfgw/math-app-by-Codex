# Math Study Log

Math Study Log is a build-free Manifest V3 Chrome extension that solves
supported mathematics problems entirely inside the extension and records how
independently the learner reached the solution.

The application uses deterministic JavaScript solvers and has no
answer-generation AI, API key, external server, network host permission, remote
script, or CDN. Its packaged OCR runtimes only transcribe machine-printed input;
their editable output requires explicit user confirmation before the
deterministic solver can see it.

## Current state

The current migration checkpoint supports:

- linear equations in one variable;
- one-variable rational equations whose cleared numerator and every original
  denominator reduce to degree two or below;
- one-variable rational inequalities whose cleared numerator and every
  original denominator factor reduce to degree two or below, with exact open
  poles and rational or quadratic-radical interval endpoints;
- systems of two linear equations in `x` and `y`, with exact fractions;
- one-variable linear inequalities;
- one-variable quadratic inequalities with exact rational or radical
  boundaries;
- quadratic equations with exact rational or radical roots and separately
  labeled numerical approximations;
- exponential equations with positive rational bases and affine exponents when
  a rational solution can be certified by exact prime-exponent comparison;
- same-base logarithmic equations whose rational log coefficients, arguments
  of degree two or lower, and final quadratic-or-lower candidate equation can
  all be checked exactly with every original positive-argument condition
  retained;
- verified derivatives for bounded algebraic and standard elementary-function
  expressions;
- exact tangent lines to rational-coefficient polynomials through degree four
  at an explicitly stated rational x-coordinate or point, with exact
  curve-membership, point, and slope verification;
- exact normal lines to rational-coefficient polynomials through degree four
  at an explicitly stated rational x-coordinate or point, including true
  vertical-line results and exact point/orthogonality verification;
- exact monotonicity and local extrema of rational-coefficient polynomials
  through degree three over all real numbers, with exact derivative roots,
  sign partitions, critical-point values, and stationary non-extrema;
- indefinite integrals whose candidate can be differentiated back over the
  whole supported domain;
- exact definite integrals of rational-coefficient polynomials through degree
  32 plus finite sums of affine `exp`, `sin`, and `cos` terms over finite
  rational bounds, evaluated as BigInt fractions and typed formal endpoint
  values;
- exact limits of one-variable rational functions through degree four at
  finite rational points or positive/negative infinity, including removable
  holes, left/right finite-point limits, signed infinity, and exact
  nonexistence when the two finite-point one-sided limits differ;
- exact areas between two explicitly stated rational-coefficient polynomial
  curves through degree four when their difference is quadratic or lower,
  over rational bounds or between exactly two distinct real intersections;
- exact x-axis volumes of revolution over explicit rational intervals by the
  disk or washer method, when both declared polynomial radii are degree two or
  lower and their nonnegative outer/inner order can be certified everywhere;
- algebraic expansion, factorization, and simplification;
- binary-to-decimal conversion;
- direct percentage calculation;
- answer, two hint levels, working, and explanation output;
- Quick Mode for ephemeral answers and Study Mode for one-record learning
  attempts across Hint 1, Hint 2, Steps, Answer, and explanation;
- popup manual input, selected-text input, and a selection-first shortcut that
  falls back to the clipboard and only replaces it after a verified result;
- a common `ProblemInput` boundary that keeps a problem number, instruction,
  formula, conditions, source, and per-field provenance separate while keeping
  legacy one-string questions compatible;
- optional problem-number and instruction fields in the popup, with Japanese
  instructions normalized to one of 13 closed intents only when the wording is
  unambiguous;
- experimental browser-local OCR for either one tightly cropped
  machine-printed formula or one to two short horizontal Japanese instruction
  regions followed by exactly one formula region, producing four separately
  editable confirmation fields and requiring a separate explicit solve action;
- source-aware history, staged-output usage, analytics, and review.

The long-term target is text/formula input from junior-high mathematics through
Japanese Mathematics III. OCR is a narrow, untrusted input method: the
formula-only path retains IBEM, while a mixed crop is split at strong horizontal
whitespace and sends only its final formula crop to IBEM. Short Japanese
instruction crops use the separately packaged Tesseract.js runtime. The crop
and structured candidate remain visible together, and the existing
deterministic solver receives the edited fields only after the user presses the
separate confirmation action. OCR never answers, explains, validates, or marks
mathematics as verified. Diagram understanding, diagram-dependent geometry,
construction problems, handwriting, vertical Japanese text, general/full-page
layout, photographs, multiple formulas, and proof interpretation are
intentionally out of scope. An unsupported input returns an explicit error
instead of a guessed answer.

See [PLAN.md](PLAN.md), [PROGRESS.md](PROGRESS.md), and
[docs/supported-problems.md](docs/supported-problems.md) for the exact migration
status.

## Install in Chrome

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose this repository directory.
5. Optionally pin Math Study Log to the toolbar.

No companion process or model download is required.

## Use

Choose Quick Mode when no learning record should be created, or Study Mode when
the viewed stages should be collected into one attempt. Enter a question in the
popup or select a question on a normal HTTP/HTTPS page, then choose only the
stage you need. Switching stages for the same input reuses the verified solver
result instead of recalculating it.

The shortcut `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS) first uses selected
page text and otherwise reads the clipboard. It copies the configured verified
Answer, Hint 1, Hint 2, or Steps output only after the solver succeeds. An
unsupported or invalid input leaves the original clipboard unchanged. Quick
Mode never writes history; Study Mode records the input source and viewed
stage.

The popup can keep a problem number and an optional instruction separate from
the formula. Supported instructions normalize to the closed intents
`simplify`, `expand`, `factor`, `solve_equation`, `differentiate`, `integrate`,
`definite_integral`, `limit`, `tangent`, `normal`, `monotonicity`, `extrema`,
and `monotonicity_extrema`. A generic instruction such as `計算せよ` is not
enough to choose an operation; `分数式を計算せよ` is the narrow supported
simplification alias. Conflicting instructions or an instruction incompatible
with the formula stop before another solver can be tried. Leaving the
instruction blank preserves the established formula-only routing.

Question labels are removed from solver input only with structural evidence.
`問1`, `問題1`, and circled numbers are strong labels; `(1)`, `（1）`, and
`1.` additionally need their own line or a following recognized instruction.
An expression such as `(1+x)(1-x)` is never stripped. A page selection is split
into instruction and formula only when it contains one or two complete
instruction lines followed by exactly one formula line. Otherwise its original
plain text follows the legacy route without reconstructing lost notation.

For a web-page selection, the extension preserves mathematical structure when
the selected DOM proves it. Complete presentation MathML supports single-letter
identifiers, numbers, operators, superscripts, subscripts, fractions, and
square roots; complete HTML `sup`/`sub` elements are also retained. A KaTeX or
MathJax-like
rendering is mapped to MathML only when one semantic representation belongs to
the same renderer container, the corresponding displayed formula is fully
selected, and their normalized visible/presentation text agrees. The extractor
reads DOM nodes only and never calls page JavaScript.

This is intentionally not OCR or plain-text guessing. If the range cuts through
a structured formula, the MathML form is unsupported or malformed, a renderer
mapping is not one-to-one, or the only input is text such as `x2`, `x1`, `12`,
or `log2(x)`, the extension keeps `Selection.toString()` unchanged. It never
turns those strings into `x^2`, `x_1`, `1^2`, or `log_2(x)`. General nth roots,
layout-only renderer spans, textless CSS/SVG glyph renderings without a
comparable selected string, matrices, under/over scripts, and other unsupported
MathML fall back for the same reason. Input and textarea selections remain
literal, and password inputs remain excluded. If a textless rendering also
produces an empty `Selection.toString()`, the shortcut treats it as no text
selection and follows its pre-existing clipboard fallback.

Only a successfully checked solver result receives the verified label. Hints,
working, and explanations are derived from that same result.

For image input, choose the OCR action and drag around either one printed
formula or the supported compact layout of one or two short horizontal
Japanese instruction lines above one formula. Strong horizontal whitespace is
used only to create regions; pixels alone never declare a region to be Japanese
or mathematical. Tesseract.js 7.0.0 with the Apache-2.0
`tessdata_fast` 4.1.0 `jpn` data reads the upper regions. Only the final,
separately cropped formula region reaches the existing MIT-licensed IBEM
formula OCR. The confirmation page exposes problem number, instruction,
formula, and conditions as separate editable fields and retains raw OCR text
and OCR/manual provenance internally. Review every field, then explicitly
choose to solve. Recognition by itself does not run the solver or save a
verified result.

The packaged Japanese OCR assets are pinned by SHA-256 in
`vendor/ocr/tesseract-japanese/ASSET_MANIFEST.json`; the language model hash is
`1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d`.
The runtime, three local WASM feature builds, Japanese data, licenses, retained
MIT/BSD bundle dependency notices, and asset manifest total 14,385,195 bytes
(about 14.4 MB decimal / 13.7 MiB). No asset is downloaded at runtime. Japanese
recognition is WASM-only; formula recognition
continues to prefer WebGPU and fall back to WASM. In the latest isolated
headless Chrome 152 check, the packaged Japanese path transcribed
`次の方程式を解け。`, the mixed path separated `(1)`, the instruction, and
`x+y`, and the full confirmation flow passed in both Study and Quick modes.
A fresh Japanese run took about 283 ms and a warm rerun about 30--35 ms in
that fixture. The available page-heap delta is only a partial measurement and
does not include the Worker/WASM peak, so no precise peak-memory claim is made.
Exact recognition of a rendered fraction image has not been established; the
candidate must still be reviewed and corrected before solving.

For logarithmic equations, write an explicit integer base as `log_2(x)` or
`log₂(x)`. Bare `log(x)` and `ln(x)` both mean the natural logarithm, matching
the calculus parser. Parentheses around every logarithm argument are required.

For rational inequalities, make every denominator boundary explicit. Write
`1/(x(x+1))>0` or `(1/x)*(x+1)>0`; ambiguous forms such as `1/x(x+1)>0` and
`1/2x<1` are rejected instead of guessed.

For a rational-function limit, write `lim_(x->1) (x^2-1)/(x-1)`,
`lim_(x->1+) 1/(x-1)`, `lim_(x->+∞) (2x^2+1)/(x^2-3)`, or
`xを1に左から近づけるとき 1/(x-1) の極限を求めよ`. The approach point
may be a signed integer, finite decimal, explicit fraction, `+∞`, or `-∞`.
The current exact path accepts integer exponents from -4 through 4 and requires
every intermediate numerator, denominator, and original domain factor to stay
at degree four or below, with at most ten distinct nonconstant original domain
factors. It keeps every original hole after cancellation, compares exact zero
multiplicities at a finite point, and reports finite values, `+∞`, `-∞`, or a
verified mismatch of the two one-sided limits. At positive or negative
infinity it compares exact polynomial degrees and leading coefficients, while
an exact coefficient bound certifies that every retained denominator/domain
factor is nonzero on the relevant tail. A combined `±∞` target or malformed
infinity expression is invalid. Roots, absolute values, piecewise expressions,
trigonometric/exponential/logarithmic limit laws, and sequence limits remain
unsupported rather than being sampled numerically.

For a polynomial tangent line, write `tangent_x_[1](x^2)` or its shorter alias
`tangent_[1](x^2)`; both return `y=2x-1`. To state the whole contact point, use
`tangent_point_((1/2),(1/8))(x^3)`, which returns
`y=(3/4)x-1/4`. The fixed Japanese forms
`曲線 y=x^2 の x=1 における接線の方程式を求めよ` and
`曲線 y=x^2 上の点 (1,1) における接線の方程式を求めよ` are also
accepted. The curve must be a rational-coefficient polynomial in `x` of degree
at most four, and every coordinate must be a signed integer, finite decimal,
or explicit fraction. When a point `(a,b)` is supplied, the solver first
checks `f(a)=b` exactly. It then differentiates the coefficient array, computes
`m=f'(a)` and `c=f(a)-ma`, and rechecks both that `y=mx+c` passes through the
contact point and that its slope is `m`. A false declared point is invalid;
functions, variable denominators, degree five or above, and a contact point or
curve that must be read from a figure or graph remain unsupported.

For a polynomial normal line, write `normal_x_[1](x^2)` or its shorter alias
`normal_[1](x^2)`; both return `y=-(1/2)x+3/2`. To state the whole contact
point, use `normal_point_((1/2),(1/8))(x^3)`, which returns
`y=-(4/3)x+19/24`. The fixed Japanese forms
`曲線 y=x^2 の x=1 における法線の方程式を求めよ` and
`曲線 y=x^2 上の点 (1,1) における法線の方程式を求めよ` are also
accepted. The curve must be a rational-coefficient polynomial in `x` whose
complete source structure has degree at most four, and every coordinate must
be a finite exact rational. When `(a,b)` is supplied, the solver first checks
`f(a)=b` exactly. It then sets `m=f'(a)` and constructs the division-free
implicit line `x-a+m(y-b)=0`, verifying both contact-point passage and
orthogonality to the tangent direction. If `m=0`, the exact result is the
vertical line `x=a`; no infinite or fabricated slope is created. Only when
`m!=0` is the normal slope computed as `-1/m`. A false declared point is
invalid. Functions, variable denominators, degree five or above, non-rational
coordinates, circles and other implicit curves, parametric or polar curves,
geometric/diagram-dependent normals, and any curve or point that must be read
from a figure or graph remain unsupported.
Only the documented `normal_x_`, `normal_[]`, and `normal_point_` stems can
reach the exact supported branch. Explicit geometry names such as
`normal_vector`, `normal_plane`, and `surface_normal` are recognized and kept
as unsupported, while unrelated identifiers such as `normal_distribution`
stay outside the normal preflight.

For polynomial monotonicity and local extrema over all real numbers, write
`monotonicity(x^3-3x)`, `extrema(x^3-3x)`, or
`monotonicity_extrema(x^3-3x)`. The corresponding complete Japanese forms are
`関数 y=f の増減を調べよ`, `関数 y=f の極値を求めよ`,
`関数 y=f の増減を調べ、極値を求めよ`, and
`関数 y=f の増減と極値を求めよ`; `関数 f(x)=f` may replace `関数 y=f`,
and an initial `次の` is accepted. The function must be a complete
rational-coefficient polynomial in `x` of degree at most three. The solver
forms `f'`, finds its rational or quadratic-radical zeros exactly, partitions
the real line, and checks the derivative sign in every open cell. For example,
`monotonicity(x^3-3x)` reports increasing on
`(-∞,-1]` and `[1,+∞)` and decreasing on `[-1,1]`. A repeated derivative
zero that does not change sign is retained as a stationary non-extremum and
does not split a maximal monotonic interval: `extrema(x^3)` reports no local
maximum or minimum and the stationary non-extremum `(0,0)`. A constant is
reported constant on all real numbers with no isolated extrema. Irrational
critical points and values remain exact in one quadratic field `Q+Q√d`.
Degree four or above (including a source term hidden by cancellation),
interval-scoped requests, maximum/minimum requests, functions or variable
denominators, concavity/inflection/graph-outline requests, other variables,
and anything that must be read from a figure, graph, or variation table remain
unsupported rather than approximated.

For an area between two curves, write `area_[0,2](x^2;2x)` for an explicit
interval or `area_intersections(x^2;2x)` for the interval between exactly two
distinct real intersections. Both return `4/3`. A fixed Japanese form such as
`x=0からx=2までの区間で、y=x^2とy=2xの間の面積を求めよ` is also accepted.
Each complete source curve is checked as a rational-coefficient polynomial of
degree at most four, and their difference must be degree two or lower. The
solver enumerates all exact intersections in the interval, partitions at each
one, and adds `∫|f-g|dx` piece by piece. Quadratic-radical intersections stay
exact; for example `area_[-2,2](x^2;2)` returns `(-8+16√2)/3`. A
diagram-dependent or otherwise inferred region, function call, variable
denominator, higher-degree difference, or anything other than exactly two
distinct intersections in the intersection form receives no verified answer.

For a volume of revolution, write `volume_x_axis_[0,1](x)` for a disk or
`volume_x_axis_[0,1](x+2;x+1)` for a washer. These return `pi/3` and `4*pi`.
The one-expression form uses inner radius zero; in the two-expression form the
order is explicitly outer radius `R`, then inner radius `r`. Bounds must be
finite rational numbers with `a<b`, and both radii must be rational-coefficient
polynomials of degree at most two. The solver certifies `R>=r>=0` over the
whole interval using the endpoints and any relevant quadratic vertex, then
computes `pi*∫(R^2-r^2)dx` as an exact rational multiple of `pi`. A fixed
Japanese form that states both bounds, the curve or curves, the x-axis
rotation, and the requested volume is also accepted. Curves that cross the
x-axis, switch inner/outer order, use another rotation axis, require inferred
intersections or a diagram, or exceed this polynomial scope are rejected
instead of being reinterpreted as radii.

For definite integrals, write `∫_0^1 x^2 dx`,
`0から1までx^2を定積分せよ`, or `x^2を0から1まで定積分せよ`.
The current exact path accepts signed integers, finite decimals, or explicit
fractions as both bounds. Its integrand may be a rational-coefficient `x`
polynomial through degree 32, at most 32 terms `q*exp(ax+b)`, and at most 32
terms each of `r*sin(cx+d)` and `s*cos(ex+f)`, with all coefficients rational.
For a separate rational-bound exact-angle path, the whole integrand may instead
be a finite rational-coefficient sum of `sin(a*pi*x+b*pi)` and
`cos(c*pi*x+d*pi)`, where `a`, `b`, `c`, and `d` are rational. For example,
`∫_0^1 sin(pi*x) dx` returns `2/pi`. The `1/pi` factor is retained as an exact
typed basis value rather than converted to a decimal.
For a separate exact-angle path, both bounds may instead be explicit rational
multiples of `pi`, such as `0`, `pi/4`, or `3*pi/2`, when the whole integrand
is a finite rational-coefficient sum of `sin(ax+b*pi)` and `cos(cx+d*pi)` with
rational slopes. Standard 15-degree angles are reduced to exact `√2`, `√3`,
and `√6` terms; other rational multiples such as `pi/5` remain exact formal
values rather than decimals. Write function arguments with parentheses, as in
`exp(2x+1)` and `sin(3x-1)`; `e^(2x+1)` is the supported exponential alias.
Scientific notation such as `1e2` is intentionally rejected instead of being
confused with Euler's constant. Nonlinear arguments, products involving
functions, mixed ordinary-radian and `pi`-valued slopes, mixed rational/`pi`
bounds, degree notation, variable denominators, hidden holes, infinite bounds,
and improper integrals remain unsupported rather than being inferred from
endpoint values. Polynomial or exponential terms are not partially solved on
either exact-angle path, and a `pi`-valued slope is still unsupported when the
bounds themselves contain `pi`.

## Development

Requirements: Node.js 20 or newer.

The unpacked extension requires Chrome 109 or newer.

```powershell
npm.cmd test
npm.cmd run check
```

The extension has no build step. Automated checks do not replace the unpacked
Chrome checks in [docs/test-plan.md](docs/test-plan.md). That plan also explains
how to run
`npm.cmd run test:browser:ocr-flow -- 9333 --allow-storage-reset` against a
disposable remote-debugging profile for the complete OCR capture-to-solve
smoke.

## Privacy and permissions

The manifest requests only:

- `storage` for settings and learning records;
- `activeTab` and `scripting` for user-triggered text selection and bounded OCR
  range capture; structured selection only reads the already selected DOM and
  adds no page script, host access, or external resource;
- `clipboardRead` for the explicit keyboard-shortcut fallback when no page
  text is selected;
- `clipboardWrite` for copying a verified output only after success;
- `offscreen` for clipboard access, shortcut-triggered symbolic work in a
  disposable time-limited Web Worker, bounded in-memory image cropping, and
  locally orchestrated printed-formula recognition.

It does not request any host permission. Questions and history remain on the
device, and no local or cloud answer-generation service is contacted. The IBEM
model, ONNX Runtime Web, Tesseract.js, its core WASM builds, and Japanese
trained data are packaged with the extension; recognition makes no network
request. OCR screenshots and cropped previews are never written to
`storage.local` or `storage.session`; a preview Blob URL is revoked on discard,
replacement, confirmation-tab closure, or expiry. The confirmation page also
removes its loaded image source at expiry before discarding and closing.
Incognito use is disabled while this shared offscreen-preview boundary remains
in place.

## Project continuity

This is a long-running implementation. Before resuming, read `AGENTS.md`,
`PLAN.md`, `PROGRESS.md`, and `docs/decision-log.md`, then run both checks. Make
small tested commits and update the progress log after each milestone.
