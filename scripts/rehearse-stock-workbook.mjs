// Rehearses one real stock workbook against the disposable retail_safety DB.
// This script refuses non-loopback/non-test targets and never loads app env files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fixture } from "../tests/helpers/app-fixture.mjs";

const workbookPath = process.argv[2];
const periodMonth = process.argv[3] ?? "2026-09-01";
assert.ok(workbookPath, "Usage: node scripts/rehearse-stock-workbook.mjs <xlsx-path> [YYYY-MM-01]");
assert.match(periodMonth, /^\d{4}-\d{2}-01$/);

const sql = (statement) => execFileSync(
  "psql",
  ["-XqAt", "-h", "127.0.0.1", "-p", "55439", "-d", "retail_safety", "-v", "ON_ERROR_STOP=1"],
  { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 },
).trim();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const owner = "00000000-0000-0000-0000-000000000001";
const asOwner = `set request.jwt.claim.sub=${quote(owner)};set role authenticated;`;

assert.match(sql("select current_database()||'|'||host(inet_server_addr())||'|'||inet_server_port();"), /^retail_safety\|127\.0\.0\.1\|55439$/);
sql(`insert into auth.users(id,email) values(${quote(owner)},'stock-rehearsal@example.invalid') on conflict(id) do nothing;
  update profiles set role='owner',is_active=true where id=${quote(owner)};`);

const bytes = readFileSync(workbookPath);
const fileName = path.basename(workbookPath);
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const started = Date.now();
const parser = fixture().load("@/lib/reports/stock-parser");
const parsed = await parser.parseStockFileDetailed(new File([bytes], fileName, { type: mime }));
const rows = parsed.rows.filter((row) => row.itemName || row.sku || row.barcode || row.brand || row.category);
const summary = parser.summarizeStockRows(rows);
const context = { store: sql("select id from stores where code='GP';"), type: "stock", mode: "stop", bulk: false, days: [{ date: periodMonth, target: null }] };
const fingerprint = createHash("sha256").update(bytes).update(JSON.stringify(context)).digest("hex");
const manifest = [{ date: periodMonth, row_count: rows.length, summary: {
  uploadedForMonth: periodMonth, originalFileName: fileName, fileType: "xlsx",
  totalQuantity: summary.totalQuantity, totalStockValueMrp: summary.totalStockValueMrp,
  itemCount: summary.itemCount, rowCount: summary.rowCount,
} }];

const run = JSON.parse(sql(`${asOwner}select begin_report_import(${quote(context.store)},'stock',${quote(fingerprint)},${quote(fileName)},${quote(JSON.stringify(manifest))}::jsonb,'stop',false);`));
sql(`insert into storage.objects(bucket_id,name) values('reports',${quote(run.file_path)});`);

for (let offset = 0; offset < rows.length; offset += 1000) {
  const chunk = rows.slice(offset, offset + 1000).map((row) => ({
    logical_date: periodMonth,
    item_name: row.itemName,
    sku: row.sku,
    barcode: row.barcode,
    brand: row.brand,
    category: row.category,
    size: row.size,
    color: row.color,
    quantity: row.quantity,
    mrp: row.mrp,
    cost_price: row.costPrice,
    supplier: row.supplier,
    purchase_date: row.purchaseDate,
    ageing_days: row.ageingDays,
    raw_data: row.rawData,
  }));
  sql(`${asOwner}select stage_report_chunk(${quote(run.id)},${offset / 1000},${quote(JSON.stringify(chunk))}::jsonb);`);
}

const commitStarted = Date.now();
const result = JSON.parse(sql(`${asOwner}set statement_timeout='8s';select commit_report_import(${quote(run.id)});`));
const commitMs = Date.now() - commitStarted;
assert.equal(result.ok, true);
const reportId = result.report_ids[0];
const verification = sql(`select r.row_count,count(s.id),coalesce(sum(s.quantity),0),coalesce(sum(s.quantity*s.mrp),0),st.code,r.file_name,
  exists(select 1 from storage.objects o where o.bucket_id='reports' and o.name=r.file_path),r.is_current,r.status
  from reports r join stores st on st.id=r.store_id left join stock_rows s on s.report_id=r.id
  where r.id=${quote(reportId)} group by r.id,st.code;`).split("|");
assert.deepEqual(verification, [String(rows.length), String(rows.length), String(summary.totalQuantity), String(summary.totalStockValueMrp), "GP", fileName, "t", "t", "processed"]);

const duplicate = JSON.parse(sql(`${asOwner}select begin_report_import(${quote(context.store)},'stock',${quote(fingerprint)},${quote(fileName)},${quote(JSON.stringify(manifest))}::jsonb,'stop',false);`));
assert.equal(duplicate.id, run.id);
const duplicateResult = JSON.parse(sql(`${asOwner}select commit_report_import(${quote(run.id)});`));
assert.deepEqual(duplicateResult.report_ids, result.report_ids);
assert.equal(sql(`select count(*) from stock_rows where report_id=${quote(reportId)};`), String(rows.length));

console.log(JSON.stringify({
  fileSha256: createHash("sha256").update(bytes).digest("hex"),
  fileBytes: bytes.length,
  sheetName: parsed.sheetName,
  headerRowNumber: parsed.headerRowNumber,
  skippedTotalRows: parsed.skippedTotalRows,
  parsedRows: rows.length,
  itemCount: summary.itemCount,
  totalQuantity: summary.totalQuantity,
  totalStockValueMrp: summary.totalStockValueMrp,
  storeCode: verification[4],
  sourceObjectPreserved: verification[6] === "t",
  duplicateImportIdReused: duplicate.id === run.id,
  duplicateRowCountUnchanged: true,
  parserAndStagingMs: commitStarted - started,
  commitMs,
}, null, 2));
