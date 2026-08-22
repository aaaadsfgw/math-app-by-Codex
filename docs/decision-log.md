# Decision log

## D-001: Remove AI instead of replacing its provider

**Status:** accepted
**Date:** 2026-07-30

The product will not use Ollama, a cloud model, an API key, or an external
solver service. Mathematical coverage will be provided by deterministic local
code. Unsupported input will be reported, not guessed.

## D-002: Exclude image recognition, diagram geometry, and proofs

**Status:** accepted  
**Date:** 2026-07-30

The target is text-based and formula-based calculation through Mathematics III.
Geometry screens and geometry solvers are removed from the revised completion
scope. Proof generation is not a success criterion.

## D-003: Keep a project-owned solver contract

**Status:** accepted  
**Date:** 2026-07-30

Third-party symbolic output must not flow directly to the UI. A project-owned
adapter will normalize exact values, approximate values, conditions, steps,
verification evidence, errors, and unsupported results. This preserves storage
compatibility and allows the backend to be replaced.

## D-004: Provisional Algebrite backend

**Status:** provisional  
**Date:** 2026-07-30

Algebrite 1.4.0 is the initial deterministic CAS candidate.

Reasons:

- MIT license.
- Runs entirely in browser JavaScript.
- Supports arbitrary-precision arithmetic, simplification, factorization,
  roots, derivatives, integrals, and exact fractions.
- The audited browser distribution contains no `new Function`, direct
  `globalThis.eval`, or `window.eval`.
- Its package is substantially smaller than the other browser-first candidate.

Conditions before final acceptance:

- Vendor only the required local bundle and license.
- Replace the browser-only global assignment with a project-owned ESM wrapper.
- Do not expose Algebrite's scripting language directly to arbitrary question
  text.
- Add time, size, syntax, and representative Mathematics III contract tests.
- Retain custom solvers where their verification and teaching trace are
  stronger.

Rejected alternative:

- Cortex Compute Engine 0.98.0 was not selected for the first implementation
  because its distributed package is much larger and includes JavaScript
  compilation paths containing `new Function`, conflicting with this
  extension's dynamic-code boundary.

## D-005: Tests are the durable source of truth

**Status:** accepted  
**Date:** 2026-07-30

Every supported problem family requires positive, negative, boundary, malformed,
and equivalent-notation tests. Documentation records intent, but a milestone is
not complete until its tests and static checks pass.

## D-006: Use exact rational arithmetic for deterministic algebra

**Status:** accepted
**Date:** 2026-07-30

Finite decimals and fractional coefficients are converted to bounded reduced
fractions before algebraic elimination. Supported equation solvers must not
use rounded floating-point values as proof of correctness. A reported solution
is substituted into every original equation using the same exact arithmetic.

## D-007: Verify integration candidates with project-owned differentiation

**Status:** accepted
**Date:** 2026-07-30

The symbolic backend may propose and simplify an antiderivative, but that
candidate is not accepted directly. The project builds its derivative from
explicit calculus rules and checks symbolic equivalence with the original
integrand. Candidates requiring unresolved real-domain case splits remain
unsupported.

## D-008: Represent inequality answers as exact real sets

**Status:** accepted
**Date:** 2026-07-30

Inequality solvers construct a validated union of real intervals before
formatting answer text. Open and closed endpoints, empty sets, all-real sets,
singletons, and disjoint rays remain structurally distinct through popup,
shortcut, and history storage. Quadratic sign decisions use exact rational
coefficients and a BigInt discriminant; endpoint approximations are display
metadata only.

## D-009: Share an exact algebraic certificate for quadratic roots

**Status:** accepted
**Date:** 2026-07-30

Quadratic equations and inequalities use one project-owned root analysis.
Finite-decimal and fractional coefficients are reduced to a primitive integer
ratio, and the discriminant is evaluated with BigInt. Every reported root is
represented as `(p+q√r)/d`; substitution must reduce both its rational part and
its radical coefficient to exactly zero. Decimal approximations may accompany
an exact root for readability, but never replace `exactAnswer` or serve as
verification evidence.

