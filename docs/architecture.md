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

## Finite-limit verification

Finite rational-point limits use a dedicated profile of the shared exact
rational-function converter. The default equation and inequality profiles
retain their existing exponent and domain-factor bounds, while the limit
profile permits integer exponents from -4 through 4 and degree-four
numerators, denominators, and domain factors, with at most ten distinct
nonconstant original-domain factors. Every division and zero power contributes
to an immutable original-domain ledger before algebraic cancellation.

At the approach point, the limit core uses exact BigInt-fraction Horner
evaluation and synthetic division to determine the numerator and denominator
zero multiplicities. The residual ratio and the parity of any remaining pole
determine the left and right outcomes. A finite value, signed infinity, and a
left/right mismatch are all typed exact outcomes; no nearby decimal samples or
CAS limit call participate in verification. The public core API independently
validates canonical degree-bounded polynomials, a nonempty punctured domain,
and the domain-factor count rather than trusting only parser-created values.
It copies coefficients, the approach point, and the domain ledger into
base-type snapshots, rejects sparse arrays and invalid flags, keeps its
direction allowlist private, and deeply freezes the returned evidence.

## Math core direction

The project-owned parser and expression tree normalize Japanese notation,
create a restricted AST, and dispatch to domain-specific solvers. An audited
symbolic backend is used only through a small adapter for the operations that
need it; exact project-owned solvers do not treat a CAS proposal as proof.
Exact values remain exact where possible, while approximations and conditional
answers are labeled explicitly.

See `PLAN.md` and `docs/decision-log.md`.
