import assert from "node:assert/strict";
import test from "node:test";

import { createRealSet, formatRealSet } from "../js/math-core/real-set.js";

test("空集合・実数全体・開閉区間・半直線を構造化して表示する", () => {
  assert.equal(formatRealSet(createRealSet({ kind: "empty" })), "解なし");
  assert.equal(formatRealSet(createRealSet({ kind: "all-real" })), "すべての実数");
  assert.equal(
    formatRealSet(createRealSet({
      intervals: [{
        lower: { exact: "1", approximate: 1 },
        upper: { exact: "3", approximate: 3 },
        lowerClosed: false,
        upperClosed: true,
      }],
    })),
    "1<x≤3",
  );
  assert.equal(
    formatRealSet(createRealSet({
      intervals: [
        { lower: null, upper: { exact: "-2", approximate: -2 } },
        {
          lower: { exact: "2", approximate: 2 },
          upper: null,
          lowerClosed: true,
        },
      ],
    })),
    "x<-2 または 2≤x",
  );
});

test("閉じた1点区間は等式として表示し、不正区間を拒否する", () => {
  assert.equal(
    formatRealSet(createRealSet({
      intervals: [{
        lower: { exact: "2", approximate: 2 },
        upper: { exact: "2", approximate: 2 },
        lowerClosed: true,
        upperClosed: true,
      }],
    })),
    "x=2",
  );
  assert.throws(
    () => createRealSet({
      intervals: [{
        lower: { exact: "3", approximate: 3 },
        upper: { exact: "1", approximate: 1 },
      }],
    }),
    /下端/,
  );
});

