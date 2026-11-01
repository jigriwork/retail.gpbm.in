// Disposable PostgreSQL for the cash book: applies every migration and runs
// the cash book database tests (psql only). Never loads .env.local.
// A few data migrations expect production rows (the owner, named staff);
// minimal fixtures are inserted just before them so the chain applies.
// Requires initdb/pg_ctl/psql/pg_isready on PATH.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { PATH: process.env.PATH, LANG: 'en_US.UTF-8', TMPDIR: tmpdir(), PGOPTIONS: '-c client_min_messages=warning', ...(process.env.DYLD_LIBRARY_PATH ? { DYLD_LIBRARY_PATH: process.env.DYLD_LIBRARY_PATH } : {}), ...(process.env.CASH_BOOK_WORKBOOK ? { CASH_BOOK_WORKBOOK: process.env.CASH_BOOK_WORKBOOK } : {}) };
const run = (cmd, args, options = {}) => execFileSync(cmd, args, { cwd: root, env, stdio: 'inherit', ...options });
for (const cmd of ['initdb', 'pg_ctl', 'psql', 'pg_isready']) run(cmd, ['--version'], { stdio: 'ignore' });
let occupied = false;
try { execFileSync('pg_isready', ['-h', '127.0.0.1', '-p', '55439'], { env, stdio: 'ignore' }); occupied = true; } catch {}
if (occupied) throw new Error('Port 55439 is occupied. Refusing to touch an existing database.');

const fixturesBefore = {
  '20261005220000_staff_transfers_and_departure_cleanup.sql': `
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000f0f0', 'fixture-owner@example.invalid') on conflict do nothing;
update public.profiles set role = 'owner', is_active = true, full_name = 'Fixture owner' where id = '00000000-0000-0000-0000-00000000f0f0';
insert into public.employee_contacts(store_id, staff_name, normalized_staff_name, is_active)
select s.id, v.name, v.norm, true from (values ('GP', 'Ganesh', 'ganesh'), ('BM', 'Sohel', 'sohel'), ('GP', 'S k Kasim', 's k kasim')) v(code, name, norm)
join public.stores s on s.code = v.code on conflict do nothing;`,
};

// Afterwards the fixture staff (and what the data migration made from them)
// are removed, so later tests start from an empty staff list as before.
const fixturesAfter = {
  '20261005220000_staff_transfers_and_departure_cleanup.sql': `
delete from public.staff_name_aliases;
delete from public.employee_contacts;`,
};

const temp = mkdtempSync(path.join(tmpdir(), 'retail-cashbook-'));
const data = path.join(temp, 'pgdata');
let started = false;
const tests = process.argv.slice(2).length ? process.argv.slice(2) : ['tests/cash-book-database.test.mjs', 'tests/cash-book-monthly-database.test.mjs', 'tests/owner-summary-database.test.mjs'];
try {
  run('initdb', ['-D', data, '-A', 'trust', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore' });
  run('pg_ctl', ['-D', data, '-l', path.join(temp, 'postgres.log'), '-o', `-h 127.0.0.1 -p 55439 -k ${temp}`, '-w', 'start'], { stdio: 'ignore' }); started = true;
  run('createdb', ['-h', '127.0.0.1', '-p', '55439', 'retail_safety']);
  const args = ['-X', '-q', '-h', '127.0.0.1', '-p', '55439', '-d', 'retail_safety', '-v', 'ON_ERROR_STOP=1'];
  run('psql', args, { input: readFileSync(path.join(root, 'tests/sql/bootstrap.sql')), stdio: ['pipe', 'inherit', 'inherit'] });
  for (const file of readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
    if (fixturesBefore[file]) run('psql', args, { input: fixturesBefore[file], stdio: ['pipe', 'ignore', 'inherit'] });
    run('psql', [...args, '-f', path.join(root, 'supabase/migrations', file)], { stdio: ['ignore', 'ignore', 'inherit'] });
    if (fixturesAfter[file]) run('psql', args, { input: fixturesAfter[file], stdio: ['pipe', 'ignore', 'inherit'] });
  }
  run(process.execPath, ['--test', '--test-concurrency=1', ...tests]);
} finally {
  if (started) run('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop'], { stdio: 'ignore' });
  rmSync(temp, { recursive: true, force: true });
}
