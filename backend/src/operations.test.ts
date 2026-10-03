import test from "node:test";
import assert from "node:assert/strict";
import { faceDistance, headTurnPassed } from "./face-rules.js";
import { csvCell } from "./csv.js";

test("malformed and non-finite face descriptors cannot match", () => {
  const descriptor = Array(128).fill(0.1);
  assert.equal(faceDistance(descriptor, descriptor), 0);
  assert.equal(faceDistance([], descriptor), Infinity);
  assert.equal(
    faceDistance([...descriptor.slice(0, 127), NaN], descriptor),
    Infinity,
  );
  assert.equal(
    faceDistance([...descriptor.slice(0, 127), Infinity], descriptor),
    Infinity,
  );
});
test("face check requires a frontal first frame and the requested head movement", () => {
  assert.equal(headTurnPassed(0, 0.06, "LEFT"), true);
  assert.equal(headTurnPassed(0, -0.06, "RIGHT"), true);
  assert.equal(headTurnPassed(0, 0, "LEFT"), false);
  assert.equal(headTurnPassed(0, -0.06, "LEFT"), false);
  assert.equal(headTurnPassed(0.1, 0.2, "LEFT"), false);
  assert.equal(headTurnPassed(NaN, 0.1, "LEFT"), false);
});
test("CSV protects text formulas and correctly quotes commas and quotes", () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('Driver, "A"'), '"Driver, ""A"""');
  assert.equal(csvCell(null), '""');
});
