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
16. Solve `area_[0,2](x^2;2x)`, `area_intersections(x^2;2x)`, and
    `area_[-2,2](x^2;2)`; confirm the exact answers are `4/3`, `4/3`, and
    `(-8+16√2)/3`. Confirm the working partitions at every intersection, both
    hints hide the final area, and history classifies the results as integrals.
    Also solve `曲線 y=x^2-1 と x軸 で囲まれた部分の面積を求めよ` and
    confirm `x軸` is treated as `y=0` and the exact result is `4/3`.
    Submit `area_intersections(x^2;0)`, `area_[0,1](sin(x);0)`, and a
    diagram-dependent region; confirm none receives a verified answer.
17. Solve `volume_x_axis_[0,1](x)` and
    `volume_x_axis_[0,1](x+2;x+1)`; confirm the exact answers are `pi/3` and
    `4*pi`, the working certifies both radii over the whole interval, and both
    hints hide the final volume. Submit a y-axis rotation, a crossing radius,
    and a diagram-only region; confirm none receives a verified answer.
18. Submit an unsupported trigonometric equation, an improper integral such as
   `∫_0^1 1/x dx`, a proof, and a diagram-dependent problem; confirm none
   receives a guessed or verified answer.
19. Verify history filters, JSON import/export, analytics, review rerun, setting
    reset, and full data deletion.
20. Reload the extension and repeat the shortcut to cover service-worker
    cold-start behavior.

## Release-scale evaluation

Before completion, run the current versioned 5,000-case corpus and report:

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
