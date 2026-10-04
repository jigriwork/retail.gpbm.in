import assert from "node:assert/strict";
import test from "node:test";

import { fixture } from "./helpers/app-fixture.mjs";

const envKeys = [
  "MSG91_AUTH_KEY",
  "MSG91_GP_INTEGRATED_NUMBER",
  "MSG91_GP_CUSTOMER_TEMPLATE",
  "MSG91_GP_PAYSLIP_TEMPLATE",
  "MSG91_BM_INTEGRATED_NUMBER",
  "MSG91_BM_CUSTOMER_TEMPLATE",
  "MSG91_BM_PAYSLIP_TEMPLATE",
  "MSG91_TEMPLATE_LANGUAGE",
  "MSG91_MONTHLY_BUDGET_INR",
  "MSG91_BUDGET_BUFFER_INR",
  "MSG91_SALARY_RESERVE_INR",
  "MSG91_MONTHLY_FOLLOWUP_LIMIT",
  "MSG91_DAILY_FOLLOWUP_LIMIT",
];

function withEnv(values, run) {
  const previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  return Promise.resolve(run()).finally(() => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
}

test("MSG91 template payload keeps sender, recipient and approved component positions", async () => {
  let request;
  const f = fixture({
    globals: {
      DOMException,
      Response,
      fetch: async (url, options) => {
        request = { url, options, body: JSON.parse(options.body) };
        return Response.json({ hasError: false, request_id: "request-1" });
      },
    },
  });
  const { sendMsg91Template } = f.load("@/lib/msg91/client");
  const result = await sendMsg91Template({
    authKey: "not-a-real-key",
    brand: "GP",
    customerTemplate: "purchase_thank_you_gp_v1",
    followupTemplate: "gp_customer_comeback_v1",
    integratedNumber: "919999997444",
    language: "en",
    payslipTemplate: "salary_slip_gp_v1",
  }, "salary_slip_gp_v1", [{
    components: {
      header_1: { type: "document", value: "https://example.invalid/private.pdf" },
      body_1: { type: "text", value: "Employee" },
      body_2: { type: "text", value: "September 2026" },
    },
    to: "919876543210",
  }]);
  assert.equal(result.ok, true);
  assert.equal(request.body.integrated_number, "919999997444");
  assert.equal(request.body.payload.template.name, "salary_slip_gp_v1");
  assert.deepEqual(request.body.payload.template.to_and_components[0].to, ["919876543210"]);
  assert.equal(request.body.payload.template.to_and_components[0].components.header_1.type, "document");
  assert.match(request.url, /whatsapp-outbound-message\/bulk/);
  assert.equal(request.options.headers.authkey, "not-a-real-key");
});

test("automatic customer send uses consent, honours do-not-contact and logs accepted delivery", async () => withEnv({
  MSG91_AUTH_KEY: "not-a-real-key",
  MSG91_GP_INTEGRATED_NUMBER: "919999997444",
  MSG91_GP_CUSTOMER_TEMPLATE: "purchase_thank_you_gp_v1",
  MSG91_GP_PAYSLIP_TEMPLATE: "salary_slip_gp_v1",
  MSG91_TEMPLATE_LANGUAGE: "en",
}, async () => {
  const outbound = [];
  const f = fixture({
    globals: {
      DOMException,
      Response,
      fetch: async (url, options = {}) => {
        if (String(url).includes("get-template-client")) {
          return Response.json({ data: [{ name: "purchase_thank_you_gp_v1", status: "approved" }] });
        }
        outbound.push(JSON.parse(options.body));
        return Response.json({ hasError: false, request_id: "request-2" });
      },
    },
  });
  f.db.customer_profiles = [
    { mobile: "9876543210", preferred_name: "Ravi Kumar", marketing_consent: true, do_not_contact: false },
    { mobile: "9876543211", preferred_name: "No Consent", marketing_consent: false, do_not_contact: false },
    { mobile: "9876543212", preferred_name: "Stopped", marketing_consent: true, do_not_contact: true },
  ];
  f.db.customer_messages = [];
  f.db.whatsapp_deliveries = [];
  const { sendAutomaticCustomerThanks } = f.load("@/lib/msg91/customer-automation");
  const result = await sendAutomaticCustomerThanks({
    initiatedBy: "actor",
    reportDate: "2026-10-03",
    reportId: "00000000-0000-0000-0000-000000000001",
    rows: [
      { billNo: "1", customerName: "Ravi Kumar", customerPhone: "9876543210", netSale: 1000 },
      { billNo: "2", customerName: "No Consent", customerPhone: "9876543211", netSale: 500 },
      { billNo: "3", customerName: "Stopped", customerPhone: "9876543212", netSale: 200 },
      { billNo: "4", customerName: "New Customer", customerPhone: "9876543213", netSale: 300 },
    ],
    storeCode: "GP",
    storeId: "gp",
  });
  assert.equal(result.sent, 2);
  assert.equal(result.skippedWithoutConsent, 1);
  assert.equal(result.skippedDoNotContact, 1);
  assert.equal(outbound.length, 1);
  assert.deepEqual(outbound[0].payload.template.to_and_components[0], {
    to: ["919876543210"],
    components: { body_1: { type: "text", value: "Ravi" } },
  });
  assert.equal(f.db.customer_messages.length, 2);
  assert.equal(f.db.customer_profiles.find((profile) => profile.mobile === "9876543213")?.marketing_consent, true);
  assert.ok(f.db.whatsapp_deliveries.every((delivery) => delivery.status === "accepted"));
}));

test("bulk payslips route GP and BM through their own senders and templates", async () => withEnv({
  MSG91_AUTH_KEY: "not-a-real-key",
  MSG91_GP_INTEGRATED_NUMBER: "919999997444",
  MSG91_GP_CUSTOMER_TEMPLATE: "purchase_thank_you_gp_v1",
  MSG91_GP_PAYSLIP_TEMPLATE: "salary_slip_gp_v1",
  MSG91_BM_INTEGRATED_NUMBER: "919999995519",
  MSG91_BM_CUSTOMER_TEMPLATE: "purchase_thank_you_bm_v1",
  MSG91_BM_PAYSLIP_TEMPLATE: "salary_slip_bm_v1",
  MSG91_TEMPLATE_LANGUAGE: "en",
}, async () => {
  const outbound = [];
  const f = fixture({
    role: "owner",
    globals: {
      DOMException,
      Response,
      fetch: async (url, options = {}) => {
        if (String(url).includes("get-template-client")) {
          const name = String(url).includes("7444") ? "salary_slip_gp_v1" : "salary_slip_bm_v1";
          return Response.json({ data: [{ name, status: "approved" }] });
        }
        outbound.push(JSON.parse(options.body));
        return Response.json({ hasError: false, request_id: `request-${outbound.length}` });
      },
    },
  });
  f.db.whatsapp_deliveries = [];
  f.db.generated_payslips = [
    { id: "00000000-0000-0000-0000-000000000011", batch_id: "jan", store_id: "gp", staff_name: "Gita", salary_month: "2026-09-01", pdf_file_name: "gita.pdf", pdf_file_path: "gp/gita.pdf", whatsapp_phone: "919876543210", sent_status: "not_sent", is_current: true },
    { id: "00000000-0000-0000-0000-000000000012", batch_id: "jan", store_id: "bm", staff_name: "Bina", salary_month: "2026-09-01", pdf_file_name: "bina.pdf", pdf_file_path: "bm/bina.pdf", whatsapp_phone: "919876543211", sent_status: "not_sent", is_current: true },
  ];
  const { sendAllPayslips } = f.load("@/lib/payslips/actions");
  const formData = new FormData();
  formData.set("batchId", "jan");
  const result = await sendAllPayslips({ ok: false, message: "" }, formData);
  assert.equal(result.ok, true);
  assert.equal(outbound.length, 2);
  const bySender = new Map(outbound.map((payload) => [payload.integrated_number, payload]));
  assert.equal(bySender.get("919999997444").payload.template.name, "salary_slip_gp_v1");
  assert.deepEqual(bySender.get("919999997444").payload.template.to_and_components[0].to, ["919876543210"]);
  assert.equal(bySender.get("919999995519").payload.template.name, "salary_slip_bm_v1");
  assert.deepEqual(bySender.get("919999995519").payload.template.to_and_components[0].to, ["919876543211"]);
  assert.equal(f.db.whatsapp_deliveries.length, 2);
  assert.ok(f.db.whatsapp_deliveries.every((delivery) => delivery.status === "accepted"));
}));

test("single payslip uses MSG91 and prefixes a 10-digit Indian mobile with 91", async () => withEnv({
  MSG91_AUTH_KEY: "not-a-real-key",
  MSG91_GP_INTEGRATED_NUMBER: "919999997444",
  MSG91_GP_CUSTOMER_TEMPLATE: "purchase_thank_you_gp_v1",
  MSG91_GP_PAYSLIP_TEMPLATE: "salary_slip_gp_v1",
  MSG91_TEMPLATE_LANGUAGE: "en",
}, async () => {
  const outbound = [];
  const f = fixture({
    role: "owner",
    globals: {
      DOMException,
      Response,
      fetch: async (url, options = {}) => {
        if (String(url).includes("get-template-client")) {
          return Response.json({ data: [{ name: "salary_slip_gp_v1", status: "approved" }] });
        }
        outbound.push(JSON.parse(options.body));
        return Response.json({ hasError: false, request_id: "single-request" });
      },
    },
  });
  f.db.whatsapp_deliveries = [];
  f.db.generated_payslips = [{
    id: "00000000-0000-0000-0000-000000000021",
    batch_id: "jan",
    payslip_row_id: "a1",
    store_id: "gp",
    staff_name: "Gita",
    salary_month: "2026-09-01",
    pdf_file_name: "gita.pdf",
    pdf_file_path: "gp/gita.pdf",
    whatsapp_phone: "9876543210",
    sent_status: "not_sent",
    is_current: true,
  }];
  const { sendPayslip } = f.load("@/lib/payslips/actions");
  const result = await sendPayslip("00000000-0000-0000-0000-000000000021");
  assert.equal(result.ok, true);
  assert.equal(outbound.length, 1);
  assert.equal(outbound[0].integrated_number, "919999997444");
  assert.deepEqual(outbound[0].payload.template.to_and_components[0].to, ["919876543210"]);
  assert.equal(f.db.whatsapp_deliveries[0].status, "accepted");
}));

test("WhatsApp limits are enforced independently for each store", async () => withEnv({
  MSG91_MONTHLY_BUDGET_INR: "1500",
  MSG91_BUDGET_BUFFER_INR: "100",
  MSG91_SALARY_RESERVE_INR: "25",
  MSG91_MONTHLY_FOLLOWUP_LIMIT: "300",
  MSG91_DAILY_FOLLOWUP_LIMIT: "10",
}, async () => {
  const f = fixture();
  const now = new Date().toISOString();
  f.db.whatsapp_deliveries = [
    { created_at: now, kind: "customer_thank_you", status: "accepted", store_id: "gp", unit_cost_inr: 1375 },
  ];
  const { whatsappBudgetAllowance } = f.load("@/lib/msg91/budget");
  const gp = await whatsappBudgetAllowance("gp", "customer_follow_up", 10);
  const bm = await whatsappBudgetAllowance("bm", "customer_follow_up", 10);
  assert.equal(gp.allowed, 0, "GP spend must stop only GP");
  assert.equal(bm.allowed, 10, "unused BM budget must remain fully available");

  f.db.whatsapp_deliveries.push(...Array.from({ length: 10 }, () => ({
    created_at: now,
    kind: "customer_follow_up",
    status: "accepted",
    store_id: "bm",
    unit_cost_inr: 0.8631,
  })));
  const bmDailyCap = await whatsappBudgetAllowance("bm", "customer_follow_up", 10);
  assert.equal(bmDailyCap.allowed, 0, "BM daily cap must be enforced within BM only");
}));
