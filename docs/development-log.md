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
