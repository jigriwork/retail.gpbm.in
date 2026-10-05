import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const { compareSizes } = fixture().load("@/lib/scan/sizes");

test("sizes sort like a shop: letters in size order, then numbers, then the rest", () => {
  const sizes = ["XL", "28", "M", "2XL", "S", "36", "L", "FREE", "30", "100 ML", "XS", "EL"];
  assert.deepEqual([...sizes].sort(compareSizes), ["XS", "S", "M", "L", "XL", "2XL", "FREE", "28", "30", "36", "100 ML", "EL"]);
});
