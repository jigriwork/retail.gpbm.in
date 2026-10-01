import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "./helpers/app-fixture.mjs";

const form = (values) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};
const valid = { name: "Go Planet Kids", code: "gpk", firmName: "GP Fashion", location: "Berhampur", monthlyTarget: "15,00,000" };

test("only owners can add or switch stores", async () => {
  for (const role of ["manager", "staff"]) {
    const f = fixture({ role });
    const actions = f.load("@/lib/stores/store-actions");
    assert.equal((await actions.createStore({ ok: false, message: "" }, form(valid))).ok, false);
    assert.equal((await actions.setStoreActive({ ok: false, message: "" }, form({ storeId: "gp", active: "false" }))).ok, false);
    assert.equal(f.db.stores.length, 2);
  }
});

test("an owner adds a store with a clean code and target", async () => {
  const f = fixture({ role: "owner" });
  const { createStore } = f.load("@/lib/stores/store-actions");
  const result = await createStore({ ok: false, message: "" }, form(valid));
  assert.equal(result.ok, true, result.message);
  const added = f.db.stores.find((store) => store.code === "GPK");
  assert.ok(added);
  assert.equal(added.is_active, true);
  assert.equal(added.firm_name, "GP Fashion");
  assert.equal(added.monthly_target, 1500000);
  assert.equal(added.monthly_target_enabled, true);
  assert.equal(added.slow_stock_days, 45);
  assert.equal(added.dead_stock_days, 90);
});

test("store details are checked before saving", async () => {
  const f = fixture({ role: "owner" });
  const { createStore } = f.load("@/lib/stores/store-actions");
  const blank = { ok: false, message: "" };
  assert.equal((await createStore(blank, form({ ...valid, code: "GP" }))).ok, false, "duplicate code");
  assert.equal((await createStore(blank, form({ ...valid, code: "G P!" }))).ok, false, "bad code");
  assert.equal((await createStore(blank, form({ ...valid, firmName: "" }))).ok, false, "firm name needed");
  assert.equal((await createStore(blank, form({ ...valid, monthlyTarget: "lots" }))).ok, false, "target must be a number");
  assert.equal((await createStore(blank, form({ ...valid, slowStockDays: "90", deadStockDays: "60" }))).ok, false, "dead after slow");
  assert.equal(f.db.stores.length, 2);
});
