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

For a rational-function limit, use `lim_(x->2) (x^2-4)/(x-2)`,
`lim_(x->1+) 1/(x-1)`, `lim_(x->+∞) (2x^2+1)/(x^2-3)`,
`lim x→1 1/(x-1)^2 を求めよ`, or a Japanese form such
as `xを1に左から近づけるとき 1/(x-1) の極限を求めよ`. The approach point
may be a signed integer, finite decimal, explicit fraction, `+∞`, or `-∞`.
A trailing `+` or `-` selects the right- or left-hand limit only for a finite
point. The current exact path accepts
integer exponents from -4 through 4 and requires every intermediate
one-variable polynomial, rational numerator/denominator, and original domain
factor to stay at degree four or below. At most ten distinct nonconstant
original domain factors are accepted. It retains holes from every original
denominator and returns an exact finite
fraction, signed infinity, or a verified statement that the two-sided limit
does not exist. At `+∞` or `-∞`, it compares exact degrees and leading
coefficients and certifies that every original denominator is nonzero on a
sufficiently distant tail. Combined `±∞` or malformed infinity expressions
are invalid. Roots, absolute values, piecewise expressions, limits containing
trigonometric/exponential/logarithmic or other non-rational functions, and
sequence limits are currently unsupported.
Do not write scientific notation or ambiguous forms such as `1/2x`; the
extension rejects them instead of guessing.

For a tangent to a polynomial curve, enter `tangent_x_[1](x^2)` or the alias
`tangent_[1](x^2)` to obtain `y=2x-1`. If the whole contact point is given,
enter `tangent_point_((1/2),(1/8))(x^3)` to obtain
`y=(3/4)x-1/4`. You can also use the complete Japanese forms
`曲線 y=x^2 の x=1 における接線の方程式を求めよ` or
`曲線 y=x^2 上の点 (1,1) における接線の方程式を求めよ`. Coordinates
may be signed integers, finite decimals, or explicit fractions. The curve must
be a rational-coefficient polynomial in `x` of degree at most four. For a
declared point `(a,b)`, the extension verifies `f(a)=b` exactly before it
differentiates the coefficients and builds the line; it then rechecks both the
contact point and the slope. A point not on the curve is invalid. Functions,
variable denominators, degree five or above, geometric tangents, and any curve
or contact point that must be read from a figure or graph are unsupported.

For a normal to a polynomial curve, enter `normal_x_[1](x^2)` or the alias
`normal_[1](x^2)` to obtain `y=-(1/2)x+3/2`. If the whole contact point is
given, enter `normal_point_((1/2),(1/8))(x^3)` to obtain
`y=-(4/3)x+19/24`. You can also use the complete Japanese forms
`曲線 y=x^2 の x=1 における法線の方程式を求めよ` or
`曲線 y=x^2 上の点 (1,1) における法線の方程式を求めよ`. Coordinates
must be finite exact rationals written as signed integers, finite decimals, or
explicit fractions. The curve must be a rational-coefficient polynomial in
`x` whose complete source structure has degree at most four.

For a declared point `(a,b)`, the extension checks `f(a)=b` exactly before
differentiating and setting `m=f'(a)`. It constructs the normal as
`x-a+m(y-b)=0`, verifies that the point lies on that line, and checks exact
orthogonality to the tangent. If the tangent is horizontal (`m=0`), the normal
is the true vertical line `x=a`; the extension does not display infinity or
invent a slope. Only a nonzero `m` uses the normal slope `-1/m`. Both hint
levels avoid revealing the finished line, its normal slope, or its intercept.

A declared point not on the curve is invalid. Functions, variable
denominators, degree five or above even when hidden by cancellation,
non-rational coordinates, circles and other implicit curves, parametric or
polar curves, planes and surfaces, geometric or diagram-dependent normals,
and any curve or contact point that must be read from a figure or graph are
unsupported. The extension does not estimate a normal numerically.

For the monotonicity or local extrema of a polynomial over all real numbers,
enter `monotonicity(f)`, `extrema(f)`, or
`monotonicity_extrema(f)`. For example, `monotonicity(x^3-3x)` returns
`増加区間: (-∞,-1] または [1,+∞); 減少区間: [-1,1]; 一定区間: なし`,
and `extrema(x^3-3x)` returns
`極大: (-1,2); 極小: (1,-2); 極値でない停留点: なし`.

The four complete Japanese instruction forms are `関数 y=f の増減を調べよ`,
`関数 y=f の極値を求めよ`, `関数 y=f の増減を調べ、極値を求めよ`, and
`関数 y=f の増減と極値を求めよ`. You may write `関数 f(x)=f` instead of
`関数 y=f`, and may begin with `次の`. The entire function must be a
rational-coefficient polynomial in `x` of degree at most three. The extension
finds the zeros of `f'`, checks its sign between them, and evaluates every
critical point exactly. Irrational coordinates and values stay in the exact
form `Q+Q√d`; for `x^3+x^2-2x`, the critical coordinates are
`(-1-√7)/3` and `(-1+√7)/3` rather than decimal approximations.

