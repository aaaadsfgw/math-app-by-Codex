import assert from "node:assert/strict";
import test from "node:test";

import {
  createAffinePrimePowerSide,
  createConstantPrimePowerSide,
  factorPositiveRational,
  solveAffinePrimePowerEquality,
  verifyAffinePrimePowerCandidate,
} from "../js/math-core/exact-prime-power.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

const rational = (value) => ExactRational.parse(value);

test("正の有理数を分子・分母の素因数指数へ厳密分解する", () => {
  assert.deepEqual(
    factorPositiveRational(rational("2.88")),
    [
      { prime: "2", exponent: 3n },
      { prime: "3", exponent: 2n },
      { prime: "5", exponent: -2n },
    ],
  );
  assert.deepEqual(factorPositiveRational(rational("1")), []);
});

test("乗法的に従属する底から厳密な有理数解を作る", () => {
  const left = createAffinePrimePowerSide(rational("4"), rational("0"), rational("1"));
  const right = createConstantPrimePowerSide(rational("8"));
  const relation = solveAffinePrimePowerEquality(left, right);
  assert.equal(relation.state, "exact");
  assert.equal(relation.candidate.toString(), "3/2");
  assert.equal(verifyAffinePrimePowerCandidate(relation, relation.candidate), true);
});

test("恒等式・矛盾・対数比が必要な形を区別する", () => {
  const twoX = createAffinePrimePowerSide(rational("2"), rational("0"), rational("1"));
  const twoXAgain = createAffinePrimePowerSide(rational("4"), rational("0"), rational("0.5"));
  assert.equal(solveAffinePrimePowerEquality(twoX, twoXAgain).state, "identity");

  const shifted = createAffinePrimePowerSide(rational("4"), rational("1"), rational("0.5"));
  assert.equal(solveAffinePrimePowerEquality(twoX, shifted).state, "none");

  const three = createConstantPrimePowerSide(rational("3"));
  assert.equal(solveAffinePrimePowerEquality(twoX, three).state, "requires-logarithm");
});
