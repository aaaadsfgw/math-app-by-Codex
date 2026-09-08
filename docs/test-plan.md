# Test plan

## Automated checks

Run after every coherent change:

```powershell
npm.cmd test
npm.cmd run check
```

The test suite must cover successful solving, verification, malformed input,
unsupported input, hint answer-leak prevention, storage migration, and
imported-verification downgrade.

The Digicon learning workflow additionally requires automated coverage for:

- one solver run while Hint 1, Hint 2, Steps, Answer, and explanation are
  revealed for unchanged input;
- one Study history record with unique staged-output usage;
- zero history API calls in Quick Mode and when Study history saving is off;
- new attempts after question, source, or review-parent changes, while a
  Quick/Study round trip resumes the same Study record without Quick stages;
- selection, clipboard, manual, review, and confirmed-OCR source metadata;
- unsupported/invalid results never reaching presentation, history, or the
  clipboard;
- structured web-selection extraction from complete HTML `sup`/`sub`, native
  MathML, and one-to-one KaTeX/MathJax semantic MathML, including nested
  fractions and square roots;
- whole-selection plain-text fallback for partial/unknown/malformed math DOM,
  plus negative cases proving `x2`, `x1`, `12`, and `log2(x)` are not inferred;
- structured quadratic and rational-equation selections reaching their real
  verified solvers while failed or ambiguous selections leave the clipboard
  unchanged;
- history failures preserving a verified displayed or copied result;
- v2 UI selector, label, source, OCR-state, editable-candidate, explicit-solve,
  and staged-metric contracts;
- OCR crop geometry including reverse drags, viewport clipping, minimum size,
  actual screenshot scaling, malformed dimensions, and empty crops.
- OCR protocol/session validation including message direction, sender tab,
  main-frame document ID, source URL, expiry, phase transitions, duplicate
  submission, and a storage schema that rejects image data;
- on-demand overlay cleanup for Esc, background rejection, tab changes, and
  completion, plus two-frame screenshot preparation, switch-away-and-back
  detection, and same-URL reload rejection;
- strict PNG decoding and byte/pixel/dimension limits, offscreen preview
  creation, Blob-URL expiry/revocation, and confirmation-tab ownership/closure
  cleanup;
- pinned OCR asset/runtime integrity and license presence, output-policy checks,
  conservative candidate normalization, malformed/unbalanced output rejection,
  and no ambiguous-glyph guessing;
- WebGPU-first session construction, automatic WASM fallback, warm-session
  reuse, timeout, cancellation, worker termination, disposal, provider errors,
  missing end token, and repetition-guard failure;
- recognition alone causing no solver call, pending question, history record,
  or clipboard change; only separately confirmed editable text may enter the
  solver with `source: "ocr"` and `ocrConfirmed: true`;
- manifest checks that Chrome 109 is the minimum and incognito use stays
  disabled for the shared offscreen-preview boundary, while the extension CSP
  permits only the packaged WASM runtime and no remote script or host access.

A dependency-free Node VM harness executes the classic overlay lifecycle with
minimal DOM, event, timer, animation-frame, and extension-message fakes. It
covers trusted dragging, reverse normalization, two-frame preparation,
completion, Esc, background rejection, and fail-closed routing. It does not
prove Chrome isolated-world routing, dialog/top-layer rendering, frame paint,
or actual screenshot pixels; the action-driven unpacked-Chrome smoke below
covers that primary path.

## Digicon workflow smoke test

1. In the popup, switch to Quick Mode, solve `2x+3=11` as Hint 1 and then
   Answer, and confirm no history record is created.
2. Switch to Study Mode, use Hint 1, Hint 2, Steps, then Answer for the same
   problem, and confirm one history item contains all four viewed stages.
3. Confirm changing the problem creates an attempt boundary. Confirm a
   Quick/Study round trip resumes the same Study record, excludes stages viewed
   in Quick, and does not rerun the solver.
4. Select `2x+3=11` on a normal page and press the shortcut; confirm the
   selection is used before the clipboard. Repeat with no selection and
   confirm the clipboard input is used. For unsupported input, confirm the
   original clipboard is unchanged.
