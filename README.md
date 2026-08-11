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

For definite integrals, write `∫_0^1 x^2 dx`,
`0から1までx^2を定積分せよ`, or `x^2を0から1まで定積分せよ`.
The current exact path accepts signed integers, finite decimals, or explicit
fractions as both bounds. Its integrand may be a rational-coefficient `x`
polynomial through degree 32, at most 32 terms `q*exp(ax+b)`, and at most 32
terms each of `r*sin(cx+d)` and `s*cos(ex+f)`, with all coefficients rational.
For a separate exact-angle path, both bounds may instead be explicit rational
multiples of `pi`, such as `0`, `pi/4`, or `3*pi/2`, when the whole integrand
is a finite rational-coefficient sum of `sin(ax+b*pi)` and `cos(cx+d*pi)` with
rational slopes. Standard 15-degree angles are reduced to exact `√2`, `√3`,
and `√6` terms; other rational multiples such as `pi/5` remain exact formal
values rather than decimals. Write function arguments with parentheses, as in
`exp(2x+1)` and `sin(3x-1)`; `e^(2x+1)` is the supported exponential alias.
Scientific notation such as `1e2` is intentionally rejected instead of being
confused with Euler's constant. Nonlinear arguments, products involving
functions, `pi`-valued slopes such as `sin(pi*x)`, mixed rational/`pi` bounds,
degree notation, variable denominators, hidden holes, infinite bounds, and
improper integrals remain unsupported rather than being inferred from endpoint
values. Polynomial or exponential terms are not partially solved on the
`pi`-bound path.

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
