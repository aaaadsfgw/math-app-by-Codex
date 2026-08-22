# Supported problems

This file distinguishes current runtime support from the long-term target.
Classification alone never means a problem can be solved.

## Supported now

| Domain | Accepted examples | Verification |
| --- | --- | --- |
| Linear equation | `2x+3=11`, `3(x+2)=15` | substitute into the original equation |
| Rational equation | `1/(x-1)=2`, `(x²-1)/(x-1)=0` | exact clearing plus substitution into every original denominator |
| Two-variable linear system | `x+y=3, x-y=1` | exact substitution into both equations |
| One-variable linear inequality | `-3x+6>=0`, `0.5x>1` | exact boundary and coefficient-sign check |
| One-variable quadratic inequality | `x^2-5x+6<=0`, `x^2-2<0` | exact discriminant and sign chart |
| One-variable rational inequality | `1/(x-1)>0`, `(x^2-2)/(x^2-3)>=0` | exact critical-point ordering, interval substitution, and original-pole exclusion |
| Derivative | `f(x)=x^3-2x を微分せよ`, `sin(x^2)を微分せよ` | project-owned rules plus symbolic equivalence |
| Polynomial tangent line | `tangent_x_[1](x^2)`, `tangent_point_(1,1)(x^2)` | exact coefficient differentiation, declared-point membership, and point/slope re-verification |
| Indefinite integral | `∫x^2 dx`, `sin(x)を積分せよ` | differentiate the candidate back to the input |
| Definite polynomial/elementary integral | `∫_0^1 x^2 dx`, `∫_0^1 2exp(2x+1) dx`, `∫_0^1 sin(x) dx`, `∫_0^pi sin(x) dx` | exact antiderivative coefficients and endpoint substitution with BigInt fractions and typed `exp`/`sin`/`cos`/`pi` atoms |
| Rational-function limit | `lim_(x->1) (x²-1)/(x-1)`, `lim_(x->+∞) (2x²+1)/(x²-3)` | exact zero multiplicities at finite points or degree/leading-coefficient comparison at signed infinity, with the original-domain ledger retained |
| Polynomial area between curves | `area_[0,2](x^2;2x)`, `area_intersections(x^2;2x)` | exact intersections, sign partition, and piecewise `∫|f-g|dx` |
| Polynomial x-axis volume of revolution | `volume_x_axis_[0,1](x)`, `volume_x_axis_[0,1](x+2;x+1)` | exact interval-wide radius/order certificate and `pi*∫(R²-r²)dx` |
| Quadratic equation | `x^2-5x+6=0`, `0.5x²-1=0` | exact BigInt discriminant and algebraic substitution of every root |
| Exponential equation | `2^x=8`, `4^x=8`, `(1/2)^x=8` | exact prime-exponent comparison for every rational base factor |
| Logarithmic equation | `log_2(x)=3`, `log_2(x-1)+log_2(x+1)=3`, `ln(x)=0` | exact same-base product transformation plus every original argument's strict-positive check |
| Algebraic transformation | `(x+1)(x-1)を展開せよ`, `x²-1を因数分解せよ` | simplify the symbolic difference to zero |
| Base conversion | `1011(2)を10進数に変換` | convert the result back to the source base |
| Direct percentage | `800円の25%` | reverse ratio check |

## Planned textual domains

- chained, simultaneous, and higher-degree inequalities;
- broader powers, exponential substitutions, roots, and complex numbers;
- trigonometric values, identities, equations, and inequalities;
- sequences and common finite/infinite sums;
- counting, probability, statistics, and data summaries;
- textual coordinate formulas and vector algebra;
- limits containing trigonometric, exponential, logarithmic, piecewise, or
  other non-rational functions; broader definite integrals;
  broader volumes of revolution and other calculus applications through
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

Polynomial tangent-line problems accept the full-input forms
`tangent_x_[a](f)`, `tangent_[a](f)`, and
`tangent_point_(a,b)(f)`, plus the fixed Japanese forms
`曲線 y=f の x=a における接線の方程式を求めよ` and
`曲線 y=f 上の点 (a,b) における接線の方程式を求めよ`. Every supplied
coordinate must be a finite exact rational written as a signed integer, finite
decimal, or explicit fraction. The complete curve and every source subtree
must reduce to a rational-coefficient polynomial in `x` of degree at most four.

