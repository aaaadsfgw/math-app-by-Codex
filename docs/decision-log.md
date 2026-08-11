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
