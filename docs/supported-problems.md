# Supported problems

This file distinguishes current runtime support from the long-term target.
Classification alone never means a problem can be solved.

## Supported now

| Domain | Accepted examples | Verification |
| --- | --- | --- |
| Linear equation | `2x+3=11`, `3(x+2)=15` | substitute into the original equation |
| Two-variable linear system | `x+y=3, x-y=1` | exact substitution into both equations |
| Quadratic equation | `x^2-5x+6=0`, `x²-2=0` | substitute every reported real root |
| Algebraic transformation | `(x+1)(x-1)を展開せよ`, `x²-1を因数分解せよ` | simplify the symbolic difference to zero |
| Base conversion | `1011(2)を10進数に変換` | convert the result back to the source base |
| Direct percentage | `800円の25%` | reverse ratio check |

## Planned textual domains

- algebraic inequalities;
- powers, roots, exponentials, logarithms, and complex numbers;
- trigonometric values, identities, equations, and inequalities;
- sequences and common finite/infinite sums;
- counting, probability, statistics, and data summaries;
- textual coordinate formulas and vector algebra;
- limits, differentiation, integration, and standard applications through
  Mathematics III.

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

For rational-expression simplification, restrictions from every original
denominator are preserved in the displayed answer and history record. For
example, `(x^2-1)/(x-1)` may simplify to `x+1`, but only under `(x-1)≠0`.
