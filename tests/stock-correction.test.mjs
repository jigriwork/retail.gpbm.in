import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const blank = { ok: false, message: "" };
const form = (values) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
function withStockReport(role) {
  const f = fixture({ role });
  f.db.reports.push({ id: "stock-sep", store_id: "bm", report_type: "stock", period_month: "2026-09-01", is_current: true,
    status: "processed", file_name: "wrong.xlsx", file_path: "bm/wrong.xlsx", row_count: 120, summary: { itemCount: 80 } });
  return f;
}

test("only the owner can delete a stock report", async () => {
  for (const role of ["manager", "staff"]) {
    const f = withStockReport(role);
    const { deleteStockReport } = f.load("@/lib/reports/stock-correction");
    const result = await deleteStockReport(blank, form({ reportId: "stock-sep", confirmation: "DELETE STOCK 2026-09" }));
    assert.equal(result.ok, false);
    assert.equal(f.db.reports[0].is_current, true);
  }
});

test("the owner must type the month phrase before anything changes", async () => {
  const f = withStockReport("owner");
  const { deleteStockReport } = f.load("@/lib/reports/stock-correction");
  const result = await deleteStockReport(blank, form({ reportId: "stock-sep", confirmation: "delete" }));
  assert.equal(result.ok, false);
  assert.equal(result.expectedPhrase, "DELETE STOCK 2026-09");
  assert.equal(f.db.reports[0].is_current, true);
});

test("deleting archives the report, keeps it, and logs who did it", async () => {
  const f = withStockReport("owner");
  const { deleteStockReport } = f.load("@/lib/reports/stock-correction");
  const result = await deleteStockReport(blank, form({ reportId: "stock-sep", confirmation: "delete stock 2026-09" }));
  assert.equal(result.ok, true, result.message);
  assert.equal(f.db.reports.length, 1, "the report row is kept");
  assert.equal(f.db.reports[0].is_current, false);
  const log = f.db.audit_logs.find((entry) => entry.action === "delete_stock_report");
  assert.ok(log);
  assert.equal(log.entity_id, "stock-sep");
  assert.equal(log.metadata.source_retained, true);
});
