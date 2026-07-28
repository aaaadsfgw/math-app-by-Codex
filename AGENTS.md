# Math Study Log AI development rules

## Purpose and scope

This repository contains a standalone Manifest V3 Chrome extension for solving high-school mathematics problems and recording the stage at which a learner reached understanding. It must remain independent from any previously submitted extension.

## Safety boundaries

- Never edit, import from, depend on, commit to, or rewrite the history of the existing `math-answer-paste` project.
- Do not add API keys, cloud AI APIs, external application servers, CDNs, or clipboard read access.
- Ollama traffic is limited to `localhost:11434` and `127.0.0.1:11434`.
- Do not use `eval` or equivalent dynamic code execution for mathematics.

## Verification policy

- Run a local solver before Ollama when the input is supported.
- Display “verified” only when a solver has checked the result against the original conditions.
- Label fixed demonstration output as demo data, not as solver verification.
- Label an Ollama-only answer as unverified AI output. Never overwrite a verified final answer with model text.

## Module and data boundaries

- Keep classifier, parser, prompts, Ollama client, storage, and each solver in separate modules.
- Treat `chrome.storage.local` as production storage. A localStorage adapter is permitted only for direct-page and automated checks outside Chrome.
- Preserve the documented history schema and tolerate malformed imported records without crashing.
- Keep SVG display coordinates separate from mathematical constraints. A dragged point must never silently change a side length or angle.

## Quality rules

- Every visible button must perform its stated action or be explicitly disabled with a limitation explanation.
- Maintain keyboard focus, labels, ARIA live regions, narrow-popup layout, responsive full pages, and meaningful empty/error/loading/success states.
- Update the relevant documents whenever supported problems, storage fields, permissions, or user-visible behavior changes.
- Run `npm test` and `npm run check` before committing.

