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
9. Submit an unsupported trigonometric, calculus, proof, and diagram-dependent
   problem; confirm none receives a guessed or verified answer.
10. Verify history filters, JSON import/export, analytics, review rerun, setting
    reset, and full data deletion.
11. Reload the extension and repeat the shortcut to cover service-worker
    cold-start behavior.

## Release-scale evaluation

Before completion, run the versioned 1,000+ case corpus and report:

- exact-answer accuracy by domain;
- unsupported/invalid classification accuracy;
- false-verification count;
- hint final-answer leakage;
- performance at median, p95, and worst case;
- browser smoke-test date and Chrome version.

Zero false verification is the release gate.