5. On a page containing HTML `x<sup>2</sup>`, native MathML, KaTeX, and MathJax,
   select the complete displayed formula `2x²+5x+2=0`. Confirm the shortcut
   reaches the verified answer `x=-2,-1/2`. Select only part of an exponent or
   fraction and confirm the range is not expanded. Select literal plain text
   `x2+5x+2=0` and confirm it remains unsupported and the clipboard is not
   replaced. `tests/browser/selection-structure-harness.html` provides nine
   DOM/Range smoke cases for this boundary.
6. Open History and Analytics and confirm source, viewed stages, Hint 1/2,
   Steps, direct Answer rate, understanding, and review priority agree with the
   Study attempt. Confirm Quick interactions are absent.
7. Use the popup OCR action on one tightly cropped printed formula. Confirm the
   crop and editable candidate are shown together, no solver runs after
   recognition, and the solver starts only after the separate confirmation.
   In Study Mode confirm the saved source is OCR and confirmation is recorded
   separately from solver verification.

## Unpacked-Chrome printed-formula OCR smoke test

Use only an isolated disposable Chrome profile with DevTools remote debugging
enabled. The flow test clears the extension's local and session storage in that
profile. Do not point it at a daily-use Chrome profile. Node tests alone cannot
prove real screenshot pixels, extension Worker/CSP behavior, WebGPU operators,
or the WASM runtime in Chrome.

Start the loopback fixture server in one terminal, launch the isolated Chrome
with `--remote-debugging-port=9333` and
`--enable-unsafe-extension-debugging`, then run the action-driven flow in a
second terminal:

```powershell
npm.cmd run test:browser:serve
npm.cmd run test:browser:ocr-flow -- 9333 --allow-storage-reset
```

The flow loads the current unpacked directory, triggers the real browser action,
performs trusted pointer and keyboard input, and verifies Study and Quick from
capture through cleanup. A remote-debugging window may not be OS-focused; only
when Chrome reports no `currentWindow`, the harness substitutes the sole active
tab whose URL exactly matches its loopback fixture. Product routing code is not
changed. On 2026-09-08, isolated Chrome 152 selected WebGPU, recognized `x + y`
in both modes, used a 290 x 121 crop, saved one Study record, saved no Quick
record, and revoked both previews.

For the reproducible provider/runtime check, launch an isolated Chrome for
Testing profile with remote debugging and the unpacked extension, then run
`node scripts/ocr-browser-smoke.mjs 9333 [extensionId] [either|webgpu|wasm-fallback]`.
Use `webgpu` for the normal GPU profile and `wasm-fallback` for the forced
fallback profile. The script opens only
the extension's offscreen document and checks the packaged smoke image through
explicit WebGPU, explicit WASM, and the real Worker-backed `OcrEngine`. It runs
two Worker recognitions to verify warm-session reuse. It complements the full
action-driven flow above, and its reported provider
must be checked in the JSON output (a WebGPU initialization error is expected
only in the separately forced-fallback profile).

1. Load the unpacked extension in Chrome 109 or newer. Confirm no model, script,
   or data request leaves the extension.
2. Open an ordinary HTTP/HTTPS page with a clear, machine-printed single
   formula, start OCR from the popup, and drag a close crop around that formula.
3. Drag in both directions and confirm a range smaller than 24 CSS px is kept
   selectable, while Esc removes the overlay immediately.
4. Select a valid range. Confirm the overlay is absent from the captured image
   and local `ocr-confirm.html` shows the intended crop without solving it.
5. Start recognition on a WebGPU-capable Chrome profile. Confirm the displayed
   provider is WebGPU, candidate text is editable, the crop stays visible, and
   recognition alone creates no result, pending solve, history item, or
   clipboard change.
6. Disable WebGPU for a separate run or force the test seam to reject WebGPU
   session creation. Confirm the same packaged feature reports WASM and returns
   an editable candidate without any network request.
7. Edit one character, choose the separate solve action, and confirm the edited
   text—not the raw OCR text—enters the existing solver. In Study Mode verify
   `source: "ocr"` and `ocrConfirmed: true`; verify the final answer is marked
   only by deterministic solver verification.
8. Repeat and cancel during active recognition. Confirm the Worker terminates,
   no late result appears, and a retry starts cleanly. Also exercise timeout and
   dispose/reopen behavior. For two successful consecutive crops, confirm the
   second request may reuse a warm session without mixing results.
9. Use malformed/oversized input and a crop containing handwriting, prose, a
   diagram, or two formulas. Confirm the feature fails or presents only an
   untrusted candidate; it must not infer omitted information or auto-confirm.
