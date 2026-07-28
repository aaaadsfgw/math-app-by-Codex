# Supported problems

| Category | Verified local forms | Current boundary |
| --- | --- | --- |
| Linear equation | One variable `x`, constants, signs, simple multiplication/parentheses | No fractions containing variables or multiple variables |
| Quadratic equation | Polynomial coefficients, `x^2`/`x²`, real roots | No complex-root output or general factoring syntax |
| Base conversion | Binary parenthesized/subscript notation to decimal | No arbitrary source/target base conversion |
| Percentage | “NのP%” and currency variant | No compound percentage word problems |
| Coordinate | Two-point distance and midpoint | No line/circle/intersection solver |
| Triangle | Remaining angle, perimeter, base-height/SAS/Heron area, Pythagoras, basic isosceles/equilateral | No proof, arbitrary congruence, trigonometric equation, or complex construction |

The classifier also recognizes systems, exponentials/logarithms, trigonometry, differentiation, integration, limits, sequences, probability, geometry, and vectors. Recognition does not mean local verification; those inputs can be sent to local Ollama and must be labeled unverified.

