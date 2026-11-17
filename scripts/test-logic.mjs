// Tes logika terhadap data/inventory.xlsx:  npm test
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as L from '../public/js/logic.js';
import { SKEMA, barisKeObjek } from '../public/js/schema.js';
const XLSX = createRequire(import.meta.url)('xlsx');
const wb = XLSX.read(fs.readFileSync(new URL('../data/inventory.xlsx', import.meta.url).pathname), { cellDates: true });
const D = {}; for (const s of Object.keys(SKEMA)) D[s] = barisKeObjek(s, XLSX.utils.sheet_to_json(wb.Sheets[s], { header: 1, raw: true, cellDates: true, defval: null })).map((r, i) => ({ ...r, _r: i + 1, _s: '1' }));
for (const s of Object.keys(D)) for (const r of D[s]) if ('tgl' in r) r.tgl = L.tglNorm(r.tgl);
console.log('baris:', Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])));

assert.equal(L.tglNorm('13/11/2026'), '2026-11-13'); assert.equal(L.tglNorm('2026-11-13'), '2026-11-13'); assert.equal(L.tglTampil('2026-11-13'), '13/11/2026');
assert.equal(L.pgAlias('DW 100M'), 'DW 100M'); assert.equal(L.pgAlias('dw  ZTT 100M'), 'DW 100M'); assert.equal(L.pgAlias('DW 150W'), 'DW 150M'); assert.equal(L.pgAlias('ONT HUWEI'), 'ONT HUAWEI NEW'); assert.equal(L.pgAlias('RB951'), null);
assert.equal(L.addDays('2026-03-01', -1), '2026-02-28'); assert.equal(L.akhirBulan(2024, 2), '2024-02-29');

const awal = D.Data_Barang.reduce((s, r) => s + L.num(r.awal), 0); console.log('Total Stok Awal Kartu Gantung:', awal); assert.equal(awal, 6546);   // sesuai PANDUAN.md
const C = L.stokCtx(D), rows = L.stokBaris(C);
const reg = rows.filter(r => r.master); console.log('material terdaftar:', reg.length, '| belum terdaftar bergerak:', rows.length - reg.length, '| mv:', C.mv.length);
console.log('stok total sekarang:', reg.reduce((s, r) => s + r.stok, 0), '| habis:', reg.filter(r => r.status === 'Habis').length, '| menipis:', reg.filter(r => r.status === 'Menipis').length);
assert.equal(L.stokTotalPada(C, L.STOK_AWAL_TANGGAL), awal);                         // pada tanggal snapshot stok = stok awal
const semua = L.stokBaris(C, null, true).reduce((s, r) => s + r.stok, 0);   // termasuk material belum terdaftar (seperti versi PHP)
assert.equal(L.stokTotalPada(C, '9999-12-31'), semua);
const pg = L.pgData(C, null, 'bulanan', '2026-01-01', '2026-11-17'); console.log('pergerakan bulanan:', pg.l.length, 'periode; stok akhir', pg.stok.at(-1), 'masuk', pg.masuk.reduce((a, b) => a + b, 0), 'keluar', pg.keluar.reduce((a, b) => a + b, 0));
assert.equal(pg.stok.at(-1), semua);
for (const n of L.pgDaftar()) { const g = L.pgData(C, n, 'bulanan', '2026-01-01', '2026-11-17'); assert.equal(g.l.length, 11); }
const hh = L.pgData(C, null, 'harian', '2026-10-25', '2026-11-17'); assert.equal(hh.l.length, 24); const mm = L.pgData(C, null, 'mingguan', '2026-10-01', '2026-11-17'); console.log('mingguan:', mm.l.length, 'minggu');
const rw = L.riwayat(D); console.log('riwayat:', rw.length); assert.equal(rw.length, Object.values(D).slice(1, 9).reduce((s, v) => s + v.length, 0));
console.log('OK semua tes logika');
