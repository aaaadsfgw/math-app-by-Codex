# Math Study Log

Math Study Log is a build-free Manifest V3 Chrome extension that solves
supported mathematics problems entirely inside the extension and records how
independently the learner reached the solution.

The application uses deterministic JavaScript solvers. It has no AI runtime,
API key, external server, network permission, remote script, or CDN.

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
- indefinite integrals whose candidate can be differentiated back over the
  whole supported domain;
- exact definite integrals of rational-coefficient polynomials through degree
  32 plus finite sums of affine `exp`, `sin`, and `cos` terms over finite
  rational bounds, evaluated as BigInt fractions and typed formal endpoint
  values;
- exact finite-point limits of one-variable rational functions through degree
  four, including removable holes, left/right limits, signed infinity, and
  exact nonexistence when the two one-sided limits differ;
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
- selected-text shortcut, clipboard write, history, analytics, and review.

The long-term target is text/formula input from junior-high mathematics through
Japanese Mathematics III. Image input, diagram-dependent geometry, construction
problems, and proof prose are intentionally out of scope. An unsupported input
returns an explicit error instead of a guessed answer.

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

Enter a question in the popup or select a question on a normal HTTP/HTTPS page.
Choose an output mode and run the analysis. The shortcut
`Ctrl+Shift+Y` (`Command+Shift+Y` on macOS) solves selected text, copies the
verified final answer, and optionally records the attempt.

Only a successfully checked solver result receives the verified label. Hints,
working, and explanations are derived from that same result.

For logarithmic equations, write an explicit integer base as `log_2(x)` or
`log₂(x)`. Bare `log(x)` and `ln(x)` both mean the natural logarithm, matching
the calculus parser. Parentheses around every logarithm argument are required.

For rational inequalities, make every denominator boundary explicit. Write
`1/(x(x+1))>0` or `(1/x)*(x+1)>0`; ambiguous forms such as `1/x(x+1)>0` and
`1/2x<1` are rejected instead of guessed.

For a finite rational-function limit, write `lim_(x->1) (x^2-1)/(x-1)`,
`lim_(x->1+) 1/(x-1)`, or
`xを1に左から近づけるとき 1/(x-1) の極限を求めよ`. The approach point
may be a signed integer, finite decimal, or explicit fraction. The current
exact path accepts integer exponents from -4 through 4 and requires every
intermediate numerator, denominator, and original domain factor to stay at
degree four or below, with at most ten distinct nonconstant original domain
factors. It keeps every original hole after cancellation, compares exact zero
multiplicities, and reports finite values, `+∞`, `-∞`, or a verified mismatch
of the two one-sided limits. Infinite approach points, roots, absolute values,
piecewise expressions, trigonometric/exponential/logarithmic limit laws, and
sequence limits remain unsupported rather than being sampled numerically.

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

```powershell
npm.cmd test
npm.cmd run check
```

The extension has no build step. Automated checks do not replace the unpacked
Chrome checks in [docs/test-plan.md](docs/test-plan.md).

## Privacy and permissions

The manifest requests only:

- `storage` for settings and learning records;
- `activeTab` and `scripting` for user-triggered selection capture;
- `clipboardWrite` for copying a verified answer;
- `offscreen` for running shortcut-triggered symbolic work in a disposable,
  time-limited Web Worker.

It does not request `clipboardRead` or any host permission. Questions and
history remain on the device.

## Project continuity

This is a long-running implementation. Before resuming, read `AGENTS.md`,
`PLAN.md`, `PROGRESS.md`, and `docs/decision-log.md`, then run both checks. Make
small tested commits and update the progress log after each milestone.
