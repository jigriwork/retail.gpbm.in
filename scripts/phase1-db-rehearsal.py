#!/usr/bin/env python3
"""Restore the verified backup into an ephemeral PostgreSQL 17 cluster and test Phase 1.

The script writes aggregate/redacted evidence only. It never connects to the linked project.
"""

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import statistics
import subprocess
import tempfile
import time
from datetime import date, timedelta


REPO = pathlib.Path(__file__).resolve().parent.parent
BACKUP = pathlib.Path("/Users/adibsattar/Desktop/retail-gpbm-production-backup-2026-09-09")
PG = pathlib.Path("/opt/homebrew/opt/postgresql@17/bin")
PORT = "55641"
DATABASE = "phase1_restore"
EVIDENCE = REPO / "reports/phase-1-db-evidence-2026-09-25.json"
UUID_RE = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.I)

ENV = {
    "PATH": f"{PG}:/usr/bin:/bin",
    "LANG": "en_US.UTF-8",
    "TMPDIR": tempfile.gettempdir(),
}


def run(binary: str, args: list[str], input_text: str | None = None) -> str:
    result = subprocess.run(
        [str(PG / binary), *args],
        input=input_text,
        text=True,
        env=ENV,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode:
        raise RuntimeError(f"{binary} failed: {result.stderr[-2000:]}")
    return result.stdout.strip()


def sql(query: str) -> str:
    return run(
        "psql",
        ["-XqAt", "-h", "127.0.0.1", "-p", PORT, "-d", DATABASE, "-v", "ON_ERROR_STOP=1"],
        query,
    )


def auth_sql(query: str, user_id: str) -> str:
    return sql(
        "begin;"
        "set local role authenticated;"
        f"set local request.jwt.claim.sub='{user_id}';"
        "set local request.jwt.claim.role='authenticated';"
        f"{query};"
        "commit;"
    )


def timed_json(query: str, user_id: str, samples: int = 20) -> tuple[dict, dict]:
    values: list[float] = []
    payload = ""
    for _ in range(samples):
        started = time.monotonic()
        payload = auth_sql(query, user_id)
        values.append((time.monotonic() - started) * 1000)
    parsed = json.loads(payload)
    ordered = sorted(values)
    p95_index = max(0, min(len(ordered) - 1, int((len(ordered) * 0.95) + 0.999999) - 1))
    return parsed, {
        "samples": samples,
        "p50_ms": round(statistics.median(values), 2),
        "p95_ms": round(ordered[p95_index], 2),
        "min_ms": round(min(values), 2),
        "max_ms": round(max(values), 2),
        "payload_bytes": len(payload.encode("utf-8")),
    }


def fingerprint(table: str) -> dict:
    columns = json.loads(
        sql(
            "select json_agg(column_name order by ordinal_position) "
            "from information_schema.columns "
            f"where table_schema='public' and table_name='{table}'"
        )
    )
    selected = ",".join(f'"{column}"' for column in columns)
    return json.loads(
        sql(
            "select json_build_object('count',count(*),'digest',"
            "md5(coalesce(string_agg(md5(row_to_json(rows)::text),'' order by md5(row_to_json(rows)::text)),''))) "
            f"from (select {selected} from public.\"{table}\") rows"
        )
    )


def redact(value):
    if isinstance(value, str):
        return UUID_RE.sub("<uuid>", value)
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {key: redact(item) for key, item in value.items()}
    return value


def normalize(value) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip().lower())
    return re.sub(r"[^a-z0-9 ]", "", text)


def compact(value) -> str:
    return normalize(value).replace(" ", "")


def identity_keys(row: dict) -> list[tuple[str, str]]:
    keys: list[tuple[str, str]] = []
    barcode = compact(row.get("barcode"))
    sku = compact(row.get("sku"))
    item = normalize(row.get("item_name"))
    brand = normalize(row.get("brand"))
    size = normalize(row.get("size"))
    color = normalize(row.get("color"))
    if barcode:
        keys.append((f"barcode:{barcode}", "barcode"))
    if sku:
        keys.append((f"sku:{sku}", "sku"))
    if item and brand and size and color:
        keys.append((f"strong:{item}|{brand}|{size}|{color}", "strong-item"))
    if item and brand:
        keys.append((f"brand-item:{item}|{brand}", "brand-item"))
    if item:
        keys.append((f"weak-item:{item}", "weak-item"))
    return keys


