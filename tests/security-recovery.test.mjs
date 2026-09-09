import { fixture } from "./helpers/app-fixture.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const clone = value => JSON.parse(JSON.stringify(value));
const state = { ok: false, message: "" };
const phone = "919876543210";
const form = entries => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    for (const item of Array.isArray(value) ? value : [value]) data.append(key, item);
  }
  return data;
};


for (const [label, options, contact] of [
  ["anonymous", { anonymous: true }, "alice"],
  ["inactive manager", { active: false }, "alice"],
  ["null-active manager", { active: null }, "alice"],
  ["unassigned manager", { assigned: [] }, "alice"],
  ["cross-store manager", {}, "other-alice"],
  ["non-manager role", { role: "staff" }, "alice"],
  ["missing target", {}, "missing"],
]) {
  test(`C01 ${label} denied without writes or service-role access`, async () => {
    const f = fixture(options), before = clone(f.db);
    await assert.rejects(f.load("@/lib/employees/phone-propagation").propagateContactPhone(contact, phone));
    assert.deepEqual(f.db, before);
    assert.ok(!f.calls.some(call => call.operation === "admin"));
  });
}
for (const value of ["", "123", "abc9876543210", "919876543210xyz", "+442012345678"]) {
  test(`C01 invalid phone rejected (${value || "blank"})`, async () => {
    const f = fixture(), before = clone(f.db);
    await assert.rejects(f.load("@/lib/employees/phone-propagation").propagateContactPhone("alice", value));
    assert.deepEqual(f.db, before);
  });
}
for (const role of ["manager", "owner"]) {
  test(`C01 active ${role} updates only intended contact and related rows`, async () => {
    const f = fixture({ role });
    await f.load("@/lib/employees/phone-propagation").propagateContactPhone("alice", "+91 (98765) 43210");
    assert.equal(f.db.employee_contacts[0].normalized_phone, phone);
    assert.equal(f.db.employee_contacts[1].phone, "old");
    assert.equal(f.db.employee_contacts[2].phone, "old");
    for (const table of ["payslip_rows", "generated_payslips"]) {
      assert.deepEqual(f.db[table].map(row => row.employee_phone), [phone, phone, "old", "old"]);
    }
    assert.deepEqual(f.db.audit_logs.map(row => row.action), ["employee_phone_update_requested", "employee_phone_updated"]);
    assert.ok(!JSON.stringify(f.db.audit_logs).includes(phone));
  });
}
test("C01 owner can update a store without an assignment", async () => {
  const f = fixture({ role: "owner", assigned: [] });
  await f.load("@/lib/employees/phone-propagation").propagateContactPhone("other-alice", phone);
  assert.deepEqual(f.db.payslip_rows.map(row => row.employee_phone), ["old", "old", "old", phone]);
});
test("C01 failed audit blocks phone writes", async () => {
  const f = fixture(), before = clone(f.db);
  f.failWhen(table => table === "audit_logs");
  await assert.rejects(f.load("@/lib/employees/phone-propagation").propagateContactPhone("alice", phone), /audit/);
  assert.deepEqual(f.db, before);
});
test("C01 public bulk action ignores browser store/name and denies foreign contact", async () => {
  const f = fixture();
  const result = await f.load("@/lib/employees/actions").bulkUpdateEmployeePhones(state, form({
    contactIds: ["alice", "other-alice"], "phone:alice": phone, "phone:other-alice": phone, storeId: "gp", normalizedStaffName: "bob",
  }));
  assert.equal(result.ok, false);
  assert.deepEqual(f.db.payslip_rows.map(row => row.employee_phone), [phone, phone, "old", "old"]);
});
test("C01 public single payslip action resolves employee from stored row", async () => {
  const f = fixture({ role: "owner" });
  const result = await f.load("@/lib/payslips/actions").updatePayslipRowPhone(state, form({ rowId: "a1", phone, storeId: "bm", contactId: "other-alice" }));
  assert.equal(result.ok, true);
  assert.deepEqual(f.db.payslip_rows.map(row => row.employee_phone), [phone, phone, "old", "old"]);
});
for (const action of ["createEmployeeContact", "updateEmployeeContact", "bulkUpdateEmployeePhones"]) {
  for (const options of [{ anonymous: true }, { active: false }, { assigned: [] }]) {
    test(`C01 ${action} denies ${JSON.stringify(options)}`, async () => {
      const f = fixture(options), before = clone(f.db);
      const data = form({ employeeId: "alice", staffName: "Alice", storeId: "gp", phone, contactIds: ["alice"], "phone:alice": phone });
      try {
        const fn = f.load("@/lib/employees/actions")[action];
        const result = action === "bulkUpdateEmployeePhones" ? await fn(state, data) : await fn(data);
        assert.equal(result.ok, false);
      } catch (error) { assert.match(error.message, /required|Redirect/); }
      assert.deepEqual(f.db, before);
    });
  }
}