## D-010: Preserve original denominator factors independently

**Status:** accepted
**Date:** 2026-07-30

Rational expressions are represented by an exact numerator and denominator,
plus a separate ledger of every original nonzero denominator factor. Algebraic
cancellation, multiplication by zero, nested division, and negative powers
must never erase that ledger. A rational-equation candidate is accepted only
when the cleared equation is exactly zero and every ledger factor is exactly
nonzero. Real exclusion values make the result conditional so they survive
history storage. Ambiguous slash notation followed by implicit multiplication
is rejected rather than assigned one of multiple textbook interpretations.

## D-011: Certify rational-base exponentials with prime-exponent vectors

**Status:** accepted
**Date:** 2026-07-30

A positive rational base is factored into bounded integer prime exponents.
Affine exponents in `x` turn those entries into exact rational linear forms.
An exponential-equation answer is accepted only when one rational candidate
makes every prime exponent difference exactly zero, or when the full vector
proves an identity or constant contradiction. If a solution requires a
logarithm ratio, the equation remains unsupported until a typed
transcendental-expression contract exists; a decimal approximation must not be
presented as an exact proof.

## D-012: Preserve logarithm domains before applying product laws

**Status:** accepted
**Date:** 2026-08-05

Each parsed logarithm argument is recorded in a separate strict-positive domain
ledger before like terms are combined. Cancellation, multiplication by zero,
and algebraic normalization may remove a logarithm coefficient but must never
remove its original domain condition. Within that common domain, rational
coefficients are cleared to bounded integer exponents and a same-base equation
is converted to equality between exact polynomial products. A result is
accepted only when the candidate polynomial has degree at most two, every
candidate satisfies it exactly, and every original logarithm argument is
strictly positive. Signs of quadratic-radical substitutions are decided by
exact comparison of `A+B√r`, never by their decimal approximations. Bare
`log` and `ln` both denote the natural logarithm so equation and calculus
notation remain consistent; an integer base uses `log_n` or Unicode subscript
notation.

## D-013: Verify rational inequalities by exact critical-point cells

**Status:** accepted
**Date:** 2026-08-11

A rational inequality is reduced to the exact difference of its two sides,
but the implementation never multiplies an inequality by a denominator of
unknown sign. It records numerator zeros and every original denominator zero
as separate critical points, orders rational and quadratic-radical points with
BigInt algebra, and evaluates one exact rational sample inside every resulting
open interval. Inclusive relations may include a numerator zero only when the
original expression is defined there; every denominator point remains open,
including holes hidden by cancellation, multiplication by zero, zero powers,
or nested division. Roots from unrelated quadratic equations are compared by
evaluating one defining quadratic at the other root and locating that value
relative to the rational vertex, never by decimal approximations.

## D-014: Start definite integrals with a project-owned exact polynomial path

**Status:** accepted
**Date:** 2026-08-11

A finite definite integral is marked exact only when both bounds reduce to
bounded rational numbers and the integrand reduces to an everywhere-defined
rational-coefficient polynomial of degree at most 32. The solver constructs
the antiderivative coefficient by coefficient and evaluates `F(upper)-F(lower)`
with BigInt fractions; it does not need a symbolic-integration proposal or a
floating-point check. Syntactic variable denominators, negative variable
powers, and zero powers that could erase an original hole are rejected before
algebraic cancellation. Functions, mathematical constants, variable or
irrational bounds, infinite bounds, and improper integrals remain unsupported
until their continuity and endpoint domains can be proved over the entire
closed interval. Reversed bounds are evaluated in their written order, and an
equal-bound result is zero only after the integrand passes the same domain-safe
polynomial certificate.

## D-015: Treat affine exponentials as exact formal endpoint atoms

**Status:** accepted
**Date:** 2026-08-11

