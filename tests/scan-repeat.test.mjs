import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const { readCounts } = fixture().load("@/lib/scan/repeat");

function run(reads) {
  let last = { code: "", seen: 0 };
  return reads.map(([code, at]) => { const result = readCounts(last, code, at); last = result.last; return result.counts; });
}

test("one tag held in view counts once, however many frames read it", () => {
  // The camera reads the same tag every ~80 ms for 2 seconds.
  const frames = Array.from({ length: 25 }, (_, i) => ["8901234567890", 1000 + i * 80]);
  assert.deepEqual(run(frames).filter(Boolean).length, 1);
});

test("identical tags on several pieces all count once the camera moves between them", () => {
  // Three pieces of the same item: each tag in view ~0.3 s, ~1 s apart.
  const reads = [];
  for (const start of [0, 1300, 2600]) for (let t = 0; t <= 300; t += 80) reads.push(["8901234567890", start + t]);
  assert.equal(run(reads).filter(Boolean).length, 3);
});

test("a different tag counts immediately", () => {
  assert.deepEqual(run([["A1", 0], ["B2", 100], ["A1", 200]]), [true, true, true]);
});