10. Press **プレビューを破棄して閉じる** and confirm the preview disappears
    and the confirmation tab closes. Repeat after switching tabs during
    selection and after waiting past the ten-minute expiry; neither case may
    capture another tab, leave an overlay, or preserve a usable image URL.

## Unpacked Chrome smoke test

1. Load the repository as an unpacked extension.
2. Confirm the manifest requests no network host permission.
3. Solve `2x+3=11` in all five output modes.
4. Confirm Hint 1 and Hint 2 do not reveal `x=4`.
5. Confirm working and explanation contain the verified final answer.
6. Confirm the result is saved and can be self-assessed.
7. Select `2x+3=11` on an ordinary web page and press the shortcut.
8. Confirm `x=4` is copied, a success toast appears, and history is saved.
9. Solve `∫_0^1 x^2 dx` and confirm the exact answer is `1/3`, both hints hide
   that answer, and the typed working is retained in history.
10. Solve `∫_0^1 2exp(2x+1) dx` and confirm the exact answer is
    `exp(3)-exp(1)`, then confirm `∫_0^1 x*exp(x) dx` and `∫_0^1 1e2 dx`
    receive no verified answer.
11. Solve `∫_0^1 sin(x) dx` and confirm the exact radian-form answer is
    `1-cos(1)`, then confirm `∫_0^1 sin(x)^2 dx` and
    `∫_0^0 sin(1/x) dx` receive no verified answer.
12. Solve `∫_0^pi sin(x) dx` and `∫_0^(pi/4) cos(x) dx`; confirm the exact
    answers are `2` and `√2/2`, while `∫_0^pi (x+sin(x)) dx` and
    `∫_0^pi sin(pi*x) dx` receive no partial or verified answer.
13. Solve `∫_0^1 sin(pi*x) dx` and `∫_0^1 cos(pi*x/5) dx`; confirm the exact
    answers are `2/pi` and `5*sin(pi/5)/pi`. Confirm
    `∫_0^1 (sin(x)+sin(pi*x)) dx` is unsupported and `pi/2x`, `pi2*x`, and
    `pi 2*x` inside a trigonometric argument are invalid rather than guessed.
14. Solve `lim_(x->1) (x^2-1)/(x-1)`, `lim_(x->1+) 1/(x-1)`, and
    `lim_(x->1) 1/(x-1)`; confirm `2`, `+∞`, and the exact left/right mismatch.
    Confirm both hints hide those final results and history classifies them as
    limits. Solve `lim_(x->∞) 1/x`, `lim_(x->-∞) x^3`, and
    `lim_(x->+∞) (2x^2+1)/(x^2-3)`; confirm `0`, `-∞`, and `2`, and
    confirm the working records a certified tail-domain bound. Submit
    `lim_(x->±∞) 1/x`, `lim_(x->0) sin(x)/x`, and `lim_(x->1 2) x`;
    confirm the first and third are invalid, the second is unsupported, and
    none receives a verified answer.
15. Solve `tangent_x_[1](x^2)`,
    `tangent_point_((1/2),(1/8))(x^3)`, and
    `曲線 y=x^2 上の点 (1,1) における接線の方程式を求めよ`; confirm the
    exact answers are `y=2x-1`, `y=(3/4)x-1/4`, and `y=2x-1`.
    Confirm the working records exact coefficient differentiation, declared
    point membership where applicable, and the final point/slope checks. Both
    hints must hide the final line, and history must use solver ID
    `polynomial-tangent` and category `微分`. Submit
    `tangent_point_(1,2)(x^2)`, `tangent_x_[0](sin(x))`,
    `tangent_x_[1](1/x)`, `tangent_x_[1](x^5)`, and a graph-dependent
    tangent; confirm the false point is invalid, the others are unsupported,
    and none receives a verified answer.
