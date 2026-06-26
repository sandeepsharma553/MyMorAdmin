import contractFill from "./contractFill";
import fx from "./contractFill.fixture.json";

// Golden test — assert the FULL assembled document (order + minor guardian + extraClauses +
// empty-token placeholder), not just token substitution. The same fixture + assertion runs in
// /Users/mac/functions/test/contractFill.test.js; if either copy of contractFill.js drifts, one
// side's assemble() output stops matching expectedBlocks and the test fails.
test("assemble() matches the golden fixture (order + minor + extras + empty token)", () => {
  expect(contractFill.assemble(fx.template, fx.contract)).toEqual(fx.expectedBlocks);
});

test("line() fills non-empty tokens and flags empties as ‹token›", () => {
  expect(contractFill.line("a {{x}} b {{y}}", { x: "1" })).toBe("a 1 b ‹y›");
});
