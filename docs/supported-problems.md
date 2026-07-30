# Supported problems

This file distinguishes current runtime support from the long-term target.
Classification alone never means a problem can be solved.

## Supported now

| Domain | Accepted examples | Verification |
| --- | --- | --- |
| Linear equation | `2x+3=11`, `3(x+2)=15` | substitute into the original equation |
| Two-variable linear system | `x+y=3, x-y=1` | exact substitution into both equations |
| One-variable linear inequality | `-3x+6>=0`, `0.5x>1` | exact boundary and coefficient-sign check |
| Derivative | `f(x)=x^3-2x を微分せよ`, `sin(x^2)を微分せよ` | project-owned rules plus symbolic equivalence |
| Indefinite integral | `∫x^2 dx`, `sin(x)を積分せよ` | differentiate the candidate back to the input |
| Quadratic equation | `x^2-5x+6=0`, `x²-2=0` | substitute every reported real root |
| Algebraic transformation | `(x+1)(x-1)を展開せよ`, `x²-1を因数分解せよ` | simplify the symbolic difference to zero |
| Base conversion | `1011(2)を10進数に変換` | convert the result back to the source base |
| Direct percentage | `800円の25%` | reverse ratio check |

## Planned textual domains

- quadratic, chained, and simultaneous inequalities;
- powers, roots, exponentials, logarithms, and complex numbers;
- trigonometric values, identities, equations, and inequalities;
- sequences and common finite/infinite sums;
- counting, probability, statistics, and data summaries;
- textual coordinate formulas and vector algebra;
- limits, definite integrals, and standard calculus applications through
  Mathematics III;
- broader derivative/integral forms after their real-domain case splits are
  implemented.

Each domain is enabled only after parser, solver, verification, presentation,
and regression tests are complete.

## Intentionally unsupported

- image-only questions;
- missing conditions that appear only in a figure;
- diagram-dependent geometry and construction;
- proof requests such as “prove that” or “show that” requiring prose reasoning;
- ambiguous natural-language problems that cannot be converted to one safe,
  explicit mathematical interpretation.

Unsupported input returns no answer and is never marked verified.

Derivative rules currently cover integer powers, sums, products, quotients,
composition, `sin`, `cos`, `tan`, `exp`, `log`, and `sqrt`. Domain restrictions
are retained as conditional results. Indefinite integrals are accepted only
when the returned candidate parses safely, has no unresolved domain split, and
differentiates back to the original integrand.

For rational-expression simplification, restrictions from every original
denominator are preserved in the displayed answer and history record. For
example, `(x^2-1)/(x-1)` may simplify to `x+1`, but only under `(x-1)≠0`.
