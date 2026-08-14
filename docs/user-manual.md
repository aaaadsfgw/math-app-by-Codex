# User manual

## Solve a problem

1. Open the extension popup.
2. Type a textual mathematics question, or capture selected text from a normal
   web page.
3. Choose answer, hint 1, hint 2, working, or explanation.
4. Select **解析する**.
5. Check the verification label and record how independently you solved it.

The extension shows a clear unsupported message when it cannot safely solve the
format. It does not fill the gap with a guessed response.

For logarithmic equations, use forms such as `log_2(x)=3`, `log₂(x)=3`, or
`ln(x)=0`. The argument parentheses are required. Bare `log(x)` and `ln(x)`
both mean the natural logarithm; use `log_10(x)` for an explicit base 10.

For rational inequalities, use explicit parentheses or multiplication around
every denominator, for example `1/(x-1)>0`, `1/(x(x+1))>=0`, or
`(1/x)*(x+1)<0`. The extension rejects ambiguous input such as `1/x(x+1)>0`
or `1/2x<1`. Values that made an original denominator zero remain excluded
even when algebraic cancellation removes that factor from the visible formula.

For a finite limit, use `lim_(x->2) (x^2-4)/(x-2)`,
`lim_(x->1+) 1/(x-1)`, `lim x→1 1/(x-1)^2 を求めよ`, or a Japanese form such
as `xを1に左から近づけるとき 1/(x-1) の極限を求めよ`. The approach point
may be a signed integer, finite decimal, or explicit fraction. A trailing `+`
or `-` selects the right- or left-hand limit. The current exact path accepts
integer exponents from -4 through 4 and requires every intermediate
one-variable polynomial, rational numerator/denominator, and original domain
factor to stay at degree four or below. At most ten distinct nonconstant
original domain factors are accepted. It retains holes from every original
denominator and returns an exact finite
fraction, signed infinity, or a verified statement that the two-sided limit
does not exist. Infinite approach points, roots, absolute values, piecewise
expressions, limits containing trigonometric/exponential/logarithmic or other
non-rational functions, and sequence limits are currently unsupported.
Do not write scientific notation or ambiguous forms such as `1/2x`; the
extension rejects them instead of guessing.

For an exact definite integral, enter `∫_0^1 x^2 dx`,
`0から1までx^2を定積分せよ`, or `x^2を0から1まで定積分せよ`.
Use signed integers, finite decimals, or explicit fractions for both bounds.
The current supported integrand is a rational-coefficient `x` polynomial
through degree 32 plus bounded finite sums of `q*exp(ax+b)`, `r*sin(cx+d)`,
and `s*cos(ex+f)`, with rational coefficients. For example,
`∫_0^1 2exp(2x+1) dx` returns `exp(3)-exp(1)`, while
`∫_0^1 sin(x) dx` returns `1-cos(1)`. Sine and cosine arguments are radians;
you may also use pure rational multiples of `pi` as both bounds for a
sin/cos-only problem. For example, `∫_0^pi sin(x) dx` returns `2` and
`∫_0^(pi/4) cos(x) dx` returns `√2/2`. Nonstandard values such as
`sin(pi/5)` remain exact symbols and are never replaced by decimals. Put
function arguments in parentheses; `e^(2x+1)` is also accepted. Scientific
notation such as `1e2` is not accepted, so write a finite decimal or make
multiplication by Euler's constant explicit with `*`.

With rational bounds, a separate sin/cos-only path accepts arguments such as
`pi*x`, `(pi/2)*x+pi/6`, and `3*pi*x-pi/4`. For example,
`∫_0^1 sin(pi*x) dx` returns the exact value `2/pi`, and
`∫_0^1 cos(pi*x/5) dx` returns `5*sin(pi/5)/pi`. Keep division scope explicit:
write `(pi/2)*x` or `pi/2*x`, not `pi/2x`. Ambiguous forms such as `pi2*x`,
`pi 2*x`, and `1/2pi*x` are rejected instead of guessed.

A variable denominator, nonlinear function argument, product such as
`x*exp(x)` or `sin(x)*cos(x)`, function power, `tan` or inverse trigonometric
integral, infinite or variable bound, unsupported `pi` combination, or hidden
undefined point produces an unsupported message. The extension does not
silently treat it as a proper integral or replace an exact result with a
numerical estimate.
On the `pi`-bound route, use bounds such as `pi/3` or `(3/4)*pi`; polynomial or
exponential terms, mixed bounds such as `1` to `pi`, `sin(pi*x)`, and degree
notation are still unsupported. On the rational-bound `pi`-slope route,
ordinary-radian slopes, polynomial or exponential terms, and mixed expressions
such as `sin(x)+sin(pi*x)` remain unsupported as one whole problem.

## Shortcut

Select a question on an HTTP/HTTPS page and press `Ctrl+Shift+Y`
(`Command+Shift+Y` on macOS). A verified final answer is copied and a toast
confirms success. The extension never reads the existing clipboard.

## History and review

History stores the question, output mode, generated content, verified final
answer, category, verification evidence, self-assessment, and review state.
Imported records lose any claimed verified state until solved again locally.
Legacy records from the earlier prototype remain readable and are labeled as
old unverified or demo history where applicable.

## Privacy

All calculation and storage occur in the extension. There is no model setup,
sign-in, API key, or server connection. Use Settings to reset preferences or
delete all application data.

## Limits

Image recognition, diagram-dependent geometry, construction problems, and
proof prose are outside scope. Current mathematical coverage is listed in
`docs/supported-problems.md` and will expand incrementally.