At `x=a`, the project-owned core evaluates `f(a)`, formally differentiates the
dense coefficient array, evaluates `m=f'(a)`, and constructs
`c=f(a)-ma`. The canonical exact answer is `y=mx+c`, such as `y=2x-1`,
`y=(3/4)x-1/4`, or the horizontal form `y=3`. If `(a,b)` is declared,
`f(a)=b` is checked exactly before the line is constructed; a mismatch is an
invalid point rather than a different tangent problem. Verification then
independently checks that the line evaluates to `f(a)` at `a` and that its
slope equals `f'(a)`. The verified solver ID is `polynomial-tangent`, and its
history category is `微分`.

Function calls, variable denominators or negative variable powers, degree five
or above (including a high-degree source subtree hidden by cancellation),
non-rational coordinates, other curve variables, geometric tangents, and any
contact point or curve that must be inferred from a figure or graph remain
unsupported. Malformed notation, attached answers, and a declared point that
is not on the curve receive no verified answer. No numerical derivative,
graph sampling, or CAS proposal is verification evidence.

Rational-function limits currently accept one variable `x`, a finite rational
approach point or separately signed positive/negative infinity, and a complete
polynomial or rational expression. Accepted forms are
`lim_(x->a) f(x)`, `lim_{x→a} f(x)`, `lim x→a f(x)`, and the documented
Japanese approach form. A trailing `+` or `-`, or a matching Japanese
right/left suffix, selects a one-sided limit only at a finite point. Infinity
may be written as `∞`, `+∞`, `-∞`, `infinity`, `+infinity`, `-infinity`, or a
documented explicitly signed Japanese form. A combined `±∞` target and a
right/left suffix attached to infinity are rejected rather than guessed. The
limit profile allows
integer powers from -4 through 4 and keeps every intermediate numerator,
denominator, and original domain factor at degree four or below, with at most
ten distinct nonconstant original domain factors. Every source subtree and
original denominator condition is certified before cancellation, zero
multiplication, or a zero power may simplify the visible value.

At a rational point `a`, the solver factors exact powers of `x-a` from the
numerator and denominator with BigInt-fraction synthetic division. Equal
multiplicities give the exact residual ratio, a larger numerator multiplicity
gives zero, and a remaining denominator multiplicity gives signed infinity
according to its parity and residual sign. A two-sided mismatch is returned as
an exact verified nonexistence result. Removable holes remain recorded in the
trace but are not appended as conditions on the final limit value.

At `+∞` or `-∞`, the solver compares the exact numerator and denominator
degrees. A smaller numerator degree gives zero, equal degrees give the exact
leading-coefficient ratio, and a larger numerator degree gives signed infinity;
the sign at `-∞` also uses the parity of the degree difference. For the reduced
denominator and every original domain factor `p=a_n x^n+...+a_0`, the core
records the exact bound `1+Σ|a_i/a_n|`. Beyond the maximum of those rational
bounds, every factor is certified nonzero and its sign is controlled by its
leading term. Thus finite holes do not alter the infinity limit, but they are
still retained in the evidence. Irrational or variable finite points, `abs`,
roots, piecewise forms, trigonometric/exponential/logarithmic limits, standard
special limits, sequences, and expressions above the profile bounds remain
unsupported. No floating-point sampling, epsilon heuristic, CAS limit, or
numerical tolerance is verification evidence.

Polynomial area problems require both curves and the region description in
text. Accepted full-input forms are `area_[a,b](f;g)`,
`area_intersections(f;g)`, and the documented fixed Japanese forms. Explicit
bounds must be finite rational numbers with `a<b`. Each source curve and every
intermediate subtree must be a rational-coefficient polynomial of degree at
most four. After forming `h=f-g`, its degree must be at most two so every real
intersection can be enumerated exactly.

