import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { reportRpcs } from "./report-rpcs.mjs";
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const clone = value => JSON.parse(JSON.stringify(value));
// In-memory Supabase contract, deliberately without RLS filtering: application
// authorization must stand on its own. No real Supabase client or env is loaded.
export function fixture({ role = "manager", active = true, assigned = ["gp"], anonymous = false, baseline = false, modules = {}, globals = {} } = {}) {
  const db = {
    profiles: [{ id: "actor", role, is_active: active }],
    stores: [{ id: "gp", code: "GP", name: "GP", is_active: true }, { id: "bm", code: "BM", name: "BM", is_active: true }],
    store_users: assigned.map(store_id => ({ id: store_id, store_id, user_id: "actor" })),
    employee_contacts: [
      { id: "alice", store_id: "gp", staff_name: "Alice", normalized_staff_name: "alice", phone: "old", normalized_phone: "old" },
      { id: "bob", store_id: "gp", staff_name: "Bob", normalized_staff_name: "bob", phone: "old" },
      { id: "other-alice", store_id: "bm", staff_name: "Alice", normalized_staff_name: "alice", phone: "old" },
    ],
    payslip_rows: [
      { id: "a1", batch_id: "jan", store_id: "gp", staff_name: "Alice", employee_phone: "old" },
      { id: "a2", batch_id: "feb", store_id: "gp", staff_name: " ALICE ", employee_phone: "old" },
      { id: "b1", batch_id: "jan", store_id: "gp", staff_name: "Bob", employee_phone: "old" },
      { id: "a3", batch_id: "jan", store_id: "bm", staff_name: "Alice", employee_phone: "old" },
    ],
    generated_payslips: [], reports: [], sales_rows: [], sales_upload_batches: [], audit_logs: [], report_imports: [], report_import_chunks: [], staff_name_aliases: [], rack_reviews: [], cleaning_reviews: [], manager_updates: [], tasks: [],
  };
  db.generated_payslips = db.payslip_rows.map(row => ({ ...row, id: `pdf-${row.id}`, payslip_row_id: row.id }));
  const files = new Map();
  const calls = [];
  let fail;
  let sequence = 0;
  function from(table) {
    assert.ok(table in db, `Unexpected table ${table}`);
    let operation = "select", values, single = false, selection = "*";
    let start = 0, end = 999;
    const predicates = [];
    const query = {
      select(columns = "*") { selection = columns; return this; },
      is(key, value) { predicates.push(row => (row[key] ?? null) === value); return this; },
      eq(key, value) { predicates.push(row => row[key] === value); return this; },
      in(key, values) { predicates.push(row => values.includes(row[key])); return this; },
      gte(key, value) { predicates.push(row => row[key] >= value); return this; },
      lte(key, value) { predicates.push(row => row[key] <= value); return this; },
      order() { return this; },
      not(key, op, value) { predicates.push(row => value === null ? row[key] != null : row[key] !== value); return this; },
      limit(limit) { end = limit - 1; return this; },
      or() { return this; },
      range(a, b) { start = a; end = b; return this; },
      maybeSingle() { single = true; return this; },
      single() { single = true; return this; },
      insert(data) { operation = "insert"; values = data; return this; },
      upsert(data) { operation = "upsert"; values = data; return this; },
      update(data) { operation = "update"; values = data; return this; },
      delete() { operation = "delete"; return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          calls.push({ table, operation, values: clone(values ?? null) });
          if (fail?.(table, operation, values)) return { data: null, error: { message: "Fixture failure" } };
          let selected = db[table].filter(row => predicates.every(predicate => predicate(row))).slice(start, end + 1);
          if (operation === "insert" || operation === "upsert") {
            selected = (Array.isArray(values) ? values : [values]).map(value => {
              const existing = operation === "upsert" && db[table].find(row => row.store_id === value.store_id && row.normalized_staff_name === value.normalized_staff_name);
              if (existing) { Object.assign(existing, clone(value)); return existing; }
              const row = { id: `new-${++sequence}`, sales_upload_batch_id: null, ...clone(value) };
              db[table].push(row);
              return row;
            });
          }
          if (operation === "update") selected.forEach(row => Object.assign(row, clone(values)));
          if (operation === "delete") db[table] = db[table].filter(row => !selected.includes(row));
          if (table === "store_users" && selection.includes("stores(")) selected = selected.map(row => ({ ...row, stores: db.stores.find(store => store.id === row.store_id) }));
          return { data: clone(single ? selected[0] ?? null : selected), error: null, count: db[table].filter(row => predicates.every(predicate => predicate(row))).length };
        }).then(resolve, reject);
      },
    };
    return query;
  }
  const client = {
    from,
    auth: { getUser: async () => ({ data: { user: anonymous ? null : { id: "actor" } }, error: null }) },
    storage: { from(bucket) {
      assert.ok(["reports", "payslips"].includes(bucket));
      return {
        async upload(key, file, options) {
          calls.push({ operation: "upload", key });
          if (fail?.("storage", "upload")) return { error: { message: "Fixture upload failure", statusCode: "500" } };
          assert.equal(options.upsert, false, "Original source must never be overwritten");
          if (files.has(key)) return { error: { message: "Already exists", statusCode: "409" } };
          files.set(key, await file.text());
          return { error: null };
        },
        async remove() { assert.fail("Physical deletion of recovery evidence is forbidden"); },
        async download(key) { return { data: files.has(key) ? new Blob([files.get(key)]) : null, error: files.has(key) ? null : { message: "Missing" } }; },
      };
    } },
  };
  client.rpc = reportRpcs(db, client);
  const cache = new Map();
  const mocks = {
    "server-only": {},
    "next/cache": { revalidatePath() {} },
    "next/navigation": { redirect(url) { throw new Error(`Redirect: ${url}`); } },
    react: { cache: fn => {
      const memo = new Map();
      return (...args) => { const key=JSON.stringify(args); if (!memo.has(key)) memo.set(key, fn(...args)); return memo.get(key); };
    } },
    "@/lib/supabase/server": { createClient: async () => client, createAdminClient: () => { calls.push({ operation: "admin" }); return client; } },
    "@/lib/reports/staff-name-matching": { getKnownSalesStaffNameKeys: async () => new Set(["gp:alice"]) },
    "@/lib/payslips/pdf": {},
    "@/lib/payslips/receivables": {},
  };
  function load(name) {
    if (name in modules) return modules[name];
    if (name in mocks) return mocks[name];
    if (!name.startsWith("@/")) {
      assert.ok(["xlsx", "date-fns", "date-fns-tz", "node:crypto", "node:child_process", "node:path", "jszip"].includes(name), `Unmocked dependency ${name}`);
      return require(name);
    }
    if (cache.has(name)) return cache.get(name);
    const filename = path.join(root, `${name.slice(2)}.ts`);
    const source = baseline
      ? execFileSync("git", ["show", `3394934:${name.slice(2)}.ts`], {cwd:root,encoding:"utf8"})
      : readFileSync(filename, "utf8");
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const loadedModule = { exports: {} };
    const run = vm.runInNewContext(`(function(require, module, exports) {${compiled}\n})`, {
      File, FormData, URL, Buffer, Blob, AbortSignal, console, process, setTimeout, clearTimeout,
      fetch() { throw new Error("Network forbidden in regression tests"); },
      ...globals,
    }, { filename });
    run(load, loadedModule, loadedModule.exports);
    cache.set(name, loadedModule.exports);
    return loadedModule.exports;
  }
  return { db, files, calls, client, load, failWhen(fn) { fail = fn; } };
}
