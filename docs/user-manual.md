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

For an exact definite integral, enter `∫_0^1 x^2 dx`,
`0から1までx^2を定積分せよ`, or `x^2を0から1まで定積分せよ`.
Use signed integers, finite decimals, or explicit fractions for both bounds.
The current supported integrand is a rational-coefficient `x` polynomial
through degree 32 plus at most 32 terms of the form `q*exp(ax+b)`, with rational
`q`, `a`, and `b`. For example, `∫_0^1 2exp(2x+1) dx` returns the exact value
`exp(3)-exp(1)`. Put function arguments in parentheses; `e^(2x+1)` is also
accepted. Scientific notation such as `1e2` is not accepted, so write a finite
decimal or make multiplication by Euler's constant explicit with `*`.

A variable denominator, nonlinear exponent, product such as `x*exp(x)`,
infinite or variable bound, trigonometric or other unsupported function, or
hidden undefined point produces an unsupported message. The extension does
not silently treat it as a proper integral or replace an exact result with a
numerical estimate.

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
