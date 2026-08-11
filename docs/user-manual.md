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
