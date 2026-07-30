# Math Study Log deterministic engine development rules

## Purpose and scope

This repository contains a standalone Manifest V3 Chrome extension for solving
text-based mathematics problems through Mathematics III and recording the stage
at which a learner reached understanding. It must remain independent from any
previously submitted extension.

## Safety boundaries

- Never edit, import from, depend on, commit to, or rewrite the history of the
  existing `math-answer-paste` project.
- Do not add local AI, API keys, cloud AI APIs, external application servers,
  CDNs, or clipboard read access.
- Do not use `eval`, `new Function`, or equivalent dynamic code execution for
  mathematics.
- Do not add image recognition, diagram-based geometry solving, or proof
  generation.

## Verification policy

- Display "verified" only when a solver has checked the result against the
  original conditions.
- Never fabricate an answer for an unsupported or ambiguous problem.
- Label bounded numerical approximations separately from exact results.
- Keep a machine-readable solution trace behind every hint, step, explanation,
  and final answer.

## Module and data boundaries

- Keep classifier, parser, deterministic engine adapter, storage, and each
  solver in separate modules.
- Treat `chrome.storage.local` as production storage. A localStorage adapter is
  permitted only for direct-page and automated checks outside Chrome.
- Preserve the documented history schema and tolerate malformed imported
  records without crashing.
- Preserve existing history records when obsolete AI and geometry fields are
  encountered.

## Quality rules

- Every visible button must perform its stated action or be explicitly disabled
  with a limitation explanation.
- Maintain keyboard focus, labels, ARIA live regions, narrow-popup layout,
  responsive full pages, and meaningful empty/error/loading/success states.
- Update the relevant documents whenever supported problems, storage fields,
  permissions, or user-visible behavior changes.
- Run `npm test` and `npm run check` before committing.

## Long-running work

- At the start of every resumed run, read `PLAN.md`, `PROGRESS.md`, and
  `docs/decision-log.md`.
- Confirm the physical repository path, branch, latest commit, and working-tree
  status before editing.
- Work in small checkpoints that end with tests, a `PROGRESS.md` update, and a
  focused commit.
- Never mark a milestone complete while its acceptance tests are missing or
  failing.
- If interrupted mid-checkpoint, inspect the diff and rerun the full baseline
  before continuing.

