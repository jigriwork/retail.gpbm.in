// Imports one month of an old cash book workbook (sheet with Date, Opening
// Balance, Book Sales, Software Sales, Expenses, Closing Balance and a
// MONTHLY TOTAL row) into the app's cash book as closed legacy days.
//
//   node scripts/cash-book-import-workbook.mjs --file <xlsx> --sheet "September 2026" --store GP --print
//       prints the validated payload (no database)
//   node scripts/cash-book-import-workbook.mjs --file <xlsx> --sheet "September 2026" --store GP
//       dry run against the database in .env.local (validates, writes nothing)
//   ... --commit
//       imports (idempotent: the same file for the same store is imported once)
//   ... --fix 2026-09-20:software_sales:122594 --fix-reason "Staff typed an extra 2"
//       an owner-stated correction of a typing error. Only Software Sales can
//       be corrected (it does not change any balance); the workbook is checked
//       as it is first, and the workbook value, the corrected value and the
//       reason are kept with the import. Repeat --fix for more days.
//
// "Expenses" in these workbooks combines payment-mode deductions and real
// expenses with no split, so it is imported as one legacy combined deduction
// per day. Nothing is invented: no counted cash, no categories, no fixes to
// negative balances or odd Software Sales figures (they are flagged).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const file = option('file');
const sheetName = option('sheet');
const storeCode = (option('store') ?? '').toUpperCase();
if (!file || !sheetName || !storeCode) {
  console.error('Usage: --file <xlsx> --sheet "<Month YYYY>" --store <CODE> [--print | --commit] [--owner <uuid>]');
  process.exit(2);
}

const HEADERS = ['Date', 'Opening Balance', 'Book Sales', 'Software Sales', 'Expenses', 'Closing Balance'];
const buffer = readFileSync(file);
const sha256 = createHash('sha256').update(buffer).digest('hex');
const workbook = XLSX.read(buffer, { cellFormula: false, cellDates: false });
const sheet = workbook.Sheets[sheetName];
if (!sheet) throw new Error(`Sheet "${sheetName}" not found. Sheets: ${workbook.SheetNames.join(', ')}`);
const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
const header = grid[0].map((cell) => String(cell ?? '').trim());
const col = Object.fromEntries(HEADERS.map((name) => {
  const index = header.indexOf(name);
  if (index < 0) throw new Error(`Column "${name}" not found in ${sheetName}.`);
  return [name, index];
}));

