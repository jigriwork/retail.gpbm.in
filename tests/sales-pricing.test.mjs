import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

async function parse(header, values) {
  const parser = fixture().load("@/lib/reports/sales-parser");
  const file = new File(
    [`${header.join(",")}\n${values.join(",")}\n`],
    "daily-sales.csv",
    { type: "text/csv" },
  );
  const result = await parser.parseSalesFileDetailed(file);
  return { parser, row: result.rows[0] };
}

test("daily sales prefers actual NET AMOUNT over earlier TAXABLE AMOUNT", async () => {
  const { parser, row } = await parse(
    ["BILL DATE", "BILL NO", "ITEM NAME", "TAXABLE AMOUNT", "NET AMOUNT", "RATE", "SALE QTY", "SP. DISC."],
    ["2026-09-27", "1", "Shirt", "1537.14", "1614.00", "1699.00", "1", "85.00"],
  );

  assert.equal(row.netSale, 1614);
  assert.equal(row.mrp, 1699);
  assert.equal(row.discount, 85);
  const summary = JSON.parse(JSON.stringify(parser.summarizeSalesRows([row])));
  assert.ok(Math.abs(summary.averageDiscountPercent - (85 / 1699) * 100) < 1e-10);
  delete summary.averageDiscountPercent;
  assert.deepEqual(summary, {
    totalNetSale: 1614,
    totalMrpValue: 1699,
    totalDiscountValue: 85,
    mrpRowCount: 1,
    rowCount: 1,
    billCount: 1,
    staffNames: [],
    brandSummary: {},
    categorySummary: {},
    topStaff: [],
    topBrands: [],
    topCategories: [],
  });
});

test("daily sales prefers explicit MRP and ACTUAL PRICE regardless of sheet column order", async () => {
  const { row } = await parse(
    ["BILL DATE", "BILL NO", "ITEM NAME", "PRICE", "PRICE BEFORE TAX", "RATE", "ACTUAL PRICE", "MRP", "SALE QTY"],
    ["2026-09-27", "2", "Jeans", "1800", "1500", "1750", "1650", "1999", "1"],
  );

  assert.equal(row.mrp, 1999);
  assert.equal(row.netSale, 1650);
});

test("taxable amount remains a last-resort fallback for legacy files", async () => {
  const { row } = await parse(
    ["BILL DATE", "BILL NO", "ITEM NAME", "TAXABLE AMOUNT", "RATE", "SALE QTY"],
    ["2026-09-27", "3", "Legacy item", "500", "599", "1"],
  );

  assert.equal(row.mrp, 599);
  assert.equal(row.netSale, 500);
});

test("older summary reports convert aggregate MRP VALUE to a unit MRP", async () => {
  const { parser, row } = await parse(
    ["BILL DATE", "CATEGORY", "NET SALE QTY", "MRP VALUE", "NET SALE VALUE"],
    ["2026-07-13", "Shirts", "8", "17392", "8296"],
  );

  assert.equal(row.mrp, 2174);
  assert.equal(row.netSale, 8296);
  assert.equal(parser.summarizeSalesRows([row]).totalMrpValue, 17392);
});

test("discount is weighted from MRP to actual price and returns reverse it", async () => {
  const parser = fixture().load("@/lib/reports/sales-parser");
  const summary = parser.summarizeSalesRows([
    { billNo: "1", itemName: "Shirt", quantity: 2, mrp: 1000, netSale: 1600, rawData: {} },
    { billNo: "2", itemName: "Return", quantity: -1, mrp: 500, netSale: -400, rawData: {} },
  ]);

  assert.equal(summary.totalMrpValue, 1500);
  assert.equal(summary.totalNetSale, 1200);
  assert.equal(summary.totalDiscountValue, 300);
  assert.equal(summary.averageDiscountPercent, 20);
});