A derivative zero is labeled a local extremum only when the sign changes.
Therefore `extrema(x^3)` returns no maximum or minimum and reports `(0,0)` as
an `極値でない停留点`; its monotonicity result is one increasing interval
over all real numbers. A constant function is reported constant on all real
numbers with no isolated extrema. Here `極値` means local extrema. Requests
for an absolute maximum or minimum are a different, currently unsupported
problem type. Both hint levels avoid revealing the critical coordinates,
finished intervals, or extremum conclusions.

Degree four or above, including a high-degree term hidden by cancellation, an
explicit interval, maximum/minimum, a function or variable denominator,
another variable, concavity or inflection points, a graph outline, and any
information that must be read from a figure, graph, or variation table are
unsupported. Malformed, incomplete, relation-valued, ambiguous-Unicode, or
answer-attached input is invalid rather than guessed.

For an area between two polynomial curves, use
`area_[0,2](x^2;2x)` for an explicit interval or
`area_intersections(x^2;2x)` for the region between exactly two distinct real
intersections. Both give `4/3`. You can also write the complete Japanese form
`x=0からx=2までの区間で、y=x^2とy=2xの間の面積を求めよ`, or
`曲線 y=x^2-1 と x軸 で囲まれた部分の面積を求めよ`. In a fixed
Japanese form, `x軸` is treated as `y=0`. State both
curves and either an ordered interval or the request for their two-intersection
region explicitly; the extension does not infer a region from a diagram. Each
curve may have rational coefficients and degree at most four,
but their difference must be quadratic or lower. The extension finds every
intersection, splits at every one, checks which curve is upper on each piece,
and keeps rational or quadratic-radical areas exact. Explicit bounds must be
finite rational numbers in increasing order. Functions, variable denominators,
higher-degree differences, and an intersection request without exactly two
distinct real intersections produce no verified answer.

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
confirms success. If the page selection is empty, this explicit shortcut reads
the current clipboard as a fallback. Unsupported or invalid input leaves the
clipboard unchanged.

## Printed math image input

Use the popup OCR action only for a tightly cropped machine-printed formula, or
for the supported compact layout with one or two short Japanese problem-number
or instruction lines directly above exactly one formula:

1. Start OCR and drag a close rectangle around that bounded content. Do not
   include a diagram, an arbitrary paragraph, an answer, or a second formula.
2. On the local confirmation page, keep the original crop visible and choose
   the recognition action. Formula recognition stays on the device, prefers
   WebGPU, and automatically tries WASM if WebGPU is unavailable. Safely split
   upper Japanese lines use the separately packaged Tesseract.js WASM path; if
   a mixed crop cannot be separated or supported as Japanese, formula OCR does
   not run on the whole image.
3. Inspect the separate editable problem-number, instruction, formula, and
   conditions fields. Check every sign, exponent, subscript, delimiter,
   variable, and bound, and correct any transcription yourself.
4. Choose the separate solve action only after all fields match the image.
   Discard the crop instead if the result is uncertain.

If recognition or safe layout separation fails, the crop is kept, retry remains
available, and the editable fields remain available for manual transcription.
A non-empty valid formula is required; invisible control characters cannot be
sent to the solver.

The recognition result is an untrusted transcription, not an answer. Merely
running OCR never invokes the solver, creates verified history, or changes the
clipboard. After explicit confirmation, the text enters exactly the same
deterministic workflow as typed input and may still be reported as unsupported
or invalid. A Study record identifies `source: "ocr"` and that confirmation
occurred; those fields do not mean the transcription or answer was correct.

The first recognition can take longer while the packaged formula and Japanese
OCR runtimes initialize. A later crop may reuse their warm sessions. You can
cancel active recognition; timeout, provider failure, invalid output, or
cancellation produces no solver request. No companion program, sign-in, model
download, or network connection is required. Recognition stops after 120
seconds, and the crop/confirmation session expires after ten minutes.

This path is experimental. It is not available for handwriting, photographs,
full pages, arbitrary surrounding prose, more than two upper instruction/label
lines, multiple formulas, tables, graphs, geometry diagrams, spatially
positioned labels, construction problems, or proof interpretation. Incognito
windows remain unsupported while the expiring crop is shared through the
extension's offscreen document.

## History and review

History stores the question, output mode, generated content, verified final
answer, category, verification evidence, self-assessment, and review state.
Imported records lose any claimed verified state until solved again locally.
Legacy records from the earlier prototype remain readable and are labeled as
old unverified or demo history where applicable.

## Privacy

All calculation, OCR, and storage occur in the extension. The transcription
model and runtime are packaged locally; there is no model download, sign-in,
API key, or server connection. Use Settings to reset preferences or delete all
application data.

## Limits

Printed math OCR is limited to exactly one machine-printed formula, optionally
with one or two short horizontal Japanese problem-number/instruction lines
above it, and has experimental accuracy. It does not expand what the
deterministic solver can solve. Handwriting recognition, page/general OCR,
diagram-dependent geometry, construction problems, and proof prose are outside
scope. Current mathematical coverage is listed in
`docs/supported-problems.md` and will expand incrementally.
