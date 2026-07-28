# Development log

## Why this project exists

The earlier answer-copy concept was useful for speed but did not capture whether a learner understood a problem. This independent project turns each use into a learning record and separates fast answer access from demonstrated understanding.

## Product decisions

- “Answer seen” scores zero because viewing an answer does not prove the learner could reproduce the solution.
- Hint 1 and Hint 2 are distinct so dependence can be measured without treating every assist as equivalent.
- A local LLM handles natural language, but deterministic solvers own claims of mathematical verification.
- Verified final answers cannot be replaced by conflicting model text.
- Geometry uses templates and explicit conditions instead of image recognition, keeping the mathematical input auditable.
- Demo data is a separate evidence type and never presented as solver verification.

## Initial implementation

The prototype includes nine screens, solver-first popup and shortcut flows, local Ollama integration, structured learning records, review/analytics, JSON transfer, nine geometry templates, real supported triangle calculations, documentation, tests, and static project validation.

## Known limits

Local verification covers a deliberate subset of high-school mathematics. Advanced symbolic manipulation, proofs, general coordinate geometry, arbitrary diagram solving, and image recognition remain outside this version. Chrome internal pages and some viewers reject content scripts. Automated tests do not constitute an unpacked-extension browser run.