def legacy_stock_summary(payload: dict, store: dict, stock_month: str, lookback: int) -> dict:
    today = date.today()
    slow_days = store.get("slow_stock_days") or (45 if store["code"] == "BM" else 30)
    dead_days = store.get("dead_stock_days") or (90 if store["code"] == "BM" else 60)
    movement: dict[str, dict[str, float]] = {}
    for row in payload["sales"]:
        row_date = date.fromisoformat(row["sale_date"])
        for key, _ in identity_keys(row):
            bucket = movement.setdefault(key, {"main": 0.0, "slow": 0.0, "dead": 0.0, "value": 0.0})
            quantity = float(row.get("quantity") or 0)
            net_sale = float(row.get("net_sale") or 0)
            age = (today - row_date).days + 1
            if age <= lookback:
                bucket["main"] += quantity
                bucket["value"] += net_sale
            if age <= slow_days:
                bucket["slow"] += quantity
            if age <= dead_days:
                bucket["dead"] += quantity

    items: dict[str, dict] = {}
    for row in payload["stock"]:
        keys = identity_keys(row)
        primary = keys[0][0] if keys else f"unknown:{row.get('store_id')}:{normalize(row.get('item_name'))}:{normalize(row.get('brand'))}:{normalize(row.get('category'))}"
        current = items.setdefault(
            primary,
            {
                "key": f"{row.get('store_id')}:{primary}",
                "stock_quantity": 0.0,
                "stock_mrp_value": 0.0,
                "sales_quantity": 0.0,
                "sales_value": 0.0,
                "slow_sales_quantity": 0.0,
                "dead_sales_quantity": 0.0,
                "match_quality": "none",
            },
        )
        quantity = float(row.get("quantity") or 0)
        current["stock_quantity"] += quantity
        if current["stock_mrp_value"] is not None:
            if row.get("mrp") is None or row.get("quantity") is None:
                current["stock_mrp_value"] = None
            else:
                current["stock_mrp_value"] += float(row["mrp"]) * float(row["quantity"])
        for key, quality in keys:
            if key in movement:
                current["sales_quantity"] = movement[key]["main"]
                current["sales_value"] = movement[key]["value"]
                current["slow_sales_quantity"] = movement[key]["slow"]
                current["dead_sales_quantity"] = movement[key]["dead"]
                current["match_quality"] = quality
                break

    values = list(items.values())
    candidates = {
        "slow": [item for item in values if item["stock_quantity"] > 0 and item["slow_sales_quantity"] <= max(item["stock_quantity"] * 0.05, 1)],
        "dead": [item for item in values if item["stock_quantity"] > 0 and item["dead_sales_quantity"] == 0],
        "fast_low": [item for item in values if item["sales_quantity"] >= 3 and item["stock_quantity"] <= max(item["sales_quantity"] * 0.5, 2)],
        "high_low": [item for item in values if item["stock_quantity"] >= 10 and item["sales_quantity"] <= max(item["stock_quantity"] * 0.05, 1)],
    }
    candidate_keys = {
        "slow": [item["key"] for item in sorted(candidates["slow"], key=lambda item: (-item["stock_quantity"], item["key"]))[:10]],
        "dead": [item["key"] for item in sorted(candidates["dead"], key=lambda item: (-item["stock_quantity"], item["key"]))[:10]],
        "fast_low": [item["key"] for item in sorted(candidates["fast_low"], key=lambda item: (-item["sales_quantity"], item["key"]))[:10]],
        "high_low": [item["key"] for item in sorted(candidates["high_low"], key=lambda item: (-item["stock_quantity"], item["key"]))[:10]],
    }
    return {
        "stock_month": stock_month,
        "lookback_days": lookback,
        "total_stock_quantity": sum(item["stock_quantity"] for item in values),
        "item_count": len(values),
        "candidate_counts": {key: len(value) for key, value in candidates.items()},
        "candidate_keys": candidate_keys,
    }