const isoFromSerial = (serial) => {
  if (typeof serial !== 'number' || !Number.isInteger(serial)) throw new Error(`Not a date: ${serial}`);
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10);
};
const rupees = (value, label, date) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${date}: ${label} is not a number (${JSON.stringify(value)}). Enter 0 for a true zero.`);
  if (Math.round(value * 100) !== value * 100) throw new Error(`${date}: ${label} has more than 2 decimals.`);
  return value;
};

const days = [];
let totals = null;
for (const row of grid.slice(1)) {
  const first = row[col.Date];
  if (typeof first === 'string' && /monthly total/i.test(first)) {
    totals = {
      book_sales: rupees(row[col['Book Sales']], 'Book Sales total', 'total'),
      software_sales: rupees(row[col['Software Sales']], 'Software Sales total', 'total'),
      combined_deduction: rupees(row[col.Expenses], 'Expenses total', 'total'),
    };
    break;
  }
  const date = isoFromSerial(first);
  days.push({
    date,
    opening: rupees(row[col['Opening Balance']], 'Opening Balance', date),
    book_sales: rupees(row[col['Book Sales']], 'Book Sales', date),
    software_sales: rupees(row[col['Software Sales']], 'Software Sales', date),
    combined_deduction: rupees(row[col.Expenses], 'Expenses', date),
    closing: rupees(row[col['Closing Balance']], 'Closing Balance', date),
  });
}
if (!totals) throw new Error('MONTHLY TOTAL row not found.');
if (!days.length) throw new Error('No days found.');

// Independent check before anything is sent (in paise, exact).
const paise = (value) => Math.round(value * 100);
let previous = paise(days[0].opening);
const sum = { book_sales: 0, software_sales: 0, combined_deduction: 0 };
days.forEach((day, index) => {
  const expected = new Date(`${days[0].date}T00:00:00Z`);
  expected.setUTCDate(expected.getUTCDate() + index);
  if (day.date !== expected.toISOString().slice(0, 10)) throw new Error(`Day ${expected.toISOString().slice(0, 10)} is missing or out of order.`);
  if (paise(day.opening) !== previous) throw new Error(`${day.date}: opening ${day.opening} is not the previous closing ${previous / 100}.`);
  if (paise(day.opening) + paise(day.book_sales) - paise(day.combined_deduction) !== paise(day.closing)) throw new Error(`${day.date}: closing does not add up.`);
  previous = paise(day.closing);
  for (const key of Object.keys(sum)) sum[key] += paise(day[key]);
});
for (const key of Object.keys(sum)) if (sum[key] !== paise(totals[key])) throw new Error(`${key} total ${sum[key] / 100} ≠ workbook ${totals[key]}.`);
const lastDate = days.at(-1).date;
const monthEnd = new Date(`${days[0].date.slice(0, 8)}01T00:00:00Z`);
monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1); monthEnd.setUTCDate(0);
if (days[0].date.slice(8) !== '01' || lastDate !== monthEnd.toISOString().slice(0, 10)) throw new Error('The sheet must cover one full calendar month.');

// Owner-stated corrections, applied after the workbook itself has been checked.
const fixes = args.flatMap((arg, i) => (arg === '--fix' ? [args[i + 1]] : []));
const corrections = [];
if (fixes.length) {
  const reason = (option('fix-reason') ?? '').trim();
  if (reason.length < 5) throw new Error('--fix needs --fix-reason "<why>" (at least 5 characters).');
  for (const fix of fixes) {
    const match = /^(\d{4}-\d{2}-\d{2}):(\w+):(\d+(?:\.\d{1,2})?)$/.exec(fix ?? '');
    if (!match) throw new Error(`--fix ${fix}: use DATE:software_sales:AMOUNT`);
    const [, date, field, value] = match;
    if (field !== 'software_sales') throw new Error(`--fix ${fix}: only software_sales can be corrected; other figures would change the workbook's balances.`);
    const day = days.find((item) => item.date === date);
    if (!day) throw new Error(`--fix ${fix}: ${date} is not in the sheet.`);
    if (corrections.some((item) => item.date === date)) throw new Error(`--fix ${fix}: ${date} is corrected twice.`);
    corrections.push({ date, field, workbook_value: day.software_sales, corrected_value: Number(value), reason });
    day.software_sales = Number(value);
  }
  totals.software_sales_workbook = totals.software_sales;
  totals.software_sales = days.reduce((total, day) => total + paise(day.software_sales), 0) / 100;
}

const source = {
  file_name: path.basename(option('name') ?? file), sheet: sheetName, sha256,
  period_from: days[0].date, period_to: lastDate, opening: days[0].opening, closing: days.at(-1).closing, totals, corrections,
};
const report = {
  store: storeCode, ...source, days: days.length,
  negative_closing_days: days.filter((day) => day.closing < 0).map((day) => day.date),
  corrections,
  software_outliers: days.filter((day) => Math.abs(day.software_sales - day.book_sales) > 100000)
    .map((day) => ({ date: day.date, book_sales: day.book_sales, software_sales: day.software_sales })),
};
if (flag('print')) {
  console.log(JSON.stringify({ report, source, days }));
  process.exit(0);
}

// Database: Supabase REST with the service key from .env.local (server-side only).
const env = Object.fromEntries(readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')
  .filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')]; }));
const base = env.NEXT_PUBLIC_SUPABASE_URL; const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in .env.local.');
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
const get = async (query) => { const res = await fetch(`${base}/rest/v1/${query}`, { headers }); if (!res.ok) throw new Error(await res.text()); return res.json(); };
const [store] = await get(`stores?select=id,code,name&code=eq.${encodeURIComponent(storeCode)}`);
if (!store) throw new Error(`Store ${storeCode} not found.`);
let owner = option('owner');
if (!owner) {
  const owners = await get('profiles?select=id,full_name&role=eq.owner&is_active=eq.true&order=created_at');
  if (owners.length !== 1) throw new Error(`Pass --owner <uuid>: ${owners.length} active owners found.`);
  owner = owners[0].id;
}
const res = await fetch(`${base}/rest/v1/rpc/cash_book_import_legacy`, {
  method: 'POST', headers,
  body: JSON.stringify({ p_store: store.id, p_source: { ...source, imported_by: owner }, p_days: days, p_dry_run: !flag('commit') }),
});
const body = await res.json();
console.log(JSON.stringify({ report, store: store.name, mode: flag('commit') ? 'commit' : 'dry_run', http: res.status, result: body }, null, 2));
if (!res.ok) process.exit(1);
