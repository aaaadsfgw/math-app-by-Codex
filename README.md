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
- systems of two linear equations in `x` and `y`, with exact fractions;
- one-variable linear inequalities;
- one-variable quadratic inequalities with exact rational or radical
  boundaries;
- quadratic equations with exact rational or radical roots and separately
  labeled numerical approximations;
- exponential equations with positive rational bases and affine exponents when
  a rational solution can be certified by exact prime-exponent comparison;
- verified derivatives for bounded algebraic and standard elementary-function
  expressions;
- indefinite integrals whose candidate can be differentiated back over the
  whole supported domain;
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
