// Tes API terhadap Postgres sungguhan (PGlite, WASM) memakai SQL yang sama dengan produksi:  node scripts/test-api.mjs
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { setQuery, store } from '../api/_lib.js';
import data from '../api/data.js'; import mutate from '../api/mutate.js'; import status from '../api/status.js'; import login from '../api/login.js';
const pg = new PGlite(); setQuery(async (t, p = []) => (await pg.query(t, p)).rows);
const call = async (fn, { method = 'GET', url = '/', body, headers = {} } = {}) => {
  const req = { method, url, headers, body }; let out = { code: 200, body: '' };
  const res = { statusCode: 200, setHeader() {}, end(b) { out = { code: this.statusCode, body: JSON.parse(b) }; } }; await fn(req, res); return out;
};
const M = (b) => call(mutate, { method: 'POST', body: b });
// ---- tambah dengan beberapa SN ----
let r = await M({ aksi: 'add', sheet: 'Barang_Keluar', data: { tgl: '2026-11-17', pengambil: 'A', material: 'ONT X', sn: 'S1, S2\nS3', mitra: 'M' } });
assert.equal(r.code, 200); assert.equal(r.body.count, 3); assert.deepEqual(r.body.rows.map(x => x.sn), ['S1', 'S2', 'S3']); console.log('tambah 3 SN: ok, id =', r.body.rows.map(x => x._r));
r = await M({ aksi: 'add', sheet: 'Pengambilan_Ritel', data: { tgl: '2026-11-17', mitra: 'R', material: 'ONT X', sn: '', jumlah: '4' } });
assert.equal(r.body.count, 4); assert.deepEqual(r.body.rows.map(x => x.no), ['1', '2', '3', '4']); console.log('tanpa SN x4 + penomoran: ok');
r = await M({ aksi: 'add', sheet: 'Pengambilan_Ggn', data: { tgl: '2026-11-17', material: 'ONT X', sn: 'S2' } });          // S2 sudah ada di Barang_Keluar -> grup yang sama
assert.equal(r.code, 400); assert.match(r.body.error, /duplikat/); console.log('SN duplikat antar-sheet ditolak:', r.body.error);
r = await M({ aksi: 'add', sheet: 'Barang_Keluar', data: { tgl: '17/11/2026', pengambil: 'A', material: 'X' } }); assert.equal(r.code, 400); assert.match(r.body.error, /Tanggal/);
// ---- ubah dengan kontrol versi ----
const row = r0(await call(data, { url: '/api/data?sheet=Barang_Keluar&limit=2' })); function r0(x) { return x.body.rows[0]; }
r = await M({ aksi: 'save', sheet: 'Barang_Keluar', _r: row._r, _s: row._s, data: { ...row, mitra: 'BARU' } }); assert.equal(r.code, 200); assert.equal(r.body.row.mitra, 'BARU'); assert.equal(r.body.row._s, '2');
r = await M({ aksi: 'save', sheet: 'Barang_Keluar', _r: row._r, _s: row._s, data: { ...row, mitra: 'LAMA' } }); assert.equal(r.code, 409); console.log('konflik versi ditolak:', r.body.error);
r = await M({ aksi: 'kosongsn', sheet: 'Barang_Keluar', _r: row._r, _s: r0(await call(data, { url: '/api/data?sheet=Barang_Keluar&limit=1' }))._s }); assert.equal(r.body.row.sn, '');
// ---- hapus ----
r = await M({ aksi: 'del', sheet: 'Barang_Keluar', _r: row._r, _s: '1' }); assert.equal(r.code, 409);
r = await M({ aksi: 'del', sheet: 'Barang_Keluar', _r: row._r, _s: '3' }); assert.equal(r.code, 200);
// ---- Data_Barang: duplikat + import upsert ----
r = await M({ aksi: 'add', sheet: 'Data_Barang', data: { nama: 'Mat A', valtype: 'BAIK', awal: '5', min: '1' } }); assert.equal(r.code, 200);
r = await M({ aksi: 'add', sheet: 'Data_Barang', data: { nama: 'mat  a', valtype: 'BAIK' } }); assert.equal(r.code, 400);
r = await M({ aksi: 'import', sheet: 'Data_Barang', mode: 'upsert', rows: [{ nama: 'MAT A', valtype: 'BAIK', satuan: 'Unit', awal: '9', min: '1', ket: '' }, { nama: 'Mat B', valtype: 'BAIK', satuan: 'Unit', awal: '2', min: '0', ket: '' }] });
assert.deepEqual([r.body.baru, r.body.ubah], [1, 1]); console.log('import upsert (1 baru, 1 ubah): ok');
// ---- paging ----
await M({ aksi: 'import', sheet: 'Master_SN', rows: Array.from({ length: 25 }, (_, i) => ({ kode: 'K', nama: 'N', valtype: 'BAIK', plnt: '1', sloc: '1', sn: 'SN' + i, ket: '', lokasi: '' })) });
let after = 0, n = 0, pages = 0; for (;;) { const j = (await call(data, { url: `/api/data?sheet=Master_SN&after=${after}&limit=10` })).body; n += j.rows.length; pages++; if (j.next == null) break; after = j.next; } assert.equal(n, 25); assert.equal(pages, 3); console.log('paging 25 baris / 10 per halaman:', pages, 'halaman');
r = await M({ aksi: 'add', sheet: 'Master_SN', data: { sn: 'x' } }); assert.equal(r.code, 400);
console.log('status:', JSON.stringify((await call(status)).body.sheets));
// ---- autentikasi ----
process.env.APP_PASSWORD = 'rahasia'; process.env.AUTH_SECRET = 'kunci';
assert.equal((await call(data, { url: '/api/data?sheet=Data_Barang' })).code, 401);
assert.equal((await call(login, { method: 'POST', body: { password: 'salah' } })).code, 401);
const tk = (await call(login, { method: 'POST', body: { password: 'rahasia' } })).body.token;
assert.equal((await call(data, { url: '/api/data?sheet=Data_Barang', headers: { authorization: 'Bearer ' + tk } })).code, 200);
assert.equal((await call(data, { url: '/api/data?sheet=Data_Barang', headers: { authorization: 'Bearer ' + tk + 'x' } })).code, 401);
console.log('autentikasi: ok\nOK semua tes API');
