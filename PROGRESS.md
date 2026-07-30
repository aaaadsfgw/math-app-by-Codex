# Non-AI Math Engine Progress

Last updated: 2026-07-30

## Repository checkpoint

- Physical path: `C:\Users\kukuk\OneDrive\ドキュメント\GitHub\math-study-log-ai`
- Branch: `feat/non-ai-math-engine`
- Starting commit: `ef80cda Build initial Math Study Log AI prototype`
- Working milestone: 3 - Shared math core

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
- Added the `offscreen`/`WORKERS` bridge so keyboard-shortcut requests from the
  extension service worker retain the same fresh-worker deadline.
- Switched popup and shortcut routing to the shared asynchronous solver entry
  point while keeping the original synchronous solver export for compatibility.
- Added and ran a real-browser worker harness on 2026-07-30:
  - `2x+3=11`;
  - expansion of `(x+1)(x-1)`;
  - factorization of `x^2-1`;
  - simplification of `(x+1)^2-(x^2+2x)`.
  All four passed through the real module-worker and symbolic bundle, with no
  browser console warnings or errors.
- The available browser surface cannot load unpacked Chrome extensions, so the
  manifest, popup-as-extension, service-worker shortcut, and offscreen-document
  integration remain explicitly unverified in real Chrome.
- Recorded the clean starting behavior:
  - `npm test`: 44 passed, 0 failed.
  - `npm run check`: passed for 68 files, 9 HTML files, 31 JS/MJS files, and
    12 CSS files.

## In progress

- Expand algebra coverage while keeping unpacked-Chrome verification as a
  release blocker.

## Next

1. Verify module-worker and offscreen loading in unpacked Chrome before
   changing D-004 from provisional to accepted.
2. Enrich solution traces with typed teaching steps instead of plain strings.
3. Add rational-expression domain constraints and cancellation safeguards.
4. Add systems and inequalities after the algebra corpus is stable.
   provisional to accepted.

## Last verified commands

- `npm test` - 57 passed, 0 failed on 2026-07-30.
- `npm run check` - passed for 78 files, 9 HTML, 41 JS/MJS, and 11 CSS files
  on 2026-07-30.

## Restart procedure

1. Run `git rev-parse --show-toplevel` and confirm the physical path above.
2. Run `git branch --show-current`, `git log -1 --oneline`, and
   `git status --short`.
3. Read `PLAN.md`, `PROGRESS.md`, and `docs/decision-log.md`.
4. Run `npm test` and `npm run check`.
5. Inspect any uncommitted diff before editing.
6. Continue with the first item under **Next**.
7. After a verified checkpoint, update this file before committing.
