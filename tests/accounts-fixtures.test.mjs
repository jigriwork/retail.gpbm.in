import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";

// Reproduces the supplied company workings from the owner's local workbooks.
// The workbooks are business documents and are never committed: when they
// are not on this machine the test is skipped. Mufti/Sagar Bazar is a formula
// reference only. Disposable database only (scripts/test-accounts-local.mjs).
const require = createRequire(import.meta.url);
const XLSX = require("xlsx");
const dir = process.env.ACCOUNTS_FIXTURE_DIR ?? path.join(homedir(), "Desktop");
const files = {
  mufti: [path.join(dir, "MUFTI CALCULATION FROM 01-08-2026 To 31-08-2026.xlsx"), path.join(dir, "retail.gpbm.in", "MUFTI CALCULATION FROM 01-08-2026 To 31-08-2026.xlsx")].find(existsSync),
  pepe: [path.join(dir, "SS-26 PROMO WORKING - GO PLANET.xlsx")].find(existsSync),
  turtle: [path.join(dir, "GO PLANET (BERHAMPUR) (S) 2026-27.xlsx")].find(existsSync),
};
const args = ["-X", "-q", "-A", "-t", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"];
const compute = (rules, lines) => JSON.parse(execFileSync("psql", args, { input: `select compute_working($r$${JSON.stringify(rules)}$r$::jsonb, $l$${JSON.stringify(lines)}$l$::jsonb);`, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).trim());
const rows = (file, sheet, header) => XLSX.utils.sheet_to_json(XLSX.readFile(file).Sheets[sheet], { defval: null, range: header - 1, raw: true })
  .map(row => Object.fromEntries(Object.entries(row).map(([key, cell]) => [key.replace(/\s+/g, " ").trim(), cell])));
const excelDate = serial => new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);

test("Mufti August (formula reference): payment ₹99,370.09756 and CN ₹52,071.4349", { skip: !files.mufti && "Mufti workbook not on this machine" }, () => {
  const lines = rows(files.mufti, "WORKING", 2).filter(row => row.QTY !== null).map(row => ({
    qty: row.QTY, mrp: row.MRP, nsv: row.NSV, class: row["SCHEME NAME"] === "EOSS" ? "eoss" : "fresh", sale_date: excelDate(row.DATE), bill_no: row["INVOICE NO"],
  }));
  const result = compute({
    formula: "sale_against_payment", threshold_basis: "line",
    sales_tax: { mode: "approx", approx_high: 15.25, approx_low: 4.76, threshold: 2599, operator: ">" },
    margin: { eoss: 19, fresh: 26.7, other: 26.7 },
    purchase_cost: { high_factor: 58.05, low_factor: 68.54, threshold: 2599, operator: ">" },
    purchase_tax: { high_rate: 18, low_rate: 5, threshold: 2599, operator: ">=" },
  }, lines);
  assert.equal(Number(result.totals.qty), 75);
  assert.equal(Number(result.totals.mrp_value), 234125);
  assert.equal(Number(result.totals.nsv), 117062.5);
  assert.equal(Number(result.totals.payment), 99370.09756);
  assert.equal(Number(result.totals.cn), 52071.4349);
});

test("Turtle (company working as supplied): every month's payment, September ₹69,297.84", { skip: !files.turtle && "Turtle workbook not on this machine" }, () => {
  const data = rows(files.turtle, "Sales dump", 5).filter(row => row.Qty !== null);
  const rules = {
    formula: "sales_margin", threshold_basis: "piece", discount: { accept: "input" }, margin: { fresh: 28, eoss: 28, other: 0 },
    sales_tax: { mode: "fraction", high_rate: 18, low_rate: 5, threshold: 2625, operator: ">" },
    md: { high_pct: 43.25, low_pct: 32.76, threshold: 2625, operator: ">" },
  };
  const expected = { "Apr-26": 71376.4368, "May-26": 61610.4, "Jun-26": 84615.2496, "Jul-26": 86847.4152, "Aug-26": 79675.2144, "Sep-26": 69297.84 };
  for (const [month, payment] of Object.entries(expected)) {
    const lines = data.filter(row => row.Month === month).map(row => ({
      qty: row.Qty, mrp: row.MRP, nsv: row.Net, accepted_discount: row["Discount TL"], class: row.Type === "EOSS" ? "eoss" : row.Type === "OTSP" ? "other" : "fresh",
      sale_date: excelDate(row.Date), bill_no: row["Bill No."],
    }));
    assert.equal(Math.round(Number(compute(rules, lines).totals.payment) * 10000) / 10000, payment, month);
  }
});

test("Pepe SS-26 promo: our calculation vs the company's sheet differs only on the reviewed lines", { skip: !files.pepe && "Pepe workbook not on this machine" }, () => {
  const data = rows(files.pepe, "WORKING", 2).filter(row => row.QTY !== null);
  const result = compute({
    formula: "promo_share", threshold_basis: "line", share_pct: 50, discount: { accept: "input" },
    sales_tax: { mode: "approx", approx_high: 15.25, approx_low: 4.76, threshold: 2599, operator: ">" },
  }, data.map(row => ({ qty: row.QTY, mrp: row.MRP, nsv: row.NET, accepted_discount: row["ACTUAL DIS"], sale_date: excelDate(row.DATE), bill_no: row["BILL NO."] })));
  const sheetTotal = data.reduce((sum, row) => sum + row["CN/DN"], 0);
  assert.equal(Math.round(sheetTotal * 100) / 100, 30233.69);
  const differing = result.lines.map((line, index) => ({ row: index + 3, diff: Number(line.cn) - data[index]["CN/DN"] })).filter(item => Math.abs(item.diff) > 0.01);
  // 95/193/215: the sheet used 5% tax on NSV above ₹2,599; 109: discount cap; 104/146/192: paise roundings.
  assert.deepEqual(differing.map(item => item.row), [95, 104, 109, 146, 192, 193, 215]);
  console.log(`Pepe: company sheet ${sheetTotal.toFixed(2)}, our rules ${Number(result.totals.cn).toFixed(2)}`);
  assert.equal(Math.round(differing.find(item => item.row === 109).diff * 100) / 100, -99.93); // cap applied correctly
});