A finite definite integral may extend the exact polynomial path with at most
32 syntactic terms `q*exp(ax+b)`, where `q`, `a`, `b`, and both bounds are
rational. Because every such term is continuous on the whole real line, the
project-owned solver constructs `q/a*exp(ax+b)` when `a` is nonzero and treats
`a=0` as a constant function. Endpoint values are represented as formal
`exp(rational)` atoms whose coefficients are combined with exact BigInt
fractions. Distinct rational exponents are never merged through a decimal
approximation, and CAS integration or numerical quadrature is not verification
evidence. Nonlinear exponents, products involving exponentials, variable
denominators, non-rational bounds, and improper integrals remain unsupported.
The 32-term bound is applied before cancellation as a conservative complexity
limit. Function arguments require parentheses, and scientific-notation-like
input such as `1e2` is rejected so Euler's constant cannot create a false
verified interpretation.

## D-016: Keep rational-radian sine and cosine values as typed atoms

**Status:** accepted
**Date:** 2026-08-11

The all-real definite-integral path may include at most 32 terms each of
`q*sin(ax+b)` and `q*cos(ax+b)`, with rational coefficients, affine rational
arguments, and finite rational bounds. Angles are rational numbers in radians;
`pi`, degrees, nonlinear phases, trigonometric products and powers, `tan`, and
inverse trigonometric integrals remain unsupported. A nonzero inner slope is
divided out with exact BigInt fractions, while slope zero is handled first as
a constant function.

Endpoint contributions from polynomials, exponentials, sine, and cosine are
merged into one typed coefficient map. The only trigonometric rewrites are
`sin(-r)=-sin(r)`, `cos(-r)=cos(r)`, `sin(0)=0`, and `cos(0)=1`; periodic,
addition-formula, or numerical approximations are forbidden. Rational
constants share the exponential family's sort position as a virtual
`exp(0)`, so the new formatter remains consistent with the earlier exact
exponential normal form. Every subtree is certified before zero coefficients,
cancellation, or equal bounds can produce zero. Thus an invalid form such as
`0*sin(1/x)` or an equal-bound `sin(x)^0` never becomes verified by a
short-circuit.

## D-017: Isolate pure pi-bound trigonometric integrals

**Status:** accepted
**Date:** 2026-08-11

The first exact-angle extension is a separate route rather than a widening of
the existing rational-bound evaluator. Both bounds must be pure rational
multiples `q*pi` (with zero valid in either representation), and the complete
integrand must be a finite rational-coefficient sum of `sin(ax+b*pi)` and
`cos(cx+d*pi)` terms with rational slopes. Polynomial and exponential terms,
mixed rational/`pi` bounds, nonzero rational phase shifts, and `pi`-valued
slopes remain unsupported on this route; no supported subset is extracted from
a larger expression.

Angles are held as immutable `Q+Q*pi` pairs, while accepted bounds are further
restricted to the pure `Q*pi` subset. Period and quadrant reduction uses only
BigInt fractions. Multiples of 15 degrees are expanded into a flat rational
basis over `1`, `√2`, `√3`, and `√6`; other rational multiples of `pi` remain
typed formal atoms. Each flat basis term retains a rational coefficient, so
the positive-before-negative canonical order never needs a numerical sign
test involving `pi` or radicals. Math.PI, decimal trigonometry, numerical
quadrature, CAS integration, and tolerance comparisons are forbidden as
verification evidence.

Every angle subtree and every source term is validated before zero scaling,
cancellation, or equal bounds can produce zero. `sin` and `cos` keep separate
32-term limits. Ambiguous forms such as `3/4pi`, nonlinear `pi` expressions,
and malformed bounds remain invalid or unsupported rather than being guessed.

## D-018: Isolate pure pi slopes over rational bounds

**Status:** accepted
**Date:** 2026-08-11

