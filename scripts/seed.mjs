// Isi database dari data/inventory.xlsx (10 sheet).  Pakai:  DATABASE_URL="postgres://..." npm run seed  [-- --reset]
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { SKEMA, barisKeObjek } from '../public/js/schema.js';
const XLSX = createRequire(import.meta.url)('xlsx');

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!url) { console.error('Atur DATABASE_URL terlebih dahulu.'); process.exit(1); }
const file = process.argv.find(a => a.endsWith('.xlsx')) || new URL('../data/inventory.xlsx', import.meta.url).pathname;
const reset = process.argv.includes('--reset');
const sql = neon(url), q = (t, p = []) => sql.query(t, p);

await q(`CREATE TABLE IF NOT EXISTS inventory_records (id BIGSERIAL PRIMARY KEY, sheet_name TEXT NOT NULL, payload JSONB NOT NULL, ver INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
await q('CREATE INDEX IF NOT EXISTS idx_inv_sheet_id ON inventory_records(sheet_name, id)');
const ada = Number((await q('SELECT count(*) AS n FROM inventory_records'))[0].n);
if (ada > 0 && !reset) { console.error(`Tabel sudah berisi ${ada} baris. Jalankan dengan --reset untuk menghapus dan mengisi ulang.`); process.exit(1); }
if (reset) await q('TRUNCATE inventory_records RESTART IDENTITY');

const wb = XLSX.read(fs.readFileSync(file), { cellDates: true });
let total = 0;
for (const sheet of Object.keys(SKEMA)) {
  if (!wb.Sheets[sheet]) { console.log(`- ${sheet}: tidak ada di file, dilewati`); continue; }
  const rows = barisKeObjek(sheet, XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, cellDates: true, defval: null }));
  for (let i = 0; i < rows.length; i += 1500) await q('INSERT INTO inventory_records(sheet_name, payload) SELECT $1, x FROM jsonb_array_elements($2::jsonb) WITH ORDINALITY AS t(x, n) ORDER BY n', [sheet, JSON.stringify(rows.slice(i, i + 1500))]);
  console.log(`- ${sheet}: ${rows.length} baris`); total += rows.length;
}
console.log(`Selesai. ${total} baris dimasukkan.`);
