import assert from "node:assert/strict";
import { test } from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const sample = {
  data: {
    gstin: "21ABCDE1234F1Z5", rtnprd: "092026", gendt: "14-10-2026",
    docdata: {
      b2b: [{ ctin: "27AAAAA0000A1Z5", trdnm: "VIKASH SALES", inv: [
        { inum: "PJ-26", dt: "25-09-2026", val: 3871.98, itcavl: "Y", items: [{ num: 1, rt: 5, txval: 3687.6, igst: 0, cgst: 92.19, sgst: 92.19, cess: 0 }] },
        { inum: "PJ-27", dt: "26-09-2026", val: 1180, itcavl: "N", rsn: "P", items: [{ txval: 500, cgst: 45, sgst: 45 }, { txval: 500, cgst: 45, sgst: 45 }] },
      ] }, { ctin: "bad", inv: [{ inum: "X" }] }],
      cdnr: [{ ctin: "27AAAAA0000A1Z5", trdnm: "VIKASH SALES", nt: [{ ntnum: "CN-5", typ: "C", dt: "30-09-2026", val: 105, items: [{ txval: 100, cgst: 2.5, sgst: 2.5 }] }] }],
    },
  },
};

test("GSTR-2B JSON: invoices and credit notes with tax summed from items; bad GSTINs skipped", () => {
  const { parseGstr2b } = fixture().load("@/lib/accounts/gstr2b");
  const result = JSON.parse(JSON.stringify(parseGstr2b(sample)));
  assert.equal(result.ok, true);
  assert.equal(result.gstin, "21ABCDE1234F1Z5");
  assert.equal(result.period, "092026");
  assert.deepEqual(result.rows.map((row) => [row.doc_type, row.doc_no, row.doc_date, row.taxable, row.cgst, row.itc_available]), [
    ["invoice", "PJ-26", "2026-09-25", 3687.6, 92.19, true],
    ["invoice", "PJ-27", "2026-09-26", 1000, 90, false],
    ["credit_note", "CN-5", "2026-09-30", 100, 2.5, null],
  ]);
});

test("the plain (unwrapped) layout also reads; other JSON is refused", () => {
  const { parseGstr2b } = fixture().load("@/lib/accounts/gstr2b");
  assert.equal(parseGstr2b(sample.data).ok, true);
  assert.equal(parseGstr2b({ hello: "world" }).ok, false);
});