A second exact-angle route handles finite rational bounds and a complete
integrand made only from rational-coefficient `sin(a*pi*x+b*pi)` and
`cos(c*pi*x+d*pi)` terms, with rational `a`, `b`, `c`, and `d`. It runs only
after the existing rational-radian trigonometric evaluator returns typed
unsupported. Ordinary rational slopes and polynomial or exponential terms are
never mixed with supported `pi` slopes by solving only part of an expression.

For a nonzero slope `a*pi`, primitive coefficients are stored in the flat
exact basis with `piPower=-1`; a zero slope is handled before division as a
constant function with `piPower=0`. Endpoint angles are pure rational
multiples of `pi`, so the existing BigInt period/quadrant reduction, exact
15-degree radical table, and nonstandard formal atoms remain applicable. The
canonical key always includes `piPower`, preventing a coefficient `q` from
being incorrectly combined with `q/pi`. Formatting uses unambiguous forms such
as `2/pi`, `√2/(2*pi)`, and `3*sin(pi/5)/(2*pi)`.

The phase analyzer keeps both exact `Q+Q*pi` coefficients and structural
`xBearing`/`piBearing` ledgers. Addition and subtraction never clear those
ledgers merely because a value cancels to zero. Consequently `x*x`, `pi*pi`,
variable or `pi` denominators, zero-scaled nonlinear subtrees, and equal-bound
shortcuts remain unsupported. Safe linear cancellations such as
`(pi-pi)*x` are accepted only after every subtree has been certified.
Ambiguous source forms including `pi/2x`, `pi2*x`, and `pi 2*x` are invalid;
explicit forms such as `(pi/2)*x` and `pi/2*x` remain distinct and accepted.
Math.PI, floating-point trigonometry, CAS integration, numerical quadrature,
and tolerance comparisons are forbidden as verification evidence.

## D-019: Certify finite rational-point limits by exact zero orders

**Status:** accepted
**Date:** 2026-08-15

The first project-owned limit path accepts a finite rational approach point
and a complete one-variable polynomial or rational expression. It uses a
separate rational-function profile that permits integer exponents from -4
through 4 and polynomial or original-domain factors through degree four,
with at most ten distinct nonconstant original-domain factors, without
widening the existing equation and inequality profiles. Every AST subtree and
every source denominator is validated before zero multiplication,
cancellation, or zero powers can simplify the visible expression.

At `x=a`, exact synthetic division determines the orders `m` and `n` of
`x-a` in the numerator and denominator. If `m>n`, the limit is zero; if
`m=n`, it is the exact residual ratio; and if `m<n`, the residual ratio sign
and the parity of `n-m` determine the two one-sided signed infinities. A
two-sided mismatch is a verified exact nonexistence result, not unsupported or
an approximate answer. A zero numerator is handled only after the complete AST
and punctured-domain ledger have been certified.

Original denominator factors survive cancellation so removable holes and
nested-division exclusions remain visible in the solution trace. The public
core API rejects a zero domain factor because no punctured neighborhood then
exists. Irrational finite approach points, expressions containing function
calls, absolute values, piecewise expressions, sequences, and profile
overflows remain unsupported or invalid. Signed infinity is governed by
D-022. Floating-point samples, epsilon
heuristics, CAS limits, and tolerance
comparisons are forbidden as verification evidence.

## D-020: Compute polynomial area by exact intersection partitions

**Status:** accepted
**Date:** 2026-08-15

The first area-application path requires two complete curve expressions, or
equivalent curve definitions in a fixed Japanese form, and either an ordered
rational interval or an explicit request for the interval between two distinct
real intersections. Each curve and every source subtree
must be a rational-coefficient polynomial through degree four. Their difference
must be quadratic or lower, which is the deliberate boundary that lets the
engine enumerate every real intersection exactly without graph inference or a
general algebraic-number system.

The core forms `h=f-g`, inserts every exact root of `h` in the requested
interval into an ordered partition, certifies the sign on each open piece with
an exact rational sample, and compares that sign with the exact antiderivative
difference. Area is the sum of those nonnegative piece values, not the absolute
value of one signed integral. Rational roots and one quadratic field `Q+Q√d`
remain exact throughout ordering, evaluation, addition, and formatting.