function reportFixture(options = {}) {
  const f = fixture({ role: "owner", ...options });
  f.files.set("bulk/original.xlsx", "immutable bulk evidence");
  f.files.set("individual/original.xlsx", "unrelated individual evidence");
  f.db.sales_upload_batches.push({ id: "original-batch", file_path: "bulk/original.xlsx" });
  for (let i = 0; i < 73; i++) {
    const date = new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10);
    f.db.reports.push({ id: `report-${i}`, is_current: true, report_type: "sales", store_id: "gp", report_date: date, file_name: "original.xlsx", file_path: "bulk/original.xlsx", sales_upload_batch_id: "original-batch", summary: { totalNetSale: 100 }, row_count: 1 });
    f.db.sales_rows.push({ id: `sale-${i}`, report_id: `report-${i}`, net_sale: 100 });
  }
  f.db.reports.push({ id: "individual", report_type: "sales", store_id: "bm", file_path: "individual/original.xlsx" });
  return f;
}
const replacementFile = () => new File(["BILL DATE,BILL NO,ITEM NAME,NET AMOUNT,STAFF NAME\n2026-01-01,1,Shirt,150,Alice\n"], "corrected.csv", { type: "text/csv" });
async function assertEvidence(f) {
  assert.equal(f.files.get("bulk/original.xlsx"), "immutable bulk evidence");
  assert.equal(f.files.get("individual/original.xlsx"), "unrelated individual evidence");
  assert.equal(f.db.sales_upload_batches[0].file_path, "bulk/original.xlsx");
  for (let i = 1; i < 73; i++) {
    const report = f.db.reports.find(row => row.id === `report-${i}`);
    assert.equal(report.file_path, "bulk/original.xlsx");
    const download = await f.client.storage.from("reports").download(report.file_path);
    assert.equal(download.error, null);
    assert.equal(await download.data.text(), "immutable bulk evidence");
  }
  assert.equal(f.db.reports.find(row => row.id === "individual").file_path, "individual/original.xlsx");
}
test("C02 deleting one of 73 daily reports retains source, batch, other 72 downloads and audit", async () => {
  const f = reportFixture();
  const result = await f.load("@/lib/reports/sales-correction").deleteSalesReport(state, form({ reportId: "report-0", confirmation: "DELETE SALES 2026-01-01" }));
  assert.equal(result.ok, true, result.message);
  assert.ok(!f.db.reports.some(row => row.id === "report-0" && row.is_current));
  await assertEvidence(f);
  const audit = f.db.audit_logs.find(row => row.action === "delete_sales_report");
  assert.equal(audit.metadata.recovery_sources[0].file_path, "bulk/original.xlsx");
  assert.equal(audit.metadata.recovery_sources[0].sales_upload_batch_id, "original-batch");
  assert.equal(audit.metadata.storage_deleted, false);
});
for (const bulk of [false, true]) {
  test(`C02 ${bulk ? "bulk" : "daily"} replacement preserves 73-report source and traceability`, async () => {
    const f = reportFixture();
    const actions = f.load("@/lib/reports/sales-correction");
    const result = bulk
      ? await actions.bulkHistoricalSalesUpload(state, form({ storeId: "gp", preset: "custom", startDate: "2026-01-01", endDate: "2026-01-01", duplicateBehavior: "replace", confirmation: "IMPORT HISTORICAL SALES", file: replacementFile() }))
      : await actions.replaceSalesReport(state, form({ reportId: "report-0", confirmation: "REPLACE SALES 2026-01-01", file: replacementFile() }));
    assert.equal(result.ok, true, result.message);
    await assertEvidence(f);
    const corrected = f.db.reports.find(row => row.report_date === "2026-01-01" && row.is_current);
    assert.notEqual(corrected.file_path, "bulk/original.xlsx");
    assert.equal(corrected.summary.recovery_sources[0].file_path, "bulk/original.xlsx");
    assert.equal(corrected.summary.recovery_sources[0].sales_upload_batch_id, "original-batch");
    assert.ok(f.db.audit_logs.some(row => row.action === "replace_sales_report" && row.metadata.new_file_path === corrected.file_path));
    // A second correction must retain the original and intermediate versions.
    const result2 = await actions.replaceSalesReport(state, form({ reportId: corrected.id, confirmation: "REPLACE SALES 2026-01-01", file: replacementFile() }));
    assert.equal(result2.ok, true, result2.message);
    const latest = f.db.reports.find(row => row.report_date === "2026-01-01" && row.is_current);
    assert.equal(latest.summary.recovery_sources.length, 2);
    assert.equal(latest.summary.recovery_sources[0].file_path, "bulk/original.xlsx");
    assert.equal(latest.summary.recovery_sources[1].file_path, corrected.file_path);
    assert.ok(f.files.has(corrected.file_path));
    await assertEvidence(f);
  });
}
for (const action of ["deleteSalesReport", "replaceSalesReport", "bulkHistoricalSalesUpload"]) {
  for (const options of [{ role: "manager" }, { active: false }, { anonymous: true }]) {
    test(`C02 ${action} unauthorized ${JSON.stringify(options)} denied`, async () => {
      const f = reportFixture(options), before = clone(f.db);
      try {
        const result = await f.load("@/lib/reports/sales-correction")[action](state, form({ reportId: "report-0", file: replacementFile(), confirmation: "DELETE SALES 2026-01-01" }));
        assert.equal(result.ok, false);
      } catch (error) { assert.match(error.message, /Redirect/); }
      assert.deepEqual(f.db, before);
      assert.equal(f.calls.filter(call => call.operation === "upload").length, 0);
      await assertEvidence(f);
    });
  }
}
test("C02 failed evidence audit prevents deletion", async () => {
  const f = reportFixture(), before = clone(f.db);
  f.failWhen(table => table === "audit_logs");
  const result = await f.load("@/lib/reports/sales-correction").deleteSalesReport(state, form({ reportId: "report-0", confirmation: "DELETE SALES 2026-01-01" }));
  assert.equal(result.ok, false);
  assert.deepEqual(f.db, before);
  await assertEvidence(f);
});
test("C02 replacement insert failure retains all originals and uploaded evidence", async () => {
  const f = reportFixture();
  f.failWhen((table, operation) => table === "reports" && operation === "insert");
  const result = await f.load("@/lib/reports/sales-correction").replaceSalesReport(state, form({ reportId: "report-0", confirmation: "REPLACE SALES 2026-01-01", file: replacementFile() }));
  assert.equal(result.ok, false);
  assert.ok(f.db.reports.some(row => row.id === "report-0"));
  assert.equal(f.files.size, 3);
  await assertEvidence(f);
});
test("C01 propagation includes related records beyond the first 1,000 rows", async () => {
  const f = fixture();
  f.db.payslip_rows.push(...Array.from({ length: 1001 }, (_, i) => ({ id: `extra-${i}`, batch_id: "old", store_id: "gp", staff_name: "Bob", employee_phone: "old" })));
  f.db.payslip_rows.push({ id: "last-alice", batch_id: "old", store_id: "gp", staff_name: "Alice", employee_phone: "old" });
  await f.load("@/lib/employees/phone-propagation").propagateContactPhone("alice", phone);
  assert.equal(f.db.payslip_rows.at(-1).employee_phone, phone);
  assert.ok(f.db.payslip_rows.filter(row => row.staff_name === "Bob").every(row => row.employee_phone === "old"));
});
test("C01 disappearing contact blocks service-role phone writes", async () => {
  const f = fixture();
  f.failWhen((table, operation) => {
    if (table === "employee_contacts" && operation === "update") f.db.employee_contacts = [];
    return false;
  });
  await assert.rejects(f.load("@/lib/employees/phone-propagation").propagateContactPhone("alice", phone), /contact may have changed/);
  assert.ok(f.db.payslip_rows.every(row => row.employee_phone === "old"));
});
for (const action of ["createEmployeeContact", "updateEmployeeContact"]) {
  test(`C01 ${action} assigned manager success is scoped`, async () => {
    const f = fixture();
    const data = form({ employeeId: "alice", staffName: "Alice", storeId: "gp", phone, isActive: "on" });
    if (action === "createEmployeeContact") f.db.employee_contacts.shift();
    await assert.rejects(f.load("@/lib/employees/actions")[action](data), /Redirect: \/app\/employees\?saved=1/);
    assert.deepEqual(f.db.payslip_rows.map(row => row.employee_phone), [phone, phone, "old", "old"]);
  });
  test(`C01 ${action} cross-store target denied despite forged store`, async () => {
    const f = fixture(), before = clone(f.db);
    const data = form({ employeeId: "other-alice", staffName: "Alice", storeId: action === "createEmployeeContact" ? "bm" : "gp", phone });
    await assert.rejects(f.load("@/lib/employees/actions")[action](data), /Redirect/);
    assert.deepEqual(f.db, before);
  });
}
test("C01 public phone actions reject invalid input before any writes", async () => {
  for (const action of ["createEmployeeContact", "updateEmployeeContact", "bulkUpdateEmployeePhones", "updatePayslipRowPhone"]) {
    const f = fixture({ role: "owner" }), before = clone(f.db);
    const data = form({ employeeId: "alice", staffName: "Alice", storeId: "gp", phone: "abc9876543210", contactIds: ["alice"], "phone:alice": "abc9876543210", rowId: "a1" });
    const actions = f.load(action === "updatePayslipRowPhone" ? "@/lib/payslips/actions" : "@/lib/employees/actions");
    if (action.includes("EmployeeContact")) await assert.rejects(actions[action](data), /error=phone/);
    else assert.equal((await actions[action](state, data)).ok, false);
    assert.deepEqual(f.db, before);
  }
});
for (const options of [{ anonymous: true }, { active: false }, { role: "manager" }]) {
  test(`C01 public payslip phone action denies ${JSON.stringify(options)}`, async () => {
    const f = fixture(options), before = clone(f.db);
    try {
      const result = await f.load("@/lib/payslips/actions").updatePayslipRowPhone(state, form({ rowId: "a1", phone }));
      assert.equal(result.ok, false);
    } catch (error) { assert.match(error.message, /required/); }
    assert.deepEqual(f.db, before);
  });
}
test("C02 failed replacement audit blocks uploads and all record mutations", async () => {
  const f = reportFixture(), before = clone(f.db);
  f.failWhen(table => table === "audit_logs");
  const result = await f.load("@/lib/reports/sales-correction").replaceSalesReport(state, form({ reportId: "report-0", confirmation: "REPLACE SALES 2026-01-01", file: replacementFile() }));
  assert.equal(result.ok, false);
  assert.deepEqual(f.db, before);
  assert.equal(f.files.size, 2);
});
test("C02 failed final audit retains the durable source history", async () => {
  const f = reportFixture();
  f.failWhen((table, operation, values) => table === "audit_logs" && values.action === "delete_sales_report");
  const result = await f.load("@/lib/reports/sales-correction").deleteSalesReport(state, form({ reportId: "report-0", confirmation: "DELETE SALES 2026-01-01" }));
  assert.equal(result.ok, false);
  assert.ok(f.db.reports.some(row => row.id === "report-0" && row.is_current && row.file_path === "bulk/original.xlsx"));
  await assertEvidence(f);
});
test("C01 invalid bulk phone is rejected even when stripped digits match current phone", async () => {
  const f = fixture();
  Object.assign(f.db.employee_contacts[0], { normalized_phone: phone, whatsapp_phone: phone });
  const before = clone(f.db);
  const result = await f.load("@/lib/employees/actions").bulkUpdateEmployeePhones(state, form({ contactIds: ["alice"], "phone:alice": `abc${phone}` }));
  assert.equal(result.ok, false);
  assert.deepEqual(f.db, before);
});
test("C01 retry repairs related records after a partial update", async () => {
  const f = fixture();
  const actions = f.load("@/lib/employees/actions");
  const data = form({ contactIds: ["alice"], "phone:alice": phone });
  f.failWhen((table, operation) => table === "payslip_rows" && operation === "update");
  assert.equal((await actions.bulkUpdateEmployeePhones(state, data)).ok, false);
  assert.equal(f.db.employee_contacts[0].normalized_phone, phone);
  assert.equal(f.db.payslip_rows[0].employee_phone, "old");
  f.failWhen(() => false);
  assert.equal((await actions.bulkUpdateEmployeePhones(state, data)).ok, true);
  assert.deepEqual(f.db.payslip_rows.map(row => row.employee_phone), [phone, phone, "old", "old"]);
  assert.deepEqual(f.db.generated_payslips.map(row => row.employee_phone), [phone, phone, "old", "old"]);
});
