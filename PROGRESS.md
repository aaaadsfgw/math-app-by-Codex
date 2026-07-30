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
- Recorded the clean starting behavior:
  - `npm test`: 44 passed, 0 failed.
  - `npm run check`: passed for 68 files, 9 HTML files, 31 JS/MJS files, and
    12 CSS files.

## In progress

- Verify and commit the completed non-AI runtime migration.

## Next

1. Vendor the audited Algebrite browser bundle and license.
2. Add the project-owned symbolic adapter and contract tests.
3. Define the tokenizer, restricted expression AST, normalization rules, and
   typed result states.
4. Migrate the four existing solvers onto the shared contract.

## Last verified commands

- `npm test` - 31 passed, 0 failed on 2026-07-30.
- `npm run check` - passed for 59 files, 8 HTML, 25 JS/MJS, and 11 CSS files
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