For an explicit interval, every real root of `h` inside the interval becomes a
partition point. For the intersection form, `h` must have exactly two distinct
real roots and those roots become the bounds. On each resulting interval the
solver certifies the sign of `h`, computes the exact antiderivative difference,
and sums the nonnegative values. Rational and single-quadratic-field values
`Q+Q√d` remain exact; signed integrals are never converted to area with one
final absolute value. Identical curves, missing/double/single intersections in
intersection mode, functions, variable denominators, source degree above four,
difference degree above two, implicit diagram regions, and malformed or
ambiguous notation remain unsupported or invalid rather than sampled.

Polynomial volumes of revolution require an explicit finite rational interval
and declared radii. Accepted symbolic forms are
`volume_x_axis_[a,b](R)` and `volume_x_axis_[a,b](R;r)`; the shorter aliases
`volume_xaxis_` and `volume_x_` and complete fixed Japanese forms are also
accepted. The one-expression disk form sets `r=0`. In the washer form the
first expression is the outer radius and the second is the inner radius.

Every source expression and intermediate subtree is first reduced through the
same bounded rational-polynomial parser, and each final radius must have degree
at most two. On the closed interval the core computes all possible minimum
locations: both endpoints, plus the vertex of an upward-opening quadratic when
it lies inside. It separately certifies `r>=0`, `R-r>=0`, and `R>=0`. Only then
does it convolve coefficient arrays to form `R²-r²`, integrate the resulting
degree-four-or-lower polynomial, and format the nonnegative rational result as
an exact multiple of `pi`.

The initial path intentionally does not infer a geometric radius from signed
curve values. A curve below or crossing the x-axis, an inner/outer switch,
intersection-derived bounds, y-axis or arbitrary-axis rotation, shells,
functions, variable denominators, higher-degree radii, figures, and shaded
regions remain unsupported. General signed two-curve rotation would require
partitioning at roots of `f`, `g`, `f-g`, and `f+g` and combining several
independent quadratic fields; it is not approximated or partially solved.

Definite integrals currently accept one variable `x` and finite rational
bounds written as signed integers, finite decimals, or explicit fractions.
The integrand may be a rational-coefficient polynomial of degree at most 32
plus finite sums of `q*exp(ax+b)`, `r*sin(cx+d)`, and `s*cos(ex+f)`, where all
coefficients are rational. There are at most 32 terms in each of the
exponential, sine, and cosine families before like-term cancellation.
Accepted full-input forms are `∫_a^b f(x) dx`,
`aからbまでf(x)を定積分せよ`, and `f(x)をaからbまで定積分せよ`.
Write function arguments with parentheses; `e^(2x+1)` is an alias for
`exp(2x+1)`. Every sine/cosine argument and bound is interpreted in radians.
The solver constructs each primitive coefficient exactly, computes
`F(b)-F(a)`, and combines typed `exp(rational)`, `sin(rational)`, and
`cos(rational)` atoms with BigInt fractions. It uses only
`sin(-r)=-sin(r)`, `cos(-r)=cos(r)`, `sin(0)=0`, and `cos(0)=1` for
trigonometric normalization. It does not use CAS integration, numerical
quadrature, or floating-point values as proof. Reversed bounds retain their
sign, and equal bounds return zero only after the complete integrand has
passed the supported all-real certificate.

A second rational-bound route accepts only finite sums of
`q*sin(a*pi*x+b*pi)` and `r*cos(c*pi*x+d*pi)`, where every displayed
coefficient is rational and each trigonometric family has at most 32 source
terms. Nonzero slopes produce exact `1/pi` basis terms; zero slopes are handled
first as constant functions. Endpoint angles remain rational multiples of
`pi`, so the same exact 15-degree radical table and nonstandard formal atoms
can be used without `Math.PI`, decimal trigonometry, CAS integration, or
numerical quadrature. This route does not mix ordinary rational-radian slopes,
polynomials, or exponentials into the same verified result.