The parser accepts only the documented `area_[a,b](f;g)`,
`area_intersections(f;g)`, and fixed complete Japanese forms. It rejects
diagram cues, missing curves or bounds, trailing answers, destructive LaTeX
delimiters, and compatibility characters that could normalize into a different
formula. Intersection mode fails unless there are exactly two distinct real
roots. Functions, variable denominators, degree overflow, identical curves in
intersection mode, and inferred regions remain unsupported or invalid.
Floating-point roots, graph sampling, CAS integration, and numerical quadrature
are forbidden as verification evidence. The public core boundary revalidates
canonical dense coefficient arrays and returns copied, deeply frozen evidence.

## D-021: Start volumes of revolution with certified nonnegative washers

**Status:** accepted
**Date:** 2026-08-15

The first volume-of-revolution path accepts only an explicit increasing
rational interval and rotation about the x-axis. Its disk form declares one
outer radius and uses inner radius zero; its washer form declares outer radius
first and inner radius second. Both are complete rational-coefficient
polynomials of degree at most two. No curve, interval, axis, or inside/outside
relationship is inferred from a graph or from intersections.

For a quadratic-or-lower polynomial, the minimum on a closed rational interval
is determined exactly by its endpoint values and, only for an upward-opening
quadratic whose vertex lies inside, its vertex value. The core uses this rule
to certify `r>=0`, `R-r>=0`, and `R>=0`. It then forms `R²-r²` by direct
coefficient convolution, integrates the degree-four-or-lower result with
BigInt fractions, and returns `pi*∫(R²-r²)dx` as a typed exact rational
multiple of `pi`. A negative integral after those certificates is a verification
failure, never an absolute-value correction.

Signed curves that cross the axis, profiles whose outer/inner order changes,
intersection-derived bounds, y-axis or arbitrary-axis rotation, and shell
methods remain unsupported. A general region between signed curves would need
partitions at roots of `f`, `g`, `f-g`, and `f+g`; even quadratic inputs can
then produce sums from several unrelated quadratic fields. The current
single-field area value type cannot represent that result safely, so the
engine rejects it rather than sampling, guessing an ordering, or using a
decimal approximation. The public volume core revalidates dense canonical
coefficient arrays and returns copied, deeply frozen curves, certificates,
integral evidence, and exact values.

## D-022: Certify rational-function limits at each signed infinity by leading terms

**Status:** accepted
**Date:** 2026-08-15

The existing bounded rational-function profile is extended from finite
rational approach points to separately requested `+∞` and `-∞`. The parser
does not treat infinity as a finite point with a left/right suffix: it accepts
one explicit signed destination, normalizes it to a distinct approach kind,
and rejects combined `±∞`, composite infinity expressions, and attached
one-sided directions. The public solver remains `finite-limit` for stored
history compatibility even though its accepted approach set is broader.

For a nonzero numerator `P` and denominator `Q`, the result is determined by
their exact degrees and leading-coefficient ratio. If `deg P<deg Q` the limit
is zero; equal degrees return the leading ratio; and `deg P>deg Q` returns
signed infinity. At `-∞`, an odd degree difference reverses that sign. An
identically zero numerator returns zero only after the complete original AST
and domain ledger have passed the same profile validation used at finite
points.

The engine also supplies explicit tail-domain evidence. For every nonzero
reduced denominator or original domain polynomial
`p=a_n x^n+...+a_0`, the rational Cauchy bound
`1+Σ_(i<n)|a_i/a_n|` encloses all of its roots. The maximum of those bounds
therefore certifies that the function is defined on both sufficiently distant
tails. Finite holes remain preserved without affecting the infinity result.
No common-factor cancellation, numerical sampling, floating point, CAS limit,
or heuristic asymptote detection is accepted as proof. Non-rational function
limits and expressions above the existing degree/factor profile remain
unsupported.