def main() -> None:
    if not (PG / "postgres").exists():
        raise RuntimeError("PostgreSQL 17 binaries are unavailable")
    if not (BACKUP / "database/database.dump").exists():
        raise RuntimeError("Verified backup is unavailable")
    if subprocess.run([str(PG / "pg_isready"), "-h", "127.0.0.1", "-p", PORT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
        raise RuntimeError("Isolated rehearsal port is already occupied")

    temporary = pathlib.Path(tempfile.mkdtemp(prefix="retail-phase1-"))
    started = False
    try:
        run("initdb", ["-D", str(temporary / "pgdata"), "-A", "trust", "--no-locale", "--encoding=UTF8"])
        run("pg_ctl", ["-D", str(temporary / "pgdata"), "-l", str(temporary / "postgres.log"), "-o", f"-h 127.0.0.1 -p {PORT} -k {temporary}", "-w", "start"])
        started = True
        run("createdb", ["-h", "127.0.0.1", "-p", PORT, DATABASE])

        roles_sql = (BACKUP / "database/roles.sql").read_text()
        for role in re.findall(r"^CREATE ROLE ([^;]+);", roles_sql, re.M):
            sql(f"create role {role} nologin;")
        sql('drop schema public; create schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;')
        run("pg_restore", ["--exit-on-error", "--no-owner", "-h", "127.0.0.1", "-p", PORT, "-d", DATABASE, str(BACKUP / "database/database.dump")])

        applied = set(json.loads(sql("select coalesce(json_agg(version::text),'[]') from supabase_migrations.schema_migrations")))
        migrations = sorted((REPO / "supabase/migrations").glob("*.sql"))
        phase1 = REPO / "supabase/migrations/20260925090000_phase1_analytics_summaries.sql"
        existing_timings = []
        for migration in migrations:
            version = migration.name.split("_", 1)[0]
            if migration == phase1 or version in applied:
                continue
            started_at = time.monotonic()
            sql(migration.read_text())
            existing_timings.append({"migration": migration.name, "seconds": round(time.monotonic() - started_at, 3)})

        protected_tables = ["reports", "sales_rows", "stock_rows", "profiles", "store_users", "staff_name_aliases", "tasks", "manager_updates", "rack_reviews", "cleaning_reviews", "app_settings"]
        before = {table: fingerprint(table) for table in protected_tables}
        started_at = time.monotonic()
        sql(phase1.read_text())
        migration_seconds = round(time.monotonic() - started_at, 3)
        after = {table: fingerprint(table) for table in protected_tables}
        if before != after:
            raise AssertionError("Phase 1 migration changed protected table rows")

        owner_id = sql("select id from public.profiles where role='owner' and is_active=true order by id limit 1")
        stores = json.loads(sql("select json_agg(json_build_object('id',id,'name',name,'code',code,'slow_stock_days',slow_stock_days,'dead_stock_days',dead_stock_days) order by code) from public.stores where is_active=true"))
        store_ids = [store["id"] for store in stores]
        store_array = "array[" + ",".join(f"'{store_id}'::uuid" for store_id in store_ids) + "]"
        dates = json.loads(sql("select json_build_object('start',min(sale_date),'end',max(sale_date)) from public.sales_rows"))
        stock_month = sql("select max(stock_month)::text from public.stock_rows")
        current_counts = json.loads(sql("select json_build_object('sales_rows',(select count(*) from public.sales_rows),'stock_rows',(select count(*) from public.stock_rows))"))
        if current_counts != {"sales_rows": 23209, "stock_rows": 38129}:
            raise AssertionError(f"Unexpected analytical baseline: {current_counts}")

        legacy_sales, legacy_sales_perf = timed_json(
            f"select public.analytics_data({store_array},'{dates['start']}'::date,'{dates['end']}'::date,'{{}}'::date[])", owner_id
        )
        sales_v2, sales_v2_perf = timed_json(
            f"select public.sales_analytics_summary_v2({store_array},'{dates['start']}'::date,'{dates['end']}'::date,25)", owner_id
        )
        staff_v2, staff_v2_perf = timed_json(
            f"select public.staff_sales_summary_v2({store_array},'{dates['start']}'::date,'{dates['end']}'::date,250)", owner_id
        )

        legacy_sales_reconciliation = {
            "source_row_count": int(legacy_sales["sales_row_count"]),
            "net_sale": float(legacy_sales["net_sale"]),
            "quantity": sum(float(row.get("quantity") or 0) for row in legacy_sales["sales"]),
        }
        v2_sales_reconciliation = {
            "source_row_count": int(sales_v2["reconciliation"]["source_row_count"]),
            "net_sale": float(sales_v2["reconciliation"]["net_sale"]),
            "quantity": float(sales_v2["reconciliation"]["quantity"]),
        }
        if legacy_sales_reconciliation != v2_sales_reconciliation:
            raise AssertionError({"legacy": legacy_sales_reconciliation, "v2": v2_sales_reconciliation})
        legacy_staff_reconciliation = {
            "source_row_count": sum(int(row.get("source_row_count") or 0) for row in legacy_sales["sales"] if str(row.get("staff_name") or "").strip()),
            "net_sale": sum(float(row.get("net_sale") or 0) for row in legacy_sales["sales"] if str(row.get("staff_name") or "").strip()),
            "quantity": sum(float(row.get("quantity") or 0) for row in legacy_sales["sales"] if str(row.get("staff_name") or "").strip()),
        }
        staff_v2_reconciliation = {
            "source_row_count": int(staff_v2["reconciliation"]["source_row_count"]),
            "net_sale": float(staff_v2["reconciliation"]["net_sale"]),
            "quantity": float(staff_v2["reconciliation"]["quantity"]),
        }
        if legacy_staff_reconciliation != staff_v2_reconciliation:
            raise AssertionError({"legacy_staff": legacy_staff_reconciliation, "v2_staff": staff_v2_reconciliation})

        stock_results = []
        stock_perf = []
        for store in stores:
            maximum_days = max(30, store.get("slow_stock_days") or 30, store.get("dead_stock_days") or 60)
            start_date = (date.today() - timedelta(days=maximum_days - 1)).isoformat()
            array = f"array['{store['id']}'::uuid]"
            legacy_stock, legacy_perf = timed_json(
                f"select public.analytics_data({array},'{start_date}'::date,'{date.today().isoformat()}'::date,array['{stock_month}'::date])",
                owner_id,
                samples=20,
            )
            v2_stock, v2_perf = timed_json(
                f"select public.stock_analytics_summary_v2({array},'{stock_month}'::date,30,10)", owner_id, samples=20
            )
            expected = legacy_stock_summary(legacy_stock, store, stock_month, 30)
            actual_store = v2_stock["stores"][0]
            actual = {
                "stock_month": actual_store["stock_month"],
                "lookback_days": int(actual_store["lookback_days"]),
                "total_stock_quantity": float(actual_store["total_stock_quantity"]),
                "item_count": int(actual_store["item_count"]),
                "candidate_counts": {key: int(value) for key, value in actual_store["candidate_counts"].items()},
            }
            expected_without_keys = {key: value for key, value in expected.items() if key != "candidate_keys"}
            if expected_without_keys != actual:
                raise AssertionError({"store": store["code"], "expected": expected_without_keys, "actual": actual})
            actual_keys = {
                "slow": [item["key"] for item in actual_store["slow_stock_candidates"]],
                "dead": [item["key"] for item in actual_store["dead_stock_candidates"]],
                "fast_low": [item["key"] for item in actual_store["fast_moving_low_stock_candidates"]],
                "high_low": [item["key"] for item in actual_store["high_stock_low_sale_candidates"]],
            }
            if expected["candidate_keys"] != actual_keys:
                raise AssertionError({"store": store["code"], "expected_keys": expected["candidate_keys"], "actual_keys": actual_keys})
            stock_results.append({"store": store["code"], "legacy": expected_without_keys, "v2": actual, "top_candidate_keys_exact": True, "exact": True})
            stock_perf.append({"store": store["code"], "legacy": legacy_perf, "v2": v2_perf})

        week_end = date.fromisoformat(dates["end"])
        week_start = week_end - timedelta(days=6)
        weekly_v2, weekly_perf = timed_json(
            f"select public.weekly_audit_summary_v2({store_array},'{week_start.isoformat()}'::date,'{week_end.isoformat()}'::date,5)", owner_id, samples=20
        )
        if len(weekly_v2["stores"]) != len(stores):
            raise AssertionError("Weekly audit did not return every requested store")

        denied = {}
        try:
            sql(f"set role anon; select public.sales_analytics_summary_v2({store_array},'{dates['start']}'::date,'{dates['end']}'::date,5);")
            denied["anonymous"] = False
        except RuntimeError:
            denied["anonymous"] = True

        manager = sql(
            "select profiles.id from public.profiles profiles "
            "left join public.store_users assignments on assignments.user_id=profiles.id "
            "where profiles.role='manager' and profiles.is_active=true group by profiles.id "
            "having count(assignments.store_id) < (select count(*) from public.stores where is_active=true) "
            "order by profiles.id limit 1"
        )
        if not manager:
            raise AssertionError("Single-store manager fixture not found")
        assigned = json.loads(sql(f"select coalesce(json_agg(store_id),'[]') from public.store_users where user_id='{manager}'"))
        unauthorized = next((store_id for store_id in store_ids if store_id not in assigned), None)
        if not unauthorized:
            raise AssertionError("Cross-store fixture not found")
        assigned_store = assigned[0]
        scoped_queries = {
            "sales": lambda store_id: f"select public.sales_analytics_summary_v2(array['{store_id}'::uuid],'{dates['start']}'::date,'{dates['end']}'::date,5)",
            "staff": lambda store_id: f"select public.staff_sales_summary_v2(array['{store_id}'::uuid],'{dates['start']}'::date,'{dates['end']}'::date,5)",
            "stock": lambda store_id: f"select public.stock_analytics_summary_v2(array['{store_id}'::uuid],'{stock_month}'::date,30,10)",
            "weekly": lambda store_id: f"select public.weekly_audit_summary_v2(array['{store_id}'::uuid],'{week_start.isoformat()}'::date,'{week_end.isoformat()}'::date,5)",
        }
        allowed = {"owner": {}, "assigned_manager": {}}
        for name, build_query in scoped_queries.items():
            auth_sql(build_query(assigned_store), owner_id)
            allowed["owner"][name] = True
            auth_sql(build_query(assigned_store), manager)
            allowed["assigned_manager"][name] = True
            try:
                auth_sql(build_query(unauthorized), manager)
                denied[f"manager_cross_store_{name}"] = False
            except RuntimeError:
                denied[f"manager_cross_store_{name}"] = True

        sql(f"update public.profiles set is_active=false where id='{manager}'")
        try:
            try:
                auth_sql(scoped_queries["sales"](assigned_store), manager)
                denied["inactive"] = False
            except RuntimeError:
                denied["inactive"] = True
        finally:
            sql(f"update public.profiles set is_active=true where id='{manager}'")

        try:
            sql(f"set role service_role; select public.sales_analytics_summary_v2({store_array},'{dates['start']}'::date,'{dates['end']}'::date,5);")
            denied["service_role_without_user"] = False
        except RuntimeError:
            denied["service_role_without_user"] = True

        plans = {}
        plan_queries = {
            "legacy_sales": f"explain (analyze,buffers,wal,settings,format json) select public.analytics_data({store_array},'{dates['start']}'::date,'{dates['end']}'::date,'{{}}'::date[])",
            "v2_sales": f"explain (analyze,buffers,wal,settings,format json) select public.sales_analytics_summary_v2({store_array},'{dates['start']}'::date,'{dates['end']}'::date,25)",
            "v2_staff": f"explain (analyze,buffers,wal,settings,format json) select public.staff_sales_summary_v2({store_array},'{dates['start']}'::date,'{dates['end']}'::date,250)",
            "v2_stock": f"explain (analyze,buffers,wal,settings,format json) select public.stock_analytics_summary_v2(array['{store_ids[0]}'::uuid],'{stock_month}'::date,30,10)",
            "v2_weekly": f"explain (analyze,buffers,wal,settings,format json) select public.weekly_audit_summary_v2({store_array},'{week_start.isoformat()}'::date,'{week_end.isoformat()}'::date,5)",
        }
        for name, query in plan_queries.items():
            plans[name] = redact(json.loads(auth_sql(query, owner_id)))

        evidence = {
            "environment": {
                "kind": "ephemeral-local-postgresql-17",
                "source": "verified-2026-09-09-production-backup",
                "network": "localhost-only",
                "production_connection_used": False,
            },
            "migration": {
                "file": phase1.name,
                "sha256": hashlib.sha256(phase1.read_bytes()).hexdigest(),
                "duration_seconds": migration_seconds,
                "existing_migrations_applied_before_candidate": existing_timings,
                "protected_table_fingerprints_unchanged": before == after,
                "protected_tables": {table: {"count": before[table]["count"], "unchanged": before[table] == after[table]} for table in protected_tables},
            },
            "baseline_counts": current_counts,
            "reconciliation": {
                "sales": {"legacy": legacy_sales_reconciliation, "v2": v2_sales_reconciliation, "exact": True},
                "staff": {"legacy": legacy_staff_reconciliation, "v2": staff_v2_reconciliation, "exact": True},
                "stock": stock_results,
                "weekly_store_count": len(weekly_v2["stores"]),
            },
            "rpc_performance": {
                "sales_legacy": legacy_sales_perf,
                "sales_v2": sales_v2_perf,
                "staff_v2": staff_v2_perf,
                "stock": stock_perf,
                "weekly_v2": weekly_perf,
            },
            "authorization": {"allowed": allowed, "denied": denied},
            "plans": plans,
        }
        EVIDENCE.write_text(json.dumps(evidence, indent=2) + "\n")
        print(json.dumps({
            "status": "PASS",
            "baseline_counts": current_counts,
            "migration_seconds": migration_seconds,
            "fingerprints_unchanged": before == after,
            "authorization": {"allowed": allowed, "denied": denied},
            "evidence": str(EVIDENCE),
        }))
    finally:
        if started:
            run("pg_ctl", ["-D", str(temporary / "pgdata"), "-m", "fast", "-w", "stop"])
        shutil.rmtree(temporary)


if __name__ == "__main__":
    main()