A separate exact-angle route accepts both bounds as pure rational multiples of
`pi`, including `0`, `-pi/4`, `pi`, and `3*pi/2`. On that route the entire
integrand must be a finite sum of `q*sin(ax+b*pi)` and `r*cos(cx+d*pi)` with
rational coefficients, rational slopes, and at most 32 terms in each family.
The solver reduces periods and quadrants with BigInt fractions. Multiples of
15 degrees are expanded in the exact basis `1`, `√2`, `√3`, and `√6`; values
such as `sin(pi/5)` stay as formal exact atoms. Reversed and equal `pi` bounds
are evaluated only after the complete integrand certificate succeeds.

Variable denominators, negative variable powers, zero powers that can erase
original holes, nonlinear function arguments, products such as `x*sin(x)` or
`exp(x)*cos(x)`, powers such as `sin(x)^2`, `tan` and inverse trigonometric
integrals, degree-based angles, non-rational or variable bounds, infinite
bounds, and all improper integrals remain unsupported. The `pi`-bound route
also rejects mixed rational/`pi` endpoints, polynomial or exponential terms,
nonzero rational phase shifts, and `pi`-valued slopes such as `sin(pi*x)`.
The rational-bound `pi`-slope route rejects mixed slopes such as
`sin((pi+1)*x)`, nonzero ordinary-radian phase shifts, and mixed elementary
sums such as `exp(x)+sin(pi*x)` rather than solving only the supported part.
Scientific-notation-like input such as `1e2` is rejected rather than
interpreted as multiplication by Euler's constant. These forms are not
accepted merely because a symbolic antiderivative happens to have endpoint
values.

For rational-expression simplification, restrictions from every original
denominator are preserved in the displayed answer and history record. For
example, `(x^2-1)/(x-1)` may simplify to `x+1`, but only under `(x-1)≠0`.

Rational equations currently allow one variable, arithmetic, parentheses, and
integer powers from -2 through 2. Every original denominator factor and the
cleared equation must reduce to degree two or below; larger intermediate or
domain polynomials fail safely. Slash notation followed by implicit
multiplication, such as `1/x(x+1)`, is rejected until the denominator is made
explicit with parentheses.

Rational inequalities use the same one-variable syntax and original-denominator
ledger. After moving both sides together, the cleared numerator must have
degree at most two; every original denominator factor must also have degree at
most two, while bounded products of those factors may remain unexpanded for
the sign check. Rational and quadratic-radical zeros and poles are ordered with
BigInt algebra, including roots from different quadratic equations. Each open
interval is checked at an exact rational sample, inclusive operators close only
valid numerator zeros, and every original pole stays open after cancellation,
zero multiplication, zero powers, or nested division. Cubic-or-higher cleared
numerators, parameterized coefficients, functions, chained inequalities, and
ambiguous slash-plus-implicit-multiplication input remain unsupported.

Exponential equations currently require positive rational bases other than
one and affine exponents in `x`. The solver accepts only identities,
contradictions, or rational solutions that make every prime-factor exponent
match exactly. Forms whose exact answer requires a logarithm ratio, such as
`2^x=3` or `e^x=2`, remain unsupported until typed transcendental expressions
and their verification rules are implemented.

Logarithmic equations currently accept an explicit integer base from 2 through
`10^12` as `log_2(x)` or `log₂(x)`. Bare `log(x)` and `ln(x)` are both the
natural logarithm. All effective logarithms must have the same base. The outer
expression must be a rational linear combination of logarithm terms, each
argument must be a polynomial of degree at most two, and the exact product-law
transformation must finish at degree two or below. Every original argument's
strict-positive condition remains in a separate ledger even after cancellation
or multiplication by zero; rational and quadratic-radical candidates are
checked against that ledger without floating-point sign decisions. Nested
logs, variable or fractional bases, rational-function arguments, mixed bases,
logarithm products, cubic-root answers, and logarithmic inequalities remain
unsupported. Write ambiguous coefficients explicitly, for example
`(1/2)*log_2(x)`; suffix multiplication such as `log_2(x)2` is rejected.
To keep expansion deterministic and bounded, one equation may contain at most
12 logarithm occurrences and 9 distinct logarithm arguments. Argument powers
are limited to absolute exponent 4, and exact constant-side base powers to 32.
An identity may retain at most one genuinely quadratic positivity condition;
forms requiring the exact intersection of unrelated quadratic-root families
are reported as unsupported rather than approximated.