16. Solve `normal_x_[1](x^2)`, `normal_[0](x^2)`,
    `normal_point_((1/2),(1/8))(x^3)`, and
    `曲線 y=x^2 上の点 (1,1) における法線の方程式を求めよ`; confirm
    the exact answers are `y=-(1/2)x+3/2`, `x=0`,
    `y=-(4/3)x+19/24`, and `y=-(1/2)x+3/2`. Confirm working records exact
    coefficient differentiation, declared-point membership where applicable,
    the implicit equation `x-a+f'(a)(y-b)=0`, contact-point substitution, and
    zero tangent/normal dot product. The horizontal-tangent case must remain a
    true vertical line without `Infinity` or `NaN`. Both hints must hide the
    finished equation, normal slope, and intercept; history must use solver ID
    `polynomial-normal` and category `微分`. Submit
    `normal_point_(1,2)(x^2)`, `normal_x_[0](sin(x))`,
    `normal_x_[1](1/x)`, `normal_x_[1](x^5)`, a circle normal, a parametric or
    polar normal, and a graph-dependent normal. Confirm the false point is
    invalid, every valid out-of-profile request is unsupported, and none
    receives a verified answer. Repeat valid canonical/Japanese requests with
    an intentionally wrong category and confirm normal preflight still wins.
    Confirm bare implicit curves, surfaces, `図1`, and attached-image requests
    remain recognized `unsupported`, while unrelated identifiers such as
    `normal_distribution` are not captured by the normal parser. Repeat a
    valid Japanese form with CR/LF, vertical tab, form feed, NEL, line
    separator, and paragraph separator; each must behave as whitespace, while
    a separator between two digits remains invalid.
17. Solve `monotonicity(x^3-3x)`, `extrema(x^3)`,
    `monotonicity_extrema(x^3+x^2-2x)`, and
    `関数 f(x)=x^3-3x の増減を調べ、極値を求めよ`. Confirm the first
    result is increasing on `(-∞,-1]` and `[1,+∞)` and decreasing on
    `[-1,1]`; confirm the second has no local extrema and reports `(0,0)` as a
    stationary non-extremum. The combined radical case must keep its critical
    coordinates `(-1-√7)/3`, `(-1+√7)/3` and their values in exact
    `Q+Q√d` form. Confirm the working contains exact derivative-root and sign-
    cell certificates, both hints hide critical coordinates, completed
    intervals, and extrema, and history uses solver ID `polynomial-variation`
    with category `微分`. Submit `monotonicity(x^4)`,
    `monotonicity_[0,1](x^2)`, `関数 y=x^2 の最大値を求めよ`,
    `monotonicity(sin(x))`, and a graph-dependent variation request; confirm
    all are unsupported. Submit `monotonicity(x^2=1)` and
    `関数 y=x^2 の極値は0`; confirm both are invalid and none of these
    rejection cases receives a verified answer.
18. Solve `area_[0,2](x^2;2x)`, `area_intersections(x^2;2x)`, and
    `area_[-2,2](x^2;2)`; confirm the exact answers are `4/3`, `4/3`, and
    `(-8+16√2)/3`. Confirm the working partitions at every intersection, both
    hints hide the final area, and history classifies the results as integrals.
    Also solve `曲線 y=x^2-1 と x軸 で囲まれた部分の面積を求めよ` and
    confirm `x軸` is treated as `y=0` and the exact result is `4/3`.
    Submit `area_intersections(x^2;0)`, `area_[0,1](sin(x);0)`, and a
    diagram-dependent region; confirm none receives a verified answer.
19. Solve `volume_x_axis_[0,1](x)` and
    `volume_x_axis_[0,1](x+2;x+1)`; confirm the exact answers are `pi/3` and
    `4*pi`, the working certifies both radii over the whole interval, and both
    hints hide the final volume. Submit a y-axis rotation, a crossing radius,
    and a diagram-only region; confirm none receives a verified answer.
20. Submit an unsupported trigonometric equation, an improper integral such as
   `∫_0^1 1/x dx`, a proof, and a diagram-dependent problem; confirm none
   receives a guessed or verified answer.
21. Verify history filters, JSON import/export, analytics, review rerun, setting
    reset, and full data deletion.
22. Reload the extension and repeat the shortcut to cover service-worker
    cold-start behavior.

## Release-scale evaluation

Before completion, run the current versioned 5,500-case corpus and report:

- exact-answer accuracy by domain;
- unsupported/invalid classification accuracy;
- false-verification count;
- hint final-answer leakage;
- performance at median, p95, and worst case;
- browser smoke-test date and Chrome version.

Zero false verification is the release gate.

## Browser worker harness

`tests/browser/symbolic-worker-harness.html` provides a browser-engine check
that does not require extension APIs. Serve the repository locally, open the
harness, and require all rows to show `PASS` with no browser console errors.
This validates the bundled module worker and symbolic operations but does not
replace the unpacked Chrome test above.
