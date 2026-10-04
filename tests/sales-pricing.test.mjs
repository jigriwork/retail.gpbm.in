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

async function parseMany(header, rows) {
  const parser = fixture().load("@/lib/reports/sales-parser");
  const csv = [header, ...rows].map((values) => values.join(",")).join("\n");
  const result = await parser.parseSalesFileDetailed(new File([`${csv}\n`], "daily-sales.csv", { type: "text/csv" }));
  return { parser, result, summary: parser.summarizeSalesRows(result.rows) };
}

test("unnamed subtotal lines in an item report are not counted as sales", async () => {
  // Brand Mark's export prints category and grand subtotals with no label,
  // which counted the day three times (₹69,624 instead of ₹23,208).
  const { result, summary } = await parseMany(
    ["BILL DATE", "ITEM NAME", "BRAND", "CATEGORY", "SALE QTY", "MRP", "NET AMOUNT"],
    [
      ["2026-10-01", "Shirt", "MUFTI", "TOP WEAR", "1", "3499", "3099"],
      ["2026-10-01", "Jeans", "ARROW", "BOTTOM WEAR", "2", "2999", "5578"],
      ["", "", "", "", "3", "", "8677"],
      ["", "", "", "", "3", "", "8677"],
    ],
  );
  assert.equal(result.rows.length, 2);
  assert.equal(result.skippedTotalRows, 2);
  assert.equal(summary.totalNetSale, 8677);
});

test("a file of day totals only still imports", async () => {
  const { result, summary } = await parseMany(
    ["BILL DATE", "SALE QTY", "MRP", "DISCOUNT", "NET AMOUNT"],
    [
      ["2026-09-01", "12", "1000", "100", "10800"],
      ["2026-09-02", "9", "1000", "50", "8550"],
    ],
  );
  assert.equal(result.rows.length, 2);
  assert.equal(summary.totalNetSale, 19350);
});

test("Logic DAILY SALE BOOK (brand/category totals, no bills) is recognised as summary-only; bill-wise is not", async () => {
  // Real Brand Mark file of 2 Oct 2026, uploaded instead of the bill-wise report.
  const daily = await parseMany(
    ["SNO.", "SHOW ROOM", "BILL DATE", "BRAND NAME", "CATEGORY", "NET SALE QTY", "MRP VALUE", "DISCOUNT VALUE", "NET SALE VALUE", "VAT RS.", "SALE VALUE BEFORE TAX"],
    [["1", "(NIL)", "02/10/2026", "ARROW", "BOTTOM WEAR", "1", "2299", "-115.13", "2183.87", "52", "2235.87"],
     ["2", "(NIL)", "02/10/2026", "ARROW", "TOP WEAR", "2", "5124", "-256.2", "4867.82", "115.91", "4983.71"]],
  );
  assert.equal(daily.parser.salesRowsAreSummaryOnly(daily.result.rows), true);
  assert.match(daily.parser.summaryOnlySalesFileMessage, /BILL WISE SALES REPORT/);
  const billWise = await parseMany(
    ["SNO.", "BILL NO.", "BILL DATE", "AGENT NAME", "ITEM NAME", "SALE QTY", "M.R.P.", "NET AMOUNT"],
    [["1", "BM-334", "03/10/2026", "SAHU", "SDHS1199", "1", "1199", "1079"]],
  );
  assert.equal(billWise.parser.salesRowsAreSummaryOnly(billWise.result.rows), false);
});
