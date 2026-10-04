import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const calc = () => fixture().load("@/lib/incentives/calc");
const slabs = [{ from: 0, rate: 0 }, { from: 100000, rate: 1 }, { from: 200000, rate: 1.5 }];

test("whole slab: the highest slab reached applies to the whole month's sale", () => {
  const { incentiveFor } = calc();
  const scheme = { basis: "sales_amount", payout: "whole", slabs, min_bills: 0 };
  assert.equal(incentiveFor(scheme, { bills: 40, netSale: 90000, target: null }), 0);
  assert.equal(incentiveFor(scheme, { bills: 40, netSale: 150000, target: null }), 1500);
  assert.equal(incentiveFor(scheme, { bills: 40, netSale: 250000, target: null }), 3750);
});

test("marginal slabs: each part of the sale earns its own slab's rate", () => {
  const { incentiveFor } = calc();
  const scheme = { basis: "sales_amount", payout: "marginal", slabs, min_bills: 0 };
  // 100000 at 0% + 100000 at 1% + 50000 at 1.5% = 1000 + 750
  assert.equal(incentiveFor(scheme, { bills: 40, netSale: 250000, target: null }), 1750);
});

test("target basis: slab by % of target achieved; no target or too few bills earns nothing", () => {
  const { incentiveFor, nextSlab } = calc();
  const scheme = { basis: "target_pct", payout: "whole", slabs: [{ from: 80, rate: 0.5 }, { from: 100, rate: 1 }], min_bills: 20 };
  assert.equal(incentiveFor(scheme, { bills: 30, netSale: 90000, target: 100000 }), 450);
  assert.equal(incentiveFor(scheme, { bills: 30, netSale: 120000, target: 100000 }), 1200);
  assert.equal(incentiveFor(scheme, { bills: 30, netSale: 70000, target: 100000 }), 0);
  assert.equal(incentiveFor(scheme, { bills: 30, netSale: 120000, target: null }), 0);
  assert.equal(incentiveFor(scheme, { bills: 10, netSale: 120000, target: 100000 }), 0);
  assert.equal(JSON.stringify(nextSlab(scheme, { netSale: 90000, target: 100000 })), JSON.stringify({ rate: 1, gap: 10000 }));
});

test("slabs are typed as 'from:rate' pairs; rates above 20% are refused", () => {
  const { parseSlabs, slabsText } = calc();
  assert.equal(slabsText(parseSlabs("200000:1.5, 0:0, ₹1,00,000:1".replace("1,00,000", "100000"))), "0:0, 100000:1, 200000:1.5");
  assert.equal(parseSlabs("abc"), null);
  assert.equal(parseSlabs("0:25"), null);
});
