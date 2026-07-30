# Architecture

## Runtime flow

```text
typed or selected question
          |
          v
category classifier
          |
          v
solver router -> deterministic solver -> mathematical verification
                                      |
                                      v
                               solution presenter
                                      |
                     answer / hint / steps / explanation
                                      |
                                      v
                         local history and analytics
```

The popup and keyboard shortcut use the same asynchronous solver router.
Symbolic requests from a visible extension page run in a fresh module worker.
Shortcut requests travel through a bundled offscreen document, which creates
the same deadline-controlled worker because the service worker does not own a
window context. Unsupported input stops before presentation, clipboard, or
verified-history creation.

## Trust boundary

- Solver results are project-owned structured objects.
- A result is presentable only when `supported`, `solved`, and `verified` are
  true and the final answer is non-empty.
- Imported verification claims are downgraded until the problem is solved
  again on the current device.
- Legacy `demo`, `ai-only`, `geometry`, and obsolete setting fields are read
  only for stored-data compatibility. New runtime paths never create them.
- No input string is executed as JavaScript.

## Planned math core

The next architecture layer is a project-owned parser and expression tree. It
will normalize Japanese notation, create a restricted AST, dispatch to
domain-specific solvers, and use an audited symbolic backend only through a
small adapter. Exact values remain exact where possible; approximations and
conditional answers are labeled explicitly.

See `PLAN.md` and `docs/decision-log.md`.
